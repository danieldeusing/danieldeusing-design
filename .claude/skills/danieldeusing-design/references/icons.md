# Icons: the masks, `.ico`, the glyph vocabulary, flags and social marks

Reference for the `danieldeusing-design` skill. Read it before you put a glyph on a page, choose one
for an action, colour one, name an icon-only control, draw a glyph in a component, or reach for a
brand logo. The tokens are in `tokens.css`, `.ico` is in `icons.css`, and the demo is
`examples/icons.html`. The component vocabulary, and the rule that a consumer never redeclares any
of it, are in `SKILL.md`.

Contents:

- A glyph is a mask, and `data-icon` names it (0.60.0)
- `.ico`: a glyph as an element (0.60.0)
- Forced colours: a glyph is its context's forced colour (0.60.0)
- The set: 51 words, and nothing else (0.60.0)
- Two kinds of glyph: text and mask (0.60.0)
- One glyph per action, and the tone says the consequence (0.60.0)
- Flags, and the two social marks (0.60.0)
- A word the set lacks (0.60.0)
- In a framework app (0.60.0)

## A glyph is a mask, and `data-icon` names it (0.60.0)

> **Write `data-icon="<word>"`. The system sets `--ico` to that word's mask; a component draws it
> with `mask: var(--ico)`, a page draws it with `.ico`. Never paste an `<svg>`, never an `<img>`,
> never write a token name in markup.**

Before 0.60.0 one glyph was three drawings. configr and seedr drew lucide through `lucide-react`,
danieldeusing.de pasted `<svg>` elements (filled simple-icons for its social row, outlines in its
header), and the system itself had exactly two glyphs, a hand-made bin and pencil. A build-free
page that wanted a magnifier had nowhere to get one but a pasted path.

Now the drawings live once, in `tokens.css`:

- **`--ico-<word>`** — one lucide icon per token, as an SVG data url, stroke 2 on a 24-unit box:
  the drawing configr and seedr already ship through `lucide-react`, so a mask and a lucide
  component side by side are the same picture. Only the shape matters, because it is used as a
  MASK and painted in `currentColor`: one token is right on four themes and in every state colour.
