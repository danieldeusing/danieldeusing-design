# Migrating seedr to `danieldeusing-design`

Adopt the shared terminal design system in **seedr** (the React 19 + Vite 7 + Tailwind v4
registry app). seedr already ships the *exact same* terminal theme — token values are
byte-identical to core — but its `index.css` carries the whole token set, base layer, and
component primitives inline, plus a Claude-Code-specific styling layer on top. This migration
swaps the **shared base** (tokens + base + core components) over to the package while keeping
everything seedr-specific local.

- **App:** `apps/seedr` monorepo, web app at `apps/seedr/apps/web`
- **Stylesheet under surgery:** `apps/seedr/apps/web/src/styles/index.css`
- **Migrating to:** `danieldeusing-design` (this repo)
- **Risk:** **MEDIUM** — seedr's legacy color aliases (`--color-base/surface/text/…`) and its
  whole `@utility` layer (`card`, `btn`, `input`, `badge*`, `icon-btn*`) are **not** in core
  and must stay local, or the app's markup (`bg-base`, `text-text`, `.card`, `.btn-primary`,
  `.input`, `.badge-sm`) breaks. The swap is otherwise pixel-neutral because token values match.

## Phasing

| PR | Scope | Behavior change |
| --- | --- | --- |
| **PR1** | Swap the **CSS base** only — pull tokens + base + core components from the package; delete the inline copies; keep all seedr-specific CSS local. **Leave all runtime (the `index.html` IIFE, `useAppTheme`, `useTerminalSession`, `StatusBar`) untouched.** | **None.** Pixel-identical. |
| **PR2** *(optional, later)* | Point the runtime at core (`theme.js`, `terminal.js`, `dropdown.js`, `zoom.js`), collapse the duplicated `THEME_BACKGROUNDS` 4-hex map. | Behavior-neutral if done carefully; out of scope here. |

This document is **PR1**.

---

## Critical pre-flight fact: this package is NOT on npm and NOT in seedr's workspace

`danieldeusing-design` is **not published to npm** (verified: `npm view` → 404) and it lives at
`/Users/daniel/Work/danieldeusing/danieldeusing-design`, which is **outside** seedr's
`pnpm-workspace.yaml` globs (`packages/*`, `apps/*`). So it **cannot** be a `workspace:*`
dependency. It must be referenced as a **relative `file:` link** — pnpm will symlink it into
`apps/web/node_modules/danieldeusing-design`, exactly the way `@seedr/shared` is already
symlinked into `apps/web/node_modules/@seedr/shared`.

The relative path from `apps/seedr/apps/web` to the package is **`../../../../danieldeusing-design`**.

> If/when the package is later published to npm, swap the `file:` specifier for a pinned
> version (`"danieldeusing-design": "^0.1.0"`). Nothing else in this plan changes.

---

## Step 1 — Add the dependency

`apps/seedr/apps/web/package.json` — add to `dependencies` (alphabetical, between
`clsx` and `fuse.js`):

```jsonc
"dependencies": {
  "@fontsource-variable/jetbrains-mono": "^5.2.8",
  "@monaco-editor/react": "^4.7.0",
  "@seedr/shared": "workspace:*",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "danieldeusing-design": "file:../../../../danieldeusing-design",   // ← add
  "fuse.js": "^7.0.0",
  ...
}
```

Then install from the seedr monorepo root:

```sh
cd /Users/daniel/Work/danieldeusing/apps/seedr
pnpm install
# verify the symlink landed where Tailwind's @source will look:
ls -la apps/web/node_modules/danieldeusing-design   # → symlink to ../../../../danieldeusing-design
```

**Keep `@fontsource-variable/jetbrains-mono`.** seedr self-hosts the variable font through that
package; core's `fonts.css` is a CDN `@font-face` file that `tailwind.css` deliberately does
**not** import. Do not add core's `fonts.css` — it would duplicate the font for no gain.

---

## Step 2 — Rewrite `apps/seedr/apps/web/src/styles/index.css`

This is the whole migration. The file currently has **9 regions** (lines as of today):

