import type {
  ApprovalDecision,
  CheckStatus,
  DecidedBy,
  IssueSeverity,
  PatchOperationKind,
  PatchStatus,
  ViolationCode,
} from "./enums.js";

/**
 * A target repository the assistant is asked to triage. Metadata is
 * untrusted input and must be validated with the zod schema before use.
 */
export interface RepositoryTarget {
  /** Absolute path to the repository root on the local machine. */
  rootPath: string;
  /** Current git HEAD short hash, when known. */
  gitHead?: string | undefined;
  /** Checked-out branch name, when known. */
  branch?: string | undefined;
}

/** A single finding from triage: a concrete, evidence-backed problem. */
export interface DiagnosisIssue {
  id: string;
  /** Path relative to the repository root where the issue lives, if any. */
  file?: string | undefined;
  severity: IssueSeverity;
  /** 0..1 — how confident the diagnosis is. */
  confidence: number;
  description: string;
  /** Evidence strings (log lines, snippets, command output) backing the issue. */
  evidence: string[];
  /** Related file paths that support or explain the issue. */
  relatedFiles: string[];
}

/** A file-level change. This is the unit policies, checks, and approvals act on. */
export interface PatchOperation {
  id: string;
  /** Path relative to the repository root. */
  path: string;
  kind: PatchOperationKind;
  /** Previous content SHA-256, for modify/delete/rename sources. */
  oldSha?: string | undefined;
  /** New content SHA-256, for create/modify/rename destinations. */
  newSha?: string | undefined;
  /** Optional inline hunks (unified diff fragments) for modify operations. */
  hunks?: string[] | undefined;
  /** POSIX permission bits, required for chmod operations. */
  mode?: number | undefined;
}

/**
 * A proposal to repair the repository: a target plus the set of file-level
 * operations that will implement the repair.
 */
export interface PatchProposal {
  id: string;
  target: RepositoryTarget;
  operations: PatchOperation[];
  status: PatchStatus;
  /** When true, no operation may be applied before explicit human approval. */
  humanApprovalRequired: boolean;
}

/** Result of an automated check (lint, typecheck, test) run against the repo. */
export interface CheckResult {
  id: string;
  /** Proposal or operation the check validates, when applicable. */
  scopeId?: string | undefined;
  checkName: string;
  status: CheckStatus;
  /** Captured output, truncated and redacted. */
  output?: string | undefined;
  /** Execution duration in milliseconds. */
  durationMs?: number | undefined;
}

/**
 * Record of an approval decision. Phase 2 ships the shape only; the
 * interactive human checkpoint workflow arrives in phase 11.
 */
export interface Approval {
  proposalId: string;
  decidedBy: DecidedBy;
  decision: ApprovalDecision;
  reason?: string | undefined;
  decidedAt: string;
}

/** Verdict produced by the deterministic policy layer. */
export interface PolicyViolation {
  code: ViolationCode;
  message: string;
}

export interface MutationDecision {
  allowed: boolean;
  reason: string;
  policyVersion: number;
  violations: PolicyViolation[];
}
