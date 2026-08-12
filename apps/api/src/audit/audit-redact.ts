/** Keys whose values must never be persisted to the audit trail. */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'clientsecret',
  'apikey',
  'secret',
];

const REDACTED = '[redacted]';
/** Cap stored bodies so a huge payload can't bloat the audit table. */
const MAX_SERIALISED_BYTES = 100_000;

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k === s || k.includes(s));
}

/**
 * Deep-clone a request/response body for storage, redacting sensitive keys and
 * truncating anything oversized. Returns a JSON-safe value (never throws).
 */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 8) return '[truncated: too deep]';
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((v) => redactForAudit(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitive(key) ? REDACTED : redactForAudit(val, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 5_000) {
    return `${value.slice(0, 5_000)}…[truncated]`;
  }
  return value;
}

/** Redact + guarantee the result serialises under the size cap. */
export function sanitiseBody(value: unknown): unknown {
  try {
    const redacted = redactForAudit(value);
    const json = JSON.stringify(redacted);
    if (json && json.length > MAX_SERIALISED_BYTES) {
      return { _truncated: true, bytes: json.length };
    }
    return redacted;
  } catch {
    return { _unserialisable: true };
  }
}
