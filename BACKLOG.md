# Backend backlog

Findings from the first backend review, in the order we want to work through them.
Status of the backend at review time: `npm test` and `npm run build` pass; API not yet tested against a real Supabase project.
Update this file as items are done (delete the item or mark it `done` with the PR number).

## P1: blocks real use

### B1: Photo upload exceeds the Vercel request limit (F3)
- **Problem:** `POST /api/photos` streams the file through Nitro with a 5 MiB limit. Vercel Functions reject request bodies above 4.5 MB (413), so typical phone photos fail in production.
- **Fix:** let the browser upload directly to Supabase Storage with a signed upload URL (`createSignedUploadUrl`); Nitro only issues the URL and validates type and size beforehand. Compress and resize in the client before upload.
- **Done when:** a 10 MB phone photo uploads on the deployed app and the file ends up under `<space_id>/<uuid>`.

### B2: Categories are free text (F4, F8, F9)
- **Problem:** "Kino", "kino" and "cinema" become three categories in the statistics, and category names cannot be translated.
- **Fix:** fixed set of category keys (check constraint or lookup table); labels come from i18n (DE/EN/NL). Migration must map existing rows.
- **Done when:** `dashboard()` groups by key and the API rejects unknown keys.

### B3: No `photos` table (F3)
- **Problem:** photos exist only as storage objects: no uploader, caption or taken-at date; "chronological" means upload time. No per-space storage quota, and the free tier has 1 GB total.
- **Fix:** `photos(id, space_id, uploaded_by, storage_path, caption, taken_at, size_bytes, created_at)` with RLS like `dates`; list from the table, not from storage. Enforce a per-space quota on insert.
- **Done when:** gallery sorts by `taken_at`, shows the uploader, and uploads over quota are rejected.

## P2: lifecycle and robustness

### B4: Missing lifecycle endpoints
- Leave space, regenerate invite, delete own location, delete account.
- Today, deleting one account leaves the other partner in a space with no invite, so they cannot pair again. Storage objects of deleted spaces stay behind.
- Add a `profiles(user_id, display_name)` table so the UI can show the partner's name.

### B5: Error handling
- `result()` collapses every error to "Request failed" and logs nothing. Log the original error server-side and return stable error codes (e.g. `invite_invalid`, `already_paired`, `no_space`) in the response body so the frontend can show proper messages.
- Validate `:id` in `dates/[id]` routes with `z.uuid()` (photos already do).
- Return a clear 403 for unpaired users on `POST /dates` and `PUT /location`.

### B6: Health check and keep-alive
- `/api/health` does not touch the database, so it is useless for monitoring.
  Add a second check (or an option) that runs a trivial query.
- Supabase Free pauses projects after about a week of low activity. Schedule a request that really hits the database (Vercel cron or GitHub Actions) if the app is meant to run after the course.

## P3: completeness and quality

### B7: Dashboard data for F8
- Add the "trend until next meeting" series so that at least two chart types have meaningful data.

### B8: Realtime (F10, specialization)
- Add `dates` and `photos` to the `supabase_realtime` publication in a new migration; subscribe in the frontend.

### B9: Test tooling and CI (do this first, the team works test-first)
- Set up Vitest as the single runner for unit, component and database tests (`npm test`), with `@nuxt/test-utils` and
  Vue Test Utils for the frontend. Port `tests/isolation.test.mjs` so there is one runner (PGlite should work under Vitest).
- Set up Playwright for a few E2E flows (later).
- Add a GitHub Actions workflow: `npm ci`, `npm test`, `npm run build` on every pull request, and require it via branch protection.
- Pin existing untested behavior before refactoring: extract the geo math from `location.get.ts` into `server/utils/` with unit tests.
- Extend tests: migration `002` (storage policies), a second-partner-reads-location case, `dashboard().nextMeeting`.
- Update `lastenheft.md` section 12 to match what is actually used.

### B10: Readability
- Add Prettier and an `.editorconfig`; reformat the dense one-liners (`package.json`, SQL, ternary chains) and add short comments.
- Fix the broken tables in `lastenheft.md`.
