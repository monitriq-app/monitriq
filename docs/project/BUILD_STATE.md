# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S6 — Financial Rules, Obligations, Protected-Fund Evaluation &
Safe-to-Deploy Engine.

## Current status

**Complete.** The Financial Rules domain (`financial_rules`,
`financial_rule_versions`, plus `create_financial_rule()`,
`record_financial_rule_version()`, `financial_rule_summary()`,
`financial_rule_history()`) and the Obligations domain (`obligations`,
plus `create_obligation()`, `obligation_summary()`,
`upcoming_obligations()`) both exist with RLS enabled and deny-by-default
policies/grants throughout. The Safe-to-Deploy engine
(`safe_to_deploy_by_currency()`, `goal_backed_protected_allocation()`,
`rules_uncovered_protected_obligations()`, `evaluate_proposed_cash_use()`)
implements the exact specified MAX-based formula, and the override audit
(`cash_use_overrides`, `record_cash_use_override()`) is append-only and
immutable. User agency is architecturally enforced, not just documented:
no rule threshold is ever assumed, an unconfigured currency always reports
`not_configured`, and neither the evaluator nor the override mechanism
ever writes to `financial_events`/`cash_movements`/`goals`/`obligations`.
Verified against a real local Supabase stack, fresh `supabase db reset`:
20 (Profile) + 37 (Money) + 11 (Currency) + 28 (Assets) + 27 (Receivables)
+ 25 (Liabilities) + 56 (Goals) + 69 (Rules/Obligations) = **273/273
assertions passed**. Migration was also pushed to the real remote
"Monatriq Dev" project this phase; schema deployment is confirmed there;
RLS/isolation test *execution* remains local-only by the same explicit,
standing instruction as every prior phase.

## Supabase environment state

