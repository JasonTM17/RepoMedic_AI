import type { ModelAdapter } from "../../model/model-adapter.js";
import type { PatchProposal, DiagnosisIssue } from "../../domain/entities.js";
import { runPatchAuthorAgent } from "../../agents/patcher/patch-author-agent.js";
import { runReviewerAgent } from "../../agents/reviewer/reviewer-agent.js";
import { revertPatchTool } from "../../tools/patch/revert-patch-tool.js";
import type { CheckCommand } from "../../checks/check-runner.js";

export interface BoundedRetryOptions {
  model: ModelAdapter;
  proposal: PatchProposal;
  issues: DiagnosisIssue[];
  approved: boolean;
  root: string;
  maxRetries?: number; // default 3
  checksToRun?: CheckCommand[];
}

export interface BoundedRetryResult {
  success: boolean;
  attempts: number;
  finalStatus: "applied" | "failed" | "reverted";
  summary: string;
}

/**
 * Bounded Retry Workflow: wraps PatchAuthorAgent + ReviewerAgent with
 * up to maxRetries attempts. On each failure, reverts the patch and
 * retries with the failure context. On max retries, marks as failed.
 */
export async function runBoundedRetry(
  options: BoundedRetryOptions,
): Promise<BoundedRetryResult> {
  const {
    model,
    proposal,
    issues,
    approved,
    root,
    maxRetries = 3,
    checksToRun,
  } = options;

  if (!approved) {
    return {
      success: false,
      attempts: 0,
      finalStatus: "failed",
      summary: "Not approved",
    };
  }

  let attempt = 0;
  let previousFailures: string | undefined;

  while (attempt < maxRetries) {
    attempt++;

    // Step 1: Author a patch
    const authorResult = await runPatchAuthorAgent({
      model,
      proposal,
      issues,
      approved,
      ...(previousFailures !== undefined
        ? { previousFailures: previousFailures as string }
        : {}),
      maxIterations: 3,
    });

    if (!authorResult.success) {
      return {
        success: false,
        attempts: attempt,
        finalStatus: "failed",
        summary: `Patch author failed on attempt ${attempt}: ${authorResult.error}`,
      };
    }

    // Step 2: Review
    const reviewResult = await runReviewerAgent({
      model,
      proposal,
      root,
      ...(checksToRun !== undefined
        ? { checksToRun: checksToRun as CheckCommand[] }
        : {}),
    });

    if (reviewResult.passed) {
      return {
        success: true,
        attempts: attempt,
        finalStatus: "applied",
        summary: reviewResult.summary,
      };
    }

    // Step 3: Revert and record failures for next attempt
    const pathsToRevert = authorResult.appliedOperations.map((op) => op.path);
    if (pathsToRevert.length > 0) {
      await revertPatchTool({ root, paths: pathsToRevert });
    }

    previousFailures = reviewResult.summary;
  }

  return {
    success: false,
    attempts: attempt,
    finalStatus: "reverted",
    summary: `Max retries (${maxRetries}) exceeded. Last failure: ${previousFailures ?? "unknown"}`,
  };
}
