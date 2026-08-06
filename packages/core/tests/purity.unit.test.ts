import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Purity Gate", () => {
  it("core should not import node builtins", () => {
    // This is a naive AST-free check using regex on source files.
    // In a real codebase, a linter handles this, but a test was requested.
    const srcDir = path.join(__dirname, "../src");

    function walk(dir: string, files: string[] = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath, files);
        else if (entry.isFile() && fullPath.endsWith(".ts"))
          files.push(fullPath);
      }
      return files;
    }

    const tsFiles = walk(srcDir);
    const forbidden =
      /from\s+['"](fs|path|child_process|net|http|node:[^'"]+)['"]/g;

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const matches = [...content.matchAll(forbidden)];
      expect(
        matches,
        `File ${file} contains forbidden node imports`,
      ).toHaveLength(0);
    }
  });
});
