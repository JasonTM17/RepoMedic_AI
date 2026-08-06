import { describe, expect, it } from "vitest";

import {
  approvalSchema,
  checkResultSchema,
  diagnosisIssueSchema,
  mutationDecisionSchema,
  patchOperationSchema,
  patchProposalSchema,
  policyViolationSchema,
  repositoryTargetSchema,
} from "../src/schemas/index.js";

const validTarget = { rootPath: "/repo", gitHead: "abc123", branch: "main" };

describe("repositoryTargetSchema", () => {
  it("parses a valid target", () => {
    expect(repositoryTargetSchema.parse(validTarget)).toEqual(validTarget);
  });

  it("parses a minimal target", () => {
    expect(repositoryTargetSchema.parse({ rootPath: "/repo" })).toEqual({
      rootPath: "/repo",
    });
  });

  it("rejects an empty root path", () => {
    expect(() => repositoryTargetSchema.parse({ rootPath: "" })).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() =>
      repositoryTargetSchema.parse({ rootPath: "/repo", evil: true }),
    ).toThrow();
  });
});

describe("diagnosisIssueSchema", () => {
  it("parses a valid issue", () => {
    const issue = {
      id: "i-1",
      file: "src/app.ts",
      severity: "high",
      confidence: 0.9,
      description: "bug",
      evidence: ["x"],
      relatedFiles: ["y"],
    };
    expect(diagnosisIssueSchema.parse(issue)).toEqual(issue);
  });

  it("rejects an invalid severity", () => {
    expect(() =>
      diagnosisIssueSchema.parse({
        id: "i-1",
        severity: "catastrophic",
        confidence: 0.5,
        description: "bug",
        evidence: [],
        relatedFiles: [],
      }),
    ).toThrow();
  });

  it("rejects out-of-range confidence", () => {
    expect(() =>
      diagnosisIssueSchema.parse({
        id: "i-1",
        severity: "high",
        confidence: 1.5,
        description: "bug",
        evidence: [],
        relatedFiles: [],
      }),
    ).toThrow();
  });
});

describe("patchOperationSchema", () => {
  it("parses a valid operation", () => {
    const op = {
      id: "op-1",
      path: "src/app.ts",
      kind: "modify",
      oldSha: "a",
      newSha: "b",
      hunks: ["h"],
      mode: 0o644,
    };
    expect(patchOperationSchema.parse(op)).toEqual(op);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      patchOperationSchema.parse({ id: "op-1", path: "a", kind: "explode" }),
    ).toThrow();
  });

  it("rejects a negative mode", () => {
    expect(() =>
      patchOperationSchema.parse({
        id: "op-1",
        path: "a",
        kind: "chmod",
        mode: -1,
      }),
    ).toThrow();
  });
});

describe("patchProposalSchema", () => {
  it("parses a valid proposal", () => {
    const proposal = {
      id: "p-1",
      target: validTarget,
      operations: [{ id: "op-1", path: "src/a.ts", kind: "modify" }],
      status: "draft",
      humanApprovalRequired: true,
    };
    expect(patchProposalSchema.parse(proposal)).toEqual(proposal);
  });

  it("rejects a proposal without operations", () => {
    expect(() =>
      patchProposalSchema.parse({
        id: "p-1",
        target: validTarget,
        operations: [],
        status: "draft",
        humanApprovalRequired: true,
      }),
    ).toThrow();
  });

  it("rejects an invalid status", () => {
    expect(() =>
      patchProposalSchema.parse({
        id: "p-1",
        target: validTarget,
        operations: [{ id: "op-1", path: "a", kind: "modify" }],
        status: "done",
        humanApprovalRequired: false,
      }),
    ).toThrow();
  });
});

describe("checkResultSchema", () => {
  it("parses a valid check result", () => {
    const check = {
      id: "c-1",
      scopeId: "p-1",
      checkName: "lint",
      status: "passed",
      output: "ok",
      durationMs: 5,
    };
    expect(checkResultSchema.parse(check)).toEqual(check);
  });

  it("rejects an invalid status", () => {
    expect(() =>
      checkResultSchema.parse({ id: "c-1", checkName: "lint", status: "nope" }),
    ).toThrow();
  });
});

describe("approvalSchema", () => {
  it("parses a valid approval", () => {
    const approval = {
      proposalId: "p-1",
      decidedBy: "human",
      decision: "approved",
      reason: "ok",
      decidedAt: "2026-08-06T00:00:00Z",
    };
    expect(approvalSchema.parse(approval)).toEqual(approval);
  });

  it("rejects an unknown decider", () => {
    expect(() =>
      approvalSchema.parse({
        proposalId: "p-1",
        decidedBy: "robot",
        decision: "approved",
        decidedAt: "t",
      }),
    ).toThrow();
  });
});

describe("policyViolationSchema / mutationDecisionSchema", () => {
  it("parses a valid decision", () => {
    const decision = {
      allowed: false,
      reason: "nope",
      policyVersion: 1,
      violations: [{ code: "traversal", message: ".." }],
    };
    expect(mutationDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("rejects an unknown violation code", () => {
    expect(() =>
      policyViolationSchema.parse({ code: "hack", message: "x" }),
    ).toThrow();
  });
});
