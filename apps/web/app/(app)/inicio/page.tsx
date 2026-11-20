'use client';
import { Link2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GroupCard } from '@/components/app/group-card';
import { useApp } from '@/components/app/session';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { formatCents, greeting } from '@/lib/format';

export default function HomePage() {
  const { user, groups } = useApp();
  const first = user.name.split(' ')[0];
  if (!groups) return <Spinner />;

  const charged = groups.filter((g) => g.charged);
  const weekTotal = charged.reduce((s, g) => s + g.weekBalanceCents, 0);
  const missing = charged.reduce((s, g) => s + g.goals.reduce((x, wg) => x + Math.max(0, wg.slotsPerWeek - wg.slotsAchieved), 0), 0);
  const debt = groups.reduce((s, g) => s + Math.max(0, g.openDebtCents), 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{greeting()},</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{first} 👋</h1>
        </div>
        {groups.length > 0 && (
          <Link href="/grupos/novo">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" aria-hidden /> Novo grupo
            </Button>
          </Link>
        )}
      </header>

      {groups.length === 0 ? (
        <Welcome />
      ) : (
        <>
          {charged.length > 0 && (
            <section aria-label="Resumo da semana" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 rounded-xl bg-[linear-gradient(135deg,#6d3bff,#a47bff)] p-5 text-white shadow-md sm:col-span-1">
                <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">Esta semana</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums">{formatCents(weekTotal)}</p>
                <p className="mt-1 text-sm text-white/85">{missing === 0 ? 'Tudo pago! Você é tenace 🏆' : `${missing} ${missing === 1 ? 'cota' : 'cotas'} para zerar`}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Grupos</p>
                <p className="mt-1 text-2xl font-extrabold">{groups.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Em aberto</p>
                <p className={`mt-1 text-2xl font-extrabold tabular-nums ${debt > 0 ? 'text-danger' : ''}`}>{formatCents(debt)}</p>
              </div>
            </section>
          )}
          <div className="grid gap-5 xl:grid-cols-2">
            {groups.map((g) => (
              <GroupCard key={g.group.id} data={g} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Welcome() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const token = /convite\/([A-Za-z0-9_-]+)/.exec(link)?.[1] ?? (/^[A-Za-z0-9_-]{16,}$/.test(link.trim()) ? link.trim() : null);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="tone-violet tone-bg relative overflow-hidden rounded-xl p-7 shadow-md">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
        <p className="text-sm font-semibold text-white/80">Vamos começar</p>
        <h2 className="mt-1 max-w-md text-2xl leading-tight font-extrabold">Crie um grupo, defina as metas e deixe o compromisso fazer o resto.</h2>
        <ol className="mt-5 flex flex-col gap-2 text-sm text-white/90">
          <li>1. Escolha as atividades (ler, treinar, correr…)</li>
          <li>2. Defina o valor de cada cota (ex.: R$ 5)</li>
          <li>3. Convide quem vai participar</li>
        </ol>
        <Link href="/grupos/novo" className="mt-6 inline-flex h-12 items-center gap-2 rounded-md bg-white px-5 font-bold text-[#4a1fd1] shadow-md">
          <Plus className="h-5 w-5" aria-hidden /> Criar meu grupo
        </Link>
      </section>
      <Card title="Recebeu um convite?" description="Cole o link que te mandaram.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (token) router.push(`/convite/${token}`);
          }}
        >
          <Input aria-label="Link do convite" placeholder="https://…/convite/…" value={link} onChange={(e) => setLink(e.target.value)} />
          <Button type="submit" variant="soft" disabled={!token}>
            <Link2 className="h-4 w-4" aria-hidden /> Abrir convite
          </Button>
        </form>
      </Card>
    </div>
  );
}
