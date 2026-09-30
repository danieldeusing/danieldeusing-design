# Foundations: the tokens under every component, bare markup, the Tailwind entry

Reference for the `danieldeusing-design` skill. Read it before you size a control, pick a colour
for a *thing*, give a popup depth, animate anything, colour a state, write bare markup that should
look like the estate, or import the package into a Tailwind app. Every other reference resolves
against what is here. The component vocabulary, and the rule that a consumer never redeclares any
of it, are in `SKILL.md`.

Contents:

- One height, one field edge, one card inset, four glyph sizes (0.60.0)
- One display step, for a public page's title (0.60.0)
- Categorical colours: twelve names, one lightness per theme (0.60.0)
- Depth is a glow, and a dialog is edged (0.60.0)
- In a Tailwind app, a utility beats the system (0.60.0)
- Bare markup has a house look (0.60.0)
- Motion: one switch stops all of it (0.60.0)
- `data-tone`: one attribute colours every state (0.60.0)
- Text colour utilities, and why there is no `.text-muted` (0.60.0)
- Thin scrollbars are opt-in (0.60.0)
- `.bg-dots` (0.60.0)
- JetBrains Mono under a strict CSP
- Icon mask tokens (0.60.0)

## One height, one field edge, one card inset, four glyph sizes (0.60.0)

> **A single-line control is `--control-h` tall. A field is edged with `--control-edge`, a
> container with `--border`. A glyph is sized by an `--icon-*` token, never by `font-size`.**

| token | value | what takes it |
|---|---|---|
| `--control-h` | 1.75rem · 28px | every single-line control — input, select and filter trigger, search field, compact button, icon button, segmented option — as `min-block-size` |
| `--control-edge` | `--foreground` at 60% | the border of every FIELD — input, textarea, select and filter trigger, search field, bordered icon button — and of every popup and dialog |
| `--card-pad` | 0.75rem · 12px | the inset of `.card-terminal` and anything card-shaped |
| `--icon-sm` · `--icon-size` · `--icon-lg` · `--icon-xl` | 12 · 14 · 16 · 24px | beside a label, in a tag, a clear button · the default inside a control · a larger control · an empty state, a page-level load |
| `--dot-size` | 0.5rem · 8px | the status dot |
| `--status-h` | 2rem · 32px | `footer.status`, so a page can reserve exactly that much room above it |
| `--content-pad` | 1.5rem, **1.25rem below 40rem** | the page gutter `.wrap` already reads |

**Why 28px.** seedr and configr each settled on Tailwind's `h-7` for their inputs, filter and sort
triggers and icon buttons, independently — which is the best evidence a number is right — while
the system offered no height at all, so a compact button sat a few pixels short of the field
beside it and every surface squared the row up by hand.

- **`min-block-size`, never `height`.** A coarse pointer grows every control to 44px, and a label
  that wraps must be able to grow its box. Mind the arithmetic inside it: 12px text at the body
  line height (1.5) is an 18px line, and a 1px edge top and bottom leaves **8px of block padding**
  in 28px. A text field with `padding-block: .3rem` measures 29.6px, taller than the button beside
  it.
- **The field edge is not `--border`.** `--border` is a divider, quiet on purpose so a table does
  not read as a spreadsheet, and it measures 1.23–2.00:1 — under the 3:1 WCAG 1.4.11 asks of a
  boundary the reader has to find. configr's `--primary` at 30% measures 1.55–2.65:1. The
  foreground at 60% clears 3:1 on every theme and surface: warm 3.41 / 3.31 / 3.24, green 4.56 /
  4.53 / 4.52, mono 5.23 / 5.20 / 5.19, paper 4.29 / 4.20 / 4.18 (`--background` / `--card` /
  `--muted`).
- **A container keeps `--border`.** A card, a panel, a table rule is not a control and must not
  outline itself like one. The split is the point: a reader finds the fields on a form because
  only the fields carry the stronger edge.
- **A glyph is not text.** ONE TEXT SIZE forbids sizing a glyph with `font-size`, and a mask has no
  intrinsic size, so a glyph takes an `--icon-*` token for its box. An inline `<svg>` inside a
  system control takes the same token, so a lucide component and a mask sit at one size in one
  row. (These are not the rem table removed in 0.56.0 — that one only existed to scale icons with
  the fluid root size.)
