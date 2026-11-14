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

/** Recursively mask sensitive values so tokens and passwords are never logged. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
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
