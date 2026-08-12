/**
 * Helpers for reading the structured error envelope our API returns when MOR
 * rejects something. Backend includes:
 *   { message: string, userMessages?: string[], statusCode?, eirmsBody? }
 * We never want to render `eirmsBody` to non-technical users.
 */
export function readUserMessages(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.userMessages)) return [];
  return obj.userMessages.filter((m): m is string => typeof m === "string");
}

export function readApiMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (Array.isArray(obj.message)) {
    return (obj.message as unknown[])
      .filter((m): m is string => typeof m === "string")
      .join("; ");
  }
  return null;
}
