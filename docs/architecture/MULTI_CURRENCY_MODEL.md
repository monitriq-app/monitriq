# Monitriq — Multi-Currency Model

Status: Canonical. Established P0-E2-S2 (Money), hardened P0-E2-S3
(comprehensive registry + Assets). This document is the implementation
record for currency, precision, and FX — the pieces of
[FINANCIAL_DOMAIN_MODEL.md](./FINANCIAL_DOMAIN_MODEL.md) that needed more
room than a section there.

## 1. Four currency concepts, never confused

- **Bucket currency** — the currency a `cash_buckets` row actually holds
  (`cash_buckets.currency_code`). Fixed once the bucket has any
  `cash_movements` — see §4.
- **Asset (native) currency** — the currency an `assets` row is valued and
  cost-based in (`assets.currency_code`). Fixed once the asset has any
  `asset_basis_events` or `asset_valuations` — same immutability mechanism
  as bucket currency, established P0-E2-S3. An asset's currency is
  independent of any bucket's currency and independent of the user's
  reporting currency — see §2.
- **Movement/valuation/basis-event currency** — the currency of one
  specific `cash_movements` / `asset_valuations` / `asset_basis_events`
  row. Always equal to its parent bucket's/asset's currency (enforced by a
  trigger, not just convention — see §4, §15).
- **Reporting currency** — the user's preferred currency for consolidated
  views (`profiles.preferred_currency`, established P0-E2-S1). A user's
  reporting currency does not constrain which currencies their buckets or
  assets hold — see §2.

Monitriq is multi-currency from day one: NGN is one supported currency
among many, never assumed.

## 2. A user's buckets and assets do not have to share a currency

A user with `preferred_currency = NGN` can hold a NGN bank account, a USD
savings bucket, a GBP cash wallet, an NGN property, and a USD brokerage
account simultaneously. Nothing about the schema or RLS policies
constrains a user to one currency anywhere.

## 3. Currency registry — one comprehensive source of truth

