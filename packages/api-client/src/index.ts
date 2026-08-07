import {
  createClient,
  type Client,
  type Config,
} from "./generated/client/index.js";

export * from "./generated/index.js";
export type { Client, Config } from "./generated/client/index.js";

export interface ApiClientConfiguration {
  baseUrl: string;
}

export function createApiClientConfiguration(
  baseUrl: string,
): ApiClientConfiguration {
  return { baseUrl: baseUrl.replace(/\/$/, "") };
}

export function createApiClient(
  baseUrl: string,
  options?: Omit<Config, "baseUrl">,
): Client {
  return createClient({
    ...options,
    baseUrl: createApiClientConfiguration(baseUrl).baseUrl,
  });
}
