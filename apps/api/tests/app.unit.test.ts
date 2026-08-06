import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

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
});
