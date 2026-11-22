# Tenace — Execution order

> Each phase = 1 agent session = 1 PR. Do not move on before "✅ Done when" is green.
> Phases 0–8 and 11–12 were delivered together in v0.1 (2026-11-20), at the owner's request.

## Phase 0 — Repository foundation (`vg-arquitetura-base`) ✅
pnpm workspaces, Turborepo, `packages/config`, `AGENTS.md`/`CLAUDE.md`, `docs/spec.md`.
✅ `pnpm install` clean; `pnpm typecheck` passes.

## Phase 1 — Base packages ✅
`packages/types` (errors, auth, group roles → permissions, DTOs) and `packages/rules`
(dates/weeks per time zone, slots, commitment, PIX BR Code).
✅ `pnpm --filter @tenace/rules test` green (16 tests).

## Phase 2 — Local infra ✅
`compose.yaml` (postgres, redis), `.env.example`, `pnpm setup`, `pnpm infra:up`.

## Phase 3 — Backend base ✅
NestJS in `apps/api`, Zod env, Prisma schema + initial migration, `/health`, `/ready`,
global error filter with stable codes.

## Phase 4 — Isolation by group membership ✅ (replaces multi-tenancy)
`GroupGuard` (404 for non-members), `@NeedGroup(permission)`.
✅ Sacred test: non-member gets 404 on every `/groups/:id/**` route.

## Phase 5 — Auth + group permissions (`vg-auth`, `vg-rbac` adapted) ✅
Sign-up, login (rate limited), logout, password change/reset, opaque sessions (cookie/Bearer).
✅ Integration tests: CSRF, Bearer, member vs admin permissions.

## Phase 7 — Web base (`vg-interface`, `vg-navegacao` simplified) ✅
Tokens light/dark, shell (sidebar desktop, bottom nav + FAB on phones), auth screens.
✅ No horizontal overflow at 375 px; both themes.

## Phase 8 — Domain modules ✅
Groups/members/invites · goals · weeks engine · check-ins/feed/contests · ledgers/payments/PIX ·
notifications. ✅ `pnpm --filter @tenace/api test` green (11 integration tests).

## Phase 8b — Platform admin + integrations ✅
`/admin`: users (manual password, reset link, block, promote), Resend and Calebe Pay with
encrypted credentials, Calebe Pay webhook. ✅ 17 API integration tests.

## Phase 8c — Plans and subscriptions ✅
Plans by the platform admin (free → paid; limits: groups and people per group), Calebe Pay
subscriptions (Pix/boleto) with invoices, card/late payment via checkout, block after 5 days
with paused groups and voided weeks. ✅ 24 API integration tests (6 new, Calebe Pay faked).

## Phase 9 — Observability + audit ⏳
Structured logs (pino), Sentry, audit log for admin actions.

## Phase 10 — Tests ⏳
Playwright E2E of the main journey at 375 px and desktop; CI gate.

## Phase 10b — Mobile app (`vg-mobile`) ✅ (store publishing and push pending)
Expo SDK 58 + expo-router in `apps/mobile`; `packages/api-client` extracted (web uses it too);
tokens kept per app with a parity test instead of `packages/ui`; Bearer sessions in SecureStore;
all member/admin screens of the portal.
✅ App signs up/logs in against the same API (web proxy forwards `Authorization`), passes
pure-logic tests (session, rules, links, parity) and was exercised in the iOS simulator.
⏳ Needs the Expo account: EAS builds (TestFlight / Play internal), OTA, push notifications.

## Phase 11 — CI (`vg-deploy`) — not wanted for now
The deploy script runs typecheck + tests locally before shipping.

## Phase 12 — Production (`vg-deploy`) ✅
Dockerfiles, `infra/compose/compose.prod.yaml`, host nginx + certbot, `deploy.sh`,
backup before migration. ✅ `https://tenace.amancio.family` with valid TLS.
