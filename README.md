# danieldeusing-design

The shared **terminal design system** behind [danieldeusing.de](https://danieldeusing.de),
[seedr](https://seedr.danieldeusing.de), and [briefs](https://briefs.danieldeusing.de):
CRT phosphor on JetBrains Mono, `$`-prompts, ASCII rules, a scanline overlay, and four
switchable themes — `warm` (default), `green`, `mono`, `paper`.

It is **framework-agnostic and build-free at its core**: plain CSS custom properties plus a
small component layer, with an optional Tailwind v4 mapping and a dependency-free vanilla-JS
runtime. The same files dress an Astro site, a React/Vite app, an Angular app, a Tauri
webview, or a single static HTML file served straight off a CDN.

```
warm   ▓ #f5efe2 on #43352a   the default — warm paper, sepia ink
green  ▓ #020604 on #4fdd7d   CRT phosphor green
mono   ▓ #050505 on #d4d4d4   white-phosphor terminal
paper  ▓ #fafafa on #1f1f1f   black-on-white (e-ink / printout)
```

## Quick start

### 1. A single HTML file (no build step)

Link the built bundle from jsDelivr and you have the whole look. **Whether to pin depends on the
markup, not the page.** A page that ships the system's markup — the rail, tabs, dialogs, anything
the runtime enhances, as this example does — pins a release tag and bumps it in the same commit as
the markup that needs it, because jsDelivr caches an unpinned url for seven days in the browser and
markup newer than a cached stylesheet comes apart. A page that only wears the look (tokens, fonts,
colours) stays on the unpinned url and follows every release. Never `@main`. The skill's "Pin or
unpin" section has the reasoning.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f5efe2" />

    <!-- pre-paint: apply the saved theme before first paint. NOTHING ELSE - see below. -->
    <script>
      (() => {
        const bg = { warm: "#f5efe2", green: "#020604", mono: "#050505", paper: "#fafafa" };
        let t = "warm";
        try { const s = localStorage.getItem("theme"); if (s && s in bg) t = s; } catch {}
        document.documentElement.dataset.theme = t;
        document.querySelector('meta[name=theme-color]')?.setAttribute("content", bg[t]);
      })();
    </script>

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.62.0/dist/danieldeusing-design.min.css" />
    <!-- optional: the real JetBrains Mono webfont (otherwise falls back to Menlo) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.62.0/src/fonts.css" />
  </head>
  <body>
    <p class="prompt">cat hello.txt</p>
    <h1 class="glow">It works.</h1>
    <a class="btn-terminal" href="#">run</a>

    <script type="module">
      import { initThemeSwitcher, initDropdowns, initTerminal } from
        "https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.62.0/runtime/index.js";
      initThemeSwitcher();
      initDropdowns();
      initTerminal();
    </script>
  </body>
</html>
```

> **There is deliberately no `style.zoom` in that block, and no wide-screen scaling at all.**
> From 0.29.0 to 0.55.0 `tokens.css` grew the root font size above 1920px; 0.56.0 removed it,
> because everything sized in px stayed behind while the text doubled. A page caps at
> `--content-w` and the root font size is the browser's own. Never set `zoom` on a page: it scales
> the coordinate *space*, so anything injected from outside the document (a password manager's
> dropdown, a translation bar) is measured through one grid and positioned in another. Measured on
> a real login page, the dropdown landed 1.9x down and across from its field.
> `initResolutionZoom()` still exists and is a no-op; calling it is dead code.
>
> The pins above name the current release, and `scripts/check-readme-pins.mjs` fails the build if
> they drift from `package.json`. This quick start once shipped pinned to `0.1.2` for many
> releases, so the most visible thing a new surface copies was wrong.

Need a starting point? Copy the standard chrome in
[`templates/page-chrome.html`](templates/page-chrome.html), or the one-page documentation template
at [`templates/documentation.html`](templates/documentation.html). The pages in
[`examples/`](examples/) show every component, one reference per page.

### 2. A Tailwind v4 app (Astro, Vite, …)

Install, then import the Tailwind entry **after** Tailwind itself in your main CSS:

```css
@import "tailwindcss";
@import "@danieldeusing/design/tailwind.css";

/* REQUIRED so Tailwind sees the core component classes (.prompt, .btn-terminal, …)
   in this package and doesn't tree-shake them away. Adjust the relative depth so it
   resolves to node_modules from this file's location. */
@source "../node_modules/@danieldeusing/design";
```

You now get the tokens, base layer, components, **and** Tailwind utilities wired to the live
theme — `bg-background`, `text-foreground`, `border-border`, `font-mono`, etc. all follow
`html[data-theme]` at runtime.

### 3. Plain CSS — React, Angular, Vue, Tauri (no Tailwind)

Import the build-free bundle once, anywhere your bundler handles CSS:

```js
import "@danieldeusing/design"; // the "." export = the full bundle: every stylesheet but fonts.css
```

Every stylesheet is exported on its own too (`@danieldeusing/design/<file>.css`): `tokens.css`,
`reset.css`, `base.css`, `fonts.css`, `components.css`, `chrome.css`, `icons.css`, `controls.css`,
`tags.css`, `feedback.css`, `filters.css`, `data.css`, `cards.css`, `overlays.css`, `content.css`,
`tooltip.css`, `utilities.css`, `print.css`. Every one except `components.css` renders on
`tokens.css` alone; `components.css` is not separable (the design skill's `SKILL.md` says why).

## Runtime (optional)

27 dependency-free ES modules, re-exported from `@danieldeusing/design/runtime` and importable one
by one from `@danieldeusing/design/runtime/<module>`. Nothing runs at import, so a server-side
render can import the barrel, and every `init*()` is called once per page: a delegated listener or
a MutationObserver reaches what is rendered later. The ones most pages call:

| Import | Purpose |
| --- | --- |
| `applyStoredTheme()` | Apply the saved theme. **Call inline in `<head>` pre-paint** to avoid a flash. |
| `setTheme(name)` / `initThemeSwitcher()` | Switch themes; wire `[data-theme-value]` buttons and `[data-theme-label]`, and mark the theme in force with a ✓ (no CSS rule marks it). |
| `initDropdowns()` | Every `<details class="dropdown">`: an ARIA menu with arrow keys and typeahead, one open at a time, click-away, Escape. |
| `initSelects()` | Replaces the OS dropdown on every `<select>` with the themed listbox. Markup contract: none. The `<select>` keeps the value and still fires `input`/`change`. |
| `initTableTools()` | Every `<table data-table-tools>`: a search box above it, per-column sort and filter controls in its header, a filtering column marked with a badge naming its value, and a result count. Markup contract: `<th data-col="key">`. A `data-table-id` keys the view each reader's browser remembers. |
| `initTablePagination()` | Pages every `<table data-table-id>` to 20 rows, with a 5/10/20/50/100/200 picker remembered per table. It has no sort and no filter: it hides all but one window of the rows a page has **already** filtered and sorted. A table without a `data-table-id` is left alone. |
| `initTooltips()` | One panel for every `[data-tip]` (below). |
| `initBurgerNav()` / `initLsNav()` | The phone burger, and the `ls -l` rail and chrome measurements. |
| `initTerminal()` / `initAnimToggle()` | The `$ command` typing animation, and the `[data-anim-toggle]` switch for `html.anim-off`. |

```js
import { applyStoredTheme, initThemeSwitcher, initDropdowns, initSelects, initTablePagination, initTerminal, initAnimToggle } from "@danieldeusing/design/runtime";
applyStoredTheme();       // ideally inline, pre-paint
initThemeSwitcher();
initDropdowns();
initSelects();
initTablePagination();
initTerminal();
initAnimToggle();
```

Every function, with its markup contract, is in the skill's
[`references/runtime.md`](.claude/skills/danieldeusing-design/references/runtime.md).

The runtime is **progressive enhancement**: with JS disabled, or `prefers-reduced-motion`, all
content is visible and the theme defaults to `warm`. A per-theme favicon swap is opt-in via
`applyStoredTheme({ faviconHref: (t) => \`/favicon-\${t}.svg\` })`.

## Tokens

The source of truth is [`src/tokens.css`](src/tokens.css): 22 semantic palette tokens (the shadcn
names plus `--success`, `--warning`, `--info` and `--pending`), twelve categorical hues
(`--cat-red` … `--cat-pink`), three CRT-atmosphere tokens (`--glow`, `--glow-soft`,
`--scanline-opacity`), `--backdrop`, `--radius` (0 everywhere) and `--font-mono`, each declared for
all four themes; and the layout, type, control, icon and elevation tokens (`--content-w`, `--fs-*`,
`--control-h`, `--card-pad`, `--icon-*`, `--elev-*`), which do not vary by theme.

For native / Tauri / Figma consumers, the build derives a machine-readable
[`tokens/tokens.json`](tokens/tokens.json) (values grouped by theme) from `tokens.css`.

## Components

Plain-CSS classes, usable anywhere, one stylesheet per family: the chrome (`chrome.css`: the
header, the `ls -l` rail, the status footer, a table of contents), buttons, cards, dropdowns and
selects (`components.css`), icons (`icons.css`), controls (`controls.css`), tags and counts
(`tags.css`), empty states, notices and banners (`feedback.css`), search, sort and filters
(`filters.css`), tables, tabs and charts (`data.css`), card contents and lists (`cards.css`),
dialogs and menus (`overlays.css`), and titles, prose and code (`content.css`). The `html.anim-off`
kill switch is in `tokens.css`.

The whole vocabulary, with the markup each class expects, is the table in the skill's
[`SKILL.md`](.claude/skills/danieldeusing-design/SKILL.md), and one reference per family sits
beside it in `references/`.

## Tooltips: `data-tip`, never `title`

```html
<span data-tip="Explanation shown instantly on hover">metric</span>
```

`initTooltips()` renders one viewport-clamped panel for every `[data-tip]` on the page, including
nodes added later. **Do not use the native `title` attribute for explanatory text.** A `title` waits
about a second before appearing, is unstyled, is unreachable by keyboard on most engines, and does
not exist at all on a touch screen — so on a phone the explanation is simply gone.

**`title` does two unrelated jobs, and only one of them is a tooltip.** Getting this wrong is a
silent accessibility regression that reads as a tidy-up in the diff:

| the element | what `title` was doing | what to write |
| --- | --- | --- |
| has visible text | a description | `data-tip` |
| an icon button, no text | the accessible **name** | `aria-label` |
| an icon button that also wants a hover | both | `aria-label` **and** `data-tip` |
| `<iframe>` / `<svg>` | the accessible name | leave `title` — there is no hover to replace |

The panel sets `aria-describedby` on the anchor while it is shown and removes it on hide, so a
`data-tip` is announced the way a `title` was. An `<option>`'s `title`/`data-tip` is carried onto the
rendered `.select-option` by `initSelects()` — before 0.26.0 it was dropped, so per-option
explanations were unreachable no matter which attribute they used.

## Repo layout

```
src/          the 18 stylesheets, index.css (the bundle) and tailwind.css (the Tailwind v4 entry)
runtime/      27 dependency-free ES modules and index.js (the barrel)
dist/         danieldeusing-design.css + .min.css   (committed — jsDelivr serves these)
tokens/       tokens.json                            (committed — generated from tokens.css)
examples/     one page per reference, every component rendered (not published to npm)
templates/    page-chrome.html · documentation.html · error-page.html
docs/         migrations/                            (what a surface changes to adopt a release)
scripts/      build.mjs and the check-*.mjs suites   (zero-dependency build and checks)
.claude/skills/danieldeusing-design/                 (the skill: SKILL.md and references/)
```

## Build

Zero dependencies. The build inlines `index.css`'s imports into the `dist/` bundle, minifies it,
and regenerates `tokens.json`:

```sh
npm run build
```

`dist/` and `tokens/tokens.json` are **committed on purpose** — jsDelivr serves the committed
bundle straight from GitHub, so rebuild and commit them before tagging a release.

## License

MIT © Daniel Deusing
