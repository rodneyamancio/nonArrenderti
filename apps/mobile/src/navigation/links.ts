// Portal links (notifications, shared invite URLs) → app routes. Unknown links open nothing.
import type { AccountTab, GroupSection } from './sections';

export type AppRoute =
  | { pathname: '/g/[groupId]'; params: { groupId: string; s?: GroupSection; tab?: AccountTab } }
  | { pathname: '/g/[groupId]/pagar'; params: { groupId: string } }
  | { pathname: '/convite/[token]'; params: { token: string } }
  | { pathname: '/inicio' | '/grupos' | '/avisos' | '/perfil' };

const SECTIONS: Record<string, GroupSection> = { feed: 'feed', metas: 'metas', conta: 'conta', membros: 'membros', ajustes: 'ajustes' };
const ACCOUNT: Record<string, AccountTab> = { minha: 'minha', caixa: 'caixa', pagamentos: 'pagamentos' };
const TOP: Record<string, AppRoute> = {
  '/inicio': { pathname: '/inicio' },
  '/grupos': { pathname: '/grupos' },
  '/notificacoes': { pathname: '/avisos' },
  '/perfil': { pathname: '/perfil' },
};

export function routeForLink(link: string | null | undefined): AppRoute | null {
  if (!link) return null;
  let path = link.trim();
  let query = '';
  try {
    if (/^https?:\/\//.test(path)) {
      const u = new URL(path);
      path = u.pathname;
      query = u.search;
    } else if (path.includes('?')) {
      [path, query] = [path.slice(0, path.indexOf('?')), path.slice(path.indexOf('?'))];
    }
  } catch {
    return null;
  }
  path = path.replace(/\/+$/, '') || '/';
  const top = TOP[path];
  if (top) return top;

  const invite = /^\/convite\/([A-Za-z0-9_-]+)$/.exec(path);
  if (invite) return { pathname: '/convite/[token]', params: { token: invite[1]! } };

  const g = /^\/g\/([A-Za-z0-9_-]+)(?:\/([a-z]+))?$/.exec(path);
  if (!g) return null;
  const groupId = g[1]!;
  const sub = g[2];
  if (!sub) return { pathname: '/g/[groupId]', params: { groupId } };
  if (sub === 'pagar') return { pathname: '/g/[groupId]/pagar', params: { groupId } };
  const s = SECTIONS[sub];
  if (!s) return null;
  const tab = ACCOUNT[new URLSearchParams(query).get('tab') ?? ''];
  return { pathname: '/g/[groupId]', params: { groupId, s, ...(s === 'conta' && tab ? { tab } : {}) } };
}
