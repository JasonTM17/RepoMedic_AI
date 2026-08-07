import type {
  MutationDecision,
  PatchOperation,
  PolicyViolation,
} from "../domain/entities.js";
import { patchOperationKindValues } from "../domain/enums.js";
import { policyVersion } from "../version.js";
import {
  checkPathAllowlist,
  normalizePathForPolicy,
} from "./path-allowlist.js";

export interface MutationPolicyOptions {
  /** Repository root used to confine relative paths. */
  root: string;
  /** Allowed path prefixes (relative to root). */
  allowlist: readonly string[];
  /**
   * When true, operations are allowed only when an explicit approval is on
   * record. Defaults to true — guarded by default.
   */
  requireHumanApproval?: boolean;
}

/** Paths whose mutation is always denied, whatever the allowlist says. */
const DENIED_SUBSTRINGS = [".git/", "/.git/"];

const SECRET_BASENAMES = [
  "credentials.json",
  "credentials",
  "service-account.json",
  "id_rsa",
  "id_ed25519",
  "config",
  "known_hosts",
];

function isSecretBasename(basename: string): boolean {
  const comparable =
    process.platform === "win32" ? basename.toLowerCase() : basename;
  if (SECRET_BASENAMES.includes(comparable)) return true;
  if (comparable.startsWith(".env")) return true;
  return /\.(pem|key)$/.test(comparable);
}

function isDeniedPath(normalizedPath: string): boolean {
  const comparable =
    process.platform === "win32"
      ? normalizedPath.toLowerCase()
      : normalizedPath;
  if (DENIED_SUBSTRINGS.some((token) => comparable.includes(token)))
    return true;
  const basename = comparable.split("/").pop() ?? comparable;
  return isSecretBasename(basename);
}

function deny(
  message: string,
  code: PolicyViolation["code"],
): MutationDecision {
  return {
    allowed: false,
    reason: message,
    policyVersion,
    violations: [{ code, message }],
  };
}

/**
 * Deterministic mutation policy — the single gate every write path (API, CLI,
 * agents) must pass before touching the filesystem.
 *
 * The operation path is normalized ONCE at entry (backslashes → slashes), and
 * every check — allowlist, denylist, traversal — runs on that same string, so
 * backslash-encoded `.env` / `.git` / credentials paths cannot bypass the
 * policy. Denial ordering is deterministic: path checks first, then kind,
 * then approval.
 */
export function evaluateMutationPolicy(
  options: MutationPolicyOptions,
  operation: PatchOperation,
  approved: boolean,
): MutationDecision {
  const { root, allowlist, requireHumanApproval = true } = options;
  const normalizedPath = normalizePathForPolicy(operation.path);

  const pathDecision = checkPathAllowlist(root, allowlist, normalizedPath);
  if (!pathDecision.allowed) {
    return {
      allowed: false,
      reason: pathDecision.reason,
      policyVersion,
      violations: pathDecision.violations,
    };
  }

  if (isDeniedPath(normalizedPath)) {
    return deny(
      `path is denied by mutation policy: ${operation.path}`,
      "denied-path",
    );
  }

  if (
    !(patchOperationKindValues as readonly string[]).includes(operation.kind)
  ) {
    return deny(`unknown operation kind: ${operation.kind}`, "unknown-kind");
  }

  if (operation.kind === "chmod") {
    if (operation.mode === undefined) {
      return deny(
        `chmod operation requires a mode: ${operation.path}`,
        "invalid-mode",
      );
    }
    const executable = (operation.mode & 0o111) !== 0;
    if (executable && !approved) {
      return deny(
        `chmod to executable mode requires approval: ${operation.path}`,
        "approval-required",
      );
    }
  }

  if (requireHumanApproval && !approved) {
    return deny(
      `human approval required for ${operation.path}`,
      "approval-required",
    );
  }

  return {
    allowed: true,
    reason: "mutation passes policy",
    policyVersion,
    violations: [],
  };
}
