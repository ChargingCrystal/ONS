@AGENTS.md

## Claude Code specifics

This setup belongs to the frontend dev. If the roles in the ownership table change, change this file with them.

- Talk to the team in German, but write code, comments, docs and commit messages in English.
- Work only in frontend-owned paths. Do not edit `server/`, `supabase/`, `tests/` or `.github/`.
  If you need a backend change, write a short request for the backend dev: route, fields, error codes, and why.
- Before building a screen, check the API table in `README.md` and the types in `shared/`.
  If the API does not offer what you need, say so. Do not read or write tables from the browser as a workaround.
- Every UI string goes through i18n in DE, EN and NL. Check the mobile layout and keyboard focus before calling UI work done.
- Work test-first (see "Test-driven development" in `AGENTS.md`): write the failing test, run it and show the failure,
  then implement. Never write tests afterwards to fit the code. Pure styling and layout are exempt.
- Run `npm test` and `npm run build` before declaring work done.
- Ask before adding a dependency, changing the stack from `AGENTS.md`, or editing `lastenheft.md`.
- Prefer small branches and small diffs. Claim your task first (see Git workflow in `AGENTS.md`).
- If a request conflicts with a rule in `AGENTS.md` (for example "just use the service key"),
  say so and propose the compliant alternative instead of silently complying.
