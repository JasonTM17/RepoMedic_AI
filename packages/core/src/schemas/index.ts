import { z } from "zod";
import {
  PATCH_OPERATION_KINDS,
  POLICY_VIOLATION_REASONS,
  RepositoryTarget,
  DiagnosisIssue,
  PatchOperation,
  PatchProposal,
  CheckResult,
  Approval,
  PolicyViolation,
  MutationDecision,
} from "../domain/index.js";

export const RepositoryTargetSchema = z.object({
  path: z.string(),
  branch: z.string().optional(),
  commit: z.string().optional(),
}) satisfies z.ZodType<RepositoryTarget>;

export const DiagnosisIssueSchema = z.object({
  id: z.string(),
  description: z.string(),
  filePaths: z.array(z.string()),
}) satisfies z.ZodType<DiagnosisIssue>;

export const PatchOperationKindSchema = z.enum(PATCH_OPERATION_KINDS);

export const PatchOperationSchema = z.object({
  kind: PatchOperationKindSchema,
  path: z.string(),
  content: z.string().optional(),
  oldPath: z.string().optional(),
  mode: z.number().optional(),
}) satisfies z.ZodType<PatchOperation>;

export const PatchProposalSchema = z.object({
  id: z.string(),
  operations: z.array(PatchOperationSchema),
  humanApprovalRequired: z.boolean(),
}) satisfies z.ZodType<PatchProposal>;

export const CheckResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  errors: z.array(z.string()).optional(),
}) satisfies z.ZodType<CheckResult>;

export const ApprovalSchema = z.object({
  proposalId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
}) satisfies z.ZodType<Approval>;

export const PolicyViolationReasonSchema = z.enum(POLICY_VIOLATION_REASONS);

export const PolicyViolationSchema = z.object({
  path: z.string(),
  reason: PolicyViolationReasonSchema,
  details: z.string().optional(),
}) satisfies z.ZodType<PolicyViolation>;

export const MutationDecisionSchema = z.object({
  allowed: z.boolean(),
  policyVersion: z.string(),
  reason: z.string().optional(),
  violations: z.array(PolicyViolationSchema),
}) satisfies z.ZodType<MutationDecision>;
