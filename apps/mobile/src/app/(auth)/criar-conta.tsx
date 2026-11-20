import { errorMessage } from '@tenace/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useMutation } from '@/data/use-api';
import { AuthFrame } from '@/features/auth/auth-frame';
import { useSession } from '@/session/provider';
import { StaleSessionError } from '@/session/session';
import { Button, Field, Input, LinkText, Notice, T } from '@/ui/kit';

export default function SignupScreen() {
  const session = useSession();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useMutation();

  const submit = () =>
    run(async () => {
      setError('');
      try {
        await session.signup(name.trim(), email.trim(), password);
      } catch (e) {
        if (!(e instanceof StaleSessionError)) setError(errorMessage(e));
      }
    });

  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <AuthFrame
      title="Crie sua conta"
      subtitle="Leva 30 segundos. Depois é só criar um grupo ou aceitar um convite."
      footer={
        <>
          <T tone="muted">Já tem conta?</T>
          <LinkText onPress={() => router.replace(`/entrar${q}` as never)}>Entrar</LinkText>
        </>
      }
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Como quer ser chamado(a)?">
        <Input value={name} onChangeText={setName} maxLength={60} textContentType="name" autoComplete="name" accessibilityLabel="Nome" />
      </Field>
      <Field label="E-mail">
        <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" accessibilityLabel="E-mail" />
      </Field>
      <Field label="Senha" hint="Mínimo 8 caracteres, com letras e números">
        <Input value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" accessibilityLabel="Senha" />
      </Field>
      <Button label="Criar conta" size="lg" loading={busy} disabled={name.trim().length < 2 || !email} onPress={submit} full />
    </AuthFrame>
  );
}
