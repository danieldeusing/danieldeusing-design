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

  <!-- Pre-paint, inline, before any stylesheet. The theme must be settled before
       first paint or the page visibly flashes the wrong one. Nothing here touches
       scale, and nothing should: there is no wide-screen scaling since 0.56.0 — a
       page caps at --content-w and the rest of the viewport is margin. This template
       used to carry a zoom script; do not bring it back. -->
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
  </script>

  <!-- Unpinned — correct only if this page consumes the look and none of the system's markup.
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

**`tokens.css` + `chrome.css`, without `components.css`, is a supported combination** — it is
what netmon ships (as a committed same-origin snapshot, because it is read during outages). Know
what that gets you, because the split is not where it looks: `components.css` is effectively
**not separable**. Taking one component out of it drags base.css's scanline overlay, its table
type and its control styling onto a surface with its own layout, so in practice a surface either
takes the whole look or takes none of it.

A tokens+chrome consumer therefore gets the content column (`.wrap`), `.tablewrap`, the a11y
helpers, `header.bar`, `footer.status`, the `ls -l` rail — **and, since 0.17.0, the ticker strip**
(`.tickstrip` / `.ticktable` / `.tick*`), which moved out of `components.css` for exactly this
reason: a tickstrip is page-level status chrome, and the surfaces that most need to say "my
poller is still running" were the ones that could not load it. It does **not** get `.btn-terminal`,
`.card-terminal`, `.legend`, `.tabs`, `details.fold`, `.dropdown`, `.field-row` or the diagram
zoom — those stay in `components.css`. A surface needing that vocabulary must mirror it under its
own class names, never borrow the system's for a stylesheet it does not load; borrowing the name
is the silent fork `bin/design-conformance` exists to catch.

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
--content-w: 90rem;     --content-pad: 1.5rem;  /* 1440px — 92rem until 0.56.0 */
--fs-base: 0.75rem; /* 12px — ALL normal text. The only size you write. */
--fs-lg: 0.9375rem; /* 15px — h3 / section heads */
--fs-xl: 1.125rem;  /* 18px — h2 / page title */
--fs-2xl: 1.5rem;   /* 24px — h1 / hero, display only */
--lh-tight: 1.3;    --lh-base: 1.5;
```

### ONE SIZE FOR TEXT (0.27.0, Daniel) — `--fs-xs`, `--fs-sm` and `--fs-md` are gone

Body, tables, labels, badges, notes, buttons, form controls, meta lines: **all `--fs-base`.** If you
are reaching for a `font-size` on anything a person reads, the answer is already decided. The only
sizes left are the three heading steps, and each is a jump rather than a nudge.

**Do not re-derive the old scale from memory.** It had four text steps at 10 / 11 / 12 / 13px, and
this very section used to defend them: *"steps are 1px apart at the bottom on purpose."* That
reasoning was wrong in a way only usage could show. Differences that small cannot be told apart on
sight, so nothing ever **chose** between them — every surface picked whichever felt right when it was
written, and **578 hand-rolled `font-size` declarations** grew across the estate while every
conformance check passed, because none of them had an opinion about type. One cockpit repository card
rendered text at 10.2px, 10.8px, 10.88px, 11px, 12px and 13px at once. Daniel found it by looking:
*"why in details we have different font sizes?"*

The fix is not discipline, it is **removing the choice**. With one text size there is no near-miss to
pick, and `font-size` stops being a decision anybody makes while writing a component.

- **Must read as quieter?** `--muted-foreground`, `opacity`, or weight. Colour separates a label from
  its value far better than one pixel ever did, and it survives zoom and a printout.
- **Must read as louder?** Then it is a heading — `--fs-lg`/`-xl`/`-2xl`, or `font-weight`.
- **A glyph is not text.** A `content:`-drawn pseudo-element (`ⓘ`, `⤢`, a marker) is sized against its
  own drawing and may keep a hand-rolled `em`. Say so inline: `/* not-text: … */`. Five in the system
  do; nothing else may.
- **`table` is `--fs-base`.** It was `--fs-md` until 0.27.0, sitting under a comment that already said
  *"a table cell is body copy"* — so every table in the estate rendered one step louder than the body
  around it and louder than the label naming it. Do not re-add a table size.
- **`em` compounds, `rem` does not.** Mixing them is how `0.85em`, `0.9em` and `0.68rem` landed as
  three near-identical pixel values inside one card. Write the token, not a ratio.

- **`.wrap` resolves the column** (`max-width: var(--content-w); margin-inline: auto;
  padding-inline: var(--content-pad)`). Use it, and never restate a bare `90rem` locally. A
  build-free page on an **unpinned** url writes the tokens itself *with literal fallbacks* —
  `max-width: var(--content-w, 90rem)` — because `.wrap` itself only exists from 0.4.0; see
  "Pin or unpin".
- **One width for every section, and a surface that wants more raises the token** (0.44.0).
  A table section must never be wider than the prose sections beside it: blocks that start at
  different left edges read as broken however well each one is individually sized. So there is
  no bleed class and none should be invented — cockpit had one for a few hours, for a genuinely
  too-narrow activity table, and the right fix was `--content-w` going 78rem → 92rem for
  everybody (and 92rem → **90rem / 1440px** in 0.56.0, when the scaling went). The number was measured, not chosen: the widest table in the estate wants 1353px,
  88rem is the first value that fits it, and 92rem clears it while still leaving an 81px gutter
  beside the `ls -l` rail at 1920. **The cap only binds above ~1744px**, so widening it is
  invisible on a laptop and only shows on the monitors it gets raised about.
- **`.wrap` sets the inline axis only** — vertical rhythm differs legitimately between a doc and a
  dashboard. A consumer adds `padding-block: 2.5rem 5rem`. **Never the `padding` shorthand**: it
  resets `padding-inline` to 0 and silently takes the shared margins back.
- A page that genuinely is not a column (a full-bleed dashboard table) sets `max-width: none`
  deliberately. It does not invent a fifth number.
- There is exactly **one** text step and three heading steps. The bottom of the scale used to be
  four sizes 1px apart, defended here as deliberate; see "ONE SIZE FOR TEXT" above for what usage
  showed instead.
- Tailwind apps get `max-w-content` and `text-fs-base` / `-lg` / `-xl` / `-2xl`. `text-fs-xs`, `-sm`
  and `-md` went with the tokens behind them. Tailwind's own `text-xs/sm/base` are deliberately
  **not** remapped — opt in by name.
- **There is no wide-screen scaling. Removed in 0.56.0 (Daniel).** From 0.29.0 to 0.55.0
  `tokens.css` set a fluid root font size above 1920px, so every rem — type, `--content-w`,
  `--space-section` — grew together on a large display. It is gone, and it will read as a
  regression if you do not know why, so: everything authored in **px silently opted out** (icons
  are sized by `width`/`height` attributes, controls had px heights, one component wrote an inline
  px style no stylesheet can override), so a 4K screen doubled the text and left all of that
  behind. Four releases went into chasing it. And what *did* scale scaled too much — 2x icons read
  as oversized beside their labels, and a table sized for a 1472px column overlapped once every
  measurement in it doubled.
  **A page caps at `--content-w` (90rem / 1440px) and the rest of the viewport is margin.** The
  root font size is the browser's own, which is also the accessible answer: a larger default is
  honoured and text zoom works (WCAG 1.4.4).
  Do not re-add a pre-paint `style.zoom` and do not re-add a fluid root — `bin/design-conformance`
  check 5 fails a page that assigns a zoom, and it is now the only thing that would be scaling
  anything.
  `data-scale="fixed"` (0.47.0) went with it: an opt-out of a behaviour that no longer exists.
  Setting it is harmless and does nothing.
- **Never set `zoom` on a page.** It scales the coordinate *space*, so the page's pixel grid stops
  matching the browser's, and anything injected from outside — a password manager's dropdown, a
  translation bar — is positioned through one grid and written into the other. Measured on the
  family login page: 1Password's dropdown landed 1.9x down and across from its field. Scaling the
  unit had no second grid — and since 0.56.0 nothing scales the unit either, so a `style.zoom`
  would be the only thing scaling anything, on one surface, out of step with every other.

## A card has its own padding (0.38.0, Daniel) — do not add your own

`.card-terminal` pads itself, `0.85rem 1.1rem`. Before 0.38.0 it had none and every surface
either added padding or, more often, did not — which is why the family contacts tiles shipped
with their label starting hard against the border.

So a card is `<div class="card-terminal">` with content in it, and nothing else. Do not wrap the
content in a padded inner div, and do not redeclare `.card-terminal` to adjust the value —
`bin/design-conformance` treats that as the fork it is. A card that genuinely needs to be flush
(a full-bleed chart, an image) sets `padding: 0` on its own class, deliberately and once.

## The shared component vocabulary — a consumer must not redeclare any of it

If a class below appears in your page's own `<style>`, that is a bug in waiting: the system's
rule and your copy will disagree at the next release, and whichever loses is decided by source
order. Use them as-is; if one is wrong for everybody, fix it *here*. (The one sanctioned
exception is `.wrap` on an unpinned build-free page — a *token* declaration with literal
fallbacks, not a copy of the system's rule. See "Measurements" above.)

**Tables are in that set too, by element rather than by class (0.10.0).** `table`, `th` and `td`
carry the system's padding, top alignment, hairline row rule, header treatment and `width: 100%`
— so a consumer authors a plain `<table>` and adds nothing. A local `td { padding }` or a
hand-rolled row border is a fork exactly like redeclaring `.legend`, and it will disagree with
the system at the next release. The three things a page legitimately owns are **column widths**
(only the page knows which column holds the prose — use a `<colgroup>`),
**`--tablewrap-max-h`**, the token that caps a tall table's own scroll area (set it to `none` for
a full-bleed dashboard table rather than redeclaring `.tablewrap`), and **`--tablewrap-fade`**
(0.23.0), the colour the right-edge scroll fade blends into — set it whenever the wrapper does
not sit on `--background`, because on a `--card` surface the default paints a 1.5rem bright band.

| Group | Classes | Source |
| --- | --- | --- |
| chrome | `.wrap` `.tablewrap` (+ `--tablewrap-max-h`, `--tablewrap-fade`) `.bleed-rail` `.skip-link` `.visually-hidden` `header.bar` `.brand` `.bar-right` `footer.status` `.status-left` `.status-right` `.sep` `.doc-link` (+ `--forward`) `.nav-burger` `.mobile-nav` `.mobile-footer` | `src/chrome.css` |
| `ls -l` rail | `.ls-nav-head` `.ls-nav-title` `.ls-nav-toggle` `.ls-nav` `.ls-panel` `.ls-row` (`--sub`, `--sub2`, `--dir`, **`[aria-current="page"]`**) `.ls-perm` `.ls-name` `.ls-group` | `src/chrome.css` |
| text primitives | `.glow` `.glow-lg` `.prompt` (prepends `$ `) `.comment` (prepends `# `) `.cursor-block` `.link-quiet` `.ascii-rule` | `src/components.css` |
| blocks | `.card-terminal` `.btn-terminal` (+ `--ghost`, `--compact`, `--destructive`, `--edit`, `:disabled`) `.field-row` (`> .lbl`, `> .field-val`, `--field-label-w`) `.eli5` / `.eli5-term` `details.fold` / `.fold-body` `.legend` | `src/components.css` |
| tabs | `.tabs` `.tab` (`[aria-selected]`) `section.doc.tab-panel` | `src/components.css` |
| status ticker | `.tickstrip` `.tick` (`--ok`, `--stale`, `--never`) `.tick-dot` `.tick-name` `.tick-last` `.tick-next` `.tick-sep` `.tick-stats` `.ticktable` | `src/chrome.css` (moved from components 0.17.0) |
| diagram zoom | `.dgm-zoomable` `.dgm-overlay` `.dgm-stage` `.dgm-bar` `.dgm-btn` `.dgm-close` `.dgm-art` | `src/components.css` |
| minimap | `.minimap` `.minimap-bar` (`.active`) | `src/components.css` |
| dropdown (a menu) | `.dropdown` `.dropdown-panel` (`--down`) `.dropdown-item` `.anim-toggle` | `src/components.css` |
| table pager | `.table-pager` `.table-pager-status` `.table-pager-size` `.table-pager-nav` — **all rendered for you** by `initTablePagination()`; the markup contract is `data-table-id` on the `<table>` and nothing else |
| select (a value) | the `select` element, plus `.select-field` `.select-trigger` `.select-value` `.select-panel` `.select-option` (`[aria-selected]`, `[data-active]`, `[aria-disabled]`) `.select-group` — **all rendered for you**, see `references/tables-and-forms.md` | `src/components.css` |
| misc | `.dd-dot` `.dd-flag` (`-de/-en/-es/-pt`) | `src/components.css` |
| typing animation | the `[data-term]` / `[data-term-out]` contract + the `html.anim-off` kill switch | `src/components.css` |

