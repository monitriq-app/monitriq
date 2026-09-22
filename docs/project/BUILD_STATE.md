# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E1-S1 — Product Definition, Domain Architecture, Security Rules & Visual
Constitution.

## Current status

**Complete.** Planning and architecture only — no application code, no
database schema/migrations, and no UI screens exist yet.

## Completed work

- Repository inspected (see report for full detail).
- Canonical documentation structure created under `docs/`.
- Product definition established (`docs/product/PRODUCT_DEFINITION.md`).
- Financial domain model established
  (`docs/architecture/FINANCIAL_DOMAIN_MODEL.md`).
- System architecture proposal established
  (`docs/architecture/SYSTEM_ARCHITECTURE.md`).
- Security / RLS constitution established
  (`docs/security/SECURITY_AND_RLS_PRINCIPLES.md`).
- Visual constitution established
  (`docs/design/VISUAL_CONSTITUTION.md`).
- This build-state document created.
- Phase report created
  (`docs/reports/P0-E1-S1-product-definition-domain-architecture.txt`).

## Current architecture decisions

- Product name is Monatriq (no "Capital Compass"/"Stitch" references exist
  in-repo; nothing to migrate).
- One shared financial domain calculation layer (`lib/domain`, planned) —
  no page computes its own financial truth.
- Financial events are a lightweight append-only audit log alongside normal
  relational tables — not full event sourcing, not blockchain-style.
- Stack: Next.js + TypeScript + Supabase (Postgres + Auth) + PWA, manual-first
  for V1 (no live bank connections).
- Currency and timezone are per-user profile fields; no currency is
  hardcoded globally.
- RLS is mandatory, deny-by-default, on every user-owned table; no
  client-side-only isolation is acceptable.
- Brand pack at `docs/reference/brand/` is canonical and untouched this
  phase; production placement is planned but not implemented.

## Open questions

1. Exact Supabase schema/table definitions for Money, Assets, Goals,
   Decisions, Financial Rules, Obligations, Receivables, Liabilities,
   Businesses, Valuation History, Decision Assumptions, Goal Allocations,
   and the financial event log — deferred to the data-layer implementation
   phase.
2. Whether "Businesses" is a first-class domain table set in V1 or folded
   into Assets + Recurring Income for the first implementation pass —
   needs a product call before schema design.
3. Exact shape of the "Safe to Deploy" formula's configurable inputs (which
   rules are mandatory vs. optional before it can calculate) — needs
   product definition before implementation.
4. Whether the curated final Stitch/design-reference set will be supplied
   before or after initial screen scaffolding begins.
5. Supabase project provisioning (org, project, environment separation for
   dev vs. production) has not been discussed or created.

## Known risks

1. **Git repository root mismatch (source-control hygiene risk).** The
   project's git repository root is `/Users/datamatics` (the user's home
   directory) rather than `/Users/datamatics/Monatriq`. Only `README.md`
   (unrelated, home-directory content) is currently tracked, so no
   Monatriq files or secrets have been committed anywhere yet. However, any
   future broad `git add -A`/`git commit -a` run from the home directory
   could sweep in unrelated client projects or system files. **Not fixed
   in this phase** (no destructive repo changes were made without
   instruction); flagged for the user to decide how to resolve — most
   likely initializing a dedicated git repository scoped to
   `/Users/datamatics/Monatriq`.
2. No test/CI infrastructure exists yet; RLS and isolation tests (mandatory
   per the security doc) cannot be written until the data layer exists.
3. No app scaffold exists yet — `package.json` and the Next.js app itself
   still need to be created in the next phase.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review and
explicit go-ahead): **P0-E1-S2 — repository/app scaffolding** (Next.js +
TypeScript project init, base Supabase client wiring, brand token
integration into the design-token layer) *or*, if the user prefers
schema-first, **P0-E2-S1 — Supabase schema & RLS policy design** for the
Profile/Money/Assets domains, built directly from
`FINANCIAL_DOMAIN_MODEL.md` and `SECURITY_AND_RLS_PRINCIPLES.md`, including
the mandatory isolation test suite.