- **The phone gutter is the token's.** 1.5rem a side is 48px of a 375px screen. danieldeusing.de
  answered it privately (`px-5 sm:px-[var(--content-pad)]`); the token now carries 1.25rem below
  40rem, so that becomes `px-[var(--content-pad)]` and every `.wrap` gets it for free.
- Tailwind: `border-control-edge`. The sizes are read with `var()`: `min-h-(--control-h)`,
  `size-(--icon-sm)`.

## One display step, for a public page's title (0.60.0)

> **`--fs-display` is 30px, and 36px from 40rem wide. It titles a public-site page and sets an
> error page's status code — nothing else. An app's title stays `--fs-2xl`. It is not a text
> size.**

The type scale, whole, as the skill states it plus the one step this release adds:

| token | size | for |
|---|---|---|
| `--fs-base` | 12px | ALL text a person reads: body, tables, labels, controls, code |
| `--fs-lg` | 15px | h3, a section head |
| `--fs-xl` | 18px | h2 |
| `--fs-2xl` | 24px | h1 — an app page's title |
| `--fs-display` | **30px, 36px from 40rem** | a public-site page title (`.page-title--display`, content.css) and an error page's status code — only |

**Why it exists (the lead, 2026-09-28).** danieldeusing.de is a source of truth, and it titles its
pages at 30px, 36px from 40rem (Tailwind `text-3xl sm:text-4xl`, on all twelve page titles). The
scale topped out at 24px, so
either the public site shrank to fit the system or the system gained one step. It gained one step,
and only that: a presented page's title is a different thing from an app's, whose title is read at a
glance among controls and stays `--fs-2xl`.

- **The token carries the breakpoint.** It is 30px below 40rem and 36px from it — the site's own
  `sm:` width, which is also where the system's phone gutter steps (`--content-pad`) — so a title
  written with it needs no media query, and `text-3xl sm:text-4xl` becomes one class.
- **Write the class, never the token on an element of your own.** A public page title is
  `.page-title--display`; an error page's code is the error-page template's. A bare `<h1>` stays
  `--fs-2xl` — the element default does not change, so no app title grows by accident.
- **Not a text size.** No paragraph, label, heading inside a page, button or stat takes it. A figure
  that must stand out is a stat tile's value at `--fs-xl`, not a display number.
- **Tailwind:** `text-fs-display`. It sets the SIZE only: the line height stays the heading's
  (`--lh-tight`, 1.3), where `text-3xl` brought its own 1.2. Measured by
  `scripts/check-foundations.mjs` at 375, 639, 640 and 1440px wide.

## Categorical colours: twelve names, one lightness per theme (0.60.0)

> **A colour that names a THING — a vendor, an agent, a series, a tag, a person — is one of twelve
> `--cat-*` names. Which thing gets which name is the surface's decision; the palette is the
> system's.**

`--cat-red` `--cat-orange` `--cat-amber` `--cat-lime` `--cat-green` `--cat-teal` `--cat-cyan`
`--cat-blue` `--cat-indigo` `--cat-violet` `--cat-purple` `--cat-pink`

Each is `oklch(var(--cat-l) var(--cat-c) <hue>)`: one lightness/chroma pair per theme, the hue
varies. That is cockpit's identity-tag mechanism with names instead of free angles, so seedr and
configr can map their types onto a name. Measured over the **whole hue circle**, not only the
twelve, against `--background`, `--card` and `--muted`:

| theme | L / C | worst text contrast | worst `--background` on a fill |
|---|---|---|---|
| warm | 0.45 / 0.075 | 5.57 (teal) | 6.20 |
| paper | 0.45 / 0.075 | 6.18 (teal) | 6.81 |
| green | 0.74 / 0.12 | 7.65 (pink) | 8.32 |
| mono | 0.74 / 0.12 | 7.71 (pink) | 8.32 |

Every hue lies inside sRGB at these L/C, so no browser gamut-maps one into a different colour.

| use | write |
|---|---|
| text | `color: var(--cat-teal)` · Tailwind `text-cat-teal` |
| an edge | `border: 1px solid color-mix(in srgb, var(--cat-teal) 50%, transparent)` |
| a solid fill | `background: var(--cat-teal); color: var(--background)` — the pair reversed |
| a chart series, an SVG | `fill: var(--cat-teal)` / `stroke: var(--cat-teal)` |

