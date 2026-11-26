# Backend prompts (for Codex)

Copy-paste prompts for the backend developer. Work through them **in order**; each prompt is one branch and one PR.

## How to use

1. Start every Codex session with: `Read AGENTS.md and docs/BACKLOG.md first.` Every prompt below repeats this on purpose.
2. Paste one prompt at a time. Do not batch prompts.
3. Codex must **plan first and wait for your OK**. Review the plan before it writes code.
4. Tests come first (red), then implementation (green). The failing test is its own commit.
5. Before every PR: `npm test && npm run build` must pass.
6. Anything that changes the API contract also needs the handshake prompt **H1** at the end of the PR.

## Order

| # | Prompt | Backlog | Why now |
|---|--------|---------|---------|
| P0 | Smoke test against real local Supabase | - | Find out what actually works |
| P1 | Test tooling + CI | B9 | Everything after depends on it |
| P2 | Stable error codes | B5 | Frontend needs them for i18n |
| P3 | First deployment | - | Catch Vercel issues early |
| P4 | Category keys | B2 | Frontend i18n for categories |
| P5 | Profiles and lifecycle | B4 | Pairing UX needs display names |
| P6 | Photos: signed upload, table, quota | B1, B3 | Vercel 4.5 MB body limit |
| P7 | Dashboard trend | B7 | Chart requirement |
| P8 | Health check and keep-alive | B6 | Supabase Free pauses when idle |
| P9 | Realtime publication | B8 | Live updates |
| H1 | Publish contract change | - | After every API change |
| H2 | Handle a frontend request | - | When the frontend asks |
| H3 | Integration check | - | Before each milestone |

---

## P0 - Smoke test against real local Supabase

```text
Read AGENTS.md and docs/BACKLOG.md first.

Task: Verify that the existing backend works end to end against a real local Supabase (not PGlite).

Goal: A written list of what works and what is broken, so we plan on facts.

Scope: Read-only. Do NOT change code in this task. You may create docs/SMOKE_TEST.md.

Process:
1. Start local Supabase (supabase start) and apply all migrations.
2. With curl or a small script, exercise every route: health, space (create, join), dates (CRUD, filter, sort, search, pagination), location (GET, PUT), dashboard, photos (GET, POST, DELETE).
3. Use two real test users to check that RLS isolates their data.

Done when: docs/SMOKE_TEST.md lists every route with request, response status and result (ok / broken / unclear).

Report: Summary of broken or unclear routes, ranked by severity. No fixes yet.
```

## P1 - Test tooling and CI (B9)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B9.

Task: Move to a single test runner and add CI.

Goal: One command runs all tests; CI runs them on every PR.

Scope: package.json, tests/, .github/workflows/, .gitignore, extraction of pure geo logic into a testable module under server/utils/. Do not change API behavior.

Process:
1. Plan first and wait for my OK. Propose: Vitest as the single runner, migration of tests/isolation.test.mjs, and loading ALL migrations (not only 001) into PGlite.
2. Failing tests first (show the failures), then implement.
3. Extract distance and midpoint math into a pure module and cover it with unit tests (edge cases: same point, antipodal points, date line).
4. Add a GitHub Actions workflow: install, npm test, npm run build.
5. Add .claude/settings.local.json to .gitignore.
6. Run: npm test && npm run build

Done when: npm test is green locally and in CI; CI is required on main via branch protection (tell me the settings to click, do not assume access).

Report: What changed, test count before/after, anything that did not fit.
```

## P2 - Stable error codes (B5)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B5.

Task: Return stable, machine-readable error codes from every route.

Goal: The frontend can map codes to translated messages without parsing text.

Scope: server/, shared/ (types), tests/. No new routes.

Process:
1. Plan first and wait for my OK. Codes to cover: invite_invalid, already_paired, no_space, not_found, validation_failed, unauthorized, internal. Propose the HTTP status for each.
2. The code goes in `data.code` of the error response. Add a `toApiError` util and use it everywhere.
3. Export the code union type from shared/ so the frontend imports it.
4. Validate UUID path params and return validation_failed (not a 500).
5. Failing tests first for each code, then implement.
6. Run: npm test && npm run build

Done when: every error path returns one of the codes, and a test per code exists.

Report: Table of route x possible codes. Then run prompt H1.
```

