import { errorMessage } from '@tenace/api-client';
import { addDays, localDate, pixKeyProblem, weekStartOf } from '@tenace/rules';
import { BRAND_COLORS, type GoalInput } from '@tenace/types';
import { router } from 'expo-router';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@/data/use-api';
import { GoalSheet } from '@/features/goals/goal-fields';
import { emptyGoal, GOAL_TEMPLATES, goalBody, goalPreview } from '@/features/goals/logic';
import { DestinationFields, type DestinationForm } from '@/features/group/destination-fields';
import { emitDataChanged } from '@/lib/events';
import { fmtDay, formatCents } from '@/lib/format';
import { api } from '@/session/provider';
import { Button, Card, Chip, Field, IconButton, Input, Notice, Row, Screen, T, ToneBox } from '@/ui/kit';
import { BackHeader } from '@/ui/page-header';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/theme-provider';

const GROUP_EMOJIS = ['🔥', '💪', '📚', '🏃', '🧠', '🌱', '⚡', '🏆', '🎯', '🚀', '❤️', '☀️'];
const STEPS = ['Grupo', 'Metas', 'Destino', 'Início'];

export default function NewGroupScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🔥');
  const [color, setColor] = useState<(typeof BRAND_COLORS)[number]>('violet');
  const [description, setDescription] = useState('');
  const [goals, setGoals] = useState<GoalInput[]>([]);
  const [editing, setEditing] = useState<{ index: number | null; goal: GoalInput } | null>(null);
  const [dest, setDest] = useState<DestinationForm>({ label: 'Caixa do grupo', holderName: '', pixKeyType: 'phone', pixKey: '', bankInfo: '', city: '' });
  const [startMode, setStartMode] = useState<'next' | 'now'>('next');
  const [error, setError] = useState('');
  const { busy, run } = useMutation();

  const tz = 'America/Sao_Paulo';
  const today = localDate(new Date(), tz);
  const nextMonday = addDays(weekStartOf(today), 7);
  const commitment = goals.reduce((s, g) => s + goalPreview(g).commitment, 0);

  function validate(s: number): string | null {
    if (s === 0 && name.trim().length < 2) return 'Dê um nome para o grupo';
    if (s === 1 && goals.length === 0) return 'Adicione pelo menos uma meta';
    if (s === 2) {
      if (dest.label.trim().length < 2) return 'Diga para onde vai o dinheiro';
      if (dest.pixKey) return pixKeyProblem(dest.pixKeyType, dest.pixKey);
    }
    return null;
  }
  function next() {
    const p = validate(step);
    setError(p ?? '');
    if (!p) setStep((s) => s + 1);
  }
  const back = () => {
    setError('');
    if (step === 0) router.canGoBack() ? router.back() : router.replace('/inicio');
    else setStep(step - 1);
  };

  const create = () =>
    run(async () => {
      setError('');
      try {
        const r = await api<{ id: string }>('/groups', {
          method: 'POST',
          body: { name, emoji, color, description, timezone: tz, startMode, destination: { ...dest, pixKeyType: dest.pixKey ? dest.pixKeyType : null }, goals: goals.map(goalBody) },
        });
        emitDataChanged();
        router.replace({ pathname: '/g/[groupId]', params: { groupId: r.id, s: 'membros', novo: '1' } });
      } catch (e) {
        setError(errorMessage(e));
      }
    });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <BackHeader title="Novo grupo" onBack={back} />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 }} accessibilityLabel={`Etapa ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= step ? c.brandSolid : c.surfaceSunken }} />
            <T size={11} weight="semibold" tone={i === step ? 'brand' : 'muted'}>
              {i + 1}. {s}
            </T>
          </View>
        ))}
      </View>

      <Screen bottomInset={false}>
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {step === 0 && (
          <Card>
            <ToneBox color={color} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
              <View style={{ width: 54, height: 54, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30 }}>{emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <T size={20} weight="extrabold" tone="onBrand" numberOfLines={1}>
                  {name || 'Nome do grupo'}
                </T>
                <T size={14} numberOfLines={1} style={{ color: 'rgba(255,255,255,0.82)' }}>
                  {description || 'non arrenderti 💜'}
                </T>
              </View>
            </ToneBox>
            <Field label="Nome do grupo">
              <Input maxLength={50} placeholder="Ex.: Clube do Foco" value={name} onChangeText={setName} autoFocus accessibilityLabel="Nome do grupo" />
            </Field>
            <Field label="Descrição (opcional)">
              <Input multiline maxLength={300} placeholder="Ex.: Quem falhar paga o churrasco!" value={description} onChangeText={setDescription} accessibilityLabel="Descrição" />
            </Field>
            <View style={{ gap: 8 }}>
              <T size={14} weight="semibold">
                Emoji
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GROUP_EMOJIS.map((e) => (
                  <Pressable key={e} onPress={() => setEmoji(e)} accessibilityRole="button" accessibilityLabel={`Emoji ${e}`} accessibilityState={{ selected: e === emoji }} style={{ width: 46, height: 46, borderRadius: radius.md, borderWidth: e === emoji ? 2 : 1, borderColor: e === emoji ? c.brandSolid : c.border, backgroundColor: e === emoji ? c.brandSoft : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <T size={14} weight="semibold">
                Cor
              </T>
              <Row gap={10} wrap>
                {BRAND_COLORS.map((col) => (
                  <Pressable key={col} onPress={() => setColor(col)} accessibilityRole="button" accessibilityLabel={col} accessibilityState={{ selected: col === color }} style={{ padding: 3, borderRadius: 24, borderWidth: 2, borderColor: col === color ? c.focus : 'transparent' }}>
                    <ToneBox color={col} radiusSize={19} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                      {col === color && <Check size={18} color="#fff" />}
                    </ToneBox>
                  </Pressable>
                ))}
              </Row>
            </View>
          </Card>
        )}

        {step === 1 && (
          <>
            <Card title="Metas do grupo" description="Valem para todo mundo do grupo. Cada meta vira cotas semanais.">
              {goals.length === 0 ? (
                <T size={14} tone="muted">
                  Comece por um modelo ou crie do zero:
                </T>
              ) : (
                goals.map((g, i) => {
                  const p = goalPreview(g);
                  return (
                    <View key={`${g.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 10 }}>
                      <Text style={{ fontSize: 24 }}>{g.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <T weight="semibold" numberOfLines={1}>
                          {g.name}
                        </T>
                        <T size={12} tone="muted">
                          {p.text} · {formatCents(g.stakeCents)}/cota · <T size={12} weight="bold">{`${formatCents(p.commitment)}/semana`}</T>
                        </T>
                      </View>
                      <IconButton icon={Pencil} label={`Editar ${g.name}`} onPress={() => setEditing({ index: i, goal: g })} />
                      <IconButton icon={Trash2} label={`Remover ${g.name}`} onPress={() => setGoals(goals.filter((_, j) => j !== i))} />
                    </View>
                  );
                })
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GOAL_TEMPLATES.filter((t) => !goals.some((g) => g.name === t.name)).map(({ label, ...t }) => (
                  <Chip key={label} onPress={() => setEditing({ index: null, goal: t })}>
                    {`${t.emoji} ${label}`}
                  </Chip>
                ))}
                <Chip onPress={() => setEditing({ index: null, goal: emptyGoal() })}>
                  <Plus size={16} color={c.brand} />
                  <T size={14} weight="semibold" tone="brand">
                    Meta personalizada
                  </T>
                </Chip>
              </View>
            </Card>
            {goals.length > 0 && (
              <ToneBox color="violet" style={{ padding: 20, gap: 4 }}>
                <T size={14} style={{ color: 'rgba(255,255,255,0.85)' }}>
                  Cada pessoa começa a semana com
                </T>
                <T size={30} weight="extrabold" tone="onBrand">
                  −{formatCents(commitment)}
                </T>
                <T size={14} style={{ color: 'rgba(255,255,255,0.85)' }}>
                  Cumpriu tudo? Fecha no zero. O que faltar vai para o caixa do grupo.
                </T>
              </ToneBox>
            )}
          </>
        )}

        {step === 2 && (
          <Card title="Para onde vai o dinheiro?" description="O Tenace só registra quem deve quanto — o pagamento é feito por PIX, fora do app.">
            <DestinationFields value={dest} onChange={setDest} pixOptional labelHint="Ex.: Caixinha do churrasco, Doação para o abrigo, Conta da Ana" />
          </Card>
        )}

        {step === 3 && (
          <>
            <Card title="Quando começa?">
              {(
                [
                  { v: 'next', title: `Segunda, ${fmtDay(nextMonday)}`, sub: 'Recomendado: dá tempo de convidar todo mundo.' },
                  { v: 'now', title: 'Já nesta semana', sub: 'Metas diárias contam a partir de hoje. Quem entrar depois começa na próxima segunda.' },
                ] as const
              ).map((o) => (
                <Pressable key={o.v} onPress={() => setStartMode(o.v)} accessibilityRole="radio" accessibilityState={{ checked: startMode === o.v }} style={{ borderRadius: radius.md, borderWidth: startMode === o.v ? 2 : 1, borderColor: startMode === o.v ? c.brandSolid : c.border, backgroundColor: startMode === o.v ? c.brandSoft : c.surface, padding: 14, gap: 4 }}>
                  <T weight="bold">{o.title}</T>
                  <T size={14} tone="muted">
                    {o.sub}
                  </T>
                </Pressable>
              ))}
            </Card>
            <Card title="Resumo">
              <Summary label="Grupo" value={`${emoji} ${name}`} />
              <Summary label="Destino do dinheiro" value={dest.label} />
              <Summary label="Metas" value={goals.map((g) => `${g.emoji} ${g.name}`).join(' · ')} />
              <View>
                <T size={13} tone="muted">
                  Compromisso semanal por pessoa
                </T>
                <T size={20} weight="extrabold">
                  {formatCents(commitment)}
                </T>
              </View>
            </Card>
          </>
        )}
      </Screen>

      <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface }}>
        {step < STEPS.length - 1 ? <Button label="Continuar" size="lg" onPress={next} /> : <Button label="Criar grupo 🚀" size="lg" loading={busy} onPress={create} />}
      </View>

      <GoalSheet
        state={editing ? { title: editing.index === null ? 'Nova meta' : 'Editar meta', goal: editing.goal, isNew: false } : null}
        saveLabel="Salvar meta"
        onClose={() => setEditing(null)}
        onSave={(g) => {
          if (!editing) return null;
          setGoals(editing.index === null ? [...goals, g] : goals.map((x, i) => (i === editing.index ? g : x)));
          setEditing(null);
          return null;
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <T size={13} tone="muted">
        {label}
      </T>
      <T weight="semibold">{value}</T>
    </View>
  );
}
