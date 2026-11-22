import type { OverviewGroup } from '@tenace/types';
import { router } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { countdown, fmtDay, formatCents } from '@/lib/format';
import { useAppData } from '@/session/app-data';
import { Card, Money, Overline, T, ToneBox } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';
import { GoalRow } from './goal-row';

export function GroupCard({ data }: { data: OverviewGroup }) {
  const { c } = useTheme();
  const { openCheckIn } = useAppData();
  const { group, week, goals } = data;
  const commitment = goals.reduce((s, g) => s + g.slotsPerWeek * g.stakeCents, 0);
  const credited = goals.reduce((s, g) => s + g.creditedCents, 0);
  const missingSlots = goals.reduce((s, g) => s + Math.max(0, g.slotsPerWeek - g.slotsAchieved), 0);
  const allDone = data.charged && commitment > 0 && missingSlots === 0;

  return (
    <Card padded={false}>
      <Pressable onPress={() => router.push({ pathname: '/g/[groupId]', params: { groupId: group.id } })} accessibilityRole="button" accessibilityLabel={`Abrir ${group.name}`}>
        <ToneBox color={group.color} radiusSize={0} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24 }}>{group.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <T size={18} weight="extrabold" tone="onBrand" numberOfLines={1}>
              {group.name}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Users size={13} color="rgba(255,255,255,0.85)" />
              <T size={12} weight="medium" style={{ color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>
                {data.memberCount} {data.memberCount === 1 ? 'pessoa' : 'pessoas'}
                {week.status === 'open' ? ` · fecha em ${countdown(week.endsAt)}` : ''}
              </T>
            </View>
          </View>
          {data.pendingActions > 0 && (
            <View style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#17142B', fontSize: 11, fontWeight: '700' }}>
                {data.pendingActions} pendente{data.pendingActions > 1 ? 's' : ''}
              </Text>
            </View>
          )}
          <ChevronRight size={20} color="rgba(255,255,255,0.8)" />
        </ToneBox>
      </Pressable>

      <View style={{ padding: 16, gap: 16 }}>
        {data.blocked ? (
          <View style={{ backgroundColor: c.warningSoft, borderRadius: radius.md, padding: 14 }}>
            <T size={14}>Grupo pausado: a assinatura de quem criou o grupo está em atraso. Ninguém é cobrado até a reativação.</T>
          </View>
        ) : !data.charged ? (
          <View style={{ backgroundColor: c.surfaceSunken, borderRadius: radius.md, padding: 14 }}>
            <T size={14}>
              {week.status === 'not_started' ? `O grupo começa na segunda, ${fmtDay(data.startsOnWeek)}. Já pode convidar a galera!` : `Suas metas começam a contar em ${fmtDay(data.startsOnWeek)}. Até lá, registre para treinar 😉`}
            </T>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <View>
                <Overline>Sua semana</Overline>
                <Money cents={credited - commitment} size={24} weight="extrabold" tone={allDone || credited - commitment >= 0 ? 'success' : 'default'} />
              </View>
              <T size={14} tone="muted">
                {allDone ? 'Fechou no zero! 🎉' : `faltam ${missingSlots} ${missingSlots === 1 ? 'cota' : 'cotas'}`}
              </T>
            </View>
            <View style={{ gap: 16 }}>
              {goals.map((g) => (
                <GoalRow key={g.id} g={g} today={data.today} onCheckIn={() => openCheckIn({ groupId: group.id, goalId: g.goalId })} />
              ))}
            </View>
          </>
        )}
        {data.openDebtCents > 0 && (
          <Pressable onPress={() => router.push({ pathname: '/g/[groupId]/pagar', params: { groupId: group.id } })} accessibilityRole="button" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: 14 }}>
            <T size={14}>
              Em aberto:{' '}
              <T size={14} weight="bold" tone="danger">
                {formatCents(data.openDebtCents)}
              </T>
            </T>
            <T size={14} weight="semibold" tone="danger">
              Pagar →
            </T>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
