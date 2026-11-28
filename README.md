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

Copy the public or anon key from `supabase status` to `NUXT_PUBLIC_SUPABASE_KEY` and start the app with `npm run dev`. Local Auth allows test signups without email confirmation. The home page links to the process health check.

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
| `GET /api/health` | Public | — | `200` with process status `{"status":"ok"}` | `internal` |
| `GET /api/space` | Bearer | — | `200` with `id`, `invite`, and `members` including nullable `display_name`, or `204` when unpaired | `unauthorized`, `internal` |
| `POST /api/space` | Bearer | — | `200` with the new space `id` | `already_paired`, `unauthorized`, `internal` |
| `POST /api/space/join` | Bearer | JSON `code`, 32 lowercase hex characters | `200` with the joined space `id`. Joining consumes the invite. | `invite_invalid`, `already_paired`, `validation_failed`, `unauthorized`, `internal` |
| `POST /api/space/invite` | Bearer | — | `200` with a new `invite` for a sole member. The old code expires immediately. | `no_space`, `already_paired`, `unauthorized`, `internal` |
| `DELETE /api/space/membership` | Bearer | — | `204` after leaving, or if already unpaired. Removes the caller's location and invalidates the invite. | `unauthorized`, `internal` |
| `GET /api/profile` | Bearer | — | `200` with the caller's `display_name`, or null in that field if unset | `unauthorized`, `internal` |
| `PUT /api/profile` | Bearer | JSON `display_name`, 1–60 characters after trimming | `200` with the saved `display_name` | `validation_failed`, `unauthorized`, `internal` |
| `GET /api/dates` | Bearer | Optional `q`, `category` key, `status`, `sort`, `order`, `offset` | `200` with up to 50 date rows containing category keys | `validation_failed`, `unauthorized`, `internal` |
| `POST /api/dates` | Bearer | JSON `title`, `category` key, optional `status` and `meeting_at` | `200` with the created date row | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `PATCH /api/dates/:id` | Bearer | UUID `id` and at least one writable date field. A supplied `category` must be a key. | `200` with the updated date row | `validation_failed`, `not_found`, `unauthorized`, `internal` |
| `DELETE /api/dates/:id` | Bearer | UUID `id` | `204` | `validation_failed`, `not_found`, `unauthorized`, `internal` |
| `GET /api/location` | Bearer | — | `200` with `partners`, `distanceKm`, and `midpoint`. Unavailable derived values are null. | `unauthorized`, `internal` |
| `PUT /api/location` | Bearer | JSON `lat` and `lon` | `200` with the saved location row | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `DELETE /api/location` | Bearer | — | `204`, including when the caller has no saved location | `unauthorized`, `internal` |
| `GET /api/dashboard` | Bearer | — | `200` with `serverTime`, `nextMeeting`, and `categoriesByMonth` grouped by UTC month and category key | `unauthorized`, `internal` |
| `GET /api/photos` | Bearer | Optional `offset` | `200` with up to 30 confirmed photos newest first. Each includes its metadata and a five-minute signed URL when available. | `validation_failed`, `no_space`, `unauthorized`, `internal` |
| `POST /api/photos/upload-url` | Bearer | JSON `mime` and `size` in bytes, up to 5 MiB | `200` with `uploadId`, `path`, `signedUrl`, and `token` | `validation_failed`, `quota_exceeded`, `no_space`, `unauthorized`, `internal` |
| `POST /api/photos/confirm` | Bearer | JSON `uploadId` from the reservation | `200` with the confirmed photo row. The uploader can retry using the same ID. | `validation_failed`, `not_found`, `no_space`, `unauthorized`, `internal` |
| `DELETE /api/photos/:name` | Bearer | UUID `name` from the gallery | `204` when a confirmed photo is removed | `validation_failed`, `not_found`, `no_space`, `unauthorized`, `internal` |

### Date category keys

Import `DATE_CATEGORIES` and `DateCategory` from [shared/date-categories.ts](shared/date-categories.ts). The keys are `dinner`, `movie`, `walk`, `trip`, `video_call`, `game`, and `other`. Use them for date forms, the list filter, date responses, and dashboard charts. Translate their display labels in German, English, and Dutch.

For example, `GET /api/dates?category=movie` filters by movie dates. Create or update requests use `"category":"movie"`, and the returned date row contains the same key. To clear the filter, omit `category`. An empty `category`, a translated label such as `Kino`, or any other non-key returns HTTP `400` with `data.code = "validation_failed"`.

Migration `003` trims surrounding whitespace and maps known legacy aliases case-insensitively. For example, `Kino`, `film`, and `cinema` become `movie` and share one dashboard category. Unrecognized values become `other`. Apply the migration before serving this API version.

### Profiles and space lifecycle

After applying migration `004`, clients can display each member's `display_name` in the space response. Use a translated fallback for a null name. `PUT /api/profile` with `{"display_name":"Alex"}` returns `{"display_name":"Alex"}`. Refresh the space after saving a name, rotating the invite, or leaving.

