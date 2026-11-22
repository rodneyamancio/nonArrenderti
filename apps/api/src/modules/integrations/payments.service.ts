import { Injectable, Logger } from '@nestjs/common';
import { DomainUnavailable } from '../../common/errors/domain-exceptions';
import { CalebePayProvider, type PaymentProvider } from './calebepay.provider';
import { IntegrationsService } from './integrations.service';

export interface CalebeEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data?: { id?: string; status?: string; reference?: string; previous_status?: string; amount?: number; subscription_id?: string; due_date?: string; cycle?: number; payment_url?: string | null } & Record<string, unknown>;
}

type EventHandler = (event: CalebeEvent) => Promise<void>;

/**
 * Entry point for real money movement (future: license sales, PIX charges for penalties).
 * v0.1 only connects: provider factory + webhook handling that records events.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly handlers: EventHandler[] = [];
  /** Tests plug a fake provider here (no network). Never set in production code. */
  override: PaymentProvider | null = null;

  constructor(private readonly integrations: IntegrationsService) {}

  /** Domains subscribe to verified webhook events (billing today; penalties later). */
  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  async isReady(): Promise<boolean> {
    if (this.override) return true;
    const cp = await this.integrations.load('calebepay');
    return cp.enabled && !!cp.secrets.apiKey;
  }

  /** Provider built from the encrypted credentials. Throws 503 when not configured. */
  async provider(): Promise<PaymentProvider> {
    if (this.override) return this.override;
    const cp = await this.integrations.load('calebepay');
    if (!cp.enabled || !cp.secrets.apiKey) throw new DomainUnavailable('service_unavailable', 'Calebe Pay não configurado');
    return new CalebePayProvider(cp.config.apiUrl, cp.secrets.apiKey, cp.config.costCenterId);
  }

  /**
   * Hands a verified webhook to every domain handler (billing routes by reference:
   * `sub_…:YYYY-MM-DD` cycles and `tinv-…` checkouts). A handler error makes Calebe Pay retry.
   */
  async handleCalebeEvent(event: CalebeEvent): Promise<void> {
    const ref = event.data?.reference ?? '';
    this.logger.log(`calebepay ${event.type} ${event.data?.id ?? ''} status=${event.data?.status ?? '?'} ref=${ref || '-'} live=${event.livemode ?? false}`);
    for (const h of this.handlers) await h(event);
  }
}
