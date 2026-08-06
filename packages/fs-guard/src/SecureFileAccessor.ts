import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
import * as path from "node:path";
import type { PathAllowlistPolicy } from "@repomedic/core";

export class SecureFileAccessor {
  private readonly root: string;

  constructor(
    root: string,
    private readonly policy: PathAllowlistPolicy,
  ) {
    // Ensure root is an absolute, normalized path without trailing slashes
    this.root = path.normalize(path.resolve(root));
  }

  /**
   * Resolves a relative path to an absolute path, following symlinks.
   * Ensures the resulting path is within the repository root.
   * @param relativePath The path relative to the root.
   * @returns The resolved, safe absolute path.
   */
  private async resolveAndValidate(relativePath: string): Promise<string> {
    // Basic structural check (e.g., no ".." to escape before we even resolve)
    const normalizedRelative = path.normalize(relativePath);
    if (
      normalizedRelative.startsWith(`..${path.sep}`) ||
      normalizedRelative === ".."
    ) {
      throw new Error(`Path traversal attempt detected: ${relativePath}`);
    }

    const initialAbsolutePath = path.join(this.root, relativePath);

    // We must use fs.realpath to resolve symlinks.
    // If the file does not exist, fs.realpath will throw.
    // We need to resolve the closest existing parent directory.
    let resolvedPath = "";
    try {
      resolvedPath = await fs.realpath(initialAbsolutePath);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        // Find the closest existing parent
        let current = initialAbsolutePath;
        let nonExistentPart = "";
        while (current !== this.root) {
          const parent = path.dirname(current);
          if (parent === current) {
            break; // Root of filesystem reached
          }
          const base = path.basename(current);
          nonExistentPart = nonExistentPart
            ? path.join(base, nonExistentPart)
            : base;
          current = parent;
          try {
            const parentResolved = await fs.realpath(current);
            resolvedPath = path.join(parentResolved, nonExistentPart);
            break;
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
              throw err;
            }
          }
        }
        if (!resolvedPath) {
          // If we reached here, even the repo root does not exist, or we went outside.
          throw new Error(`Could not resolve path safely: ${relativePath}`);
        }
      } else {
        throw e;
      }
    }

    // Now verify the resolved path is within the repo root
    if (
      !resolvedPath.startsWith(this.root + path.sep) &&
      resolvedPath !== this.root
    ) {
      throw new Error(`Path escapes repository root: ${relativePath}`);
    }

    // Convert back to relative path to re-validate against policy
    const resolvedRelative = path
      .relative(this.root, resolvedPath)
      .replace(/\\/g, "/");

    // Check against policy
    const decision = this.policy.validate(resolvedRelative);
    if (!decision.allowed) {
      throw new Error(
        `Path denied by policy: ${resolvedRelative} - ${decision.reason || "No reason provided"}`,
      );
    }

    return resolvedPath;
  }

  public async readFile(
    relativePath: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<string> {
    const safePath = await this.resolveAndValidate(relativePath);
    return fs.readFile(safePath, { encoding });
  }

  public async writeFile(
    relativePath: string,
    content: string | Buffer,
  ): Promise<void> {
    const safePath = await this.resolveAndValidate(relativePath);
    await fs.writeFile(safePath, content);
  }

  public async listFiles(directoryRelativePath: string): Promise<string[]> {
    const safePath = await this.resolveAndValidate(directoryRelativePath);
    const entries = await fs.readdir(safePath);
    return entries;
  }

  public async statFile(relativePath: string): Promise<Stats> {
    const safePath = await this.resolveAndValidate(relativePath);
    return fs.stat(safePath);
  }
}



