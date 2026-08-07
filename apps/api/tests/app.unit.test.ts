import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  utimesSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { FakeModelAdapter } from "@jasonTM17/core";

import { createApp } from "../src/app.js";
import {
  FileRepairRunStore,
  discoverRepositoryRoot,
  type ModelFactory,
  type RepairRun,
} from "../src/repair-service.js";

const diagnosisResponse =
  'DIAGNOSIS:[{"id":"issue-1","file":"README.md","severity":"low","confidence":0.9,"description":"The README needs a small correction.","evidence":["A failing documentation check identified the stale statement."],"relatedFiles":[]} ]';

const patchResponse = `PATCH:
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-# RepoMedic AI
+# RepoMedic AI (candidate)
`;

function queuedModelFactory(responses: string[]): ModelFactory {
  const adapter = new FakeModelAdapter(responses);
  return () => adapter;
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

function persistedRun(id: string): RepairRun {
  const rootPath = realpathSync(process.cwd());
  const timestamp = new Date(0).toISOString();
  return {
    id,
    status: "completed",
    createdAt: timestamp,
    updatedAt: timestamp,
    request: {
      issueDescription: `Persist ${id}`,
      rootPath,
      allowlist: ["."],
      backend: "fake",
      maxRetries: 3,
      dryRun: false,
    },
    target: { rootPath },
    issues: [],
    proposal: null,
    approval: null,
    result: {
      success: true,
      attempts: 0,
      finalStatus: "no-op",
      summary: "No changes were required.",
    },
    explorerIterations: 0,
    stopped: "done",
  };
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
      modelFactory: queuedModelFactory([diagnosisResponse, patchResponse]),
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
    expect(created.body.proposal.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(created.body.proposal.operations[0].oldSha).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(created.body.proposal.operations[0].newSha).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(created.body.proposal.operations[0].hunks).toHaveLength(1);

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
      modelFactory: queuedModelFactory([diagnosisResponse, patchResponse]),
      checksToRun: [
        {
          name: "forced-failure",
          command: "node",
          args: ["--eval", "process.exit(1)"],
          timeoutMs: 5_000,
        },
      ],
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
    expect(approved.body.result.finalStatus).toBe("reverted");
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
      .set("Authorization", "bearer local-test-token");
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

  it("merges independent store snapshots and refuses a locked writer", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "repomedic-api-lock-"));
    const dataDir = join(temporaryRoot, "store");
    const alternateRoot =
      process.platform === "win32"
        ? process.cwd().toUpperCase()
        : process.cwd();
    const first = new FileRepairRunStore({
      dataDir,
      repositoryRoot: process.cwd(),
    });
    const second = new FileRepairRunStore({
      dataDir,
      repositoryRoot: alternateRoot,
    });

    try {
      first.load();
      second.load();
      first.save([persistedRun("repair-first")]);
      second.save([persistedRun("repair-second")]);

      const restored = new FileRepairRunStore({
        dataDir,
        repositoryRoot: alternateRoot,
      }).load();
      expect(restored.map((run) => run.id).sort()).toEqual([
        "repair-first",
        "repair-second",
      ]);

      const lockDescriptor = openSync(
        join(dataDir, "repair-runs.v1.lock"),
        "wx",
      );
      try {
        expect(() => second.save([persistedRun("repair-second")])).toThrow(
          "locked by another process",
        );
      } finally {
        closeSync(lockDescriptor);
        unlinkSync(join(dataDir, "repair-runs.v1.lock"));
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("recovers stale locks but never removes an active process lock", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "repomedic-api-stale-"));
    const dataDir = join(temporaryRoot, "store");
    const store = new FileRepairRunStore({
      dataDir,
      repositoryRoot: process.cwd(),
    });
    const staleTime = new Date(Date.now() - 10 * 60 * 1_000);

    try {
      store.load();
      writeFileSync(
        store.lockPath,
        JSON.stringify({ pid: process.pid }),
        "utf8",
      );
      utimesSync(store.lockPath, staleTime, staleTime);
      expect(() => store.save([persistedRun("active-lock")])).toThrow(
        "locked by another process",
      );
      unlinkSync(store.lockPath);

      writeFileSync(
        store.lockPath,
        JSON.stringify({ pid: process.pid + 1_000_000 }),
        "utf8",
      );
      utimesSync(store.lockPath, staleTime, staleTime);
      expect(() => store.save([persistedRun("stale-lock")])).not.toThrow();
      expect(existsSync(store.lockPath)).toBe(false);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("quarantines state that becomes corrupt before a write", () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "repomedic-api-corrupt-write-"),
    );
    const dataDir = join(temporaryRoot, "store");
    const store = new FileRepairRunStore({
      dataDir,
      repositoryRoot: process.cwd(),
    });

    try {
      const run = persistedRun("repair-corrupt-write");
      store.save([run]);
      store.load();
      writeFileSync(store.filePath, "{not-json", "utf8");

      expect(() => store.save([run])).toThrow("recovery is required");
      expect(store.getRecoveryWarning()).toContain("quarantined");
      expect(
        readdirSync(dataDir).some((name) =>
          name.startsWith("repair-runs.v1.corrupt."),
        ),
      ).toBe(true);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("quarantines corrupt state and blocks mutation until recovery", async () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "repomedic-api-corrupt-store-"),
    );
    const dataDir = join(temporaryRoot, "store");

    try {
      const store = new FileRepairRunStore({
        dataDir,
        repositoryRoot: process.cwd(),
      });
      writeFileSync(store.filePath, "{not-json", "utf8");

      const app = createApp({
        repositoryRoot: process.cwd(),
        dataDir,
        modelFactory: queuedModelFactory(["DONE"]),
      });
      const ready = await request(app).get("/readyz");
      expect(ready.status).toBe(503);
      expect(ready.body.code).toBe("PERSISTENCE_RECOVERY_REQUIRED");

      const create = await request(app).post("/v1/repairs").send({
        issueDescription: "Do not mutate while persistence is quarantined",
      });
      expect(create.status).toBe(503);
      expect(create.body.code).toBe("PERSISTENCE_RECOVERY_REQUIRED");

      expect(
        readdirSync(dataDir).some((name) =>
          name.startsWith("repair-runs.v1.corrupt."),
        ),
      ).toBe(true);
      expect(existsSync(store.filePath)).toBe(false);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects an in-repository store outside the protected state directory", () => {
    expect(
      () =>
        new FileRepairRunStore({
          dataDir: join(process.cwd(), "state"),
          repositoryRoot: process.cwd(),
        }),
    ).toThrow("must be under .repomedic");
  });

  it("marks an interrupted persisted run as recovery-required instead of leaving it running", async () => {
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
      expect(recovered.body.status).toBe("recovery-required");
      expect(recovered.body.error).toContain("API restarted");
      expect(recovered.body.result.finalStatus).toBe("failed");
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("discovers the git root from a workspace package directory", () => {
    const previous = process.env["REPOMEDIC_REPO_ROOT"];
    delete process.env["REPOMEDIC_REPO_ROOT"];
    try {
      expect(discoverRepositoryRoot(join(process.cwd(), "apps", "api"))).toBe(
        realpathSync(process.cwd()),
      );
    } finally {
      if (previous === undefined) delete process.env["REPOMEDIC_REPO_ROOT"];
      else process.env["REPOMEDIC_REPO_ROOT"] = previous;
    }
  });
});
