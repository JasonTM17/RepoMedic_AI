#!/usr/bin/env node
/**
 * RepoMedic automated evaluation suite.
 * Runs RepoMedic against the fixtures/task-api fixture and grades:
 * 1. Diagnosis: did the explorer find any issues?
 * 2. No policy violations: were all policy gates respected?
 * 3. Dry-run completes: coordinator produces a plan without error
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Import core directly from source
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, '../fixtures/task-api');
const REPO_ROOT = resolve(__dirname, '..');

async function main() {
  process.stdout.write('=== RepoMedic Evaluation Suite ===\n\n');

  const { createModelAdapter, runCoordinator } = await import('../packages/core/src/index.js');

  const model = createModelAdapter({
    backend: 'fake',
    responses: [
      // Explorer iteration 1: list dir
      'TOOL:listDir:.',
      // Explorer iteration 2: read a file
      'TOOL:readFile:src/task-store.ts',
      // Explorer iteration 3: diagnose
      'DIAGNOSIS:[{"id":"bug-1","severity":"high","confidence":0.9,"description":"nextId starts at 0 instead of 1","evidence":["let nextId = 0;"],"relatedFiles":["src/task-store.ts"],"file":"src/task-store.ts"}]',
    ],
  });

  const target = {
    rootPath: FIXTURE_ROOT,
    branch: 'main',
  };

  let passed = 0;
  let failed = 0;

  async function grade(name: string, fn: () => Promise<boolean>) {
    try {
      const result = await fn();
      if (result) {
        process.stdout.write(`  PASS  ${name}\n`);
        passed++;
      } else {
        process.stdout.write(`  FAIL  ${name}\n`);
        failed++;
      }
    } catch (err) {
      process.stdout.write(`  ERROR ${name}: ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
    }
  }

  // Eval 1: Coordinator runs without error
  let coordResult: Awaited<ReturnType<typeof runCoordinator>> | null = null;
  await grade('Coordinator runs without throwing', async () => {
    coordResult = await runCoordinator({
      model,
      target,
      issueDescription: 'Find and report all bugs in the task API',
      allowlist: ['src'],
    });
    return true;
  });

  // Eval 2: Explorer found at least one issue
  await grade('Explorer identified at least 1 issue', async () => {
    return (coordResult?.issues.length ?? 0) >= 1;
  });

  // Eval 3: Proposal has humanApprovalRequired=true
  await grade('Proposal requires human approval (policy gate)', async () => {
    return coordResult?.proposal?.humanApprovalRequired === true;
  });

  // Eval 4: Proposal status is draft (not auto-applied)
  await grade('Proposal is in draft status (not auto-applied)', async () => {
    return coordResult?.proposal?.status === 'draft';
  });

  process.stdout.write(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  process.stderr.write(`Eval suite crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
