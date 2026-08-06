# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

jsDelivr serves the committed `dist/` bundle per git tag, so every release is cut as an
immutable tag (`vX.Y.Z`).

**Which url a consumer loads depends on whether its MARKUP is coupled to a release.** Daniel's
call, 2026-08-05, was "make all unpinned" — one design system, every surface on the current
version. That holds for surfaces that consume only tokens and visual identity (netmon, the docs
site, the seedr playgrounds, pagr-docs, morning-briefs): a stale cached stylesheet there just
means slightly older colours, never a broken page.

**It does NOT hold for a surface whose markup requires a specific release, which must PIN.**
Learned the hard way the same day: cockpit 2.65.0 shipped the `.ls-nav` rail markup while
loading the unpinned url — and jsDelivr serves that url with `max-age=604800`, **seven days in
the browser**. Every browser that had opened cockpit that week kept applying 0.1.6, which
predates the rail, so the new markup rendered against CSS that had never heard of it: both
toggles visible, the rail in flow, a 613px header. A release cannot fix that, because the url a
release publishes to is the one being cached — only changing the url does. Cockpit is therefore
pinned and bumps its pin with each adoption.

Either way: a publish is instantly live on every unpinned surface with no staging, so **look at
them after publishing**, and keep new CSS backward-compatible with the markup consumers still
ship (0.2.0's `html:has(.ls-nav)` guard is the worked example).

## 0.7.2 (2026-08-06)

**On a phone, a page that ships both nav forms showed its navigation TWICE.** `.mobile-nav`
predates the rail — it was the phone's only navigation back when the desktop nav was a
dropdown. Every cockpit page ships both, because one `NAV_ITEMS` array renders both, so the
whole tree appeared stacked on itself inside the burger. The mobile rule has said the flat list
*"replaces"* the rail since 0.2.0; it never actually hid anything.

`.site-nav:has(> .ls-nav) .mobile-nav { display: none }`. The rail wins because it is the one
carrying structure — groups, directories, the drawn nesting — while `.mobile-nav` is a flat
list of the same links. Hiding the OLDER form when the newer one is present is also what keeps
a pre-rail surface working untouched, and `:has()` degrades to the status quo rather than to a
page with no navigation at all.

Found by an agent converting the docs pages, which dropped `.mobile-nav` and got one list where
cockpit had two — the kind of thing that only shows up when two surfaces built from the same
vocabulary are compared side by side.

## 0.7.1 (2026-08-06)

**Print: `.tablewrap` was not in the "nothing scrolls on paper" rule.** 0.7.0 introduced the
class and the print layer still named only `.table-scroll`, the docs site's older private name
for the same idea. An `overflow-x` container has no scrollbar on paper — whatever sits past the
right edge is simply gone — so every newly-wrapped table was one `Cmd-P` away from losing its
last columns silently.

`.table-scroll` stays listed alongside it. Pages published under the old name are still on the
docs site and cannot be edited retroactively, and dropping the selector would start clipping
their tables with no visible cause.

## 0.7.0 (2026-08-06)

Daniel: *"the font size of container-page is different than on all other pages, e.g. cockpit.
Can we adjust but still having a proper table? The table (and all tables everywhere) should be
scrollable in x direction if content is bigger than width"*.

**`table { font-size: var(--fs-md) }` in base.css.** The type scale in 0.4.0 unified the
*steps* every surface could choose from; it did not stop them choosing differently. Cockpit's
documentation tables sat at `--fs-lg` (15px) while the containers dashboard's sat at
`--fs-base` (12px) — a 3px gap between two pages of the same site, set years apart and never
compared. A table cell is body copy: it is read, not scanned as chrome, so it takes the
body-copy step and surfaces stop deciding. One that genuinely differs still can, but it has to
say so rather than inherit an accident.

**`.tablewrap` + `runtime/tablescroll.js` — no table may push the page sideways.** A table
wider than the page is the commonest cause of a whole PAGE scrolling horizontally, and that is
the one layout failure that reads as broken: the header slides off, the fixed footer stops
reaching the edge, and body text needs two axes to read. The table is what is too wide, so the
table is what should scroll.

CSS cannot do this alone, which is why it is a runtime and not a rule. `overflow-x` has to sit
on an element WRAPPING the table; a table cannot wrap itself (`display: block` on a `<table>`
does make it scrollable and throws away the table layout algorithm, so columns stop aligning
across rows), and there is no selector for "my parent". So `initTableScroll()` walks the
document and gives every unwrapped table a `.tablewrap` parent.

The markup contract is therefore **nothing** — author a plain `<table>`. Pages that already
hand-wrapped theirs are left alone, so adopting this is never a migration, and it is safe to
call again after rendering more rows.

The right-edge fade is not decoration: a scroll container with a hard edge is
indistinguishable from a table that simply ends, so without it nobody knows to scroll. It
carries a `transparent` fallback on `--background` so an unpinned surface on an older build
fades to nothing rather than painting a grey bar over the last column.

`.tablewrap` had existed twice in cockpit — once in `portal.css` with the fade, once in
`index.html` with a border and no fade — which is the usual shape of a thing that should have
been upstream from the start.

## 0.6.0 (2026-08-06)

**`templates/page-chrome.html` — the standard chrome, written down.** Daniel, looking at
netmon: *"1) have `ls -l` right aligned 2) not a dropdown, but a sidebar (as cockpit). This
should be the case now for all (docs, netmon, cockpit, danieldeusing.de, container …)
3) have a footer and the theme switcher in the footer instead (also all should have the footer
and the controls in the footer)"*.

