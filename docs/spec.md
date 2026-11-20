# Tenace — Technical Specification (spec.md)

> Source of truth for the architecture. Implementation diverged → update this file
> in the same PR. An outdated spec is a bug.
>
> Status: **v0.1 implemented** (2026-11-20) — web + API in production at https://tenace.amancio.family.

## 1. Overview

**Tenace** (Italian for "tenacious"; tagline *non arrenderti* — "don't give up") is a
habit-commitment platform for small circles of people. Someone creates a **group**, picks
who takes part, and the group defines **goals** (e.g. "read 10 pages a day", "gym 3× a
week"), each with a **stake** per slot (e.g. R$ 5).

Every week starts with each member owing their full **commitment** (slots × stake, e.g.
−R$ 30). Each time they do the activity, they "pay back" a slot. Meet every goal and the
week ends at zero. Miss something and what is left becomes a **penalty** owed to the
group's **fund** (a destination account defined by the group: a shared kitty, a charity,
a person…). Each member has a running **account** (statement, balance, payments) and the
group has a fund ledger (receivables, money received, money spent).

Tenace **only tracks money; it never moves it**. Payments happen outside (PIX); the
member declares them and a group admin confirms.

Multi-user: a person can be in many groups. UI language: **pt-BR**. Web first,
responsive down to 375 px, with the API and shared packages ready for an Expo app.

## 2. Glossary

Code names (English) ↔ UI terms (pt-BR). Never mix them.

| Code | UI (pt-BR) | Meaning |
| --- | --- | --- |
| `User` | Usuário / você | A person with an account. Global, not tied to a group. |
| `Group` | Grupo | A named circle with members, goals and a fund. **Not a tenant.** |
| `Member` | Membro | A `User` inside a `Group`, with a group role (`owner`, `admin`, `member`). |
| `Goal` | Meta | An activity with a target per period (daily or weekly), a unit, slots and a stake. |
| `Slot` | Cota | The payable piece of a goal. A goal's week is split into N slots. |
| `Stake` | Valor da cota | Money (cents) a slot is worth. |
| `Week` | Semana | The cycle: Monday 00:00 → Sunday 23:59:59 in the group's time zone. |
| `Commitment` | Compromisso | Sum of a member's slots × stakes for one week; debited at week opening. |
| `CheckIn` | Registro (check-in) | "I did it": goal, date, quantity, optional note and photo. |
| `Penalty` | Multa | What is still negative for a member when the week closes. Owed to the fund. |
| `MemberAccount` | Conta do membro | Per member per group ledger (statement + balance). |
| `Fund` | Caixa do grupo | The group's ledger: receivable, received (cash), spent. |
| `Destination` | Destino do dinheiro | Where penalties are paid: description, holder, PIX key, bank info. |
| `Payment` | Pagamento | Member pays a penalty outside the app; declared → confirmed by admin. |
| `Contest` | Contestação | A member disputes another member's check-in. |
| `Streak` | Sequência | Consecutive weeks a member met every goal (motivation only, no money). |

## 3. Stack

VGStack default (`vg-arquitetura-base`): pnpm + Turborepo · Next.js (App Router) ·
shadcn/ui + Tailwind v4 · NestJS · Prisma · PostgreSQL 16 · Redis + BullMQ · S3/MinIO ·
Expo (later) · own auth (JWT + Argon2id) · pino/Sentry · Vitest/Testcontainers/Playwright.

Deviations:

1. **Not multi-tenant, no RLS** (`vg-multi-tenant` is skipped). Data is scoped by
   `group_id` and access is decided by group membership in the API (see §5). Reason: a
   user belongs to many groups at once and moves between them in one session; a group is
   a domain object, not a customer of the platform.
2. **RBAC by fixed group role**, not tenant-customizable roles. Permission keys keep the
   `module:resource:action` format (`vg-rbac`), but they resolve from the caller's role
   **in the group in the URL**. Custom roles are out of scope.
3. A pure-TypeScript **`packages/rules`** holds all week/slot/ledger math so the API, the
   web (previews) and the future mobile app compute the same numbers.
4. **Auth = opaque session** stored hashed in Postgres with `authVersion` (the `vg-auth`
   "sessão opaca" variant) instead of JWT + rotating refresh: simpler, revocable, and the
   same token works as an httpOnly cookie (web) or `Authorization: Bearer` (Expo).
   Redis is used only for rate limits (login/sign-up/reset fail **closed**).
5. **No BullMQ in v1.** Week open/close runs in an in-process scheduler (60 s tick) guarded
   by a Postgres advisory lock; every job is idempotent. Move to BullMQ when the API runs
   more than one replica or e-mail volume grows.
