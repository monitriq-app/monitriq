# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E3-S1A — Home Readiness: Monthly Money Summary, Reporting FX Context &
Liquidity Completeness.

## Current status

**Complete.** A narrow, three-part Home-readiness phase closing the
remaining data/read-model gaps identified at the end of P0-E3-S1 — no new
product domain, no redesign of any foundation screen. (A) `money_period_
summary()`/`resolve_period_bounds()`: Money's canonical "This Month" /
period-summary boundary, classified purely from `financial_events.cash_
flow_class` (never `event_type`), timezone-correct via `coalesce(profiles.
timezone, 'UTC')`. (B) `record_manual_reporting_rate()`/`reporting_fx_
rates()`: manual reporting-FX context reusing `public.fx_rates` (P0-E2-S2)
exactly as designed — zero new FX subsystem — with direct/inverse
resolution done via `decimal.js` in TypeScript
(`lib/domain/currency/reporting-rates.ts`), and transaction-actual rates
structurally excluded from ever being selected as a reporting rate. (C)
`asset_quicksale_coverage()`/`receivable_recoverability_coverage()`:
per-currency completeness metadata (not_set/partial/complete) for
quick-sale and recoverability estimates, reading the same canonical
sources Financial Position already uses. `getFinancialPositionSummary()`
was extended to compose all three in, plus a `reportingPosition` field
computed from the user's own stored manual rates via the unchanged,
reused `convertFinancialPositionToReportingCurrency()` (P0-E3-S1) — no
rate-map construction pushed onto Home. Zero new tables this phase — six
new `SECURITY INVOKER` functions only. Verified against a real local
Supabase stack, fresh `supabase db reset`: 20 (Profile) + 37 (Money) + 11
(Currency) + 28 (Assets) + 27 (Receivables) + 25 (Liabilities) + 56
(Goals) + 86 (Rules/Obligations) + 70 (Decisions) + 33 (Financial
Position) + 30 (Home Readiness) = **423/423 assertions passed**.
Migration was also pushed to the real remote "Monatriq Dev" project this
phase; schema deployment is confirmed there.

## Supabase environment state

