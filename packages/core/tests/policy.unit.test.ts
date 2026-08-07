import { describe, expect, it } from "vitest";

import {
  checkPathAllowlist,
  evaluateMutationPolicy,
  isPathAllowed,
  isWithinRoot,
  normalizePathForPolicy,
} from "../src/policy/index.js";

const ROOT = "/repo";
const ALLOWLIST = ["src", "packages/core", "docs"];

describe("normalizePathForPolicy", () => {
  it("converts backslashes to slashes", () => {
    expect(normalizePathForPolicy("src\\app.ts")).toBe("src/app.ts");
  });

  it("strips leading ./", () => {
    expect(normalizePathForPolicy("./src/app.ts")).toBe("src/app.ts");
  });

  it("collapses duplicate slashes", () => {
    expect(normalizePathForPolicy("src//app.ts")).toBe("src/app.ts");
  });
});

describe("checkPathAllowlist", () => {
  it("allows an allowlisted path", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "src/app.ts");
    expect(decision.allowed).toBe(true);
    expect(decision.violations).toEqual([]);
  });

  it("allows a path equal to an allowlist entry", () => {
    expect(checkPathAllowlist(ROOT, ALLOWLIST, "src").allowed).toBe(true);
  });

  it("treats the repository-root entry as a recursive allowlist", () => {
    expect(checkPathAllowlist(ROOT, ["."], "src/app.ts").allowed).toBe(true);
    expect(
      checkPathAllowlist(ROOT, ["."], "packages/core/index.ts").allowed,
    ).toBe(true);
  });

  it("does not let the repository-root entry bypass denied components", () => {
    const decision = checkPathAllowlist(ROOT, ["."], ".git/config");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("does not expose the local repair store to agents", () => {
    const decision = checkPathAllowlist(
      ROOT,
      ["."],
      process.platform === "win32"
        ? ".REPOMEDIC/repair-runs.v1.json"
        : ".repomedic/repair-runs.v1.json",
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("rejects an empty path", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("empty-path");
  });

  it("rejects an absolute path", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "/etc/passwd");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("absolute-path");
  });

  it("rejects a Windows drive path", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "C:/Windows/system32");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("absolute-path");
  });

  it("rejects a UNC path", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "//server/share");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("absolute-path");
  });

  it("rejects parent traversal", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "../evil.sh");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("traversal");
  });

  it("rejects nested parent traversal", () => {
    expect(
      checkPathAllowlist(ROOT, ALLOWLIST, "src/../../evil.sh").allowed,
    ).toBe(false);
  });

  it("rejects a sibling-prefix path (component-exact)", () => {
    const decision = checkPathAllowlist(
      ROOT,
      ["packages/core"],
      "packages/core-evil/run.sh",
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("not-allowlisted");
  });

  it("rejects a path outside the root (sibling root)", () => {
    // traversal is caught first
    expect(
      checkPathAllowlist("/repo", ["src"], "src/../other/file").allowed,
    ).toBe(false);
  });

  it("rejects a path under a sibling root", () => {
    const confined = checkPathAllowlist("/repo", ["src"], "src2/x");
    expect(confined.allowed).toBe(false);
    expect(confined.violations[0]?.code).toBe("not-allowlisted");
  });

  it("rejects a denied component (.git)", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "src/.git/config");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("rejects a non-allowlisted path", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "vendor/lib.js");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("not-allowlisted");
  });

  it("rejects a trailing-space traversal variant", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "src/.. /evil.sh");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("traversal");
  });

  it("rejects a percent-encoded traversal variant", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "src/%2e%2e/evil.sh");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("traversal");
  });

  it("rejects backslash + percent-encoded traversal (mixed variant)", () => {
    const decision = checkPathAllowlist(ROOT, ALLOWLIST, "src\\..%2f..%2fetc");
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("traversal");
  });
});

