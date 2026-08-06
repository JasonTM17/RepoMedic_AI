import { describe, it, expect } from "vitest";
import { PathAllowlistPolicy, MutationPolicy } from "../src/policy/index.js";

describe("PathAllowlistPolicy", () => {
  it("allows matching path", () => {
    const policy = new PathAllowlistPolicy(["src", "docs"]);
    expect(policy.validatePath("src/main.ts").valid).toBe(true);
    expect(policy.validatePath("docs/index.md").valid).toBe(true);
    expect(policy.validatePath("src").valid).toBe(true);
  });

  it("rejects absolute paths", () => {
    const policy = new PathAllowlistPolicy(["src"]);
    expect(policy.validatePath("/src/main.ts").valid).toBe(false);
    expect(policy.validatePath("C:/src/main.ts").valid).toBe(false);
    expect(policy.validatePath("\\\\UNC\\path").valid).toBe(false);
  });

  it("rejects directory traversal", () => {
    const policy = new PathAllowlistPolicy(["src"]);
    expect(policy.validatePath("src/../secret").valid).toBe(false);
  });

  it("rejects sibling prefix (e.g. core-evil)", () => {
    const policy = new PathAllowlistPolicy(["core"]);
    expect(policy.validatePath("core-evil/test").valid).toBe(false);
  });

  it("rejects empty paths", () => {
    const policy = new PathAllowlistPolicy(["src"]);
    expect(policy.validatePath("").valid).toBe(false);
    expect(policy.validatePath("./.").valid).toBe(false); // resolves to empty segments
  });
});

describe("MutationPolicy", () => {
  const allowlist = new PathAllowlistPolicy(["src", "docs"]);
  const policy = new MutationPolicy(allowlist);

  it("allows valid operations", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "modify", path: "src/main.ts", content: "hello" }],
    });
    expect(decision.allowed).toBe(true);
  });

  it("rejects unknown kinds", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "magic" as any, path: "src/main.ts" }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.reason).toBe("unsupported_operation");
  });

  it("rejects .git modification", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "modify", path: "src/.git/config" }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.reason).toBe("denied_directory");
  });

  it("rejects .env modification", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "modify", path: "src/.env.local" }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.reason).toBe("denied_file");
  });

  it("rejects secret/credential paths", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "modify", path: "src/aws-credentials.json" }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.reason).toBe("denied_file");
  });

  it("rejects chmod executable on non-scripts", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "chmod", path: "src/data.json", mode: 0o755 }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.reason).toBe("denied_extension");
  });

  it("allows chmod executable on scripts", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "chmod", path: "src/build.sh", mode: 0o755 }],
    });
    expect(decision.allowed).toBe(true);
  });

  it("rejects unallowed path", () => {
    const decision = policy.evaluate({
      id: "1",
      humanApprovalRequired: false,
      operations: [{ kind: "modify", path: "root2/test.ts" }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.reason).toBe("not_in_allowlist");
  });
});
