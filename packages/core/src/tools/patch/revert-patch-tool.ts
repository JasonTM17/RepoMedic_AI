import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { boundedExec } from "../../process/index.js";
import type { PatchOperation } from "../../domain/entities.js";
import { formatPatchOperations } from "./create-patch-tool.js";
import { patchOk, patchFail, type PatchToolResult } from "./patch-result.js";

export interface RevertPatchInput {
  root: string;
  /** Exact operations returned by the patch application. */
  operations?: readonly PatchOperation[];
  /** @deprecated Path-only revert is intentionally rejected for safety. */
  paths?: readonly string[];
}

export async function revertPatchTool(
  input: RevertPatchInput,
): Promise<PatchToolResult> {
  const operations = input.operations ?? [];
  const paths = input.paths ?? [];

  if (operations.length === 0 && paths.length === 0) {
    return patchOk("nothing to revert");
  }

  if (operations.length === 0) {
    return patchFail(
      "Refusing path-only revert; exact applied patch operations are required to preserve unrelated changes.",
    );
  }

  const unsupportedOperations = operations.filter(
    (operation) => operation.kind === "rename" || operation.kind === "chmod",
  );
  if (unsupportedOperations.length > 0) {
    return patchFail(
      `Cannot reverse unsupported non-content operations: ${unsupportedOperations
        .map((operation) => `${operation.kind} ${operation.path}`)
        .join(", ")}`,
    );
  }

  if (operations.some((operation) => (operation.hunks ?? []).length === 0)) {
    return patchFail(
      "Cannot safely reverse an operation without exact diff hunks; the applied patch was left in place.",
    );
  }

  const diffText = formatPatchOperations(operations);
  const tempPath = path.join(
    os.tmpdir(),
    `${crypto.randomBytes(16).toString("hex")}.patch`,
  );

  try {
    await fs.writeFile(tempPath, diffText, "utf8");
    const result = await boundedExec("git", ["apply", "--reverse", tempPath], {
      cwd: input.root,
      timeoutMs: 15_000,
    });
    if (result.exitCode !== 0) {
      return patchFail(
        result.stderr || result.stdout || "git apply --reverse failed",
      );
    }
    return patchOk(`reverted ${operations.length} operations`);
  } catch (err) {
    return patchFail(err instanceof Error ? err.message : String(err));
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