| Region | Lines | Action |
| --- | --- | --- |
| `@import "tailwindcss"` / `@import "tw-animate-css"` | 1–2 | **KEEP** |
| `@source inline("…-500 type accent whitelist…")` | 4 | **KEEP** (seedr-specific; `lib/colors.ts` depends on it) |
| `:root` warm palette + `html[data-theme]` ×3 (green/mono/paper) | 13–147 | **DELETE** (→ core `tokens.css`) |
| `@theme { type scale + --color-skill family + semantic + spacing }` | 149–207 | **KEEP-LOCAL** |
| `@theme inline { shadcn map + legacy aliases + radius }` | 209–251 | **SPLIT** — delete the shadcn map (→ core), keep the legacy aliases local |
| `@layer base { scanline / selection / body / html }` | 253–296 | **DELETE** (→ core `base.css`) |
| `@layer components { glow / prompt / comment / ascii-rule / cursor-block / btn-terminal / link-quiet / term-anim gate }` | 298–414 | **DELETE** (→ core `components.css`) |
| `@utility { card, card-hover, badge*, btn*, icon-btn*, input, type-border, text-balance }` | 416–496 | **KEEP-LOCAL** |

### 2a. Imports — add the package after Tailwind, register `@source`

Replace the top of the file:

```css
/* BEFORE */
@import "tailwindcss";
@import "tw-animate-css";

@source inline("text-pink-500 text-amber-500 … border-l-emerald-500");
```

```css
/* AFTER */
@import "tailwindcss";
@import "tw-animate-css";
@import "danieldeusing-design/tailwind.css";

/* seedr-specific: -500 type-accent classes are referenced only through lib/colors.ts
   string maps (typeTextColors / typeBorderColors), so Tailwind can't see them in markup.
   Keep this inline whitelist or the card type-borders and type icons lose their color. */
@source inline("text-pink-500 text-amber-500 text-purple-500 text-blue-500 text-teal-500 text-orange-500 text-indigo-500 text-slate-400 text-green-500 text-gray-500 text-emerald-500 border-l-pink-500 border-l-amber-500 border-l-purple-500 border-l-blue-500 border-l-teal-500 border-l-orange-500 border-l-indigo-500 border-l-slate-400 border-l-green-500 border-l-gray-500 border-l-emerald-500");

/* REQUIRED: Tailwind must scan the package so core component classes
   (.prompt, .btn-terminal, .glow, .ascii-rule, .dropdown*, .eli5*, …) survive
   tree-shaking. Path is relative to THIS file (src/styles/) → apps/web/node_modules. */
@source "../../node_modules/danieldeusing-design";
```

> **Import order matters.** `tailwindcss` first (Preflight), then
> `danieldeusing-design/tailwind.css` (tokens + base + components + the core `@theme inline`
> map), then seedr's own `@theme` / `@theme inline` / `@utility` blocks below — so seedr's
> local mappings layer on top of core's.

> **`@source` depth is `../../node_modules` — verified.** `index.css` lives at
> `apps/web/src/styles/`; two segments up is `apps/web/node_modules`, where the pnpm `file:`
> symlink resolves. (Do **not** use the README's stock `../node_modules` example — that depth
> is for a CSS file one level shallower.)

### 2b. DELETE the palette blocks (now from core `tokens.css`)

Delete **lines 13–147** in their entirety — the `:root` warm palette, the
`html[data-theme="green"]`/`"mono"` badge-brightening block, and the green/mono/paper palette
blocks. These are byte-identical to `danieldeusing-design/src/tokens.css`.

**One nuance to preserve:** the green & mono palette blocks each carry a stray
`--badge-amber: #f59e0b;` override (index.css lines 95 and 121). That is **not** a core token —
it belongs to the seedr-local `--badge-*` family. **Do not delete it; relocate it.** See 2d.

### 2c. KEEP-LOCAL the `@theme` block, but SPLIT the `@theme inline` block

The first `@theme` block (lines 149–207) is **entirely seedr-specific — KEEP it verbatim**:

- the `--text-xss / -xs / -sm / -md` type scale (the 12px-floor scale),
- the `--color-skill / hook / agent / plugin / command / settings / mcp / prompt / capability`
  family (+ `-light` / `-dark` variants),
- `--color-success / warning / error`,
- the `--spacing-input / toggle / badge-sm / badge-md` form sizing.

> **Leave the known-dead bits dead.** The `--color-skill…capability` family and `--text-xss`
> are unused in the current app (the type accents come from the `-500` whitelist, not these
> tokens). They are **out of scope** — do **not** "fix" or prune them in this migration.

The second `@theme inline` block (lines 209–251) is **mixed** — split it:

- **DELETE** the shadcn semantic map (`--color-background` → `--color-ring`, lines 211–225) —
  core's `tailwind.css` already declares this exact `@theme inline` map.
