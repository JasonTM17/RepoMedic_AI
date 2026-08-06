import { describe, it, expect } from "vitest";
import { createPatchFromDiff } from "../src/tools/patch/create-patch-tool.js";
import { applyPatchTool } from "../src/tools/patch/apply-patch-tool.js";
import { revertPatchTool } from "../src/tools/patch/revert-patch-tool.js";
import { patchOk, patchFail } from "../src/tools/patch/patch-result.js";

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
  });

  describe("revertPatchTool", () => {
    it("returns success for empty paths", async () => {
      const result = await revertPatchTool({ root: "/mock/root", paths: [] });
      expect(result.success).toBe(true);
      expect(result.message).toBe("nothing to revert");
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
