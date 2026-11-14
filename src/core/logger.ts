import { config } from '@config/env';

const LEVEL_WEIGHT = { error: 0, warn: 1, info: 2, debug: 3 } as const;

export type LogLevel = keyof typeof LEVEL_WEIGHT;

/**
 * Keys whose values must never reach stdout. CI logs are retained and often
 * publicly visible on a public repository, so redaction is a safety control,
 * not a nicety.
 */
const SENSITIVE_KEY_PATTERN = /pass(word)?|token|secret|authorization|cookie|apikey|api_key/i;

const REDACTED = '[REDACTED]';

/**
 * Secrets also appear *inside* strings, not only as object values.
 *
 * This was a real leak found in Phase 6a: a failed cleanup produced a Playwright
 * error whose message embedded the whole request call log — including
 * `Authorization: Bearer <jwt>`. Key-based redaction cannot see that, because
 * the token is part of a message, not a property. CI logs on a public repository
 * are world-readable, so string scrubbing is a required second layer (ADR 0007).
 */
const SENSITIVE_STRING_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // A JWT anywhere in free text.
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '<jwt redacted>'],
  // `Authorization: Bearer …` / `Bearer …` as it appears in HTTP call logs.
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  // Header lines for any sensitive header, up to end of line.
  [/\b(authorization|cookie|set-cookie|x-api-key)(\s*:\s*)[^\r\n]+/gi, `$1$2${REDACTED}`],
];

/** Scrub secrets that are embedded in a string rather than held in a field. */
export function redactString(value: string): string {
  return SENSITIVE_STRING_PATTERNS.reduce(
    (scrubbed, [pattern, replacement]) => scrubbed.replace(pattern, replacement),
    value,
  );
}

/** Recursively mask sensitive values so tokens and passwords are never logged. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(nested),
      ]),
    );
  }

  return value;
}

/**
 * Deliberately dependency-free. A logging library (winston/pino) would add
 * transports, formatters and config we do not need: test logs go to stdout,
 * where Playwright and GitHub Actions already capture and group them.
 */
export class Logger {
  constructor(
    private readonly scope: string,
    private readonly level: LogLevel = config.logLevel,
  ) {}

  /** Derive a narrower-scoped logger, e.g. `logger.child('BookingsClient')`. */
  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.level);
  }

  error(message: string, context?: unknown): void {
    this.write('error', message, context);
  }

  warn(message: string, context?: unknown): void {
    this.write('warn', message, context);
  }

  info(message: string, context?: unknown): void {
    this.write('info', message, context);
  }

  debug(message: string, context?: unknown): void {
    this.write('debug', message, context);
  }

  private write(level: LogLevel, message: string, context?: unknown): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) {
      return;
    }

    const parts = [
      new Date().toISOString(),
      level.toUpperCase().padEnd(5),
      `[${this.scope}]`,
      message,
    ];

    if (context !== undefined) {
      parts.push(JSON.stringify(redact(context)));
    }

    // eslint-disable-next-line no-console -- stdout is the intended transport
    console.log(parts.join(' '));
  }
}

export const logger = new Logger('eventhub');
