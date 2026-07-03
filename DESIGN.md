# Baby Food Cube Design System

## 1. Atmosphere & Identity

A calm kitchen command center for caregivers. The interface should feel precise enough for inventory work, but warm enough for baby-food planning. The signature is a warm ledger: compact status tiles, gentle paper-like surfaces, and clear shortage signals that make the next action obvious on a phone.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/canvas | `--color-canvas` | `#f7f6f0` | `#141511` | Page background |
| Surface/band | `--color-canvas-2` | `#edf3ee` | `#1b211d` | Subtle background bands |
| Surface/primary | `--color-surface` | `#ffffff` | `#20211d` | Cards, forms |
| Surface/raised | `--color-surface-raised` | `#fbfaf7` | `#292a25` | Elevated tools |
| Text/primary | `--color-ink` | `#1f2933` | `#f7f8f3` | Headings and body |
| Text/secondary | `--color-muted` | `#66717c` | `#c9cec4` | Supporting copy |
| Text/tertiary | `--color-faint` | `#5f6973` | `#8f988d` | Metadata and placeholders |
| Border/default | `--color-border` | `#d9ded5` | `#3a4038` | Cards, fields |
| Border/strong | `--color-border-strong` | `#c5ccbe` | `#51594d` | Focused surfaces |
| Accent/primary | `--color-accent` | `#9d4f18` | `#e39955` | Primary actions |
| Accent/hover | `--color-accent-hover` | `#7f3b11` | `#f0ad72` | Hover actions |
| Accent/soft | `--color-accent-soft` | `#fff1e7` | `#342219` | Accent backgrounds |
| Status/success | `--color-success` | `#17663f` | `#6ee7a8` | Healthy stock |
| Status/success-soft | `--color-success-soft` | `#edf8f0` | `#12281c` | Healthy stock background |
| Status/warning | `--color-warning` | `#865000` | `#f5c451` | Low stock |
| Status/warning-soft | `--color-warning-soft` | `#fff8e6` | `#332712` | Low stock background |
| Status/error | `--color-error` | `#b42318` | `#ff9a8f` | Critical stock |
| Status/error-soft | `--color-error-soft` | `#fff0ee` | `#351815` | Critical stock background |

### Rules

- Accent is reserved for primary actions, focus states, and inventory status, never decoration.
- Status colors must always appear with text labels, not color alone.
- No raw colors in UI files except token declarations.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | `3.35rem` desktop / `2.05rem` mobile | 780 | 1.05 | 0 | Hero title |
| H1 | `2rem` | 760 | 1.15 | 0 | Page title |
| H2 | `1.35rem` | 720 | 1.25 | 0 | Section headers |
| H3 | `1rem` | 700 | 1.35 | 0 | Card titles |
| Body/lg | `1.05rem` | 500 | 1.6 | 0 | Lead copy |
| Body | `1rem` | 450 | 1.55 | 0 | Default text |
| Body/sm | `0.9rem` | 450 | 1.5 | 0 | Secondary text |
| Caption | `0.78rem` | 680 | 1.35 | 0 | Labels, badges |
| Mono | `0.82rem` | 500 | 1.45 | 0 | Dates, counts, audit rows |

### Font Stack

- Primary: `"Avenir Next", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, sans-serif`
- Mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### Rules

- Use `word-break: keep-all` for Korean interface text and `overflow-wrap: anywhere` only as a fallback.
- Body text never falls below `14px`.
- Counts and dates use tabular numerals.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of `4px`.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Hairline gaps |
| `--space-2` | `8px` | Inline groups |
| `--space-3` | `12px` | Compact card spacing |
| `--space-4` | `16px` | Mobile page padding |
| `--space-5` | `20px` | Form/control spacing |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Section spacing |
| `--space-10` | `40px` | Desktop section spacing |
| `--space-12` | `48px` | Major breaks |

### Grid

- Max content width: `1180px`.
- Mobile: single-column, `16px` page padding, `44px` minimum touch target.
- Tablet: two-column card grids where content remains readable.
- Desktop: dashboard grid with alert cards and two-column secondary sections.

### Rules

- Use CSS Grid for page composition.
- Avoid nested cards; page sections and the hero are unframed, while repeated items and form tools may be framed.
- Main action must appear in the first mobile viewport.

## 5. Components

### Top Bar
- **Structure**: sticky `header` with brand block and reset action.
- **States**: reset button has hover, active, and focus-visible states.
- **Accessibility**: clear button text; no icon-only controls.
- **Motion**: transform-only press feedback.

### Hero Action
- **Structure**: short status copy plus the AI add-stock form and toast.
- **Variants**: default, success toast, warning toast, undo action.
- **Spacing**: `--space-6` desktop, `--space-4` mobile.
- **States**: input focus, button hover/active/focus, toast visible/empty.
- **Accessibility**: explicit labels via `.sr-only`; 44px minimum controls.

### Metric Tile
- **Structure**: label, value, helper text.
- **Variants**: neutral, success, warning, error.
- **Accessibility**: status is text-first; color reinforces status.

### Data Card
- **Structure**: title row, metadata, status badge, optional note.
- **Variants**: inventory, shortage, meal, ingredient, combination, record.
- **States**: hover elevation on pointer devices; no decorative animation.

### Inline Form
- **Structure**: grouped fields and one primary button.
- **States**: default, focus, invalid/empty via toast.
- **Accessibility**: labels are present; fields remain full-width on mobile.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | `120ms` | `ease-out` | Button press |
| Standard | `180ms` | `ease-in-out` | Hover and focus surface changes |

### Rules

- Animate only `transform`, `opacity`, `box-shadow`, and color.
- Respect `prefers-reduced-motion` by removing transform movement.
- Motion must communicate affordance or state.

## 7. Depth & Surface

### Strategy

Mixed tonal shift and restrained shadows.

| Level | Value | Usage |
|-------|-------|-------|
| Surface | `var(--color-surface)` plus `1px` token border | Data cards |
| Raised | `var(--color-surface-raised)` plus soft shadow | Hero form tool |
| Focus | `0 0 0 4px color-mix(in srgb, var(--color-accent) 22%, transparent)` | Keyboard focus |
| Shadow/soft | `0 18px 45px rgba(55, 43, 28, 0.10)` | Raised tools |

### Rules

- Use depth to clarify interaction and grouping, not decoration.
- No large rounded marketing cards; this is an operational tool.
