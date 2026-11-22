'use client';
import { KeyRound, Link2, Search, ShieldCheck, Wand2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AdminPlans } from '@/components/app/admin-plans';
import { useApp } from '@/components/app/session';
import { Avatar, Badge, Button, Card, CopyButton, Dialog, ErrorState, Field, Input, Notice, PageHeader, Segmented, Spinner, Stat, Switch, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/use-api';

type Tab = 'usuarios' | 'planos' | 'integracoes' | 'sistema';

export default function AdminPage() {
  return (
    <Suspense>
      <Admin />
    </Suspense>
  );
}

function Admin() {
  const { user } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get('tab') as Tab) || 'usuarios';
  if (user.role !== 'platform_admin') return <Notice tone="warning">Área restrita à administração da plataforma.</Notice>;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Administração" description="Usuários, planos, integrações e saúde da plataforma." />
      <Segmented
        label="Seções"
        value={tab}
        onChange={(t) => router.replace(`/admin${t === 'usuarios' ? '' : `?tab=${t}`}`, { scroll: false })}
        options={[
          { value: 'usuarios', label: 'Usuários' },
          { value: 'planos', label: 'Planos' },
          { value: 'integracoes', label: 'Integrações' },
          { value: 'sistema', label: 'Sistema' },
        ]}
      />
      {tab === 'usuarios' && <Users />}
      {tab === 'planos' && <AdminPlans />}
      {tab === 'integracoes' && <Integrations />}
      {tab === 'sistema' && <System />}
    </div>
  );
}

// ------------------------------------------------------------------ users
interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'platform_admin';
  active: boolean;
  avatarColor: string;
  groups: number;
  createdAt: string;
  lastLoginAt: string | null;
}

