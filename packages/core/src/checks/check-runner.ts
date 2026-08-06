import { boundedExec } from '../process/index.js';
import type { CheckResult } from '../domain/entities.js';

export interface CheckCommand {
  name: string;
  command: string;
  args: string[];
  timeoutMs?: number;
}

export const DEFAULT_CHECKS: CheckCommand[] = [
  { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'], timeoutMs: 60_000 },
  { name: 'test', command: 'npm', args: ['test'], timeoutMs: 120_000 },
  { name: 'lint', command: 'npm', args: ['run', 'lint'], timeoutMs: 30_000 },
];

export async function runChecks(
  root: string,
  commands: CheckCommand[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const cmd of commands) {
    const start = Date.now();
    try {
      const r = await boundedExec(cmd.command, cmd.args, {
        cwd: root,
        timeoutMs: cmd.timeoutMs ?? 30_000,
      });
      const durationMs = Date.now() - start;
      const passed = r.exitCode === 0 && !r.timedOut;
      results.push({
        id: `check-${cmd.name}-${Date.now()}`,
        checkName: cmd.name,
        status: r.timedOut ? 'failed' : (passed ? 'passed' : 'failed'),
        output: `${r.stdout}${r.stderr}`.slice(0, 8192), // 8KB cap
        durationMs,
      });
    } catch (err) {
      results.push({
        id: `check-${cmd.name}-${Date.now()}`,
        checkName: cmd.name,
        status: 'failed',
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
  }
  return results;
}
