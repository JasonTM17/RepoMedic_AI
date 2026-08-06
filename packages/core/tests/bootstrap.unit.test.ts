import { describe, expect, it } from "vitest";

import { corePackageName, corePackageVersion } from "../src/index.js";

describe("core package bootstrap", () => {
  it("exports stable package metadata without side effects", () => {
    expect(corePackageName).toBe("@repomedic/core");
    expect(corePackageVersion).toBe("0.1.0");
  });
});