- **`[data-icon="<word>"] { --ico: var(--ico-<word>) }`** — the mapping, one line per word, in the
  same file. It is why a component file that draws a glyph needs `tokens.css` and nothing else:
  `.btn-icon[data-icon]::before`, `.tag[data-icon]`, `.empty[data-icon]`, `.choice-card[data-icon]`
  and `.ico` all read `var(--ico)`, and a tokens-only surface (netmon, configr, seedr's studio) can
  load any one of those files beside it.

**A component swaps the glyph by state by setting `--ico` itself** — a busy `.btn-icon`
(`aria-busy="true"` with `aria-disabled="true"`, never `disabled`, which throws focus to `<body>`)
shows `loader-circle`, a pressed favourite `star-filled`. That works because the mapping sits in
`@layer base`, the weakest place a rule can be. The Tailwind entry imports `tokens.css` unlayered
and the component files in `layer(components)`, and an unlayered rule beats every layered one
whatever its specificity: measured with Tailwind 4.3.3 and the real `controls.css`, an unlayered
mapping kept the busy button on `refresh-cw`, the pressed star hollow, and made a
`[--ico:var(--ico-x)]` utility do nothing. In `base`, all three swap, in the Tailwind entry and in
the build-free bundle alike.

**`--ico` inherits**, as `--tone` does, because a pseudo-element only sees a custom property by
inheriting it. The consequence: an element with no word of its own takes the nearest glyph above it.
Give every `.ico` its own `data-icon`; never rely on a container's.

**An unknown word paints a solid square.** With no `--ico` the mask declaration is invalid at
computed-value time, the element has no mask, and its whole box paints in `currentColor`. That is
left loud on purpose: a missing glyph that painted nothing would leave an icon-only control as an
empty box nobody notices, and a square is reported the first time anyone sees it. In this
repository `node scripts/check-icons.mjs` fails any `data-icon` word or `var(--ico-…)` reference
with no token, with its `path:line`, before a square can ship.

## `.ico`: a glyph as an element (0.60.0)

```html
<span class="ico" data-icon="refresh-cw" aria-hidden="true"></span>refresh
```

| class | size | what takes it |
|---|---|---|
| `.ico--sm` | `--icon-sm` · 12px | inside a control at `--control-h` or on a text line: a tag, a chip, a filter or sort trigger, the menu's ✓, a clear ×, a meta stat, the when glyph |
| `.ico` | `--icon-size` · 14px | the default: a `.btn-terminal`'s icon slot, the search magnifier, a panel head, a tree row, a tab |
| `.ico--lg` | `--icon-lg` · 16px | a standalone glyph beside body text: a contact list, the header's history chevrons, the social marks |
| `.ico--xl` | `--icon-xl` · 24px | a glyph that heads a block: an empty state, a large notice, a choice card, a stat tile, a page title |

- **Four sizes, from tokens, never from `font-size`.** ONE TEXT SIZE forbids sizing a glyph with
  `font-size`, and a mask has no size of its own. configr's 8, 10, 18, 20 and 32px and seedr's 20
  and 32px move to the nearest step.
- **Colour is `currentColor`.** The glyph is its label's colour on every theme and in every state:
  it dims with a disabled control's label and reddens with a destructive button's.
- **`data-tone` on the `.ico` itself paints it in that tone** (`primary`, `success`, `warning`,
  `destructive`, `info`, `pending`, `muted`). **A tone on a container does not reach it**, although
  `--tone` inherits: a notice or a card with `data-tone="destructive"` would otherwise paint the
  glyph of every button inside it red beside a `--primary` label, and put a red mark beside a
  `.state` that reads "ok". A component that wants its glyphs in its tone colours its TEXT with the
  tone, and the glyph follows the text. (The spec wrote `var(--tone, currentColor)` for every
  `.ico`; the demo's retry glyph in a destructive container measured `--destructive` that way and
  `--primary`, its label's colour, this way. The icon button and the feedback components stop the
  same inheritance for their own glyphs.)
- **Colour the label or use `data-tone`; never `color` or a `text-*` class on the `.ico`.** In
  forced colours the glyph takes its parent's forced colour only while its own colour is
  inherited, so a `.ico` with a colour of its own keeps that author colour. Measured: `text-primary`
  on the glyph vanished on mono (light palette) and paper (dark), and read 1.34:1 on green (light)
  and 2.94:1 on warm (dark); the same colour on the label, or `data-tone` on the glyph, read 21:1
  on all eight. Nothing enforces this, and no `!important` guard should: a component may hand its
  glyph a system colour in its own forced-colours block (a fold summary's `.ico` gets
  `CanvasText`), and a guard would take that away too.
- **Decoration, by contract: `aria-hidden="true"` on every `.ico`.** The glyph repeats the word
  beside it, or it is a control's only content — and then the CONTROL is named, by an `aria-label`
  that names the target or the destination: `aria-label="remove poi/vu3"`, `aria-label="GitHub
  profile"`, never "trash icon". A glyph that means something with no word beside it — a result in
  a table cell — is `role="img"` with an `aria-label` instead. A stylesheet can set neither
  attribute; the markup owes both.
- **A `data-tip` on an icon-only control says what the name does not, or is left off.** `tooltip.js`
  makes the tip the control's description, so a tip that repeats the name is read out twice. And it
  never names the picture in words: configr's lint already refuses a tooltip that restates a glyph
  everyone reads ("close" on an ×, "refresh" on the arrows — `apps/configr/eslint-plugin-toolr-design.js:577-611`).
- **In running text** `vertical-align: -0.125em` sets the glyph on the x-height. In a flex row it
  does nothing, and the row's `align-items: center` places it.
- **It needs `tokens.css` and `icons.css`, nothing else** — no reset, base or components
  (`examples/icons.html?bare` is the proof, and `check-icons` runs every `.ico` assertion again
  there). `hidden` hides it: the system's one `[hidden]` rule in `tokens.css` outranks its display.
- **Print** keeps the paint (`print-color-adjust: exact`): a mask paints a background, and a browser
  leaves backgrounds off paper by default.
- **No radius, no motion.** A spinning busy glyph belongs to `.spinner` and to the icon button's
  busy state, and `html.anim-off` stops both.

**When not to use `.ico`:** inside a component that draws its own glyph from `data-icon` on
ITSELF — `.btn-icon`, `.tag`, `.empty`, `.notice--lg`, `.callout`, `.choice-card`, `.segmented`
options. Put the word on the component; a nested `.ico` there is a second glyph. And never for a
text glyph (below).

## Forced colours: a glyph is its context's forced colour (0.60.0)

> **Under `@media (forced-colors: active)` a mask glyph takes `forced-color-adjust:
> preserve-parent-color`, and, `@supports not` that value, `none` with a `CanvasText` background.
> Never `none` alone, and never a `color` on the glyph. `icons.css` gives `.ico` both branches, and
> `tokens.css` gives every `[data-icon]::before` glyph both; but a component's own rule paints over
> the default's `CanvasText`, so a component that paints such a glyph writes its own `@supports not`
> background. A glyph drawn any other way is its own file's to cover.**

Forced colours (Windows High Contrast) replace every author background with the system `Canvas`,
and a mask glyph IS a background. Measured in Chromium on the real `controls.css` and
`feedback.css` glyphs: with no rule, every glyph painted nothing, on all four themes and both
palettes — an icon-only button became an empty box.

**`forced-color-adjust: none` does not fix it.** Forcing happens at used-value time and inheritance
carries computed values, so under `none` the glyph keeps the AUTHOR's colour: warm's brown
measured 1.78:1 on a dark palette, and green's and mono's glyphs vanished on a light one. Worse, a
glyph in the author's colour is never `Canvas`, so a check that only asks "is it Canvas?" passes it.

**`preserve-parent-color` is the value built for this.** The glyph's `color` becomes the colour its
parent was forced to, and the background it paints with is left alone, so the glyph is its
label's colour in this mode too: `CanvasText` in text, `LinkText` in a link, `ButtonText` in a
button, `GrayText` when disabled, `HighlightText` on a selection a component redrew in `Highlight`.
Measured on all four themes and both palettes: 21:1 in text, in a button and on every component
glyph, 13.99:1 or better in a link, 13.98:1 disabled, 8.73:1 on a selection. The defaults, in full:

```css
@media (forced-colors: active) {
  @supports (forced-color-adjust: preserve-parent-color) {
    [data-icon]::before { forced-color-adjust: preserve-parent-color; --tone: currentColor; }
  }
  @supports not (forced-color-adjust: preserve-parent-color) {
    [data-icon]::before { forced-color-adjust: none; background: CanvasText; }
  }
}
```

`.ico` takes the same two branches in `icons.css`, painting `background: currentColor` in the first.

- `--tone: currentColor` brings along the glyphs that paint `var(--tone, …)` rather than
  `currentColor`; the tone itself goes, as every colour does in this mode — which is why a tone is
  never the only thing that says what a glyph means.
- The second branch is the fallback for an engine without `preserve-parent-color`, and it sets **no
  `color`**. Its `none` lets a component's own `@supports not` branch paint `currentColor` (under
  `auto` the mode forces that background to `Canvas`), and the missing `color` keeps that
  `currentColor` its host's forced colour: `controls.css`'s pressed icon button is `HighlightText`
  on `Highlight` that way, 11.31:1 (light palette) and 8.73:1 (dark). When the default set a
  `CanvasText` `color`, the same button measured 1.86:1 and 2.41:1.
