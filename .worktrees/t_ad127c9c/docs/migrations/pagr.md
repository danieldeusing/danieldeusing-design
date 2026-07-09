# Migrating `pagr` onto `danieldeusing-design`

**App:** `pagr` — the Astro 6 + Tailwind v4 site behind **danieldeusing.de**
(`/Users/daniel/Work/danieldeusing/apps/pagr`).

**Risk:** **Lowest of the three migrations.** pagr is the *canonical source* of the
terminal design — `danieldeusing-design` was extracted from this app's `global.css` and
runtime. Token values, base layer, component CSS, and the four runtime modules in the
package are byte-for-byte the same code pagr ships today (verified below). This is an
**extract-and-import-back**: we delete the local copies and re-import them from the
package. A correct migration is **pixel-identical** across all four themes.

**Strategy:** two PRs.
- **PR1 — CSS base swap only.** Replace the hand-maintained palette + `@theme` map +
  base layer + component primitives in `global.css` with package imports. Zero runtime
  change. End-state must be pixel-identical.
- **PR2 — runtime extraction.** Replace the three inline `<head>` scripts' *generic*
  halves (theme, zoom, terminal typing) with the package runtime, keeping all
  app-specific runtime (language auto-forward, history stack, `ls -l` nav choreography,
  lightbox/TOC/search) local.

Each PR ends with the same **VERIFY** step: build, then visually diff `warm` / `green` /
`mono` / `paper`.

---

## 0. Ground truth confirmed before writing this plan

I read both sides and confirmed:

| Pagr local (today) | Package equivalent | Match? |
| --- | --- | --- |
| `global.css` `:root` + `html[data-theme=...]` palette (18 tokens + 3 CRT tokens + `--radius` + `--font-mono`), 4 themes | `src/tokens.css` | **Byte-identical** |
| `global.css` `@theme inline { --color-*; --font-*; --radius-* }` | `src/tailwind.css`'s `@theme inline` block | **Byte-identical** |
| `global.css` `@layer base` (scanline `body::after`, `::selection`, body mono, button cursor, `scroll-behavior`) | `src/base.css` | Same rules. *(One nuance — see §3.)* |
| `global.css` `@layer components`: `.glow/.glow-lg`, `.prompt`, `.comment`, `.cursor-block`, `.btn-terminal`, `.link-quiet`, `.card-terminal`, `html.anim-off`, `[data-term]`/`[data-term-out]` typing gate, `.term-caret` | `src/components.css` | Same rules. *(Keyframe names differ — see §3.)* |
| `Footer.astro` `<style is:global>` `.dropdown` / `.dropdown-panel` / `.dropdown-item` (`min-width:128px`, `z-index:50`, `bottom:calc(100% + 12px)`) | `src/components.css` `.dropdown*` | **Byte-identical** |
| `Header.astro` `.dropdown-panel--down` (`top:calc(100% + 8px); bottom:auto; left:0; right:auto`) | `src/components.css` `.dropdown-panel--down` | **Byte-identical** |
| 3 inline `<head>` scripts: theme pre-paint, resolution zoom, terminal typing | `runtime/theme.js`, `runtime/zoom.js`, `runtime/terminal.js` | Logically identical (see PR2) |

**Package public API** (from `@danieldeusing/design/package.json` `exports`):
`"."` → `src/index.css` (build-free bundle: reset+tokens+base+components) ·
`"./tailwind.css"` → Tailwind v4 entry (tokens+base+components + `@theme inline`) ·
`"./tokens.css"`, `"./base.css"`, `"./components.css"`, `"./reset.css"`, `"./fonts.css"` ·
`"./runtime"` → ESM barrel · `"./runtime/*"` · `"./tokens.json"` · `"./dist/*"`.

**Install topology gotcha (read this before touching `package.json`):**
- pagr has its **own** `node_modules` at `apps/pagr/node_modules`.
- There is **no `pnpm-workspace.yaml`** at `/Users/daniel/Work/danieldeusing`, and
  `danieldeusing-design` is **not a workspace member**. → a bare `"workspace:*"`
  specifier will **not** resolve. Do not use it unless you first stand up a workspace.
- `danieldeusing-design` currently has **no git remote and no tags**. → a
  `github:danieldeusing/...#vX` or `npm` version spec is **not installable today**.
