# briefs → danieldeusing-design migration

Converging **briefs** (the static-HTML Morning Brief newsletter system) onto the
shared terminal design system. Unlike the pagr and seedr migrations — which are
near-pixel-neutral CSS-base swaps because those apps already ship the terminal
look — **this is a full redesign, not a token swap.** briefs today is the
*opposite* aesthetic: a warm-paper broadsheet (Fraunces + Source Serif + IBM
Plex Mono, per-category accent hues, paper grain, drop caps). Converging it onto
JetBrains-Mono CRT phosphor changes essentially every surface.

> **Do this migration LAST.** It is the largest and highest-effort of the three.
> Land pagr and seedr first so the core package (`tokens.css`, `base.css`,
> `components.css`, the runtime) is proven in production before the 85 KB
> broadsheet stylesheet gets rewritten against it.

---

## 0. What briefs is (inventory)

A **pure static site** served by Cloudflare Pages — **no build step, no
package.json, no Tailwind, no bundler.** Everything is hand-authored HTML that
links plain CSS/JS by relative path. This is the single most important
constraint for the whole plan: **briefs cannot use the Tailwind v4 entry**
(`@danieldeusing/design/tailwind.css` + `@source`) the way pagr does — there is
nothing to run `@source` through. briefs must consume the **build-free bundle**
(`index.css` / the `dist/*.min.css`), exactly like the README's "single HTML
file" path.

```
morning-briefs/daniel/
├── public/                         ← the deployed Pages site
│   ├── index.html       (489 KB)   ← dashboard SPA shell + inlined manifest + inline <style> + theme toggle
│   ├── favicon.svg
│   ├── lib/
│   │   ├── tokens.css   (303 lines / 12 KB)  ← fonts, scales, --c-<category> accents, light/dark
│   │   ├── styles.css   (2125 lines / 85 KB) ← ALL newsletter component CSS
│   │   ├── newsletter.js(1322 lines / 61 KB) ← interactive component auto-wiring
│   │   ├── brand-mark.svg
│   │   └── fonts/        Fraunces, SourceSerif4, IBMPlexMono (self-hosted woff2)
│   └── <category>/<lang>/<date>.html  ← daily files: content-only, link ../../lib/*
├── docs/
│   ├── template.html               ← the daily-file skeleton authors copy
│   ├── COMPONENTS.md               ← HTML pattern per component + JSON contracts
│   ├── FORMAT.md, CROSS_CUTTING.md
│   └── categories/*.md
└── tools/
    ├── build_manifest.py           ← CATEGORIES list + dashboard manifest/JSON gen
    └── deploy-cloudflare.sh        ← wrangler pages deploy public/ → "briefs" project
```

### 0.1 `public/lib/tokens.css` — the design language being replaced

- **Fonts (self-hosted woff2, declared inline):** `Fraunces` (display, wght
  300–900), `Source Serif` (body, 200–900), `Plex Mono` (mono, 400/600).
  Stacks: `--font-display`, `--font-body`, `--font-mono`, plus a legacy
  `--headline-font` alias.
- **Scales:** a 7-step type scale (`--text-2xs`…`--text-2xl`, ratio ~1.18), a
  7-step spacing scale (`--space-1`…`--space-7`), and a 3-tier radius scale
  (`--radius-pill` 999px, `--radius-panel` 8px, `--radius-inline` 3px). **Note:
  briefs uses non-zero radii everywhere** — the terminal system is `--radius: 0`.
- **Surfaces/ink:** warm-paper palette — `--bg #f8f4e9`, `--panel #fffbef`,
  `--fg #1c1813`, `--muted`, `--rule`, `--quote`, `--chip`, two shadow tokens
  (`--shadow-panel`, `--shadow-lift`), semantic `--warn`/`--good`.
- **Per-category accents — the contract that survives.** Ten categories, each
  with a *chrome* accent and an AA-safe *text* accent:
  `--c-economy … --c-stocks-crypto` and `--c-<cat>-text`. The active pair is
  aliased to `--accent` / `--accent-text` per page via `body.cat-<cat>` rules at
  the bottom of the file.
- **Light/dark:** three blocks kept in sync by hand — `:root` (light default),
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
  (warm-dark espresso palette, auto), and `:root[data-theme="dark"]` (manual
  override). Each dark block re-states all ten `--c-<cat>` / `--c-<cat>-text`.

### 0.2 `public/lib/styles.css` (~85 KB) — architecture

