# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S6A — Safe-to-Deploy Evaluator Consistency Hardening.

## Current status

**Complete.** The P0-E2-S6 second-order limitation — `evaluate_proposed_
cash_use()` only fully recomputing protected-obligation coverage when the
affected goal was funded from a single bucket — is resolved
architecturally, not patched. `goal_backed_protected_allocation()`,
`rules_uncovered_protected_obligations()`, and `safe_to_deploy_by_
currency()` each gained two optional parameters
(`p_hypothetical_bucket_id`, `p_hypothetical_delta`); with no arguments
they compute exactly the real current state (verified: the full,
unmodified P0-E2-S6 test suite still passes against the refactored
functions), and `evaluate_proposed_cash_use()` now calls `safe_to_deploy_
by_currency()` twice — once for real state, once with the proposed
bucket's hypothetical delta applied — rather than containing any
independent formula. Every worked case in the phase brief was reproduced
exactly. The evaluator remains a pure read (verified explicitly); override
snapshots automatically benefit from the fix with no changes to
`record_cash_use_override()` at all. Verified against a real local
Supabase stack, fresh `supabase db reset`: 20 (Profile) + 37 (Money) + 11
(Currency) + 28 (Assets) + 27 (Receivables) + 25 (Liabilities) + 56
(Goals) + 86 (Rules/Obligations, 69 from P0-E2-S6 + 17 new hardening
tests) = **290/290 assertions passed**. Migration was also pushed to the
real remote "Monatriq Dev" project this phase; schema deployment is
confirmed there; RLS/isolation test *execution* remains local-only by the
same explicit, standing instruction as every prior phase.

## Supabase environment state