- So the **near-term specifier is a local `file:` link** (both repos are siblings under
  the same tree). The **production specifier** is a pinned git tag or published npm
  version once the package is pushed/tagged. The plan uses `file:` and flags the swap.

---

## PR1 — Swap the CSS base (zero behavior change)

### Step 1.1 — Add the dependency

`apps/pagr/package.json`, `dependencies` (insert in alpha order, before `@fontsource…`
or wherever it sorts):

```diff
   "dependencies": {
+    "@danieldeusing/design": "file:../../danieldeusing-design",
     "@astrojs/mdx": "^6.0.2",
```

> **Production hardening (do before deploy, not necessarily in PR1):** once
> `danieldeusing-design` is pushed and tagged, switch this to a pinned ref, e.g.
> `"@danieldeusing/design": "github:danieldeusing/danieldeusing-design#v0.1.0"` or a
> published `"^0.1.0"`. Never `@main`/`@latest` in production. The CDN/README guidance
> ("pin a release tag") applies equally to the git/npm dep.

Then:

```bash
cd /Users/daniel/Work/danieldeusing/apps/pagr
pnpm install
# sanity: the package resolved into pagr's node_modules
ls node_modules/@danieldeusing/design/src/tailwind.css
```

`@tailwindcss/typography` and `tw-animate-css` **stay** in pagr's deps — they are not
re-exported by the package and `global.css` still loads them (see §3). `tailwindcss` and
`@tailwindcss/vite` stay (the package is a *layer*, not a Tailwind replacement).

### Step 1.2 — Rewrite `src/styles/global.css`

**File:** `/Users/daniel/Work/danieldeusing/apps/pagr/src/styles/global.css`

**DELETE** these spans entirely (they now live in the package):
- the `:root { … }` warm palette block (lines ~12–39),
- all three `html[data-theme="green|mono|paper"] { … }` blocks (lines ~41–114),
- the `@theme inline { … }` map (lines ~116–143),
- the entire `@layer base { … }` block (lines ~145–190),
- inside `@layer components { … }`: `.glow`, `.glow-lg`, `.prompt`(+`::before`),
  `.comment::before`, `.cursor-block`(+`@keyframes blink`), the `html.anim-off` rules,
  `.btn-terminal`(+`::before`,`:hover`), `.link-quiet`(+`:hover`), `.card-terminal`
  (+`:hover`), and the entire `@media (prefers-reduced-motion: no-preference)` typing
  block (`[data-term] .prompt`, `[data-term-out]`, `term-output`, `.term-caret`).

**KEEP LOCAL** (app-specific — NOT shipped by core; see §2 for why each stays):
- `.prose-pagr` and all its `prose-*` / `figure` / `img` / `figcaption` rules,
- `.prose-pagr :where(code)…` inline-code rule,
- `.prose-pagr .eli5` / `.prose-pagr .eli5::before` / `.prose-pagr .eli5-term`,
- the Shiki dual-theme override `html[data-theme="green|mono"] .astro-code { … }`.

**ADD** at the very top — the three `@import` lines pagr already has, plus the two
package imports and the `@source`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";

/* the danieldeusing terminal design system: tokens (4 themes) + base layer +
   component primitives + the @theme inline map that wires bg-background /
   text-foreground / font-mono / border-border to the live html[data-theme]. */
@import "@danieldeusing/design/tailwind.css";

/* REQUIRED: Tailwind only scans your own src/ for class names, so without this it
   tree-shakes the package's component classes (.prompt, .btn-terminal, .glow,
   .dropdown, …) that are referenced in the package's own CSS/markup but not in
   pagr's source. Depth: src/styles/ -> src/ -> pagr root (node_modules lives there). */