- **A hash picks a NAME.** A surface that derives a colour from a string does
  `CAT[hash(name) % 12]` over the twelve names — never `hsl(hash % 360, …)`. The measurement covers
  the names, not whatever angle a hash produces.
- **A hue says which thing, never how it went.** A verdict (ok, failed, waiting) is a state and
  takes the status tokens through `data-tone`.
- It replaces seedr's `--badge-*`, configr's seventeen hue families, cockpit's `--tag-l`/`--tag-c`
  and family's `--fam-in/out/net`. The mapping from thing to name moves into each surface.
- **On paper every theme takes the light pair** (tokens.css flips it under `@media print`): the
  dark themes' pair is light text, 2.19:1 on white paper, and 7.10:1 after the flip.

## Depth is a glow, and a dialog is edged (0.60.0)

> **A popup and a dialog glow; they never cast a black shadow. Both are edged with
> `--control-edge`. A modal's page is dimmed with `--backdrop`.**

| token | value | on |
|---|---|---|
| `--elev-float` | `0 0 20px var(--glow-soft)` | dropdown and select panels, the context menu, the tooltip — Tailwind `shadow-float` |
| `--elev-modal` | `0 0 40px var(--glow-soft)` | a dialog — Tailwind `shadow-modal` |
| `--backdrop` | black at 0.5 (warm, paper) / 0.6 (green, mono) | a dialog's `::backdrop`, or a scrim element |

- **No black drop shadow**, `rgba(0,0,0,…)` or Tailwind `shadow-lg`, on a system surface. It is the
  one non-token colour a component can smuggle in, it vanishes on the two near-black themes, and
  on the light ones it is another design language. The glow is the one the dropdown already wore.
- **Why every popup and dialog carries `--control-edge`**: the scrim only DIMS. On green and mono a
  near-black card over a scrimmed near-black page is 1.04–1.08:1 whatever the alpha — nothing
  separates it but its edge, which measures 4.89:1 (green) and 5.55:1 (mono) against the scrimmed
  page. On warm and paper the dialog's own fill does the separating (3.62 and 3.64:1).
- The names avoid `--shadow-*` on purpose: that namespace is Tailwind's, and a token there would
  reskin every existing `shadow-*` utility. Tailwind's own `shadow-sm…2xl` are left alone.

## In a Tailwind app, a utility beats the system (0.60.0)

> **`@danieldeusing/design/tailwind.css` is layered. Anything you write — a utility, or your own
> unlayered CSS — beats the system's rule on the same element. Only the tokens and the print
> layer still outrank you.**

Until 0.60.0 the entry imported every file unlayered, and an unlayered rule beats every cascade
layer whatever its specificity. So the system silently won over each utility written on a
system-styled element. Now `base.css` sits in `@layer base` (after Preflight), every component
file in `@layer components`, and Tailwind's utilities, the next layer, win. `tokens.css` and
`print.css` stay unlayered: the first because configr and seedr's studio import it directly and
it must cascade the same way through the entry; the second because on paper it must beat
everything, a utility included.

What changed on the element, measured by `scripts/check-tailwind-layers.mjs` against both entries
(each changed row fails against the 0.59.0 entry and passes against this one; the last row is what
did not change):

| on the same element | 0.59.0 | 0.60.0 |
|---|---|---|
| `p-6` on a `.card-terminal`, `px-3` on a `.btn-terminal--compact` | dead — the class's padding won | the utility wins |
| any border-colour utility (`border-primary`, `hover:border-destructive`, `divide-*`) | dead — base's `* { border-color: var(--border) }` won | the utility wins |
| `outline-none` | dead — the system ring showed as well as your own | wins: **the element's focus indicator is now yours** |
| `hidden` (or `md:flex`) on a class that sets `display` | the class won; the element stayed visible | the utility wins |
| `leading-*`, `text-*`, `m*-*` on a styled element (`body`, `th`/`td`, a heading) | the element rule won | the utility wins |
| a bare `<h1>`–`<h3>` | Preflight's reset: 12px, weight 400 | the heading steps (the defaults below) |
| `rounded-xs`, `rounded-2xl`, `-3xl`, `-4xl` | Tailwind's 2px…32px | square (`rounded-full` stays round: a true circle) |
| your own unlayered CSS (Astro-scoped styles, rules outside `@layer`) | specificity decided | yours wins |
| the tokens, `html.anim-off`, `data-tone`; print | — | unchanged: unlayered |

