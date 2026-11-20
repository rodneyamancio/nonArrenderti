'use client';
import type { CheckInView, FeedItem } from '@tenace/types';
import { Flag, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useGroup } from '@/components/app/group-context';
import { emitDataChanged, useOnDataChanged } from '@/components/app/session';
import { Avatar, Badge, Button, Dialog, EmptyState, ErrorState, Field, Notice, Spinner, Textarea, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx, fmtDay, timeAgo, isTimes, unitLabel } from '@/lib/format';
import { uploadUrl } from '@/lib/image';

const REACTIONS = ['👏', '🔥', '💪', '😂', '❤️'];

export default function FeedPage() {
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
      setError(e);
    }
  }, [group.id]);
  useEffect(() => void load(), [load]);
  useOnDataChanged(useCallback(() => void load(), [load]));

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await api<{ items: FeedItem[]; nextBefore: string | null }>(`/groups/${group.id}/feed?before=${encodeURIComponent(next)}`);
      setItems((xs) => [...(xs ?? []), ...r.items]);
      setNext(r.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !items) return <ErrorState error={error} onRetry={load} />;
  if (!items) return <Spinner />;
  if (items.length === 0) return <EmptyState icon={<span className="text-xl">📣</span>} title="Nada por aqui ainda" description="Os registros, pagamentos e fechamentos de semana aparecem aqui." />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      {items.map((i) => (i.checkIn ? <CheckInPost key={i.id} item={i} c={i.checkIn} onChange={load} onContest={() => setContesting(i.checkIn)} /> : <EventRow key={i.id} item={i} />))}
      {next && (
        <Button variant="outline" onClick={more} loading={loadingMore} className="self-center">
          Carregar mais
        </Button>
      )}
      <ContestDialog c={contesting} onClose={() => setContesting(null)} onDone={load} />
    </div>
  );
}

function sentence(item: FeedItem) {
  const lower = item.text && item.text[0] === item.text[0]!.toLowerCase() && /^[a-zà-ú]/.test(item.text);
  return lower && item.actorName ? (
    <>
      <strong className="font-semibold">{item.actorName}</strong> {item.text}
    </>
  ) : (
    item.text
  );
}

function EventRow({ item }: { item: FeedItem }) {
  const icon = item.type === 'week_closed' ? '🏁' : item.type === 'payment_confirmed' ? '💸' : item.type === 'goal_changed' ? '🎯' : item.type === 'expense' ? '🧾' : item.type.startsWith('contest') ? '⚖️' : '👋';
  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base" aria-hidden>
        {icon}
      </span>
      <p className="min-w-0 flex-1 pt-1.5 text-muted-foreground">
        <span className="text-foreground">{sentence(item)}</span> · <span className="text-xs">{timeAgo(item.createdAt)}</span>
      </p>
    </div>
  );
}

