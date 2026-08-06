import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

export const ALLOWED_COMMANDS = [
  "git",
  "npm",
  "npx",
  "node",
  "tsc",
  "eslint",
  "vitest",
] as const;

export class CommandNotAllowedError extends Error {
  public readonly command: string;
  constructor(command: string) {
    super(`Command not allowed: ${command}`);
    this.name = "CommandNotAllowedError";
    this.command = command;
  }
}

export interface BoundedExecOptions {
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  maxOutputBytes?: number;
}

export interface BoundedExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export async function boundedExec(
  command: string,
  args: string[],
  options: BoundedExecOptions,
): Promise<BoundedExecResult> {
  if (!ALLOWED_COMMANDS.includes(command as any)) {
    throw new CommandNotAllowedError(command);
  }

  if (!isAbsolute(options.cwd)) {
    throw new Error(`cwd must be absolute: ${options.cwd}`);
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_048_576; // 1MB
  const env = options.env ?? {};

  return new Promise((resolve, reject) => {
    let timedOut = false;
    let truncated = false;
    let totalBytes = 0;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: env,
      shell: false,
    });

    const killProcess = () => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcess();
    }, timeoutMs);

    const processChunk = (chunk: Buffer | string, isStdout: boolean) => {
      if (truncated) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      const len = buf.length;

      if (totalBytes + len > maxOutputBytes) {
        truncated = true;
        const remaining = maxOutputBytes - totalBytes;
        if (remaining > 0) {
          const slice = buf.subarray(0, remaining);
          if (isStdout) stdoutChunks.push(slice);
          else stderrChunks.push(slice);
          totalBytes += remaining;
        }
      } else {
        if (isStdout) stdoutChunks.push(buf);
        else stderrChunks.push(buf);
        totalBytes += len;
      }
    };

    if (child.stdout) {
      child.stdout.on("data", (c) => processChunk(c, true));
    }

    if (child.stderr) {
      child.stderr.on("data", (c) => processChunk(c, false));
    }

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        timedOut,
        truncated,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: timedOut ? -1 : (code ?? -1),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        timedOut,
        truncated,
      });
    });
  });
}
