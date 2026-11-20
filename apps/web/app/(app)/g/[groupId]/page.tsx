'use client';
import { weekDates, isoWeekday } from '@tenace/rules';
import type { MemberWeekView, WeekBoard, WeekGoalView } from '@tenace/types';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useCallback, useState } from 'react';
import { GoalRow } from '@/components/app/group-card';
import { useGroup } from '@/components/app/group-context';
import { useApp, useOnDataChanged } from '@/components/app/session';
import { Avatar, Badge, Button, Card, ErrorState, Money, Ring, Spinner } from '@/components/ui';
import { countdown, cx, fmtDay, fmtRange, fmtWeekday, formatCents } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function WeekPage() {
  const { group } = useGroup();
  const { openCheckIn } = useApp();
  const [start, setStart] = useState<string | null>(null);
  const { data, error, reload } = useApi<WeekBoard>(`/groups/${group.id}/week${start ? `?start=${start}` : ''}`);
  useOnDataChanged(useCallback(() => void reload(), [reload]));

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const { week } = data;
  const me = data.members.find((m) => m.memberId === group.me.memberId);
  const others = data.members.filter((m) => m.memberId !== group.me.memberId);
  const isCurrent = !data.nextWeekStart;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Semana anterior" disabled={!data.previousWeekStart} onClick={() => setStart(data.previousWeekStart)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 px-1 text-center">
            <p className="text-lg font-extrabold">Semana {fmtRange(week.weekStart, week.weekEnd)}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Próxima semana" disabled={!data.nextWeekStart} onClick={() => setStart(data.nextWeekStart)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {week.status === 'open' && isCurrent && (
          <Badge tone="brand" className="text-sm">
            <Clock className="h-3.5 w-3.5" aria-hidden /> fecha em {countdown(week.endsAt)}
          </Badge>
        )}
        {week.status === 'open' && !isCurrent && <Badge tone="warning">ainda dá para registrar até {new Date(week.closesAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de segunda</Badge>}
        {week.status === 'closed' && <Badge tone="neutral">semana fechada</Badge>}
        {week.status === 'not_started' && <Badge tone="info">o grupo começa em {fmtDay(group.startsOn)}</Badge>}
      </div>

      {me && (
        <MyWeek m={me} today={data.today} weekStart={week.weekStart} closed={week.status === 'closed'} onCheckIn={week.status === 'open' ? (goalId) => openCheckIn({ groupId: group.id, goalId }) : undefined} startsOn={group.me.startsOnWeek} />
      )}

      {others.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold tracking-wide text-muted-foreground uppercase">A turma</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {others.map((m) => (
              <MemberCard key={m.memberId} m={m} today={data.today} weekStart={week.weekStart} closed={week.status === 'closed'} />
            ))}
          </div>
        </section>
      )}
      {others.length === 0 && week.status !== 'closed' && (
        <Card>
          <p className="text-sm text-muted-foreground">
            Por enquanto é só você aqui. Compromisso fica mais forte com companhia —{' '}
            <a href={`/g/${group.id}/membros`} className="font-semibold text-brand">
              convide a galera
            </a>
            .
          </p>
        </Card>
      )}
    </div>
  );
}

function summary(m: MemberWeekView, closed: boolean, withBalance = true) {
  const missing = m.goals.reduce((s, g) => s + Math.max(0, g.slotsPerWeek - g.slotsAchieved), 0);
  const balance = m.creditedCents - m.commitmentCents;
  if (closed) return m.penaltyCents ? { tone: 'danger' as const, text: `multa de ${formatCents(m.penaltyCents)}` } : { tone: 'success' as const, text: 'fechou no zero 🎉' };
  if (m.commitmentCents > 0 && missing === 0) return { tone: 'success' as const, text: 'tudo pago! 🏆' };
  return { tone: 'neutral' as const, text: `faltam ${missing} ${missing === 1 ? 'cota' : 'cotas'}${withBalance ? ` · ${formatCents(balance)}` : ''}` };
}

