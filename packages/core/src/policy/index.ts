import {
  PatchProposal,
  MutationDecision,
  PolicyViolation,
  PolicyViolationReason,
  PATCH_OPERATION_KINDS,
} from "../domain/index.js";
import { POLICY_VERSION } from "../version.js";

export class PathAllowlistPolicy {
  private allowedSegmentsList: string[][];

  constructor(allowedPaths: string[]) {
    this.allowedSegmentsList = allowedPaths.map((p) =>
      this.normalizeToSegments(p),
    );
  }

  private normalizeToSegments(p: string): string[] {
    return p
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .split("/")
      .filter((s) => s !== "" && s !== ".");
  }

  public validatePath(p: string): {
    valid: boolean;
    reason?: PolicyViolationReason;
    details?: string;
  } {
    if (!p) {
      return { valid: false, reason: "empty_path" };
    }

    if (
      p.startsWith("/") ||
      /^[a-zA-Z]:/.test(p) ||
      p.startsWith("\\\\") ||
      p.startsWith("//")
    ) {
      return { valid: false, reason: "absolute_path" };
    }

    const segments = this.normalizeToSegments(p);

    if (segments.some((s) => s === "..")) {
      return { valid: false, reason: "path_traversal" };
    }

    if (segments.length === 0) {
      return { valid: false, reason: "empty_path" };
    }

    // Root confinement is intrinsically handled if we only match against the allowlist.
    let allowed = false;
    for (const allowedSegments of this.allowedSegmentsList) {
      // Is allowedSegments a prefix of segments?
      if (allowedSegments.length <= segments.length) {
        let match = true;
        for (let i = 0; i < allowedSegments.length; i++) {
          if (segments[i] !== allowedSegments[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          allowed = true;
          break;
        }
      }
    }

    if (!allowed) {
      return { valid: false, reason: "not_in_allowlist" };
    }

    return { valid: true };
  }
}

export class MutationPolicy {
  constructor(private readonly pathAllowlist: PathAllowlistPolicy) {}

  public evaluate(proposal: PatchProposal): MutationDecision {
    const violations: PolicyViolation[] = [];

    for (const op of proposal.operations) {
      // 1. Allowed kinds
      if (!PATCH_OPERATION_KINDS.includes(op.kind as any)) {
        violations.push({
          path: op.path,
          reason: "unsupported_operation",
          details: `Unknown operation kind: ${op.kind}`,
        });
        continue;
      }

      // We need to check both path and oldPath (if rename)
      const pathsToCheck = [op.path];
      if (op.kind === "rename" && op.oldPath) {
        pathsToCheck.push(op.oldPath);
      }

      for (const p of pathsToCheck) {
        // 2. Allowlist gate
        const allowlistCheck = this.pathAllowlist.validatePath(p);
        if (!allowlistCheck.valid) {
          violations.push({
            path: p,
            reason: allowlistCheck.reason!,
            details: allowlistCheck.details,
          });
          continue;
        }

        // 3. Denylist
        const segments = p
          .replace(/\\/g, "/")
          .replace(/\/+/g, "/")
          .split("/")
          .filter((s) => s !== "" && s !== ".");
        const filename = segments[segments.length - 1] ?? "";

        // .git/
        if (segments.some((s) => s === ".git")) {
          violations.push({
            path: p,
            reason: "denied_directory",
            details: "Modifying .git directory is forbidden",
          });
          continue;
        }

        // .env*
        if (filename.startsWith(".env")) {
          violations.push({
            path: p,
            reason: "denied_file",
            details: "Modifying .env files is forbidden",
          });
          continue;
        }

        // credentials/secrets
        const lowerPath = p.toLowerCase();
        if (lowerPath.includes("credential") || lowerPath.includes("secret")) {
          violations.push({
            path: p,
            reason: "denied_file",
            details: "Modifying secret/credential files is forbidden",
          });
          continue;
        }

        // 4. chmod executable on non-scripts
        if (op.kind === "chmod" && op.mode !== undefined) {
          const isExecutable = (op.mode & 0o111) !== 0;
          if (isExecutable) {
            const isScript =
              filename.endsWith(".sh") ||
              filename.endsWith(".py") ||
              filename.endsWith(".js") ||
              filename.endsWith(".ts");
            if (!isScript) {
              violations.push({
                path: p,
                reason: "denied_extension",
                details: "Cannot set executable bit on non-script files",
              });
              continue;
            }
          }
        }
      }
    }

    return {
      allowed: violations.length === 0,
      policyVersion: POLICY_VERSION,
      reason: violations.length > 0 ? "Policy violations detected" : undefined,
      violations,
    };
  }
}
