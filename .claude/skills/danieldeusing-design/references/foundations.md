# Foundations: the tokens under every component, bare markup, the Tailwind entry

Reference for the `danieldeusing-design` skill. Read it before you size a control, pick a colour
for a *thing*, give a popup depth, animate anything, colour a state, write bare markup that should
look like the estate, or import the package into a Tailwind app. Every other reference resolves
against what is here. The component vocabulary, and the rule that a consumer never redeclares any
of it, are in `SKILL.md`.

Contents:

- One height, one field edge, one card inset, four glyph sizes (0.60.0)
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
  separates it but its edge, which measures 4.75:1 (green) and 5.39:1 (mono) against the scrimmed
  page. On warm and paper the dialog's own fill does the separating (3.58 and 3.64:1).
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
(23 of its 38 assertions fail on the 0.59.0 entry):

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

What that means per consumer, and what to delete:

- **seedr web.** Its border-colour utilities render as written — the active filter trigger, the
  filter chips, badge edges, detail labels and card hovers stop rendering `--border`. The shadcn
  button shows its own ring and no longer the system outline beside it. Four local workarounds
  become redundant: the radius steps in `web/styles/index.css` (now in the entry), its
  `html.anim-off` transition rule (now in tokens.css), and the two unlayered patches that exist
  only because a utility could not win (`input[type="text"][data-search]` padding, the
  `[data-term-out] table` edge padding).
- **danieldeusing.de.** Every `p-2`, `p-5`, `p-6` and `sm:p-8` on a `.card-terminal` now applies
  (nine card sites on About, ArticlePost, Configr, Contact, Home and Seedr) — delete them so the
  cards take `--card-pad`, as the card reference says. The non-live app card's
  `hover:border-destructive hover:shadow-none` starts to show. A heading's `mt-6` now beats the
  section rhythm's 2.5rem. The article search's `outline-none` wins, and its label's
  `focus-within:border-primary` — dead until now — becomes the indicator. The header's scoped
  history-trigger styles beat `chrome.css`.
- **configr, seedr studio.** They import `tokens.css` only, which stays unlayered: no cascade
  change. They gain the new tokens, the kill switch and the tone map.

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
| inline `code`, `kbd` | a `--muted` box, 1px `--border` hairline, `.05rem .35rem`, wraps anywhere; square |
| `pre` | a `--muted` block, 1px `--border`, `.75rem 1rem`, `--lh-base`, scrolls sideways, `tab-size: 2`; its `code` draws no second box |
| `mark` | `--warning` at 30% under `--foreground` text |
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
  `:where()`, so any class beats them — except the heading size and weight and the code font,
  which are plain type selectors. In a Tailwind app base.css shares `@layer base` with Preflight,
  and Preflight resets exactly those properties with type selectors; the `:where()` form lost to it
  (a bare h1, h2 and h3 rendered at 12px, weight 400). A class still beats a type selector.
- **Pages that relied on unstyled elements change.** A bare h3 goes from the browser's 14.04px to
  15px; code switches font. Style an element with a class if it must look different; do not reset
  the default locally.

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
- **A file that runs an animation also stops it under `@media (prefers-reduced-motion: reduce)`**
  itself. The switch covers a page whose pre-paint script maps the preference onto the class, and a
  page may not have one.
- **Never wait for `transitionend` or `animationend`** to finish a state change: under the switch
  neither ever fires.
- In a Tailwind app, do not put `!` on a motion utility. The switch is unlayered `!important`, the
  weakest kind of important, so `!animate-spin` would outrank it.

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

- The names are Tailwind's own, so the same markup works in a build-free page and a Tailwind app.
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

```css
inline-size: var(--icon-size);
block-size: var(--icon-size);
background: currentColor;
mask: var(--ico-check) center / contain no-repeat;
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
- Source: lucide 0.575.0 (what seedr's lucide-react resolves), stroke 2 on a 24-unit box — the same
  drawing seedr and configr ship through lucide-react. Lucide's ISC notice and Feather's MIT notice
  travel with the tokens in `tokens.css`.
- **The glyph is decoration.** An icon-only control is named by its `aria-label`, which names the
  target ("remove shot-1.png"), not the glyph.
- **Adding one:** one declaration in the icon block of `tokens.css`, generated from lucide rather
  than drawn by hand, named after its `data-icon` word. Inside the url: no semicolon (the token
  build splits a declaration there), no raw `#` (write `%23`), `<` and `>` percent-encoded,
  attributes single-quoted, and **no attribute twice** — a duplicate makes the SVG invalid and the
  mask paints nothing, silently. `scripts/check-foundations.mjs` decodes every token and fails on
  one that does not paint.
