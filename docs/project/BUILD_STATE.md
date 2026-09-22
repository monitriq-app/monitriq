# Monatriq — Build State

Canonical implementation checkpoint. Updated at the end of every phase.
Do not mark future phases complete ahead of time.

## Current phase

P0-E1-S2 — Application Foundation, Secure Auth Shell & Brand Integration.

## Current status

**Complete.** Application infrastructure only — no financial features,
financial database schema, or final Home dashboard were implemented.

## Completed work

- Verified the git repository root is `/Users/datamatics/Monatriq` (the
  P0-E1-S1 home-directory-root risk has been resolved outside this phase).
- Scaffolded a Next.js 16 (App Router) + TypeScript (strict) + Tailwind v4
  application directly in the repository root, alongside the existing
  `docs/`.
- Copied production brand assets (logo, mark, app icons, favicon) from
  `docs/reference/brand/` into `public/brand/`; canonical originals
  untouched.
- Built a two-layer design-token system: brand tokens (imported directly
  from the canonical `docs/reference/brand/brand-tokens.css`, never
  duplicated by hand) mapped onto semantic UI tokens
  (`lib/styles/tokens.css`) via Tailwind v4's `@theme`.
- Wired IBM Plex Sans via `next/font/google`, plus a `tabular-figures`
  utility for financial numerals.
- Built Supabase client architecture: separate browser client
  (`lib/supabase/client.ts`), server client (`lib/supabase/server.ts`),
  and a session-refresh helper (`lib/supabase/session.ts`) used by
  `proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`).
- Built a minimal auth shell: `/login`, `/signup`, `/forgot-password`,
  `/update-password`, and `/auth/callback` (code-exchange route handler for
  email verification and password recovery links).
- Established the authenticated route boundary: `app/(app)/layout.tsx`
  redirects to `/login` when there is no session, then renders a minimal
  placeholder `/home` inside `AppShell`. Documented in-code that this is a
  UX boundary, not the security boundary (RLS is).
- Base component primitives: `BrandLogo`, `AppShell`, `PageContainer`,
  `Button`, `Input`, `FormField`, `AuthCard`, `SignOutButton`,
  `ConfigurationNotice`.
- PWA foundation: `app/manifest.ts` (dynamic manifest using brand icons),
  icon/apple-touch-icon metadata in the root layout. No service worker or
  offline data caching implemented.
- `.env.example` created (public URL/anon key placeholders only; no
  service-role placeholder — nothing in this phase uses it).
- `lib/config/env.ts` reads Supabase env lazily and throws a clear,
  actionable error only when a caller actually needs a client — so the app
  builds and the public landing page renders a controlled "Not configured"
  state even with no Supabase project connected.
- Full validation passed: `npm install`, `tsc --noEmit`, `eslint .`, and
  `next build` all clean with zero errors/warnings; smoke-tested every
  route with `next dev`.
- `docs/reports/P0-E1-S2-application-foundation-auth-shell.txt` written.

## Architecture changes

- Repository root now contains a live Next.js app (`app/`, `components/`,
  `lib/`, `public/`) alongside `docs/`, per
  `docs/architecture/SYSTEM_ARCHITECTURE.md §2`.
- `lib/domain/`, `types/`, and `supabase/` (migrations/tests) were
  deliberately **not** created this phase — nothing exists yet to put in
  them. They're created in the data-layer phase that actually needs them.
- Package manager: npm (only mainstream package manager available in this
  environment; documented here since none was previously configured).
- A bug was found and fixed during this phase's own validation: an early
  version of `app/(app)/layout.tsx` tried to gate on Supabase configuration
  by returning alternate JSX instead of calling `redirect()`. Next.js can
  render a layout and the page segment it wraps concurrently, so the
  nested page still executed (and threw) even though its output was
  discarded. Fixed by having `getCurrentUser()` return `null` (instead of
  throwing) when unconfigured, and moving the "Not configured" state to
  the public landing page, which has no nested child segment to race
  against. See the phase report §17 (validation results) for the
  discovery trace.

## Known limitations

- No real Supabase project is connected. `.env.local` was not created (no
  real credentials exist to put in it). The app degrades to a "Not
  configured" state on the public landing page rather than crashing.
- No production profile table exists; `/home`'s "Welcome, {name}" reads
  `user_metadata.preferred_name` off the Supabase Auth user as a temporary
  placeholder, falling back to email, then "there". This is not the
  Profile domain and must not be treated as one.
- `--color-attention` (amber) and `--color-danger` (coral/red) in
  `lib/styles/tokens.css` are **not** part of the canonical brand pack
  (`docs/reference/brand/BRAND.md` defines no amber or red). They are a
  restrained placeholder chosen to read correctly against the existing
  navy/teal palette and need real brand confirmation — see Open Questions.
- Light mode is not implemented; tokens are structured so a future
  `[data-theme="light"]` override block could redefine them later.
- No automated tests exist yet (none were justified at this phase; no
  domain logic exists to test).

## Current setup requirements

To actually run the app against a real backend: copy `.env.example` to
`.env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` from a Supabase project, then `npm install`
(if not already run) and `npm run dev`. No Supabase project has been
provisioned as part of this phase.

## Open questions

1. Exact Supabase schema/table definitions — still deferred to the
   data-layer implementation phase (unchanged from P0-E1-S1).
2. Whether "Businesses" is first-class or folded into Assets/Recurring
   Income (unchanged from P0-E1-S1).
3. Exact "Safe to Deploy" formula inputs (unchanged from P0-E1-S1).
4. Timing of the curated final Stitch/design-reference set (unchanged from
   P0-E1-S1).
5. Supabase project/environment provisioning has still not happened.
6. **New:** `--color-attention` and `--color-danger` token values need
   confirmation against real Monatriq brand guidance — they were invented
   for this phase, restrained but not brand-approved.
7. **New:** Should `AGENTS.md`/`CLAUDE.md` (auto-generated by Next.js 16's
   `next dev` on every run, per its own embedded comment) be committed? They
   are currently untracked; keeping them tracked avoids repeated diff noise
   but they contain framework-generated guidance, not project decisions.

## Risks

1. No RLS/isolation test infrastructure exists yet because no schema
   exists yet — must be established alongside, not after, the first
   data-layer phase (per `docs/security/SECURITY_AND_RLS_PRINCIPLES.md`).
2. The amber/danger color gap (see Known Limitations) could visually ship
   as "the brand" if not corrected before real UI work begins.
3. No real Supabase project means the auth flows (`signUp`, `signIn`,
   password recovery) are implemented but unverified end-to-end against a
   live backend — only build/render-time correctness was validated this
   phase.

## Next approved step

Do not begin automatically. Recommended next phase (pending user review):
**P0-E2-S1 — Supabase project provisioning & schema/RLS design** for the
Profile domain first (since Home/AppShell already anticipate profile data),
followed by Money/Assets, built directly from `FINANCIAL_DOMAIN_MODEL.md`
and `SECURITY_AND_RLS_PRINCIPLES.md`, including the mandatory isolation
test suite.
