import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { useSessionState } from '@/session/provider';
import { useTheme } from '@/ui/theme-provider';
import { safeNext } from '@/features/auth/next';

export default function AuthLayout() {
  const state = useSessionState();
  const { c } = useTheme();
  const { next } = useGlobalSearchParams<{ next?: string }>();
  if (state.status === 'signedIn') return <Redirect href={safeNext(next) as never} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
