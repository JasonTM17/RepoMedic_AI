/** Common result wrapper for all read-only repository tools. */
export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data };
}

export function fail<T>(error: string): ToolResult<T> {
  return { success: false, error };
}
