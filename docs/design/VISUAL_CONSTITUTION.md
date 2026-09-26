# Monitriq — Visual Constitution

Status: Canonical. Established P0-E1-S1. Governs future UI implementation
phases. No screens were built in that phase.

**Implementation status (P0-E3-S2):** Home is the first production screen
built against this document. Light mode (§4-5) and the theme foundation
(Light/Dark/System, via `next-themes`) are now implemented —
`docs/architecture/SYSTEM_ARCHITECTURE.md §9` documents the mechanism;
this document's own color/typography/surface/motion rules were not
changed to build it, only wired into a token layer as §10 already
anticipated. The approved design reference for Home lives at
`docs/reference/01-home/` — see the P0-E3-S2 report for how it was
audited against Stitch-vs-Monitriq authority (functional architecture
wins, then the approved PNG, then the HTML/MD as structural/supporting
reference only).

## 1. Identity stance

Expressive identity. Quiet interface.

Monitriq must not look like a generic AI-generated fintech app. Stitch
mockups (when supplied later) are a visual reference for layout, hierarchy,
component behavior, information density, and interaction intent only —
they are never production HTML and must never be pasted directly into the
app. They also never define database architecture, financial calculations,
security architecture, or hardcoded data.

## 2. Brand pack

The canonical brand pack is at
[docs/reference/brand/](../reference/brand/) — `BRAND.md`, `brand-tokens.css`,
SVG/PNG assets. It is not modified in this or any planning phase. Core
palette (from the brand pack, for reference — the CSS variables in
`brand-tokens.css` are the source of truth):

| Token | Hex |
|---|---|
| Midnight Navy | `#0B1F3B` |
| Obsidian | `#071820` |
| Deep Teal | `#0E6F62` |
| Electric Teal | `#00D1B2` |
| Cool Aqua | `#7EE3E0` |
| Deep Blue | `#0A5EA8` |
| Warm Off-White | `#F8F7F2` |
| Mist Grey | `#D8DEE4` |
| Ink | `#0B172A` |

The brand gradient (`--monitriq-gradient-mark`) belongs to the logo mark,
app icon, and occasional brand moments — it is not a default UI treatment
(see §5).

## 3. Typography

- UI family: **IBM Plex Sans** — one disciplined family, not a mix of
  fashionable SaaS fonts.
- Financial figures use `font-variant-numeric: tabular-nums lining-nums;`
  so amounts align in tables and lists.
- Hierarchy is built with weight, size, spacing, line height, and contrast
  — not by switching typefaces. Uppercase tracking is used sparingly.

## 4. Surfaces and cards

Cards are used only where information grouping genuinely requires them.
Prefer spacing, alignment, dividers, and typographic hierarchy before
reaching for another card ("nested-card syndrome" is explicitly avoided).

Suggested radii:
- Primary cards: ~12–16px
- Smaller controls: ~8–12px

Not every control is pill-shaped.

## 5. Color semantics

- **Teal / aqua** — primary actions, selected navigation, positive cash
  movement, interactive focus.
- **Amber** — attention, capital deployment, financial caution.
- **Coral / red** — actual losses, serious rule conflicts, overdue items,
  destructive actions.
- Neutral information stays neutral. Not everything positive is green by
  default — color is reserved for the semantics above.

**Approved semantic UI colors** (established P0-E2-S1):

| Token | Hex | Meaning |
|---|---|---|
| `--color-attention` | `#D98E2B` | Attention, capital deployment, financial caution |
| `--color-danger` | `#E5484D` | Losses, serious rule conflicts, overdue items, destructive actions |

These are **application-state colors, not brand colors** — they are not in
`docs/reference/brand/BRAND.md`'s core palette (§2) and must never be added
to it or treated as brand identity. They exist only to satisfy the amber/
coral semantics this section requires, are used only where those meanings
apply, and live in `lib/styles/tokens.css` alongside (not merged into) the
brand tokens imported from the canonical brand pack.

Gradients are not the default for buttons, cards, navigation, forms,
badges, page backgrounds, or text. They belong to the logo mark, app icon,
and occasional deliberate brand moments only.

