/**
 * Security-focused tests for SecureFileSystem.
 * Verifies that symlink escapes and path injection attacks are blocked.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PathConfinementError, SecureFileSystem } from "../src/fs/index.js";

const REPO_ROOT = join(tmpdir(), "repomedic-security-repo");
const OUTSIDE_DIR = join(tmpdir(), "repomedic-security-outside");

beforeEach(async () => {
  await mkdir(join(REPO_ROOT, "src"), { recursive: true });
  await mkdir(OUTSIDE_DIR, { recursive: true });
  await writeFile(join(REPO_ROOT, "src", "safe.ts"), "// safe\n");
  await writeFile(join(OUTSIDE_DIR, "secret.txt"), "TOP_SECRET\n");
});

afterEach(async () => {
  await rm(REPO_ROOT, { recursive: true, force: true });
  await rm(OUTSIDE_DIR, { recursive: true, force: true });
});

describe("SecureFileSystem security — symlink escape", () => {
  it("blocks reading via symlink that escapes the root", async () => {
    const linkPath = join(REPO_ROOT, "src", "escape-link");
    try {
      await symlink(OUTSIDE_DIR, linkPath);
    } catch {
      return; // symlinks not supported in this environment — skip
    }
    const fs = new SecureFileSystem({
      root: REPO_ROOT.replaceAll("\\", "/"),
      allowlist: ["src"],
    });
    await expect(
      fs.readFile("src/escape-link/secret.txt"),
    ).rejects.toBeInstanceOf(PathConfinementError);
  });

  it("blocks listing via symlink that escapes the root", async () => {
    const linkPath = join(REPO_ROOT, "src", "escape-dir");
    try {
      await symlink(OUTSIDE_DIR, linkPath);
    } catch {
      return;
    }
    const fs = new SecureFileSystem({
      root: REPO_ROOT.replaceAll("\\", "/"),
      allowlist: ["src"],
    });
    await expect(fs.listDir("src/escape-dir")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });
});

describe("SecureFileSystem security — path injection", () => {
  it("rejects Windows drive-letter paths", async () => {
    const fs = new SecureFileSystem({
      root: REPO_ROOT.replaceAll("\\", "/"),
      allowlist: ["src"],
    });
    await expect(fs.readFile("C:/Windows/System32")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });

  it("rejects double-slash UNC paths", async () => {
    const fs = new SecureFileSystem({
      root: REPO_ROOT.replaceAll("\\", "/"),
      allowlist: ["src"],
    });
    await expect(fs.readFile("//server/share")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });

  it("rejects traversal paths", async () => {
    const fs = new SecureFileSystem({
      root: REPO_ROOT.replaceAll("\\", "/"),
      allowlist: ["src"],
    });
    await expect(fs.readFile("src/../../outside")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });

  it("rejects .git path components", async () => {
    const fs = new SecureFileSystem({
      root: REPO_ROOT.replaceAll("\\", "/"),
      allowlist: ["src", ".git"],
    });
    await expect(fs.readFile(".git/config")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });
});
