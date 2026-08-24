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

Link the built bundle from jsDelivr and you have the whole look. **Pin a release tag** — never
`@latest` or `@main` in production (mutable refs cache for days on the CDN).

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

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.46.0/dist/danieldeusing-design.min.css" />
    <!-- optional: the real JetBrains Mono webfont (otherwise falls back to Menlo) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.46.0/src/fonts.css" />
  </head>
  <body>
    <p class="prompt">cat hello.txt</p>
    <h1 class="glow">It works.</h1>
    <a class="btn-terminal" href="#">run</a>

    <script type="module">
      import { initThemeSwitcher, initDropdowns, initTerminal } from
        "https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.46.0/runtime/index.js";
      initThemeSwitcher();
      initDropdowns();
      initTerminal();
    </script>
  </body>
</html>
```

> **There is deliberately no `style.zoom` in that block.** Scaling above the 1920px reference
> has been pure CSS since **0.29.0** - one `font-size: max(...)` declaration in `tokens.css`,
> applied by loading the stylesheet. A page that ALSO sets `document.documentElement.style.zoom`
> scales **twice**, and `zoom` additionally scales the coordinate *space*, so anything injected
> from outside the document (a password manager's dropdown, a translation bar) is measured
> through one grid and positioned in another - measured on a real login page, the dropdown
> landed 1.9x down and across from its field. `initResolutionZoom()` still exists and is a
> no-op; calling it is dead code.
>
> The pins above are `0.45.0`, the current release, and
> `scripts/check-readme-pins.mjs` fails the build if they drift from `package.json`. This quick
> start shipped pinned to `0.1.2` for many releases - a version from before the zoom was
> removed - so the two most visible things a new surface copies were both wrong.


Need a starting point? Copy [`examples/style-guide.html`](examples/style-guide.html) or the
documentation template at [`templates/documentation.html`](templates/documentation.html).

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
import "@danieldeusing/design"; // the "." export = the full bundle (reset + tokens + base + components)
```

Individual layers are exported too: `@danieldeusing/design/tokens.css`, `…/base.css`,
`…/components.css`, `…/reset.css`, `…/fonts.css`.

## Runtime (optional)

Four dependency-free ES modules, tree-shakeable from `@danieldeusing/design/runtime`:

| Import | Purpose |
| --- | --- |
| `applyStoredTheme()` | Apply the saved theme. **Call inline in `<head>` pre-paint** to avoid a flash. |
| `setTheme(name)` / `initThemeSwitcher()` | Switch themes and wire `[data-theme-value]` buttons + `[data-theme-label]`. |
| `initTerminal()` | The `$ command` typing animation. No-ops under reduced motion / `html.anim-off`. |
| `initDropdowns()` | `<details class="dropdown">` behaviour: one-open, click-away, Escape. |
| `initSelects()` | Replaces the OS dropdown on every `<select>` with the themed listbox — the option list is painted outside the page, so CSS alone can never reach it. Markup contract: none. The `<select>` keeps the value and still fires `input`/`change`, and selects rendered later are enhanced on their own. |
| `initTablePagination()` | Page every `<table data-table-id>` to 20 rows, with a 5/10/20/50/100/200 picker remembered per table. It has no sort and no filter — it hides all but one window of the rows a page has **already** filtered and sorted, so the order is always filter → sort → slice over the full set. A table without a `data-table-id` is left alone. |
| `initTableTools()` | Give every `<table data-table-tools>` a search box, per-column sort and filter controls in its header, and a bar naming whatever is in force. Markup contract: `<th data-col="key">`. Optional `data-filter="pick"` for a value list built from the column's own cells, `data-sort-type="num"`, and `data-value` on a `<td>` to sort by something it does not print. The view is remembered per table. |
| `initAnimToggle()` | Wire `[data-anim-toggle]` buttons (`.anim-toggle`) to flip `html.anim-off` + persist it. |
| `initResolutionZoom(1920)` | **Deprecated since 0.29.0 — a no-op.** Scaling above 1920 is CSS now (the fluid root font size in `tokens.css`), so it needs no script. Kept exported so a surface can bump its pin without editing its `<head>` in the same commit. Delete the call, and any inline pre-paint zoom block with it: a page that still sets `style.zoom` on top of 0.29.0 scales twice. |

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

The runtime is **progressive enhancement**: with JS disabled, or `prefers-reduced-motion`, all
content is visible and the theme defaults to `warm`. A per-theme favicon swap is opt-in via
`applyStoredTheme({ faviconHref: (t) => \`/favicon-\${t}.svg\` })`.

## Tokens

The source of truth is [`src/tokens.css`](src/tokens.css) — 18 semantic palette tokens (shadcn
naming), three CRT-atmosphere tokens (`--glow`, `--glow-soft`, `--scanline-opacity`), `--radius`
(0 everywhere), and `--font-mono`, each declared for all four themes.

For native / Tauri / Figma consumers, the build derives a machine-readable
[`tokens/tokens.json`](tokens/tokens.json) (values grouped by theme) from `tokens.css`.

## Components

Plain-CSS primitives in [`src/components.css`](src/components.css), usable anywhere:

`.glow` / `.glow-lg` · `.prompt` (`$ ` prefix) · `.comment` (`# ` prefix) · `.cursor-block`
(blinking caret) · `.btn-terminal` (`> ` CTA) · `.link-quiet` · `.card-terminal` · `.ascii-rule`
· `.dropdown` / `.dropdown-panel` / `.dropdown-item` · `.eli5` / `.eli5-term` (callout) ·
the `[data-term]` / `[data-term-out]` typing-animation contract · the `html.anim-off`
kill-switch.

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
src/          tokens.css · reset.css · base.css · components.css · index.css · tailwind.css · fonts.css
runtime/      theme.js · terminal.js · dropdown.js · zoom.js · index.js  (dependency-free ESM)
dist/         danieldeusing-design.css + .min.css   (committed — jsDelivr serves these)
tokens/       tokens.json                            (committed — generated from tokens.css)
examples/     style-guide.html                       (living showcase of every token + component)
templates/    documentation.html                     (one-page doc template)
docs/         migrations/                            (plans for adopting this in the apps)
scripts/      build.mjs                              (zero-dependency build)
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
