import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";
import { createPatchFromDiff } from "../src/tools/patch/create-patch-tool.js";
import { applyPatchTool } from "../src/tools/patch/apply-patch-tool.js";
import { revertPatchTool } from "../src/tools/patch/revert-patch-tool.js";
import { patchOk, patchFail } from "../src/tools/patch/patch-result.js";

const execFile = promisify(execFileCallback);

describe("Patch Tools", () => {
  describe("createPatchFromDiff", () => {
    it("returns 0 operations for empty string", () => {
      const result = createPatchFromDiff({ diffText: "" });
      expect(result.success).toBe(true);
      expect(result.operations?.length).toBe(0);
    });

    it("parses simple unified diff header into 1 operation", () => {
      const diffText = `--- a/file.txt\t\n+++ b/file.txt\t\n@@ -1,1 +1,1 @@\n-old\n+new`;
      const result = createPatchFromDiff({ diffText });
      expect(result.success).toBe(true);
      expect(result.operations!.length).toBe(1);
      expect(result.operations![0]!.path).toBe("file.txt");
      expect(result.operations![0]!.kind).toBe("modify");
    });

    it("retains delete hunks so the operation can be reversed exactly", () => {
      const result = createPatchFromDiff({
        diffText: "--- a/file.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-old",
      });
      expect(result.operations).toHaveLength(1);
      expect(result.operations?.[0]?.kind).toBe("delete");
      expect(result.operations?.[0]?.hunks).toHaveLength(1);
    });
  });

  describe("applyPatchTool", () => {
    it("returns patchFail when approved=false (policy blocks it)", async () => {
      const result = await applyPatchTool({
        root: "/mock/root",
        allowlist: ["file.txt"],
        approved: false,
        proposal: {
          id: "test-prop",
          target: { rootPath: "/mock/root" },
          status: "ready",
          humanApprovalRequired: true,
          operations: [{ id: "op-1", path: "file.txt", kind: "modify" }],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Policy blocked operation on file.txt");
    });

    it("rejects operations without exact diff hunks", async () => {
      const result = await applyPatchTool({
        root: "/mock/root",
        allowlist: ["file.txt"],
        approved: true,
        proposal: {
          id: "test-prop",
          target: { rootPath: "/mock/root" },
          status: "ready",
          humanApprovalRequired: true,
          operations: [{ id: "op-1", path: "file.txt", kind: "modify" }],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("exact diff hunks");
    });

    it("rejects rename and chmod operations instead of treating them as content patches", async () => {
      const result = await applyPatchTool({
        root: "/mock/root",
        allowlist: ["run.sh"],
        approved: true,
        proposal: {
          id: "test-prop",
          target: { rootPath: "/mock/root" },
          status: "ready",
          humanApprovalRequired: true,
          operations: [
            {
              id: "op-1",
              path: "run.sh",
              kind: "chmod",
              mode: 0o755,
              hunks: ["@@"],
            },
          ],
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("unsupported non-content operations");
    });
  });

  describe("revertPatchTool", () => {
    it("returns success for empty paths", async () => {
      const result = await revertPatchTool({ root: "/mock/root", paths: [] });
      expect(result.success).toBe(true);
      expect(result.message).toBe("nothing to revert");
    });

    it("rejects path-only reverts instead of restoring HEAD over dirty work", async () => {
      const result = await revertPatchTool({
        root: "/mock/root",
        paths: ["file.txt"],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("exact applied patch operations");
    });

    it("reverses the exact patch while preserving unrelated dirty work", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "repomedic-patch-"));
      try {
        await fs.writeFile(path.join(root, "file.txt"), "old\n", "utf8");
        await fs.writeFile(path.join(root, "other.txt"), "original\n", "utf8");
        await execFile("git", ["init", "--quiet"], { cwd: root });
        await execFile("git", ["config", "user.email", "test@example.com"], {
          cwd: root,
        });
        await execFile("git", ["config", "user.name", "RepoMedic Test"], {
          cwd: root,
        });
        await execFile("git", ["add", "file.txt", "other.txt"], { cwd: root });
        await execFile("git", ["commit", "--quiet", "-m", "initial"], {
          cwd: root,
        });
        await fs.writeFile(path.join(root, "other.txt"), "dirty\n", "utf8");

        const parsed = createPatchFromDiff({
          diffText:
            "--- a/file.txt\n+++ b/file.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        });
        const operation = parsed.operations?.[0];
        if (!operation) throw new Error("Expected a parsed patch operation");
        const proposal = {
          id: "patch-1",
          target: { rootPath: root },
          operations: [operation],
          status: "draft" as const,
          humanApprovalRequired: true,
        };

        const applied = await applyPatchTool({
          root,
          allowlist: ["file.txt"],
          proposal,
          approved: true,
        });
        expect(applied.success).toBe(true);
        expect(
          (await fs.readFile(path.join(root, "file.txt"), "utf8")).replace(
            /\r\n/g,
            "\n",
          ),
        ).toBe("new\n");

        const reverted = await revertPatchTool({
          root,
          operations: [operation],
        });
        expect(reverted.success).toBe(true);
        expect(
          (await fs.readFile(path.join(root, "file.txt"), "utf8")).replace(
            /\r\n/g,
            "\n",
          ),
        ).toBe("old\n");
        expect(
          (await fs.readFile(path.join(root, "other.txt"), "utf8")).replace(
            /\r\n/g,
            "\n",
          ),
        ).toBe("dirty\n");
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });

    it("applies and reverses create and delete hunks exactly", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "repomedic-patch-"));
      try {
        await fs.writeFile(path.join(root, "gone.txt"), "gone\n", "utf8");
        await execFile("git", ["init", "--quiet"], { cwd: root });
        await execFile("git", ["config", "user.email", "test@example.com"], {
          cwd: root,
        });
        await execFile("git", ["config", "user.name", "RepoMedic Test"], {
          cwd: root,
        });
        await fs.writeFile(path.join(root, "other.txt"), "other\n", "utf8");
        await execFile("git", ["add", "gone.txt", "other.txt"], {
          cwd: root,
        });
        await execFile("git", ["commit", "--quiet", "-m", "initial"], {
          cwd: root,
        });

        const conflicting = createPatchFromDiff({
          diffText:
            "--- a/gone.txt\n+++ b/gone.txt\n@@ -1,1 +1,1 @@\n-gone\n+changed\n--- a/other.txt\n+++ b/other.txt\n@@ -1,1 +1,1 @@\n-not-present\n+changed\n",
        });
        const checked = await applyPatchTool({
          root,
          allowlist: ["gone.txt", "other.txt"],
          proposal: {
            id: "conflict-1",
            target: { rootPath: root },
            operations: conflicting.operations ?? [],
            status: "draft",
            humanApprovalRequired: true,
          },
          approved: true,
        });
        expect(checked.success).toBe(false);
        expect(checked.error).toContain("git apply check failed");
        expect(await fs.readFile(path.join(root, "gone.txt"), "utf8")).toBe(
          "gone\n",
        );
        expect(await fs.readFile(path.join(root, "other.txt"), "utf8")).toBe(
          "other\n",
        );

        const create = createPatchFromDiff({
          diffText: "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,1 @@\n+created\n",
        });
        const createOperation = create.operations?.[0];
        if (!createOperation)
          throw new Error("Expected a parsed create operation");

        const appliedCreate = await applyPatchTool({
          root,
          allowlist: ["new.txt"],
          proposal: {
            id: "create-1",
            target: { rootPath: root },
            operations: [createOperation],
            status: "draft",
            humanApprovalRequired: true,
          },
          approved: true,
        });
        expect(appliedCreate.success).toBe(true);
        expect(
          (await fs.readFile(path.join(root, "new.txt"), "utf8")).replace(
            /\r\n/g,
            "\n",
          ),
        ).toBe("created\n");

        const revertedCreate = await revertPatchTool({
          root,
          operations: [createOperation],
        });
        expect(revertedCreate.success).toBe(true);
        await expect(fs.access(path.join(root, "new.txt"))).rejects.toThrow();

        const remove = createPatchFromDiff({
          diffText: "--- a/gone.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-gone",
        });
        const deleteOperation = remove.operations?.[0];
        if (!deleteOperation)
          throw new Error("Expected a parsed delete operation");

        const appliedDelete = await applyPatchTool({
          root,
          allowlist: ["gone.txt"],
          proposal: {
            id: "delete-1",
            target: { rootPath: root },
            operations: [deleteOperation],
            status: "draft",
            humanApprovalRequired: true,
          },
          approved: true,
        });
        expect(appliedDelete.success).toBe(true);
        await expect(fs.access(path.join(root, "gone.txt"))).rejects.toThrow();

        const revertedDelete = await revertPatchTool({
          root,
          operations: [deleteOperation],
        });
        expect(revertedDelete.success).toBe(true);
        expect(
          (await fs.readFile(path.join(root, "gone.txt"), "utf8")).replace(
            /\r\n/g,
            "\n",
          ),
        ).toBe("gone\n");
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("PatchResult helpers", () => {
    it("patchOk", () => {
      expect(patchOk("ok")).toEqual({ success: true, message: "ok" });
    });
    it("patchFail", () => {
      expect(patchFail("err")).toEqual({
        success: false,
        message: "failed",
        error: "err",
      });
    });
  });
});
