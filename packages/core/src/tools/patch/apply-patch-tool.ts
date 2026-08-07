import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { evaluateMutationPolicy } from "../../policy/mutation.js";
import { boundedExec } from "../../process/index.js";
import type { PatchProposal } from "../../domain/entities.js";
import { patchOk, patchFail, type PatchToolResult } from "./patch-result.js";
import { formatPatchOperations } from "./create-patch-tool.js";

export interface ApplyPatchInput {
  root: string;
  allowlist: readonly string[];
  proposal: PatchProposal;
  approved: boolean;
}

export async function applyPatchTool(
  input: ApplyPatchInput,
): Promise<PatchToolResult> {
  const { root, allowlist, proposal, approved } = input;

  // Gate every operation through MutationPolicy before touching the filesystem
  for (const op of proposal.operations) {
    const decision = evaluateMutationPolicy(
      { root, allowlist, requireHumanApproval: true },
      op,
      approved,
    );
    if (!decision.allowed) {
      return patchFail(
        `Policy blocked operation on ${op.path}: ${decision.reason}`,
      );
    }
  }

  const unsupportedOperations = proposal.operations.filter(
    (op) => op.kind === "rename" || op.kind === "chmod",
  );
  if (unsupportedOperations.length > 0) {
    return patchFail(
      `Refusing unsupported non-content operations: ${unsupportedOperations
        .map((op) => `${op.kind} ${op.path}`)
        .join(", ")}`,
    );
  }

  const missingHunks = proposal.operations.filter(
    (op) => !op.hunks || op.hunks.length === 0,
  );
  if (missingHunks.length > 0) {
    return patchFail(
      `Refusing operations without exact diff hunks: ${missingHunks
        .map((op) => `${op.kind} ${op.path}`)
        .join(", ")}`,
    );
  }

  // Apply hunks that have diff content via git apply
  const hunkedOps = proposal.operations.filter(
    (op) => op.hunks && op.hunks.length > 0,
  );
  if (hunkedOps.length > 0) {
    const diffText = formatPatchOperations(hunkedOps);

    const tmpdir = os.tmpdir();
    const tempName = crypto.randomBytes(16).toString("hex") + ".patch";
    const tempPath = path.join(tmpdir, tempName);

    try {
      await fs.writeFile(tempPath, diffText, "utf8");
      const checkResult = await boundedExec(
        "git",
        ["apply", "--check", tempPath],
        {
          cwd: root,
          timeoutMs: 30_000,
        },
      );
      if (checkResult.exitCode !== 0) {
        return patchFail(
          `git apply check failed: ${checkResult.stderr || checkResult.stdout || "unknown patch conflict"}`,
        );
      }

      // `--reject` is intentionally omitted: after the clean preflight,
      // git's default all-or-nothing apply behavior is the transaction
      // boundary. Unexpected failure is surfaced instead of guessed rollback.
      const result = await boundedExec("git", ["apply", tempPath], {
        cwd: root,
        timeoutMs: 30_000,
      });
      if (result.exitCode !== 0) {
        return patchFail(
          `git apply failed after preflight: ${result.stderr || result.stdout || "unknown apply failure"}`,
        );
      }
    } catch (err) {
      return patchFail(err instanceof Error ? err.message : String(err));
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  return patchOk(`applied ${proposal.operations.length} operations`);
}
