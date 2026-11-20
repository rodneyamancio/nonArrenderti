'use client';
import { addDays, localDate, pixKeyProblem, weekStartOf } from '@tenace/rules';
import { BRAND_COLORS, type GoalInput, type PixKeyType } from '@tenace/types';
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { emitDataChanged } from '@/components/app/session';
import { emptyGoal, GOAL_TEMPLATES, GoalFields, goalInputProblem, goalPreview } from '@/components/app/goal-form';
import { Button, Card, Dialog, Field, Input, Notice, Select, Textarea, toneClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { PIX_TYPES } from '@/lib/constants';
import { cx, fmtDay, formatCents } from '@/lib/format';

const GROUP_EMOJIS = ['🔥', '💪', '📚', '🏃', '🧠', '🌱', '⚡', '🏆', '🎯', '🚀', '❤️', '☀️'];
const STEPS = ['Grupo', 'Metas', 'Destino', 'Início'];

export default function NewGroupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🔥');
  const [color, setColor] = useState<(typeof BRAND_COLORS)[number]>('violet');
  const [description, setDescription] = useState('');
  const [goals, setGoals] = useState<GoalInput[]>([]);
  const [editing, setEditing] = useState<{ index: number | null; goal: GoalInput } | null>(null);
  const [dest, setDest] = useState({ label: 'Caixa do grupo', holderName: '', pixKeyType: 'phone' as PixKeyType, pixKey: '', bankInfo: '', city: '' });
  const [startMode, setStartMode] = useState<'next' | 'now'>('next');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const tz = 'America/Sao_Paulo';
  const today = localDate(new Date(), tz);
  const nextMonday = addDays(weekStartOf(today), 7);
  const commitment = goals.reduce((s, g) => s + goalPreview(g).commitment, 0);

  function validate(s: number): string | null {
    if (s === 0 && name.trim().length < 2) return 'Dê um nome para o grupo';
    if (s === 1 && goals.length === 0) return 'Adicione pelo menos uma meta';
    if (s === 2) {
      if (dest.label.trim().length < 2) return 'Diga para onde vai o dinheiro';
      if (dest.pixKey && pixKeyProblem(dest.pixKeyType, dest.pixKey)) return pixKeyProblem(dest.pixKeyType, dest.pixKey);
    }
    return null;
  }

  function next() {
    const p = validate(step);
    setError(p ?? '');
    if (!p) setStep((s) => s + 1);
  }

  async function create() {
    setSaving(true);
    setError('');
    try {
      const r = await api<{ id: string }>('/groups', {
        method: 'POST',
        body: {
          name,
          emoji,
          color,
          description,
          timezone: tz,
          startMode,
          destination: { ...dest, pixKeyType: dest.pixKey ? dest.pixKeyType : null },
          goals: goals.map((g) => ({ ...g, activeWeekdays: g.period === 'daily' ? g.activeWeekdays : [1, 2, 3, 4, 5, 6, 7] })),
        },
      });
      emitDataChanged();
      router.replace(`/g/${r.id}/membros?novo=1`);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={() => (step === 0 ? router.back() : setStep(step - 1))} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
      </button>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Novo grupo</h1>
      <ol className="mt-4 mb-6 flex gap-2" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={cx('h-1.5 rounded-full', i <= step ? 'bg-brand-solid' : 'bg-muted')} />
            <p className={cx('mt-1.5 text-xs font-semibold', i === step ? 'text-brand' : 'text-muted-foreground')} aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {s}
            </p>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {step === 0 && (
        <Card>
          <div className="flex flex-col gap-5">
            <div className={cx('tone-bg flex items-center gap-4 rounded-lg p-5', toneClass(color))}>
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 text-3xl">{emoji}</span>
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold">{name || 'Nome do grupo'}</p>
                <p className="text-sm text-white/80">{description || 'non arrenderti 💜'}</p>
              </div>
            </div>
            <Field label="Nome do grupo" htmlFor="g-name">
              <Input id="g-name" maxLength={50} placeholder="Ex.: Clube do Foco" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Descrição (opcional)" htmlFor="g-desc">
              <Textarea id="g-desc" maxLength={300} rows={2} className="min-h-16" placeholder="Ex.: Quem falhar paga o churrasco!" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Emoji</legend>
              <div className="flex flex-wrap gap-2">
                {GROUP_EMOJIS.map((e) => (
                  <button key={e} type="button" aria-pressed={e === emoji} onClick={() => setEmoji(e)} className={cx('flex h-11 w-11 items-center justify-center rounded-md border text-xl', e === emoji ? 'border-brand-solid bg-brand-soft' : 'border-border bg-card')}>
                    {e}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Cor</legend>
              <div className="flex flex-wrap gap-2.5">
                {BRAND_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} aria-pressed={c === color} onClick={() => setColor(c)} className={cx('tone-dot flex h-10 w-10 items-center justify-center rounded-full ring-offset-2 ring-offset-[var(--ui-surface)]', toneClass(c), c === color && 'ring-2 ring-[var(--ui-focus)]')}>
                    {c === color && <Check className="h-5 w-5 text-white" aria-hidden />}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Card title="Metas do grupo" description="Valem para todo mundo do grupo. Cada meta vira cotas semanais.">
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Comece por um modelo ou crie do zero:</p>
            ) : (
              <ul className="mb-4 flex flex-col gap-2">
                {goals.map((g, i) => {
                  const p = goalPreview(g);
                  return (
                    <li key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <span className="text-2xl" aria-hidden>
                        {g.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.text} · {formatCents(g.stakeCents)}/cota · <strong>{formatCents(p.commitment)}/semana</strong>
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Editar ${g.name}`} onClick={() => setEditing({ index: i, goal: g })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remover ${g.name}`} onClick={() => setGoals(goals.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {GOAL_TEMPLATES.filter((t) => !goals.some((g) => g.name === t.name)).map(({ label, ...t }) => (
                <button key={label} type="button" onClick={() => setEditing({ index: null, goal: t })} className="touch-target inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent">
                  {t.emoji} {label}
                </button>
              ))}
              <button type="button" onClick={() => setEditing({ index: null, goal: emptyGoal() })} className="touch-target inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-solid px-3.5 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">
                <Plus className="h-4 w-4" aria-hidden /> Meta personalizada
              </button>
            </div>
          </Card>
          {goals.length > 0 && (
            <div className="rounded-xl bg-[linear-gradient(135deg,#6d3bff,#a47bff)] p-5 text-white">
              <p className="text-sm text-white/85">Cada pessoa começa a semana com</p>
              <p className="text-3xl font-extrabold tabular-nums">−{formatCents(commitment)}</p>
              <p className="mt-1 text-sm text-white/85">Cumpriu tudo? Fecha no zero. O que faltar vai para o caixa do grupo.</p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <Card title="Para onde vai o dinheiro?" description="O Tenace só registra quem deve quanto — o pagamento é feito por PIX, fora do app.">
          <div className="flex flex-col gap-4">
            <Field label="Destino" htmlFor="d-label" hint="Ex.: Caixinha do churrasco, Doação para o abrigo, Conta da Ana">
              <Input id="d-label" maxLength={60} value={dest.label} onChange={(e) => setDest({ ...dest, label: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label="Tipo de chave PIX" htmlFor="d-type">
                <Select id="d-type" value={dest.pixKeyType} onChange={(e) => setDest({ ...dest, pixKeyType: e.target.value as PixKeyType })}>
                  {PIX_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Chave PIX (opcional)" htmlFor="d-key">
                <Input id="d-key" maxLength={100} value={dest.pixKey} onChange={(e) => setDest({ ...dest, pixKey: e.target.value })} />
              </Field>
              <Field label="Nome do recebedor" htmlFor="d-holder">
                <Input id="d-holder" maxLength={60} value={dest.holderName} onChange={(e) => setDest({ ...dest, holderName: e.target.value })} />
              </Field>
              <Field label="Cidade" htmlFor="d-city" hint="Aparece no QR do PIX">
                <Input id="d-city" maxLength={40} value={dest.city} onChange={(e) => setDest({ ...dest, city: e.target.value })} />
              </Field>
            </div>
            <Field label="Outros dados (opcional)" htmlFor="d-bank">
              <Textarea id="d-bank" maxLength={300} rows={2} className="min-h-16" placeholder="Banco, agência, conta…" value={dest.bankInfo} onChange={(e) => setDest({ ...dest, bankInfo: e.target.value })} />
            </Field>
          </div>
        </Card>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <Card title="Quando começa?">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { v: 'next', title: `Segunda, ${fmtDay(nextMonday)}`, sub: 'Recomendado: dá tempo de convidar todo mundo.' },
                  { v: 'now', title: 'Já nesta semana', sub: 'Metas diárias contam a partir de hoje. Quem entrar depois começa na próxima segunda.' },
                ] as const
              ).map((o) => (
                <button key={o.v} type="button" aria-pressed={startMode === o.v} onClick={() => setStartMode(o.v)} className={cx('rounded-lg border p-4 text-left', startMode === o.v ? 'border-brand-solid bg-brand-soft' : 'border-border bg-card hover:bg-accent')}>
                  <p className="font-bold">{o.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{o.sub}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Resumo">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Grupo</dt>
                <dd className="font-semibold">
                  {emoji} {name}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Destino do dinheiro</dt>
                <dd className="font-semibold">{dest.label}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Metas</dt>
                <dd className="font-semibold">{goals.map((g) => `${g.emoji} ${g.name}`).join(' · ')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Compromisso semanal por pessoa</dt>
                <dd className="text-lg font-extrabold tabular-nums">{formatCents(commitment)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        {step < STEPS.length - 1 ? (
          <Button size="lg" onClick={next} className="w-full sm:w-auto">
            Continuar
          </Button>
        ) : (
          <Button size="lg" onClick={create} loading={saving} className="w-full sm:w-auto">
            Criar grupo 🚀
          </Button>
        )}
      </div>

      <GoalDialog
        state={editing}
        onClose={() => setEditing(null)}
        onSave={(g) => {
          if (!editing) return;
          setGoals(editing.index === null ? [...goals, g] : goals.map((x, i) => (i === editing.index ? g : x)));
          setEditing(null);
        }}
      />
    </div>
  );
}

function GoalDialog({ state, onClose, onSave }: { state: { index: number | null; goal: GoalInput } | null; onClose: () => void; onSave: (g: GoalInput) => void }) {
  const [goal, setGoal] = useState<GoalInput | null>(null);
  const [err, setErr] = useState('');
  const current = goal ?? state?.goal ?? null;
  return (
    <Dialog
      open={!!state}
      onClose={() => {
        setGoal(null);
        setErr('');
        onClose();
      }}
      title={state?.index === null ? 'Nova meta' : 'Editar meta'}
      footer={
        <Button
          onClick={() => {
            if (!current) return;
            const p = goalInputProblem(current);
            if (p) return setErr(p);
            onSave(current);
            setGoal(null);
            setErr('');
          }}
        >
          Salvar meta
        </Button>
      }
    >
      {err && (
        <div className="mb-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      {current && <GoalFields value={current} onChange={setGoal} idPrefix="new-goal" />}
    </Dialog>
  );
}
