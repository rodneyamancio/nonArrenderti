'use client';
import type { GoalInput, GoalView, MemberView } from '@tenace/types';
import { Archive, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { emptyGoal, GOAL_TEMPLATES, GoalFields, goalInputProblem } from '@/components/app/goal-form';
import { useGroup } from '@/components/app/group-context';
import { emitDataChanged } from '@/components/app/session';
import { Button, Dialog, EmptyState, ErrorState, Notice, Spinner, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { describeGoal, formatCents } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function GoalsPage() {
  const { group, can } = useGroup();
  const toast = useToast();
  const { data, error, reload } = useApi<{ goals: GoalView[] }>(`/groups/${group.id}/goals`);
  const members = useApi<{ members: MemberView[] }>(`/groups/${group.id}/members`).data?.members;
  const [editing, setEditing] = useState<{ id: string | null; goal: GoalInput } | null>(null);
  const manage = can('goal:goal:manage');

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const total = data.goals.reduce((s, g) => s + g.slotsPerWeek * g.stakeCents, 0);
  const names = new Map((members ?? []).map((m) => [m.id, m.name.split(' ')[0]]));

  async function archive(g: GoalView) {
    if (!confirm(`Encerrar a meta "${g.name}"? Ela deixa de contar a partir da próxima semana.`)) return;
    try {
      await api(`/groups/${group.id}/goals/${g.id}`, { method: 'DELETE' });
      toast('Meta encerrada');
      void reload();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Metas do grupo</h2>
          <p className="text-sm text-muted-foreground">
            Compromisso semanal por pessoa: <strong className="text-foreground tabular-nums">{formatCents(total)}</strong>
          </p>
        </div>
        {manage && (
          <Button onClick={() => setEditing({ id: null, goal: emptyGoal() })}>
            <Plus className="h-4 w-4" aria-hidden /> Nova meta
          </Button>
        )}
      </div>
      {manage && <Notice tone="info">Mudanças em metas valem a partir da próxima semana — a semana em andamento não muda.</Notice>}
      {data.goals.length === 0 ? (
        <EmptyState icon={<span className="text-xl">🎯</span>} title="Nenhuma meta ativa" description={manage ? 'Crie uma meta para o grupo voltar a contar.' : 'Peça a um admin para criar as metas.'} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.goals.map((g) => (
            <li key={g.id} className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-2xl" aria-hidden>
                {g.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{g.name}</p>
                <p className="text-sm text-muted-foreground">{describeGoal(g)}</p>
                <p className="mt-2 text-sm">
                  {g.slotsPerWeek} {g.slotsPerWeek === 1 ? 'cota' : 'cotas'} × {formatCents(g.stakeCents)} = <strong className="tabular-nums">{formatCents(g.slotsPerWeek * g.stakeCents)}/semana</strong>
                </p>
                {g.excludedMemberIds.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Não participa: {g.excludedMemberIds.map((id) => names.get(id) ?? '—').join(', ')}</p>}
              </div>
              {manage && (
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Editar ${g.name}`} onClick={() => setEditing({ id: g.id, goal: { name: g.name, emoji: g.emoji, period: g.period, target: g.target, unit: g.unit, slotsPerWeek: g.slotsPerWeek, stakeCents: g.stakeCents, activeWeekdays: g.activeWeekdays, excludedMemberIds: g.excludedMemberIds } })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Encerrar ${g.name}`} onClick={() => archive(g)}>
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <GoalEditor
        state={editing}
        members={members}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
          emitDataChanged();
        }}
      />
    </div>
  );
}

function GoalEditor({ state, members, onClose, onSaved }: { state: { id: string | null; goal: GoalInput } | null; members?: MemberView[]; onClose: () => void; onSaved: () => void }) {
  const { group } = useGroup();
  const toast = useToast();
  const [goal, setGoal] = useState<GoalInput | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const current = goal ?? state?.goal ?? null;
  const close = () => {
    setGoal(null);
    setErr('');
    onClose();
  };
  async function save() {
    if (!current || !state) return;
    const p = goalInputProblem(current);
    if (p) return setErr(p);
    setSaving(true);
    try {
      const body = { ...current, activeWeekdays: current.period === 'daily' ? current.activeWeekdays : [1, 2, 3, 4, 5, 6, 7] };
      if (state.id) await api(`/groups/${group.id}/goals/${state.id}`, { method: 'PATCH', body });
      else await api(`/groups/${group.id}/goals`, { method: 'POST', body });
      toast(state.id ? 'Meta atualizada — vale a partir da próxima semana' : 'Meta criada — vale a partir da próxima semana');
      setGoal(null);
      setErr('');
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={!!state} onClose={close} title={state?.id ? 'Editar meta' : 'Nova meta'} footer={<Button onClick={save} loading={saving}>Salvar</Button>}>
      {err && (
        <div className="mb-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      {!state?.id && !goal && (
        <div className="mb-4 flex flex-wrap gap-2">
          {GOAL_TEMPLATES.map(({ label, ...t }) => (
            <button key={label} type="button" onClick={() => setGoal(t)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-accent">
              {t.emoji} {label}
            </button>
          ))}
        </div>
      )}
      {current && <GoalFields value={current} onChange={setGoal} members={members} idPrefix="edit-goal" />}
    </Dialog>
  );
}
