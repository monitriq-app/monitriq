# Monatriq — Financial Domain Model

Status: Canonical. Established P0-E1-S1. Conceptual model only — no schema
or migrations are implemented in this phase.

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

## 7. Asset valuation

Valuation updates are their own record type (valuation history), separate
from cash transactions. Changing an estimated value creates an **Unrealised
Value Change** event where appropriate — it never creates a Money In/Out
record. History is preserved; valuations are never silently overwritten.

## 8. Liabilities / debt

Debt transactions separate principal, interest, and fees (see §5.6). A
liability record tracks outstanding principal, and optionally links to the
asset it financed. Liabilities reduce net worth; paying them down is
net-worth-neutral to the extent principal and cash move together.

## 9. Goals domain

Goals are typed, not force-fit into a single "current/target cash" shape.
Required goal structures (extensible — future types must not require a
schema rewrite):
Savings/Reserve, Purchase/Property, Debt Payoff, Recurring Income, Business
Capital, Relocation/Milestones, Education, Vehicle, Event, Travel, Custom.

### 9.1 One naira, one purpose
Goal allocation must avoid double counting. If Main Cash = ₦5M and a House
Fund allocation = ₦2M, that ₦2M cannot simultaneously be counted as House
Fund, Relocation Fund, and "safe to deploy" — allocation ownership is
explicit and singular until the user deliberately reallocates it.

### 9.2 Protected goals
Protection is a user-defined rule, not a system override of user agency.
When a user attempts to use protected funds, the product must:
1. show the financial impact,
2. show the rule conflict,
3. allow cancellation,
4. allow an explicit override where policy permits,
5. record the override (as a financial event, per §3).
The system never autonomously decides on the user's behalf.

## 10. Decisions domain

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

### 10.2 Decision journal
Stored per decision: what was considered, date, tracked financial context
at the time, assumptions, rule effects, scenario comparisons, the user's
choice, a review date, and (later) the actual outcome for expected-vs-actual
comparison. The journal is a record of what happened, not a mechanism for
judging the user — no shaming language, no fabricated history.

## 11. Financial rules

Rules are explicitly user-configured; nothing is invented on their behalf.
Potential rule types: Minimum Protected Cash, Emergency Reserve Protection,
Protected Goal Funds, Maximum Capital Per Asset, Maximum Capital Per Asset
Class, Minimum Expected Margin, Maximum Debt Payment Ratio, Maximum Active
Ventures. Until a user configures a given rule, its state is "Not
configured" — never a guessed threshold.

## 12. Safe to Deploy

Safe to Deploy is not simply the cash balance. Once inputs exist, it may
consider: liquid cash, protected cash, protected goal allocations, hard
upcoming obligations, emergency reserve rules, and other explicitly
configured constraints. The formula must be transparent and inspectable
(the user can see which inputs fed the number). If required configuration
is incomplete, the value is "Not calculated" — never guessed.

## 13. Upcoming obligations

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
cash.
