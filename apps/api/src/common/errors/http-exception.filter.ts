import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ErrorCode } from '@tenace/types';

const BY_STATUS: Record<number, ErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  422: 'validation_error',
  429: 'rate_limited',
  503: 'service_unavailable',
};

/** Keeps Nest's body and guarantees a stable `code`. Internal errors never leak details. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const payload = typeof raw === 'string' ? { message: raw } : (raw as Record<string, unknown>);
      res.status(status).json({
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        ...payload,
        code: (payload.code as string | undefined) ?? BY_STATUS[status] ?? 'internal_error',
      });
      return;
    }
    const err = exception as { type?: string; status?: number };
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ statusCode: 413, message: 'Payload too large', code: 'payload_too_large' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ statusCode: 400, message: 'Invalid JSON', code: 'bad_request' });
      return;
    }
    this.logger.error(`${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ statusCode: 500, message: 'Internal error', code: 'internal_error' });
  }
}
