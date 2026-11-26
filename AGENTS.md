# Ons – Couple Planner: agent guide

Read this before changing anything. It is the single source of truth for AI coding agents
(Codex, Claude Code, others) and for new team members. `CLAUDE.md` imports this file, so edit it here.

## What this is

Ons is a web app for two partners in a long-distance relationship: shared date ideas, shared photos,
both locations with distance and midpoint, a countdown to the next meeting, and statistics.
It is a semester project for "Frameworks for Web-based Application Systems" (TH Brandenburg),
and is meant to stay usable after the course. Requirements live in `docs/Lastenheft_Ons.md`
(IDs F1–F11 are referenced in code reviews and commits).

Course milestones: working prototype for Business Angel Meeting II (December), pitch in January.

## Stack and status

- Nuxt 3 with the default root-level layout (no `app/` directory), Nitro API in `server/`, TypeScript, Node >= 22.12
- Supabase: Postgres, Auth (email/password, Google), private Storage
- Deployment target: Vercel (app) + Supabase (backend services), free tiers
- Backend prototype exists and is being hardened (see `docs/BACKLOG.md`).
  The frontend is being built now; `app.vue` is still a stub.
- Frontend stack from `docs/Lastenheft_Ons.md`: Pinia, `@nuxtjs/i18n` (DE/EN/NL), Tailwind or UnoCSS,
  Leaflet or MapLibre, Chart.js or ECharts. The frontend dev decides between the "or" options and records the
  choice here. A new dependency goes in `package.json`, a shared file: say why in the PR description.

## Ownership (who works where)

| Area | Owner | Paths |
| --- | --- | --- |
| Backend | `ChargingCrystal` (Codex) | `server/`, `supabase/`, `tests/`, `.github/` |
| Frontend | `Filionus` (Claude Code) | `pages/`, `components/`, `composables/`, `layouts/`, `middleware/`, `plugins/`, `stores/`, `assets/`, `public/`, `locales/`, `i18n/`, `app.vue` |
| Shared (small PRs, tell the other person) | both | `package.json`, `nuxt.config.ts`, `shared/`, `AGENTS.md`, `CLAUDE.md`, `docs/`, `README.md` |

Agents: stay inside your owner's paths. If a task needs a change in the other area,
stop and describe what is needed (route, fields, error codes) instead of editing it.

## API contract

- The frontend gets data only through `/api/*`. `supabase-js` in the browser is for auth
  (later also realtime, and uploads with signed URLs issued by the API), never for reading or writing tables directly.
- Every API call sends `Authorization: Bearer <access_token>`. The frontend wraps this in one composable
  (e.g. `useApi`) that also handles 401 (redirect to login) and maps error codes; do not call `$fetch` ad hoc.
- Any API change (route, field, error code) updates the API table in `README.md` and the types in `shared/`
  in the same PR, and the PR description names the frontend impact.
- Error responses carry a stable `code`; the frontend maps codes to i18n messages and never shows server text.
  (Planned in backlog B5; until then, handle HTTP status only.)
- Schema changes (migrations) are backend-only, and only one migration PR is open at a time.

## Commands

```sh
npm ci                          # install
supabase start                  # local Postgres/Auth/Storage (needs Docker)
supabase migration up --local   # apply supabase/migrations/*
cp .env.example .env            # then set NUXT_PUBLIC_SUPABASE_KEY from `supabase status`
npm run dev                     # Nuxt dev server on :3000 (frontend and API together)
npm test                        # node:test + PGlite, no Docker needed
npm run build                   # Nuxt/Nitro production build
```

`npm test` and `npm run build` must pass before every merge.

## Test-driven development (applies to everyone)

We work test-first: red (a failing test that states the behavior), green (the smallest change that passes),
refactor (clean up while the tests stay green).

- **Write the test before the implementation and run it.** It must fail, and for the right reason. Do not write the
  code first and the tests afterwards to match it.
- **Agents:** do not write implementation code before a failing test exists. If asked to "just implement it",
  write the test first anyway, or say why this change is exempt (pure styling/layout).
- **Commit order shows it:** the failing test is its own commit, the change that makes it pass comes after. Failing
  commits live on feature branches only; the PR must be green at the end. The PR description lists the tests added.
- **A bug fix starts with a test that reproduces the bug.**
- **Untested existing code** (for example the geo math in `server/api/location.get.ts`): before changing it, pin the
  current behavior with tests, then refactor. Extract logic from route handlers into `server/utils/` functions so it
  can be tested without a running server.

What to test, per layer:

| Layer | How | Test-first? |
| --- | --- | --- |
| Database: RLS, grants, functions | PGlite tests in `tests/`, required for every migration | Yes |
| Server logic: validation, geo math, error mapping | unit tests on `server/utils/` functions | Yes |
| Frontend logic: composables, Pinia stores, utils (countdown, formatting) | Vitest unit tests | Yes |
| Components: forms, date list filter, pairing flow | Vue Test Utils: assert what the user sees and does | Yes |
| E2E: login, pair, create date, upload photo, switch language | Playwright, a few core flows, written once the flow works end to end | After |
| Visual layout and styling | manual check (mobile, keyboard focus) | No |

Test behavior, not implementation: no snapshot tests of whole pages, no asserting on CSS classes or internal state,
no mocking of the unit under test. Keep tests fast and independent of each other.

