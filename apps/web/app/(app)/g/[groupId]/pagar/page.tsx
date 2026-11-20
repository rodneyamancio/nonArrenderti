'use client';
import { pixPayload } from '@tenace/rules';
import type { AccountView } from '@tenace/types';
import { ArrowLeft, Camera, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useGroup } from '@/components/app/group-context';
import { emitDataChanged } from '@/components/app/session';
import { Button, Card, CopyButton, ErrorState, Field, Input, MoneyInput, Notice, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { uploadPhoto } from '@/lib/image';
import { useApi } from '@/lib/use-api';

export default function PayPage() {
  const { group } = useGroup();
  const { data, error, reload } = useApi<AccountView>(`/groups/${group.id}/account`);
  const [amount, setAmount] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const d = group.destination;

  const value = amount ?? (data ? Math.max(0, data.openDebtCents - data.pendingPaymentCents) : null);
  const payload = d.pixKey && d.pixKeyType && value ? pixPayload({ keyType: d.pixKeyType, key: d.pixKey, name: d.holderName || d.label, city: d.city || 'Brasil', amountCents: value, description: `Tenace ${group.name}` }) : null;

  useEffect(() => {
    if (!payload) return setQr(null);
    QRCode.toDataURL(payload, { margin: 1, width: 480, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null));
  }, [payload]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  async function declare() {
    if (!value) return setErr('Informe o valor pago');
    setSaving(true);
    setErr('');
    try {
      const receiptUploadId = receipt ? await uploadPhoto(group.id, receipt) : null;
      await api(`/groups/${group.id}/payments`, { method: 'POST', body: { amountCents: value, note, receiptUploadId } });
      emitDataChanged();
      setDone(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="animate-pop h-14 w-14 text-success" aria-hidden />
          <h2 className="text-xl font-extrabold">Pagamento informado!</h2>
          <p className="max-w-sm text-sm text-muted-foreground">Um admin do grupo vai conferir e confirmar. Você recebe um aviso quando for confirmado.</p>
          <Link href={`/g/${group.id}/conta`} className="font-semibold text-brand">
            Ver minha conta
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link href={`/g/${group.id}/conta`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Conta
      </Link>
      <Card>
        <p className="text-sm text-muted-foreground">Em aberto</p>
        <p className="text-3xl font-extrabold text-danger tabular-nums">{formatCents(Math.max(0, data.openDebtCents))}</p>
        {data.pendingPaymentCents > 0 && <p className="mt-1 text-sm text-muted-foreground">{formatCents(data.pendingPaymentCents)} já informado, aguardando confirmação.</p>}
        <Field label="Valor a pagar" htmlFor="pay-amount" className="mt-4 max-w-xs">
          <MoneyInput id="pay-amount" value={value} onChange={setAmount} />
        </Field>
      </Card>

      <Card title={`Pague para ${d.label}`} description={d.holderName || undefined}>
        {payload ? (
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="QR Code PIX" className="h-56 w-56 rounded-lg bg-white p-2" />}
            <div className="w-full">
              <p className="mb-1 text-sm font-medium">PIX copia e cola</p>
              <div className="flex gap-2">
                <Input readOnly value={payload} aria-label="Código PIX" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <CopyButton text={payload} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Abra o app do seu banco, escolha PIX → ler QR ou copia e cola.</p>
          </div>
        ) : d.bankInfo || d.pixKey ? (
          <div className="text-sm">
            {d.pixKey && (
              <p className="flex items-center gap-2">
                Chave PIX: <span className="font-mono">{d.pixKey}</span> <CopyButton text={d.pixKey} />
              </p>
            )}
            {d.bankInfo && <p className="mt-2 whitespace-pre-line text-muted-foreground">{d.bankInfo}</p>}
          </div>
        ) : (
          <Notice tone="warning">O grupo ainda não definiu os dados de pagamento. Combine com um admin.</Notice>
        )}
      </Card>

      <Card title="Já pagou?" description="Avise o grupo para um admin confirmar.">
        <div className="flex flex-col gap-4">
          {err && <Notice tone="danger">{err}</Notice>}
          <Field label="Observação (opcional)" htmlFor="pay-note">
            <Input id="pay-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: PIX do Nubank às 18h" />
          </Field>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Comprovante" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" aria-hidden /> {receipt ? receipt.name.slice(0, 24) : 'Anexar comprovante (opcional)'}
            </Button>
          </div>
          <Button size="lg" onClick={declare} loading={saving} disabled={!value}>
            Já paguei {value ? formatCents(value) : ''}
          </Button>
        </div>
      </Card>
    </div>
  );
}
