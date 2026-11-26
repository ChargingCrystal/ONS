# Ons · Couple Planner

Ons is a Nuxt 3 app with a Nitro API and Supabase Postgres, Auth, and private Storage. The API forwards the signed-in user's token to Supabase, where row-level security controls data access.

## Local setup

Install Node 22.12 or later, Docker, and the Supabase CLI. From the repository root, run:

```sh
npm ci
supabase start
supabase migration up --local
cp .env.example .env
```

Copy the public or anon key from `supabase status` to `NUXT_PUBLIC_SUPABASE_KEY` and start the app with `npm run dev`. Local Auth allows test signups without email confirmation. The home page links to the database health check.

For a new hosted Supabase project, apply all SQL migrations in numerical order. Set the public Supabase URL and key in Vercel, allow the app's HTTPS origin in Supabase Auth URL Configuration, and enable email confirmation for public signups. To enable Google login, configure the Google provider in Supabase Auth and register the callback URL shown there in the Google Console.

## Auth and demo

The Nuxt plugin exposes the browser Supabase client as `useNuxtApp().$supabase`. Use `auth.signUp({ email, password })`, `auth.signInWithPassword({ email, password })`, `auth.signInWithOAuth({ provider: 'google' })`, and `auth.signOut()`. Supabase Auth handles passwords, session refresh, and rate limits. Send the current access token on protected Nitro calls.

This local demo uses Bash, curl, and jq.

```sh
source .env
signup() {
  curl -fsS "$NUXT_PUBLIC_SUPABASE_URL/auth/v1/signup" -H "apikey: $NUXT_PUBLIC_SUPABASE_KEY" \
    -H 'Content-Type: application/json' -d "$(jq -nc --arg email "$1" '{email:$email,password:"Ons-local-demo-2026!"}')" | jq -er .access_token
}
A=$(signup "a-$(date +%s)@example.org")
B=$(signup "b-$(date +%s)@example.org")
api() {
  local token="$1" route="$2"
  shift 2
  curl -fsS "http://localhost:3000/api/$route" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$@"
}
api "$A" space -X POST
CODE=$(api "$A" space | jq -r .invite)
api "$B" space/join -d "$(jq -nc --arg code "$CODE" '{code:$code}')"
api "$A" dates -d '{"title":"Movie night","category":"movie","meeting_at":"2027-01-15T18:00:00Z"}'
api "$B" dates
api "$B" dashboard
```

## API

Send `Authorization: Bearer <access_token>` on authenticated routes and `Accept: application/json` to request JSON errors. The request and response schemas and their TypeScript types are exported from [shared/api-contract.ts](shared/api-contract.ts). The error schema and `ApiErrorCode` are exported from [shared/api-errors.ts](shared/api-errors.ts).

| Method and path | Auth | Request | Success | Error codes |
| --- | --- | --- | --- | --- |
| `GET /api/health` | Public | — | `200` with `{"status":"ok"}` after a Supabase database round trip | `503 internal` if the probe fails or times out |
| `GET /api/space` | Bearer | — | `200` with `id`, `invite`, and `members`, or `204` when unpaired | `unauthorized`, `internal` |
| `POST /api/space` | Bearer | — | `200` with the new space `id` | `already_paired`, `unauthorized`, `internal` |
| `POST /api/space/join` | Bearer | JSON `code`, 32 lowercase hex characters | `200` with the joined space `id`. Joining consumes the invite. | `invite_invalid`, `already_paired`, `validation_failed`, `unauthorized`, `internal` |
| `GET /api/dates` | Bearer | Optional `q`, `category` key, `status`, `sort`, `order`, `offset` | `200` with up to 50 date rows containing category keys | `validation_failed`, `unauthorized`, `internal` |
| `POST /api/dates` | Bearer | JSON `title`, `category` key, optional `status` and `meeting_at` | `200` with the created date row | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `PATCH /api/dates/:id` | Bearer | UUID `id` and at least one writable date field. A supplied `category` must be a key. | `200` with the updated date row | `validation_failed`, `not_found`, `unauthorized`, `internal` |
| `DELETE /api/dates/:id` | Bearer | UUID `id` | `204` | `validation_failed`, `not_found`, `unauthorized`, `internal` |
| `GET /api/location` | Bearer | — | `200` with `partners`, `distanceKm`, and `midpoint`. Unavailable derived values are null. | `unauthorized`, `internal` |
| `PUT /api/location` | Bearer | JSON `lat` and `lon` | `200` with the saved location row | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `GET /api/dashboard` | Bearer | — | `200` with `serverTime`, `nextMeeting`, and `categoriesByMonth` grouped by UTC month and category key | `unauthorized`, `internal` |
| `GET /api/photos` | Bearer | Optional `offset` | `200` with up to 30 uploads newest first, with signed URLs valid for five minutes | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `POST /api/photos` | Bearer | Raw JPEG, PNG, or WebP bytes with matching `Content-Type`, up to 5 MiB in Nitro | `200` with Storage `id`, `path`, and `fullPath` | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `DELETE /api/photos/:name` | Bearer | UUID `name` from the gallery | `204`, including when the name is absent from the caller's gallery | `validation_failed`, `no_space`, `unauthorized`, `internal` |

