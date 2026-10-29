// Tauri rejects native Result errors as strings rather than Error objects.
export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : error;
  return typeof message === "string" && message.trim() ? message.trim() : "Something went wrong.";
}
