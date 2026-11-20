import { errorMessage } from '@tenace/api-client';
import { GROUP_ROLE_LABELS, type InviteView, type JoinRequestView, type MemberView } from '@tenace/types';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Copy, Link2, Mail, MoreHorizontal, Share2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { useApi, useMutation } from '@/data/use-api';
import { portalUrl } from '@/lib/config';
import { emitDataChanged } from '@/lib/events';
import { fmtDay, timeAgo } from '@/lib/format';
import { api } from '@/session/provider';
import { Avatar, Badge, Button, Card, Divider, ErrorState, IconButton, Input, Loading, Notice, T, useToast } from '@/ui/kit';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';
import { useGroup } from './group-context';

const inviteUrl = (token: string) => `${portalUrl}/convite/${token}`;

export function MembersSection({ justCreated }: { justCreated?: boolean }) {
  const { group, can, reload: reloadGroup } = useGroup();
  const toast = useToast();
  const { data, error, reload } = useApi<{ members: MemberView[] }>(`/groups/${group.id}/members`);
  const isOwner = group.me.role === 'owner';
  if (!data) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok);
      void reload();
      void reloadGroup();
      emitDataChanged();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  function manage(m: MemberView) {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (isOwner) {
      options.push({ text: m.role === 'admin' ? 'Tornar membro' : 'Tornar admin', onPress: () => void act(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'PATCH', body: { role: m.role === 'admin' ? 'member' : 'admin' } }), 'Papel atualizado') });
      options.push({
        text: 'Tornar dono',
        onPress: () =>
          Alert.alert(`Transferir o grupo para ${m.name}?`, 'Você vira admin.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Transferir', onPress: () => void act(() => api(`/groups/${group.id}/members/${m.id}/transfer`, { method: 'POST' }), 'Grupo transferido') },
          ]),
      });
    }
    options.push({
      text: 'Remover do grupo',
      style: 'destructive',
      onPress: () =>
        Alert.alert(`Remover ${m.name}?`, 'A saída vale depois que a semana atual fechar.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Remover', style: 'destructive', onPress: () => void act(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'DELETE' }), 'Membro removido') },
        ]),
    });
    options.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert(m.name, GROUP_ROLE_LABELS[m.role], options);
  }

  function leave() {
    Alert.alert('Sair do grupo?', 'Você ainda responde pela semana atual e por valores em aberto.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/groups/${group.id}/leave`, { method: 'POST' });
            toast('Você saiu do grupo');
            emitDataChanged();
            router.replace('/inicio');
          } catch (e) {
            toast(errorMessage(e), 'danger');
          }
        },
      },
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <View style={{ gap: 16 }}>
      {justCreated && (
        <Notice tone="success" title="Grupo criado! 🎉">
          Agora convide a galera: gere um link e mande no grupo do WhatsApp.
        </Notice>
      )}
      {can('group:member:invite') && <Invites />}
      {can('group:member:approve') && <JoinRequests onChange={() => act(async () => undefined, 'Atualizado')} />}
      <Card title={`Membros (${data.members.length})`} padded={false}>
        {data.members.map((m, i) => {
          const manageable = m.id !== group.me.memberId && m.role !== 'owner' && (isOwner || (can('group:member:remove') && m.role === 'member'));
          return (
            <View key={m.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Avatar name={m.name} color={m.avatarColor} />
                <View style={{ flex: 1 }}>
                  <T weight="semibold" numberOfLines={1}>
                    {m.name}
                    {m.id === group.me.memberId ? <T size={12} tone="muted">{'  (você)'}</T> : null}
                  </T>
                  <T size={12} tone="muted" numberOfLines={1}>
                    {m.status === 'leaving' && m.endsAfterWeek ? `sai após a semana de ${fmtDay(m.endsAfterWeek)}` : m.startsOnWeek > today ? `começa em ${fmtDay(m.startsOnWeek)}` : m.streak > 0 ? `🔥 ${m.streak} ${m.streak === 1 ? 'semana' : 'semanas'} seguidas` : `entrou ${timeAgo(m.joinedAt)}`}
                  </T>
                </View>
                <Badge tone={m.role === 'owner' ? 'brand' : m.role === 'admin' ? 'spark' : 'neutral'}>{GROUP_ROLE_LABELS[m.role]}</Badge>
                {manageable && <IconButton icon={MoreHorizontal} label={`Gerenciar ${m.name}`} onPress={() => manage(m)} />}
              </View>
            </View>
          );
        })}
      </Card>
      {!isOwner && <Button label="Sair do grupo" variant="ghost" onPress={leave} style={{ alignSelf: 'flex-start' }} />}
    </View>
  );
}