Same remote project as P0-E2-S3 through S5: "monatriq's Project" (ref
`mvnwrkfcszazqqccmmxq`), already linked at the start of this phase — no
new confirmation needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 7 local migration timestamps
match remote exactly (20260922201924/210653/220526/221247/230750/
20260923120000/180000 — the last one is this phase's). The same benign,
unrelated pg-delta catalog-caching warning seen in every prior remote push
(missing a certificate file inside the CLI's own internal sandbox)
appeared again; it did not affect schema application, confirmed by the
migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the RLS/adversarial test suites were not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED,
RLS/isolation test EXECUTION NOT RUN** against remote — local execution
(273/273) is what this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history twice this phase (once after writing
the migration, once more after final documentation/type-regeneration
passes) — the migration applied cleanly at the schema level on the first
attempt, though two real bugs were caught and fixed by the test suite
before that reset (see Architecture changes / the phase report's Errors
section): an ambiguous-column-reference bug in the evaluator, and a
NUMERIC display-scale bug affecting roughly a dozen expressions across
four functions.

## Files created

`supabase/migrations/*_create_rules_obligations_domain.sql`
`lib/domain/rules/{types,repository,aggregate}.ts`
`lib/domain/obligations/{types,repository}.ts`
`app/(app)/rules/page.tsx`
`components/rules/{SafeToDeployPanel,MinimumCashFloorList,
MinimumCashFloorForm,CashUseEvaluatorForm}.tsx`
`components/obligations/{ObligationList,CreateObligationForm,
UpcomingObligationsList}.tsx`
`supabase/tests/rules/run.ts`
`docs/reports/P0-E2-S6-financial-rules-obligations-safe-to-deploy.txt`

## Files modified

`components/layout/AppShell.tsx` (Rules nav link), `components/goals/
ShortfallBanner.tsx` (reused as-is on `/rules`, no changes needed —
confirms the component was genuinely domain-agnostic), `lib/supabase/
database.types.ts` (regenerated), `package.json` (`test:rules` script,
extended combined `test` script — no new dependency added this phase,
`package-lock.json` unchanged), `docs/architecture/{FINANCIAL_DOMAIN_MODEL,
MULTI_CURRENCY_MODEL,SYSTEM_ARCHITECTURE}.md`,
`docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.

## Architecture changes

- **"Rule + rule versions" reused a second time.** `financial_rules`
  (identity) + `financial_rule_versions` (append-only threshold history)
  is the exact same pattern P0-E2-S5's `goals`/`goal_target_history`
  established — proving the pattern generalizes rather than being
  Goals-specific.
- **Explicit zero is structurally distinct from "no rule" — the phase's
  core user-agency requirement, enforced by construction.** A currency
  with no active `financial_rules` row (with at least one version) is
  `not_configured`; an active rule whose latest version is exactly `0` is
  `calculated` with a real zero floor. Deactivating a rule preserves its
  version history; reactivating reuses the same identity row.
- **Safe to Deploy is exactly the specified MAX-based formula** —
  `required_retained_cash = MAX(minimum_cash_floor, protected_
  commitments)`, `safe_to_deploy = MAX(liquid_cash - required_retained_
  cash, 0)` — verified against both of the phase brief's own worked
  examples exactly (protected commitments exceeding floor; floor
  exceeding protected commitments) plus a deficit scenario.
  `retained_deficit` is exposed separately and never hidden by the
  zero-clamp.
- **Backed protected cash never protects imaginary money.**
  `protected_goal_cash` uses `LEAST(protected_allocation_total, bucket_
  balance)` per bucket, summed by currency — verified against the phase
  brief's exact underfunded-bucket worked example (two protected goals
  totaling 7,000 nominal against a 5,000 real balance -> backed 5,000,
  shortfall 2,000 reported honestly).
- **Goal-linked obligation coverage is computed per goal, aggregating ALL
  obligations linked to that goal first** — not per obligation
  independently — specifically to prevent two obligations sharing one
  goal from each claiming the goal's full backing and double-counting it.
  Verified explicitly with two obligations (6,000 + 5,000) sharing one
  goal backed at 8,000: uncovered correctly reports 3,000, not 0.
- **New lesson: `RETURNS TABLE` plpgsql functions implicitly scope their
  own output-column names as variables, which can collide with an
  identically-named column from an inner query.** `evaluate_proposed_
  cash_use()`'s own `currency_code` output column collided with
  `safe_to_deploy_by_currency()`'s result column of the same name,
  producing "column reference is ambiguous." Fixed by aliasing. Full
  account: `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §17`.
- **New lesson: a bare `0` fallback in `coalesce`/`greatest`/`least`
  silently loses NUMERIC's display scale once cast to text.** Affected
  roughly a dozen expressions across four functions simultaneously
  (`"0"` instead of `"0.000000"`), caught by the test suite, fixed by
  casting every such fallback `0::numeric(20, 6)` explicitly. Full
  account: `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §17`.
- **The proposed cash-use evaluator uses neutral, non-advisory labels**
  (`aligned`/`attention`/`conflict`/`not_configured`/`insufficient_
  information`) across three independent dimensions — never approve/
  reject/recommend semantics, verified by an explicit test against an
  advisory-vocabulary blocklist. It is a pure read with a documented
  scope limitation: it does not recursively re-derive obligation coverage
  that depends on OTHER buckets funding the same goal (a genuine
  second-order effect explicitly out of scope, per the brief's "do not
  turn this into a reservation system" instruction).
- **Override audit is genuinely immutable** — no `UPDATE`/`DELETE` grant
  exists on `cash_use_overrides` at all, verified by a direct-update
  rejection test (denied by grant absence, not merely a policy).
  Recording an override never creates a `financial_events`/
  `cash_movements` row, never alters a goal, never alters an obligation —
  verified explicitly for all three.

## Known limitations

- Rules/Obligations UI was validated the same way every prior domain's
  was: the isolation suite calling the exact repository functions the UI
  calls (69/69), plus `next build` + route-level smoke testing with and
  without Supabase config present. Not driven through a real browser.
- The evaluator's "after" recomputation does not recursively re-derive
  obligation coverage across other buckets funding the same goal (see
  Architecture changes above) — a documented, deliberate scope limit, not
  an oversight.
- No cross-currency rule/obligation/allocation this phase — same-currency-
  only throughout, consistent with every prior domain.
- No automatic recommendations, bank integrations, or predictive advice —
  explicitly out of scope per the phase brief.
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test:goals` / `test:rules` /
`test` (all eight) run the isolation suites. Remote project already
linked — `supabase db push --linked --dry-run` before any future real
push, never `supabase db reset` against it.

## Open questions

1. Exact schema for Decisions/Businesses/Valuation History beyond what now
   exists (Financial Rules/Obligations/Safe-to-Deploy is no longer open —
   implemented this phase).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
3. Timing of the curated final Stitch/design-reference set (unchanged).
4. Local-vs-remote RLS-testing policy (unchanged from P0-E2-S3's Open
   Question 5 — still unresolved across five phases now).
5. Account-deletion / data-removal flow (unchanged, now applies to Rules/
   Obligations/Overrides data too).
6. Should FX transfer fees eventually be one combined RPC call (unchanged
   from P0-E2-S2).
7. Should a future phase add cross-currency handling across domains, and
   if so, does it reuse Money's `fx_rates` table (unchanged question, now
   also applies to Rules/Obligations).
8. Should Loan Proceeds get its own dedicated UI entry point (unchanged
   from P0-E2-S4 — still repository/RPC-only, no form wired in).
9. Should a future phase add a dedicated milestone-management UI
   (unchanged from P0-E2-S5).
10. **New**: should a future phase extend `evaluate_proposed_cash_use()`
    to recursively re-derive obligation coverage across a goal's other
    buckets (the documented scope limitation), or is the coarser
    single-bucket signal sufficient in practice?
11. **New**: should `financial_rules.rule_type` grow additional values
    (`maximum_capital_per_asset`, `maximum_debt_payment_ratio`, ...) in a
    near-term phase, and would any of them need a currency-independent
    variant (the current schema assumes every rule is currency-scoped)?
12. **New**: when Decisions is eventually built, does it consume
    `evaluate_proposed_cash_use()` directly for its own conflict
    detection, or does it need a richer, decision-context-aware variant?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk, now
   larger schema surface).
2. Rules/Obligations UI has only been smoke-tested at the
   route/build/repository-function level, not driven end-to-end through a
   browser.
3. `financial_rule_versions`/`obligations`/`cash_use_overrides` now have
   a `SELECT` grant to `authenticated` for the same reason every prior
   domain's ledger/detail tables do (§13-16 of the security doc) — RLS
   scopes it correctly (proven by the isolation suite), but any future
   code querying these tables directly instead of through the
   text-casting read functions needs the same float-precision review.
4. The evaluator's documented second-order scope limitation (Known
   limitations, above) means a proposed cash use that would impair a
   goal's backing via a DIFFERENT bucket than the one being spent from is
   not fully reflected in `protected_obligation_status`/`protected_goal_
   status` — a coarse, honest, but incomplete signal.
5. The local-vs-remote RLS-testing policy (Open Question 4) remains
   unsettled across five phases now.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S1 — Home aggregation layer**, now with six real domains (Money,
Assets, Receivables, Liabilities, Goals, Rules/Obligations/Safe-to-Deploy)
to aggregate — the first phase where Home can show a genuinely complete
financial position, including Safe to Deploy, without inventing a new
calculation of its own. Alternatively, **Decisions**, now that Safe to
Deploy and the proposed cash-use evaluator exist for it to consume rather
than reimplement.
