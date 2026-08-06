import { describe, it, expect } from 'vitest';
import {
  RepositoryTargetSchema,
  DiagnosisIssueSchema,
  PatchOperationSchema,
  PatchProposalSchema,
  CheckResultSchema,
  ApprovalSchema,
  PolicyViolationSchema,
  MutationDecisionSchema
} from '../src/schemas/index.js';

describe('Zod Schemas', () => {
  it('validates RepositoryTarget', () => {
    const valid = { path: 'src', branch: 'main', commit: 'abc' };
    expect(RepositoryTargetSchema.parse(valid)).toEqual(valid);

    const validMinimal = { path: 'src' };
    expect(RepositoryTargetSchema.parse(validMinimal)).toEqual(validMinimal);

    expect(() => RepositoryTargetSchema.parse({ branch: 'main' })).toThrow();
  });

  it('validates DiagnosisIssue', () => {
    const valid = { id: '1', description: 'test', filePaths: ['src/index.ts'] };
    expect(DiagnosisIssueSchema.parse(valid)).toEqual(valid);

    expect(() => DiagnosisIssueSchema.parse({ id: '1' })).toThrow();
  });

  it('validates PatchOperation', () => {
    const validModify = { kind: 'modify', path: 'src/index.ts', content: 'test' };
    expect(PatchOperationSchema.parse(validModify)).toEqual(validModify);

    const validRename = { kind: 'rename', path: 'src/new.ts', oldPath: 'src/old.ts' };
    expect(PatchOperationSchema.parse(validRename)).toEqual(validRename);

    expect(() => PatchOperationSchema.parse({ kind: 'unknown', path: 'src' })).toThrow();
  });

  it('validates PatchProposal', () => {
    const valid = {
      id: 'prop-1',
      humanApprovalRequired: true,
      operations: [{ kind: 'create', path: 'src/index.ts', content: '' }]
    };
    expect(PatchProposalSchema.parse(valid)).toEqual(valid);
  });

  it('validates CheckResult', () => {
    const valid = { success: true, output: 'ok', errors: [] };
    expect(CheckResultSchema.parse(valid)).toEqual(valid);
  });

  it('validates Approval', () => {
    const valid = { proposalId: 'prop-1', approved: true, reason: 'looks good' };
    expect(ApprovalSchema.parse(valid)).toEqual(valid);
  });

  it('validates PolicyViolation', () => {
    const valid = { path: 'src', reason: 'absolute_path', details: 'info' };
    expect(PolicyViolationSchema.parse(valid)).toEqual(valid);

    expect(() => PolicyViolationSchema.parse({ path: 'src', reason: 'unknown' })).toThrow();
  });

  it('validates MutationDecision', () => {
    const valid = {
      allowed: false,
      policyVersion: '1.0.0',
      reason: 'failed',
      violations: [{ path: 'src', reason: 'absolute_path' }]
    };
    expect(MutationDecisionSchema.parse(valid)).toEqual(valid);
  });
});
