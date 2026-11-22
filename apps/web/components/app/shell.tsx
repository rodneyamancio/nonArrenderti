'use client';
import type { BillingStatus, OverviewGroup, SessionUser } from '@tenace/types';
import { Bell, CreditCard, Home, LayoutGrid, Lock, Plus, Shield, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TenaceLogo, TenaceMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, Spinner, toneClass } from '@/components/ui';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { CheckInSheet } from './checkin-sheet';
import { AppCtx, type CheckInTarget, useOnDataChanged } from './session';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [groups, setGroups] = useState<OverviewGroup[]>();
  const [unread, setUnread] = useState(0);
  const [checkIn, setCheckIn] = useState<CheckInTarget | null>(null);
  const [billing, setBilling] = useState<{ status: BillingStatus; daysToBlock: number | null } | null>(null);

  useEffect(() => {
    api<{ user: SessionUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`));
  }, [router]);

  const reloadGroups = useCallback(async () => {
    try {
      setGroups((await api<{ groups: OverviewGroup[] }>('/me/overview')).groups);
    } catch {
      /* the page shows its own error state */
    }
  }, []);
  const refreshUnread = useCallback(() => {
    api<{ unread: number }>('/notifications/unread')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, []);

  const refreshBilling = useCallback(() => {
    api<{ status: BillingStatus; daysToBlock: number | null }>('/me/billing')
      .then((b) => setBilling({ status: b.status, daysToBlock: b.daysToBlock }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshBilling();
    void reloadGroups();
    refreshUnread();
    const t = setInterval(refreshUnread, 60_000);
    return () => clearInterval(t);
  }, [user, reloadGroups, refreshUnread, refreshBilling, pathname]);
  useOnDataChanged(reloadGroups);

  if (!user) return <Spinner label="Abrindo o Tenace…" />;

  const nav = [
    { href: '/inicio', label: 'Início', icon: Home },
    { href: '/notificacoes', label: 'Avisos', icon: Bell, badge: unread },
    { href: '/grupos', label: 'Grupos', icon: LayoutGrid },
    { href: '/perfil', label: 'Perfil', icon: UserRound },
  ];
  const sideNav = [...nav, { href: '/assinatura', label: 'Assinatura', icon: CreditCard }, ...(user.role === 'platform_admin' ? [{ href: '/admin', label: 'Administração', icon: Shield }] : [])];
  // Blocked account: only billing, profile and notices stay reachable (the API refuses the rest).
  const blocked = billing?.status === 'blocked' && !['/assinatura', '/perfil', '/notificacoes'].some((p) => pathname.startsWith(p));
  const isActive = (href: string) => pathname === href || (href === '/grupos' && (pathname.startsWith('/g/') || pathname.startsWith('/grupos')));

  return (
    <AppCtx.Provider value={{ user, setUser, groups, reloadGroups, openCheckIn: (t) => setCheckIn(t ?? {}), unread, refreshUnread }}>
      <a href="#main" className="skip-link">
        Pular para o conteúdo
      </a>
      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[264px_1fr]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-card px-4 py-6 lg:flex">
          <Link href="/inicio" className="px-2" aria-label="Tenace — início">
            <TenaceLogo tagline />
          </Link>
          <button
            type="button"
            onClick={() => setCheckIn({})}
            className="tone-violet tone-bg touch-target flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-[0.95rem] font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" aria-hidden /> Registrar atividade
          </button>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {sideNav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={cx('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors', isActive(n.href) ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              >
                <n.icon className="h-[18px] w-[18px]" aria-hidden />
                {n.label}
                {!!n.badge && <span className="ml-auto rounded-full bg-spark-solid px-2 py-0.5 text-[0.7rem] font-bold text-white">{n.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-2 px-3 text-xs font-bold tracking-wider text-subtle uppercase">Seus grupos</p>
            <ul className="flex flex-col gap-0.5">
              {groups?.map((g) => (
                <li key={g.group.id}>
                  <Link
                    href={`/g/${g.group.id}`}
                    aria-current={pathname.startsWith(`/g/${g.group.id}`) ? 'page' : undefined}
                    className={cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors', pathname.startsWith(`/g/${g.group.id}`) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                  >
                    <span className={cx('tone-bg flex h-7 w-7 items-center justify-center rounded-md text-sm', toneClass(g.group.color))}>{g.group.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{g.group.name}</span>
                    {g.pendingActions > 0 && <span className="h-2 w-2 rounded-full bg-spark-solid" aria-label="Pendências" />}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/grupos/novo" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-brand hover:bg-accent">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-border-strong">
                    <Plus className="h-4 w-4" aria-hidden />
                  </span>
                  Novo grupo
                </Link>
              </li>
            </ul>
          </div>
          <ThemeToggle withLabel className="self-start" />
          <Link href="/perfil" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
            <Avatar name={user.name} color={user.avatarColor} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Link>
        </aside>

        <div className="min-w-0">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-[color-mix(in_srgb,var(--ui-bg)_88%,transparent)] px-4 py-2.5 backdrop-blur lg:hidden">
            <Link href="/inicio" aria-label="Tenace — início" className="flex items-center gap-2">
              <TenaceMark className="h-8 w-8" />
              <span className="text-lg font-extrabold tracking-[-0.04em]">tenace</span>
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Link href="/notificacoes" className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent" aria-label={`Avisos${unread ? ` (${unread} novos)` : ''}`}>
                <Bell className="h-5 w-5" aria-hidden />
                {!!unread && <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-spark-solid ring-2 ring-[var(--ui-bg)]" />}
              </Link>
            </div>
          </header>

          <main id="main" className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
            {billing?.status === 'past_due' && !pathname.startsWith('/assinatura') && (
              <Link href="/assinatura" className="mb-5 flex items-center justify-between gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm">
                <span>
                  <strong>Mensalidade em atraso.</strong> Pague em até {billing.daysToBlock} {billing.daysToBlock === 1 ? 'dia' : 'dias'} para evitar o bloqueio.
                </span>
                <span className="shrink-0 font-semibold text-warning">Pagar →</span>
              </Link>
            )}
            {blocked ? (
              <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <Lock className="h-8 w-8" aria-hidden />
                </span>
                <h1 className="text-2xl font-extrabold">Conta bloqueada</h1>
                <p className="text-muted-foreground">Uma mensalidade passou mais de 5 dias do vencimento. Seus grupos estão pausados e ninguém é cobrado enquanto isso. Pague para reativar tudo na hora.</p>
                <Link href="/assinatura" className="inline-flex h-12 items-center rounded-md bg-primary px-6 font-bold text-primary-foreground shadow-md hover:bg-primary-hover">
                  Pagar agora
                </Link>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Principal" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5 pb-1.5">
          {[nav[0]!, nav[1]!].map((n) => (
            <BottomLink key={n.href} {...n} active={isActive(n.href)} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setCheckIn({})}
              aria-label="Registrar atividade"
              className="tone-violet tone-bg -mt-6 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-[var(--ui-bg)] transition-transform active:scale-95"
            >
              <Plus className="h-7 w-7" aria-hidden />
            </button>
          </div>
          {[nav[2]!, nav[3]!].map((n) => (
            <BottomLink key={n.href} {...n} active={isActive(n.href)} />
          ))}
        </div>
      </nav>

      <CheckInSheet target={checkIn} onClose={() => setCheckIn(null)} />
    </AppCtx.Provider>
  );
}

function BottomLink({ href, label, icon: Icon, active, badge }: { href: string; label: string; icon: typeof Home; active: boolean; badge?: number }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cx('relative flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[0.7rem] font-semibold', active ? 'text-brand' : 'text-muted-foreground')}>
      <Icon className="h-[22px] w-[22px]" aria-hidden />
      {label}
      {!!badge && <span className="absolute top-0.5 right-[28%] h-2 w-2 rounded-full bg-spark-solid" />}
    </Link>
  );
}
