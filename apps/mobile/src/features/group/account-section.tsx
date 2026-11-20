import { errorMessage } from '@tenace/api-client';
import type { AccountView, FundView, MemberView, PaymentView } from '@tenace/types';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useApi, useMutation } from '@/data/use-api';
import { uploadUrl } from '@/features/photos/photos';
import { emitDataChanged } from '@/lib/events';
import { ENTRY_LABELS, fmtDateTime, formatCents } from '@/lib/format';
import { ACCOUNT_TABS, type AccountTab } from '@/navigation/sections';
import { api, useSession } from '@/session/provider';
import { Avatar, Badge, Button, Card, Chip, Divider, EmptyState, ErrorState, Field, Input, LinkText, Loading, Money, MoneyInput, Notice, Segmented, Stat, T, useToast } from '@/ui/kit';
import { Sheet } from '@/ui/sheet';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';
import { useGroup } from './group-context';

export function AccountSection({ initialTab }: { initialTab?: AccountTab }) {
  const { group, can } = useGroup();
  const isAdmin = can('ledger:payment:confirm');
  const [tab, setTab] = useState<AccountTab>(initialTab && (initialTab !== 'pagamentos' || isAdmin) ? initialTab : 'minha');
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const options = ACCOUNT_TABS.filter((t) => t.key !== 'pagamentos' || isAdmin).map((t) => ({ value: t.key, label: t.key === 'pagamentos' && group.pendingPayments ? `${t.label} (${group.pendingPayments})` : t.label }));
  return (
    <View style={{ gap: 16 }}>
      <Segmented label="Conta" value={tab} onChange={setTab} options={options} />
      {tab === 'minha' && <Statement />}
      {tab === 'caixa' && <Fund />}
      {tab === 'pagamentos' && isAdmin && <Payments />}
    </View>
  );
}