A single hand-authored sheet, `@import "tokens.css"` at the top, then ~2125
lines organised as: a global type layer (headings default to `--accent`, drop
caps, justified `Blocksatz` prose, tabular figures) → then per-component-family
blocks → then a large `@media` responsive cascade (3 tiers) → then a very large
`@media print` block (~400 lines: A4 landscape two-column reflow). Major
component families (do NOT transcribe — these are the redesign targets):

| Family | Selectors | Role |
|---|---|---|
| Masthead | `.masthead`, `.masthead-title`, `.masthead-issue`, `.dot`, `.read-btn` | per-brief header: kicker + Fraunces headline + voice-reader button |
| Dashboard / cards | `.dashboard`, `.strip`, `.panel`, `.fx-cards`/`.fx-card`, `.weather-card`, `.match-card`, `.listing-card`, `.weekend-pick`, `.activity-panel` | category-specialised "top-stories" cards |
| Body grid | `.body-grid`, `.col`, `.cols-2`, `.news-item`, `.lead` | 3-col broadsheet deep-dive layout w/ column rules |
| Scan band | `.tldr`, `.tl-col`, `.tl-date`, `.tl-events`, `.chip`/`.hot`/`.good` | TL;DR + Wochenausblick band |
| Timeline | `.timeline`, `.tl-track`, `.tl-dot`, `.dot`, `.form-dots` | event horizon |
| Tables | `.standings-table`(+`-wrap`/`-legend`), `.listings-table`, `.activity-table`, `.mini-table`, `.conj-grid` | football standings, jobs board, family events, language conjugation |
| FX / charts | `.fx-cards`, `.fx-card`, `.fx-spark-wrap`, `.fx-delta`, `.detail-chart-wrap`, `.bench-chart-wrap`, `.range-toggle`, `.calc-*` | Chart.js-backed economy/ai-dev widgets |
| Callouts | `.callout`, `.eli5`, `.mechanism`, `.pro-con`, `.scenario`, `.stat`, `.update-since` | inline explainer boxes |
| Citations | `.src`, `.source`, `.citation`, `.footnotes`, `.footnote-ref` | source refs / generated footnotes |
| Voice reader | `.voice-reader-panel`, `.vr-status`, `.read-btn`, `.voice-reading-now` | TTS overlay |
| Lightbox | `.mb-lightbox`(+`-close`) | image zoom |
| Jobs | `.job`, `.job-main`, `.job-reason`, `.jobs-page-btn`, pager | paginated listings |

### 0.3 `public/lib/newsletter.js` (1322 lines) — interactive wiring

A single IIFE with a `registerComponent(name, init)` dispatcher; each component
bails silently if its targets are absent (safe to load everywhere). It wires:
**FX panel** (`initFxPanel` — Chart.js sparklines + switchable detail chart +
pair/range toggles), **benchmark chart** (`initBenchmarkChart` — Chart.js bar),
**R$/h calculator** (`initRHourCalc` — live slider), **footnote generator**
(`initFootnotes` — promotes inline links to numbered refs), **voice reader**
(`initVoiceReader` — Web Speech API, `mb-voice` localStorage), **Mermaid**
(`causal-chain-mermaid`), plus a `cssColors()` reader that feeds the current
token values into `Chart.defaults` and `mermaid.initialize`.

**Crucial:** `cssColors()` (line ~55) and `configureChartDefaults()` (line ~141)
read computed CSS variables — `--muted`, `--rule`, the Plex-Mono font stack —
and Mermaid init reads `prefers-color-scheme` (line ~1124) to pick `dark`
vs `default`. **These are the JS hooks into the design language.** When the
tokens change, these readers must read the new token names, or charts/diagrams
silently render with stale/wrong colours and fonts. newsletter.js holds **no
page-level theme toggle** — that lives entirely in `index.html`.

### 0.4 `public/index.html` — dashboard chrome + the theme toggle

A ~489 KB single-file SPA shell: inline `<style>` (~800 lines) + the inlined
manifest + the runtime. It owns the **theme toggle**, which is a **3-state**
control, not 2-state:

```js
const THEME_KEY  = 'mb-theme';
const themeOrder = ['auto', 'light', 'dark'];          // ← cycles through THREE
const themeIcon  = { auto: '◐', light: '☀', dark: '☾' };
const themeLabel = { auto: 'Auto', light: 'Hell', dark: 'Dunkel' };
// auto → remove data-theme (let prefers-color-scheme decide); else set data-theme=state
```

It also re-declares the **per-category accent wiring** for dashboard surfaces:
`.tldr-card[data-cat="<cat>"]` (home-card accent) and
`[data-cat="<cat>"] .cat-color` (sidebar swatch). It propagates `data-theme`
into the newsletter `<iframe>`'s `<html>` so the embedded brief matches.

### 0.5 `tools/build_manifest.py` — the `CATEGORIES` source of truth

