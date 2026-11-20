import { GROUP_ROLE_LABELS } from '@tenace/types';
import { router } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { formatCents } from '@/lib/format';
import { useAppData } from '@/session/app-data';
import { Badge, Button, EmptyState, ErrorState, Loading, Screen, T, ToneBox } from '@/ui/kit';
import { PageTitle, TopBar } from '@/ui/page-header';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

export default function GroupsScreen() {
  const { c } = useTheme();
  const { groups, groupsError, groupsRefreshing, refreshGroups, reloadGroups } = useAppData();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar>
        <View style={{ flex: 1 }}>
          <PageTitle title="Seus grupos" description="Cada grupo tem suas metas, seu caixa e sua turma." actions={<Button label="Novo grupo" icon={Plus} size="sm" onPress={() => router.push('/grupos/novo')} />} />
        </View>
      </TopBar>
      <Screen onRefresh={refreshGroups} refreshing={groupsRefreshing} bottomInset={false}>
        {!groups ? (
          groupsError ? (
            <ErrorState error={groupsError} onRetry={reloadGroups} />
          ) : (
            <Loading />
          )
        ) : groups.length === 0 ? (
          <EmptyState emoji="🔥" title="Nenhum grupo ainda" description="Crie o primeiro ou abra um link de convite que alguém te mandou." />
        ) : (
          groups.map((g) => (
            <Pressable
              key={g.group.id}
              onPress={() => router.push({ pathname: '/g/[groupId]', params: { groupId: g.group.id } })}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pressed ? c.surfaceHover : c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: 14 })}
            >
              <ToneBox color={g.group.color} radiusSize={radius.md} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>{g.group.emoji}</Text>
              </ToneBox>
              <View style={{ flex: 1 }}>
                <T weight="bold" numberOfLines={1}>
                  {g.group.name}
                </T>
                <T size={13} tone="muted" numberOfLines={2}>
                  {g.memberCount} {g.memberCount === 1 ? 'pessoa' : 'pessoas'} · {GROUP_ROLE_LABELS[g.role]}
                  {g.charged ? ` · semana ${formatCents(g.weekBalanceCents)}` : ''}
                </T>
              </View>
              {g.pendingActions > 0 && <Badge tone="spark">{g.pendingActions}</Badge>}
              <ChevronRight size={20} color={c.textMuted} />
            </Pressable>
          ))
        )}
      </Screen>
    </View>
  );
}
