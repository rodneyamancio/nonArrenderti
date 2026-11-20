import { Tabs } from 'expo-router';
import { Bell, Home, LayoutGrid, Plus, UserRound } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAIN_TABS } from '@/navigation/sections';
import { useAppData } from '@/session/app-data';
import { ToneBox } from '@/ui/kit';
import { fonts } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

const ICONS = { inicio: Home, avisos: Bell, grupos: LayoutGrid, perfil: UserRound } as const;

/** Bottom navigation like the portal on phones: Início · Avisos · [+ Registrar] · Grupos · Perfil. */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      {MAIN_TABS.map((t) => (
        <Tabs.Screen key={t.key} name={t.key} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabBar({ state, navigateToTab }: TabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { openCheckIn, unread } = useAppData();
  const item = (name: (typeof MAIN_TABS)[number]['key']) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    const active = state.index === index;
    const Icon = ICONS[name];
    const label = MAIN_TABS.find((t) => t.key === name)!.label;
    const badge = name === 'avisos' ? unread : 0;
    return (
      <Pressable
        key={name}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={badge ? `${label} (${badge} novos)` : label}
        onPress={() => {
          if (route && !active) navigateToTab(route.key);
        }}
        style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6 }}
      >
        <View>
          <Icon size={23} color={active ? c.brand : c.textMuted} />
          {!!badge && <View style={{ position: 'absolute', top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: c.sparkSolid, borderWidth: 1.5, borderColor: c.surface }} />}
        </View>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: active ? c.brand : c.textMuted }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 6), paddingHorizontal: 8, paddingTop: 4 }}>
      {item('inicio')}
      {item('avisos')}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable onPress={() => openCheckIn()} accessibilityRole="button" accessibilityLabel="Registrar atividade" style={({ pressed }) => ({ marginTop: -22, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <View style={{ borderRadius: 32, borderWidth: 4, borderColor: c.bg, shadowColor: '#6d3bff', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <ToneBox color="violet" radiusSize={28} style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={28} color="#fff" />
            </ToneBox>
          </View>
        </Pressable>
      </View>
      {item('grupos')}
      {item('perfil')}
    </View>
  );
}