function MyWeek({ m, today, weekStart, closed, onCheckIn, startsOn }: { m: MemberWeekView; today: string; weekStart: string; closed: boolean; onCheckIn?: (goalId: string) => void; startsOn: string }) {
  if (!m.charged) {
    return (
      <Card>
        <p className="text-sm">
          Suas metas começam a contar em <strong>{fmtDay(startsOn)}</strong>. Os registros desta semana aparecem no feed, mas não valem cotas.
        </p>
      </Card>
    );
  }
  const ratio = m.commitmentCents ? m.creditedCents / m.commitmentCents : 0;
  const s = summary(m, closed, false);
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Sua semana">
      <div className="mb-5 flex items-center gap-4">
        <Ring value={ratio} size={72} stroke={8} done={ratio >= 1}>
          {Math.round(ratio * 100)}%
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-muted-foreground uppercase">Você nesta semana</p>
          <p className="text-2xl font-extrabold tabular-nums">
            <Money cents={closed ? -(m.penaltyCents ?? 0) : m.creditedCents - m.commitmentCents} />
          </p>
          <p className={cx('text-sm', s.tone === 'success' ? 'text-success' : s.tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}>
            {s.text} · compromisso {formatCents(m.commitmentCents)}
          </p>
        </div>
        {m.streak > 0 && (
          <div className="hidden text-center sm:block">
            <p className="text-2xl">🔥</p>
            <p className="text-xs font-bold text-spark">{m.streak} {m.streak === 1 ? 'semana' : 'semanas'}</p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-5">
        {m.goals.map((g) => (
          <div key={g.id}>
            <GoalRow g={g} today={today} onCheckIn={onCheckIn ? () => onCheckIn(g.goalId) : undefined} />
            {g.period === 'daily' && <DayDots g={g} weekStart={weekStart} today={today} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function DayDots({ g, weekStart, today }: { g: WeekGoalView; weekStart: string; today: string }) {
  return (
    <div className="mt-2 ml-[52px] flex gap-1.5" aria-label="Dias da semana">
      {weekDates(weekStart).map((d) => {
        const active = g.activeWeekdays.includes(isoWeekday(d));
        const qty = g.byDate[d] ?? 0;
        const met = active && qty >= g.target;
        const partial = active && qty > 0 && !met;
        return (
          <span key={d} className="flex flex-col items-center gap-0.5" title={`${fmtWeekday(d)}: ${qty}/${g.target}`}>
            <span
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full text-[0.65rem] font-bold',
                !active ? 'bg-transparent text-subtle line-through' : met ? 'bg-success-solid text-white' : partial ? 'bg-brand-soft text-brand' : d < today ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground',
                d === today && 'ring-2 ring-[var(--ui-focus)] ring-offset-1 ring-offset-[var(--ui-surface)]',
              )}
            >
              {met ? '✓' : fmtWeekday(d).slice(0, 1).toUpperCase()}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function MemberCard({ m, today, weekStart, closed }: { m: MemberWeekView; today: string; weekStart: string; closed: boolean }) {
  const s = m.charged ? summary(m, closed) : null;
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={m.name} color={m.avatarColor} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {m.name} {m.streak > 1 && <span className="text-xs text-spark">🔥{m.streak}</span>}
          </p>
          <p className={cx('text-xs', s?.tone === 'success' ? 'text-success' : s?.tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}>{s ? s.text : 'começa na próxima semana'}</p>
        </div>
        {m.charged && (
          <Ring value={m.commitmentCents ? m.creditedCents / m.commitmentCents : 0} size={44} stroke={5} done={m.creditedCents >= m.commitmentCents && m.commitmentCents > 0}>
            {m.commitmentCents ? Math.round((m.creditedCents / m.commitmentCents) * 100) : 0}
          </Ring>
        )}
      </div>
      {m.charged && (
        <div className="flex flex-col gap-3">
          {m.goals.map((g) => (
            <div key={g.id}>
              <GoalRow g={g} today={today} />
              {g.period === 'daily' && <DayDots g={g} weekStart={weekStart} today={today} />}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