@source "../../node_modules/@danieldeusing/design";
```

> **Import order matters.** `@import "@danieldeusing/design/tailwind.css"` must come
> **after** `@import "tailwindcss"` so the package's base/component rules win over
> Tailwind Preflight (the README states this explicitly). Keep `tw-animate-css` and the
> typography `@plugin` where they are.

After this, the **only** remaining content of `global.css` is the kept-local block — the
`.prose-pagr` family and the Shiki override.

### Step 1.3 — Remove the now-duplicated dropdown CSS from `Footer.astro`

**File:** `/Users/daniel/Work/danieldeusing/apps/pagr/src/components/Footer.astro`

The `<style is:global>` block (lines ~103–185) defines `.dropdown`, `.dropdown > summary`
(+`::-webkit-details-marker`, `:hover`, `[open]`), `.dropdown-panel`, `.dropdown-item`
(+`:hover`, the `[data-theme-value]` active selectors), `.anim-toggle`.

- `.dropdown`, `.dropdown-panel`, `.dropdown-item` (incl. the `[aria-current]` /
  `[data-theme-value]` active-glow selectors) are **byte-identical to core** — **DELETE**
  them.
- `.anim-toggle` (+`:hover`, `[aria-pressed="true"] [data-anim-box]`) is **app-specific**
  (the footer's `[x] anim` motion toggle) and **NOT** in core — **KEEP** it.

Resulting `Footer.astro` `<style is:global>` keeps only the three `.anim-toggle` rules.
*(Verify the byte-match yourself before deleting — see §4.A.)*

### Step 1.4 — Remove the duplicated `.dropdown-panel--down` from `Header.astro`

**File:** `/Users/daniel/Work/danieldeusing/apps/pagr/src/components/Header.astro`

In the component `<style>` (lines ~224–342):
- `.dropdown-panel--down` (lines ~251–256: `top:calc(100% + 8px); bottom:auto; left:0;
  right:auto`) is **byte-identical to core** — **DELETE** it.
- **KEEP** everything else in this block — it is all app-specific: `.nav-ctrl`
  (+`::-webkit-details-marker`, `:hover`, `:disabled`), the entire `.ls-*` family
  (`.ls-panel`, `.ls-row`, `.ls-perm`, `.ls-name`, `.ls-row--active`, `[data-ls-nav]`
  trigger sizing), and the whole `html.term-anim [data-ls-nav]…` reveal-choreography +
  `@keyframes ls-print`.

> Header's `<style>` is component-scoped (not `is:global`), but `.dropdown-panel--down`
> is used by the history dropdown's panel (`<ul class="dropdown-panel dropdown-panel--down">`).
> Since core now provides `--down` globally, the local copy is redundant. Confirm the
> history dropdown still opens *downward* after deleting (it will — same rule, now from
> core). *(See §4.A for the byte-match check.)*

### Step 1.5 — Leave `Base.astro` untouched in PR1

The three inline `<head>` scripts (theme pre-paint, resolution zoom, terminal typing) and
the language-forward script **stay exactly as they are** in PR1. The CSS they drive
(`html.term-anim`, `html.anim-off`, `[data-theme]`, `.term-caret`) now comes from the
package instead of local `global.css`, but the class names and DOM contract are unchanged,
so the scripts keep working with zero edits. Runtime extraction is PR2.

### PR1 VERIFY (must pass before merge)

```bash
cd /Users/daniel/Work/danieldeusing/apps/pagr
pnpm build        # runs: pnpm sync && node scripts/generate-og.mjs && astro build
pnpm preview      # serve dist/ locally
```

Success criteria — **pixel-identical to pre-PR1** on:
- Home (`/`) — brand `.glow` + `.cursor-block`, the `$ ls -l` nav, any `[data-term]`
  sections, `.btn-terminal`, `.card-terminal`.
- An article (`/articles/<slug>/`) — `.prose-pagr` body, `.eli5` callouts, Shiki code
  blocks (esp. in `green`/`mono` — the dual-theme override is kept-local).
- Footer status bar — language + theme `.dropdown`s open **upward**; history dropdown in
  the header opens **downward**; the `[x] anim` toggle still styled.

For **each** of `warm`, `green`, `mono`, `paper` (footer theme menu → reload to confirm
persistence): scanline intensity, selection colour, glow, borders, hover states.
A practical headless diff: screenshot each theme before and after the PR at a fixed
viewport and compare — they must be identical.

---

## PR2 — Extract the runtime

Goal: replace the **generic** logic in the inline `<head>` scripts with imports from
`@danieldeusing/design/runtime`, while keeping every **app-specific** behavior local.
The package runtime is the same code, so this is also behavior-neutral.

### What the package runtime provides (and maps to)

| pagr inline script (`Base.astro`) | Package runtime | Notes |
| --- | --- | --- |
| theme pre-paint IIFE (lines ~153–173) | `applyStoredTheme({ faviconHref })` | core syncs `[data-theme]` + `meta[theme-color]`; pagr also swaps `#favicon` → pass the `faviconHref` option |
| resolution-zoom IIFE (lines ~174–191) | `initResolutionZoom(1920)` | identical: `zoom = max(1, innerWidth/1920)` on load + resize |
| terminal typing IIFE (lines ~192–296) | `initTerminal()` | identical typing/reveal, **fires `term:contentdone` + sets `window.termContentDone`** — the exact hook `Header.astro`'s `ls -l` nav listens for |
| theme-switch wiring (`Footer.astro` script) | `initThemeSwitcher({ faviconHref })` | wires `[data-theme-value]` buttons + `[data-theme-label]`; pagr also wants the favicon swap |
| dropdown close-others/click-away/Escape (`Footer.astro` script) | `initDropdowns()` | byte-identical logic to pagr's |

