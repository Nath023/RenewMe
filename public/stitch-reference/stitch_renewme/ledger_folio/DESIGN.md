---
name: Ledger & Folio
colors:
  surface: '#fdf9f3'
  surface-dim: '#ded9d4'
  surface-bright: '#fdf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f3ed'
  surface-container: '#f2ede8'
  surface-container-high: '#ece7e2'
  surface-container-highest: '#e6e2dd'
  on-surface: '#1c1b18'
  on-surface-variant: '#414944'
  inverse-surface: '#32302d'
  inverse-on-surface: '#f5f0eb'
  outline: '#717973'
  outline-variant: '#c0c9c2'
  surface-tint: '#3a6753'
  primary: '#023625'
  on-primary: '#ffffff'
  primary-container: '#1f4d3a'
  on-primary-container: '#8dbda4'
  inverse-primary: '#a1d1b8'
  secondary: '#a73826'
  on-secondary: '#ffffff'
  secondary-container: '#fe7860'
  on-secondary-container: '#701004'
  tertiary: '#4c2121'
  on-tertiary: '#ffffff'
  tertiary-container: '#673736'
  on-tertiary-container: '#e3a29f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#bceed3'
  primary-fixed-dim: '#a1d1b8'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#214f3c'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a6'
  on-secondary-fixed: '#3f0300'
  on-secondary-fixed-variant: '#862112'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#fab5b3'
  on-tertiary-fixed: '#350f0f'
  on-tertiary-fixed-variant: '#693938'
  background: '#fdf9f3'
  on-background: '#1c1b18'
  surface-variant: '#e6e2dd'
typography:
  display-lg:
    fontFamily: Newsreader
    fontSize: 44px
    fontWeight: '400'
    lineHeight: 52px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 38px
    letterSpacing: -0.01em
  display-md:
    fontFamily: Newsreader
    fontSize: 30px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: -0.015em
  display-sm:
    fontFamily: Newsreader
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  ledger-amount-lg:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.01em
  ledger-amount-sm:
    fontFamily: Newsreader
    fontSize: 17px
    fontWeight: '500'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-ledger:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.06em
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.875rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system translates the discipline, permanence, and tactile precision of physical paper ledgers, bound folio journals, and double-entry accounting books into a digital workspace for small business operators. 

The visual style is rooted in **tactile archival minimalism**:
- **Tone:** Plainspoken, austere, methodical, and calm. It discards decorative SaaS tropes, gamification, and hyper-saturated interface trends in favor of utilitarian clarity.
- **Atmosphere:** Evokes handling unbleached cotton rag paper, cold-pressed archival stationery, and dark fountain pen ink.
- **Interactions:** Crisp, immediate, and deliberate. Every element is aligned to a strict structural grid governed by horizontal ruling lines, resembling ruled accounting sheets.
- **Affordances:** Physical metaphors are expressed through structural ruling lines, ink-density variations, and tabular alignments rather than simulated depths, skeuomorphic bevels, or synthetic drop shadows.

## Colors

The palette is strictly restricted to an editorial two-accent ink and paper model. Gradients, glowing states, and colored fills outside this matrix are prohibited.

### Surface Roles
- **Canvas / Sheet Background:** `#F6F3EC` (Warm unbleached archival paper base).
- **Surface / Card Container:** `#FBF9F4` (Crisp pressed parchment tier).
- **Muted Surface / Alternating Row:** `#F0ECE1` (Subtle tinted ledger rule for alternate line items).
- **Hairline Rule / Border:** `#DDD8CB` (Muted ruling line defining rows, columns, and containment).

### Ink Roles
- **Primary Ink (Body & Headers):** `#1C1B18` (Near-black iron gall ink with high legibility).
- **Secondary Ink (Metadata & Subtitles):** `#6B675E` (Warm slate-tinted graphite ink).
- **Tertiary Ink (Captions, Inactive Rules, Footers):** `#8A8578` (Muted pencil graphite).

### Accent Roles
- **Primary Accent (`#1F4D3A`):** Deep forest green. Applied strictly to affirmative states, active primary buttons, active ledger balance highlights, and settled payments.
- **Alert / Warning Accent (`#B3412E`):** Muted brick red. Reserved exclusively for delinquent accounts, critical renewal deadlines (≤ 48 hours), overdue dates, and cancellation markers.

## Typography

The type system balances 19th-century bookkeeper gravitas with strict modern utility.

### Type Pairing & Hierarchy
- **Headings & Financial Balances:** `Newsreader` (or serif equivalent). Evokes classical editorial broadsheets, traditional bookkeeping ledgers, and formal folios. Display sizes feature optical optical weight and character.
- **Operational UI & Information Delivery:** `Inter`. A clean, modern grotesque configured for dense informational hierarchies.
- **Ledger Metadata, Dual Currencies, & Column Labels:** `JetBrains Mono`. Monospaced utility for code-like precision in ledger tables, timestamps, and secondary conversions.

### Tabular Figures & Numerals
- All numbers, values, and currencies must enforce `font-variant-numeric: tabular-nums lining-nums`. Under no circumstances should proportional figures be used in ledger grids, renewal dates, or monetary sums.
- **Dual Currency Standards:** Dual amounts must be rendered inline or stacked with exact visual anchoring: primary in tabular serif or grotesk, followed by equivalent in secondary ink (e.g., `$12.00 / mo ≈ ₦18,600`).
- **Date Formatting:** Dates must follow standard accounting shorthand: `ddd DD MMM` (e.g., `Thu 12 Nov`).

