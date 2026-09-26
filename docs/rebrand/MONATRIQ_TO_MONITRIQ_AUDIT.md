# Monatriq → Monitriq — Rebrand Audit Inventory (P0-E3-S1B)

Created BEFORE any rebrand edit. Scope: every tracked or untracked-not-ignored file
in the repository (289 files, excluding the supplied Monitriq brand pack directory
`docs/reference/monitriq brand/`, which is new source material). `node_modules`,
`.next` and caches excluded (searched separately after implementation).

Search: case-insensitive `monatriq` (covers Monatriq / monatriq / MONATRIQ).

## Totals

- Files containing the old name (content): **101** files, **392** matching lines
- Filenames containing the old name: **24** (10 in `public/brand/`+ 14 in `docs/reference/brand/png|svg`)
- Repo baseline before edits: 571/571 tests (12 suites, fresh local `supabase db reset`), lint, app typecheck, harness typecheck, build all clean.
- Migration baseline: 16 migration files; SHA-1 checksums captured; `git status supabase/migrations` clean.

## Classification legend

A = RENAME (current product identity) · B = RENAME (safe technical brand identifier) ·
C = PRESERVE (historical record) · D = PRESERVE (stable infrastructure / identity / path) ·
E = REVIEW REQUIRED

## Group totals

| Group | Files | Lines | Class | Decision |
|---|---:|---:|---|---|
| App/components/site config (`app/**`, `components/**`, `lib/config/site.ts`) | 29 | 45 | A | Rename every occurrence (UI strings + doc comments in current UI code). One mixed item below. |
| `lib/domain/decisions/presentation.ts:519` | 1 | 1 | A | User-facing copy string inside a presentation function ("before Monatriq can calculate this"). Renamed; the ONE test assertion that pins this exact copy string is updated. No formula/repository change. |
| `lib/domain/{rules/types.ts, assets/category-meta.ts, assets/capabilities.ts}` | 3 | 3 | C/D | PRESERVE — code comments in financial-domain files; invariance goal is zero `lib/domain` change beyond the single copy string above. |
| CSS tokens (`lib/styles/tokens.css`, `app/globals.css`, `docs/reference/brand/brand-tokens.css`) | 3 | 36 | B | Rename custom-property prefix `--monatriq-*` → `--monitriq-*`. Values unchanged. All references live in these 3 files (verified). |
| Package identity (`package.json`, `package-lock.json`) | 2 | 3 | B | Rename `name` fields only. No dependency/version change. |
| Living docs (PRODUCT_DEFINITION, FINANCIAL_DOMAIN_MODEL, MULTI_CURRENCY_MODEL, SECURITY_AND_RLS_PRINCIPLES, SYSTEM_ARCHITECTURE, VISUAL_CONSTITUTION) | 6 | 29 | A | Rename present-day product references. Exceptions (D): `/Users/datamatics/Monatriq` path (SECURITY:106), directory-tree root `Monatriq/` (SYSTEM_ARCHITECTURE:21). PRODUCT_DEFINITION §1 rewritten to state Monitriq + concise historical note. |
| `docs/reference/brand/BRAND.md` | 1 | 11 | A | Current canonical brand doc → Monitriq, document actual new asset filenames, one historical note. |
| `docs/reference/brand/manifest.json` + `png/` + `svg/` (former-name artwork) | 1 (+14 filenames) | 17 | C | ARCHIVED reference of the former Monatriq artwork pack; retained unmodified. BRAND.md marks it archived. |
| `docs/project/BUILD_STATE.md` | 1 | 31 | A/C/D | Title (line 1) → Monitriq. New rebrand phase section added. Phase narratives written under the former name are historical (C); `Monatriq Dev`, `supabase_db_Monatriq`, `"monatriq's Project"` are infrastructure names (D). |
| `docs/reports/*` (21 reports) | 21 | 175 | C | PRESERVE — implementation evidence written when the product was named Monatriq. Includes the in-progress `P0-E4-S3-decisions-production-ui.txt` (all its content was authored under the former name). New reports use MONITRIQ. |
| `supabase/migrations/*` (16 files) | 16 | 21 | D | PRESERVE — deployed/immutable. 20 are SQL `--` comments. **1 is executable schema metadata**: `20260924100000_create_decisions_domain.sql:425` is a `COMMENT ON` string stored in the database catalog ("What information did Monatriq use…"). It is not rendered by any product surface (not product presentation), so per §5 this is not a STOP condition; a change would require a migration, which is prohibited. Deferred (see Deferred). |
| `supabase/tests/**` (15 files) | 15 | 17 | C/D | PRESERVE — test comments/descriptions and harness identity. `FIXTURE_EMAIL_DOMAIN = "monatriq.test"` (fixtures.ts:7) is a fixture-user identity used to clean up leftover local test users; renaming would orphan prior fixtures. Exception: the single presentation-copy assertion pinned to presentation.ts:519 (see above). |
| `supabase/config.toml` (`project_id = "Monatriq"`) | 1 | 1 | D | PRESERVE — local Docker project identity (containers `supabase_db_Monatriq`, volumes). Renaming orphans the local stack. Not the remote ref. |
| `.env.example` | 1 | 2 | A/D | Line 1 (prose "Monatriq uses TWO env files") → A rename. Line 9 `"Monatriq Dev"` is the Supabase dashboard project display name → D preserve. |
| `next.config.ts:4` comment | 1 | 1 | D | Literally describes the repo folder (`/Users/datamatics/Monatriq`), which is deliberately not renamed this phase. |
| `public/brand/monatriq-*` (8 files) + `favicon.svg`, `apple-touch-icon.png` | 10 | — | B | Old production artwork REMOVED from `public/brand/` and replaced with approved Monitriq pack files (used directly). The old files remain in git history and in `docs/reference/brand/` (archive). |

