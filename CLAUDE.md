@AGENTS.md

## Claude Code specifics

- Talk to the team in German, but write code, comments, docs and commit messages in English.
- Before changing anything under `supabase/` (schema, RLS, grants), show the SQL you intend to add and
  explain which policy protects which table. Extend `tests/isolation.test.mjs` in the same change.
- Run `npm test` after every change in `server/` or `supabase/`, and `npm run build` before declaring work done.
- Ask before adding a dependency, changing the stack from `AGENTS.md`, or editing `lastenheft.md`.
- Prefer small branches and small diffs. Work from `docs/BACKLOG.md` in the order listed unless told otherwise.
- If a request conflicts with an architecture rule in `AGENTS.md` (for example "just use the service key"),
  say so and propose the compliant alternative instead of silently complying.