`.prompt` already prepends `$ ` — never author a literal leading `$ ` inside one (it doubles).

## Component rules live in `references/`

The table above is the whole vocabulary. How each component behaves, and the traps behind it,
is in three files next to this one. Read the one for what you are building before you write its
markup:

| Building … | Read |
|---|---|
| any button (never a local button class), a row action (link or button, edit, remove), the rail's current page, `.ls-perm`, a hover explanation (`data-tip`, never `title`), a change to `runtime/tooltip.js` (netmon carries an inline copy), an `.eli5` box | `references/components.md` |
| a table (plain markup, column widths, horizontal scroll, paging, search / filter / sort), any `@tailwindcss/typography` (`.prose`) surface, a `<select>`, a settings panel (`.field-row`) | `references/tables-and-forms.md` |
| a call into the runtime: the theme functions and every `init*()` | `references/runtime.md` |

## Chrome templates: start here for any surface

The chrome has a **markup contract**, documented at the top of `src/chrome.css` and shown end to
end in two templates that ship in the package (`files`), so a consumer reads the canonical markup
out of its own `node_modules` instead of copying whatever the nearest surface happens to do today
— which is how the pre-rail dropdown propagated in the first place:

- **`templates/page-chrome.html`** (0.6.0) — the standard chrome alone: `header.bar` + the `ls -l`
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

