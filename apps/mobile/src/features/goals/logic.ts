// Goal form rules — same templates, previews and validation as the portal's components/app/goal-form.tsx.
// Pure (no React Native) so test/goals.test.mjs runs in Node.
import { describeGoal, normalizeGoal, weeklyCommitmentCents } from '@tenace/rules';
import type { GoalInput } from '@tenace/types';

export const GOAL_TEMPLATES: (GoalInput & { label: string })[] = [
  { label: 'Leitura diária', name: 'Leitura', emoji: '📚', period: 'daily', target: 10, unit: 'páginas', stakeCents: 200, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] },
  { label: 'Academia', name: 'Academia', emoji: '🏋️', period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [] },
  { label: 'Corrida', name: 'Corrida', emoji: '🏃', period: 'weekly', target: 15, unit: 'km', slotsPerWeek: 3, stakeCents: 500, activeWeekdays: [] },
  { label: 'Meditação', name: 'Meditação', emoji: '🧘', period: 'daily', target: 10, unit: 'minutos', stakeCents: 200, activeWeekdays: [1, 2, 3, 4, 5] },
  { label: 'Sem doce', name: 'Dia sem doce', emoji: '🍫', period: 'daily', target: 1, unit: 'times', stakeCents: 300, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] },
  { label: 'Estudo', name: 'Estudo', emoji: '🎓', period: 'weekly', target: 5, unit: 'horas', slotsPerWeek: 5, stakeCents: 500, activeWeekdays: [] },
];

export const UNITS = [
  { value: 'times', label: 'vezes' },
  { value: 'páginas', label: 'páginas' },
  { value: 'minutos', label: 'minutos' },
  { value: 'horas', label: 'horas' },
  { value: 'km', label: 'km' },
  { value: 'copos', label: 'copos' },
];
export const EMOJIS = ['📚', '🏋️', '🏃', '🧘', '🚴', '🏊', '💧', '🎓', '✍️', '🥗', '🍫', '😴', '🎸', '💻', '🙏', '🎯'];

export const emptyGoal = (): GoalInput => ({ name: '', emoji: '🎯', period: 'weekly', target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [1, 2, 3, 4, 5, 6, 7] });

export function goalPreview(g: GoalInput) {
  const n = normalizeGoal({ ...g, activeWeekdays: g.activeWeekdays.length ? g.activeWeekdays : [1, 2, 3, 4, 5, 6, 7] });
  return { slots: n.slotsPerWeek, commitment: weeklyCommitmentCents(n), text: describeGoal(n) };
}

export function slotsHint(g: GoalInput): string {
  const slots = g.slotsPerWeek ?? 1;
  if (!slots) return 'Digite em quantas cotas a meta da semana é dividida.';
  if (g.target && slots > g.target) return `No máximo ${g.target} cotas para esta meta.`;
  const step = (g.target || 1) / slots;
  const each = Number.isInteger(step) ? String(step) : `~${Math.ceil(step)}`;
  return `Cada ${each} ${g.unit} paga uma cota.`;
}

export function goalInputProblem(g: GoalInput): string | null {
  if (g.name.trim().length < 2) return 'Dê um nome para a meta';
  if (!g.target || g.target < 1) return 'Defina a meta (número maior que zero)';
  if (!g.stakeCents || g.stakeCents < 1) return 'Defina o valor da cota';
  if (g.period === 'daily' && g.activeWeekdays.length === 0) return 'Escolha pelo menos um dia';
  if (!g.unit.trim()) return 'Defina a unidade';
  if (g.period === 'weekly' && g.unit !== 'times') {
    if (g.slotsPerWeek === 0) return 'Diga em quantas cotas dividir a meta';
    if ((g.slotsPerWeek ?? 1) > g.target) return `No máximo ${g.target} cotas para esta meta`;
  }
  return null;
}

/** Body sent to the API: weekly goals always count every weekday. */
export const goalBody = (g: GoalInput): GoalInput => ({ ...g, activeWeekdays: g.period === 'daily' ? g.activeWeekdays : [1, 2, 3, 4, 5, 6, 7] });
