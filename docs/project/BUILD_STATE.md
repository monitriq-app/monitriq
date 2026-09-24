# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Standing rule — approved reference fidelity

Introduced P0-E3-S4, after Assets production UI required two follow-up
visual-realignment passes because the first implementation
*interpreted* the approved reference instead of matching it literally:

> When a final approved reference exists, implement its visual
> composition, density, spacing, typography hierarchy and component
> proportions literally before applying any product adaptation.
> Deviations are permitted only for truthful data, unsupported
> canonical capability, accessibility, security or responsive
> integrity.

This applies to Decisions, Goals, and all future production-UI phases.
It does not retroactively alter already-approved Home/Money — those
were built and approved under P0-E3-S2/S3's own process and remain the
Visual Constitution's existing precedent; this rule governs how a
*new* approved reference gets implemented going forward, not a re-audit
of prior phases.

## Current phase

P0-E4-S2A — UX Simplification: Final Corrections.

## Current status

**COMPLETE.** A small, targeted correction pass on top of P0-E4-S2 (see
"Prior phase" below) — manual report review found four P0-E4-S2 items
that were requested but not actually applied/documented. No broader
redo of the UX simplification phase. All four corrections are
presentation-only or documentation-only; no schema, migration, RLS, or
financial-calculation change.

1. **MoreDetails touch target** — `components/ui/MoreDetails.tsx`'s
   trigger button stayed visually compact (h-9, 36px) but its effective
   interactive hit area was smaller than the 48px minimum. Fixed with a
   `::before` pseudo-element extending 6px above and below the button
   (`before:-inset-y-1.5`), giving a 48px tap target with no visible
   size change. `aria-expanded` and keyboard activation (Enter/Space on
   a real `<button>`) were already correct and remain unchanged.
2. **Investment Gain/Loss label** — Financial Investment and Business
   Interest cards (`AssetCard.tsx`) labeled their computed figure
   "Gain / Loss," which reads as interchangeable with Asset Sale's
   realised "Profit / Loss on Sale." Relabeled to "Unrealized Gain /
   Loss" — the calculation (`currentValue.minus(basis)` via Decimal.js,
   shown only when both values exist) is completely unchanged.
3. **Vehicle default disclosure** — Vehicle's default card had
   `emphasizeQuickSale: true`, keeping Quick-Sale Estimate in the
   primary grid on the (unstated, incorrect) assumption that vehicles
   are usually resale-intent. Since Monatriq has no canonical field to
   distinguish personal-use/business-use/resale-intent vehicles, this
   silently assumed the model auto-filled — the same class of problem
   P0-E4-S2 was written to eliminate elsewhere. Corrected: Vehicle's
   `assetDisplayConfig()` now has `emphasizeQuickSale: false`, matching
   Property/Equipment/Collectible/Other. Quick-Sale Estimate, Target
   Sale Price, and Vehicle Status (formerly a top-of-card badge) all
   moved into "More details" on `AssetCard.tsx`; nothing was removed —
   Vehicle Status remains fully editable in "Manage"
   (`AssetActionSheet.tsx`, unaffected). No vehicle-purpose/
   classification schema field was added.
4. **Remote migration status** — `docs/project/BUILD_STATE.md`'s
   "Remote deployment" section still described both
   `20260930090000_restrict_asset_status_to_vehicle.sql` (P0-E3-S4R) and
   `20261001090000_create_asset_disposition_domain.sql` (P0-E4-S1) as
   local-only/pending, blocked on Supabase CLI project access. Manual
   terminal verification (outside this agent session) confirmed Local
   and Remote (Monatriq Dev) migration histories now match through both
   migrations. Documentation updated to state Monatriq Dev is
   synchronized; no migration was run or reapplied by this agent.

Verified against the existing local Supabase stack (schema unchanged,
no reset needed): Assets suite 114/114 (one test's expectation updated
for the vehicle `emphasizeQuickSale`/target-label correction); full
regression 551/551, all 12 suites, zero failures. `npm run lint`,
`npm run typecheck`, and `npm run build` all pass clean.

Full documentation of all four corrections: `docs/reports/
P0-E4-S2-ux-language-progressive-disclosure.txt`, new section "FINAL UX
SIMPLIFICATION CORRECTIONS."

## Prior phase: P0-E4-S2 — UX Language + Progressive Disclosure Simplification

**COMPLETE**, with four corrections applied in P0-E4-S2A above — the
narrative below is this phase's own original record and is stale in
the three places P0-E4-S2A corrected (Vehicle's quick-sale emphasis,
the Gain/Loss label, and remote migration status); read those items in
light of P0-E4-S2A, not as still-current.

Presentation-only phase — no schema, migration, RLS, or
financial-calculation change. Audited and simplified user-facing copy
across Home, Money, Quick Add, and Assets (including Asset Sale) so a
user can understand their own money without knowing Monatriq's database
language (cost basis, disposition, realised gain/loss, capital
returned, cash flow class, valuation event, etc.), while that precise
language remains correct and available in the schema, domain layer, and
architecture docs, and one interaction away in the UI behind a single
standardized "More details" disclosure control
(`components/ui/MoreDetails.tsx`).

Centralized the per-asset-type label source: `lib/domain/assets/
capabilities.ts` now has three functions —
`assetCapabilities()` (what a type can do), `assetCreationConfig()`
(form-question wording for Add Asset), and the new `assetDisplayConfig()`
(compact card/field labels plus `showGainLoss`/`emphasizeQuickSale`
presentation-priority flags) — so `AssetCard`, `AssetActionSheet`,
`SellAssetSheet`, and `SoldAssetsSection` all read from one source
instead of each hardcoding labels. Gain/Loss on an Asset Card and
Profit/Loss on a sale preview are shown only when both source values are
genuinely known, computed with Decimal.js as an exact mirror of the
database's own `GENERATED` column formulas (P0-E4-S1) — never a second,
independently-derived calculation, never a fabricated figure when basis
is unknown.

Full audit, every wording decision and its rationale, and the
consumer-language test matrix: `docs/reports/
P0-E4-S2-ux-language-progressive-disclosure.txt`; product principle:
`docs/product/PRODUCT_DEFINITION.md` §9; design pattern:
`docs/design/VISUAL_CONSTITUTION.md` §9.

No migration this phase (none needed). Verified against the existing
local Supabase stack, no reset required (schema unchanged): 20
(RLS/Profile) + 48 (Money) + 11 (Currency) + 114 (Assets, was 107
pre-phase — 13 new presentation-config assertions, net of 6 prior
P0-E3-S4R2 assertions updated in place for the new wording) + 27
(Receivables) + 25 (Liabilities) + 56 (Goals) + 86 (Rules/Obligations) +
70 (Decisions) + 33 (Financial Position) + 30 (Home Readiness) + 31
(Home) = **551/551 assertions passed**, all 12 suites, zero failures.
`npm run lint`, `npm run typecheck`, and `npm run build` all pass clean.

Git preflight found `package.json`/`package-lock.json` already modified
(an added `supabase` devDependency, ~222 lock-file lines) before this
phase began — pre-existing, unrelated to P0-E4-S1 or P0-E4-S2, and not
this phase's own change. Per this phase's own instruction to stop and
report rather than guess, the user was asked and explicitly chose to
leave it as-is and proceed; that diff remains untouched and is not
attributed to this phase.

## Prior phase: P0-E4-S1 — Asset Sale / Disposal Domain Foundation

**COMPLETE.** The missing canonical capability the P0-E3-S4 report's own
"Asset Sale Domain Gap" identified. A user can now truthfully record "I
sold this asset": one atomic, SECURITY DEFINER RPC
(`record_asset_sale()`) validates ownership of both the asset and the
destination cash bucket from `auth.uid()`, records the sale's full
economics (gross proceeds, selling costs, net proceeds, cost basis AT
THE MOMENT of sale, realised gain/loss, capital returned — the last
three via database-enforced `GENERATED` columns, never recomputed in
application code), moves the actual net cash through the exact same
Money engine every other cash event already uses (one `financial_events`
row, `event_type='asset_sale'`, `cash_flow_class='other_inflow'` —
deliberately NOT income), and stops the sold asset contributing to
active Assets/Net Worth totals — all in one transaction, or none of it.
Full design rationale, every canonical formula, and the full 107-item
Assets test matrix: `docs/reports/
P0-E4-S1-asset-sale-disposal-domain-foundation.txt`; architecture:
`docs/architecture/FINANCIAL_DOMAIN_MODEL.md` §45; the new SECURITY
DEFINER convention (the first RPC-callable one in this codebase):
`docs/security/SECURITY_AND_RLS_PRINCIPLES.md` §21.

