import { boundedExec } from "../../process/index.js";
import { ok, fail, type ToolResult } from "./tool-result.js";

export interface GitLogInput {
  root: string;
  maxCommits?: number; // default 50
}

export interface GitLogResult {
  log: string;
  truncated: boolean;
}

export async function gitLogTool(
  input: GitLogInput,
): Promise<ToolResult<GitLogResult>> {
  const n = input.maxCommits ?? 50;
  try {
    const result = await boundedExec(
      "git",
      ["log", "--oneline", `-n`, String(n)],
      { cwd: input.root, timeoutMs: 10_000 },
    );
    return ok({ log: result.stdout, truncated: result.truncated });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
