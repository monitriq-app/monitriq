# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S5 — Goals, Protected Allocations & Progress Foundation.

## Current status

**Complete.** The Goals domain (`goal_types`, `goals`, `goal_target_history`,
`goal_milestones`, `goal_allocation_events`, plus `create_goal()`,
`record_goal_target()`, `set_focus_goal()`, `record_goal_milestone()`,
`record_goal_allocation()`, `record_goal_release()`,
`record_goal_reallocation()`, and eight read functions) exists with RLS
enabled and deny-by-default policies/grants throughout. Core principle
("Goals do not own cash") is architecturally enforced, not just
documented: no code path in this migration ever writes to
`financial_events`/`cash_movements`. Verified against a real local
Supabase stack, fresh `supabase db reset`: 20 (Profile) + 37 (Money) + 11
(Currency) + 28 (Assets) + 27 (Receivables) + 25 (Liabilities) + 56
(Goals) = **204/204 assertions passed**. Migration was also pushed to the
real remote "Monatriq Dev" project this phase; schema deployment is
confirmed there; RLS/isolation test *execution* remains local-only by the
same explicit, standing instruction as every prior phase.

## Supabase environment state

Same remote project as P0-E2-S3/S4: "monatriq's Project" (ref
`mvnwrkfcszazqqccmmxq`), already linked at the start of this phase — no
new confirmation needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 6 local migration timestamps
match remote exactly (20260922201924/210653/220526/221247/230750/
20260923120000 — the last one is this phase's). The same benign,
unrelated pg-delta catalog-caching warning seen in every prior remote push
(missing a certificate file inside the CLI's own internal sandbox)
appeared again; it did not affect schema application, confirmed by the
migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the RLS/adversarial test suites were not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED,
RLS/isolation test EXECUTION NOT RUN** against remote — local execution
(204/204) is what this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history twice this phase (once after writing
the migration, once more after final documentation/type-regeneration
passes) — the migration applied cleanly on the first attempt both times,
no schema fixes were needed mid-phase.

## Files created

`supabase/migrations/*_create_goals_domain.sql`
`lib/domain/goals/{types,repository}.ts`
`app/(app)/goals/page.tsx`
`components/goals/{GoalList,CreateGoalForm,AllocateCashForm,
ReleaseReallocateForm,ShortfallBanner}.tsx`
`supabase/tests/goals/run.ts`
`docs/reports/P0-E2-S5-goals-protected-allocations-foundation.txt`

## Files modified

`components/layout/AppShell.tsx` (Goals nav link), `lib/supabase/
database.types.ts` (regenerated), `package.json` (`test:goals` script,
extended combined `test` script — no new dependency added this phase,
`package-lock.json` unchanged), `docs/architecture/{FINANCIAL_DOMAIN_MODEL,
MULTI_CURRENCY_MODEL,SYSTEM_ARCHITECTURE}.md`,
`docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.

## Architecture changes

- **Goals do not own cash — architecturally, not just by convention.** No
  function in this migration writes to `financial_events`/
  `cash_movements`. `goal_allocation_events` (the allocation ledger) has
  no `financial_event_id` column at all — unlike Receivables/Liabilities'
  ledgers, it structurally cannot have a cash effect. Creating a goal,
  changing its target, allocating/releasing/reallocating cash, and
  completing a milestone are all verified zero-cash-effect operations.
- **Four measurement types, one goal record.** `measurement_type`
  (`cash_target`/`debt_balance_target`/`monthly_income_target`/
  `milestone`) drives all progress math; `goal_type_code` (a separate,
  extensible descriptive registry — home_property, emergency_reserve,
  relocation, debt_payoff, ...) only supplies a creation-form default.
  Deliberately decoupled so a future goal type needs no schema change.
- **No `target_value`/`current_saved` column on `goals`** — the current
  target is always the latest row in append-only `goal_target_history`;
  current allocated funding is always derived from summing append-only
  `goal_allocation_events`. Same "derive, never store a mutable balance"
  discipline as every prior domain.
- **New concurrency lesson: allocation capacity requires row locking, not
  just a capacity check.** Every allocate/release/reallocate RPC issues
  `select ... for update` on the target bucket before computing
  available-to-allocate, so two concurrent allocation attempts against the
  same bucket serialize instead of both over-allocating it. Proven by a
  dedicated `Promise.allSettled` concurrency test. Full account:
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §16`.
- **Reallocation is one atomic operation** (`record_goal_reallocation()`)
  writing a release row on the source goal and an allocate row on the
  destination goal, sharing one bucket, in a single transaction — no
  `financial_operations`-style grouping table needed, since only the
  release-side row needs to carry the idempotency key (both rows commit
  together or not at all).
- **Allocation shortfall is reported, never silently rewritten.**
  `goal_bucket_shortfalls()` exposes `balance`/`allocated_total`/
  `shortfall` per bucket when cash later leaves an allocated bucket via an
  ordinary Money spend/transfer — Goals never intercepts that spend and
  never adjusts allocation history to hide the resulting shortfall.
- **Debt-payoff goals never duplicate a debt balance.** A
  `debt_balance_target` goal's progress is always read live from
  `liability_outstanding_principal()`; `starting_liability_balance` is a
  one-time frozen snapshot (never updated) purely for "how much did I owe
  when I started."
- **Recurring-income goals fabricate nothing.** `monthly_income_target`
  goals reject cash allocation outright and always report `not_calculated`
  progress — no heuristic reads unrelated income transactions to guess a
  current figure.
- **Required Pace is a labeled calculation, not advice** — `calculated` /
  `target_reached` / `no_target_date` / `no_target_amount` / `date_passed`
  / `not_applicable`, monthly cadence approximated via average
  days-per-month with partial periods rounding up, "today" computed from
  the caller's `profiles.timezone`. Full rationale:
  `docs/architecture/FINANCIAL_DOMAIN_MODEL.md §28`.
- **At most one focus goal**, enforced by a partial unique index
  regardless of write path — `set_focus_goal()` is a convenience RPC, not
  the actual invariant enforcement.

## Known limitations

- Goals UI was validated the same way every prior domain's was: the
  isolation suite calling the exact repository functions the UI calls
  (56/56), plus `next build` + route-level smoke testing with and without
  Supabase config present. Not driven through a real browser.
- No cross-currency allocation/reallocation this phase — same-currency-
  only, enforced at the database layer.
- No "At Current Pace" predictive forecasting — only the mathematical
  Required Pace calculation exists; a real contribution-history-based
  projection is deferred pending more historical data than the raw
  allocation ledger currently provides.
- No dedicated milestone-management UI (add/reorder/complete forms) this
  phase — the domain layer and RPCs are complete and tested
  (`createGoalMilestone`/`updateGoalMilestone`/`listGoalMilestones`), but
  `/goals` does not yet expose a milestone form, matching the brief's "do
  not over-design" instruction for this foundation-level screen.
- The five-step protected-fund override workflow (show impact, show
  conflict, allow cancel, allow override, record the override) is
  explicitly NOT built — that is P0-E2-S6's Financial Rules engine. This
  phase only makes `is_protected` and its totals exist and be queryable.
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test:goals` / `test` (all
seven) run the isolation suites. Remote project already linked —
`supabase db push --linked --dry-run` before any future real push, never
`supabase db reset` against it.

## Open questions

1. Exact schema for Decisions/Financial Rules/Businesses/Valuation History
   beyond what now exists (Goals is no longer open — implemented this
   phase).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
3. Exact "Safe to Deploy" formula inputs — now has all five domains'
   figures available (cash, assets, receivables, liabilities, goal
   allocations/shortfalls) but the formula itself remains undesigned and
   belongs to Financial Rules (P0-E2-S6), not Goals.
4. Timing of the curated final Stitch/design-reference set (unchanged).
5. Local-vs-remote RLS-testing policy (unchanged from P0-E2-S3's Open
   Question 5 — still unresolved across four phases now).
6. Account-deletion / data-removal flow (unchanged, now applies to Goals
   data too).
7. Should FX transfer fees eventually be one combined RPC call (unchanged
   from P0-E2-S2).
8. Should a future phase add cross-currency appraisal/recovery/payment/
   allocation, and if so, does it reuse Money's `fx_rates` table across
   all domains or need domain-specific handling (unchanged question, now
   also applies to Goals)?
9. Should Loan Proceeds get its own dedicated UI entry point (unchanged
   from P0-E2-S4 — still repository/RPC-only, no form wired in).
10. **New**: when P0-E2-S6 builds the Financial Rules/override engine,
    does it consume `goal_protected_allocation_totals()`/
    `goal_bucket_shortfalls()` directly, or does it need its own,
    richer read model combining protection + shortfall + upcoming
    obligations in one call?
11. **New**: should a future phase add a dedicated milestone-management UI
    (the domain/RPCs are complete; only the foundation-level `/goals`
    screen's forms are intentionally restrained)?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk, now
   larger schema surface).
2. Goals UI has only been smoke-tested at the route/build/repository-
   function level, not driven end-to-end through a browser.
3. `goal_target_history`/`goal_allocation_events` now have a `SELECT`
   grant to `authenticated` for the same reason every prior domain's
   ledger tables do (§13/§14/§15 of the security doc) — RLS scopes it
   correctly (proven by the isolation suite), but any future code querying
   these tables directly instead of through the text-casting read
   functions needs the same float-precision review.
4. The allocation-capacity row-locking mechanism (`select ... for update`)
   has been proven correct under the test suite's concurrency test, but
   has not been load-tested under realistic production concurrency
   levels.
5. The local-vs-remote RLS-testing policy (Open Question 5) remains
   unsettled across four phases now.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E2-S6 — Financial Rules & Protected-Fund Override Engine**, the
natural next step now that Goals exposes `is_protected`,
`goal_protected_allocation_totals()`, and `goal_bucket_shortfalls()`
specifically for a future rules engine to consume, per
`docs/architecture/FINANCIAL_DOMAIN_MODEL.md §9.2`. Alternatively,
**P0-E3-S1 — Home aggregation layer**, now with five real domains (Money,
Assets, Receivables, Liabilities, Goals) to aggregate.