### Database health and keep-alive

Apply migration `007` before deploying the updated health endpoint. Both healthy and degraded responses send `Cache-Control: no-store`. A degraded check returns `503` with `data.code` set to `internal`.

In GitHub, go to **Settings → Secrets and variables → Actions → Variables → New repository variable**. Set `HEALTH_URL` to `https://<app-domain>/api/health` using the public deployment's domain. After the workflow reaches the default branch, run **Actions → Supabase keep-alive → Run workflow** to verify the setup. The schedule checks the endpoint daily at 07:17 UTC.

### Date category keys

Import `DATE_CATEGORIES` and `DateCategory` from [shared/date-categories.ts](shared/date-categories.ts). The keys are `dinner`, `movie`, `walk`, `trip`, `video_call`, `game`, and `other`. Use them for date forms, the list filter, date responses, and dashboard charts. Translate their display labels in German, English, and Dutch.

For example, `GET /api/dates?category=movie` filters by movie dates. Create or update requests use `"category":"movie"`, and the returned date row contains the same key. To clear the filter, omit `category`. An empty `category`, a translated label such as `Kino`, or any other non-key returns HTTP `400` with `data.code = "validation_failed"`.

Migration `003` trims surrounding whitespace and maps known legacy aliases case-insensitively. For example, `Kino`, `film`, and `cinema` become `movie` and share one dashboard category. Unrecognized values become `other`. Apply the migration before serving this API version.

### Error codes and statuses

| `data.code` | HTTP | Meaning |
| --- | --- | --- |
| `invite_invalid` | 400 | The invite is unknown or already consumed. |
| `already_paired` | 409 | The caller already belongs to a space. |
| `no_space` | 403 | The operation requires the caller to belong to a space. |
| `not_found` | 404 | The date is missing or outside the caller's visible rows. |
| `validation_failed` | 400, 413, 415 | Input is invalid, an upload is too large, or the media type or signature is unsupported. |
| `unauthorized` | 401 | The access token is missing or rejected. |
| `internal` | 500, 503 | An unexpected server failure occurred or a dependency is unavailable. |

A `PATCH /api/dates/not-a-uuid` request with `{"title":"Movie night"}` returns HTTP 400. The contract fields in the JSON response are:

```json
{
  "statusCode": 400,
  "data": { "code": "validation_failed" }
}
```

Map `data.code` to a translated message and keep the `401` sign-in handling. Failures generated by infrastructure, such as a hosting upload limit, can arrive without this envelope. Use a generic translated fallback in that case.

## Verification

`npm test` runs Vitest, including PGlite tests for all migrations, geo unit tests, and HTTP contract tests with a simulated Supabase transport. `npm run build` creates the production Nitro build. Real Auth and Storage smoke test results are in [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md).
