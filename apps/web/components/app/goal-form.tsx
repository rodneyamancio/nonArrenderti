'use client';
import { describeGoal, normalizeGoal, WEEKDAY_LABELS, weeklyCommitmentCents } from '@tenace/rules';
import type { GoalInput, MemberView } from '@tenace/types';
import { Chip, Field, Input, MoneyInput, Segmented, Select } from '@/components/ui';
import { cx, formatCents } from '@/lib/format';

export const GOAL_TEMPLATES: (GoalInput & { label: string })[] = [
  { label: 'Leitura diária', name: 'Leitura', emoji: '📚', period: 'daily', target: 10, unit: 'páginas', stakeCents: 200, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] },
  { label: 'Academia', name: 'Academia', emoji: '🏋️', period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [] },
  { label: 'Corrida', name: 'Corrida', emoji: '🏃', period: 'weekly', target: 15, unit: 'km', slotsPerWeek: 3, stakeCents: 500, activeWeekdays: [] },
  { label: 'Meditação', name: 'Meditação', emoji: '🧘', period: 'daily', target: 10, unit: 'minutos', stakeCents: 200, activeWeekdays: [1, 2, 3, 4, 5] },
  { label: 'Sem doce', name: 'Dia sem doce', emoji: '🍫', period: 'daily', target: 1, unit: 'times', stakeCents: 300, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] },
  { label: 'Estudo', name: 'Estudo', emoji: '🎓', period: 'weekly', target: 5, unit: 'horas', slotsPerWeek: 5, stakeCents: 500, activeWeekdays: [] },
];

const UNITS = [
  { value: 'times', label: 'vezes' },
  { value: 'páginas', label: 'páginas' },
  { value: 'minutos', label: 'minutos' },
  { value: 'horas', label: 'horas' },
  { value: 'km', label: 'km' },
  { value: 'copos', label: 'copos' },
];
const EMOJIS = ['📚', '🏋️', '🏃', '🧘', '🚴', '🏊', '💧', '🎓', '✍️', '🥗', '🍫', '😴', '🎸', '💻', '🙏', '🎯'];

export const emptyGoal = (): GoalInput => ({ name: '', emoji: '🎯', period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] });

export function goalPreview(g: GoalInput) {
  const n = normalizeGoal({ ...g, activeWeekdays: g.activeWeekdays.length ? g.activeWeekdays : [1, 2, 3, 4, 5, 6, 7] });
  return { slots: n.slotsPerWeek, commitment: weeklyCommitmentCents(n), text: describeGoal(n) };
}

export function GoalFields({ value, onChange, members, idPrefix = 'goal' }: { value: GoalInput; onChange: (g: GoalInput) => void; members?: MemberView[]; idPrefix?: string }) {
  const set = (patch: Partial<GoalInput>) => onChange({ ...value, ...patch });
  const custom = !UNITS.some((u) => u.value === value.unit);
  const preview = goalPreview(value);
  const weeklyQty = value.period === 'weekly' && value.unit !== 'times';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Field label="Emoji" htmlFor={`${idPrefix}-emoji`} className="w-20 shrink-0">
          <Select id={`${idPrefix}-emoji`} value={value.emoji} onChange={(e) => set({ emoji: e.target.value })} className="text-xl">
            {(EMOJIS.includes(value.emoji) ? EMOJIS : [value.emoji, ...EMOJIS]).map((e) => (
              <option key={e}>{e}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nome da meta" htmlFor={`${idPrefix}-name`} className="flex-1">
          <Input id={`${idPrefix}-name`} maxLength={40} placeholder="Ex.: Academia" value={value.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
      </div>

      <Field label="Frequência" htmlFor={`${idPrefix}-period`}>
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

      <div className="form-grid">
        <Field label={value.period === 'daily' ? 'Meta por dia' : 'Meta por semana'} htmlFor={`${idPrefix}-target`}>
          <Input id={`${idPrefix}-target`} inputMode="numeric" value={value.target || ''} onChange={(e) => set({ target: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        </Field>
        <Field label="Unidade" htmlFor={`${idPrefix}-unit`}>
          <Select id={`${idPrefix}-unit`} value={custom ? '__custom' : value.unit} onChange={(e) => set({ unit: e.target.value === '__custom' ? 'unidades' : e.target.value })}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
            <option value="__custom">outra…</option>
          </Select>
        </Field>
        {custom && (
          <Field label="Qual unidade?" htmlFor={`${idPrefix}-unit-custom`}>
            <Input id={`${idPrefix}-unit-custom`} maxLength={20} value={value.unit} onChange={(e) => set({ unit: e.target.value })} />
          </Field>
        )}
      </div>

      {value.period === 'daily' && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Em quais dias?</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = value.activeWeekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ activeWeekdays: on ? value.activeWeekdays.filter((x) => x !== d) : [...value.activeWeekdays, d].sort() })}
                  className={cx('h-10 w-11 rounded-md border text-sm font-semibold capitalize', on ? 'border-brand-solid bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground')}
                >
                  {WEEKDAY_LABELS[d]}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {weeklyQty && (
        <Field label="Dividir em quantas cotas?" htmlFor={`${idPrefix}-slots`} hint={`Cada ${Math.max(1, Math.round((value.target || 1) / (value.slotsPerWeek || 1)))} ${value.unit} paga uma cota.`}>
          <Input id={`${idPrefix}-slots`} inputMode="numeric" value={value.slotsPerWeek ?? 1} onChange={(e) => set({ slotsPerWeek: Math.max(1, Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
        </Field>
      )}

      <Field label="Valor de cada cota" htmlFor={`${idPrefix}-stake`} hint="É o que você paga de volta a cada vez que cumpre.">
        <MoneyInput id={`${idPrefix}-stake`} value={value.stakeCents || null} onChange={(c) => set({ stakeCents: c ?? 0 })} />
      </Field>

      {members && members.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Quem participa desta meta?</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = !(value.excludedMemberIds ?? []).includes(m.id);
              return (
                <Chip key={m.id} active={on} onClick={() => set({ excludedMemberIds: on ? [...(value.excludedMemberIds ?? []), m.id] : (value.excludedMemberIds ?? []).filter((x) => x !== m.id) })}>
                  {m.name.split(' ')[0]}
                </Chip>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="rounded-lg bg-brand-soft px-4 py-3 text-sm">
        <p className="font-semibold text-brand">
          {value.emoji} {preview.text} · {preview.slots} {preview.slots === 1 ? 'cota' : 'cotas'} de {formatCents(value.stakeCents || 0)}
        </p>
        <p className="mt-0.5 text-foreground/80">
          Compromisso semanal: <strong className="tabular-nums">{formatCents(preview.commitment)}</strong> por pessoa
        </p>
      </div>
    </div>
  );
}

export function goalInputProblem(g: GoalInput): string | null {
  if (g.name.trim().length < 2) return 'Dê um nome para a meta';
  if (!g.target || g.target < 1) return 'Defina a meta (número maior que zero)';
  if (!g.stakeCents || g.stakeCents < 1) return 'Defina o valor da cota';
  if (g.period === 'daily' && g.activeWeekdays.length === 0) return 'Escolha pelo menos um dia';
  if (!g.unit.trim()) return 'Defina a unidade';
  return null;
}
