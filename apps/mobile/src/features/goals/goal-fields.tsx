import { WEEKDAY_LABELS } from '@tenace/rules';
import type { GoalInput, MemberView } from '@tenace/types';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatCents } from '@/lib/format';
import { Button, Chip, Field, Input, MoneyInput, Notice, Segmented, Stepper, T } from '@/ui/kit';
import { Sheet } from '@/ui/sheet';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';
import { EMOJIS, GOAL_TEMPLATES, goalInputProblem, goalPreview, slotsHint, UNITS } from './logic';

/** Same fields as the portal's GoalFields, laid out for the thumb. */
export function GoalFields({ value, onChange, members }: { value: GoalInput; onChange: (g: GoalInput) => void; members?: MemberView[] }) {
  const { c } = useTheme();
  const set = (patch: Partial<GoalInput>) => onChange({ ...value, ...patch });
  const custom = !UNITS.some((u) => u.value === value.unit);
  const preview = goalPreview(value);
  const weeklyQty = value.period === 'weekly' && value.unit !== 'times';
  const emojis = EMOJIS.includes(value.emoji) ? EMOJIS : [value.emoji, ...EMOJIS];

  return (
    <View style={{ gap: 16 }}>
      <Field label="Nome da meta">
        <Input maxLength={40} placeholder="Ex.: Academia" value={value.name} onChangeText={(name) => set({ name })} accessibilityLabel="Nome da meta" />
      </Field>
      <View style={{ gap: 8 }}>
        <T size={14} weight="semibold">
          Emoji
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {emojis.map((e) => (
            <Pressable key={e} onPress={() => set({ emoji: e })} accessibilityRole="button" accessibilityLabel={`Emoji ${e}`} accessibilityState={{ selected: e === value.emoji }} style={{ width: 46, height: 46, borderRadius: radius.md, borderWidth: e === value.emoji ? 2 : 1, borderColor: e === value.emoji ? c.brandSolid : c.border, backgroundColor: e === value.emoji ? c.brandSoft : c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Field label="Frequência">
        <Segmented
          label="Frequência"
          value={value.period}
          onChange={(period) => set({ period, ...(period === 'daily' && value.activeWeekdays.length === 0 ? { activeWeekdays: [1, 2, 3, 4, 5, 6, 7] } : {}) })}
          options={[
            { value: 'weekly', label: 'Por semana' },
            { value: 'daily', label: 'Por dia' },
          ]}
        />
      </Field>

      <Field label={value.period === 'daily' ? 'Meta por dia' : 'Meta por semana'}>
        <Input keyboardType="number-pad" value={value.target ? String(value.target) : ''} onChangeText={(t) => set({ target: Number(t.replace(/\D/g, '')) || 0 })} accessibilityLabel={value.period === 'daily' ? 'Meta por dia' : 'Meta por semana'} />
      </Field>
      <View style={{ gap: 8 }}>
        <T size={14} weight="semibold">
          Unidade
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {UNITS.map((u) => (
            <Chip key={u.value} active={value.unit === u.value} onPress={() => set({ unit: u.value })}>
              {u.label}
            </Chip>
          ))}
          <Chip active={custom} onPress={() => !custom && set({ unit: 'unidades' })}>
            outra…
          </Chip>
        </View>
      </View>
      {custom && (
        <Field label="Qual unidade?">
          <Input maxLength={20} value={value.unit} onChangeText={(unit) => set({ unit })} accessibilityLabel="Qual unidade?" />
        </Field>
      )}

      {value.period === 'daily' && (
        <View style={{ gap: 8 }}>
          <T size={14} weight="semibold">
            Em quais dias?
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = value.activeWeekdays.includes(d);
              return (
                <Pressable key={d} onPress={() => set({ activeWeekdays: on ? value.activeWeekdays.filter((x) => x !== d) : [...value.activeWeekdays, d].sort() })} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: on ? c.brandSolid : c.border, backgroundColor: on ? c.brandSoft : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={13} weight="semibold" tone={on ? 'brand' : 'muted'} style={{ textTransform: 'capitalize' }}>
                    {WEEKDAY_LABELS[d]}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {weeklyQty && (
        <Field label="Dividir em quantas cotas?" hint={slotsHint(value)}>
          <Stepper value={value.slotsPerWeek ?? 1} max={Math.min(50, Math.max(1, value.target || 1))} onChange={(n) => set({ slotsPerWeek: n })} label="Cotas" />
        </Field>
      )}

      <Field label="Valor de cada cota" hint="É o que você paga de volta a cada vez que cumpre.">
        <MoneyInput value={value.stakeCents || null} onChange={(cents) => set({ stakeCents: cents ?? 0 })} accessibilityLabel="Valor de cada cota" />
      </Field>

      {members && members.length > 1 && (
        <View style={{ gap: 8 }}>
          <T size={14} weight="semibold">
            Quem participa desta meta?
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((m) => {
              const on = !(value.excludedMemberIds ?? []).includes(m.id);
              return (
                <Chip key={m.id} active={on} onPress={() => set({ excludedMemberIds: on ? [...(value.excludedMemberIds ?? []), m.id] : (value.excludedMemberIds ?? []).filter((x) => x !== m.id) })}>
                  {m.name.split(' ')[0] ?? m.name}
                </Chip>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ backgroundColor: c.brandSoft, borderRadius: radius.md, padding: 14, gap: 2 }}>
        <T size={14} weight="semibold" tone="brand">
          {value.emoji} {preview.text} · {preview.slots} {preview.slots === 1 ? 'cota' : 'cotas'} de {formatCents(value.stakeCents || 0)}
        </T>
        <T size={14}>
          Compromisso semanal: <T size={14} weight="bold">{formatCents(preview.commitment)}</T> por pessoa
        </T>
      </View>
    </View>
  );
}

/** Goal editor sheet: templates on a new goal, validation on save. */
export function GoalSheet({ state, members, saveLabel = 'Salvar', saving, onClose, onSave }: { state: { title: string; goal: GoalInput; isNew: boolean } | null; members?: MemberView[]; saveLabel?: string; saving?: boolean; onClose: () => void; onSave: (g: GoalInput) => Promise<string | null> | string | null }) {
  const [goal, setGoal] = useState<GoalInput | null>(null);
  const [err, setErr] = useState('');
  const current = goal ?? state?.goal ?? null;
  const close = () => {
    setGoal(null);
    setErr('');
    onClose();
  };
  async function save() {
    if (!current) return;
    const p = goalInputProblem(current);
    if (p) return setErr(p);
    const problem = await onSave(current);
    if (problem) return setErr(problem);
    setGoal(null);
    setErr('');
  }
  return (
    <Sheet open={!!state} onClose={close} title={state?.title ?? ''} footer={<Button label={saveLabel} loading={saving} onPress={save} style={{ flex: 1 }} />}>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {state?.isNew && !goal && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GOAL_TEMPLATES.map(({ label, ...t }) => (
            <Chip key={label} onPress={() => setGoal(t)}>
              {`${t.emoji} ${label}`}
            </Chip>
          ))}
        </View>
      )}
      {current && <GoalFields value={current} onChange={setGoal} members={members} />}
    </Sheet>
  );
}