Generic, not vehicle-specific: `assetCapabilities().supportsSale` is
true for vehicle/property/financial_investment/business_interest/
equipment/collectible/other, and deliberately false for `inventory`
(the generic Inventory type represents an aggregate holding — a
whole-asset "sale" would misrepresent piecemeal real-world inventory
disposal) — Receivables/"Money You're Owed" structurally cannot reach
this capability at all (a separate table, no `assetType` to gate).
Disposition is derived purely from whether an active (non-voided)
`asset_dispositions` row exists — never a second stored flag on
`assets`, so voiding an `asset_sale` event through the existing,
completely unmodified `voidFinancialEvent()` both reverses the cash
effect and restores the asset's active state in one action. Vehicle
`status_code` gained no "sold" value and is untouched by a sale — a
vehicle's last operational status (e.g. "Listed") remains historical
data; `isDisposed` is what the UI treats as authoritative.

Migration `supabase/migrations/20261001090000_create_asset_disposition_
domain.sql` — now confirmed synchronized to Monatriq Dev, see "Remote
deployment" below. Verified against a real local Supabase stack, fresh
`supabase db reset`
(required — schema changed): 20 (RLS/Profile) + 48 (Money) + 11
(Currency) + 107 (Assets, was 69 pre-phase) + 27 (Receivables) + 25
(Liabilities) + 56 (Goals) + 86 (Rules/Obligations) + 70 (Decisions) +
33 (Financial Position) + 30 (Home Readiness) + 31 (Home) = **544/544
assertions passed**, all 12 suites, zero failures.

## Remote deployment (P0-E4-S1 and P0-E3-S4R migrations)

**RESOLVED, P0-E4-S2A.** Manual terminal verification (outside this
agent session — the in-session Supabase CLI access blocker described in
every phase since P0-E3-S4R was never itself resolved by this agent)
confirmed Local and Remote (Monatriq Dev) migration histories now match
through both of the previously-pending migrations:
1. `20260930090000_restrict_asset_status_to_vehicle.sql` (P0-E3-S4R)
2. `20261001090000_create_asset_disposition_domain.sql` (P0-E4-S1)

Monatriq Dev is synchronized with the local migration history as of
this correction. No migration was run or reapplied by this agent this
phase or the prior P0-E4-S2 phase — this section records confirmed
state, not an action taken here. Any future migration work should
assume both of the above are already live on Monatriq Dev.

## Prior phase: P0-E3-S4R2 — Add Asset: Type-Aware Creation Flow

**COMPLETE.** P0-E3-S4R fixed subtype leakage in the post-creation
Manage flow; manual QA then found the same class of problem one step
earlier — the Add Tracked Asset creation flow's Step 2 showed
effectively identical fields (Cost Basis / Current Value Estimate /
Conservative Quick-Sale Value / Target Value) for every asset type, so a
Vehicle and a Financial Investment read as the same product with a
different label. `lib/domain/assets/capabilities.ts` gained a second
exported function, `assetCreationConfig(assetType)` — the same
centralized-model pattern `assetCapabilities()` already established,
extended to creation-time presentation (heading/helper copy/all four
field labels) rather than a third, separately-scattered set of `if
(assetType === ...)` branches in `AddAssetSheet`. Zero schema changes:
every type still records through the exact same `create_asset()` RPC
and the same `asset_basis_events`/`asset_valuations` rows — only the
LABELS shown for those fields vary by type now. One real, evaluated
addition: an optional Vehicle Status field in Step 2 (gated by
`assetCapabilities().supportsVehicleStatus`, so vehicle-only), using the
existing `updateAsset()` call as a second mutation after `createAsset()`
succeeds — `create_asset()`'s own RPC signature was deliberately left
unchanged rather than adding a schema-changing status parameter to that
atomic function. Switching away from Vehicle in Step 1 clears any drafted
status immediately.

No migration, no `supabase db reset` — this pass touched no schema/RPC.
Assets suite: 69/69 (up from 60). Full regression re-run as a courtesy
(not required, since nothing schema-level changed): 506/506, all 12
suites, zero failures.

## Prior phase: P0-E3-S4R — Generic Asset Domain: Subtype Behavior Remediation

**COMPLETE** (implementation). Migration deployment status AT THE TIME
OF THIS PHASE: **NOT YET DEPLOYED** to Monatriq Dev — a deployment
attempt was made and BLOCKED by an environment/CLI-account access issue
unrelated to the migration's correctness (the authenticated Supabase
CLI session in that attempt could only see the "Nemryn" project, not
the actual linked Monatriq Dev project; see this phase's own report
addendum, "MONATRIQ DEV DEPLOYMENT ATTEMPT: BLOCKED, NO CHANGE MADE,"
for full detail). **Update, P0-E4-S2A:** manual terminal verification
outside this agent session later confirmed Monatriq Dev is now
synchronized through this migration — see "Remote deployment" above.
The migration (`20260930090000_restrict_asset_status_to_vehicle.sql`)
is no longer pending.

Manual browser QA on P0-E3-S4's Assets Overview found a Financial
Investment exposing the vehicle operational lifecycle (Awaiting Repair/
Repairing/Ready to List/Listed/Offer Received/Under Negotiation) and a
"Record a repair / improvement cost" form — the shared `AssetActionSheet`
rendered both unconditionally for every asset type, and nothing in the
database restricted which asset TYPE could hold `assets.status_code`
either (only its value vocabulary was constrained). This remediation
fixed it at all three layers per the brief's own "defense in depth"
requirement:
- **Database**: a new migration,
  `20260930090000_restrict_asset_status_to_vehicle.sql`, adds a
  table-level CHECK constraint (`status_code is null or asset_type =
  'vehicle'`) after a defensive (idempotent, found-nothing-to-clear-
  locally) cleanup UPDATE.
- **Repository**: `updateAsset()` now requires the caller to pass the
  asset's current type and throws a clear domain error if a
  vehicle-lifecycle `statusCode` is attempted on any other type.
- **UI**: a new centralized, typed capability model,
  `lib/domain/assets/capabilities.ts` (`assetCapabilities(assetType)`),
  is the single source `AssetActionSheet`/`AssetCard`/
  `PotentialLiquiditySection` read to decide whether to render the
  status control, the capital-improvement form, and what copy to use —
  replacing the previous universal, type-blind rendering. Capital-cost
  recording ("Record a repair / improvement cost" and its equivalents)
  is now subtype-worded per type and deliberately absent for
  `financial_investment` (no canonical "contribution" operation exists
  yet — see `docs/architecture/FINANCIAL_DOMAIN_MODEL.md` §44).

Verified against a real local Supabase stack, fresh `supabase db reset`
(required — schema changed): 20 (RLS/Profile) + 48 (Money) + 11
(Currency) + 60 (Assets, was 33 pre-remediation) + 27 (Receivables) + 25
(Liabilities) + 56 (Goals) + 86 (Rules/Obligations) + 70 (Decisions) + 33
(Financial Position) + 30 (Home Readiness) + 31 (Home) = **497/497
assertions passed**, all 12 suites, zero failures.

## Prior phase: P0-E3-S4 — Assets: Production UI + Asset Workflow Completion

