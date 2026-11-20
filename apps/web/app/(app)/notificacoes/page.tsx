'use client';
import type { NotificationView } from '@tenace/types';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/app/session';
import { Button, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function NotificationsPage() {
  const router = useRouter();
  const { refreshUnread } = useApp();
  const { data, error, reload } = useApi<{ notifications: NotificationView[]; unread: number }>('/notifications');
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  async function open(n: NotificationView) {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    refreshUnread();
    if (n.link) router.push(n.link);
    else void reload();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Avisos"
        actions={
          data.unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api('/notifications/read-all', { method: 'POST' });
                refreshUnread();
                void reload();
              }}
            >
              Marcar todos como lidos
            </Button>
          )
        }
      />
      {data.notifications.length === 0 ? (
        <EmptyState icon={<span className="text-xl">🔔</span>} title="Tudo em dia" description="Convites, pagamentos e fechamentos de semana aparecem aqui." />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.notifications.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent', n.readAt ? 'border-border bg-card' : 'border-brand-solid/40 bg-brand-soft')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-lg shadow-xs" aria-hidden>
                  {n.groupEmoji ?? '🔔'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-spark-solid" aria-label="Não lido" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
