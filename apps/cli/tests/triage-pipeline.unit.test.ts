import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Approval,
  BoundedRetryResult,
  CoordinatorResult,
  DiagnosisIssue,
  PatchProposal,
} from "@jasonTM17/core";

import { createProgram } from "../src/index.js";

const mocks = vi.hoisted(() => ({
  runCoordinator: vi.fn(),
  runBoundedRetry: vi.fn(),
  requestApproval: vi.fn(),
}));

vi.mock("@jasonTM17/core", () => ({
  createModelAdapter: vi.fn(() => ({ name: "fake", complete: vi.fn() })),
  runCoordinator: mocks.runCoordinator,
  ApprovalCheckpoint: vi.fn().mockImplementation(() => ({
    requestApproval: mocks.requestApproval,
  })),
  runBoundedRetry: mocks.runBoundedRetry,
}));

const REPO_ROOT = process.cwd();

function captureStream(stream: NodeJS.WriteStream) {
  const chunks: string[] = [];
  const spy = vi.spyOn(stream, "write").mockImplementation(
    ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof stream.write,
  );
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

function buildCoordinatorResult(): CoordinatorResult {
  const issue: DiagnosisIssue = {
    id: "issue-1",
    file: "src/example.ts",
    severity: "high",
    confidence: 0.9,
    description: "Null pointer dereference",
    evidence: ["line 42: possible null access"],
    relatedFiles: [],
  };
  const proposal: PatchProposal = {
    id: "proposal-1",
    target: { rootPath: REPO_ROOT },
    operations: [
      { id: "op-0", path: "src/example.ts", kind: "modify", hunks: [] },
    ],
    status: "draft",
    humanApprovalRequired: true,
  };
  return { issues: [issue], proposal, explorerIterations: 1, stopped: "done" };
}

function approval(decision: Approval["decision"]): Approval {
  return {
    proposalId: "proposal-1",
    decidedBy: "human",
    decision,
    decidedAt: new Date().toISOString(),
  };
}

describe("CLI triage patch pipeline wiring", () => {
  beforeEach(() => {
    mocks.runCoordinator.mockReset();
    mocks.runBoundedRetry.mockReset();
    mocks.requestApproval.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("reports success and exits 0 when the pipeline applies the patch", async () => {
    mocks.runCoordinator.mockResolvedValue(buildCoordinatorResult());
    mocks.requestApproval.mockResolvedValue(approval("approved"));
    const retryResult: BoundedRetryResult = {
      success: true,
      attempts: 2,
      finalStatus: "applied",
      summary: "All checks passed.",
    };
    mocks.runBoundedRetry.mockResolvedValue(retryResult);

    const stdout = captureStream(process.stdout);
    try {
      await createProgram().parseAsync([
        "node",
        "repomedic",
        "triage",
        REPO_ROOT,
      ]);
    } finally {
      stdout.restore();
    }

    expect(mocks.runBoundedRetry).toHaveBeenCalledTimes(1);
    expect(stdout.text()).toContain(
      "Patch applied successfully after 2 attempt(s)",
    );
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(
      true,
    );
  });

  it("surfaces failure and exits non-zero when the pipeline fails", async () => {
    mocks.runCoordinator.mockResolvedValue(buildCoordinatorResult());
    mocks.requestApproval.mockResolvedValue(approval("approved"));
    const retryResult: BoundedRetryResult = {
      success: false,
      attempts: 3,
      finalStatus: "reverted",
      summary: "Max retries (3) exceeded.",
    };
    mocks.runBoundedRetry.mockResolvedValue(retryResult);

    const stderr = captureStream(process.stderr);
    try {
      await createProgram().parseAsync([
        "node",
        "repomedic",
        "triage",
        REPO_ROOT,
      ]);
    } finally {
      stderr.restore();
    }

    expect(stderr.text()).toContain("Patch reverted after 3 attempt(s)");
    expect(process.exitCode).toBe(1);
  });

  it("never calls the patch pipeline in dry-run mode", async () => {
    mocks.runCoordinator.mockResolvedValue(buildCoordinatorResult());

    await createProgram().parseAsync([
      "node",
      "repomedic",
      "triage",
      REPO_ROOT,
      "--dry-run",
    ]);

    expect(mocks.requestApproval).not.toHaveBeenCalled();
    expect(mocks.runBoundedRetry).not.toHaveBeenCalled();
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(
      true,
    );
  });

  it("forwards --max-retries to the bounded retry pipeline", async () => {
    mocks.runCoordinator.mockResolvedValue(buildCoordinatorResult());
    mocks.requestApproval.mockResolvedValue(approval("approved"));
    const retryResult: BoundedRetryResult = {
      success: true,
      attempts: 1,
      finalStatus: "applied",
      summary: "ok",
    };
    mocks.runBoundedRetry.mockResolvedValue(retryResult);

    await createProgram().parseAsync([
      "node",
      "repomedic",
      "triage",
      REPO_ROOT,
      "--max-retries",
      "7",
    ]);

    expect(mocks.runBoundedRetry).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 7 }),
    );
  });

  it("rejects a non-positive-integer --max-retries without running the pipeline", async () => {
    const stderr = captureStream(process.stderr);
    try {
      await createProgram().parseAsync([
        "node",
        "repomedic",
        "triage",
        REPO_ROOT,
        "--max-retries",
        "0",
      ]);
    } finally {
      stderr.restore();
    }

    expect(mocks.runCoordinator).not.toHaveBeenCalled();
    expect(mocks.runBoundedRetry).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderr.text()).toContain(
      "--max-retries must be a positive integer",
    );
  });

  it("does not run the pipeline and exits 0 when approval is rejected", async () => {
    mocks.runCoordinator.mockResolvedValue(buildCoordinatorResult());
    mocks.requestApproval.mockResolvedValue(approval("rejected"));

    await createProgram().parseAsync([
      "node",
      "repomedic",
      "triage",
      REPO_ROOT,
    ]);

    expect(mocks.runBoundedRetry).not.toHaveBeenCalled();
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(
      true,
    );
  });
});
