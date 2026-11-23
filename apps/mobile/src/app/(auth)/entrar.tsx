import { errorMessage } from '@tenace/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { QrCode } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
type InputRef = React.ComponentRef<typeof TextInput>;
import { useMutation } from '@/data/use-api';
import { AuthFrame } from '@/features/auth/auth-frame';
import { useSession, useSessionState } from '@/session/provider';
import { StaleSessionError } from '@/session/session';
import { Button, Field, Input, LinkText, Notice, T } from '@/ui/kit';

export default function LoginScreen() {
  const session = useSession();
  const state = useSessionState();
  const { next, c, a } = useLocalSearchParams<{ next?: string; c?: string; a?: string }>();
  // Deep link tenace://entrar?c=…&a=… (QR read by the phone's own camera) → QR login.
  useEffect(() => {
    if (c) router.replace({ pathname: '/qr', params: { c, ...(a ? { a } : {}) } });
  }, [c, a]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useMutation();
  const passwordRef = useRef<InputRef>(null);
  const notice = state.status === 'signedOut' ? state.notice : undefined;

  const submit = () =>
    run(async () => {
      setError('');
      try {
        await session.login(email.trim(), password);
        // The (auth) layout redirects to `next` (or Início) as soon as the session flips.
      } catch (e) {
        if (!(e instanceof StaleSessionError)) setError(errorMessage(e));
      }
    });

  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <AuthFrame
      title="Que bom te ver de novo"
      subtitle="Entre para registrar suas atividades."
      footer={
        <>
          <T tone="muted">Ainda não tem conta?</T>
          <LinkText onPress={() => router.replace(`/criar-conta${q}` as never)}>Criar conta grátis</LinkText>
        </>
      }
    >
      {notice && !error && <Notice tone={notice.startsWith('Senha') ? 'success' : 'warning'}>{notice}</Notice>}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="E-mail">
        <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} accessibilityLabel="E-mail" />
      </Field>
      <Field label="Senha">
        <Input ref={passwordRef} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password" returnKeyType="go" onSubmitEditing={submit} accessibilityLabel="Senha" />
      </Field>
      <LinkText onPress={() => router.push('/esqueci-senha')}>Esqueci minha senha</LinkText>
      <Button label="Entrar" size="lg" loading={busy} disabled={!email.includes('@') || !password} onPress={submit} full />
      <Button label="Entrar com QR Code do portal" variant="outline" icon={QrCode} onPress={() => router.push('/qr')} full />
    </AuthFrame>
  );
}
