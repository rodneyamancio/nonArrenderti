'use client';
import { BRAND_COLORS, type SessionUser } from '@tenace/types';
import { CreditCard, LogOut, Monitor, Moon, QrCode, Shield, Sun } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppLoginQr } from '@/components/app/app-login-qr';
import { useApp } from '@/components/app/session';
import { Avatar, Button, Card, Field, Input, Notice, PageHeader, Segmented, toneClass, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx } from '@/lib/format';

export default function ProfilePage() {
  const { user, setUser } = useApp();
  const router = useRouter();
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwErr, setPwErr] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  async function saveProfile(patch: Partial<Pick<SessionUser, 'name' | 'avatarColor'>>) {
    try {
      const r = await api<{ user: SessionUser }>('/auth/me', { method: 'PATCH', body: patch });
      setUser(r.user);
      toast('Perfil atualizado');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr('');
    try {
      await api('/auth/password', { method: 'POST', body: pw });
      router.replace('/entrar?senha=1');
    } catch (err) {
      setPwErr(errorMessage(err));
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/entrar');
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title="Perfil" />
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={user.name} color={user.avatarColor} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile({ name });
          }}
        >
          <Field label="Nome" htmlFor="p-name">
            <div className="flex gap-2">
              <Input id="p-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" variant="outline" disabled={name.trim() === user.name || name.trim().length < 2}>
                Salvar
              </Button>
            </div>
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Cor do avatar</legend>
            <div className="flex flex-wrap gap-2.5">
              {BRAND_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} aria-pressed={c === user.avatarColor} onClick={() => saveProfile({ avatarColor: c })} className={cx('tone-dot h-9 w-9 rounded-full ring-offset-2 ring-offset-[var(--ui-surface)]', toneClass(c), c === user.avatarColor && 'ring-2 ring-[var(--ui-focus)]')} />
              ))}
            </div>
          </fieldset>
        </form>
      </Card>

      <Card title="Aparência">
        {mounted && (
          <Segmented
            label="Tema"
            value={(theme as 'light' | 'dark' | 'system') ?? 'system'}
            onChange={setTheme}
            options={[
              { value: 'light', label: '☀️ Claro' },
              { value: 'dark', label: '🌙 Escuro' },
              { value: 'system', label: '💻 Sistema' },
            ]}
          />
        )}
        <span className="sr-only">
          <Sun /> <Moon /> <Monitor />
        </span>
      </Card>

      <Card title="Trocar senha" description="Você vai precisar entrar de novo em todos os aparelhos.">
        <form onSubmit={changePassword} className="flex flex-col gap-4">
          {pwErr && <Notice tone="danger">{pwErr}</Notice>}
          <div className="form-grid">
            <Field label="Senha atual" htmlFor="p-cur">
              <Input id="p-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="Nova senha" htmlFor="p-new" hint="Mínimo 8 caracteres, com letras e números">
              <Input id="p-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" variant="outline" className="self-start" disabled={!pw.current || !pw.next}>
            Trocar senha
          </Button>
        </form>
      </Card>

      <button type="button" onClick={() => setQrOpen(true)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left font-semibold shadow-xs hover:bg-accent">
        <QrCode className="h-5 w-5 text-brand" aria-hidden />
        <span className="flex-1">
          Entrar no app com QR Code
          <span className="block text-sm font-normal text-muted-foreground">Leia com o celular e pronto, sem digitar senha.</span>
        </span>
      </button>
      <AppLoginQr open={qrOpen} onClose={() => setQrOpen(false)} />

      <Link href="/assinatura" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 font-semibold shadow-xs hover:bg-accent">
        <CreditCard className="h-5 w-5 text-brand" aria-hidden /> Assinatura e plano
      </Link>

      {user.role === 'platform_admin' && (
        <Link href="/admin" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 font-semibold shadow-xs hover:bg-accent">
          <Shield className="h-5 w-5 text-brand" aria-hidden /> Administração da plataforma
        </Link>
      )}

      <Button variant="ghost" className="self-start text-danger" onClick={logout}>
        <LogOut className="h-4 w-4" aria-hidden /> Sair da conta
      </Button>
    </div>
  );
}
