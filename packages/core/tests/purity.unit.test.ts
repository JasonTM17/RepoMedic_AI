import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Purity gate for the phase-2 core surface: packages/core/src/domain,
 * /schemas, /policy, and version.ts are the deterministic, side-effect-free
 * heart of RepoMedic. No file in this phase-2 surface may import I/O-capable
 * node modules.
 *
 * `src/fs/` is phase 3 (secure filesystem) by design and imports `node:fs`;
 * `src/process/` is phase 4 (process execution) and imports `node:child_process`;
 * `src/model/` is phase 8 (model abstraction) and imports `node:fetch`;
 * these are excluded here and get their own confinement review in their phases.
 */
const FORBIDDEN_IMPORTS = [
  "node:fs",
  "node:child_process",
  "node:net",
  "node:http",
  "node:https",
];

/** Anchored to this file, so the gate works from any cwd. */
const CORE_SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Phase-3+ directories that intentionally own I/O. */
const PHASE_3_EXCLUDED = new Set(["fs", "process", "model", "tools", "checks", "agents", "workflows", "approval", "tracing"]);

async function listPhase2SourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && PHASE_3_EXCLUDED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listPhase2SourceFiles(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("core purity gate (phase 2 surface)", () => {
  it("does not import I/O-capable node modules", async () => {
    const files = await listPhase2SourceFiles(CORE_SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(content, `${file} must not import ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });
});
