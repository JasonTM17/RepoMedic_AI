import { boundedExec } from '../../process/index.js';
import { ok, fail, type ToolResult } from './tool-result.js';

export interface GrepInput {
  root: string;
  pattern: string;
  pathSpec?: string; // optional path filter (e.g. '*.ts')
  maxResults?: number;
}

export interface GrepResult {
  matches: string[]; // lines matching
  truncated: boolean;
}

export async function grepTool(input: GrepInput): Promise<ToolResult<GrepResult>> {
  const args = ['grep', '--line-number', '-r', input.pattern];
  if (input.pathSpec) args.push('--', input.pathSpec);
  
  try {
    const result = await boundedExec('git', args, { cwd: input.root, timeoutMs: 15_000 });
    const lines = result.stdout.split('\n').filter(l => l.length > 0);
    const max = input.maxResults ?? 200;
    return ok({
      matches: lines.slice(0, max),
      truncated: result.truncated || lines.length > max,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
