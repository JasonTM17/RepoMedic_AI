import { describe, expect, it } from "vitest";

import { createApiClientConfiguration } from "../src/index.js";

describe("API client bootstrap", () => {
  it("normalizes a trailing slash from the configured API URL", () => {
    expect(createApiClientConfiguration("http://localhost:4000/")).toEqual({
      baseUrl: "http://localhost:4000",
    });
  });
});
