'use client';
import type { GroupDetail } from '@tenace/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { GroupCtx } from '@/components/app/group-context';
import { useApp, useOnDataChanged } from '@/components/app/session';
import { ErrorState, Spinner, toneClass } from '@/components/ui';
import { cx } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function GroupLayout({ children }: { children: React.ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>();
  const pathname = usePathname();
  const { openCheckIn } = useApp();
  const { data: group, error, reload } = useApi<GroupDetail>(`/groups/${groupId}`);
  const quiet = useCallback(() => void reload(), [reload]);
  useOnDataChanged(quiet);

  if (error && !group) return <ErrorState error={error} onRetry={reload} />;
  if (!group) return <Spinner />;

  const can = (p: Parameters<GroupDetailCan>[0]) => group.me.permissions.includes(p);
  const isAdmin = group.me.role !== 'member';
  const base = `/g/${group.id}`;
  const tabs = [
    { href: base, label: 'Semana' },
    { href: `${base}/feed`, label: 'Feed', badge: group.openContests },
    { href: `${base}/metas`, label: 'Metas' },
    { href: `${base}/conta`, label: 'Conta', badge: isAdmin ? group.pendingPayments : 0 },
    { href: `${base}/membros`, label: 'Membros', badge: isAdmin ? group.pendingJoinRequests : 0 },
    ...(can('group:settings:update') ? [{ href: `${base}/ajustes`, label: 'Ajustes' }] : []),
  ];

  return (
    <GroupCtx.Provider value={{ group, reload, can }}>
      <div className={cx('tone-bg relative -mx-4 -mt-5 overflow-hidden px-4 pt-5 pb-14 sm:mx-0 sm:mt-0 sm:rounded-xl sm:px-6 sm:pt-6', toneClass(group.color))}>
        <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 text-3xl" aria-hidden>
            {group.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-extrabold sm:text-3xl">{group.name}</h1>
            {group.description && <p className="mt-1 line-clamp-2 text-sm text-white/85">{group.description}</p>}
            <p className="mt-1 text-xs font-medium text-white/75">
              {group.memberCount} {group.memberCount === 1 ? 'pessoa' : 'pessoas'} · dinheiro vai para {group.destination.label}
            </p>
          </div>
          <button type="button" onClick={() => openCheckIn({ groupId: group.id })} className="hidden h-11 shrink-0 items-center gap-2 rounded-md bg-white px-4 text-sm font-bold text-[#17142B] shadow-md sm:inline-flex">
            <Plus className="h-4 w-4" aria-hidden /> Registrar
          </button>
        </div>
      </div>
      <nav aria-label="Seções do grupo" className="no-scrollbar relative z-10 -mx-4 -mt-9 mb-6 flex gap-1 overflow-x-auto px-4 sm:mx-2 sm:px-0">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
          {tabs.map((t) => {
            const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={cx('relative shrink-0 rounded-md px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors', active ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground')}>
                {t.label}
                {!!t.badge && <span className="ml-1.5 rounded-full bg-spark-solid px-1.5 py-0.5 text-[0.65rem] font-bold text-white">{t.badge}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </GroupCtx.Provider>
  );
}

type GroupDetailCan = (p: GroupDetail['me']['permissions'][number]) => boolean;
