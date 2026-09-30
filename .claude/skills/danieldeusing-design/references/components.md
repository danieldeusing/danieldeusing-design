# Components: buttons, fields, menus, folds, cards, row actions, the rail, `.eli5`

Reference for the `danieldeusing-design` skill. Read it before you write a button, a text field, a
dropdown menu, a theme switcher or a fold, lay out a card, write a row action, mark the rail's
current page, touch `.ls-perm` or add an `.eli5` box. The component vocabulary, and the rule that
a consumer never redeclares any of it, are in `SKILL.md`. A hover explanation (`data-tip`, never
`title`) is in `overlays.md`.

Contents:

- `.eli5` is opt-in per item (0.45.0)
- A row action's shape says whether it changes anything (0.13.0)
- `.btn-terminal`: an icon slot, a busy state, two verdict words (0.60.0)
- Filters moved: `.filter-ctl` and `.filter-set` are gone (0.60.0)
- One control height, and the text field (0.60.0)
- One popup look: every dropdown list is the system's list (0.60.0)
- A `details.dropdown` is a menu (0.60.0)
- The theme switcher (0.60.0)
- `details.fold`: counts, tones, logs, cases, and the printout (0.60.0)
- `.legend-label`: a legend says what it keys (0.60.0)
- `.disclosure-btn` and `button.link-quiet` (0.60.0)
- `.card-terminal` (0.60.0)
- The minimap: a TOC or a minimap, never both (0.60.0)
- The diagram zoom opens a `<dialog>` (0.60.0)
- `.anim-toggle` (0.60.0)
- Forced colours: a contrast theme keeps every glyph and every state (0.60.0)
- The rail marks the current page on `aria-current="page"` (0.19.0)
- `.ls-perm` is deliberately dimmer than muted (0.20.0)

## `.eli5` is opt-in per item, never a field every item fills (0.45.0)

An ELI5 box exists to make one hard thing legible to someone outside the discipline — a product
owner reading a code review, a family member reading a finance page. It is not a second rendering
of every item.

**Add one only where a plain-language sentence gives a non-technical reader something they could
act on.** If the text above it is already clear to anyone, there is nothing to explain, and an
`.eli5` that restates it in shorter words is noise wearing an accent border — it teaches the reader
that the box is skippable, which costs you the one place it mattered.

This is why the review reports stopped emitting one per finding: every finding had a box, most
boxes paraphrased the sentence above them, and the ones that carried real explanation were
indistinguishable from the filler.

The same rule governs the prose an `.eli5` sits under. A block of eighty correct words with no
paragraph break is something a reader parses rather than reads: lead with the claim, put the causal
chain in a list in the order it happens, then say what someone actually observes. Structure is not
decoration — it is what makes an explanation followable by a reader who does not already know the
answer.

## A row action's shape says whether it changes anything (0.13.0)

The one rule that decides what to reach for. It is not a style preference — it is the only thing
that tells a reader, before they click, whether this control will take them somewhere or alter
something:

> **A row action that navigates is a link. A row action that mutates is a button.**
> Underlined text that deletes something looks like a footnote.

| the action | what to write |
|---|---|
| `open →` `log →` `detail` `forge →` — goes somewhere, changes nothing | `<a class="doc-link doc-link--forward">` (or a `<button>` carrying the same classes when the destination is an in-page dialog and there is no url) |
| `add` `update` `save` `apply` `dismiss` `enrol` — writes | `<button class="btn-terminal btn-terminal--ghost btn-terminal--compact">` |
| `approve` `merge` `accept` — a verdict that says yes | the same plus `btn-terminal--success` — see the next section |
| `deny` `discard` — a destructive action that has a word | the same plus `btn-terminal--danger` — never the bin |
| `edit` — writes, and is the row's own settings | `<button class="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--edit" aria-label="edit <what>">` — see below |
| `remove` `delete` — **destroys** | `<button class="btn-terminal btn-terminal--ghost btn-terminal--destructive" aria-label="remove <what>">` — see below |
| the one primary action of a view | the same, **filled**: `btn-terminal btn-terminal--compact` |
| a filter, a toggle (`follow`, `hide handled`), a picker — changes what is **shown**, nothing else | **not a button, and not `.filter-ctl` since 0.60.0**: `<select data-filter>` for one of several, `.switch` for on/off, a `.chip-set` for several — see "Filters moved" below |

Two filled buttons side by side compete, which is the whole reason `--ghost` exists.

**`.btn-terminal--destructive` (0.16.0) is the red bin, and it is the only remove control.** Before
it, the estate spelled one verb four ways at once: an underlined `remove` text link, a bordered
ghost button reading `rm`, a muted-grey `remove` on `.doc-link.rowlink`, and the same ghost button
spelling `remove` out — one page used both `rm` and `remove` for the same operation. It is
**composed on purpose** rather than split into `--icon` + `--danger`: `--compact` is the size and
nothing else because size and colour are independent, and these two are not — the split's products
are a red button with no icon and a bin with no warning. The glyph is a **CSS mask painted in
`currentColor`**, so no surface writes an SVG and no surface can draw a different bin. Since 0.60.0
it is lucide's `trash-2` (`--ico-trash-2`), in a `--control-h` square, so it lines up with the
compact buttons and fields in its row.

