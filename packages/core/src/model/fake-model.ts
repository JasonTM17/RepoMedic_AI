import type {
  ModelAdapter,
  Message,
  CompletionOptions,
} from "./model-adapter.js";

export class FakeModelExhaustedError extends Error {
  constructor(message?: string) {
    super(message ?? "Fake model exhausted responses");
    this.name = "FakeModelExhaustedError";
  }
}

export class FakeModelAdapter implements ModelAdapter {
  readonly name: string;
  private responses: string[];

  constructor(responses: string[], name?: string) {
    this.responses = [...responses];
    this.name = name ?? "fake";
  }

  async complete(_messages: Message[], _options?: CompletionOptions): Promise<string> {
    const nextResponse = this.responses.shift();
    if (nextResponse === undefined) {
      throw new FakeModelExhaustedError();
    }
    return nextResponse;
  }
}
