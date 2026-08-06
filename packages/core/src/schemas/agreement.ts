/**
 * Compile-time agreement between domain entities and their zod schemas.
 *
 * Each assertion fails to typecheck unless the entity type and the schema's
 * input type are mutually assignable. This is a real drift guard: adding a
 * required field to an entity (or dropping it from the schema) breaks one of
 * the `satisfies` checks below.
 */
import type { z } from "zod";

import type {
  Approval,
  CheckResult,
  DiagnosisIssue,
  MutationDecision,
  PatchOperation,
  PatchProposal,
  PolicyViolation,
  RepositoryTarget,
} from "../domain/entities.js";
import type {
  approvalSchema,
  checkResultSchema,
  diagnosisIssueSchema,
  mutationDecisionSchema,
  patchOperationSchema,
  patchProposalSchema,
  policyViolationSchema,
  repositoryTargetSchema,
} from "./index.js";

type Expect<T extends true> = T;
type AssertEqual<T, U> =
  (<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
    ? true
    : false;

export type _RepositoryTargetAgreement = Expect<
  AssertEqual<RepositoryTarget, z.infer<typeof repositoryTargetSchema>>
>;
export type _DiagnosisIssueAgreement = Expect<
  AssertEqual<DiagnosisIssue, z.infer<typeof diagnosisIssueSchema>>
>;
export type _PatchOperationAgreement = Expect<
  AssertEqual<PatchOperation, z.infer<typeof patchOperationSchema>>
>;
export type _PatchProposalAgreement = Expect<
  AssertEqual<PatchProposal, z.infer<typeof patchProposalSchema>>
>;
export type _CheckResultAgreement = Expect<
  AssertEqual<CheckResult, z.infer<typeof checkResultSchema>>
>;
export type _ApprovalAgreement = Expect<
  AssertEqual<Approval, z.infer<typeof approvalSchema>>
>;
export type _PolicyViolationAgreement = Expect<
  AssertEqual<PolicyViolation, z.infer<typeof policyViolationSchema>>
>;
export type _MutationDecisionAgreement = Expect<
  AssertEqual<MutationDecision, z.infer<typeof mutationDecisionSchema>>
>;