6. **Photos on a local volume** (`StorageService`, `UPLOAD_DIR`), resized in the browser
   (≤1600 px JPEG) and served only to group members. S3/MinIO can replace it behind the
   same service.
7. **UI kit inside `apps/web/components/ui`** for v1 (no `packages/ui` yet) and no
   `packages/api-client` yet: both are extracted when the Expo app starts (phase 10b).

## 4. Monorepo structure

```
apps/
  api/            NestJS — REST JSON API + in-process week scheduler
    src/modules/auth/      sign-up, login, sessions, password reset
    src/modules/domain/    groups, members, invites, goals, weeks engine, check-ins,
                           feed, contests, uploads, ledgers, payments, notifications
    test/                  integration tests (real Postgres + Redis)
  web/            Next.js — responsive portal (PWA manifest), /api proxied to the API
  mobile/         Expo — later (phase 10b); reuses types and rules
packages/
  config/         tsconfig preset
  types/          DTOs, error codes, group roles → permissions (zero deps)
  rules/          pure domain math: dates/weeks in a time zone, slots, commitment, PIX BR Code
infra/            Dockerfiles, production compose, nginx, deploy scripts
```

## 5. Data scoping and isolation (replaces multi-tenancy)

- Every group-owned table carries `group_id`. Routes are nested: `/groups/:groupId/...`.
- `GroupAccessGuard` loads the caller's `Member` row for `:groupId` (status `active`)
  into the request context. No membership → **404** (`GROUP_NOT_FOUND`), never 403, so
  group existence does not leak.
- Repositories for group data **require** a `groupId` argument; there is no "find by id"
  without it.
- **Sacred test:** a user who is not a member gets 404 on every group route, and list
  endpoints never return another group's rows. Breaks → stop everything.

## 6. Authentication and authorization

**Auth** (`vg-auth`, opaque-session variant): sign-up, login, logout, password change
(ends every session via `authVersion`), single-use password reset (1 h). Sessions: 30 days
absolute, 14 days idle. Web: `__Host-` httpOnly cookie + CSRF header `x-requested-with:
tenace` + Origin check. Mobile: `POST /auth/login {client:"mobile"}` returns the token in
the body and it is sent as `Authorization: Bearer` (no CSRF needed). MFA and e-mail
verification: out of v1. Google login: open question (§17).

**System roles:** `user` (everyone), `platform_admin` (support staff).

**Group roles and permissions** (resolved per group):

| Permission | owner | admin | member |
| --- | :-: | :-: | :-: |
| `group:group:read` (group, members, goals, feed, statements, fund) | ✔ | ✔ | ✔ |
| `group:settings:update` (name, emoji, color, description, time zone, destination) | ✔ | ✔ | |
| `group:group:delete`, `group:owner:transfer` | ✔ | | |
| `group:member:invite`, `group:member:remove`, `group:member:approve` | ✔ | ✔ | |
| `group:role:update` (promote/demote admin) | ✔ | | |
| `goal:goal:manage` (create, edit, archive, participants) | ✔ | ✔ | |
| `checkin:checkin:create` (own), `checkin:checkin:delete` (own, open week) | ✔ | ✔ | ✔ |
| `checkin:contest:create` | ✔ | ✔ | ✔ |
| `checkin:contest:resolve` | ✔ | ✔ | |
| `ledger:payment:declare` (own) | ✔ | ✔ | ✔ |
| `ledger:payment:confirm`, `ledger:adjustment:create` (waive, fix) | ✔ | ✔ | |
| `fund:expense:create` | ✔ | ✔ | |

Rules: a group always has exactly one owner; the owner cannot leave without
transferring ownership; an admin cannot confirm their own payment or resolve a contest on
their own check-in (another admin/owner must) — unless they are the only admin/owner, in
which case the action is allowed and flagged in the feed.

Errors follow the VGStack contract (stable codes, e.g. `GROUP_NOT_FOUND`,
`CHECKIN_OUTSIDE_WINDOW`, `GOAL_NOT_PARTICIPANT`, `PAYMENT_ALREADY_CONFIRMED`).

## 7. Platform (super-admin)

v0.1: the seed creates a `platform_admin` account (`SEED_ADMIN_*`); the admin screens
(list/search users and groups, block a user, job health) are **not built yet**. No plans,
billing or feature flags.

## 8. Functional modules

### 8.1 Groups and members

