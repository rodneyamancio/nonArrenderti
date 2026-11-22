import { errorMessage } from '@tenace/api-client';
import { BILLING_GRACE_DAYS, planPriceLabel } from '@tenace/rules';
import type { BillingView, InvoiceView } from '@tenace/types';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CreditCard, ExternalLink, QrCode } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { portalUrl } from '@/lib/config';
import { emitDataChanged } from '@/lib/events';
import { fmtDay, formatCents } from '@/lib/format';
import { useAppData } from '@/session/app-data';
import { api } from '@/session/provider';
import { Badge, Button, Card, Divider, ErrorState, Loading, Notice, Screen, T, useToast } from '@/ui/kit';
import { BackHeader } from '@/ui/page-header';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

/** Plan, usage and invoices. Paying opens the Calebe Pay page; changing plans happens on the portal. */
export default function SubscriptionScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const { refreshBilling } = useAppData();
  const [data, setData] = useState<BillingView>();
  const [error, setError] = useState<unknown>();
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<BillingView>('/me/billing/sync', { method: 'POST' }));
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function pay(inv: InvoiceView, mode: 'default' | 'checkout') {
    setPaying(`${inv.id}:${mode}`);
    try {
      const r = await api<{ url: string }>(`/me/billing/invoices/${inv.id}/pay`, { body: { mode } });
      await WebBrowser.openBrowserAsync(r.url);
      // Back from the payment page: pull the result.
      await load();
      refreshBilling();
      emitDataChanged();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setPaying(null);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/perfil'));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <BackHeader title="Assinatura" onBack={back} />
      {!data ? (
        error ? (
          <ErrorState error={error} onRetry={load} />
        ) : (
          <Loading />
        )
      ) : (
        <Screen
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        >
          {data.status === 'blocked' && <Notice tone="danger" title="Conta bloqueada por falta de pagamento">Seus grupos estão pausados e ninguém é cobrado enquanto isso. Pague a mensalidade em atraso para reativar tudo na hora.</Notice>}
          {data.status === 'past_due' && (
            <Notice tone="warning" title="Mensalidade em atraso">{`Pague em até ${data.daysToBlock} ${data.daysToBlock === 1 ? 'dia' : 'dias'} para evitar o bloqueio da conta e a pausa dos seus grupos.`}</Notice>
          )}

          <Card title="Seu plano">
            {data.plan ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <T size={22} weight="extrabold">
                    {data.plan.name}
                  </T>
                  {data.plan.priceCents > 0 && (
                    <T size={16} weight="bold">
                      {planPriceLabel(data.plan.priceCents, data.plan.intervalMonths, formatCents)}
                    </T>
                  )}
                </View>
                <Usage label="Grupos que você criou" used={data.usage.groups} max={data.plan.maxGroups} />
                <Usage label="Pessoas no seu maior grupo" used={data.usage.largestGroup} max={data.plan.maxMembersPerGroup} />
                {data.subscription && (
                  <T size={13} tone="muted">
                    Cobrança por {data.subscription.method === 'pix' ? 'Pix' : 'boleto'}
                    {data.subscription.nextDueDate ? ` · próxima em ${fmtDay(data.subscription.nextDueDate)}` : ''}
                  </T>
                )}
              </View>
            ) : (
              <T size={14} tone="muted">
                Nenhum plano configurado ainda: uso sem limites.
              </T>
            )}
            <Button label="Ver planos e mudar no site" variant="outline" icon={ExternalLink} onPress={() => void WebBrowser.openBrowserAsync(`${portalUrl}/assinatura`)} />
          </Card>

          <Card title="Mensalidades" padded={false}>
            {data.invoices.length === 0 ? (
              <T size={14} tone="muted" style={{ padding: 16 }}>
                Nenhuma mensalidade ainda.
              </T>
            ) : (
              data.invoices.map((inv, i) => (
                <View key={inv.id}>
                  {i > 0 && <Divider />}
                  <View style={{ padding: 16, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <T weight="semibold">{formatCents(inv.amountCents)}</T>
                        <T size={12} tone="muted">
                          Vencimento {fmtDay(inv.dueDate)}
                        </T>
                      </View>
                      {inv.status === 'paid' ? <Badge tone="success">Paga</Badge> : inv.overdue ? <Badge tone="danger">Em atraso</Badge> : <Badge tone="warning">Em aberto</Badge>}
                    </View>
                    {inv.status === 'open' && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Button size="sm" icon={QrCode} label={inv.overdue ? 'Pagar agora' : data.subscription?.method === 'boleto' ? 'Ver boleto' : 'Pagar com Pix'} loading={paying === `${inv.id}:default`} disabled={!!paying} onPress={() => pay(inv, 'default')} />
                        <Button size="sm" variant="outline" icon={CreditCard} label="Cartão ou outra forma" loading={paying === `${inv.id}:checkout`} disabled={!!paying} onPress={() => pay(inv, 'checkout')} />
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>
          <T size={12} tone="muted">
            {`O pagamento abre na página segura da Calebe Pay. Atrasou mais de ${BILLING_GRACE_DAYS} dias? A conta é bloqueada até o pagamento.`}
          </T>
        </Screen>
      )}
    </View>
  );
}

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const { c } = useTheme();
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={13} tone="muted">
          {label}
        </T>
        <T size={13} weight="semibold">
          {max != null ? `${used} de ${max}` : `${used} · sem limite`}
        </T>
      </View>
      {max != null && (
        <View style={{ height: 8, borderRadius: radius.sm, backgroundColor: c.surfaceSunken, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: used >= max ? c.sparkSolid : c.brandSolid }} />
        </View>
      )}
    </View>
  );
}

