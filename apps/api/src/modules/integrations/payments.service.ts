import { Injectable, Logger } from '@nestjs/common';
import { DomainUnavailable } from '../../common/errors/domain-exceptions';
import { CalebePayProvider, type PaymentProvider } from './calebepay.provider';
import { IntegrationsService } from './integrations.service';

export interface CalebeEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data?: { id?: string; status?: string; reference?: string; previous_status?: string; amount?: number } & Record<string, unknown>;
}

/**
 * Entry point for real money movement (future: license sales, PIX charges for penalties).
 * v0.1 only connects: provider factory + webhook handling that records events.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  constructor(private readonly integrations: IntegrationsService) {}

  async isReady(): Promise<boolean> {
    const cp = await this.integrations.load('calebepay');
    return cp.enabled && !!cp.secrets.apiKey;
  }

  /** Provider built from the encrypted credentials. Throws 503 when not configured. */
  async provider(): Promise<PaymentProvider> {
    const cp = await this.integrations.load('calebepay');
    if (!cp.enabled || !cp.secrets.apiKey) throw new DomainUnavailable('service_unavailable', 'Calebe Pay não configurado');
    return new CalebePayProvider(cp.config.apiUrl, cp.secrets.apiKey);
  }

  /**
   * Routes a verified webhook to the domain by `data.reference` prefix. No domain consumes
   * payments yet, so events are only recorded. Add handlers here (e.g. "license-", "penalty-").
   */
  async handleCalebeEvent(event: CalebeEvent): Promise<void> {
    const ref = event.data?.reference ?? '';
    this.logger.log(`calebepay ${event.type} ${event.data?.id ?? ''} status=${event.data?.status ?? '?'} ref=${ref || '-'} live=${event.livemode ?? false}`);
  }
}