- **Group:** `name`, `emoji`, `color` (from the brand palette), `description`,
  `timezone` (default `America/Sao_Paulo`), `currency` (`BRL` only in v1),
  `close_grace_hours` (default 12), `destination` (§8.5), `created_by`.
- **Member:** `user_id`, `group_id`, `role`, `status` (`invited` → `active` → `left` /
  `removed`), `joined_at`, `starts_on_week` (first week they are charged).
- **Invites** (the owner decides who takes part):
  - *By e-mail:* admin invites; invitee accepts (signs up first if needed) → `active`.
  - *By link:* token, expires in 7 days, optional max uses; whoever opens it sends a
    **join request** that an admin must approve.
- **Joining mid-week:** a new member starts being charged on the **next** week
  (`starts_on_week`). Their current-week check-ins are allowed and shown, but count for
  nothing.
- **Leaving/removal:** effective after the current week closes (they still owe the
  current week). Open debt stays in their account and remains payable.

### 8.2 Goals and slots

A goal has: `name`, `emoji`, `period` (`daily` | `weekly`), `target` (number > 0),
`unit` (`times` | `pages` | `minutes` | `km` | custom label), `slots_per_week`,
`stake_cents`, `active_weekdays` (daily goals; default all 7), `participants`
(default: all active members; admins can exclude someone).

How slots are defined:

| Kind | Example | Slots per week | A slot is paid when… |
| --- | --- | --- | --- |
| Daily | 10 pages/day, Mon–Sun | number of active weekdays (7) | that day's check-ins sum ≥ target |
| Weekly, unit `times` | gym 3×/week | = target (3) | each check-in (1 time) |
| Weekly, other unit | 30 pages/week in 3 slots | chosen N (default 1) | cumulative total crosses each `target / N` step |

`commitment(member, week) = Σ goals (slots_per_week × stake_cents)` over goals the
member participates in.

**The user's example:** gym 3×/week at R$ 5 + book 3×/week at R$ 5 → week opens at
**−R$ 30**. Three gym check-ins (+R$ 15) and two book check-ins (+R$ 10) → week closes
at **−R$ 5** → R$ 5 penalty to the fund. All six → closes at R$ 0.

Rules:
1. Goal changes (create, edit target/stake/slots, participants, archive) apply from the
   **next** week. At week opening the API stores a **snapshot** of each goal per member
   (`week_goal`), and all math for that week uses the snapshot.
2. Over-achieving never earns more than the commitment (no carry-over, no credit).
3. Money is integer cents everywhere.

### 8.3 Weeks, check-ins and contests

- **Week opening** (job, Monday 00:00 group time): for each charged member, create the
  `week_goal` snapshots and one `COMMITMENT` entry (−) in their account. Idempotent
  (unique `group_id + week_start + member_id`).
- **Check-in:** `goal`, `date` (local date), `quantity` (fixed 1 for `times`), `note`,
  optional `photo` (uploaded via presigned URL, resized). Allowed dates: any day of the
  current week up to today, **or** the previous week until it closes (grace). Never
  future dates. Members may delete their own check-in while its week is open.
- Each check-in recomputes slots for that goal/member/week (pure function in
  `packages/rules`) and posts `SLOT_CREDIT` (+) or `SLOT_REVERSAL` (−) entries for the
  difference. The ledger never stores "derived" balances, only entries.