- **KEEP** the legacy aliases (lines 228–239) — **core does NOT ship these** and seedr's markup
  uses them directly (`bg-base`, `text-text`, `bg-surface`, `border-overlay`, etc.). They must
  stay in a seedr-local `@theme inline`.
- **KEEP** the `--font-sans` / `--font-mono` lines **only if** you want to preserve seedr's
  `--font-mono-stack` var name. Core's map already sets `--font-mono`/`--font-sans` from its own
  `--font-mono` token (identical value). **Recommended:** drop seedr's `--font-mono-stack` and
  let core drive the font (see the watch-out below). If you keep it, it's harmless (same value).
- **DELETE** the `--radius-*` aliases (lines 244–250) — core's map already sets
  `--radius-sm/md/lg/xl` from `--radius` (all `0rem`). seedr's extra `--radius-xs/2xl/3xl` are
  unused by the app; drop them with the rest.

Resulting seedr-local `@theme inline` (legacy aliases only):

```css
@theme inline {
  /* Legacy aliases used across seedr's markup — NOT shipped by core, must stay local.
     bg-base / text-text / bg-surface / border-overlay / text-subtext etc. all resolve here. */
  --color-base: var(--background);
  --color-surface: var(--card);
  --color-surface-alt: var(--secondary);
  --color-overlay: var(--border);
  --color-overlay-hover: var(--primary);
  --color-overlay-light: var(--border);
  --color-subtext: var(--muted-foreground);
  --color-text: var(--foreground);
  --color-text-dim: var(--muted-foreground);
  --color-active: var(--secondary);
  --color-accent: var(--primary);
}
```

> **`--color-accent` delta — verified, value-neutral.** Core's `@theme inline` maps
> `--color-accent: var(--accent)`. seedr's legacy alias maps `--color-accent: var(--primary)`.
> Because the seedr-local block is imported *after* core, seedr wins → `accent-*` utilities
> resolve to `--primary`. In all four themes `--accent` and `--primary` hold the **same hex**
> (e.g. warm `#8a4516`, green `#33ff66`), so this is a no-op today. Leaving seedr's mapping in
> place keeps the override explicit and pixel-identical. (Core also ships `--color-input`, which
> seedr never declared; harmless to inherit.)

### 2d. KEEP-LOCAL the `--badge-*` family + dark-theme overrides

The `:root` `--badge-*` block (the 11 accents, index.css lines 39–51) and the
`html[data-theme="green"], html[data-theme="mono"]` brighter-badge override (lines 56–70) are
**seedr-local — core does not ship them.** `components/ui/Label.tsx` reads them directly via
`border-(--badge-green)/50 text-(--badge-green)` etc. Relocate the **whole** `--badge-*` set out
of the deleted palette blocks into a seedr-local `:root` + override pair near the top of the
post-Tailwind section. Include the two stray `--badge-amber: #f59e0b;` overrides from the green
and mono palette blocks (the duplicate amber called out above) — they belong here.

```css
/* seedr-specific badge accents — read by components/ui/Label.tsx; NOT in core.
   Light themes (warm/paper) use -700 shades for ≥4.5:1 at 11px; dark themes brighten. */
:root {
  --badge-amber: #b45309;
  --badge-pink: #be185d;
  --badge-purple: #7e22ce;
  --badge-blue: #1d4ed8;
  --badge-orange: #c2410c;
  --badge-emerald: #047857;
  --badge-indigo: #4338ca;
  --badge-teal: #0f766e;
  --badge-violet: #6d28d9;
  --badge-green: #15803d;
  --badge-red: #b91c1c;
}

html[data-theme="green"],
html[data-theme="mono"] {
  --badge-amber: #fbbf24;
  --badge-pink: #f472b6;
  --badge-purple: #c084fc;
  --badge-blue: #60a5fa;
  --badge-orange: #fb923c;
  --badge-emerald: #34d399;
  --badge-indigo: #818cf8;
  --badge-teal: #2dd4bf;
  --badge-violet: #a78bfa;
  --badge-green: #4ade80;
  --badge-red: #f87171;
  /* the green/mono palette blocks each re-set amber to #f59e0b; preserve it */
  --badge-amber: #f59e0b;
}
```

> Note the `--badge-amber` appears twice in the green/mono override (`#fbbf24` then `#f59e0b`);
> the second wins, matching today's rendered output. **Don't "tidy" the duplicate** — it's the
> ground-truth value. (Long-term, fold the whole `--badge-*` family into core's tokens; out of
> scope.)

