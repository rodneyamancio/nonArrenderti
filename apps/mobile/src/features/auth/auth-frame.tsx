import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TenaceLogo } from '@/ui/brand';
import { T } from '@/ui/kit';
import { useTheme } from '@/ui/theme-provider';
import { ThemeToggle } from '@/ui/theme-toggle';

export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <TenaceLogo size={44} tagline />
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 20, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <T size={24} weight="extrabold" accessibilityRole="header">
              {title}
            </T>
            {subtitle && <T tone="muted">{subtitle}</T>}
          </View>
          {children}
        </View>
        {footer && <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>{footer}</View>}
      </ScrollView>
      <ThemeToggle style={{ position: 'absolute', top: insets.top + 6, right: 12 }} />
    </KeyboardAvoidingView>
  );
}
