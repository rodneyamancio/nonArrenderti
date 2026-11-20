# Tenace

Habit-commitment groups: members set weekly goals with a stake per slot, start each week owing
the full commitment and pay it back by doing the activities; what is left goes to the group fund.
Multi-tenant: **no** — a `Group` is a domain object (a user can be in many); isolation is by
group membership (`GroupGuard`), see `docs/spec.md` §5.

This project follows **VGStack** (skills `vg-*`). Load the skill for the piece before touching it:
`vg-arquitetura-base`, `vg-auth`, `vg-rbac`, `vg-interface`, `vg-navegacao`, `vg-segredos`,
`vg-deploy`, `vg-mobile`.

## Reference documents — read ALWAYS before acting

- **`docs/spec.md`** — source of truth (glossary, money rules, permissions). Conflict: the spec wins.
- **`docs/scaffold.md`** — phases with "✅ Done when".
- **`docs/brand/`** — identity (colors, logo, voice).

Implementation diverged from the spec → **update `docs/spec.md` in the same PR**.

## How we work

- One phase of `scaffold.md` = one session = one PR. Never run phases not asked for.
- Plan before code for tasks touching more than ~3 files; wait for approval.
- Ambiguous spec → **ask**, do not invent the decision.
- No opportunistic refactors outside the scope.

## Language

- Talk to Rodney in **Portuguese**.
- Code, names, comments, commits, PRs and technical docs in **English**. UI copy in **pt-BR**.

## Stack (decided — do not replace without asking)

pnpm + Turborepo · Next.js 15 (App Router) + Tailwind v4 · NestJS 11 · Prisma 6 · PostgreSQL 16 ·
Redis (rate limits) · own auth (opaque sessions + Argon2id) · Vitest · host nginx + certbot ·
Expo later (mobile).

## Architecture rules (inviolable)

1. Dependencies only go down: `apps/*` → `packages/*`; `packages/types` depends on nothing.
2. Every group route is nested under `/groups/:groupId` and protected by `GroupGuard`
   (non-member → 404). Never query group data without the `groupId` from the guard.
3. The backend is the source of truth for permissions: `@NeedGroup('module:resource:action')`;
   the front only hides (`can()` from the group context).
4. **Money is integer cents.** Ledgers are immutable: fix mistakes with new entries.
   Member balance = Σ `ledger_entries`; fund = Σ `fund_entries`. Never store derived balances
   as truth.
5. Week math lives in `packages/rules` (pure, tested). Week open/close/recompute live in
   `WeeksService` and must stay idempotent.
6. Goal edits apply from the **next** week (snapshots in `week_goals`).
7. External integrations behind a service (`MailService`, `StorageService`).
8. No hard-coded environment; env validated by Zod.

## Domain naming

`Group` (grupo) · `Member` (membro) · `Goal` (meta) · `Slot` (cota) · `Stake` (valor da cota) ·
`Week` (semana) · `Commitment` (compromisso) · `CheckIn` (registro) · `Penalty` (multa) ·
`Fund` (caixa do grupo) · `Destination` (destino do dinheiro) · `Payment` (pagamento) ·
`Contest` (contestação). See the glossary in the spec.

## Conventions

TypeScript strict, no `any` in app code · Zod at every edge · typed errors with stable codes ·
UTC instants, local dates as `YYYY-MM-DD` in the group time zone · kebab-case files ·
versioned migrations (never edit one already deployed).

## Git

Conventional Commits with scope (`feat(api): …`) · feature branch → PR · small commits · never
commit secrets (`.env` is ignored).

## Tests

New business rule ⇒ test. The **isolation test** (non-member → 404) is sacred: if it breaks,
stop and warn. Before declaring done: `pnpm typecheck && pnpm test`.

## Commands

```bash
pnpm install && pnpm setup && pnpm infra:up
pnpm db:migrate && pnpm --filter @tenace/api build && pnpm db:seed
pnpm dev            # api :3311, web :3310
pnpm typecheck | pnpm test
DEPLOY_SERVER=root@168.231.88.232 ./infra/scripts/deploy-from-workstation.sh
```

## Reusable improvements

Fixed or improved something other systems also have (login, sessions, deploy…)? Suggest
taking it back to VGStack with the `vg-evoluir-stack` skill.

## Do NOT

Disable typecheck/tests to pass · heavy dependency without asking · abstraction for one case ·
future-phase code · move money without a ledger entry · change folder structure on your own.
