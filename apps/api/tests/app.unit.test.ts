import { dirname } from "node:path";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { FakeModelAdapter } from "@jasonTM17/core";

import { createApp } from "../src/app.js";
import type { ModelFactory } from "../src/repair-service.js";

const diagnosisResponse =
  'DIAGNOSIS:[{"id":"issue-1","file":"README.md","severity":"low","confidence":0.9,"description":"The README needs a small correction.","evidence":["A failing documentation check identified the stale statement."],"relatedFiles":[]} ]';

function queuedModelFactory(responses: string[]): ModelFactory {
  return () => new FakeModelAdapter([responses.shift() ?? "DONE"]);
}

describe("RepoMedic API bootstrap", () => {
  it("exposes a liveness endpoint", async () => {
    const response = await request(createApp()).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("exposes a Prometheus-compatible metrics response", async () => {
    const response = await request(createApp()).get("/metrics");

    expect(response.status).toBe(200);
    expect(response.text).toContain("repomedic_api_info");
  });

  it("returns a bounded JSON response for malformed JSON", async () => {
    const response = await request(createApp())
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
    const app = createApp({
      repositoryRoot: process.cwd(),
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
    const app = createApp({
      repositoryRoot: process.cwd(),
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
    const app = createApp({
      repositoryRoot: process.cwd(),
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
    const app = createApp({ repositoryRoot: process.cwd() });

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
});
