// Parity with the portal: the app must show the same tokens, labels, formats and goal rules.
// Reads the portal files (apps/web) as text or imports its pure modules, and fails on drift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as webFormat from '../../web/lib/format.ts';
import * as appFormat from '@/lib/format';
import { dark, light, TONES } from '@/ui/theme';
import { ACCOUNT_TABS, groupSections, MAIN_TABS } from '@/navigation/sections';

const web = (p) => readFileSync(new URL(`../../web/${p}`, import.meta.url), 'utf8');
const app = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const camel = (s) => s.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `selector ${selector} not found`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--ui-([a-z-]+):\s*([^;]+);/g)].map(([, k, v]) => [camel(k), v.trim()]));
}

test('color tokens match apps/web/app/globals.css (light and dark)', () => {
  const css = web('app/globals.css');
  const cssLight = cssBlock(css, ':root');
  const cssDark = cssBlock(css, ":root[data-theme='dark']");
  for (const [k, v] of Object.entries(light)) assert.equal(v.toLowerCase(), cssLight[k]?.toLowerCase(), `light ${k}`);
  for (const [k, v] of Object.entries(dark)) assert.equal(v.toLowerCase(), cssDark[k]?.toLowerCase(), `dark ${k}`);
});

test('group tones match the portal', () => {
  const css = web('app/globals.css');
  for (const [name, [a, b]] of Object.entries(TONES)) {
    const m = new RegExp(`\\.tone-${name} \\{ --tone-a: (#[0-9a-f]+); --tone-b: (#[0-9a-f]+); \\}`).exec(css);
    assert.ok(m, `tone ${name} in globals.css`);
    assert.deepEqual([a, b], [m[1], m[2]], `tone ${name}`);
  }
});

test('display formats give the same output as the portal', () => {
  const iso = '2026-11-20T15:04:00.000Z';
  for (const d of ['2026-11-16', '2026-01-01', '2026-12-31']) {
    assert.equal(appFormat.fmtDay(d), webFormat.fmtDay(d));
    assert.equal(appFormat.fmtWeekday(d), webFormat.fmtWeekday(d));
  }
  assert.equal(appFormat.fmtRange('2026-11-16', '2026-11-22'), webFormat.fmtRange('2026-11-16', '2026-11-22'));
  assert.equal(appFormat.fmtRange('2026-11-30', '2026-12-06'), webFormat.fmtRange('2026-11-30', '2026-12-06'));
  assert.equal(appFormat.fmtDateTime(iso), webFormat.fmtDateTime(iso));
  assert.equal(appFormat.formatCents(-123456), webFormat.formatCents(-123456));
  for (const [u, n] of [['times', 1], ['times', 3], ['páginas', 10]]) assert.equal(appFormat.unitLabel(u, n), webFormat.unitLabel(u, n));
  assert.equal(appFormat.initials('Ana Maria Souza'), webFormat.initials('Ana Maria Souza'));
  assert.deepEqual(appFormat.ENTRY_LABELS, webFormat.ENTRY_LABELS);
});

test('main tabs and group sections exist in the portal menus', () => {
  const shell = web('components/app/shell.tsx');
  for (const t of MAIN_TABS) assert.match(shell, new RegExp(`label: '${t.label}'`), `tab ${t.label}`);
  const layout = web('app/(app)/g/[groupId]/layout.tsx');
  const all = groupSections({ me: { role: 'owner', permissions: ['group:settings:update'] }, openContests: 0, pendingPayments: 0, pendingJoinRequests: 0 });
  assert.equal(all.length, 6);
  for (const s of all) assert.match(layout, new RegExp(`label: '${s.label}'`), `section ${s.label}`);
  const member = groupSections({ me: { role: 'member', permissions: [] }, openContests: 2, pendingPayments: 5, pendingJoinRequests: 1 });
  assert.ok(!member.some((s) => s.key === 'ajustes'), 'members do not see Ajustes');
  assert.equal(member.find((s) => s.key === 'conta').badge, 0, 'payment badge only for admins');
  const conta = web('app/(app)/g/[groupId]/conta/page.tsx');
  for (const t of ACCOUNT_TABS) assert.ok(conta.includes(`label: '${t.label}'`) || conta.includes(`label: \`${t.label}`), `account tab ${t.label}`);
});

test('goal templates, units and validation are the same code as the portal', () => {
  const block = (src, start, end) => {
    const i = src.indexOf(start);
    assert.ok(i >= 0, `missing ${start}`);
    return src.slice(i, src.indexOf(end, i) + end.length).replace(/^export /gm, '').replace(/\s+/g, ' ');
  };
  const w = web('components/app/goal-form.tsx');
  const a = app('src/features/goals/logic.ts');
  for (const [start, end] of [
    ['export const GOAL_TEMPLATES', '];'],
    ['const UNITS', '];'],
    ['const EMOJIS', '];'],
    ['export const emptyGoal', '});'],
    ['function slotsHint', '\n}'],
    ['export function goalInputProblem', '\n}'],
  ]) {
    const key = start.replace(/^export /, '');
    assert.equal(block(a, a.includes(start) ? start : `export ${start}`, end), block(w, start, end), key);
  }
});

test('PIX key types and time zones match the portal', () => {
  const strip = (s) => s.replace(/^\/\/.*\n/gm, '').trim();
  assert.equal(strip(app('src/lib/constants.ts')), strip(web('lib/constants.ts')));
});
