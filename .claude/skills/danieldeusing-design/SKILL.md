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

  <!-- UNPINNED — correct ONLY if this page consumes the look and none of the system's markup.
       The moment you paste in the `ls -l` rail, header.bar or footer.status from the section
       below, add the `@x.y.z` — see "Pin or unpin". Shipping rail markup against this url is
       the exact bug that took cockpit apart for a week. -->
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

**Tables are in that set too, by ELEMENT rather than by class (0.10.0).** `table`, `th` and `td`
carry the system's padding, top alignment, hairline row rule, header treatment and `width: 100%`
— so a consumer authors a plain `<table>` and adds nothing. A local `td { padding }` or a
hand-rolled row border is a fork exactly like redeclaring `.legend`, and it will disagree with
the system at the next release. The two things a PAGE legitimately owns are **column widths**
(only the page knows which column holds the prose — use a `<colgroup>`) and
**`--tablewrap-max-h`**, the token that caps a tall table's own scroll area; set it to `none` for
a full-bleed dashboard table rather than redeclaring `.tablewrap`.

| Group | Classes | Source |
| --- | --- | --- |
| chrome | `.wrap` `.tablewrap` (+ `--tablewrap-max-h`) `.skip-link` `.visually-hidden` `header.bar` `.brand` `.bar-right` `footer.status` `.status-left` `.status-right` `.sep` `.doc-link` (+ `--forward`) `.nav-burger` `.mobile-nav` `.mobile-footer` | `src/chrome.css` |
| `ls -l` rail | `.ls-nav-head` `.ls-nav-title` `.ls-nav-toggle` `.ls-nav` `.ls-panel` `.ls-row` (`--sub`, `--sub2`, `--dir`) `.ls-perm` `.ls-name` `.ls-group` | `src/chrome.css` |
| text primitives | `.glow` `.glow-lg` `.prompt` (prepends `$ `) `.comment` (prepends `# `) `.cursor-block` `.link-quiet` `.ascii-rule` | `src/components.css` |
| blocks | `.card-terminal` `.btn-terminal` (+ `--ghost`, `--compact`) `.field-row` (`> .lbl`, `> .field-val`, `--field-label-w`) `.eli5` / `.eli5-term` `details.fold` / `.fold-body` `.legend` | `src/components.css` |
| tabs | `.tabs` `.tab` (`[aria-selected]`) `section.doc.tab-panel` | `src/components.css` |
| status ticker | `.tickstrip` `.tick` (`--ok`, `--stale`, `--never`) `.tick-dot` `.tick-name` `.tick-last` `.tick-next` `.tick-sep` `.tick-stats` `.ticktable` | `src/components.css` |
| diagram zoom | `.dgm-zoomable` `.dgm-overlay` `.dgm-stage` `.dgm-bar` `.dgm-btn` `.dgm-close` `.dgm-art` | `src/components.css` |
| minimap | `.minimap` `.minimap-bar` (`.active`) | `src/components.css` |
| dropdown | `.dropdown` `.dropdown-panel` (`--down`) `.dropdown-item` `.anim-toggle` | `src/components.css` |
| misc | `.dd-dot` `.dd-flag` (`-de/-en/-es/-pt`) | `src/components.css` |
| typing animation | the `[data-term]` / `[data-term-out]` contract + the `html.anim-off` kill switch | `src/components.css` |

`.prompt` already prepends `$ ` — never author a literal leading `$ ` inside one (it doubles).

## A row action's SHAPE says whether it changes anything (0.13.0)

The one rule that decides what to reach for. It is not a style preference — it is the only thing
that tells a reader, before they click, whether this control will take them somewhere or alter
something:

> **A row action that NAVIGATES is a link. A row action that MUTATES is a button.**
> Underlined text that deletes something looks like a footnote.

| the action | what to write |
|---|---|
| `open →` `log →` `detail` `forge →` — goes somewhere, changes nothing | `<a class="doc-link doc-link--forward">` (or a `<button>` carrying the same classes when the destination is an in-page dialog and there is no url) |
| `remove` `add` `update` `save` `apply` `dismiss` `enrol` — writes | `<button class="btn-terminal btn-terminal--ghost btn-terminal--compact">` |
| the ONE primary action of a view | the same, **filled**: `btn-terminal btn-terminal--compact` |
| a toggle (`follow`, `live`) | the same button; press = drop `--ghost`, release = add it back. The two states are the two buttons the system already ships, so a toggle never needs a third look. |

Two filled buttons side by side compete, which is the whole reason `--ghost` exists.