What a consumer sees move, measured in the release review (2026-09-29): pagr's own Tailwind 4.3.0
rebuilt its CSS against 0.59.0 and against this entry, and 14 pages were compared at 1280 and 375px
(warm theme, a Tab walk, state probes). It includes the element defaults below. What each site does
about each row is decided in that surface's own 0.60.0 rollout; this is only what moves.

| # | danieldeusing.de (pagr) | where | kind |
|---|---|---|---|
| 1 | the open history dropdown's trigger turns from `--primary` to muted: the Astro-scoped `.nav-ctrl` colour now beats `.dropdown[open] > summary` | header, every page | regression, fix in pagr |
| 2 | the SYNOPSIS `<h1>` goes from 12px/400 to 24px/700, its line from 18 to 31.2px | `/` | decide: give it a class |
| 3 | article table text goes from 12 to 10.5px, headers turn `--primary`/700, cell padding 13.6 to 6px: the typography plugin now wins | the table article, EN and DE | regression, must fix |
| 4 | `h2.comment` becomes bold | /cv/, /imprint/, /privacy/ | decide |
| 5 | the CV's `h3` goes from 12 to 15px | /cv/ | decide |
| 6 | figcaptions become italic | /apps/configr/, /apps/seedr/ | decide |
| 7 | photos gain a 1px `--border` frame inside their card | /about/ | decide |
| 8 | inline `code` in the install table gains a 1px border and `overflow-wrap: anywhere` | /apps/configr/ | decide |
| 9 | the gap after a heading follows its `mt-*` utility (4 to 20px; 0 in the article), where it was 9.6px | /cv/, /apps/, /articles/tags/ai/, the article | intended by pagr's markup |
| 10 | card padding utilities apply (`p-6` 24px, `sm:p-8` 32px, `p-2`, `p-5`) | 9 cards | intended by pagr's markup |
| 11 | `h2.mt-6` margin goes from 40 to 24px | /apps/configr/ | intended |
| 12 | the search input's outline is gone, and its label's border turns `--primary` on focus: focus stays visible | /articles/ | acceptable |
| 13 | the blockquote rule and the active tag chip's edge turn `--primary`: dead pagr intent, now live | the article, /articles/ | improvement |

seedr web, read from source (it is on `^0.56.0` and not in this rollout):

- Home's `h1.text-md` becomes bold.
- The 17 `h2.comment` headings on Privacy and Impressum become bold.
- 9 `h3.prompt` lose their 18px line height (15.6px).

configr and seedr's studio import `tokens.css` alone, which stays unlayered: no cascade change. They
gain the new tokens, the kill switch, the tone map and the `hidden` rule.

Rules for a Tailwind author:

- **A control that says `outline-none` must draw its own focus**, a ring or an edge on
  `focus-visible`. The system's ring can no longer rescue it.
- **Never import a system file unlayered to win an argument.** If the system is wrong for one
  element, a utility now says so; if it is wrong for everybody, fix it in the system.
- For maintainers: **every component file joins `layer(components)`** in `src/tailwind.css`. One
  missing word reinstates the old failure for that file; the check's static half fails on it.

## Bare markup has a house look (0.60.0)

> **Write plain `<code>`, `<pre>`, `<mark>`, `<hr>`, `<blockquote>`, `<figure>` and headings, and
> they look like the estate. Any class you put on them wins.**