Every surface wears three pieces in one order — `header.bar` (brand left, the `ls -l` head
right), `.ls-nav` (the sticky right RAIL, always the rail, never a dropdown), and
`footer.status` (fixed, full width, and the home of EVERY control). The CSS for all of it has
shipped since 0.2.0. What had never been written down was the ARRANGEMENT, so each surface
arranged it privately: netmon grew its own header with the theme picker inside it and no footer
at all, while the docs pages and danieldeusing.de kept the pre-rail dropdown long after cockpit
moved on. Each was locally reasonable; together they stopped looking like one estate.

The template is the answer to "what does a page look like here?" and it carries the reasoning,
not just the tags:

- **the rail, not a dropdown** — a dropdown answers "where can I go?" only while you hold it
  open, and covers what you were reading to do it. The rail is the page's table of contents:
  always visible, always in the same place, hideable when you want the width back. It is also
  why the `ls -l` HEAD sits in the header bar and not in the rail — the toggle must stay put
  whether the rail is open or closed, so opening and closing changes the arrow and nothing else
  moves.
- **every control in the footer** — the header names the page, the footer operates it. Theme,
  language and animation are session preferences, not navigation. Mixing them into the header
  put a colour picker beside a brand on one surface and nowhere at all on another.
- **the two pre-paint reads**, inline in `<head>` before any stylesheet: theme and rail state.
  A module at the end of `<body>` runs after first paint, so a reader who chose green or hid
  the rail watches the default paint and then jump — on every page load.

`templates/` now ships in the package (`files`), so a consumer can read the canonical markup
from its own `node_modules` instead of copying whatever the nearest surface happens to do
today — which is how the pre-rail dropdown propagated in the first place.

## 0.5.0 (2026-08-05)

**`--info` and `--pending`, because three status accents cannot describe a state machine and
cockpit forked a literal for every state that was missing.** good / attention / bad is a verdict
vocabulary. It has no word for *in flight* and no word for *no answer yet* — and those are the
two states a dashboard spends most of its time showing. Lacking a token, cockpit picked hexes:
`#3f8fd9` and `#1a7f7f` for the first, `#7048e8`, `#9775fa` and `#b05fd9` for the second. Five
literals, two meanings, and **every one of the five missed AA 4.5:1 on warm — the default
theme**; `#7048e8` and `#1a7f7f` sat inside the 0.0692 luminance gap and cleared neither side,
so no amount of tuning at the call site could have saved them. That is the failure this release
fixes, and the fix has to be here because a per-theme value is the only kind that works.