**It takes an `aria-label` — always.** The button has no text, so without one it reads as nothing to
a screen reader and cannot be identified from the keyboard. Name the target, not the verb:
`aria-label="remove ddmini"`, not `aria-label="remove"`. `bin/design-conformance` fails a
`--destructive` button with no accessible name. Under a coarse pointer it grows to 44px via `min-*`,
so never set a width on it.

**`.btn-terminal--edit` (0.22.0) is the same icon button in the ordinary colour.** `edit →` was a
word and an arrow in a cell beside the bin — two controls doing one job, one four times the width
of the other, and at 375px the label broke into "edi / t →". Identical mechanism to the bin
(`currentColor` mask — lucide's `pencil` since 0.60.0 — the same square, the coarse-pointer `min-*`
growth) and one deliberate difference: **it carries no colour at all.** Editing is an ordinary
action and red is reserved for the press that cannot be taken back, so composing it with `--ghost`
gives `--primary` on a `--border` outline like every other secondary control (5.59:1 at worst —
warm over `--muted`). Never reach for `--destructive` to get the icon shape. **The `aria-label` is
mandatory and names the target** (`aria-label="edit poi/vu3"`); without it a column of these
announces "button" a dozen times over.

**`.doc-link--forward` carries the accent at rest**, not on hover. `.doc-link` is deliberately
quiet because it is footer furniture, and row actions inherited that quietness: a column of grey
`open →` reads as *disabled text* rather than as the way in. Hover cannot advertise itself, and a
row action is the reason the row is interactive at all. Keep plain `.doc-link` for what it was
built for — the footer, and links inside running prose. A **value** that happens to be clickable
(a repo name, a PR ref, a path in the identity column) is not an action either; the forward accent
belongs to the action column.

**`.btn-terminal--compact` is the size and nothing else.** Colour, square corner, the `> ` prefix
and the glow still come from `.btn-terminal` / `--ghost`, so a compact button cannot drift into
being a different button. The system's own button is a landing-page CTA at `12px 24px`; a tool row
puts six side by side and a table cell is half that height. Since 0.60.0 it is exactly
`--control-h` tall, the height of the field beside it (see "One control height"). Cockpit carried
this as a local `.btn-compact` for months — every surface with a table needs it, so it lives here
now. **Never declare a local one**, and never a local button class at all: five invented classes
(`.cfg-btn`, `.copy-btn`, `.tbtn`, `.xbtn`, `.fw-btn`) is how 77 rounded corners accumulated on a
system whose `--radius` has been `0` since its first release.

## `.btn-terminal`: an icon slot, a busy state, two verdict words (0.60.0)

```html
<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact"><span class="ico" data-icon="refresh-cw" aria-hidden="true"></span>refresh</button>
<button type="button" class="btn-terminal btn-terminal--compact" aria-busy="true" aria-disabled="true">saving</button>
<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--success">approve</button>
<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--danger">deny</button>
```

- **An icon goes inside, before the word.** The button is an `inline-flex` row with a `.4rem` gap,
  and a child `.ico` or `svg` is `--icon-size` square whatever its own `width` says. Never align a
  glyph by hand. The glyph is `aria-hidden="true"`: the word is the name.
- **It is right without a reset.** The class declares `box-sizing`, `font: inherit` and, on the
  filled button, a transparent 1px border, so a `<button>` on a Tailwind page or a tokens-only page
  is the same box as the `<a>` beside it. Before 0.60.0 a filled compact `<button>` wore the
  browser's 2px outset border and stood 30px tall beside a 28px ghost.
