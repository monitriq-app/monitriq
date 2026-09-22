# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S1 — Supabase Environment, User Profile Foundation & RLS Isolation
Harness.

## Current status

**Complete.** The first user-owned table (`profiles`) exists with RLS
enabled and deny-by-default policies, verified against a real local
Supabase stack with a 20-test cross-user/adversarial/anonymous isolation
suite (all passing). Remote/production validation was **not run** — no
Monatriq Supabase project exists yet (see Supabase environment state
below); this phase's completeness rests entirely on local validation, per
the phase's own completion gate.

## Supabase environment state

- No Monatriq Supabase project exists. The Supabase CLI on this machine is
  authenticated and lists exactly one project — **"Nemryn"** — which
  belongs to an unrelated client and was never linked, queried, or
  otherwise touched by this phase.
- No production infrastructure was provisioned (explicitly out of scope
  without user instruction).
- Validation instead ran against a **local** Supabase stack
  (`supabase start`, Docker-based), initialized this phase
  (`supabase/config.toml`). Local analytics/vector containers were disabled
  (they require outbound network access to posthog.com, unavailable in
  this environment) — a local-dev-only setting with no effect on schema,
  RLS, or any deployed environment.
- `.env.local` (gitignored, never committed) points the app at this local
  stack. No real/production credentials exist anywhere in this repository
  or its history.

## Completed work

- Verified the git repository root is `/Users/datamatics/Monatriq` with a
  clean tree before starting (P0-E1-S2 was committed by the user between
  sessions).
- Reviewed `AGENTS.md`/`CLAUDE.md`: framework-generated Next.js 16
  guidance only, no secrets, no conflict with canonical docs. Left as-is.
- Recorded the amber/danger semantic colors approved in this phase's
  brief as **approved application-state colors, explicitly not brand
  colors** — updated `docs/design/VISUAL_CONSTITUTION.md` §5 and the
  code comment in `lib/styles/tokens.css` accordingly (resolves the open
  question from P0-E1-S2).
- `supabase init` — created `supabase/config.toml`.
- `supabase/migrations/20260922201924_create_profiles.sql` — the
  `profiles` table, RLS, grants, triggers (see docs/reports for full
  schema and rationale).
- Ran the migration against the local stack (`supabase db reset`),
  generated TypeScript types (`lib/supabase/database.types.ts`) via
  `supabase gen types typescript --local`.
- Built the Profile application layer: `lib/domain/profile/{types,
  repository,currencies}.ts`, `lib/supabase/get-current-profile.ts`.
- Built the onboarding flow: `app/onboarding/page.tsx`,
  `components/onboarding/OnboardingForm.tsx`, `components/ui/Select.tsx`.
- Extended `app/(app)/layout.tsx` with a second gate:
  authenticated-but-not-onboarded now redirects to `/onboarding` (was
  previously just authenticated-vs-not).
- `app/(app)/home/page.tsx` now reads the real profile
  (`preferred_name`/`first_name`) instead of the P0-E1-S2
  `user_metadata` placeholder.
- Built a 20-assertion RLS/adversarial/domain-correctness suite
  (`supabase/tests/rls/`) — all passing against the local stack. Full
  list in the phase report.
- Added `npm run db:start|db:stop|db:reset|db:types|test:rls` scripts.
- Full validation passed: `npm install`, `tsc --noEmit` (app +
  test-harness project), `eslint .`, `next build`, all clean; every route
  smoke-tested with `next dev` against the real local backend.

## Architecture changes

- **`profiles.id` = `auth.users.id`** (no separate surrogate key + unique
  `user_id`) — the simplest correct shape for a genuine 1:1-with-user
  table. Documented as the reference pattern in
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §10`, alongside when a
  *different*-cardinality future table (e.g. `transactions`) should
  instead use the original `user_id uuid references auth.users(id)`
  shape.
- **`onboarding_completed` is a stored generated column**
  (`first_name is not null and preferred_currency is not null and
  timezone is not null`), not a hand-maintained flag — cannot drift out
  of sync with the fields it summarizes.
- **`preferred_currency`/`timezone` are nullable, no default** — a
  profile row is created at signup, before onboarding; giving these a
  default would mean fabricating one (see Product Definition's "unknown
  remains unknown").
- **Row creation: `SECURITY DEFINER` trigger on `auth.users`, no
  client-facing INSERT policy at all** on `profiles`. Chosen over (a) a
  server-side post-signup call (real orphaned-user failure mode on a
  dropped request) and (b) a client-callable init RPC (same failure mode,
  plus it would need its own INSERT policy — exactly the attack surface
  this design closes). Full rationale in the migration file header and
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §10-11`.
- **Column-level GRANT, not just RLS `WITH CHECK`**, blocks ownership
  reassignment and audit-column tampering: `authenticated` only has
  `UPDATE` granted on `first_name, preferred_name, preferred_currency,
  timezone` — `id` and `created_at` are outside the grant entirely, so a
  forged payload including them fails at the permissions layer before
  RLS is even evaluated. `updated_at` is trigger-maintained.
