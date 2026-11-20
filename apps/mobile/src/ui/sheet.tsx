import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, T } from './kit';
import { useTheme } from './theme-provider';

/** Bottom/page sheet with a fixed footer above the keyboard (the portal's Dialog). */
export function Sheet({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  return (
    <Modal visible={open} onRequestClose={onClose} animationType="slide" presentationStyle={ios ? 'pageSheet' : 'fullScreen'}>
      <KeyboardAvoidingView behavior={ios ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingTop: ios ? 16 : insets.top + 12, paddingBottom: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T size={20} weight="extrabold" accessibilityRole="header">
              {title}
            </T>
            {description && (
              <T size={14} tone="muted">
                {description}
              </T>
            )}
          </View>
          <IconButton icon={X} label="Fechar" onPress={onClose} variant="outline" size={40} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer && <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>{footer}</View>}
      </KeyboardAvoidingView>
    </Modal>
  );
}
