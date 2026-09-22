# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S2 — Money Domain Foundation, Multi-Currency Cash Engine & RLS.

## Current status

**Complete.** The Money domain (`currencies`, `cash_buckets`,
`financial_events`, `cash_movements`, `fx_rates`, plus five atomic
`record_*` SQL functions and three read functions) exists with RLS
enabled and deny-by-default policies/grants throughout, verified against a
real local Supabase stack with a 37-assertion isolation/adversarial/
financial-correctness suite (all passing), alongside the still-passing
20-assertion Profile suite from P0-E2-S1 — 57/57 total. Remote/production
validation was **not run** — no Monatriq Supabase project exists (see
Supabase environment state below); this phase's completeness rests
entirely on local validation, per the phase's own completion gate.

## Supabase environment state

Unchanged from P0-E2-S1: no Monatriq Supabase project exists. The only
project in this account, "Nemryn" (unrelated client), was never linked,
queried, or touched. Validation ran against the same local Supabase stack
(Docker-based), reset from migration history multiple times this phase to
confirm reproducibility. `.env.local` (gitignored, never committed, never
printed) points at it.

## Completed work

- Verified git root and a clean working tree before starting (P0-E2-S1 was
  committed by the user between sessions).
- Rebuilt `.env.local` cleanly (an IDE extension had appended stray/
  duplicate lines when the file was opened) and renamed the test-only
  service-role variable to `SUPABASE_TEST_SERVICE_ROLE_KEY` throughout
  (`.env.example`, the shared test harness, docs) — see Architecture
  changes.
- `supabase/migrations/*_create_money_domain.sql` — the full schema: see
  `docs/architecture/MULTI_CURRENCY_MODEL.md` and
  `docs/architecture/FINANCIAL_DOMAIN_MODEL.md §17-18` for the
  implementation record, and the phase report for the complete
  section-by-section detail.
- Regenerated `lib/supabase/database.types.ts` after the final schema
  change.
- Built the Money application layer: `lib/domain/money/{types, repository,
  format, conversion, bucket-types}.ts`. Currency metadata is read from the
  new `currencies` DB table via `repository.ts`'s `listCurrencies()`, not
  a second hardcoded list (bucket types are a small fixed set matching the
  DB CHECK constraint, so `bucket-types.ts` stays a plain local constant).
- Added `decimal.js` as the one arbitrary-precision decimal dependency
  used throughout `lib/domain/money/`.
- Refactored the P0-E2-S1 test harness: `env.ts`/`fixtures.ts`/`assert.ts`
  moved to `supabase/tests/shared/` (used by both `rls/` and the new
  `money/` suite) rather than duplicated; a single
  `supabase/tests/tsconfig.json` replaces the old per-folder one.
- Built a 37-assertion Money isolation/adversarial/correctness suite
  (`supabase/tests/money/run.ts`) — full list in the phase report. Added
  `npm run test:money` and a combined `npm run test`.
- Built the foundation-level `/money` route: cash-by-currency, cash
  buckets (with create form), record money received/spent, move money
  (same-currency and cross-currency), recent activity. No fake/seeded
  data — a new user sees "No cash buckets yet." / "No activity yet."
- Added a Home/Money nav link to `AppShell`.
- Found and fixed a second instance of the P0-E1-S2 concurrent-rendering
  lesson: `/money/page.tsx` fetched data unconditionally, so an
  unauthenticated visitor's concurrently-rendered page (even though the
  layout correctly redirects them away) threw an uncaught "permission
  denied" from a Money RPC call. Fixed the same way `/home` already
  handled it — check `getCurrentUser()` first, return `null` if absent.
  Caught by route-level `next dev` smoke testing, not by the build.
- Full validation passed: fresh `supabase db reset` from migration history
  (both migrations), `npm run typecheck`, `eslint .`, `next build` (both
  with and without `.env.local` present), `npm run test:rls` (20/20),
  `npm run test:money` (37/37).

## Architecture changes

- **`cash_buckets` has no stored balance column.** Balance is always
  `sum(cash_movements.amount)` for non-voided events, via
  `money_bucket_balances()`/`money_currency_totals()` — see
  `docs/architecture/MULTI_CURRENCY_MODEL.md §5, §9`.
- **One signed-amount convention everywhere**: `cash_movements.amount` is
  positive (credit) or negative (debit); no separate direction column.
- **cash_flow_class is a database-derived classification**, not
  client-trusted — a trigger computes it from `event_type` + category, so
  `receivable_recovery`/`asset_sale` land as `other_inflow` (not income)
  and `debt_payment` lands as `other_outflow` (not expense), directly
  implementing `FINANCIAL_DOMAIN_MODEL.md`'s "cash received ≠ income"
  principle at the database layer, not just in documentation.
- **All five `record_*` functions and all three read functions are
  `SECURITY INVOKER`** — no elevated privilege anywhere in the Money
  domain (contrast with Profile's necessary `SECURITY DEFINER` signup
  trigger). Atomicity comes from each being a single PL/pgSQL transaction,
  not from client-side sequential inserts.
- **Cross-tenant reference protection needed an `EXISTS` check in the
  RLS policy, not just an ownership column** — `cash_movements`
  references both a bucket and an event, so its INSERT policy validates
  both belong to `auth.uid()`, not just that the movement's own
  `user_id` does. See `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §13`.