Tooling target: Vitest as the single runner for unit, component and database tests (`npm test`), Playwright for E2E.
Until the backend dev has migrated the existing test (backlog B9), `npm test` still runs `node:test`.
"Done" always includes: new behavior has a test, and `npm test` and `npm run build` pass.

## Backend rules (do not break these)

Rule 1 applies to everyone, including the frontend.

1. **Authorization lives in Postgres (RLS), not in Nitro.** Every API route calls `client(event)` from
   `server/utils/backend.ts`, which forwards the user's `Authorization: Bearer` token to Supabase.
   Never use a service-role key in Nitro or the browser. Never put secrets in `runtimeConfig.public`
   (only the Supabase URL and the publishable/anon key belong there).
2. **Every new table**: `enable row level security`, `revoke all ... from public, anon, authenticated`,
   then explicit, column-level grants and policies scoped by `public.my_space()`.
3. **Every `security definer` function**: `set search_path = ''`, fully qualified names, `revoke ... from public, anon`,
   `grant execute ... to authenticated`.
4. **Migrations are append-only.** Add a new numbered file in `supabase/migrations/`.
   Do not edit `001_*` or `002_*` once they are applied anywhere other than your own machine.
5. **Validate all input with zod** (`z.strictObject`, bounded lengths, UUID params with `z.uuid()`).
6. **Map DB errors through `result()`** and do not leak raw database messages to clients.
7. **Photos** live in the private bucket `gallery` under `<space_id>/<uuid>`. Access goes through
   signed URLs only. Resolve the space with `room(db)` before touching storage paths.
8. **Any change to SQL, RLS or grants requires an extension of `tests/isolation.test.mjs`.**
   The test only loads `001_couple_planner.sql` today; if you add policies in a later migration, load it too.

## Frontend rules

- **All user-facing text goes through i18n** (DE, EN, NL; fallback DE). No hardcoded strings. A new key is added in
  all three languages in the same PR.
- **Mobile first and responsive.** Everything must work by keyboard with visible focus, and with sufficient contrast.
- **Design tokens in one place** (colors, type scale, spacing, radius), derived from the logo and illustrations
  provided by the designer; no magic values in components. Illustrations live in `assets/illustrations/`.
- **Pinia** for session, space and shared UI state; data fetching lives in composables, not in components.
- **Categories** are free text today. After backlog B2 they become keys whose labels come from i18n; do not build
  features that depend on the raw category text.
- Auth: the Supabase client is provided as `useNuxtApp().$supabase` (client only, see `plugins/auth.client.ts`).
  Protect pages with route middleware, not with `v-if` in components.

## Current data model

| Object | Notes |
| --- | --- |
| `spaces(id, invite)` | `invite` is a 32-char hex code, set to null when a partner joins (one-time) |
| `members(user_id, space_id, slot)` | `user_id` is the PK, so one space per person; `slot` is 1 or 2, so max two members |
| `dates(id, space_id, title, category, status, meeting_at, created_at)` | `status` is `planned` or `done`; `category` is currently free text (see backlog) |
| `locations(user_id, space_id, lat, lon)` | one row per member; only the owner can write |
| RPCs | `my_space()`, `create_space()`, `join_space(code)`, `dashboard()` |
| Storage | bucket `gallery`: private, 5 MiB, jpeg/png/webp |

The API surface is documented in the table in `README.md`. Do not duplicate it here.

## Conventions

- Code, comments, docs and commit messages in **English** (course language). The existing `README.md` is German; translate it when touching it.
- Write readable code: one statement per line, no clever one-liners, short comments for any non-obvious SQL.
  The team has to explain every line in the final pitch.
- Do not add dependencies without saying why in the PR description.
- Never commit `.env` or any secret. `.env.example` holds placeholders only.
- Do not commit agent-local settings (for example `.claude/settings.local.json` or personal Codex config); keep them in `.gitignore`.
- Do not change requirements in `docs/Lastenheft_Ons.md` without team agreement.

## Git workflow

- Never push directly to `main`. Branch names: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Claim a task before starting (GitHub issue, or a line in `docs/BACKLOG.md`) so nobody works on it twice.
- Branch from an up-to-date `main`, keep PRs small, and update from `main` before opening the PR.
- One logical change per commit, imperative subject line (e.g. `Add photos table and signed upload`).
- Open a pull request into `main`. The other teammate reviews before merging. An agent may help with the review,
  but a human reads the diff. Merge only when CI is green and you can explain the change.
- Reference the requirement ID in the PR description when relevant (e.g. `F3`).
- Only one open PR may add a migration at a time. The backend dev assigns migration numbers.
- Develop against the local Supabase (`supabase start`). The cloud project is production: never run
  `supabase db push` against it from a feature branch. Migrations reach it from `main` only, run by the backend dev.

## Where to look

- `docs/Lastenheft_Ons.md`: requirements, evaluation criteria, timeline
- `docs/BACKLOG.md`: known gaps and the agreed order of work
- `README.md`: setup and the API table (the contract with the frontend)
- `shared/`: types shared between frontend and API (create when first needed)
- `server/utils/backend.ts`: shared Nitro helpers (`client`, `result`, `room`, `dateFields`)
- `supabase/migrations/`: schema, RLS, storage policies
- `tests/isolation.test.mjs`: RLS and pairing tests
