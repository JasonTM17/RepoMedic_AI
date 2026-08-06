import { SecureFileSystem } from '../../fs/secure-fs.js';
import type { ListResult } from '../../fs/secure-fs.js';
import { ok, fail, type ToolResult } from './tool-result.js';

export interface ListDirInput {
  root: string;
  allowlist: readonly string[];
  path: string; // relative to root
}

export async function listDirTool(input: ListDirInput): Promise<ToolResult<ListResult>> {
  try {
    const fs = new SecureFileSystem({ root: input.root, allowlist: input.allowlist });
    const result = await fs.listDir(input.path);
    return ok(result);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
