# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S3 — Currency Registry Hardening, Assets & Valuation Foundation.

## Current status

**Complete.** The currency registry is now comprehensive (158 ICU/CLDR-
sourced currencies, one canonical source of truth, the duplicated
application-level list removed and its removal enforced by a test). The
Assets domain (`asset_types`, `assets`, `asset_basis_events`,
`asset_valuations`, plus `create_asset()` and two narrow write RPCs, plus
four read functions) exists with RLS enabled and deny-by-default
policies/grants throughout. Verified against a real local Supabase stack:
20 (Profile, regression) + 37 (Money, regression) + 11 (currency registry)
+ 28 (Assets) = **96/96 assertions passed**. Migrations were also pushed
to a real remote project this phase (see below) — schema deployment is
confirmed there; RLS/isolation test *execution* remains local-only by
explicit instruction.

## Supabase environment state

**Changed this phase.** A Supabase project named "monatriq's Project"
(ref `mvnwrkfcszazqqccmmxq`) now exists in the account and was already
linked to this repository at the start of this phase — "Nemryn" (the
unrelated client project flagged in every prior phase) no longer even
appears in the account's project list. Rather than inferring intent from
there being one available project, this was confirmed explicitly with the
user before any action: yes, this is Monatriq Dev, and yes, push this
phase's migrations to it.

Sequence: `supabase db push --linked --dry-run` first (confirmed all 4
migrations were new — the remote had no migration history at all, i.e. a
genuinely fresh project, not one with existing data at risk), then
`supabase db push --linked --yes` (a migration-safe additive deploy, never
`supabase db reset`, which is a local-testing-only operation and was never
run against this project). Verified via `supabase migration list
--linked`: all 4 local migration timestamps match remote exactly.

**What was NOT done against remote, deliberately**: the RLS/adversarial
test suites were not executed against it. Those suites create and delete
real `auth.users` rows with `SUPABASE_TEST_SERVICE_ROLE_KEY` — this
phase's brief explicitly says to keep that key restricted to the local
fixture harness and not loosen the localhost-only guard in
`supabase/tests/shared/env.ts`, so remote validation for this phase is:
**schema deployment CONFIRMED, RLS/isolation test EXECUTION NOT RUN**
against remote — local execution (96/96) is what this phase's COMPLETE
status rests on, per the completion gate's own local-or-remote allowance.

All local validation still ran against the same local Docker stack as
prior phases, reset from migration history multiple times this phase.
`.env.local` needed rebuilding again at the start of this phase (another
IDE-extension interference, visible as a system notification) — rebuilt
cleanly, never printed.

## Currency registry changes

Expanded from P0-E2-S2's 26-code starter set to **158 currencies**
(`supabase/migrations/*_expand_currency_registry.sql`), derived from the
ECMA-402 `Intl` API's bundled ICU/CLDR data (Node v24.14.0, ICU 78.2) —
not typed from memory. Method: `Intl.supportedValuesOf('currency')` for
the code list (already excludes precious-metal and placeholder codes),
minus two further exclusions (XDR — IMF Special Drawing Rights; XSU — a
regional clearing unit, neither spendable personal-finance currency) and
two superseded historical codes with real replacements already present
(SLL→SLE, ZWL→ZWG); `Intl.DisplayNames`/`Intl.NumberFormat` for display
name, symbol, and `decimal_exponent`. Full reproducible method documented
in the migration file's header and
`docs/architecture/MULTI_CURRENCY_MODEL.md §3`. The migration is
idempotent (`ON CONFLICT DO UPDATE`) so the original 26 rows now carry the
same ICU-sourced metadata as the other 132 — one consistent source, not
"26 hand-typed + 132 generated."

## Currency source-of-truth resolution

`lib/domain/profile/currencies.ts` (P0-E2-S1's hand-maintained 26-entry
onboarding picker) is **deleted**. A new shared module,
`lib/domain/currency/` (`types.ts`, `repository.ts`, `format.ts`,
`conversion.ts` — the latter two relocated from `lib/domain/money/` this
phase, since they were never actually Money-specific), is the one
canonical currency stack. `listCurrencies()` there is called by Profile
onboarding (`app/onboarding/page.tsx`), Money bucket creation (`/money`),
and Assets (`/assets`) — verified by an explicit test asserting the
removed file no longer exists on disk
(`supabase/tests/currency/run.ts`), not just documented as removed.

## Files created

`supabase/migrations/*_expand_currency_registry.sql`,
`supabase/migrations/*_create_assets_domain.sql`
`lib/domain/currency/{types,repository}.ts` (new); `format.ts`,
`conversion.ts` moved here from `lib/domain/money/`
`lib/domain/assets/{types,repository,liquidity}.ts` (no static asset-type
list needed — unlike Money's bucket types, `asset_type` is a real DB-backed
registry, `asset_types`, fetched via `listAssetTypes()`)
`app/(app)/assets/page.tsx`
`components/assets/{AssetList,AssetsByCurrency,AddAssetForm}.tsx`
`supabase/tests/currency/run.ts`, `supabase/tests/assets/run.ts`
`docs/reports/P0-E2-S3-assets-multicurrency-foundation.txt`

## Files modified

