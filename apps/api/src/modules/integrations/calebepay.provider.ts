import { fetchJson } from '../../common/http';

/**
 * Calebe Pay REST /v1 (calebePay-monolito/docs/integration.md). The API key decides the
 * mode: `cp_test_…` = sandbox, `cp_live_…`/`cp_key_…` = production. Same URL for both.
 * Domain code talks to the `PaymentProvider` interface, never to this class directly.
 */

export type PaymentMethod = 'pix' | 'boleto' | 'credit_card';

export interface PaymentCustomer {
  name: string;
  document: string; // CPF/CNPJ digits
  email: string;
  phone: string;
  address?: { zipCode: string; street: string; number: string; complement?: string; district: string; city: string; state: string };
}

export interface CreateCheckoutInput {
  /** Our stable reference (e.g. "license-<id>" or "penalty-<paymentId>"). */
  reference: string;
  /** Persist it on our side BEFORE calling: a retry after a timeout returns the same checkout. */
  idempotencyKey: string;
  amountCents: number;
  description: string;
  methods: PaymentMethod[];
  dueDate: string; // YYYY-MM-DD
  customer: PaymentCustomer;
  returnUrl?: string;
  callbackUrl?: string;
}

export interface CheckoutResult {
  providerCheckoutId: string;
  checkoutUrl: string;
  livemode: boolean;
}

export interface TransactionInfo {
  id: string;
  status: string; // pending | paid | expired | failed | refunded | disputed | chargeback …
  reference: string;
  amountCents: number;
  livemode: boolean;
  simulated: boolean;
  method?: string;
}

export interface CreateSubscriptionInput {
  idempotencyKey: string;
  name: string;
  description: string;
  amountCents: number;
  method: 'pix' | 'boleto';
  firstDueDate: string; // YYYY-MM-DD (Brasília)
  intervalMonths: number;
  advanceDays: number;
  customer: PaymentCustomer;
  callbackUrl?: string;
}

export interface SubscriptionInfo {
  id: string;
  status: string; // active | paused | cancelled
  nextDueDate: string | null;
  cycle: number;
  livemode: boolean;
  lastError: string | null;
}

export interface SubscriptionCycle {
  cycle: number;
  dueDate: string;
  amountCents: number;
  status: string; // created | attention | skipped | pending
  transactionId: string | null;
  transactionStatus: string | null;
  paymentUrl: string | null;
}

/** Integration boundary (VGStack rule): domain code talks to this, never to the HTTP class. */
export interface PaymentProvider {
  readonly name: 'calebepay';
  readonly testMode: boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  getCheckout(id: string): Promise<{ id: string; status: string; transactionId?: string; reference?: string }>;
  getTransaction(id: string): Promise<TransactionInfo>;
  createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionInfo>;
  getSubscription(id: string): Promise<SubscriptionInfo>;
  listCycles(subscriptionId: string): Promise<SubscriptionCycle[]>;
  cancelSubscription(id: string): Promise<void>;
  ping(): Promise<{ mode: 'test' | 'live' }>;
}

interface Envelope<T> {
  data: T;
}
interface CpCheckout {
  id: string;
  status: string;
  checkout_url?: string;
  transaction_id?: string | null;
  reference?: string;
  livemode?: boolean;
}
interface CpSubscription {
  id: string;
  status: string;
  next_due_date: string | null;
  cycle: number;
  livemode: boolean;
  last_error: string | null;
}
interface CpCycle {
  cycle: number;
  due_date: string;
  amount: number;
  status: string;
  transaction_id: string | null;
  transaction_status: string | null;
  payment_url: string | null;
}
interface CpTransaction {
  id: string;
  status: string;
  reference: string;
  amount: number;
  livemode: boolean;
  simulated: boolean;
  method?: string;
}

export class CalebePayProvider implements PaymentProvider {
  readonly name = 'calebepay' as const;
  readonly testMode: boolean;
  private readonly base: string;

  constructor(
    apiUrl: string,
    private readonly apiKey: string,
  ) {
    this.base = apiUrl.replace(/\/+$/, '');
    this.testMode = CalebePayProvider.isTestKey(apiKey);
  }

  static isTestKey(key: string): boolean {
    return key.startsWith('cp_test_');
  }

