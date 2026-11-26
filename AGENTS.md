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
  The frontend has an app shell (layout, navigation, design tokens, DE/EN/NL) and sign-in (F2); the feature pages
  are placeholders.
- Frontend stack from `docs/Lastenheft_Ons.md`: Pinia, `@nuxtjs/i18n` (DE/EN/NL), Tailwind or UnoCSS,
  Leaflet or MapLibre, Chart.js or ECharts. The frontend dev decides between the "or" options and records the
  choice here. A new dependency goes in `package.json`, a shared file: say why in the PR description.
- Decided: styling uses **Tailwind CSS v4** (`tailwindcss` with `@tailwindcss/vite`). Design tokens are plain CSS
  variables, so the look can be changed without knowing Tailwind (see Frontend rules).
- Decided: `@nuxtjs/i18n` is pinned to exactly **10.2.3**. Later releases require `vue-router` 5, while Nuxt 3.21
  ships version 4. Do not upgrade it without moving to a Nuxt version that matches.
- Decided: **Pinia** (`pinia` 3 with `@pinia/nuxt` 0.11) holds client state, starting with the session.
- Decided: **rendering.** Only the landing page (`/`, `/en`, `/nl`) is rendered on the server. Every other page is
  rendered in the browser (`routeRules` in `nuxt.config.ts`), because the Supabase session is stored there.
- Not installed yet: the map library and the chart library.

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
- Error responses carry a stable `data.code` (listed in `shared/api-errors.ts`); the frontend maps codes to
  i18n messages and never shows server text.
- Schema changes (migrations) are backend-only, and only one migration PR is open at a time.

## Commands

```sh
npm ci                          # install
supabase start                  # local Postgres/Auth/Storage (needs Docker)
supabase migration up --local   # apply supabase/migrations/*
cp .env.example .env            # then set NUXT_PUBLIC_SUPABASE_KEY from `supabase status`
npm run dev                     # Nuxt dev server on :3000 (frontend and API together)
npm test                        # Vitest, backend and frontend tests, no Docker needed
npm run build                   # Nuxt/Nitro production build
```

`npm test` and `npm run build` must pass before every merge.

- On Windows, run npm from a path with an upper-case drive letter (`E:\...`, not `e:\...`). Otherwise Vitest
  fails with "failed to find the runner".
- CI uses npm 10 (Node 22). After adding or updating a package with npm 11, run
  `npx npm@10 install --package-lock-only`, otherwise `npm ci` can fail in CI.

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

Vitest is the single runner for unit, component and database tests (`npm test`). Playwright for E2E is not set up yet.
Backend tests live in `tests/`. Frontend tests live in `__tests__/` folders next to the code: `*.nuxt.spec.ts`
runs inside a Nuxt runtime, other `*.spec.ts` files run in plain Node (see `vitest.config.ts`).
Shared test helpers live in `composables/__tests__/` (for example `fake-auth.ts`, an in-memory Supabase Auth).
Put only spec files into `pages/__tests__/` and `components/__tests__/`: Nuxt would register other files there as
pages or components.
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
   Do not edit an existing migration once it is applied anywhere other than your own machine.
5. **Validate all input with zod** (`z.strictObject`, bounded lengths, UUID params with `z.uuid()`).
6. **Map DB errors through `result()`** and do not leak raw database messages to clients.
7. **Photos** live in the private bucket `gallery` under `<space_id>/<uuid>`. Access goes through
   signed URLs only. Resolve the space with `room(db)` before touching storage paths.
8. **Any change to SQL, RLS or grants requires an extension of `tests/isolation.test.mjs`.**
   The test loads every file in `supabase/migrations/` in order.

## Frontend rules

- **All user-facing text goes through i18n** (DE, EN, NL; fallback DE). No hardcoded strings. A new key is added in
  all three languages in the same PR. Message files are in `i18n/locales/`.
- **Language URLs:** German has no prefix (`/dates`), the others do (`/en/dates`, `/nl/dates`). Link with
  `NuxtLinkLocale`. The choice is saved in the `ons_locale` cookie. SEO link tags stay off until F10.
- **Mobile first and responsive.** Everything must work by keyboard with visible focus, and with sufficient contrast.
- **New main page:** add the file in `pages/` and one entry in `components/AppNav.vue`.
- **Design tokens in one place** (colors, type scale, spacing, radius), derived from the logo and illustrations
  provided by the designer; no magic values in components. Illustrations live in `assets/illustrations/`.
  - Raw values live only in `assets/css/tokens.css`. `assets/css/main.css` maps them to Tailwind utilities and
    removes Tailwind's default scales, so a class such as `p-5` produces no CSS: add the token first.
  - Components use colour roles (`bg-canvas`, `text-muted`), never palette values.
  - `assets/__tests__/template-guard.spec.ts` rejects hardcoded text, raw colours and bracket values such as
    `p-[13px]` in `pages/`, `components/` and `layouts/` (short exception list in the test).
    `assets/__tests__/contrast.spec.ts` checks the colour contrast of the tokens.
- **Pinia** for session, space and shared UI state; data fetching lives in composables, not in components.
- **Date categories** are fixed keys from `shared/date-categories.ts`; their labels come from i18n by key.
- Auth: the Supabase client is provided as `useNuxtApp().$supabase` (client only, see `plugins/auth.client.ts`).
  Protect pages with route middleware, not with `v-if` in components.
  - `middleware/auth.global.ts` protects **every** page. A page opts out with
    `definePageMeta({ access: 'public' })` or `access: 'guest'` (only for signed-out visitors).
  - Reach Supabase Auth only through `useSupabaseAuth()`. The session state is in `stores/session.ts`.
  - Call the API only through `useApi()` and show a failure with `t(error.messageKey)`.
  - A `redirect` query value goes through `useReturnTarget()`, which only accepts paths inside the app.
  - Google sign-in and confirmation emails return to `/auth/callback` (one address, no language prefix).
  - `PASSWORD_MIN_LENGTH` in `composables/formRules.ts` must match `minimum_password_length` in
    `supabase/config.toml` (not set there today, so the Supabase Auth default of 6 applies).

## Current data model

| Object | Notes |
| --- | --- |
| `spaces(id, invite)` | `invite` is a 32-char hex code, set to null when a partner joins (one-time) |
| `members(user_id, space_id, slot)` | `user_id` is the PK, so one space per person; `slot` is 1 or 2, so max two members |
| `dates(id, space_id, title, category, status, meeting_at, created_at)` | `status` is `planned` or `done`; `category` is one of the keys in `shared/date-categories.ts` (check constraint) |
| `locations(user_id, space_id, lat, lon)` | one row per member; only the owner can write |
| RPCs | `my_space()`, `create_space()`, `join_space(code)`, `dashboard()` |
| Storage | bucket `gallery`: private, 5 MiB, jpeg/png/webp |

The API surface is documented in the table in `README.md`. Do not duplicate it here.

## Conventions

- Code, comments, docs and commit messages in **English** (course language).
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
- `shared/`: request and response schemas, error codes and category keys shared between frontend and API
- `server/utils/backend.ts`: shared Nitro helpers (`client`, `result`, `room`)
- `supabase/migrations/`: schema, RLS, storage policies
- `tests/isolation.test.mjs`: RLS and pairing tests
