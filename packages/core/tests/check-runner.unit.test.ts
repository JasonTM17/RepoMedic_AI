import { describe, it, expect } from "vitest";
import { runChecks } from "../src/checks/check-runner.js";
import * as os from "node:os";

describe("Check Runner", () => {
  const tmp = os.tmpdir();

  it('runChecks with a fast passing command (node --version) returns status "passed"', async () => {
    const results = await runChecks(tmp, [
      { name: "test-pass", command: "node", args: ["--version"] },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("passed");
    expect(results[0]!.output).toContain("v");
  });

  it('runChecks with a failing command returns status "failed"', async () => {
    const results = await runChecks(tmp, [
      {
        name: "test-fail",
        command: "node",
        args: ["--eval", "process.exit(1)"],
      },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("failed");
  });

  it("runChecks returns array of CheckResult with correct shape", async () => {
    const results = await runChecks(tmp, [
      { name: "test-shape", command: "node", args: ["--version"] },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toMatch(/^check-test-shape-/);
    expect(results[0]!.checkName).toBe("test-shape");
    expect(results[0]!.status).toBe("passed");
    expect(typeof results[0]!.output).toBe("string");
    expect(typeof results[0]!.durationMs).toBe("number");
  });

  it("output is truncated at 8192 chars if over limit", async () => {
    const script = `console.log("a".repeat(10000))`;
    const results = await runChecks(tmp, [
      { name: "test-trunc", command: "node", args: ["--eval", script] },
    ]);
    expect(results[0]!.output!.length).toBeLessThanOrEqual(8192);
  });
});
