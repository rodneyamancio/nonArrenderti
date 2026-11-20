import { errorMessage } from '@tenace/api-client';
import type { InvitePreview } from '@tenace/types';
import { router, useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@/data/use-api';
import { emitDataChanged } from '@/lib/events';
import { api, useSessionState } from '@/session/provider';
import { TenaceLogo } from '@/ui/brand';
import { Button, ErrorState, Loading, Notice, T, ToneBox } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useSessionState();
  const [preview, setPreview] = useState<InvitePreview>();
  const [error, setError] = useState<unknown>();
  const [requested, setRequested] = useState(false);
  const [joinError, setJoinError] = useState('');
  const { busy, run } = useMutation();

  useEffect(() => {
    api<InvitePreview>(`/invites/${token}`).then(setPreview).catch(setError);
  }, [token]);

  const accept = () =>
    run(async () => {
      setJoinError('');
      try {
        const r = await api<{ status: string; groupId: string }>(`/invites/${token}/accept`, { method: 'POST' });
        emitDataChanged();
        if (r.status === 'joined' || r.status === 'already_member') router.replace({ pathname: '/g/[groupId]', params: { groupId: r.groupId } });
        else setRequested(true);
      } catch (e) {
        setJoinError(errorMessage(e));
      }
    });

  const next = `/convite/${token}`;
  const user = state.status === 'signedIn' ? state.user : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 24, flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center' }}>
        <TenaceLogo size={40} tagline />
      </View>
      {error ? (
        <ErrorState error={error} />
      ) : !preview || state.status === 'loading' ? (
        <Loading />
      ) : (
        <View style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          <ToneBox color={preview.group.color} radiusSize={0} style={{ alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 28 }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 36 }}>{preview.group.emoji}</Text>
            </View>
            <T size={14} style={{ color: 'rgba(255,255,255,0.85)' }}>
              {preview.invitedBy} te convidou para
            </T>
            <T size={24} weight="extrabold" tone="onBrand" center>
              {preview.group.name}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Users size={15} color="rgba(255,255,255,0.85)" />
              <T size={14} style={{ color: 'rgba(255,255,255,0.85)' }}>
                {preview.group.memberCount} {preview.group.memberCount === 1 ? 'pessoa' : 'pessoas'}
              </T>
            </View>
          </ToneBox>
          <View style={{ padding: 20, gap: 14 }}>
            {!!preview.group.description && (
              <T size={14} tone="muted" center>
                {preview.group.description}
              </T>
            )}
            {!preview.valid ? (
              <Notice tone="warning">Este convite expirou ou já foi usado. Peça um novo para quem te convidou.</Notice>
            ) : requested ? (
              <Notice tone="success" title="Pedido enviado!">
                Um admin do grupo vai aprovar sua entrada. Você recebe um aviso no Tenace.
              </Notice>
            ) : user ? (
              <>
                {joinError ? <Notice tone="danger">{joinError}</Notice> : null}
                {preview.kind === 'email' && preview.email && (
                  <T size={12} tone="muted" center>
                    Convite para {preview.email}
                  </T>
                )}
                <Button label={preview.kind === 'link' ? 'Pedir para entrar' : 'Entrar no grupo'} size="lg" loading={busy} onPress={accept} />
                <T size={12} tone="muted" center>
                  Entrando como {user.email}
                </T>
              </>
            ) : (
              <>
                <Button label="Criar conta e entrar" size="lg" onPress={() => router.push({ pathname: '/criar-conta', params: { next } })} />
                <Button label="Já tenho conta" size="lg" variant="outline" onPress={() => router.push({ pathname: '/entrar', params: { next } })} />
              </>
            )}
            <View style={{ backgroundColor: c.surfaceSunken, borderRadius: radius.md, padding: 14, gap: 4 }}>
              <T size={14} weight="semibold">
                Como funciona
              </T>
              <T size={14} tone="muted">
                Toda semana você começa devendo o valor das suas metas. Cada vez que cumpre uma, paga uma cota. Cumpriu tudo? Zerou. O que faltar vai para o caixa do grupo.
              </T>
            </View>
            {user && <Button label="Voltar ao início" variant="ghost" onPress={() => router.replace('/inicio')} />}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
