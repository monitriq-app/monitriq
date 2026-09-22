# Profile RLS isolation suite

Proves that `public.profiles` row-level security is enforced by the
**database**, not just hidden by the frontend. Every assertion goes through
the real anon-key + PostgREST path (the same path the browser client uses),
against a **local** Supabase stack only — see `../shared/env.ts`, which
refuses to run against anything that isn't `127.0.0.1`/`localhost`.

The env loading, fixture-user creation, and assertion helpers this suite
uses are shared with `supabase/tests/money/` — see
`supabase/tests/shared/`.

## What it needs

- A running local Supabase stack: `npm run db:start` (requires Docker).
- A `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_TEST_SERVICE_ROLE_KEY`.
  `supabase start` prints the first two directly and the local
  `SERVICE_ROLE_KEY` under that name — put it in `.env.local` as
  `SUPABASE_TEST_SERVICE_ROLE_KEY` (see `.env.example`). **This key is
  test-harness-only** — it creates and deletes temporary auth fixture
  users via the Auth admin API. It is never imported by anything under
  `app/` or `components/`, is named `SUPABASE_TEST_*` (not
  `SUPABASE_SERVICE_ROLE_KEY`) specifically so it reads as obviously
  test-only, and must never be pointed at a real project (the local-only
  guard in `../shared/env.ts` exists to make that mistake fail loudly
  instead of silently creating/deleting real users).

## Running it

```
npm run db:start   # once, or after `npm run db:stop`
npm run test:rls
```

Exits non-zero if any assertion fails. Safe to re-run: it purges any
`@monatriq.test` fixture users left over from a previous crashed run before
creating fresh ones, and always deletes its own fixtures in a `finally`
block.

## What it proves

- Two independent users (fixtures) can each read/update only their own
  profile row.
- Neither can read, update, insert, or delete the other's row — including
  adversarial attempts (targeting another user's UUID in a filter, trying to
  insert a row with someone else's id, trying to reassign a row's own `id`
  to another user).
- Anonymous (unauthenticated) requests cannot read, insert, update, or
  delete any profile.
- Nobody — not even a user acting on their own row — can delete a profile
  (delete isn't implemented this phase; deny-by-default extends to that
  too).
- The `handle_new_user()` trigger creates exactly one profile row per
  signup, with `onboarding_completed = false`.
- The real `updateProfile()` repository function (the one
  `components/onboarding/OnboardingForm.tsx` calls) correctly flips
  `onboarding_completed` to `true` once all three required fields are set.
- The database rejects a malformed currency code and a non-existent IANA
  timezone.

## Files

- `run.ts` — the suite itself.
- `../shared/env.ts` — env loading + the local-only safety guard.
- `../shared/fixtures.ts` — creates/signs-in/cleans-up the two test users
  via the service-role admin API.
- `../shared/assert.ts` — a handful of assertion helpers, no test framework
  dependency (not justified at this phase — see
  docs/reports/P0-E2-S1-profile-rls-foundation.txt).
- `../tsconfig.json` — this directory runs under plain `node`, not Next.js's
  bundler, so it needs its own module resolution settings (see the comment
  at the top of `lib/domain/profile/types.ts` for why that module in
  particular uses relative imports instead of the `@/` alias).
