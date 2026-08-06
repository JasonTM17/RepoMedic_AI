import { describe, expect, it } from "vitest";

import { dashboardDescription, dashboardTitle } from "../app/page-content.js";

describe("RepoMedic web bootstrap", () => {
  it("declares dashboard content without importing API internals", () => {
    expect(dashboardTitle).toBe("RepoMedic");
    expect(dashboardDescription).toContain("human approval");
  });
});