## P3 - First deployment

```text
Read AGENTS.md and docs/BACKLOG.md first.

Task: Prepare the first Vercel + Supabase cloud deployment.

Goal: A repeatable deployment guide and a working preview of /api/health.

Scope: docs/DEPLOY.md, vercel config if needed. Do NOT take any cloud action (creating projects, setting secrets, pushing migrations) without my explicit OK for that specific action.

Process:
1. Plan first and wait for my OK.
2. Write docs/DEPLOY.md: Supabase project creation, migration push, required env vars (no service-role key), Vercel project settings, Google OAuth redirect URLs, custom domain notes.
3. List everything I have to click myself and in which order.
4. Confirm the Nitro preset works on Vercel with npm run build.

Done when: I can follow docs/DEPLOY.md from zero without asking questions.

Report: Open decisions and risks (cold starts, region choice, free-tier limits).
```

## P4 - Category keys (B2)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B2.

Task: Replace free-text date categories with fixed keys so the frontend can translate them.

Goal: category is one of a known key list, defined once in shared/.

Scope: supabase/migrations/ (new migration only, never edit old ones), server/, shared/, tests/.

Process:
1. Plan first and wait for my OK. Propose the key list (e.g. dinner, movie, walk, trip, video_call, game, other) and ask me to confirm it.
2. Migration: add a check constraint and map legacy free-text rows to a key (unknown -> other).
3. Export DATE_CATEGORIES from shared/ and use it in the zod schemas.
4. Failing tests first (invalid key rejected, legacy rows migrated), then implement.
5. Run: npm test && npm run build

Done when: invalid categories return validation_failed and migrated rows are valid.

Report: The final key list and the migration mapping. Then run prompt H1.
```

## P5 - Profiles and lifecycle (B4)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B4.

Task: Add profiles (display name) and the missing lifecycle operations.

Goal: Partners see each other's names, and a space can be left or re-invited.

Scope: supabase/migrations/ (new), server/, shared/, tests/.

Process:
1. Plan first and wait for my OK. Cover: profiles table with display_name, leave space, regenerate invite, delete own location, delete account.
2. IMPORTANT: deleting an auth user needs the service-role key. That must NOT go into the Nitro app. Propose an alternative (e.g. a security definer function, or a separate Supabase Edge Function) and wait for my decision.
3. Keep RLS-first: no service-role key in Nitro, security definer functions with set search_path = ''.
4. Failing tests first (including isolation tests for the new tables), then implement.
5. Run: npm test && npm run build

Done when: all lifecycle operations are covered by tests, and RLS isolation holds for profiles.

Report: What account deletion looks like and what I still need to decide. Then run prompt H1.
```

## P6 - Photos: signed upload, table, quota (B1 + B3)

```text
Read AGENTS.md and docs/BACKLOG.md first. These are backlog items B1 and B3.

Task: Replace the binary photo upload with a signed direct upload to Supabase Storage, and add a photos table with a quota.

Goal: Uploads up to 5 MiB work on Vercel (function body limit is 4.5 MB), and the storage quota is enforced.

Scope: supabase/migrations/ (new), server/, shared/, tests/.

Process:
1. Plan first and wait for my OK. Proposed flow: POST /api/photos/upload-url validates type and size and returns a signed upload URL; the client uploads directly; POST /api/photos/confirm registers the photo in a photos table.
2. photos table: id, space_id, path, mime, size, uploaded_by, created_at. RLS by space.
3. Quota per space (propose a number that fits the 1 GB free tier) enforced before issuing the URL.
4. Remove the old binary upload route once the new flow is tested.
5. GET /api/photos returns signed read URLs (5 min).
6. Failing tests first (wrong mime, too large, over quota, foreign space), then implement.
7. Run: npm test && npm run build

Done when: the full flow is tested, the old route is gone, error codes follow B5.

Report: The final flow with example requests. Then run prompt H1 (this is a breaking change for the frontend).
```

