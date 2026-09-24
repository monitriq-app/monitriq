# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E3-S2 — Home / Command Center: Production UI, Responsive System &
Theming.

## Current status

**Complete**, with one explicitly documented limitation: no browser
automation tool was available in this environment, so pixel-level visual/
viewport/theme validation (does Light mode actually render correctly,
does 320px actually avoid overflow, are touch targets actually 48px on
screen) could not be executed and is not claimed as passed — see
"Browser validation" below and the phase report's §45. Everything that
COULD be verified without a browser (production build success in both
Supabase-configured and unconfigured modes, dev-server boot + HTTP
response inspection, compiled-CSS bundle inspection confirming the
light-mode token block and next-themes' anti-flash script are present,
and a comprehensive real-Postgres data-layer test suite covering Home's
exact dependencies) was verified and is reported as such.

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

One new migration:
`supabase/migrations/20260927090000_add_asset_value_by_type.sql`. Zero
new tables. One new function, `asset_value_by_type()` — `security
invoker`, `stable`, the same "latest `estimated_current_value`,
non-archived" subquery `asset_native_currency_totals()` (P0-E2-S3) already
uses, grouped by `(asset_type, currency_code)` instead of `currency_code`
alone. `financial_position_by_currency()` (P0-E3-S1) is completely
untouched. Applied cleanly on all three resets this phase.

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

Do not begin automatically. Home / Money / Quick Add redesign is
explicitly NOT started. Recommended next phase (pending user review):
either (a) real browser/device QA of Home before building further UI on
an unverified visual foundation, or (b) continuing the production-UI
rollout to Money (which already has the domain layer and would reuse the
exact same AppShell/theme/responsive foundation this phase established)
— or the user's own priority.
