import { describe, it, expect } from "vitest";
import { runExplorerAgent } from "../src/agents/explorer/explorer-agent.js";
import { FakeModelAdapter } from "../src/model/fake-model.js";

describe("Explorer Agent", () => {
  it("returns DONE with 0 issues when model says DONE", async () => {
    const model = new FakeModelAdapter(["DONE"]);

    const result = await runExplorerAgent({
      model,
      target: { rootPath: "/" },
      issueDescription: "test",
      allowlist: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.stopped).toBe("done");
    expect(result.iterations).toBe(1);
  });

  it("returns issues when model responds with DIAGNOSIS:[...]", async () => {
    const issueJson = JSON.stringify([
      {
        id: "issue-1",
        severity: "high",
        confidence: 0.9,
        description: "Test issue",
        evidence: [],
        relatedFiles: [],
      },
    ]);
    const model = new FakeModelAdapter([`DIAGNOSIS:${issueJson}`]);

    const result = await runExplorerAgent({
      model,
      target: { rootPath: "/" },
      issueDescription: "test",
      allowlist: [],
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.id).toBe("issue-1");
    expect(result.stopped).toBe("done");
  });

  it("stops at maxIterations when model keeps returning TOOL calls", async () => {
    const model = new FakeModelAdapter([
      "TOOL:listDir:.",
      "TOOL:listDir:src",
      "TOOL:listDir:src/foo",
    ]);

    const result = await runExplorerAgent({
      model,
      target: { rootPath: "/" },
      issueDescription: "test",
      allowlist: [],
      maxIterations: 2,
    });

    expect(result.stopped).toBe("max-iterations");
    expect(result.iterations).toBe(2);
  });
});
