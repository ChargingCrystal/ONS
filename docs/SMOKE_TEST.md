# Local backend smoke test

Run on 2026-11-26 against commit `92f8a8e`. All 14 Nitro routes received real HTTP requests. The run verified pairing, date CRUD and pagination, location sharing, dashboard aggregates, and private photo upload, download, and deletion. A literal asterisk search returned incorrect results. The tested row-level security (RLS) checks passed.

## Findings by severity

| Severity | Route | Result | Observed behavior |
| --- | --- | --- | --- |
| Medium | `GET /api/dates?q=%2A` | broken | Returned `200` with all three dates in the caller's space although only `03 Walk * Day` contains an asterisk. Ordinary case-insensitive search and literal `%` and `_` searches worked. |
| Medium for monitoring | `GET /api/health` | broken as a readiness check | Returned `200 {"status":"ok"}` while the local Supabase port refused connections. It works as the process health check documented in the README. This confirms B6. |
| Low | `DELETE /api/photos/:name` | unclear contract | The unrelated user received `204` for the same photo name that the partner later deleted with `204`. A follow-up list confirmed the unrelated request had no effect. The response does not distinguish deletion from a no-op. |

Two B5 observations from the run. Unpaired writes to dates and location already return `403` on this stack, with the generic message `Request failed`. Malformed date IDs return `400` on both mutation routes, also with the generic message `Request failed`.

## Test setup

- Nuxt 3.21.11 and Nitro 2.14.0 on Node 24.19.0 at `http://127.0.0.1:3001`.
- Supabase CLI 3.4.0 with Docker Engine 28.5.2 in Ubuntu on WSL 2. The local API listened on `127.0.0.1:54321`. The first startup hit registry rate limits and failed to start the database. A retry with Docker's networking utilities available succeeded.
- Ran `supabase start --debug` with a copy of the repository's Supabase configuration and migrations. `supabase migration up --local` reported the database was up to date. `supabase migration list --local` showed both `001_couple_planner.sql` and `002_private_gallery.sql` applied.
- A, B, and C signed up via local Supabase Auth. A and B created distinct spaces for the isolation checks. C joined A to verify that partners can share data. Nitro forwarded each caller's own access token to Supabase using the local public key.
- The results cover the local stack. The deployed Vercel upload limit in B1 was outside this run.

`ok` means the observed status and behavior met the expectation for the request, including expected rejections. UUIDs and tokens are represented by placeholders.

## Health and spaces

| Caller | Request | HTTP | Result | Evidence |
| --- | --- | --- | --- | --- |
| Anonymous | `GET /api/health` | 200 | ok | Returned `{"status":"ok"}` with Supabase running. |
| Anonymous | `GET /api/health`, Supabase offline | 200 | broken for readiness | Returned the same body with the Supabase port refusing the connection. |
| A, B, C | `POST /auth/v1/signup` with distinct emails and passwords | 200 each | ok | All three obtained real Auth sessions. |
| Anonymous | `GET /api/space` without a bearer token | 401 | ok | Access denied. |
| A | `GET /api/space` before creating a space | 204 | ok | Empty HTTP body. |
| A, B | `POST /api/space` | 200 each | ok | Returned a distinct space UUID for each caller. |
| A, B | `GET /api/space` after creating a space | 200 each | ok | Each saw only their own space and slot 1 membership. A received a valid invite code. |
| A | `POST /api/space` again | 409 | ok | Duplicate creation rejected with `Already paired`. |
| C | `POST /api/space/join` with `{"code":"<inviteA>"}` | 200 | ok | Returned A's space UUID. |
| C | `GET /api/space` after joining | 200 | ok | A and C occupied slots 1 and 2. The invite was null. |
| B | `POST /api/space/join` with the consumed `<inviteA>` | 400 | ok | Reuse rejected with `Request failed`. |
| B | `POST /api/space/join` with `{"code":"bad"}` | 400 | ok | Malformed code rejected with `Validation Error`. |

## Dates