### Step 2.1 — Pre-paint theme + favicon (inline, in `<head>`)

The theme **must** apply before first paint (no flash), so it stays an inline module in
`<head>` — but the body becomes a package call. Replace the theme pre-paint IIFE
(`Base.astro` lines ~153–173) with:

```astro
<script>
  import { applyStoredTheme } from "@danieldeusing/design/runtime";
  applyStoredTheme({ faviconHref: (theme) => `/favicon-${theme}.svg` });
</script>
```

> `applyStoredTheme` sets `html[data-theme]` and `<meta name="theme-color">` from
> `THEME_BACKGROUNDS`, and — because we pass `faviconHref` — also updates
> `<link id="favicon">`. That covers everything pagr's IIFE did. Note pagr's `<link
> rel="icon" … id="favicon">` already exists in `<head>`, so the favicon swap keeps working.
>
> **Astro caveat:** a bundled `<script>` (no `is:inline`) is hoisted/deferred, which would
> defeat pre-paint and reintroduce the flash. To keep it truly pre-paint, **either** keep
> this as `is:inline` and inline a tiny loader, **or** verify Astro emits it early enough.
> Safest: keep the theme apply `is:inline` calling the same logic. Two options:
> 1. **Minimal-change:** leave the theme pre-paint IIFE `is:inline` as-is (it's 20 lines,
>    already correct, already flash-free) and only extract `initThemeSwitcher` /
>    `initDropdowns` / `initTerminal` / `initResolutionZoom` (steps 2.2–2.4). This is the
>    recommended scope for PR2 — it removes the *duplicated* logic without risking the
>    flash-of-wrong-theme.
> 2. **Full extraction:** move to the bundled import above only after confirming
>    (build + throttled reload) there is no theme flash. If a flash appears, revert to (1).
>
> Pick **option 1** unless you can verify (2) is flash-free.

### Step 2.2 — Resolution zoom

Same pre-paint concern (the page must lay out zoomed before paint). Recommended: keep the
zoom IIFE `is:inline` for pre-paint, OR replace its body with `initResolutionZoom(1920)`
only if verified flash-free. The package function is identical:

```astro
<script>
  import { initResolutionZoom } from "@danieldeusing/design/runtime";
  initResolutionZoom(1920);
</script>
```

### Step 2.3 — Terminal typing animation

The terminal IIFE (`Base.astro` lines ~192–296) is the **largest** duplicated block and
is **not** pre-paint sensitive (it gates on `html.term-anim`, added by `initTerminal`
itself; nothing is hidden until the class lands). Replace the whole IIFE with:

```astro
<script>
  import { initTerminal } from "@danieldeusing/design/runtime";
  initTerminal();
</script>
```

**Critical compatibility check:** `Header.astro`'s `ls -l` nav choreography listens for
`window` event `"term:contentdone"` and reads `window.termContentDone` (Header lines
~390–391). The package `initTerminal()` sets `window.termContentDone = true` and dispatches
`new Event("term:contentdone")` after the initial on-screen sections finish — **the exact
same contract**. So Header's nav continues to "run" after content prints. **Do not touch
`Header.astro`'s script in PR2** — it is app-specific and depends only on that event.