- **Busy is `aria-busy="true"` plus `aria-disabled="true"` — never `disabled`.** The page sets both,
  ignores a press while they stand, and clears both. `disabled` would throw keyboard focus to
  `<body>` in the middle of the action and dim a control that is working, not unavailable: a busy
  button keeps focus and full strength. The `> ` prefix (or the ghost's empty slot) becomes a
  turning `loader-circle`; on the bin and the pencil the spinner replaces the glyph. Reduced motion
  and `html.anim-off` stop the turning; the glyph stays.
- **`--success` and `--danger` are verdict words, composed with `--ghost`** — never a second filled
  button beside the primary. The edge is the colour mixed 60% into `--border` at rest and the full
  colour, with a 10% tint, under the pointer. The text measures 5.16:1 (`--success`) and 5.68:1
  (`--danger`) at worst, on `--muted`; the `--success` edge is 2.81:1 there, which is decoration —
  the word identifies the control. `--danger` is the destructive action that has a word; the
  icon-only removal stays the bin, and a word never borrows it. **Resetting a view** (filters,
  sort) is not destructive and never red: that is `button.doc-link--forward` (`chrome.md`).
- **Under a coarse pointer every variant is 44px tall**, and the bin and pencil 44px square.
- **Disabled is `.45` and does not answer the pointer** — no lift, no tint, no edge — **and neither
  does a busy button**: it ignores a press, so lifting under the pointer would invite the second
  press it exists to stop. Every hover rule in the family carries
  `:where(:not(:disabled, [aria-disabled="true"], [aria-busy="true"]))`, which adds no weight, so an
  override written against 0.59.0's selectors still wins.
- **Tailwind:** the classes sit in the `components` layer, so a utility on the same element wins —
  a `px-3` on a `.btn-terminal` is a local fork. Leave the padding to the class.

## Filters moved: `.filter-ctl` and `.filter-set` are gone (0.60.0)

0.58.0 and 0.59.0 drew a filter as text wearing a `[x]` or a `(•)`. 0.60.0 removes `.filter-ctl`,
`.filter-set` and `.filter-set-label`, with no shim: a filter is now one of three real controls,
each carrying the semantics a screen reader already announces. Daniel's rulings of 2026-09-19 and
2026-09-28 still hold — **a filter must not look like a button, and it must look like a choice** —
only the shape of the choice changed.

| the filter | write | where it is specified |
|---|---|---|
| picks one of several, and one is always in force (which repository a chart reads) | `<select data-filter aria-label="repository">`, no "all" option | `filters.md` |
| picks one of several, or none | `<select data-filter>` whose first option is `<option value="">all</option>` | `filters.md` |
| turns one thing on or off — `follow`, `hide handled` | `<button type="button" role="switch" aria-checked="false" class="switch">` | `controls.md` |
| picks several — tags, hosts | a `.chip-set` of `button.chip[aria-pressed]` | `filters.md` |
| was never a filter — `select all pending`, `clear selection` | `.btn-terminal.btn-terminal--ghost.btn-terminal--compact` | above |
| leads a filter row that has no search | a heading, or `.filter-bar-lead`, first in the `.filter-bar` | `filters.md` |

Never re-create `.filter-ctl` locally, and never answer "this filter looks too quiet" with a
button — that is the loop 0.58.0 and 0.59.0 recorded. Netmon's own range, preset and series chips
are still its own vocabulary: it loads only `tokens.css` + `chrome.css`.

## One control height, and the text field (0.60.0)

Every single-line control is `--control-h` tall — 1.75rem, 28px at a 16px root: a text field, the
select's trigger, `.btn-terminal--compact`, the bin and the pencil. A toolbar row of them is one
height on every surface, as seedr's and configr's `h-7` rows already were.

- **The box is the token, not a floor.** Each control's block padding is
  `(--control-h − --fs-base × --lh-tight − 2px) / 2` at a `--lh-tight` line, so it reaches the
  height on its own, and `min-block-size: var(--control-h)` agrees instead of lifting it. A floor
  can only lift: a field with `.3rem` of padding under the 1.5 line it inherits measures 29.6px,
  above the token, and no `min-block-size` pulls it back. Chrome's date field pads its own editor
  (1px) and calendar button (2px); both are zeroed.
- **Never set a height, a block padding or a line height on a field locally.** A value that needs
  more room is a `textarea`.
- **The edge is `--control-edge`** (`--foreground` at 60%), 3.26:1 at worst (warm, on `--muted`) —
  `--border` is a container hairline at 1.37. `:focus-visible` keeps the 2px `--ring` outline and
  also turns the edge `--primary`; `aria-invalid="true"` turns it `--destructive`, under the pointer
  and in focus too.
- **An invalid field says what is wrong in words; the edge only repeats it.** A red edge is colour
  alone (WCAG 1.4.1), and it tells nobody how to fix the value (3.3.1). So `aria-invalid="true"`
  never stands by itself: the field names a `.field-error` through `aria-describedby`, and that
  line says what is wrong and what to write instead. No dashed or second edge is needed — the words
  are the signal that is not a colour.

  ```html
  <label for="repo">repository</label>
  <input id="repo" type="text" aria-invalid="true" aria-describedby="repo-err" value="not a repo" />
  <p class="field-error" id="repo-err">not an owner/repo — write it as poi/vu3</p>
  ```

  In a settings row the error sits in `.field-val` under the control (`tables-and-forms.md`).
  `scripts/check-components.mjs` resolves every `aria-invalid="true"` on the demo page and in the
  examples of this file and `tables-and-forms.md` to a `.field-error` with text.
- **The placeholder** is `--muted-foreground` at full opacity, and it is never the label: a
  `<label>` or an `aria-label`, always.
- **Disabled** is `opacity: .45`, as on every control, and a disabled field does not change under
  the pointer.
- **No spinners, no search decorations**: `type="number"` and `type="search"` render as plain fields.
- **A `textarea`** is at least 4rem tall, at `--lh-base`, and resizes vertically only.
- `examples/components.html` measures every single-line control on the page, rendered and with its
  floor removed; `scripts/check-components.mjs` asserts it in all four themes and at a 20px root.
- A field with its label, description and error is a `.field-row` — see `tables-and-forms.md`.

## One popup look: every dropdown list is the system's list (0.60.0)

Daniel, 2026-09-28, beside a screenshot of the operating system's list: *"A dropdown should ALWAYS
have the custom layout … for the list, not the system one."* `.select-panel` (the listbox
`initSelects()` renders), `.dropdown-panel` (a `details.dropdown`'s panel) and a context menu are
**one surface**: `--popover` under `--popover-foreground`, a 1px `--control-edge`, the `--elev-float`
glow, `--fs-base` at `--lh-tight`. Their rows are **one row**: `.select-option` and `.dropdown-item`
share the padding, the `--muted` highlight (on hover, `data-active="true"`, or Radix's
`data-highlighted`) and the disabled ink.

- **A choice is a ✓, not a colour.** Every row of a `.select-panel`, and every choice row
  (`aria-selected`, `aria-checked`, `aria-pressed`, `menuitemradio`, `menuitemcheckbox`) with the
  rows of any menu that holds one, reserves a check column, so a "reset" under the choices lines up
  with them; the chosen row shows `--ico-check` there in `--primary`. **Every chosen shape draws it**:
  `aria-selected="true"` or `aria-checked="true"` on a `.select-option` (a Radix radio or checkbox
  item wearing the class), and those or `aria-pressed="true"` on a `.dropdown-item`. The label keeps
  its weight and its ink: `--primary` against `--popover-foreground` measures 1.27:1 on paper, two
  inks nobody can tell apart. 0.59.0's left edge and bold are gone.
- **`[aria-current="true"]` is not a choice** — it is a navigation list's "you are here" (history,
  language), in `--primary` with the glow.
