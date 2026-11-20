import type { WeekGoalView } from '@tenace/types';
import { Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { describeGoal, formatCents, isoWd, unitLabel } from '@/lib/format';
import { SlotBar, T } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

export function goalHint(g: WeekGoalView, today: string): string {
  const done = g.slotsAchieved >= g.slotsPerWeek;
  if (done) return 'Meta da semana cumprida ✅';
  if (g.period === 'daily') {
    if (g.toNext != null) return `Hoje: ${g.toNext === 1 ? 'falta' : 'faltam'} ${g.toNext} ${unitLabel(g.unit, g.toNext)}`;
    return g.activeWeekdays.includes(isoWd(today)) ? 'Hoje: feito ✅' : 'Hoje não conta';
  }
  return g.toNext != null ? `${g.toNext === 1 ? 'Falta' : 'Faltam'} ${g.toNext} ${unitLabel(g.unit, g.toNext)} para a próxima cota` : '';
}

export function GoalRow({ g, today, onCheckIn }: { g: WeekGoalView; today: string; onCheckIn?: () => void }) {
  const { c } = useTheme();
  const done = g.slotsAchieved >= g.slotsPerWeek;
  const hint = goalHint(g, today);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: radius.md, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22 }}>{g.emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T size={14} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
            {g.name}
          </T>
          <T size={12} weight="semibold" tone="muted">
            {g.slotsAchieved}/{g.slotsPerWeek} · {formatCents(g.creditedCents)}
          </T>
        </View>
        <SlotBar slots={g.slotsPerWeek} achieved={g.slotsAchieved} />
        <T size={12} weight={done ? 'medium' : 'regular'} tone={done ? 'success' : 'muted'} numberOfLines={1}>
          {hint || describeGoal(g)}
        </T>
      </View>
      {onCheckIn && !done && (
        <Pressable onPress={onCheckIn} accessibilityRole="button" accessibilityLabel={`Registrar ${g.name}`} hitSlop={4} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
          <Plus size={22} color={c.brand} />
        </Pressable>
      )}
    </View>
  );
}