| element | look |
|---|---|
| `h1` · `h2` · `h3` | `--fs-2xl` · `--fs-xl` · `--fs-lg`, weight 700, `--lh-tight`, colour inherited |
| `h4` · `h5` · `h6` | body size (`--fs-base`), weight 700 — no fourth heading size |
| `code`, `kbd`, `samp`, `pre` | the page's font at `--fs-base`, even inside a heading |
| inline `code`, `kbd` | a `--muted` box, 1px `--border` hairline, `.05rem .35rem`, wraps anywhere — in a table cell only where it would overflow (0.61.0); square |
| `pre` | a `--muted` block, 1px `--border`, `.75rem 1rem`, `--lh-base`, scrolls sideways, `tab-size: 2`; its `code` draws no second box |
| `mark` | `--warning` at 30% under `--foreground` text; in forced colours the palette's `Mark` under `MarkText` |
| `hr` | one 1px `--border` rule, 1.5rem above and below |
| `blockquote` | a 2px `--border` start rule, `.75rem` in, muted colour; a `cite` sits on its own line, upright |
| `figure` | no margin; an `img`, `video` or `svg` inside is a block with a 1px `--border` edge; `figcaption` muted italic, `.5rem` below |

- **Why each exists.** A page that wrote plain markup got the user agent's look: measured on
  0.59.0, `<code>` and `<pre>` in the generic `monospace` rather than JetBrains Mono, a `<mark>`
  yellow on black on all four themes, an inset grey `<hr>`, an h3 at 14.04px. Meanwhile cockpit
  carried `code.inline` in 831 places and pagr, seedr and configr each drew their own.
- **`<mark>` takes `--foreground`, not the surrounding colour.** That pair is measured — 5.54:1 at
  worst (green, over `--muted`). A mark that inherited its colour inside muted text (a caption, a
  table header, a nav label) would put `--muted-foreground` on the tint at 2.79–4.38:1.
- **Zero specificity, with one exception you must not "tidy".** The rules are wrapped in
  `:where()`, so any class beats them — except the heading size and weight, the code font and
  `pre`'s line height, which are plain type selectors. In a Tailwind app base.css shares
  `@layer base` with Preflight, and Preflight resets exactly those properties with type selectors;
  the `:where()` form lost to it (a bare h1, h2 and h3 rendered at 12px, weight 400). `pre`'s line
  height has its own reason: the code font's `font` shorthand resets line height at type
  specificity, so the block's own has to match it. A class still beats a type selector.
- **In forced colours a mark is the palette's `Mark` under `MarkText`.** The mode swaps an author
  background for Canvas and keeps its alpha, so the 30% tint faded to about 1.04:1 on the page and
  a search hit vanished; the system pair is the reader's own highlight.
- **Pages that relied on unstyled elements change.** A bare h3 goes from the browser's 14.04px to
  15px; code switches font. Style an element with a class if it must look different; do not reset
  the default locally.

## Stacked blocks keep a gap, wrapped or not (0.61.0, Daniel)

A callout sat flush on a table's search toolbar in cockpit. The system's rhythm rules were all
sibling rules (`p + .tablewrap`), and a page that paints itself from JS puts every block in its own
mount `<div>`, so the two blocks were never siblings and nothing spaced them. `base.css` now keeps
**.6rem** above a block when it follows another one:

- **as siblings** (two callouts are two notes);
- **after a mount** (an unclassed `<div>` or a tab panel that holds something);
- **as the first thing in a mount** that follows something.

All three only inside a container that flows as a column of blocks: an unclassed, unstyled `<div>`,
a `section`, `article`, `main`, `.wrap`, `.content`, a tab panel, a fold's, a dialog's or a panel's
body. **Never inside a class-carrying `<div>`, and never inside an element with a `style`
attribute**: those are grids and flex rows with a gap of their own, and a margin there adds to the
gap and drops one item of a row below its neighbours (a table beside a label sat 9.6px low).

The blocks are `STACKED_BLOCKS` in `runtime/rhythm.js`: `.callout` `.notice` `.fence` `.filter-bar`
`.tablewrap` `table` `pre` `.code-block` `.cmd` `.legend` `.chart` `.tabs` `details.fold` `.card-grid`
`.stat-grid` `.row-list` `.console`. Margins collapse, so where a gap was already there nothing
changes, and the rules weigh nothing: any margin a page writes wins.

**Flush on purpose is said out loud.** A run of folds is one list, each fold drawing its own rule, so
`details.fold + details.fold` stays flush. Anything else a page wants flush carries **`data-flush`**
on the lower block.

**What the rule does not cover**, by design, because it would have to guess (`findFlushBlocks()`
below finds every one of them on a rendered page):

