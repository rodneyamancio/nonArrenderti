import { inviteTokenFrom } from '@tenace/api-client';
import { router } from 'expo-router';
import { Bell, Link2, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { GroupCard } from '@/features/group/group-card';
import { formatCents, greeting } from '@/lib/format';
import { useAppData } from '@/session/app-data';
import { useUser } from '@/session/provider';
import { TenaceMark } from '@/ui/brand';
import { Button, Card, ErrorState, Input, Loading, Overline, Screen, T, ToneBox } from '@/ui/kit';
import { TopBar } from '@/ui/page-header';
import { ThemeToggle } from '@/ui/theme-toggle';
import { useTheme } from '@/ui/theme-provider';

export default function HomeScreen() {
  const { c } = useTheme();
  const user = useUser();
  const { groups, groupsError, groupsRefreshing, refreshGroups, reloadGroups, unread } = useAppData();
  const first = (user?.name ?? '').split(' ')[0];

  const charged = (groups ?? []).filter((g) => g.charged);
  const weekTotal = charged.reduce((s, g) => s + g.weekBalanceCents, 0);
  const missing = charged.reduce((s, g) => s + g.goals.reduce((x, wg) => x + Math.max(0, wg.slotsPerWeek - wg.slotsAchieved), 0), 0);
  const debt = (groups ?? []).reduce((s, g) => s + Math.max(0, g.openDebtCents), 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar>
        <TenaceMark size={32} />
        <T size={20} weight="extrabold" style={{ flex: 1, letterSpacing: -0.6 }}>
          tenace
        </T>
        <ThemeToggle />
        <Pressable onPress={() => router.push('/avisos')} accessibilityRole="button" accessibilityLabel={`Avisos${unread ? ` (${unread} novos)` : ''}`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={22} color={c.text} />
          {!!unread && <View style={{ position: 'absolute', top: 9, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: c.sparkSolid, borderWidth: 2, borderColor: c.bg }} />}
        </Pressable>
      </TopBar>
      <Screen onRefresh={refreshGroups} refreshing={groupsRefreshing} bottomInset={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View>
            <T size={14} weight="medium" tone="muted">
              {greeting()},
            </T>
            <T size={28} weight="extrabold" style={{ letterSpacing: -0.6 }}>
              {first} 👋
            </T>
          </View>
          {!!groups?.length && <Button label="Novo grupo" variant="outline" size="sm" icon={Plus} onPress={() => router.push('/grupos/novo')} />}
        </View>

        {!groups ? (
          groupsError ? (
            <ErrorState error={groupsError} onRetry={reloadGroups} />
          ) : (
            <Loading />
          )
        ) : groups.length === 0 ? (
          <Welcome />
        ) : (
          <>
            {charged.length > 0 && (
              <View style={{ gap: 12 }} accessibilityLabel="Resumo da semana">
                <ToneBox color="violet" style={{ padding: 20, gap: 4 }}>
                  <Overline tone="onBrand">Esta semana</Overline>
                  <T size={30} weight="extrabold" tone="onBrand">
                    {formatCents(weekTotal)}
                  </T>
                  <T size={14} style={{ color: 'rgba(255,255,255,0.88)' }}>
                    {missing === 0 ? 'Tudo pago! Você é tenace 🏆' : `${missing} ${missing === 1 ? 'cota' : 'cotas'} para zerar`}
                  </T>
                </ToneBox>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Card style={{ flex: 1 }}>
                    <Overline>Grupos</Overline>
                    <T size={22} weight="extrabold">
                      {groups.length}
                    </T>
                  </Card>
                  <Card style={{ flex: 1 }}>
                    <Overline>Em aberto</Overline>
                    <T size={22} weight="extrabold" tone={debt > 0 ? 'danger' : 'default'}>
                      {formatCents(debt)}
                    </T>
                  </Card>
                </View>
              </View>
            )}
            {groups.map((g) => (
              <GroupCard key={g.group.id} data={g} />
            ))}
          </>
        )}
      </Screen>
    </View>
  );
}

function Welcome() {
  const [link, setLink] = useState('');
  const token = inviteTokenFrom(link);
  return (
    <View style={{ gap: 16 }}>
      <ToneBox color="violet" style={{ padding: 24, gap: 10 }}>
        <T size={14} weight="semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
          Vamos começar
        </T>
        <T size={22} weight="extrabold" tone="onBrand">
          Crie um grupo, defina as metas e deixe o compromisso fazer o resto.
        </T>
        <View style={{ gap: 4 }}>
          {['1. Escolha as atividades (ler, treinar, correr…)', '2. Defina o valor de cada cota (ex.: R$ 5)', '3. Convide quem vai participar'].map((s) => (
            <T key={s} size={14} style={{ color: 'rgba(255,255,255,0.92)' }}>
              {s}
            </T>
          ))}
        </View>
        <Button label="Criar meu grupo" variant="white" icon={Plus} size="lg" onPress={() => router.push('/grupos/novo')} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
      </ToneBox>
      <Card title="Recebeu um convite?" description="Cole o link que te mandaram.">
        <Input placeholder="https://…/convite/…" autoCapitalize="none" autoCorrect={false} value={link} onChangeText={setLink} accessibilityLabel="Link do convite" />
        <Button label="Abrir convite" variant="soft" icon={Link2} disabled={!token} onPress={() => token && router.push({ pathname: '/convite/[token]', params: { token } })} />
      </Card>
    </View>
  );
}
