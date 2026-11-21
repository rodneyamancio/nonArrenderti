import * as Haptics from 'expo-haptics';
import { Moon, Sun } from 'lucide-react-native';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme-provider';

/** One tap switches light ↔ dark (Perfil › Aparência still offers Claro / Escuro / Sistema). Same as the portal. */
export function ThemeToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c, scheme, setPref } = useTheme();
  const dark = scheme === 'dark';
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        setPref(dark ? 'light' : 'dark');
      }}
      accessibilityRole="button"
      accessibilityLabel={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      hitSlop={4}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surfaceHover : 'transparent' }, style]}
    >
      {dark ? <Sun size={22} color={c.sparkSolid} /> : <Moon size={22} color={c.text} />}
    </Pressable>
  );
}
