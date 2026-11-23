import { isoWeekday, weekDates } from '@tenace/rules';
import type { MemberWeekView, WeekBoard, WeekGoalView } from '@tenace/types';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useApi } from '@/data/use-api';
import { countdown, fmtDay, fmtRange, fmtWeekday, formatCents } from '@/lib/format';
import { useAppData } from '@/session/app-data';
import { Avatar, Badge, Card, ErrorState, IconButton, LinkText, Loading, Money, Overline, Ring, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme-provider';
import { useGroup } from './group-context';
import { GoalRow } from './goal-row';

export function WeekSection({ onInvite }: { onInvite: () => void }) {
  const { group } = useGroup();
  const { openCheckIn } = useAppData();
  const [start, setStart] = useState<string | null>(null);
  const { data, error, reload } = useApi<WeekBoard>(`/groups/${group.id}/week${start ? `?start=${start}` : ''}`);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;
  const { week } = data;
  const me = data.members.find((m) => m.memberId === group.me.memberId);
  const others = data.members.filter((m) => m.memberId !== group.me.memberId);
  const isCurrent = !data.nextWeekStart;
  const closesAt = new Date(week.closesAt);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton icon={ChevronLeft} label="Semana anterior" disabled={!data.previousWeekStart} onPress={() => setStart(data.previousWeekStart)} />
          <T size={18} weight="extrabold" center style={{ flex: 1 }}>
            Semana {fmtRange(week.weekStart, week.weekEnd)}
          </T>
          <IconButton icon={ChevronRight} label="Próxima semana" disabled={!data.nextWeekStart} onPress={() => setStart(data.nextWeekStart)} />
        </View>
        <View style={{ alignItems: 'center' }}>
          {week.status === 'open' && isCurrent && <Badge tone="brand">⏱ fecha em {countdown(week.endsAt)}</Badge>}
          {week.status === 'open' && !isCurrent && <Badge tone="warning">ainda dá para registrar até {`${String(closesAt.getHours()).padStart(2, '0')}:${String(closesAt.getMinutes()).padStart(2, '0')}`} de segunda</Badge>}
          {week.status === 'closed' && <Badge tone="neutral">semana fechada</Badge>}
          {week.status === 'not_started' && <Badge tone="info">o grupo começa em {fmtDay(group.startsOn)}</Badge>}
        </View>
      </View>

      {me && <MyWeek m={me} today={data.today} weekStart={week.weekStart} closed={week.status === 'closed'} startsOn={group.me.startsOnWeek} onCheckIn={week.status === 'open' && !group.planPaused ? (goalId) => openCheckIn({ groupId: group.id, goalId }) : undefined} />}

      {others.length > 0 && (
        <View style={{ gap: 12 }}>
          <Overline>A turma</Overline>
          {others.map((m) => (
            <MemberCard key={m.memberId} m={m} today={data.today} weekStart={week.weekStart} closed={week.status === 'closed'} />
          ))}
        </View>
      )}
      {others.length === 0 && week.status !== 'closed' && (
        <Card>
          <T size={14} tone="muted">
            Por enquanto é só você aqui. Compromisso fica mais forte com companhia —
          </T>
          <LinkText onPress={onInvite}>convide a galera</LinkText>
        </Card>
      )}
    </View>
  );
}

function summary(m: MemberWeekView, closed: boolean, withBalance = true) {
  const missing = m.goals.reduce((s, g) => s + Math.max(0, g.slotsPerWeek - g.slotsAchieved), 0);
  const balance = m.creditedCents - m.commitmentCents;
  if (closed) return m.penaltyCents ? { tone: 'danger' as const, text: `multa de ${formatCents(m.penaltyCents)}` } : { tone: 'success' as const, text: 'fechou no zero 🎉' };
  if (m.commitmentCents > 0 && missing === 0) return { tone: 'success' as const, text: 'tudo pago! 🏆' };
  return { tone: 'muted' as const, text: `faltam ${missing} ${missing === 1 ? 'cota' : 'cotas'}${withBalance ? ` · ${formatCents(balance)}` : ''}` };
}

