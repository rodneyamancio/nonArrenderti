import { Redirect, Stack, router, usePathname } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { View } from 'react-native';
import { CheckInSheet } from '@/features/checkin/checkin-sheet';
import { AppDataProvider, useAppData } from '@/session/app-data';
import { useSession, useSessionState } from '@/session/provider';
import { Button, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme-provider';

/** Signed-in area: guard + shared data (groups, notices) + the global check-in sheet. */
export default function AppLayout() {
  const state = useSessionState();
  const { c } = useTheme();
  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/entrar" />;
  return (
    <AppDataProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
      <CheckInSheet />
      <BlockedGate />
    </AppDataProvider>
  );
}

/** Blocked account: only Assinatura, Perfil and Avisos stay open (the API refuses the rest). */
function BlockedGate() {
  const { billing } = useAppData();
  const pathname = usePathname();
  const session = useSession();
  const { c } = useTheme();
  if (billing?.status !== 'blocked' || ['/assinatura', '/perfil', '/avisos'].some((p) => pathname.startsWith(p))) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={34} color={c.danger} />
      </View>
      <T size={24} weight="extrabold" center>
        Conta bloqueada
      </T>
      <T tone="muted" center>
        Uma mensalidade passou mais de 5 dias do vencimento. Seus grupos estão pausados e ninguém é cobrado enquanto isso. Pague para reativar tudo na hora.
      </T>
      <Button label="Pagar agora" size="lg" onPress={() => router.push('/assinatura')} full />
      <Button label="Sair da conta" variant="ghost" onPress={() => void session.logout()} />
    </View>
  );
}
