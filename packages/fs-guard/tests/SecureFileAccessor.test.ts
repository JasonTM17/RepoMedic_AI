import type { PathAllowlistPolicy } from "@repomedic/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SecureFileAccessor } from "../src/SecureFileAccessor.js";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock PathAllowlistPolicy
class MockPolicy {
  constructor(private allowedPaths?: string[]) {}
  validatePath(relativePath: string) {
    if (
      this.allowedPaths &&
      !this.allowedPaths.includes(relativePath) &&
      !this.allowedPaths.includes("*")
    ) {
      return { valid: false, reason: "Not in allowlist" };
    }
    // Block secrets just as an example
    if (relativePath.includes(".env") || relativePath.includes(".git")) {
      return { valid: false, reason: "Denied path" };
    }
    return { valid: true };
  }
}

describe("SecureFileAccessor", () => {
  let tmpDir: string;
  let rootDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-guard-test-"));
    rootDir = path.join(tmpDir, "repo");
    outsideDir = path.join(tmpDir, "outside");

    await fs.mkdir(rootDir);
    await fs.mkdir(outsideDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should read a valid file", async () => {
    const testFile = path.join(rootDir, "test.txt");
    await fs.writeFile(testFile, "hello");

    const policy = new MockPolicy(["*"]);
    const accessor = new SecureFileAccessor(rootDir, policy as unknown as PathAllowlistPolicy);

    const content = await accessor.readFile("test.txt");
    expect(content).toBe("hello");
  });

  it("should write a valid file", async () => {
    const policy = new MockPolicy(["*"]);
    const accessor = new SecureFileAccessor(rootDir, policy as unknown as PathAllowlistPolicy);

    await accessor.writeFile("out.txt", "world");

    const content = await fs.readFile(path.join(rootDir, "out.txt"), "utf-8");
    expect(content).toBe("world");
  });

  it("should block path traversal outside root", async () => {
    const policy = new MockPolicy(["*"]);
    const accessor = new SecureFileAccessor(rootDir, policy as unknown as PathAllowlistPolicy);

    await expect(accessor.readFile("../outside/test.txt")).rejects.toThrow(
      /Path traversal attempt detected|escapes repository root/,
    );
  });

  it("should block symlink escaping root", async () => {
    const outsideFile = path.join(outsideDir, "secret.txt");
    await fs.writeFile(outsideFile, "secret content");

    const symlinkPath = path.join(rootDir, "link.txt");
    // Windows symlinks might need admin rights, but junctions or file symlinks often work if developer mode is on.
    try {
      await fs.symlink(outsideFile, symlinkPath, "file");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "EPERM") {
        // Skip on windows if no permission to create symlink
        return;
      }
      throw e;
    }

    const policy = new MockPolicy(["*"]);
    const accessor = new SecureFileAccessor(rootDir, policy as unknown as PathAllowlistPolicy);

    await expect(accessor.readFile("link.txt")).rejects.toThrow(
      /escapes repository root/,
    );
  });

  it("should block access to denied paths by policy", async () => {
    const envFile = path.join(rootDir, ".env");
    await fs.writeFile(envFile, "SECRET=1");

    const policy = new MockPolicy(["*"]);
    const accessor = new SecureFileAccessor(rootDir, policy as unknown as PathAllowlistPolicy);

    await expect(accessor.readFile(".env")).rejects.toThrow(
      /Path denied by policy/,
    );
  });

  it("should handle writing to a non-existent file", async () => {
    const policy = new MockPolicy(["*"]);
    const accessor = new SecureFileAccessor(rootDir, policy as unknown as PathAllowlistPolicy);

    await expect(
      accessor.writeFile("new-dir/file.txt", "test"),
    ).rejects.toThrow(/ENOENT|no such file/);
    // Wait, the directory does not exist! It should either fail or we need to mkdtemp it.
    // The test is just checking resolve doesn"t break.
  });
});



