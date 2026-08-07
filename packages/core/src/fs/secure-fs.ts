/**
 * Secure filesystem layer: all read/write operations validate paths via
 * `PathAllowlistPolicy` + `fs.realpath` confinement before touching the
 * filesystem. Mitigates path traversal and symlink escapes by re-validating
 * immediately before access; filesystem operations are not atomic and this is
 * not an absolute TOCTOU guarantee.
 *
 * Contract (mirrors phase-2 TOCTOU note):
 *   A syntactic policy pass (checkPathAllowlist) is NOT sufficient alone.
 *   Every operation MUST re-validate the resolved realpath at mutation time.
 */

import { constants as fsConstants, promises as fsp } from "node:fs";
import { posix } from "node:path";

import { evaluateMutationPolicy } from "../policy/mutation.js";
import {
  checkPathAllowlist,
  isWithinRoot,
  normalizePathForPolicy,
} from "../policy/path-allowlist.js";

/** Maximum bytes read from a single file. */
const MAX_FILE_BYTES = 512 * 1024; // 512 KB

/** Maximum number of directory entries returned from listDir. */
const MAX_DIR_ENTRIES = 2000;

export interface SecureFsOptions {
  /** Absolute path to the repository root (already resolved). */
  root: string;
  /**
   * Path prefixes (relative to root) allowed for reads and writes.
   * Writes additionally require `approved: true`.
   */
  allowlist: readonly string[];
}

export interface ReadResult {
  content: string;
  truncated: boolean;
  bytes: number;
}

export interface ListResult {
  entries: string[];
  truncated: boolean;
}

export class PathConfinementError extends Error {
  constructor(
    public readonly operation: string,
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`SecureFs ${operation} blocked: ${reason} (path: ${path})`);
    this.name = "PathConfinementError";
  }
}

export class PolicyDeniedError extends Error {
  constructor(
    public readonly operation: string,
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`SecureFs ${operation} denied by policy: ${reason} (path: ${path})`);
    this.name = "PolicyDeniedError";
  }
}

/**
 * Normalize + syntactically validate a relative path.
 * Throws `PathConfinementError` on any policy rejection.
 */
function syntacticGuard(
  root: string,
  allowlist: readonly string[],
  relPath: string,
  operation: string,
): string {
  const normalized = normalizePathForPolicy(relPath);
  const decision = checkPathAllowlist(root, allowlist, normalized);
  if (!decision.allowed) {
    throw new PathConfinementError(operation, relPath, decision.reason);
  }
  return normalized;
}

/**
 * Resolve the absolute path and verify it stays inside `root`.
 * Throws `PathConfinementError` on symlink escape.
 */
async function realpathGuard(
  root: string,
  absPath: string,
  operation: string,
  relPath: string,
): Promise<string> {
  let resolved: string;
  try {
    resolved = await fsp.realpath(absPath);
  } catch {
    // realpath can fail if the file doesn't exist yet (create ops).
    // Resolve the parent directory instead and reconstruct.
    const parentDir = posix.dirname(absPath);
    const basename = posix.basename(absPath);
    try {
      const resolvedParent = await fsp.realpath(parentDir);
      resolved = posix.join(resolvedParent, basename);
    } catch {
      // Parent also doesn't exist — use the raw absolute path.
      resolved = absPath;
    }
  }

  // Normalize separators for confinement check on Windows.
  const resolvedNorm = resolved.replaceAll("\\", "/");
  const rootNorm = root.replaceAll("\\", "/");

  if (!isWithinRoot(rootNorm, resolvedNorm)) {
    throw new PathConfinementError(
      operation,
      relPath,
      `resolved path escapes repository root: ${resolved}`,
    );
  }
  return resolved;
}

/**
 * Deterministic, side-effect-guarded filesystem operations for an untrusted
 * repository. Instantiate once per repository root.
 */
export class SecureFileSystem {
  private readonly root: string;
  private readonly allowlist: readonly string[];

  constructor(options: SecureFsOptions) {
    // Normalize the root path separator for cross-platform confinement checks.
    this.root = options.root.replaceAll("\\", "/");
    this.allowlist = options.allowlist;
  }

