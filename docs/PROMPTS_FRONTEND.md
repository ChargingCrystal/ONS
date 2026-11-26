# Frontend prompts (for Claude Code)

Copy-paste prompts for the frontend developer. Work through them in order; each prompt is one branch and one PR. Some prompts depend on backend work, noted in the table.

## How to use

1. Start every session with: `Read AGENTS.md and CLAUDE.md first.` Every prompt below repeats this on purpose.
2. Paste one prompt at a time.
3. Claude must **plan first and wait for your OK**.
4. Test first for logic, composables, stores and components (red, then green). Pure styling is exempt.
5. All user-facing strings go through i18n (de, en, nl). No hardcoded text.
6. Never edit `server/`, `supabase/`, `tests/` (backend tests) or `.github/`. If the backend must change, use **H2** and send the request to the backend developer.
7. Before every PR: `npm test && npm run build`.

## Order

| # | Prompt | Needs backend |
|---|--------|---------------|
| F1 | App shell, design tokens, i18n skeleton | - |
| F2 | Auth | - |
| F3 | Pairing flow | - |
| F4 | Dates table | P2 (error codes), P4 (categories) |
| F5 | Location and map | - |
| F6 | Dashboard | P7 (trend) |
| F7 | Photos | P6 |
| F8 | Realtime | P9 |
| F9 | Polish, a11y, E2E | - |
| F10 | Landing page and SEO | - |
| H1' | Adopt a contract change | after each backend H1 |
| H2' | Request a backend change | - |
| H3' | Integration check | before each milestone |

---

## F1 - App shell, design tokens, i18n skeleton

```text
Read AGENTS.md and CLAUDE.md first.

Task: Build the app shell.

Goal: A consistent layout, design tokens and a working language switcher (de, en, nl) that later pages plug into.

Scope: app.vue, layouts/, components/, assets/, locales/ (or i18n/), nuxt.config.ts (ask before changing).

Process:
1. Plan first and wait for my OK. Propose a styling approach (Tailwind vs UnoCSS vs plain CSS variables) with trade-offs; after I decide, record it in AGENTS.md (ask before editing it).
2. Define design tokens: colors, spacing, radius, type scale, dark mode. My partner is a graphic designer, so keep tokens easy to swap.
3. Set up @nuxtjs/i18n with de, en, nl, locale persisted, no hardcoded strings.
4. Layout with navigation (mobile first), skip link, focus styles.
5. Tests first for the language switcher and persistence.
6. Run: npm test && npm run build

Done when: language switch works and persists, layout is responsive, tokens are used instead of magic numbers.

Report: Decisions taken and what is stubbed.
```

## F2 - Auth

```text
Read AGENTS.md and CLAUDE.md first.

Task: Implement login, register, Google sign-in, logout and route protection.

Goal: Unauthenticated users cannot reach app pages; the API client sends the user's JWT.

Scope: pages/, middleware/, stores/, composables/useApi, plugins/ (read only unless asked).

Process:
1. Plan first and wait for my OK. The $supabase plugin is client-only (plugins/auth.client.ts), so authenticated pages must render client-side. Propose the SSR decision (ssr false for app routes, SSR kept for public pages).
2. Pinia session store; route middleware for protected pages.
3. useApi composable: Bearer token, one 401 handler (refresh or redirect), maps backend `data.code` to i18n message keys. Import types from shared/.
4. Tests first for the store, the middleware and useApi (401 handling, code mapping).
5. Accessible forms with inline validation errors.
6. Run: npm test && npm run build

Done when: login/register/logout work against local Supabase, protected routes redirect, errors are translated.

Report: SSR decision and anything the backend needs to provide (use H2' for requests).
```

## F3 - Pairing flow

```text
Read AGENTS.md and CLAUDE.md first.

Task: Build the create-space / join-with-invite flow.

Goal: Two users end up in the same space with a clear, friendly UX.

Scope: pages/, components/, composables/.

Process:
1. Plan first and wait for my OK.
2. States: no space yet, waiting for partner (show invite code with copy button), paired. Handle invite_invalid and already_paired codes with helpful translated messages.
3. Tests first for the composable and the state machine.
4. Run: npm test && npm run build

Done when: both partners can pair using two browsers.

Report: Open UX questions.
```

## F4 - Dates table

```text
Read AGENTS.md and CLAUDE.md first. Requires backend P2 and P4 (error codes, category keys).

Task: Build the dates list with create, edit, delete, search, filter, sort and pagination.

Goal: A fast, accessible table (cards on mobile) for planning dates.

Scope: pages/, components/, composables/.

Process:
1. Plan first and wait for my OK.
2. Use the contract in shared/ (DATE_CATEGORIES etc.). Category labels come from i18n by key.
3. Server-side filter/sort/search/pagination (50 per page) via /api/dates query params.
4. Status toggle planned/done, meeting time with timezone-aware display.
5. Empty, loading and error states. Optimistic update only if it stays simple.
6. Tests first for the composable and the form validation.
7. Run: npm test && npm run build

Done when: full CRUD works, all states are covered, keyboard accessible.

Report: Any contract gaps (use H2').
```

## F5 - Location and map

```text
Read AGENTS.md and CLAUDE.md first.

Task: Let users set their location and see the partner's location, distance and midpoint on a map.

Goal: The "how far apart are we, where could we meet" feature from the Lastenheft.

Scope: pages/, components/, composables/. Map library must be client-only.

Process:
1. Plan first and wait for my OK. Propose a map library (e.g. Leaflet) and the privacy UX (explicit consent before using the browser geolocation, manual city search as fallback, option to remove location).
2. Wrap the map in <ClientOnly>. Lazy-load the library.
3. Show distance and midpoint from the API response, do not recompute on the client.
4. Tests first for the composable (consent states, errors).
5. Run: npm test && npm run build

Done when: both locations and the midpoint render, and denying geolocation still works.

Report: Library choice and bundle size impact.
```

