export const corePackageName = "@repomedic/core";
export const corePackageVersion = "0.1.0";

export interface MutationDecision {
  valid: boolean;
  reason?: string;
  violations?: string[];
  details?: string;
}

export class PathAllowlistPolicy {
  constructor(private allowedPaths?: string[]) {}
  validatePath(_relativePath: string): MutationDecision {
    return { valid: true }; // stub
  }
}

export class MutationPolicy {
  constructor(private pathPolicy: PathAllowlistPolicy) {}
  validatePath(_relativePath: string, _kind: string): MutationDecision {
    return { valid: true }; // stub
  }
}

