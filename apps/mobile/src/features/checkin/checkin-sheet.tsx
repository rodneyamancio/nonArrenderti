import { errorMessage } from '@tenace/api-client';
import { addDays } from '@tenace/rules';
import type { CheckInResult } from '@tenace/types';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Camera, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useMutation } from '@/data/use-api';
import { choosePhoto, uploadPhoto, type PickedPhoto } from '@/features/photos/photos';
import { emitDataChanged } from '@/lib/events';
import { fmtDay, fmtWeekday, formatCents, isTimes, unitLabel } from '@/lib/format';
import { useAppData } from '@/session/app-data';
import { api } from '@/session/provider';
import { Button, Chip, Field, Input, LinkText, Notice, Row, SlotBar, Stepper, T, ToneBox, useToast } from '@/ui/kit';
import { Sheet } from '@/ui/sheet';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

/** "Registrar atividade" — same flow as the portal's CheckInSheet. */
export function CheckInSheet() {
  const { groups, checkIn: target, closeCheckIn } = useAppData();
  const { c } = useTheme();
  const toast = useToast();
  const [groupId, setGroupId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [date, setDate] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const { busy, run } = useMutation();

  const open = target !== null;
  const usable = useMemo(() => (groups ?? []).filter((g) => g.checkinGoals.length > 0), [groups]);
  const group = usable.find((g) => g.group.id === groupId);
  const goal = group?.checkinGoals.find((x) => x.id === goalId);

  // Reset on open, with optional preselection.
  useEffect(() => {
    if (!open) return;
    const g = usable.find((x) => x.group.id === target?.groupId) ?? usable[0];
    setGroupId(g?.group.id ?? '');
    setGoalId(target?.goalId && g?.checkinGoals.some((x) => x.id === target.goalId) ? target.goalId : (g?.checkinGoals[0]?.id ?? ''));
    setDate(g?.today ?? '');
    setNote('');
    setPhoto(null);
    setError('');
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!goal) return;
    setQuantity(isTimes(goal.unit) ? 1 : goal.period === 'daily' ? goal.target : Math.max(1, Math.round(goal.target / 3)));
  }, [goal]);

  const submit = () =>
    run(async () => {
      if (!group || !goal) return;
      setError('');
      try {
        const photoUploadId = photo ? await uploadPhoto(group.group.id, photo) : null;
        const r = await api<CheckInResult>(`/groups/${group.group.id}/checkins`, { method: 'POST', body: { goalId: goal.id, date, quantity, note, photoUploadId } });
        setResult(r);
        emitDataChanged();
        if (r.slotDeltaCents > 0) toast(`+${formatCents(r.slotDeltaCents)} · cota paga! 🔥`);
      } catch (e) {
        setError(errorMessage(e));
      }
    });

  const today = group?.today ?? '';
  const days = today ? Array.from({ length: 9 }, (_, i) => addDays(today, -i)) : [];

  if (open && groups && usable.length === 0) {
    return (
      <Sheet open onClose={closeCheckIn} title="Registrar atividade">
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
          <Text style={{ fontSize: 40 }}>🎯</Text>
          <T tone="muted" center>
            Você ainda não tem metas para registrar. Crie um grupo ou entre em um com um convite.
          </T>
          <LinkText
            onPress={() => {
              closeCheckIn();
              router.push('/grupos/novo');
            }}
          >
            Criar um grupo
          </LinkText>
        </View>
      </Sheet>
    );
  }

  if (result) {
    const wg = result.goal;
    const done = !!wg && wg.slotsAchieved >= wg.slotsPerWeek;
    return (
      <Sheet open={open} onClose={closeCheckIn} title="Registrado!" footer={<Button label="Fechar" onPress={closeCheckIn} full style={{ flex: 1 }} />}>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 16 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: result.slotDeltaCents > 0 ? c.successSoft : c.brandSoft }}>
            <Text style={{ fontSize: 44 }}>{done ? '🏆' : result.slotDeltaCents > 0 ? '🔥' : result.checkIn.goalEmoji}</Text>
          </View>
          {result.slotDeltaCents > 0 ? (
            <T size={22} weight="extrabold" tone="success" center>
              +{formatCents(result.slotDeltaCents)} · cota paga!
            </T>
          ) : (
            <T size={18} weight="bold" center>
              {result.counted ? 'Registro salvo' : 'Registro salvo (fora das cotas)'}
            </T>
          )}
          {wg && (
            <View style={{ alignSelf: 'stretch', gap: 8 }}>
              <SlotBar slots={wg.slotsPerWeek} achieved={wg.slotsAchieved} />
              <T tone="muted" center>
                {done
                  ? `${wg.emoji} ${wg.name}: meta da semana cumprida! Non arrenderti 💜`
                  : wg.toNext != null
                    ? `${wg.toNext === 1 ? 'Falta' : 'Faltam'} ${wg.toNext} ${unitLabel(wg.unit, wg.toNext)} para a próxima cota${wg.period === 'daily' ? ' hoje' : ''}.`
                    : `${wg.slotsAchieved} de ${wg.slotsPerWeek} cotas nesta semana.`}
              </T>
            </View>
          )}
          {!result.counted && (
            <T size={14} tone="muted" center>
              Suas metas começam a contar na semana em que você passa a ser cobrado. O registro aparece no feed do grupo.
            </T>
          )}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={closeCheckIn}
      title="Registrar atividade"
      description="Cada registro paga sua cota. Bora!"
      footer={
        <>
          <Button label="Cancelar" variant="ghost" onPress={closeCheckIn} />
          <Button label="Registrar" size="lg" loading={busy} disabled={!goal || quantity < 1} onPress={submit} style={{ flex: 1 }} />
        </>
      }
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {usable.length > 1 && (
        <View style={{ gap: 8 }}>
          <T size={14} weight="semibold">
            Grupo
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {usable.map((g) => (
              <Chip
                key={g.group.id}
                active={g.group.id === groupId}
                onPress={() => {
                  setGroupId(g.group.id);
                  setGoalId(g.checkinGoals[0]?.id ?? '');
                  setDate(g.today);
                }}
              >
                <ToneBox color={g.group.color} radiusSize={6} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12 }}>{g.group.emoji}</Text>
                </ToneBox>
                <T size={14} weight="semibold" tone={g.group.id === groupId ? 'brand' : 'default'}>
                  {g.group.name}
                </T>
              </Chip>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <T size={14} weight="semibold">
          O que você fez?
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {group?.checkinGoals.map((g) => {
            const on = g.id === goalId;
            return (
              <Pressable
                key={g.id}
                onPress={() => setGoalId(g.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ width: '48.5%', minHeight: 76, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? c.brandSolid : c.border, backgroundColor: on ? c.brandSoft : c.surface, padding: on ? 11 : 12, gap: 4 }}
              >
                <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                <T size={14} weight="semibold" numberOfLines={2}>
                  {g.name}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>

      {goal && !isTimes(goal.unit) && (
        <Field label={`Quantidade (${goal.unit})`} hint={`meta: ${goal.target} ${goal.unit}/${goal.period === 'daily' ? 'dia' : 'semana'}`}>
          <Stepper value={quantity} onChange={setQuantity} label="Quantidade" />
        </Field>
      )}

      <View style={{ gap: 8 }}>
        <T size={14} weight="semibold">
          Quando?
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((d, i) => (
            <Chip key={d} active={date === d} onPress={() => setDate(d)} accessibilityLabel={i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : fmtDay(d)}>
              {i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : `${fmtWeekday(d)} ${fmtDay(d)}`}
            </Chip>
          ))}
        </ScrollView>
      </View>

      <Field label="Comentário (opcional)">
        <Input multiline maxLength={500} placeholder="Ex.: treino de perna, capítulo 3…" value={note} onChangeText={setNote} accessibilityLabel="Comentário" />
      </Field>

      {photo ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Image source={{ uri: photo.uri }} style={{ width: 120, height: 120, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Prévia da foto" />
          <Pressable onPress={() => setPhoto(null)} accessibilityRole="button" accessibilityLabel="Remover foto" style={{ position: 'absolute', top: -10, right: -10, width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={c.text} />
          </Pressable>
        </View>
      ) : (
        <Row>
          <Button label="Adicionar foto (opcional)" variant="outline" icon={Camera} onPress={async () => setPhoto(await choosePhoto())} />
        </Row>
      )}
    </Sheet>
  );
}