- **`--info`** — a state, not a verdict: dispatching, gated, started by hand, "silent for a
  reason". Blue, so it never reads as an alarm.
  warm `#1c5f9e` 5.17 · green `#4dabf7` 7.57 · mono `#4dabf7` 7.63 · paper `#1c5f9e` 5.74.
- **`--pending`** — *no* verdict: still running, timed out, could not determine, not recorded.
  The answer is absent, which is a different thing from the answer being bad, and colouring it
  red says the opposite. Violet, so it never collapses into `--destructive`.
  warm `#5f3dc4` 5.58 · green `#b197fc` 7.77 · mono `#b197fc` 7.82 · paper `#5f3dc4` 6.19.

Ratios are the worst of `--background`, `--card` and `--muted` on that theme, measured rather
than eyeballed — the same three surfaces every other accent here is held to. Both follow the
shape the arithmetic forces: one value for the two light themes, one for the two near-black ones.

**What does NOT belong here, and the line is worth stating.** Cockpit also hardcodes a GitLab
orange. It stays in cockpit, per-theme, in cockpit's own stylesheet: a design system that knows
what GitLab is has a layering bug, and the next vendor would want the same favour. The rule that
falls out — *a token here names a STATE; a colour that names a THING belongs to the surface that
knows what the thing is* — is why this release adds two tokens and not three.

**Fixed: `tokens/tokens.json` had been dropping every warm colour since 0.4.0.** Adding the
layout scale gave `tokens.css` a *second* `:root` block, and the build assigned rather than
merged — so the second block replaced the first and the default theme exported the eleven
measurements with **not one colour**. It survived a release because the consumers of that file
are native/Figma exports nobody had regenerated. The CSS was never affected. Warm now exports
its full set, and this release's `--info`/`--pending` reach the JSON for all four themes.

## 0.4.0 (2026-08-05)

**Measurements are tokens now, because four surfaces had four answers.** Daniel: *"all pages
should behave the exact same (danieldeusing.de, cockpit, netmon, container, docs) regarding the
display and font size … same margins left and right … same font size depending of window size"*.

The audit that preceded this found the divergence real, and found that **none of it was
expressible here**: no width token, no type scale, so every surface picked a number in isolation
— cockpit `78rem`, netmon `1180px`, danieldeusing.de `72rem` (Tailwind `max-w-6xl`), the
containers dashboard none — and netmon additionally set a flat `font: 13px` where everything
else sat at `0.75rem`. Fixing that as five local edits would have produced five *new* numbers a
year from now, so the answer moves upstream:

- **`--content-w` (78rem) + `--content-pad` (1.5rem), and a `.wrap` that resolves them.** 78rem
  is cockpit's — the widest of the four, already tuned against the `ls -l` rail, and from the
  surface with the most page types; standardising on the narrowest would have reflowed every
  table. `.wrap` sets the **inline axis only**: vertical rhythm differs legitimately between a
  doc and a dashboard, and a shared rule that overreaches is precisely what earns a local
  override. Consumers set `padding-block` — the `padding` **shorthand** resets `padding-inline`
  and silently takes the margins back.
- **`--fs-xs … --fs-2xl`, `--lh-tight` / `--lh-base`.** The steps are 1px apart at the bottom on
  purpose: this is a terminal UI whose useful range is 10–15px, and a geometric ratio scale
  would give three usable steps then leap past everything that matters. `base.css` resolves the
  body against `--fs-base` instead of a literal.
- **Tailwind mapping** — `max-w-content`, `text-fs-*` — so an app consuming via `tailwind.css`
  reaches the same measurements as one loading the CDN bundle. Tailwind's own `text-xs` /
  `text-sm` / `text-base` are **deliberately left alone**: this scale bottoms out at 10px for
  terminal chrome, and remapping the default names would reskin every existing utility in a
  consuming app on upgrade. Opt in by name.

