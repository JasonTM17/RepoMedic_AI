import { SecureFileSystem } from '../../fs/secure-fs.js';
import type { ReadResult } from '../../fs/secure-fs.js';
import { ok, fail, type ToolResult } from './tool-result.js';

export interface ReadFileInput {
  root: string;
  allowlist: readonly string[];
  path: string; // relative to root
}

export async function readFileTool(input: ReadFileInput): Promise<ToolResult<ReadResult>> {
  try {
    const fs = new SecureFileSystem({ root: input.root, allowlist: input.allowlist });
    const result = await fs.readFile(input.path);
    return ok(result);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
