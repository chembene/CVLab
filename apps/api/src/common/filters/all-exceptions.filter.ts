import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';

interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Global exception handler. Converts every thrown error into the API error
 * envelope from prompts/13-api-contracts.md §3, and never leaks stack
 * traces, SQL errors, or internal details to the client (§22) — those go to
 * the server-side structured log only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AppLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error } = this.resolve(exception);

    this.logger.error(
      { status, code: error.code, method: request.method, path: request.url },
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({ success: false, error });
  }

  private resolve(exception: unknown): { status: number; error: ErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage =
        typeof body === 'string'
          ? body
          : (((body as Record<string, unknown>).message as string | string[] | undefined) ??
            exception.message);

      return {
        status,
        error: {
          code: HttpStatus[status] ?? 'HTTP_ERROR',
          message: Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage,
          details: typeof body === 'object' ? (body as Record<string, unknown>) : undefined,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    };
  }
}
