import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSessionState } from '@/session/provider';
import { useTheme } from '@/ui/theme-provider';

/** Entry gate: loading (splash stays up) | login | home. */
export default function Index() {
  const state = useSessionState();
  const { c } = useTheme();
  if (state.status === 'loading') return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return <Redirect href={state.status === 'signedIn' ? '/inicio' : '/entrar'} />;
}
