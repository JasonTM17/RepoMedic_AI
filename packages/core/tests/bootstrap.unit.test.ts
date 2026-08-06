import { describe, expect, it } from "vitest";

import { capabilityVersions, packageVersion } from "../src/index.js";

describe("core package bootstrap", () => {
  it("exports stable package metadata without side effects", () => {
    expect(packageVersion).toBe("0.1.0");
    expect(capabilityVersions.policyVersion).toBe(1);
    expect(capabilityVersions.schemaVersion).toBe(1);
  });
});
