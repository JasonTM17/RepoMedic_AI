import type { ModelAdapter } from "../../model/model-adapter.js";
import type {
  RepositoryTarget,
  DiagnosisIssue,
  PatchProposal,
} from "../../domain/entities.js";
import { runExplorerAgent } from "../../agents/explorer/index.js";

export interface CoordinatorOptions {
  model: ModelAdapter;
  target: RepositoryTarget;
  issueDescription: string;
  allowlist: readonly string[];
  maxExplorerIterations?: number;
}

export interface CoordinatorResult {
  issues: DiagnosisIssue[];
  proposal: PatchProposal | null; // null if no issues found
  explorerIterations: number;
  stopped: string;
}

/**
 * Coordinator: runs the Explorer Agent to diagnose issues, then builds
 * a draft PatchProposal for human review. No mutation happens here.
 */
export async function runCoordinator(
  options: CoordinatorOptions,
): Promise<CoordinatorResult> {
  const { model, target, issueDescription, allowlist, maxExplorerIterations } =
    options;

  // Step 1: Run explorer to diagnose
  const explorerResult = await runExplorerAgent({
    model,
    target,
    issueDescription,
    allowlist,
    ...(maxExplorerIterations !== undefined
      ? { maxIterations: maxExplorerIterations }
      : {}),
  });

  const { issues, iterations, stopped } = explorerResult;

  // Step 2: Build draft proposal if issues found
  if (issues.length === 0) {
    return {
      issues: [],
      proposal: null,
      explorerIterations: iterations,
      stopped,
    };
  }

  const proposal: PatchProposal = {
    id: `proposal-${Date.now()}`,
    target,
    operations: issues
      .filter((i) => i.file)
      .map((issue, idx) => ({
        id: `op-${idx}`,
        path: issue.file!,
        kind: "modify" as const,
        hunks: [],
      })),
    status: "draft",
    humanApprovalRequired: true,
  };

  return { issues, proposal, explorerIterations: iterations, stopped };
}