### 2e. DELETE the base + components layers (now from core)

- **DELETE** `@layer base { … }` (lines 253–296): the `* { @apply border-border … }`,
  the `:root`/`html`/`body` font + bg rules, the `body::after` scanline overlay, and
  `::selection`. Core's `base.css` provides every one of these (the scanline overlay and
  themed selection are byte-identical).
  - Watch: core's `base.css` sets the default border via plain
    `*,*::before,*::after { border-color: var(--border); }` rather than seedr's
    `* { @apply border-border outline-ring/50; }`. The `outline-ring/50` is replaced by core's
    `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }`. This is a focus
    ring presentation tweak, not a color change — flag it during the visual diff but it is
    expected and on-theme.
  - Watch: core's `base.css` sets `body { font-size: 0.75rem }`. seedr's deleted base used
    `@apply … font-mono` and relied on Tailwind's default 16px root. Confirm during VERIFY that
    body text didn't shift — if anything looks off, this is the first place to look.

- **DELETE** `@layer components { … }` (lines 298–414): `.glow` / `.glow-lg`, `.prompt`,
  `.comment`, `.ascii-rule`, `.cursor-block`, `.btn-terminal`, `.link-quiet`, and the entire
  `@media (prefers-reduced-motion: no-preference)` term-anim gate (`html.term-anim [data-term]
  .prompt…`, `[data-term-out]`, `.term-caret`). Core's `components.css` provides all of these.
  - **Verified DOM-contract match:** core's term-anim gate keys off the **same** selectors
    seedr's `useTerminalSession` hook drives — `html.term-anim`, `[data-term]`, `.prompt`,
    `.term-live`, `[data-term-out]`, `.term-show`, `.term-caret`. The hook keeps working
    unchanged. (Cosmetic core deltas: flicker is `0.2s steps(3)` vs seedr's `0.35s steps(4)`,
    and the blink keyframe is renamed `ddd-blink`/`ddd-term-output`. Confirm the typing feel in
    VERIFY; if Daniel wants the exact old timing, that's a core tweak, not a seedr one.)
  - **Verified `.prompt` delta:** core's `.prompt` is `font-size:0.75rem; font-weight:700;
    color: var(--muted-foreground)`. seedr's deleted `.prompt` was `text-[13px] font-semibold
    text-foreground`. Different size (12px vs 13px), weight (700 vs 600), and color
    (muted-foreground vs foreground). **This is the one place a visible shift can occur.**
    Decide explicitly:
    - **Preferred:** accept core's `.prompt` (the shared canonical look) and verify the four
      section headers still read well.
    - **If pixel-identical is mandatory:** add a one-line seedr-local override after the imports:
      `.prompt { font-size: 13px; font-weight: 600; color: var(--foreground); }`. Prefer not to —
      converging on core is the point of the migration.

### 2f. KEEP-LOCAL the entire `@utility` layer

Lines 416–496 stay **verbatim** — none of these are in core, and seedr's components reference
them directly:

- `card`, `card-hover` (uses `bg-surface`/`border-overlay` legacy aliases) — `components/ui/Card.tsx`
- `badge`, `badge-sm`, `badge-md` — `components/ui/Label.tsx` (`className="badge badge-sm …"`)
- `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `icon-btn`, `icon-btn-xss/-xs/-sm/-lg` —
  `components/ui/Button.tsx`
- `input` — `components/ui/Input.tsx`
- `type-border` (`border-l-4`), `text-balance`

These depend on both the legacy aliases (2c) and the `@theme` spacing tokens (2c) staying local,
which is why those blocks are kept.

### Final shape of `index.css` (region order, top to bottom)

```
@import "tailwindcss";
@import "tw-animate-css";
@import "danieldeusing-design/tailwind.css";   // ← tokens + base + core components + core @theme inline
@source inline("…-500 whitelist…");            // seedr-local
@source "../../node_modules/danieldeusing-design";  // seedr-local (lets Tailwind keep core classes)

:root { --badge-* … }                          // seedr-local (2d)
html[data-theme="green"], html[data-theme="mono"] { --badge-* … }  // seedr-local (2d)

@theme { type scale + --color-skill family + semantic + spacing }   // seedr-local (2c, verbatim)
@theme inline { legacy --color-base/surface/text/… aliases }        // seedr-local (2c, trimmed)

@utility card / card-hover / badge* / btn* / icon-btn* / input / type-border / text-balance  // seedr-local (2f, verbatim)
```

Net: the file shrinks from ~496 lines to roughly ~120, and every remaining line is provably
seedr-specific.

---

## Runtime: leave it ALL untouched in PR1

Do **not** touch any of these in this PR — they target the same DOM contract core's CSS now
relies on, and changing them is PR2:

- **`apps/web/index.html`** — the pre-paint IIFE that reads `localStorage.theme`, sets
  `documentElement.dataset.theme`, updates `meta[theme-color]` + favicon, and adds
  `html.term-anim` when motion is allowed. (This is functionally `applyStoredTheme()` +
  `initTerminal()`'s gate from core, hand-inlined.)
- **`apps/web/src/lib/useAppTheme.ts`** — `MutationObserver` on `data-theme`.
- **`apps/web/src/lib/useTerminalSession.ts`** — drives `.term-live` / `.term-show` /
  `.term-caret` against `[data-term]` sections.
- **`apps/web/src/components/StatusBar.tsx`** — the theme switcher footer (its own
  `applyTheme` writes `localStorage` + `data-theme` + favicon).

### Watch-outs to record for PR2 (do NOT act on now)

- **The 4-hex `THEME_BACKGROUNDS` map now lives in THREE places:** the `index.html` IIFE
  (`backgrounds`), `StatusBar.tsx` (`THEME_BACKGROUNDS`), and core's `runtime/theme.js`. PR2
  should collapse seedr's two copies onto core's `setTheme`/`applyStoredTheme` and delete the
  local maps. Leaving all three in sync is the maintenance hazard this migration accepts for
  now.
- **Dead-on-arrival, leave dead:** the `--color-skill…--color-capability` token family and
  `--text-xss` are unused. Do not prune them here — it's noise in a CSS-swap PR.
- StatusBar uses a Radix `DropdownMenu`, not core's `.dropdown`/`initDropdowns`. PR2 can decide
  whether to converge; not required.

---

## VERIFY (gate before merge) — success = pixel-identical across all four themes

1. **Build clean:**
   ```sh
   cd /Users/daniel/Work/danieldeusing/apps/seedr
   pnpm install
   pnpm --filter @seedr/web typecheck
   pnpm --filter @seedr/web build      # tsc && vite build — must succeed
   ```
2. **Dev server, headless visual diff** (do not drive Daniel's browser — give him steps or use a
   headless capture):
   ```sh
   pnpm --filter @seedr/web dev        # http://localhost:6200
   ```
   For **each** theme `warm` (default), `green`, `mono`, `paper` (switch via the StatusBar
   footer or `localStorage.setItem('theme', …)` + reload), confirm on the home/registry list
   **and** a detail page:
   - [ ] Background, foreground, card, border colors unchanged.
   - [ ] CRT **scanline overlay** present at the right intensity (`--scanline-opacity` per theme).
   - [ ] **`::selection`** uses primary-on-primary-foreground.
   - [ ] **`.prompt`** `$ ` section headers render (note the 2e size/weight/color decision).
   - [ ] **`.btn-terminal`**, **`.link-quiet`**, **`.ascii-rule`**, **`.glow`** look identical.
   - [ ] **Cards** (`.card` / `.card-hover`): border + soft glow on hover intact.
   - [ ] **Badges** (`Label.tsx`): all 11 accent colors legible in each theme; the
         green/mono **amber** badge is `#f59e0b` (the duplicate-override value).
   - [ ] **Type-colored** card left-borders + type icons (the `-500` whitelist) still colored.
   - [ ] **Buttons / inputs** (the `@utility btn*` / `input` family) unchanged.
   - [ ] **Terminal typing animation** plays on load and on client-side navigation between items
         (the `useTerminalSession` replay); reduced-motion still shows all content.
   - [ ] **Theme switch** from the StatusBar persists across reload, updates `meta[theme-color]`
         and favicon.
3. **Reduced motion:** with OS "reduce motion" on (or `html.anim-off`), all content is visible
   and nothing animates.
4. **Regressions to specifically rule out** (the known deltas from §2): focus-ring style,
   body font-size, `.prompt` typography, term-anim flicker timing. Any *color* difference is a
   bug; the listed *presentation* tweaks are expected — confirm they're acceptable, don't chase
   them as failures.

If every theme is pixel-identical (modulo the three accepted presentation deltas), PR1 is done.
