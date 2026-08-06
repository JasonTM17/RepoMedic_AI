import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runReviewerAgent } from "../src/agents/reviewer/reviewer-agent.js";
import { FakeModelAdapter } from "../src/model/fake-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

describe("Reviewer Agent", () => {
  it("returns passed=true when all checks pass", async () => {
    const result = await runReviewerAgent({
      model: new FakeModelAdapter([]),
      proposal: {
        id: "p1",
        target: { rootPath: repoRoot },
        operations: [],
        status: "draft",
        humanApprovalRequired: true,
      },
      root: repoRoot,
      checksToRun: [
        {
          name: "node-version",
          command: "node",
          args: ["--version"],
          timeoutMs: 5000,
        },
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
  });

  it("returns passed=false when a check fails", async () => {
    const result = await runReviewerAgent({
      model: new FakeModelAdapter([]),
      proposal: {
        id: "p1",
        target: { rootPath: repoRoot },
        operations: [],
        status: "draft",
        humanApprovalRequired: true,
      },
      root: repoRoot,
      checksToRun: [
        {
          name: "failing-check",
          command: "node",
          args: ["--eval", "process.exit(1)"],
          timeoutMs: 5000,
        },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain("failing-check");
  });
});
