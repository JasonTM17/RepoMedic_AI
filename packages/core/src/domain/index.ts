// Enums as const tuples
export const PATCH_OPERATION_KINDS = [
  "create",
  "modify",
  "delete",
  "rename",
  "chmod",
] as const;
export type PatchOperationKind = (typeof PATCH_OPERATION_KINDS)[number];

export const POLICY_VIOLATION_REASONS = [
  "absolute_path",
  "path_traversal",
  "empty_path",
  "denied_directory",
  "denied_file",
  "denied_extension",
  "unsupported_operation",
  "not_in_allowlist",
] as const;
export type PolicyViolationReason = (typeof POLICY_VIOLATION_REASONS)[number];

// Entities
export interface RepositoryTarget {
  path: string; // The root path of the repository
  branch?: string | undefined;
  commit?: string | undefined;
}

export interface DiagnosisIssue {
  id: string;
  description: string;
  filePaths: string[];
}

export interface PatchOperation {
  kind: PatchOperationKind;
  path: string; // Target file path (relative to repo root)
  content?: string | undefined; // Used for 'create' and 'modify'
  oldPath?: string | undefined; // Used for 'rename'
  mode?: number | undefined; // Used for 'chmod'
}

export interface PatchProposal {
  id: string;
  operations: PatchOperation[];
  humanApprovalRequired: boolean;
}

export interface CheckResult {
  success: boolean;
  output: string;
  errors?: string[] | undefined;
}

export interface Approval {
  proposalId: string;
  approved: boolean;
  reason?: string | undefined;
}

export interface PolicyViolation {
  path: string;
  reason: PolicyViolationReason;
  details?: string | undefined;
}

export interface MutationDecision {
  allowed: boolean;
  policyVersion: string;
  reason?: string | undefined;
  violations: PolicyViolation[];
}
