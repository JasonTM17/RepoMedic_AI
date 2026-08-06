import type { ModelAdapter, Message } from "../../model/model-adapter.js";
import type {
  RepositoryTarget,
  DiagnosisIssue,
} from "../../domain/entities.js";
import { diagnosisIssueSchema } from "../../schemas/index.js";
import { readFileTool } from "../../tools/repo/read-file-tool.js";
import { listDirTool } from "../../tools/repo/list-dir-tool.js";
import { gitLogTool } from "../../tools/repo/git-log-tool.js";
import { gitDiffTool } from "../../tools/repo/git-diff-tool.js";
import { grepTool } from "../../tools/repo/grep-tool.js";

export interface ExplorerAgentOptions {
  model: ModelAdapter;
  target: RepositoryTarget;
  issueDescription: string;
  allowlist: readonly string[];
  maxIterations?: number | undefined; // default 10
}

export interface ExplorerAgentResult {
  issues: DiagnosisIssue[];
  iterations: number;
  stopped: "max-iterations" | "done" | "error";
  error?: string;
}

/**
 * Agentic loop: sends context to model, model responds with tool calls or DONE.
 * Uses only read-only tools. Produces DiagnosisIssue[].
 *
 * Protocol (simple text-based, not function calling):
 * - We send the model context about the repo and ask it to diagnose
 * - Model responds with either:
 *   a) JSON array of DiagnosisIssue (when it has enough info) prefixed with "DIAGNOSIS:"
 *   b) Tool request: "TOOL:listDir:{path}" | "TOOL:readFile:{path}" | "TOOL:gitLog:" | "TOOL:gitDiff:" | "TOOL:grep:{pattern}"
 *   c) "DONE" to signal completion with no issues
 */
export async function runExplorerAgent(
  options: ExplorerAgentOptions,
): Promise<ExplorerAgentResult> {
  const {
    model,
    target,
    issueDescription,
    allowlist,
    maxIterations = 10,
  } = options;

  const messages: Message[] = [
    {
      role: "system",
      content: `You are a repository explorer agent. Your job is to explore a local git repository and identify bugs or issues.\n
You can use these tools by responding with exact format:\n
- TOOL:listDir:{relative_path} - list directory contents\n
- TOOL:readFile:{relative_path} - read a file\n
- TOOL:gitLog: - view recent git log\n
- TOOL:gitDiff: - view recent diff\n
- TOOL:grep:{pattern} - search for pattern\n
When you have enough information, respond with:\nDIAGNOSIS:[{"id":"issue-1","severity":"high","confidence":0.9,"description":"...","evidence":["..."],"relatedFiles":["..."]}]\n
Or DONE if no issues found.`,
    },
    {
      role: "user",
      content: `Repository root: ${target.rootPath}\nBranch: ${target.branch ?? "unknown"}\nIssue to investigate: ${issueDescription}\n\nStart by listing the root directory.`,
    },
  ];

  let iterations = 0;
  const issues: DiagnosisIssue[] = [];

  while (iterations < maxIterations) {
    iterations++;
    let response: string;
    try {
      response = await model.complete(messages);
    } catch (err) {
      return {
        issues,
        iterations,
        stopped: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    messages.push({ role: "assistant", content: response });

    // Check for DIAGNOSIS
    if (response.includes("DIAGNOSIS:")) {
      const jsonMatch = response.match(/DIAGNOSIS:(\[.*\])/s);
      if (jsonMatch?.[1]) {
        try {
          const raw = JSON.parse(jsonMatch[1]) as unknown[];
          for (const item of raw) {
            const parsed = diagnosisIssueSchema.safeParse(item);
            if (parsed.success) issues.push(parsed.data);
          }
        } catch {
          /* ignore parse errors */
        }
      }
      return { issues, iterations, stopped: "done" };
    }

    // Check for DONE
    if (response.trim() === "DONE" || response.includes("DONE")) {
      return { issues, iterations, stopped: "done" };
    }

    // Handle tool calls
    let toolResult = "Tool not recognized.";
    const trimmed = response.trim();

    if (trimmed.startsWith("TOOL:listDir:")) {
      const path = trimmed.slice("TOOL:listDir:".length).trim() || ".";
      const r = await listDirTool({ root: target.rootPath, allowlist, path });
      toolResult = r.success ? JSON.stringify(r.data) : `Error: ${r.error}`;
    } else if (trimmed.startsWith("TOOL:readFile:")) {
      const path = trimmed.slice("TOOL:readFile:".length).trim();
      const r = await readFileTool({ root: target.rootPath, allowlist, path });
      toolResult = r.success ? (r.data?.content ?? "") : `Error: ${r.error}`;
    } else if (trimmed.startsWith("TOOL:gitLog:")) {
      const r = await gitLogTool({ root: target.rootPath });
      toolResult = r.success ? (r.data?.log ?? "") : `Error: ${r.error}`;
    } else if (trimmed.startsWith("TOOL:gitDiff:")) {
      const r = await gitDiffTool({ root: target.rootPath });
      toolResult = r.success ? (r.data?.diff ?? "") : `Error: ${r.error}`;
    } else if (trimmed.startsWith("TOOL:grep:")) {
      const pattern = trimmed.slice("TOOL:grep:".length).trim();
      const r = await grepTool({ root: target.rootPath, pattern });
      toolResult = r.success
        ? JSON.stringify(r.data?.matches ?? [])
        : `Error: ${r.error}`;
    }

    messages.push({ role: "user", content: `Tool result: ${toolResult}` });
  }

  return { issues, iterations, stopped: "max-iterations" };
}