```python
CATEGORIES = [
    ("economy",        "Wirtschaft & Märkte", "📈", "var(--c-economy)"),
    ("stocks-crypto",  "Börse & Krypto",      "💰", "var(--c-stocks-crypto)"),
    ("software",       "Software & IT",       "🔧", "var(--c-software)"),
    ("ai-dev",         "AI fürs Coding",      "🤖", "var(--c-ai-dev)"),
    ("ai-usecases",    "AI in der Anwendung", "🏭", "var(--c-ai-usecases)"),
    ("jobs",           "Jobs & Aufträge",     "💼", "var(--c-jobs)"),
    ("football",       "Fußball",             "⚽", "var(--c-football)"),
    ("motorsport",     "Motorsport",          "🏎", "var(--c-motorsport)"),
    ("family",         "Familie & Region",    "🏡", "var(--c-family)"),
    ("learn-language", "Sprachen lernen",     "🗣", "var(--c-learn-language)"),
]
```

Each entry's 4th field is a `var(--c-<cat>)` reference — so build_manifest.py is
a **consumer of the accent tokens by name.** Renaming `--c-<cat>` breaks the
generated dashboard unless this list is updated too.

### 0.6 The dashboard-consistency-check contract — MUST be preserved

The `dashboard-consistency-check` skill enforces that **every** category in
`CATEGORIES` has all of these (5 regex checks, "4 definitions" colloquially):

| # | File | Pattern |
|---|---|---|
| 1 | `lib/tokens.css` | `--c-<cat>: #…;` |
| 2 | `lib/tokens.css` | `--c-<cat>-text: …;` |
| 3 | `lib/tokens.css` | `body.cat-<cat> { --accent: …; --accent-text: …; }` |
| 4 | `index.html`     | `.tldr-card[data-cat="<cat>"] { --accent: …; --accent-text: …; }` |
| 5 | `index.html`     | `[data-cat="<cat>"] .cat-color { background: …; }` |

The skill greps `tools/build_manifest.py` for the live `CATEGORIES` list, then
greps these five locations. **The convergence MUST keep all five patterns
matchable** — same token names (`--c-<cat>`, `--c-<cat>-text`), same body alias
(`body.cat-<cat>`), same dashboard selectors. The terminal redesign changes how
those accents *look* (layered over `--primary` instead of replacing it — see
Phase 2), not whether the five definitions exist. Run the skill after every
phase that touches accents.

### 0.7 No cross-app CSS coupling

The pagr "briefs" page (`apps/pagr/.../BriefsPage.astro`) consumes only
`https://briefs.danieldeusing.de/manifest.json` — **data, not CSS.** It never
loads briefs' `styles.css`/`tokens.css`. So this redesign **cannot break
pagr**: there is no shared stylesheet, no shared class names, no CSS import
across the app boundary. The only contract between them is the manifest JSON
shape, which this migration does not touch.

---

## 1. What we are migrating TO (ground truth)

`danieldeusing-design` — framework-agnostic plain CSS + an optional Tailwind v4
layer + a dependency-free ESM runtime. Confirmed from
`/Users/daniel/Work/danieldeusing/danieldeusing-design`:

- **npm name** `@danieldeusing/design` (scoped, in the `danieldeusing` org). Exports:
  `.` → build-free bundle (`src/index.css` = reset + tokens + base + components);
  `./tailwind.css`; `./tokens.css`; `./base.css`; `./components.css`;
  `./reset.css`; `./fonts.css`; `./runtime` (ESM barrel); `./tokens.json`;
  `./dist/*` (committed, jsDelivr-served, minified).
- **Tokens** (`src/tokens.css`): 18 semantic palette vars (shadcn naming —
  `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`,
  …), 3 CRT-atmosphere vars (`--glow`, `--glow-soft`, `--scanline-opacity`),
  `--radius: 0`, `--font-mono` (JetBrains Mono). **Four themes** via
  `html[data-theme]`: `warm` (default), `green`, `mono`, `paper`. Token values
  are byte-identical to what pagr & seedr ship (verified — e.g. warm
  `--primary: #8a4516`).
- **Base** (`src/base.css`): mono body @ `0.75rem`, the `body::after` scanline
  overlay (intensity `--scanline-opacity`), phosphor `::selection`, default
  `border-color: var(--border)`, on-theme focus ring.
- **Core components** (`src/components.css`): `.glow`/`.glow-lg`, `.prompt`
  (`$ ` prefix), `.comment` (`# ` prefix), `.cursor-block`, `.btn-terminal`
  (`> ` CTA), `.link-quiet`, `.card-terminal`, `.ascii-rule`,
  `.dropdown`/`.dropdown-panel`(+`--down`)/`.dropdown-item`, `.eli5`/`.eli5-term`,
  the `[data-term]`/`[data-term-out]` typing gate, the `html.anim-off`
  kill-switch.
