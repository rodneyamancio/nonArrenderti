import type { GroupDetail } from '@tenace/types';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/data/use-api';
import { AccountSection } from '@/features/group/account-section';
import { FeedSection } from '@/features/group/feed-section';
import { GoalsSection } from '@/features/group/goals-section';
import { GroupCtx } from '@/features/group/group-context';
import { MembersSection } from '@/features/group/members-section';
import { SettingsSection } from '@/features/group/settings-section';
import { WeekSection } from '@/features/group/week-section';
import { emitDataChanged } from '@/lib/events';
import { groupSections, type AccountTab, type GroupSection } from '@/navigation/sections';
import { useAppData } from '@/session/app-data';
import { CountBadge, ErrorState, Loading, Screen, T, ToneBox } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

export default function GroupScreen() {
  const { groupId, s, tab, novo } = useLocalSearchParams<{ groupId: string; s?: GroupSection; tab?: AccountTab; novo?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { openCheckIn } = useAppData();
  const { data: group, error, reload } = useApi<GroupDetail>(`/groups/${groupId}`);
  const [section, setSection] = useState<GroupSection>(s ?? 'semana');
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (s) setSection(s);
  }, [s]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/inicio'));

  if (!group) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Voltar" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={26} color={c.text} />
        </Pressable>
        {error ? <ErrorState error={error} onRetry={reload} /> : <Loading />}
      </View>
    );
  }

  const can = (p: GroupDetail['me']['permissions'][number]) => group.me.permissions.includes(p);
  const tabs = groupSections(group);
  const current = tabs.some((t) => t.key === section) ? section : 'semana';

  async function refresh() {
    setRefreshing(true);
    emitDataChanged();
    await reload();
    setRefreshing(false);
  }

  return (
    <GroupCtx.Provider value={{ group, reload, can }}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Screen padded={false} onRefresh={refresh} refreshing={refreshing} contentStyle={{ gap: 0 }}>
          <ToneBox color={group.color} radiusSize={0} style={{ paddingTop: insets.top + 4, paddingHorizontal: 16, paddingBottom: 44 }}>
            <View style={{ position: 'absolute', top: -60, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8} style={{ width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={28} color="#fff" />
              </Pressable>
              <Pressable onPress={() => openCheckIn({ groupId: group.id })} accessibilityRole="button" accessibilityLabel="Registrar" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: 14, height: 40, opacity: pressed ? 0.85 : 1 })}>
                <Plus size={18} color="#17142B" />
                <Text style={{ color: '#17142B', fontWeight: '700', fontSize: 14 }}>Registrar</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
              <View style={{ width: 58, height: 58, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 32 }}>{group.emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={24} weight="extrabold" tone="onBrand" accessibilityRole="header">
                  {group.name}
                </T>
                {!!group.description && (
                  <T size={14} numberOfLines={2} style={{ color: 'rgba(255,255,255,0.88)' }}>
                    {group.description}
                  </T>
                )}
                <T size={12} weight="medium" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  {group.memberCount} {group.memberCount === 1 ? 'pessoa' : 'pessoas'} · dinheiro vai para {group.destination.label}
                </T>
              </View>
            </View>
          </ToneBox>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -26 }} contentContainerStyle={{ paddingHorizontal: 16 }} accessibilityRole="tablist">
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: 4 }}>
              {tabs.map((t) => {
                const on = t.key === current;
                return (
                  <Pressable key={t.key} onPress={() => setSection(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.sm, backgroundColor: on ? c.brandSoft : 'transparent' }}>
                    <T size={14} weight={on ? 'bold' : 'semibold'} tone={on ? 'brand' : 'muted'}>
                      {t.label}
                    </T>
                    <CountBadge n={t.badge} />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ padding: 16, gap: 16 }}>
            {current === 'semana' && <WeekSection onInvite={() => setSection('membros')} />}
            {current === 'feed' && <FeedSection />}
            {current === 'metas' && <GoalsSection />}
            {current === 'conta' && <AccountSection initialTab={tab} />}
            {current === 'membros' && <MembersSection justCreated={novo === '1'} />}
            {current === 'ajustes' && <SettingsSection />}
          </View>
        </Screen>
      </View>
    </GroupCtx.Provider>
  );
}