- **an empty mount between two blocks** — a slot that renders nothing is skipped, so it does not push
  the page down, and the blocks on either side of it can touch;
- **a classed mount** — `<div class="rules">` reads as a layout, not a mount;
- **a mount two deep** — `<div><div><p class="callout">`: only one level of wrapping is read;
- **a grid or flex row whose items are unclassed `<div>`s** — the margin stays inside the second item.
  Give those items a class.

**The check.** `findFlushBlocks(root = document)` (runtime, `rhythm.js`) returns every pair of
rendered blocks from that list, neither inside the other, overlapping horizontally, with 0px between
their border boxes — honouring the same two exceptions. A page-level browser check calls it and fails
on a non-empty answer:

```js
const { findFlushBlocks } = await import("/runtime/rhythm.js"); // or the pinned CDN barrel
const flush = findFlushBlocks().map(({ upper, lower }) => [upper, lower].map((el) => el.id || el.className));
```

`scripts/check-data.mjs` renders cockpit's case — a callout in one mount over a table the engine
paints in the next — and proves the helper finds the pair once the gap is taken away.

## Motion: one switch stops all of it (0.60.0)

> **`html.anim-off` means nothing moves: it stops keyframes AND transitions, and hides the block
> cursor. It lives in `tokens.css`, so every surface has it.**

- The pre-paint script sets it from `prefers-reduced-motion`; the footer's `[x] anim` sets it by
  hand. Until 0.60.0 it stopped keyframes only and lived in `components.css` — a hover fade still
  ran (seedr added a rule of its own to stop transitions and keep the switch honest) and the
  tokens-only surfaces had no switch at all.
- Shared keyframes: `dd-spin` (`animation: dd-spin 1s linear infinite`) and `dd-pulse`
  (`animation: dd-pulse 2s ease-in-out infinite`). Use them rather than a local `spin`; the `dd-`
  prefix keeps Tailwind's own `spin` from shadowing them.
- Transitions are `.15s ease`.
- **Forced colours stop every transition too** (`tokens.css`, the same `!important` switch). A colour
  in mid-transition is a plain colour, not a system colour: for .15s a redrawn state painted the
  author's palette on the forced page (a segment word at 1.02:1).
- **A file that runs an animation also stops it under `@media (prefers-reduced-motion: reduce)`**
  itself. The switch covers a page whose pre-paint script maps the preference onto the class, and a
  page may not have one.
- **Never wait for `transitionend` or `animationend`** to finish a state change: under the switch
  neither ever fires.
- In a Tailwind app, do not put `!` on a motion utility. The switch is unlayered `!important`, the
  weakest kind of important, so `!animate-spin` would outrank it.

## `hidden` always hides (0.60.0)

> **An element with the `hidden` attribute is not displayed, whatever `display` a class, a media
> query or an inline style gives it. One rule in `tokens.css` does it; no component guards it.**

- The browser's own `[hidden] { display: none }` loses to any author rule that sets `display`, so
  a `.row { display: flex }` or a restacked table row stayed on screen, and in the accessibility
  tree, where a screen reader announced it. `[hidden]:not([hidden="until-found" i]) { display: none
  !important }` answers it once, for every element, on every surface that loads `tokens.css`.
- `hidden="until-found"` is left alone: find-in-page must be able to reveal it.
- To show an element, remove the attribute. Never add a `[hidden]` guard of your own.
- **It hides on paper too.** The rule is not scoped to the screen, so a print-only reveal like
  `@media print { .details[hidden] { display: block } }` no longer shows anything. Something to
  reveal only in print carries a class, not `hidden`, or its reveal is `!important` at a higher
  specificity, as `data.css`'s print rule for tab panels is.

## `data-tone`: one attribute colours every state (0.60.0)

> **Put `data-tone` on the component; the component reads `var(--tone, <its own default>)`.**

| `data-tone` | `--tone` resolves to |
|---|---|
| `primary` | `--primary` |
| `success` · `warning` · `destructive` · `info` · `pending` | the status token of that name |
| `muted` | `--muted-foreground` |

One attribute drives `.notice`, `.callout`, `.banner`, `.tag`, `.btn-icon`, `.dot` and
`.stat-tile` alike, replacing three spellings of the same idea (cockpit's attribute vocabulary,
configr's tone prop, seedr's per-component switch).