- **Core runtime** (`runtime/`, ESM, dependency-free): `theme.js`
  (`applyStoredTheme` / `setTheme` / `initThemeSwitcher`, themes
  `["warm","green","mono","paper"]`, localStorage key **`"theme"`**),
  `terminal.js` (`initTerminal`), `dropdown.js` (`initDropdowns`), `zoom.js`
  (`initResolutionZoom`).
- **Fonts** (`src/fonts.css`): optional JetBrains Mono Variable from a pinned
  jsDelivr CDN; deliberately not in the bundle.

Because briefs has no bundler, it consumes the **build-free** layer. Two
delivery options:

- **(A) Vendored** — copy the package's `dist/danieldeusing-design.min.css` (or
  the `src/*.css` layers) into `public/lib/`, and copy `runtime/*.js` into
  `public/lib/`. Self-hosted, offline, no third-party runtime dependency,
  survives a CDN outage. **Recommended** — it matches how briefs already
  self-hosts its fonts and ships its own `lib/`.
- **(B) CDN** — `<link>`/`<script type=module>` straight from a **pinned**
  jsDelivr tag (`@v0.1.0`), per the README single-file recipe. Lower effort to
  wire but adds a runtime dependency on jsDelivr and the GitHub release.

This plan assumes **(A) vendored**, and notes where (B) differs.

---

## 2. The defining visual change

> **Phase 1 replaces the serif broadsheet typography with the monospace
> terminal.** `--font-display: Fraunces` and `--font-body: Source Serif` go
> away; **everything becomes JetBrains Mono.** Drop caps, justified `Blocksatz`
> prose, the modular serif type scale, the warm-paper grain, the 8px panel radii
> and soft shadows — all of it is replaced by CRT phosphor on a scanline grid
> with `--radius: 0`. There is no way to make this pixel-neutral, and we should
> not try. The whole point of converging briefs is that it *stops* looking like
> a newspaper and starts looking like the rest of the danieldeusing surface.

This is why briefs goes last and why its verification is **visual sign-off on
the redesign**, not a pixel diff (contrast with pagr/seedr, where
pixel-identical IS the success criterion).

---

## 3. Phased convergence plan

Each phase is a self-contained PR. **After every phase, re-run
`dashboard-consistency-check` and `responsive-spacing-check`, and eyeball a
sample category page in all four themes.**

### Phase 1 — Adopt the core base (tokens + base + components)

Pull the terminal foundation in and let it shadow the broadsheet base. This is
the phase that flips the typography.

**1.1 Vendor the package into `public/lib/`.** From the briefs repo root:

```bash
# one-off: get the built files out of the design system
DS=/Users/daniel/Work/danieldeusing/danieldeusing-design
cp "$DS/dist/danieldeusing-design.min.css" public/lib/ddd.min.css   # tokens+base+components+reset
cp "$DS/src/fonts.css"                      public/lib/ddd-fonts.css # JetBrains Mono @font-face (CDN urls)
cp "$DS/runtime/"*.js                        public/lib/ddd-runtime/  # theme/terminal/dropdown/zoom/index
```

> Pin the source: vendor from a tagged checkout (`git -C "$DS" checkout v0.1.0`)
> and record the version in a comment at the top of `public/lib/ddd.min.css`, so
> the vendored copy is traceable. To self-host the font instead of the CDN
> `@font-face` in `ddd-fonts.css`, drop a JetBrains-Mono woff2 into
> `public/lib/fonts/` and rewrite the two `src:` urls — mirroring how the
> Fraunces/Source-Serif/Plex faces are self-hosted today.

**1.2 Rewrite `public/lib/tokens.css` as a thin shim.** It keeps owning only
what the terminal core does *not* provide — the briefs-specific scales and the
per-category accents (Phase 2) — and stops declaring the serif fonts, the
warm-paper palette, and light/dark. Before/after of its head:

```css
/* BEFORE — public/lib/tokens.css (broadsheet) */
@font-face { font-family: "Fraunces";     /* … */ }
@font-face { font-family: "Source Serif"; /* … */ }
@font-face { font-family: "Plex Mono";    /* … */ }
:root {
  --font-display: "Fraunces", …;
  --font-body:    "Source Serif", …;
  --font-mono:    "Plex Mono", …;
  --bg: #f8f4e9; --panel: #fffbef; --fg: #1c1813; /* … warm paper … */
  --radius-panel: 8px; --radius-inline: 3px;
  /* per-category --c-economy … and light/dark blocks below */
}
```

