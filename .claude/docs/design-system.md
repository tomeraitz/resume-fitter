# Design System — "Warm Editorial"

> All UI components in the extension MUST follow these rules. This is the single source of truth for visual design.

---

## Aesthetic Direction

**Warm Editorial** — refined, trustworthy, premium. The overlay feels like a quiet, competent assistant. Never cold SaaS, never playful/gamified.

- Generous whitespace over density
- Subtle glass-morphism on floating surfaces
- Tight typographic hierarchy with clear visual weight
- Warm neutrals with a single amber accent

---

## Fonts

| Role | Family | Weights | Source |
|---|---|---|---|
| Display / headings | **Instrument Serif** | 400 (regular) | Google Fonts |
| Body / UI text | **DM Sans** | 400, 500, 600, 700 | Google Fonts |

**Rules:**
- NEVER use Inter, Roboto, Arial, or system-ui as visible text — only as fallback
- Headings: `font-display` (Instrument Serif) — use for overlay title, section labels, score displays
- Body: `font-body` (DM Sans) — use for all other text
- Minimum body text size: `text-base` (14px) inside the overlay

---

## Color Palette

All colors are defined as CSS custom properties in `extension/assets/design-tokens.css` and mapped in `extension/tailwind.config.ts`.

### Surface (warm neutrals)
| Token | Hex | Use |
|---|---|---|
| `surface-50` | #FAF8F5 | Overlay background, glass fill |
| `surface-100` | #F3F0EB | Card backgrounds, hover states |
| `surface-200` | #E8E4DD | Borders, dividers |
| `surface-300` | #D4CFC6 | Disabled text, subtle borders |
| `surface-500` | #8E877C | Secondary text, labels |
| `surface-700` | #4A453D | Body text |
| `surface-900` | #1C1915 | Primary text, headings |

### Accent (amber/gold)
| Token | Hex | Use |
|---|---|---|
| `accent-50` | #FFF8ED | Accent background tint |
| `accent-400` | #F5A623 | Primary accent — buttons, progress, links |
| `accent-500` | #E08D0D | Hover state for accent |
| `accent-700` | #96560A | Active / pressed accent |

### Semantic
| Token | Hex | Use |
|---|---|---|
| `success-500` | #22C55E | Pipeline complete, good ATS score |
| `error-500` | #DC4A68 | Errors, failed steps (muted rose, not harsh red) |
| `warning-500` | #F59E0B | Warnings, flagged claims |

**Rules:**
- NEVER use raw hex values — always reference Tailwind classes (`text-surface-900`, `bg-accent-400`)
- The accent color is used sparingly: CTAs, active progress step, score highlights
- Backgrounds use `surface-50` or the glassmorphism variable

---

## Spacing

4px base grid. Use Tailwind spacing scale:

| Class | Value | Common use |
|---|---|---|
| `p-2` / `gap-2` | 8px | Tight internal padding |
| `p-3` / `gap-3` | 12px | Default component padding |
| `p-4` / `gap-4` | 16px | Section padding |
| `p-6` / `gap-6` | 24px | Overlay body padding |
| `p-8` | 32px | Large section spacing |

**Rules:**
- Prefer `gap` over margin for flex/grid layouts
- Overlay panel: `p-5` or `p-6` body padding
- Between sections: `gap-4` minimum

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 6px | Small elements (badges, tags) |
| `rounded` / `rounded-md` | 10px | Cards, inputs, buttons |
| `rounded-lg` | 14px | Overlay panel |
| `rounded-xl` | 20px | Large containers |
| `rounded-full` | 9999px | Avatars, pills |

---

## Shadows

| Class | Use |
|---|---|
| `shadow-overlay` | Main floating overlay panel |
| `shadow-card` | Cards inside the overlay |
| `shadow-button` | Elevated buttons |
| `shadow-glow` | Accent glow effect (use sparingly) |

---

## Glassmorphism (Overlay Panel)

The main overlay uses a frosted glass effect:

```css
background: var(--rf-glass-bg);        /* rgba(250, 248, 245, 0.82) */
border: 1px solid var(--rf-glass-border); /* rgba(212, 207, 198, 0.45) */
backdrop-filter: blur(var(--rf-glass-blur)); /* 20px */
```

Apply via utility classes or inline where needed.

---

## Animations

| Class | Duration | Use |
|---|---|---|
| `animate-fade-in` | 300ms | Generic fade entrance |
| `animate-slide-up` | 350ms | Overlay panel entrance |
| `animate-slide-down` | 300ms | Dropdown / collapse |
| `animate-scale-in` | 200ms | Buttons, badges appearing |
| `animate-pulse-soft` | 2s loop | Loading / in-progress indicator |
| `animate-progress` | 1.5s loop | Progress bar fill |

**Rules:**
- Entrance animations on mount only — not on every re-render
- Use `animation-delay` for staggered reveals (e.g. progress steps)
- Prefer CSS transitions (`var(--rf-transition-fast)`) for hover/focus states

---

## Component Patterns

### Overlay Panel
- Position: fixed, bottom-right corner with 16px margin
- Width: 380px (collapsible)
- Max height: 520px with scroll
- Glass background + `shadow-overlay` + `rounded-lg`
- Header: extension name in `font-display`, collapse/close buttons
- Body: scrollable content area with `p-5`

### Buttons
- Primary: `bg-accent-400 text-surface-900 font-body font-semibold rounded-md shadow-button`
- Secondary: `bg-surface-100 text-surface-700 border border-surface-200 rounded-md`
- Ghost: `text-surface-600 hover:bg-surface-100 rounded-md`
- All buttons: `text-sm px-4 py-2` default size, `transition-all var(--rf-transition-fast)`

### Progress Steps
- Vertical stepper layout
- Active step: accent-400 indicator + `font-semibold`
- Completed step: success-500 check icon
- Pending step: surface-300 muted

### Badges / Scores
- Pill shape: `rounded-full px-3 py-1 text-xs font-semibold`
- ATS score ≥ 80: `bg-success-50 text-success-700`
- ATS score 60–79: `bg-warning-50 text-warning-700`
- ATS score < 60: `bg-error-50 text-error-700`

---

## Z-Index

The overlay lives at the highest z-index to float above any website:

| Layer | Value |
|---|---|
| Overlay panel | `2147483640` |
| Modal / dialog | `2147483645` |
| Tooltip | `2147483647` |

---

## File References

| File | Purpose |
|---|---|
| `extension/assets/design-tokens.css` | CSS custom properties (source of truth for values) |
| `extension/tailwind.config.ts` | Tailwind theme mapping to CSS vars |
| `.claude/rules/design-system.md` | This file — design rules & documentation |
