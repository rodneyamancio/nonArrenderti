import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './kit';
import { useTheme } from './theme-provider';

/** Top of a tab screen: title + optional actions, under the status bar. */
export function TopBar({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.bg, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>;
}

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T size={26} weight="extrabold" accessibilityRole="header" style={{ letterSpacing: -0.4 }}>
          {title}
        </T>
        {description && (
          <T size={14} tone="muted">
            {description}
          </T>
        )}
      </View>
      {actions}
    </View>
  );
}

/** Header for pushed screens: back + title. */
export function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <ChevronLeft size={28} color={c.text} />
      </Pressable>
      <T size={18} weight="extrabold" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </T>
    </View>
  );
}
