/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, it, expect, vi } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runBoundedRetry } from "../src/workflows/retry/bounded-retry.js";
import { FakeModelAdapter } from "../src/model/fake-model.js";
import type { PatchProposal } from "../src/domain/entities.js";
import * as revertPatchToolMod from "../src/tools/patch/revert-patch-tool.js";
import * as applyPatchToolMod from "../src/tools/patch/apply-patch-tool.js";
import { patchOk } from "../src/tools/patch/patch-result.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const immutablePatchDigest = "a".repeat(64);

function immutableModifyOperation() {
  return {
    id: "op-0",
    path: "file.txt",
    kind: "modify" as const,
    oldSha: "old",
    newSha: "new",
    hunks: ["@@ -1,1 +1,1 @@\n-old\n+new"],
  };
}

describe("Bounded Retry Workflow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns failed immediately when approved=false", async () => {
    const result = await runBoundedRetry({
      model: new FakeModelAdapter([]),
      proposal: {} as any,
      issues: [],
      approved: false,
      allowlist: ["."],
      root: repoRoot,
    });
    expect(result.success).toBe(false);
    expect(result.finalStatus).toBe("failed");
    expect(result.summary).toBe("Not approved");
  });

  it("returns a successful no-op when the author makes no changes", async () => {
    const proposal: PatchProposal = {
      id: "p1",
      target: { rootPath: repoRoot },
      operations: [],
      status: "draft",
      humanApprovalRequired: true,
    };

    const result = await runBoundedRetry({
      model: new FakeModelAdapter(["DONE"]),
      proposal,
      issues: [],
      approved: true,
      allowlist: ["."],
      root: repoRoot,
      checksToRun: [
        { name: "fast", command: "node", args: ["--version"], timeoutMs: 5000 },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.finalStatus).toBe("no-op");
  });

  it("rejects a non-empty proposal without immutable candidate metadata", async () => {
    const proposal: PatchProposal = {
      id: "p1",
      target: { rootPath: repoRoot },
      operations: [{ id: "op-0", path: "file.txt", kind: "modify" }],
      status: "draft",
      humanApprovalRequired: true,
    };

    const result = await runBoundedRetry({
      model: new FakeModelAdapter(["DONE"]),
      proposal,
      issues: [],
      approved: true,
      allowlist: ["file.txt"],
      root: repoRoot,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.finalStatus).toBe("failed");
    expect(result.summary).toContain("immutable candidate");
  });

  it("rejects an invalid retry bound before invoking the model", async () => {
    const result = await runBoundedRetry({
      model: new FakeModelAdapter([]),
      proposal: {
        id: "p1",
        target: { rootPath: repoRoot },
        operations: [],
        status: "draft",
        humanApprovalRequired: true,
      },
      issues: [],
      approved: true,
      allowlist: ["."],
      root: repoRoot,
      maxRetries: 0,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.finalStatus).toBe("failed");
    expect(result.summary).toContain("positive safe integer");
  });

  it("rejects a workflow root that differs from the proposal target", async () => {
    const result = await runBoundedRetry({
      model: new FakeModelAdapter([]),
      proposal: {
        id: "p1",
        target: { rootPath: path.join(repoRoot, "other") },
        operations: [],
        status: "draft",
        humanApprovalRequired: true,
      },
      issues: [],
      approved: true,
      allowlist: ["."],
      root: repoRoot,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.finalStatus).toBe("failed");
    expect(result.summary).toContain("must match");
  });

  it("returns applied on the first attempt when a patch is reviewed successfully", async () => {
    vi.spyOn(applyPatchToolMod, "applyPatchTool").mockResolvedValue(
      patchOk("applied"),
    );
    const proposal: PatchProposal = {
      id: "p1",
      target: { rootPath: repoRoot },
      operations: [immutableModifyOperation()],
      status: "draft",
      humanApprovalRequired: true,
      digest: immutablePatchDigest,
    };

    const result = await runBoundedRetry({
      model: new FakeModelAdapter(["DONE"]),
      proposal,
      issues: [],
      approved: true,
      allowlist: ["file.txt"],
      root: repoRoot,
      checksToRun: [
        { name: "fast", command: "node", args: ["--version"], timeoutMs: 5000 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.finalStatus).toBe("applied");
  });

  it("returns reverted after maxRetries when checks keep failing", async () => {
    vi.spyOn(applyPatchToolMod, "applyPatchTool").mockResolvedValue(
      patchOk("applied"),
    );
    vi.spyOn(revertPatchToolMod, "revertPatchTool").mockResolvedValue(
      patchOk("ok"),
    );
    const proposal: PatchProposal = {
      id: "p1",
      target: { rootPath: repoRoot },
      operations: [immutableModifyOperation()],
      status: "draft",
      humanApprovalRequired: true,
      digest: immutablePatchDigest,
    };

    const result = await runBoundedRetry({
      model: new FakeModelAdapter([]),
      proposal,
      issues: [],
      approved: true,
      allowlist: ["file.txt"],
      root: repoRoot,
      maxRetries: 2,
      checksToRun: [
        {
          name: "fail",
          command: "node",
          args: ["--eval", "process.exit(1)"],
          timeoutMs: 5000,
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.finalStatus).toBe("reverted");
    expect(result.summary).toContain(
      "new candidate requires a new human approval",
    );
  });
});
