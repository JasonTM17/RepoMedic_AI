/**
 * Capability metadata for the core package. Every exported contract carries
 * a version so tracing and compatibility checks can detect drift.
 */

export const packageVersion = "0.1.0";

/** Bump when the policy behavior changes (path or mutation rules). */
export const policyVersion = 1;

/** Bump when any public schema or entity shape changes. */
export const schemaVersion = 1;

export interface CapabilityVersions {
  packageVersion: string;
  policyVersion: number;
  schemaVersion: number;
}

export const capabilityVersions: CapabilityVersions = {
  packageVersion,
  policyVersion,
  schemaVersion,
};
