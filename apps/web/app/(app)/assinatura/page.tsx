'use client';
import { BILLING_GRACE_DAYS, planPriceLabel } from '@tenace/rules';
import type { BillingMethod, BillingProfile, BillingView, InvoiceView, PlanView } from '@tenace/types';
import { Check, CreditCard, ExternalLink, QrCode, Receipt } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app/session';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, Notice, PageHeader, Segmented, Spinner, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx, fmtDay, formatCents } from '@/lib/format';

export default function SubscriptionPage() {
  return (
    <Suspense>
      <Subscription />
    </Suspense>
  );
}

const limitLabel = (n: number | null, one: string, many: string) => (n == null ? `${many[0]!.toUpperCase()}${many.slice(1)} ilimitados` : `Até ${n} ${n === 1 ? one : many}`);

function Subscription() {
  const toast = useToast();
  const params = useSearchParams();
  const { user } = useApp();
  const [data, setData] = useState<BillingView>();
  const [error, setError] = useState<unknown>();
  const [choosing, setChoosing] = useState<PlanView | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async (sync = false) => {
    try {
      setData(sync ? await api<BillingView>('/me/billing/sync', { method: 'POST' }) : await api<BillingView>('/me/billing'));
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }, []);
  // Coming back from a payment (or opening the page): pull the latest state from Calebe Pay.
  useEffect(() => void load(true), [load]);
  useEffect(() => {
    if (params.get('pago') === '1') toast('Recebemos seu pagamento — a confirmação pode levar alguns instantes.');
  }, [params, toast]);

  async function pay(inv: InvoiceView, mode: 'default' | 'checkout') {
    setPaying(`${inv.id}:${mode}`);
    try {
      const r = await api<{ url: string }>(`/me/billing/invoices/${inv.id}/pay`, { method: 'POST', body: { mode } });
      window.location.href = r.url;
    } catch (e) {
      toast(errorMessage(e), 'danger');
      setPaying(null);
    }
  }

  if (error && !data) return <ErrorState error={error} onRetry={() => load()} />;
  if (!data) return <Spinner />;
  const plan = data.plan;
  const open = data.invoices.filter((i) => i.status === 'open');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Assinatura" description="Seu plano, suas mensalidades e os limites dos grupos que você criou." />

      {data.status === 'blocked' && (
        <Notice tone="danger" title="Conta bloqueada por falta de pagamento">
          Seus grupos estão pausados e ninguém é cobrado enquanto isso. Pague a mensalidade em atraso abaixo para reativar tudo na hora.
        </Notice>
      )}
      {data.status === 'past_due' && (
        <Notice tone="warning" title="Mensalidade em atraso">
          Pague em até {data.daysToBlock} {data.daysToBlock === 1 ? 'dia' : 'dias'} para evitar o bloqueio da conta e a pausa dos seus grupos.
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Card title="Seu plano">
          {plan ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-extrabold">{plan.name}</p>
                {plan.priceCents > 0 && <p className="text-lg font-bold tabular-nums">{planPriceLabel(plan.priceCents, plan.intervalMonths, formatCents)}</p>}
              </div>
              {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
              <Usage label="Grupos que você criou" used={data.usage.groups} max={plan.maxGroups} />
              <Usage label="Pessoas no seu maior grupo" used={data.usage.largestGroup} max={plan.maxMembersPerGroup} />
              {data.subscription && (
                <p className="text-sm text-muted-foreground">
                  Cobrança por {data.subscription.method === 'pix' ? 'Pix' : 'boleto'}
                  {data.subscription.nextDueDate ? ` · próxima em ${fmtDay(data.subscription.nextDueDate)}` : ''}
                  {!data.subscription.livemode && ' · modo de teste'}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum plano configurado ainda: uso sem limites.</p>
          )}
        </Card>

        <Card title="Mensalidades" padded={false}>
          {data.invoices.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Nenhuma mensalidade ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.invoices.map((inv) => (
                <li key={inv.id} className="flex flex-col gap-2 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{formatCents(inv.amountCents)}</p>
                      <p className="text-xs text-muted-foreground">Vencimento {fmtDay(inv.dueDate)}</p>
                    </div>
                    {inv.status === 'paid' ? <Badge tone="success">Paga</Badge> : inv.overdue ? <Badge tone="danger">Em atraso</Badge> : <Badge tone="warning">Em aberto</Badge>}
                  </div>
                  {inv.status === 'open' && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => pay(inv, 'default')} loading={paying === `${inv.id}:default`} disabled={!!paying}>
                        {inv.overdue ? <Receipt className="h-4 w-4" aria-hidden /> : <QrCode className="h-4 w-4" aria-hidden />}
                        {inv.overdue ? 'Pagar agora' : data.subscription?.method === 'boleto' ? 'Ver boleto' : 'Pagar com Pix'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => pay(inv, 'checkout')} loading={paying === `${inv.id}:checkout`} disabled={!!paying}>
                        <CreditCard className="h-4 w-4" aria-hidden /> Cartão ou outra forma
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {open.length > 0 && <p className="px-5 pb-4 text-xs text-muted-foreground">O pagamento abre na página segura da Calebe Pay. Atrasou mais de {BILLING_GRACE_DAYS} dias? A conta é bloqueada até o pagamento.</p>}
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Planos</h2>
        {!data.paymentsReady && <Notice tone="info">Os planos pagos ficam disponíveis assim que os pagamentos forem ativados.</Notice>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.plans.map((p) => {
            const current = plan?.id === p.id;
            const paid = p.priceCents > 0;
            return (
              <div key={p.id} className={cx('flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs', current ? 'border-brand-solid ring-2 ring-[var(--ui-focus)]/30' : 'border-border')}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-lg font-extrabold">{p.name}</p>
                  {current && <Badge tone="brand">Atual</Badge>}
                </div>
                <p className="text-2xl font-extrabold tabular-nums">{planPriceLabel(p.priceCents, p.intervalMonths, formatCents)}</p>
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                <ul className="flex flex-col gap-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" aria-hidden /> {limitLabel(p.maxGroups, 'grupo', 'grupos')}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" aria-hidden /> {p.maxMembersPerGroup == null ? 'Pessoas ilimitadas por grupo' : `Até ${p.maxMembersPerGroup} pessoas por grupo`}
                  </li>
                </ul>
                <Button className="mt-auto" variant={current ? 'outline' : paid ? 'primary' : 'soft'} disabled={current || (paid && !data.paymentsReady) || data.status === 'blocked' || data.status === 'past_due'} onClick={() => setChoosing(p)}>
                  {current ? 'Seu plano' : paid ? 'Assinar' : 'Mudar para este'}
                </Button>
              </div>
            );
          })}
        </div>
        {(data.status === 'blocked' || data.status === 'past_due') && <p className="text-xs text-muted-foreground">Para mudar de plano, pague antes a mensalidade em atraso.</p>}
      </section>

      <ChoosePlan
        plan={choosing}
        profile={data.profile}
        email={user.email}
        name={user.name}
        onClose={() => setChoosing(null)}
        onDone={(v) => {
          setData(v);
          setChoosing(null);
          toast(v.plan?.priceCents ? 'Assinatura criada! Pague a primeira mensalidade para começar.' : 'Plano alterado');
        }}
      />
    </div>
  );
}

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {used}
          {max != null ? ` de ${max}` : ' · sem limite'}
        </span>
      </div>
      {max != null && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cx('h-full rounded-full', used >= max ? 'bg-spark-solid' : 'bg-brand-solid')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

const emptyProfile = (name: string, email: string): BillingProfile => ({ name, document: '', email, phone: '', address: { zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: '' } });

function ChoosePlan({ plan, profile, email, name, onClose, onDone }: { plan: PlanView | null; profile: BillingProfile | null; email: string; name: string; onClose: () => void; onDone: (v: BillingView) => void }) {
  const [method, setMethod] = useState<BillingMethod>('pix');
  const [form, setForm] = useState<BillingProfile>(profile ?? emptyProfile(name, email));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (plan) {
      setForm(profile ?? emptyProfile(name, email));
      setErr('');
    }
  }, [plan, profile, name, email]);
  if (!plan) return null;
  const paid = plan.priceCents > 0;
  const set = (patch: Partial<BillingProfile>) => setForm({ ...form, ...patch });
  const setAddr = (patch: Partial<BillingProfile['address']>) => setForm({ ...form, address: { ...form.address, ...patch } });

  async function save() {
    setSaving(true);
    setErr('');
    try {
      onDone(await api<BillingView>('/me/billing/subscribe', { method: 'POST', body: paid ? { planId: plan!.id, method, profile: form } : { planId: plan!.id } }));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      wide={paid}
      title={paid ? `Assinar o plano ${plan.name}` : `Mudar para o plano ${plan.name}`}
      description={paid ? `${planPriceLabel(plan.priceCents, plan.intervalMonths, formatCents)} · a primeira mensalidade vence hoje.` : 'A assinatura paga atual é cancelada; você continua com os grupos que cabem no plano.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            {paid ? 'Assinar' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <Notice tone="danger">{err}</Notice>}
        {paid && (
          <>
            <Field label="Como quer pagar todo mês?">
              <Segmented
                label="Forma de pagamento"
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'pix', label: 'Pix' },
                  { value: 'boleto', label: 'Boleto' },
                ]}
              />
            </Field>
            <p className="-mt-2 text-xs text-muted-foreground">
              Cada mês chega um link de pagamento. Prefere cartão? Em cada mensalidade há a opção “Cartão ou outra forma”. <ExternalLink className="inline h-3 w-3" aria-hidden /> Pagamentos pela Calebe Pay.
            </p>
            <div className="form-grid">
              <Field label="Nome completo ou razão social" htmlFor="b-name">
                <Input id="b-name" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} />
              </Field>
              <Field label="CPF ou CNPJ" htmlFor="b-doc">
                <Input id="b-doc" inputMode="numeric" value={form.document} onChange={(e) => set({ document: e.target.value })} maxLength={18} />
              </Field>
              <Field label="E-mail" htmlFor="b-email">
                <Input id="b-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
              </Field>
              <Field label="Celular com DDD" htmlFor="b-phone">
                <Input id="b-phone" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={16} />
              </Field>
              <Field label="CEP" htmlFor="b-zip">
                <Input id="b-zip" inputMode="numeric" value={form.address.zipCode} onChange={(e) => setAddr({ zipCode: e.target.value })} maxLength={9} />
              </Field>
              <Field label="Rua" htmlFor="b-street">
                <Input id="b-street" value={form.address.street} onChange={(e) => setAddr({ street: e.target.value })} />
              </Field>
              <Field label="Número" htmlFor="b-number">
                <Input id="b-number" value={form.address.number} onChange={(e) => setAddr({ number: e.target.value })} maxLength={20} />
              </Field>
              <Field label="Complemento (opcional)" htmlFor="b-comp">
                <Input id="b-comp" value={form.address.complement ?? ''} onChange={(e) => setAddr({ complement: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Bairro" htmlFor="b-district">
                <Input id="b-district" value={form.address.district} onChange={(e) => setAddr({ district: e.target.value })} />
              </Field>
              <Field label="Cidade" htmlFor="b-city">
                <Input id="b-city" value={form.address.city} onChange={(e) => setAddr({ city: e.target.value })} />
              </Field>
              <Field label="UF" htmlFor="b-uf">
                <Input id="b-uf" value={form.address.state} onChange={(e) => setAddr({ state: e.target.value.toUpperCase() })} maxLength={2} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Os dados vão para a Calebe Pay emitir as cobranças (Pix e boleto exigem CPF/CNPJ e endereço).</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
