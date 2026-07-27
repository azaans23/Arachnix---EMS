# Design System

## Visual Theme

**Restrained monochrome.** Arachnix brand black (`#000000`) and white (`#FFFFFF`) from Figma brand guidelines, applied as a Stripe-like product UI. Light mode is the default daylight office surface; dark mode inverts to near-black canvas with silver ink.

Scene: HR admin at a bright desk mid-morning, scanning employee records; UI must stay crisp under office light. Dark mode is for late evening ops, not the brand personality.

## Color

Strategy: **Restrained** — tinted neutrals + one accent (ink black) for primary actions.

| Token | Light | Dark |
|-------|-------|------|
| canvas | `#F7F7F8` | `#0A0A0A` |
| surface | `#FFFFFF` | `#141414` |
| surface-raised | `#FFFFFF` | `#1A1A1A` |
| ink | `#0A0A0A` | `#F5F5F5` |
| muted | `#6B6B70` | `#A0A0A5` |
| border | `#E6E6E9` | `#2A2A2A` |
| accent | `#0A0A0A` | `#F5F5F5` |
| accent-fg | `#FFFFFF` | `#0A0A0A` |
| focus | `oklch(0.45 0.02 260 / 0.22)` | `oklch(0.85 0.01 260 / 0.28)` |
| danger | `#B42318` | `#F97066` |
| success | `#067647` | `#32D583` |

Accent usage ≤10%: primary buttons, active nav, focus rings. No terracotta, purple, or cream brand colors.

## Typography

- **UI / body:** Geist Sans (product clarity, Stripe-adjacent)
- **Brand display:** Arachnix wordmark asset only (XIROD from Figma). Do not use display fonts in labels, buttons, or table data.
- Scale ratio ~1.2. Body 14–16px. Labels 12–13px medium.

## Layout

- Auth: split or centered single-column form, max ~400px content width, generous whitespace
- App shell: sticky sidebar + content canvas
- Radius: 6–8px controls (product), not pill-heavy
- Borders 1px; soft elevation only on floating panels

## Motion

- 150–250ms ease-out for hover, focus, panel enter
- Page enter: short fade + 8px rise once
- Respect `prefers-reduced-motion`
- No infinite decorative floats

## Components

Buttons, inputs, nav items share one vocabulary across light/dark. Every control: default, hover, focus, disabled, loading, error.
