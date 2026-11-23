'use client';
import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Segmented, Spinner, toneClass } from '@/components/ui';
import { cx, fmtDay, formatCents, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/use-api';

type GroupState = 'active' | 'paused_billing' | 'paused_plan' | 'archived';
type Filter = 'all' | 'active' | 'paused' | 'archived';

interface AdminGroup {
  id: string;
  name: string;
  emoji: string;
  color: string;
  createdAt: string;
  archivedAt: string | null;
  owner: { id: string; name: string; email: string } | null;
  ownerPlan: string | null;
  members: number;
  goals: number;
  state: GroupState;
}

interface AdminGroupDetail {
  id: string;
  description: string;
  timezone: string;
  startsOn: string;
  weeksClosed: number;
  lastWeek: { weekStart: string; status: string } | null;
  members: { id: string; name: string; email: string; avatarColor: string; role: 'owner' | 'admin' | 'member'; status: string; joinedAt: string; streak: number }[];
  goals: { id: string; name: string; emoji: string; period: 'daily' | 'weekly'; target: number; unit: string; stakeCents: number; slotsPerWeek: number }[];
}

const STATE: Record<GroupState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Ativo', tone: 'success' },
  paused_billing: { label: 'Pausado · atraso', tone: 'danger' },
  paused_plan: { label: 'Pausado · plano', tone: 'warning' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};
const ROLE = { owner: 'dono', admin: 'admin', member: 'membro' } as const;

/** Platform staff: every group, read-only (the admin never enters a group). */
export function AdminGroups() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (filter !== 'all') params.set('status', filter);
  const qs = params.toString();
  const { data, error, reload } = useApi<{ groups: AdminGroup[]; total: number }>(`/admin/groups${qs ? `?${qs}` : ''}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <Input aria-label="Buscar grupo" placeholder="Nome do grupo, dono ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" aria-hidden /> Buscar
          </Button>
        </form>
        <Segmented
          label="Situação"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'active', label: 'Ativos' },
            { value: 'paused', label: 'Pausados' },
            { value: 'archived', label: 'Arquivados' },
          ]}
        />
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : !data.groups.length ? (
        <EmptyState title="Nenhum grupo encontrado" description={query ? 'Tente outro nome ou e-mail.' : 'Ainda não há grupos nesta situação.'} />
      ) : (
        <Card padded={false} title={`${data.total} ${data.total === 1 ? 'grupo' : 'grupos'}`} description="Somente leitura. Toque num grupo para ver membros e metas.">
          <ul className="divide-y divide-border">
            {data.groups.map((g) => (
              <li key={g.id}>
                <button type="button" className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/50" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
                  <span className={cx('tone-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl', toneClass(g.color))} aria-hidden>
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      <span className="truncate">{g.name}</span>
                      <Badge tone={STATE[g.state].tone}>{STATE[g.state].label}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.owner ? `${g.owner.name} (${g.owner.email})` : 'sem dono'} · plano {g.ownerPlan ?? '—'} · {g.members} {g.members === 1 ? 'pessoa' : 'pessoas'} · {g.goals} {g.goals === 1 ? 'meta' : 'metas'} · criado {timeAgo(g.createdAt)}
                    </p>
                  </div>
                  <ChevronDown className={cx('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open === g.id && 'rotate-180')} aria-hidden />
                </button>
                {open === g.id && <GroupDetail id={g.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function GroupDetail({ id }: { id: string }) {
  const { data, error, reload } = useApi<AdminGroupDetail>(`/admin/groups/${id}`);
  if (error && !data) return <div className="px-5 pb-4"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="px-5 pb-4"><Spinner /></div>;
  return (
    <div className="grid gap-4 bg-muted/30 px-5 py-4 lg:grid-cols-2">
      <section aria-label="Membros">
        <h3 className="mb-2 text-sm font-bold">Membros ({data.members.length})</h3>
        <ul className="flex flex-col gap-2">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5">
              <Avatar name={m.name} color={m.avatarColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name} <span className="text-xs text-muted-foreground">· {ROLE[m.role]}{m.status === 'leaving' ? ' · saindo' : ''}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email} · desde {fmtDay(m.joinedAt.slice(0, 10))}{m.streak ? ` · 🔥 ${m.streak}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Metas">
        <h3 className="mb-2 text-sm font-bold">Metas</h3>
        {data.goals.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.goals.map((x) => (
              <li key={x.id}>
                {x.emoji} <span className="font-medium">{x.name}</span>{' '}
                <span className="text-muted-foreground">
                  · {x.target} {x.unit === 'times' ? 'vezes' : x.unit} por {x.period === 'daily' ? 'dia' : 'semana'} · {formatCents(x.stakeCents)} por cota
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sem metas ativas.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Começou em {fmtDay(data.startsOn)} · {data.weeksClosed} {data.weeksClosed === 1 ? 'semana fechada' : 'semanas fechadas'}
          {data.lastWeek ? ` · última semana ${fmtDay(data.lastWeek.weekStart)} (${data.lastWeek.status === 'open' ? 'aberta' : 'fechada'})` : ''} · {data.timezone}
        </p>
      </section>
    </div>
  );
}