A remaining partner keeps shared dates and photos and can generate another invite. Slot numbers can be either 1 or 2 for a sole member, so determine invite eligibility from the member count. When nobody remains, the shared data stays stored for operator cleanup and the old invite cannot be used. Downloads through already-issued photo URLs can still work until those URLs expire.

#### Operator-managed account deletion

1. Verify the deletion request and the account's UUID in **Supabase → Authentication → Users**. If the requester can still sign in, they can leave their space first to remove membership and their saved location.
2. Check whether the account owns Storage objects. Supabase can reject account deletion until ownership is resolved. Use supported Storage operations to reassign objects that the remaining partner should keep or remove objects approved for deletion. Review the whole project, including the private `gallery` bucket.
3. Delete the verified Auth user using the Supabase dashboard. Foreign keys remove the user's profile, membership, and saved location. Confirm the remaining partner can still access the space and regenerate an invite. An empty space's old invite cannot be redeemed.
4. Coordinate cleanup for abandoned spaces separately. Deleting the Auth user ends token refresh, while access tokens already issued may remain valid until expiry. The removed membership blocks shared-space reads through RLS.

The app does not expose an Auth account-deletion endpoint or require a service-role key in Nitro. [Supabase user deletion](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users)

### Direct photo uploads

1. Send `POST /api/photos/upload-url` with JSON such as `{"mime":"image/png","size":5242880}`. Supported MIME types are `image/jpeg`, `image/png`, and `image/webp`. Use the final compressed file's MIME and size.
2. Send the bytes directly to the private `gallery` bucket with the Supabase SDK. The signed token is for that path only. Keep it out of application logs.

   ```ts
   const { error } = await supabase.storage.from('gallery')
     .uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: file.type })
   if (error) throw error
   ```

3. Send `POST /api/photos/confirm` with `{"uploadId":"<reservation UUID>"}`. The server checks the stored MIME and byte count, then returns the registered photo. Retry confirmation with the same ID after an interrupted response. The gallery lists confirmed rows and may return a null URL when a file cannot be signed.

The old binary `POST /api/photos` returns `405`. Both upload POSTs carry JSON so the image bypasses the Vercel Function request-body limit. A space has a **50 MiB** quota. A live upload reservation holds **5 MiB** through the signed token's lifetime and a 15-minute transfer grace period, even after deletion. Unconfirmed objects already in Storage also count. Operators can clean up abandoned objects through Storage once the signing window, token lifetime, and transfer grace period have elapsed. [Supabase signed upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)

Apply migration `005` before serving this API version. Existing gallery objects with a compatible path, MIME, and size are backfilled. Objects without compatible metadata stay in Storage and count toward the quota.

### Live updates

After applying migration `008`, use the signed-in Supabase client to subscribe to the private Broadcast topic `ons:user:<user-id>`. Use the Auth user ID from the current session. The app sends `{}` as the payload. Supabase may add a generated message `id`, which the app can ignore. Refresh the affected views through `useApi()` when the event arrives.

| Source table | Broadcast event | Requests to refresh |
| --- | --- | --- |
| `public.dates` | `dates.changed` | `GET /api/dates` and `GET /api/dashboard` |
| `public.photos` | `photos.changed` | `GET /api/photos` |
| `public.locations` | `locations.changed` | `GET /api/location` |

```ts
const channel = supabase.channel(`ons:user:${session.user.id}`, { config: { private: true } })
  .on('broadcast', { event: 'dates.changed' }, () => refreshDatesAndDashboard())
  .on('broadcast', { event: 'photos.changed' }, () => refreshPhotos())
  .on('broadcast', { event: 'locations.changed' }, () => refreshLocation())
  .subscribe()

// When the session ends or the subscription owner unmounts:
await supabase.removeChannel(channel)
```

Fetch current data on initial load and after reconnecting. Refresh or clear the local space views after the user joins or leaves. Refresh signals represent committed changes and may be missed while disconnected. Uploading a file to Storage emits a photo refresh only when its metadata is confirmed in Postgres.

To run the live isolation test, apply all migrations to a disposable local Supabase stack on `127.0.0.1:54321`. Set `ONS_REALTIME_TEST_KEY` to its publishable or anon key from `supabase status`, then run `npm test -- --project backend tests/realtime.live.test.mjs`. The test creates three local Auth users. [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

### Error codes and statuses

| `data.code` | HTTP | Meaning |
| --- | --- | --- |
| `invite_invalid` | 400 | The invite is unknown or already consumed. |
| `already_paired` | 409 | The caller already belongs to a space when creating or joining, or the space already has two members when rotating an invite. |
| `no_space` | 403 | The operation requires the caller to belong to a space. |
| `not_found` | 404 | A date, photo, or upload is missing or outside the caller's visible rows. |
| `quota_exceeded` | 409 | The photo space cannot reserve another upload within its quota. |
| `validation_failed` | 400, 405, 413, 415 | Input is invalid, the removed binary upload route was called, an upload is too large, or the media type is unsupported. |
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
