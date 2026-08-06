import { FakeModelAdapter } from "./fake-model.js";
import { OpenAIAdapter } from "./openai-adapter.js";
import type { ModelAdapter } from "./model-adapter.js";

export type ModelBackend = "fake" | "openai";

export interface ModelRouterConfig {
  backend: ModelBackend;
  apiKey?: string;
  responses?: string[];
  model?: string;
}

export function createModelAdapter(config: ModelRouterConfig): ModelAdapter {
  switch (config.backend) {
    case "fake":
      return new FakeModelAdapter(config.responses ?? []);
    case "openai":
      return new OpenAIAdapter({
        apiKey: config.apiKey ?? process.env["OPENAI_API_KEY"] ?? "",
        ...(config.model !== undefined ? { model: config.model } : {}),
      });
    default: {
      const _exhaustive: never = config.backend;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
}
