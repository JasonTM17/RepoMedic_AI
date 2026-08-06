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