**PARTIAL — ASSET SALE DOMAIN GAP.** The Assets Overview screen
(summary, category composition, Needs Attention, Potential Liquidity,
filterable category board, per-asset manage sheet, Receivables
integration, progressive-disclosure Add Asset) is complete, built
against the approved reference at `docs/reference/04-assets/`, and
verified against real authenticated-user data with zero prototype
content. Two capabilities the reference implies — Offers and a real
Asset Sale/Disposal mutation — remain deliberately unimplemented this
phase, per the brief's own explicit allowance to report a domain gap
rather than invent unsafe financial behavior; see the phase report's
"Asset Sale/Disposal audit" section. Quick Add's Asset Sale option
continues to defer to `/assets` with an honest message, unchanged from
P0-E3-S3.

The only schema change this phase is a narrow, non-financial one:
`assets.status_code`, a user-driven vehicle/asset lifecycle status
column (see Migrations below) — deliberately excludes `'sold'` and
`'archived'` so it can never be used as a substitute for the still-
missing real sale/archive lifecycle. (P0-E3-S4R, immediately following,
found and fixed a real defect in this column's original scoping — see
above.) Same limitation class as every prior phase: no browser
automation tool was available in this environment, so pixel-level
visual/viewport/theme rendering could not be observed directly.
Everything verifiable without a browser (production build, lint, both
typecheck configs, and a real-Postgres regression suite) was verified
and is reported as such.

Verified against a real local Supabase stack, fresh `supabase db reset`
(required this phase since the `status_code` migration changed schema):
20 (RLS/Profile) + 48 (Money) + 11 (Currency) + 33 (Assets, was 28
pre-phase) + 27 (Receivables) + 25 (Liabilities) + 56 (Goals) + 86
(Rules/Obligations) + 70 (Decisions) + 33 (Financial Position) + 30
(Home Readiness) + 31 (Home) = **470/470 assertions passed**, all 12
suites, zero failures.

## Prior phase: P0-E3-S3 — Money + Quick Add: Production UI

**Complete**, with the same class of limitation as P0-E3-S2: no browser
automation tool was available in this environment, so pixel-level
visual/viewport/theme rendering could not be observed directly — see the
phase report's §53. Everything verifiable without a browser (production
build success both Supabase-configured and unconfigured, lint, both
typecheck configs, and a real-Postgres regression suite covering every
Money/Quick Add code path including two brand-new canonical read
functions) was verified and is reported as such.

Money (`app/(app)/money/page.tsx`) and Quick Add
(`components/quick-add/`) are now Monatriq's production cash-flow
screen and the shared bottom nav's central `+` destination, built
against the approved references at `docs/reference/02-money/` and
`docs/reference/03-quick-add/`. Every figure is read from Money's own
canonical functions — `money_period_summary()`, `money_bucket_
balances()`, `money_currency_totals()`, `money_recent_activity()`, and
two new narrow additions this phase added the canonical way (see
Migrations below): `money_weekly_summary()` (backs the real weekly Cash
Flow chart — the reference's own chart, reproduced with real data
instead of omitted, unlike Home's This Month chart in P0-E3-S2, because
this phase's brief explicitly pre-authorized adding the smallest
necessary read capability) and `money_category_breakdown()` (backs
"Where Money Went"/"Cash In by Source", deliberately scoped to plain
money_received/money_spent events only — receivable recovery, debt
payments, and loan proceeds are real linked Receivables/Liabilities
events with their own record and are structurally excluded from ever
appearing as a generic category, proven by two dedicated tests). Quick
Add's four flows call only pre-existing canonical mutations
(record_money_received/spent, record_transfer/fx_transfer) or route to
the real, already-existing linked domain function for the three special
cases the phase brief called out: Receivable Recovery uses `record
Recovery()` (Receivables) with a real receivable picker, Debt Payment
uses `recordDebtPayment()` (Liabilities) with a real liability picker
and a genuine principal/interest/fee split, and Asset Sale — which has
no canonical mutation anywhere in Assets — is honestly deferred with a
message and a link to `/assets`, never faked as generic income. A real,
canonically-backed Undo (voidFinancialEvent, the same append-only
correction used everywhere else) follows every successful Quick Add
submission with a 5-second window, matching the approved reference's
own "5s Undo" pattern.

This is the first phase to build a real production screen. Home
(`app/(app)/home/page.tsx`) is now Monatriq's production Command Center,
reading exclusively from `getFinancialPositionSummary()` plus Money's own
`getRecentActivity()` — no arithmetic exists in any Home component. The
approved design reference at `docs/reference/01-home/` (a Stitch export
branded "Capital Compass" / "Victor", with hardcoded NGN figures) was
inspected and used strictly as a LAYOUT/hierarchy/spacing reference, per
its own explicit authority ordering (Monatriq architecture > approved
PNG > HTML > MD) — none of its demo content, branding, or literal values
entered production code; this was verified with an automated repository
grep, not just manual review.

A frontend/design-system foundation was established from a genuine gap
(no theme system existed, dark-only, no mobile navigation) rather than
styling Home directly on top of nothing: `next-themes` for Light/Dark/
System appearance (a mature library, not hand-rolled), a light-mode CSS
token override block (the dark token file's own comment had anticipated
this exact mechanism since it was first written), a production
AppShell/DesktopNav/MobileBottomNav/AccountMenu replacing the placeholder
text-link header, 48px touch targets on every core UI primitive, safe-area
handling, and a global `prefers-reduced-motion` rule. One genuinely
missing financial read capability was found and added the canonical way:
`asset_value_by_type()` (current asset value grouped by type AND
currency — Assets' own established "latest `estimated_current_value`"
semantics, one more `GROUP BY` key, no new valuation formula), composed
with Cash and Receivables into a new pure `buildCapitalDistribution()`
function for "Where Your Capital Lives."

Verified against a real local Supabase stack, fresh `supabase db reset`:
20 (Profile) + 37 (Money) + 11 (Currency) + 28 (Assets) + 27
(Receivables) + 25 (Liabilities) + 56 (Goals) + 86 (Rules/Obligations) +
70 (Decisions) + 33 (Financial Position) + 30 (Home Readiness) + 31
(Home) = **454/454 assertions passed**. Migration pushed to the real
remote "Monatriq Dev" project; schema deployment confirmed there.

## Supabase environment state

Same remote project as every phase since P0-E2-S3: "monatriq's Project"
(ref `mvnwrkfcszazqqccmmxq`), already linked — no new confirmation
needed.