- **Seven values and no others.** An unknown value sets nothing, so the component falls back to
  its own default rather than to no colour.
- **It inherits.** A component draws its glyph on a pseudo-element, which only sees the tone by
  inheriting it. So a component nested in a toned container takes the container's tone unless it
  sets a `data-tone` of its own.
- **The tone is a text, edge and glyph colour.** Under text it is at most a **6%** tint: tone text
  on a 6% tone tint measures 4.53:1 or better on every theme and surface, and at 8% paper's warning
  falls to 4.41. A pressed or selected fill under `--primary` text is 12%.
- A state is a tone; a *thing* is a categorical hue. Do not colour an agent with `data-tone`.

## Text colour utilities, and why there is no `.text-muted` (0.60.0)

`.text-foreground` `.text-muted-foreground` `.text-primary` `.text-success` `.text-warning`
`.text-destructive` `.text-info` `.text-pending` — one declaration each, `color: var(--token)`.

- The names are Tailwind's own, so the same markup works in a build-free page and a Tailwind app
  — at equal specificity. Against a component rule of HIGHER specificity
  (`.dropdown > summary.text-primary`, `header.bar .brand.text-primary`) the two differ: the bundle
  keeps the component's colour, a Tailwind app applies the utility (its layer beats components).
  Where the colour must hold in both, colour a wrapper, or write the component's own variant.
- **They ship in `utilities.css`, which the bundle imports after every component file** (only
  `print.css` follows). A utility is written on a component — `.doc-link.text-primary`,
  `.btn-terminal--ghost.text-destructive` — and at equal specificity the later rule wins, so the
  bundle now resolves it the way a Tailwind app does. The Tailwind entry does not import the file:
  Tailwind generates its own `text-*`.
- **There is no `.text-muted`.** Tailwind renders that name as the `--muted` SURFACE colour, a
  background shade: the same class would be a readable label in one world and near-invisible text
  in the other. Quieter text is `.text-muted-foreground`.
- **There is no opacity step.** "Quieter" is the muted token, whose contrast is measured;
  `opacity: .6` on text is an alpha nobody measured, on four themes.

## Thin scrollbars are opt-in (0.60.0)

`.scrollbars-thin`, on `html` or on any scroller (it ships in `chrome.css`): the `.tablewrap`
recipe — thumb `--border`, hover `--muted-foreground`, transparent track. `scrollbar-width: thin`
is declared only inside `@supports not selector(::-webkit-scrollbar)`, because declaring both
APIs makes Chrome drop the WebKit rules. Opt in where a scroller is chrome (a side panel, a code
pane); never make it global, because the default scrollbar is the one a reader can find.

## `.bg-dots` (0.60.0)

A 24px lattice of 1px `--border` dots — configr's catalogue ground. Put it behind a grid or a list
of cards, never behind a block of text, where a dot under a letter is noise at 12px. Decorative:
it carries no meaning.

## JetBrains Mono under a strict CSP