The rules in this skill and its references are not advice; a cockpit redeploy runs the checker and **fails on a violation**.
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

## Pin or unpin the CDN url — decided by whether your markup is coupled to a release

- **Tokens-only / look-only consumer → unpinned** (`…/npm/@danieldeusing/design/dist/…`, no
  `@x.y.z`). One design system, every surface on the current version — Daniel's call, 2026-08-05.
  A stale cached stylesheet there means slightly older colours, never a broken page. netmon's
  `tokens.css` layer, the seedr playgrounds and pagr-docs are on this side today.
  **This is where a surface should sit, not a roster of where they are** — audited 2026-08-06,
  morning-briefs is hard-pinned at **0.1.3** in four `@import url()` lines in its `lib/tokens.css`
  and `deploy/ci-orchestrator` at **0.1.5**, so neither has had a token since. A pin nobody bumps
  is the failure mode on this side, exactly as a poisoned cache is on the other.
- **A surface that ships the system's markup → pin** and bump the pin in the same commit as the
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
  90rem)`, `var(--fs-2xl, 1.7rem)`. Check what is actually being served before concluding a new
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

**Push `main` first, tag after npm has the version.** The order is load-bearing and neither the
CHANGELOG nor this file used to say so. `prepublishOnly` runs `check-release.mjs` inside the
publish job, and check #2 refuses a version that is **already tagged on origin** — so tagging
before the workflow finishes makes the release gate block the very publish it is gating. 0.16.0
failed exactly that way: `✗ v0.16.0 is already a tag on origin — that release was cut.`, npm
untouched, while the tag sat there implying it had shipped. Recovery is
`git push origin :refs/tags/vX.Y.Z`, `gh run rerun <id>`, then tag once `npm view` reports the new
version. The workflow re-creates the tag itself on success, so the manual tag is a no-op — which
is the clue that it was never yours to push first.