```css
/* AFTER — public/lib/tokens.css (terminal shim) */
@import "ddd.min.css";        /* terminal tokens+base+components: --background, --foreground,
                                 --primary, --font-mono(JetBrains), --radius:0, 4 themes, scanlines */
@import "ddd-fonts.css";      /* JetBrains Mono */

:root {
  /* KEEP-LOCAL: briefs-only scales the core doesn't define */
  --text-2xs: .70rem; --text-xs: .82rem; --text-sm: .95rem; --text-md: 1.12rem;
  --text-lg: 1.32rem; --text-xl: 1.85rem; --text-2xl: 3.0rem;
  --space-1: .25rem;  /* … --space-7 … */

  /* DELETE: --font-display, --font-body, --font-mono override,
     --bg/--panel/--fg/--muted/--rule/--quote/--chip, --radius-*, --shadow-*,
     the @media(prefers-color-scheme) and [data-theme=dark|light] blocks. */

  /* per-category accents → Phase 2 */
}
```

> `styles.css` still `@import "tokens.css"` (unchanged), so importing the core
> at the top of the shim threads it into every newsletter automatically. The
> dashboard `index.html` loads `lib/tokens.css` via `<link>` — same result.

**1.3 DELETE vs KEEP-LOCAL summary for Phase 1:**

