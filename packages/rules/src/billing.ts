import { addDays } from './dates';

/** Days after the due date before the account (and the groups it owns) is blocked. */
export const BILLING_GRACE_DAYS = 5;

export interface OpenInvoice {
  dueDate: string; // YYYY-MM-DD
  status: 'open' | 'paid' | 'void';
}

export interface BillingState {
  status: 'ok' | 'due' | 'past_due' | 'blocked';
  /** Oldest open invoice due date. */
  oldestDue: string | null;
  /** Last day still inside the grace period (blocked from the next day). */
  lastGraceDay: string | null;
  /** Days left before the block (past_due), 0 when blocked, null otherwise. */
  daysToBlock: number | null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * Account billing state from its invoices (docs/spec.md §8.10). Pure: `today` is the local
 * date in America/Sao_Paulo. Due on day D → late from D+1 → blocked from D+1+grace.
 */
export function billingState(invoices: OpenInvoice[], today: string, graceDays = BILLING_GRACE_DAYS): BillingState {
  const open = invoices.filter((i) => i.status === 'open').map((i) => i.dueDate).sort();
  const oldest = open[0] ?? null;
  if (!oldest) return { status: 'ok', oldestDue: null, lastGraceDay: null, daysToBlock: null };
  const lastGraceDay = addDays(oldest, graceDays);
  if (today <= oldest) return { status: 'due', oldestDue: oldest, lastGraceDay, daysToBlock: null };
  if (today <= lastGraceDay) return { status: 'past_due', oldestDue: oldest, lastGraceDay, daysToBlock: daysBetween(today, lastGraceDay) + 1 };
  return { status: 'blocked', oldestDue: oldest, lastGraceDay, daysToBlock: 0 };
}

export interface PlanLimits {
  maxGroups: number | null;
  maxMembersPerGroup: number | null;
}

/** Can this owner own one more group? `null` = unlimited (or no plan configured yet). */
export const canOwnAnotherGroup = (plan: PlanLimits | null, ownedGroups: number) => plan?.maxGroups == null || ownedGroups < plan.maxGroups;

/** Can a group of this owner take one more member? Counts active + leaving members (owner included). */
export const canAddMember = (plan: PlanLimits | null, members: number) => plan?.maxMembersPerGroup == null || members < plan.maxMembersPerGroup;

/** Does current usage fit a plan (used before switching plans)? Returns the first problem, in pt-BR. */
export function planFitProblem(plan: PlanLimits & { name: string }, usage: { groups: number; largestGroup: number }): string | null {
  if (plan.maxGroups != null && usage.groups > plan.maxGroups) return `Você é dono de ${usage.groups} grupos e o plano ${plan.name} permite ${plan.maxGroups}. Arquive ou transfira grupos antes de mudar.`;
  if (plan.maxMembersPerGroup != null && usage.largestGroup > plan.maxMembersPerGroup)
    return `Um dos seus grupos tem ${usage.largestGroup} pessoas e o plano ${plan.name} permite ${plan.maxMembersPerGroup} por grupo.`;
  return null;
}

/** "R$ 19,90/mês", "R$ 199,00/ano", "Grátis". */
export function planPriceLabel(priceCents: number, intervalMonths: number, format: (c: number) => string): string {
  if (priceCents <= 0) return 'Grátis';
  const per = intervalMonths === 1 ? 'mês' : intervalMonths === 12 ? 'ano' : `${intervalMonths} meses`;
  return `${format(priceCents)}/${per}`;
}
