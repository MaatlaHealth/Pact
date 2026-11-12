type Level = "debug" | "info" | "warn" | "error";

const SECRET_PATTERNS = [
  /(client_secret|api[_-]?key|password|authorization|secret|token)["']?\s*[:=]\s*["']?[^"',\s}]+/gi,
  /\bBearer\s+[A-Za-z0-9._\-]+/g,
  /\bA21AA[A-Za-z0-9._\-]+/g, // PayPal access tokens
  /\bAIza[0-9A-Za-z\-_]{30,}/g, // Google API keys
];

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (m) => `${m.slice(0, 12)}[redacted]`);
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|password|token|authorization|api[_-]?key|private/i.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  /**
   * Writes a line without secret redaction. Used only for one-time links in
   * development when email delivery is not configured; never for credentials.
   */
  plain: (message: string) => console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", message })),
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