- The fallback's `CanvasText` background is a floor, not an override. A component paints its glyph
  in a rule that outranks `base`, so it writes its own `@supports not` branch; `controls.css`,
  `feedback.css` and `tags.css` do. On a `.ico` the fallback does paint `CanvasText`, and its
  measured limit is a selection a component redrew in `Highlight`: 1.86:1 and 2.41:1 again, so that
  component gives its `.ico` `HighlightText` in its own `@supports not` branch.
- The defaults sit in `@layer base`, like the mapping, so a component's own forced-colours rule
  wins; and since neither branch sets `color`, `currentColor` in that rule is still its host's.

**What the default reaches, and what it cannot.** Where `preserve-parent-color` exists it reaches
a glyph on `::before` of an element carrying `data-icon`, painted `currentColor` or
`var(--tone, …)` — the icon button, the segmented option, the choice card, the empty state, the
callout, the tag. It cannot reach a glyph drawn from a named token (`mask: var(--ico-check)`), one
on `::after`, an element glyph (`.spinner`), or one painted from a private variable resolved on its
element (`var(--tone-c)`). Those carry both branches in their own file, on their own selector:

```css
@media (forced-colors: active) {
  @supports (forced-color-adjust: preserve-parent-color) {
    .search-field::before { forced-color-adjust: preserve-parent-color; background: currentColor; }
  }
  @supports not (forced-color-adjust: preserve-parent-color) {
    .search-field::before { forced-color-adjust: none; background: CanvasText; }
  }
}
```

