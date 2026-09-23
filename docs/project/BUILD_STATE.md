# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S7 — Decisions Engine, Scenario Evaluation & Decision Journal.

## Current status

**Complete.** The Decisions domain (`decision_types`, `decisions`,
`decision_scenarios`, `decision_choices`, `decision_scenario_evaluations`,
plus `create_decision()`, `create_decision_scenario()`,
`record_decision_choice()`, `evaluate_decision_scenario()`,
`save_decision_scenario_evaluation()`, and three read functions) exists
with RLS enabled and deny-by-default policies/grants throughout. Core
principle ("a Decision is a plan, never a transaction") is architecturally
enforced, not just documented: no function anywhere in this migration
writes to `financial_events`/`cash_movements`/`assets`/`liabilities`/
`goals`/`obligations` — verified explicitly across every write path,
including recording a `'proceed'` choice. Every liquidity/rule-conflict
figure reuses the established Safe-to-Deploy chain directly: P0-E2-S6A's
`evaluate_proposed_cash_use()` was itself refactored (its public behavior
fully preserved) so its core logic could be shared with Decisions'
cash-inflow evaluation need, rather than forked into a second formula.
Verified against a real local Supabase stack, fresh `supabase db reset`:
20 (Profile) + 37 (Money) + 11 (Currency) + 28 (Assets) + 27 (Receivables)
+ 25 (Liabilities) + 56 (Goals) + 86 (Rules/Obligations) + 70 (Decisions)
= **360/360 assertions passed**. Migration was also pushed to the real
remote "Monatriq Dev" project this phase; schema deployment is confirmed
there; RLS/isolation test *execution* remains local-only by the same
explicit, standing instruction as every prior phase.

## Supabase environment state