Same remote project as every phase since P0-E2-S3: "monatriq's Project"
(ref `mvnwrkfcszazqqccmmxq`), already linked at the start of this phase —
no new confirmation needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 11 local migration timestamps
match remote exactly (20260922201924/210653/220526/221247/230750/
20260923120000/180000/220000/20260924100000/20260925090000/20260926090000
— the last one is this phase's). The same benign, unrelated pg-delta
catalog-caching warning seen in every prior remote push (missing a
certificate file inside the CLI's own internal sandbox) appeared again; it
did not affect schema application, confirmed by the migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the isolation test suite was not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED, test
EXECUTION NOT RUN** against remote — local execution (423/423) is what
this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history twice this phase. Two real bugs were
found and fixed before the final reset:

1. **A genuine migration bug** — `money_period_summary()`'s original
   `coalesce(sum(...), 0)::text` pattern lost NUMERIC's declared scale
   whenever a filtered `sum()` matched zero rows (Postgres's bare integer
   literal `0` has no scale, unlike `numeric(20,6)`), producing `"0"`
   instead of `"0.000000"` for any currency/field with no matching
   activity — the exact same class of bug documented from an earlier
   phase. Fixed by casting every fallback to `0::numeric(20, 6)`
   explicitly, matching `financial_position_by_currency()`'s own
   established pattern.
2. Two test-file mistakes (not migration/domain bugs): an amount recorded
   with more decimal places than CHF's registered precision allows, and
   two rate-string equality assertions that didn't account for
   `fx_rates.rate` (`numeric(24,12)`) always casting to a full
   12-decimal-place text representation — both fixed in the test file
   (the second by comparing via `decimal.js` equality instead of exact
   string match, which is also more robust going forward).

## Files created

`supabase/migrations/20260926090000_create_home_readiness_data_foundation.sql`
`lib/domain/currency/reporting-rates.ts`
`supabase/tests/home-readiness/run.ts`
`components/financial-position/{ReportingPositionPanel,ReportingRateForm,
MonthlyMoneySummaryPanel,LiquidityCoveragePanel}.tsx`
`docs/reports/P0-E3-S1A-home-readiness-data-foundation.txt`

## Files modified

`lib/domain/currency/{types,repository}.ts` (manual reporting-rate types +
read/write functions), `lib/domain/money/{types,repository}.ts`
(`MoneyPeriodSummary`, `getMoneyPeriodSummary()`), `lib/domain/assets/
{types,repository}.ts` (`AssetQuickSaleCoverage`, `getAssetQuickSaleCoverage()`),
`lib/domain/receivables/{types,repository}.ts`
(`ReceivableRecoverabilityCoverage`, `getReceivableRecoverabilityCoverage()`),
`lib/domain/financial-position/{types,repository}.ts` (extended
`FinancialPositionSummary` with `reportingPosition`, `reportingRateContext`,
`thisMonth`, `assetQuickSaleCoverage`, `receivableRecoverabilityCoverage`;
`getFinancialPositionSummary()` composes all five in — `aggregate.ts`
itself is UNCHANGED, reused as-is), `app/(app)/financial-position/page.tsx`
(Reporting Position + manual-rate form, This Month, Liquidity Completeness
sections), `lib/supabase/database.types.ts` (regenerated), `package.json`
(`test:home-readiness` script, extended combined `test` script — no new
dependency added this phase, `package-lock.json` unchanged),
`docs/architecture/{FINANCIAL_DOMAIN_MODEL,MULTI_CURRENCY_MODEL,
SYSTEM_ARCHITECTURE}.md`.

`docs/security/SECURITY_AND_RLS_PRINCIPLES.md` was deliberately NOT
modified — every new function this phase follows the already-documented
§20 pattern (pure composition over `SECURITY INVOKER` functions) or the
already-established owned-row-insert pattern (`record_manual_reporting_
rate()`); no genuinely new security pattern was introduced.

## Migrations

One new migration:
`supabase/migrations/20260926090000_create_home_readiness_data_foundation.sql`.
Zero new tables. Six new functions, all `SECURITY INVOKER`:
`resolve_period_bounds()`, `money_period_summary()`,
`record_manual_reporting_rate()`, `reporting_fx_rates()`,
`asset_quicksale_coverage()`, `receivable_recoverability_coverage()`.
`financial_position_by_currency()` (P0-E3-S1) is completely untouched —
zero regression risk to its own 33/33 suite, confirmed by the full
regression run. Applied cleanly at the schema level on both resets this
phase (after the `coalesce` scale fix above).

## Architecture changes

- **Classification-based, not enumeration-based, period filtering.**
  `money_period_summary()` filters by `financial_events.cash_flow_class`
  (`income`/`other_inflow`/`expense`/`other_outflow`/`transfer`/
  `opening_balance`) rather than hand-listing `event_type` values — this
  makes it automatically correct for any future event type as long as its
  `cash_flow_class` is set correctly, with no change to this function
  required.
- **One period-bounds resolver, called both directly and internally.**
  `resolve_period_bounds()` exists so a period with zero activity in every
  currency still has real, knowable bounds — `money_period_summary()`
  alone (a table function with no matching currency rows) would otherwise
  give no way to know which period was actually evaluated.
- **Reused, not duplicated, FX infrastructure.** `record_manual_reporting_
  rate()`/`reporting_fx_rates()` add a self-documenting entry point over
  the EXISTING `public.fx_rates` table (P0-E2-S2) — no schema change was
  needed, since that table's own original design comment already
  anticipated `source='manual'` "standalone user notes." Transaction-
  actual rates remain structurally invisible to reporting resolution (the
  SQL filters `source = 'manual'` explicitly), so a past transaction's
  rate is never silently reused as a current valuation rate — see
  MULTI_CURRENCY_MODEL.md §24.
- **Direct/inverse resolution lives in TypeScript, not SQL.**
  `reporting_fx_rates()` returns raw, unmodified rows in either direction;
  `resolveReportingRates()` (pure function, `lib/domain/currency/
  reporting-rates.ts`) decides direct-vs-inverse precedence and performs
  the inversion via `decimal.js` — keeping the "no binary-float authoritative
  arithmetic" discipline in exactly one place, and keeping the new SQL
  function itself simple and auditable.
- **`aggregate.ts` (P0-E3-S1) reused completely unchanged.**
  `getFinancialPositionSummary()` resolves the user's own rates into a
  plain `Map<string,string>` and passes it to the existing
  `convertFinancialPositionToReportingCurrency()` — zero new combination
  arithmetic was written this phase; the only new code is rate resolution
  and provenance, layered on top.
- **`reportingPosition` is a genuine three-state field**, not two:
  `null` when no reporting currency is configured at all (a more
  fundamental gap than a missing rate), `not_calculated` when the
  reporting currency is known but a rate is missing, `calculated`
  otherwise. This preserves the honest-nullable-mapping discipline every
  prior domain follows rather than collapsing two different kinds of
  "unavailable" into one.
- **Coverage metadata reads the same canonical sources Financial Position
  already uses**, never a second raw-table query — `asset_quicksale_
  coverage()`/`receivable_recoverability_coverage()` read `asset_summary()`/
  `receivable_summary()`, so their sums stay trivially consistent with
  `financial_position_by_currency()`'s `assetQuickSalePotential`/
  `receivablesEstimatedRecoverable` by construction, not by a
  cross-checking test alone (though that's also verified).

## Known limitations

- The new `/financial-position` UI additions (Reporting Position panel,
  manual-rate entry form, This Month, Liquidity Completeness) were
  validated the same way every prior domain's was: the isolation suite
  calling the exact repository functions the UI calls (30/30), plus
  `next build` + route-level smoke testing with and without Supabase
  config present. Not driven through a real browser.
- The manual reporting-rate entry form always records the rate against
  the user's own `preferred_currency` as `quoteCurrency` — there is no UI
  path to record an inverse-direction or third-currency rate; the domain
  layer (`resolveReportingRates()`) supports inverse resolution, but nothing
  in the UI exercises recording one. Acceptable for this phase's
  restrained-integration goal; a fuller rate-management UI is future work.
- No live FX provider integration exists or is planned by this phase — V1
  remains manual-first throughout, unchanged from the standing decision.
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test:goals` / `test:rules` /
`test:decisions` / `test:financial-position` / `test:home-readiness` /
`test` (all eleven) run the isolation suites. Remote project already
linked — `supabase db push --linked --dry-run` before any future real
push, never `supabase db reset` against it.

## Open questions

1. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
2. Timing of the curated final Stitch/design-reference set (unchanged).
3. Local-vs-remote RLS-testing policy (unchanged — still unresolved
   across nine phases now).
4. Account-deletion / data-removal flow (unchanged).
5. Should FX transfer fees eventually be one combined RPC call
   (unchanged).
6. Should a future phase add cross-currency handling across domains
   (unchanged).
7. Should Loan Proceeds get its own dedicated UI entry point (unchanged).
8. Should a future phase add a dedicated milestone-management UI
   (unchanged).
9. Should `financial_rules.rule_type` grow additional values (unchanged
   from P0-E2-S6).
10. Whether the scenario-with-two-different-buckets scope limitation
    (Decisions, P0-E2-S7) should be resolved (unchanged, still deferred).
11. What "actual outcome" linkage looks like when eventually built
    (unchanged from P0-E2-S7).
12. Whether `CreateScenarioForm`'s field-visibility-by-decision-type logic
    should move server-side (unchanged from P0-E2-S7).
13. When Home is actually built, does it consume `getFinancialPositionSummary()`
    directly, or does a Home-specific aggregation layer wrap it (unchanged
    from P0-E3-S1 — now more directly answerable, since the summary is
    materially more complete).
14. Does a future historical-snapshot feature reuse `financial_position_
    by_currency()`/`money_period_summary()` as its source on a schedule
    (unchanged from P0-E3-S1).
15. **New**: should the manual reporting-rate UI eventually let a user
    record a rate in the non-default direction (currency → currency, not
    just currency → reporting), now that the domain layer already
    supports resolving either direction?
16. **New**: should a future phase add a live FX provider as a second
    `fx_rates.source` value, and if so, does `reporting_fx_rates()` need a
    source-preference order (e.g. manual override beats provider) or does
    manual remain exclusively authoritative even then?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk).
2. The new UI additions have only been smoke-tested at the route/build/
   repository-function level, not driven end-to-end through a browser.
3. The local-vs-remote RLS-testing policy remains unsettled across nine
   phases now.
4. `financial_position_by_currency()`'s `union`-based currency-discovery
   CTE (P0-E3-S1) still means a future canonical source added to Financial
   Position's own composition must be added to that `union` explicitly —
   unaffected by this phase but still an open maintenance trap for a
   future domain #9 (unchanged from P0-E3-S1).
5. **New**: a manual reporting rate has no expiry or staleness indicator
   beyond `rate_as_of` itself — a rate recorded once and never updated
   will keep resolving as "the" reporting rate indefinitely, with no
   automatic staleness warning. The domain layer exposes `rate_as_of`
   for Home to build a staleness indicator against, but nothing does so
   yet.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S2 — Home**, now with every remaining data-foundation gap closed:
a genuine, complete Financial Position aggregation (Net Worth, Liquid/
Protected Position, Safe to Deploy, Receivables/Liabilities, Potential
Liquidity with completeness metadata, Upcoming Obligations, Focus Goal,
Active Decisions, This Month, and a reporting-currency consolidated view
using the user's own stored rates) to build the real Home experience on
top of, with no remaining "Home would need to invent this" gaps
documented anywhere in this file.
