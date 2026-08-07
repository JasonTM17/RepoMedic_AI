import { z } from "zod";

import {
  approvalDecisionValues,
  checkStatusValues,
  decidedByValues,
  issueSeverityValues,
  patchOperationKindValues,
  patchStatusValues,
  violationCodeValues,
} from "../domain/enums.js";

export const repositoryTargetSchema = z
  .object({
    rootPath: z.string().min(1),
    gitHead: z.string().optional(),
    branch: z.string().optional(),
  })
  .strict();

export const diagnosisIssueSchema = z
  .object({
    id: z.string().min(1),
    file: z.string().optional(),
    severity: z.enum(issueSeverityValues),
    confidence: z.number().min(0).max(1),
    description: z.string().min(1),
    evidence: z.array(z.string()),
    relatedFiles: z.array(z.string()),
  })
  .strict();

export const patchOperationSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    kind: z.enum(patchOperationKindValues),
    oldSha: z.string().optional(),
    newSha: z.string().optional(),
    hunks: z.array(z.string()).optional(),
    mode: z.number().int().nonnegative().optional(),
  })
  .strict();

export const patchProposalSchema = z
  .object({
    id: z.string().min(1),
    target: repositoryTargetSchema,
    operations: z.array(patchOperationSchema).min(1),
    status: z.enum(patchStatusValues),
    humanApprovalRequired: z.boolean(),
    digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const checkResultSchema = z
  .object({
    id: z.string().min(1),
    scopeId: z.string().optional(),
    checkName: z.string().min(1),
    status: z.enum(checkStatusValues),
    output: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const approvalSchema = z
  .object({
    proposalId: z.string().min(1),
    decidedBy: z.enum(decidedByValues),
    decision: z.enum(approvalDecisionValues),
    reason: z.string().optional(),
    decidedAt: z.string().min(1),
  })
  .strict();

export const policyViolationSchema = z
  .object({
    code: z.enum(violationCodeValues),
    message: z.string().min(1),
  })
  .strict();

export const mutationDecisionSchema = z
  .object({
    allowed: z.boolean(),
    reason: z.string().min(1),
    policyVersion: z.number().int().nonnegative(),
    violations: z.array(policyViolationSchema),
  })
  .strict();

export type RepositoryTargetSchema = z.infer<typeof repositoryTargetSchema>;
export type DiagnosisIssueSchema = z.infer<typeof diagnosisIssueSchema>;
export type PatchOperationSchema = z.infer<typeof patchOperationSchema>;
export type PatchProposalSchema = z.infer<typeof patchProposalSchema>;
export type CheckResultSchema = z.infer<typeof checkResultSchema>;
export type ApprovalSchema = z.infer<typeof approvalSchema>;
export type PolicyViolationSchema = z.infer<typeof policyViolationSchema>;
export type MutationDecisionSchema = z.infer<typeof mutationDecisionSchema>;
