# Monitriq — Product Definition

Status: Canonical. Established P0-E1-S1.

## 1. Name

The production product name is **Monitriq**.

Monitriq is the current product name. Historical implementation records may
refer to the former name Monatriq (renamed in P0-E3-S1B — an identity-only
rebrand; see [docs/rebrand/MONATRIQ_TO_MONITRIQ_AUDIT.md](../rebrand/MONATRIQ_TO_MONITRIQ_AUDIT.md)).

"Capital Compass" was a working prototype name only. It must not appear in new
production documentation, product naming, or user-facing implementation from
this point forward. If any such reference is introduced later (e.g. pasted
from an old spec or mockup), replace it with Monitriq before it reaches
committed code or docs. Likewise, the former name Monatriq must not be
reintroduced in current product surfaces.

## 2. What Monitriq is

Monitriq is a personal financial position, asset, goal and decision-management
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

The user remains the decision-maker. Monitriq presents financial consequences
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
- **The user decides; Monitriq explains.** Rule conflicts and protected-fund
  overrides are shown and recorded, never silently resolved by the system.
- **No fabricated precision.** Quick-sale estimates, target values, and
  recoverable amounts are distinct concepts and must never be presented as
  if they were current net worth or current cash.

## 5. Multi-user model

Monitriq is multi-user from the beginning. Each authenticated user has an
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

The approved Monitriq 2D brand asset pack is stored, exactly as supplied, at
`docs/reference/monitriq brand/` and is the canonical source of Monitriq
logo artwork. Production copies (used directly, never redrawn or modified)
live in `public/brand/`. The brand tokens and brand documentation are at
[docs/reference/brand/](../reference/brand/) (`BRAND.md`, `brand-tokens.css`);
that folder's older logo files are the archived former-name (Monatriq)
artwork. Brand artwork must not be redesigned, recreated, or modified during
implementation phases.

Brand line: "Know today. Go further." Supporting line: "Smarter money. A
brighter tomorrow."

Production placement of these assets (app icon, favicon, auth screens, PWA
manifest) is planned in
[SYSTEM_ARCHITECTURE.md §7](../architecture/SYSTEM_ARCHITECTURE.md#7-brand-asset-placement)
and is not implemented in this phase.

## 9. UX language principle

Established P0-E4-S2.

**Simple language first. Advanced financial detail only when needed.**

A user should never have to speak Monitriq's database language to understand
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

## Budget (foundation, P0-E5-S1)

Budget is a simple monthly plan for everyday spending: pick a currency and month, set a planned amount per spending category, and Monitriq shows planned, spent and remaining from your real Money activity. No default budget, no 50/30/20, no income guessing, no seeded data. Spending you did not plan for is shown as "Not budgeted", not hidden. Going over budget never blocks recording money. Upcoming commitments are shown for context and never counted as spending. Budget Remaining is different from Available Cash and Safe to Deploy. Budget UI is a later phase.

## Can I afford this? (Spending check, P0-E5-S3)

The everyday front door to decisions. A person enters what they are thinking of buying, the amount, the currency, the account they would pay from, and optionally a spending category. Monitriq shows what spending that money today would change: cash before and after, Budget left (overall and for the category), Safe to Deploy, money protected for goals, and money protected for known commitments. It then gives one plain suggested next step: Proceed within your plan, Reduce the amount, Wait, Review first, or More setup needed, with the reasons in plain language. Checks that cannot be completed (no Budget, no minimum cash set) are shown as such and are never assumed to pass. Expected income is planning context and is never treated as cash. Nothing is recorded, moved or saved by a check; "Record this purchase" only opens Money Spent pre-filled for the user to confirm. It is reachable from Home and Quick Add, and links to Decisions for detailed comparisons. It gives no scores, no AI recommendation and no future forecast.

## Product language constitution (P0-E5-S4A)

**If an ordinary user would need to look up a financial term to understand a primary Monitriq screen, prefer plain language and move the technical term into secondary detail.** Plain language must stay financially accurate; it never dumbs down the meaning.

| Technical / internal term | Primary UI wording |
| --- | --- |
| liability | debt |
| receivable | money owed to you |
| illiquid assets | money tied up in assets |
| liquid cash / tracked cash | cash you have / cash available |
| minimum cash floor | money you want to keep ("The lowest amount you want your cash to reach.") |
| protected goal cash | money set aside for goals |
| protected commitments | money set aside for goals and upcoming payments |
| required retained cash | money Monitriq is protecting |
| safe to deploy | available above that / available above what's protected |

Internal identifiers (schema, RPCs, repositories, types) keep their canonical names. Avoid "cash buffer", "cash floor" and "liquidity reserve" in primary UI.

**Monitriq should never require a user to understand financial jargon before they can understand their own money.** Technical terminology may be introduced progressively, but the financial meaning must remain unchanged.

### Adaptive financial language (P0-E5-S5)
One financial engine, three explanation styles. During onboarding (and later in the profile menu under "Language & explanations") the user answers "How would you like Monitriq to explain your money?": **Keep it simple** (everyday words and clear explanations, the default), **Balanced** (simple explanations with financial terms when useful) or **Financial terms** (traditional financial wording and more detail). It is stored as `profiles.financial_language_mode` (`simple` | `balanced` | `financial`). The preference changes wording and explanation depth only; it never changes a calculation, Budget or Safe-to-Deploy value, warning threshold or state, the Spending Check recommendation, permissions or feature access, and never introduces currency conversion. All wording comes from one typed vocabulary (`lib/domain/language`); components ask for semantic keys and never branch on the mode. Plain language stays accurate: net worth is never "cash", asset value is never "money available", sale proceeds are never "profit", Budget remaining is never "cash available", and "available above what's protected" is never "safe to spend". Balanced mode may add a subtle line that teaches the term ("Also called liabilities."). An unknown or missing value always resolves to Simple.

### Cash warning states
Where cash stands against the amount the user chose to keep is shown per currency as one of five states, decided by one central presentation policy (lib/domain/rules/cash-status.ts) from the Rules engine's own figures: **Comfortable** (teal), **Getting close** (amber), **At your limit** (amber), **Below your limit** (red, only for an actual retained deficit) and **Needs setup** (amber, when no amount to keep is set). The warning zone begins when the money left above the protected amount is 25% or less of the protected amount; this is a UI policy constant (`WARNING_ZONE_FRACTION`), not Safe-to-Deploy mathematics, and can become user-configurable later. With an explicit zero amount to keep there is no percentage zone. Colour reflects status, never how much money someone has, and every state also carries a text label and sentence.