**The scale is only half of "same font size depending on window size", and the halves are easy
to conflate.** The scale fixes the **ratios** and does not track the viewport.
`initResolutionZoom()` (`runtime/zoom.js`, shipped since 0.1.x) is what makes a page track the
**window**, by laying out at a 1920px reference and zooming above it — and it works only if a
surface calls it pre-paint from `<head>`. Three of the five did. Scale without zoom is a page
frozen at one size on a 4K display; zoom without scale is uniform scaling of sizes that disagree
between pages.

## 0.3.4 (2026-08-05)

### Changed — nesting in the `ls -l` rail is drawn, not just indented
Whitespace alone was not carrying depth: with a permission column in front of every row a child
sat ~1rem right of its parent and the eye had nothing to follow. Three signals now:
- a **vertical guide per level** (`.ls-row--sub`, `.ls-row--sub2`) — stacked children form one
  continuous rule, which is what actually shows which parent a row belongs to;
- **directories** take `--primary` and bold via a new `.ls-row--dir` class, keyed on a class the
  renderer emits rather than the trailing slash in the label (CSS cannot select on text);
- **leaves** stay `--muted-foreground`.

The guide is the load-bearing one: colour alone fails on the two near-black themes and on paper.
Depth 2 is now a class instead of inline padding, so both levels are styled in one place.

## 0.3.3 (2026-08-05)

### Fixed — the seam between the rail and the chrome
`initLsNav()` set the inset to the chrome's exact measured height, and "exactly flush" turned
out to be a rounding coin-flip: `offsetHeight` is an INTEGER while the bar's real height is
fractional (44.97), and a zoomed layout multiplies the error — at `zoom: 1.25` the bar ended at
56.00 while a 45px inset put the rail at 56.25, a quarter-pixel line of page background that is
plainly visible on a wide screen. The rail now overlaps the chrome by **1px**. Both chrome
elements are opaque and sit above it (z-index 30 and 50 vs 25), so a pixel of tuck is invisible
where a pixel of gap is not — and the result no longer depends on rounding at all.

## 0.3.2 (2026-08-05)

### Changed — `ls -l` moves into the header bar, and the rail sits flush
- **`ls -l` is in the HEADER now**, not inside the rail. Daniel: *"the ls-l should be in the
  header"* — which is where it was before any of this, when it was a dropdown summary. That
  collapses the two toggles into **one control that never moves**: `.ls-nav-hide` and
  `.ls-nav-show` are replaced by a single `.ls-nav-toggle`, and open/closed is a pure CSS state
  change (the guillemet is generated by `::after`, so the arrow flips with nothing scripted).
  The rail below holds only the listing. **Markup change** — see the contract in `chrome.css`.
- **The rail is flush with the chrome.** `initLsNav()` measured with `getBoundingClientRect()`,
  which reports VISUAL pixels — already multiplied by any `zoom` on `<html>`. Consumers do set
  it (cockpit scales the layout to the viewport), so that number was zoomed a second time when
  written back as a CSS length, leaving the rail a few px below the bar with a visible seam.
  Now `offsetHeight`, which is layout px — the same unit the CSS is interpreted in. Verified at
  zoom 1 and 1.35: gaps 0.03px / 0px, identical at both.

### Changed — the ticker gets room to breathe
`.tickstrip` gains a top margin. Butted straight up against a page's lede it read as part of the
prose rather than as instrumentation.

## 0.3.1 (2026-08-05)

### Changed — the rail sits BETWEEN the chrome, and `ls -l` stops moving
- **The rail no longer overlays the header or the footer.** Daniel: *"the right sidebar then
  should not overlay footer and header. Footer and header wins."* It now runs from the bottom of
  the bar to the top of the status line, and both keep their full width. `--ls-nav-top` /
  `--ls-nav-bottom` are **measured off the real chrome** by `initLsNav()` (re-measured on resize
  and after webfonts land) rather than guessed at in CSS; the CSS carries fallbacks so a page
  that never runs the runtime still lays out sensibly.
