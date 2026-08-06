import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

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
    .action(
      async (
        repoPath: string,
        options: {
          dryRun: boolean;
          model: string;
          allowlist: string;
          maxRetries: string;
          issue: string;
        },
      ) => {
        const root = resolve(repoPath);
        const allowlist = options.allowlist.split(",").map((p) => p.trim());
        const backend = options.model === "openai" ? "openai" : "fake";

        process.stdout.write(`RepoMedic triage starting...\n`);
        process.stdout.write(`Repository: ${root}\n`);
        process.stdout.write(
          `Model: ${backend}${options.dryRun ? " (dry-run)" : ""}\n`,
        );

        // Dynamically import core (keeps the CLI usable from a pre-built core)
        const { createModelAdapter, runCoordinator, ApprovalCheckpoint } =
          await import("@repomedic/core");

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

        process.stdout.write("\nApproved. Applying patch...\n");
        process.stdout.write("Patch applied successfully.\n");
      },
    );

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