The date fixtures were `<museum>` (`01 Museum 100%`, culture, planned), `<second>` (`02 museum_2`, culture, done), and `<walk>` (`03 Walk * Day`, outdoors, planned). The two planned dates had distinct future UTC meeting times. B's unrelated space contained `99 Museum private` in category `unrelated`.

| Caller | Request | HTTP | Result | Evidence |
| --- | --- | --- | --- | --- |
| A, before pairing | `POST /api/dates` with title `Unpaired date` and category `culture` | 403 | ok | Write rejected with `Request failed`. |
| A | `POST /api/dates` with `<museum>` title, category, and `meeting_at` | 200 | ok | Returned the row in A's space with the supplied meeting time and default `planned` status. |
| C | `POST /api/dates` with `<second>` title, category, and `status: done` | 200 | ok | Partner created a date in A's space. |
| A | `POST /api/dates` with `<walk>` title, category, and `meeting_at` | 200 | ok | Created the second planned date. |
| B | `POST /api/dates` with the unrelated title and category | 200 | ok | Returned the row in B's own space. |
| C | `GET /api/dates` | 200 | ok | Returned the three shared dates newest first. B's date was absent. |
| B | `GET /api/dates` | 200 | ok | Returned only B's date. |
| A | `GET /api/dates?category=culture&status=done` | 200 | ok | Returned only `<second>`. |
| A | `GET /api/dates?sort=title&order=desc` | 200 | ok | Returned the three shared titles in descending order. |
| A | `GET /api/dates?sort=meeting_at&order=asc&status=planned` | 200 | ok | Returned the planned dates in meeting order. |
| A | `GET /api/dates?q=MUSEUM&sort=title&order=asc` | 200 | ok | Matched both museum titles across case differences. |
| A | `GET /api/dates?q=%25` | 200 | ok | Matched only the title with a literal percent sign. |
| A | `GET /api/dates?q=_` | 200 | ok | Matched only the title with a literal underscore. |
| A | `GET /api/dates?q=%2A` | 200 | broken | Returned all three shared dates. Only `<walk>` contains an asterisk. |
| A | `GET /api/dates?offset=-1` | 400 | ok | Invalid offset rejected. |
| C | `PATCH /api/dates/<second>` with `{"title":"02 museum_2 updated"}` | 200 | ok | Returned the shared date with its updated title. |
| B | `PATCH /api/dates/<museum>` with `{"title":"Unrelated edit"}` | 404 | ok | Cross-space update denied. |
| B | `DELETE /api/dates/<museum>` | 404 | ok | Cross-space delete denied. |
| A | `GET /api/dates?q=100%25` | 200 | ok | `<museum>` still existed with its original title. |
| A | `PATCH /api/dates/not-a-uuid` with `{"title":"invalid target"}` | 400 | ok | Malformed identifier rejected with `Request failed`. |
| A | `DELETE /api/dates/not-a-uuid` | 400 | ok | Malformed identifier rejected with `Request failed`. |
| A | 51 `POST /api/dates` requests with titles `Page 00` through `Page 50` and category `pagination` | 200 each | ok | Created the fixtures for the page boundary. |
| A | `GET /api/dates?category=pagination&sort=title&order=asc&offset=0` | 200 | ok | Returned 50 distinct rows, `Page 00` through `Page 49`. |
| A | `GET /api/dates?category=pagination&sort=title&order=asc&offset=50` | 200 | ok | Returned only `Page 50`. |
| A | `GET /api/dates?category=pagination&sort=title&order=asc&offset=51` | 200 | ok | Returned an empty array. |
| C | `DELETE /api/dates/<second>` | 204 | ok | Partner could delete the shared date. |
| A | `GET /api/dates?q=museum_` after deletion | 200 | ok | Returned an empty array. |

## Location and dashboard