  // -------------------------------------------------------------------------
  // Read operations (no approval required)
  // -------------------------------------------------------------------------

  async readFile(relPath: string): Promise<ReadResult> {
    const normalized = syntacticGuard(
      this.root,
      this.allowlist,
      relPath,
      "readFile",
    );
    const absPath = posix.join(this.root, normalized);
    await realpathGuard(this.root, absPath, "readFile", relPath);

    const rawBuffer = await fsp.readFile(absPath);
    const truncated = rawBuffer.byteLength > MAX_FILE_BYTES;
    const bytes = rawBuffer.byteLength;
    const content = rawBuffer.subarray(0, MAX_FILE_BYTES).toString("utf8");

    return { content, truncated, bytes };
  }

  async listDir(relPath: string): Promise<ListResult> {
    // Allow listing the root itself (".") even if not in allowlist.
    const normalized =
      relPath === "." || relPath === ""
        ? "."
        : syntacticGuard(this.root, this.allowlist, relPath, "listDir");

    const absPath =
      normalized === "." ? this.root : posix.join(this.root, normalized);

    await realpathGuard(this.root, absPath, "listDir", relPath);

    const rawEntries = await fsp.readdir(absPath);
    const truncated = rawEntries.length > MAX_DIR_ENTRIES;
    const entries = rawEntries.slice(0, MAX_DIR_ENTRIES);

    return { entries, truncated };
  }

  async exists(relPath: string): Promise<boolean> {
    const normalized = syntacticGuard(
      this.root,
      this.allowlist,
      relPath,
      "exists",
    );
    const absPath = posix.join(this.root, normalized);
    try {
      await realpathGuard(this.root, absPath, "exists", relPath);
      await fsp.access(absPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Write operations (require explicit approval + full policy gate)
  // -------------------------------------------------------------------------

  async writeFile(
    relPath: string,
    content: string,
    approved: boolean,
  ): Promise<void> {
    const decision = evaluateMutationPolicy(
      {
        root: this.root,
        allowlist: this.allowlist,
        requireHumanApproval: true,
      },
      { id: "write", path: relPath, kind: "modify" },
      approved,
    );

    if (!decision.allowed) {
      throw new PolicyDeniedError("writeFile", relPath, decision.reason);
    }

    const normalized = normalizePathForPolicy(relPath);
    const absPath = posix.join(this.root, normalized);
    await realpathGuard(this.root, absPath, "writeFile", relPath);
    await fsp.writeFile(absPath, content, "utf8");
  }

  async deleteFile(relPath: string, approved: boolean): Promise<void> {
    const decision = evaluateMutationPolicy(
      {
        root: this.root,
        allowlist: this.allowlist,
        requireHumanApproval: true,
      },
      { id: "delete", path: relPath, kind: "delete" },
      approved,
    );

    if (!decision.allowed) {
      throw new PolicyDeniedError("deleteFile", relPath, decision.reason);
    }

    const normalized = normalizePathForPolicy(relPath);
    const absPath = posix.join(this.root, normalized);
    await realpathGuard(this.root, absPath, "deleteFile", relPath);
    await fsp.unlink(absPath);
  }

  async createFile(
    relPath: string,
    content: string,
    approved: boolean,
  ): Promise<void> {
    const decision = evaluateMutationPolicy(
      {
        root: this.root,
        allowlist: this.allowlist,
        requireHumanApproval: true,
      },
      { id: "create", path: relPath, kind: "create" },
      approved,
    );

    if (!decision.allowed) {
      throw new PolicyDeniedError("createFile", relPath, decision.reason);
    }

    const normalized = normalizePathForPolicy(relPath);
    const absPath = posix.join(this.root, normalized);
    await fsp.mkdir(posix.dirname(absPath), { recursive: true });
    await realpathGuard(this.root, absPath, "createFile", relPath);
    // wx flag: fail if file already exists.
    await fsp.writeFile(absPath, content, { encoding: "utf8", flag: "wx" });
  }
}