- **`ls -l` is at the top right, open or shut** — the rail head and the tab that replaces it share
  `--ls-nav-top`, so the only thing that changes is which way the arrow points. The previous
  build centred the tab vertically on the right edge: correct for a drawer handle, wrong here,
  because it moved the one control the reader is hunting for to a place navigation has never been.
- Only the **header** gets the negative margin that pulls it back to full width. The footer is
  `position: fixed` with `inset-inline: 0`, so it ignores the body padding and was already full
  width — giving it the same margin pushed it 272px PAST the viewport edge (measured 1099px
  against an 842px viewport). Fixed and in-flow siblings look alike in markup and do not behave
  alike here.

### Added — zoomable diagrams (`runtime/diagramzoom.js`)
`initDiagramZoom()` makes every `.diagram` a real button: click or Enter/Space opens it
full-screen fitted to the viewport, then wheel zooms about the pointer, drag pans, and
`+`/`-`/`0` plus on-screen controls do the same. Escape or a backdrop click closes and returns
focus. An architecture diagram authored for a text column is unreadable at exactly the moment
someone needs it.
- The svg is **cloned, not moved**: mermaid holds references to the nodes it rendered and re-runs
  against them when a folded or tabbed diagram becomes visible, so moving the original out of the
  document and back is how a diagram silently stops updating.
- The clone is given the original's **measured pixel size**. A mermaid svg is sized by
  `width="100%"` plus an inline max-width; stripping those to "let it fill" leaves an svg with
  only a viewBox, which collapses to 0x0 in an auto-sized box — the first build did exactly that
  and fitted nothing.

### Changed — the ticker strip reads as status, not as brand
`ok` now uses the new per-theme `--success` instead of `--primary`: a healthy poller and the page
heading were the same ink, so "everything is fine" had to be read rather than seen. The row name
drops to `--foreground` for the same reason, each state gains a left edge-marker so a bad row is
findable by shape when the strip is scanned, and `next` is de-emphasised because it is a
prediction sitting beside a measurement.

## 0.3.0 (2026-08-05)

### Added
- **`--success` and `--warning`, per theme** — the design system shipped only `--destructive`,
  so every "good"/"caution" colour downstream had to be a literal, and a literal cannot be
  correct here. Measured worst case against each theme's `--background`, `--card` AND `--muted`:

  | | warm | green | mono | paper |
  |---|---|---|---|---|
  | `--success` | `#1a6b2e` 5.16:1 | `#4ade80` 10.76:1 | `#4ade80` 10.84:1 | `#1a7031` 5.36:1 |
  | `--warning` | `#845600` 4.97:1 | `#f5b32b` 10.15:1 | `#f5b32b` 10.22:1 | `#8f5d00` 4.89:1 |

  All twelve values (with `--destructive`, 5.68–6.24:1) clear **AA 4.5:1 on every surface**,
  re-derived from the committed file rather than from the values that were intended.

### Why they have to be per-theme (now written into `tokens.css`)
The two admissible luminance bands **do not overlap**: a light theme's darkest surface (warm's
`--muted` `#ece3cf`) demands `L <= 0.1328`, a dark theme's lightest (green's `--muted`
`#071509`) demands `L >= 0.2021` — a gap of 0.0692 with nothing in it. No single hex can serve
four themes; every compromise fails both sides. Cockpit's twelve hardcoded accents are the
worked example: all twelve miss AA on at least one theme and four sit inside the gap, clearing
neither. This is arithmetic, not taste, which is why each accent is declared four times.

Adding a status colour later: put a **token** here with its measured worst case in a trailing
comment. Tuning a literal at the call site forks the palette and fixes exactly one theme.

## 0.2.0 (2026-08-05)