- **A real design mistake, found by running the tests, not by review**:
  an early version denied `SELECT` on `cash_movements` entirely, intending
  to force all reads through text-casting functions. Since those functions
  are `SECURITY INVOKER`, they run as the calling user and need the same
  grant a direct query would — without it, even the user's own legitimate
  balance read failed with "permission denied". Fixed by granting
  `SELECT` (RLS ownership scoping is the real boundary; the precision
  protection is an application-layer discipline, not a database-enforced
  one) rather than switching those functions to `SECURITY DEFINER`, which
  would have been exactly the "use DEFINER to bypass permissions" pattern
  this project's security doc warns against. Full account in
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §13`.
- **Decimal precision, end to end**: `numeric(20,6)` for amounts,
  `numeric(24,12)` for FX rates, a trigger rejecting any amount with more
  fractional precision than its currency's `decimal_exponent` allows
  (tested explicitly for JPY/0-decimal and KWD/3-decimal), read functions
  casting to `text` to avoid PostgREST's JSON-number serialization of
  `numeric`, and `decimal.js` for any arithmetic in TypeScript. Full
  account in `docs/architecture/MULTI_CURRENCY_MODEL.md §6`.
- **Idempotency**: every `record_*` function accepts an optional
  client-generated `idempotency_key`; a retried call with the same key
  returns the original event (partial unique index on `(user_id,
  idempotency_key)`, plus a `unique_violation` exception handler for the
  race window between check and insert).
- **Correction = voiding only**, enforced as a one-way transition by a
  trigger (`enforce_financial_event_void_only`) — no editing, no
  automatic reversal events, this phase. `cash_movements` rows are never
  editable at all.
- **Test-only service-role variable renamed** `SUPABASE_SERVICE_ROLE_KEY`
  → `SUPABASE_TEST_SERVICE_ROLE_KEY` throughout, per this phase's explicit
  instruction — makes it visually obvious at a glance (in `.env.example`,
  in a diff) that it's not a production/application credential.
- **Test harness reshuffled into `supabase/tests/shared/`** so the Money
  suite doesn't duplicate the Profile suite's env-loading/fixture/
  assertion code — one place to get the local-only safety guard right,
  not two.

## Known limitations

- Money UI was validated by: (a) the isolation suite calling the exact
  repository functions the UI calls, against a live database (37/37), and
  (b) `next build` + route-level smoke testing with a real backend
  connected. Not driven through a real browser — same documented scope
  boundary as P0-E2-S1's onboarding UI.
- FX transfer fees are not automatically bundled into
  `record_fx_transfer()` — a fee is recorded as its own `money_spent`
  event (a fee is genuinely spending, not part of a neutral transfer),
  not automated into one call yet. No schema change needed to support
  this later.
- `lib/domain/profile/currencies.ts` (the onboarding picker) and the new
  `public.currencies` table are two separate, overlapping lists —
  duplication not yet reconciled (see Open Questions).
- Reporting-currency conversion (`convertToReportingCurrency()`) is built
  and tested but not wired into any UI — no rate source is presented to
  the user yet, so `/money` only ever shows per-currency totals.
- No account-deletion flow for Money data any more than for Profile (no
  DELETE grant/policy exists on any Money table for anyone).

## Current setup requirements

Unchanged from P0-E2-S1: `npm run db:start` (Docker), populate
`.env.local` from `supabase status -o env` (note the service-role value
now goes under `SUPABASE_TEST_SERVICE_ROLE_KEY`, not
`SUPABASE_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `npm run test:money` / `npm run test` (both)
run the isolation suites.

## Open questions

1. Exact schema for Assets/Goals/Decisions/Financial Rules/Obligations/
   Receivables/Liabilities/Businesses/Valuation History/Decision
   Assumptions/Goal Allocations — still deferred.
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
3. Exact "Safe to Deploy" formula inputs (unchanged).
4. Timing of the curated final Stitch/design-reference set (unchanged).
5. When should an actual Monatriq Supabase project be provisioned?
   (unchanged from P0-E2-S1).
6. Account-deletion / data-removal flow (unchanged from P0-E2-S1, now
   applies to Money data too).
7. **New:** reconcile `lib/domain/profile/currencies.ts` with
   `public.currencies` — should onboarding read the DB table instead of
   maintaining a parallel list?
8. **New:** should FX transfer fees eventually be a single combined RPC
   call instead of two separate ones (transfer + a manual fee entry)?
   Left as two deliberately this phase; worth revisiting once real
   product usage shows whether that's annoying.

## Risks

1. No production Supabase project exists yet — unchanged risk from
   P0-E2-S1, now applies to a larger schema.
2. Money UI has only been smoke-tested at the route/build/repository-
   function level, not driven end-to-end through a browser.
3. The currency-list duplication (Open Question 7) could drift silently
   if one list is updated and the other isn't — currently both are small
   and were kept in sync by hand this phase, but that doesn't scale.
4. `cash_movements` now has a `SELECT` grant to `authenticated` (see
   Architecture changes) — RLS correctly scopes it to the caller's own
   rows (proven by the isolation suite), but any future code that queries
   this table directly (instead of through the text-casting functions)
   would receive raw `numeric` JSON and needs to be reviewed for the
   float-precision risk documented in
   `docs/architecture/MULTI_CURRENCY_MODEL.md §6`.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S1 — Home aggregation layer** (a real, non-placeholder Home
screen consuming `money_bucket_balances()`/`money_currency_totals()` —
the first proof that "one shared domain calculation, multiple consumers"
actually works across screens, per
`docs/architecture/SYSTEM_ARCHITECTURE.md §4`) *or*, if schema breadth is
preferred first, **Assets domain schema & RLS**, built on the now-proven
pattern from both `profiles` and Money
(`docs/security/SECURITY_AND_RLS_PRINCIPLES.md §10, §13`).
