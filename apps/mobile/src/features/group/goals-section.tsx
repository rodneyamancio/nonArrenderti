import { errorMessage } from '@tenace/api-client';
import type { GoalInput, GoalView, MemberView } from '@tenace/types';
import { Archive, Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useApi, useMutation } from '@/data/use-api';
import { GoalSheet } from '@/features/goals/goal-fields';
import { emptyGoal, goalBody } from '@/features/goals/logic';
import { emitDataChanged } from '@/lib/events';
import { describeGoal, formatCents } from '@/lib/format';
import { api } from '@/session/provider';
import { Button, Card, EmptyState, ErrorState, IconButton, Loading, Notice, T, useToast } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';
import { useGroup } from './group-context';

export function GoalsSection() {
  const { group, can } = useGroup();
  const { c } = useTheme();
  const toast = useToast();
  const { data, error, reload } = useApi<{ goals: GoalView[] }>(`/groups/${group.id}/goals`);
  const members = useApi<{ members: MemberView[] }>(`/groups/${group.id}/members`).data?.members;
  const [editing, setEditing] = useState<{ id: string | null; goal: GoalInput } | null>(null);
  const { busy, run } = useMutation();
  const manage = can('goal:goal:manage');

  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;
  const total = data.goals.reduce((s, g) => s + g.slotsPerWeek * g.stakeCents, 0);
  const names = new Map((members ?? []).map((m) => [m.id, m.name.split(' ')[0] ?? m.name]));

  function archive(g: GoalView) {
    Alert.alert(`Encerrar a meta "${g.name}"?`, 'Ela deixa de contar a partir da próxima semana.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Encerrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/groups/${group.id}/goals/${g.id}`, { method: 'DELETE' });
            toast('Meta encerrada');
            void reload();
          } catch (e) {
            toast(errorMessage(e), 'danger');
          }
        },
      },
    ]);
  }

  const save = async (goal: GoalInput): Promise<string | null> =>
    (await run(async () => {
      if (!editing) return null;
      try {
        if (editing.id) await api(`/groups/${group.id}/goals/${editing.id}`, { method: 'PATCH', body: goalBody(goal) });
        else await api(`/groups/${group.id}/goals`, { method: 'POST', body: goalBody(goal) });
        toast(editing.id ? 'Meta atualizada — vale a partir da próxima semana' : 'Meta criada — vale a partir da próxima semana');
        setEditing(null);
        void reload();
        emitDataChanged();
        return null;
      } catch (e) {
        return errorMessage(e);
      }
    })) ?? null;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T size={18} weight="extrabold">
            Metas do grupo
          </T>
          <T size={14} tone="muted">
            Compromisso semanal por pessoa: <T size={14} weight="bold">{formatCents(total)}</T>
          </T>
        </View>
        {manage && <Button label="Nova meta" icon={Plus} size="sm" onPress={() => setEditing({ id: null, goal: emptyGoal() })} />}
      </View>
      {manage && <Notice tone="info">Mudanças em metas valem a partir da próxima semana — a semana em andamento não muda.</Notice>}
      {data.goals.length === 0 ? (
        <EmptyState emoji="🎯" title="Nenhuma meta ativa" description={manage ? 'Crie uma meta para o grupo voltar a contar.' : 'Peça a um admin para criar as metas.'} />
      ) : (
        data.goals.map((g) => (
          <Card key={g.id}>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>{g.emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold">{g.name}</T>
                <T size={14} tone="muted">
                  {describeGoal(g)}
                </T>
                <T size={14} style={{ marginTop: 6 }}>
                  {g.slotsPerWeek} {g.slotsPerWeek === 1 ? 'cota' : 'cotas'} × {formatCents(g.stakeCents)} = <T size={14} weight="bold">{`${formatCents(g.slotsPerWeek * g.stakeCents)}/semana`}</T>
                </T>
                {g.excludedMemberIds.length > 0 && (
                  <T size={12} tone="muted">
                    Não participa: {g.excludedMemberIds.map((id) => names.get(id) ?? '—').join(', ')}
                  </T>
                )}
              </View>
              {manage && (
                <View>
                  <IconButton icon={Pencil} label={`Editar ${g.name}`} onPress={() => setEditing({ id: g.id, goal: { name: g.name, emoji: g.emoji, period: g.period, target: g.target, unit: g.unit, slotsPerWeek: g.slotsPerWeek, stakeCents: g.stakeCents, activeWeekdays: g.activeWeekdays, excludedMemberIds: g.excludedMemberIds } })} />
                  <IconButton icon={Archive} label={`Encerrar ${g.name}`} onPress={() => archive(g)} />
                </View>
              )}
            </View>
          </Card>
        ))
      )}
      <GoalSheet state={editing ? { title: editing.id ? 'Editar meta' : 'Nova meta', goal: editing.goal, isNew: !editing.id } : null} members={members} saving={busy} onClose={() => setEditing(null)} onSave={save} />
    </View>
  );
}