- **`[aria-disabled="true"]` or `:disabled`**: `--popover-foreground` mixed 65% into `--popover`
  (3.62:1 at worst, and inactive text is exempt from 1.4.3), no highlight, `cursor: default`.
- `.dropdown-item--danger` is `--destructive`; `.dropdown-sep` is a 1px `--border` rule, drawn as a
  border so a contrast theme keeps it; `.dropdown-label` and `.select-group` are the muted uppercase
  heading of a group. A `.ico` in a row sits after the check column, `aria-hidden="true"`.
- **A labelled section is a group.** A `.dropdown-label` and the items under it, up to the next
  separator or label, are one `role="group"` named by the label (`aria-labelledby`), the APG shape:
  a reader hears "sort by, group" and then its choices, and "sort by" and "order" in one menu stay
  two things. `initDropdowns()` groups the section itself, inside the `details.dropdown`'s panel; a
  page-built menu writes the group (below). A menu with no label is left as it is.
- **44px under a coarse pointer**: every row, and a summary that is only text or a glyph (centred, with
  no weight, so a `.btn-icon` summary keeps its own box).
- **Placement is not the look.** `.select-panel` sets no `position` — `initSelects()` writes
  `position: fixed` inline — so a framework app can put the class on its own listbox and place it
  itself. `.dropdown-panel` is `position: absolute` and opens upward, for a status-bar menu;
  `.dropdown-panel--down` opens below, `--end` below and right-aligned.
- **A framework app never renders a native `<select>`, or a component library's own menu skin.** Its
  listbox puts `.select-panel` on the panel and `.select-option` on each row — `aria-selected` or
  `aria-checked` for the choice, `data-active` or `data-highlighted` for the highlight — and its
  menu `.dropdown-item` rows.

## A `details.dropdown` is a menu (0.60.0)

```html
<details class="dropdown">
  <summary>actions ▾</summary>
  <ul class="dropdown-panel dropdown-panel--down">
    <li><span class="dropdown-label">file</span></li>
    <li><button type="button" class="dropdown-item">rename</button></li>
    <li class="dropdown-sep"></li>
    <li><button type="button" class="dropdown-item dropdown-item--danger">delete</button></li>
  </ul>
</details>
```

Write that and nothing more — no roles, no `tabindex`. `initDropdowns()`, once per page, does the
rest for this dropdown and for every one rendered after it: one set of document listeners and a
MutationObserver. Until 0.60.0 it bound only the dropdowns that existed when it ran, so every
dropdown `initTableTools()` builds in a table header had no click-away and no Escape at all.

- **A panel of rows is an ARIA menu.** A panel holding only `.dropdown-item`, `.dropdown-sep` and
  `.dropdown-label` rows becomes `role="menu"` (named by its summary), its `li`s `role="none"`, its
  items `role="menuitem"` — one written as `menuitemradio` or `menuitemcheckbox` keeps that — its
  separators `role="separator"`, and each labelled section a `role="group"` named by its label;
  the summary gets `aria-haspopup="menu"` and a synced `aria-expanded`. **A panel holding anything else stays a disclosure** — the table filter's text
  box is the case: no menu roles, and Tab moves through it.
