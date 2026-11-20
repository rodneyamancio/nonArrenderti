'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Button, Field, Input, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/password-reset/request', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title="Esqueceu a senha?" subtitle="Mandamos um link para você criar uma nova." footer={<Link href="/entrar" className="font-semibold text-brand">Voltar para entrar</Link>}>
      {sent ? (
        <Notice tone="success" title="Confira seu e-mail">
          Se existir uma conta com esse e-mail, você vai receber um link válido por 1 hora.
        </Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" size="lg" loading={loading} disabled={!email.includes('@')}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
