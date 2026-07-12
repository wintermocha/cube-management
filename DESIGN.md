# Design System: Baby Food Cube Manager

## 1. Visual Theme & Atmosphere

Baby Food Cube Manager uses the Stitch "Nurture Nest" direction: gentle precision for a busy caregiver managing frozen baby-food cubes. The app should feel like a sunny, well-organized kitchen: warm, tactile, calm, and trustworthy without becoming childish.

The first screen is the working app, not a landing page. Cards should feel like rounded silicone tray pieces: softly raised, easy to scan, and safe to touch. Motion is restrained and meaningful: buttons press, accordions open, active navigation fills, and drag/drop surfaces show clear alternatives for touch users.

## 2. Color Palette & Roles

- **Warm Milk Canvas** (`#fff8f6`) — page background and app chrome.
- **Pure Bowl Surface** (`#ffffff`) — primary card and form surface.
- **Cream Tray Low** (`#fff1ee`) — bottom nav, empty states, input fills.
- **Cream Tray** (`#f9ebe8`) — secondary surfaces and grouped controls.
- **Cream Tray High** (`#f3e5e2`) — active/hover surfaces and dividers.
- **Warm Clay Border** (`#dac1bd`) — card borders and segmented controls.
- **Cocoa Ink** (`#211a19`) — primary text.
- **Cocoa Soft Text** (`#544340`) — body text and metadata.
- **Muted Clay** (`#87726f`) — inactive icons and large decorative labels only.
- **Muted Clay Text** (`#765f5c`) — normal-size helper text; preserves at least 4.5:1 contrast on the app's tinted surfaces.
- **Deep Coral Primary** (`#94483d`) — primary CTA and strong icon buttons.
- **Soft Coral Active** (`#ff9e8f`) — active tabs and selected controls.
- **Coral Wash** (`#ffdad4`) — light primary containers.
- **Coral Highlight** (`#ffb4a8`) — hover/pressed tint.
- **Sage Primary** (`#3e6658`) — healthy stock and success text.
- **Sage Wash** (`#c0ecda`) — success chips and active secondary surfaces.
- **Sage Soft** (`#a5d0be`) — soft success tint.
- **Status Red** (`#ba1a1a`) — empty stock, delete, blocked, or urgent states.
- **Status Red Wash** (`#ffdad6`) — error containers.
- **Amber Warning** (`#e65100`) and **Amber Wash** (`#fff3e0`) — low stock.

Coral is the only primary action color. Sage means available or healthy. Amber means low but not empty. Red means empty, destructive, blocked, or urgent. Do not introduce Toss blue, purple gradients, neon glows, or pure black.

## 3. Typography & Icons

Use the platform UI font stack and inline SVG icons so first paint never waits on a third-party font host.

- **Headings:** the platform UI font stack at 600 or 700.
- **Body and labels:** the platform UI font stack at 400, 500, 600, or 700.
- **Fallbacks:** `"Apple SD Gothic Neo"`, `"Noto Sans KR"`, `sans-serif`.
- **Icons:** inline current-color SVGs for app bars, tab icons, and compact controls.
- **Numerals:** use tabular numerals for cube counts, grams, and dates.

Korean text should use `word-break: keep-all`; do not scale font size with viewport width; letter spacing remains `0`.

## 4. Spacing, Shape, Elevation

- Base spacing unit: 8px.
- Mobile margin: 20px to 24px.
- Standard card radius: 16px.
- High-emphasis panel radius: 20px to 24px.
- Control radius: 14px to 16px.
- Pills: `9999px`.
- `shadow-soft`: `0 4px 20px rgba(92, 83, 81, 0.06)`.
- `shadow-glass`: `0 8px 32px rgba(92, 83, 81, 0.05)`.
- `shadow-float`: `0 12px 28px rgba(148, 72, 61, 0.18)`.
- `shadow-dock`: `0 -8px 24px rgba(92, 83, 81, 0.08)` for the opaque bottom navigation edge.

Use borders sparingly and tint them warm. Raised cards use warm shadow plus tonal fill, not hard gray outlines.

## 5. Component Contract

