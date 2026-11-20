// Mirror of the portal menus (components/app/shell.tsx and app/(app)/g/[groupId]/layout.tsx).
// test/parity.test.mjs fails when a label here is missing there. The API decides; this only hides.
import type { GroupDetail, GroupPermission } from '@tenace/types';

export const MAIN_TABS = [
  { key: 'inicio', label: 'Início' },
  { key: 'avisos', label: 'Avisos' },
  { key: 'grupos', label: 'Grupos' },
  { key: 'perfil', label: 'Perfil' },
] as const;

export type GroupSection = 'semana' | 'feed' | 'metas' | 'conta' | 'membros' | 'ajustes';

export interface SectionTab {
  key: GroupSection;
  label: string;
  badge: number;
}

export function groupSections(group: Pick<GroupDetail, 'me' | 'openContests' | 'pendingPayments' | 'pendingJoinRequests'>): SectionTab[] {
  const can = (p: GroupPermission) => group.me.permissions.includes(p);
  const isAdmin = group.me.role !== 'member';
  const tabs: SectionTab[] = [
    { key: 'semana', label: 'Semana', badge: 0 },
    { key: 'feed', label: 'Feed', badge: group.openContests },
    { key: 'metas', label: 'Metas', badge: 0 },
    { key: 'conta', label: 'Conta', badge: isAdmin ? group.pendingPayments : 0 },
    { key: 'membros', label: 'Membros', badge: isAdmin ? group.pendingJoinRequests : 0 },
  ];
  if (can('group:settings:update')) tabs.push({ key: 'ajustes', label: 'Ajustes', badge: 0 });
  return tabs;
}

export const ACCOUNT_TABS = [
  { key: 'minha', label: 'Conta corrente' },
  { key: 'caixa', label: 'Caixa do grupo' },
  { key: 'pagamentos', label: 'Pagamentos' },
] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number]['key'];
