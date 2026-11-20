import { Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainUnauthorized } from '../../common/errors/domain-exceptions';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest } from '../../common/request';
import { Public } from '../auth/auth.guard';
import { IntegrationsService } from './integrations.service';
import { PaymentsService, type CalebeEvent } from './payments.service';
import { verifyCalebeSignature } from './signature';

/**
 * Calebe Pay webhooks. Public (signed with HMAC, no session/CSRF). Stored before processing,
 * idempotent by event id; a non-2xx makes Calebe Pay retry.
 * Public URL: https://<host>/api/webhooks/calebepay (the web proxies /api to this service).
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger('Webhooks');
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly payments: PaymentsService,
  ) {}

  @Public()
  @Post('calebepay')
  @HttpCode(200)
  async calebepay(@Req() req: AuthedRequest & { rawBody?: Buffer }) {
    const raw = req.rawBody ?? Buffer.alloc(0);
    const cp = await this.integrations.load('calebepay');
    if (!verifyCalebeSignature(req.headers['calebe-signature'] as string | undefined, raw, cp.secrets.webhookSecret ?? '')) {
      throw new DomainUnauthorized('unauthorized', 'Assinatura inválida');
    }
    let event: CalebeEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as CalebeEvent;
    } catch {
      return { ok: true };
    }
    if (typeof event.id !== 'string' || typeof event.type !== 'string') return { ok: true };

    try {
      await this.prisma.webhookEvent.create({ data: { id: event.id, provider: 'calebepay', type: event.type, livemode: !!event.livemode, payload: event as unknown as Prisma.InputJsonValue } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const prev = await this.prisma.webhookEvent.findUnique({ where: { id: event.id } });
      if (prev?.processedAt) return { ok: true, duplicate: true };
    }
    try {
      await this.payments.handleCalebeEvent(event);
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
    } catch (e) {
      this.logger.error(`webhook ${event.id}: ${(e as Error).message}`);
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { error: (e as Error).message.slice(0, 500) } });
      throw e;
    }
    return { ok: true };
  }
}
