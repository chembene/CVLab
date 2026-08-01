import type { LoggerService } from '@nestjs/common';

/**
 * Structured JSON logger foundation — one JSON line per entry so a future
 * log aggregator (Phase 15 observability) can parse output without a custom
 * grammar. Callers must never pass HIGHLY_SENSITIVE data (passwords, tokens,
 * secrets) as a log message, per docs/architecture/security-architecture.md §6.
 */
export class AppLogger implements LoggerService {
  constructor(private context?: string) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace ? { trace } : undefined);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    const entry = {
      level,
      timestamp: new Date().toISOString(),
      context: context ?? this.context,
      message,
      ...extra,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}
