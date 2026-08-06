import { boundedExec } from "../../process/index.js";
import { patchOk, patchFail, type PatchToolResult } from "./patch-result.js";

export interface RevertPatchInput {
  root: string;
  paths: string[]; // paths to revert
}

export async function revertPatchTool(
  input: RevertPatchInput,
): Promise<PatchToolResult> {
  if (input.paths.length === 0) return patchOk("nothing to revert");
  try {
    const result = await boundedExec(
      "git",
      ["checkout", "HEAD", "--", ...input.paths],
      {
        cwd: input.root,
        timeoutMs: 15_000,
      },
    );
    if (result.exitCode !== 0) return patchFail(result.stderr);
    return patchOk(`reverted ${input.paths.length} paths`);
  } catch (err) {
    return patchFail(err instanceof Error ? err.message : String(err));
  }
}
