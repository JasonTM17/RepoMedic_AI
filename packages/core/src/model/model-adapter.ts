export type MessageRole = "user" | "assistant" | "system";
export interface Message {
  role: MessageRole;
  content: string;
}
export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
}
export interface ModelAdapter {
  readonly name: string;
  complete(messages: Message[], options?: CompletionOptions): Promise<string>;
}
