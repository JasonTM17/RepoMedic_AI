/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { runBoundedRetry } from '../src/workflows/retry/bounded-retry.js';
import { FakeModelAdapter } from '../src/model/fake-model.js';
import type { PatchProposal } from '../src/domain/entities.js';
import * as revertPatchToolMod from '../src/tools/patch/revert-patch-tool.js';
import { patchOk } from '../src/tools/patch/patch-result.js';

describe('Bounded Retry Workflow', () => {
  it('returns failed immediately when approved=false', async () => {
    const result = await runBoundedRetry({
      model: new FakeModelAdapter([]),
      proposal: {} as any,
      issues: [],
      approved: false,
      root: 'd:/RepoMedic_AI',
    });
    expect(result.success).toBe(false);
    expect(result.finalStatus).toBe('failed');
    expect(result.summary).toBe('Not approved');
  });

  it('returns success on first attempt when author succeeds and reviewer passes', async () => {
    const proposal: PatchProposal = {
      id: 'p1',
      target: { rootPath: 'd:/RepoMedic_AI' },
      operations: [],
      status: 'draft',
      humanApprovalRequired: true,
    };
    
    const result = await runBoundedRetry({
      model: new FakeModelAdapter(['DONE']),
      proposal,
      issues: [],
      approved: true,
      root: 'd:/RepoMedic_AI',
      checksToRun: [{ name: 'fast', command: 'node', args: ['--version'], timeoutMs: 5000 }],
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.finalStatus).toBe('applied');
  });

  it('returns reverted after maxRetries when checks keep failing', async () => {
    vi.spyOn(revertPatchToolMod, 'revertPatchTool').mockResolvedValue(patchOk('ok'));
    const proposal: PatchProposal = {
      id: 'p1',
      target: { rootPath: 'd:/RepoMedic_AI' },
      operations: [],
      status: 'draft',
      humanApprovalRequired: true,
    };
    
    const result = await runBoundedRetry({
      model: new FakeModelAdapter(['DONE', 'DONE', 'DONE']), // Author answers DONE each time
      proposal,
      issues: [],
      approved: true,
      root: 'd:/RepoMedic_AI',
      maxRetries: 2,
      checksToRun: [{ name: 'fail', command: 'node', args: ['--eval', 'process.exit(1)'], timeoutMs: 5000 }],
    });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.finalStatus).toBe('reverted');
    expect(result.summary).toContain('Max retries (2) exceeded');
  });
});