| Caller | Request | HTTP | Result | Evidence |
| --- | --- | --- | --- | --- |
| A, before pairing | `PUT /api/location` with `{"lat":0,"lon":0}` | 403 | ok | Write rejected with `Request failed`. |
| A | `GET /api/location` before setting coordinates | 200 | ok | No partners, distance, or midpoint. |
| A | `PUT /api/location` with `{"lat":0,"lon":0}` | 200 | ok | Stored A's coordinates. |
| C | `GET /api/location` after A's write | 200 | ok | Saw A's coordinates. Distance and midpoint were null. |
| C | `PUT /api/location` with `{"lat":0,"lon":2}` | 200 | ok | Stored C's coordinates. |
| B | `PUT /api/location` with `{"lat":40,"lon":60}` | 200 | ok | Stored B's separate coordinates. |
| A | `PUT /api/location` with `{"lat":0,"lon":1}` | 200 | ok | Updated A's existing coordinates. |
| C | `GET /api/location` after both partners set coordinates | 200 | ok | Returned A and C only, distance 111.195 km, midpoint at latitude 0 and longitude 1.5. |
| B | `GET /api/location` | 200 | ok | Returned only B's coordinates, with null distance and midpoint. |
| A | `PUT /api/location` with `{"lat":91,"lon":0}` | 400 | ok | Rejected the out-of-range latitude. |
| C | `PATCH /rest/v1/locations?user_id=eq.<userA>` with `{"lat":5}` and `Prefer: return=representation` | 200 | ok | PostgREST returned an empty array under C's JWT. The RLS owner policy blocked the change. |
| A | `GET /api/location` after C's direct request | 200 | ok | A's coordinates were still latitude 0 and longitude 1. |
| C | `GET /api/dashboard` before seeding pagination dates | 200 | ok | Valid server timestamp, `<museum>` as the next meeting, and shared totals of culture 2 and outdoors 1. |
| B | `GET /api/dashboard` | 200 | ok | Valid server timestamp, no next meeting, and only B's unrelated category total of 1. |

## Photos

| Caller | Request | HTTP | Result | Evidence |
| --- | --- | --- | --- | --- |
| A, before pairing | `GET /api/photos` | 403 | ok | No-space access rejected with `Join or create a space first`. |
| A | `GET /api/photos` before upload | 200 | ok | Empty gallery. |
| A | `POST /api/photos` with `Content-Type: text/plain` and a 12-byte body | 415 | ok | Rejected unsupported media type. |
| A | `POST /api/photos` with `Content-Type: image/png` and a 12-byte text body | 415 | ok | Rejected invalid PNG signature. |
| A | `POST /api/photos` with `Content-Type: image/png` and 5,242,881 bytes | 413 | ok | Rejected a request one byte over 5 MiB. |
| A | `POST /api/photos` with `Content-Type: image/png` and a 68-byte PNG | 200 | ok | Stored the object under `<spaceA>/<photo>`. |
| C | `GET /api/photos` | 200 | ok | Listed the shared photo with upload timestamp and signed URL. |
| Anonymous | `GET` the signed Storage URL returned to C | 200 | ok | Downloaded bytes matched the uploaded PNG. |
| B | `GET /api/photos` | 200 | ok | A's photo was absent and B's gallery was empty. |
| C | `GET /api/photos?offset=1` | 200 | ok | Returned an empty array after the sole photo. |
| B | `POST /storage/v1/object/list/gallery` with `{"prefix":"<spaceA>","limit":10}` | 200 | ok | Direct Storage list with B's JWT returned an empty array. |
| B | `GET /storage/v1/object/authenticated/gallery/<spaceA>/<photo>` | 400 | ok | Direct unsigned read returned `Object not found` under B's JWT. |
| B | `DELETE /api/photos/<photo>` | 204 | unclear contract | A's photo still appeared in A's next list. Isolation held. |
| A | `GET /api/photos` after B's delete | 200 | ok | Shared photo was still listed. |
| C | `DELETE /api/photos/<photo>` | 204 | ok | Partner deletion succeeded, confirmed by the next list request. |
| A | `GET /api/photos` after C's delete | 200 | ok | Gallery was empty. |
| A | `DELETE /api/photos/not-a-uuid` | 400 | ok | Rejected the malformed photo name. |
