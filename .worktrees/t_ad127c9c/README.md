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

    <!-- pre-paint: apply the saved theme + resolution zoom before first paint -->
    <script>
      (() => {
        const bg = { warm: "#f5efe2", green: "#020604", mono: "#050505", paper: "#fafafa" };
        let t = "warm";
        try { const s = localStorage.getItem("theme"); if (s && s in bg) t = s; } catch {}
        document.documentElement.dataset.theme = t;
        document.querySelector('meta[name=theme-color]')?.setAttribute("content", bg[t]);
      })();
      // resolution-independent zoom: scale the whole layout up past a 1920px reference
      (() => {
        const z = () => { document.documentElement.style.zoom = String(Math.max(1, innerWidth / 1920)); };
        z(); addEventListener("resize", z);
      })();
    </script>

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.1.2/dist/danieldeusing-design.min.css" />
    <!-- optional: the real JetBrains Mono webfont (otherwise falls back to Menlo) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.1.2/src/fonts.css" />
  </head>
  <body>
    <p class="prompt">cat hello.txt</p>
    <h1 class="glow">It works.</h1>
    <a class="btn-terminal" href="#">run</a>

    <script type="module">
      import { initThemeSwitcher, initDropdowns, initTerminal } from
        "https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.1.2/runtime/index.js";
      initThemeSwitcher();
      initDropdowns();
      initTerminal();
    </script>
  </body>
</html>
```

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
| `initAnimToggle()` | Wire `[data-anim-toggle]` buttons (`.anim-toggle`) to flip `html.anim-off` + persist it. |
| `initResolutionZoom(1920)` | Scale the whole layout up on screens wider than the reference width. |

```js
import { applyStoredTheme, initThemeSwitcher, initDropdowns, initTerminal, initAnimToggle, initResolutionZoom } from "@danieldeusing/design/runtime";
applyStoredTheme();       // ideally inline, pre-paint
initResolutionZoom();     // ideally inline, pre-paint (no flash)
initThemeSwitcher();
initDropdowns();
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