Sequence: `supabase db push --linked --dry-run` (confirmed exactly one
new migration, this phase's), then `supabase db push --linked --yes`.
Verified via `supabase migration list --linked`: all 12 local migration
timestamps match remote exactly (...20260926090000/20260927090000 — the
last one is this phase's). The same benign pg-delta catalog-caching
warning seen in every prior remote push appeared again; it did not affect
schema application, confirmed by the migration-list match.

**What was NOT done against remote, deliberately**: the isolation test
suite was not executed against it — unchanged posture from every prior
phase. Remote validation for this phase is: **schema deployment
CONFIRMED, test EXECUTION NOT RUN** against remote — local execution
(454/454) is what this phase's COMPLETE status rests on.

All local validation ran against the same local Docker stack, reset from
migration history three times this phase. Real bugs found and fixed
before completion (all in this phase's own new code, not in anything
carried over from prior phases):

1. `buildCapitalDistribution()`'s percentage computation used
   `.toDecimalPlaces(1).toString()`, which drops a trailing `.0` for
   whole-number percentages (`25` instead of `25.0`) — inconsistent
   formatting against non-whole percentages elsewhere in the same list.
   Fixed with `.toFixed(1)`, which always shows exactly one decimal
   place.
2. `components/theme/ThemeToggle.tsx`'s first draft used the textbook
   next-themes "mounted" guard (`useState` + `useEffect(() =>
   setMounted(true), [])`), which this repository's stricter lint rule
   (`react-hooks/set-state-in-effect`) rejects. Rewritten to rely on
   `useTheme()`'s own `theme` being `undefined` pre-hydration and
   next-themes' own context re-render once resolved — no local
   mounted/effect state needed at all, and the lint rule is satisfied
   because there's no longer a synchronous `setState` inside an effect.
3. Two source-audit test false positives, both from grepping raw text
   without excluding source comments: a JSDoc comment reading "never a
   live rate" (a negation, correctly documenting the ABSENCE of that
   behavior) tripped a naive "live rate" search twice, in two different
   files. Fixed by rewriting that one audit to walk `.tsx` files and
   skip comment lines (`*`, `//`, `/*` prefixes) before testing, so it
   only inspects actual user-facing JSX text — the two other source
   audits (prototype-data, AI-slop copy) had no such false positives and
   were left as broader `grep`-based checks.

## Files created

`supabase/migrations/20260927090000_add_asset_value_by_type.sql`
`lib/domain/financial-position/capital-distribution.ts`
`lib/utils/time-of-day.ts`
`components/theme/{ThemeProvider,ThemeToggle}.tsx`
`components/layout/{DesktopNav,MobileBottomNav,AccountMenu}.tsx`
`components/home/{GreetingHeader,PositionSection,CapitalDistributionSection,
LiquidityNote,YourMovesSection,GoalsSection,RecentActivityPreview,
NewUserSetup}.tsx`
`app/(app)/home/loading.tsx`
`components/onboarding/useTimezoneOptions.ts` (post-completion fix — see
below)
`components/home/ThisMonthSection.tsx` (post-completion refinement — see
below)
`supabase/tests/home/run.ts`
`docs/reports/P0-E3-S2-home-command-center-production-ui.txt`

## Post-completion fix: onboarding infinite-render bug

Before this phase was handed off for review, a real runtime bug was
reported in `components/onboarding/OnboardingForm.tsx`: "Maximum update
depth exceeded" / "the result of getServerSnapshot should be cached."
Root cause: `useSupportedTimezones()`'s `useSyncExternalStore` snapshot
called `Intl.supportedValuesOf("timeZone")` directly, which allocates a
new array every call — `useSyncExternalStore` requires a referentially
stable snapshot, so React re-rendered without bound. Fixed by caching
each snapshot (module-level, computed once, same reference returned
thereafter) — exactly what the React warning itself recommends — with no
new effect, no second timezone registry, and no hardcoded timezone. The
two hooks were extracted into a new JSX-free module,
`components/onboarding/useTimezoneOptions.ts`, specifically so the fix
could be verified with a real `react-dom/client` render (in a scratch,
`--no-save` `jsdom` install, removed afterward) — proven to reproduce
both original errors with the old code (negative control) and to render
cleanly, bounded, with the full 418-zone list populated, with the fix.
Separately, the complete "Create Account → authentication → onboarding →
save profile → Home" flow was driven end-to-end through the real running
`next dev` server via a constructed `@supabase/ssr`-format session
cookie (using that package's own installed encoding utilities) — all
seven checkpoints passed, including confirming the onboarding gate still
redirects a not-yet-onboarded user away from `/home`. Full detail: the
ADDENDUM section of `docs/reports/P0-E3-S2-home-command-center-production-ui.txt`.
Full regression (454/454), lint, both typechecks, and the Supabase-configured
build were all re-run clean after this fix.

## Post-completion refinement: manual mobile visual QA on Home

The user manually inspected production Home at localhost on a real
browser, mobile width, new-user (empty) state, and dark mode — approved
the architecture/financial behavior but not yet the visual
implementation, with specific observations (header weight, an oversized
account-menu pill, a generic-SaaS-feeling empty-state card, unused
vertical space, bottom-nav legibility). Refined in place: `AppShell.tsx`
(shorter mobile header, quieter `bg-background` surface instead of the
solid Midnight Navy `bg-surface-raised` bar), `AccountMenu.tsx` (icon-only
48px circular trigger, no pill/border/chevron), `MobileBottomNav.tsx`
(same quieter background, more legible inactive icon color, softer
central "+" elevation — still exactly 48px), and `NewUserSetup.tsx`
(rewritten from one large bordered card into an open, divider-separated
layout, with a new compact "What Monatriq will track" orientation grid
filling the previously-empty space below the setup actions — no fake
data). Pure visual/layout change — zero financial architecture, domain
calculation, RLS, or schema touched. Full detail, including exactly what
was and wasn't manually inspected: ADDENDUM 2 of `docs/reports/
P0-E3-S2-home-command-center-production-ui.txt`. `npm run lint`,
`npx tsc --noEmit`, `npm run build`, and the full 454-assertion suite
were all re-run clean after this round.

## Post-completion fix: development-environment separation

A real workflow bug was reported: a manually-created Monatriq Dev user
disappeared after every local `supabase db reset`, with sign-in
afterward returning "Invalid login credentials." Root cause, confirmed
by inspection before any change: `npm run dev` and every `npm run
test:*` script both read Supabase config from the same file,
`.env.local`, which was set to the LOCAL Docker stack — so `npm run dev`
and the destructive local test harness (and `supabase db reset`) were
the same database the whole time.

**Fixed with two separate, gitignored env files, never one shared
file.** `.env.local` (the application's own config — `npm run dev`/
`npm run build`) now points at Monatriq Dev
(`https://mvnwrkfcszazqqccmmxq.supabase.co` + that project's anon key —
URL/anon key only, explicitly no service-role key, matching
`lib/config/env.ts`'s `SupabaseEnv` interface, which has no service-role
field at all). `.env.test.local` (new) now holds exactly what
`.env.local` held before — the local stack's URL, local anon key, and
`SUPABASE_TEST_SERVICE_ROLE_KEY` — and is what all 11 `test:*` scripts
in `package.json` load (`--env-file-if-exists=.env.test.local`, changed
from `.env.local`). `supabase/tests/shared/env.ts`'s hard local-only
refusal (rejects any non-127.0.0.1/localhost URL) is unchanged and now
always evaluates `.env.test.local`'s URL. `.env.example` rewritten to
document both files; `supabase/tests/rls/README.md` updated to match.
No secret value was printed at any point in this fix (verified by
length/prefix/JWT-role-claim checks, never by displaying raw values).

**Verified, not assumed**: the running dev server's served client bundle
was fetched and confirmed to contain `mvnwrkfcszazqqccmmxq.supabase.co`
and zero occurrences of `127.0.0.1:54321`; the same bundle's only
embedded JWT decodes to `"role":"anon"` (21 raw text matches for
"service_role" were individually inspected and are all
`@supabase/supabase-js`'s own defensive warning string, not an actual
key — zero real service-role material is present); `npm run test:rls`
was run and correctly created/cleaned up local fixture users via
`.env.test.local`; local `supabase db reset` succeeded; the full
454-assertion suite was re-run clean after the reset; lint, both
typechecks, and `npm run build` (against the now-Monatriq-Dev-pointed
`.env.local`) were all re-run clean. Full detail: ADDENDUM 3 of
`docs/reports/P0-E3-S2-home-command-center-production-ui.txt`.

## Post-completion refinement: populated Home, manual QA (Dark + Light)

The user manually inspected production Home with real populated
authenticated data, in both Dark and Light mode — the first manual-QA
round against populated data (prior rounds were the new-user empty
state). Architecture/data behavior approved again; visual/hierarchy
issues reported and fixed: (1) Liquid Position/Net Worth/Safe to Deploy's
three equal-weight cards reduced to one primary card (Liquid Position)
plus one combined, quieter secondary card (Net Worth + Safe to Deploy,
divider-split) — net container count went down, not up.
(2) `CapitalDistributionSection`'s category rows restructured from one
line to two (label+percentage on top, amount on its own line below) —
a viewport-width-agnostic structural fix, not a breakpoint tweak, so a
long label and a large amount can never collide with the percentage at
any width. (3) A new Home-only `ThisMonthSection.tsx` gives Cash In/Cash
Out/Net primary weight, Earned Income/Expense secondary weight, and
collapses Transfer In/Out into one small line shown only when nonzero —
the shared `MonthlyMoneySummaryPanel` (still all seven fields, unabridged)
remains untouched and is still the only thing `/financial-position`
renders. (4) Your Moves' Focus Goal/Decision items lost their individual
card borders in favor of a plain divided list. (5) A cash/debt Goal at
true 0% progress now shows an explicit "Not funded yet"/"No repayment
yet" label instead of a blank-looking rail; nonzero percentages are now
also shown as an explicit number next to the bar. (6) Light mode tokens
were NOT touched — no specific defect was reported this round beyond
"directionally approved." (7) `formatCurrencyAmount()` gained one
additive, opt-in `{ trimTrailingZeros: true }` parameter (full design in
`docs/architecture/MULTI_CURRENCY_MODEL.md §25`) — default behavior is
byte-for-byte unchanged for every existing caller; only Home's own
summary-level figures opt in, while Recent Activity and every detail/
transaction view keep full currency precision. (8) Bottom nav reviewed
(not redesigned) and confirmed structurally sound — no code change.

Pure visual/presentational change — zero new financial calculation, RLS
change, or schema change. Full detail, including exactly what was
manually inspected vs. reasoned from code review: ADDENDUM 4 of
`docs/reports/P0-E3-S2-home-command-center-production-ui.txt`. Fresh
local reset + full 454-assertion suite, lint, both typechecks, and
`npm run build` were all re-run clean after this round.

## Post-completion refinement: visual realignment to the approved reference

A manual side-by-side comparison against `docs/reference/01-home/
screen.png` found the production Home had drifted too far from the
approved composition — the anti-AI-slop pass (this file's previous two
entries) had overcorrected into visual sparseness. The reference's
density/hierarchy/compact-card richness is itself part of the approved
identity, not something to strip away. Restored, using ONLY real domain
state (the governing rule applied throughout: a badge/chip/card is
legitimate exactly when it represents an already-available canonical
field — nothing was invented): (1) Net Worth and Safe to Deploy reverted
from one merged panel back to two distinct compact cards side by side —
the approved reference's specific visual signature. (2) Liquid Position
gained a real "N reserves" count per currency, from Money's own
`getBucketBalances()` (newly fetched on Home, filtered to positive
balances — a count of already-fetched rows, not a new calculation).
(3) "Where Your Capital Lives" restored as one grouped section surface
with a real icon per category row (mapped from the category's own
key/asset_type code) — the collision-safe two-line row structure is
unchanged. (4) Your Moves restored to compact contained modules with a
real, neutrally-styled status chip for each Decision's actual recorded
choice (Proceed/Wait/Decline/Keep reviewing). (5) Goals gained a
"Protected" chip and a target-date line — both already-available
`GoalSummary` fields that were simply never displayed before. (6) This
Month and (7) Recent Activity both gained a proper section-surface fill/
grouping and (for Recent Activity) a real direction icon per row.
(8) Upcoming Obligations' shared "Protected" text became a small chip
(also improves `/rules`), and Home wraps the list in its own section
surface. (9) Section/header spacing tightened for density — no font size
was reduced. No new financial calculation was added anywhere in
`components/home/` — verified explicitly. Full detail, including exactly
what was and wasn't re-inspected: ADDENDUM 5 of `docs/reports/
P0-E3-S2-home-command-center-production-ui.txt`. Fresh local reset, the
full 454-assertion suite, lint (one fix: a React Compiler rule correctly
flagged a stored-icon-component-reference pattern, resolved by returning
JSX elements from small lookup components instead), both typechecks, and
`npm run build` were all re-run clean after this round.

## Post-completion refinement: final mobile density + scale realignment

A second side-by-side comparison against `docs/reference/01-home/
screen.png` found Home now structurally correct (the previous entry's
composition was right) but still visually spacious rather than a compact
mobile financial command center — oversized card padding, section gaps,
row heights, and a too-tall Liquid Position card. Explicitly not a
redesign: no section, card, or element was added or removed; every
change is a padding/gap/row-height/icon-size/type-scale reduction on
markup that already existed. (1) Net Worth and Safe to Deploy's grid
fixed from `grid-cols-1 sm:grid-cols-2` (stacked on every ordinary phone
width) to mobile-first `grid-cols-2` — two columns from the base
breakpoint, the approved reference's specific signature. (2) Liquid
Position's padding and internal spacing compressed; its headline
dropped from `text-3xl` to `text-2xl`, with Net Worth/Safe to Deploy
dropped to `text-lg`, restoring a clear primary/secondary size
differential. (3) The page's outer section gap tightened from 28px to
24px. (4) A "Current Position" eyebrow was added above the three
position metrics, with a real total reserve count (a plain sum of the
already-fetched per-currency reserve-count map — not a new query) shown
only when nonzero. (5-14) Card padding, row gaps, row heights, icon
container sizes, and status-chip sizes were reduced consistently across
Capital Distribution, Your Moves, Goals, This Month (the largest single
fix — its three-tier hierarchy is unchanged, only its spacing), Recent
Activity, and Upcoming Obligations (shared with `/rules`, chip size
only). (15-16) Surface-color hierarchy (Liquid Position alone on the
raised token) and header/bottom-nav height were reviewed and left
unchanged, as instructed. No new financial calculation was added
anywhere — verified explicitly (the one new expression, a total-reserve-
count sum, reduces to summing an already-computed map). Full detail,
including the explicit CSS-structure reasoning for 320/360/393/430
viewports and what was and wasn't re-inspected: ADDENDUM 6 of `docs/
reports/P0-E3-S2-home-command-center-production-ui.txt`. Fresh local
reset, the full 454-assertion suite, lint, both typechecks, and
`npm run build` were all re-run clean after this round.

## Post-completion refinement: strict reference replication pass

Strategy change, explicitly instructed: every prior refinement round
treated the approved reference (`docs/reference/01-home/screen.png`,
`code.html`, `DESIGN.md`) as inspiration to interpret through an
anti-AI-slop lens; this round instead reproduces its actual visual
composition as faithfully as reasonably possible — layout, card
surfaces, typography scale, icon placement, chip/bar treatment — while
Monatriq's domain layer remains the sole source of data and financial
truth. Where this superseded an earlier round's own instruction (e.g.
the previous entry's differentiated card-surface hierarchy), the newer,
more explicit instruction took precedence. One new centrally-defined
token was added (`--color-surface-strong`, Dark + Light, additive only)
for the reference's nested/elevated elements (icon badges, inner
highlight boxes, bar tracks). Every major Home card now shares one
uniform surface tone (was previously differentiated); the greeting
became a contained card; "Where Your Capital Lives" and "This Month"
gained embedded section titles; Liquid Position's headline grew to match
the reference's dominant scale; Capital Distribution gained a real
(summed-from-already-computed-percentages) illiquid-percentage badge and
a restructured, still-collision-safe two-column row layout; Your Moves
and Goals cards gained leading icons and inner highlight boxes built
from real fields (a Decision's own type code and scenario count; a
goal's own measurement type and required-pace data); This Month gained a
real net-flow badge and a highlighted stat box, with the reference's
fabricated weekly bar chart deliberately NOT reproduced (no canonical
weekly Money read model exists); Recent Activity rows now use the
event's own real `description` field (already on the type, previously
unused on Home) as their title. Several reference elements were
identified as having no real Monatriq domain state behind them and were
omitted rather than fabricated — most notably the reference's numbered
"1/2/3" priority badges on Decision cards (replaced with a decision-type
icon, since an existing automated test explicitly guards against
Decisions carrying any rank/score concept) and its invented
cross-goal "Target Horizon" journey headline (replaced with real
per-goal required-pace data where Goals has actually calculated it). No
new financial calculation was added — the two new presentational sums
(total reserve count; Capital Distribution's illiquid percentage and
locked/liquid amount summary) are both plain arithmetic over values the
domain layer already computed per item. Full detail, including the
complete list of reference elements not reproduced and why: ADDENDUM 7
of `docs/reports/P0-E3-S2-home-command-center-production-ui.txt`. Fresh
local reset, the full 454-assertion suite, lint, both typechecks, and
`npm run build` were all re-run clean after this round (one fix along
the way: a doc comment had quoted the reference's own prototype figure
as a formatting example, caught by the automated prototype-data source
audit and reworded).

## Post-completion fix: theme provider React 19 / Next 16 compatibility

After P0-E3-S3, `npm run dev` reported "Encountered a script tag while
rendering React component" from `components/theme/ThemeProvider.tsx`.
Confirmed as `next-themes@0.4.6`'s (the current latest stable release)
unresolved React 19.2 bug — no fixed stable version exists upstream (its
only newer tag, `1.0.0-beta.0`, was published in 2022, years before
React 19). Migrated to `@teispace/next-themes@^3.0.2`, an actively
maintained fork whose README explicitly documents and fixes this exact
issue (its own issue #397/#387/#385) by injecting the anti-FOUC script
via Next's `useServerInsertedHTML` instead of returning `<script>` JSX
from a component. `attribute="data-theme"`/`defaultTheme="system"`/
`enableSystem` are unchanged (source-compatible props); `storage="local"`
was added explicitly since this fork defaults to hybrid cookie+
localStorage, and `local` is required to preserve the exact prior
device-local-only, no-cookie persistence the original P0-E3-S2 brief
mandated. While verifying this fix in a real dev server, a genuine,
separate, pre-existing crash was also found and fixed:
`components/layout/AppShell.tsx`'s `QuickAddProvider` (added in
P0-E3-S3) only wrapped `<main>`, not the `<header>`, so `DesktopNav`'s
own Quick Add trigger threw "useQuickAdd must be used within
QuickAddProvider" on every page render — invisible to lint/typecheck/
build/the Postgres suite (none render this tree against a live request),
caught only because starting a real dev server surfaced it in the
server log. Fixed by moving the provider to wrap the whole shell. `npm
run lint`/`npx tsc --noEmit`/`npm run build`: all clean. Browser
verification of the absence of the specific console warning was NOT
performed — no connected browser tool was available in this session
(the built-in browser pane cannot reach a `localhost` server Claude
starts itself; the Claude-in-Chrome extension was not connected) — the
raw SSR HTML was inspected directly instead, confirming the new
library's script is present, correctly configured, and injected outside
the React tree exactly as its own documented fix describes. Full detail:
the addendum appended to `docs/reports/P0-E3-S3-money-quick-add-
production-ui.txt`.

## Files modified

`app/(app)/home/page.tsx` (full production rewrite — was placeholder
scaffolding), `app/layout.tsx` (`ThemeProvider`, `suppressHydrationWarning`,
theme-aware `viewport.themeColor`/`colorScheme`), `app/(app)/money/page.tsx`
(`id="cash-buckets"`/`id="record-money"` anchors for Quick Add routing),
`components/layout/AppShell.tsx` (full rework — desktop nav + account menu
+ mobile bottom nav, replacing the placeholder text-link header),
`components/brand/BrandLogo.tsx` (theme-agnostic mark + text instead of a
single dark-background wordmark SVG), `components/auth/SignOutButton.tsx`
(optional `className` passthrough), `components/ui/{Button,Input,Select}.tsx`
(48px touch targets; `Input`/`Select` also gained `text-base` below `sm:`
to prevent iOS Safari zoom-on-focus), `lib/styles/tokens.css` (light-mode
`:root[data-theme="light"]` override block; global
`prefers-reduced-motion` rule), `lib/domain/assets/{types,repository}.ts`
(`AssetValueByType`, `getAssetValueByType()`), `lib/domain/financial-position/
{types,repository}.ts` (`capitalDistribution` field, composed in
`getFinancialPositionSummary()`), `lib/supabase/database.types.ts`
(regenerated), `package.json` (`next-themes`, `lucide-react` dependencies;
`test:home` script; extended combined `test` script), `docs/architecture/
{FINANCIAL_DOMAIN_MODEL,SYSTEM_ARCHITECTURE}.md`, `docs/design/
VISUAL_CONSTITUTION.md`, `components/onboarding/OnboardingForm.tsx`
(post-completion fix — see above; the useSyncExternalStore infinite-loop
bug fixed, its two hooks extracted to the new `useTimezoneOptions.ts`),
`.env.example` (documents the two-file environment split),
`supabase/tests/shared/env.ts` and `supabase/tests/rls/README.md`
(messages updated to reference `.env.test.local`) — the last three from
the environment-separation fix above; `components/home/{PositionSection,
CapitalDistributionSection,YourMovesSection,GoalsSection}.tsx`,
`lib/domain/currency/format.ts` (additive `trimTrailingZeros` option),
`docs/architecture/MULTI_CURRENCY_MODEL.md` (+§25) — from the populated-
Home manual-QA refinement above.

`docs/security/SECURITY_AND_RLS_PRINCIPLES.md` was deliberately NOT
modified — `asset_value_by_type()` follows the exact established
`SECURITY INVOKER` read-function pattern; no new security pattern was
introduced this phase.

## Migrations

**P0-E3-S2**:
`supabase/migrations/20260927090000_add_asset_value_by_type.sql`. Zero
new tables. One new function, `asset_value_by_type()` — `security
invoker`, `stable`, the same "latest `estimated_current_value`,
non-archived" subquery `asset_native_currency_totals()` (P0-E2-S3) already
uses, grouped by `(asset_type, currency_code)` instead of `currency_code`
alone. `financial_position_by_currency()` (P0-E3-S1) is completely
untouched. Applied cleanly on all three resets this phase.

**P0-E3-S3**:
`supabase/migrations/20260928090000_create_money_period_breakdowns.sql`.
Zero new tables. Two new `security invoker`, `stable` functions,
`money_weekly_summary(p_start, p_end)` and `money_category_breakdown
(p_start, p_end)` — both reuse `money_period_summary()`'s own exact
`cash_flow_class`-based classification (P0-E3-S1A) unchanged, grouping
the SAME already-correct classification by week or by category instead
of summing it across the whole period. Neither is a second source of
financial truth. `money_period_summary()`/`resolve_period_bounds()`
themselves are completely untouched. Both new functions `revoke ... from
public, anon` / `grant execute ... to authenticated`, matching every
other Money RPC. 9 new tests added to `supabase/tests/money/run.ts`
(weekly bucketing, opening-balance/transfer exclusion, multi-currency
separation, empty-period honesty, category labels, real Receivable
Recovery/Debt Payment exclusion via the actual linked domain functions,
cross-user isolation, anonymous denial) — applied cleanly on every reset
this phase, 48/48 Money-suite assertions passing.

**P0-E3-S4**:
`supabase/migrations/20260929090000_add_asset_status.sql`. Zero new
tables. Adds `assets.status_code text` with an inline `CHECK` constraint
limited to `('awaiting_repair', 'repairing', 'ready_to_list', 'listed',
'offer_received', 'under_negotiation')` — deliberately excludes
`'sold'` (no canonical sale mutation exists yet, see the phase report's
Asset Sale audit) and `'archived'` (the existing `is_archived` column
already owns that state; a status value would create two sources of
truth). Column-level grant: `update (status_code)` added additively
alongside the existing `assets` UPDATE grant. `asset_summary()` was
dropped and recreated (`CREATE OR REPLACE` cannot change a function's
return-column shape) to add `status_code` to its output — its underlying
`LEFT JOIN LATERAL` valuation logic is completely unchanged. 5 new tests
added to `supabase/tests/assets/run.ts` (null default, real status set
and visible in `asset_summary()`, invalid/`'sold'` value rejected by the
CHECK constraint, cross-user status update denied, status cleared back
to null) — 33/33 Assets-suite assertions passing.

**P0-E3-S4R**:
`supabase/migrations/20260930090000_restrict_asset_status_to_vehicle.sql`.
Zero new tables. Local Docker was inspected first (a direct query
against `supabase_db_Monatriq`) and found zero existing rows with
`status_code` set on any asset — nothing to protect locally. The
migration still includes an unconditional, idempotent defensive cleanup
(`update assets set status_code = null where status_code is not null
and asset_type <> 'vehicle'`) ahead of the constraint, so it is safe to
apply later to any environment (including Monatriq Dev, not pushed this
pass) without a separate manual data audit first — it touches only
`status_code`, never `asset_type`/name/currency/basis/valuation. Adds a
new table-level CHECK constraint,
`assets_status_code_requires_vehicle` (`status_code is null or
asset_type = 'vehicle'`), additive alongside the original column-level
enum CHECK from P0-E3-S4 (Postgres allows multiple CHECK constraints on
one column; both must hold). 27 new tests added to `supabase/tests/
assets/run.ts` (all 6 vehicle statuses settable, status clears to null,
all 7 non-vehicle types rejected by the repository with a clear error
message, the same rejection re-proven at the database layer via a raw
REST bypass, a post-attempt integrity check that no non-vehicle asset
ended up with a status anyway, plus 5 pure-function assertions against
`assetCapabilities()` itself) — 60/60 Assets-suite assertions passing.

**P0-E4-S1**:
`supabase/migrations/20261001090000_create_asset_disposition_domain.sql`.
One new table, `asset_dispositions` (immutable sale-economics snapshot;
`net_proceeds`/`realised_gain_loss`/`capital_returned` are `GENERATED
ALWAYS AS (...) STORED` columns — the canonical formulas are enforced by
Postgres itself, not application code, and cannot be violated by any
insert path). One new `financial_events.event_type` value, `asset_sale`
(`cash_flow_class = 'other_inflow'`, extending the existing CHECK
constraint the same way P0-E2-S4 already did for `receivable_recovery`/
`debt_principal_payment`). One new atomic RPC, `record_asset_sale()` —
the first `SECURITY DEFINER` function in this codebase a client calls
directly (every prior use is the signup trigger); see
SECURITY_AND_RLS_PRINCIPLES.md §21 for the full justification and every
hardening rule followed. `asset_summary()` was dropped and recreated
(return-shape change, same DROP+CREATE requirement every prior
column-adding change to this function has hit) to add `is_disposed`/
`disposed_at`. `asset_native_currency_totals()`/`asset_value_by_type()`/
`asset_quicksale_coverage()`/`financial_position_by_currency()` were all
updated (CREATE OR REPLACE, return shapes unchanged) to exclude disposed
assets the same way they already exclude archived ones. One new read
function, `asset_disposition_summary()`, for the Sold Assets history
view. 38 new tests added to `supabase/tests/assets/run.ts` (capability
decisions per type, all 5 sale-economics formulas in gain/loss/zero/
unknown-basis scenarios, cash-effect and earned-income classification,
active-value exclusion, double-sale/concurrency/idempotency, cross-user
asset and bucket rejection, anonymous denial, direct-table-bypass
rejection, cross-currency rejection, archived-bucket rejection,
reversal/void semantics, archive-interaction and vehicle-status-
interaction lifecycle rules, receivable-recovery non-interference) —
107/107 Assets-suite assertions passing. Local Docker only — see "Remote
deployment" above.

## Architecture changes

- **Theme is a pure presentation-layer concern, enforced by construction.**
  No component branches on theme in code — every component already
  consumed semantic CSS custom properties (`bg-surface`, `text-text-primary`,
  ...) rather than raw colors, a discipline established back in P0-E1-S1's
  token design specifically so this would be possible later without a
  component rewrite. Light mode required exactly one new CSS block and
  zero component changes.
- **`next-themes` over a hand-rolled theme system**, per explicit standing
  instruction to prefer a mature library. Persistence is its own
  `localStorage` key — no financial backend state, no new table, no user
  row.
- **Navigation is conceptual, not exhaustive.** Primary nav is Home/Money/
  Assets/Decisions/Goals (+ mobile-only Quick Add) per
  `docs/product/PRODUCT_DEFINITION.md` §3 — Financial Position, Rules,
  Receivables, and Liabilities remain fully real, working routes, just
  relocated to the account menu rather than deleted or hidden.
- **Quick Add is a global overlay, not a Money-page feature (P0-E3-S3).**
  `QuickAddProvider` is mounted once in `AppShell` (a small, bounded
  amount of real Money data — buckets/balances/categories — is now
  fetched on every authenticated page load, not just Money's own), so
  the shared bottom nav's central `+` opens the real sheet from any
  screen, matching the reference's own behavior of intercepting that
  button globally. Desktop/tablet (where the mobile bottom nav is
  `md:hidden`) got its own equivalent trigger in `DesktopNav`, since
  Quick Add would otherwise be completely unreachable above the `md`
  breakpoint.
- **Special financial semantics are enforced by ROUTING, not by copy.**
  Quick Add's Money Received/Money Spent forms don't just avoid
  mislabeling Receivable Recovery/Asset Sale/Debt Payment — selecting
  any of the three structurally switches the form to a different code
  path (a real receivable/liability picker calling the real linked
  mutation, or an honest deferred message) rather than relying on a
  disclaimer next to a generic category dropdown.
- **One genuinely missing read capability, added the canonical way.**
  `asset_value_by_type()` reuses Assets' own established valuation
  semantics with one more `GROUP BY` key — verified against
  `asset_native_currency_totals()`'s own totals in the new test suite
  (summing across types must equal the existing per-currency total).
- **Capital distribution never blends currencies invalidly.** `build
  CapitalDistribution()` (pure, no I/O) only computes cross-currency
  percentages once every currency present has a resolved manual reporting
  rate (reusing the exact rate map Financial Position's own reporting Net
  Worth already resolves) — otherwise it returns one honest distribution
  per native currency. Verified with crafted inputs (unit-style, no DB
  needed) and end-to-end with a real multi-currency fixture user.
  Liabilities are never a distribution category by construction (the
  function's `add()` helper is never called with a liabilities figure).
- **Home's data boundary was verified byte-identical to source, not just
  "close enough."** `supabase/tests/home/run.ts` asserts
  `JSON.stringify()` equality between Home's `nativePositions`/`thisMonth`
  and direct calls to `financial_position_by_currency()`/`money_period_
  summary()` for the same user in the same request — the strongest form
  of "no duplicate calculation" proof available without static analysis
  tooling.

- **Status/insight separation is structural, not a copy convention
  (P0-E3-S4).** `assets.status_code` is a plain user-set enum column —
  nothing in the read path (`asset_summary()`, `AssetActionSheet`) ever
  infers or defaults a status from valuation/repair data. "Status not
  set" is the only fallback, by construction, matching the brief's
  explicit "insight != status" rule.
- **Deliberately deferred: Offers (P0-E3-S4, still unimplemented).**
  No canonical model exists; evaluated and explicitly NOT added rather
  than invented unsafely, per the original phase report's own Asset Sale/
  Disposal audit reasoning. Asset Sale/Disposal ITSELF — the other half
  of that original deferral — is now implemented (P0-E4-S1): a real,
  atomic `record_asset_sale()` with full gain/loss economics, ownership
  verification, and idempotency. Quick Add's Asset Sale option now routes
  to the real per-asset Sell Asset action on `/assets` instead of
  deferring with an apology.
- **Generic-vs-subtype capability is now a real, three-layer boundary,
  not a UI convention (P0-E3-S4R).** `lib/domain/assets/capabilities.ts`
  (`assetCapabilities(assetType)`) is the one centralized, typed source
  every component reads to decide what to render; `updateAsset()`
  independently enforces the same rule in the repository (requires the
  caller's known asset type, throws a domain error on mismatch); the
  database independently enforces it too (`assets_status_code_requires_
  vehicle` CHECK). All three layers were verified to actually agree —
  see docs/architecture/FINANCIAL_DOMAIN_MODEL.md §44 and docs/reports/
  P0-E3-S4R-asset-subtype-behavior-remediation.txt. Any FUTURE
  subtype-only capability must follow this same three-layer pattern, not
  a UI-only `if (asset.type === ...)` branch.
- **`SECURITY DEFINER` is now used for exactly one thing: making a
  financial-truth table genuinely un-forgeable by the client, not a
  general-purpose escape hatch (P0-E4-S1).** `asset_dispositions` has no
  client INSERT/UPDATE grant at all; `record_asset_sale()` is the sole
  write path, with every §11 DEFINER hardening rule followed and
  ownership re-derived from `auth.uid()` regardless of RLS's own
  bypassed-for-the-owner-role behavior in a DEFINER context — see
  SECURITY_AND_RLS_PRINCIPLES.md §21 for the full reasoning, including
  why this doesn't contradict §20's warning against DEFINER in
  composition chains. Every other domain remains SECURITY INVOKER; this
  is a deliberate, documented, single exception, not a new default.
- **Disposition is derived, never a second stored flag — the same
  discipline §15/§44 already established, applied a third time.** An
  asset is "disposed" iff an active (non-voided) `asset_dispositions` row
  exists for it; voiding the linked `financial_events` row through the
  existing, unmodified `voidFinancialEvent()` both reverses the cash
  effect and restores active state in one action, with no dedicated
  "un-sell" function.

## Known limitations

- **No browser automation tool was available in this environment.**
  Pixel-level Light/Dark/System rendering, actual viewport overflow at
  320-430px, actual on-screen touch-target size, and actual contrast were
  NOT verified by rendering the app — only by code/CSS-level inspection
  (compiled bundle contains the light-mode block; every interactive
  primitive's className guarantees `min-h-12`; the mobile nav's container
  classes contain no fixed pixel widths that would overflow a 320px
  viewport on inspection). This is reported honestly as unexecuted, not
  claimed as passed — see the phase report §45.
- The manual reporting-rate entry form (P0-E3-S1A, unchanged this phase)
  still only records a rate in the currency→reporting direction.
- No live FX provider integration exists or is planned — V1 remains
  manual-first throughout.
- The central mobile "+" Quick Add button routes to `/money#record-money`
  (or `/money#cash-buckets`-adjacent top-of-page for a zero-bucket user,
  since that anchor doesn't exist yet for them) rather than a dedicated
  Quick Add flow — explicitly deferred per the phase brief ("do not build
  final Quick Add this phase").
- Home's Recent Activity preview shows the 6 most recent events with a
  "View all" link to `/money` — no pagination or filtering, matching the
  restrained-preview intent of the approved design reference.
- Remote (Monatriq Dev) has the new schema but has not been exercised by
  any test suite — unchanged posture from every prior phase.

## Current setup requirements

**Changed this phase (environment separation — see the fix above): two
separate env files now exist, not one.** `.env.local` is the
application's own config (`npm run dev`/`npm run build`) — point it at a
real, persistent Supabase project (e.g. Monatriq Dev: its URL + anon key
only, never a service-role key). `.env.test.local` (new) is the test
harness's own config — populate it from `supabase status -o env` after
`npm run db:start` (Docker), local URL + local anon key + the local
`SERVICE_ROLE_KEY` under `SUPABASE_TEST_SERVICE_ROLE_KEY`. See
`.env.example` for both, side by side. `npm run db:types` after any
migration change (reads the local stack directly via the CLI, not either
env file). `npm run test:rls` / `test:money` / `test:currency` /
`test:assets` / `test:receivables` / `test:liabilities` / `test:goals` /
`test:rules` / `test:decisions` / `test:financial-position` /
`test:home-readiness` / `test:home` / `test` (all twelve) load
`.env.test.local` explicitly and refuse to run against anything that
isn't `127.0.0.1`/`localhost`, regardless of what's in `.env.local`.
`supabase db reset` always targets the local Docker stack only,
regardless of either env file (no `--linked` flag) — it can no longer
have any effect on whatever project `.env.local`/`npm run dev` points
at, which is the entire point of this separation. Remote project already
linked — `supabase db push --linked --dry-run` before any future real
push, never `supabase db reset` against it.

## Open questions

1. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged).
2. Timing of the curated final Stitch/design-reference set for OTHER
   screens (Money, Assets, Decisions, Goals) — Home's is now resolved;
   the others remain unchanged/open.
3. Local-vs-remote RLS-testing policy (unchanged — still unresolved
   across ten phases now).
4. Account-deletion / data-removal flow (unchanged).
5. Should FX transfer fees eventually be one combined RPC call
   (unchanged).
6. Should a future phase add cross-currency handling across domains
   (unchanged).
7. Should Loan Proceeds get its own dedicated UI entry point (unchanged).
8. Should a future phase add a dedicated milestone-management UI
   (unchanged).
9. Should `financial_rules.rule_type` grow additional values (unchanged).
10. Whether the scenario-with-two-different-buckets scope limitation
    (Decisions, P0-E2-S7) should be resolved (unchanged, still deferred).
11. What "actual outcome" linkage looks like when eventually built
    (unchanged from P0-E2-S7).
12. Whether `CreateScenarioForm`'s field-visibility logic should move
    server-side (unchanged from P0-E2-S7).
13. Should the manual reporting-rate UI eventually support recording an
    inverse-direction rate (unchanged from P0-E3-S1A).
14. Should a future live FX provider need a source-preference order
    against manual rates (unchanged from P0-E3-S1A).
15. **New**: when is real browser/device QA performed for Home (and for
    every future screen)? This phase's validation ceiling was code-level;
    a genuine pixel-level pass — ideally on real devices at the Fold-class
    320-360px end — remains open and should happen before Home is
    considered launch-ready, not just architecturally complete.
16. **New**: should the final Quick Add flow (explicitly deferred this
    phase) be a dedicated route, a modal over Home, or an extension of
    `/money`'s existing forms? The current `/money#record-money` routing
    is a placeholder-appropriate interim, not a design decision.
17. **New**: now that Home surfaces Focus Goal/active Decisions as "Your
    Moves," should Goals or Decisions' own screens eventually let a user
    set/change the focus goal or archive a decision directly from Home,
    or should Home remain strictly read-only navigation-only (current
    behavior, per this phase's explicit read-only requirement)?

## Risks

1. No production traffic has touched the remote Monatriq Dev project yet
   (unchanged risk).
2. **New, the most significant risk of this phase**: Home has not been
   visually verified in a real browser at all — no confirmation that
   Light mode, Dark mode, System resolution, the 320-430px viewport
   range, or actual touch-target rendering behave as designed beyond what
   static code/CSS inspection can prove. This should be the first thing
   validated with real tooling (or by the user, in a real browser) before
   treating Home as production-ready rather than architecturally
   complete.
3. The local-vs-remote RLS-testing policy remains unsettled across ten
   phases now.
4. `financial_position_by_currency()`'s `union`-based currency-discovery
   CTE (P0-E3-S1) is unaffected by this phase but remains an open
   maintenance trap for a future domain #9 (unchanged).
5. A manual reporting rate has no expiry/staleness indicator beyond
   `rate_as_of` (unchanged from P0-E3-S1A) — Home's Reporting Position
   panel (P0-E3-S1A) already surfaces `rate_as_of`, but nothing
   proactively warns about staleness yet.
6. **New**: `components/home/*` were built against ONE approved reference
   (`docs/reference/01-home/`) interpreted through the Visual
   Constitution — as the only screen built so far, there is no
   cross-screen consistency check yet (e.g. does Money's eventual
   redesign feel like the same product as Home). Worth a deliberate pass
   once more screens exist.

## Next approved step

Do not begin automatically. Decisions production UI is explicitly NOT
started (restated across every prior Assets phase, including
P0-E4-S2/P0-E4-S2A). Offers remains unimplemented (no canonical model,
deliberately deferred). Both previously-pending migrations
(`20260930090000_restrict_asset_status_to_vehicle.sql` (P0-E3-S4R) and
`20261001090000_create_asset_disposition_domain.sql` (P0-E4-S1)) are
now confirmed synchronized to Monatriq Dev (P0-E4-S2A, manual terminal
verification) — this is no longer an outstanding blocker. P0-E4-S2/
P0-E4-S2A stop for manual browser review per their own phase
instruction — the wording/progressive-disclosure changes are
presentation-only and have not yet been visually verified in a real
browser. Recommended next step (pending user review): (a) manual
browser review of P0-E4-S2/P0-E4-S2A's changes across Light/Dark/System
and 320-430px+ viewports, including the MoreDetails touch-target fix
and Vehicle's now-neutral default card, (b) real browser/device QA
across Home, Money, and Assets (including the Sell Asset flow) before
building further UI on an unverified visual foundation, (c) an Offers
domain phase — the smallest remaining Assets capability gap — or (d)
continuing the production-UI rollout to Decisions — or the user's own
priority.
