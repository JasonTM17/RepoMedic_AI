import { describe, it, expect } from 'vitest';
import { ApprovalCheckpoint } from '../src/approval/approval-checkpoint.js';
import type { PatchProposal } from '../src/domain/entities.js';

describe('Approval Checkpoint', () => {
  const dummyProposal: PatchProposal = {
    id: 'prop-1',
    target: { rootPath: '/' },
    operations: [
      { id: 'op-1', path: 'file.txt', kind: 'modify' }
    ],
    status: 'draft',
    humanApprovalRequired: true,
  };

  it('returns approved Approval when readLine returns approve', async () => {
    const checkpoint = new ApprovalCheckpoint({
      readLine: async () => 'approve\n'
    });
    
    const result = await checkpoint.requestApproval(dummyProposal);
    expect(result.decision).toBe('approved');
    expect(result.proposalId).toBe('prop-1');
    expect(result.decidedBy).toBe('human');
  });
  
  it('returns rejected Approval when readLine returns reject', async () => {
    const checkpoint = new ApprovalCheckpoint({
      readLine: async () => 'REJECT '
    });
    
    const result = await checkpoint.requestApproval(dummyProposal);
    expect(result.decision).toBe('rejected');
    expect(result.proposalId).toBe('prop-1');
  });
  
  it('returns deferred Approval for unknown input', async () => {
    const checkpoint = new ApprovalCheckpoint({
      readLine: async () => 'maybe later'
    });
    
    const result = await checkpoint.requestApproval(dummyProposal);
    expect(result.decision).toBe('deferred');
    expect(result.reason).toBe('unknown input: maybe later');
  });
});
