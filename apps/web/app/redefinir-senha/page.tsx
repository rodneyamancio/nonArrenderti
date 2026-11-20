'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Button, Field, Input, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/password-reset/confirm', { method: 'POST', body: { token, password } });
      router.replace('/entrar?redefinida=1');
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthFrame title="Crie uma nova senha">
      {!token ? (
        <Notice tone="danger">Link inválido. Peça um novo em “Esqueci minha senha”.</Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Nova senha" htmlFor="password" hint="Mínimo 8 caracteres, com letras e números">
            <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" size="lg" loading={loading}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