**`anim-off` ordering:** pagr's terminal IIFE *also* decides the `anim-off` vs `term-anim`
gate by reading `localStorage "anim"` and OS reduced-motion (lines ~197–205). The package
`initTerminal()` instead **bails** if `html.anim-off` is already present or reduced-motion
is set, and otherwise adds `term-anim`. So pagr must still **set `html.anim-off`
pre-paint** from the stored `"anim"` pref *before* `initTerminal()` runs, or the kill-switch
won't be honored on load. Keep a small `is:inline` pre-paint snippet that reads
`localStorage "anim"` and adds `html.anim-off` when off (or unset + OS-reduced-motion),
then let `initTerminal()` handle the rest. Concretely, split the current IIFE:
- **Keep `is:inline` (pre-paint):** the first ~9 lines that read `"anim"` + reduced-motion
  and `classList.add("anim-off")` and early-return.
- **Replace with `initTerminal()`:** everything after (the typing/reveal engine).

The footer's anim toggle (`Footer.astro` script, lines ~248–271) already toggles
`html.anim-off` / `html.term-anim` and persists `"anim"` — **keep it local**, it's the UI
for that kill-switch and core ships no such toggle.

### Step 2.4 — Theme switcher + dropdowns (in `Footer.astro` script)

In `Footer.astro`'s `<script>`, replace the hand-rolled dropdown close-logic (lines
~195–214) and the theme-switch wiring (lines ~232–244) with package calls:

```ts
import { initThemeSwitcher, initDropdowns } from "@danieldeusing/design/runtime";

initDropdowns();
initThemeSwitcher({ faviconHref: (theme) => `/favicon-${theme}.svg` });
```

**KEEP LOCAL in this script** (core does not own these):
- `syncThemeLabel()` is **redundant** — `initThemeSwitcher` already syncs
  `[data-theme-label]`. Delete pagr's copy.
- the `[data-lang-value]` click handler that persists `localStorage "lang"` (language
  picks) — **app-specific, KEEP**.
- the **anim toggle** block (lines ~248–271) — **app-specific, KEEP**.
- `themeBackgrounds` map — **delete** if no longer referenced after `initThemeSwitcher`
  (core owns `THEME_BACKGROUNDS`); keep only if some local code still reads it.

> `initThemeSwitcher` calls `setTheme`, which persists `"theme"` and applies
> `[data-theme]` + `meta[theme-color]` + (with `faviconHref`) the favicon — matching
> pagr's old per-button handler exactly. `initDropdowns()` reproduces pagr's
> close-others / click-away / Escape behavior verbatim.

### Step 2.5 — App-specific runtime that NEVER moves to core

Leave these entirely local — they are pagr-only and have no place in a generic design
system:
- **Language auto-forward** (`Base.astro` lines ~123–152): redirects unprefixed EN pages
  to the visitor's language from `localStorage "lang"` / `navigator.languages`. Stays
  `is:inline` (must run pre-navigation). i18n is app logic.
- **History back/forward stack** (`Header.astro` lines ~400–486): the sessionStorage visit
  stack driving the chevrons + history dropdown for this static multi-page site.
- **`ls -l` nav choreography** (`Header.astro` lines ~344–394): the typing-out of the
  `ls -l` command + line-by-line panel reveal, chained off `term:contentdone`. App art
  direction.
- **Mobile burger toggle** (`Header.astro` lines ~345–354).
- **Article lightbox, TOC, search** (in `ArticlePostPage.astro` / `ArticleIndexPage.astro`
  — `.lightbox`, `.lightbox-img`, `.is-hidden`, `.flag` classes). Untouched by both PRs.

### PR2 VERIFY

Same build + four-theme visual diff as PR1, **plus** the runtime behaviors:
- Theme switch from the footer menu changes theme, persists across reload, swaps favicon
  + `theme-color`, and updates the `[data-theme-label]` text — in **both** the footer
  dropdown and the mobile burger.
- All `details.dropdown` menus: opening one closes the others; click-away closes; Escape
  closes (footer lang/theme, header history, header `ls -l`).
- Terminal typing still plays on first load; the `ls -l` nav still "runs" *after* page
  content finishes (the `term:contentdone` chain).
- `[x] anim` toggle still turns motion off, persists, and is honored pre-paint on the next
  load (the `anim-off` pre-paint snippet from §2.3).
