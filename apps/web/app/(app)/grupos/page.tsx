'use client';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/components/app/session';
import { Badge, Button, EmptyState, PageHeader, Spinner, toneClass } from '@/components/ui';
import { cx, formatCents } from '@/lib/format';
import { GROUP_ROLE_LABELS } from '@tenace/types';

export default function GroupsPage() {
  const { groups } = useApp();
  if (!groups) return <Spinner />;
  return (
    <div>
      <PageHeader
        title="Seus grupos"
        description="Cada grupo tem suas metas, seu caixa e sua turma."
        actions={
          <Link href="/grupos/novo">
            <Button>
              <Plus className="h-4 w-4" aria-hidden /> Novo grupo
            </Button>
          </Link>
        }
      />
      {groups.length === 0 ? (
        <EmptyState icon={<span className="text-xl">🔥</span>} title="Nenhum grupo ainda" description="Crie o primeiro ou abra um link de convite que alguém te mandou." />
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.group.id}>
              <Link href={`/g/${g.group.id}`} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-xs transition-colors hover:bg-accent">
                <span className={cx('tone-bg flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl', toneClass(g.group.color))}>{g.group.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{g.group.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {g.memberCount} {g.memberCount === 1 ? 'pessoa' : 'pessoas'} · {GROUP_ROLE_LABELS[g.role]}
                    {g.charged && <> · semana {formatCents(g.weekBalanceCents)}</>}
                  </p>
                </div>
                {g.pendingActions > 0 && <Badge tone="spark">{g.pendingActions}</Badge>}
                <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