function JoinRequests({ onChange }: { onChange: () => void }) {
  const { group } = useGroup();
  const { c } = useTheme();
  const toast = useToast();
  const { data, reload } = useApi<{ requests: JoinRequestView[] }>(`/groups/${group.id}/join-requests`);
  if (!data || data.requests.length === 0) return null;
  async function decide(r: JoinRequestView, d: 'approve' | 'reject') {
    try {
      await api(`/groups/${group.id}/join-requests/${r.id}/${d}`, { method: 'POST' });
      toast(d === 'approve' ? `${r.name} entrou no grupo 🎉` : 'Pedido recusado');
      void reload();
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  return (
    <Card title="Pedidos para entrar" description="Pessoas que abriram o link de convite." style={{ borderColor: c.sparkSolid }}>
      {data.requests.map((r) => (
        <View key={r.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={r.name} color={r.avatarColor} />
            <View style={{ flex: 1 }}>
              <T weight="semibold" numberOfLines={1}>
                {r.name}
              </T>
              <T size={12} tone="muted" numberOfLines={1}>
                {r.email}
              </T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 52 }}>
            <Button label="Aprovar" size="sm" onPress={() => decide(r, 'approve')} />
            <Button label="Recusar" size="sm" variant="ghost" onPress={() => decide(r, 'reject')} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function Invites() {
  const { group } = useGroup();
  const { c } = useTheme();
  const toast = useToast();
  const { data, reload } = useApi<{ invites: InviteView[] }>(`/groups/${group.id}/invites`);
  const [email, setEmail] = useState('');
  const [last, setLast] = useState<{ url: string; emailSent: boolean; kind: 'email' | 'link' } | null>(null);
  const linkMutation = useMutation();
  const emailMutation = useMutation();

  const create = (kind: 'email' | 'link') =>
    (kind === 'link' ? linkMutation : emailMutation).run(async () => {
      try {
        const r = await api<{ token: string; emailSent: boolean }>(`/groups/${group.id}/invites`, { method: 'POST', body: kind === 'email' ? { kind, email: email.trim() } : { kind } });
        setLast({ url: inviteUrl(r.token), emailSent: r.emailSent, kind });
        setEmail('');
        void reload();
      } catch (e) {
        toast(errorMessage(e), 'danger');
      }
    });

  const share = (url: string) => {
    const text = `Bora entrar no grupo ${group.emoji} ${group.name} no Tenace? Metas semanais, e quem falhar paga pro caixa 😅`;
    void Share.share({ message: `${text} ${url}`, url, title: 'Convite Tenace' }).catch(() => undefined);
  };
  const copy = async (url: string) => {
    await Clipboard.setStringAsync(url);
    toast('Link copiado');
  };

  return (
    <View style={{ gap: 16 }}>
      <Card title="Convidar pessoas" description="Você decide quem entra: convites por link passam pela sua aprovação.">
        <Button label="Gerar link de convite" icon={Link2} size="lg" loading={linkMutation.busy} onPress={() => create('link')} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="ou convide por e-mail" value={email} onChangeText={setEmail} accessibilityLabel="E-mail do convidado" />
          </View>
          <Button label="Convidar" variant="outline" icon={Mail} loading={emailMutation.busy} disabled={!email.includes('@')} onPress={() => create('email')} />
        </View>
        {last && (
          <View style={{ backgroundColor: c.brandSoft, borderRadius: radius.md, padding: 14, gap: 10 }}>
            <T size={14} weight="semibold" tone="brand">
              {last.kind === 'email' ? (last.emailSent ? 'E-mail enviado! Se preferir, mande o link também:' : 'Convite criado. Mande este link para a pessoa (vale só para o e-mail convidado):') : 'Link pronto! Vale por 7 dias:'}
            </T>
            <T size={12} numberOfLines={2}>
              {last.url}
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Compartilhar" icon={Share2} size="sm" onPress={() => share(last.url)} />
              <Button label="Copiar" icon={Copy} size="sm" variant="outline" onPress={() => copy(last.url)} />
            </View>
          </View>
        )}
      </Card>
      {data && data.invites.length > 0 && (
        <Card title="Convites ativos" padded={false}>
          {data.invites.map((i, idx) => (
            <View key={i.id}>
              {idx > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                <View style={{ flex: 1 }}>
                  <T size={14} weight="medium" numberOfLines={1}>
                    {i.kind === 'email' ? i.email : 'Link de convite'}
                  </T>
                  <T size={12} tone="muted">
                    {i.uses} {i.uses === 1 ? 'uso' : 'usos'} · expira {fmtDay(i.expiresAt.slice(0, 10))}
                  </T>
                </View>
                <IconButton icon={Copy} label="Copiar link" onPress={() => copy(inviteUrl(i.token))} />
                <IconButton
                  icon={X}
                  label="Revogar convite"
                  onPress={async () => {
                    await api(`/groups/${group.id}/invites/${i.id}`, { method: 'DELETE' }).catch((e: unknown) => toast(errorMessage(e), 'danger'));
                    void reload();
                  }}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}