**`.doc-link--forward` carries the accent AT REST**, not on hover. `.doc-link` is deliberately
quiet because it is footer furniture, and row actions inherited that quietness: a column of grey
`open →` reads as *disabled text* rather than as the way in. Hover cannot advertise itself, and a
row action is the reason the row is interactive at all. Keep plain `.doc-link` for what it was
built for — the footer, and links inside running prose. A **value** that happens to be clickable
(a repo name, a PR ref, a path in the identity column) is not an action either; the forward accent
belongs to the action column.

**`.btn-terminal--compact` is the SIZE and nothing else.** Colour, square corner, the `> ` prefix
and the glow still come from `.btn-terminal` / `--ghost`, so a compact button cannot drift into
being a different button. The system's own button is a landing-page CTA at `12px 24px`; a tool row
puts six side by side and a table cell is half that height. Cockpit carried this as a local
`.btn-compact` for months — every surface with a table needs it, so it lives here now. **Never
declare a local one**, and never a local button class at all: five invented classes (`.cfg-btn`,
`.copy-btn`, `.tbtn`, `.xbtn`, `.fw-btn`) is how 77 rounded corners accumulated on a system whose
`--radius` has been `0` since its first release.

## `.field-row` — a settings panel is a two-column table, so write it as one

```html
<div class="field-row">
  <span class="lbl">review type</span>
  <div class="field-val">…control(s)…</div>
</div>
```

Built as flex rows with a label beside a control, every row starts its value wherever *its own*
label happens to end — the labels are different lengths, so the eye gets no vertical edge to
follow and the panel reads as noise. Daniel, looking at exactly that: *"make this more a table
layout and always do it like this. This currently looks chaotic."* `.field-row` decides the value
edge once, for every row.

- `.field-val` is a flex box, so several controls on one row **wrap together** instead of each
  finding its own line.
- Widen the label column with **`--field-label-w`** (default `8.5rem`) when a panel's labels are
  genuinely longer. Note the checker cannot see this one: upstream only ever *reads* it (with a
  fallback), so `bin/design-conformance` reports `var(--field-label-w)` as a **phantom token**.
  Either set it as a real declaration on the panel first, or avoid it.
- Deliberately **not** `subgrid`: these rows usually render independently — one block per repo, one
  per source — so they must align without sharing a parent. The failure mode of a fixed column is
  "the label column is a bit wide", not a broken layout.
- Below `40rem` it stacks on its own. A form's submit gets a `.field-row` with an **empty** `.lbl`,
  so it lands on the same value edge as the fields above it and stacks with them for free — rather
  than a local margin that writes the label width down a second time.

The chrome has a **markup contract**, documented at the top of `src/chrome.css` and shown end to
end in two templates that ship in the package (`files`), so a consumer reads the canonical markup
out of its own `node_modules` instead of copying whatever the nearest surface happens to do today
— which is how the pre-rail dropdown propagated in the first place:

- **`templates/page-chrome.html`** (0.6.0) — the standard chrome ALONE: `header.bar` + the `ls -l`
  rail + `footer.status`, in that order, with the reasoning for each. Start here for any surface.
  **The rail is conditional, and the other two are not.** A nav whose only entry is the current
  page is furniture: it costs 17rem of width to tell the reader where they already are. Ship the
  rail when there is somewhere else to go, and omit it otherwise — the system is built for that,
  `html:has(.ls-nav)` drops `--ls-nav-inset` to `0` and the page reclaims the width on its own.
  When you omit it, remove the `.ls-nav-head` and the `.ls-nav` **only**: `nav.site-nav`, the
  `.nav-burger` and the `.mobile-footer` inside it must stay, because `footer.status` is
  `display: none` below 48rem and that burger is the only place a phone has the theme picker.
- **`templates/documentation.html`** — a whole page built on it, for a one-file doc.

Follow it exactly; the rail in particular reads state from `html[data-ls-nav]` and needs its own
pre-paint line:

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
way a hand-written list would. Four findings:

| finding | what it means |
|---|---|
| **forked component** | your page declares a class the system styles, unscoped, setting a property the system also sets. `.pair details.fold {…}` and `button.doc-link.rowlink {…}` are fine — a page-owned class scopes them. `.legend {…}` is not. |
| **literal colour** | a hex as the value of a real property. Defining a token (`--grid: #d9cdb6`) and a fallback (`var(--background, #f5efe2)`) are both correct and are not reported. |
| **bare token on an unpinned surface** | `var(--content-w)` with no literal fallback on a page loading the unpinned url. The served build may predate the token, and then the declaration is dropped entirely — full-bleed page, collapsed type. See "Pin or unpin" below. |
| **phantom token** | `var(--x)` nothing defines — silently dropped, and the element renders at its inherited value, which usually looks *almost* right. |

