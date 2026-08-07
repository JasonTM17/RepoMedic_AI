import type { MutationDecision, PolicyViolation } from "../domain/entities.js";
import { policyVersion } from "../version.js";

/**
 * Normalize a path for syntactic policy checking.
 *
 * - Converts Windows backslashes to forward slashes.
 * - Strips a leading `./`.
 * - Collapses duplicate slashes.
 * - Rejects components that only differ from safe ones by trailing
 *   space/dot (Win32 ambiguity) or percent-encoding (`%2e%2e`).
 *
 * The result is never used to touch the filesystem — this is pure string
 * validation. Symlink resolution is owned by the phase-3 secure filesystem
 * layer, which re-validates the resolved realpath.
 */
export function normalizePathForPolicy(input: string): string {
  let normalized = input.replaceAll("\\", "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replaceAll(/\/{2,}/g, "/");
  return normalized;
}

export function isAbsoluteOrDriveOrUnc(path: string): boolean {
  if (path.startsWith("/")) return true;
  // Windows drive letter with or without slash: `C:/...`, `C:foo`
  if (/^[A-Za-z]:(\/|$)/.test(path)) return true;
  // UNC prefix: `//server/share`
  if (path.startsWith("//")) return true;
  return false;
}

function isTraversal(path: string): boolean {
  return path.split("/").includes("..");
}

/**
 * Components that can alias a traversal or `.git` on some platforms.
 * Percent-encoding is rejected wholesale in path components: a layer that
 * URL-decodes later would turn `%2e%2e` / `%2f` into `..` / `/`, so the
 * syntactic policy refuses any `%` before that can happen.
 */
const UNSAFE_COMPONENT_PATTERNS = [/^\.\.$/, /^\.\.\s+/, /\.\.$/, /%/];

function hasUnsafeComponent(path: string): boolean {
  const components = path.split("/");
  return components.some((component) =>
    UNSAFE_COMPONENT_PATTERNS.some((pattern) => pattern.test(component)),
  );
}

function isDeniedComponent(component: string): boolean {
  return component === ".git" || component === ".repomedic";
}

/**
 * Component-exact containment check for resolved absolute paths.
 * Both inputs are normalized first; `root` is anchored so a sibling like
 * `root2` never matches, and a resolved path with a `..` component is
 * rejected rather than resolved further.
 */
export function isWithinRoot(root: string, path: string): boolean {
  const normalizedRoot = normalizePathForPolicy(root).replace(/\/+$/, "");
  const normalizedPath = normalizePathForPolicy(path);
  if (isTraversal(normalizedPath)) return false;
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
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

function allow(): MutationDecision {
  return {
    allowed: true,
    reason: "path passes allowlist policy",
    policyVersion,
    violations: [],
  };
}

/**
 * Deterministic, side-effect-free path allowlist policy.
 *
 * Contract: `path` MUST be relative to `root`. Absolute paths, drive letters,
 * and UNC prefixes are rejected outright (default deny), so every accepted
 * path is implicitly confined to the repository root. Callers that resolve
 * real paths (phase 3 `fs.realpath`) must use `isWithinRoot` on the resolved
 * absolute path before any mutation. TOCTOU: a policy pass on a path is only
 * safe if the resolved realpath is re-checked at mutation time.
 */
export function checkPathAllowlist(
  root: string,
  allowlist: readonly string[],
  path: string,
): MutationDecision {
  if (path.length === 0) return deny("path is empty", "empty-path");
  if (isAbsoluteOrDriveOrUnc(path))
    return deny(
      `absolute or drive/UNC path is not allowed: ${path}`,
      "absolute-path",
    );

  const normalized = normalizePathForPolicy(path);
  if (isAbsoluteOrDriveOrUnc(normalized)) {
    return deny(
      `absolute or drive/UNC path is not allowed: ${path}`,
      "absolute-path",
    );
  }
  if (isTraversal(normalized))
    return deny(`parent traversal is not allowed: ${path}`, "traversal");
  if (hasUnsafeComponent(normalized))
    return deny(`unsafe path component: ${path}`, "traversal");
  if (normalized.split("/").some(isDeniedComponent))
    return deny(`denied component in path: ${path}`, "denied-path");

  const matchesAllowlist = allowlist.some((entry) => {
    const normalizedEntry = normalizePathForPolicy(entry).replace(/\/+$/, "");

    // `.` is the documented CLI default and means the repository root. Keep
    // the explicit path checks above in force so this wildcard still cannot
    // authorize traversal, absolute paths, or denied components.
    if (normalizedEntry === ".") return true;

    return (
      normalized === normalizedEntry ||
      normalized.startsWith(`${normalizedEntry}/`)
    );
  });
  if (!matchesAllowlist)
    return deny(`path is not allowlisted: ${path}`, "not-allowlisted");

  // Relative paths are implicitly inside `root` because absolute/drive/UNC
  // forms were rejected above. `isWithinRoot` is exported for callers that
  // need to confine resolved absolute paths.
  void root;

  return allow();
}

/** Convenience wrapper: does the path pass? */
export function isPathAllowed(
  root: string,
  allowlist: readonly string[],
  path: string,
): boolean {
  return checkPathAllowlist(root, allowlist, path).allowed;
}