Same remote project as P0-E2-S3 through S6A: "monatriq's Project" (ref
`mvnwrkfcszazqqccmmxq`), already linked at the start of this phase — no
new confirmation needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 9 local migration timestamps
match remote exactly (20260922201924/210653/220526/221247/230750/
20260923120000/180000/220000/20260924100000 — the last one is this
phase's). The same benign, unrelated pg-delta catalog-caching warning
seen in every prior remote push (missing a certificate file inside the
CLI's own internal sandbox) appeared again; it did not affect schema
application, confirmed by the migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the RLS/adversarial test suites were not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED,
RLS/isolation test EXECUTION NOT RUN** against remote — local execution
(360/360) is what this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history three times this phase — two real
bugs were caught by the new test suite and fixed before the final reset
(both plpgsql `RECORD`-variable-assignment bugs, see Architecture changes
below and `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §19`).

## Files created

`supabase/migrations/*_create_decisions_domain.sql`
`lib/domain/decisions/{types,repository,aggregate}.ts`
`app/(app)/decisions/page.tsx`
`app/(app)/decisions/[decisionId]/page.tsx`
`components/decisions/{DecisionList,CreateDecisionForm,
CreateScenarioForm,ScenarioEvaluationPanel,DecisionJournal}.tsx`
`supabase/tests/decisions/run.ts`
`docs/reports/P0-E2-S7-decisions-engine-foundation.txt`

## Files modified

`components/layout/AppShell.tsx` (Decisions nav link), `lib/supabase/
database.types.ts` (regenerated), `package.json` (`test:decisions`
script, extended combined `test` script — no new dependency added this
phase, `package-lock.json` unchanged), `docs/architecture/
{FINANCIAL_DOMAIN_MODEL,MULTI_CURRENCY_MODEL,SYSTEM_ARCHITECTURE}.md`,
`docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.

The same migration also **refactored** (behavior-preserving)
`evaluate_proposed_cash_use()` — extracting its core logic into a new
shared, sign-agnostic function so Decisions could reuse it for cash-
inflow scenarios (P0-E2-S6A's version only ever modeled a spend). Its
public signature and return shape are unchanged; the full, unmodified
P0-E2-S6/S6A test suite (155 assertions) verifies this by continuing to
pass.

## Migrations

One new migration:
`supabase/migrations/*_create_decisions_domain.sql`. Five new tables
(`decision_types`, `decisions`, `decision_scenarios`, `decision_choices`,
`decision_scenario_evaluations`), one new shared function
(`evaluate_hypothetical_bucket_liquidity()`), `evaluate_proposed_cash_
use()` recreated via `CREATE OR REPLACE` (signature unchanged, body
delegates to the new shared function), and the Decisions-specific
creation/evaluation/journal RPCs and read models. Applied cleanly at the
schema level on all three resets this phase; two logic bugs (both in
`evaluate_decision_scenario()`'s plpgsql body, not the schema) were fixed
between resets.

## Architecture changes

- **A Decision is a plan, never a transaction — architecturally
  enforced.** No table outside `decision_*` is ever written to by any
  function in this migration. Creating a decision, creating a scenario,
  evaluating a scenario, saving an evaluation snapshot, and recording
  every one of the four user choices (including `'proceed'`) are all
  verified zero-financial-effect operations.
- **`linked_asset_id`/`linked_liability_id` live on `decisions`, not on
  each scenario** — the subject of consideration is shared by every
  scenario under one Decision (e.g. "Sell As-Is" vs. "Repair Then Sell"
  both concern the same asset). Neither link is type-enforced by a CHECK
  constraint, deliberately, so "Other" stays genuinely flexible.
- **`decision_scenarios` uses a moderate, deliberately-reused set of
  strongly-typed columns** (`cash_required`, `gross_proceeds`/
  `proceeds_costs`, `debt_principal_payment`/`debt_interest_payment`/
  `debt_fee_payment`, ...) — each with ONE economic role shared by name
  across every decision type that needs it, avoiding both a giant
  per-type column explosion and a JSONB/EAV bag of authoritative
  numbers. JSONB is used only for the immutable evaluation-snapshot
  audit trail, never for arithmetic.
- **One calculation model extended one layer deeper.** P0-E2-S6A already
  established "Safe-to-Deploy has exactly one formula." This phase
  extends that to "hypothetical bucket liquidity has exactly one
  formula" — `evaluate_hypothetical_bucket_liquidity(bucket, delta)`
  accepts any sign of delta and is now the shared core both
  `evaluate_proposed_cash_use()` (Rules UI, spend-only) and
  `evaluate_decision_scenario()` (Decisions, either direction) consume.
- **Facts, assumptions, and derived values are kept structurally
  distinct** at both the SQL return shape and the TypeScript type level —
  facts are read live from `asset_summary()`/`liability_outstanding_
  principal()`/`cash_movements` on every call (never copied), assumptions
  are echoed back exactly as entered (never auto-substituted — a sell
  scenario never uses an asset's target value as the sale price unless
  the user enters it), and derived figures are always computed fresh,
  never stored.
- **New lesson: a plpgsql `RECORD` variable only conditionally populated
  via `IF ... THEN SELECT INTO ... END IF` (no `ELSE`) is unsafe if read
  later unconditionally.** Caught by the new test suite's no-linked-
  asset/no-linked-bucket cases (six failures across two rounds, "record
  is not assigned yet" then "record has no field ..."), fixed by
  removing the guard where the source query is safe to run empty
  (`asset_summary()`) and by adding an explicitly-column-aliased
  literal-`NULL` `ELSE` branch where it isn't (`evaluate_hypothetical_
  bucket_liquidity()`, which raises for an unknown bucket). Full
  account: `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §19`.

## Known limitations

- Decisions UI was validated the same way every prior domain's was: the
  isolation suite calling the exact repository functions the UI calls
  (70/70), plus `next build` + route-level smoke testing with and
  without Supabase config present. Not driven through a real browser.
- A scenario naming both a source and a genuinely different destination
  bucket has only its source bucket's outflow modeled through the
  hypothetical Safe-to-Deploy chain — a documented, narrow scope
  limitation (realistic only for a generic "other" scenario; none of the
  other nine canonical decision types need two buckets simultaneously).
- No amortization schedule is computed for `take_debt` scenarios —
  `interest_rate`/`term_months`/`monthly_payment_assumption` are recorded
  assumptions only, per the phase brief's explicit instruction.
- Actual-outcome (expected vs. actual) comparison is an explicit, clean
  extension point, not implemented this phase — a Decision without a
  linked real transaction has no "actual outcome" concept yet.
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test:goals` / `test:rules` /
`test:decisions` / `test` (all nine) run the isolation suites. Remote
project already linked — `supabase db push --linked --dry-run` before any
future real push, never `supabase db reset` against it.

## Open questions

1. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
2. Timing of the curated final Stitch/design-reference set (unchanged).
3. Local-vs-remote RLS-testing policy (unchanged — still unresolved
   across seven phases now).
4. Account-deletion / data-removal flow (unchanged, now applies to
   Decisions data too).
5. Should FX transfer fees eventually be one combined RPC call
   (unchanged).
6. Should a future phase add cross-currency handling across domains
   (unchanged).
7. Should Loan Proceeds get its own dedicated UI entry point (unchanged).
8. Should a future phase add a dedicated milestone-management UI
   (unchanged).
9. Should `financial_rules.rule_type` grow additional values (unchanged
   from P0-E2-S6).
10. **New**: should the scenario-with-two-different-buckets scope
    limitation be resolved with a second hypothetical-override parameter
    on the shared Safe-to-Deploy chain, the same way P0-E2-S6A resolved
    the multi-bucket-goal limitation? None of the ten canonical decision
    types currently need it, so this remains deferred until a real need
    appears.
11. **New**: what does "actual outcome" linkage look like when it is
    eventually built — does `record_decision_choice(proceed)` gain an
    optional link to the real Money/Asset/Liability event it led to, or
    does the journal infer it heuristically? Deliberately left open this
    phase, per the brief's "leave a clean extension point" instruction.
12. **New**: should `CreateScenarioForm`'s field-visibility-by-decision-
    type logic move server-side (e.g. into the decision_types registry
    as metadata) rather than living as a client-side constant list, once
    more decision types or a richer form experience is needed?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk, now
   the largest schema surface yet).
2. Decisions UI has only been smoke-tested at the route/build/repository-
   function level, not driven end-to-end through a browser.
3. `decision_scenarios`/`decision_choices`/`decision_scenario_evaluations`
   have a `SELECT` grant to `authenticated` for the established reason
   every prior domain's ledger/detail tables do (§13-18 of the security
   doc) — RLS scopes it correctly (proven by the isolation suite), but
   any future code querying these tables directly instead of through the
   text-casting read functions needs the same float-precision review.
4. The documented two-different-buckets scope limitation (Known
   limitations, above) means a scenario's destination-bucket inflow is
   shown as a fact but not combined into the same hypothetical Safe-to-
   Deploy view as the source-bucket outflow when they differ — a coarse,
   honest, but incomplete signal for that narrow case.
5. The local-vs-remote RLS-testing policy remains unsettled across seven
   phases now.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S1 — Home aggregation layer**, now with seven real domains
(Money, Assets, Receivables, Liabilities, Goals, Rules/Obligations/Safe-
to-Deploy, Decisions) to aggregate — Home can finally show a genuinely
complete financial position, including upcoming obligations and active
decisions, without inventing a new calculation of its own. Alternatively,
Financial Rules could grow additional rule types now that Decisions
proves the rule-relationship vocabulary generalizes beyond Rules' own UI.
