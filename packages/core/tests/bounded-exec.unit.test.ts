import { describe, it, expect } from "vitest";
import { boundedExec, CommandNotAllowedError } from "../src/process/index.js";

describe("boundedExec", () => {
  it("throws CommandNotAllowedError for disallowed command", async () => {
    await expect(
      boundedExec("curl", ["http://example.com"], { cwd: process.cwd() }),
    ).rejects.toThrow(CommandNotAllowedError);
  });

  it("throws Error for relative cwd", async () => {
    await expect(
      boundedExec("node", ["--version"], { cwd: "relative/path" }),
    ).rejects.toThrow(/cwd must be absolute/);
  });

  it("successfully runs node --version", async () => {
    const res = await boundedExec("node", ["--version"], {
      cwd: process.cwd(),
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("v");
    expect(res.stdout.trim().length).toBeGreaterThan(0);
    expect(res.timedOut).toBe(false);
  });

  it("returns non-zero exit code for failing command", async () => {
    const res = await boundedExec("node", ["-e", "process.exit(2)"], {
      cwd: process.cwd(),
    });
    expect(res.exitCode).toBe(2);
    expect(res.timedOut).toBe(false);
  });
});
