import type {
  ModelAdapter,
  Message,
  CompletionOptions,
} from "./model-adapter.js";

export class OpenAIConfigError extends Error {
  constructor(message?: string) {
    super(message ?? "OpenAI API key is missing");
    this.name = "OpenAIConfigError";
  }
}

export class OpenAIAdapter implements ModelAdapter {
  readonly name = "openai";
  private apiKey: string;
  private model: string;

  constructor({ apiKey, model }: { apiKey: string; model?: string }) {
    if (!apiKey) {
      throw new OpenAIConfigError();
    }
    this.apiKey = apiKey;
    this.model = model ?? "gpt-4o";
  }

  async complete(
    messages: Message[],
    options?: CompletionOptions,
  ): Promise<string> {
    const requestBody = {
      model: this.model,
      messages,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(options?.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }> | undefined;
    };
    const choice = data.choices?.[0];
    return choice?.message.content ?? "";
  }
}
