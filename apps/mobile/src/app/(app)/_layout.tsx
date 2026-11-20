import { Redirect, Stack } from 'expo-router';
import { CheckInSheet } from '@/features/checkin/checkin-sheet';
import { AppDataProvider } from '@/session/app-data';
import { useSessionState } from '@/session/provider';
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
    </AppDataProvider>
  );
}
