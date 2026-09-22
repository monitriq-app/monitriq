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

This is a target layout to build toward incrementally. As of P0-E2-S3,
`lib/supabase/`, `lib/domain/{profile,money,assets,currency}/`,
`supabase/migrations/`, and
`supabase/tests/{shared,rls,money,currency,assets}/` exist for real.
`lib/domain/currency/` (types, repository, format, conversion) is the one
shared currency stack Profile/Money/Assets all import from — never
duplicated per domain, per
[MULTI_CURRENCY_MODEL.md §13](./MULTI_CURRENCY_MODEL.md#13-assets-reuse-the-same-currency-stack--one-shared-domain-not-a-second-one).
`lib/types/` and the rest of `lib/domain/` (Goals, Decisions, Financial
Rules) remain future work, created when their owning phase needs them:

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
- Goal allocation state (per FINANCIAL_DOMAIN_MODEL §9.1 — enforces "one
  naira, one purpose")
- Upcoming obligations summary
- Recurring income summary

Home, Money, Assets, Goals, and Decisions all call into this layer rather
than querying raw tables and recomputing independently. This is a design
constraint for future implementation phases.

**Concrete instances so far:** cash position (P0-E2-S2) is
`money_bucket_balances()`/`money_currency_totals()`; asset value (P0-E2-S3)
is `asset_summary()`/`asset_native_currency_totals()`/
`asset_current_basis()` (all SQL functions, `lib/domain/{money,assets}/
repository.ts`'s thin wrappers) — `/money`, `/assets`, and any future
consumer (Home, Decisions) call these, none re-sums `cash_movements` or
`asset_valuations`/`asset_basis_events` independently. Net worth, Safe to
Deploy, goal allocation, obligations, and recurring income remain future
work — no Goals/Financial Rules schema exists yet.

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
