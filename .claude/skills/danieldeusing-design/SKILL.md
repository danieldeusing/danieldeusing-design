---
name: danieldeusing-design
description: >-
  How to build a page, app or dashboard that looks like the rest of the danieldeusing
  estate — the terminal design system (@danieldeusing/design): the four themes and
  html[data-theme], the colour/layout/type tokens, the shared component vocabulary
  (.tab/.tabs, .tickstrip, .legend, details.fold, the `ls -l` rail, .dgm-* diagram zoom,
  .wrap), the vanilla-JS runtime, and the pin-vs-unpin rule for the jsDelivr CDN. Use when
  building or restyling ANY danieldeusing surface (cockpit, netmon, docs, seedr, pagr /
  danieldeusing.de, briefs, a new tool), when picking a colour / font-size / page width,
  when a page "doesn't look like the others", when adopting a new design-system release, or
  before writing ANY CSS for a danieldeusing page.
---

# danieldeusing-design

The terminal design system every danieldeusing surface wears: CRT phosphor on JetBrains Mono,
`$`-prompts, ASCII rules, a scanline overlay, four switchable themes. Framework-agnostic plain
CSS + a dependency-free ES-module runtime. Repo: this one
(`/Users/daniel/Work/danieldeusing/danieldeusing-design`), published as `@danieldeusing/design`.

**The one thing to internalise:** a surface brings its *layout*; the system brings *everything
else*. Every colour, every font size, the content width, the chrome and the shared components
already exist here. Writing a local value is not a shortcut — it is a fork that silently
disagrees with four other pages and, for colour, is provably wrong on at least one theme.

## Load it — build-free, one file

```html
<head>
  <meta name="theme-color" content="#f5efe2" />

  <!-- PRE-PAINT, inline, before any stylesheet. Theme + zoom must be settled before
       first paint or the page visibly flashes the wrong one. -->
  <script>
    (() => {
      const bg = { warm: "#f5efe2", green: "#020604", mono: "#050505", paper: "#fafafa" };
      let t = "warm";
      try { const s = localStorage.getItem("theme"); if (s && s in bg) t = s; } catch {}
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg[t]);
      let animOff = matchMedia("(prefers-reduced-motion: reduce)").matches;
      try { if (localStorage.getItem("anim") === "off") animOff = true; } catch {}
      if (animOff) document.documentElement.classList.add("anim-off");
    })();
    // resolution zoom — lay out at a 1920px reference, scale up past it, never below 1×
    (() => {
      const z = () => { document.documentElement.style.zoom = String(Math.max(1, innerWidth / 1920)); };
      z(); addEventListener("resize", z);
    })();
  </script>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design/dist/danieldeusing-design.min.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design/src/fonts.css" />
</head>
```

Other entry points: `@danieldeusing/design` (npm, the `.` export = full bundle) ·
`@danieldeusing/design/tailwind.css` (Tailwind v4 — import *after* `tailwindcss`, and add
`@source "../node_modules/@danieldeusing/design";` or Tailwind tree-shakes the component
classes away) · `@danieldeusing/design/tokens.css` alone, for a surface that wants only the
palette and none of the look (netmon does exactly this).

## Themes: four, selected by `html[data-theme]`

`warm` (default, warm paper / sepia ink) · `green` (CRT phosphor) · `mono` (white phosphor) ·
`paper` (black on white, e-ink / printout). `:root` carries the warm values, so the page works
with no attribute set. The choice persists in `localStorage["theme"]` — **the same key on every
surface**, which is why picking a theme in the cockpit carries into the embedded netmon.

Anything you build must be legible in all four. Test by flipping the attribute, not by trusting
that it "should be fine": the two near-black themes and the two light ones fail in opposite
directions.

## Colour: every value is a token, and a literal hex is never acceptable

Not a style preference — arithmetic. A status colour has to clear WCAG AA 4.5:1 against every
surface it can land on (`--background`, `--card`, `--muted`). Do that across the four themes and
the admissible luminance bands **do not overlap**:

```
light themes: darkest surface warm  --muted #ece3cf  ->  accent L <= 0.1328
dark themes:  lightest surface green --muted #071509  ->  accent L >= 0.2021
```

A gap of 0.0692 with nothing in it. No single hex can serve four themes — the dark themes need a
light tint, the light themes a dark one, and every compromise fails both. That is why
`--destructive`, `--success`, `--warning`, `--info` and `--pending` are each declared **four
times**. Cockpit carried twelve hardcoded accents that predated the tokens; every one missed AA
on at least one theme and four sat inside the gap, clearing neither side.

