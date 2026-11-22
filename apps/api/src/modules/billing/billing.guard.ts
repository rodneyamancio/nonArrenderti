import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainForbidden } from '../../common/errors/domain-exceptions';
import type { AuthedRequest } from '../../common/request';
import { BillingService } from './billing.service';

export const ALLOW_BLOCKED = 'tenace:allow-blocked';
/** Reachable by a blocked account (auth, billing, notifications). */
export const AllowBlocked = () => SetMetadata(ALLOW_BLOCKED, true);

/**
 * Global guard after AuthGuard: a blocked account (invoice 5+ days late) only reaches the
 * routes marked @AllowBlocked — enough to see what is owed and pay it. Platform staff are exempt.
 */
@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || req.user.role === 'platform_admin') return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_BLOCKED, [ctx.getHandler(), ctx.getClass()])) return true;
    if (await this.billing.isUserBlocked(req.user.id)) {
      throw new DomainForbidden('account_blocked', 'Sua conta está bloqueada por falta de pagamento. Pague a mensalidade em atraso para reativar.');
    }
    return true;
  }
}
