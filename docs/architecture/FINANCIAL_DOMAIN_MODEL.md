# Monatriq — Financial Domain Model

Status: Canonical. Established P0-E1-S1. The Money domain (§3, §16, §17,
§18) is now implemented — see
`supabase/migrations/*_create_money_domain.sql` and
[MULTI_CURRENCY_MODEL.md](./MULTI_CURRENCY_MODEL.md) for the full
implementation record. Everything else in this document (Assets, Goals,
Decisions, Financial Rules) remains conceptual — no schema exists yet.

## 1. Core rule: one financial domain model

There is exactly one financial domain model. Money, Assets, Goals, Decisions
and Home all read from shared domain calculations (a single calculation
layer, described in
[SYSTEM_ARCHITECTURE.md §4](../architecture/SYSTEM_ARCHITECTURE.md#4-domain-calculation-layer)).
No page is permitted to compute its own version of cash balance, net worth,
or deployable capital. If Money, Home, and Decisions disagree about what
"cash" means, that is a defect in the architecture, not an acceptable
product state.

## 2. Domain ownership map

Each concept has exactly one owning domain. Other domains and Home may read
it but do not duplicate its records.

| Domain | Owns |
|---|---|
| Profile | user identity, preferred name, currency, timezone, preferences |
| Money | transactions, cash buckets, cash flow |
| Assets | assets, valuations, receivables, business interests, liabilities* |
| Goals | targets, allocations, dates, protection settings, milestones |
| Decisions | active reviews, scenarios, assumptions, recorded choices, review dates |
| Financial Rules | protected cash, reserve rules, goal protections, concentration rules, user-defined constraints |
| Home | aggregation only — summarizes the above, owns nothing financial |

\* Liabilities are modeled under Assets/Net-Worth where the debt is tied to
an asset (e.g. a mortgage against a property); freestanding liabilities
(e.g. a personal loan with no linked asset) are still owned by the same
liabilities model, just without an asset linkage. There is one liabilities
table regardless of linkage.

## 3. Financial event architecture

Financially meaningful mutations are represented as **financial events**:
an event records what happened, when, to which records, why, and under
which transaction, for a specific user. This is the backbone that makes
compound effects (see §5) representable without each domain inventing its
own side-effect logic, and gives us the audit trail required in §9.

An event is not a full event-sourced ledger (we do not replay events to
derive state) — state lives in normal relational tables. The event log is a
secondary, append-only record of what changed and why, used for audit,
explainability, and the future expected-vs-actual comparison in Decisions.

**Implemented for Money (P0-E2-S2)** as `public.financial_events` +
`public.cash_movements`: one event, one or more signed-amount movements,
created atomically by a `SECURITY INVOKER` SQL function per event type
(`record_opening_balance`, `record_money_received`, `record_money_spent`,
`record_transfer`, `record_fx_transfer` — see §17). Correction is voiding
(`voided_at`), not editing or deletion — see §18.

## 4. Asset value concepts (must not collapse)

These are distinct fields/concepts, never merged into a single "value":

- **Cost Basis** — what was actually paid/invested, plus capitalizable
  additions.
- **Estimated Current Value** — the user's best current estimate of worth.
- **Conservative / Quick-Sale Estimate** — a deliberately discounted,
  distinct estimate. Never fabricated from Estimated Current Value by an
  automatic haircut unless the user explicitly configures that policy.
- **Target Value** — an aspirational figure. Never treated as current net
  worth.
- **Potential Liquidity** — how much of the value could realistically be
  accessed, distinct from raw value.
- **Actual Sale Price** — only populated once a sale transaction occurs.

Valuation changes are recorded as their own history (see §7), separate from
cash transactions.

**Implemented for Assets (P0-E2-S3)**: Cost Basis, Estimated Current
Value, Quick-Sale Estimate, and Target Value are each their own
structurally distinct concept in `assets`/`asset_basis_events`/
`asset_valuations` — see §19. Actual Sale Price is not implemented (no
sale workflow exists yet).

## 5. Financial event principles and worked examples

### 5.1 Receivable recovery (e.g. ₦500,000 collected)
- Cash: +500,000
- Receivable outstanding: −500,000
- Net worth change: 0 (an asset converted form, not created)
- Cash inflow: +500,000
- Earned income: 0

### 5.2 Asset purchase for cash (e.g. ₦2,000,000)
- Cash: −2,000,000
- Tracked asset: +2,000,000 initial basis/value per asset policy
- Immediate net worth change: normally 0, before transaction costs or a
  deliberate valuation difference

### 5.3 Resale-vehicle repair (e.g. ₦450,000), capitalizable
Applies only when the vehicle is held for resale **and** the expense is
explicitly marked as capitalizable repair work:
- Cash: −450,000
- Vehicle cost basis: +450,000
- If linked to a planned remaining-repair budget: repair remaining −450,000
- Estimated vehicle value does **not** automatically increase by 450,000.
  Net worth only changes through a deliberate valuation/accounting
  treatment, never merely because money was spent.

### 5.4 Personal vehicle maintenance
Default treatment is a plain expense. Maintenance is never auto-capitalized
into a personal (non-resale) vehicle's cost basis.

### 5.5 Asset sale
A sale distinguishes, as separate fields on the sale event:
- Gross sale proceeds
- Selling costs
- Capital returned (≈ cost basis recovered)
- Realised profit/loss
- Cash received
Sale proceeds are never wholesale classified as earned income; only the
realised profit/loss component is, and only if the product later chooses to
report it as such.

### 5.6 Debt payment
- Cash decreases by the total payment.
- Principal reduction decreases the liability balance.
- Interest and fees are recorded as expenses.
- Principal repayment alone does not change net worth, because cash and
  debt decrease together by the same amount.

## 6. Receivables

Money owed to the user is an asset, not automatically liquid cash. Fields:
- Face Amount
- Recovered Amount
- Outstanding Amount (derived: Face − Recovered)
- Estimated Recoverable Value (optional, distinct from Face/Outstanding —
  reflects doubt about collectibility)
- Expected Payment Date (optional)
- Last Follow-Up (optional)

Full collectibility is never assumed by default.

**Implemented (P0-E2-S4)** — see §21. Face/Recovered/Outstanding/
Estimated Recoverable Value are each structurally distinct, and recovery
is a real atomic cash event, not a fabricated one.

## 7. Asset valuation

Valuation updates are their own record type (valuation history), separate
from cash transactions. Changing an estimated value creates an **Unrealised
Value Change** event where appropriate — it never creates a Money In/Out
record. History is preserved; valuations are never silently overwritten.

**Implemented (P0-E2-S3)** as `asset_valuations`: append-only, one row per
valuation event, three distinct `valuation_type`s. Recording a valuation
never creates a `financial_events`/`cash_movements` row — tested explicitly
in `supabase/tests/assets/run.ts`. See §19.

## 8. Liabilities / debt

Debt transactions separate principal, interest, and fees (see §5.6). A
liability record tracks outstanding principal, and optionally links to the
asset it financed. Liabilities reduce net worth; paying them down is
net-worth-neutral to the extent principal and cash move together.

**Implemented (P0-E2-S4)** — see §21/§22. A debt payment's principal,
interest, and fee components are genuinely separate `financial_events`
(different `cash_flow_class` each), created atomically as one compound
operation — not merged into a single event that would misclassify at
least two of the three.

**Debt-payoff goal linkage (P0-E2-S5)** — see §27. A `debt_balance_target`
goal references a liability directly; its progress is always read live
from `liability_outstanding_principal()`, never a duplicated, manually-
synced balance inside Goals.

## 9. Goals domain

**Implemented (P0-E2-S5)** — see §25-28. Goals do not own cash; a goal
allocation assigns purpose to cash that already exists in a Money bucket.
Four measurement types (cash_target, debt_balance_target,
monthly_income_target, milestone — §25) replace the single "current/
target cash" shape this section originally sketched.

Goals are typed, not force-fit into a single "current/target cash" shape.
Required goal structures (extensible — future types must not require a
schema rewrite):
Savings/Reserve, Purchase/Property, Debt Payoff, Recurring Income, Business
Capital, Relocation/Milestones, Education, Vehicle, Event, Travel, Custom.

### 9.1 One naira, one purpose

**Implemented (P0-E2-S5)** as "one unit of money, one purpose" — Monatriq
is multi-currency, so the rule is not NGN-specific. Enforced by
construction: every allocate/release/reallocate RPC locks the target
bucket row before computing available-to-allocate capacity, so the same
cash can never be read as available by two concurrent allocation attempts
— see §25.

Goal allocation must avoid double counting. If Main Cash = ₦5M and a House
Fund allocation = ₦2M, that ₦2M cannot simultaneously be counted as House
Fund, Relocation Fund, and "safe to deploy" — allocation ownership is
explicit and singular until the user deliberately reallocates it.

### 9.2 Protected goals

**Partially implemented (P0-E2-S5).** `is_protected` is a user-controlled
flag (§25), and `goal_protected_allocation_totals()` exposes the protected
allocated total per currency so a future rules engine can consume it. The
five-step override workflow described below (steps 1-5) is explicitly
**not** built this phase — that is P0-E2-S6's Financial Rules/override
engine. This phase only makes the flag and its totals exist and be
queryable; it does not yet intervene in any spending flow.

Protection is a user-defined rule, not a system override of user agency.
When a user attempts to use protected funds, the product must:
1. show the financial impact,
2. show the rule conflict,
3. allow cancellation,
4. allow an explicit override where policy permits,
5. record the override (as a financial event, per §3).
The system never autonomously decides on the user's behalf.

## 10. Decisions domain

**Implemented (P0-E2-S7)** — see §34-42. A Decision is a plan/scenario/
intention/question, never a transaction, enforced architecturally: no
function anywhere in the Decisions migration writes to
`financial_events`/`cash_movements`/`assets`/`liabilities`/`goals`/
`obligations`. Every liquidity/rule-conflict figure reuses P0-E2-S6/S6A's
Safe-to-Deploy chain directly — no second formula exists.

A Decision answers "what could change if I do this?" — never "what should I
do?". A Decision is a plan, scenario, evaluation, or intent. It is **not**
an executed financial transaction. Saving a decision as "Proceed" does not
move cash; balances only change when an actual Money/Asset/Debt transaction
is later recorded (a Decision may hand off to the appropriate transaction
flow as a next action).

### 10.1 Decision fact types
Every figure shown in a decision must be visually and structurally tagged
as one of:
- Tracked Fact (comes from existing domain data)
- User Estimate
- User Assumption
- Derived Calculation
Missing assumptions stay missing — never silently manufactured.

**Implemented (P0-E2-S7)** as three structurally distinct groups in
`evaluate_decision_scenario()`'s return shape (see §36) — Facts, echoed
Assumptions, and Derived values are never merged into one ambiguous
field set, at both the SQL and TypeScript layers.

### 10.2 Decision journal
Stored per decision: what was considered, date, tracked financial context
at the time, assumptions, rule effects, scenario comparisons, the user's
choice, a review date, and (later) the actual outcome for expected-vs-actual
comparison. The journal is a record of what happened, not a mechanism for
judging the user — no shaming language, no fabricated history.

**Implemented (P0-E2-S7)** — see §41. `decision_choices` (append-only
choice history) and `decision_scenario_evaluations` (append-only,
immutable evaluation snapshots) together let the application reconstruct
the full journal. Actual-outcome comparison remains an explicit, clean
extension point — not implemented this phase; a Decision without a linked
real transaction reads "Actual outcome: Not recorded."

## 11. Financial rules

**Implemented (P0-E2-S6)** — see §29-30. Only `minimum_cash_floor` actively
participates in Safe to Deploy this phase; the rule/rule-version split
(identity + append-only threshold history) is designed to extend to the
other potential rule types below without restructuring.

Rules are explicitly user-configured; nothing is invented on their behalf.
Potential rule types: Minimum Protected Cash, Emergency Reserve Protection,
Protected Goal Funds, Maximum Capital Per Asset, Maximum Capital Per Asset
Class, Minimum Expected Margin, Maximum Debt Payment Ratio, Maximum Active
Ventures. Until a user configures a given rule, its state is "Not
configured" — never a guessed threshold.

## 12. Safe to Deploy

**Implemented (P0-E2-S6)** — see §31-33. `safe_to_deploy_by_currency()` is
the one authoritative formula: `required_retained_cash = MAX(minimum_cash_
floor, protected_commitments)`, `safe_to_deploy = MAX(liquid_cash -
required_retained_cash, 0)`. Deliberately MAX, not SUM — see §31 for why
summing would double-count retained cash.

Safe to Deploy is not simply the cash balance. Once inputs exist, it may
consider: liquid cash, protected cash, protected goal allocations, hard
upcoming obligations, emergency reserve rules, and other explicitly
configured constraints. The formula must be transparent and inspectable
(the user can see which inputs fed the number). If required configuration
is incomplete, the value is "Not calculated" — never guessed.

## 13. Upcoming obligations

**Implemented (P0-E2-S6)** — see §29. `obligations` is a plain user-owned
record — never scraped or inferred from Money transactions.
`upcoming_obligations()` defaults to a documented 30-day horizon but
accepts an explicit start/end from any caller. "Overdue" is always derived
(active status + due_date < today), never a stored flag.

Obligations (rent, school fees, insurance, loan payments, tax,
subscriptions, business commitments, etc.) must be user-entered or produced
by an explicit supported system — never invented. Absent any, the state is
"No upcoming obligations recorded."

## 14. Recurring income

Recurring Income includes only sources explicitly classified as recurring
(salary, retainer, subscription revenue, rental income, contracted
recurring business income). It excludes asset sales, receivable recovery,
refunds, internal transfers, one-off business jobs, and one-off windfalls,
unless the user explicitly reclassifies them under a supported recurring
model.

## 15. Auditability

Every financially meaningful mutation must be traceable: what happened,
when, which record changed, why, which transaction caused it, and which
user owned it. This is satisfied by the financial event log in §3 plus
standard `created_at`/`updated_at`/`created_by` columns — not by an
event-sourced or blockchain-style architecture. Simplicity is preferred as
long as traceability and integrity hold.

## 16. Internal transfers

A transfer between the user's own cash buckets is never counted as income,
spending, or a net-worth change. It only moves the location of the same
cash. This holds for same-currency transfers and cross-currency (FX)
transfers alike — see §17 and
[MULTI_CURRENCY_MODEL.md](./MULTI_CURRENCY_MODEL.md).

## 17. Money domain implementation summary (P0-E2-S2)

Full detail lives in `supabase/migrations/*_create_money_domain.sql` and
[MULTI_CURRENCY_MODEL.md](./MULTI_CURRENCY_MODEL.md). Summary:

- **Cash buckets** (`cash_buckets`) hold no stored balance — the
  authoritative balance is always derived from movements (§5 of this
  document's general principle, applied concretely). Currency is fixed
  once a bucket has history.
- **Classification is database-derived, not client-trusted.** Every
  `financial_events` row gets a `cash_flow_class` (`income`,
  `other_inflow`, `expense`, `other_outflow`, `transfer`,
  `opening_balance`) computed by a trigger from `event_type` + category —
  never guessed from an amount's sign, and never something the client can
  set directly. `money_received`/`money_spent` events carry a category
  (`money_received_categories`/`money_spending_categories` — the exact
  lists from this phase's brief); a category's `cash_flow_class` is what
  actually determines the event's classification, which is how
  `receivable_recovery` and `asset_sale` land as `other_inflow` (not
  `income`) and `debt_payment` lands as `other_outflow` (not `expense`) —
  directly implementing §5's "cash received ≠ income" and "cash out ≠
  spending" principle.
- **Same-currency transfers and cross-currency (FX) transfers** are both
  `cash_flow_class = 'transfer'` — never income or expense regardless of
  how the reporting-currency-equivalent amounts compare (§16).
- **Idempotency**: every `record_*` function accepts an optional client-
  generated `idempotency_key`; a retried call with the same key returns
  the original event rather than creating a duplicate (partial unique
  index on `(user_id, idempotency_key)`).
- Every `record_*` function is `SECURITY INVOKER` — none of the Money
  domain uses elevated privilege. See
  [SECURITY_AND_RLS_PRINCIPLES.md §10-11](../security/SECURITY_AND_RLS_PRINCIPLES.md).

## 18. Correction / voiding strategy (Money, P0-E2-S2)

For this phase, the only supported correction to a recorded financial
event is **voiding** it (`financial_events.voided_at`), enforced as a
one-way transition by `enforce_financial_event_void_only()`: a voided
event cannot be un-voided, and no column except `voided_at` can change on
an existing event. A voided event's movements are excluded from every
balance calculation but are never deleted — the record that something was
entered and later voided is itself part of the audit trail (§15).
Editing event contents in place and generating an automatic reversal event
are both explicitly deferred, not built this phase — voiding is the
minimum viable correction mechanism, not the final one. `cash_movements`
rows are never editable at all; the only way to change what an event
recorded is to void it.

## 19. Assets domain implementation summary (P0-E2-S3)

Full detail in `supabase/migrations/*_create_assets_domain.sql` and
[MULTI_CURRENCY_MODEL.md](./MULTI_CURRENCY_MODEL.md). Summary:

- **Generic on purpose.** `assets.asset_type` is a controlled vocabulary
  (`asset_types` reference table: vehicle, property, business_interest,
  financial_investment, equipment, inventory, collectible, other) — no
  vehicle-specific, property-specific, or any single-subtype columns
  anywhere in the schema. Receivables get their own dedicated domain
  shortly, deliberately not forced into this generic list this phase.
- **Cost basis is history, not a mutable field.** `asset_basis_events` is
  an append-only signed ledger (`initial_basis`/`capital_improvement`
  positive, `basis_reduction` negative), mirroring `cash_movements`'
  philosophy exactly — current basis is always `sum(amount)` per asset
  (`asset_current_basis()`), never an overwritten column. This is
  deliberately the same shape that will later carry asset purchase,
  capital improvement, repair capitalization, and partial disposal
  without any schema change.
- **Valuation is history, not a mutable field.** `asset_valuations` is
  likewise append-only, with `valuation_type` in
  (`estimated_current_value`, `quick_sale_estimate`, `target_value`) —
  three structurally distinct concepts (§4), never collapsed. The latest
  row per `(asset_id, valuation_type)` is the current value
  (`asset_latest_valuations()`/`asset_summary()`); a correction is a new
  row with a newer `valued_at`, never an edit to an old one.
- **Asset creation and valuation/basis recording never move cash.**
  `create_asset()`, `record_asset_valuation()`, and
  `record_asset_basis_event()` never touch `financial_events` or
  `cash_movements` — there is no code path connecting them. An existing
  asset (owned for years before the user started using Monatriq) can be
  onboarded with a historical cost basis without fabricating today's Money
  Out — tested explicitly (`supabase/tests/assets/run.ts`).
- **Potential Liquidity is never invented.** `lib/domain/assets/
  liquidity.ts` uses the quick-sale estimate as liquidity evidence only
  when the user explicitly supplied one; absent that, the result is
  `not_calculated` — no automatic haircut off estimated current value or
  target value.
- **Asset currency is immutable once it has history** — same mechanism as
  bucket currency (`enforce_asset_currency_immutable()`). Valuations and
  basis events must match the asset's native currency exactly; a mismatch
  is rejected, never guessed (no cross-currency appraisal this phase —
  see [MULTI_CURRENCY_MODEL.md §12](./MULTI_CURRENCY_MODEL.md#12-assets-no-cross-currency-appraisal-this-phase)).
- **All `SECURITY INVOKER`** — no elevated privilege anywhere in Assets,
  same discipline as Money. `record_asset_valuation()`/
  `record_asset_basis_event()` exist as thin ownership-checking wrappers
  specifically to avoid a TypeScript-generated-type-vs-column-grant
  mismatch, not to bypass any permission — see
  [SECURITY_AND_RLS_PRINCIPLES.md §14](../security/SECURITY_AND_RLS_PRINCIPLES.md).

## 20. Net worth preparation (Assets, P0-E2-S3)

Final Net Worth is not implemented this phase, but Assets is structured so
a future Net Worth calculation can consume `asset_native_currency_totals()`
— the latest `estimated_current_value` per asset, grouped by native
currency, excluding archived assets — and convert through the same shared
`convertToReportingCurrency()` layer Money uses
([MULTI_CURRENCY_MODEL.md §10, §13](./MULTI_CURRENCY_MODEL.md#10-reporting-currency-conversion-an-explicit-unwired-boundary)).
`target_value` is always excluded from this total (it is aspirational, not
current); `quick_sale_estimate` is not the default Net Worth basis either
— both are deliberately absent from `asset_native_currency_totals()`'s
source query, not merely omitted from a future formula's intentions.

> Net Worth is now implemented — see [§41](#41-unified-financial-position--net-worth-p0-e3-s1). This section is kept for historical context; the preparation described here is exactly what `financial_position_by_currency()` ended up consuming.

## 21. Receivables domain implementation summary (P0-E2-S4)

Full detail in `supabase/migrations/*_create_receivables_liabilities_domain.sql`.
Summary:

- **Outstanding is derived, not stored**, from two independently-summed
  running totals on one append-only ledger
  (`receivable_ledger_events`): `face_total` (`opening_face` +
  `adjustment` rows) minus `recovered_total` (`recovery` rows) —
  `outstanding = face_total − recovered_total`, computed by
  `receivable_summary()`/`receivable_outstanding_amount()`, matching this
  document's §6 formula exactly.
- **Recovery is a real atomic cash event**, not a status change: `record_
  receivable_recovery()` creates one `financial_events` row
  (`cash_flow_class = 'other_inflow'`, never `'income'`), one positive
  `cash_movements` row into the destination bucket, and one `recovery`
  ledger row, all in one transaction. Onboarding an existing receivable
  (`create_receivable()`) never does this — it only inserts the
  `opening_face` ledger row, no cash effect at all.
- **Recovery cannot exceed outstanding.** Enforced inside the RPC
  (`receivable_outstanding_amount()` checked before the insert), not left
  to the UI.
- **Same-currency only.** The destination bucket's currency must equal
  the receivable's native currency; a mismatch is rejected outright — no
  cross-currency settlement this phase (see MULTI_CURRENCY_MODEL.md §12's
  reasoning for Assets, applied identically here).
- **Estimated Recoverable Value is its own append-only, latest-wins
  concept** (`receivable_recoverable_estimates`) — never equated with
  Outstanding Amount, never treated as cash. Absent, it reads as `null`
  ("Not set"), never a guessed haircut.
- **Potential Liquidity is deliberately NOT computed for receivables at
  all this phase** — a stricter position than Assets (§20), per explicit
  product direction: Face Amount is not liquidity, Outstanding Amount is
  not automatically liquidity, and even a recorded Estimated Recoverable
  Value is not automatically classified as deployable cash. No
  `getPotentialLiquidity()`-equivalent function exists for receivables;
  this is intentional, not an oversight.
- **Status is derived, not a stored flag** — "fully recovered" is simply
  `outstanding_amount = 0`, readable directly from `receivable_summary()`.
  No `written_down`/`active` status column exists; a write-down is just a
  negative `adjustment` ledger row, visible in the outstanding figure
  itself.

## 22. Liabilities/Debt domain implementation summary (P0-E2-S4)

Full detail in the same migration file. Summary:

- **Outstanding principal is derived**, `sum(amount)` over an append-only
  `liability_principal_events` ledger (`opening_principal`/`draw`
  positive, `repayment` negative, `adjustment` either sign) — never a
  mutable `current_balance` column.
- **A debt payment is a compound operation, not one event.** Principal
  (not an expense), interest (an expense), and fees (an expense) are
  genuinely different `cash_flow_class` values that cannot correctly
  share one `financial_events` row. `record_debt_payment()` creates one
  `financial_operations` row (`operation_type = 'debt_payment'`) and up
  to three `financial_events` rows — only for the components actually
  submitted with a positive amount — sharing that `operation_id`, plus
  one `cash_movements` row per component and one `liability_principal_
  events` `repayment` row for the principal component, all in a single
  transaction. See §3 and the migration file's header for why this
  needed a new grouping construct rather than forcing three semantics
  into Money's existing single-classification event shape.
- **`financial_operations` is deliberately generic** (`operation_type` is
  a CHECK-constrained list, currently just `'debt_payment'`) so a future
  compound operation (asset sale, asset purchase, receivable settlement)
  can reuse the same table by adding a new `operation_type` value — no
  new grouping mechanism, no schema change to `financial_events` itself.
- **Loan proceeds** (`record_loan_proceeds()`) is implemented as a
  minimal atomic operation: one `financial_events` row (`cash_flow_class
  = 'other_inflow'`, never income), one positive `cash_movements` row,
  and one `draw` principal-ledger row. Existing-debt onboarding
  (`create_liability()`) works independently of this — it never touches
  cash at all.
- **Onboarding existing debt never fabricates cash.** `create_liability()`
  inserts only the liability row and an `opening_principal` ledger row —
  no `financial_events`/`cash_movements` row, tested explicitly.
- **Interest rate is metadata, not a forecasting engine.** An optional
  recorded `numeric(7,4)` rate exists on `liabilities`; no amortization
  schedule, compounding convention, or payment forecast is calculated
  from it this phase.
- **Same-currency only**, same reasoning as Receivables §21.

## 23. Compound financial operations and voiding consistency (P0-E2-S4)

The `financial_operations` grouping construct (§22) and the voiding-
consistency mechanism are the two load-bearing new ideas this phase, both
generic enough to outlive this specific use:

- **Grouping**: any future feature that needs more than one correctly-
  classified `financial_events` row from a single user action creates a
  `financial_operations` row (adding a new `operation_type` value if
  needed) and sets `operation_id` on each of its events. Simple,
  single-component events (`money_received`, `transfer`,
  `receivable_recovery`, `loan_proceeds`, ...) leave `operation_id` null
  — nothing about their shape changes.
- **Voiding consistency (a critical requirement this phase)**: when a
  domain-ledger row has a real cash effect (a receivable's `recovery` row,
  a liability's `draw`/`repayment` row), it carries a nullable
  `financial_event_id` pointing at the `financial_events` row that caused
  it. There is deliberately no separate void/active flag on the ledger
  tables — every read model (`receivable_outstanding_amount()`,
  `liability_outstanding_principal()`, and the summary functions) derives
  "is this ledger row still active" from `financial_events.voided_at` via
  a join, exactly mirroring how Money's balance functions already exclude
  voided events. Voiding a `receivable_recovery` or
  `debt_principal_payment` event through the existing, **unmodified**
  `voidFinancialEvent()` mechanism therefore automatically and
  consistently reverts both the cash balance and the domain balance
  (outstanding amount / outstanding principal) — there is no second flag
  that could independently drift out of sync with the first. Verified
  explicitly in both `supabase/tests/receivables/run.ts` and
  `supabase/tests/liabilities/run.ts`: voiding an event changes both
  balances by the exact same originating amount, in the correct opposite
  directions.

## 24. Net worth preparation (Receivables/Liabilities, P0-E2-S4)

Extends §20's pattern: `receivable_native_currency_totals()` and
`liability_native_currency_totals()` return the same `{currency_code,
amount}[]` shape `money_currency_totals()`/`asset_native_currency_totals()`
do, so a future Net Worth/Financial Position calculation can add
receivables as an asset-like figure and liabilities as a deduction, per
currency, converting through the same shared `convertToReportingCurrency()`
— never a second reporting-conversion implementation. Estimated
Recoverable Value and Target Value are excluded from every native-total
calculation, for the same reason target values are excluded from Assets'
totals (§20): they are not current position, they are estimates or
aspirations.

> Net Worth is now implemented — see [§41](#41-unified-financial-position--net-worth-p0-e3-s1).

## 25. Goals domain implementation summary (P0-E2-S5)

Full detail in `supabase/migrations/*_create_goals_domain.sql`. Core
principle: **GOALS DO NOT OWN CASH.** Money owns cash; a goal allocation
assigns PURPOSE to cash that already exists in a bucket. Summary:

- **Four measurement types, one goal record.** `goals.measurement_type` is
  a CHECK-constrained axis (`cash_target`, `debt_balance_target`,
  `monthly_income_target`, `milestone`) that drives all progress math.
  `goals.goal_type_code` (home_property, emergency_reserve, relocation,
  debt_payoff, ...) is a separate, purely descriptive registry
  (`goal_types`, seeded with 13 codes) — it only supplies a sensible
  default measurement_type on the creation form. The two are deliberately
  decoupled rather than one hard-coded switch statement, so a future goal
  type never requires a schema change to the measurement axis.
- **No `target_value`/`current_saved` column on `goals` at all.** The
  current target is always the latest row in the append-only
  `goal_target_history` (a new row per change — old targets are never
  overwritten); current allocated funding is always derived from summing
  the append-only `goal_allocation_events` ledger. Same "derive, never
  store a mutable balance" discipline as every prior domain.
  `target_value` is structurally null for `debt_balance_target` (the
  target is always "outstanding principal = 0", not a number) and
  `milestone` (no numeric target at all) goals — enforced by a trigger,
  not merely a UI convention.
- **`measurement_type`, `liability_id`, and `currency_code` are
  effectively immutable after creation.** `measurement_type`/`liability_id`
  are simply never in the UPDATE grant — there is no legitimate reason to
  reinterpret what a goal's numbers mean after the fact. `currency_code`
  IS grant-editable but blocked by a trigger once any allocation exists
  (identical mechanism to bucket/asset/receivable/liability currency
  immutability).
- **Status transitions are always user-driven, never auto-flipped.**
  Reaching a cash target (remaining = 0) does not silently flip `status`
  to `completed` — the user confirms it. This applies uniformly across all
  four measurement types, since `monthly_income_target`'s "current" isn't
  even calculable this phase (see §26) and `milestone` completion is
  inherently a judgment call, not a formula.
- **At most one focus goal**, enforced by a partial unique index
  (`goals_one_focus_per_user`) that applies regardless of write path — not
  merely by the `set_focus_goal()` convenience RPC's unset-then-set
  behavior. The user chooses; Monatriq never auto-selects the largest or
  nearest goal as focus.
- **Milestones are lightweight and financially inert.** `goal_milestones`
  attach to any goal (not measurement-type-restricted — a cash_target goal
  can have milestones too, alongside the `milestone` measurement type
  where milestones ARE the whole progress model). Completing one is a
  plain `completed_at` column update; it can never create cash, income,
  expense, or goal funding, by construction — no code path connects
  `goal_milestones` to `financial_events`/`cash_movements`/
  `goal_allocation_events` at all.

## 26. Cash allocation, capacity, and the allocation ledger (P0-E2-S5)

- **`goal_allocation_events` is a second, independent append-only ledger**
  alongside Money's `cash_movements` and Receivables/Liabilities' ledgers
  — but it structurally cannot have a cash effect: it carries no
  `financial_event_id` column at all (unlike `receivable_ledger_events`/
  `liability_principal_events`, which do). `allocate` rows are positive,
  `release` rows are negative; current allocation = `sum(amount)`. No
  `financial_events`/`cash_movements` row is ever created by
  `record_goal_allocation()`, `record_goal_release()`, or
  `record_goal_reallocation()` — allocating, releasing, and reallocating
  are pure purpose-reassignment, verified explicitly by asserting bucket
  balances and financial_events row counts are byte-identical before and
  after each operation.
- **Allocation capacity is concurrency-safe, not merely client-validated.**
  `available_to_allocate = bucket balance − sum(existing allocations from
  that bucket, across ALL goals)`. Every allocate/release/reallocate RPC
  issues `SELECT ... FOR UPDATE` on the target bucket row before computing
  this figure, so two concurrent allocation attempts against the same
  bucket serialize instead of both reading the same available balance and
  over-allocating it — the actual "one unit of money, one purpose"
  enforcement mechanism, proven by a dedicated concurrency test
  (`Promise.allSettled` on two simultaneous over-allocating calls; exactly
  one succeeds).
- **Reallocation is one atomic operation, not two client calls.**
  `record_goal_reallocation()` writes a `release` row on the source goal
  and an `allocate` row on the destination goal, sharing one bucket, in a
  single transaction — the same money is never observably assigned to
  both goals at once. Only the release-side row carries the
  `idempotency_key` (the allocate-side row's key stays null); since both
  rows commit together or not at all, a retry is safely detected by the
  release row's key alone. This avoids needing a `financial_operations`-
  style grouping table (§23) for a purely-non-cash pair of ledger rows.
- **Allocation shortfall is reported, never silently rewritten.** If cash
  later leaves a bucket that has allocations attached (an ordinary Money
  spend/transfer — Goals has no say over it and does not intercept it),
  `goal_bucket_shortfalls()` reports `balance`, `allocated_total`, and
  `shortfall = greatest(allocated_total − balance, 0)` per bucket,
  honestly. Nothing about the allocation history is ever adjusted to hide
  the shortfall. The future Financial Rules engine (P0-E2-S6) is expected
  to consume this figure; Goals itself only exposes it.
- **Cross-currency allocation is out of scope this phase** — the bucket's
  currency must equal the goal's currency, mirroring Receivables/
  Liabilities' same-currency-only recovery/payment rule
  ([MULTI_CURRENCY_MODEL.md §18](./MULTI_CURRENCY_MODEL.md#18-goals-same-currency-allocation-and-the-shared-currency-stack)).

## 27. Debt-payoff and recurring-income goals (P0-E2-S5)

- **Debt-payoff goals never store a duplicated debt balance.** A
  `debt_balance_target` goal's `liability_id` is set once at creation
  (immutable afterward) and its progress is always read live from
  `liability_outstanding_principal()` — the exact same function
  Liabilities' own read models use. The one exception is
  `starting_liability_balance`: a frozen, one-time snapshot taken at goal
  creation (never updated, never in the UPDATE grant), which exists purely
  to answer "how much did I owe when I started this goal" and is
  explicitly NOT the live balance. Verified explicitly: a real debt
  payment made after goal creation changes `current_outstanding_principal`
  in `goal_summary()` while `starting_liability_balance` stays frozen.
- **Debt-payoff funding stays conceptually distinct from an actual
  payment.** A cash allocation toward a `debt_balance_target` goal is
  permitted (earmarked future debt-repayment cash) but never automatically
  treated as reducing the debt — the liability's outstanding principal
  only ever changes through `record_debt_payment()`/`record_loan_proceeds()`
  in the Liabilities domain (§22). Allocating money to a debt goal and
  actually paying down the debt remain two separate, deliberately
  un-conflated operations.
- **Recurring-income goals hold no cash at all.** `record_goal_allocation()`
  and `record_goal_reallocation()` both reject any `monthly_income_target`
  goal outright — a $5,000/month income target is not a savings pot, and
  Goals never lets it become one.
- **Current recurring income is never inferred or fabricated.** No
  heuristic reads business-income/salary/asset-sale/receivable-recovery/
  refund/transfer events and guesses a "current recurring income" figure.
  `goal_summary()` simply has no "current" column for
  `monthly_income_target` goals at all — `allocatedTotal`/`remaining` are
  always null and `requiredPaceStatus` is always `not_applicable` for this
  measurement type, regardless of how much unrelated Money activity exists
  for the user. The extension path for a future phase is a dedicated
  recurring-income source-classification layer on `financial_events`/
  categories; until that exists, "Not calculated" is the only honest
  answer.

## 28. Required pace (P0-E2-S5)

`goal_required_pace()` computes a mathematical Required Pace — explicitly
labeled a calculation, not a recommendation — for `cash_target` and
`debt_balance_target` goals only (`monthly_income_target`/`milestone`
return `not_applicable`, since neither has a numeric "remaining" this
phase). Status values: `calculated`, `target_reached`, `no_target_date`,
`no_target_amount`, `date_passed`, `not_applicable` — never a fabricated
number when an input is missing, and never a bare `0%`/`$0` standing in
for "unknown."

Monthly cadence is approximated via average days-per-month
(365.25 / 12 = 30.4375 days); a partial final period rounds UP to a full
period (`ceil`), so the required pace is never understated by rounding
down. "Today" is computed from the caller's `profiles.timezone` where set
(falls back to UTC) — the one piece of "actual profile timezone" data
Monatriq has — rather than the database server's own timezone. "At
Current Pace" forecasting (a predictive, contribution-history-based
projection) is explicitly deferred: this phase has no contribution-history
concept beyond the raw allocation ledger, and a real projection needs more
than that to be honest.

## 29. Financial Rules & Obligations implementation summary (P0-E2-S6)

Full detail in `supabase/migrations/*_create_rules_obligations_domain.sql`.
Summary:

- **"Rule + rule versions," applied a second time.** `financial_rules` is
  the identity/slot for one (user, rule_type, currency) configuration;
  `financial_rule_versions` is append-only history of its threshold — a
  new row is a new version, old thresholds are never overwritten. This is
  the exact same pattern §25/`goal_target_history` already established,
  reused rather than reinvented. `rule_type` is a CHECK-constrained,
  extensible list (currently just `'minimum_cash_floor'`) so a future rule
  (`maximum_capital_per_asset`, `maximum_debt_payment_ratio`, ...) can be
  added without restructuring the table.
- **Explicit zero is structurally distinct from "no rule."** A currency
  with no `financial_rules` row at all (or only an `inactive` one) is
  `not_configured`; a currency with an active rule whose latest version's
  `threshold_value` is exactly `0` is `calculated` with a real zero floor.
  Deactivating a rule (`status = 'inactive'`) preserves all of its version
  history rather than deleting it — reactivating later
  (`create_financial_rule()`) reuses the same identity row and appends a
  new version, it never creates a duplicate.
- **Obligations are a plain, user-owned record — never inferred.** No
  code path reads Money transactions to guess an obligation exists.
  "Overdue" is always derived (`status = 'active' and due_date < today`),
  never a stored `is_overdue` column that could drift out of sync.
  Marking an obligation `'paid'` is organizational metadata only — it
  never fabricates a `financial_events`/`cash_movements` row (a real
  payment still goes through Money, exactly like a debt payment or
  recovery does for their own domains).
- **`is_protected` defaults to `false` at the database level** on both
  `obligations` and (already, since P0-E2-S5) `goals` — an obligation is
  only counted toward retained cash when the user explicitly says so, per
  the phase's "never auto-mark protected" instruction.
- **Goal-linked obligations validate three things, not just ownership**:
  the goal belongs to `auth.uid()`, the obligation's currency matches the
  goal's currency exactly, and the goal's `measurement_type` is one that
  actually accepts monetary funding (`cash_target`/`debt_balance_target` —
  the same two types Goals itself allows cash allocation into, per §26).
  All three are enforced by `prepare_obligation()`'s trigger, not merely
  application-layer validation.

## 30. Backed protected cash and obligation-coverage double-counting (P0-E2-S6)

The two hardest correctness requirements this phase, both solved with one
consistent idea: **only count real cash once, for its most specific
purpose.**

- **Backed vs. nominal allocation.** A goal allocation can nominally
  exceed the real cash left in its bucket after later spending (§26's
  allocation-shortfall concept, now consumed here). `protected_goal_cash`
  in the Safe-to-Deploy formula never uses the nominal allocation — it
  uses `LEAST(protected_allocation_total_in_bucket, bucket_balance)`,
  summed across the user's buckets in that currency. Protected allocations
  have first claim on whatever real cash a bucket holds, ahead of
  non-protected allocations in the same bucket, because "protected" is
  specifically the signal for a higher-priority claim — a deliberate,
  documented precedence choice (the phase brief explicitly asked for one
  rather than an arbitrary/undocumented ordering).
- **When multiple protected goals share one underfunded bucket**, the
  bucket-level formula above already reports the correct AGGREGATE backed
  total honestly (matches the phase brief's own worked example exactly:
  balance 5,000 against two protected goals totaling 7,000 nominal ->
  backed 5,000, shortfall 2,000). Splitting that aggregate back down to
  each INDIVIDUAL goal (needed only for obligation-coverage math, not for
  the currency-level formula) uses a pro-rata split —
  `goal_backed_protected_allocation()` — rather than an invented priority
  order between the goals themselves, per the brief's explicit "avoid
  inventing priority where possible" instruction. The pro-rata shares
  always sum back to exactly the bucket's real backed total, never more.
- **Goal-linked obligation coverage is computed PER GOAL, not per
  obligation.** If two protected obligations both link to the same
  protected goal, they are aggregated together first
  (`rules_uncovered_protected_obligations()`'s `linked_totals` CTE) and
  compared once against that goal's backed protected allocation —
  otherwise each obligation could independently claim up to the goal's
  full backing, double-counting it. Only the amount by which the
  AGGREGATE linked obligation total exceeds the goal's backing becomes an
  additional retained-cash requirement (`uncovered_protected_obligations`).
  An obligation with no `funding_goal_id` has no goal backing to draw on
  at all, so its full amount is always uncovered.
- **A subtle Postgres formatting lesson, worth recording**: `coalesce(sum(x),
  0)` where `x` is a `numeric(20,6)` column loses NUMERIC's display scale
  when the fallback fires — `0::text` renders `"0"`, not `"0.000000"`,
  breaking the exact-decimal string-transport contract every read
  function in this codebase depends on
  ([MULTI_CURRENCY_MODEL.md §6](./MULTI_CURRENCY_MODEL.md#6-decimal-precision--no-floating-point-anywhere)).
  Every bare-zero fallback in this migration (`coalesce`, `greatest`,
  `least`) is explicitly cast `0::numeric(20, 6)` instead — caught by
  running the test suite against a real database (multiple assertions
  expecting `"0.000000"` instead received bare `"0"`), not by reasoning
  about the SQL on paper.

## 31. Safe to Deploy formula (P0-E2-S6)

`safe_to_deploy_by_currency()` computes, per currency:

```
protected_commitments   = protected_goal_cash + uncovered_protected_obligations
required_retained_cash  = MAX(minimum_cash_floor, protected_commitments)
safe_to_deploy           = MAX(liquid_cash - required_retained_cash, 0)
retained_deficit         = MAX(required_retained_cash - liquid_cash, 0)
```

MAX, never SUM: the floor and protected_commitments describe the SAME
"how much must stay untouched" requirement from two different angles (a
blanket threshold vs. specific accounted-for purposes) — the larger one
governs, since the smaller one is already satisfied whenever the larger
is. Summing them would double-count retained cash (verified explicitly:
a scenario with protected commitments 5,000 and floor 3,000 correctly
retains 5,000, not 8,000). `safe_to_deploy` is always clamped at zero —
it never reports a negative deployable figure — but `retained_deficit` is
exposed separately and is never hidden just because the deployable amount
floors at zero (verified: cash 3,000 against required 5,000 reports
`safe_to_deploy = 0` and `retained_deficit = 2,000` simultaneously, both
present and accurate).

Every relevant currency (one with cash, a configured rule, or both) gets
its own row; nothing is ever blended across currencies. A currency with
cash but no active rule reports `status = 'not_configured'` and every
floor-dependent figure (`minimumCashFloor`, `requiredRetainedCash`,
`safeToDeploy`, `retainedDeficit`) is `null` — `liquidCash`/
`protectedGoalCash`/`uncoveredProtectedObligations` are still populated
(they don't depend on a floor existing), so the panel can still show
partial, honest information rather than nothing at all.

## 32. Reporting-currency Safe to Deploy and the proposed cash-use evaluator (P0-E2-S6)

`lib/domain/rules/aggregate.ts`'s `aggregateSafeToDeployToReportingCurrency()`
consolidates per-currency results into one reporting-currency figure —
reusing `convertToReportingCurrency()` from `lib/domain/currency`, no
second FX implementation — but only when EVERY relevant currency is
itself `'calculated'` (a `'not_configured'` currency's true contribution
is unknown, not just unconverted, so its presence alone forces
`not_calculated`) AND every required rate is supplied. Never a guess.

`evaluate_proposed_cash_use(bucket_id, amount)` answers "what happens to
protected liquidity if I use this cash" with neutral, non-advisory labels
(`aligned`/`attention`/`conflict`/`not_configured`/
`insufficient_information`) across three independent dimensions (minimum-
cash-floor, protected-goal, protected-obligation) — never
approve/reject/recommend semantics, verified by an explicit test asserting
none of the returned labels appear in an approval/rejection vocabulary.
It is a pure read: calling it writes nothing.

**RESOLVED (P0-E2-S6A).** The second-order limitation this section
originally documented — the "after" recomputation reflecting only the
proposed bucket's own contribution, not obligation coverage that depends
on OTHER buckets funding the same goal — no longer exists. See §33A.

## 33A. Safe-to-Deploy evaluator consistency hardening (P0-E2-S6A)

The fix is architectural, not a patch: `evaluate_proposed_cash_use()` no
longer contains any independent Safe-to-Deploy arithmetic at all. It
calls `safe_to_deploy_by_currency()` twice — once with no arguments (the
real "before" state) and once with the proposed bucket and a negative
delta as an optional **hypothetical bucket-balance override** (the
"after" state) — and every returned figure is read directly from one of
those two calls, or a simple bucket-local balance comparison. Both calls
run the exact same SQL; there is no second formula that could drift from
the first.

The hypothetical override threads through the full dependency chain —
`goal_backed_protected_allocation()` → `rules_uncovered_protected_
obligations()` → `safe_to_deploy_by_currency()` — applied at exactly one
point: the balance of the one named bucket, inside each function's
innermost balance-computing subquery. Every downstream computation (per-
bucket protected backing, per-goal pro-rata backed allocation correctly
reading every OTHER bucket funding that goal at its real, unmodified
balance, per-goal obligation coverage aggregated across every linked
obligation, and the final currency-level formula) flows from that one
adjusted number through completely unmodified logic. With no arguments,
every function in the chain computes exactly the real current state,
byte-identical to P0-E2-S6's behavior — verified by the full,
unmodified P0-E2-S6 test suite still passing against the refactored
functions.

**Worked-case verification** (all reproduced exactly in
`supabase/tests/rules/run.ts`): a protected goal funded 4,000+4,000 from
two buckets (backed 8,000) with a 7,000 linked protected obligation
(uncovered 0) — evaluating a hypothetical 3,000 spend from ONE of the two
buckets correctly reduces total backing to 6,000 (2,000 now backable from
the spent bucket, 4,000 unaffected from the other) and uncovered
protected obligations to 1,000, not 0. A smaller 1,500 spend correctly
reduces backing to 7,500 while uncovered stays 0 (still fully covered). A
second obligation added to the same goal is correctly aggregated with the
first before comparing against backing, never independently over- or
under-counted. A bucket funding two different protected goals correctly
recalculates both goals' backing simultaneously.

**`protected_obligation_status` semantics** (upgraded from P0-E2-S6's
coarse "does this bucket fund some linked obligation" heuristic):
`conflict` when the hypothetical use creates or worsens uncovered
protected obligations (a direct coverage failure); `attention` when
protected liquidity for the currency decreases without an outright
coverage failure (a factual, evidence-based signal — `protected_goal_
cash` decreasing — never an invented percentage threshold); `aligned`
otherwise.

**Override snapshots require no separate formula.**
`record_cash_use_override()` was not modified at all this phase — it
already called `evaluate_proposed_cash_use()` for its snapshot, so fixing
the evaluator automatically corrected every override recorded from that
point forward, verified explicitly (a scenario that would have
incorrectly shown `'aligned'` under the P0-E2-S6 evaluator now correctly
snapshots `'conflict'`).

A genuine second, unrelated NUMERIC-precision bug was found and fixed in
the same migration: the pro-rata branch of `goal_backed_protected_
allocation()` (`nominal_amount * LEAST(balance, protected_total) /
protected_total`) is a NUMERIC division, which intentionally produces
MORE decimal digits than either operand — left unrounded, this expanded
to results like `"1000.0000000000000000"` once cast to text, rather than
the codebase's `"1000.000000"` convention. Fixed by wrapping the division
in `round(..., 6)`. See
[SECURITY_AND_RLS_PRINCIPLES.md §17](../security/SECURITY_AND_RLS_PRINCIPLES.md#17-established-pattern-financial-rules-obligations--safe-to-deploy-p0-e2-s6)
for the general NUMERIC-scale lesson this extends.

## 33. Override audit (P0-E2-S6)

`cash_use_overrides` records "the user acknowledged these conflicts" —
nothing more. Recording one calls `evaluate_proposed_cash_use()` for a
fresh snapshot, freezes its conflict labels into an immutable `jsonb`
column (`conflicts_snapshot`), and stores the before/after Safe-to-Deploy
figures alongside. No `UPDATE`/`DELETE` grant exists on this table at
all — override rows are append-only and immutable under every normal user
flow, verified explicitly (a direct `UPDATE` attempt is rejected by grant
absence, not merely by a policy). Recording an override **never** creates
a `financial_events`/`cash_movements` row, never alters a goal, and never
alters an obligation — actual execution of a real spend still belongs to
Money, and still gets evaluated fresh against whatever the state looks
like at that later moment (Safe to Deploy is a read model, not a
reservation system — see the phase brief's explicit instruction not to
turn this phase into one).

## 34. Decisions domain implementation summary (P0-E2-S7)

Full detail in `supabase/migrations/*_create_decisions_domain.sql`. Core
principle, enforced architecturally not just documented: **a Decision is
a plan, never a transaction.** No function in the Decisions migration
writes to `financial_events`/`cash_movements`/`assets`/`liabilities`/
`goals`/`obligations` — not on scenario creation, not on evaluation, not
on saving an evaluation snapshot, and critically, not on recording ANY
user choice including `'proceed'`. Summary:

- **`decisions`** (id, user_id, decision_type_code, name, description,
  linked_asset_id, linked_liability_id, status, timestamps) is the
  Decision's identity. `status` (active/closed/archived) is lifecycle
  only; the user's actual conclusion lives entirely separately in
  `decision_choices` (§40) — the two are deliberately never collapsed
  into one overloaded field.
- **`decision_types`** is a public, extensible registry (buy_asset,
  sell_asset, repair_improve_asset, business_investment,
  large_personal_purchase, use_savings, take_debt, pay_down_debt,
  start_new_venture, other) — purely descriptive, the same "registry vs.
  math" decoupling established for `goal_types`/`liability_types`.
- **`linked_asset_id`/`linked_liability_id` live on the Decision, not on
  each scenario** — multiple scenarios under one Decision (e.g. "Sell
  As-Is" vs. "Repair Then Sell") are about the SAME asset, so the subject
  of consideration belongs at the Decision level. Neither link is
  type-enforced (no CHECK constraint ties `decision_type_code` to
  requiring a specific link) — deliberately, since which types benefit
  from a link is a UI/product concern, and `other` must remain genuinely
  flexible, not a rigid escape hatch.

## 35. Scenario architecture and input/assumption design (P0-E2-S7)

`decision_scenarios` deliberately avoids both anti-patterns the phase
brief warned against: a giant per-decision-type column explosion, and a
JSONB/EAV bag of authoritative numbers. Instead, it uses a moderate set
of strongly-typed `numeric(20,6)` columns, each with ONE clear economic
role **reused by name** across every decision type that needs it:

| Column | Reused by |
|---|---|
| `cash_required` | buy_asset (purchase price), repair_improve_asset (repair cost), business_investment/start_new_venture (investment amount), large_personal_purchase/use_savings (amount) |
| `acquisition_costs` | buy_asset only |
| `gross_proceeds` / `proceeds_costs` | sell_asset (sale price / selling costs), take_debt (proposed principal / fees deducted) |
| `debt_principal_payment`/`debt_interest_payment`/`debt_fee_payment` | pay_down_debt only — mirrors Liabilities' own three-component vocabulary exactly |
| `interest_rate`/`term_months`/`monthly_payment_assumption`/`collateral_note` | take_debt only — recorded, never used for an amortization calculation |
| `expected_value_assumption` | buy_asset, repair_improve_asset, business_investment, start_new_venture |
| `expected_future_sale_value`/`capitalization_classification` | repair_improve_asset only |
| `sale_date_assumption` | sell_asset only |
| `holding_period_months` | generic timing assumption |

A scenario simply populates whichever columns are relevant to it; unused
columns stay null and contribute nothing to the derived totals
(`total_cash_required`/`net_proceeds`, computed at evaluation time,
never stored). JSONB is used ONLY for the immutable evaluation-snapshot
audit trail (§39) — never as a source for arithmetic, per the phase
brief's explicit instruction.

`source_bucket_id`/`destination_bucket_id`, when set, must match the
scenario's own `currency_code` exactly (trigger-enforced) — the same
same-currency-only discipline established for Goals/Receivables/
Liabilities. A scenario naming both a source and a genuinely different
destination bucket has its source bucket's outflow evaluated as the
primary liquidity concern; a combined simultaneous view across two
different buckets is not modeled this phase — every one of the ten
canonical decision types only ever needs one bucket, so this is a
narrow, documented scope limitation (realistic only for a generic
`other` scenario), not a fabricated result.

## 36. Facts vs assumptions vs derived values (P0-E2-S7)

`evaluate_decision_scenario()`'s return shape keeps these three
structurally separate, never merged:

- **Facts** are read LIVE from their owning domain on every call —
  `asset_summary()` for `linked_asset_cost_basis`/`linked_asset_latest_
  value`/`linked_asset_quick_sale_estimate`/`linked_asset_target_value`,
  `liability_outstanding_principal()` for `linked_liability_outstanding_
  principal`, and a direct `cash_movements` sum for `source_bucket_
  balance`/`destination_bucket_balance`. None of these are ever copied
  into a scenario's own columns — a Decision's facts can never go stale
  relative to the domain they came from, because they are never stored
  independently at all.
- **Assumptions** are echoed back exactly as the user entered them
  (`cash_required`, `gross_proceeds`, `expected_value_assumption`, ...) —
  never silently reinterpreted as a fact. A sell-asset scenario's
  expected sale price is always the user's own number; the asset's
  `target_value`/`quick_sale_estimate` are shown alongside as facts but
  are NEVER auto-substituted as the assumption, even when the user
  leaves the assumption blank (verified explicitly: an evaluation with
  no `gross_proceeds` entered reports `net_proceeds: null`, never the
  asset's target value).
- **Derived** values (`total_cash_required`, `net_proceeds`,
  `net_immediate_cash_delta`, `projected_gross_profit_loss`,
  `hypothetical_liability_outstanding_after`, `basis_after_capitalized_
  improvement`, and the whole Safe-to-Deploy before/after block) are
  computed from facts + assumptions inside the evaluation function
  itself — never stored, always recomputed live, and always null (never
  a fabricated zero) when a required input is missing (tracked via the
  `missing_information` array).

## 37. Cash-impact model and Safe-to-Deploy reuse (P0-E2-S7)

A scenario may describe an outflow, an inflow, or (rarely) neither — the
architecture never assumes every Decision is a spend. The critical
architectural move this phase: P0-E2-S6A's `evaluate_proposed_cash_use()`
only ever modeled a SPEND (a positive amount, always subtracted).
Decisions also needed to model an INFLOW (asset-sale proceeds, loan
proceeds) through the exact same rule-relationship logic, and the phase
brief explicitly forbade forking that logic into a second copy.

The fix: that logic was extracted into a new, sign-agnostic shared
function, `evaluate_hypothetical_bucket_liquidity(bucket_id, delta)`,
which accepts ANY sign of delta and internally calls
`safe_to_deploy_by_currency()` twice (real state, then with the
hypothetical delta applied) — exactly the same "one calculation model"
discipline P0-E2-S6A established for Safe-to-Deploy itself, now extended
one layer up. `evaluate_proposed_cash_use()` became a thin wrapper over
this shared function (negating a positive spend amount before calling
it); its own public signature and return shape are completely
unchanged — verified by the full, unmodified P0-E2-S6/S6A test suite
(155 assertions) continuing to pass against the refactor.
`evaluate_decision_scenario()` calls the SAME shared function directly,
with a positive delta for a pure inflow scenario or a negative delta for
a pure outflow scenario — there is exactly one hypothetical-liquidity
calculation in the entire codebase, consumed by three different callers
(the Rules evaluator, Decisions, and indirectly the override-recording
flow). A hypothetical asset-sale amount or proposed loan never increases
real cash, never creates a `financial_events` row, and never marks an
asset sold or creates a liability — verified explicitly.

## 38. Asset and liability decision behavior (P0-E2-S7)

**Sell asset**: facts come from `asset_summary()` (cost basis, latest
value, quick-sale estimate, target value); the user's own `gross_
proceeds`/`proceeds_costs` assumptions drive `net_proceeds` and
`projected_gross_profit_loss = net_proceeds - cost_basis` — labeled
Projected/Scenario throughout, never realized profit, and the asset
itself is never archived, sold, or basis-adjusted by evaluating or
saving a scenario (verified explicitly).

**Repair/improve asset**: `capitalization_classification`
(`capital_improvement`/`expense`) is an explicit, required-where-
relevant user choice — Monatriq never decides automatically whether
repair spending capitalizes. Only when a scenario is explicitly
classified `capital_improvement` does `basis_after_capitalized_
improvement = cost_basis + cash_required` get computed, and even then
only as a projected, unmutated preview — the real asset's basis is
never touched (verified explicitly, including a paired `expense`-
classified scenario confirming no basis projection is shown at all).

**Buy asset**: no Asset row is ever created by evaluating or saving a
buy-asset scenario (verified explicitly) — purchase price and
acquisition costs are pure assumptions feeding the same shared cash-
impact/Safe-to-Deploy calculation every outflow scenario uses.

**Business investment / start new venture**: since no dedicated
Businesses domain exists yet, neither type fabricates a business
valuation or entity — only the proposed cash use and its liquidity/rule
effects are evaluated, exactly like any other outflow scenario, with an
optional `expected_value_assumption` shown plainly as a user assumption,
never claimed as a resulting market value.

**Take debt**: no Liability row is ever created by evaluating or saving
a take-debt scenario (verified explicitly). `interest_rate`/
`term_months`/`monthly_payment_assumption`/`collateral_note` are
recorded assumptions only — no amortization schedule is computed from
them.

**Pay down debt**: facts come live from `liability_outstanding_
principal()` — the exact function Liabilities' own read models use, not
a duplicated balance. `hypothetical_liability_outstanding_after =
outstanding - debt_principal_payment` is a pure projection; evaluating
or saving a scenario never calls `record_debt_payment()` or otherwise
reduces the liability's real outstanding principal (verified explicitly:
the liability's real balance is re-read after saving and confirmed
unchanged).

## 39. Evaluation snapshots, re-evaluation, and scenario comparison (P0-E2-S7)

`evaluate_decision_scenario()` is a pure, un-persisted read — evaluating
a scenario on screen writes nothing. `save_decision_scenario_evaluation()`
calls that same read and freezes its complete result (`to_jsonb()` of
the evaluation record) into an append-only, immutable row in `decision_
scenario_evaluations` — no `UPDATE`/`DELETE` grant exists on that table
at all (verified: a direct update attempt is rejected by grant absence).
Re-evaluating and saving again APPENDS a new snapshot rather than
overwriting the prior one (verified explicitly: two saves produce two
distinct, both-readable rows) — "current evaluation" is always the
latest by `evaluated_at`, the same derive-don't-duplicate discipline
every prior domain follows.

When a Decision has multiple scenarios, the application evaluates each
independently and presents them side by side (`GoalList`-style
iteration, not a SQL-level "compare" function) — the evaluation result
type carries no `rank`/`score`/`winner` field at any layer, verified by
an explicit structural test asserting those keys are absent from the
returned object, not merely that their values happen to be neutral.

## 40. User choice and the decision journal (P0-E2-S7)

`decision_choices` is append-only: `proceed`/`wait`/`decline`/
`keep_reviewing`, with the current choice always the latest row by
`created_at` — no `is_current` flag, no overwriting a changed mind.
`record_decision_choice()` inserts exactly one row and touches nothing
else — there is no code path in it that could write to another table
even if it wanted to, which is the entire mechanism by which "Proceed
does not execute" is enforced, verified explicitly across all four
choices (zero change to bucket balances, Assets, and Liabilities after
each). Together with `decision_scenario_evaluations` (§39), the journal
lets the application reconstruct what was considered, what assumptions
were used, what the evaluation showed at the time, and how the user's
own conclusion evolved — without a second, duplicate transaction system.
Actual-outcome (expected vs. actual) comparison remains an explicit,
clean extension point, not implemented this phase.

## 41. Unified Financial Position & Net Worth (P0-E3-S1)

**Aggregation, not ownership.** `lib/domain/financial-position/` is a
composition boundary, not a new data owner. It stores nothing and
re-derives nothing that another domain already calculates — it reads
`money_currency_totals()`, `asset_native_currency_totals()`,
`receivable_native_currency_totals()`, `liability_native_currency_totals()`,
`safe_to_deploy_by_currency()`, `asset_summary()`, `receivable_summary()`,
and `goal_bucket_shortfalls()` and composes them. Net Worth is the *only*
new calculation this phase introduces.

**Query strategy.** One `SECURITY INVOKER` SQL function,
`financial_position_by_currency()`, composes every per-currency NUMERIC
figure via CTEs (one per canonical function, `union`-ed on `currency_code`
so a currency present in any source appears in the result even if others
have no row for it) — avoiding N+1 round trips for tabular, currency-keyed
data. Goals/Decisions/Obligations summaries (list-shaped, not
currency-keyed) are fetched in parallel (`Promise.all`) at the TypeScript
layer by `getFinancialPositionSummary()` in
`lib/domain/financial-position/repository.ts`, reusing `getGoalSummaries()`,
`getDecisionSummaries()`, and `getUpcomingObligations()` unmodified.

**Net Worth formula** (per native currency):

```
netWorth = liquidCash + nonCashAssetValue + receivablesOutstanding − liabilitiesOutstanding
```

- `liquidCash` = `money_currency_totals()` — actual bucket balances.
- `nonCashAssetValue` = `asset_native_currency_totals()` — latest
  `estimated_current_value` only. `target_value` and `quick_sale_estimate`
  never enter this figure (§20).
- `receivablesOutstanding` = `receivable_native_currency_totals()` — face
  minus recovered, never the estimated recoverable value (§24).
- `liabilitiesOutstanding` = `liability_native_currency_totals()` — current
  outstanding principal only; interest/fees already paid are gone from
  cash but never reduce this figure retroactively, and future interest is
  never assumed.
- Never clamped: a currency with more debt than assets legitimately
  produces a negative `netWorth`.

**Why this formula is invariant under Goals/Rules/Obligations/Decisions.**
None of those domains write to `cash_buckets`, `asset_valuations`,
`receivable_ledger_events`, or `liability_principal_events` — the four
tables Net Worth's inputs are ultimately read from. Goal allocation moves
nothing between tables (it's a claim on cash already in a bucket, not a
new balance); Rules/Obligations are configuration and commitments, not
transactions; Decision evaluation is a pure read and `record_decision_
choice()` writes only to `decision_choices`. This is structural, not
coincidental — verified explicitly in
`supabase/tests/financial-position/run.ts` for every combination (goal
allocate/release/protect, rule create, obligation create/pay, decision
evaluate/choose).

**Liquid & Protected Position.** `protectedGoalCash`, `protectedCommitments`,
`minimumCashFloor`, `requiredRetainedCash`, `safeToDeploy`,
`safeToDeployStatus`, `retainedDeficit` are read verbatim from
`safe_to_deploy_by_currency()` (P0-E2-S6/S6A) — not recomputed. In
particular `protectedGoalCash` is already the *actual backed* protected
cash from that function (capped at real bucket balance, never the nominal
allocation), so Financial Position inherits that correctness for free.

**Allocation shortfall.** `allocationShortfall` sums `goal_bucket_
shortfalls()` per currency and is always a real number (0 when nothing is
short) — exposed as its own field, never folded into `safeToDeploy`.

**Potential Liquidity — kept structurally separate from Net Worth and
Safe to Deploy.** `assetQuickSalePotential` (sum of recorded
`quick_sale_estimate`s) and `receivablesEstimatedRecoverable` (sum of
recorded `estimated_recoverable_value`s) are both `null` — not `0` — when
nothing was ever recorded, achieved for free via Postgres's `SUM()` over
an empty/all-`NULL`-filtered group returning `NULL`. Neither figure feeds
`liquidCash`, `netWorth`, or `safeToDeploy` at any point in the query —
there is no code path connecting them. `receivablesRecoverabilityDifference
= receivablesEstimatedRecoverable − receivablesOutstanding`, `null` exactly
when the estimate is `null`.

**Reporting currency.** `lib/domain/financial-position/aggregate.ts`'s
`convertFinancialPositionToReportingCurrency()` converts each of the four
Net Worth components independently through `convertToReportingCurrency()`
(never pre-summing mixed currencies), and only combines the four
converted, reporting-currency totals — via `decimal.js` — once all four
succeed. If any required rate is missing for any component, the whole
result is `{ status: "not_calculated", missingRates: [...] }` — never a
partial sum silently omitting a currency. See
[MULTI_CURRENCY_MODEL.md §23](./MULTI_CURRENCY_MODEL.md#23-financial-position-reporting-currency-net-worth-p0-e3-s1).

**No stored snapshot.** Financial Position has no table. Every value is
derived live, on every read, from its owning domain's current state —
`asOf` is a calculation timestamp, not a claim of permanent currency.

**Read model.** `NativeFinancialPosition` (one row per currency) and
`FinancialPositionSummary` (the composed whole, including `focusGoal` —
`null` unless the user explicitly selected one — and `activeDecisions` —
unranked, no `rank`/`score`/`winner` field) live in
`lib/domain/financial-position/types.ts`. Recent Activity is deliberately
**not** included: it would either duplicate Money's own activity read
model or require a second one — Home calls `money_recent_activity()`
directly instead. A "This Month" figure was a deliberate gap as of this
section's original writing (P0-E3-S1) — see
[§42](#42-money-period-summary-reporting-fx-context--liquidity-completeness-p0-e3-s1a),
which closes it.

**Application integration.** `/financial-position`
(`app/(app)/financial-position/page.tsx`) is a restrained, read-only proof
of the domain — Financial Position by Currency, Liquid & Protected
Position, Potential Liquidity, Upcoming Obligations, Focus Goal, Active
Decisions — not the final Home design, no fake data. Extended P0-E3-S1A
with Reporting Position, a manual reporting-rate entry form, This Month,
and Liquidity Completeness — see §42.

## 42. Money period summary, reporting FX context & liquidity completeness (P0-E3-S1A)

A narrow, three-part Home-readiness phase — no new product domain, no
redesign of any foundation screen. All three reuse existing tables and
classification; the only new tables are none (zero new tables this
phase — six new functions only).

**Money period summary ("This Month").** `money_period_summary()`
classifies purely from `financial_events.cash_flow_class` — the same
income/other_inflow/expense/other_outflow/transfer/opening_balance
vocabulary `set_financial_event_classification()` already derives (§17,
§21) — never from `event_type` directly. This is deliberate and
forward-looking: a future event type (e.g. an eventual asset-sale-
proceeds event) needs no change to this function at all as long as its
`cash_flow_class` is set correctly, since the filter is semantic, not
enumerative. `cashIn`/`cashOut` are real EXTERNAL flows only —
`opening_balance` and `transfer`/`fx_transfer` are excluded entirely, on
both legs of a transfer including a cross-currency one.
`earnedIncome`/`expense` are strict subsets (`income` only, `expense`
only) — receivable recovery and loan proceeds are `cashIn` but never
`earnedIncome`; debt principal repayment is `cashOut` but never
`expense`; debt interest/fees are both. `transferIn`/`transferOut` are
exposed separately, never folded into external flow.

**Timezone/period boundary.** `resolve_period_bounds()` is the single
place "what period does 'this month' mean for this user, right now" is
resolved — `coalesce(profiles.timezone, 'UTC')`, exactly the pattern
`obligation_summary()`/`upcoming_obligations()` already established
(§27-ish; see the Rules/Obligations migration), never the database
server's own timezone. It is called both directly (so a period with zero
activity still has knowable, real bounds) and internally by
`money_period_summary()`, so the two can never disagree.

**Reporting FX context.** No second FX subsystem: `public.fx_rates`
(P0-E2-S2) already anticipated exactly this use — its own original
comment says "source=manual rows are standalone user notes."
`record_manual_reporting_rate()` is a thin, self-documenting entry point
(`source` is always `'manual'`, `event_id` is always `null`) over the
same table. Transaction-actual rates (`source='transaction_actual'`,
auto-created by `record_fx_transfer()` for the rate actually applied to
one real transfer) remain completely separate rows with a different
meaning; `reporting_fx_rates()` filters `source = 'manual'` explicitly,
so a past transaction's actual rate is never silently reused as a
current reporting/valuation rate — verified explicitly (a real
`fx_transfer` auto-creates a `transaction_actual` row, a manual rate is
recorded for the same pair with a deliberately different value, and only
the manual one is ever returned).

Direct/inverse resolution happens in TypeScript
(`lib/domain/currency/reporting-rates.ts`'s `resolveReportingRates()`),
not SQL: `reporting_fx_rates()` returns the user's own latest-per-pair
manual rows touching the reporting currency, in either direction,
completely unmodified; a direct rate (stored as currency → reporting)
always wins over an inverse rate (stored as reporting → currency) when
both exist, since the direct entry is literally what the user recorded
to express that currency in the reporting currency. Inversion itself
uses `decimal.js` exclusively. Rate history is append-only — recording a
new rate never overwrites an older one; the latest `rate_as_of` wins.

**Financial Position reporting integration.** `getFinancialPositionSummary()`
(`lib/domain/financial-position/repository.ts`) now also resolves the
user's own manual rates and calls the unchanged, reused
`convertFinancialPositionToReportingCurrency()` (§41) — Home never
constructs a rate map itself. `reportingPosition` is a genuinely
three-state field: `null` when the user has no reporting currency
configured at all (nothing to consolidate into — a more fundamental gap
than a missing rate), `{status: "not_calculated", missingRates: [...]}`
when the reporting currency is known but a required rate is missing, and
`{status: "calculated", ...}` only once every required rate exists.
`reportingRateContext` exposes full provenance per currency — stored
base/quote as recorded, whether inverted, `rate_as_of`, source (always
`"manual"` this phase, never `live`/`market`/`official`) — so Home can
eventually explain exactly how a consolidated figure was constructed.

**Liquidity completeness.** `asset_quicksale_coverage()`/
`receivable_recoverability_coverage()` read from `asset_summary()`/
`receivable_summary()` — the same canonical sources
`financial_position_by_currency()` already uses for
`assetQuickSalePotential`/`receivablesEstimatedRecoverable` — never a
second raw-table query, so the sums stay trivially consistent with what
Financial Position already shows. Each adds COUNTS (active items vs.
items with a recorded estimate) and a `coverage_status` of `not_set`
(zero recorded), `partial` (some but not all), or `complete` (every
active item), so Home can distinguish "the only number we have" from
"the whole picture." Archived items are excluded from both the numerator
and denominator, so archiving an unestimated item can restore `complete`
status — verified explicitly. These completeness fields alter neither
Net Worth nor Safe to Deploy — verified explicitly by capturing a
currency's `financial_position_by_currency()` row before and after
completing its coverage and asserting `netWorth`/`safeToDeploy`/
`safeToDeployStatus` are byte-identical.

**Query strategy.** `getFinancialPositionSummary()` batches every read
that doesn't depend on another read's result into one `Promise.all` (8
parallel round trips: profile, native positions, goals, decisions,
obligations, this month, both coverage reads), followed by one
conditional extra round trip (`reporting_fx_rates()`) only when a
reporting currency is actually configured — it cannot be batched with
the rest because it needs `profile.preferred_currency` first.

**Security.** All six new functions are `SECURITY INVOKER`; zero new
tables, zero new RLS policies. See
[SECURITY_AND_RLS_PRINCIPLES.md §20](../security/SECURITY_AND_RLS_PRINCIPLES.md#20-established-pattern-pure-composition-function-over-other-security-invoker-functions-p0-e3-s1)
for why composing only `SECURITY INVOKER` functions is safe by
construction — this phase's functions follow the identical pattern, plus
one ordinary owned-row table (`record_manual_reporting_rate()` inserts
with `user_id = auth.uid()`, already RLS-enforced by `fx_rates_insert_own`
from P0-E2-S2).