- Use the semantic tokens: `--background --foreground --card --card-foreground --popover(-foreground)
  --primary(-foreground) --secondary(-foreground) --muted --muted-foreground --accent(-foreground)
  --destructive --success --warning --info --pending --border --input --ring`, plus the CRT
  atmosphere `--glow --glow-soft --scanline-opacity`, `--radius` (0 everywhere) and `--font-mono`.
- **Five status accents, not three** (0.5.0). good / attention / bad is a *verdict* vocabulary and
  a dashboard mostly shows neither: `--info` is a state, not a verdict (in flight, gated, started
  by hand, deliberately silent — blue, never an alarm); `--pending` is the *absence* of a verdict
  (still running, timed out, could not determine — violet, never `--destructive`, because "no
  answer" is not "bad answer"). Reach for these before inventing a hue.
- Need a colour the system has no token for? **Add the token here, four times, with its measured
  worst-case contrast ratio in a trailing comment** (see `src/tokens.css`). Do not tune a literal
  at the call site — that forks the palette and fixes exactly one theme. But a token here names a
  **state**; a colour that names a **thing** (a vendor, an agent, a chart series) belongs to the
  surface that knows what the thing is — per-theme, in that surface's own stylesheet. Cockpit's
  GitLab orange is the worked example of the second kind.
- The only legitimate literal is a *fallback inside a var()*: `var(--background, #f5efe2)` takes
  the published token when the stylesheet arrived and the literal when it did not.
  `deploy/netmon/index.html` in `danieldeusing-infra` is the worked example, including why it
  beats a second stylesheet request. See "Pin or unpin" below — an unpinned consumer needs this
  for *measurements* too, not just colour.
- Deriving a shade: `color-mix(in srgb, var(--primary) 10%, transparent)` — the system does this
  itself for hovers. Still a token, still per-theme.

## Measurements: one column, one type scale (0.4.0)

Colours are declared four times because arithmetic forces it. Measurements are the opposite:
one right answer, and it must not vary by theme, page or surface. Audited 2026-08-05, five
surfaces had **four** content widths (78rem / 1180px / 72rem / none) and netmon a flat `13px`
where everything else sat at `0.75rem` — because the system offered no token to inherit.

```css
--content-w: 78rem;     --content-pad: 1.5rem;
--fs-xs: 0.625rem;  /* 10px — micro-labels, badges, meta lines */
--fs-sm: 0.6875rem; /* 11px — secondary / muted copy */
--fs-base: 0.75rem; /* 12px — body; base.css sets it on <body> */
--fs-md: 0.8125rem; /* 13px — emphasised body, card headings, table headers */
--fs-lg: 0.9375rem; /* 15px — h3 / section heads */
--fs-xl: 1.125rem;  /* 18px — h2 / page title */
--fs-2xl: 1.5rem;   /* 24px — h1 / hero, display only */
--lh-tight: 1.3;    --lh-base: 1.5;
```

- **`.wrap` resolves the column** (`max-width: var(--content-w); margin-inline: auto;
  padding-inline: var(--content-pad)`). Use it, and never restate a bare `78rem` locally. A
  build-free page on an **unpinned** url writes the tokens itself *with literal fallbacks* —
  `max-width: var(--content-w, 78rem)` — because `.wrap` itself only exists from 0.4.0; see
  "Pin or unpin".
- **`.wrap` sets the inline axis ONLY** — vertical rhythm differs legitimately between a doc and a
  dashboard. A consumer adds `padding-block: 2.5rem 5rem`. **Never the `padding` shorthand**: it
  resets `padding-inline` to 0 and silently takes the shared margins back.
- A page that genuinely is not a column (a full-bleed dashboard table) sets `max-width: none`
  deliberately. It does not invent a fifth number.
- Steps are 1px apart at the bottom on purpose: a terminal UI's useful range is 10–15px, and a
  geometric ratio scale would give three usable steps then leap past everything that matters.
- Tailwind apps get `max-w-content` and `text-fs-*`. Tailwind's own `text-xs/sm/base` are
  deliberately **not** remapped — opt in by name.
- **The scale is only half of "same size on every screen".** It fixes the *ratios* and does not
  track the viewport. `initResolutionZoom()` makes the page track the *window*. Scale without zoom
  = frozen at one size on a 4K display; zoom without scale = uniform scaling of sizes that
  disagree between pages. Every surface needs both.

## The shared component vocabulary — a consumer must NOT redeclare any of it

If a class below appears in your page's own `<style>`, that is a bug in waiting: the system's
rule and your copy will disagree at the next release, and whichever loses is decided by source
order. Use them as-is; if one is wrong for everybody, fix it *here*. (The one sanctioned
exception is `.wrap` on an unpinned build-free page — a *token* declaration with literal
fallbacks, not a copy of the system's rule. See "Measurements" above.)

| Group | Classes | Source |
| --- | --- | --- |
| chrome | `.wrap` `.skip-link` `.visually-hidden` `header.bar` `.brand` `.bar-right` `footer.status` `.status-left` `.status-right` `.sep` `.doc-link` `.nav-burger` `.mobile-nav` `.mobile-footer` | `src/chrome.css` |
| `ls -l` rail | `.ls-nav-head` `.ls-nav-title` `.ls-nav-toggle` `.ls-nav` `.ls-panel` `.ls-row` (`--sub`, `--sub2`, `--dir`) `.ls-perm` `.ls-name` | `src/chrome.css` |
| text primitives | `.glow` `.glow-lg` `.prompt` (prepends `$ `) `.comment` (prepends `# `) `.cursor-block` `.link-quiet` `.ascii-rule` | `src/components.css` |
| blocks | `.card-terminal` `.btn-terminal` `.eli5` / `.eli5-term` `details.fold` / `.fold-body` `.legend` | `src/components.css` |
| tabs | `.tabs` `.tab` (`[aria-selected]`) `section.doc.tab-panel` | `src/components.css` |
| status ticker | `.tickstrip` `.tick` (`--ok`, `--stale`, `--never`) `.tick-dot` `.tick-name` `.tick-last` `.tick-next` `.tick-sep` `.tick-stats` `.ticktable` | `src/components.css` |
| diagram zoom | `.dgm-zoomable` `.dgm-overlay` `.dgm-stage` `.dgm-bar` `.dgm-btn` `.dgm-close` `.dgm-art` | `src/components.css` |
| dropdown | `.dropdown` `.dropdown-panel` (`--down`) `.dropdown-item` `.anim-toggle` | `src/components.css` |
| misc | `.dd-dot` `.dd-flag` (`-de/-en/-es/-pt`) | `src/components.css` |
| typing animation | the `[data-term]` / `[data-term-out]` contract + the `html.anim-off` kill switch | `src/components.css` |

`.prompt` already prepends `$ ` — never author a literal leading `$ ` inside one (it doubles).

The chrome has a **markup contract**, documented at the top of `src/chrome.css` and shown end to
end in `templates/documentation.html`. Follow it exactly; the rail in particular reads state from
`html[data-ls-nav]` and needs its own pre-paint line:

```js
try { if (localStorage.getItem("ls-nav") === "off") document.documentElement.dataset.lsNav = "off"; } catch {}
```

## This is machine-checked — `bin/design-conformance` in danieldeusing-infra

The rules above are not advice; a cockpit redeploy runs the checker and **fails on a violation**.
Run it yourself before you get there:

```bash
cd ~/Work/danieldeusing/danieldeusing-infra
node bin/design-conformance            # forked components + phantom tokens — must be zero
node bin/design-conformance --strict   # + the literal-colour backlog
node bin/design-conformance --list     # what the system currently owns
```

It reads the owned vocabulary **from the published CSS**, so it cannot fall behind a release the
way a hand-written list would. Three findings:

| finding | what it means |
|---|---|
| **forked component** | your page declares a class the system styles, unscoped, setting a property the system also sets. `.pair details.fold {…}` and `button.doc-link.rowlink {…}` are fine — a page-owned class scopes them. `.legend {…}` is not. |
| **literal colour** | a hex as the value of a real property. Defining a token (`--grid: #d9cdb6`) and a fallback (`var(--background, #f5efe2)`) are both correct and are not reported. |
| **phantom token** | `var(--x)` nothing defines — silently dropped, and the element renders at its inherited value, which usually looks *almost* right. |

**A genuine exception is a comment, not a config entry.** Put `design-conformance: <reason>` in
the comment above the rule and it is waived. Four exist today (a full-bleed data table, WCAG
tap-target sizing under a coarse pointer, a phone gutter) and each states a real reason. If you
cannot write the sentence, you do not have an exception — you have a fork.

## Runtime — `runtime/*.js`, dependency-free ESM, tree-shakeable

| Function | What it does |
| --- | --- |
| `applyStoredTheme()` / `setTheme()` / `getStoredTheme()` | Apply + persist the theme. **Pre-paint from `<head>`.** |
| `initThemeSwitcher()` | Wires `[data-theme-value]` buttons and `[data-theme-label]`. |
| `initResolutionZoom(1920)` | Lays out at the reference width and zooms above it. **Pre-paint from `<head>`** — otherwise the page reflows visibly on load, and it is the half of "same font size on every screen" that the type scale cannot do. |
| `initDropdowns()` | `<details class="dropdown">`: one-open, click-away, Escape. |
| `initBurgerNav()` | Mobile burger (breakpoint 48rem) with the footer folded in. |
| `initLsNav()` | The rail's show/hide, and it **measures** the real chrome into `--ls-nav-top` / `--ls-nav-bottom`. Use `offsetHeight` semantics — `getBoundingClientRect()` returns zoomed visual px and double-counts the zoom. |
| `initTerminal()` | The `$ command` typing animation; no-ops under reduced motion / `html.anim-off`. Fires `term:contentdone`. |
| `initAnimToggle()` | Wires `[data-anim-toggle]`, persists `localStorage["anim"]`. |
| `initDiagramZoom(".diagram")` | Click / Enter / Space opens a diagram full-screen; wheel-zoom about the pointer, drag-pan, `+ - 0`, Escape closes. Clones the svg — mermaid re-runs against the nodes it rendered, so moving the original is how a diagram silently stops updating. |
| `initTooltips()` | `src/tooltip.css` counterpart. |

The runtime is progressive enhancement: with JS off, content is visible and the theme is `warm`.

## Pin or unpin the CDN url — decided by whether your MARKUP is coupled to a release

- **Tokens-only / look-only consumer → UNPINNED** (`…/npm/@danieldeusing/design/dist/…`, no
  `@x.y.z`). One design system, every surface on the current version — Daniel's call, 2026-08-05.
  A stale cached stylesheet there means slightly older colours, never a broken page. netmon,
  seedr playgrounds, pagr-docs, morning-briefs.
- **A surface that ships the system's MARKUP → PIN** and bump the pin in the same commit as the
  markup that needs it. Cockpit — and **the docs site since 2026-08-06**, when its pages adopted
  the rail and the fixed footer. It sat on the unpinned list above right up until that day, which
  is the shape of this rule: the side a surface belongs on is not a property of the surface, it is
  a property of what its markup needs, so it changes the day the markup does.
  **Cockpit is the case that proves it:** 2.65.0 shipped the `.ls-nav` rail
  markup against the unpinned url, and jsDelivr serves that url `cache-control: max-age=604800` —
  **seven days in the browser**. Every browser that had opened cockpit that week kept applying
  0.1.6, which predates the rail: both nav toggles on screen, a 613px header, the brand floating
  mid-page. **A release cannot fix a poisoned cache** — the url a release publishes to is the one
  being cached. Only a *changed url* can.
- **Unpinned is not "always current" — it is "current, eventually."** Same cache, other
  direction: measured 2026-08-05, hours after `0.4.0` went to npm, the unpinned url still served
  **`0.2.0`** (`curl -sI …` → `x-jsd-version: 0.2.0`, `age: 11267` against `s-maxage=43200`), and
  browsers hold their copy for the full seven days. So an unpinned consumer must survive a build
  that *predates the token it is asking for*: `0.2.0` has no `.wrap` and no `--fs-*` at all, and
  a bare `var(--content-w)` resolves to nothing — full-bleed page, collapsed type. **Give every
  token an unpinned consumer depends on structurally a literal fallback**: `var(--content-w,
  78rem)`, `var(--fs-2xl, 1.7rem)`. Check what is actually being served before concluding a new
  token "doesn't work": `curl -sI <url> | grep x-jsd-version`.
- Consequence for this repo: **a publish is instantly live on every unpinned surface, with no
  staging** (once the edge turns over). So (a) look at them after publishing, and (b) keep new
  CSS backward-compatible with the markup consumers still ship — `0.2.0`'s `html:has(.ls-nav)`
  guard is the worked example.

## Changing the system

`dist/` and `tokens/tokens.json` are **committed on purpose** (jsDelivr serves them) — run
`npm run build` and commit them with the source change. Publishing to npm is automatic via
Trusted Publishing on any push to `main` that bumps `package.json` version; an unchanged version
is skipped, so docs/skills/template pushes are safe. Write the CHANGELOG entry the way the
existing ones read: what changed, and the measurement or failure that forced it.
