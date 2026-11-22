'use client';
import { planPriceLabel } from '@tenace/rules';
import type { PlanInput, PlanView } from '@tenace/types';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, MoneyInput, Notice, Select, Spinner, Switch, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDay, formatCents } from '@/lib/format';
import { useApi } from '@/lib/use-api';

type AdminPlan = PlanView & { subscribers: number };
interface AdminSub {
  userId: string;
  name: string;
  email: string;
  plan: string | null;
  method: string | null;
  status: string;
  nextDueDate: string | null;
  livemode: boolean;
  blockedAt: string | null;
}

const emptyPlan = (): PlanInput => ({ name: '', description: '', priceCents: 0, intervalMonths: 1, maxGroups: 1, maxMembersPerGroup: 5, isDefault: false, active: true, sortOrder: 0 });
const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ok: { label: 'Em dia', tone: 'success' },
  due: { label: 'A vencer', tone: 'neutral' },
  past_due: { label: 'Em atraso', tone: 'warning' },
  blocked: { label: 'Bloqueada', tone: 'danger' },
};

/** Super-admin: plans (free to any price; limits = groups and people per group) and subscribers. */
export function AdminPlans() {
  const plans = useApi<{ plans: AdminPlan[] }>('/admin/plans');
  const subs = useApi<{ subscriptions: AdminSub[] }>('/admin/subscriptions');
  const [editing, setEditing] = useState<{ id: string | null; plan: PlanInput } | null>(null);

  if (plans.error && !plans.data) return <ErrorState error={plans.error} onRetry={plans.reload} />;
  if (!plans.data) return <Spinner />;
  const hasDefault = plans.data.plans.some((p) => p.isDefault);

  return (
    <div className="flex flex-col gap-5">
      {!hasDefault && (
        <Notice tone="warning" title="Nenhum plano padrão">
          Sem um plano padrão, quem não assina não tem limites. Crie um plano grátis e marque “Plano padrão”.
        </Notice>
      )}
      <Card
        title="Planos"
        description="Limites: quantos grupos a pessoa pode criar e quantas pessoas cabem em cada grupo dela. Vazio = ilimitado."
        actions={
          <Button size="sm" onClick={() => setEditing({ id: null, plan: emptyPlan() })}>
            <Plus className="h-4 w-4" aria-hidden /> Novo plano
          </Button>
        }
        padded={false}
      >
        {plans.data.plans.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhum plano ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {plans.data.plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {p.name}
                    {p.isDefault && <Badge tone="brand">Padrão</Badge>}
                    {!p.active && <Badge tone="neutral">Oculto</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {planPriceLabel(p.priceCents, p.intervalMonths, formatCents)} · {p.maxGroups ?? '∞'} {p.maxGroups === 1 ? 'grupo' : 'grupos'} · {p.maxMembersPerGroup ?? '∞'} pessoas/grupo · {p.subscribers} {p.subscribers === 1 ? 'assinante' : 'assinantes'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${p.name}`}
                  onClick={() => setEditing({ id: p.id, plan: { name: p.name, description: p.description, priceCents: p.priceCents, intervalMonths: p.intervalMonths, maxGroups: p.maxGroups, maxMembersPerGroup: p.maxMembersPerGroup, isDefault: p.isDefault, active: p.active, sortOrder: p.sortOrder } })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Assinaturas" description="Quem está em plano pago ou tem mensalidade." padded={false}>
        {!subs.data ? (
          <Spinner />
        ) : subs.data.subscriptions.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhuma assinatura ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {subs.data.subscriptions.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.email} · {s.plan ?? 'Plano padrão'}
                    {s.method ? ` · ${s.method === 'pix' ? 'Pix' : 'boleto'}` : ''}
                    {s.nextDueDate ? ` · próxima ${fmtDay(s.nextDueDate)}` : ''}
                    {s.method && !s.livemode ? ' · teste' : ''}
                  </p>
                </div>
                <Badge tone={STATUS[s.status]?.tone ?? 'neutral'}>{STATUS[s.status]?.label ?? s.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PlanEditor
        state={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void plans.reload();
        }}
      />
    </div>
  );
}

function PlanEditor({ state, onClose, onSaved }: { state: { id: string | null; plan: PlanInput } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<PlanInput | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const plan = form ?? state?.plan ?? null;
  if (!state || !plan) return null;
  const set = (patch: Partial<PlanInput>) => setForm({ ...plan, ...patch });
  const numOrNull = (v: string) => (v.replace(/\D/g, '') === '' ? null : Number(v.replace(/\D/g, '')));
  const close = () => {
    setForm(null);
    setErr('');
    onClose();
  };
  async function save() {
    setSaving(true);
    setErr('');
    try {
      await api(state!.id ? `/admin/plans/${state!.id}` : '/admin/plans', { method: state!.id ? 'PATCH' : 'POST', body: plan });
      toast('Plano salvo');
      setForm(null);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onClose={close} title={state.id ? 'Editar plano' : 'Novo plano'} description="Mudar o preço vale para novas assinaturas; quem já assina continua no valor contratado." footer={<Button onClick={save} loading={saving}>Salvar</Button>}>
      <div className="flex flex-col gap-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="form-grid">
          <Field label="Nome" htmlFor="pl-name">
            <Input id="pl-name" maxLength={60} value={plan.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Pro" />
          </Field>
          <Field label="Preço (0 = grátis)" htmlFor="pl-price">
            <MoneyInput id="pl-price" value={plan.priceCents} onChange={(c) => set({ priceCents: c ?? 0 })} />
          </Field>
          <Field label="Cobrança a cada" htmlFor="pl-interval">
            <Select id="pl-interval" value={plan.intervalMonths} onChange={(e) => set({ intervalMonths: Number(e.target.value) })}>
              <option value={1}>1 mês</option>
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </Select>
          </Field>
          <Field label="Ordem na vitrine" htmlFor="pl-order">
            <Input id="pl-order" inputMode="numeric" value={plan.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </Field>
          <Field label="Máximo de grupos" hint="Vazio = ilimitado" htmlFor="pl-groups">
            <Input id="pl-groups" inputMode="numeric" value={plan.maxGroups ?? ''} onChange={(e) => set({ maxGroups: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Pessoas por grupo" hint="Conta o dono. Vazio = ilimitado" htmlFor="pl-members">
            <Input id="pl-members" inputMode="numeric" value={plan.maxMembersPerGroup ?? ''} onChange={(e) => set({ maxMembersPerGroup: numOrNull(e.target.value) })} />
          </Field>
        </div>
        <Field label="Descrição (opcional)" htmlFor="pl-desc">
          <Input id="pl-desc" maxLength={300} value={plan.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Switch checked={plan.isDefault} onChange={(v) => set({ isDefault: v })} label="Plano padrão" description="Aplicado a quem não assina nenhum plano. Precisa ser grátis." />
        <Switch checked={plan.active} onChange={(v) => set({ active: v })} label="Visível para assinar" description="Planos ocultos continuam valendo para quem já está neles." />
      </div>
    </Dialog>
  );
}
