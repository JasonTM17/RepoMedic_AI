export const corePackageName = "@repomedic/core";
export const corePackageVersion = "0.1.0";

export interface MutationDecision {
  allowed: boolean;
  reason?: string;
  violations?: string[];
}

export class PathAllowlistPolicy {
  constructor(private allowedPaths?: string[]) {}
  validate(_relativePath: string): MutationDecision {
    return { allowed: true }; // stub
  }
}

export class MutationPolicy {
  constructor(private pathPolicy: PathAllowlistPolicy) {}
  validate(_relativePath: string, _kind: string): MutationDecision {
    return { allowed: true }; // stub
  }
}

