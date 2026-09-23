# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E3-S1 — Unified Financial Position & Cross-Domain Aggregation Engine.

## Current status

**Complete.** `lib/domain/financial-position/` composes the eight prior
domains' canonical read functions into one Financial Position boundary —
`financial_position_by_currency()` (one new `SECURITY INVOKER` SQL
function, zero new tables) for per-currency NUMERIC aggregates, plus
`getFinancialPositionSummary()`'s parallel TypeScript-layer reads for
Goals/Decisions/Obligations. Net Worth (`liquidCash + nonCashAssetValue +
receivablesOutstanding − liabilitiesOutstanding`, per native currency,
never clamped) is the only new calculation this phase introduces — Safe
to Deploy, protected cash, allocation shortfall, potential liquidity, and
every list-shaped summary are read verbatim from their owning domain.
Reporting-currency Net Worth
(`convertFinancialPositionToReportingCurrency()`) converts each of the
four Net Worth components independently and combines only after all
succeed, returning `not_calculated` (never a partial sum) if any required
FX rate is missing. Verified against a real local Supabase stack, fresh
`supabase db reset`: 20 (Profile) + 37 (Money) + 11 (Currency) + 28
(Assets) + 27 (Receivables) + 25 (Liabilities) + 56 (Goals) + 86 (Rules/
Obligations) + 70 (Decisions) + 33 (Financial Position) = **393/393
assertions passed**. Migration was also pushed to the real remote
"Monatriq Dev" project this phase; schema deployment is confirmed there.

## Supabase environment state