`public.currencies` (code, display_name, symbol, decimal_exponent) is the
**one** canonical supported-currency source for the whole application —
Profile onboarding, Money (cash buckets), and Assets all read it via
`lib/domain/currency/repository.ts`'s `listCurrencies()`; none maintains
its own list. `lib/domain/profile/currencies.ts`, a hand-maintained
26-code list that duplicated this registry, was **removed in P0-E2-S3**
(not just documented as removable — `supabase/tests/currency/run.ts`
asserts the file no longer exists, so this can't silently regress).

Not user-owned — RLS enabled with a permissive `USING (true)` read policy
(public reference data, not a security boundary; see
[SECURITY_AND_RLS_PRINCIPLES.md §10](../security/SECURITY_AND_RLS_PRINCIPLES.md#10-established-pattern-profiles-p0-e2-s1)
for when that's correct rather than a shortcut). `code` (e.g. `USD`) is
the canonical identifier everywhere in the schema; `symbol` (e.g. `$`) is
presentation metadata only, never used for identity or comparison.

**Comprehensive coverage (P0-E2-S3):** 158 currencies, expanded from
P0-E2-S2's 26-code starter set via
`supabase/migrations/*_expand_currency_registry.sql`. Derived from a
reliable maintained source rather than typed from memory: the ECMA-402
`Intl` API's bundled ICU/CLDR data (`Intl.supportedValuesOf('currency')`
for the code list, `Intl.DisplayNames`/`Intl.NumberFormat` for display
name/symbol/decimal precision), with a documented, reproducible exclusion
list (IMF Special Drawing Rights, a regional clearing unit, and two
superseded historical codes with real replacements already in the list —
see the migration file's header for the exact method and reasoning).
Crypto was never in scope: ISO 4217/ICU's currency list never included it,
so nothing had to be filtered out for that reason specifically. The
migration is idempotent (`ON CONFLICT (code) DO UPDATE`), so even the
original 26 rows now carry the same ICU-sourced metadata as the other 132
— one consistent source for all 158, not "26 hand-typed + 132 generated."

## 4. Bucket currency immutability

Once a bucket has any `cash_movements`, its `currency_code` cannot change
— enforced by `enforce_bucket_currency_immutable()` (a `BEFORE UPDATE`
trigger), not merely documented convention. Changing a bucket from USD to
NGN after it has history would silently reinterpret every past movement's
meaning. A user who needs a different currency creates another bucket.

## 5. No stored balance

`cash_buckets` has no `balance` column. The authoritative balance is
always `sum(cash_movements.amount)` for that bucket's non-voided events —
see §9. This is intentional: a mutable cached balance is a second source
of truth that can drift from the movement history; the movements are the
ledger.

## 6. Decimal precision — no floating point, anywhere

- **Database**: `cash_movements.amount` is `numeric(20, 6)` — never
  `real`/`double precision`. `fx_rates.rate` is `numeric(24, 12)` — more
  precision than cash amounts, since a rate like 1610.234567891234 needs
  more decimal places than any realistic cash amount does.
- **Not every currency has 2 decimal places.** `currencies.decimal_exponent`
  records each currency's actual convention (0 for JPY, 2 for most
  currencies in the registry, 3 for KWD). A trigger
  (`prepare_cash_movement()`) rejects any amount with more fractional
  precision than its currency allows — e.g. inserting JPY 1000.50 or KWD
  1.2345 fails at the database layer, not just in a form validator. Tested
  explicitly in `supabase/tests/money/run.ts`.
- **JSON transport**: PostgREST serializes a SQL `numeric` column as a
  JSON *number* by default, which risks float64 precision loss for
  large/precise values once a JS client's `JSON.parse` touches it. The
  read functions in §9 (`money_bucket_balances`, `money_currency_totals`,
  `money_recent_activity`) cast every amount to `text` in their `RETURNS
  TABLE` shape specifically to avoid this — the value arrives in
  TypeScript as an exact decimal string, never a parsed float. Direct
  `SELECT` on `cash_movements` is still possible (see §10) and would not
  get this protection; the application (`lib/domain/money/repository.ts`)
  never does that.
- **TypeScript**: `decimal.js` is the one arbitrary-precision decimal
  library used throughout `lib/domain/money/` (chosen for being small,
  mature, and the most widely used option in this space — no other
  numeric library is used anywhere in the codebase). Every repository
  function accepts amounts as `string`, never `number`. Writing to the
  database goes through PostgREST's RPC call, which extracts JSON body
  values as text before casting to the SQL parameter type — so a JSON
  *string* amount is parsed into `numeric` exactly, with no JS float
  round-trip, even though the generated TypeScript RPC-argument types
  describe the parameter as `number` (a limitation of how `supabase gen
  types` maps SQL `numeric`, not a statement about what's actually safe to
  send — see the comment on `asNumericParam()` in `repository.ts`).
- **Display**: `lib/domain/money/format.ts` formats using each currency's
  own `decimal_exponent` and groups thousands via string manipulation
  (never round-tripping through a JS `number`), always prefixed with the
  currency code (`NGN 2,300,000`, never a bare `₦` or `$` — see
  [VISUAL_CONSTITUTION.md §8](../design/VISUAL_CONSTITUTION.md)).

## 7. FX rate convention (fixed, one direction, documented once)

**rate = units of quote_currency received for 1 unit of base_currency.**

Example: `base_currency = USD`, `quote_currency = NGN`, `rate = 1610`
means 1 USD = 1610 NGN.

For an executed `fx_transfer` event, `base_currency` is always the
**source** bucket's currency and `quote_currency` is always the
**destination** bucket's currency; `rate = destination_amount /
source_amount` — the actual rate the user experienced, computed once,
stored permanently.

## 8. Cross-currency transfers preserve both original amounts

`record_fx_transfer()` stores the exact source amount and exact
destination amount as two separate `cash_movements` rows (one debit in the
source currency, one credit in the destination currency) — neither is
derived from the other after the fact, and neither is ever discarded. The
applied rate is stored in `fx_rates` with `source = 'transaction_actual'`
and is never overwritten by a later market rate — see §11.

FX fees are not automatically bundled into a transfer this phase: if a
bank charges a fee, it is recorded as its own `money_spent` event (the fee
*is* spending, not part of a neutral transfer) using the existing
`record_money_spent()` primitive — no schema change needed to support
this, it just isn't automated into one RPC call yet.

An `fx_transfer` event's `cash_flow_class` is always `transfer` — moving
value between two currencies the same user owns is neither income nor
spending merely because the reporting-currency-equivalent amounts differ.
FX gain/loss accounting (revaluing an existing balance because market
rates moved) is explicitly not implemented — out of scope until genuinely
needed.

## 9. One shared balance calculation, never re-derived per screen

`money_bucket_balances()` (per bucket + currency) and
`money_currency_totals()` (per currency, across buckets) are the only
authoritative balance calculations. Both are `SECURITY INVOKER` SQL
functions — Home, Money, and any future consumer call these, none
independently sums `cash_movements`. Both exclude voided events
(`e.voided_at is null`) and never sum across currencies — the return shape
is always `{currency_code, amount}[]`, never a single blended number.

## 10. Reporting-currency conversion: an explicit, unwired boundary

`lib/domain/money/conversion.ts`'s `convertToReportingCurrency()` is the
domain boundary for turning a set of per-currency balances into one
reporting-currency total — but only when the caller supplies an explicit
rate for every non-reporting currency present. Missing even one rate
returns `{status: "not_calculated", missingRates: [...]}` rather than a
partial or guessed total. It never calls an external FX API and never
fabricates a rate.

**Not wired into any UI this phase.** `/money` shows only `Cash by
Currency` (§9's per-currency totals) — no consolidated single-number
total is displayed anywhere, because no rate source (manual entry or
otherwise) is presented to the user yet. This function exists, and is
tested (`supabase/tests/money/run.ts`), specifically so that boundary is
real rather than a documented-but-unenforced intention.

## 11. Historical vs. current FX — never rewritten

An executed `fx_transfer`'s applied rate (`fx_rates.source =
'transaction_actual'`) is permanent. Nothing in this system ever replaces
it with a later market rate. `fx_rates.source = 'manual'` rows are a
separate, standalone concept: a user's own note about a rate they know
about, not tied to any transaction (`event_id is null`), useful later for
planning or reporting conversion (§10) — never conflated with an actually-
applied transaction rate. Provider/bank/broker-sourced rates are an
anticipated future `source` value; none are integrated this phase (V1 is
manual-first, per
[PRODUCT_DEFINITION.md](../product/PRODUCT_DEFINITION.md)) — Monitriq
never claims a "live rate" or "current market rate" it doesn't actually
have.

## 12. Assets: no cross-currency appraisal this phase

`asset_valuations.currency_code` and `asset_basis_events.currency_code`
must equal their asset's `currency_code` — enforced by a trigger
(`prepare_asset_valuation`/`prepare_asset_basis_event`), the same pattern
as `cash_movements` matching its bucket. Unlike Money's `fx_transfer`,
Assets has no cross-currency conversion path at all this phase: a
valuation in a different currency than its asset is rejected outright,
never guessed or auto-converted. If cross-currency appraisal becomes a
real need (e.g. a USD-native asset gets a professional valuation quoted in
EUR), that is future work with its own explicit design, not something to
paper over now.

## 13. Assets reuse the same currency stack — one shared domain, not a second one

Assets does not define its own currency formatting, its own decimal
precision handling, or its own reporting-conversion function. It imports
`formatCurrencyAmount()`, the exact-decimal discipline (§6), and
`convertToReportingCurrency()` from `lib/domain/currency/` — the same
modules Money uses. `asset_native_currency_totals()` returns the identical
`{currencyCode, amount}[]` shape `money_currency_totals()` does, so the
one shared conversion function accepts either's output without
translation. This is a permanent architectural rule (established
explicitly in P0-E2-S3): currency definitions, formatting rules, and
reporting-conversion contracts are shared across every domain that has
money-shaped values, never duplicated per domain.

## 14. Assets: native totals, never summed, target/quick-sale excluded

`asset_native_currency_totals()` sums only the **latest
`estimated_current_value`** per asset, grouped by currency, excluding
archived assets — never `target_value`, never `quick_sale_estimate`, and
never across currencies (see
[FINANCIAL_DOMAIN_MODEL.md §20](./FINANCIAL_DOMAIN_MODEL.md#20-net-worth-preparation-assets-p0-e2-s3)
for why target/quick-sale are excluded from this specific total). A
missing reporting-currency rate for one of the currencies present means
`convertToReportingCurrency()` (§10) returns `not_calculated`, exactly as
it does for Money — Assets never falls back to summing NGN and USD
figures together just because a rate wasn't available.

## 15. Receivables and Liabilities: same immutability and same-currency rules as Assets

`receivables.currency_code` and `liabilities.currency_code` follow the
identical immutability pattern as bucket/asset currency (§4, §12): once a
receivable has any `receivable_ledger_events` row, or a liability any
`liability_principal_events` row, its `currency_code` cannot change
(`enforce_receivable_currency_immutable()` /
`enforce_liability_currency_immutable()`, both `BEFORE UPDATE` triggers).
Every ledger row's currency must equal its parent's currency, enforced by
the same `prepare_*` trigger pattern used for `cash_movements` and
`asset_valuations`.

**Recovery and debt payments are same-currency-only this phase** —
mirroring §12's Assets ruling, not the more permissive `fx_transfer` path
(§8): the destination/source bucket's `currency_code` must equal the
receivable's/liability's `currency_code`, or `record_receivable_recovery()`
/ `record_debt_payment()` / `record_loan_proceeds()` reject the call
outright. A receivable denominated in USD can only be recovered into a USD
bucket; a debt drawn in NGN can only be repaid from an NGN bucket. This is
a deliberate scope limit, not an oversight — cross-currency settlement
(e.g. recovering a USD receivable into an NGN bucket at whatever rate
applied that day) has the same "needs its own explicit design" status as
cross-currency asset appraisal (§12), and would need its own rate-capture
story analogous to `fx_transfer`'s (§7-8) if built later.

## 16. Receivables and Liabilities reuse the same currency stack

Neither domain defines its own currency list, formatting, or
reporting-conversion logic. `lib/domain/receivables/` and
`lib/domain/liabilities/` import `formatCurrencyAmount()`, the
exact-decimal discipline (§6), and `convertToReportingCurrency()` from
`lib/domain/currency/` exclusively — the same rule established for Assets
in §13, now proven across four domains. `receivable_native_currency_
totals()` and `liability_native_currency_totals()` both return the same
`{currencyCode, amount}[]` shape as `money_currency_totals()` and
`asset_native_currency_totals()`, so the one shared conversion function
accepts any of the four without translation.

## 17. Receivables and Liabilities: native totals, never summed, estimates/target excluded

`receivable_native_currency_totals()` sums only `outstanding_amount` per
receivable, grouped by currency, excluding archived receivables —
`estimated_recoverable_value` is never included (see
[FINANCIAL_DOMAIN_MODEL.md §21](./FINANCIAL_DOMAIN_MODEL.md#21-receivables-domain-implementation-summary-p0-e2-s4)).
`liability_native_currency_totals()` sums only `outstanding_principal` per
liability, grouped by currency, excluding archived liabilities. Neither
function ever sums across currencies, and a missing reporting-currency
rate for any currency present means `convertToReportingCurrency()` (§10)
returns `not_calculated` — identical behavior to Money and Assets, no
domain-specific exception.

## 18. Goals: same-currency allocation, and the shared currency stack

A goal's `currency_code` is immutable once it has any allocation history
(§4/§12's pattern, applied a fourth time). For a `debt_balance_target`
goal, currency is not independently chosen at all — it is derived from
the linked liability at creation (`create_goal()` overwrites whatever
currency the caller might have sent), so a debt-payoff goal and its
liability can never disagree about currency.

**Allocation is same-currency-only this phase**, mirroring Receivables/
Liabilities' same-currency-only recovery/payment rule (§15): the bucket's
`currency_code` must equal the goal's `currency_code`, checked both by the
`record_goal_allocation()`/`record_goal_release()`/
`record_goal_reallocation()` RPCs and, as the real database-level
guarantee, by `prepare_goal_allocation_event()`'s trigger. Reallocation
additionally requires the bucket and BOTH goals to share one currency —
cross-currency reallocation is rejected outright, not silently converted.

Goals imports `formatCurrencyAmount()`, the exact-decimal discipline (§6),
and `convertToReportingCurrency()` from `lib/domain/currency/` exclusively
— no Goals-specific currency logic exists anywhere.
`goal_native_currency_totals()` returns the same `{currencyCode,
amount}[]` shape every other domain's native-totals function does (scoped
to `cash_target` goals only — see
[FINANCIAL_DOMAIN_MODEL.md §26](./FINANCIAL_DOMAIN_MODEL.md#26-cash-allocation-capacity-and-the-allocation-ledger-p0-e2-s5)
for why `debt_balance_target`'s earmarked cash is deliberately excluded
from this particular total), and a missing reporting-currency rate means
`not_calculated`, never a blended guess — verified explicitly by feeding
`goal_native_currency_totals()`'s own output into
`convertToReportingCurrency()` with an empty rate map in
`supabase/tests/goals/run.ts`.

## 19. Financial Rules are per-currency, never a single cross-currency threshold

A `minimum_cash_floor` rule always names an explicit `currency_code` — "a
minimum cash floor" is meaningless without saying which currency, and
Monitriq never collapses a USD floor and an NGN floor into one blended
number. A user may configure entirely independent floors for as many
currencies as they hold cash in (verified: separate USD/NGN/EUR/GBP/...
configurations coexist, each with its own threshold and independent
version history).

## 20. Safe to Deploy is calculated per native currency, never blended

`safe_to_deploy_by_currency()` returns one row per relevant currency —
never a single summed figure. A currency with cash but no configured
floor reports `status = 'not_configured'` and sits alongside other,
`'calculated'` currencies in the very same result set (verified
explicitly: USD `calculated`, CHF `not_configured`, in one call). See
[FINANCIAL_DOMAIN_MODEL.md §31](./FINANCIAL_DOMAIN_MODEL.md#31-safe-to-deploy-formula-p0-e2-s6).

A **reporting-currency** consolidated figure
(`aggregateSafeToDeployToReportingCurrency()` in `lib/domain/rules/
aggregate.ts`) is available only when every relevant currency's Safe to
Deploy is itself `'calculated'` and every required FX rate is supplied —
reusing `convertToReportingCurrency()` (§10), not a second conversion
path. If even one relevant currency is `not_configured`, or one rate is
missing, the reporting total is `not_calculated` — its true contribution
is unknown, not merely unconverted, so guessing zero would be dishonest.
See
[FINANCIAL_DOMAIN_MODEL.md §32](./FINANCIAL_DOMAIN_MODEL.md#32-reporting-currency-safe-to-deploy-and-the-proposed-cash-use-evaluator-p0-e2-s6).

## 21. Obligations and overrides: currency handling reuses the same stack

`obligations.currency_code` follows the same registry, precision
(BEFORE INSERT/UPDATE trigger checking `decimal_exponent`), and no-cross-
currency-blending discipline as every other domain — a goal-linked
obligation's currency must exactly equal its funding goal's currency
(§18), enforced by trigger. `cash_use_overrides.currency_code` is derived
server-side from the bucket at override time, never client-supplied.
Neither table defines its own currency logic; both import from
`lib/domain/currency/` exclusively.

## 22. Decisions and cross-currency scenarios

`decision_scenarios.currency_code` is fixed at creation; `source_bucket_
id`/`destination_bucket_id`, when set, must match it exactly
(trigger-enforced) — the same same-currency-only discipline as every
prior domain, never an implicit conversion. A Decision's scenarios may
individually be denominated in different currencies (one scenario in
USD, another in NGN, under the same Decision), and each is evaluated
entirely in its own native currency — never blended.

A consolidated reporting-currency figure for one scenario's net
immediate cash delta (`convertScenarioNetDeltaToReportingCurrency()` in
`lib/domain/decisions/aggregate.ts`) is available only when an explicit
rate is supplied for its native currency (or it already is the reporting
currency) — reusing `convertToReportingCurrency()` (§10), the same
function Rules' own reporting-currency aggregation (§20) uses. Missing
the required rate returns `not_calculated`, never a guessed conversion.
No live FX integration exists, and none is added this phase.

## 23. Financial Position: reporting-currency Net Worth (P0-E3-S1)

`convertFinancialPositionToReportingCurrency()` in
`lib/domain/financial-position/aggregate.ts` is the fourth consumer of
`convertToReportingCurrency()` (§10), after Money, Rules (§20), and
Decisions (§22) — still one shared conversion layer, never a second FX
implementation.

What's different here is that Net Worth is a *sum of four components*
(`liquidCash + nonCashAssetValue + receivablesOutstanding −
liabilitiesOutstanding`), each independently spread across native
currencies. Converting a pre-summed mixed-currency Net Worth would be
invalid — `convertToReportingCurrency()` itself only ever operates on one
already-homogeneous-per-currency-code list at a time. So each component is
converted separately (four independent calls, one per component, each
summing across all native currencies for that component into one
reporting-currency figure), and only after all four succeed are the four
reporting-currency totals combined into reporting Net Worth, via
`decimal.js` — never binary float arithmetic, never a second combination
formula.

If any native currency present in any component is missing its required
rate, the result is `{ status: "not_calculated", missingRates: [...] }` —
even if the other three components would have converted fine. Native-
currency Financial Position remains fully available regardless; only the
one consolidated reporting figure is withheld. Exact non-round rates
(e.g. `1 EUR = 1.10 USD`) are exercised explicitly in
`supabase/tests/financial-position/run.ts` to prove no binary-float drift
enters the combination step.

## 24. Transaction FX vs. reporting FX — two different concepts, one table (P0-E3-S1A)

§23 answers "how is a consolidated Net Worth combined once rates exist."
This section answers "where do those rates come from" — and, just as
importantly, where they deliberately do *not* come from.

`public.fx_rates` (P0-E2-S2) has always held two conceptually different
kinds of row, distinguished by `source`:

- **`transaction_actual`** — the exact rate actually applied to one real
  `fx_transfer` between the user's own buckets. Auto-created by
  `record_fx_transfer()`, immutable, tied to that one `event_id`. This
  answers "what rate was used *then*, for *that* transfer."
- **`manual`** — a standalone rate the user records explicitly, not tied
  to any transaction. This phase gives this kind of row its first real
  purpose: **reporting/valuation rate** — "what rate does the user want
  Monitriq to use *right now* to express one currency in the reporting
  currency." Recorded via `record_manual_reporting_rate()`
  (`lib/domain/currency/repository.ts`'s `recordManualReportingRate()`),
  always `event_id = null`.

These answer different questions, and P0-E3-S1A keeps them from ever
being confused: `reporting_fx_rates()` filters `source = 'manual'`
explicitly, so a `transaction_actual` row is structurally invisible to
Financial Position's reporting conversion — even when it exists for the
exact same currency pair the reporting calculation needs. Reusing an old
transaction's actual rate as today's valuation rate would be silently
wrong (that rate reflects one moment's actual exchange, not a current
view of worth) and V1 never does it. Verified explicitly: a real
`fx_transfer` is recorded (auto-creating a `transaction_actual` row), a
`manual` rate is recorded for the identical pair with a deliberately
different value, and only the manual one is ever returned by
`reporting_fx_rates()`.

**Direct vs. inverse.** A user who recorded `1 EUR = 1.10 USD` (base=EUR,
quote=USD) has, by construction, also implicitly defined the USD→EUR
rate as its mathematical inverse. `reporting_fx_rates(p_reporting_currency)`
returns the user's latest manual row per pair touching the reporting
currency in *either* direction, unmodified; `resolveReportingRates()`
(`lib/domain/currency/reporting-rates.ts`) is where the inversion
actually happens — via `decimal.js`, never in SQL — and a direct rate
always wins over an inverse one for the same currency when both exist. No
triangulation: a currency with neither a direct nor an explicit-inverse
manual rate against the reporting currency simply does not resolve. Every
resolved rate carries full provenance (`isInverse`, the stored base/
quote, the stored rate pre-inversion, `rate_as_of`, `source`) so a
consolidated figure is never a black box.

**V1 is manual-first, deliberately.** `source` is never labeled `live`,
`market`, `real-time`, or `official` — only `manual`. No live-provider
integration exists or is planned by this phase; a future provider-sourced
rate would need its own `source` value and its own selection logic, not
a silent upgrade of what `manual` means today.

## 25. Home-only trailing-zero display option (P0-E3-S2)

`formatCurrencyAmount()` (`lib/domain/currency/format.ts`) gained one
additive, opt-in parameter: `{ trimTrailingZeros: true }`. When set, and
only when the amount — rounded to the currency's own `decimal_exponent`,
never a different precision — has an all-zero fractional part (e.g.
"30850200.00" for a 2-decimal currency), the fractional part is omitted
from the returned string ("NGN 30,850,200" instead of "NGN 30,850,200.00").
An amount with any real fractional value after that rounding is always
shown in full, at the currency's own precision — this never truncates or
rounds away meaningful digits, it only omits a fraction that would
otherwise render as all zeros.

This is presentation only: the function still receives and operates on
the exact decimal string the caller passed in (never a parsed JS number),
and never touches the underlying NUMERIC value anywhere — it only decides
whether the formatted STRING's fractional part is worth displaying.
Omitting the parameter (every pre-existing caller, and every detail/
transaction view — `/money`'s activity list, `/financial-position`'s full
breakdown, Home's own Recent Activity preview) reproduces the function's
prior behavior byte-for-byte; Home's summary-level figures (Liquid
Position, Net Worth, Safe to Deploy, capital distribution, This Month,
Goals) opt in, since a whole-currency-unit headline number reads more
calmly without a redundant ".00" than a specific line-item amount does.

## 26. Asset Sale: no cross-currency disposal this phase (P0-E4-S1)

Extends §12's own precedent to a second Assets operation:
`record_asset_sale()` requires the destination cash bucket's
`currency_code` to equal the asset's `currency_code` exactly — checked
explicitly in the function body (`if v_bucket.currency_code <>
v_asset.currency_code then raise exception`), not left to a trigger,
since the two values come from two different tables being brought
together for the first time in one write, unlike a valuation/basis event
which is already scoped to its own asset. No live or manual FX rate is
consulted; a mismatch is rejected outright, never guessed or silently
converted at an assumed 1:1 rate. The Sell Asset UI pre-filters the
destination-bucket picker to only the user's buckets already matching
the asset's currency, so an incompatible bucket is never offered as if
it were a valid choice — the same "don't show what would just get
rejected" discipline the reference-fidelity passes already established
for other pickers. Cross-currency asset sale (e.g. a USD-native vehicle
sold with proceeds deposited into an NGN bucket at some rate) is
explicit future work with its own rate-capture design, exactly the same
deferral §12 already made for cross-currency appraisal.