`app/(app)/money/page.tsx`, `app/onboarding/page.tsx`,
`components/onboarding/OnboardingForm.tsx`,
`components/money/{ActivityList,BucketList,CashByCurrency,
CreateBucketForm}.tsx` (import paths, now reading `Currency`/
`formatCurrencyAmount` from `lib/domain/currency/`), `components/layout/
AppShell.tsx` (Assets nav link), `lib/domain/money/{types,repository}.ts`
(currency logic removed, re-exports kept where still convenient),
`lib/supabase/database.types.ts` (regenerated), `supabase/tests/rls/
{README.md,run.ts}` (import paths), `supabase/tests/money/run.ts`
(conversion import path), `supabase/tests/shared/{assert,env,
fixtures}.ts` (unchanged logic, see P0-E2-S2's equivalent note — these
were already shared, no further changes needed this phase beyond what
Assets' suite required, which was none), `package.json`/
`package.json` (test:currency/test:assets scripts — no new dependency added
this phase, `package-lock.json` unchanged),
`docs/architecture/{FINANCIAL_DOMAIN_MODEL,MULTI_CURRENCY_MODEL,
SYSTEM_ARCHITECTURE}.md`, `docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.

## Architecture changes

- **Asset cost basis and valuation are both append-only history**, same
  philosophy as `cash_movements`: `asset_basis_events` (signed amounts,
  current basis = `sum(amount)`) and `asset_valuations` (three distinct
  `valuation_type`s, latest row per type = current value). Neither table
  is ever edited; a correction is a new row.
- **Asset creation and valuation/basis recording never touch
  `financial_events`/`cash_movements`** — no code path connects them,
  tested explicitly. An existing asset can be onboarded with historical
  cost basis without fabricating today's cash movement.
- **`create_asset()` bundles the "Add Asset" form into one atomic RPC**
  (asset + optional initial basis + up to three optional initial
  valuations), same reasoning as Money's `record_*` functions.
- **New lesson beyond Money**: a trigger-derived, grant-excluded
  `user_id` column doesn't compose cleanly with the generated TypeScript
  client's `Insert` type for a *direct* single-table insert (Money never
  hit this because `cash_movements` is RPC-only). Resolved with two
  narrow `SECURITY INVOKER` wrappers (`record_asset_valuation()`,
  `record_asset_basis_event()`) — not a permissions workaround (the
  underlying grant+policy were already correct), purely to keep the
  TypeScript layer honest about what it can send. Full account:
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §14`.
- **Asset currency is immutable once it has history**, mirroring bucket
  currency exactly. Cross-currency valuations are rejected outright — no
  appraisal-conversion path exists this phase.
- **Potential Liquidity is a pure function, not a stored value**
  (`lib/domain/assets/liquidity.ts`): quick-sale estimate only when the
  user supplied one, `not_calculated` otherwise — no invented haircut.
- **`asset_native_currency_totals()` reuses the exact `CurrencyAmount`
  shape** `money_currency_totals()` returns, so the one shared
  `convertToReportingCurrency()` (relocated to `lib/domain/currency/`
  this phase) accepts either without translation — proves "one shared
  currency domain" isn't just a slogan.

## Known limitations

- Assets UI was validated the same way Money's was: the isolation suite
  calling the exact repository functions the UI calls (28/28), plus
  `next build` + route-level smoke testing. Not driven through a real
  browser.
- No cross-currency appraisal for Assets this phase — a valuation must be
  in the asset's native currency or is rejected.
- Asset basis events and valuations have no void/correction mechanism
  beyond "add a new row" — no `voided_at`-style flag exists on either
  table this phase (not requested, not built).
- Remote (Monatriq Dev) has the schema but has not been exercised by any
  test suite — see Supabase environment state.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test` (all four) run the isolation suites. A remote project is now
linked (`supabase link` already done) — `supabase db push --linked
--dry-run` before any future real push, never `supabase db reset` against
it.

## Open questions

1. Exact schema for Goals/Decisions/Financial Rules/Receivables/
   Liabilities/Businesses/Valuation History (asset valuation history now
   exists; the others remain deferred).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged — Assets now has a `business_interest` type, but no
   dedicated Businesses domain).
3. Exact "Safe to Deploy" formula inputs (unchanged).
4. Timing of the curated final Stitch/design-reference set (unchanged).
5. Now that a Monatriq Dev project exists: when should the RLS/isolation
   suites be run against it (if ever), or does local-only validation
   remain the permanent policy for this class of test?
6. Account-deletion / data-removal flow (unchanged, now applies to Assets
   data too).
7. **Resolved this phase**: currency source-of-truth duplication —
   reconciled, `lib/domain/profile/currencies.ts` removed.
8. Should FX transfer fees eventually be one combined RPC call (unchanged
   from P0-E2-S2).
9. **New**: should a future phase add cross-currency appraisal for
   Assets, and if so, does it reuse Money's `fx_rates` table or need its
   own?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there.
2. Assets UI has only been smoke-tested at the route/build/repository-
   function level, not driven end-to-end through a browser.
3. `asset_valuations`/`asset_basis_events` now have a `SELECT` grant to
   `authenticated` (needed for the `SECURITY INVOKER` read functions,
   same reasoning as `cash_movements` — see
   `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §13`) — RLS scopes it
   correctly (proven by the isolation suite), but any future code
   querying these tables directly instead of through the text-casting
   functions needs the same float-precision review as `cash_movements`.
4. The local-vs-remote RLS-testing policy (Open Question 5) isn't fully
   settled — if a future phase decides remote testing is needed, the
   safety guard in `supabase/tests/shared/env.ts` will need a deliberate,
   reviewed change, not an ad hoc bypass.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S1 — Home aggregation layer**, now with two real domains
(Money + Assets) to aggregate — the first real proof that "one shared
domain calculation, multiple consumers" holds once there's more than one
domain to combine, per
`docs/architecture/SYSTEM_ARCHITECTURE.md §4`. Alternatively, the
Receivables domain (explicitly deferred from this phase) or Liabilities,
both now able to follow the pattern proven three times over (`profiles`,
Money, Assets).
