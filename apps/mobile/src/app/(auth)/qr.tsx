import { ApiError, errorMessage } from '@tenace/api-client';
import type { SessionUser } from '@tenace/types';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, ChevronLeft, ScanLine } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeShortCode, parseLoginQr, toHex } from '@/features/auth/qr';
import { portalUrl } from '@/lib/config';
import { api, useSession } from '@/session/provider';
import { Button, Field, Input, Notice, T } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

type Stage = { kind: 'scan' } | { kind: 'code' } | { kind: 'sending' } | { kind: 'confirm'; id: string; matchCode: number; expiresAt: number };

/**
 * Login by the portal's QR (vg-auth): the phone keeps a random verifier in memory, sends only
 * its hash with the QR, shows a 2-digit number and polls until the person picks that number on
 * the portal. Leaving this screen gives up (the verifier is gone).
 */
export default function QrLoginScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const params = useLocalSearchParams<{ c?: string; a?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>({ kind: Platform.OS === 'web' ? 'code' : 'scan' });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const verifier = useRef<string | null>(null);
  const handled = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      verifier.current = null;
    },
    [],
  );

  async function start(input: { secret: string } | { code: string }) {
    setError('');
    setStage({ kind: 'sending' });
    try {
      const v = toHex(Crypto.getRandomBytes(32));
      verifier.current = v;
      const verifierHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, v);
      const deviceName = (Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android')).slice(0, 80);
      const r = await api<{ id: string; matchCode: number; expiresAt: string }>('/auth/app-login/scan', {
        body: { ...input, verifierHash, deviceName, platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web' },
      });
      if (!alive.current) return;
      setStage({ kind: 'confirm', id: r.id, matchCode: r.matchCode, expiresAt: Date.parse(r.expiresAt) });
    } catch (e) {
      if (!alive.current) return;
      handled.current = false;
      setError(errorMessage(e));
      setStage({ kind: 'secret' in input ? 'scan' : 'code' });
    }
  }

  // Deep link from the phone's own camera: tenace://entrar?c=…&a=…
  useEffect(() => {
    if (!params.c || handled.current) return;
    handled.current = true;
    const parsed = parseLoginQr(`tenace://entrar?c=${encodeURIComponent(params.c)}${params.a ? `&a=${encodeURIComponent(params.a)}` : ''}`, portalUrl);
    if (parsed.ok) void start({ secret: parsed.secret });
    else setError(parsed.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.c]);

  // Poll every 2 s until approved / denied / expired; stops when leaving the screen.
  useEffect(() => {
    if (stage.kind !== 'confirm') return;
    const t = setInterval(async () => {
      if (!verifier.current) return;
      if (Date.now() > stage.expiresAt) {
        clearInterval(t);
        setError('O tempo acabou. Gere um novo QR no portal.');
        setStage({ kind: 'scan' });
        return;
      }
      try {
        const r = await api<{ status: 'waiting' } | { status: 'ok'; user: SessionUser; token: string }>('/auth/app-login/claim', { body: { id: stage.id, verifier: verifier.current } });
        if (r.status === 'ok') {
          clearInterval(t);
          verifier.current = null;
          await session.adoptToken({ user: r.user, token: r.token });
          // The (auth) layout sends the person to Início as soon as the session flips.
        }
      } catch (e) {
        if (e instanceof ApiError) {
          clearInterval(t);
          verifier.current = null;
          handled.current = false;
          setError(e.status === 403 ? 'O acesso foi recusado no portal.' : errorMessage(e));
          setStage({ kind: 'scan' });
        }
        // Network hiccup: keep polling.
      }
    }, 2000);
    return () => clearInterval(t);
  }, [stage, session]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/entrar'));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 4, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Voltar" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={28} color={c.text} />
        </Pressable>
        <T size={18} weight="extrabold" accessibilityRole="header">
          Entrar com QR Code
        </T>
      </View>

      <View style={{ flex: 1, padding: 20, gap: 16 }}>
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {stage.kind === 'scan' && (
          <>
            <T tone="muted">No computador, abra o Tenace em Perfil › Entrar no app com QR Code e aponte a câmera para o código.</T>
            {!permission ? null : permission.granted ? (
              <View style={{ flex: 1, maxHeight: 360, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    if (handled.current) return;
                    handled.current = true;
                    const parsed = parseLoginQr(data, portalUrl);
                    if (parsed.ok) void start({ secret: parsed.secret });
                    else {
                      setError(parsed.error);
                      setTimeout(() => (handled.current = false), 2500);
                    }
                  }}
                />
                <View pointerEvents="none" style={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: radius.lg }} />
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
                <ScanLine size={48} color={c.brand} />
                <T center tone="muted">
                  Precisamos da câmera para ler o QR Code. Nenhuma imagem é guardada.
                </T>
                <Button label="Permitir câmera" onPress={() => void requestPermission()} />
              </View>
            )}
            <Button label="Digitar o código do portal" variant="outline" icon={Keyboard} onPress={() => setStage({ kind: 'code' })} />
          </>
        )}

        {stage.kind === 'code' && (
          <>
            <T tone="muted">Digite o código de 8 caracteres que aparece embaixo do QR Code no portal.</T>
            <Field label="Código">
              <Input value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="XXXX-XXXX" maxLength={9} style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }} accessibilityLabel="Código do portal" />
            </Field>
            <Button
              label="Continuar"
              size="lg"
              disabled={!normalizeShortCode(code)}
              onPress={() => {
                const n = normalizeShortCode(code);
                if (n) void start({ code: n });
              }}
            />
            {Platform.OS !== 'web' && <Button label="Usar a câmera" variant="ghost" icon={ScanLine} onPress={() => setStage({ kind: 'scan' })} />}
          </>
        )}

        {stage.kind === 'sending' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator color={c.brandSolid} size="large" />
            <T tone="muted">Conferindo o código…</T>
          </View>
        )}

        {stage.kind === 'confirm' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <T size={18} weight="bold" center>
              No portal, escolha este número:
            </T>
            <View style={{ width: 168, height: 168, borderRadius: 84, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Número ${stage.matchCode}`}>
              <T size={72} weight="extrabold" tone="brand">
                {stage.matchCode}
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={c.brandSolid} />
              <T tone="muted">Aguardando a confirmação no portal…</T>
            </View>
            <T size={12} tone="subtle" center>
              Não foi você que gerou o código? Saia desta tela.
            </T>
          </View>
        )}
      </View>
    </View>
  );
}