- **DELETE from tokens.css:** the three serif/`Plex Mono` `@font-face` blocks
  and the self-hosted Fraunces/Source-Serif fonts in `public/lib/fonts/` (keep a
  Plex-Mono only if any component still pins it — see 3.3/Chart.js); the
  warm-paper surface tokens; `--shadow-*`; `--radius-*` (the core is `0`); the
  whole light/dark/auto token machinery (the core's four themes replace it).
- **KEEP-LOCAL:** `--text-*`, `--space-*` scales (the core has no spacing/type
  scale of its own); the per-category accent layer (Phase 2).
- **MAP, don't keep:** old `--bg → --background`, `--fg → --foreground`,
  `--panel → --card`, `--muted → --muted-foreground`, `--rule → --border`,
  `--warn → --destructive`, `--good →` (no direct token; keep a local
  `--good` or derive from `--primary`). Do these mappings as a single
  find/replace pass across `styles.css` and the `index.html` inline `<style>`.

After 1.2/1.3, **most of `styles.css` still renders** (it now reads terminal
tokens through the mapped names) but looks wrong in the broadsheet-specific
spots — that's expected; Phase 3 restyles those.

### Phase 2 — Re-map the per-category accent system onto the terminal look

briefs' identity is its ten category colours. The terminal core has a single
`--primary` per theme. **Recommendation: keep `--c-<cat>` as a *local accent
layer* — exactly the pattern seedr uses for its type accents — overlaid on the
shared terminal `--primary`, so each category keeps an identity *within* the
phosphor aesthetic** rather than replacing it.

Concretely, in the new `public/lib/tokens.css` shim, after the core import:

```css
/* Phase 2 — per-category accent layer, LOCAL, over the shared terminal palette. */
:root {
  /* chrome accent: tuned to read as "phosphor of hue X", not warm-paper ink.
     Keep the SAME token NAMES so dashboard-consistency-check still matches. */
  --c-economy:        #c85a3a;  --c-economy-text:        #c85a3a;
  --c-software:       #4f8fd0;  --c-software-text:       #4f8fd0;
  --c-ai-dev:         #8a6fd0;  --c-ai-dev-text:         #8a6fd0;
  --c-ai-usecases:    #3fb3ae;  --c-ai-usecases-text:    #3fb3ae;
  --c-football:       #4fb36a;  --c-football-text:       #4fb36a;
  --c-family:         #d49a4a;  --c-family-text:         #d49a4a;
  --c-jobs:           #6f93b8;  --c-jobs-text:           #6f93b8;
  --c-learn-language: #c85a78;  --c-learn-language-text: #c85a78;
  --c-motorsport:     #e0683a;  --c-motorsport-text:     #e0683a;
  --c-stocks-crypto:  #b89a6a;  --c-stocks-crypto-text:  #b89a6a;

  --accent: var(--c-economy); --accent-text: var(--c-economy-text);
}
/* body alias — KEEP exact form, the check greps `body.cat-<cat>` */
body.cat-economy        { --accent: var(--c-economy);        --accent-text: var(--c-economy-text); }
/* … one per category … */
```

**Design decisions to make and lock in this phase:**

1. **One accent set across all four themes, or per-theme tints?** Simplest:
   declare each `--c-<cat>` *once* (theme-independent hue) and let the terminal
   `--background`/scanlines carry the warm/green/mono/paper mood. This is the
   recommended starting point — it collapses briefs' three hand-synced
   light/dark accent blocks into one. If a hue reads poorly on the `green` or
   `mono` background, add a targeted `html[data-theme="green"] :root { --c-… }`
   override only for the offenders (don't pre-emptively triple the table).
2. **`--accent` as a layer, not a replacement.** Component CSS should use
   `--primary` for the *terminal* structure (glow, prompts, borders-on-hover)
   and `--accent` only where a category needs to assert identity (the masthead
   kicker tag, the `.chip`, the card's left rule, the dashboard swatch). Don't
   route every `--primary` use through `--accent` — that would erase the shared
   look. Mirror seedr: shared chrome stays `--primary`; the per-item accent is a
   thin top layer.
3. **AA contrast.** On warm-paper, briefs needed a *darker* `--c-<cat>-text`
   derivative for prose links. On the terminal backgrounds (dark green/mono,
   light paper) the contrast math is different per theme — verify link contrast
   in all four themes (esp. `paper`, the lightest bg). Where a single value
   can't clear AA in every theme, that's the case for a per-theme `--c-…-text`
   override.

**Preserve the contract (do not skip):** keep all five
`dashboard-consistency-check` patterns intact — the two `--c-<cat>` /
`--c-<cat>-text` tokens, the `body.cat-<cat>` alias (tokens.css), and the
`.tldr-card[data-cat="<cat>"]` + `[data-cat="<cat>"] .cat-color` rules
(index.html). build_manifest.py's `var(--c-<cat>)` references keep working
unchanged because the token names are unchanged. **Run the skill at the end of
this phase and fix to green.**

### Phase 3 — Restyle the bespoke newsletter components

This is the bulk of the 85 KB rewrite. Work component-family by component-family
(the table in 0.2), reaching for core primitives where they fit and keeping
data-heavy components functional. Suggested mapping:

| briefs family | Terminal treatment |
|---|---|
| `.masthead` / `.masthead-title` / `.masthead-issue` | Terminal **header**: a `$`-prompt line (`.prompt`, e.g. `$ cat economy/2026-06-26.md`) + a breadcrumb of the category path; headline in `.glow` JetBrains Mono. Optionally drive the prompt with `initTerminal` (Phase 4). |
| `.dashboard` cards (`.fx-card`, `.weather-card`, `.match-card`, `.listing-card`, `.weekend-pick`) | `.card-terminal` as the base surface (bordered, `--border`, hover glow); category identity via a `--accent` left rule / kicker. Drop `--shadow-*` and the 8px radius. |
| `.tldr` / `.chip` / `.hot` / `.good` | mono scan list; chips become bracketed terminal tags (`[HOT]`) tinted with `--accent`. |
| `.timeline` / `.standings-table` / `.listings-table` / `.activity-table` / `.conj-grid` | mono, **ASCII-ruled**: replace hairline borders/`box-shadow` with `.ascii-rule` separators and `border: 1px solid var(--border)`; align numerics with the core mono + `font-variant-numeric: tabular-nums`. |
| `.callout` / `.eli5` / `.mechanism` / `.pro-con` / `.scenario` / `.stat` | adopt the core **`.eli5`** for explainers (it already exists, with the `ELI5` badge + `.eli5-term`); style the others as `.eli5`-like bordered boxes with a `--primary` left bar. |
| `.src` / `.source` / `.citation` / `.footnotes` | `.comment` (`# `) prefix for source lines; `.link-quiet` for footnote links. newsletter.js's `initFootnotes` keeps generating refs — only the CSS class hooks change. |
| `.voice-reader-panel`, `.mb-lightbox`, jobs pager | reskin to bordered terminal surfaces; **behaviour unchanged** (newsletter.js untouched). |
| `.body-grid` / `.col` / `.news-item` / `.lead` | drop drop-caps and justified `Blocksatz`; keep the column grid but switch rules to `--border`; prose in mono at the core's `0.75rem` base, stepped up via `--text-*` where needed for the long-form columns. |

**Keep functional (data-heavy):**

- **FX cards + charts (Chart.js)** and the **benchmark bar** — keep the canvases
  and the JS. **Update `cssColors()` / `configureChartDefaults()` in
  newsletter.js** so they read the *new* token names: `--muted →
  --muted-foreground`, `--rule → --border`, and the font from the JetBrains-Mono
  stack instead of `"Plex Mono"`. This is the one mandatory newsletter.js edit
  in Phase 3 (everything else is CSS-only).
- **Mermaid** — its theme is picked from `prefers-color-scheme` at line ~1124;
  switch it to read `html[data-theme]` (now one of four values) so diagrams
  match the active terminal theme rather than the OS scheme. Map
  `green`/`mono` → mermaid `dark` base, `warm`/`paper` → `default`, and feed it
  `--primary`/`--border` via `cssColors()`.

**newsletter.js stays — only its CSS hooks change.** The `registerComponent`
dispatcher, voice reader, footnote generator, calculator, and lightbox all keep
their selectors and behaviour. The two exceptions above (Chart/Mermaid colour
readers) exist precisely because those components *read the design tokens*; they
must follow the rename.

**Also update the docs (they ARE the authoring surface):** `docs/template.html`
(masthead markup, the `cat-<cat>` body class stays) and `docs/COMPONENTS.md`
(each component's HTML pattern) must be revised to the terminal markup, or every
new daily file will be authored in the old broadsheet shape. This is part of
Phase 3, not an afterthought.

### Phase 4 — Adopt the core runtime (4-theme switch, dropdown, terminal)

Replace briefs' bespoke theme machinery with the shared runtime.

**4.1 The big behavioural change: 3-state light/dark → 4 terminal themes.**
Today `index.html` cycles `['auto','light','dark']` on the `mb-theme`
localStorage key and toggles `data-theme` to `light`/`dark` (or removes it for
auto). Replace with the core's switcher:

```js
// BEFORE (index.html inline script)
const THEME_KEY  = 'mb-theme';
const themeOrder = ['auto', 'light', 'dark'];
// … manual data-theme set/remove + iframe propagation …

// AFTER
import { applyStoredTheme, setTheme, initThemeSwitcher, THEMES }
  from "./lib/ddd-runtime/index.js";       // ["warm","green","mono","paper"], key "theme"
applyStoredTheme();   // ideally inline pre-paint in <head> to avoid a flash
initThemeSwitcher();  // wires [data-theme-value] buttons + [data-theme-label]
```

Consequences to handle:

- **localStorage key changes** `mb-theme → theme`. There is no 1:1 value
  mapping (`auto/light/dark` ≠ `warm/green/mono/paper`); just let the key change
  and default to `warm`. Per the simplicity rules, **do not write a migration
  shim** for the old key — a returning reader silently lands on `warm` once and
  re-picks. (If a one-time remap is ever wanted: `dark→green`, else `warm`.)
- **Toggle UI changes** from a single cycling button (`◐/☀/☾`, "Auto/Hell/Dunkel")
  to a **4-option** control. Use the core's markup contract: four
  `<button data-theme-value="warm|green|mono|paper">` + a `[data-theme-label]`
  span; or wrap them in the core `.dropdown`/`.dropdown-panel`/`.dropdown-item`
  (with `data-theme-value` on the items, matching the `[data-theme-value]`
  highlight rules already in `components.css`) and `initDropdowns()`.
- **Iframe propagation.** index.html copies `data-theme` into the newsletter
  iframe's `<html>`. Keep that bridge, but now it propagates one of the four
  terminal values. Since both shells load the same terminal tokens, the embedded
  brief themes correctly. Re-propagate on every `setTheme` (subscribe to the
  click, or call a small `applyToIframe(theme)` from the switcher).
- **`@media (prefers-color-scheme: dark)` is gone.** The terminal system is
  explicit-theme-only; there is no auto mode. If "follow the OS" is still
  desired, it's a product decision to add later — not part of convergence.

**4.2 Optional runtime:** `initTerminal()` to make the masthead `$`-prompt type
out (Phase 3 markup permitting); `initDropdowns()` for the theme menu and any
nav; `initResolutionZoom(1920)` if briefs wants the same 2K/4K zoom pagr uses.
All are progressive enhancement — with JS off, content stays visible and theme
defaults to `warm`.

**4.3 Pre-paint guard.** Add the README's inline `<head>` snippet (or
`applyStoredTheme()` inline) to both `index.html` *and* `docs/template.html`'s
`<head>` so daily files don't flash the wrong theme before the module loads.

---

## 4. Risk register

| Risk | Why it bites here | Mitigation |
|---|---|---|
| **85 KB stylesheet rewrite** | `styles.css` is 2125 lines of bespoke broadsheet CSS incl. a ~400-line print block; every family needs reskinning. | Phase it by component family (0.2 table); land the base swap (Phase 1) first so unstyled-but-mapped output is the worst case, never broken layout. Re-run `responsive-spacing-check` per phase. |
| **Per-category accent contract** | 5 hand-maintained definitions across 2 files × 10 categories; the failure is silent (falls back to economy red). | Keep token NAMES identical (`--c-<cat>`, `--c-<cat>-text`, `body.cat-<cat>`, the two index.html selectors). Run `dashboard-consistency-check` after Phase 2 and after any accent edit; fix to green. |
| **Many bespoke components** | FX/charts, voice reader, footnotes, lightbox, conjugation grid, jobs board are unique to briefs — no core equivalent. | KEEP behaviour (newsletter.js largely untouched); restyle CSS hooks only. The sole functional edits are the Chart.js/Mermaid token-readers (3.3) which MUST follow the token rename or charts render wrong colours/fonts silently. |
| **light/dark → 4-theme toggle** | localStorage key + state set changes; iframe propagation; loss of `auto`/`prefers-color-scheme`. | Phase 4 owns this end-to-end; key `mb-theme→theme`, no shim, default `warm`; re-propagate to iframe on every switch; accept that auto-follow-OS is dropped (note it explicitly). |
| **Print stylesheet** | ~400 lines of A4 broadsheet print rules assume the serif/warm-paper look. | Treat `@media print` as its own Phase-3 sub-task; the terminal `paper` theme is a natural printout palette — consider routing print to force `data-theme="paper"`. |
| **Vendored-copy drift** | A copied `ddd.min.css` can fall behind the package. | Pin to a tagged version, record it in a header comment, and re-vendor on design-system releases (or use the pinned CDN, option B). |
| **No cross-app break** *(non-risk, stated for confidence)* | pagr's briefs page reads only `manifest.json`. | No shared CSS/classes across the boundary — this redesign cannot affect pagr. Don't spend effort guarding a coupling that doesn't exist. |

---

## 5. Verification checklist

Run after the relevant phase; the full list gates the final PR. briefs' success
criterion is **visual sign-off on the redesign in all four themes**, not a pixel
diff (that's the pagr/seedr bar, not this one).

- [ ] **Render every category page in all four themes.** For each of the ten
      categories (`economy`…`stocks-crypto`), open a daily file and cycle
      `warm` / `green` / `mono` / `paper`. Confirm: typography is JetBrains Mono
      everywhere (no Fraunces/Source-Serif left), scanlines render, the category
      accent is visible *and distinct* per category, prose-link contrast clears
      AA on every background (watch `paper`).
- [ ] **Dashboard in all four themes.** Open `public/index.html`; confirm the
      home cards (`.tldr-card`) and sidebar swatches (`.cat-color`) show the
      correct per-category accent (not the economy-red fallback) and the
      embedded-brief iframe inherits the active theme.
- [ ] **`dashboard-consistency-check`** — exits 0:
      `python3 .claude/skills/dashboard-consistency-check/scripts/check_consistency.py`
- [ ] **`responsive-spacing-check`** — clean at all three responsive tiers
      (small-laptop, tablet-portrait, phone) on a representative page.
- [ ] **`python3 tools/build_manifest.py --verify`** — manifest still valid, all
      ten categories present, `var(--c-<cat>)` references resolve.
- [ ] **Interactive components still work:** FX sparklines + detail toggle
      (economy), benchmark bar (ai-dev), R$/h calculator, footnote generation,
      voice reader, lightbox, Mermaid diagram — charts/diagrams pick up the
      *active* theme's colours and the mono font (verify after the
      `cssColors()` rename).
- [ ] **Theme toggle:** 4 options, persists across reload under `theme`,
      propagates into the newsletter iframe, no flash on load (pre-paint guard
      in `index.html` and `docs/template.html`).
- [ ] **Print:** Cmd-P a brief; the A4 layout is intact (ideally rendered via the
      `paper` theme).
- [ ] **No regression to pagr:** confirm `manifest.json` shape is unchanged
      (this migration doesn't touch it, but verify the deploy still publishes a
      valid manifest the pagr briefs page can read).
- [ ] **Deploy:** `tools/deploy-cloudflare.sh` publishes `public/` to the
      `briefs` Pages project (branch `prod`) → https://briefs.danieldeusing.de.

---

## 6. Sequencing recap

1. **pagr** and **seedr** migrate first (their plans: PR1 = swap CSS base only,
   pixel-neutral; PR2 = extract runtime). They *prove the core package* in
   production.
2. **briefs goes last.** It is the only full redesign of the three, the only
   build-free (vendored/CDN) consumer, and the one with the bespoke
   accent-contract + component surface. Phase it: **1** base/typography swap →
   **2** accent layer (re-run the consistency check) → **3** component reskin
   (incl. docs + Chart/Mermaid token-readers) → **4** runtime + 4-theme toggle.
   Verify each phase; gate the final PR on the full checklist above.
