import { resolve } from "node:path";

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
  allowlist: readonly string[];
  root: string;
  maxRetries?: number; // default 3
  checksToRun?: CheckCommand[];
}

export interface BoundedRetryResult {
  success: boolean;
  attempts: number;
  finalStatus: "applied" | "no-op" | "failed" | "reverted" | "revert-failed";
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
    allowlist,
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

  if (!Number.isSafeInteger(maxRetries) || maxRetries < 1) {
    return {
      success: false,
      attempts: 0,
      finalStatus: "failed",
      summary: "maxRetries must be a positive safe integer.",
    };
  }

  const canonicalRoot = resolve(root);
  if (canonicalRoot !== resolve(proposal.target.rootPath)) {
    return {
      success: false,
      attempts: 0,
      finalStatus: "failed",
      summary: "Workflow root must match proposal.target.rootPath.",
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
      allowlist,
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

    if (authorResult.proposal !== undefined) {
      proposal.operations = authorResult.proposal.operations;
      proposal.digest = authorResult.proposal.digest;
    }

    if (authorResult.appliedOperations.length === 0) {
      if (proposal.operations.length > 0) {
        return {
          success: false,
          attempts: attempt,
          finalStatus: "failed",
          summary:
            "Patch author completed without applying the non-empty proposal.",
        };
      }

      return {
        success: true,
        attempts: attempt,
        finalStatus: "no-op",
        summary: "Patch author completed without applying operations.",
      };
    }

    // Step 2: Review
    const reviewResult = await runReviewerAgent({
      model,
      proposal,
      root: canonicalRoot,
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
    if (authorResult.appliedOperations.length > 0) {
      const revertResult = await revertPatchTool({
        root: canonicalRoot,
        operations: authorResult.appliedOperations,
      });
      if (!revertResult.success) {
        return {
          success: false,
          attempts: attempt,
          finalStatus: "revert-failed",
          summary: `Review failed and revert failed: ${revertResult.error ?? revertResult.message}`,
        };
      }

      if (proposal.digest !== undefined) {
        return {
          success: false,
          attempts: attempt,
          finalStatus: "reverted",
          summary: `${reviewResult.summary} The immutable approved patch was reverted; a new candidate requires a new human approval.`,
        };
      }
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