- **Contest:** any member can contest another member's check-in with a reason. The
  check-in keeps counting until resolved. An admin (not the check-in's owner) **upholds**
  (check-in invalidated → slots recomputed → reversal entries, even after close) or
  **dismisses** it. Contests can be opened until 7 days after the week closes.
- **Week close** (job, Monday 00:00 + `close_grace_hours`): for each member, the week's
  net (commitment + credits − reversals) that is still negative becomes a
  `PENALTY_ASSESSED` entry in the **fund** (receivable). A `week_result` row is saved
  (met / not met per goal, penalty, streak). Idempotent. Late changes (upheld contest,
  admin adjustment) post correcting entries to both ledgers.

### 8.4 Ledgers (member account and group fund)

**Member account** — entries (`amount_cents` signed), balance = sum:

| Type | Sign | When |
| --- | :-: | --- |
| `COMMITMENT` | − | week opening |
| `SLOT_CREDIT` | + | slot achieved |
| `SLOT_REVERSAL` | − | check-in deleted/invalidated |
| `PAYMENT` | + | payment confirmed |
| `ADJUSTMENT` | ± | admin waiver/correction, reason required |

The UI splits the balance into **this week** (open-week entries: "−R$ 20 · faltam 4
cotas") and **open debt** (everything else: "Em aberto: −R$ 5"), so a member never
confuses "week in progress" with "money owed".

**Group fund** — two balances:

| Type | Receivable | Cash | When |
| --- | :-: | :-: | --- |
| `PENALTY_ASSESSED` | + | | week close |
| `PENALTY_ADJUSTED` | ± | | late contest/adjustment |
| `PAYMENT_RECEIVED` | − | + | payment confirmed |
| `WAIVER` | − | | admin waives a debt |
| `EXPENSE` | | − | admin records spending (e.g. "churrasco", donation sent) with optional receipt |

Entries are immutable; mistakes are fixed with new entries. Every entry records
`created_by`, `reason`, and links (week, check-in, payment).

### 8.5 Destination and payments

- **Destination** (group setting): `label` (e.g. "Caixinha do grupo", "Doação ao abrigo
  X"), `holder_name`, `pix_key` + `pix_key_type`, optional bank/agency/account text,
  `city` (needed for the PIX code).
- **Pay flow:** member opens "Pagar" → sees the amount owed, the destination and a
  **static PIX copia-e-cola + QR code** generated locally (EMV BR Code, no payment
  provider) → pays in their bank app → taps "Já paguei" (optional receipt photo) →
  payment `pending` → an admin confirms → `PAYMENT` (member) + `PAYMENT_RECEIVED`
  (fund). Admins can also register a payment directly. Partial payments allowed.

### 8.6 Feed, progress and motivation

- **Group feed:** check-ins (with photos), week results, payments, contests, member
  joins. Reactions (👏🔥💪) on check-ins.
- **Week board:** every member's progress per goal (rings/bars), who is done, who is
  behind — friendly, not shaming (no red "losers" list; show "faltam X").
- **Streaks:** consecutive fully-met weeks per member, shown on profile and board.

### 8.7 Notifications

v0.1: in-app notification center for invites, join requests, payments to confirm/confirmed,
contests, adjustments and the Monday **week result**. E-mail (when `SMTP_URL` is set) for
invites and password reset. Not built yet: e-mail week summary, per-type opt-out. Push
notifications come with the mobile app (phase 10b).

### 8.8 Screens (web, mobile-first)

| Screen | Content |
| --- | --- |
| Landing / login / sign-up | Value proposition, how it works in 3 steps |
| **Início** | Card per group: week ring, "this week" and "open debt", big **Registrar** button |
| Registrar (sheet) | Pick group → goal → quantity / date / note / photo; instant slot feedback ("+R$ 5 · cota paga!") |
| Grupo › Semana | Week board, countdown to close |
| Grupo › Feed | Timeline, reactions, contests |
| Grupo › Metas | Goals list; admin: create/edit with live "compromisso semanal" preview |
| Grupo › Conta | My statement (filters, running balance) + "Pagar"; Fund tab (receivable, cash, entries) |
| Grupo › Membros | Members, roles, invites, join requests |
| Grupo › Configurações | Name, emoji, color, time zone, grace, destination |
| Pagar | Amount, PIX QR + copy, "Já paguei" |
| Perfil | Name, photo, streaks, notification preferences, sessions |

Bottom navigation on mobile (Início · Grupos · Registrar · Notificações · Perfil),
sidebar on desktop (`vg-navegacao`, simplified: no ⌘K in v1).

## 9. External integrations

| Interface | Implementations | Env |
| --- | --- | --- |
| `MailService` | SMTP via nodemailer when `SMTP_URL` is set; otherwise messages are only logged | `SMTP_URL`, `MAIL_FROM` |
| `StorageService` | Local disk volume (`/data/uploads` in production) | `UPLOAD_DIR` |

No payment provider (decision: tracking only). PIX BR Code is generated locally in
`packages/rules`.

## 10. Design system and branding

See `docs/brand/`. Tokens by role with light and dark themes (`vg-interface`).

- **Name:** Tenace · **tagline:** *non arrenderti*.
- **Mark:** rounded square in violet with a white "T" whose bar **rises** to the right
  (progress) and an orange spark (the effort). Files: `tenace-mark.svg`,
  `tenace-logo-light.svg`, `tenace-logo-dark.svg`.
- **Palette:**

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `brand` | `#6D3BFF` | `#9B7BFF` | primary actions, mark |
| `brand-strong` | `#4A1FD1` | `#B8A2FF` | hover, links |
| `spark` | `#FF7A1A` | `#FF9A4D` | streaks, check-in celebration |
| `ink` | `#17142B` | `#F3F1FA` | text |
| `surface` | `#FFFFFF` | `#16131F` | cards |
| `canvas` | `#F6F4FB` | `#0E0C15` | page background |
| `positive` | `#14935A` | `#3DD68C` | slot paid, payment |
| `negative` | `#D2364A` | `#FF6B7D` | debt, penalty |

- **Type:** Plus Jakarta Sans (UI + wordmark), tabular numbers for money.
- **Tone:** encouraging, light, a bit playful ("Mais 2 cotas e a semana fecha no zero 💪").
  Never shaming.

## 11. Observability

pino structured logs with `request_id`, `user_id`, `group_id`; Sentry for api and web;
job runs (week open/close) logged with counts and duration; `/health`, `/ready`.

## 12. Tests

Mandatory:
- **Isolation:** non-member → 404 on every `/groups/:id/**` route; lists never leak.
- **Permissions:** member cannot manage goals, confirm payments, resolve contests; admin
  cannot confirm own payment when another admin exists.
- **Rules (`packages/rules`, unit + property tests):** slot computation for all three
  goal kinds, commitment, no over-credit, week bounds across time zones and DST,
  check-in window (Sunday 23:59 vs Monday 00:01 local, grace end).
- **Jobs:** week open and close are idempotent (run twice → same ledger).
- **Ledger:** member balance and fund balances always equal the sum of entries; late
  contest after close produces matching correcting entries in both ledgers.
- E2E (Playwright): create group → invite → define goals → check-ins → close → pay →
  confirm; at 375 px and desktop, light and dark.

## 13. CI/CD and Git

Conventional Commits with scope; feature branch → PR; `pnpm lint && pnpm typecheck &&
pnpm test` gate; GitHub Actions (`vg-deploy`).

## 14. Deploy

Shared VPS `168.231.88.232` (same host as other VGStack systems): the **host nginx** owns
80/443 and proxies `tenace.amancio.family` → `127.0.0.1:3310` (web). Certificate via
certbot (webroot). Delivery = **packaged release** (`vg-deploy`): `infra/scripts/deploy-from-workstation.sh`
checks the tree is clean, runs typecheck + tests, sends a `git archive` of the commit to
`/opt/tenace/releases/<sha>`, and `deploy.sh` on the server builds the images, starts
Postgres/Redis, **backs up before migrating**, runs migrations + idempotent seed as a
one-shot, recreates api/web, waits for health and checks the running build is this commit.
Only the web port is published (loopback); the API stays on the compose network.

## 15. Environment variables

`DATABASE_URL`, `REDIS_URL`, `APP_WEB_URL`, `API_INTERNAL_URL` (web → api), `PORT`,
`UPLOAD_DIR`, `SMTP_URL`, `MAIL_FROM`, `SESSION_TTL_HOURS`, `SESSION_IDLE_HOURS`,
`SCHEDULER` (on/off), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_DATA`,
`TRUST_PROXY_HOPS`, `BUILD_SHA`. Validated by Zod at boot; production refuses placeholders,
http URLs and demo data. Local `.env` is generated with random secrets by `pnpm setup`;
the server `.env` by `infra/scripts/setup-server-env.sh` (`vg-segredos`).

## 16. Confirmed decisions ✅

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Name | **Tenace**, tagline *non arrenderti* |
| 2 | Money | Tracking only; payments outside the app (PIX), declared and confirmed by admin |
| 3 | Check-in validation | Trust + optional photo; members can contest, admins resolve |
| 4 | Delivery | Responsive web first; API, `types`, `api-client`, `rules` ready for Expo |
| 5 | Tenancy | Not multi-tenant; isolation by group membership guard |
| 6 | Backend | NestJS |
| 7 | Week | Monday–Sunday in group time zone; close after grace (default 12 h) |
| 8 | Goal changes | Apply from next week (snapshot per week) |
| 9 | Join mid-week | Charged from next week |
| 10 | Domain / host | `tenace.amancio.family` on the shared VPS (host nginx + certbot), packaged release |
| 11 | Auth | Opaque session (cookie on web, Bearer on mobile) |
| 12 | First week "start now" | Daily goals count only from the creation day; weekly goals count in full |
| 13 | Leaving / removal | Effective after the current week closes; open debt stays payable |

## 17. Open questions

1. SMTP provider for production e-mails (invites, password reset, week summary). Without
   it, invites still work by link; password reset needs it.
2. "Entrar com Google" in v1? (friendlier sign-up; adds an OAuth integration)
3. Pause/vacation (member skips a week, approved by admin) — v1 or later?
4. Can a member have **personal goals** inside a group (different targets per person),
   or are goals always shared? v1 assumption: shared goals, with per-goal participants.
