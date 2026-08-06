import { describe, it, expect } from 'vitest';
import { runCoordinator } from '../src/workflows/coordinator/coordinator.js';
import { FakeModelAdapter } from '../src/model/fake-model.js';

describe('Coordinator', () => {
  it('returns null proposal when model says DONE (no issues)', async () => {
    const model = new FakeModelAdapter(['DONE']);
    const result = await runCoordinator({
      model,
      target: { rootPath: '/' },
      issueDescription: 'test',
      allowlist: []
    });
    
    expect(result.issues).toEqual([]);
    expect(result.proposal).toBeNull();
  });
  
  it('returns draft proposal with humanApprovalRequired=true when issues found', async () => {
    const issueJson = JSON.stringify([{
      id: 'issue-1',
      severity: 'high',
      confidence: 0.9,
      description: 'Test issue',
      evidence: [],
      relatedFiles: [],
      file: 'src/main.ts'
    }]);
    const model = new FakeModelAdapter([`DIAGNOSIS:${issueJson}`]);
    const result = await runCoordinator({
      model,
      target: { rootPath: '/' },
      issueDescription: 'test',
      allowlist: []
    });
    
    expect(result.issues).toHaveLength(1);
    expect(result.proposal).not.toBeNull();
    expect(result.proposal!.status).toBe('draft');
    expect(result.proposal!.humanApprovalRequired).toBe(true);
    expect(result.proposal!.operations).toHaveLength(1);
    expect(result.proposal!.operations[0].path).toBe('src/main.ts');
  });
});
