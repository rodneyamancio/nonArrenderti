'use client';
import { GROUP_ROLE_LABELS, type InviteView, type JoinRequestView, type MemberView } from '@tenace/types';
import { Link2, Mail, Share2, UserMinus, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useGroup } from '@/components/app/group-context';
import { emitDataChanged } from '@/components/app/session';
import { Avatar, Badge, Button, Card, CopyButton, ErrorState, Input, Notice, Select, Spinner, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDay, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function MembersPage() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}

function Members() {
  const { group, can, reload: reloadGroup } = useGroup();
  const router = useRouter();
  const toast = useToast();
  const isNew = useSearchParams().get('novo') === '1';
  const { data, error, reload } = useApi<{ members: MemberView[] }>(`/groups/${group.id}/members`);
  const canInvite = can('group:member:invite');
  const isOwner = group.me.role === 'owner';

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok);
      void reload();
      void reloadGroup();
      emitDataChanged();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  async function leave() {
    if (!confirm('Sair do grupo? Você ainda responde pela semana atual e por valores em aberto.')) return;
    try {
      await api(`/groups/${group.id}/leave`, { method: 'POST' });
      toast('Você saiu do grupo');
      emitDataChanged();
      router.replace('/inicio');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-5">
        {isNew && (
          <Notice tone="success" title="Grupo criado! 🎉">
            Agora convide a galera: gere um link e mande no grupo do WhatsApp.
          </Notice>
        )}
        {can('group:member:approve') && <JoinRequests onChange={() => act(async () => undefined, 'Atualizado')} />}
        <Card title={`Membros (${data.members.length})`} padded={false}>
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name} color={m.avatarColor} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {m.name} {m.id === group.me.memberId && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.status === 'leaving' && m.endsAfterWeek ? `sai após a semana de ${fmtDay(m.endsAfterWeek)}` : m.startsOnWeek > new Date().toISOString().slice(0, 10) ? `começa em ${fmtDay(m.startsOnWeek)}` : m.streak > 0 ? `🔥 ${m.streak} ${m.streak === 1 ? 'semana' : 'semanas'} seguidas` : `entrou ${timeAgo(m.joinedAt)}`}
                  </p>
                </div>
                <Badge tone={m.role === 'owner' ? 'brand' : m.role === 'admin' ? 'spark' : 'neutral'}>{GROUP_ROLE_LABELS[m.role]}</Badge>
                {m.id !== group.me.memberId && m.role !== 'owner' && (isOwner || (can('group:member:remove') && m.role === 'member')) && (
                  <div className="flex w-full items-center gap-2 pl-12 sm:w-auto sm:pl-0">
                    {isOwner && (
                      <Select aria-label={`Papel de ${m.name}`} value={m.role} className="h-9 w-auto text-sm" onChange={(e) => act(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Papel atualizado')}>
                        <option value="member">Membro</option>
                        <option value="admin">Admin</option>
                      </Select>
                    )}
                    {isOwner && (
                      <Button variant="ghost" size="sm" onClick={() => confirm(`Transferir o grupo para ${m.name}? Você vira admin.`) && act(() => api(`/groups/${group.id}/members/${m.id}/transfer`, { method: 'POST' }), 'Grupo transferido')}>
                        Tornar dono
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Remover ${m.name}`} onClick={() => confirm(`Remover ${m.name}? A saída vale depois que a semana atual fechar.`) && act(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'DELETE' }), 'Membro removido')}>
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {!isOwner && (
          <Button variant="ghost" className="self-start text-danger" onClick={leave}>
            Sair do grupo
          </Button>
        )}
      </div>
      {canInvite && <Invites />}
    </div>
  );
}

function JoinRequests({ onChange }: { onChange: () => void }) {
  const { group } = useGroup();
  const toast = useToast();
  const { data, reload } = useApi<{ requests: JoinRequestView[] }>(`/groups/${group.id}/join-requests`);
  if (!data || data.requests.length === 0) return null;
  async function decide(r: JoinRequestView, d: 'approve' | 'reject') {
    try {
      await api(`/groups/${group.id}/join-requests/${r.id}/${d}`, { method: 'POST' });
      toast(d === 'approve' ? `${r.name} entrou no grupo 🎉` : 'Pedido recusado');
      void reload();
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  return (
    <Card title="Pedidos para entrar" description="Pessoas que abriram o link de convite." className="border-spark-solid">
      <ul className="flex flex-col gap-3">
        {data.requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3">
            <Avatar name={r.name} color={r.avatarColor} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">{r.email}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide(r, 'approve')}>
                Aprovar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide(r, 'reject')}>
                Recusar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Invites() {
  const { group } = useGroup();
  const toast = useToast();
  const { data, reload } = useApi<{ invites: InviteView[] }>(`/groups/${group.id}/invites`);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'email' | 'link' | null>(null);
  const [last, setLast] = useState<{ url: string; emailSent: boolean; kind: 'email' | 'link' } | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function create(kind: 'email' | 'link') {
    setBusy(kind);
    try {
      const r = await api<{ url: string; token: string; emailSent: boolean }>(`/groups/${group.id}/invites`, { method: 'POST', body: kind === 'email' ? { kind, email } : { kind } });
      setLast({ url: `${origin}/convite/${r.token}`, emailSent: r.emailSent, kind });
      setEmail('');
      void reload();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function share(url: string) {
    const text = `Bora entrar no grupo ${group.emoji} ${group.name} no Tenace? Metas semanais, e quem falhar paga pro caixa 😅`;
    if (navigator.share) await navigator.share({ title: 'Convite Tenace', text, url }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
  }

  return (
    <div className="flex flex-col gap-5">
      <Card title="Convidar pessoas" description="Você decide quem entra: convites por link passam pela sua aprovação.">
        <div className="flex flex-col gap-4">
          <Button variant="brand" size="lg" onClick={() => create('link')} loading={busy === 'link'}>
            <Link2 className="h-4 w-4" aria-hidden /> Gerar link de convite
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create('email');
            }}
          >
            <Input type="email" aria-label="E-mail do convidado" placeholder="ou convide por e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="outline" loading={busy === 'email'} disabled={!email.includes('@')}>
              <Mail className="h-4 w-4" aria-hidden /> Convidar
            </Button>
          </form>
          {last && (
            <div className="animate-in rounded-lg bg-brand-soft p-4">
              <p className="text-sm font-semibold text-brand">{last.kind === 'email' ? (last.emailSent ? 'E-mail enviado! Se preferir, mande o link também:' : 'Convite criado. Mande este link para a pessoa (vale só para o e-mail convidado):') : 'Link pronto! Vale por 7 dias:'}</p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={last.url} aria-label="Link do convite" className="text-xs" onFocus={(e) => e.target.select()} />
                <CopyButton text={last.url} />
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => share(last.url)}>
                <Share2 className="h-4 w-4" aria-hidden /> Compartilhar
              </Button>
            </div>
          )}
        </div>
      </Card>
      {data && data.invites.length > 0 && (
        <Card title="Convites ativos" padded={false}>
          <ul className="divide-y divide-border">
            {data.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.kind === 'email' ? i.email : 'Link de convite'}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.uses} {i.uses === 1 ? 'uso' : 'usos'} · expira {fmtDay(i.expiresAt.slice(0, 10))}
                  </p>
                </div>
                <CopyButton text={`${origin}/convite/${i.token}`} label="Link" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Revogar convite"
                  onClick={async () => {
                    await api(`/groups/${group.id}/invites/${i.id}`, { method: 'DELETE' });
                    void reload();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
