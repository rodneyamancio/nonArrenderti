import { errorMessage } from '@tenace/api-client';
import { pixPayload } from '@tenace/rules';
import type { AccountView, GroupDetail } from '@tenace/types';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CheckCircle2, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useApi, useMutation } from '@/data/use-api';
import { choosePhoto, uploadPhoto, type PickedPhoto } from '@/features/photos/photos';
import { emitDataChanged } from '@/lib/events';
import { formatCents } from '@/lib/format';
import { api } from '@/session/provider';
import { Button, Card, ErrorState, Field, Input, LinkText, Loading, MoneyInput, Notice, Screen, T, useToast } from '@/ui/kit';
import { BackHeader } from '@/ui/page-header';
import { QrCode } from '@/ui/qr';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

export default function PayScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const group = useApi<GroupDetail>(`/groups/${groupId}`, { listen: false });
  const { data, error, reload } = useApi<AccountView>(`/groups/${groupId}/account`);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<PickedPhoto | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const { busy, run } = useMutation();
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/g/[groupId]', params: { groupId } }));

  const g = group.data;
  if (!data || !g) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <BackHeader title="Pagar" onBack={back} />
        {error || group.error ? <ErrorState error={error ?? group.error} onRetry={() => (reload(), group.reload())} /> : <Loading />}
      </View>
    );
  }

  const d = g.destination;
  const value = amount ?? Math.max(0, data.openDebtCents - data.pendingPaymentCents);
  const payload = d.pixKey && d.pixKeyType && value ? pixPayload({ keyType: d.pixKeyType, key: d.pixKey, name: d.holderName || d.label, city: d.city || 'Brasil', amountCents: value, description: `Tenace ${g.name}` }) : null;

  const declare = () =>
    run(async () => {
      if (!value) return setErr('Informe o valor pago');
      setErr('');
      try {
        const receiptUploadId = receipt ? await uploadPhoto(g.id, receipt) : null;
        await api(`/groups/${g.id}/payments`, { method: 'POST', body: { amountCents: value, note, receiptUploadId } });
        emitDataChanged();
        setDone(true);
      } catch (e) {
        setErr(errorMessage(e));
      }
    });

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast('Copiado!');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <BackHeader title={`Pagar · ${g.name}`} onBack={back} />
      <Screen>
        {done ? (
          <Card>
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
              <CheckCircle2 size={56} color={c.success} />
              <T size={20} weight="extrabold" center>
                Pagamento informado!
              </T>
              <T size={14} tone="muted" center>
                Um admin do grupo vai conferir e confirmar. Você recebe um aviso quando for confirmado.
              </T>
              <LinkText onPress={() => router.replace({ pathname: '/g/[groupId]', params: { groupId: g.id, s: 'conta' } })}>Ver minha conta</LinkText>
            </View>
          </Card>
        ) : (
          <>
            <Card>
              <T size={14} tone="muted">
                Em aberto
              </T>
              <T size={30} weight="extrabold" tone="danger">
                {formatCents(Math.max(0, data.openDebtCents))}
              </T>
              {data.pendingPaymentCents > 0 && (
                <T size={14} tone="muted">
                  {formatCents(data.pendingPaymentCents)} já informado, aguardando confirmação.
                </T>
              )}
              <Field label="Valor a pagar">
                <MoneyInput value={value} onChange={setAmount} accessibilityLabel="Valor a pagar" />
              </Field>
            </Card>

            <Card title={`Pague para ${d.label}`} description={d.holderName || undefined}>
              {payload ? (
                <View style={{ alignItems: 'center', gap: 14 }}>
                  <View style={{ padding: 8, backgroundColor: '#fff', borderRadius: radius.md }}>
                    <QrCode value={payload} size={224} />
                  </View>
                  <Button label="Copiar PIX copia e cola" icon={Copy} onPress={() => copy(payload)} full />
                  <T size={12} tone="muted" center>
                    Abra o app do seu banco, escolha PIX → ler QR ou copia e cola.
                  </T>
                </View>
              ) : d.bankInfo || d.pixKey ? (
                <View style={{ gap: 8 }}>
                  {!!d.pixKey && (
                    <>
                      <T size={14}>{`Chave PIX: ${d.pixKey}`}</T>
                      <Button label="Copiar chave" icon={Copy} variant="outline" size="sm" onPress={() => copy(d.pixKey)} style={{ alignSelf: 'flex-start' }} />
                    </>
                  )}
                  {!!d.bankInfo && (
                    <T size={14} tone="muted">
                      {d.bankInfo}
                    </T>
                  )}
                </View>
              ) : (
                <Notice tone="warning">O grupo ainda não definiu os dados de pagamento. Combine com um admin.</Notice>
              )}
            </Card>

            <Card title="Já pagou?" description="Avise o grupo para um admin confirmar.">
              {err ? <Notice tone="danger">{err}</Notice> : null}
              <Field label="Observação (opcional)">
                <Input maxLength={300} value={note} onChangeText={setNote} placeholder="Ex.: PIX do Nubank às 18h" accessibilityLabel="Observação" />
              </Field>
              <Button label={receipt ? 'Comprovante anexado ✓' : 'Anexar comprovante (opcional)'} variant="outline" icon={Camera} onPress={async () => setReceipt(await choosePhoto())} style={{ alignSelf: 'flex-start' }} />
              <Button label={`Já paguei ${value ? formatCents(value) : ''}`} size="lg" loading={busy} disabled={!value} onPress={declare} />
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}