## A/B changes — exact list (per-occurrence)

Code / config (all occurrences reviewed individually; each is plain product-name usage):

- `lib/config/site.ts:2` name → Monitriq (drives page title, title template, manifest name & short_name)
- `app/manifest.ts:14-15` icon srcs → `/brand/monitriq-app-icon-192.png`, `-512.png`
- `app/layout.tsx:22-23` icons → pack `favicon-32.png` / `favicon-64.png`; apple icon → pack `monitriq-app-icon-192.png` (pack ships no apple-touch-icon file and no favicon.svg — supplied files used as-is, nothing resized/derived)
- `components/brand/BrandLogo.tsx` — asset refs, alt text, doc comment; typed-text wordmark REMOVED and replaced by the supplied horizontal logo files (rule: never type the wordmark)
- `components/layout/HeaderBrand.tsx:38,47,52` (comment, aria-label "Monitriq Home", eyebrow text)
- `components/home/GreetingHeader.tsx:16,33`, `NewUserSetup.tsx:21,31,54`
- `components/layout/ConfigurationNotice.tsx:15`
- `app/(auth)/login/page.tsx:44`, `app/(auth)/signup/page.tsx:56` (AuthCard descriptions)
- `app/(app)/money/page.tsx:28,34,80`, `home/page.tsx:24`, `assets/page.tsx:19`, `rules/page.tsx:16,69`, `decisions/page.tsx:14`
- `components/quick-add/MoveMoneyForm.tsx:22,160`, `QuickAddProvider.tsx:98`
- `components/rules/{SafeToDeployCard:19, MinimumCashSection:180, CommitmentsSection:55}.tsx`
- `components/decisions/DecisionReviewSheet.tsx:343,500`
- `components/home/{YourMovesSection:22,44, RecentActivityPreview:54, GoalsSection:71, PositionSection:60, CapitalDistributionSection:82}.tsx`
- `components/assets/{AssetActionSheet:25, AssetCard:52}.tsx`, `components/ui/MoreDetails.tsx:14`
- `lib/domain/decisions/presentation.ts:519` (+ test assertion string, see above)
- `package.json:2`, `package-lock.json` (2 `name` lines)
- CSS vars: `lib/styles/tokens.css` (25), `docs/reference/brand/brand-tokens.css` (10), `app/globals.css:4` comment

## E — Review required

None outstanding. Items considered and resolved: the `COMMENT ON` catalog string (D, no product presentation), `project_id` (D), fixture email domain (D).

## Deferred infrastructure (not part of this phase)

- Repository directory `/Users/datamatics/Monatriq` (not renamed)
- Supabase dashboard project name "Monatriq Dev" / "monatriq's Project" (ref `mvnwrkfcszazqqccmmxq` unchanged)
- `supabase/config.toml` `project_id` and local Docker container/volume names
- Test fixture email domain `monatriq.test`
- DB catalog `COMMENT ON` text in the decisions-domain migration
