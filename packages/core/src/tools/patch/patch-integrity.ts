import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { PatchOperation } from "../../domain/entities.js";
import { evaluateMutationPolicy } from "../../policy/mutation.js";
import {
  isWithinRoot,
  normalizePathForPolicy,
} from "../../policy/path-allowlist.js";
import { formatPatchOperations } from "./create-patch-tool.js";

/** Sentinel used to record that a file was expected to be absent. */
export const MISSING_FILE_SHA = "missing";

export function calculatePatchDigest(
  operations: readonly PatchOperation[],
): string {
  return createHash("sha256")
    .update(formatPatchOperations(operations), "utf8")
    .digest("hex");
}

async function resolveSafeTarget(
  root: string,
  operation: PatchOperation,
): Promise<string> {
  const normalizedPath = normalizePathForPolicy(operation.path);
  const absolutePath = path.resolve(root, normalizedPath);
  const resolvedRoot = await fs.realpath(root);

  let resolvedTarget: string;
  try {
    resolvedTarget = await fs.realpath(absolutePath);
  } catch {
    const resolvedParent = await fs.realpath(path.dirname(absolutePath));
    resolvedTarget = path.join(resolvedParent, path.basename(absolutePath));
  }

  if (!isWithinRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(`Patch path escapes repository root: ${operation.path}`);
  }
  return resolvedTarget;
}

/** Read the current full-file SHA-256 without bypassing the mutation policy. */
export async function currentOperationSha(
  root: string,
  allowlist: readonly string[],
  operation: PatchOperation,
): Promise<string> {
  const decision = evaluateMutationPolicy(
    { root, allowlist, requireHumanApproval: true },
    operation,
    true,
  );
  if (!decision.allowed) {
    throw new Error(
      `Patch precondition blocked for ${operation.path}: ${decision.reason}`,
    );
  }

  const target = await resolveSafeTarget(root, operation);
  try {
    const content = await fs.readFile(target);
    return createHash("sha256").update(content).digest("hex");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT") return MISSING_FILE_SHA;
    throw error;
  }
}

export async function capturePatchPreconditions(
  root: string,
  allowlist: readonly string[],
  operations: readonly PatchOperation[],
): Promise<PatchOperation[]> {
  const captured: PatchOperation[] = [];
  for (const operation of operations) {
    const oldSha = await currentOperationSha(root, allowlist, operation);
    if (operation.kind === "create" && oldSha !== MISSING_FILE_SHA) {
      throw new Error(`Create patch target already exists: ${operation.path}`);
    }
    if (operation.kind !== "create" && oldSha === MISSING_FILE_SHA) {
      throw new Error(`Patch target is missing: ${operation.path}`);
    }
    captured.push({
      ...operation,
      oldSha,
    });
  }
  return captured;
}

export async function verifyPatchPreconditions(
  root: string,
  allowlist: readonly string[],
  operations: readonly PatchOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.oldSha === undefined) {
      throw new Error(
        `Immutable patch is missing an old-file precondition: ${operation.path}`,
      );
    }
    const currentSha = await currentOperationSha(root, allowlist, operation);
    if (currentSha !== operation.oldSha) {
      throw new Error(
        `Patch precondition changed for ${operation.path}; expected ${operation.oldSha}, found ${currentSha}.`,
      );
    }
  }
}

export async function capturePatchPostconditions(
  root: string,
  allowlist: readonly string[],
  operations: readonly PatchOperation[],
): Promise<PatchOperation[]> {
  const captured: PatchOperation[] = [];
  for (const operation of operations) {
    const newSha = await currentOperationSha(root, allowlist, operation);
    captured.push({ ...operation, newSha });
  }
  return captured;
}
