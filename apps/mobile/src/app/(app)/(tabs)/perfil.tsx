import { errorMessage } from '@tenace/api-client';
import { BRAND_COLORS, type SessionUser } from '@tenace/types';
import * as WebBrowser from 'expo-web-browser';
import { Check, LogOut, Shield } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useMutation } from '@/data/use-api';
import { portalUrl } from '@/lib/config';
import { api, useSession, useUser } from '@/session/provider';
import { Avatar, Button, Card, Field, Input, Notice, Row, Screen, Segmented, T, ToneBox, useToast } from '@/ui/kit';
import { PageTitle, TopBar } from '@/ui/page-header';
import { radius } from '@/ui/theme';
import { useTheme, type ThemePref } from '@/ui/theme-provider';
import Constants from 'expo-constants';

export default function ProfileScreen() {
  const { c, pref, setPref } = useTheme();
  const session = useSession();
  const user = useUser();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwErr, setPwErr] = useState('');
  const pwMutation = useMutation();
  useEffect(() => setName(user?.name ?? ''), [user?.name]);
  if (!user) return null;

  async function saveProfile(patch: Partial<Pick<SessionUser, 'name' | 'avatarColor'>>) {
    try {
      const r = await api<{ user: SessionUser }>('/auth/me', { method: 'PATCH', body: patch });
      session.setUser(r.user);
      toast('Perfil atualizado');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  const changePassword = () =>
    pwMutation.run(async () => {
      setPwErr('');
      try {
        await api('/auth/password', { body: pw });
        await session.forget('Senha alterada. Entre com a nova senha.');
      } catch (e) {
        setPwErr(errorMessage(e));
      }
    });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar>
        <View style={{ flex: 1 }}>
          <PageTitle title="Perfil" />
        </View>
      </TopBar>
      <Screen bottomInset={false}>
        <Card>
          <Row gap={14}>
            <Avatar name={user.name} color={user.avatarColor} size={56} />
            <View style={{ flex: 1 }}>
              <T size={18} weight="bold" numberOfLines={1}>
                {user.name}
              </T>
              <T size={14} tone="muted" numberOfLines={1}>
                {user.email}
              </T>
            </View>
          </Row>
          <Field label="Nome">
            <Row>
              <View style={{ flex: 1 }}>
                <Input maxLength={60} value={name} onChangeText={setName} accessibilityLabel="Nome" />
              </View>
              <Button label="Salvar" variant="outline" disabled={name.trim() === user.name || name.trim().length < 2} onPress={() => saveProfile({ name: name.trim() })} />
            </Row>
          </Field>
          <View style={{ gap: 8 }}>
            <T size={14} weight="semibold">
              Cor do avatar
            </T>
            <Row gap={10} wrap>
              {BRAND_COLORS.map((col) => (
                <Pressable key={col} onPress={() => saveProfile({ avatarColor: col })} accessibilityRole="button" accessibilityLabel={col} accessibilityState={{ selected: col === user.avatarColor }} style={{ padding: 3, borderRadius: 24, borderWidth: 2, borderColor: col === user.avatarColor ? c.focus : 'transparent' }}>
                  <ToneBox color={col} radiusSize={19} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                    {col === user.avatarColor && <Check size={18} color="#fff" />}
                  </ToneBox>
                </Pressable>
              ))}
            </Row>
          </View>
        </Card>

        <Card title="Aparência">
          <Segmented<ThemePref>
            label="Tema"
            value={pref}
            onChange={setPref}
            options={[
              { value: 'light', label: '☀️ Claro' },
              { value: 'dark', label: '🌙 Escuro' },
              { value: 'system', label: '📱 Sistema' },
            ]}
          />
        </Card>

        <Card title="Trocar senha" description="Você vai precisar entrar de novo em todos os aparelhos.">
          {pwErr ? <Notice tone="danger">{pwErr}</Notice> : null}
          <Field label="Senha atual">
            <Input secureTextEntry textContentType="password" autoComplete="current-password" value={pw.current} onChangeText={(t) => setPw({ ...pw, current: t })} accessibilityLabel="Senha atual" />
          </Field>
          <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números">
            <Input secureTextEntry textContentType="newPassword" autoComplete="new-password" value={pw.next} onChangeText={(t) => setPw({ ...pw, next: t })} accessibilityLabel="Nova senha" />
          </Field>
          <Row>
            <Button label="Trocar senha" variant="outline" loading={pwMutation.busy} disabled={!pw.current || !pw.next} onPress={changePassword} />
          </Row>
        </Card>

        {user.role === 'platform_admin' && (
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${portalUrl}/admin`)} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.surfaceHover : c.surface })}>
            <Shield size={20} color={c.brand} />
            <View style={{ flex: 1 }}>
              <T weight="semibold">Administração da plataforma</T>
              <T size={12} tone="muted">
                Abre no portal
              </T>
            </View>
          </Pressable>
        )}

        <Row>
          <Button
            label="Sair da conta"
            variant="ghost"
            icon={LogOut}
            onPress={() =>
              Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo neste aparelho.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sair', style: 'destructive', onPress: () => void session.logout() },
              ])
            }
          />
        </Row>
        <T size={12} tone="subtle" center>
          Tenace {Constants.expoConfig?.version ?? ''} · non arrenderti 💜
        </T>
      </Screen>
    </View>
  );
}