## Layout & Spacing

The layout model simulates bound ruled leaves with asymmetrical columns, tabular margins, and structural lines:

### Grid & Density
- **Desktop (1024px+):** Asymmetrical 12-column layout. Typically an 8-column primary journal/ledger sheet paired with a 4-column audit/summary rail. Margins are fixed at `2.5rem`, gutters at `1.5rem`.
- **Tablet (768px - 1023px):** 8-column layout. Secondary rail collapses below the primary register or docks as an accordion summary.
- **Mobile (< 768px):** 4-column compact ledger. Edge margins compress to `1rem`. Table cells shift from multi-column rows into split two-line items demarcated by horizontal hairline rules.

### Spacing Principles
- Density is deliberately compact (`space-xs` and `space-sm` dominate rows and cell interiors) to allow viewing multiple financial commitments simultaneously without scrolling.
- Elements rely on continuous hairline rules (`1px solid #DDD8CB`) rather than white space gaps to establish boundaries.

## Elevation & Depth

Visual hierarchy is established strictly via flat surface shifts and boundary lines:

- **Absolute Prohibition:** No drop shadows (`box-shadow: none`), no inner shadows, no CSS filter blurs, and no glassmorphism or backdrop blurs.
- **Surface Elevation:** Depth is achieved by placing a `#FBF9F4` card surface directly on the `#F6F3EC` paper canvas. The contrast creates immediate physical layering.
- **Structural Separation:** A continuous `1px` border in `#DDD8CB` outlines containers, headers, and individual table rows. 
- **Z-Index Layering (Modals / Drawers):** When an overlay or slide-out sheet opens, the background receives an opaque paper wash (`rgba(246, 243, 236, 0.85)`). The modal itself uses the `#FBF9F4` surface container with a `1px solid #1C1B18` double-ruled accent header.

## Shapes

The design system enforces a sharp, disciplined shape discipline that reflects trimmed cardstock and ledger paper:

- **Base Radius:** `4px` (`roundedness: 1`). Applied consistently to cards, inputs, tags, and buttons.
- **Large Radius:** Maximum `6px` for major canvas panels and slide-out ledger sheets.
- **Strict Prohibition:** Fully circular or pill-shaped buttons (`border-radius: 9999px`) are forbidden. Curves must remain crisp and minimal, never soft or bubbly.

## Components

### Buttons
- **Primary:** Background `#1F4D3A`, text `#FBF9F4`, border `1px solid #1F4D3A`, border-radius `4px`. Hover: Background `#153528`.
- **Secondary / Ledger Action:** Background `#FBF9F4`, text `#1C1B18`, border `1px solid #DDD8CB`, border-radius `4px`. Hover: Background `#F0ECE1`.
- **Destructive / Urgent:** Background `#FBF9F4`, text `#B3412E`, border `1px solid #B3412E`, border-radius `4px`. Hover: Background `#B3412E`, text `#FBF9F4`.
- **Size & Padding:** Compact height (`34px` default, `28px` dense), horizontal padding `12px`, font: `Inter`, `13px`, medium weight.

### Form Inputs & Selectors
- Background `#FBF9F4`, border `1px solid #DDD8CB`, text `#1C1B18`, border-radius `4px`.
- Active / Focus: Border `1px solid #1C1B18` with no glow ring.
- Error / Overdue: Border `1px solid #B3412E`.
- Labels: `label-ledger` styling in `JetBrains Mono`, uppercase, secondary ink `#6B675E`.

### Ledger Cards & Panels
- Background `#FBF9F4`, border `1px solid #DDD8CB`, border-radius `4px`.
- Card headers feature an internal bottom border (`1px solid #DDD8CB`) separating summary metrics from detailed rows.
- No rounded borders inside table cells; inner cells join seamlessly via shared hairline borders.

### Ledger Tables & Data Rows
- Outer boundary defined by `1px solid #DDD8CB`.
- Individual row height: `40px` (dense: `32px`).
- Horizontal divider between every row: `1px solid #DDD8CB`.
- Header row: Background `#F0ECE1`, text `#6B675E`, font `label-ledger`, uppercase.
- Currency columns: Text right-aligned with `font-variant-numeric: tabular-nums`.

### Status Indicators & Chips
- Crisp `2px` to `4px` corner tags. Never pill-shaped.
- **Active / Paid:** Background `transparent`, text `#1F4D3A`, border `1px solid #1F4D3A`.
- **Imminent / Expiring / Failed:** Background `transparent`, text `#B3412E`, border `1px solid #B3412E`.
- **Muted / Tracked:** Background `transparent`, text `#6B675E`, border `1px solid #DDD8CB`.

### Checkboxes & Toggles
- Custom square checkboxes: `14px x 14px`, border `1px solid #6B675E`, radius `2px`, background `#FBF9F4`.
- Checked state: Fill `#1F4D3A` with sharp white tick or an ink "X" mark.
- Toggles: Rectangular sliding track (sharp `2px` corners), strictly avoiding pill switches.