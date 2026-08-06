import { describe, expect, it } from "vitest";

import {
  approvalDecisionValues,
  checkStatusValues,
  decidedByValues,
  issueSeverityValues,
  patchOperationKindValues,
  patchStatusValues,
  violationCodeValues,
} from "../src/domain/enums.js";
import type {
  Approval,
  CheckResult,
  DiagnosisIssue,
  MutationDecision,
  PatchOperation,
  PatchProposal,
  RepositoryTarget,
} from "../src/domain/entities.js";

describe("domain enums", () => {
  it("defines severity values in order", () => {
    expect(issueSeverityValues).toEqual([
      "info",
      "low",
      "medium",
      "high",
      "critical",
    ]);
  });

  it("defines patch status values", () => {
    expect(patchStatusValues).toEqual([
      "draft",
      "ready",
      "applied",
      "partially-applied",
      "failed",
      "reverted",
    ]);
  });

  it("defines check status values", () => {
    expect(checkStatusValues).toEqual([
      "pending",
      "running",
      "passed",
      "failed",
      "skipped",
    ]);
  });

  it("defines approval decision values", () => {
    expect(approvalDecisionValues).toEqual([
      "approved",
      "rejected",
      "deferred",
    ]);
  });

  it("defines decided-by values", () => {
    expect(decidedByValues).toEqual(["human", "system"]);
  });

  it("defines patch operation kinds", () => {
    expect(patchOperationKindValues).toEqual([
      "create",
      "modify",
      "delete",
      "rename",
      "chmod",
    ]);
  });

  it("defines violation codes", () => {
    expect(violationCodeValues).toContain("approval-required");
    expect(violationCodeValues).toContain("denied-path");
    expect(violationCodeValues).toContain("unknown-kind");
  });
});

describe("domain entities", () => {
  it("models a repository target", () => {
    const target: RepositoryTarget = {
      rootPath: "/repo",
      gitHead: "abc123",
      branch: "main",
    };
    expect(target.rootPath).toBe("/repo");
    expect(target.gitHead).toBe("abc123");
    expect(target.branch).toBe("main");
  });

  it("models a diagnosis issue with evidence", () => {
    const issue: DiagnosisIssue = {
      id: "i-1",
      file: "src/app.ts",
      severity: "high",
      confidence: 0.9,
      description: "Unhandled promise rejection",
      evidence: ["at src/app.ts:12"],
      relatedFiles: ["src/lib.ts"],
    };
    expect(issue.severity).toBe("high");
    expect(issue.confidence).toBeLessThanOrEqual(1);
    expect(issue.evidence).toHaveLength(1);
  });

  it("models a patch operation", () => {
    const op: PatchOperation = {
      id: "op-1",
      path: "src/app.ts",
      kind: "modify",
      oldSha: "aaaa",
      newSha: "bbbb",
      hunks: ["@@ -1,3 +1,3 @@"],
    };
    expect(op.kind).toBe("modify");
    expect(op.hunks).toHaveLength(1);
  });

  it("models a patch proposal with operations", () => {
    const proposal: PatchProposal = {
      id: "p-1",
      target: { rootPath: "/repo" },
      operations: [
        { id: "op-1", path: "src/app.ts", kind: "modify" },
        { id: "op-2", path: "src/app.test.ts", kind: "create" },
      ],
      status: "draft",
      humanApprovalRequired: true,
    };
    expect(proposal.operations).toHaveLength(2);
    expect(proposal.humanApprovalRequired).toBe(true);
  });

  it("models a check result", () => {
    const check: CheckResult = {
      id: "c-1",
      scopeId: "p-1",
      checkName: "typecheck",
      status: "passed",
      output: "ok",
      durationMs: 42,
    };
    expect(check.status).toBe("passed");
  });

  it("models an approval", () => {
    const approval: Approval = {
      proposalId: "p-1",
      decidedBy: "human",
      decision: "approved",
      reason: "looks correct",
      decidedAt: "2026-08-06T00:00:00.000Z",
    };
    expect(approval.decision).toBe("approved");
  });

  it("models a mutation decision", () => {
    const decision: MutationDecision = {
      allowed: false,
      reason: "denied",
      policyVersion: 1,
      violations: [{ code: "traversal", message: ".." }],
    };
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.code).toBe("traversal");
  });
});
