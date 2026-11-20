import { errorMessage } from '@tenace/api-client';
import type { CheckInView, FeedItem } from '@tenace/types';
import { Image } from 'expo-image';
import { Flag, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation } from '@/data/use-api';
import { uploadUrl } from '@/features/photos/photos';
import { emitDataChanged, onDataChanged } from '@/lib/events';
import { fmtDay, isTimes, timeAgo, unitLabel } from '@/lib/format';
import { api, useSession } from '@/session/provider';
import { StaleSessionError } from '@/session/session';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Notice, T, useToast } from '@/ui/kit';
import { Sheet } from '@/ui/sheet';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';
import { useGroup } from './group-context';

const REACTIONS = ['👏', '🔥', '💪', '😂', '❤️'];

export function FeedSection() {
  const { group } = useGroup();
  const [items, setItems] = useState<FeedItem[]>();
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [contesting, setContesting] = useState<CheckInView | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: FeedItem[]; nextBefore: string | null }>(`/groups/${group.id}/feed`);
      setItems(r.items);
      setNext(r.nextBefore);
      setError(undefined);
    } catch (e) {
      if (!(e instanceof StaleSessionError)) setError(e);
    }
  }, [group.id]);
  useEffect(() => void load(), [load]);
  useEffect(() => onDataChanged(() => void load()), [load]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await api<{ items: FeedItem[]; nextBefore: string | null }>(`/groups/${group.id}/feed?before=${encodeURIComponent(next)}`);
      setItems((xs) => [...(xs ?? []), ...r.items]);
      setNext(r.nextBefore);
    } catch {
      /* keeps what is on screen */
    } finally {
      setLoadingMore(false);
    }
  }

  if (!items) return error ? <ErrorState error={error} onRetry={load} /> : <Loading />;
  if (items.length === 0) return <EmptyState emoji="📣" title="Nada por aqui ainda" description="Os registros, pagamentos e fechamentos de semana aparecem aqui." />;

  return (
    <View style={{ gap: 12 }}>
      {items.map((i) => (i.checkIn ? <CheckInPost key={i.id} item={i} c={i.checkIn} onChange={load} onContest={() => setContesting(i.checkIn)} /> : <EventRow key={i.id} item={i} />))}
      {next && <Button label="Carregar mais" variant="outline" loading={loadingMore} onPress={more} style={{ alignSelf: 'center' }} />}
      <ContestSheet c={contesting} onClose={() => setContesting(null)} onDone={load} />
    </View>
  );
}

function EventRow({ item }: { item: FeedItem }) {
  const { c } = useTheme();
  const icon = item.type === 'week_closed' ? '🏁' : item.type === 'payment_confirmed' ? '💸' : item.type === 'goal_changed' ? '🎯' : item.type === 'expense' ? '🧾' : item.type.startsWith('contest') ? '⚖️' : '👋';
  const lower = !!item.text && /^[a-zà-ú]/.test(item.text);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <T size={14} style={{ flex: 1, paddingTop: 7 }}>
        {lower && item.actorName ? <T size={14} weight="semibold">{`${item.actorName} `}</T> : null}
        {item.text}
        <T size={12} tone="muted">{`  · ${timeAgo(item.createdAt)}`}</T>
      </T>
    </View>
  );
}