Same remote project as P0-E2-S3 through S6: "monatriq's Project" (ref
`mvnwrkfcszazqqccmmxq`), already linked at the start of this phase — no
new confirmation needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 8 local migration timestamps
match remote exactly (20260922201924/210653/220526/221247/230750/
20260923120000/180000/220000 — the last one is this phase's). The same
benign, unrelated pg-delta catalog-caching warning seen in every prior
remote push (missing a certificate file inside the CLI's own internal
sandbox) appeared again; it did not affect schema application, confirmed
by the migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the RLS/adversarial test suites were not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED,
RLS/isolation test EXECUTION NOT RUN** against remote — local execution
(290/290) is what this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history three times this phase (once after
writing the initial refactor, once after adding the exposed after-state
fields the worked-case tests needed, once more after fixing a NUMERIC
division precision bug the new tests caught) — each reset applied
cleanly at the schema level.

## Files created

`supabase/migrations/*_harden_safe_to_deploy_evaluator.sql`
`docs/reports/P0-E2-S6A-safe-to-deploy-evaluator-hardening.txt`

No new `lib/domain/` directories, no new UI components, no new app
routes — this phase is a narrow calculation-logic hardening, per its own
explicit "do not add new product domains, do not redesign UI" scope.

## Files modified

`lib/domain/rules/types.ts` (three new fields on
`ProposedCashUseEvaluation`: `protectedGoalCashAfter`,
`uncoveredProtectedObligationsAfter`, `protectedCommitmentsAfter`),
`lib/domain/rules/repository.ts` (maps the three new fields),
`supabase/tests/rules/run.ts` (17 new hardening tests appended — no
existing test was removed or altered), `lib/supabase/database.types.ts`
(regenerated), `docs/architecture/{FINANCIAL_DOMAIN_MODEL,
SYSTEM_ARCHITECTURE}.md`, `docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.
`MULTI_CURRENCY_MODEL.md` was reviewed and needed no changes — cross-
currency isolation was already correctly documented and remains
unchanged by this phase's fix (verified: the hypothetical override only
ever touches its one bucket's own native currency).

## Migration changes

One new migration:
`supabase/migrations/*_harden_safe_to_deploy_evaluator.sql`. No table is
added, altered, or dropped — every change is to function bodies and
signatures. Four functions are `DROP FUNCTION`ed by their exact prior
signature and recreated (required because Postgres identifies a function
by name+signature; a bare `CREATE OR REPLACE` with a different parameter
list creates an ambiguous second overload instead of replacing the
first — see `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §18`):
`goal_backed_protected_allocation(uuid)` → `(uuid, uuid, numeric)`,
`rules_uncovered_protected_obligations()` → `(uuid, numeric)`,
`safe_to_deploy_by_currency()` → `(uuid, numeric)`,
`evaluate_proposed_cash_use(uuid, numeric)` → same signature, entirely
rewritten body plus three new output columns. Applied cleanly at the
schema level on every reset this phase.

## Architecture changes

- **One calculation model, not two.** `evaluate_proposed_cash_use()`
  contains no independent Safe-to-Deploy arithmetic anymore — it calls
  `safe_to_deploy_by_currency()` twice (real state, then with a
  hypothetical bucket-balance override) and reads every currency-level
  figure directly from those two calls. There is no second formula that
  could drift from the first, by construction.
- **The hypothetical override is a single, narrow parameter threaded
  through the existing dependency chain** — not a bespoke evaluator-side
  recomputation. Applied at exactly one point (one bucket's balance,
  inside each function's innermost balance subquery), it flows correctly
  through per-bucket protected backing, per-goal pro-rata backed
  allocation (reading every OTHER bucket funding that goal at its real,
  unmodified balance), per-goal obligation-coverage aggregation, and the
  final currency formula, all through otherwise-unmodified logic.
- **All five of the phase brief's worked cases reproduced exactly** —
  multi-bucket goal funding recomputed correctly on a hypothetical spend
  (backing 8,000→6,000, uncovered 0→1,000 for a 7,000 obligation);
  backing reduced without crossing the obligation threshold (8,000→7,500,
  uncovered stays 0); two obligations sharing one goal aggregated before
  hypothetical coverage (not independently over/under-counted); a bucket
  funding two different protected goals recalculating both correctly
  (combined backing 14,000→10,000).
- **`protected_obligation_status` now reflects the actual recomputed
  coverage result**, not a coarse "does this bucket fund a linked
  obligation" heuristic: `conflict` when the hypothetical use creates or
  worsens uncovered protected obligations; `attention` when protected
  liquidity decreases without an outright coverage failure (a factual
  comparison, never an invented percentage threshold); `aligned`
  otherwise.
- **No separate override formula was needed.**
  `record_cash_use_override()` was not modified at all — it already
  called `evaluate_proposed_cash_use()` for its snapshot, so the fix
  automatically corrects every override recorded from this point forward
  (verified: a scenario that would have shown `'aligned'` under the old
  evaluator now correctly snapshots `'conflict'`).
- **New lesson: changing a function's parameter list requires DROP +
  CREATE.** A bare `CREATE OR REPLACE` with new parameters creates a
  second, ambiguously-overloaded function rather than replacing the
  first. Full account: `docs/security/SECURITY_AND_RLS_PRINCIPLES.md
  §18`.
- **New lesson: NUMERIC division produces more decimal digits than its
  operands, unlike multiplication/addition/subtraction.** The pro-rata
  branch's division produced `"1000.0000000000000000"` instead of
  `"1000.000000"` until wrapped in `round(..., 6)` — caught by the new
  worked-case tests. Full account:
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §18`.

## Known limitations

- No new UI was built or changed this phase (explicitly out of scope) —
  the three newly-exposed evaluator fields
  (`protectedGoalCashAfter`/`uncoveredProtectedObligationsAfter`/
  `protectedCommitmentsAfter`) are available at the repository/type level
  and tested, but `/rules`' `CashUseEvaluatorForm` does not yet surface
  them; a future UI pass may choose to.
- Cross-currency behavior is unchanged and was not the target of this
  phase — a proposed use still only ever affects its own bucket's native
  currency (verified unchanged).
- Remote (Monatriq Dev) has the corrected schema but has not been
  exercised by any test suite — unchanged posture from every prior
  phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test:goals` / `test:rules` /
`test` (all eight, `test:rules` now includes the S6A hardening tests) run
the isolation suites. Remote project already linked — `supabase db push
--linked --dry-run` before any future real push, never `supabase db
reset` against it.

## Open questions

1. Exact schema for Decisions/Businesses/Valuation History (unchanged).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
3. Timing of the curated final Stitch/design-reference set (unchanged).
4. Local-vs-remote RLS-testing policy (unchanged — still unresolved
   across six phases now).
5. Account-deletion / data-removal flow (unchanged).
6. Should FX transfer fees eventually be one combined RPC call
   (unchanged).
7. Should a future phase add cross-currency handling across domains
   (unchanged).
8. Should Loan Proceeds get its own dedicated UI entry point (unchanged).
9. Should a future phase add a dedicated milestone-management UI
   (unchanged).
10. **Resolved this phase**: whether to extend `evaluate_proposed_cash_
    use()` to recursively re-derive obligation coverage across a goal's
    other buckets — done; the prior "coarse signal" open question no
    longer applies.
11. Should `financial_rules.rule_type` grow additional values, and would
    any need a currency-independent variant (unchanged from P0-E2-S6).
12. When Decisions is eventually built, does it consume
    `evaluate_proposed_cash_use()` directly, or does it need a richer,
    decision-context-aware variant — now a more attractive default given
    the evaluator's correctness is no longer in question (unchanged
    question, strengthened context).
13. **New**: should `CashUseEvaluatorForm` be updated to surface
    `protectedGoalCashAfter`/`uncoveredProtectedObligationsAfter`/
    `protectedCommitmentsAfter` for full inspectability, matching the
    Safe-to-Deploy panel's own "make the calculation inspectable"
    principle? Deferred this phase per its explicit "do not redesign UI"
    scope.

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk).
2. Rules/Obligations UI has only been smoke-tested at the
   route/build/repository-function level (unchanged from P0-E2-S6 — no
   UI was touched this phase).
3. `financial_rule_versions`/`obligations`/`cash_use_overrides` still
   have a `SELECT` grant to `authenticated` for the established reason
   (§13-17 of the security doc) — unchanged, no new risk introduced.
4. **Resolved this phase**: the evaluator's documented second-order scope
   limitation (P0-E2-S6 Risk 4) no longer applies — removed from this
   list.
5. The local-vs-remote RLS-testing policy remains unsettled across six
   phases now.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S1 — Home aggregation layer**, now with six real domains and a
Safe-to-Deploy engine whose evaluator is fully consistent to aggregate.
Alternatively, **Decisions**, now a stronger candidate than before this
hardening phase — it can consume `evaluate_proposed_cash_use()` directly
for its own conflict detection without inheriting a known second-order
gap.