- **Keys.** On the summary, Enter, Space and ArrowDown open the menu on its first item, ArrowUp on
  its last. Inside, ArrowDown and ArrowUp move and wrap, Home and End jump, a printable character
  types ahead (700 ms, like the select), Enter and Space activate, Escape closes and hands focus
  back to the summary, and Tab closes and moves on. Items are `tabindex="-1"`; focus moves, not an
  active-descendant.
- **One open at a time.** A click outside, Escape or an activated item closes it, and activation
  hands focus back to the summary unless the item moved focus somewhere itself. An `aria-disabled`
  item stays focusable, and pressing it — Enter, Space or a click — does nothing and keeps the menu
  open: a `<button>`'s own handler ignores it, and an `<a>` item does not follow its link (the
  runtime cancels it). In a `<dialog>`, Escape closes the menu and stops there — the dialog stays
  open.
- **A renderer that re-renders a menu writes the grouped shape and leaves the runtime's attributes
  alone.** A page that patches its markup in place (cockpit's `cockpitPatch`) writes each labelled
  section as the group below, never the flat label-then-items, and does not answer for what the
  runtime wrote: `role` on the panel, the rows and the `li`s, `tabindex="-1"` on the items, the
  summary's `aria-haspopup` and `aria-expanded`, an `aria-labelledby` the runtime set, and its
  `dd-menu-*` ids. If a patch strips one anyway, `initDropdowns()` puts it back — it watches those
  attributes, and writes only a value that differs, so it cannot loop. Focus and node identity across
  a patch are the renderer's to keep.
  **Give the summary, and each label, its own id.** Otherwise the runtime writes a `dd-menu-*` id the
  new markup does not carry, the patcher sees a different element, rebuilds the summary and the panel,
  and focus is lost.
- **A summary may be an icon button**: `<summary class="btn-icon btn-icon--bare" data-icon="history"
  aria-label="history"></summary>` (`.btn-icon` is in `controls.md`).
- **A menu the page builds and places itself** — a context menu, a menu under a button — gets the
  same keys from `attachMenuKeys(panel, { onClose, returnFocusTo })`: roving focus, wrap, Home/End,
  typeahead, and `onClose` on Escape, Tab or activation with focus handed to `returnFocusTo`. Its
  items leave the tab order, and so does an item the page adds while it is attached. It returns a
  function that takes the keys off again. Its labelled sections are the page's to write as groups —
  the arrow keys walk from one group into the next:

  ```html
  <ul class="select-panel context-menu" role="menu" aria-label="actions for src/app.ts">
    <li role="none"><ul role="group" aria-labelledby="ctx-file">
      <li role="none"><span class="dropdown-label" id="ctx-file">file</span></li>
      <li role="none"><button type="button" class="dropdown-item" role="menuitem">open in editor</button></li>
    </ul></li>
    <li class="dropdown-sep" role="separator"></li>
    <li role="none"><button type="button" class="dropdown-item dropdown-item--danger" role="menuitem">delete</button></li>
  </ul>
  ```
- `scripts/check-dropdown.mjs` drives every line above with real keys and a real mouse.

## The theme switcher (0.60.0)

```html
<details class="dropdown">
  <summary><span class="visually-hidden">theme </span><span class="dd-dot" aria-hidden="true"></span><span data-theme-label>warm</span><span aria-hidden="true">▾</span></summary>
  <ul class="dropdown-panel">
    <li><button type="button" class="dropdown-item" data-theme-value="warm">warm</button></li>
    <li><button type="button" class="dropdown-item" data-theme-value="green">green</button></li>
    <li><button type="button" class="dropdown-item" data-theme-value="mono">mono</button></li>
    <li><button type="button" class="dropdown-item" data-theme-value="paper">paper</button></li>
  </ul>
</details>
```

- **One order, `THEMES`: warm, green, mono, paper** — not alphabetical, not per surface.
- **The chosen theme is a ✓, not a colour.** `initThemeSwitcher()` marks a `[data-theme-value]`
  inside a `.dropdown-panel` `role="menuitemradio"` with `aria-checked` on the theme in force, and
  one anywhere else (the burger's `.mf-panel`, an inline row) a toggle with `aria-pressed`; the
  one-popup-look ✓ draws both. The per-theme "`--primary` and a glow" rule that marked the active
  item is gone: it marked a state by colour alone, and a screen reader heard four identical buttons.
- **One indicator: `.dd-dot`**, a dot in `currentColor`. No per-theme swatches, and no inline
  `<svg>` circle.
- **Delegated.** One document listener and an observer on `html[data-theme]`: a switcher rendered
  after the call works, and a theme set by page code (`setTheme()`) moves every switcher's ✓ and
  every `[data-theme-label]` with it. A pick closes the menu and hands focus back to the summary.
- **The summary reads "theme warm"** — the visually hidden word, then the label.
- **Favicon:** `initThemeSwitcher({ faviconHref: (theme) => … })` also rewrites
  `<link id="favicon">`; the per-theme files are the surface's own assets. **Pre-paint:** the inline
  `<head>` snippet from `templates/page-chrome.html` sets `data-theme` from `localStorage["theme"]`
  (default `warm`) before first paint, and `applyStoredTheme()` finishes the job in the module.

## `details.fold`: counts, tones, logs, cases, and the printout (0.60.0)

```html
<details class="fold">
  <summary><span class="ico" data-icon="package" aria-hidden="true"></span>skills/ <span class="fold-count">12</span></summary>
  <div class="fold-body">…</div>
</details>
<details class="fold" data-tone="destructive"><summary>2 commands failed</summary><div class="fold-body">…</div></details>
<p class="fold-empty" data-tip="no hooks in this registry yet">hooks/ <span class="fold-count">0</span></p>
```

- **A summary is one control.** Nothing interactive goes in it: a button in a summary is a second
  control inside the first, and a click on it toggles the fold as well. A section whose head
  carries actions is a `.panel` with a `.disclosure-btn` (`cards.md`). After its ▸ a summary holds
  an optional `.ico`, the label, and a `.fold-count` — muted, tabular figures: `12`, or `(3/17)`
  while a search narrows the group. There is no count pill.
- **`data-tone`** on the fold colours its summary and icon, so an error group reads as one before
  it is opened, and it keeps that colour under the pointer.
- **The icon is its summary's colour** — muted, or the fold's tone — because it is coloured through
  its parent. Never put a `color` on the `.ico`: under forced colours a glyph that declares a colour
  keeps that author colour instead of its label's (a muted icon measured 2.89:1 there). One icon
  that needs a tone of its own takes `data-tone` on the `.ico` (`icons.md`). An untoned fold resets
  `--tone`, so a fold inside a toned card or notice stays neutral, icon included.
- **`details.fold--compact`** is a log's folds ("▸ ran 3 commands"): no rule between them, a tight
  summary, a 1rem indent.
- **`details.fold--boxed`** is a case in a frame: a `--border` box, .75rem inside, .5rem apart.
- **An empty group is not a fold** — there is nothing to open. It is a `p.fold-empty` carrying its
  count, under the same rule and at the same indent as the folds around it, with the reason in a
  `data-tip`.
- The ▸ and ▾ carry empty alt text (`<details>` already exposes the state); the summary takes the
  2px `--ring` focus ring and is 44px tall under a coarse pointer.
- **Expand / collapse all** is a `.btn-icon` (`controls.md`) with `aria-controls` naming the
  container, `aria-expanded` true while every fold in it is open, the `chevrons-up-down` /
  `chevrons-down-up` glyph, and a name that says the action ("expand all folders"). The framework
  apps have one; no build-free page needs it yet.
- **The printout: `initFolds()`, once per page.** A closed `<details>` prints as its summary alone.
  `initFolds()` opens every closed `<details>` — except a `details.dropdown` — on `beforeprint`, and
  closes exactly those again on `afterprint`, so a fold the reader had open stays open. It finds
  folds rendered after the call. Cockpit's own `beforeprint` opener, which never closed anything
  again, goes. `scripts/check-fold.mjs` prints for real (the DevTools print fires both events) and
  asserts both halves.

## `.legend-label`: a legend says what it keys (0.60.0)

```html
<p class="legend-label"><span id="lg-src">what a source reports</span>
  <a class="doc-link doc-link--forward" href="/automation/config#sec-repos">where they are configured →</a></p>
<ul class="legend" aria-labelledby="lg-src">…</ul>
```

A caption over a `.legend`: 600 weight at `--fs-base`, 1.1rem above it, the legend .35rem below,
and the caption and its link wrapping on one baseline. **The list is named by the caption's
words** — `aria-labelledby` points at the span, not the paragraph — so the link's text is not part
of the name. A note inside is `.text-muted-foreground`; the way to where the states are set is a
`.doc-link--forward`.

## `.disclosure-btn` and `button.link-quiet` (0.60.0)

```html
<button type="button" class="disclosure-btn" aria-expanded="false" aria-controls="repo-3-body" aria-label="expand poi/vu3"></button>
<button type="button" class="link-quiet">show all 55</button>
```

- **`.disclosure-btn`** is the ▸ / ▾ that opens a row's detail when the row's name is not itself the
  control — what `details.fold` cannot do, because its summary is the whole row. The glyph follows
  `aria-expanded` and has empty alt text; the page keeps `aria-expanded` and the region's `hidden`
  in step, and keeps the open set across re-renders. 60% at rest, full under the pointer and in
  focus, 44px square under a coarse pointer. **Put it beside a `--foreground` name**: at 60% of a
  muted parent the glyph measures 2.3:1.
- **`button.link-quiet`** is `.link-quiet` on a `<button>`: the box is gone (`padding: 0`, no border,
  no background, `font: inherit`), so a quiet inline action that changes the page and not the URL is
  a real button that looks like the links beside it. A text action that changes the view ("reset
  filters", "show more", "try again") is `button.doc-link--forward` (`chrome.md`); resetting a view
  is never red.

## `.card-terminal` (0.60.0)

- **Padding is `--card-pad`** (.75rem) on every side; `.card-terminal--flush` is 0, for a card that
  frames a table or a `.row-list`. A wide table inside fades into `--card`, not into the page.
- **Hover only where a click does something**: `a.card-terminal`, `button.card-terminal`, or
  `.card-terminal--link` (a card whose title link is the target). It is a `--primary` edge on the
  `--secondary` fill; the glow is gone. A static card does not answer the pointer — a card that
  lights up and then does nothing is a lie.
- `a.card-terminal` keeps the text colour and no underline; `button.card-terminal` sets its text at
  the start.
- On `--secondary`, `--primary` text measures 5.59:1 and muted text 4.67:1 at worst (warm).

## The minimap: a TOC or a minimap, never both (0.60.0)

`initMinimap({ sections: "section.doc" })` draws one 2px bar per section in the left gutter from
64rem, each a button named by its section's heading. The heading is its `data-tip` too — the one
place a tip repeats a name, because the bar shows no words at all, and the tooltip does not
announce a tip that equals the name, so a screen reader hears it once. The current section's
bar has `aria-current="true"`, and the stylesheet draws it from that attribute — there is no state
class. No radius.

**A page shows a TOC or a minimap, never both**: `initMinimap()` returns `null` on a page that has a
`[data-toc-link]`. The TOC belongs where there is room for its column (cockpit, danieldeusing.de),
the minimap on a full-width document (the html-doc template). `scripts/check-minimap.mjs` loads the
shipped runtime and stylesheet together and asserts the current bar's computed colour, so the two
files cannot stop agreeing on the state without a failure.

## The diagram zoom opens a `<dialog>` (0.60.0)

`initDiagramZoom()` still makes every `.diagram` an opener (`.dgm-zoomable`). Its corner hint is
lucide's `maximize-2`, a mask at `--icon-sm` in place of the `⤢` character sized by `font-size`, and
its focus ring is the 2px `--ring`. **The hint is at full strength when idle** — `--muted-foreground`,
4.67–6.71:1, turning `--primary` under the pointer and in focus. It rested at .45 and measured
1.82–2.15:1, and it is the only graphic that says the figure opens (WCAG 1.4.11 wants 3:1): do not
dim it again. The view it opens is a `<dialog class="dgm-overlay">`, specified
with the other dialogs in `overlays.css`; `html.dgm-locked`, `.dgm-btn` and `.dgm-close` are gone —
its bar is `.btn-terminal` buttons and the dialog's own close button.

## `.anim-toggle` (0.60.0)

```html
<button type="button" class="anim-toggle" data-anim-toggle aria-pressed="true" aria-label="Toggle animations">
  <span data-anim-box aria-hidden="true">[x]</span><span>anim</span></button>
```

The footer's animations switch (`runtime/anim.js`). It has a box of its own: `padding: 0` (it wore
the browser's button padding, a different size per engine, beside summaries that have none), the
2px `--ring` focus ring, and a 44px target under a coarse pointer. Its `[x]` box is `aria-hidden`,
so the name is the `aria-label` — without it the button is announced as "button" (35 cockpit pages
shipped that way until 0.26.0).

## Forced colours: a contrast theme keeps every glyph and every state (0.60.0)

A contrast theme — forced colours — repaints every background as `Canvas` and replaces every author
colour; only a system colour is kept as written. Everything drawn by a background vanishes: the
mask glyphs (the ✓, the bin, the pencil, the spinner, the zoom hint, the theme dot), the two cursors
(`.cursor-block`, `.term-caret`), the states that are only a fill (the highlighted row, the
minimap's current bar), a 1px rule drawn as a fill, and the select's caret, a gradient the mode
drops outright. `components.css` redraws all of it in one `@media (forced-colors: active)` block,
and a surface adds nothing.

- **A glyph takes `preserve-parent-color` and paints `currentColor`.** Its colour then becomes the
  one its host was FORCED to — `ButtonText` in a button, `CanvasText` in text, `HighlightText` on the
  row under the pointer, `GrayText` on a disabled control — so it is always its label's colour,
  whatever colour the page gave the host. **Never `forced-color-adjust: none` on a glyph**: forcing
  happens when the colour is used and inheritance carries the computed value, so under `none` the
  glyph keeps its host's AUTHOR colour. Cockpit's `.btn-terminal.btn-approve { color:
  var(--success) }` painted its spinner, bin and pencil at 1.74:1 that way. The glyph declares no
  `color` of its own, and neither may a page (a declared colour turns `preserve-parent-color` back
  into `none`). An engine without the value gets the fallback — always visible, if not always the
  label's colour:

  ```css
  @media (forced-colors: active) {
    .my-glyph::before { forced-color-adjust: preserve-parent-color; background: currentColor; }
    @supports not (forced-color-adjust: preserve-parent-color) {
      .my-glyph::before { forced-color-adjust: none; background: CanvasText; }
    }
  }
  ```

  An `.ico` does this itself (`icons.css`): colour it through its parent, never on the `.ico`.
- **A state drawn by fill is redrawn in system colours.** The row under the pointer or the keys is
  `Highlight` under `HighlightText`, and it opts out (`none`) because the mode would otherwise paint
  a `Canvas` backplate behind its words and lose them on the fill. `none` is inherited, so
  **everything inside a highlighted row takes `HighlightText`** — a description with its own colour
  (filters' `.option-desc`) measured 1.31–3.59:1 on the fill before — and nothing keeps an author
  glow. The opted-out row owns its ring, `HighlightText` inset on its own fill. **A row that is off
  is `GrayText` on `Canvas` with a `CanvasText` ring** — APG keeps it in the arrow-key walk, and the
  `HighlightText` ring it would otherwise wear measured 1.00:1 on `Canvas`. Where you are in a
  navigation list is `Highlight` text, the minimap's bars are `CanvasText` with the current one
  `Highlight`, and the trigger's caret is a ▾ drawn as text.
- **A rule is a border.** `.dropdown-sep` draws its line with `border-top`, which the mode keeps in a
  system colour; a 1px fill became `Canvas`.
- `scripts/check-components.mjs` measures every one of these in PAINTED pixels, on the light and the
  dark forced palette and all four themes: each glyph 3:1 against what it sits on (a page's own
  button colour included), each word on a state 4.5:1 with the state's fill under it, each state
  told apart from its neighbour, and a menu row's ring after real key presses. Each capture is taken
  in the viewport with the scrollbars hidden, and a marker pass proves the clip holds its element
  before the ratio counts.

## The rail marks the current page on `aria-current="page"` (0.19.0) — an attribute, not a class

A rail row that is the page you are on takes `aria-current="page"` **on the `<a>` that carries
`.ls-row`**, and the styling follows from that alone:

```html
<li><a class="ls-row ls-row--dir" href="/automation" aria-current="page">
  <span class="ls-perm" aria-hidden="true">drwxr-xr-x</span><span class="ls-name">automation/</span></a></li>
```

A group heading is `<span class="ls-group">`, and it is not decoration — **do not render one
from a private inline style.** Cockpit did for months, which is how `.ls-group` shipped with
`padding-inline: 0` against rows that take 14px from `.dropdown-item` and nobody noticed: the
class was misaligned for every surface using it as intended, and correct on the one surface
that had opted out of it. Daniel found it on the family site. Fixed in 0.44.1; the lesson is
that a fork does not just risk drifting from the component, it can hide the component's bugs
from the person best placed to see them.

**Do not invent a class for this.** The attribute is the standard, it is what a screen reader
announces, and a page that paints "you are here" without saying it in the accessibility tree has
solved the problem only for people who can see the colour. danieldeusing.de had `aria-current`
*and* a private `.ls-here` rule beside it, cockpit had no notion of a current page in its nav at
all, and the system styled nothing — one consumer solved it, the others lacked the feature, and
nobody owned it. `.ls-here` is redundant from 0.19.0; delete it rather than aliasing it.

What it draws, and why it is not just a colour: `--primary` plus bold is **already** what
`.ls-row--dir` takes, so tinting the name is not enough — a current leaf would look like a
directory and a current directory would get no marking at all. The current row is instead the
only row with a **left edge marker** and a **background tint** (position and area, not hue) plus a
trailing `←`. Scoped to `.ls-row`, so the desktop rail and the mobile burger mark it identically.

**Render it, don't hand-write it.** A static `aria-current` in a shared nav is wrong on every page
but one — the marker has to be derived per page from the current path by whatever emits the nav.

## `.ls-perm` is deliberately dimmer than muted (0.20.0) — don't "fix" it back

`.ls-perm` is `color-mix(in srgb, var(--muted-foreground) 75%, var(--card))`, not
`--muted-foreground` flat, and the mix ratio is load-bearing. Before 0.20.0 the permission string
and `.ls-panel .ls-name` were the **same token**, so on a leaf row `drwxr-xr-x` and the page name
were the same ink at a contrast ratio of exactly **1.00 on all four themes**; on a directory row
the warm theme put `#71614e` beside `#8a4516` at **1.2:1**, which reads as one colour. 75% is the
dimmest mix that still clears **3:1 against the panel** on every theme (warm binds, at 3.02) —
the string carries meaning (a trailing slash plus `drwxr-xr-x` says the thing has contents), so it
must stay legible, only not compete. Going dimmer drops warm below 3:1. Going back to a flat token
restores the bug.
