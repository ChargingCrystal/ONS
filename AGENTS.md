# Ons – Couple Planner: agent guide

Read this before changing anything. It is the single source of truth for AI coding agents
(Codex, Claude Code, others) and for new team members. `CLAUDE.md` imports this file, so edit it here.

## What this is

Ons is a web app for two partners in a long-distance relationship: shared date ideas, shared photos,
both locations with distance and midpoint, a countdown to the next meeting, and statistics.
It is a semester project for "Frameworks for Web-based Application Systems" (TH Brandenburg),
and is meant to stay usable after the course. Requirements live in `lastenheft.md`
(IDs F1–F11 are referenced in code reviews and commits).

Course milestones: working prototype for Business Angel Meeting II (December), pitch in January.

## Stack and status

- Nuxt 3 (Nitro API in `server/`), TypeScript, Node >= 22.12
- Supabase: Postgres, Auth (email/password, Google), private Storage
- Deployment target: Vercel (app) + Supabase (backend services), free tiers
- Backend prototype exists. **The frontend has not started**: `app.vue` is a stub.
- Planned for the frontend (not in the repo yet): Pinia, `@nuxtjs/i18n` (DE/EN/NL), Tailwind or UnoCSS,
  Leaflet or MapLibre, Chart.js or ECharts. Do not install these without agreeing it with the team.

## Commands

```sh
npm ci                          # install
supabase start                  # local Postgres/Auth/Storage (needs Docker)
supabase migration up --local   # apply supabase/migrations/*
cp .env.example .env            # then set NUXT_PUBLIC_SUPABASE_KEY from `supabase status`
npm run dev                     # Nuxt dev server on :3000
npm test                        # node:test + PGlite, no Docker needed
npm run build                   # Nitro production build
```

`npm test` and `npm run build` must pass before every merge.

## Architecture rules (do not break these)

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
- Do not change requirements in `lastenheft.md` without team agreement.

## Git workflow

- Never push directly to `main`. Branch names: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- One logical change per commit, imperative subject line (e.g. `Add photos table and signed upload`).
- Open a pull request into `main`; the other teammate reviews before merging.
- Reference the requirement ID in the PR description when relevant (e.g. `F3`).

## Where to look

- `lastenheft.md`: requirements, evaluation criteria, timeline
- `docs/BACKLOG.md`: known gaps and the agreed order of work
- `server/utils/backend.ts`: shared Nitro helpers (`client`, `result`, `room`, `dateFields`)
- `supabase/migrations/`: schema, RLS, storage policies
- `tests/isolation.test.mjs`: RLS and pairing tests
