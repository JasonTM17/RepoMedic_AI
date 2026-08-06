/**
 * Enumerations for the core domain, defined as const tuples so the TypeScript
 * literal unions and the zod schemas derive from a single source of truth.
 */

export const issueSeverityValues = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type IssueSeverity = (typeof issueSeverityValues)[number];

export const patchStatusValues = [
  "draft",
  "ready",
  "applied",
  "partially-applied",
  "failed",
  "reverted",
] as const;
export type PatchStatus = (typeof patchStatusValues)[number];

export const checkStatusValues = [
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
] as const;
export type CheckStatus = (typeof checkStatusValues)[number];

export const approvalDecisionValues = [
  "approved",
  "rejected",
  "deferred",
] as const;
export type ApprovalDecision = (typeof approvalDecisionValues)[number];

export const decidedByValues = ["human", "system"] as const;
export type DecidedBy = (typeof decidedByValues)[number];

export const patchOperationKindValues = [
  "create",
  "modify",
  "delete",
  "rename",
  "chmod",
] as const;
export type PatchOperationKind = (typeof patchOperationKindValues)[number];

export const violationCodeValues = [
  "empty-path",
  "absolute-path",
  "traversal",
  "not-allowlisted",
  "outside-root",
  "denied-path",
  "unknown-kind",
  "approval-required",
  "invalid-mode",
] as const;
export type ViolationCode = (typeof violationCodeValues)[number];
