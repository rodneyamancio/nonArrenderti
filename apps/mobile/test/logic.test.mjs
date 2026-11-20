import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyGoal, goalBody, goalInputProblem, goalPreview, slotsHint } from '@/features/goals/logic';
import { routeForLink } from '@/navigation/links';
import { createSerializer } from '@/lib/queue';
import { safeNext } from '@/features/auth/next';

test('goal validation blocks what the API would refuse', () => {
  const g = { ...emptyGoal(), name: 'Leitura', period: 'weekly', target: 30, unit: 'páginas', slotsPerWeek: 3, stakeCents: 500 };
  assert.equal(goalInputProblem(g), null);
  assert.equal(goalInputProblem({ ...g, name: 'L' }), 'Dê um nome para a meta');
  assert.equal(goalInputProblem({ ...g, slotsPerWeek: 0 }), 'Diga em quantas cotas dividir a meta');
  assert.equal(goalInputProblem({ ...g, slotsPerWeek: 31 }), 'No máximo 30 cotas para esta meta');
  assert.equal(goalInputProblem({ ...g, period: 'daily', activeWeekdays: [] }), 'Escolha pelo menos um dia');
  assert.equal(slotsHint(g), 'Cada 10 páginas paga uma cota.');
  assert.equal(goalPreview(g).commitment, 1500);
  assert.deepEqual(goalBody({ ...g, activeWeekdays: [1] }).activeWeekdays, [1, 2, 3, 4, 5, 6, 7]);
});

test('notification links open the right screen; unknown links open nothing', () => {
  assert.deepEqual(routeForLink('/g/abc'), { pathname: '/g/[groupId]', params: { groupId: 'abc' } });
  assert.deepEqual(routeForLink('/g/abc/feed'), { pathname: '/g/[groupId]', params: { groupId: 'abc', s: 'feed' } });
  assert.deepEqual(routeForLink('/g/abc/conta?tab=pagamentos'), { pathname: '/g/[groupId]', params: { groupId: 'abc', s: 'conta', tab: 'pagamentos' } });
  assert.deepEqual(routeForLink('/g/abc/membros'), { pathname: '/g/[groupId]', params: { groupId: 'abc', s: 'membros' } });
  assert.deepEqual(routeForLink('/g/abc/pagar'), { pathname: '/g/[groupId]/pagar', params: { groupId: 'abc' } });
  assert.deepEqual(routeForLink('https://tenace.amancio.family/convite/tok_123-abc'), { pathname: '/convite/[token]', params: { token: 'tok_123-abc' } });
  assert.deepEqual(routeForLink('/notificacoes'), { pathname: '/avisos' });
  assert.equal(routeForLink('/admin'), null);
  assert.equal(routeForLink('/g/abc/../../etc'), null);
  assert.equal(routeForLink(null), null);
});

test('storage writes run in order even when one fails', async () => {
  const serialized = createSerializer();
  const log = [];
  const slow = serialized(async () => {
    await new Promise((r) => setTimeout(r, 20));
    log.push('logout');
    throw new Error('x');
  });
  const fast = serialized(async () => log.push('login'));
  await assert.rejects(slow);
  await fast;
  assert.deepEqual(log, ['logout', 'login']);
});

test('after login only app-relative destinations are followed', () => {
  assert.equal(safeNext('/convite/abc'), '/convite/abc');
  assert.equal(safeNext('//evil.com'), '/inicio');
  assert.equal(safeNext('https://evil.com'), '/inicio');
  assert.equal(safeNext(undefined), '/inicio');
});