function CheckInPost({ item, c: ci, onChange, onContest }: { item: FeedItem; c: CheckInView; onChange: () => void; onContest: () => void }) {
  const { group, can } = useGroup();
  const { c } = useTheme();
  const session = useSession();
  const toast = useToast();
  const { busy, run } = useMutation();
  const mine = ci.memberId === group.me.memberId;
  const open = ci.contests.find((x) => x.status === 'open');

  async function react(emoji: string) {
    try {
      await api(`/groups/${group.id}/checkins/${ci.id}/reactions`, { method: 'POST', body: { emoji } });
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  function remove() {
    Alert.alert('Apagar este registro?', 'A cota paga por ele é estornada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/groups/${group.id}/checkins/${ci.id}`, { method: 'DELETE' });
            toast('Registro apagado');
            emitDataChanged();
          } catch (e) {
            toast(errorMessage(e), 'danger');
          }
        },
      },
    ]);
  }
  const resolve = (decision: 'uphold' | 'dismiss') =>
    run(async () => {
      if (!open) return;
      try {
        await api(`/groups/${group.id}/contests/${open.id}/resolve`, { method: 'POST', body: { decision } });
        toast(decision === 'uphold' ? 'Registro invalidado' : 'Registro mantido');
        emitDataChanged();
      } catch (e) {
        toast(errorMessage(e), 'danger');
      }
    });

  return (
    <Card style={open ? { borderColor: c.warning } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Avatar name={ci.memberName} color={ci.avatarColor} />
        <View style={{ flex: 1 }}>
          <T size={14}>
            <T size={14} weight="semibold">
              {ci.memberName}
            </T>
            {' registrou '}
            <T size={14} weight="semibold">{`${ci.goalEmoji} ${ci.goalName}`}</T>
          </T>
          <T size={12} tone="muted">
            {timeAgo(item.createdAt)}
            {ci.date !== item.createdAt.slice(0, 10) ? ` · referente a ${fmtDay(ci.date)}` : ''}
          </T>
        </View>
        {!isTimes(ci.unit) && (
          <Badge tone="brand">
            {ci.quantity} {unitLabel(ci.unit, ci.quantity)}
          </Badge>
        )}
      </View>
      {ci.status === 'invalidated' && <Badge tone="danger">Invalidado após contestação</Badge>}
      {!ci.counted && ci.status === 'valid' && (
        <T size={12} tone="muted">
          Não conta cota (fora da semana cobrada)
        </T>
      )}
      {!!ci.note && (
        <T size={15} style={ci.status === 'invalidated' ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>
          {ci.note}
        </T>
      )}
      {ci.photoUploadId && (
        <Image
          source={{ uri: uploadUrl(group.id, ci.photoUploadId), headers: session.authHeaders() }}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: c.surfaceSunken }}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`Foto de ${ci.memberName}`}
        />
      )}
      {ci.contests.map((ct) => (
        <View key={ct.id} style={{ backgroundColor: ct.status === 'open' ? c.warningSoft : c.surfaceSunken, borderRadius: radius.md, padding: 12, gap: 6 }}>
          <T size={14}>
            {'⚖️ '}
            <T size={14} weight="bold">
              {ct.openedByName}
            </T>
            {` contestou: “${ct.reason}”`}
          </T>
          {ct.status !== 'open' && (
            <T size={12} tone="muted">
              {ct.status === 'upheld' ? 'Aceita' : 'Rejeitada'} por {ct.resolvedByName}
              {ct.resolutionNote ? ` — ${ct.resolutionNote}` : ''}
            </T>
          )}
          {ct.status === 'open' && can('checkin:contest:resolve') && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button label="Invalidar registro" size="sm" variant="danger" loading={busy} onPress={() => resolve('uphold')} />
              <Button label="Manter registro" size="sm" variant="outline" disabled={busy} onPress={() => resolve('dismiss')} />
            </View>
          )}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {REACTIONS.map((e) => {
          const r = ci.reactions.find((x) => x.emoji === e);
          return (
            <Pressable
              key={e}
              onPress={() => react(e)}
              accessibilityRole="button"
              accessibilityLabel={`Reagir com ${e}`}
              accessibilityState={{ selected: !!r?.mine }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: r?.mine ? c.brandSolid : 'transparent', backgroundColor: r?.mine ? c.brandSoft : 'transparent', opacity: r ? 1 : 0.6 }}
            >
              <Text style={{ fontSize: 16 }}>{e}</Text>
              {r && (
                <T size={12} weight="semibold">
                  {r.count}
                </T>
              )}
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        {mine && ci.status === 'valid' && (
          <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel="Apagar registro" hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={18} color={c.textMuted} />
          </Pressable>
        )}
        {!mine && ci.status === 'valid' && !open && <Button label="Contestar" size="sm" variant="ghost" icon={Flag} onPress={onContest} />}
      </View>
    </Card>
  );
}

function ContestSheet({ c: ci, onClose, onDone }: { c: CheckInView | null; onClose: () => void; onDone: () => void }) {
  const { group } = useGroup();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const { busy, run } = useMutation();
  const submit = () =>
    run(async () => {
      if (!ci) return;
      setErr('');
      try {
        await api(`/groups/${group.id}/checkins/${ci.id}/contests`, { method: 'POST', body: { reason } });
        toast('Contestação enviada aos admins');
        setReason('');
        onClose();
        onDone();
      } catch (e) {
        setErr(errorMessage(e));
      }
    });
  return (
    <Sheet
      open={!!ci}
      onClose={onClose}
      title="Contestar registro"
      description="O registro continua valendo até um admin decidir."
      footer={
        <>
          <Button label="Cancelar" variant="ghost" onPress={onClose} />
          <Button label="Enviar contestação" loading={busy} disabled={reason.trim().length < 3} onPress={submit} />
        </>
      }
    >
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {ci && (
        <T size={14} tone="muted">
          {ci.memberName} · {ci.goalEmoji} {ci.goalName} · {fmtDay(ci.date)}
        </T>
      )}
      <Field label="Por quê?">
        <Input multiline maxLength={300} placeholder="Ex.: a foto é de outro dia…" value={reason} onChangeText={setReason} accessibilityLabel="Motivo da contestação" />
      </Field>
    </Sheet>
  );
}
