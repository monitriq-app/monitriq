# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E2-S4 — Receivables, Liabilities & Debt Transaction Foundation.

## Current status

**Complete.** The Receivables domain (`receivables`,
`receivable_ledger_events`, `receivable_recoverable_estimates`, plus
`create_receivable()`, `record_receivable_recovery()`,
`record_receivable_adjustment()`, `record_recoverable_estimate()`, and
three read functions) and the Liabilities/Debt domain (`liability_types`,
`liabilities`, `liability_principal_events`, `financial_operations`, plus
`create_liability()`, `record_debt_payment()`, `record_loan_proceeds()`,
`record_liability_adjustment()`, and three read functions) both exist with
RLS enabled and deny-by-default policies/grants throughout. Verified
against a real local Supabase stack, fresh `supabase db reset`: 20
(Profile) + 37 (Money) + 11 (Currency) + 28 (Assets) + 27 (Receivables) +
25 (Liabilities) = **148/148 assertions passed**. Migrations were also
pushed to the real remote "Monatriq Dev" project this phase (see below) —
schema deployment is confirmed there; RLS/isolation test *execution*
remains local-only by the same explicit, standing instruction as every
prior phase.

## Supabase environment state

Same remote project as P0-E2-S3: "monatriq's Project" (ref
`mvnwrkfcszazqqccmmxq`), already linked at the start of this phase — no
new confirmation needed (carried forward from the prior phase's explicit
confirmation).

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one new
migration, this phase's), then `supabase db push --linked --yes`. Verified
via `supabase migration list --linked`: all 5 local migration timestamps
match remote exactly
(20260922201924/210653/220526/221247/230750 — the last one is this
phase's). A benign, unrelated pg-delta catalog-caching warning (missing a
certificate file inside the CLI's own internal sandbox) appeared during
the push; it did not affect schema application, confirmed by the
migration-list match.

**What was NOT done against remote, deliberately**: same as every prior
phase — the RLS/adversarial test suites were not executed against it.
`supabase/tests/shared/env.ts`'s localhost-only guard was not touched.
Remote validation for this phase is: **schema deployment CONFIRMED,
RLS/isolation test EXECUTION NOT RUN** against remote — local execution
(148/148) is what this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack as prior
phases, reset from migration history multiple times this phase (once to
verify the initial migration, once more after the `operation_id` column
grant fix — see Errors and fixes in the phase report).

## Files created

`supabase/migrations/*_create_receivables_liabilities_domain.sql`
`lib/domain/receivables/{types,repository}.ts`
`lib/domain/liabilities/{types,repository}.ts`
`app/(app)/receivables/page.tsx`, `app/(app)/liabilities/page.tsx`
`components/receivables/{ReceivableList,CreateReceivableForm,
RecordRecoveryForm}.tsx`
`components/liabilities/{LiabilityList,CreateLiabilityForm,
DebtPaymentForm}.tsx`
`supabase/tests/receivables/run.ts`, `supabase/tests/liabilities/run.ts`
`docs/reports/P0-E2-S4-receivables-liabilities-debt-foundation.txt`

## Files modified

`components/layout/AppShell.tsx` (Receivables/Liabilities nav links),
`lib/supabase/database.types.ts` (regenerated), `package.json`
(`test:receivables`/`test:liabilities` scripts, extended combined `test`
script — no new dependency added this phase, `package-lock.json`
unchanged), `docs/architecture/{FINANCIAL_DOMAIN_MODEL,
MULTI_CURRENCY_MODEL,SYSTEM_ARCHITECTURE}.md`,
`docs/security/SECURITY_AND_RLS_PRINCIPLES.md`.

## Architecture changes

- **Receivable/liability balances are both derived from append-only
  ledgers**, same philosophy as `cash_movements`/`asset_basis_events`:
  `receivable_ledger_events` (opening_face/adjustment/recovery;
  outstanding = face_total − recovered_total) and
  `liability_principal_events` (opening_principal/draw/repayment/
  adjustment; outstanding = sum). Neither ledger table has a mutable
  current-value column.
- **New construct: `financial_operations`.** The first case in this
  codebase where one user action must produce more than one correctly-
  classified `financial_events` row atomically (a debt payment's
  principal/interest/fee split — principal is not an expense, interest
  and fees are). A nullable `financial_events.operation_id` groups the
  resulting rows; simple single-component events are unaffected
  (`operation_id` stays null). Deliberately generic (`operation_type` is
  an extensible CHECK list, currently just `'debt_payment'`) so a future
  compound action reuses the table rather than needing a new mechanism.
  Full rationale: `docs/architecture/FINANCIAL_DOMAIN_MODEL.md §23`.
- **New pattern: derived voiding consistency across domains.** Ledger rows
  with a real cash effect carry a nullable `financial_event_id`; every
  balance-computing read function excludes rows whose linked event is
  voided, via a join — never a second `is_voided` flag. Voiding a
  recovery or a debt principal payment through the existing, unmodified
  `voidFinancialEvent()` therefore keeps cash and the domain balance
  consistent automatically. Verified by dedicated tests in both new
  suites. Full rationale:
  `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §15`.
- **Onboarding existing receivables/debt never fabricates cash** —
  `create_receivable()`/`create_liability()` write only the opening ledger
  row, no `financial_events`/`cash_movements` row, tested explicitly (same
  discipline as Assets' cost-basis onboarding).
- **Same-currency-only for recovery/debt payments this phase** — no
  cross-currency settlement path, mirroring Assets' no-cross-currency-
  appraisal ruling. Full rationale:
  `docs/architecture/MULTI_CURRENCY_MODEL.md §15`.
- **Lesson beyond Assets: column-level grants don't retroactively cover
  columns added to an existing table.** Adding
  `financial_events.operation_id` required its own
  `grant insert (operation_id) on public.financial_events to
  authenticated;` in this migration — P0-E2-S2's original grant only
  named its original column list. Caught by running the new test suite
  against a real database (4 failures, all "permission denied for table
  financial_events"), fixed, re-verified via fresh `db reset`. Full
  account: `docs/security/SECURITY_AND_RLS_PRINCIPLES.md §15`.
- **Estimated Recoverable Value stays structurally distinct from
  Outstanding Amount** — a separate append-only, latest-wins table
  (`receivable_recoverable_estimates`), never auto-derived, never
  defaulted, absent reads as `null` not a guessed haircut.
- **No Potential-Liquidity-equivalent function exists for receivables** —
  a deliberately stricter position than Assets: no amount on a receivable
  (face, outstanding, or even a recorded recoverable estimate) is treated
  as automatically deployable cash.

## Known limitations

- Receivables/Liabilities UI was validated the same way Money's and
  Assets' were: the isolation suites calling the exact repository
  functions the UI calls (27/27, 25/25), plus `next build` + route-level
  smoke testing with and without Supabase config present. Not driven
  through a real browser.
- No cross-currency recovery or debt payment this phase — same-currency-
  only, enforced at the database layer.
- No amortization schedule or interest calculation — `interest_rate` is a
  recorded field only, no forecast is computed from it.
- FX fee bundling for a debt payment is not automated (same standing
  limitation as Money's `fx_transfer`, unchanged from P0-E2-S2/S3).
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

Unchanged: `npm run db:start` (Docker), populate `.env.local` from
`supabase status -o env` (service-role value under
`SUPABASE_TEST_SERVICE_ROLE_KEY`), `npm run db:types` after any migration
change. `npm run test:rls` / `test:money` / `test:currency` / `test:assets`
/ `test:receivables` / `test:liabilities` / `test` (all six) run the
isolation suites. Remote project already linked — `supabase db push
--linked --dry-run` before any future real push, never `supabase db
reset` against it.

## Open questions

1. Exact schema for Goals/Decisions/Financial Rules/Businesses/Valuation
   History beyond what now exists (Receivables and Liabilities are no
   longer open — implemented this phase).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
3. Exact "Safe to Deploy" formula inputs — now has more real inputs
   available (cash, assets, receivables, liabilities) but the formula
   itself remains undesigned.
4. Timing of the curated final Stitch/design-reference set (unchanged).
5. Local-vs-remote RLS-testing policy (unchanged from P0-E2-S3's Open
   Question 5 — still unresolved, still deliberately deferred).
6. Account-deletion / data-removal flow (unchanged, now applies to
   Receivables/Liabilities data too).
7. Should FX transfer fees eventually be one combined RPC call
   (unchanged from P0-E2-S2).
8. Should a future phase add cross-currency appraisal/recovery/payment,
   and if so, does it reuse Money's `fx_rates` table for all four domains
   or need domain-specific handling (unchanged question from P0-E2-S3,
   now also applies to Receivables/Liabilities)?
9. **New**: should Loan Proceeds get its own dedicated UI entry point (it
   currently exists only at the repository/RPC layer,
   `recordLoanProceeds()`, with no form wired into `/liabilities` this
   phase — the brief allowed documenting the extension path instead of
   building the UI, since the primary compound-operation deliverable was
   debt payment)?
10. **New**: should `financial_operations.operation_type` grow additional
    values (asset sale, asset purchase, receivable settlement) in a
    future phase, reusing this phase's grouping construct rather than
    inventing a new one?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   — schema is deployed but genuinely untested there (unchanged risk,
   now larger schema surface).
2. Receivables/Liabilities UI has only been smoke-tested at the
   route/build/repository-function level, not driven end-to-end through a
   browser.
3. `receivable_ledger_events`/`liability_principal_events` now have a
   `SELECT` grant to `authenticated` for the same reason
   `cash_movements`/`asset_valuations` do (§13/§14 of the security doc) —
   RLS scopes it correctly (proven by both isolation suites), but any
   future code querying these tables directly instead of through the
   text-casting read functions needs the same float-precision review.
4. `financial_operations` is a new grouping construct with exactly one
   consumer (`debt_payment`) — its generality is asserted by design, not
   yet proven by a second real use case.
5. The local-vs-remote RLS-testing policy (Open Question 5) remains
   unsettled across two phases now.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E3-S1 — Home aggregation layer**, now with four real domains (Money,
Assets, Receivables, Liabilities) to aggregate — enough breadth for a
first real Net Worth calculation (assets + receivables − liabilities,
per-currency, `not_calculated` when reporting-currency rates are missing)
and the first real proof that "one shared domain calculation, multiple
consumers" holds at scale, per `docs/architecture/SYSTEM_ARCHITECTURE.md
§4`.
