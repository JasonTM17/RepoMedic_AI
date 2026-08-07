/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, it, expect, vi } from "vitest";
import { runPatchAuthorAgent } from "../src/agents/patcher/patch-author-agent.js";
import { FakeModelAdapter } from "../src/model/fake-model.js";
import type { PatchProposal } from "../src/domain/entities.js";
import * as applyPatchToolMod from "../src/tools/patch/apply-patch-tool.js";
import { patchOk } from "../src/tools/patch/patch-result.js";

describe("Patch Author Agent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when approved=false", async () => {
    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter([]),
      proposal: {} as any,
      issues: [],
      approved: false,
      allowlist: ["."],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Patch not approved");
  });

  it("returns success when model responds DONE immediately", async () => {
    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter(["DONE"]),
      proposal: { operations: [] } as any,
      issues: [],
      approved: true,
      allowlist: ["."],
    });
    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.appliedOperations).toHaveLength(0);
  });

  it("returns success when model responds PATCH: with valid diff", async () => {
    vi.spyOn(applyPatchToolMod, "applyPatchTool").mockResolvedValue(
      patchOk("ok"),
    );
    const proposal: PatchProposal = {
      id: "p1",
      target: { rootPath: "d:/RepoMedic_AI" },
      operations: [{ id: "op1", path: "file.txt", kind: "modify" }],
      status: "draft",
      humanApprovalRequired: true,
    };

    const diff = `PATCH:
--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-old
+new
`;
    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter([diff]),
      proposal,
      issues: [],
      approved: true,
      allowlist: ["."],
    });
    expect(result.success).toBe(true);
    expect((result as any).appliedOperations.length).toBe(1);
    expect((result as any).appliedOperations[0]?.path).toBe("file.txt");
  });

  it("stops at maxIterations if model keeps returning unrecognized", async () => {
    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter(["WHAT", "IS", "THIS"]),
      proposal: { operations: [] } as any,
      issues: [],
      approved: true,
      allowlist: ["."],
      maxIterations: 3,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Max iterations reached without completing");
    expect(result.iterations).toBe(3);
  });

  it("rejects a model operation with an unapproved kind", async () => {
    const applySpy = vi
      .spyOn(applyPatchToolMod, "applyPatchTool")
      .mockResolvedValue(patchOk("ok"));
    const proposal: PatchProposal = {
      id: "p1",
      target: { rootPath: "d:/RepoMedic_AI" },
      operations: [{ id: "op1", path: "file.txt", kind: "modify" }],
      status: "draft",
      humanApprovalRequired: true,
    };

    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter([
        `PATCH:\n--- /dev/null\n+++ b/file.txt\n@@ -0,0 +1,1 @@\n+new\n`,
      ]),
      proposal,
      issues: [],
      approved: true,
      allowlist: ["."],
      maxIterations: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Max iterations reached without completing");
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("rejects a model operation outside the approved paths", async () => {
    const applySpy = vi
      .spyOn(applyPatchToolMod, "applyPatchTool")
      .mockResolvedValue(patchOk("ok"));

    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter([
        `PATCH:\n--- a/other.txt\n+++ b/other.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n`,
      ]),
      proposal: {
        id: "p1",
        target: { rootPath: "d:/RepoMedic_AI" },
        operations: [{ id: "op1", path: "file.txt", kind: "modify" }],
        status: "draft",
        humanApprovalRequired: true,
      },
      issues: [],
      approved: true,
      allowlist: ["."],
      maxIterations: 1,
    });

    expect(result.success).toBe(false);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("rejects a patch that applies only a subset of the proposal", async () => {
    const applySpy = vi
      .spyOn(applyPatchToolMod, "applyPatchTool")
      .mockResolvedValue(patchOk("ok"));

    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter([
        `PATCH:\n--- a/one.txt\n+++ b/one.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n`,
      ]),
      proposal: {
        id: "p1",
        target: { rootPath: "d:/RepoMedic_AI" },
        operations: [
          { id: "op-1", path: "one.txt", kind: "modify" },
          { id: "op-2", path: "two.txt", kind: "modify" },
        ],
        status: "draft",
        humanApprovalRequired: true,
      },
      issues: [],
      approved: true,
      allowlist: ["."],
      maxIterations: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Max iterations reached without completing");
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("rejects rename and chmod proposals until exact operation support exists", async () => {
    const result = await runPatchAuthorAgent({
      model: new FakeModelAdapter([]),
      proposal: {
        id: "p1",
        target: { rootPath: "d:/RepoMedic_AI" },
        operations: [
          { id: "op-1", path: "run.sh", kind: "chmod", mode: 0o755 },
        ],
        status: "draft",
        humanApprovalRequired: true,
      },
      issues: [],
      approved: true,
      allowlist: ["."],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("only create, modify, and delete");
  });
});
