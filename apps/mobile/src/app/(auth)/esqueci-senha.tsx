import { errorMessage } from '@tenace/api-client';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useMutation } from '@/data/use-api';
import { AuthFrame } from '@/features/auth/auth-frame';
import { api } from '@/session/provider';
import { Button, Field, Input, LinkText, Notice } from '@/ui/kit';

export default function ForgotScreen() {
  const [email, setEmail] = useState('');
  const [emailOn, setEmailOn] = useState<boolean | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { busy, run } = useMutation();

  useEffect(() => {
    api<{ passwordResetByEmail: boolean }>('/auth/capabilities')
      .then((r) => setEmailOn(r.passwordResetByEmail))
      .catch(() => setEmailOn(true));
  }, []);

  const submit = () =>
    run(async () => {
      setError('');
      try {
        await api('/auth/password-reset/request', { body: { email: email.trim() } });
        setSent(true);
      } catch (e) {
        setError(errorMessage(e));
      }
    });

  return (
    <AuthFrame title="Esqueceu a senha?" subtitle="Mandamos um link para você criar uma nova." footer={<LinkText onPress={() => (router.canGoBack() ? router.back() : router.replace('/entrar'))}>Voltar para entrar</LinkText>}>
      {emailOn === false ? (
        <Notice tone="info" title="Fale com o administrador">
          O envio de e-mails ainda não está ativo. Peça ao administrador do Tenace para redefinir sua senha — ele pode definir uma nova ou te mandar um link de redefinição.
        </Notice>
      ) : sent ? (
        <Notice tone="success" title="Confira seu e-mail">
          Se existir uma conta com esse e-mail, você vai receber um link válido por 1 hora.
        </Notice>
      ) : (
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field label="E-mail">
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" accessibilityLabel="E-mail" />
          </Field>
          <Button label="Enviar link" size="lg" loading={busy} disabled={!email.includes('@')} onPress={submit} full />
        </>
      )}
    </AuthFrame>
  );
}