### Added
- **`ls -l` site rail** (`src/chrome.css` + `runtime/lsnav.js`) — the navigation that was a
  dropdown is now a sticky, full-height panel on the **right**, **shown by default**. Content
  and the fixed footer shift left to sit against its edge. Hiding it leaves a labelled
  `« ls -l` tab on the screen edge, so a hidden rail stays discoverable by someone who did not
  hide it. The affordance is a guillemet, never a caret — a caret means "a menu drops from
  here", which is the thing this stopped being.
  - State persists in `localStorage` under `ls-nav` and **must be applied by an inline `<head>`
    script**, not by the runtime: the runtime is a module at the end of `<body>`, so a reader
    who hid the rail would watch it paint and then jump away on every page load. `initLsNav()`
    only wires the clicks. The snippet is in the `chrome.css` header comment.
  - Below the 48rem breakpoint the rail is not rendered; the burger keeps navigation.
  - The toggle is not animated on `body`/`footer`: animating padding reflows the whole document
    every frame, and these pages render tables of hundreds of rows. Only the rail's own
    `transform` transitions, which is composited.
- **Shared page vocabulary promoted from the cockpit portal** into `src/components.css`:
  `.tabs`/`.tab` (filled active tab), `.tickstrip`/`.ticktable` (the poller header strip),
  `details.fold` + `.fold-body`, and `.legend`. Each was built once and then wanted everywhere —
  the tabs had already drifted into four separate page style blocks before being consolidated.

### Compatibility
- **Safe to adopt before your markup changes.** The rail reserves its space only through
  `html:has(.ls-nav)`, so a consumer still shipping the old dropdown nav — or no nav at all —
  keeps its full width instead of growing a 17rem gutter with nothing in it. The pre-rail
  `.dropdown-panel.ls-panel` alignment is kept for the same reason. Both verified against a page
  built from the old markup, which is the case every unpinned surface hits first.
- `print.css` resets the body shift: hiding a fixed element does not reclaim the room something
  else was told to leave for it.

## 0.1.6 (2026-08-01)

### Added
- `src/print.css` — the print layer, imported last by both entry points. Paper is a
  different device, not a narrow screen: black on white regardless of the active theme,
  **12px body text** with a proportional heading scale (24/18/16/14px), page margins,
  sane page breaks (headings never orphaned, tables break between rows and repeat their
  header), and no screen chrome — the `header.bar`, `footer.status`, `ls -l` dropdown,
  burger nav, scanline overlay, phosphor glow and the **"On this page" `.toc`** are all
  dropped from the printout.
- Three fixes in there are load-bearing and easy to lose in a refactor:
  - **The terminal reveal is forced open.** `runtime/terminal.js` reveals a
    `[data-term-out]` only when its section scrolls into view, so a long page printed
    straight after load had most of its content at `visibility: hidden` — it printed
    blank, silently, and the reader only found out on paper.
  - **`zoom` is reset to 1.** Pages using the resolution-independent zoom
    (`html.style.zoom = innerWidth / 1920`) carried that multiplier into the print box.
    That is what made printouts come out oversized.
  - **Mermaid SVGs are repainted for paper.** Mermaid bakes the active theme's colours
    into the SVG at render time, so a diagram rendered under `green`/`mono` printed as
    dark boxes with invisible labels no matter what the page tokens said.
- Overflow containers (`.table-scroll`, `pre`, `.diagram`) wrap instead of scrolling —
  in print there is no scrollbar, so anything past the right edge was simply lost.

## 0.1.5 (2026-07-09)

### Added
- `[data-tip]` tooltip system: `runtime/tooltip.js` (`initTooltips()`) + `src/tooltip.css`.
  Body-level singleton, `position: fixed`, viewport-clamped (clamps horizontally, flips
  above when out of room) — tooltips are never cut off and always render on top of any
  overflow/clip context. Event-delegated (dynamic nodes work), hover + keyboard focus.

### Fixed
- `.worktrees/` (hermes tester worktrees) untracked + gitignored; was accidentally
  committed once, never published (npm `files` whitelist).