- Resolution zoom: at a >1920px viewport the whole layout scales up (no flash at unscaled
  size on load).
- Reduced-motion / JS-disabled: all content visible, theme defaults to `warm`.

---

## 2. Why each kept-local item is NOT in core (and stays in pagr)

- **`.prose-pagr` + `prose-*` / `figure` / `img` / `figcaption` / inline `code`** — built
  on `@tailwindcss/typography`'s `prose` plugin, which core does **not** depend on. Pure
  app long-form styling. Stays in `global.css`.
- **Shiki dual-theme override** `html[data-theme="green|mono"] .astro-code { … !important }`
  — depends on Astro's Shiki output (`--shiki-dark*` vars) configured in
  `astro.config.mjs` (`vitesse-light`/`vitesse-dark`). App build concern, not a design
  primitive. Stays.
- **`.prose-pagr .eli5` (prose-scoped)** — core ships an **unscoped** `.eli5` with
  *identical* visual rules. Both match the `<div class="eli5">` blocks (which only ever
  render **inside** `.prose-pagr` article bodies — verified: every `class="eli5"` usage is
  in MDX content). The prose-scoped selector has higher specificity, so it wins where it
  differs; values are the same, so they coexist harmlessly. **Keeping pagr's prose-scoped
  copy is the safe choice** — it pins the look to the article context regardless of any
  future core `.eli5` tweak. (If you ever want to drop it, verify core's unscoped `.eli5`
  is still imported and the look is unchanged in all four themes first.)
- **`.ls-*`, `.nav-ctrl`** (`Header.astro`) — the `ls -l` directory-listing nav and the
  history chevron buttons. Bespoke pagr nav, not a generic component.
- **`.anim-toggle`** (`Footer.astro`) — the `[x] anim` motion kill-switch UI. Core ships
  the *mechanism* (`html.anim-off`) but no toggle chrome.
- **`.flag`, `.lightbox`, `.lightbox-img`, `.is-hidden`** — `FlagIcon` rendering and the
  article image lightbox. App features.

## 3. Subtle differences to be aware of (do not block PR1, but know them)

These are *internal* differences between pagr's old local CSS and the package; all are
visually neutral, but call them out so a reviewer isn't surprised:

- **Keyframe names.** pagr used `@keyframes blink` / `term-output`; core uses
  `ddd-blink` / `ddd-term-output` (namespaced to avoid collisions when the package is
  dropped into a foreign page). The selectors that reference them (`.cursor-block`,
  `[data-term-out].term-show`) come *from* core too, so they stay consistent. No app
  markup references the old names. Pixel-neutral.
