import type { NotificationView } from '@tenace/types';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useApi } from '@/data/use-api';
import { timeAgo } from '@/lib/format';
import { routeForLink } from '@/navigation/links';
import { useAppData } from '@/session/app-data';
import { api } from '@/session/provider';
import { Button, EmptyState, ErrorState, Loading, Screen, T } from '@/ui/kit';
import { PageTitle, TopBar } from '@/ui/page-header';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

export default function NotificationsScreen() {
  const { c } = useTheme();
  const { refreshUnread } = useAppData();
  const { data, error, reload, refresh, refreshing } = useApi<{ notifications: NotificationView[]; unread: number }>('/notifications');

  async function open(n: NotificationView) {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    refreshUnread();
    const route = routeForLink(n.link);
    if (route) router.push(route as never);
    else void reload();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar>
        <View style={{ flex: 1 }}>
          <PageTitle
            title="Avisos"
            actions={
              !!data?.unread && (
                <Button
                  label="Marcar todos como lidos"
                  variant="outline"
                  size="sm"
                  onPress={async () => {
                    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
                    refreshUnread();
                    void reload();
                  }}
                />
              )
            }
          />
        </View>
      </TopBar>
      <Screen
        onRefresh={() => {
          refreshUnread();
          void refresh();
        }}
        refreshing={refreshing}
        bottomInset={false}
        contentStyle={{ gap: 8 }}
      >
        {!data ? (
          error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <Loading />
          )
        ) : data.notifications.length === 0 ? (
          <EmptyState emoji="🔔" title="Tudo em dia" description="Convites, pagamentos e fechamentos de semana aparecem aqui." />
        ) : (
          data.notifications.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => open(n)}
              accessibilityRole="button"
              accessibilityLabel={`${n.readAt ? '' : 'Não lido. '}${n.title}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: n.readAt ? c.border : c.brandSolid, backgroundColor: pressed ? c.surfaceHover : n.readAt ? c.surface : c.brandSoft })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{n.groupEmoji ?? '🔔'}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={14} weight="semibold">
                  {n.title}
                </T>
                {!!n.body && (
                  <T size={14} tone="muted">
                    {n.body}
                  </T>
                )}
                <T size={12} tone="muted">
                  {timeAgo(n.createdAt)}
                </T>
              </View>
              {!n.readAt && <View style={{ marginTop: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: c.sparkSolid }} />}
            </Pressable>
          ))
        )}
      </Screen>
    </View>
  );
}