describe("isPathAllowed / isWithinRoot", () => {
  it("wraps the policy result", () => {
    expect(isPathAllowed(ROOT, ALLOWLIST, "src/app.ts")).toBe(true);
    expect(isPathAllowed(ROOT, ALLOWLIST, "vendor/x")).toBe(false);
  });

  it("confines paths to the root", () => {
    expect(isWithinRoot("/repo", "/repo")).toBe(true);
    expect(isWithinRoot("/repo", "/repo/src/a.ts")).toBe(true);
    expect(isWithinRoot("/repo", "/repositories/other")).toBe(false);
  });

  it("handles a root with a trailing slash", () => {
    expect(isWithinRoot("/repo/", "/repo/x")).toBe(true);
    expect(isWithinRoot("/repo/", "/repo2/x")).toBe(false);
  });

  it("is component-exact (sibling roots never match)", () => {
    expect(isWithinRoot("/repo", "/repo2/x")).toBe(false);
    expect(isWithinRoot("/repo", "/repo-evil/x")).toBe(false);
  });

  it("rejects resolved paths that contain traversal", () => {
    expect(isWithinRoot("/repo", "/repo/../outside")).toBe(false);
  });

  it("matches root casing correctly on Windows", () => {
    const result =
      process.platform === "win32"
        ? isWithinRoot("C:\\Repo", "c:\\REPO\\src\\app.ts")
        : isWithinRoot("/repo", "/repo/src/app.ts");
    expect(result).toBe(true);
  });

  it("normalizes backslashes on both sides", () => {
    expect(isWithinRoot("C:\\repo", "C:\\repo\\src\\a.ts")).toBe(true);
    expect(isWithinRoot("C:\\repo", "C:\\other\\x")).toBe(false);
  });
});

describe("evaluateMutationPolicy", () => {
  const options = { root: ROOT, allowlist: ALLOWLIST };

  it("allows an approved allowlisted modification", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/app.ts", kind: "modify" },
      true,
    );
    expect(decision.allowed).toBe(true);
  });

  it("blocks an unapproved mutation by default", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/app.ts", kind: "modify" },
      false,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("approval-required");
  });

  it("blocks a path outside the allowlist even when approved", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "vendor/x.js", kind: "create" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("not-allowlisted");
  });

  it("blocks .git writes even when approved", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/.git/config", kind: "modify" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks secret-file writes even when approved", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/.env", kind: "create" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks backslash-encoded secret paths (bypass attempt)", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src\\.env", kind: "create" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks backslash-encoded .git paths (bypass attempt)", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src\\.git\\config", kind: "modify" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks protected components regardless of Windows casing", () => {
    const decision = evaluateMutationPolicy(
      options,
      {
        id: "op-1",
        path:
          process.platform === "win32"
            ? "src\\.GIT\\config"
            : "src/.git/config",
        kind: "modify",
      },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks extensionless AWS credential paths", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/.aws/credentials", kind: "create" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks .ssh key paths", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/.ssh/id_rsa", kind: "create" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("denied-path");
  });

  it("blocks unknown operation kinds", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/app.ts", kind: "explode" as "modify" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("unknown-kind");
  });

  it("blocks chmod without a mode", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/run.sh", kind: "chmod" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("invalid-mode");
  });

  it("blocks chmod to executable mode without approval", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/run.sh", kind: "chmod", mode: 0o755 },
      false,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("approval-required");
  });

  it("allows chmod to non-executable mode", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/run.sh", kind: "chmod", mode: 0o644 },
      true,
    );
    expect(decision.allowed).toBe(true);
  });

  it("allows chmod to executable when approved and approval not required", () => {
    const decision = evaluateMutationPolicy(
      { root: ROOT, allowlist: ALLOWLIST, requireHumanApproval: false },
      { id: "op-1", path: "src/run.sh", kind: "chmod", mode: 0o755 },
      true,
    );
    expect(decision.allowed).toBe(true);
  });

  it("honors requireHumanApproval: false", () => {
    const decision = evaluateMutationPolicy(
      { root: ROOT, allowlist: ALLOWLIST, requireHumanApproval: false },
      { id: "op-1", path: "src/app.ts", kind: "modify" },
      false,
    );
    expect(decision.allowed).toBe(true);
  });

  it("reports the current policy version", () => {
    const decision = evaluateMutationPolicy(
      options,
      { id: "op-1", path: "src/app.ts", kind: "modify" },
      true,
    );
    expect(decision.policyVersion).toBe(1);
  });
});
