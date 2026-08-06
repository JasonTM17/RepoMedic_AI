import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import { readFileTool } from '../src/tools/repo/read-file-tool.js';
import { listDirTool } from '../src/tools/repo/list-dir-tool.js';
import { grepTool } from '../src/tools/repo/grep-tool.js';
import { gitLogTool } from '../src/tools/repo/git-log-tool.js';
import { gitDiffTool } from '../src/tools/repo/git-diff-tool.js';

describe('Repo Tools', () => {
  it('readFileTool returns fail (not throw) for blocked path', async () => {
    const tmp = os.tmpdir();
    const result = await readFileTool({ root: tmp, allowlist: [tmp], path: '../../../etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('listDirTool returns success for root "."', async () => {
    const tmp = os.tmpdir();
    const result = await listDirTool({ root: tmp, allowlist: [tmp], path: '.' });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('grepTool returns success result shape', async () => {
    const result = await grepTool({ root: 'd:/RepoMedic_AI', pattern: 'import' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data?.matches)).toBe(true);
      expect(typeof result.data?.truncated).toBe('boolean');
    }
  });

  it('gitLogTool returns success result shape', async () => {
    const result = await gitLogTool({ root: 'd:/RepoMedic_AI' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data?.log).toBe('string');
      expect(typeof result.data?.truncated).toBe('boolean');
    }
  });

  it('gitDiffTool returns success result shape', async () => {
    const result = await gitDiffTool({ root: 'd:/RepoMedic_AI' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data?.diff).toBe('string');
      expect(typeof result.data?.truncated).toBe('boolean');
    }
  });
});