function MyWeek({ m, today, weekStart, closed, onCheckIn, startsOn }: { m: MemberWeekView; today: string; weekStart: string; closed: boolean; onCheckIn?: (goalId: string) => void; startsOn: string }) {
  if (!m.charged) {
    return (
      <Card>
        <T size={14}>Suas metas começam a contar em {fmtDay(startsOn)}. Os registros desta semana aparecem no feed, mas não valem cotas.</T>
      </Card>
    );
  }
  const ratio = m.commitmentCents ? m.creditedCents / m.commitmentCents : 0;
  const s = summary(m, closed, false);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 }} accessibilityLabel="Sua semana">
        <Ring value={ratio} size={72} stroke={8} done={ratio >= 1}>
          {`${Math.round(ratio * 100)}%`}
        </Ring>
        <View style={{ flex: 1 }}>
          <Overline>Você nesta semana</Overline>
          <Money cents={closed ? -(m.penaltyCents ?? 0) : m.creditedCents - m.commitmentCents} size={24} weight="extrabold" tone="default" />
          <T size={13} tone={s.tone}>
            {s.text} · compromisso {formatCents(m.commitmentCents)}
          </T>
        </View>
        {m.streak > 0 && (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <T size={11} weight="bold" tone="spark">
              {m.streak} {m.streak === 1 ? 'semana' : 'semanas'}
            </T>
          </View>
        )}
      </View>
      <View style={{ gap: 18 }}>
        {m.goals.map((g) => (
          <View key={g.id} style={{ gap: 8 }}>
            <GoalRow g={g} today={today} onCheckIn={onCheckIn ? () => onCheckIn(g.goalId) : undefined} />
            {g.period === 'daily' && <DayDots g={g} weekStart={weekStart} today={today} />}
          </View>
        ))}
      </View>
    </Card>
  );
}

function DayDots({ g, weekStart, today }: { g: WeekGoalView; weekStart: string; today: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginLeft: 54 }} accessibilityLabel="Dias da semana">
      {weekDates(weekStart).map((d) => {
        const active = g.activeWeekdays.includes(isoWeekday(d));
        const qty = g.byDate[d] ?? 0;
        const met = active && qty >= g.target;
        const partial = active && qty > 0 && !met;
        const [bg, fg] = !active ? ['transparent', c.textSubtle] : met ? [c.successSolid, '#fff'] : partial ? [c.brandSoft, c.brand] : d < today ? [c.dangerSoft, c.danger] : [c.surfaceSunken, c.textMuted];
        return (
          <View key={d} accessibilityLabel={`${fmtWeekday(d)}: ${qty}/${g.target}`} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: d === today ? 2 : 0, borderColor: c.focus }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: fg, textDecorationLine: active ? 'none' : 'line-through' }}>{met ? '✓' : fmtWeekday(d).slice(0, 1).toUpperCase()}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MemberCard({ m, today, weekStart, closed }: { m: MemberWeekView; today: string; weekStart: string; closed: boolean }) {
  const s = m.charged ? summary(m, closed) : null;
  const pct = m.commitmentCents ? m.creditedCents / m.commitmentCents : 0;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={m.name} color={m.avatarColor} />
        <View style={{ flex: 1 }}>
          <T weight="semibold" numberOfLines={1}>
            {m.name}
            {m.streak > 1 ? <T size={12} tone="spark">{`  🔥${m.streak}`}</T> : null}
          </T>
          <T size={12} tone={s?.tone ?? 'muted'}>
            {s ? s.text : 'começa na próxima semana'}
          </T>
        </View>
        {m.charged && (
          <Ring value={pct} size={44} stroke={5} done={m.creditedCents >= m.commitmentCents && m.commitmentCents > 0}>
            {Math.round(pct * 100)}
          </Ring>
        )}
      </View>
      {m.charged && (
        <View style={{ gap: 14 }}>
          {m.goals.map((g) => (
            <View key={g.id} style={{ gap: 8 }}>
              <GoalRow g={g} today={today} />
              {g.period === 'daily' && <DayDots g={g} weekStart={weekStart} today={today} />}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