function Statement() {
  const { group } = useGroup();
  const { c } = useTheme();
  const [memberId, setMemberId] = useState(group.me.memberId);
  const members = useApi<{ members: MemberView[] }>(`/groups/${group.id}/members`).data?.members;
  const { data, error, reload } = useApi<AccountView>(`/groups/${group.id}/account?memberId=${memberId}`);
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;
  const mine = memberId === group.me.memberId;

  return (
    <View style={{ gap: 14 }}>
      {members && members.length > 1 && (
        <View style={{ gap: 8 }}>
          <T size={14} weight="semibold">
            Conta de
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {members.map((m) => (
              <Chip key={m.id} active={m.id === memberId} onPress={() => setMemberId(m.id)}>
                {m.id === group.me.memberId ? `${m.name} (você)` : m.name}
              </Chip>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="Saldo total" value={<Money cents={data.balanceCents} signed size={20} weight="extrabold" />} hint="soma de todos os lançamentos" />
        <Stat label="Semana em andamento" value={<Money cents={data.weekCents} signed size={20} weight="extrabold" />} hint="vai zerando a cada cota" />
        <Stat
          label={data.openDebtCents >= 0 ? 'Em aberto (a pagar)' : 'Crédito'}
          value={
            <T size={20} weight="extrabold" tone={data.openDebtCents > 0 ? 'danger' : 'success'}>
              {formatCents(Math.abs(data.openDebtCents))}
            </T>
          }
          hint={data.pendingPaymentCents > 0 ? `${formatCents(data.pendingPaymentCents)} aguardando confirmação` : 'semanas já fechadas'}
        />
      </View>
      {mine && data.openDebtCents > 0 && (
        <Pressable onPress={() => router.push({ pathname: '/g/[groupId]/pagar', params: { groupId: group.id } })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.dangerSoft, borderRadius: radius.lg, padding: 14 }}>
          <T size={14} style={{ flex: 1 }}>
            Você tem{' '}
            <T size={14} weight="bold" tone="danger">
              {formatCents(data.openDebtCents)}
            </T>{' '}
            para pagar a {group.destination.label}.
          </T>
          <Button label="Pagar" variant="danger" size="sm" onPress={() => router.push({ pathname: '/g/[groupId]/pagar', params: { groupId: group.id } })} />
        </Pressable>
      )}
      <Card title="Extrato" padded={false}>
        {data.entries.length === 0 ? (
          <T size={14} tone="muted" style={{ padding: 16 }}>
            Sem lançamentos ainda.
          </T>
        ) : (
          data.entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: e.amountCents >= 0 ? c.successSoft : c.dangerSoft }}>{e.amountCents >= 0 ? <ArrowDownLeft size={16} color={c.success} /> : <ArrowUpRight size={16} color={c.danger} />}</View>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="medium" numberOfLines={2}>
                    {e.description}
                  </T>
                  <T size={12} tone="muted">
                    {ENTRY_LABELS[e.type]} · {fmtDateTime(e.createdAt)}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Money cents={e.amountCents} signed size={14} />
                  <T size={12} tone="muted">
                    saldo {formatCents(e.balanceAfterCents)}
                  </T>
                </View>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

type FundDialog = null | { kind: 'payment' | 'waive'; memberId: string; name: string; amount: number } | { kind: 'expense' };

function Fund() {
  const { group, can } = useGroup();
  const session = useSession();
  const { data, error, reload } = useApi<FundView>(`/groups/${group.id}/fund`);
  const [dialog, setDialog] = useState<FundDialog>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;
  const d = group.destination;
  const admin = can('ledger:payment:confirm');

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="Em caixa" value={formatCents(data.cashCents)} hint="recebido − gasto" />
        <Stat
          label="A receber"
          value={
            <T size={20} weight="extrabold" tone={data.receivableCents > 0 ? 'danger' : 'default'}>
              {formatCents(data.receivableCents)}
            </T>
          }
          hint="multas em aberto"
        />
        <Stat label="Arrecadado" value={formatCents(data.totalCollectedCents)} />
        <Stat label="Gasto" value={formatCents(data.totalSpentCents)} />
      </View>

      <Card title="Destino do dinheiro">
        <View>
          <T weight="bold">{d.label}</T>
          {!!d.holderName && (
            <T size={14} tone="muted">
              {d.holderName}
            </T>
          )}
          {!!d.pixKey && <T size={14} style={{ marginTop: 6 }}>{`PIX: ${d.pixKey}`}</T>}
          {!!d.bankInfo && (
            <T size={14} tone="muted" style={{ marginTop: 4 }}>
              {d.bankInfo}
            </T>
          )}
        </View>
        {can('fund:expense:create') && <Button label="Registrar saída" variant="outline" size="sm" icon={Receipt} onPress={() => setDialog({ kind: 'expense' })} style={{ alignSelf: 'flex-start' }} />}
      </Card>

      <Card title="Quem está devendo">
        {data.debtors.length === 0 ? (
          <T size={14} tone="muted">
            Ninguém em aberto. Que turma! 🎉
          </T>
        ) : (
          data.debtors.map((x) => (
            <View key={x.memberId} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={x.name} color={x.avatarColor} size={32} />
                <T size={14} weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                  {x.name}
                </T>
                <T size={14} weight="bold" tone="danger">
                  {formatCents(x.openDebtCents)}
                </T>
              </View>
              {admin && (
                <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 42 }}>
                  <Button label="Recebi" size="sm" variant="soft" onPress={() => setDialog({ kind: 'payment', memberId: x.memberId, name: x.name, amount: x.openDebtCents })} />
                  <Button label="Abonar" size="sm" variant="ghost" onPress={() => setDialog({ kind: 'waive', memberId: x.memberId, name: x.name, amount: x.openDebtCents })} />
                </View>
              )}
            </View>
          ))
        )}
      </Card>

      <Card title="Movimentações do caixa" padded={false}>
        {data.entries.length === 0 ? (
          <T size={14} tone="muted" style={{ padding: 16 }}>
            Nenhuma movimentação ainda. As multas entram aqui quando a semana fecha.
          </T>
        ) : (
          data.entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="medium" numberOfLines={2}>
                    {e.description}
                  </T>
                  <T size={12} tone="muted">
                    {ENTRY_LABELS[e.type]} · {fmtDateTime(e.createdAt)}
                  </T>
                  {e.receiptUploadId && (
                    <LinkText size={12} onPress={() => setReceipt(e.receiptUploadId)}>
                      comprovante
                    </LinkText>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {e.cashDeltaCents !== 0 && <Money cents={e.cashDeltaCents} signed size={14} />}
                  {e.receivableDeltaCents !== 0 && (
                    <T size={12} tone="muted">
                      a receber {e.receivableDeltaCents > 0 ? '+' : ''}
                      {formatCents(e.receivableDeltaCents)}
                    </T>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </Card>
      <FundSheet state={dialog} onClose={() => setDialog(null)} />
      <ReceiptSheet groupId={group.id} uploadId={receipt} headers={session.authHeaders()} onClose={() => setReceipt(null)} />
    </View>
  );
}

function FundSheet({ state, onClose }: { state: FundDialog; onClose: () => void }) {
  const { group } = useGroup();
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const { busy, run } = useMutation();
  const initial = state && state.kind !== 'expense' ? state.amount : null;
  const value = amount ?? initial;
  const close = () => {
    setAmount(null);
    setText('');
    setErr('');
    onClose();
  };
  const save = () =>
    run(async () => {
      if (!state || !value) return setErr('Informe o valor');
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
      }
    });
  const title = !state ? '' : state.kind === 'payment' ? `Pagamento de ${state.name}` : state.kind === 'waive' ? `Abonar ${state.name}` : 'Saída do caixa';
  const description = state?.kind === 'payment' ? 'Confirma que o dinheiro chegou no destino.' : state?.kind === 'waive' ? 'Perdoa parte ou toda a dívida (ex.: estava doente).' : 'Ex.: churrasco, doação enviada.';
  return (
    <Sheet open={!!state} onClose={close} title={title} description={description} footer={<Button label="Registrar" loading={busy} onPress={save} style={{ flex: 1 }} />}>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Field label="Valor">
        <MoneyInput value={value} onChange={setAmount} accessibilityLabel="Valor" />
      </Field>
      <Field label={state?.kind === 'expense' ? 'Descrição' : state?.kind === 'waive' ? 'Motivo' : 'Observação (opcional)'}>
        <Input maxLength={200} value={text} onChangeText={setText} />
      </Field>
    </Sheet>
  );
}

function ReceiptSheet({ groupId, uploadId, headers, onClose }: { groupId: string; uploadId: string | null; headers: Record<string, string>; onClose: () => void }) {
  return (
    <Sheet open={!!uploadId} onClose={onClose} title="Comprovante">
      {uploadId && <Image source={{ uri: uploadUrl(groupId, uploadId), headers }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md }} contentFit="contain" accessibilityLabel="Comprovante" />}
    </Sheet>
  );
}

function Payments() {
  const { group } = useGroup();
  const session = useSession();
  const toast = useToast();
  const { data, error, reload } = useApi<{ payments: PaymentView[] }>(`/groups/${group.id}/payments`);
  const [receipt, setReceipt] = useState<string | null>(null);
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;
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

  const row = (p: PaymentView, i: number) => (
    <View key={p.id}>
      {i > 0 && <Divider />}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        <View>
          <T size={14} weight="semibold">
            {p.memberName} · {formatCents(p.amountCents)}
          </T>
          <T size={12} tone="muted">
            {fmtDateTime(p.declaredAt)}
            {p.note ? ` · ${p.note}` : ''}
            {p.decidedByName ? ` · ${p.status === 'confirmed' ? 'confirmado' : 'recusado'} por ${p.decidedByName}` : ''}
          </T>
          {p.receiptUploadId && (
            <LinkText size={12} onPress={() => setReceipt(p.receiptUploadId)}>
              comprovante
            </LinkText>
          )}
        </View>
        {p.status === 'pending' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Confirmar" size="sm" onPress={() => decide(p, 'confirm')} />
            <Button label="Recusar" size="sm" variant="ghost" onPress={() => decide(p, 'reject')} />
          </View>
        ) : (
          <Badge tone={p.status === 'confirmed' ? 'success' : 'danger'}>{p.status === 'confirmed' ? 'Confirmado' : 'Recusado'}</Badge>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      <Card title="Aguardando confirmação" description="Confira se o PIX chegou antes de confirmar." padded={false}>
        {pending.length === 0 ? <EmptyState title="Nada pendente" description="Quando alguém informar um pagamento, ele aparece aqui." /> : pending.map(row)}
      </Card>
      {done.length > 0 && (
        <Card title="Histórico" padded={false}>
          {done.map(row)}
        </Card>
      )}
      <T size={12} tone="muted">
        Os valores são só controle: o dinheiro circula por PIX, fora do app.
      </T>
      <ReceiptSheet groupId={group.id} uploadId={receipt} headers={session.authHeaders()} onClose={() => setReceipt(null)} />
    </View>
  );
}
