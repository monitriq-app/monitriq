# Monatriq — Product Definition

Status: Canonical. Established P0-E1-S1.

## 1. Name

The production product name is **Monatriq**.

"Capital Compass" was a working prototype name only. It must not appear in new
production documentation, product naming, or user-facing implementation from
this point forward. As of P0-E1-S1 no "Capital Compass" or "Stitch" references
exist anywhere in this repository — there is nothing to migrate. If any such
reference is introduced later (e.g. pasted from an old spec or mockup), replace
it with Monatriq before it reaches committed code or docs; no repository rename
or history rewrite is needed for this.

## 2. What Monatriq is

Monatriq is a personal financial position, asset, goal and decision-management
application.

It is not merely:
- an expense tracker
- a budgeting app
- a net-worth calculator
- an investment app
- an AI financial adviser

Its core purpose is to help a person understand:
1. What money they have.
2. Where their capital currently lives.
3. What they own and owe.
4. What they are working toward.
5. What changes if they make a financial decision.
6. What requires attention now.

The user remains the decision-maker. Monatriq presents financial consequences
and rule conflicts. It does not autonomously tell users what they should do.

## 3. Primary product areas

- **Home** — command-center summary surface. Not a separate source of
  financial truth (see [FINANCIAL_DOMAIN_MODEL.md](../architecture/FINANCIAL_DOMAIN_MODEL.md)).
- **Money** — cash movement: income, spending, transfers, cash buckets.
- **Quick Add** — fast-entry surface for the core transaction flows.
- **Assets** — owned assets, valuations, receivables, business interests.
- **Decisions** — scenario evaluation and decision journaling.
- **Goals** — savings/purchase/debt/income/etc. targets and allocations.

Supporting domains that back these areas: Profile, Cash Buckets, Liabilities,
Financial Rules, Obligations, Businesses, Receivables, Valuation History,
Decision Assumptions, Goal Allocations, Audit / Financial Events.

## 4. Product principles

- **One financial domain model.** Every screen reads from shared domain
  calculations. No screen computes its own version of cash, net worth, or
  deployable capital.
- **Manual-first (V1).** No live bank connection is required. The user enters
  or (later) imports their own records.
- **Missing information stays missing.** States like "Not set", "Not
  configured", "Not calculated", "Insufficient data" are first-class UI
  states, not implementation gaps to paper over.
- **One naira, one purpose.** A unit of currency allocated to one purpose
  (a goal, a reserve) is not simultaneously counted as available elsewhere,
  unless the user deliberately reallocates it.
- **Decisions are not transactions.** Recording a decision, including
  choosing "Proceed", never moves money. Only an actual Money/Asset/Debt
  transaction changes balances.
- **The user decides; Monatriq explains.** Rule conflicts and protected-fund
  overrides are shown and recorded, never silently resolved by the system.
- **No fabricated precision.** Quick-sale estimates, target values, and
  recoverable amounts are distinct concepts and must never be presented as
  if they were current net worth or current cash.

## 5. Multi-user model

Monatriq is multi-user from the beginning. Each authenticated user has an
independent, private financial universe.

- No shared family wallet in V1.
- No social financial feed, no leaderboards.
- No normal UI path ever allows one user to view or switch into another
  user's financial records.

Full enforcement detail is in
[SECURITY_AND_RLS_PRINCIPLES.md](../security/SECURITY_AND_RLS_PRINCIPLES.md).

## 6. Currency and time

- Preferred currency is a per-user profile setting. NGN (or any currency) must
  never be hardcoded as a global default.
- V1 operates in one preferred reporting currency per user. Schema is
  designed so cross-currency support can be added later without pretending
  it exists today.
- Timestamps are stored in UTC using standard database conventions; display
  is converted to the user's configured timezone. Goal countdowns and
  monthly reporting are computed from real dates — no hardcoded countdowns.

## 7. Non-goals for V1

- Live bank/open-banking connections.
- Family/shared wallets, social features, leaderboards.
- Autonomous financial advice or auto-executed decisions.
- Multi-currency simultaneous reporting.
- Blockchain-style or full event-sourcing architecture (see
  [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) for the
  simpler audit approach actually planned).

## 8. Brand

A Monatriq brand pack is present at
[docs/reference/brand/](../reference/brand/) (`BRAND.md`, `brand-tokens.css`,
SVG/PNG logo assets, `manifest.json`). It is canonical brand direction and
must not be redesigned, recreated, or modified during implementation phases.

Brand line: "Know today. Go further." Supporting line: "Smarter money. A
brighter tomorrow."

Production placement of these assets (app icon, favicon, auth screens, PWA
manifest) is planned in
[SYSTEM_ARCHITECTURE.md §7](../architecture/SYSTEM_ARCHITECTURE.md#7-brand-asset-placement)
and is not implemented in this phase.

## 9. UX language principle

Established P0-E4-S2.

**Simple language first. Advanced financial detail only when needed.**

A user should never have to speak Monatriq's database language to understand
their own money. Terms like cost basis, quick-sale value, disposition,
capital returned, realised gain/loss, cash flow class, and valuation event are
correct and necessary in the schema, the domain layer, and this documentation
— they describe real, distinct financial concepts precisely. They are not
required to describe those same concepts to a user in the default UI.

- The default view of any screen shows the common, plain-language version of
  a fact (e.g. "What You Paid", "Current Value", "Sale Price").
- The precise/advanced version remains one interaction away, behind a single
  consistent disclosure pattern ("More details"), never hidden entirely.
- Progressive disclosure changes what is emphasized and how it is worded — it
  never changes what is true. A gain/loss figure, a quick-sale estimate, or a
  recovered amount shown in simple language is the exact same underlying
  value as its advanced-detail counterpart, never a second calculation.
- Renaming for clarity is a UI/copy decision only. It never renames the
  underlying schema, and it never merges two financially distinct concepts
  (e.g. "money owed to you" and "cash in hand") under one label.

See [VISUAL_CONSTITUTION.md §9](../design/VISUAL_CONSTITUTION.md#9-progressive-disclosure--financial-language) for the
matching progressive-disclosure/copy pattern, and
[docs/reports/P0-E4-S2-ux-language-progressive-disclosure.txt](../reports/P0-E4-S2-ux-language-progressive-disclosure.txt)
for the full audit of what changed.