  private headers(extra: Record<string, string> = {}) {
    return { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json', Accept: 'application/json', ...extra };
  }

  customerBody(c: PaymentCustomer) {
    return {
      name: c.name,
      document: c.document,
      email: c.email,
      phone: c.phone,
      ...(c.address
        ? {
            address: {
              zip_code: c.address.zipCode,
              street: c.address.street,
              number: c.address.number,
              ...(c.address.complement ? { complement: c.address.complement } : {}),
              district: c.address.district,
              city: c.address.city,
              state: c.address.state,
            },
          }
        : {}),
    };
  }

  buildBody(input: CreateCheckoutInput) {
    const c = input.customer;
    return {
      amount: input.amountCents,
      reference: input.reference,
      description: input.description.slice(0, 200),
      methods: input.methods,
      due_date: input.dueDate,
      customer: {
        name: c.name,
        document: c.document,
        email: c.email,
        phone: c.phone,
        ...(c.address
          ? {
              address: {
                zip_code: c.address.zipCode,
                street: c.address.street,
                number: c.address.number,
                ...(c.address.complement ? { complement: c.address.complement } : {}),
                district: c.address.district,
                city: c.address.city,
                state: c.address.state,
              },
            }
          : {}),
      },
      ...(input.returnUrl?.startsWith('https://') ? { return_url: input.returnUrl } : {}),
      ...(input.callbackUrl?.startsWith('https://') ? { callback_url: input.callbackUrl } : {}),
    };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { data } = await fetchJson<Envelope<CpCheckout>>(`${this.base}/v1/checkouts`, {
      method: 'POST',
      headers: this.headers({ 'Idempotency-Key': input.idempotencyKey }),
      body: JSON.stringify(this.buildBody(input)),
      timeoutMs: 30_000,
    });
    if (!data?.data?.checkout_url) throw new Error('Resposta sem checkout_url');
    return { providerCheckoutId: data.data.id, checkoutUrl: data.data.checkout_url, livemode: data.data.livemode ?? !CalebePayProvider.isTestKey(this.apiKey) };
  }

  async getCheckout(id: string) {
    const { data } = await fetchJson<Envelope<CpCheckout>>(`${this.base}/v1/checkouts/${encodeURIComponent(id)}`, { headers: this.headers(), timeoutMs: 15_000 });
    return { id: data.data.id, status: data.data.status, transactionId: data.data.transaction_id ?? undefined, reference: data.data.reference };
  }

  async getTransaction(id: string): Promise<TransactionInfo> {
    const { data } = await fetchJson<Envelope<CpTransaction>>(`${this.base}/v1/transactions/${encodeURIComponent(id)}`, { headers: this.headers(), timeoutMs: 15_000 });
    const t = data.data;
    return { id: t.id, status: t.status, reference: t.reference, amountCents: t.amount, livemode: t.livemode, simulated: t.simulated, method: t.method };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionInfo> {
    const body = {
      name: input.name.slice(0, 100),
      description: input.description.slice(0, 200),
      amount: input.amountCents,
      method: input.method,
      first_due_date: input.firstDueDate,
      interval_months: input.intervalMonths,
      advance_days: input.advanceDays,
      customer: this.customerBody(input.customer),
      ...(input.callbackUrl?.startsWith('https://') ? { callback_url: input.callbackUrl } : {}),
    };
    const { data } = await fetchJson<Envelope<CpSubscription>>(`${this.base}/v1/subscriptions`, {
      method: 'POST',
      headers: this.headers({ 'Idempotency-Key': input.idempotencyKey }),
      body: JSON.stringify(body),
      timeoutMs: 30_000,
    });
    return CalebePayProvider.subscription(data.data);
  }

  async getSubscription(id: string): Promise<SubscriptionInfo> {
    const { data } = await fetchJson<Envelope<CpSubscription>>(`${this.base}/v1/subscriptions/${encodeURIComponent(id)}`, { headers: this.headers(), timeoutMs: 15_000 });
    return CalebePayProvider.subscription(data.data);
  }

  async listCycles(subscriptionId: string): Promise<SubscriptionCycle[]> {
    const { data } = await fetchJson<Envelope<CpCycle[]>>(`${this.base}/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cycles?limit=50`, { headers: this.headers(), timeoutMs: 15_000 });
    return (data.data ?? []).map((c) => ({ cycle: c.cycle, dueDate: c.due_date, amountCents: c.amount, status: c.status, transactionId: c.transaction_id, transactionStatus: c.transaction_status, paymentUrl: c.payment_url }));
  }

  async cancelSubscription(id: string): Promise<void> {
    await fetchJson(`${this.base}/v1/subscriptions/${encodeURIComponent(id)}`, { method: 'PATCH', headers: this.headers(), body: JSON.stringify({ status: 'cancelled' }), timeoutMs: 15_000 });
  }

  private static subscription(s: CpSubscription): SubscriptionInfo {
    return { id: s.id, status: s.status, nextDueDate: s.next_due_date, cycle: s.cycle, livemode: s.livemode, lastError: s.last_error };
  }

  /** Connectivity + permission check for the admin screen (needs `transactions:read`). */
  async ping(): Promise<{ mode: 'test' | 'live' }> {
    await fetchJson(`${this.base}/v1/checkouts?limit=1`, { headers: this.headers(), timeoutMs: 10_000 });
    return { mode: CalebePayProvider.isTestKey(this.apiKey) ? 'test' : 'live' };
  }
}
