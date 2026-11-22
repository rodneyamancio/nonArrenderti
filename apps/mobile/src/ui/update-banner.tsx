import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAutoUpdate } from '@/session/updates';
import { fonts, radius } from './theme';
import { useTheme } from './theme-provider';

/** Bottom banner when an OTA version is downloaded. Applying is the person's choice. */
export function UpdateBanner() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [reload, setReload] = useState<(() => void) | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useAutoUpdate(useCallback((r: () => void) => setReload(() => r), []));
  if (!reload || dismissed) return null;
  return (
    <View accessibilityRole="alert" style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 84, backgroundColor: c.text, borderRadius: radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, color: c.bg, fontFamily: fonts.semibold, fontSize: 14 }}>Nova versão do Tenace pronta.</Text>
      <Pressable onPress={() => setDismissed(true)} accessibilityRole="button" hitSlop={8}>
        <Text style={{ color: c.bg, opacity: 0.7, fontFamily: fonts.semibold, fontSize: 14 }}>Depois</Text>
      </Pressable>
      <Pressable onPress={reload} accessibilityRole="button" style={{ backgroundColor: c.brandSolid, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 14 }}>Atualizar</Text>
      </Pressable>
    </View>
  );
}