## 6. Explicitly avoided aesthetics

AI glow / constant cyan halos, glassmorphism everywhere, gradient text,
giant pill controls, excessive rounded cards, generic sparkle icons, 3D
decorative icons, crypto aesthetics, fake charts, over-animation.

## 7. Motion

Animation clarifies state changes only: drawer transitions, number
transitions, progress updates, confirmations. Avoided: continuous floating
motion, animated gradient backgrounds, pulsing primary buttons, decorative
entrance choreography.

## 8. Copy voice

Direct, human, financial language. Avoided: "Unlock your financial
potential," "Supercharge your wealth," "AI-powered insights," "Intelligent
financial engine," "Revolutionize your finances," "Your journey starts
here."

Preferred vocabulary: Money In, Money Out, Net Cash Change, Current Value,
Amount Remaining, Target Date, Review Decision, Money You're Owed, No
activity yet, Not configured — matching the missing-information states
defined in
[FINANCIAL_DOMAIN_MODEL.md](../architecture/FINANCIAL_DOMAIN_MODEL.md).

"Cost Basis" remains correct terminology in the schema, domain layer, and
advanced/detail UI — see §9 below for where default consumer-facing copy
now prefers "Amount Invested" / "What You Paid" instead.

## 9. Progressive disclosure / financial language

Established P0-E4-S2. Extends §8's copy voice with how the same financial
fact is worded differently depending on how deep into a screen the user is.

- **Default (primary) copy** uses plain consumer language: "What You Paid" /
  "Amount Invested" rather than "Cost Basis"; "Current Value" rather than
  "Current Value Estimate"; "Quick-Sale Estimate" rather than "Conservative
  Quick-Sale Value"; "Target" rather than "Target Value"; "Sale Price"
  rather than "Gross Proceeds"; "Money Received After Costs" rather than
  "Net Proceeds"; "Profit / Loss on Sale" rather than "Realised Gain/Loss";
  "Sale History" rather than "Asset Disposition".
- **Advanced/detail copy** — reached through the single standardized
  disclosure control, labeled "More details" (component:
  `components/ui/MoreDetails.tsx`) — may use the precise domain term (Gross
  Proceeds, Cost Basis, Capital Returned) when the primary-layer plain term
  would otherwise need a footnote to stay accurate.
- One disclosure phrase is used everywhere a screen needs to hide
  optional/secondary financial detail. Screens must not invent their own
  "Advanced" / "Details" / "Show extras" variants.
- Renaming a label never changes which value it displays, how that value is
  calculated, or which currency it is denominated in. A renamed field reads
  from exactly the same domain data as before the rename.
- Per-asset-type card and form labels are centralized, not hardcoded per
  component — see `assetCapabilities()` / `assetCreationConfig()` /
  `assetDisplayConfig()` in
  [FINANCIAL_DOMAIN_MODEL.md](../architecture/FINANCIAL_DOMAIN_MODEL.md).
- Simplification never fabricates a fact: a gain/loss, quick-sale sum, or
  recovered amount is shown in plain language only when the underlying
  values genuinely exist; otherwise the UI says "Not calculated" / "Not
  set", never a guessed figure.

See [PRODUCT_DEFINITION.md §9](../product/PRODUCT_DEFINITION.md) for the
product-level statement of this principle.

## 10. Design reference handoff

A curated, final design-reference set (Stitch or otherwise) will be
supplied later during UI implementation phases. Historical/obsolete
prototype exports are not required for this planning phase and must not be
combined with whatever curated set is eventually approved. When references
are supplied, only explicitly approved ones are used.

## 11. Relationship to implementation

This document governs layout and styling decisions in future phases. It
does not itself specify component code, a design-token file, or a Tailwind
config — that wiring (e.g. mapping `brand-tokens.css` into the app's token
layer) is implementation work for a later phase, informed by
[SYSTEM_ARCHITECTURE.md §7](../architecture/SYSTEM_ARCHITECTURE.md#7-brand-asset-placement).
