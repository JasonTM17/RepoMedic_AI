import { spawn } from "node:child_process";
import path from "node:path";
import { realpath } from "node:fs/promises";

export interface CommandOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  allowedEnv?: Record<string, string | undefined>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
}

export class SecureCommandRunner {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
  }

  private async validateCwd(cwd: string): Promise<string> {
    const resolvedCwd = path.resolve(cwd);

    let realCwd: string;
    try {
      realCwd = await realpath(resolvedCwd);
    } catch {
      throw new Error(
        `Invalid cwd: ${cwd} does not exist or cannot be resolved`,
      );
    }

    const relativeCwd = path.relative(this.repoRoot, realCwd);
    if (
      relativeCwd === ".." ||
      relativeCwd.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeCwd)
    ) {
      throw new Error(
        `Invalid cwd: ${cwd} is outside the repository root ${this.repoRoot}`,
      );
    }
    return realCwd;
  }

  public async runCommand(
    executable: string,
    args: string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    const cwd = await this.validateCwd(options.cwd);
    const timeoutMs = options.timeoutMs ?? 30000;
    const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024; // 1MB default
    const allowedEnv = options.allowedEnv ?? { PATH: process.env.PATH };

    return new Promise((resolve, reject) => {
      let stdoutBuffer = Buffer.alloc(0);
      let stderrBuffer = Buffer.alloc(0);
      let truncated = false;
      let timer: NodeJS.Timeout | null = null;
      let isKilled = false;

      const child = spawn(executable, args, {
        cwd,
        env: allowedEnv,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const handleOutput = (data: Buffer, isStdout: boolean) => {
        let currentBuffer = isStdout ? stdoutBuffer : stderrBuffer;

        if (currentBuffer.length >= maxOutputBytes) {
          truncated = true;
          return;
        }

        const remainingSpace = maxOutputBytes - currentBuffer.length;
        if (data.length > remainingSpace) {
          truncated = true;
          const slicedData = data.subarray(0, remainingSpace);
          currentBuffer = Buffer.concat([currentBuffer, slicedData]);
        } else {
          currentBuffer = Buffer.concat([currentBuffer, data]);
        }

        if (isStdout) {
          stdoutBuffer = currentBuffer;
        } else {
          stderrBuffer = currentBuffer;
        }
      };

      if (child.stdout) {
        child.stdout.on("data", (data) => handleOutput(data, true));
      }
      if (child.stderr) {
        child.stderr.on("data", (data) => handleOutput(data, false));
      }

      const cleanupTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      child.on("error", (err) => {
        cleanupTimer();
        reject(err);
      });

      child.on("close", (code) => {
        cleanupTimer();
        if (!isKilled) {
          resolve({
            stdout: stdoutBuffer.toString("utf8"),
            stderr: stderrBuffer.toString("utf8"),
            exitCode: code,
            truncated,
          });
        }
      });

      // Timeout handling
      timer = setTimeout(() => {
        isKilled = true;
        child.kill("SIGTERM");

        // Follow up with SIGKILL if it doesn't terminate
        const killTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 1000);

        child.on("close", (code) => {
          clearTimeout(killTimer);
          resolve({
            stdout: stdoutBuffer.toString("utf8"),
            stderr: stderrBuffer.toString("utf8"),
            exitCode: code,
            truncated,
          });
        });
      }, timeoutMs);
    });
  }
}