`scripts/check-icons.mjs` fails a `src/` file that paints a mask with no fallback branch of its own.

**`data-icon` goes only where `::before` IS the glyph.** The fallback paints the background of every
`[data-icon]::before`, because a selector cannot tell a glyph from text. On an element whose `::before`
is a word or a mark — `.prompt`'s `$ `, `.comment`'s `# `, `.tag--bracket`'s `[ `, `.btn-terminal`'s
`> ` — an engine without `preserve-parent-color` would put that text on a CanvasText box. Give such an
element a `.ico` child instead.

A glyph that shows a STATE on a fill — the ✓ in a checked box, the check column of a chosen option —
is a drawn state, and the forced-colours state rule applies: `Highlight` fill, `HighlightText` mark.

## The set: 51 words, and nothing else (0.60.0)

Lucide 0.559.0, the version configr's `lucide-react` resolves, stroke 2. The word is the
`data-icon` value and the token is `--ico-<word>`. The set is the spec's icon table and nothing
else: **a name outside it is an empty box — a solid square on a `.ico`, nothing at all on a
component's glyph — for everyone who copies the markup.** Every token is about 345 bytes, and its
mapping line about 50, on every page that loads `tokens.css`: the whole icon block, with its
forced-colours default, costs the minified bundle 19.9 kB (3.0 kB gzipped).

| group | words | needed by |
|---|---|---|
| controls | `check` `minus` `x` `search` `filter` `arrow-up` `arrow-down` `chevron-down` `chevron-left` `trash-2` `pencil` `loader-circle` `refresh-cw` `star` `star-filled` `history` `home` `image-plus` `triangle-alert` `package` `download` | the menu ✓, checkbox and indeterminate, clear and dismiss, search field, filter trigger, sort direction, open a list, back, the bin and pencil row actions, busy, refresh, history menu, favourite, install scope, drop zone, a failed state, a package source, pull |
| results | `circle-check` `circle-alert` `circle-x` `info` | the large notice's outcome glyphs, empty states |
| content and data | `copy` `clock` `arrow-up-down` `external-link` `github` `mail` | the copy button, the when cell, an unsorted column, a link that leaves, the social marks |
| actions | `plus` `eye` `eye-off` `power` `upload` `send` `arrow-left` `arrow-right` `circle-fading-arrow-up` | the action vocabulary below; a dialog's back button |
| panels | `chevron-right` `chevrons-up-down` `chevrons-down-up` `folder-tree` `folder-open` `folder` `file-code` `file` `panel-left-open` `panel-left-close` `maximize-2` | history forward, expand and collapse all, a clamp toggle, the file tree's branches and leaves, a collapsed pane and its hide button, the diagram zoom hint |

- **The word is the estate's, not always lucide's current file name.** `filter` is lucide's
  `funnel` and `home` its `house`; lucide renamed both and still ships the old names as aliases.
  `star-filled` is `star` with its fill closed, the pressed state of a favourite.
- **seedr resolves lucide 0.575.0.** The first 21 words of the set were taken from it and are
  byte-identical in both versions; of the other 30 only `clock` differs there, listing its two
  strokes in the other order: the same picture. `node scripts/check-icons.mjs` regenerates every
  token from configr's `lucide-react` and fails one that is not lucide's drawing of its word.
- **`github` is a lucide brand glyph**, which lucide deprecates and drops at 1.0. The token is a
  copy, so the drop cannot reach it; a regeneration from lucide 1.x carries it over unchanged.

## Two kinds of glyph: text and mask (0.60.0)

