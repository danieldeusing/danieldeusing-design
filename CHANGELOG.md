# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

jsDelivr serves the committed `dist/` bundle per git tag, so every release is cut as an
immutable tag (`vX.Y.Z`). Pin that tag in production CDN URLs.

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