- **Top app bar:** sticky-feeling app chrome with baby/profile visual identity, child/product title, and settings icon.
- **Bottom navigation:** five visible tabs only: Today, Cubes, Plan, Ingredients, History. Settings is reached from the app bar. The opaque Cream Tray Low dock reaches the viewport edge, while its five controls remain constrained to the active app-shell width. Every scroll panel reserves the dock clearance and applies matching scroll padding so focused content is never hidden behind it.
- **Today:** readonly dashboard with stock alert cards, current inventory, and meal-plan preview. The readonly meal-plan preview stacks within the panel and must not introduce horizontal page or panel wobble. It may include navigation CTAs but must not expose stock edit/delete/drag controls.
- **Inventory:** add stock form plus per-ingredient cards. Expanded cards reveal date lots with increment, decrement, and delete controls.
- **Ingredients:** add ingredient form, status/category edit controls, swipe delete, and status filters for all/not tried/planned/testing/tolerated/suspected reaction. Status filters wrap instead of forcing page-level horizontal motion. Expanded item detail stays inside the ingredient card as a warm grouped control panel.
- **Plan:** week date input, combination cards, deterministic recommendation panel, drag/drop calendar, and explicit `식단에 추가` buttons for touch users.
- **Combination builder:** stage selector plus per-ingredient cube-count fields. Saved combinations persist selected stage and each ingredient count.
- **Settings/Profile:** child display name, birthday, and notes edit real `childProfile` state. The `사진 변경` button is a visible placeholder and explains that upload is not ready.
- **Records/History:** first-class event-history screen with user-facing cards, not developer-looking logs.
- **Workspace summary:** the large Today-style hero and alert metrics appear only where they support the task context. Plan, Ingredients, and Records start directly with their task content instead of repeating the Today summary block.
- **Auth required:** warm panel with one primary `확인` action and no app content behind it.

### 5.1 Interaction and status primitives

- **Compact controls:** stock expand, ingredient expand, lot `+`/`−`, token remove, and trash controls use the existing icon language but keep a `48px × 48px` hit area. Their rest, hover, keyboard-focus, active, disabled, and destructive-armed states must remain visible without relying on color alone. Native button appearance must not leak through these controls.
- **Focus:** every interactive element uses the same two-layer visible focus indicator: a surface separator plus a Deep Coral outer ring. The ring must retain at least 3:1 contrast against adjacent light surfaces and Soft Coral Active controls.
- **Inline error:** invalid fields receive a Status Red border and a nearby Status Red message in a light Red Wash container. Error text is never placeholder-only and fields retain `aria-invalid` semantics.
- **Sync status:** pending, saved, failed, and conflict messages use a compact rounded status surface. Pending uses Cocoa text, saved uses Sage, and failed/conflict use Status Red. Text or an icon accompanies the color.
- **Destructive confirmation:** delete confirmation uses a Status Red Wash panel with explicit cancel and destructive actions. The armed destructive control keeps its 48px target and a visible pressed/armed treatment.
- **Responsive containment:** controls and filter groups wrap inside their card. The Cubes add form, lot controls, bottom dock, and cards must contain at `375`, `390`, `759`, `760`, `768`, `800`, and `1280` CSS pixels. At `200%` zoom the app has no `320px` page floor and no global horizontal overflow; compact targets stay at least `48px`.
- **Korean wrapping:** Korean copy retains `word-break: keep-all` with balanced/pretty wrapping for headings and explanatory copy. User-entered long strings may break as an emergency containment measure, without splitting ordinary Korean words into semantic orphans. A native select keeps its full option text and semantics while an overlong selected value uses an intentional single-line ellipsis with a separate visible arrow.

## 6. Existing App Parity

The redesign must keep these current app behaviors accessible:

- Add stock with date, ingredient, count, grams per cube, and description.
- Increment/decrement/delete individual cube lots.
- Clear current stock for an ingredient without deleting the ingredient.
- Add ingredients, edit status/category, and delete ingredients.
- Build combinations from ingredients and save per-ingredient cube counts.
- Add combinations to meal plan via drag/drop and touch fallback.
- Calculate warnings and planned shortages.
- Show event/history records.
- Handle expired login/session state.

## 7. Prototype Features Implemented Here

- Baby/profile top app bar and settings entry.
- Settings/profile edit screen.
- Material-inspired inline SVG icon language.
- Ingredient status filters.
- Combination stage selection and per-ingredient cube counts.
- Deterministic recommendation panel.
- Empty-state/profile SVG image treatment.

## 8. Must NOT

- Do not copy Tailwind CDN runtime from Stitch.
- Do not hotlink Stitch photos or remote assets.
- Do not introduce AI recommendation behavior; recommendations are deterministic and state-derived.
- Do not remove app-only safety surfaces such as auth-required UI, event history, per-lot controls, swipe confirmation, or drag/drop.
- Do not stage `.omo/` or `.omx/` runtime artifacts in the final commit.
- Do not push after committing.