> **The terminal idiom's glyphs are TEXT, drawn by CSS at the text size with empty alt text.
> Every other glyph is a mask. There is no third kind: no emoji in chrome or in a control.**

| text glyph | where |
|---|---|
| `$ ` | the prompt, `.prompt` |
| `# ` | the comment, `.comment` |
| `▸` `▾` | a fold and a disclosure |
| `→` | typed into a forward link's label (`open →`) |
| `←` | the rail's current row |
| `»` `«` | the rail toggle |
| `[x]` `[ ]` | the footer's anim toggle |
| `·` | separators |
| `✓` `✗` `●` `○` `–` | the state words (`.state`) and the tickstrip |
| `[ ok ]` | the boot log |

- A text glyph drawn by CSS carries empty alt text, `content: "▸" / ""`, so a screen reader does
  not announce "black right-pointing small triangle" before every fold.
- It is sized as text because it IS text — the one exception to "a glyph is sized by a token",
  and the reason it may not grow into an icon: a `▸` at 24px is a drawing, and a drawing is a mask.
  Being text, it also survives forced colours with no rule at all.
- The diagram zoom hint `⤢` was the one text glyph sized by `font-size`; it becomes the
  `maximize-2` mask at `--icon-sm`.
- **No emoji in chrome or in a control.** An emoji is a colour image the theme cannot recolour and
  every platform draws differently. danieldeusing.de's brief-category emoji are CONTENT, part of a
  brief's text, and stay.

## One glyph per action, and the tone says the consequence (0.60.0)

One glyph per action, estate-wide, so a reader who learned the bin on one page knows it on every
page:

| action | glyph | tone |
|---|---|---|
| add, create, install | `plus` / `download` | default |
| edit | `pencil` | default |
| remove, delete, uninstall | `trash-2` | destructive |
| confirm, apply, enable | `check` / `power` | success |
| disable, deactivate | `power` | warning |
| view / hide | `eye` / `eye-off` | default |
| refresh (busy) | `refresh-cw` (`loader-circle`) | default |
| update available | `circle-fading-arrow-up` | default |
| export, import | `upload` / `download` | default |
| open elsewhere | `external-link` | default |
| send | `send` | default |
| copy | `copy` → `check` / `x` | default → success / destructive |
| favourite | `star` / `star-filled` | default |
| back, forward in app history | `chevron-left` / `chevron-right` | muted (`--bare`) |
| back in a dialog | `arrow-left` | muted |
| close, dismiss | `x` | muted |
| expand / collapse all | `chevrons-up-down` / `chevrons-down-up` | muted |

- **The tone is the CONSEQUENCE**, not the kind of thing: red is the press that cannot be taken
  back, green the one that turns something on, amber the one that turns it off. It comes from the
  status tokens through `data-tone`. "Default" is the icon button's `--primary`; "muted" is
  `.btn-icon--bare`'s `--muted-foreground`.
- **No cyan, no orange, and no amber for a favourite.** None of the three is a token, and amber is
  `--warning`, which means *attention*. configr's convention moves over like this: install-cyan →
  default, disable-orange → warning, favourite-amber → default, export-blue → default (an export is
  an action, not a state). seedr's fifteen hues on its icon button become these tones.
- **Colour is never the only carrier.** The glyph and the accessible name say it too — which is also
  what survives forced colours, where every tone is gone.
- **The accessible name names the target** (`aria-label="remove poi/vu3"`), never the glyph.

**Every glyph colour clears 3:1** (WCAG 1.4.11, a graphical object) on every theme and surface,
measured by `check-icons` from the browser's rasterised colours. Worst per colour over
`--background` / `--card` / `--muted`:

| theme | fg | muted | primary | success | warning | destructive | info | pending |
|---|---|---|---|---|---|---|---|---|
| warm | 9.24 | 4.67 | 5.59 | 5.16 | 4.97 | 5.69 | 5.17 | 5.58 |
| green | 10.69 | 5.95 | 13.96 | 10.76 | 10.15 | 6.19 | 7.57 | 7.77 |
| mono | 12.74 | 5.47 | 18.88 | 10.84 | 10.22 | 6.24 | 7.63 | 7.82 |
| paper | 14.33 | 6.09 | 18.26 | 5.36 | 4.89 | 5.68 | 5.74 | 6.19 |

