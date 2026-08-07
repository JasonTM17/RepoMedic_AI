import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SecureCommandRunner } from "../../src/SecureCommandRunner.js";
import path from "node:path";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";

describe("SecureCommandRunner", () => {
  let tempRoot: string;
  let runner: SecureCommandRunner;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(tmpdir(), "repomedic-test-"));
    // We need to resolve the temp directory because on macOS/Windows temp dirs might be symlinks
    tempRoot = await fs.realpath(tempRoot);
    runner = new SecureCommandRunner(tempRoot);
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("should run a command successfully", async () => {
    const result = await runner.runCommand(
      "node",
      ["-e", 'console.log("hello")'],
      { cwd: tempRoot },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.truncated).toBe(false);
  });

  it("should reject execution outside repository root", async () => {
    let outsideDir = await fs.mkdtemp(
      path.join(tmpdir(), "repomedic-outside-"),
    );
    outsideDir = await fs.realpath(outsideDir);
    try {
      await expect(
        runner.runCommand("node", ["-v"], { cwd: outsideDir }),
      ).rejects.toThrow(/outside the repository root/);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("should reject a sibling path that only shares the root prefix", async () => {
    const siblingDir = `${tempRoot}-evil`;
    await fs.mkdir(siblingDir);
    try {
      await expect(
        runner.runCommand("node", ["-v"], { cwd: siblingDir }),
      ).rejects.toThrow(/outside the repository root/);
    } finally {
      await fs.rm(siblingDir, { recursive: true, force: true });
    }
  });

  it("should terminate process on timeout", async () => {
    // A command that sleeps for 10 seconds
    const start = Date.now();
    const result = await runner.runCommand(
      "node",
      ["-e", "setTimeout(() => {}, 10000)"],
      {
        cwd: tempRoot,
        timeoutMs: 100,
      },
    );
    const duration = Date.now() - start;

    // It should have been killed (exitCode null) and take roughly 100ms
    expect(result.exitCode).toBeNull();
    expect(duration).toBeLessThan(1000); // well before 10s
  });

  it("should truncate output exceeding maxOutputBytes", async () => {
    const code = `
      const buffer = Buffer.alloc(2000, 'a');
      process.stdout.write(buffer);
    `;
    const result = await runner.runCommand("node", ["-e", code], {
      cwd: tempRoot,
      maxOutputBytes: 1000,
    });

    expect(result.stdout.length).toBe(1000);
    expect(result.truncated).toBe(true);
  });

  it("should filter environment variables", async () => {
    const code = 'console.log(process.env.TEST_VAR || "empty")';
    const result = await runner.runCommand("node", ["-e", code], {
      cwd: tempRoot,
      allowedEnv: { PATH: process.env.PATH, TEST_VAR: "allowed" },
    });

    expect(result.stdout.trim()).toBe("allowed");

    // Without it explicitly allowed, it should not be present
    const result2 = await runner.runCommand("node", ["-e", code], {
      cwd: tempRoot,
      allowedEnv: { PATH: process.env.PATH },
    });
    expect(result2.stdout.trim()).toBe("empty");
  });

  it("should prevent shell injection", async () => {
    // If it were running in a shell, `echo hi && echo injected` would output both.
    // In spawn without shell, it treats the whole string as arguments to echo.
    const result = await runner.runCommand(
      "node",
      [
        "-e",
        'console.log(process.argv.slice(1).join(" "))',
        "hi",
        "&&",
        "echo",
        "injected",
      ],
      {
        cwd: tempRoot,
      },
    );

    // It should just print the arguments literally, not execute the second echo
    expect(result.stdout.trim()).toBe("hi && echo injected");
  });
});
