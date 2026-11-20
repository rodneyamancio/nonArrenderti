'use client';
import type { AccountView, FundView, MemberView, PaymentView } from '@tenace/types';
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { useGroup } from '@/components/app/group-context';
import { emitDataChanged, useOnDataChanged } from '@/components/app/session';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Input, Money, MoneyInput, Notice, Segmented, Select, Spinner, Stat, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx, ENTRY_LABELS, fmtDateTime, formatCents } from '@/lib/format';
import { uploadUrl } from '@/lib/image';
import { useApi } from '@/lib/use-api';

type Tab = 'minha' | 'caixa' | 'pagamentos';

export default function AccountPage() {
  return (
    <Suspense>
      <AccountTabs />
    </Suspense>
  );
}

function AccountTabs() {
  const { group, can } = useGroup();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get('tab') as Tab) || 'minha';
  const setTab = (t: Tab) => router.replace(`/g/${group.id}/conta${t === 'minha' ? '' : `?tab=${t}`}`, { scroll: false });
  const isAdmin = can('ledger:payment:confirm');
  return (
    <div className="flex flex-col gap-5">
      <Segmented
        label="Conta"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'minha', label: 'Conta corrente' },
          { value: 'caixa', label: 'Caixa do grupo' },
          ...(isAdmin ? [{ value: 'pagamentos' as Tab, label: `Pagamentos${group.pendingPayments ? ` (${group.pendingPayments})` : ''}` }] : []),
        ]}
      />
      {tab === 'minha' && <Statement />}
      {tab === 'caixa' && <Fund />}
      {tab === 'pagamentos' && isAdmin && <Payments />}
    </div>
  );
}

