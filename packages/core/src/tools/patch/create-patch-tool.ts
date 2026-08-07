import type { PatchOperation } from "../../domain/entities.js";
import { patchOk, patchFail, type PatchToolResult } from "./patch-result.js";

/** Rebuild the file headers required by git from a parsed patch operation. */
export function formatPatchOperation(operation: PatchOperation): string | null {
  if (operation.kind === "rename" || operation.kind === "chmod") return null;

  const hunks = operation.hunks ?? [];
  if (hunks.length === 0) return null;

  const oldPath =
    operation.kind === "create" ? "/dev/null" : `a/${operation.path}`;
  const newPath =
    operation.kind === "delete" ? "/dev/null" : `b/${operation.path}`;

  return [`--- ${oldPath}`, `+++ ${newPath}`, ...hunks].join("\n");
}

/** Build one unified diff containing only operations with diff hunks. */
export function formatPatchOperations(
  operations: readonly PatchOperation[],
): string {
  const patches = operations
    .map(formatPatchOperation)
    .filter((patch): patch is string => patch !== null);

  return patches.length > 0 ? `${patches.join("\n")}\n` : "";
}

export interface CreatePatchInput {
  /** Unified diff text (from git diff) */
  diffText: string;
  /** Default kind for modified files */
  defaultKind?: "modify";
}

export interface CreatePatchOutput {
  operations: PatchOperation[];
}

/**
 * Parses a unified diff into PatchOperation[] (simplified parser).
 * Extracts file paths and hunks from '--- a/...' / '+++ b/...' headers.
 */
export function createPatchFromDiff(
  input: CreatePatchInput,
): PatchToolResult & { operations?: PatchOperation[] } {
  try {
    const lines = input.diffText.split("\n");
    const ops: PatchOperation[] = [];
    let currentOldPath: string | null = null;
    let currentNewPath: string | null = null;
    let currentHunks: string[] = [];
    let inHunk = false;
    let hunkLines: string[] = [];

    const flush = () => {
      if (currentNewPath && currentNewPath !== "/dev/null") {
        const path = currentNewPath.replace(/^b\//, "");
        ops.push({
          id: `op-${ops.length}`,
          path,
          kind: currentOldPath === "/dev/null" ? "create" : "modify",
          hunks: currentHunks,
        });
      } else if (
        currentOldPath &&
        currentOldPath !== "/dev/null" &&
        currentNewPath === "/dev/null"
      ) {
        const path = currentOldPath.replace(/^a\//, "");
        ops.push({
          id: `op-${ops.length}`,
          path,
          kind: "delete",
          hunks: currentHunks,
        });
      }
    };

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        if (currentOldPath !== null) {
          if (inHunk) {
            currentHunks.push(hunkLines.join("\n"));
            hunkLines = [];
            inHunk = false;
          }
          flush();
        }
        currentOldPath = line.slice(4).split("\t")[0] ?? null;
        currentNewPath = null;
        currentHunks = [];
      } else if (line.startsWith("+++ ")) {
        currentNewPath = line.slice(4).split("\t")[0] ?? null;
      } else if (line.startsWith("@@ ")) {
        if (inHunk) {
          currentHunks.push(hunkLines.join("\n"));
          hunkLines = [];
        }
        inHunk = true;
        hunkLines = [line];
      } else if (inHunk) {
        hunkLines.push(line);
      }
    }
    if (inHunk) currentHunks.push(hunkLines.join("\n"));
    if (currentOldPath !== null) flush();

    return { ...patchOk(`parsed ${ops.length} operations`), operations: ops };
  } catch (err) {
    return { ...patchFail(err instanceof Error ? err.message : String(err)) };
  }
}