## P7 - Dashboard trend (B7)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B7.

Task: Extend /api/dashboard with a time series so the frontend can draw a second chart type.

Goal: Dates per month for the last 12 months plus a category breakdown.

Scope: supabase/migrations/ (new, if the RPC changes), server/, shared/, tests/.

Process:
1. Plan first and wait for my OK.
2. Failing tests first (empty space, sparse months, timezone edge at month boundary), then implement.
3. Include serverTime in the response (the frontend needs it for the countdown).
4. Run: npm test && npm run build

Done when: the response shape is typed in shared/ and tested.

Report: Example response. Then run prompt H1.
```

## P8 - Health check and keep-alive (B6)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B6.

Task: Make /api/health hit the database, and add a scheduled keep-alive.

Goal: The free Supabase project does not pause after about a week of inactivity.

Scope: server/, .github/workflows/, tests/.

Process:
1. Plan first and wait for my OK.
2. /api/health runs a trivial query and returns ok or a degraded status without leaking details.
3. Scheduled GitHub Action (daily) calls the deployed health URL. The URL goes in a repo variable, not in code.
4. Failing test first, then implement.
5. Run: npm test && npm run build

Done when: health proves DB connectivity and the workflow exists.

Report: What I need to set in GitHub (variables) for it to run.
```

## P9 - Realtime publication (B8)

```text
Read AGENTS.md and docs/BACKLOG.md first. This is backlog item B8.

Task: Enable Supabase Realtime for the tables the frontend needs.

Goal: The frontend receives live changes for dates, photos and the partner's location.

Scope: supabase/migrations/ (new), tests/.

Process:
1. Plan first and wait for my OK. Confirm that RLS also filters realtime events so a user only receives their own space.
2. Add the tables to the supabase_realtime publication in a migration.
3. Test the isolation: a user outside the space must not receive events.
4. Run: npm test && npm run build

Done when: publication is migrated and isolation is verified.

Report: The channel/table names the frontend should subscribe to. Then run prompt H1.
```

---

## Handshake prompts

## H1 - Publish a contract change

Run at the end of **every** PR that changes a route, a response shape or an error code.

```text
Read AGENTS.md first.

Task: Publish the API contract change from this PR so the frontend can adopt it.

Scope: README API table, shared/ (zod schemas and types), contract tests, PR description.

Process:
1. Update the API table in README.md for every changed route (method, path, auth, request, response, error codes).
2. Make sure the request and response schemas live in shared/ and are exported as zod schemas AND inferred types.
3. Add or update contract tests that parse real route responses with those schemas.
4. Add a "Frontend impact" section to the PR description: what breaks, what is new, what the frontend must change, and an example request/response.
5. Run: npm test && npm run build

Done when: the frontend developer can implement against shared/ and the README alone, without reading server/.

Report: The "Frontend impact" text, ready to paste to the frontend developer.
```

## H2 - Handle a frontend request

```text
Read AGENTS.md first.

Task: The frontend developer asked for this backend change:
<paste request>

Process:
1. Check it against AGENTS.md (RLS-first, thin Nitro layer, no service-role key). Say clearly if it is a bad idea and propose an alternative.
2. Plan first and wait for my OK.
3. Then follow the normal flow: failing tests, implementation, npm test && npm run build, and run H1.

Done when: the request is implemented or explicitly declined with a reason.

Report: Decision and, if implemented, the Frontend impact text.
```

## H3 - Integration check (report only)

```text
Read AGENTS.md first.

Task: Check that backend and frontend agree on the contract.

Scope: Read-only. Do NOT edit frontend paths (pages/, components/, composables/ ...). Do not fix anything in this task.

Process:
1. Compare README API table, shared/ types and the actual routes.
2. Grep the frontend (composables/useApi and callers) for routes, fields or error codes that do not exist in the contract.
3. List mismatches: what the frontend calls vs what the backend provides.

Done when: a mismatch list exists, each item tagged "backend fix" or "frontend fix".

Report: The list. Backend fixes become tasks for me; frontend fixes go to the frontend developer.
```