`fonts.css` points its `@font-face` at jsDelivr. An app whose Content-Security-Policy says
`font-src 'self'` (configr's Tauri window) blocks it, and the stack silently falls back to Menlo.
JetBrains Mono stays the only face; there are two ways to serve it locally:

1. **Import the font package in the app** — `@import "@fontsource-variable/jetbrains-mono";` — and
   let the bundler emit the woff2 files. It provides exactly the family the token stack leads with,
   `"JetBrains Mono Variable"`. configr and seedr's studio do this.
2. **Rewrite `fonts.css` to local files** when there is no bundler: fetch the fontsource version
   `fonts.css` pins, copy its woff2 files beside it, and point the `src:` urls at them. seedr's
   `apps/web/scripts/vendor-playground-assets.mjs` does this for the playgrounds, and fails the
   build if any remote url survives.

Never swap the face for one that happens to be installed; the stack's `Menlo` is a fallback, not a
choice.

## Icon mask tokens (0.60.0)

> **A glyph is a CSS mask of an `--ico-*` token, painted in `currentColor` and sized by an
> `--icon-*` token. Never an `<img>`, never a pasted `<svg>` per page.**

Draw one with `.ico` (icons.css) or `[data-icon]`. A glyph drawn in a rule of your own takes the
whole recipe, its forced-colours half included:

```css
.glyph {
  inline-size: var(--icon-size);
  block-size: var(--icon-size);
  background: currentColor;
  mask: var(--ico-check) center / contain no-repeat;
}
@media (forced-colors: active) {
  .glyph { forced-color-adjust: preserve-parent-color; }
  @supports not (forced-color-adjust: preserve-parent-color) {
    .glyph { forced-color-adjust: none; background: CanvasText; }
  }
}
```

A mask keeps only the shape and paints it in the current text colour, so one token is right on all
four themes and in every state colour with nothing declared per theme — the reason the bin and the
pencil were masks before any of this existed. The class and `data-icon` layer that applies these
(`.ico`, `[data-icon]`) is the icon system's; this is the token half it draws from.

| token | lucide icon | used for |
|---|---|---|
| `--ico-check` · `--ico-minus` | check · minus | a chosen option, a checked / indeterminate checkbox |
| `--ico-x` | x | clear, dismiss, remove a chip or a thumbnail |
| `--ico-search` · `--ico-filter` | search · **funnel** | the search field, a filter trigger |
| `--ico-arrow-up` · `--ico-arrow-down` | arrow-up · arrow-down | sort direction |
| `--ico-chevron-down` · `--ico-chevron-left` | chevron-down · chevron-left | open a list, go back |
| `--ico-trash-2` · `--ico-pencil` | trash-2 · pencil | the destructive and edit row actions |
| `--ico-loader-circle` | loader-circle | busy, spinner (`dd-spin`) |
| `--ico-refresh-cw` · `--ico-history` · `--ico-download` | refresh-cw · history · download | refresh, history menu, pull |
| `--ico-star` · `--ico-star-filled` | star (filled for the pressed state) | a favourite toggle |
| `--ico-home` · `--ico-package` · `--ico-image-plus` · `--ico-triangle-alert` | **house** · package · image-plus · triangle-alert | install scope, a package source, the drop zone, a failed state |

- **The names are the estate's `data-icon` words**, not always lucide's current file names: lucide
  renamed `filter` to `funnel` and `home` to `house`; markup keeps the word a reader expects.
- Source: lucide 0.559.0, stroke 2 on a 24-unit box — the same drawing seedr and configr ship through
  lucide-react. The version is named once, in `tokens.css`; `icons.md` has the whole set of 51 words and
  why seedr's 0.575.0 draws the same. Lucide's ISC notice and Feather's MIT notice travel with the
  tokens in `tokens.css`, into the minified bundle too; `tokens.json` leaves the drawings out.
- **The forced-colours half is not optional.** Windows High Contrast swaps every author
  background for Canvas, and a mask glyph IS a background: without it every glyph paints nothing.
  `preserve-parent-color` paints the glyph in the colour its parent was forced to (CanvasText in
  text, LinkText in a link, ButtonText in a button). Not `forced-color-adjust: none` alone: the
  glyph keeps its author colour, measured at 1.11–1.78:1 against the forced palette, or nothing at
  all. CanvasText is the fallback for an engine without the value.
- **Colour the parent, never the glyph.** `preserve-parent-color` takes over only while the glyph
  has no colour of its own. A class or an inline style on the glyph itself —
  `<span class="glyph text-primary">` — makes it act like `none`: measured at 2.94:1 on a dark
  palette and at nothing on three other theme × palette pairs. Write
  `<span class="text-primary"><span class="glyph"></span></span>`, or put the glyph inside the
  link, button or toned element whose colour it should wear. Nothing on the glyph enforces this: a
  `color: inherit` there would lose to any more specific colour, and there is no `!important` guard.
- **The glyph is decoration.** An icon-only control is named by its `aria-label`, which names the
  target ("remove shot-1.png"), not the glyph.
- **Adding one:** one declaration in the icon block of `tokens.css`, generated from lucide rather
  than drawn by hand, named after its `data-icon` word. Inside the url: no semicolon (the token
  build splits a declaration there), no raw `#` (write `%23`), `<` and `>` percent-encoded,
  attributes single-quoted, and **no attribute twice** — a duplicate makes the SVG invalid and the
  mask paints nothing, silently. `scripts/check-foundations.mjs` decodes every token and fails on
  one that does not paint.