- **`anim-off` adds `transition: none`.** Core's `html.anim-off` kills `animation`
  **and** `transition`; pagr's local copy killed only `animation`. This is a *more*
  complete kill-switch (the design-system author's intentional hardening). With the anim
  toggle *on* (default) there is no difference; with it *off*, hover/colour transitions
  also stop — which is the desired "animations off" behavior. Acceptable; note it in the
  PR description.
- **Base layer specificity.** pagr's old `@layer base * { @apply border-border … }` set
  the default border via Tailwind's `@apply`; core's `base.css` sets
  `*,*::before,*::after { border-color: var(--border) }` plus a `:focus-visible` ring
  directly. Same effective default border colour; core additionally provides a
  `:focus-visible` outline (an a11y improvement, not present in pagr before). Verify the
  focus ring looks right in all four themes (it uses `--ring`, which pagr already defines
  identically).
- **`tw-animate-css` + typography** remain pagr-local imports; the package does not bundle
  them. Order: `@import "tailwindcss"` → `@import "tw-animate-css"` →
  `@plugin "@tailwindcss/typography"` → `@import "@danieldeusing/design/tailwind.css"` →
  `@source …`.

## 4. Risks & mitigations

**A. Dropdown CSS drift (PR1, steps 1.3–1.4).** *Before* deleting pagr's local
`.dropdown*` and `.dropdown-panel--down`, byte-compare against core to be 100% sure
panel direction / `min-width` / `z-index` match (they do today, but verify so a future
core edit doesn't silently change pagr):

```bash
cd /Users/daniel/Work/danieldeusing
# core dropdown rules
sed -n '/^\.dropdown {/,/^\.eli5 {/p' danieldeusing-design/src/components.css
# pagr footer copy
sed -n '/<style is:global>/,/<\/style>/p' apps/pagr/src/components/Footer.astro
# eyeball: .dropdown-panel min-width:128px, z-index:50, bottom:calc(100% + 12px);
# .dropdown-panel--down top:calc(100% + 8px) left:0 right:auto. Must match.
```
If they ever diverge, keep pagr's copy and reconcile core separately — do **not** ship a
mismatch.

**B. `@source` purge (PR1, step 1.2).** If `@source
"../../node_modules/@danieldeusing/design"` is wrong or omitted, Tailwind tree-shakes the
package's component classes and the page renders **unstyled prompts/buttons/dropdowns**.
Mitigation: verify `.prompt`, `.btn-terminal`, `.glow`, `.dropdown` produce visible styles
in the built output. The depth is two levels (`src/styles/` → `src/` → pagr root). If pagr
ever hoists deps to a shared `node_modules`, re-point this path.

**C. `file:` dep is dev-only-ish (PR1, step 1.1).** A `file:` link works locally and in
the Cloudflare Pages build **only if** the design-system repo is present at build time. It
is not (the Pages build clones pagr alone). → **Before the first production deploy after
PR1**, switch the specifier to a pinned **git tag** or **published npm version** so the
package is fetchable in CI. This is the single most important non-visual follow-up. Track
it; do not deploy `file:` to prod.

**D. Theme/zoom flash regression (PR2).** Bundled (non-`is:inline`) `<script>` is deferred,
defeating pre-paint. Mitigation: keep the theme + zoom *apply* `is:inline` (option 1 in
§2.1) unless a throttled-reload check confirms no flash. The terminal typing extraction
(§2.3) is safe to bundle — it self-gates.

**E. `anim-off` pre-paint ordering (PR2, §2.3).** If you delete the pre-paint `"anim"`
read, the kill-switch is ignored on first load (motion plays for a frame before the footer
toggle re-syncs). Mitigation: keep the ~9-line `is:inline` snippet that sets
`html.anim-off` pre-paint; only the typing engine moves to `initTerminal()`.

**F. `term:contentdone` contract (PR2, §2.3).** The `ls -l` nav depends on this event +
`window.termContentDone`. Confirmed the package `initTerminal()` fires both identically. If
a future core change renames the event, the nav silently never runs — covered by the PR2
VERIFY checklist (nav must "run" after content prints).

## 5. Ordered execution summary

**PR1 (CSS base swap):**
1. Add `danieldeusing-design` (`file:` link) to `apps/pagr/package.json`; `pnpm install`.
2. Rewrite `src/styles/global.css`: prepend the two package imports + `@source`; delete
   the local palette/`@theme`/base/component-primitive blocks; keep `.prose-pagr` family
   + Shiki override.
3. Delete the byte-identical `.dropdown*` rules from `Footer.astro` (keep `.anim-toggle`).
4. Delete the byte-identical `.dropdown-panel--down` from `Header.astro` (keep `.ls-*`,
   `.nav-ctrl`, term-anim choreography).
5. Leave `Base.astro` scripts untouched.
6. **VERIFY:** build + four-theme pixel diff. Merge only if identical.
7. **Before prod deploy:** flip `file:` → pinned git tag / npm version (risk C).

**PR2 (runtime extraction):**
1. Replace the terminal typing IIFE with `initTerminal()`; keep the ~9-line `anim-off`
   pre-paint snippet `is:inline`.
2. Replace `Footer.astro`'s dropdown + theme-switch logic with `initDropdowns()` +
   `initThemeSwitcher({ faviconHref })`; delete the now-redundant `syncThemeLabel` /
   `themeBackgrounds`; keep the `[data-lang-value]` persist + anim toggle.
3. (Optional, only if verified flash-free) replace the theme + zoom pre-paint IIFEs with
   `applyStoredTheme({ faviconHref })` + `initResolutionZoom(1920)`; else keep them
   `is:inline`.
4. Leave all app-specific runtime local (language forward, history stack, `ls -l` nav,
   burger, lightbox/TOC/search).
5. **VERIFY:** build + four-theme pixel diff + runtime behavior checklist (§PR2 VERIFY).
