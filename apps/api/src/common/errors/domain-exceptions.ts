import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ErrorCode } from '@tenace/types';

type Params = Record<string, unknown> | undefined;
const body = (code: ErrorCode, message: string, params: Params) => ({ message, code, ...(params ? { params } : {}) });

export class DomainBadRequest extends BadRequestException {
  constructor(code: ErrorCode, message: string, params?: Params) {
    super(body(code, message, params));
  }
}
export class DomainUnauthorized extends UnauthorizedException {
  constructor(code: ErrorCode, message: string, params?: Params) {
    super(body(code, message, params));
  }
}
export class DomainForbidden extends ForbiddenException {
  constructor(code: ErrorCode, message: string, params?: Params) {
    super(body(code, message, params));
  }
}
export class DomainNotFound extends NotFoundException {
  constructor(code: ErrorCode, message: string, params?: Params) {
    super(body(code, message, params));
  }
}
export class DomainConflict extends ConflictException {
  constructor(code: ErrorCode, message: string, params?: Params) {
    super(body(code, message, params));
  }
}
export class DomainUnavailable extends ServiceUnavailableException {
  constructor(code: ErrorCode, message: string, params?: Params) {
    super(body(code, message, params));
  }
}
export class DomainTooMany extends HttpException {
  constructor(retryAfterSec: number) {
    super(body('rate_limited', 'Muitas tentativas. Aguarde e tente de novo.', { retryAfterSec }), 429);
  }
}
