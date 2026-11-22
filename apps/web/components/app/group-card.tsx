'use client';
import type { OverviewGroup, WeekGoalView } from '@tenace/types';
import { ChevronRight, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge, Money, SlotBar, toneClass } from '@/components/ui';
import { countdown, cx, describeGoal, fmtDay, formatCents, unitLabel } from '@/lib/format';
import { useApp } from './session';

export function GoalRow({ g, today, onCheckIn }: { g: WeekGoalView; today: string; onCheckIn?: () => void }) {
  const done = g.slotsAchieved >= g.slotsPerWeek;
  const hint = done
    ? 'Meta da semana cumprida ✅'
    : g.period === 'daily'
      ? g.toNext != null
        ? `Hoje: ${g.toNext === 1 ? 'falta' : 'faltam'} ${g.toNext} ${unitLabel(g.unit, g.toNext)}`
        : g.activeWeekdays.includes(isoWd(today))
          ? 'Hoje: feito ✅'
          : 'Hoje não conta'
      : g.toNext != null
        ? `${g.toNext === 1 ? 'Falta' : 'Faltam'} ${g.toNext} ${unitLabel(g.unit, g.toNext)} para a próxima cota`
        : '';
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-xl" aria-hidden>
        {g.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{g.name}</p>
          <p className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
            {g.slotsAchieved}/{g.slotsPerWeek} · {formatCents(g.creditedCents)}
          </p>
        </div>
        <SlotBar slots={g.slotsPerWeek} achieved={g.slotsAchieved} className="mt-1.5" />
        <p className={cx('mt-1 truncate text-xs', done ? 'font-medium text-success' : 'text-muted-foreground')}>{hint || describeGoal(g)}</p>
      </div>
      {onCheckIn && !done && (
        <button type="button" onClick={onCheckIn} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition-transform hover:scale-105 active:scale-95" aria-label={`Registrar ${g.name}`}>
          <Plus className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function isoWd(d: string): number {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

export function GroupCard({ data }: { data: OverviewGroup }) {
  const { openCheckIn } = useApp();
  const { group, week, goals } = data;
  const commitment = goals.reduce((s, g) => s + g.slotsPerWeek * g.stakeCents, 0);
  const credited = goals.reduce((s, g) => s + g.creditedCents, 0);
  const missingSlots = goals.reduce((s, g) => s + Math.max(0, g.slotsPerWeek - g.slotsAchieved), 0);
  const allDone = data.charged && commitment > 0 && missingSlots === 0;

  return (
    <article className="animate-in overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Link href={`/g/${group.id}`} className={cx('tone-bg flex items-center gap-3 px-5 py-4', toneClass(group.color))}>
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/20 text-2xl" aria-hidden>
          {group.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold">{group.name}</h2>
          <p className="flex items-center gap-2 text-xs font-medium text-white/85">
            <Users className="h-3.5 w-3.5" aria-hidden /> {data.memberCount} {data.memberCount === 1 ? 'pessoa' : 'pessoas'}
            {week.status === 'open' && <> · fecha em {countdown(week.endsAt)}</>}
          </p>
        </div>
        {data.pendingActions > 0 && <Badge className="bg-white text-[#17142B]">{data.pendingActions} pendente{data.pendingActions > 1 ? 's' : ''}</Badge>}
        <ChevronRight className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
      </Link>

      <div className="flex flex-col gap-4 p-5">
        {data.blocked ? (
          <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm">
            <strong>Grupo pausado.</strong> A assinatura de quem criou o grupo está em atraso. Ninguém é cobrado até a reativação.
          </div>
        ) : !data.charged ? (
          <div className="rounded-lg bg-muted px-4 py-3 text-sm">
            {week.status === 'not_started' ? (
              <>
                O grupo começa na segunda, <strong>{fmtDay(data.startsOnWeek)}</strong>. Já pode convidar a galera!
              </>
            ) : (
              <>
                Suas metas começam a contar em <strong>{fmtDay(data.startsOnWeek)}</strong>. Até lá, registre para treinar 😉
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Sua semana</p>
                <p className={cx('text-2xl font-extrabold tabular-nums', allDone ? 'text-success' : credited - commitment < 0 ? 'text-foreground' : 'text-success')}>{formatCents(credited - commitment)}</p>
              </div>
              <p className="text-right text-sm text-muted-foreground">{allDone ? 'Fechou no zero! 🎉' : `faltam ${missingSlots} ${missingSlots === 1 ? 'cota' : 'cotas'}`}</p>
            </div>
            <div className="flex flex-col gap-4">
              {goals.map((g) => (
                <GoalRow key={g.id} g={g} today={data.today} onCheckIn={() => openCheckIn({ groupId: group.id, goalId: g.goalId })} />
              ))}
            </div>
          </>
        )}
        {data.openDebtCents > 0 && (
          <Link href={`/g/${group.id}/pagar`} className="flex items-center justify-between rounded-lg bg-danger-soft px-4 py-3 text-sm">
            <span>
              Em aberto: <Money cents={data.openDebtCents} className="font-bold text-danger" />
            </span>
            <span className="font-semibold text-danger">Pagar →</span>
          </Link>
        )}
      </div>
    </article>
  );
}