function CheckInPost({ item, c, onChange, onContest }: { item: FeedItem; c: CheckInView; onChange: () => void; onContest: () => void }) {
  const { group, can } = useGroup();
  const toast = useToast();
  const mine = c.memberId === group.me.memberId;
  const open = c.contests.find((x) => x.status === 'open');
  const [busy, setBusy] = useState(false);

  async function react(emoji: string) {
    try {
      await api(`/groups/${group.id}/checkins/${c.id}/reactions`, { method: 'POST', body: { emoji } });
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  async function remove() {
    if (!confirm('Apagar este registro? A cota paga por ele é estornada.')) return;
    try {
      await api(`/groups/${group.id}/checkins/${c.id}`, { method: 'DELETE' });
      toast('Registro apagado');
      emitDataChanged();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  async function resolve(decision: 'uphold' | 'dismiss') {
    if (!open) return;
    setBusy(true);
    try {
      await api(`/groups/${group.id}/contests/${open.id}/resolve`, { method: 'POST', body: { decision } });
      toast(decision === 'uphold' ? 'Registro invalidado' : 'Registro mantido');
      emitDataChanged();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={cx('animate-in rounded-xl border bg-card p-4 shadow-xs', open ? 'border-warning' : 'border-border')}>
      <header className="flex items-start gap-3">
        <Avatar name={c.memberName} color={c.avatarColor} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <strong className="font-semibold">{c.memberName}</strong> registrou{' '}
            <span className="font-semibold">
              {c.goalEmoji} {c.goalName}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {timeAgo(item.createdAt)}
            {c.date !== item.createdAt.slice(0, 10) && <> · referente a {fmtDay(c.date)}</>}
          </p>
        </div>
        {!isTimes(c.unit) && (
          <Badge tone="brand" className="text-sm">
            {c.quantity} {unitLabel(c.unit, c.quantity)}
          </Badge>
        )}
      </header>
      {c.status === 'invalidated' && (
        <div className="mt-3">
          <Badge tone="danger">Invalidado após contestação</Badge>
        </div>
      )}
      {!c.counted && c.status === 'valid' && <p className="mt-2 text-xs text-muted-foreground">Não conta cota (fora da semana cobrada)</p>}
      {c.note && <p className={cx('mt-3 text-[0.95rem] leading-relaxed', c.status === 'invalidated' && 'line-through opacity-60')}>{c.note}</p>}
      {c.photoUploadId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploadUrl(group.id, c.photoUploadId)} alt={`Foto de ${c.memberName}`} loading="lazy" className="mt-3 max-h-96 w-full rounded-lg object-cover" />
      )}
      {c.contests.map((ct) => (
        <div key={ct.id} className={cx('mt-3 rounded-lg px-3 py-2 text-sm', ct.status === 'open' ? 'bg-warning-soft' : 'bg-muted')}>
          <p>
            ⚖️ <strong>{ct.openedByName}</strong> contestou: “{ct.reason}”
          </p>
          {ct.status !== 'open' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {ct.status === 'upheld' ? 'Aceita' : 'Rejeitada'} por {ct.resolvedByName}
              {ct.resolutionNote && ` — ${ct.resolutionNote}`}
            </p>
          )}
          {ct.status === 'open' && can('checkin:contest:resolve') && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="danger" loading={busy} onClick={() => resolve('uphold')}>
                Invalidar registro
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve('dismiss')}>
                Manter registro
              </Button>
            </div>
          )}
        </div>
      ))}
      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {REACTIONS.map((e) => {
          const r = c.reactions.find((x) => x.emoji === e);
          return (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              aria-pressed={!!r?.mine}
              aria-label={`Reagir com ${e}`}
              className={cx('inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors', r?.mine ? 'border-brand-solid bg-brand-soft' : 'border-transparent hover:bg-accent', !r && 'opacity-60 hover:opacity-100')}
            >
              {e}
              {r && <span className="text-xs font-semibold tabular-nums">{r.count}</span>}
            </button>
          );
        })}
        <span className="flex-1" />
        {mine && c.status === 'valid' && (
          <Button variant="ghost" size="sm" onClick={remove} aria-label="Apagar registro">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {!mine && c.status === 'valid' && !open && (
          <Button variant="ghost" size="sm" onClick={onContest}>
            <Flag className="h-4 w-4" aria-hidden /> Contestar
          </Button>
        )}
      </footer>
    </article>
  );
}

function ContestDialog({ c, onClose, onDone }: { c: CheckInView | null; onClose: () => void; onDone: () => void }) {
  const { group } = useGroup();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!c) return;
    setSaving(true);
    setErr('');
    try {
      await api(`/groups/${group.id}/checkins/${c.id}/contests`, { method: 'POST', body: { reason } });
      toast('Contestação enviada aos admins');
      setReason('');
      onClose();
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={!!c}
      onClose={onClose}
      title="Contestar registro"
      description="O registro continua valendo até um admin decidir."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving} disabled={reason.trim().length < 3}>
            Enviar contestação
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      {c && (
        <p className="mb-3 text-sm text-muted-foreground">
          {c.memberName} · {c.goalEmoji} {c.goalName} · {fmtDay(c.date)}
        </p>
      )}
      <Field label="Por quê?" htmlFor="ct-reason">
        <Textarea id="ct-reason" maxLength={300} placeholder="Ex.: a foto é de outro dia…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  );
}