function Users() {
  const { user: me } = useApp();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, reload } = useApi<{ users: AdminUser[] }>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const [pwFor, setPwFor] = useState<AdminUser | null>(null);
  const [link, setLink] = useState<{ user: AdminUser; url: string } | null>(null);

  async function patch(u: AdminUser, body: Partial<Pick<AdminUser, 'active' | 'role'>>, ok: string) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      toast(ok);
      void reload();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  async function resetLink(u: AdminUser) {
    try {
      const r = await api<{ url: string }>(`/admin/users/${u.id}/reset-link`, { method: 'POST' });
      setLink({ user: u, url: r.url });
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <Input aria-label="Buscar usuário" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="outline">
          <Search className="h-4 w-4" aria-hidden /> Buscar
        </Button>
      </form>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : (
        <Card padded={false} title={`${data.users.length} ${data.users.length === 1 ? 'usuário' : 'usuários'}`} description="Sem e-mail configurado, defina a senha aqui ou gere um link de redefinição para mandar pelo WhatsApp.">
          <ul className="divide-y divide-border">
            {data.users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={u.name} color={u.avatarColor} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {u.name} {u.role === 'platform_admin' && <Badge tone="brand">admin</Badge>} {!u.active && <Badge tone="danger">bloqueado</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · {u.groups} {u.groups === 1 ? 'grupo' : 'grupos'} · {u.lastLoginAt ? `último acesso ${timeAgo(u.lastLoginAt)}` : 'nunca entrou'}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-1.5 pl-12 xl:w-auto xl:pl-0">
                  <Button size="sm" variant="soft" onClick={() => setPwFor(u)}>
                    <KeyRound className="h-4 w-4" aria-hidden /> Definir senha
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => resetLink(u)}>
                    <Link2 className="h-4 w-4" aria-hidden /> Link
                  </Button>
                  {u.id !== me.id && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => patch(u, { role: u.role === 'platform_admin' ? 'user' : 'platform_admin' }, 'Papel atualizado')}>
                        <ShieldCheck className="h-4 w-4" aria-hidden /> {u.role === 'platform_admin' ? 'Tirar admin' : 'Tornar admin'}
                      </Button>
                      <Button size="sm" variant="ghost" className={u.active ? 'text-danger' : ''} onClick={() => (u.active ? confirm(`Bloquear ${u.name}? As sessões abertas terminam na hora.`) && patch(u, { active: false }, 'Usuário bloqueado') : patch(u, { active: true }, 'Usuário desbloqueado'))}>
                        {u.active ? 'Bloquear' : 'Desbloquear'}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <PasswordDialog user={pwFor} onClose={() => setPwFor(null)} />
      <Dialog open={!!link} onClose={() => setLink(null)} title="Link de redefinição" description={link ? `Mande para ${link.user.name}. Vale 24 horas e só pode ser usado uma vez.` : undefined}>
        {link && (
          <div className="flex gap-2">
            <Input readOnly value={link.url} aria-label="Link" className="text-xs" onFocus={(e) => e.target.select()} />
            <CopyButton text={link.url} />
          </div>
        )}
      </Dialog>
    </div>
  );
}

function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const a = crypto.getRandomValues(new Uint32Array(12));
  const base = Array.from(a.slice(0, 9), (n) => chars[n % chars.length]).join('');
  return base + Array.from(a.slice(9), (n) => digits[n % digits.length]).join('');
}

function PasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const close = () => {
    setPw('');
    setErr('');
    onClose();
  };
  async function save() {
    if (!user) return;
    setSaving(true);
    setErr('');
    try {
      await api(`/admin/users/${user.id}/password`, { method: 'POST', body: { password: pw } });
      toast(`Senha de ${user.name.split(' ')[0]} definida`);
      close();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={!!user} onClose={close} title={`Definir senha${user ? ` de ${user.name}` : ''}`} description="As sessões abertas dessa pessoa terminam. Passe a senha por um canal seguro e peça para ela trocar no Perfil." footer={<Button onClick={save} loading={saving} disabled={!pw}>Salvar senha</Button>}>
      <div className="flex flex-col gap-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Nova senha" htmlFor="adm-pw" hint="Mínimo 8 caracteres, com letras e números">
          <div className="flex gap-2">
            <Input id="adm-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" className="font-mono" />
            <Button type="button" variant="outline" onClick={() => setPw(randomPassword())} aria-label="Gerar senha">
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        {pw && <CopyButton text={pw} label="Copiar senha" className="self-start" />}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ integrations
interface IntegrationView {
  key: 'resend' | 'calebepay';
  enabled: boolean;
  config: Record<string, string>;
  secrets: Record<string, { set: boolean; hint: string }>;
  updatedAt: string | null;
}

function Integrations() {
  const { data, error, reload } = useApi<{ items: IntegrationView[]; webhookUrl: string; mailChannel: string }>('/admin/integrations');
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const resend = data.items.find((i) => i.key === 'resend')!;
  const cp = data.items.find((i) => i.key === 'calebepay')!;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <IntegrationCard
        item={resend}
        title="E-mail · Resend"
        description="Convites, redefinição de senha e avisos por e-mail. Sem ele, os e-mails só ficam no log e as senhas são definidas aqui no admin."
        status={data.mailChannel === 'resend' ? 'Enviando pelo Resend' : data.mailChannel === 'smtp' ? 'Usando SMTP do servidor' : 'Sem envio (só log)'}
        fields={[
          { key: 'fromEmail', label: 'E-mail remetente', placeholder: 'nao-responda@amancio.family', hint: 'O domínio precisa estar verificado no Resend.' },
          { key: 'fromName', label: 'Nome do remetente', placeholder: 'Tenace' },
          { key: 'replyTo', label: 'Responder para (opcional)', placeholder: 'contato@…' },
        ]}
        secretFields={[{ key: 'apiKey', label: 'Chave de API do Resend', placeholder: 're_…' }]}
        test="email"
        onSaved={reload}
      />
      <IntegrationCard
        item={cp}
        title="Pagamentos · Calebe Pay"
        description="Cobra as assinaturas dos planos (Pix ou boleto todo mês; cartão e atrasos pelo checkout). Sem ela, só o plano grátis fica disponível."
        status={cp.enabled && cp.secrets.apiKey?.set ? (cp.secrets.apiKey.hint.startsWith('cp_test_') ? 'Conectado · modo teste' : 'Conectado · produção') : 'Não conectado'}
        fields={[
          { key: 'apiUrl', label: 'URL da API', placeholder: 'https://api.calebepay.com.br' },
          {
            key: 'costCenterId',
            label: 'Centro de custo',
            hint: 'Todas as cobranças do Tenace (assinaturas e pagamentos de mensalidade) entram neste centro de custo da Calebe Pay.',
            render: (value, onChange) => <CostCenterPicker value={value} onChange={onChange} />,
          },
        ]}
        secretFields={[
          { key: 'apiKey', label: 'Chave de API', placeholder: 'cp_test_… ou cp_live_…', hint: 'Escopos: transactions:read, pix:write, boleto:write e credit_card:write (cartão no checkout).' },
          { key: 'webhookSecret', label: 'Segredo de assinatura do webhook', placeholder: 'whsec_…' },
        ]}
        test="ping"
        extra={
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">URL do webhook (cadastre no painel do Calebe Pay)</p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={data.webhookUrl} aria-label="URL do webhook" className="text-xs" onFocus={(e) => e.target.select()} />
              <CopyButton text={data.webhookUrl} />
            </div>
          </div>
        }
        onSaved={reload}
      />
    </div>
  );
}

function IntegrationCard({
  item,
  title,
  description,
  status,
  fields,
  secretFields,
  test,
  extra,
  onSaved,
}: {
  item: IntegrationView;
  title: string;
  description: string;
  status: string;
  fields: { key: string; label: string; placeholder?: string; hint?: string; render?: (value: string, onChange: (v: string) => void) => React.ReactNode }[];
  secretFields: { key: string; label: string; placeholder?: string; hint?: string }[];
  test: 'email' | 'ping';
  extra?: React.ReactNode;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(item.enabled);
  const [config, setConfig] = useState<Record<string, string>>(item.config);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [err, setErr] = useState('');

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const body = { enabled, config, secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== '')) };
      await api(`/admin/integrations/${item.key}`, { method: 'PUT', body });
      setSecrets({});
      toast('Integração salva');
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function clearSecret(k: string) {
    if (!confirm('Apagar este segredo?')) return;
    try {
      await api(`/admin/integrations/${item.key}`, { method: 'PUT', body: { enabled, config, secrets: { [k]: '' } } });
      toast('Segredo apagado');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }
  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await api<{ ok: boolean; message: string }>(`/admin/integrations/${item.key}/test`, { method: 'POST', body: test === 'email' ? { to } : {} }));
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card title={title} description={description} actions={<Badge tone={status.startsWith('Conectado') || status.startsWith('Enviando') ? 'success' : 'neutral'}>{status}</Badge>}>
      <div className="flex flex-col gap-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Switch checked={enabled} onChange={setEnabled} label="Ativa" description="Desligada, a integração não é usada mesmo com as chaves salvas." />
        {fields.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`${item.key}-${f.key}`} hint={f.hint}>
            {f.render ? (
              f.render(config[f.key] ?? '', (v) => setConfig({ ...config, [f.key]: v }))
            ) : (
              <Input id={`${item.key}-${f.key}`} placeholder={f.placeholder} value={config[f.key] ?? ''} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} />
            )}
          </Field>
        ))}
        {secretFields.map((f) => {
          const cur = item.secrets[f.key];
          return (
            <Field key={f.key} label={f.label} htmlFor={`${item.key}-${f.key}`} hint={cur?.set ? `Salvo: ${cur.hint}. Deixe em branco para manter.` : f.hint}>
              <div className="flex gap-2">
                <Input id={`${item.key}-${f.key}`} type="password" autoComplete="off" placeholder={cur?.set ? '••••••••' : f.placeholder} value={secrets[f.key] ?? ''} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} />
                {cur?.set && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => clearSecret(f.key)}>
                    Apagar
                  </Button>
                )}
              </div>
            </Field>
          );
        })}
        {extra}
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <Button onClick={save} loading={saving}>
            Salvar
          </Button>
          {test === 'email' && <Input type="email" aria-label="Enviar teste para" placeholder="enviar teste para…" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto min-w-0 flex-1" />}
          <Button variant="outline" onClick={runTest} loading={testing} disabled={test === 'email' && !to.includes('@')}>
            {test === 'email' ? 'Enviar teste' : 'Testar conexão'}
          </Button>
        </div>
        {result && <Notice tone={result.ok ? 'success' : 'danger'}>{result.message}</Notice>}
        {item.updatedAt && <p className="text-xs text-muted-foreground">Atualizado em {fmtDateTime(item.updatedAt)}</p>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ system
function System() {
  const { data, error, reload } = useApi<{
    users: number;
    groups: number;
    openWeeks: number;
    mailChannel: string;
    webhookUrl: string;
    build: string;
    recentWebhooks: { id: string; type: string; livemode: boolean; receivedAt: string; processedAt: string | null; error: string | null }[];
  }>('/admin/overview');
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuários" value={data.users} />
        <Stat label="Grupos ativos" value={data.groups} />
        <Stat label="Semanas abertas" value={data.openWeeks} />
        <Stat label="E-mail" value={data.mailChannel === 'resend' ? 'Resend' : data.mailChannel === 'smtp' ? 'SMTP' : 'Só log'} />
      </div>
      <Card title="Últimos webhooks do Calebe Pay" padded={false}>
        {data.recentWebhooks.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhum evento recebido ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recentWebhooks.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="font-mono text-xs">{w.type}</span>
                <Badge tone={w.livemode ? 'spark' : 'neutral'}>{w.livemode ? 'produção' : 'teste'}</Badge>
                <span className="flex-1 text-xs text-muted-foreground">{fmtDateTime(w.receivedAt)}</span>
                <Badge tone={w.error ? 'danger' : w.processedAt ? 'success' : 'warning'}>{w.error ? 'erro' : w.processedAt ? 'processado' : 'pendente'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Build {data.build.slice(0, 12)}</p>
    </div>
  );
}

/** Cost centers come from Calebe Pay (GET /v1/cost-centers with the saved key); a typed id also works. */
function CostCenterPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  async function load() {
    setLoading(true);
    setErr('');
    try {
      setList((await api<{ costCenters: { id: string; name: string }[] }>('/admin/integrations/calebepay/cost-centers')).costCenters);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {list ? (
          <select
            id="calebepay-costCenterId"
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Nenhum (sem classificação)</option>
            {!list.some((c) => c.id === value) && value && <option value={value}>{value}</option>}
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.id}
              </option>
            ))}
          </select>
        ) : (
          <Input id="calebepay-costCenterId" placeholder="cc_…" value={value} onChange={(e) => onChange(e.target.value.trim())} />
        )}
        <Button type="button" variant="outline" onClick={load} loading={loading}>
          {list ? 'Atualizar' : 'Buscar na Calebe'}
        </Button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      {list && list.length === 0 && <p className="text-xs text-muted-foreground">Nenhum centro de custo ativo nesta conta.</p>}
    </div>
  );
}
