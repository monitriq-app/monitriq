# Monatriq — System Architecture

Status: Canonical proposal. Established P0-E1-S1. No implementation
(migrations, screens, app code) exists yet — this describes the intended
shape for future phases to build against.

## 1. Stack

- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth) as the backing store and identity provider
- PostgreSQL with Row Level Security as the enforcement layer for
  multi-user isolation (see
  [SECURITY_AND_RLS_PRINCIPLES.md](../security/SECURITY_AND_RLS_PRINCIPLES.md))
- PWA (installable, offline-tolerant shell) — not offline-first data sync in
  V1

The repository currently contains no `package.json` and no app scaffold.
Repo state as inspected in this phase:

```
Monatriq/
  docs/
    reference/brand/        (canonical brand pack — supplied, do not modify)
  public/                   (empty)
```

Scaffolding the Next.js app is deliberately out of scope for this phase
(planning/architecture only) and is the natural first step of the next
implementation phase.

## 2. Repository layout (proposed, for future phases)

This is a target layout to build toward incrementally. As of P0-E3-S2,
`lib/supabase/`, `lib/domain/{profile,money,assets,currency,receivables,
liabilities,goals,rules,obligations,decisions,financial-position}/`,
`supabase/migrations/`, and `supabase/tests/{shared,rls,money,currency,
assets,receivables,liabilities,goals,rules,decisions,financial-position,
home-readiness,home}/` exist for real, plus `components/{home,theme}/`
and `lib/utils/` (small framework-agnostic presentational helpers, e.g.
`time-of-day.ts` — never financial calculations). `lib/domain/financial-position/` is a
composition-only domain — it owns no tables and reads every other
domain's canonical functions rather than re-deriving them (§4).
`lib/domain/currency/reporting-rates.ts` (P0-E3-S1A) is a small, pure
module (no I/O) resolving raw manual-rate rows into direct/inverse
per-currency rates — kept separate from `lib/domain/currency/
repository.ts` (I/O) and `lib/domain/currency/conversion.ts` (the actual
summation arithmetic, unchanged) to keep each file's one concern clear.
`lib/domain/currency/`
(types, repository, format, conversion) is the one shared currency stack
every domain imports from — never duplicated per domain, per
[MULTI_CURRENCY_MODEL.md §13](./MULTI_CURRENCY_MODEL.md#13-assets-reuse-the-same-currency-stack--one-shared-domain-not-a-second-one),
[§16](./MULTI_CURRENCY_MODEL.md#16-receivables-and-liabilities-reuse-the-same-currency-stack),
[§18](./MULTI_CURRENCY_MODEL.md#18-goals-same-currency-allocation-and-the-shared-currency-stack),
[§21](./MULTI_CURRENCY_MODEL.md#21-obligations-and-overrides-currency-handling-reuses-the-same-stack),
and
[§22](./MULTI_CURRENCY_MODEL.md#22-decisions-and-cross-currency-scenarios).
`lib/types/` remains future work, created when its owning phase needs it:

```
app/                    Next.js routes (Home, Money, Quick Add, Assets,
                         Decisions, Goals, Profile, Auth)
lib/
  domain/                Shared financial domain calculation layer (§4)
  supabase/              Supabase client factories (server + browser),
                         never a service-role client in browser code
  types/                 Generated + hand-authored domain types
supabase/
  migrations/            SQL migrations (schema + RLS policies together)
  tests/                 RLS / isolation / adversarial query tests
docs/
  product/               PRODUCT_DEFINITION.md
  architecture/          FINANCIAL_DOMAIN_MODEL.md, SYSTEM_ARCHITECTURE.md
  security/              SECURITY_AND_RLS_PRINCIPLES.md
  design/                VISUAL_CONSTITUTION.md
  project/               BUILD_STATE.md
  reports/               one report per phase
  reference/brand/        canonical brand pack (already present)
public/
  brand/                 production copies of app icon / favicon / manifest
                         icons, sourced from docs/reference/brand (§7)
```

## 3. Layering principle

Every screen (Home, Money, Assets, Goals, Decisions) is a **presentation**
over the domain layer. The dependency direction is one-way:

```
Postgres (tables + RLS)
      ↑
lib/domain (shared calculations: cash position, net worth, safe-to-deploy,
            goal allocation, obligations, recurring income)
      ↑
app/* route handlers & server components (per-domain: Money, Assets, Goals,
      Decisions, Home)
      ↑
UI components
```

No route or component is permitted to hand-roll a calculation that
`lib/domain` already owns (e.g. computing "cash" via an ad-hoc sum of
transactions inside a Home component). This is the mechanical enforcement of
the "one financial domain model" rule in
[FINANCIAL_DOMAIN_MODEL.md §1](../architecture/FINANCIAL_DOMAIN_MODEL.md#1-core-rule-one-financial-domain-model).

## 4. Domain calculation layer

`lib/domain` is planned to expose pure, testable functions (or server-only
data-loading functions backed by them) for at least:

- Cash position (per bucket and total)
- Net worth (assets − liabilities, using the value concepts in
  FINANCIAL_DOMAIN_MODEL §4)
- Safe to Deploy (per FINANCIAL_DOMAIN_MODEL §12 — returns "Not calculated"
  when inputs are incomplete, rather than a partial guess)
- Goal allocation state (per FINANCIAL_DOMAIN_MODEL §9.1/§26 — enforces
  "one unit of money, one purpose")
- Upcoming obligations summary
- Recurring income summary

Home, Money, Assets, Goals, and Decisions all call into this layer rather
than querying raw tables and recomputing independently. This is a design
constraint for future implementation phases.

**Concrete instances so far:** cash position (P0-E2-S2) is
`money_bucket_balances()`/`money_currency_totals()`; asset value (P0-E2-S3)
is `asset_summary()`/`asset_native_currency_totals()`/
`asset_current_basis()`; receivables/liabilities position (P0-E2-S4) is
`receivable_summary()`/`receivable_native_currency_totals()`/
`liability_summary()`/`liability_native_currency_totals()`; goal
allocation state (P0-E2-S5) is `goal_summary()`/
`goal_native_currency_totals()`/`goal_protected_allocation_totals()`/
`goal_bucket_shortfalls()`/`goal_required_pace()`; Safe to Deploy and
upcoming obligations (P0-E2-S6) are `safe_to_deploy_by_currency()`/
`evaluate_proposed_cash_use()`/`obligation_summary()`/
`upcoming_obligations()` (all SQL functions,
`lib/domain/{money,assets,receivables,liabilities,goals,rules,
obligations}/repository.ts`'s thin wrappers) — `/money`, `/assets`,
`/receivables`, `/liabilities`, `/goals`, `/rules`, and any future
consumer (Home, Decisions) call these, none re-sums `cash_movements`,
`asset_valuations`/`asset_basis_events`, `receivable_ledger_events`,
`liability_principal_events`, `goal_allocation_events`, or `obligations`
independently. Net worth and recurring income remain future work; Goals'
own recurring-income measurement type deliberately returns "not
calculated" rather than fabricating a Recurring Income summary (see
FINANCIAL_DOMAIN_MODEL.md §27).

**Hardened (P0-E2-S6A).** `evaluate_proposed_cash_use()` no longer
contains any independent calculation — it consumes
`safe_to_deploy_by_currency()` twice (real state, then with a
hypothetical bucket-balance override applied) rather than duplicating the
formula, eliminating the risk of the two ever drifting apart. See
FINANCIAL_DOMAIN_MODEL.md §33A.

**Extended again (P0-E2-S7).** The hypothetical-liquidity logic S6A
extracted was itself refactored one layer deeper into a new shared,
sign-agnostic function, `evaluate_hypothetical_bucket_liquidity()`, so
Decisions could model a cash INFLOW (S6A's evaluator only ever modeled a
spend) through the identical rule-relationship calculation rather than a
third formula. `evaluate_proposed_cash_use()` is now a thin wrapper over
it, with its own public signature and behavior fully preserved (verified
by the complete, unmodified P0-E2-S6/S6A suite continuing to pass).
`evaluate_decision_scenario()` — the Decisions evaluation boundary — is
itself a further consumer: it reads live facts from `asset_summary()`/
`liability_outstanding_principal()`, calls `evaluate_hypothetical_
bucket_liquidity()` for every liquidity/rule figure, and re-derives
nothing that any prior domain already owns. See
FINANCIAL_DOMAIN_MODEL.md §37.

**Net worth implemented (P0-E3-S1).** `financial_position_by_currency()`
is the one composed SQL function computing Net Worth per native currency
from the six read models listed above plus `asset_summary()`/
`receivable_summary()`/`goal_bucket_shortfalls()` for the potential-
liquidity and allocation-shortfall figures — no independent formula, no
stored result. `lib/domain/financial-position/repository.ts`'s
`getFinancialPositionSummary()` composes it further with Goals/Decisions/
Obligations summaries at the TypeScript layer (parallel reads, not a
second SQL function, since those are list-shaped rather than
currency-keyed). See FINANCIAL_DOMAIN_MODEL.md §41.

**Home-readiness additions (P0-E3-S1A).** Three narrow, independent
extensions, all SQL functions composed over existing canonical sources —
zero new tables: `money_period_summary()`/`resolve_period_bounds()`
(Money "This Month", classified via `financial_events.cash_flow_class`,
never `event_type`); `record_manual_reporting_rate()`/
`reporting_fx_rates()` (reusing `public.fx_rates` from P0-E2-S2, never a
second FX subsystem); `asset_quicksale_coverage()`/
`receivable_recoverability_coverage()` (reading `asset_summary()`/
`receivable_summary()`, the same sources `financial_position_by_
currency()` already uses). `getFinancialPositionSummary()` composes all
three in alongside its existing parallel reads. See
FINANCIAL_DOMAIN_MODEL.md §42.

## 5. Financial event / audit layer

Per [FINANCIAL_DOMAIN_MODEL §3](../architecture/FINANCIAL_DOMAIN_MODEL.md#3-financial-event-architecture)
and §15, mutations that matter financially write an append-only event
record alongside the normal relational update, inside the same transaction.
This stays a lightweight table (what changed, when, why, which
transaction, which user) — not full event sourcing and not a
blockchain-style structure. State is always read from normal tables; the
event log exists for traceability and later expected-vs-actual comparisons
in Decisions.

**Implemented for Money (P0-E2-S2)** as `financial_events` +
`cash_movements`, created atomically by `SECURITY INVOKER` SQL functions
(a real PostgreSQL transaction boundary, not sequential client-side
inserts) — see
[FINANCIAL_DOMAIN_MODEL.md §17](./FINANCIAL_DOMAIN_MODEL.md#17-money-domain-implementation-summary-p0-e2-s2).

**Extended (P0-E2-S4)** with `financial_operations`, a grouping construct
for the rare case where one user action must create more than one
correctly-classified `financial_events` row atomically (a debt payment's
principal/interest/fee split). Simple single-component events still write
one `financial_events` row directly, `operation_id` null — the grouping
table is additive, not a restructuring of the event log. See
[FINANCIAL_DOMAIN_MODEL.md §23](./FINANCIAL_DOMAIN_MODEL.md#23-compound-financial-operations-and-voiding-consistency-p0-e2-s4).

**Deliberately NOT extended for Goals (P0-E2-S5).** Allocating, releasing,
and reallocating goal funding never write to `financial_events`/
`cash_movements` at all — Goals' own `goal_allocation_events` ledger has
no `financial_event_id` column and cannot have a cash effect by
construction. This is the one domain so far that stays entirely outside
this layer, which is the correct outcome for a domain whose core principle
is "does not own cash." See
[FINANCIAL_DOMAIN_MODEL.md §26](./FINANCIAL_DOMAIN_MODEL.md#26-cash-allocation-capacity-and-the-allocation-ledger-p0-e2-s5).

**Also NOT extended for Financial Rules & Obligations (P0-E2-S6).**
Configuring a rule, recording an obligation, and recording a cash-use
override all leave `financial_events`/`cash_movements` untouched — Safe
to Deploy is a derived read model over existing state, not a new source
of financial events. Even `cash_use_overrides` (an audit record) never
writes here: it records that the user acknowledged a conflict, not that
money moved. See
[FINANCIAL_DOMAIN_MODEL.md §33](./FINANCIAL_DOMAIN_MODEL.md#33-override-audit-p0-e2-s6).

**Also NOT extended for Decisions (P0-E2-S7)** — the most consequential
non-extension yet, since it is this domain's entire reason for existing.
Creating a Decision, creating a scenario, evaluating a scenario, saving
an evaluation snapshot, and recording ANY user choice (including
`'proceed'`) all leave `financial_events`/`cash_movements` — and every
other domain's tables — completely untouched. A Decision is a plan, not
a transaction; actual financial state changes only when a real operation
is separately recorded through Money/Assets/Liabilities. See
[FINANCIAL_DOMAIN_MODEL.md §34](./FINANCIAL_DOMAIN_MODEL.md#34-decisions-domain-implementation-summary-p0-e2-s7).

## 6. Multi-currency posture

**Superseded by implementation (P0-E2-S2)** — full detail in
[MULTI_CURRENCY_MODEL.md](./MULTI_CURRENCY_MODEL.md). This section
originally (P0-E1-S1) planned for currency support to be added later
without a breaking migration; Money was instead built multi-currency from
the start, per explicit product direction — a user can hold NGN, USD, GBP,
and other buckets simultaneously, with real cross-currency transfers and
FX rate recording (manual-first: no live provider this phase). A user's
`profiles.preferred_currency` (P0-E2-S1) remains their *reporting*
currency default — a separate concept from which currencies their buckets
actually hold (see MULTI_CURRENCY_MODEL.md §1-2).

## 7. Brand asset placement

The canonical brand pack already lives at
[docs/reference/brand/](../reference/brand/). When implementation phases
begin building the app shell, production copies are expected to be sourced
from there into:

- `public/` — favicon, app icons, PWA manifest icons (from
  `docs/reference/brand/png` and `svg/favicon.svg`)
- App shell / auth screens — logo SVGs per the light/dark usage rules in
  `docs/reference/brand/BRAND.md`
- `brand-tokens.css` (or the CSS variables it defines) — wired into the
  design token layer described in
  [VISUAL_CONSTITUTION.md](../design/VISUAL_CONSTITUTION.md), not
  redefined by hand

No brand asset is modified, redesigned, or copied into the app in this
phase.

## 8. Explicitly deferred

Not addressed by this phase, to be decided when the relevant implementation
phase begins:

- Exact Supabase schema / migrations
- Exact API/server-action boundaries per route
- State management / data-fetching library choices on the client
- Testing framework choices beyond "RLS and isolation tests are mandatory"
  (see security doc)
- CI/CD pipeline

## 9. Frontend / UI architecture (P0-E3-S2)

Established when Home became the first production screen. Governs every
screen built from this phase forward — the smallest reusable foundation,
not a Home-only set of hacks.

**Theme.** [`next-themes`](https://github.com/pacocoursey/next-themes) —
a mature, actively-maintained library, not a hand-rolled one — provides
Light/Dark/System appearance. `components/theme/ThemeProvider.tsx` wraps
`app/layout.tsx`'s children with `attribute="data-theme"
defaultTheme="system" enableSystem`; `<html>` carries
`suppressHydrationWarning` (required by next-themes' own documented
pattern, since it sets `data-theme` via an inline blocking script before
React hydrates — this is what avoids a flash of the wrong theme, not
anything bespoke). Persistence is next-themes' own `localStorage` key —
device-local, no financial backend state, per standing product
instruction. `lib/styles/tokens.css`'s dark values (unchanged) live in
the base `@theme` block; a `:root[data-theme="light"]` override block
(anticipated by that file's own comment since it was first written)
redefines the same semantic custom properties. Component code never
branches on theme — every component already consumed semantic classes
(`bg-surface`, `text-text-primary`, ...) rather than raw colors, so
adding light mode required zero component changes, only the token layer.
`components/theme/ThemeToggle.tsx` is the one user-facing control,
deliberately placed in `AccountMenu.tsx` (account/profile menu), never in
the financial dashboard body.

**Navigation.** `components/layout/AppShell.tsx` composes a sticky header
(brand + `DesktopNav.tsx`, hidden below `md:` + `AccountMenu.tsx`) and a
fixed `MobileBottomNav.tsx` (hidden at `md:` and above). Conceptual
production navigation is five items — Home, Money, Assets, Decisions,
Goals — plus a central "+" quick-add action on mobile only (docs/product/
PRODUCT_DEFINITION.md §3). Foundation/development routes (Financial
Position, Rules & Obligations, Receivables, Liabilities) remain real,
fully working routes — they live in `AccountMenu.tsx`'s "Foundation
routes" section rather than primary navigation, never deleted.

**Responsive strategy.** Mobile-first Tailwind, no device-specific CSS —
breakpoints are Tailwind's standard `sm`/`md`/`lg` scale, tested against
the viewport matrix in
[docs/reports/P0-E3-S2-home-command-center-production-ui.txt](../reports/P0-E3-S2-home-command-center-production-ui.txt)
rather than named devices. `components/ui/Button.tsx`/`Input.tsx`/
`Select.tsx` all guarantee a `min-h-12` (48px) touch target; `Input`/
`Select` use `text-base` (16px) below `sm:` specifically to prevent
unwanted iOS Safari zoom-on-focus. `MobileBottomNav.tsx` and
`AppShell.tsx`'s header both respect `env(safe-area-inset-*)` so the app
stays usable when installed as a PWA.

**Reduced motion.** A global `@media (prefers-reduced-motion: reduce)`
rule in `lib/styles/tokens.css` neutralizes animation/transition duration
app-wide — covers Tailwind's `animate-*` utilities (e.g. the Home loading
skeleton) and any future transition, in one place, rather than requiring
every component to remember it individually.

**Icons.** [`lucide-react`](https://lucide.dev) — a lightweight,
tree-shakeable, line-icon set — is the one icon library, chosen
specifically to avoid the "generic 3D icons"/"sparkle icons" aesthetic
[VISUAL_CONSTITUTION.md §6](../design/VISUAL_CONSTITUTION.md#6-explicitly-avoided-aesthetics)
prohibits.

**Component boundary.** Server components remain the default (data
fetching, layout); `"use client"` is reserved for genuinely
browser-specific state — theme (`ThemeToggle`), the account-menu
open/close interaction (`AccountMenu`), active-link highlighting
(`DesktopNav`/`MobileBottomNav`, which need `usePathname()`), and form
interactivity already established in prior phases. No financial
calculation exists in any client component.
