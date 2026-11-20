'use client';
import { pixKeyProblem } from '@tenace/rules';
import { BRAND_COLORS, type PixKeyType } from '@tenace/types';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGroup } from '@/components/app/group-context';
import { emitDataChanged } from '@/components/app/session';
import { Button, Card, Field, Input, Notice, Select, Textarea, toneClass, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { PIX_TYPES, TIMEZONES } from '@/lib/constants';
import { cx } from '@/lib/format';

export default function SettingsPage() {
  const { group, can, reload } = useGroup();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name: group.name, emoji: group.emoji, color: group.color, description: group.description, timezone: group.timezone, closeGraceHours: group.closeGraceHours });
  const [dest, setDest] = useState({ ...group.destination, pixKeyType: (group.destination.pixKeyType ?? 'phone') as PixKeyType });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  if (!can('group:settings:update')) return <Notice tone="warning">Só admins podem mudar os ajustes do grupo.</Notice>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (dest.pixKey && pixKeyProblem(dest.pixKeyType, dest.pixKey)) return setErr(pixKeyProblem(dest.pixKeyType, dest.pixKey)!);
    setSaving(true);
    setErr('');
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: { ...form, destination: { ...dest, pixKeyType: dest.pixKey ? dest.pixKeyType : null } } });
      toast('Ajustes salvos');
      await reload();
      emitDataChanged();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!confirm(`Encerrar o grupo "${group.name}"? Ele some para todo mundo. Esta ação não pode ser desfeita pelo app.`)) return;
    try {
      await api(`/groups/${group.id}`, { method: 'DELETE' });
      emitDataChanged();
      router.replace('/inicio');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-5">
      {err && <Notice tone="danger">{err}</Notice>}
      <Card title="Grupo">
        <div className="flex flex-col gap-4">
          <div className="form-grid">
            <Field label="Nome" htmlFor="s-name">
              <Input id="s-name" maxLength={50} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Emoji" htmlFor="s-emoji">
              <Input id="s-emoji" maxLength={8} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            </Field>
          </div>
          <Field label="Descrição" htmlFor="s-desc">
            <Textarea id="s-desc" maxLength={300} rows={2} className="min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Cor</legend>
            <div className="flex flex-wrap gap-2.5">
              {BRAND_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} aria-pressed={c === form.color} onClick={() => setForm({ ...form, color: c })} className={cx('tone-dot flex h-10 w-10 items-center justify-center rounded-full ring-offset-2 ring-offset-[var(--ui-surface)]', toneClass(c), c === form.color && 'ring-2 ring-[var(--ui-focus)]')}>
                  {c === form.color && <Check className="h-5 w-5 text-white" aria-hidden />}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <Field label="Fuso horário" htmlFor="s-tz" hint="Define quando a semana vira (segunda 00:00).">
              <Select id="s-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {(TIMEZONES.some((t) => t.value === form.timezone) ? TIMEZONES : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES]).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tolerância para fechar (horas)" htmlFor="s-grace" hint="Tempo na segunda para registrar o domingo.">
              <Input id="s-grace" inputMode="numeric" value={form.closeGraceHours} onChange={(e) => setForm({ ...form, closeGraceHours: Math.min(48, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Destino do dinheiro" description="Para onde vão as multas. Usado para gerar o PIX na hora de pagar.">
        <div className="flex flex-col gap-4">
          <Field label="Destino" htmlFor="s-dlabel">
            <Input id="s-dlabel" maxLength={60} value={dest.label} onChange={(e) => setDest({ ...dest, label: e.target.value })} />
          </Field>
          <div className="form-grid">
            <Field label="Tipo de chave" htmlFor="s-dtype">
              <Select id="s-dtype" value={dest.pixKeyType} onChange={(e) => setDest({ ...dest, pixKeyType: e.target.value as PixKeyType })}>
                {PIX_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Chave PIX" htmlFor="s-dkey">
              <Input id="s-dkey" maxLength={100} value={dest.pixKey} onChange={(e) => setDest({ ...dest, pixKey: e.target.value })} />
            </Field>
            <Field label="Nome do recebedor" htmlFor="s-dholder">
              <Input id="s-dholder" maxLength={60} value={dest.holderName} onChange={(e) => setDest({ ...dest, holderName: e.target.value })} />
            </Field>
            <Field label="Cidade" htmlFor="s-dcity">
              <Input id="s-dcity" maxLength={40} value={dest.city} onChange={(e) => setDest({ ...dest, city: e.target.value })} />
            </Field>
          </div>
          <Field label="Outros dados" htmlFor="s-dbank">
            <Textarea id="s-dbank" maxLength={300} rows={2} className="min-h-16" value={dest.bankInfo} onChange={(e) => setDest({ ...dest, bankInfo: e.target.value })} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={saving}>
          Salvar ajustes
        </Button>
      </div>

      {can('group:group:delete') && (
        <Card title="Zona de perigo" className="border-danger/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Encerrar o grupo esconde tudo para todos os membros.</p>
            <Button type="button" variant="danger" onClick={archive}>
              Encerrar grupo
            </Button>
          </div>
        </Card>
      )}
    </form>
  );
}
