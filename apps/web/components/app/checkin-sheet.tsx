'use client';
import { addDays } from '@tenace/rules';
import type { CheckInResult } from '@tenace/types';
import { Camera, Minus, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, Dialog, Field, Input, Notice, SlotBar, Textarea, toneClass, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx, formatCents, fmtDay, isTimes, unitLabel } from '@/lib/format';
import { uploadPhoto } from '@/lib/image';
import { emitDataChanged, useApp, type CheckInTarget } from './session';

export function CheckInSheet({ target, onClose }: { target: CheckInTarget | null; onClose: () => void }) {
  const { groups } = useApp();
  const toast = useToast();
  const [groupId, setGroupId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [date, setDate] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = target !== null;
  const usable = useMemo(() => (groups ?? []).filter((g) => g.checkinGoals.length > 0), [groups]);
  const group = usable.find((g) => g.group.id === groupId);
  const goal = group?.checkinGoals.find((x) => x.id === goalId);

  // Reset on open with optional preselection.
  useEffect(() => {
    if (!open) return;
    const g = usable.find((x) => x.group.id === target?.groupId) ?? usable[0];
    setGroupId(g?.group.id ?? '');
    setGoalId(target?.goalId && g?.checkinGoals.some((x) => x.id === target.goalId) ? target.goalId : (g?.checkinGoals[0]?.id ?? ''));
    setDate(g?.today ?? '');
    setNote('');
    setPhoto(null);
    setPreview(null);
    setError('');
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!goal) return;
    setQuantity(isTimes(goal.unit) ? 1 : goal.period === 'daily' ? goal.target : Math.max(1, Math.round(goal.target / 3)));
  }, [goal]);

  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !goal) return;
    setSaving(true);
    setError('');
    try {
      const photoUploadId = photo ? await uploadPhoto(group.group.id, photo) : null;
      const r = await api<CheckInResult>(`/groups/${group.group.id}/checkins`, { method: 'POST', body: { goalId: goal.id, date, quantity, note, photoUploadId } });
      setResult(r);
      emitDataChanged();
      if (r.slotDeltaCents > 0) toast(`+${formatCents(r.slotDeltaCents)} · cota paga! 🔥`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const today = group?.today ?? '';
  const yesterday = today ? addDays(today, -1) : '';

  if (open && usable.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Registrar atividade">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="text-4xl">🎯</span>
          <p className="text-sm text-muted-foreground">Você ainda não tem metas para registrar. Crie um grupo ou entre em um com um convite.</p>
          <Link href="/grupos/novo" onClick={onClose} className="font-semibold text-brand">
            Criar um grupo
          </Link>
        </div>
      </Dialog>
    );
  }

  if (result) {
    const wg = result.goal;
    const done = wg && wg.slotsAchieved >= wg.slotsPerWeek;
    return (
      <Dialog open={open} onClose={onClose} title="Registrado!" footer={<Button onClick={onClose} className="w-full sm:w-auto">Fechar</Button>}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className={cx('animate-pop flex h-20 w-20 items-center justify-center rounded-full text-4xl', result.slotDeltaCents > 0 ? 'bg-success-soft' : 'bg-brand-soft')}>
            {done ? '🏆' : result.slotDeltaCents > 0 ? '🔥' : result.checkIn.goalEmoji}
          </div>
          {result.slotDeltaCents > 0 ? (
            <p className="text-xl font-extrabold text-success">+{formatCents(result.slotDeltaCents)} · cota paga!</p>
          ) : (
            <p className="text-lg font-bold">{result.counted ? 'Registro salvo' : 'Registro salvo (fora das cotas)'}</p>
          )}
          {wg && (
            <div className="w-full max-w-xs">
              <SlotBar slots={wg.slotsPerWeek} achieved={wg.slotsAchieved} />
              <p className="mt-2 text-sm text-muted-foreground">
                {done
                  ? `${wg.emoji} ${wg.name}: meta da semana cumprida! Non arrenderti 💜`
                  : wg.toNext != null
                    ? `${wg.toNext === 1 ? 'Falta' : 'Faltam'} ${wg.toNext} ${unitLabel(wg.unit, wg.toNext)} para a próxima cota${wg.period === 'daily' ? ' hoje' : ''}.`
                    : `${wg.slotsAchieved} de ${wg.slotsPerWeek} cotas nesta semana.`}
              </p>
            </div>
          )}
          {!result.counted && <p className="text-sm text-muted-foreground">Suas metas começam a contar na semana em que você passa a ser cobrado. O registro aparece no feed do grupo.</p>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar atividade"
      description="Cada registro paga sua cota. Bora!"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="checkin-form" loading={saving} disabled={!goal} size="lg" className="sm:min-w-40">
            Registrar
          </Button>
        </>
      }
    >
      <form id="checkin-form" onSubmit={submit} className="flex flex-col gap-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {usable.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Grupo</legend>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {usable.map((g) => (
                <Chip
                  key={g.group.id}
                  active={g.group.id === groupId}
                  onClick={() => {
                    setGroupId(g.group.id);
                    setGoalId(g.checkinGoals[0]?.id ?? '');
                    setDate(g.today);
                  }}
                >
                  <span className={cx('tone-bg flex h-5 w-5 items-center justify-center rounded text-[0.7rem]', toneClass(g.group.color))}>{g.group.emoji}</span>
                  {g.group.name}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">O que você fez?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group?.checkinGoals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoalId(g.id)}
                aria-pressed={g.id === goalId}
                className={cx(
                  'touch-target flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                  g.id === goalId ? 'border-brand-solid bg-brand-soft' : 'border-border bg-card hover:bg-accent',
                )}
              >
                <span className="text-2xl" aria-hidden>
                  {g.emoji}
                </span>
                <span className="text-sm leading-tight font-semibold">{g.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {goal && !isTimes(goal.unit) && (
          <Field label={`Quantidade (${goal.unit})`} htmlFor="ci-qty">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Menos" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input id="ci-qty" inputMode="numeric" className="w-28 text-center text-lg font-bold tabular-nums" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(10000, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
              <Button type="button" variant="outline" size="icon" aria-label="Mais" onClick={() => setQuantity((q) => Math.min(10000, q + 1))}>
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                meta: {goal.target} {goal.unit}/{goal.period === 'daily' ? 'dia' : 'semana'}
              </span>
            </div>
          </Field>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Quando?</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={date === today} onClick={() => setDate(today)}>
              Hoje
            </Chip>
            <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>
              Ontem
            </Chip>
            <Input type="date" aria-label="Outra data" value={date} max={today} min={addDays(today || '2000-01-01', -8)} onChange={(e) => setDate(e.target.value)} className="w-auto" />
          </div>
          {date && date !== today && date !== yesterday && <p className="mt-1 text-xs text-muted-foreground">{fmtDay(date)}</p>}
        </fieldset>

        <Field label="Comentário (opcional)" htmlFor="ci-note">
          <Textarea id="ci-note" maxLength={500} rows={2} className="min-h-16" placeholder="Ex.: treino de perna, capítulo 3…" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} aria-label="Foto" />
          {preview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Prévia da foto" className="h-28 w-28 rounded-lg object-cover" />
              <button type="button" onClick={() => setPhoto(null)} className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-card shadow-md" aria-label="Remover foto">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" aria-hidden /> Adicionar foto (opcional)
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
