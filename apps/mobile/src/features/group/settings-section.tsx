import { errorMessage } from '@tenace/api-client';
import { pixKeyProblem } from '@tenace/rules';
import { BRAND_COLORS, type PixKeyType } from '@tenace/types';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useMutation } from '@/data/use-api';
import { TIMEZONES } from '@/lib/constants';
import { emitDataChanged } from '@/lib/events';
import { api } from '@/session/provider';
import { Button, Card, Chip, Field, Input, Notice, Row, Stepper, T, ToneBox, useToast } from '@/ui/kit';
import { useTheme } from '@/ui/theme-provider';
import { DestinationFields, type DestinationForm } from './destination-fields';
import { useGroup } from './group-context';

export function SettingsSection() {
  const { group, can, reload } = useGroup();
  const { c } = useTheme();
  const toast = useToast();
  const [form, setForm] = useState({ name: group.name, emoji: group.emoji, color: group.color, description: group.description, timezone: group.timezone, closeGraceHours: group.closeGraceHours });
  const [dest, setDest] = useState<DestinationForm>({ ...group.destination, pixKeyType: (group.destination.pixKeyType ?? 'phone') as PixKeyType });
  const [err, setErr] = useState('');
  const { busy, run } = useMutation();

  if (!can('group:settings:update')) return <Notice tone="warning">Só admins podem mudar os ajustes do grupo.</Notice>;

  const save = () =>
    run(async () => {
      const problem = dest.pixKey ? pixKeyProblem(dest.pixKeyType, dest.pixKey) : null;
      if (problem) return setErr(problem);
      setErr('');
      try {
        await api(`/groups/${group.id}`, { method: 'PATCH', body: { ...form, destination: { ...dest, pixKeyType: dest.pixKey ? dest.pixKeyType : null } } });
        toast('Ajustes salvos');
        await reload();
        emitDataChanged();
      } catch (e) {
        setErr(errorMessage(e));
      }
    });

  function archive() {
    Alert.alert(`Encerrar o grupo "${group.name}"?`, 'Ele some para todo mundo. Esta ação não pode ser desfeita pelo app.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Encerrar grupo',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/groups/${group.id}`, { method: 'DELETE' });
            emitDataChanged();
            router.replace('/inicio');
          } catch (e) {
            toast(errorMessage(e), 'danger');
          }
        },
      },
    ]);
  }

  const zones = TIMEZONES.some((t) => t.value === form.timezone) ? TIMEZONES : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES];

  return (
    <View style={{ gap: 16 }}>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Card title="Grupo">
        <Field label="Nome">
          <Input maxLength={50} value={form.name} onChangeText={(name) => setForm({ ...form, name })} accessibilityLabel="Nome" />
        </Field>
        <Field label="Emoji">
          <Input maxLength={8} value={form.emoji} onChangeText={(emoji) => setForm({ ...form, emoji })} accessibilityLabel="Emoji" />
        </Field>
        <Field label="Descrição">
          <Input multiline maxLength={300} value={form.description} onChangeText={(description) => setForm({ ...form, description })} accessibilityLabel="Descrição" />
        </Field>
        <View style={{ gap: 8 }}>
          <T size={14} weight="semibold">
            Cor
          </T>
          <Row gap={10} wrap>
            {BRAND_COLORS.map((col) => (
              <Pressable key={col} onPress={() => setForm({ ...form, color: col })} accessibilityRole="button" accessibilityLabel={col} accessibilityState={{ selected: col === form.color }} style={{ padding: 3, borderRadius: 24, borderWidth: 2, borderColor: col === form.color ? c.focus : 'transparent' }}>
                <ToneBox color={col} radiusSize={19} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  {col === form.color && <Check size={18} color="#fff" />}
                </ToneBox>
              </Pressable>
            ))}
          </Row>
        </View>
        <View style={{ gap: 8 }}>
          <T size={14} weight="semibold">
            Fuso horário
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {zones.map((t) => (
              <Chip key={t.value} active={form.timezone === t.value} onPress={() => setForm({ ...form, timezone: t.value })}>
                {t.label}
              </Chip>
            ))}
          </View>
          <T size={12} tone="muted">
            Define quando a semana vira (segunda 00:00).
          </T>
        </View>
        <Field label="Tolerância para fechar (horas)" hint="Tempo na segunda para registrar o domingo.">
          <Stepper value={form.closeGraceHours} min={0} max={48} onChange={(closeGraceHours) => setForm({ ...form, closeGraceHours })} label="Tolerância em horas" />
        </Field>
      </Card>

      <Card title="Destino do dinheiro" description="Para onde vão as multas. Usado para gerar o PIX na hora de pagar.">
        <DestinationFields value={dest} onChange={setDest} />
      </Card>

      <Button label="Salvar ajustes" size="lg" loading={busy} onPress={save} />

      {can('group:group:delete') && (
        <Card title="Zona de perigo" style={{ borderColor: c.dangerSolid }}>
          <T size={14} tone="muted">
            Encerrar o grupo esconde tudo para todos os membros.
          </T>
          <Button label="Encerrar grupo" variant="danger" onPress={archive} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}
    </View>
  );
}
