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
  if (typeof obj.message === "string") return friendlyMessage(obj.message);
  if (Array.isArray(obj.message)) {
    return (obj.message as unknown[])
      .filter((m): m is string => typeof m === "string")
      .map(friendlyMessage)
      .join("; ");
  }
  return null;
}

/** Keep infrastructure details and class-validator property syntax out of the
 * customer UI while retaining actionable validation/business messages. */
function friendlyMessage(message: string): string {
  if (/vault|approle|secret id|role id/i.test(message)) {
    return "Secure credential storage is temporarily unavailable. Please try again shortly or contact support.";
  }
  if (/internal server error/i.test(message)) {
    return "Something went wrong while processing your request. Please try again. If it continues, contact support.";
  }
  return message
    .replace(/\bproperty ([A-Za-z0-9_.]+) should not exist\b/g, "Unexpected field: $1")
    .replace(/^([a-z][A-Za-z0-9]*) /, (_all, field: string) => `${humanize(field)} `);
}

function humanize(value: string): string {
  const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