A glyph on a filled `.btn-terminal` is its label's `--primary-foreground`: 6.45 (warm), 13.94,
20.38, 20.12.

## Flags, and the two social marks (0.60.0)

**Flags are unchanged**: `.dd-flag` plus `.dd-flag-de` · `-en` · `-es` · `-pt`, in
`components.css`, 15 × 10px with a `--border` edge. A flag is always beside the language's name
and always `aria-hidden` — the name is what a reader and a screen reader need:

```html
<span class="dd-flag dd-flag-de" aria-hidden="true"></span>deutsch
```

**`github` and `mail` are masks in the set.** Three surfaces link to GitHub (danieldeusing.de's
contact row, seedr's header, configr), and an envelope is a UI glyph, not a brand. They take
`--icon-lg`, `currentColor` and `aria-hidden` beside a visible label; an icon-only link is named for
its destination:

```html
<a href="https://github.com/danieldeusing"><span class="ico ico--lg" data-icon="github" aria-hidden="true"></span>github</a>
<a href="https://github.com/danieldeusing/seedr" aria-label="seedr's source on GitHub"><span class="ico ico--lg" data-icon="github" aria-hidden="true"></span></a>
```

**Every other brand mark stays its surface's asset**: whatsapp, linkedin, xing, facebook and x on
danieldeusing.de, the agent and vendor logos in configr and seedr. A mark that names a thing belongs
to its surface, as a colour that names a thing does — and one surface's logo in the system would be
bytes on every other surface's pages. danieldeusing.de's filled simple-icons GitHub and envelope
give way to the outline masks, so its contact row draws the one set; its other marks stay filled.

## A word the set lacks (0.60.0)

A glyph a surface needs and the set does not have is **a new spec entry first**, decided by the
lead, then a line in `tokens.css` — never a word written into markup in the hope that it resolves.
Once it is agreed:

1. **Generate it from lucide, never draw it.** Take the path data from the lucide version configr
   resolves (`apps/configr/node_modules/lucide-react/dist/esm/icons/<name>.js`, following an alias
   file to its canonical icon), with the house root:
   `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black'
   stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>`.
2. **One declaration** in the tokens block of `tokens.css`, named after its `data-icon` word:
   `--ico-<word>: url("data:image/svg+xml,…");`. Inside the url: no semicolon (the build splits a
   declaration there), no raw `#` (write `%23`), `<` and `>` percent-encoded, attributes
   single-quoted, and no attribute twice — a duplicate makes the SVG invalid and the mask paints
   nothing, silently.
3. **One mapping line** in the `@layer base` block: `[data-icon="<word>"] { --ico: var(--ico-<word>); }`.
4. **Run `node scripts/check-icons.mjs`**, naming any other checkout whose markup uses the word
   (`node scripts/check-icons.mjs ../other-checkout`). It fails on every rule above, on a token
   without a mapping line, and on a word used anywhere with no token; it reports how many files and
   references it read per checkout, and fails a checkout it could read nothing from.

The path data is lucide's. Its ISC notice, and Feather's MIT notice for the portions derived from
Feather, travel with the tokens in `tokens.css` as the file's one comment that opens with `/*!`, so
a minifier that keeps such comments carries it into the bundle; `icons.css` repeats it.

## In a framework app (0.60.0)

- **A framework app may keep `lucide-react`.** Its components are the same drawings, and a system
  control sizes an `<svg>` child by the same `--icon-*` token (`.btn-icon > svg`,
  `.btn-terminal > svg`), so a lucide component and a mask sit at one size in one row. In Tailwind:
  `size-(--icon-sm)`. An inline `<svg>` survives forced colours by itself: the user-agent default
  for `svg` is already `preserve-parent-color`.
- The masks serve build-free pages and every glyph a stylesheet draws. There is no `@theme` entry:
  a glyph is not a colour or a size Tailwind should generate utilities for.
- When a framework app renders the system's markup (`<button class="btn-icon" data-icon="…">`,
  house rule 10), the glyph and its forced-colours default come from `tokens.css`, which configr
  and seedr's studio already import. A per-element override is a utility, `[--ico:var(--ico-x)]`,
  which wins because the mapping is in `base`.
