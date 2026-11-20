import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EnvService } from '../../common/env.service';
import { DomainForbidden, DomainUnauthorized } from '../../common/errors/domain-exceptions';
import type { AuthedRequest } from '../../common/request';
import { AuthService } from './auth.service';

export const IS_PUBLIC = 'tenace:public';
export const OPTIONAL_AUTH = 'tenace:optional-auth';
/** No session required. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Session resolved when present, but not required. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'tenace';

/**
 * Global guard. Web: opaque session in an httpOnly cookie + CSRF header + Origin check.
 * Mobile (Expo): `Authorization: Bearer <token>` — not sent automatically by browsers, so no CSRF check.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly webOrigin: string;
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    envs: EnvService,
  ) {
    this.webOrigin = new URL(envs.env.APP_WEB_URL).origin;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets);

    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!bearer && !SAFE.has(req.method)) {
      const origin = req.headers.origin;
      if (req.headers[CSRF_HEADER] !== CSRF_VALUE || (origin && origin !== this.webOrigin)) throw new DomainForbidden('csrf_rejected', 'Requisição recusada');
    }

    const token = bearer ?? (req.cookies as Record<string, string> | undefined)?.[this.auth.cookieName];
    const session = await this.auth.resolve(token);
    if (!session) {
      if (optional) return true;
      throw new DomainUnauthorized('session_expired', 'Sessão expirada');
    }
    req.user = session.user;
    req.sessionId = session.sessionId;
    return true;
  }
}
