import type { ModelAdapter, Message } from "../../model/model-adapter.js";
import type {
  PatchProposal,
  DiagnosisIssue,
  PatchOperation,
} from "../../domain/entities.js";
import { applyPatchTool } from "../../tools/patch/apply-patch-tool.js";
import { createPatchFromDiff } from "../../tools/patch/create-patch-tool.js";

export interface PatchAuthorOptions {
  model: ModelAdapter;
  proposal: PatchProposal;
  issues: DiagnosisIssue[];
  approved: boolean;
  allowlist: readonly string[];
  /** Failed check results from previous attempt, used as feedback */
  previousFailures?: string;
  maxIterations?: number; // default 5
}

export interface PatchAuthorResult {
  success: boolean;
  appliedOperations: PatchOperation[];
  error?: string;
  iterations: number;
}

function operationKey(
  operation: Pick<PatchOperation, "kind" | "path">,
): string {
  return `${operation.kind}\u0000${operation.path}`;
}

/**
 * Model output is authorized as a bounded multiset of operation identities.
 * A path-only filter would allow an approved file to change operation kind or
 * to appear more times than the proposal permits.
 */
function hasExactApprovedOperations(
  parsedOperations: readonly PatchOperation[],
  approvedOperations: readonly PatchOperation[],
): boolean {
  if (parsedOperations.length !== approvedOperations.length) return false;

  const approvedCounts = new Map<string, number>();
  for (const operation of approvedOperations) {
    const key = operationKey(operation);
    approvedCounts.set(key, (approvedCounts.get(key) ?? 0) + 1);
  }

  const parsedCounts = new Map<string, number>();
  for (const operation of parsedOperations) {
    const key = operationKey(operation);
    const nextCount = (parsedCounts.get(key) ?? 0) + 1;
    parsedCounts.set(key, nextCount);
    if (nextCount > (approvedCounts.get(key) ?? 0)) return false;
  }

  return [...approvedCounts].every(
    ([key, count]) => parsedCounts.get(key) === count,
  );
}

/**
 * Patch Author Agent: given an approved PatchProposal and DiagnosisIssue[],
 * generates a concrete patch via the model and applies it through the
 * MutationPolicy gate. Only operates on allowlisted paths.
 *
 * Protocol: model returns either
 * - PATCH:<unified-diff-text> to apply a diff
 * - DONE to signal completion with no changes
 * - SKIP:<reason> to skip an operation
 */
export async function runPatchAuthorAgent(
  options: PatchAuthorOptions,
): Promise<PatchAuthorResult> {
  const {
    model,
    proposal,
    issues,
    approved,
    allowlist,
    previousFailures,
    maxIterations = 5,
  } = options;

  if (!approved) {
    return {
      success: false,
      appliedOperations: [],
      error: "Patch not approved",
      iterations: 0,
    };
  }

  const unsupportedOperations = proposal.operations.filter(
    (operation) => operation.kind === "rename" || operation.kind === "chmod",
  );
  if (unsupportedOperations.length > 0) {
    return {
      success: false,
      appliedOperations: [],
      error:
        "Automatic patch authoring supports only create, modify, and delete unified-diff operations.",
      iterations: 0,
    };
  }

  const issuesSummary = issues
    .map(
      (i) => `[${i.severity}] ${i.description} (file: ${i.file ?? "unknown"})`,
    )
    .join("\n");
  const operationsSummary = proposal.operations
    .map((op) => `[${op.kind}] ${op.path}`)
    .join("\n");

  const messages: Message[] = [
    {
      role: "system",
      content: `You are a patch author agent. Generate minimal, correct patches for the given issues.\nRespond with:\n- PATCH:<unified diff text> to apply a change\n- DONE when finished\nOnly modify files listed in the proposal operations. Be minimal and precise.`,
    },
    {
      role: "user",
      content: `Issues to fix:\n${issuesSummary}\n\nAllowed operations:\n${operationsSummary}${previousFailures ? `\n\nPrevious attempt failures:\n${previousFailures}` : ""}\n\nGenerate the patch now.`,
    },
  ];

  const appliedOperations: PatchOperation[] = [];
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    let response: string;
    try {
      response = await model.complete(messages);
    } catch (err) {
      return {
        success: false,
        appliedOperations,
        error: err instanceof Error ? err.message : String(err),
        iterations,
      };
    }

    messages.push({ role: "assistant", content: response });

    if (response.trim() === "DONE" || response.startsWith("DONE")) {
      return { success: true, appliedOperations, iterations };
    }

    if (response.startsWith("PATCH:")) {
      const diffText = response.slice("PATCH:".length).trim();
      const parsed = createPatchFromDiff({ diffText });
      if (!parsed.operations || parsed.operations.length === 0) {
        messages.push({
          role: "user",
          content:
            "No operations parsed from the diff. Try again or respond DONE.",
        });
        continue;
      }

      if (!hasExactApprovedOperations(parsed.operations, proposal.operations)) {
        messages.push({
          role: "user",
          content:
            "The patch was rejected because every operation must match an approved proposal path and operation kind, without duplicates. Try again with only the exact approved operations.",
        });
        continue;
      }

      const updatedProposal: PatchProposal = {
        ...proposal,
        operations: parsed.operations,
      };
      const result = await applyPatchTool({
        root: proposal.target.rootPath,
        allowlist,
        proposal: updatedProposal,
        approved,
      });

      if (!result.success) {
        return {
          success: false,
          appliedOperations,
          error: `Apply failed; patch authoring stopped to avoid retrying over an unknown worktree state: ${result.error}`,
          iterations,
        };
      }

      appliedOperations.push(...parsed.operations);
      return { success: true, appliedOperations, iterations };
    }

    messages.push({
      role: "user",
      content: "Unrecognized response. Respond with PATCH:<diff> or DONE.",
    });
  }

  return {
    success: false,
    appliedOperations,
    error: "Max iterations reached without completing",
    iterations,
  };
}
