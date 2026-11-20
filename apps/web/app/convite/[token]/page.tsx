'use client';
import type { InvitePreview, SessionUser } from '@tenace/types';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenaceLogo } from '@/components/brand';
import { Button, ErrorState, Notice, Spinner, toneClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx } from '@/lib/format';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview>();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<{ status: string; groupId: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    api<InvitePreview>(`/invites/${token}`).then(setPreview).catch(setError);
    api<{ user: SessionUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, [token]);

  async function accept() {
    setJoining(true);
    setJoinError('');
    try {
      const r = await api<{ status: string; groupId: string }>(`/invites/${token}/accept`, { method: 'POST' });
      if (r.status === 'joined' || r.status === 'already_member') router.replace(`/g/${r.groupId}`);
      else setResult(r);
    } catch (e) {
      setJoinError(errorMessage(e));
    } finally {
      setJoining(false);
    }
  }

  const next = encodeURIComponent(`/convite/${token}`);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8">
        <TenaceLogo tagline />
      </Link>
      <div className="w-full max-w-md">
        {error ? (
          <ErrorState error={error} />
        ) : !preview || user === undefined ? (
          <Spinner />
        ) : (
          <div className="animate-in overflow-hidden rounded-xl border border-border bg-card shadow-md">
            <div className={cx('tone-bg flex flex-col items-center gap-2 px-6 py-8 text-center', toneClass(preview.group.color))}>
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-4xl">{preview.group.emoji}</span>
              <p className="text-sm text-white/85">{preview.invitedBy} te convidou para</p>
              <h1 className="text-2xl font-extrabold">{preview.group.name}</h1>
              <p className="flex items-center gap-1.5 text-sm text-white/85">
                <Users className="h-4 w-4" aria-hidden /> {preview.group.memberCount} {preview.group.memberCount === 1 ? 'pessoa' : 'pessoas'}
              </p>
            </div>
            <div className="flex flex-col gap-4 p-6">
              {preview.group.description && <p className="text-center text-sm text-muted-foreground">{preview.group.description}</p>}
              {!preview.valid ? (
                <Notice tone="warning">Este convite expirou ou já foi usado. Peça um novo para quem te convidou.</Notice>
              ) : result ? (
                <Notice tone="success" title="Pedido enviado!">
                  Um admin do grupo vai aprovar sua entrada. Você recebe um aviso no Tenace.
                </Notice>
              ) : user ? (
                <>
                  {joinError && <Notice tone="danger">{joinError}</Notice>}
                  {preview.kind === 'email' && preview.email && <p className="text-center text-xs text-muted-foreground">Convite para {preview.email}</p>}
                  <Button size="lg" onClick={accept} loading={joining}>
                    {preview.kind === 'link' ? 'Pedir para entrar' : 'Entrar no grupo'}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">Entrando como {user.email}</p>
                </>
              ) : (
                <>
                  <Link href={`/criar-conta?next=${next}`}>
                    <Button size="lg" className="w-full">
                      Criar conta e entrar
                    </Button>
                  </Link>
                  <Link href={`/entrar?next=${next}`}>
                    <Button size="lg" variant="outline" className="w-full">
                      Já tenho conta
                    </Button>
                  </Link>
                </>
              )}
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-semibold">Como funciona</p>
                <p className="mt-1 text-muted-foreground">Toda semana você começa devendo o valor das suas metas. Cada vez que cumpre uma, paga uma cota. Cumpriu tudo? Zerou. O que faltar vai para o caixa do grupo.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
