/**
 * API types are generated from docs/openapi.yaml; repair endpoints remain a
 * deferred application surface until the API implements them.
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
