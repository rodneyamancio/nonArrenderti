'use client';
import { CheckCircle2, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

interface LoginView {
  id: string;
  status: 'pending' | 'scanned' | 'approved' | 'denied' | 'completed' | 'expired' | 'cancelled';
  expiresAt: string;
  choices: number[];
  deviceName: string | null;
  qr?: string;
  shortCode?: string;
}

/**
 * "Entrar no app com QR Code": the phone scans, shows a 2-digit number, and the person picks
 * that number here. Whoever photographs the QR cannot pick the number of their own phone.
 */
export function AppLoginQr({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [req, setReq] = useState<LoginView | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [deciding, setDeciding] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const create = useCallback(async () => {
    setErr('');
    try {
      const r = await api<LoginView>('/auth/app-login', { method: 'POST' });
      setReq(r);
      setQrImg(await QRCode.toDataURL(r.qr!, { margin: 1, width: 440, errorCorrectionLevel: 'M' }));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setReq(null);
      setQrImg(null);
      return;
    }
    void create();
  }, [open, create]);

  // Poll every 2 s while waiting; renew an expired QR automatically while the dialog is open.
  useEffect(() => {
    if (!open || !req) return;
    if (!['pending', 'scanned', 'approved'].includes(req.status)) return;
    timer.current = setInterval(async () => {
      try {
        const s = await api<LoginView>(`/auth/app-login/${req.id}`);
        if (s.status === 'expired' && req.status === 'pending') return void create();
        setReq((cur) => (cur ? { ...cur, ...s } : cur));
      } catch {
        /* keep trying */
      }
    }, 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, req, create]);

  async function decide(body: { approve: true; code: number } | { approve: false }) {
    if (!req) return;
    setDeciding(true);
    try {
      const s = await api<LoginView>(`/auth/app-login/${req.id}/decide`, { method: 'POST', body });
      setReq({ ...req, ...s });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setDeciding(false);
    }
  }

  const status = req?.status;
  return (
    <Dialog open={open} onClose={onClose} title="Entrar no app com QR Code" description="Sem digitar senha no celular.">
      <div className="flex flex-col items-center gap-4 text-center">
        {err && <Notice tone="danger">{err}</Notice>}
        {(!req || status === 'pending') && (
          <>
            <ol className="w-full list-decimal pl-5 text-left text-sm text-muted-foreground">
              <li>
                Abra o app do Tenace e toque em <strong className="text-foreground">Entrar com QR Code</strong> — ou aponte a câmera do celular.
              </li>
              <li>Leia o código abaixo.</li>
              <li>Escolha aqui o número que aparecer no celular.</li>
            </ol>
            {qrImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrImg} alt="QR Code para entrar no app" className="h-56 w-56 rounded-lg bg-white p-2" />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-lg bg-muted" />
            )}
            {req?.shortCode && (
              <p className="text-sm text-muted-foreground">
                Sem câmera? Digite no app: <span className="font-mono text-base font-bold tracking-widest text-foreground">{req.shortCode}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">O código vale 3 minutos e é renovado enquanto esta janela estiver aberta.</p>
          </>
        )}
        {status === 'scanned' && (
          <>
            <Smartphone className="h-10 w-10 text-brand" aria-hidden />
            <p className="text-lg font-bold">Qual número aparece no celular{req?.deviceName ? ` (${req.deviceName})` : ''}?</p>
            <div className="flex gap-3">
              {req!.choices.map((n) => (
                <Button key={n} size="lg" variant="outline" className="h-16 w-20 text-2xl font-extrabold tabular-nums" disabled={deciding} onClick={() => decide({ approve: true, code: n })}>
                  {n}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="text-danger" disabled={deciding} onClick={() => decide({ approve: false })}>
              Não fui eu
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Escolher o número errado cancela o pedido.
            </p>
          </>
        )}
        {(status === 'approved' || status === 'completed') && (
          <>
            <CheckCircle2 className="h-14 w-14 text-success" aria-hidden />
            <p className="text-lg font-bold">{status === 'completed' ? 'Pronto! O app entrou na sua conta.' : 'Aprovado! Terminando no celular…'}</p>
            <Button onClick={onClose}>Fechar</Button>
          </>
        )}
        {(status === 'denied' || status === 'cancelled' || (status === 'expired' && req)) && (
          <>
            <XCircle className="h-14 w-14 text-danger" aria-hidden />
            <p className="text-lg font-bold">{status === 'denied' ? 'Pedido recusado' : 'O código expirou'}</p>
            <p className="text-sm text-muted-foreground">{status === 'denied' ? 'Nenhum aparelho entrou. Se não foi você, troque sua senha.' : 'Gere um novo para tentar de novo.'}</p>
            <Button variant="outline" onClick={create}>
              Gerar novo QR Code
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
