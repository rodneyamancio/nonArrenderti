'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Button, Field, Input, Notice } from '@/components/ui';
import { api, errorMessage, safeNext } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      router.replace(safeNext(next));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Que bom te ver de novo"
      subtitle="Entre para registrar suas atividades."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link href={`/criar-conta${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand">
            Criar conta grátis
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {params.get('senha') === '1' && <Notice tone="success">Senha alterada. Entre com a nova senha.</Notice>}
        {params.get('redefinida') === '1' && <Notice tone="success">Senha redefinida! Agora é só entrar.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Link href="/esqueci-senha" className="-mt-2 self-end text-sm font-medium text-brand">
          Esqueci minha senha
        </Link>
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Entrar
        </Button>
      </form>
    </AuthFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
