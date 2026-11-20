'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Button, Field, Input, Notice } from '@/components/ui';
import { api, errorMessage, safeNext } from '@/lib/api';

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) return setError('A senha precisa de 8+ caracteres, com letras e números.');
    setLoading(true);
    try {
      await api('/auth/signup', { method: 'POST', body: { name, email, password } });
      router.replace(safeNext(next));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Crie sua conta"
      subtitle="Leva 30 segundos. Depois é só criar um grupo ou aceitar um convite."
      footer={
        <>
          Já tem conta?{' '}
          <Link href={`/entrar${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Como quer ser chamado(a)?" htmlFor="name">
          <Input id="name" autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" htmlFor="password" hint="Mínimo 8 caracteres, com letras e números">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" loading={loading} size="lg" className="w-full" disabled={name.trim().length < 2 || !email}>
          Criar conta
        </Button>
      </form>
    </AuthFrame>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