function Statement() {
  const { group } = useGroup();
  const [memberId, setMemberId] = useState(group.me.memberId);
  const members = useApi<{ members: MemberView[] }>(`/groups/${group.id}/members`).data?.members;
  const { data, error, reload } = useApi<AccountView>(`/groups/${group.id}/account?memberId=${memberId}`);
  useOnDataChanged(useCallback(() => void reload(), [reload]));
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const mine = memberId === group.me.memberId;

  return (
    <div className="flex flex-col gap-4">
      {members && members.length > 1 && (
        <Field label="Conta de" htmlFor="acc-member" className="max-w-xs">
          <Select id="acc-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === group.me.memberId ? `${m.name} (você)` : m.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Saldo total" value={<Money cents={data.balanceCents} signed />} hint="soma de todos os lançamentos" />
        <Stat label="Semana em andamento" value={<Money cents={data.weekCents} signed />} hint="vai zerando a cada cota" />
        <div className="col-span-2 lg:col-span-1">
          <Stat
            label={data.openDebtCents >= 0 ? 'Em aberto (a pagar)' : 'Crédito'}
            value={<span className={cx('tabular-nums', data.openDebtCents > 0 ? 'text-danger' : 'text-success')}>{formatCents(Math.abs(data.openDebtCents))}</span>}
            hint={data.pendingPaymentCents > 0 ? `${formatCents(data.pendingPaymentCents)} aguardando confirmação` : 'semanas já fechadas'}
          />
        </div>
      </div>
      {mine && data.openDebtCents > 0 && (
        <Link href={`/g/${group.id}/pagar`} className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft p-4">
          <span className="text-sm">
            Você tem <strong className="text-danger">{formatCents(data.openDebtCents)}</strong> para pagar a {group.destination.label}.
          </span>
          <Button variant="danger" size="sm">
            Pagar
          </Button>
        </Link>
      )}
      <Card title="Extrato" padded={false}>
        {data.entries.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Sem lançamentos ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', e.amountCents >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')} aria-hidden>
                  {e.amountCents >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {ENTRY_LABELS[e.type]} · {fmtDateTime(e.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <Money cents={e.amountCents} signed className="text-sm font-bold" />
                  <p className="text-xs text-muted-foreground tabular-nums">saldo {formatCents(e.balanceAfterCents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Fund() {
  const { group, can } = useGroup();
  const { data, error, reload } = useApi<FundView>(`/groups/${group.id}/fund`);
  const [dialog, setDialog] = useState<null | { kind: 'payment' | 'waive'; memberId: string; name: string; amount: number } | { kind: 'expense' }>(null);
  useOnDataChanged(useCallback(() => void reload(), [reload]));
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const d = group.destination;
  const admin = can('ledger:payment:confirm');

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em caixa" value={formatCents(data.cashCents)} hint="recebido − gasto" />
        <Stat label="A receber" value={<span className={data.receivableCents > 0 ? 'text-danger' : ''}>{formatCents(data.receivableCents)}</span>} hint="multas em aberto" />
        <Stat label="Arrecadado" value={formatCents(data.totalCollectedCents)} />
        <Stat label="Gasto" value={formatCents(data.totalSpentCents)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Card title="Destino do dinheiro">
            <p className="font-bold">{d.label}</p>
            {d.holderName && <p className="text-sm text-muted-foreground">{d.holderName}</p>}
            {d.pixKey && (
              <p className="mt-2 text-sm">
                PIX: <span className="font-mono">{d.pixKey}</span>
              </p>
            )}
            {d.bankInfo && <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{d.bankInfo}</p>}
            {can('fund:expense:create') && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setDialog({ kind: 'expense' })}>
                <Receipt className="h-4 w-4" aria-hidden /> Registrar saída
              </Button>
            )}
          </Card>
          <Card title="Quem está devendo">
            {data.debtors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém em aberto. Que turma! 🎉</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.debtors.map((x) => (
                  <li key={x.memberId} className="flex flex-wrap items-center gap-3">
                    <Avatar name={x.name} color={x.avatarColor} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{x.name}</span>
                    <span className="text-sm font-bold text-danger tabular-nums">{formatCents(x.openDebtCents)}</span>
                    {admin && (
                      <div className="flex w-full gap-2 pl-10 sm:w-auto sm:pl-0">
                        <Button size="sm" variant="soft" onClick={() => setDialog({ kind: 'payment', memberId: x.memberId, name: x.name, amount: x.openDebtCents })}>
                          Recebi
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'waive', memberId: x.memberId, name: x.name, amount: x.openDebtCents })}>
                          Abonar
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Movimentações do caixa" padded={false}>
          {data.entries.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Nenhuma movimentação ainda. As multas entram aqui quando a semana fecha.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {ENTRY_LABELS[e.type]} · {fmtDateTime(e.createdAt)}
                      {e.receiptUploadId && (
                        <>
                          {' · '}
                          <a href={uploadUrl(group.id, e.receiptUploadId)} target="_blank" rel="noreferrer" className="text-brand underline">
                            comprovante
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    {e.cashDeltaCents !== 0 && <Money cents={e.cashDeltaCents} signed className="block font-bold" />}
                    {e.receivableDeltaCents !== 0 && <span className="block text-xs text-muted-foreground">a receber {e.receivableDeltaCents > 0 ? '+' : ''}{formatCents(e.receivableDeltaCents)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <FundDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function FundDialog({ state, onClose }: { state: null | { kind: 'payment' | 'waive'; memberId: string; name: string; amount: number } | { kind: 'expense' }; onClose: () => void }) {
  const { group } = useGroup();
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const initial = state && state.kind !== 'expense' ? state.amount : null;
  const value = amount ?? initial;
  const close = () => {
    setAmount(null);
    setText('');
    setErr('');
    onClose();
  };
  async function save() {
    if (!state || !value) return setErr('Informe o valor');
    setSaving(true);
    setErr('');
    try {
      if (state.kind === 'payment') await api(`/groups/${group.id}/payments`, { method: 'POST', body: { amountCents: value, memberId: state.memberId, note: text } });
      else if (state.kind === 'waive') await api(`/groups/${group.id}/adjustments`, { method: 'POST', body: { memberId: state.memberId, amountCents: value, reason: text || 'Abono' } });
      else await api(`/groups/${group.id}/expenses`, { method: 'POST', body: { amountCents: value, description: text } });
      toast('Lançamento registrado');
      emitDataChanged();
      close();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const title = !state ? '' : state.kind === 'payment' ? `Pagamento de ${state.name}` : state.kind === 'waive' ? `Abonar ${state.name}` : 'Saída do caixa';
  return (
    <Dialog open={!!state} onClose={close} title={title} description={state?.kind === 'payment' ? 'Confirma que o dinheiro chegou no destino.' : state?.kind === 'waive' ? 'Perdoa parte ou toda a dívida (ex.: estava doente).' : 'Ex.: churrasco, doação enviada.'} footer={<Button onClick={save} loading={saving}>Registrar</Button>}>
      <div className="flex flex-col gap-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Valor" htmlFor="fd-amount">
          <MoneyInput id="fd-amount" value={value} onChange={setAmount} />
        </Field>
        <Field label={state?.kind === 'expense' ? 'Descrição' : state?.kind === 'waive' ? 'Motivo' : 'Observação (opcional)'} htmlFor="fd-text">
          <Input id="fd-text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function Payments() {
  const { group } = useGroup();
  const toast = useToast();
  const { data, error, reload } = useApi<{ payments: PaymentView[] }>(`/groups/${group.id}/payments`);
  useOnDataChanged(useCallback(() => void reload(), [reload]));
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const pending = data.payments.filter((p) => p.status === 'pending');
  const done = data.payments.filter((p) => p.status !== 'pending');

  async function decide(p: PaymentView, action: 'confirm' | 'reject') {
    try {
      await api(`/groups/${group.id}/payments/${p.id}/${action}`, { method: 'POST' });
      toast(action === 'confirm' ? 'Pagamento confirmado ✅' : 'Pagamento recusado');
      emitDataChanged();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  const row = (p: PaymentView) => (
    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {p.memberName} · <span className="tabular-nums">{formatCents(p.amountCents)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {fmtDateTime(p.declaredAt)}
          {p.note && ` · ${p.note}`}
          {p.receiptUploadId && (
            <>
              {' · '}
              <a href={uploadUrl(group.id, p.receiptUploadId)} target="_blank" rel="noreferrer" className="text-brand underline">
                comprovante
              </a>
            </>
          )}
          {p.decidedByName && ` · ${p.status === 'confirmed' ? 'confirmado' : 'recusado'} por ${p.decidedByName}`}
        </p>
      </div>
      {p.status === 'pending' ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide(p, 'confirm')}>
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => decide(p, 'reject')}>
            Recusar
          </Button>
        </div>
      ) : (
        <Badge tone={p.status === 'confirmed' ? 'success' : 'danger'}>{p.status === 'confirmed' ? 'Confirmado' : 'Recusado'}</Badge>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card title="Aguardando confirmação" description="Confira se o PIX chegou antes de confirmar." padded={false}>
        {pending.length === 0 ? <EmptyState title="Nada pendente" description="Quando alguém informar um pagamento, ele aparece aqui." /> : <ul className="divide-y divide-border">{pending.map(row)}</ul>}
      </Card>
      {done.length > 0 && (
        <Card title="Histórico" padded={false}>
          <ul className="divide-y divide-border">{done.map(row)}</ul>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Os valores são só controle: o dinheiro circula por PIX, fora do app.</p>
    </div>
  );
}
