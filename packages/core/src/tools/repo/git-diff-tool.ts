import { boundedExec } from '../../process/index.js';
import { ok, fail, type ToolResult } from './tool-result.js';

export interface GitDiffInput {
  root: string;
  ref?: string; // default 'HEAD'
}

export interface GitDiffResult {
  diff: string;
  truncated: boolean;
}

export async function gitDiffTool(input: GitDiffInput): Promise<ToolResult<GitDiffResult>> {
  const ref = input.ref ?? 'HEAD';
  try {
    const result = await boundedExec('git', ['diff', ref], { cwd: input.root, timeoutMs: 15_000 });
    return ok({ diff: result.stdout, truncated: result.truncated });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
