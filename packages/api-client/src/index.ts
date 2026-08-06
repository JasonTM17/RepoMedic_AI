/**
 * API types are generated from docs/openapi.yaml in a later phase.
 * Keeping the package boundary now prevents web code from importing API internals.
 */
export interface ApiClientConfiguration {
  baseUrl: string;
}

export function createApiClientConfiguration(
  baseUrl: string,
): ApiClientConfiguration {
  return { baseUrl: baseUrl.replace(/\/$/, "") };
}