**A genuine exception is a comment, not a config entry.** Put `design-conformance: <reason>` in
the comment above the rule and it is waived. Nine exist today (a full-bleed data table, WCAG
tap-target sizing under a coarse pointer, a phone gutter, a deliberately fixed-dark pane…) and
each states a real reason. If you cannot write the sentence, you do not have an exception — you
have a fork.

**It only knows three surfaces** — `cockpit`, `netmon` and `docs`, listed in `SURFACES` at the top
of the script. `apps/pagr`, the seedr playgrounds and `deploy/ci-orchestrator` are unchecked, and
every one of them has drifted. Adding a surface is one entry in that array.

## Runtime — `runtime/*.js`, dependency-free ESM, tree-shakeable

| Function | What it does |
| --- | --- |
| `applyStoredTheme()` / `setTheme()` / `getStoredTheme()` | Apply + persist the theme. **Pre-paint from `<head>`.** |
| `initThemeSwitcher()` | Wires `[data-theme-value]` buttons and `[data-theme-label]`. |
| `initResolutionZoom(1920)` | Lays out at the reference width and zooms above it. **Pre-paint from `<head>`** — otherwise the page reflows visibly on load, and it is the half of "same font size on every screen" that the type scale cannot do. |
| `initDropdowns()` | `<details class="dropdown">`: one-open, click-away, Escape. |
| `initBurgerNav()` | Mobile burger (breakpoint 48rem) with the footer folded in. |
| `initLsNav()` | The rail's show/hide, and it **measures** the real chrome into `--ls-nav-top` / `--ls-nav-bottom`. The top is the header's **bottom edge** (`getBoundingClientRect().bottom / zoom`), not its height — those agree only while nothing sits above the header, and cockpit's alert banner mounts as the first child of `<body>`. A rect is visual px and a CSS length is re-multiplied by any ancestor `zoom`, so **convert, don't avoid** (0.13.0; before that a 73px banner buried the rail's own toggle). Re-measured on `scroll` too, because a sticky header's bottom edge moves as the banner scrolls away. |
| `initTerminal()` | The `$ command` typing animation; no-ops under reduced motion / `html.anim-off`. Fires `term:contentdone`. |
| `initAnimToggle()` | Wires `[data-anim-toggle]`, persists `localStorage["anim"]`. |
| `initDiagramZoom(".diagram")` | Click / Enter / Space opens a diagram full-screen; wheel-zoom about the pointer, drag-pan, `+ - 0`, Escape closes. Clones the svg — mermaid re-runs against the nodes it rendered, so moving the original is how a diagram silently stops updating. |
| `initMinimap({sections})` | Builds the left-gutter minimap: one bar per section, scroll-spy included, bar length by heading depth. Markup contract is NOTHING. Returns `null` for fewer than two sections — a map of one place is not a map. Use it INSTEAD of a text "On this page" column: that column repeated headings the reader was about to scroll past and cost the content its width. |
| `initTableScroll()` | Gives every unwrapped `<table>` a `.tablewrap` parent so a wide table scrolls itself instead of scrolling the whole PAGE sideways. **The markup contract is nothing** — author a plain `<table>`; already-wrapped tables are left alone, so it is never a migration and is safe to call again after rendering more rows. |
| `initTooltips()` | `src/tooltip.css` counterpart. |

The runtime is progressive enhancement: with JS off, content is visible and the theme is `warm`.

## Pin or unpin the CDN url — decided by whether your MARKUP is coupled to a release

- **Tokens-only / look-only consumer → UNPINNED** (`…/npm/@danieldeusing/design/dist/…`, no
  `@x.y.z`). One design system, every surface on the current version — Daniel's call, 2026-08-05.
  A stale cached stylesheet there means slightly older colours, never a broken page. netmon's
  `tokens.css` layer, the seedr playgrounds and pagr-docs are on this side today.
  **This is where a surface SHOULD sit, not a roster of where they are** — audited 2026-08-06,
  morning-briefs is hard-pinned at **0.1.3** in four `@import url()` lines in its `lib/tokens.css`
  and `deploy/ci-orchestrator` at **0.1.5**, so neither has had a token since. A pin nobody bumps
  is the failure mode on this side, exactly as a poisoned cache is on the other.
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
