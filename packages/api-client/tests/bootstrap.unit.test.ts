import { describe, expect, it } from "vitest";

import { createApiClient, createApiClientConfiguration } from "../src/index.js";

describe("API client bootstrap", () => {
  it("normalizes a trailing slash from the configured API URL", () => {
    expect(createApiClientConfiguration("http://localhost:4000/")).toEqual({
      baseUrl: "http://localhost:4000",
    });
  });

  it("exposes the generated client factory", () => {
    const client = createApiClient("http://localhost:4000/");

    expect(typeof client.get).toBe("function");
    expect(typeof client.post).toBe("function");
  });
});
