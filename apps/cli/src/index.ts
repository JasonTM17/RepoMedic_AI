import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

interface TriageOptions {
  dryRun: boolean;
  model: string;
  allowlist: string;
  maxRetries: string;
  issue: string;
}

/** Parses a CLI flag value as a strictly positive integer, or throws. */
function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer, got: "${value}"`);
  }
  return parsed;
}

export function createProgram(): Command {
  const program = new Command()
    .name("repomedic")
    .description("Local-first AI bug triage and guarded patch assistant")
    .version("0.1.0");

  program
    .command("doctor")
    .description("Validate the local RepoMedic runtime")
    .action(() => {
      process.stdout.write("RepoMedic runtime is available.\n");
    });

  program
    .command("triage <repo-path>")
    .description(
      "Triage a local git repository for bugs and optionally apply patches",
    )
    .option("--dry-run", "Plan only — do not apply any patches", false)
    .option("--model <backend>", "Model backend: fake or openai", "fake")
    .option(
      "--allowlist <paths>",
      "Comma-separated path allowlist (relative to repo root)",
      ".",
    )
    .option("--max-retries <n>", "Maximum patch retry attempts", "3")
    .option(
      "--issue <description>",
      "Issue description to investigate",
      "Investigate and fix all bugs",
    )
    .action(async (repoPath: string, options: TriageOptions) => {
      let maxRetries: number;
      try {
        maxRetries = parsePositiveInteger(options.maxRetries, "--max-retries");
      } catch (err) {
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
        return;
      }

      const root = resolve(repoPath);
      const allowlist = options.allowlist.split(",").map((p) => p.trim());
      const backend = options.model === "openai" ? "openai" : "fake";

      process.stdout.write(`RepoMedic triage starting...\n`);
      process.stdout.write(`Repository: ${root}\n`);
      process.stdout.write(
        `Model: ${backend}${options.dryRun ? " (dry-run)" : ""}\n`,
      );

      // Dynamically import core (keeps the CLI usable from a pre-built core)
      const {
        createModelAdapter,
        runCoordinator,
        ApprovalCheckpoint,
        runBoundedRetry,
      } = await import("@jasonTM17/core");

      const model = createModelAdapter({
        backend,
        responses: backend === "fake" ? ["DONE"] : [],
      });

      const target = { rootPath: root };

      process.stdout.write("Running repository explorer...\n");
      const coordResult = await runCoordinator({
        model,
        target,
        issueDescription: options.issue,
        allowlist,
      });

      process.stdout.write(
        `\nDiagnosis complete. Found ${coordResult.issues.length} issue(s).\n`,
      );

      for (const issue of coordResult.issues) {
        process.stdout.write(`  [${issue.severity}] ${issue.description}\n`);
      }

      if (coordResult.issues.length === 0 || options.dryRun) {
        if (options.dryRun)
          process.stdout.write("\nDry-run mode: no patches applied.\n");
        else
          process.stdout.write(
            "\nNo issues found. Repository looks healthy.\n",
          );
        return;
      }

      if (!coordResult.proposal) {
        process.stdout.write("\nNo patch proposal generated.\n");
        return;
      }

      // Human approval
      const checkpoint = new ApprovalCheckpoint();
      const approval = await checkpoint.requestApproval(coordResult.proposal);

      if (approval.decision !== "approved") {
        process.stdout.write(
          `\nApproval ${approval.decision}. No changes made.\n`,
        );
        return;
      }

      process.stdout.write(
        `\nApproved. Applying patch (up to ${maxRetries} attempt(s))...\n`,
      );

      let retryResult;
      try {
        retryResult = await runBoundedRetry({
          model,
          proposal: coordResult.proposal,
          issues: coordResult.issues,
          approved: true,
          root,
          maxRetries,
        });
      } catch (err) {
        process.stderr.write(
          `\nPatch pipeline crashed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
        return;
      }

      if (retryResult.finalStatus === "applied") {
        process.stdout.write(
          `\nPatch applied successfully after ${retryResult.attempts} attempt(s).\n${retryResult.summary}\n`,
        );
        return;
      }

      process.stderr.write(
        `\nPatch ${retryResult.finalStatus} after ${retryResult.attempts} attempt(s).\n${retryResult.summary}\n`,
      );
      process.exitCode = 1;
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  await createProgram().parseAsync(argv);
}

const entrypoint = process.argv[1];
const isDirectExecution =
  entrypoint !== undefined &&
  resolve(entrypoint) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void runCli(process.argv);
}
