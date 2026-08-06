export interface PatchToolResult {
  success: boolean;
  message: string;
  error?: string;
}
export function patchOk(message: string): PatchToolResult { return { success: true, message }; }
export function patchFail(error: string): PatchToolResult { return { success: false, message: 'failed', error }; }