## 0.1.4 (2026-07-05)

- **chrome kit** (`src/chrome.css`): the full app chrome as reusable components —
  sticky `header.bar`, fixed `footer.status`, skip-link/visually-hidden helpers,
  `ls -l` listing rows (`.ls-row`/`.ls-perm`/`.ls-panel`, right-anchored), and the
  responsive site nav: desktop dropdown, **mobile burger** (`.nav-burger` +
  `.site-nav`/`.mobile-nav`) with the **footer folded into the menu**
  (`.mobile-footer`) and the fixed footer hidden below 48rem — the
  danieldeusing.de pattern, extracted so apps stop rebuilding it.
- **runtime**: `initBurgerNav()` (`runtime/nav.js`) — burger toggle,
  outside-click + Escape close, aria-expanded sync.
- template updated to use the chrome kit.

## [Unreleased]

## [0.1.2] — 2026-06-27

Make the chrome controls reusable so every consumer (apps + one-page docs) shares them.

### Added

- **`.anim-toggle`** component class + **`initAnimToggle()`** runtime — a footer/status-bar
  "animations on/off" control wired to `html.anim-off` + `localStorage "anim"` (was duplicated
  inline in each app).

### Changed

- **`initThemeSwitcher()`** now closes the enclosing `<details class="dropdown">` after a theme
  is picked (no-op when the switcher isn't inside a dropdown).

## [0.1.1] — 2026-06-26

Sync the core with the canonical terminal animation as it evolved in pagr.

### Added

- **Per-card child-cascade reveal**: a revealed `[data-term-out]` now staggers its direct
  children (rows/lines) in one by one — applies to every card on every page.

### Changed

- `html.anim-off` now hides the cursor with `display: none` (was `opacity`) and kills only
  keyframe animations, not transitions.
- `runtime/terminal.js` gate now reads `localStorage "anim"`: an explicit pick wins over the
  OS reduced-motion setting (explicit `"on"` animates even under reduced motion), and box
  reveals run non-blocking so the next prompt keeps typing.

## [0.1.0] — 2026-06-26

Initial extraction of the terminal design system shared by danieldeusing.de and seedr into a
standalone, framework-agnostic package.

### Added

- **Tokens** (`src/tokens.css`): the four themes — `warm`, `green`, `mono`, `paper` — as plain
  CSS custom properties (18 palette tokens + `--glow`/`--glow-soft`/`--scanline-opacity` +
  `--radius` + `--font-mono`).
- **Base** (`src/base.css`): monospace body, CRT scanline overlay, themed border colour, focus
  ring, `::selection` — plus a minimal `src/reset.css` for the build-free path.
- **Components** (`src/components.css`): `.glow`, `.prompt`, `.comment`, `.cursor-block`,
  `.btn-terminal`, `.link-quiet`, `.card-terminal`, `.ascii-rule`, the `.dropdown` system,
  `.eli5`, the `[data-term]` typing-animation contract, and the `html.anim-off` kill-switch — all
  plain CSS, no `@apply`.
- **Tailwind v4 entry** (`src/tailwind.css`): `@theme inline` mapping the tokens to
  `--color-*`/`--font-*`/`--radius-*` utilities.
- **Runtime** (`runtime/*.js`): dependency-free ESM for theme switching, the terminal typing
  animation, dropdown behaviour, and resolution-independent zoom.
- **Webfont** (`src/fonts.css`): optional pinned JetBrains Mono Variable for the build-free path.
- **Distribution**: committed `dist/` bundle (+ minified) for jsDelivr, generated
  `tokens/tokens.json` for native consumers, and an npm `exports` map.
- **Docs**: `examples/style-guide.html`, `templates/documentation.html`, and migration plans
  under `docs/migrations/`.

[Unreleased]: https://github.com/danieldeusing/danieldeusing-design/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/danieldeusing/danieldeusing-design/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/danieldeusing/danieldeusing-design/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/danieldeusing/danieldeusing-design/releases/tag/v0.1.0
