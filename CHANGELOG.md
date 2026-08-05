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