Same remote project as P0-E2-S3 through S7: "monatriq's Project" (ref
`mvnwrkfcszazqqccmmxq`), already linked at the start of this phase — no
new confirmation needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 10 local migration timestamps
match remote exactly (20260922201924/210653/220526/221247/230750/
20260923120000/180000/220000/20260924100000/20260925090000 — the last one
is this phase's). The same benign, unrelated pg-delta catalog-caching
warning seen in every prior remote push (missing a certificate file inside
the CLI's own internal sandbox) appeared again; it did not affect schema
application, confirmed by the migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the isolation test suite was not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED, test
EXECUTION NOT RUN** against remote — local execution (393/393) is what
this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history twice this phase. One bug was found
and fixed before the final reset — but it was in the new test file's own
arithmetic (a manually-computed expected value, `1800 − 2000`, was
transcribed as `-1000` instead of `-200`), not in the migration or domain
layer; the migration and domain-layer TypeScript were both correct on the
first attempt.

## Files created

`supabase/migrations/20260925090000_create_financial_position_engine.sql`
`lib/domain/financial-position/{types,repository,aggregate}.ts`
`app/(app)/financial-position/page.tsx`
`components/financial-position/{NativePositionList,FocusGoalPanel,
ActiveDecisionsList}.tsx`
`supabase/tests/financial-position/run.ts`
`docs/reports/P0-E3-S1-unified-financial-position-engine.txt`

## Files modified

`components/layout/AppShell.tsx` (Financial Position nav link),
`lib/supabase/database.types.ts` (regenerated), `package.json`
(`test:financial-position` script, extended combined `test` script — no
new dependency added this phase, `package-lock.json` unchanged),
`docs/architecture/{FINANCIAL_DOMAIN_MODEL,MULTI_CURRENCY_MODEL,
SYSTEM_ARCHITECTURE}.md`, `docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.

The application layer reused `UpcomingObligationsList` from
`components/obligations/` unmodified rather than creating a duplicate —
Financial Position's obligations section is the exact same component
Rules' own page uses, fed the same `UpcomingObligation[]` shape.

## Migrations

One new migration:
`supabase/migrations/20260925090000_create_financial_position_engine.sql`.
Zero new tables. One new function, `financial_position_by_currency()` —
`security invoker`, `stable`, no arguments, returning one row per native
currency present in any of eight composed canonical functions
(`money_currency_totals()`, `asset_native_currency_totals()`,
`receivable_native_currency_totals()`, `liability_native_currency_
totals()`, `safe_to_deploy_by_currency()`, `asset_summary()`,
`receivable_summary()`, `goal_bucket_shortfalls()`). `REVOKE ALL ... FROM
PUBLIC, anon` / `GRANT EXECUTE ... TO authenticated` follows the same
convention as every prior domain's read function. Applied cleanly at the
schema level on both resets this phase.

## Architecture changes

- **Aggregation, not ownership — enforced by construction, not just by
  convention.** `financial_position_by_currency()`'s body is entirely
  CTEs selecting from other functions; it contains no independent
  balance/valuation/outstanding-amount arithmetic anywhere except the one
  Net Worth sum itself. There is no table this function reads directly
  other than through those eight functions.
- **Hybrid query strategy, chosen deliberately.** Per-currency NUMERIC
  aggregates (tabular, currency-keyed) go through the one composed SQL
  function to avoid N+1; Goals/Decisions/Obligations (list-shaped, not
  currency-keyed) are fetched in parallel at the TypeScript layer instead
  of being forced into the SQL row shape or fetched serially.
- **Honest-nullable-mapping extended to a fourth distinct case.**
  Prior domains distinguished true zero from missing from not-configured;
  this phase adds a fourth: `netWorth` (and its four components) are
  *always* a real number (defaulting an absent domain's contribution to 0
  via `coalesce`), because Net Worth is definitionally computable the
  moment any currency-relevant data exists anywhere for that currency —
  unlike `assetQuickSalePotential`/`receivablesEstimatedRecoverable`
  (`null`/"Not set" when nothing was ever recorded, via natural `SUM()`
  NULL-propagation) or Safe-to-Deploy's fields (`null` specifically when
  `safe_to_deploy_by_currency()` has no row for that currency at all).
- **Reporting-currency conversion converts components, never a pre-summed
  total.** `convertFinancialPositionToReportingCurrency()` calls
  `convertToReportingCurrency()` four times (once per Net Worth
  component, each internally summing across native currencies for that
  one component), and only combines the four results — via `decimal.js`
  — once every one of the four has succeeded. See MULTI_CURRENCY_MODEL.md
  §23.
- **New security pattern documented, not just followed.** A pure
  composition function calling only other `SECURITY INVOKER` functions,
  adding no new table/policy/grant beyond `EXECUTE` on itself, is safe
  specifically because privilege never changes hands anywhere in the
  chain. Written up as an explicit, reusable pattern for future
  cross-domain aggregation phases: `docs/security/
  SECURITY_AND_RLS_PRINCIPLES.md §20`.

## Known limitations

- Financial Position UI was validated the same way every prior domain's
  was: the isolation suite calling the exact repository functions the UI
  calls (33/33), plus `next build` + route-level smoke testing with and
  without Supabase config present. Not driven through a real browser.
- Recent Activity and a "This Month" figure are deliberately NOT included
  in `FinancialPositionSummary` this phase — Recent Activity would either
  duplicate Money's own activity read model or need a second one (neither
  is acceptable per the phase brief), and no canonical Money "this month"
  read model exists yet to reuse. Both are documented, deliberate gaps for
  Home's own integration phase.
- Reporting-currency conversion has no live FX integration — same
  standing limitation as Money/Rules/Decisions before it. Rates must be
  supplied explicitly by the caller.
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test:goals` / `test:rules` /
`test:decisions` / `test:financial-position` / `test` (all ten) run the
isolation suites. Remote project already linked — `supabase db push
--linked --dry-run` before any future real push, never `supabase db
reset` against it.

## Open questions

1. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
2. Timing of the curated final Stitch/design-reference set (unchanged).
3. Local-vs-remote RLS-testing policy (unchanged — still unresolved
   across eight phases now).
4. Account-deletion / data-removal flow (unchanged, now applies to
   Financial Position's read surface too, though it owns no data itself).
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
    (Decisions, P0-E2-S7) should be resolved with a second hypothetical-
    override parameter (unchanged, still deferred).
11. What "actual outcome" linkage looks like when eventually built
    (unchanged from P0-E2-S7).
12. Whether `CreateScenarioForm`'s field-visibility-by-decision-type logic
    should move server-side (unchanged from P0-E2-S7).
13. **New**: when Home is actually built, does it consume
    `getFinancialPositionSummary()` directly, or does a Home-specific
    aggregation layer wrap it (e.g. to add Recent Activity / This Month
    once those exist)? Left open deliberately — Home was explicitly out
    of scope this phase.
14. **New**: does a future historical-snapshot feature (explicitly
    deferred by this phase's brief) store periodic Financial Position
    captures, and if so, does it reuse `financial_position_by_currency()`
    as its source on a schedule, or need its own read path?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk).
2. Financial Position UI has only been smoke-tested at the route/build/
   repository-function level, not driven end-to-end through a browser.
3. The local-vs-remote RLS-testing policy remains unsettled across eight
   phases now.
4. `financial_position_by_currency()`'s `union`-based currency-discovery
   CTE means a ninth canonical source added by a future phase (e.g. a new
   domain with its own currency-keyed totals) must be added to that
   `union` explicitly, or that domain's currencies simply won't appear as
   rows even if every other column would otherwise resolve to 0/null for
   them — a documented, low-probability but real maintenance trap for
   whoever adds domain #9.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S2 — Home**, now with a genuine, complete Financial Position
aggregation (Net Worth, Liquid/Protected Position, Safe to Deploy,
Receivables/Liabilities, Potential Liquidity, Upcoming Obligations, Focus
Goal, Active Decisions) to build the real Home experience on top of —
plus, as a smaller-scoped alternative, a dedicated Money "This Month" read
model (documented as a known gap this phase) that a later Home phase would
otherwise need to invent ad hoc.
