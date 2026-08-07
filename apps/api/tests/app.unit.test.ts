import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { FakeModelAdapter } from "@jasonTM17/core";

import { createApp } from "../src/app.js";
import {
  FileRepairRunStore,
  type ModelFactory,
  type RepairRun,
} from "../src/repair-service.js";

const diagnosisResponse =
  'DIAGNOSIS:[{"id":"issue-1","file":"README.md","severity":"low","confidence":0.9,"description":"The README needs a small correction.","evidence":["A failing documentation check identified the stale statement."],"relatedFiles":[]} ]';

function queuedModelFactory(responses: string[]): ModelFactory {
  return () => new FakeModelAdapter([responses.shift() ?? "DONE"]);
}

function createTestApp(
  options: Parameters<typeof createApp>[0] = {},
): ReturnType<typeof createApp> {
  return createApp({
    repositoryRoot: process.cwd(),
    persistence: "memory",
    ...options,
  });
}

describe("RepoMedic API bootstrap", () => {
  it("exposes a liveness endpoint", async () => {
    const response = await request(createTestApp()).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("exposes a Prometheus-compatible metrics response", async () => {
    const response = await request(createTestApp()).get("/metrics");

    expect(response.status).toBe(200);
    expect(response.text).toContain("repomedic_api_info");
  });

  it("returns a bounded JSON response for malformed JSON", async () => {
    const response = await request(createTestApp())
      .post("/v1/repairs")
      .set("content-type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "INVALID_JSON",
      message: "Invalid JSON body",
    });
  });

  it("creates, lists, retrieves, and rejects a repair run", async () => {
    const app = createTestApp({
      modelFactory: queuedModelFactory([diagnosisResponse]),
      checksToRun: [],
    });

    const created = await request(app)
      .post("/v1/repairs")
      .send({
        issueDescription: "Fix the stale README statement",
        allowlist: ["README.md"],
        backend: "fake",
      });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe("awaiting-approval");
    expect(created.body.issues).toHaveLength(1);
    expect(created.body.proposal.operations[0].path).toBe("README.md");

    const listed = await request(app).get("/v1/repairs");
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0].id).toBe(created.body.id);

    const fetched = await request(app).get(`/v1/repairs/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);

    const rejected = await request(app)
      .post(`/v1/repairs/${created.body.id}/approval`)
      .send({ decision: "rejected", reason: "Needs a narrower proposal" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
    expect(rejected.body.approval.decision).toBe("rejected");

    const decidedAgain = await request(app)
      .post(`/v1/repairs/${created.body.id}/approval`)
      .send({ decision: "approved" });
    expect(decidedAgain.status).toBe(409);
    expect(decidedAgain.body.code).toBe("REPAIR_NOT_AWAITING_APPROVAL");
  });

  it("runs the approved workflow and records a bounded failure", async () => {
    const app = createTestApp({
      modelFactory: queuedModelFactory([diagnosisResponse, "DONE"]),
      checksToRun: [],
    });

    const created = await request(app)
      .post("/v1/repairs")
      .send({
        issueDescription: "Exercise the approval path",
        allowlist: ["README.md"],
        backend: "fake",
      });
    const approved = await request(app)
      .post(`/v1/repairs/${created.body.id}/approval`)
      .send({ decision: "approved" });

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("failed");
    expect(approved.body.result.finalStatus).toBe("failed");
    expect(approved.body.result.attempts).toBe(1);
  });

  it("keeps fake no-issue runs deterministic and rejects unsafe roots", async () => {
    const app = createTestApp({
      modelFactory: queuedModelFactory(["DONE"]),
    });

    const noIssue = await request(app).post("/v1/repairs").send({
      issueDescription: "Check the repository",
      backend: "fake",
    });
    expect(noIssue.status).toBe(201);
    expect(noIssue.body.status).toBe("completed");
    expect(noIssue.body.result.finalStatus).toBe("no-op");

    const unsafeRoot = await request(app)
      .post("/v1/repairs")
      .send({
        issueDescription: "Attempt an out-of-scope target",
        rootPath: dirname(process.cwd()),
      });
    expect(unsafeRoot.status).toBe(403);
    expect(unsafeRoot.body.code).toBe("ROOT_NOT_ALLOWED");
  });

  it("restricts browser origins to the configured local dashboard", async () => {
    const app = createTestApp();

    const allowed = await request(app)
      .options("/v1/repairs")
      .set("Origin", "http://localhost:3000");
    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );

    const denied = await request(app)
      .options("/v1/repairs")
      .set("Origin", "http://malicious.local");
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("CORS_ORIGIN_DENIED");
  });

  it("supports opt-in bearer authentication without blocking healthchecks", async () => {
    const app = createTestApp({ apiToken: "local-test-token" });

    const health = await request(app).get("/healthz");
    expect(health.status).toBe(200);

    const unauthorized = await request(app).get("/v1/repairs");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.code).toBe("UNAUTHORIZED");

    const authorized = await request(app)
      .get("/v1/repairs")
      .set("Authorization", "Bearer local-test-token");
    expect(authorized.status).toBe(200);
  });

  it("persists completed runs and makes them available after an API restart", async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "repomedic-api-store-"));
    const dataDir = join(temporaryRoot, "store");

    try {
      const firstApp = createApp({
        repositoryRoot: process.cwd(),
        dataDir,
        modelFactory: queuedModelFactory(["DONE"]),
      });
      const created = await request(firstApp).post("/v1/repairs").send({
        issueDescription: "Persist this completed run",
        backend: "fake",
      });

      expect(created.status).toBe(201);
      expect(
        readFileSync(join(dataDir, "repair-runs.v1.json"), "utf8"),
      ).toContain(created.body.id);

      const restartedApp = createApp({
        repositoryRoot: process.cwd(),
        dataDir,
      });
      const restored = await request(restartedApp).get(
        `/v1/repairs/${created.body.id}`,
      );

      expect(restored.status).toBe(200);
      expect(restored.body.status).toBe("completed");
      expect(restored.body.result.summary).toContain(
        "without actionable issues",
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("marks an interrupted persisted run as failed instead of leaving it running", async () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "repomedic-api-recovery-"),
    );
    const dataDir = join(temporaryRoot, "store");
    const run: RepairRun = {
      id: "repair-interrupted",
      status: "running",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      request: {
        issueDescription: "Interrupted run",
        rootPath: process.cwd(),
        allowlist: ["."],
        backend: "fake",
        maxRetries: 3,
        dryRun: false,
      },
      target: { rootPath: process.cwd() },
      issues: [],
      proposal: null,
      approval: null,
      result: null,
      explorerIterations: 1,
      stopped: "done",
    };

    try {
      new FileRepairRunStore({
        dataDir,
        repositoryRoot: process.cwd(),
      }).save([run]);

      const app = createApp({ repositoryRoot: process.cwd(), dataDir });
      const recovered = await request(app).get(
        "/v1/repairs/repair-interrupted",
      );

      expect(recovered.status).toBe(200);
      expect(recovered.body.status).toBe("failed");
      expect(recovered.body.error).toContain("API restarted");
      expect(recovered.body.result.finalStatus).toBe("failed");
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