- **Timezone validity is enforced by Postgres's own tz engine**
  (`perform now() at time zone new.timezone` inside a trigger), not a
  regex or a hand-maintained list — a CHECK constraint can't run a
  subquery, so this is the correct DB-layer mechanism available.
  `preferred_currency` gets a cheap regex format CHECK
  (`^[A-Z]{3}$`); full ISO 4217 membership validation is an
  application-layer concern (`lib/domain/profile/currencies.ts`).
- **`"type": "module"` added to `package.json`** so the Node-executed RLS
  test harness runs without a CJS/ESM interop warning. Verified this
  doesn't affect the Next.js build (all config files already use
  explicit `.mjs`/`.ts` extensions).
- **`lib/domain/profile/{types,repository}.ts` use relative, `.ts`-
  extensioned internal imports** instead of the `@/` alias, specifically
  so they resolve identically under Next's bundler and under plain
  `node` (the test harness imports `updateProfile` directly, to test the
  exact function the onboarding form calls — not a reimplementation of
  it). `allowImportingTsExtensions` was added to the root `tsconfig.json`
  to permit this; it only *permits* `.ts` extensions project-wide, it
  doesn't require them anywhere else.
- `supabase/tests/rls/` has its own `tsconfig.json` (Node/`nodenext`
  resolution) since it runs outside Next's bundler; excluded from the
  root tsconfig, typechecked separately via `npm run typecheck`.

## Known limitations

- Onboarding UI was validated by: (a) the RLS suite calling the exact
  `updateProfile()` function the form calls, against a live database, and
  (b) `next build` + route-level smoke testing with a real backend
  connected. It was **not** driven through a real browser (no headless
  browser tooling was added — not justified at this phase's scope).
- Currency list (`lib/domain/profile/currencies.ts`) is a curated ~25-code
  subset of ISO 4217, not the full standard — extendable without a
  migration.
- `first_name`/`preferred_name`/`preferred_currency`/`timezone` length and
  format constraints exist at the DB layer; no rate-limiting or abuse
  controls on profile updates (not in scope this phase).
- No account-deletion flow exists; `profiles` has no DELETE grant or
  policy for anyone, including a user deleting their own row.
- Carried over from P0-E1-S2: amber/danger tokens are approved for use
  (per this phase's brief) but still not literally in the brand pack —
  see `docs/design/VISUAL_CONSTITUTION.md §5` for the now-explicit
  distinction between brand colors and semantic UI colors.

## Current setup requirements

`npm run db:start` (requires Docker) to bring up the local stack, then
`supabase status -o env` to get the local URL/anon/service-role values for
`.env.local` (see `.env.example` for variable names — the app needs the
first two, the RLS suite additionally needs
`SUPABASE_SERVICE_ROLE_KEY`). `npm run db:types` regenerates
`lib/supabase/database.types.ts` after any migration change. `npm run
test:rls` runs the isolation suite (refuses to run against anything that
isn't localhost).

## Open questions

1. Exact Supabase schema for Money/Assets/Goals/Decisions/Financial
   Rules/Obligations/Receivables/Liabilities/Businesses/Valuation
   History/Decision Assumptions/Goal Allocations/financial event log —
   still deferred (unchanged from prior phases).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
3. Exact "Safe to Deploy" formula inputs (unchanged).
4. Timing of the curated final Stitch/design-reference set (unchanged).
5. **New:** when should an actual Monatriq Supabase project (dev and
   production, kept separate) be provisioned? This phase deliberately did
   not create one without instruction.
6. **New:** account-deletion / GDPR-style data-removal flow is unscoped —
   will need its own DELETE policy design when it's prioritized, not
   before.
7. **Resolved this phase:** `AGENTS.md`/`CLAUDE.md` — reviewed, contain
   only generic Next.js 16 framework guidance, no secrets, no conflict
   with canonical docs. Kept as committed.
8. **Resolved this phase:** amber/danger token values are approved for
   application-state use (not brand palette) — see Architecture changes.

## Risks

1. **No production Supabase project exists.** Every future data-layer
   phase will keep validating against local stacks only until one is
   provisioned — fine for correctness, but means zero production
   configuration (auth providers, email templates, custom domains, rate
   limits) has been decided or tested yet.
2. Onboarding's real UI has only been smoke-tested at the route/build
   level, not driven end-to-end through a browser — see Known
   Limitations.
3. The curated currency list will need real product input on which
   codes V1 actually supports before Money exists.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E2-S2 — Money domain schema & RLS** (transactions, cash buckets),
built directly on the now-proven `profiles` pattern
(`docs/security/SECURITY_AND_RLS_PRINCIPLES.md §10`), including its own
isolation test suite before being marked complete. Provisioning a real
Monatriq Supabase project (dev environment at minimum) is a prerequisite
worth deciding explicitly before or alongside that phase.