## F6 - Dashboard

```text
Read AGENTS.md and CLAUDE.md first. Requires backend P7.

Task: Build the dashboard.

Goal: Countdown to the next date plus at least two chart types.

Scope: pages/, components/, composables/. Chart library must be client-only.

Process:
1. Plan first and wait for my OK. Propose a lightweight chart library.
2. Countdown must use serverTime from the API to avoid wrong client clocks.
3. Charts: dates per month (trend) and category breakdown. Colors from design tokens, accessible without color alone, text alternative for each chart.
4. Tests first for the countdown logic (past, future, same day).
5. Run: npm test && npm run build

Done when: both charts and the countdown render with real data and an empty state.

Report: Bundle size impact.
```

## F7 - Photos

```text
Read AGENTS.md and CLAUDE.md first. Requires backend P6 (signed direct upload).

Task: Build the shared photo gallery.

Goal: Upload up to 5 MiB images (jpeg, png, webp) and browse them.

Scope: pages/, components/, composables/.

Process:
1. Plan first and wait for my OK.
2. Flow: request upload URL -> upload directly to storage -> confirm. Compress/resize on the client before upload.
3. Show progress, handle quota and type/size errors via error codes.
4. Grid with lazy loading, lightbox with keyboard support, delete with confirm.
5. Tests first for the upload composable (happy path, rejection, quota).
6. Run: npm test && npm run build

Done when: upload and delete work against local Supabase, and the gallery is accessible.

Report: Any contract gaps (use H2').
```

## F8 - Realtime

```text
Read AGENTS.md and CLAUDE.md first. Requires backend P9.

Task: Add live updates for dates, photos and partner location.

Goal: Changes by the partner appear without reloading.

Scope: composables/, stores/, components/.

Process:
1. Plan first and wait for my OK.
2. One composable per feed; subscribe on mount, unsubscribe on unmount; reconnect handling.
3. Merge incoming events into the existing store state without flicker.
4. Tests first with a mocked channel.
5. Run: npm test && npm run build

Done when: two browsers stay in sync.

Report: Edge cases (offline, duplicate events).
```

## F9 - Polish, accessibility, E2E

```text
Read AGENTS.md and CLAUDE.md first.

Task: Quality pass and end-to-end tests.

Goal: WCAG 2.1 AA, solid performance, and E2E coverage of the main flows.

Scope: pages/, components/, e2e tests (ask where they should live before creating a new top-level folder; Playwright config may touch shared files).

Process:
1. Plan first and wait for my OK.
2. Accessibility audit: contrast, keyboard navigation, focus order, labels, reduced motion.
3. Playwright E2E: register, pair, create date, upload photo, switch language.
4. Check Lighthouse (performance, accessibility, SEO) and fix the top issues.
5. Run: npm test && npm run build

Done when: E2E passes locally and the audit findings are fixed or listed.

Report: Remaining issues ranked.
```

## F10 - Landing page and SEO

```text
Read AGENTS.md and CLAUDE.md first.

Task: Build the public landing page.

Goal: A beautiful, fast, SEO-friendly page in de, en and nl.

Scope: pages/index.vue, components/, public/, locales/.

Process:
1. Plan first and wait for my OK. Leave clear slots for logo and illustrations from my partner (the graphic designer).
2. SSR/prerender this page. Meta tags, Open Graph, hreflang per language, sitemap, robots.txt, structured data (WebApplication).
3. Optimized images (modern formats, dimensions set), no layout shift.
4. Run: npm test && npm run build

Done when: Lighthouse SEO and performance are high on mobile and all three languages have correct metadata.

Report: Assets I still need to deliver.
```

---

## Handshake prompts

## H1' - Adopt a backend contract change

Run after the backend developer sends the "Frontend impact" text.

```text
Read AGENTS.md and CLAUDE.md first.

Task: The backend changed the API contract. Frontend impact:
<paste "Frontend impact" from the backend PR>

Process:
1. Read README API table and the shared/ types. Do not read server/ to infer behavior.
2. Plan first and wait for my OK: list the files in my paths that must change.
3. Tests first (update useApi/composable tests to the new shape), then adapt the code.
4. If shared/ and the described behavior disagree, stop and tell me; do not work around it.
5. Run: npm test && npm run build

Done when: the frontend matches the contract and tests are green.

Report: What changed and any contract problems found.
```

## H2' - Request a backend change

```text
Read AGENTS.md and CLAUDE.md first.

Task: I need a backend change that the frontend cannot do alone.

Scope: Do NOT edit server/, supabase/ or backend tests. Write the request only.

Process:
1. State the user-facing need (what the UI must do).
2. Propose the minimal API change: method, path, request, response, error codes, as zod-style types.
3. Say what you do meanwhile (mock, feature flag, or blocked).
4. Format it so I can paste it to the backend developer as a GitHub issue.

Done when: the request is concrete enough that the backend developer can answer yes/no without a call.

Report: The issue text.
```

## H3' - Integration check

```text
Read AGENTS.md and CLAUDE.md first.

Task: Verify that the frontend and the backend work together.

Scope: Report only. Do not edit server/ or supabase/.

Process:
1. Start local Supabase and the Nuxt app.
2. Walk through each flow in the UI with two users: register, pair, create date, set location, upload photo, view dashboard.
3. For each failure, decide whether it is a frontend bug (fix in my paths after my OK) or a backend/contract problem (write it up as in H2').
4. Check that every translated error code displays a message and no raw code appears.

Done when: every flow is marked pass or fail with an owner.

Report: Checklist with owner per failure.
```
