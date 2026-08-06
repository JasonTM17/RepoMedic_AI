import type { ModelAdapter, Message } from '../../model/model-adapter.js';
import type { PatchProposal, CheckResult } from '../../domain/entities.js';
import { runChecks, DEFAULT_CHECKS, type CheckCommand } from '../../checks/check-runner.js';

export interface ReviewerAgentOptions {
  model: ModelAdapter;
  proposal: PatchProposal;
  root: string;
  checksToRun?: CheckCommand[];
}

export interface ReviewerAgentResult {
  passed: boolean;
  checkResults: CheckResult[];
  summary: string;
  failedChecks: string[];
}

/**
 * Reviewer Agent: runs automated checks after a patch has been applied.
 * Reports pass/fail and generates a summary for the retry workflow.
 */
export async function runReviewerAgent(options: ReviewerAgentOptions): Promise<ReviewerAgentResult> {
  const { proposal, root, checksToRun } = options;

  const checks = checksToRun ?? DEFAULT_CHECKS;
  const checkResults = await runChecks(root, checks);

  const failedChecks = checkResults
    .filter(r => r.status === 'failed')
    .map(r => r.checkName);

  const passed = failedChecks.length === 0;

  const summary = passed
    ? `All ${checkResults.length} checks passed for proposal ${proposal.id}.`
    : `${failedChecks.length}/${checkResults.length} checks failed: ${failedChecks.join(', ')}. Failures:\n${checkResults.filter(r => r.status === 'failed').map(r => `[${r.checkName}] ${(r.output ?? '').slice(0, 500)}`).join('\n')}`;

  return { passed, checkResults, summary, failedChecks };
}
