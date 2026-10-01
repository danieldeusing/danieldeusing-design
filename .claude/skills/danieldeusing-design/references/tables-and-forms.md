# Tables and forms

Reference for the `danieldeusing-design` skill. Read it before a page gets a table, a `<select>`
or a settings panel. That a table is styled by element, and the three things a page may own
(column widths, `--tablewrap-max-h`, `--tablewrap-fade`), are in `SKILL.md` under "The shared
component vocabulary".

Contents:

- A table is `--foreground` (0.61.0), and the Tailwind-typography trapdoor it closes
- Authoring a plain table: column widths and cell content
- A dashboard table is `table.dense`: the cell vocabulary, row states, a phone (0.60.0)
- Pairs: `table.kv` and `dl.kv` (0.60.0)
- A `<select>` is enhanced automatically (0.21.0)
- A wide table scrolls itself (0.23.0)
- A long table pages to 20 (0.22.0)
- A table gets a search, a filter and a sort (0.29.0)
- `.field-row`: a settings panel is a two-column table

## A table is `--foreground` (0.61.0), and the Tailwind-typography trapdoor it closes

**Since 0.61.0 a `table` is `--foreground`** (Daniel: table text is foreground, not muted grey), so its
cells inherit it unless their row, body or the cell itself says otherwise, with
the quiet helpers inside a cell reading at full strength too; the rule and its exceptions are in
`data.md`, "Table body text is `--foreground`". The history below is why a cell that inherits its
colour was never safe.

**Until 0.61.0 `td` deliberately had no colour, and on a Tailwind-typography surface that was a trapdoor.** The
system styles `td`'s padding, alignment and rule but never its ink, because a cell is body copy and
must inherit `body { color: var(--foreground) }` — correct everywhere the page is plain HTML, which
is cockpit, docs, netmon, ci-orchestrator and the seedr playgrounds (audited 2026-08-08: not one of
them colours a `td`, and the three cockpit columns that use `--muted-foreground` are deliberate
de-emphasis measuring 4.67:1 at worst). But `@tailwindcss/typography` puts a `color` on the `.prose`
root and gives `td` none of its own, so inside an article the cell inherits the plugin's palette
instead of the body's. danieldeusing.de shipped that: `--tw-prose-invert-body` unmapped meant every
table cell in a published article rendered Tailwind gray-300 — **1.29:1 on warm and 1.41:1 on
paper**, invisible in the default theme, while measuring a healthy 13.84:1 on the two dark themes,
which is why it survived review. A `td` grep finds nothing, because nothing declares it.

So on a Tailwind surface, **map the plugin's whole palette to tokens — every variable, in one
block — and never patch the elements.** pagr had mapped four of eighteen and patched `prose-p:` /
`prose-li:` by hand; the casualties were exactly the elements nobody thought to name (`td`, `dd`,
`caption`, an `<ol>`'s markers at 2.27:1). An unmapped variable is not "close enough" — it is a
fixed grey against four themes, the same arithmetic that makes every accent in `tokens.css` a
per-theme declaration. Drop `prose-invert` while you are there: once every value is a token it is
an extra hop whose name asserts a dark theme, and a variable missed *behind* it fails invisibly on
the default one.

## Authoring a plain table: column widths and cell content

The system's table rules (cell padding, top-aligned cells, the hairline between rows, the
stronger header rule and `width: 100%`) ship in `src/base.css`; a local `td { padding }` is a
forked component, and the conformance checker reports it. What a page may still own is column widths,
because only the page knows which column carries the prose — use a `<colgroup>` and keep the
wide one from eating the table:

```html
<table class="findings">
  <colgroup><col class="findings-sev" /><col /><col class="findings-when" /></colgroup>
```

```css
.findings-sev { width: 4rem; }
.findings-when { width: 9rem; }
```

The widths go in the page's stylesheet, never in a style attribute: a page under a
`style-src 'self'` policy (seedr's) drops every one. Give the sentence column no width and let
it take the remainder. Without this a three-sentence cell sizes the column to its longest line
and squeezes every other column into a vertical stack of single words.

**Inline code in a cell keeps its word** (0.61.0). A bare `<code>` breaks anywhere (`base.css`), and
in a cell that let the browser size the code's column down to a few characters: at 375px a
28-character config key stood three to five lines tall while the prose column beside it took the
width. Inside `td` and `th` the code breaks only where it would overflow its line
(`overflow-wrap: break-word`), so the column keeps the key's width and the prose gives way. A key
with no break in it that is wider than the whole table widens the table, and the `.tablewrap`
scrolls it.

A long inline-code value or a cell holding more than one item forces the table wider than its
column; without a scrolling wrapper the browser scrolls the whole page horizontally — the header
slides off, the fixed footer stops reaching the edge, and body text needs two axes to read.
Never set `white-space: nowrap` on a cell that can hold more than one short token (e.g. a
list of file names) — that's what forces the runaway width in the first place; if a cell
needs to list several items, join them with `<br />` so they stack instead of running wide.

Never set a font-size on a table. 0.7.0 gave `table` one size for the whole estate (`--fs-md`
until 0.27.0, `--fs-base` since), which exists because cockpit's doc tables sat at 15px and its
dashboard tables at 12px. A local size only reintroduces that.

## A dashboard table is `table.dense`: the cell vocabulary, row states, a phone (0.60.0)

```html
<div class="tablewrap">
  <table class="dense stackable" data-table-id="review-activity">
    <thead><tr>
      <th class="pick" scope="col"><input type="checkbox" aria-label="select every row" /></th>
      <th scope="col">when</th>
      <th scope="col">repository</th>
      <th class="num" scope="col">findings</th>
      <th scope="col">links</th>
    </tr></thead>
    <tbody>
      <tr data-pin>
        <td class="pick"><input type="checkbox" aria-label="select poi/vu3 !3302" /></td>
        <td data-label="when">…whenHtml(row.at)…</td>
        <td data-label="repository">poi/vu3 !3302</td>
        <td class="num" data-label="findings">12</td>
        <td class="actions" data-label="links"><a class="doc-link doc-link--forward" href="…">log →</a><a class="doc-link doc-link--forward" href="…">forge →</a></td>
      </tr>
    </tbody>
  </table>
</div>
```

The plain `<table>` above serves documents: a sentence per cell, generous padding. A table that is
scanned column by column, twenty rows at a time — an activity log, a queue, a roster — is
**`table.dense`**, cockpit's activity table. Cockpit declared it four times as `table.act`, each copy
a little different (the first-cell inset lived in one, the column floors in another), so the same
table looked different on each page; it is one class in `data.css` now, which needs `tokens.css`
alone. The `when` cell is `whenHtml()` (`references/data.md`).

- **The cell box** is `.3rem .35rem` on both sides, so a column gap is cockpit's .7rem and a
  right-aligned number needs no extra inset. One row rule for every table: `--border` at 55%. The
  header is muted 600 over a full-strength rule; the last row draws none.
- **The first cell always keeps .45rem for the pin bar**, on every row and the header — give it only
  to a pinned row and the whole column jumps sideways the moment a row pins.
- **A column has a floor of 3.5rem**, so a narrow window scrolls the table inside its `.tablewrap`
  rather than breaking a repository path over four lines (Daniel, 2026-08-21).
- **No cell sets a font.** `ui-monospace` swapped JetBrains Mono out of cockpit's `when` column. A
  quieter cell is `.text-muted-foreground`, never an opacity.

| class | on | does |
| --- | --- | --- |
| `.num` | `th` / `td`, any table | right-aligned on the last digit, in tabular figures, so a column of counts reads as a column |
| `.actions` | `td`, any table | one row action per line, each only as wide as itself |
| `.pick` | `th` / `td` in `table.dense` | the row's selection checkbox, in a narrow centred column |

**Every action of a row goes in ONE `td.actions`** (Daniel, 2026-09-12: *"always one link in one
line (all tables)"*). Actions sharing a line wrap wherever the cell runs out and strand an arrow on
the next line; actions in separate columns cannot be stacked by any stylesheet, because separate
cells are side by side by construction.

**The pick cell is the target, not the box.** A table's checkbox has no `.check` label to grow
through, and growing the box itself would put a 44px square in every row. So under a coarse pointer
the CELL becomes 44px and the box stays 14px, and `initPickCells()` (`runtime/pick.js`, once per
page, delegated, so rows rendered later need nothing) turns a press anywhere in the cell into a
click on its checkbox. It goes through the box's own activation: `input` and `change` fire exactly
as for a direct press, a disabled box stays as it is, and a press on the box itself is left alone,
or it would toggle twice. The keyboard is unchanged — the checkbox is the one focusable thing in the
cell. A framework app wires the same press on the cell: call the checkbox's `click()` unless the
event came from a control inside the cell. Name each box after its row (`aria-label="select poi/vu3
!3302"`); the header's box names the set.

**Row states** are attributes, never classes:

- **`tr[data-pin]`** — waiting on a decision, sorted to the top by the page. A 5% `--warning` tint
  AND a 3px `--warning` bar down the left edge, because a tint is the first thing a monochrome
  rendering loses. 5%, not cockpit's 12%: every text of the row sits on the tint, and at 6% the
  `when` stamp (`--muted-foreground`) measured 4.47 on warm's `--card`; at 5% it is 4.53 and a
  `--warning` tag 4.59 or better on every theme and surface. Under forced colours the bar becomes a
  `CanvasText` border, and in print a real one.
- **`tr[aria-disabled="true"]`** — a row that cannot be acted on. Its text is `--muted-foreground`
  except the first cell, which keeps its ink so the reader still sees WHICH row is off. Never
  opacity: cockpit's .72 dimmed the row under AA on warm and made it look broken rather than off.
- **`table.dense.dense--form`** — rows of controls, such as an agent roster with a model select per
  row: the cells centre on the controls, and under a coarse pointer each row is 44px.

**`.stackable` — the same table on a phone.** Below 40rem each row is a `--card` card and each cell
a `label value` line, the label taken from the cell's **`data-label`**. Cockpit's `kv--stack` made
the card but dropped the column names, so a stacked row was a column of values with nothing saying
which was which. Give every cell a `data-label` except the pick cell. An empty cell is dropped
rather than printed as "findings —"; the actions stay one per line down the value edge; a pinned row
is one card carrying the tint and the bar. A row the pager or a filter has hidden stays hidden: an
author `display` beats the browser's `[hidden]`, and `tokens.css` answers that once for every
element — do not add a guard of your own.

**The header row is not shown on a phone**, and everything in it goes with it. A stackable table with
a select-all checkbox carries that control OUTSIDE the table — beside its count or its bulk actions —
so a phone can still select every row.

**On a card or in a dialog**, set `--tablewrap-fade: var(--card)` on the container: the scroll fade
and the sticky header then paint the card rather than the page.

## Pairs: `table.kv` and `dl.kv` (0.60.0)

```html
<table class="kv"><tbody>
  <tr><th scope="row">host</th><td>ddstudio</td></tr>
  <tr><th scope="row">docker context</th><td>ssh://daniel@ddstudio.mellori-ide.ts.net</td></tr>
</tbody></table>

<dl class="kv">
  <dt><span class="ico" data-icon="mail" aria-hidden="true"></span>email</dt>
  <dd>hello@example.org</dd>
</dl>
```

A table of pairs and a list of pairs look the same, so choose by meaning: `table.kv` for a record's
fields (a screen reader announces each value with its row header), `dl.kv` for a short run of
definitions such as contact details.

- **The label is `--primary` 700; the VALUE is `--foreground`** — the text the reader came for.
  danieldeusing.de and seedr's studio muted the value, which made the one thing on the line that
  mattered the quietest thing on it. Cockpit, danieldeusing.de and studio already agreed on the
  label.
- **A long value breaks only where it would overflow** (0.61.1) — a URL or a path is a payload, and
  truncating it would lie, but a `table.kv` cell is `overflow-wrap: break-word`, not `anywhere`.
  `anywhere` let every prose cell shrink to one character while the table was sized, so beside a long
  code value (which keeps its word since 0.61.0) prose broke mid-word: "exists (producti|on)". A token
  wider than the table widens it and the `.tablewrap` scrolls. `dl.kv`'s value may still break
  anywhere: its grid column is sized by the label column and the free space, never by its content.
  The label never wraps, except on a phone, where a nowrap label pushes the value off the screen.
- **The label column is `--field-label-w`**, the system's one label width, so a block of pairs lines
  up with a `.field-row` form beside it; the 140px, 220px and 9rem chosen per page go. `dl.kv` always
  has the column; `table.kv` takes it with `.kv--labels`, widened on the table itself by the page's
  stylesheet (`.settings-kv { --field-label-w: 15rem }`, never a style attribute, which a
  `style-src 'self'` page drops), the label's end padding included.
- Below 40rem `dl.kv` is one column. `table.kv` restates the base cell box, so it renders the same on
  a surface that loads `tokens.css` + `data.css` only. A `dt` may lead with a glyph from the icon set.

## A `<select>` is enhanced automatically (0.21.0) — write plain HTML, add nothing

```html
<label for="review-mode">mode</label>
<select id="review-mode" data-k="mode">
  <option value="public" selected>public — posts on the PR</option>
  <option value="silent">silent — private report only</option>
</select>
```

That is the whole markup contract — the same "nothing" as `<table>` and `initTableScroll()`.
Call `initSelects()` once and every `<select>` on the page, **and every one rendered
afterwards**, gets the estate's dropdown. Do not add a class, a wrapper, or a data attribute;
`.select-trigger` / `.select-panel` / `.select-option` are what the runtime *renders*, and a
page that writes them by hand has hand-rolled the component it was given.

**Why this exists at all, and why CSS could never have done it:** a `<select>`'s option list is
painted by the operating system, outside the document. Rounded corners, a blue system highlight,
the system font, in the middle of a terminal UI — and unreachable from any stylesheet. Cockpit
carried **five copies of a `.cfg-sel` rule**, one per page, every one of them styling the closed
control, which was never the part that looked wrong. `appearance: base-select` reaches the list
in Chrome 135+ and nowhere else, so taking it would leave Safari and Firefox on the system menu
and the estate **disagreeing with itself** — worse than being consistently wrong.

**The `<select>` is still the control.** It holds the value, it is what a form submits, what
`select.value` reads, and what fires `input` then `change` (both, in that order, bubbling, with
`event.target` the select). That is why 28 call sites adopted this with **zero page edits** — and
it is the property to preserve if you ever touch this. It is laid transparently over the trigger
rather than `display: none`, because Chrome refuses to show a validation bubble on a control it
cannot focus and then blocks the submit **with no message at all**, which would silently break
every `required` select.

- **Sizing goes on the wrapper, and a page inline `style` is copied there for you.** A width set
  in the page's own CSS via a class on the `<select>` (`.cfg-sel { width: 100% }`) acts on an
  element that is no longer in the flow, so it does nothing. Size `.select-field`.
- **`title` and `data-tip` are copied to the trigger**, or the tooltip would be anchored to
  something nobody can hover — and **since 0.26.0 an `<option>`'s pair is copied onto its rendered
  `.select-option` too**. Before that it was dropped: the panel replaces the native option list, so
  every per-option explanation ever written was unreachable, in either attribute. Labels are found
  the way the platform finds them — `aria-label`, then `aria-labelledby`, then a `<label>` by `for=`
  or by wrapping — and since 0.61.0 the trigger's name is the label alone, with the chosen option as
  its value, once each ("lines, combobox, 200"), as a native select announces (`filters.md` has
  the whole rule).
- **Playwright sees no name on a trigger labelled by a `<label for>` without an id.** Since 0.60.0
  that one case is named by element reference (`ariaLabelledByElements`), which leaves the
  `aria-labelledby` attribute empty. Chromium reads the name; Playwright's own name computation
  (`getByRole`'s `name`, `toHaveAccessibleName`, `ariaSnapshot`) reads only the attribute. To
  assert the name, give the `<label>` an id, which the runtime then references by id, or read name
  and value from Chromium's accessibility tree over CDP (`Accessibility.getPartialAXTree`). There
  the name is the label as shown, CSS `text-transform` included, and the value ends in the
  zero-width space `.select-value::after` draws.
- **`multiple` and `size > 1` are left alone** — the platform renders those inline, and there is
  no popup to replace. There is no other opt-out: `data-select="off"` is gone in 0.60.0, because
  every dropdown list is the system's list.
- **Selection is a ✓, not a colour, and that is arithmetic.** `--primary` against
  `--popover-foreground` measures 1.65 / 1.31 / 1.48 / **1.27** on warm/green/mono/paper — two
  inks a reader cannot tell apart. Since 0.60.0 the chosen option shows a ✓ in the check column
  every option reserves — the mark a chosen menu item wears too (`components.md`, "One popup
  look") — and keeps its weight and ink; 0.59.0's left edge and bold are gone. Do not "simplify"
  it back to a tint.
- **The trigger is a field: `--control-h` tall, on the `--control-edge`.** The edge is
  `--foreground` at 60%, not `--border`: `--border` is a container hairline measuring
  1.37 / 2.00 / 1.61 / 1.42 against `--background` — invisible as a control edge, where WCAG 1.4.11
  wants 3:1 — and 60% clears it on all four themes against all three surfaces a control can land
  on (warm binds, at 3.26 on `--muted`). Focus adds the `--primary` edge to the `--ring` outline;
  `aria-invalid="true"` on the `<select>` gives the trigger the `--destructive` edge, and, as on
  every field, the select names a `.field-error` through `aria-describedby` that says what is wrong
  — the edge alone is colour. It is the height of the text field and the compact button beside it
  ("One control height" in `components.md`). A disabled select keeps its edge under the pointer: it does not answer it at all.
- **Under forced colours the caret is text.** The mode drops the gradient that draws it, so the
  trigger draws its ▾ as a glyph instead; a bare `<select>` that no runtime enhanced has no caret
  there — one more reason every page calls `initSelects()`.

## A wide table scrolls itself (0.23.0) — including one you render after the page loads

`initTableScroll()` gives every `<table>` a `.tablewrap` parent, so a table wider than its column
scrolls **itself** rather than handing the whole page a horizontal scrollbar — the one layout
failure that reads as broken, because the header slides off and body text needs two axes. Markup
contract: nothing. Author a plain `<table>`.

**The thing to rely on: it keeps wrapping.** Call it once; a table rendered from a fetch twenty
minutes later is wrapped too, by a MutationObserver, exactly like `initSelects()` and
`initTablePagination()`. Until 0.23.0 it was a single walk at call time, which is why it appeared
to work for sixteen releases and covered only the tables that are never too wide: a static page
authors its tables in the markup, and **every table that genuinely overflows is on a dashboard,
where the tables arrive after the walk has finished.** Cockpit's called it from a deferred module
during load, while every mount still read `loading…`. So do not "help" by re-calling it after each
render, and above all do not hand-wrap in the markup to work around the old behaviour — a wrapper
in the markup is a wrapper the system now has to leave alone forever.

**If your page reconciles markup against the live DOM, teach the reconciler about the wrapper.**
This is the one integration cost, and it is not optional: a wrapper the runtime inserted is in no
renderer's markup, so a patcher sees `<div>` where its markup says `<table>` and replaces it —
killing the table, its row listeners and every half-typed filter on every poll, after which the
runtime wraps the replacement and the next poll does it again. One rule fixes it: **a `.tablewrap`
holding a single `<table>` stands in for that table** — for its key, its kind, and as the node
actually patched — and *only* when the incoming node is a `<table>`, so a renderer that writes its
own wrapper still lines up. Cockpit's `dom-patch.js` is the worked example, filed beside the two
exemptions it already had (`open` on a `<details>`, `hidden` on a `<tr>`). A page that assigns
`innerHTML` outright needs none of this.

**The fades are measured, not decorative (0.43.0).** The runtime writes `data-scroll` on the
wrapper — `none`, `start`, `middle` or `end` — and chrome.css paints from it: nothing on a table
that cannot scroll, a right fade when there is more to the right, a **left** fade when there is
more to the left, and both when you are somewhere in the middle. Until 0.43.0 `::after` painted
always, so "there is more over here" was said equally by a table with six hidden columns and by
one with none; an indicator that is always on is not an indicator, and cockpit lost a whole column
behind it. A wrapper with no `data-scroll` — nothing ran the runtime, or the wrapper has no layout
box yet — paints nothing, because a fade is a promise and silence is the safe way to break none.

**If your page reconciles markup, `data-scroll` is runtime-owned** — the same exemption as
`tabindex`/`aria-hidden` on a wrapped `<select>`. A patcher that strips it takes the fades off on
every poll.

**Colour the fade when the wrapper is not on the page background.** The gradient blends to
`--tablewrap-fade` (default `--background`), which is a visible bright band on a `--card` surface.
`.tickstrip` sets it upstream; your own card-like container sets it itself.

**The horizontal scrollbar is permanent, and the two APIs cancel each other.** macOS overlay
scrollbars are invisible until you scroll, so `.tablewrap` styles `::-webkit-scrollbar` to opt
Chrome and Safari into a persistent slim bar. Do not "complete" this by adding `scrollbar-width`:
setting it to anything but `auto` makes Chrome ignore every `::-webkit-scrollbar` rule, and
`scrollbar-width: thin` is still an overlay scrollbar on macOS — so declaring both gives back the
invisible scrollbar and looks like a fix (measured: webkit alone 8px of gutter, both together 0).
The standard properties live behind `@supports not selector(::-webkit-scrollbar)` for Firefox.

`--tablewrap-max-h` caps the wrapper's height and defaults to `none` on purpose — see the tables
paragraph under "The shared component vocabulary" in `SKILL.md`.

**Never hand-write a wrapper, and never re-invent `.table-scroll`.** That was this repo's private
name for the same idea before 0.7.0 shipped `.tablewrap`, and two names for one thing is how the
estate drifts. The wrapper is `overflow-x` plus a right-edge fade, and the fade exists because a
scroll container with a hard edge is indistinguishable from a table that simply ends, and nobody
knows to scroll.

## A long table pages to 20 (0.22.0) — one attribute, and it slices last

```html
<table data-table-id="review-activity">
```

`initTablePagination()` then hides all but 20 rows and puts a bar under the table: `1–20 of 55`,
a `rows` picker (5/10/20/50/100/200, remembered per table in
`localStorage["table-rows:<id>"]`), and prev/next. Everything in that bar is already yours — the
buttons are `.btn-terminal--ghost.btn-terminal--compact` and the picker is a bare `<select>` that
`initTablePagination()` enhances itself since 0.60.0 — so **there is no new colour and nothing to
hand-write.**

**The order is filter → sort → slice, over the full dataset, and it is guaranteed by construction.**
The natural wrong build cuts the data to twenty rows and wires the sort and the filter to the cut:
page 1 reorders while the actual newest row sits on page 3, and a filter finds nothing because the
match was never in the slice being searched. It looks right on the first screen, which is why it
ships. **The component cannot express that mistake — it has no sort and no filter.** It reads a
`<tbody>` something else already produced and hides all but one window of it. So a page keeps its
own sort and filter and needs *no edit at all* to gain paging; cockpit's `cockpitTable` still
filters and sorts `rows`, the full array, and still writes every matching row into the tbody.
**If you ever make an engine emit only the visible page, you have broken this** — and the guard is
`bin/cockpit-render-check`'s "the engine hands the pager the WHOLE set".

- **`data-table-id` is required and never guessed.** Page path plus table index is the obvious
  alternative and it is a bug with a delay on it: add a table above another and every reader's
  "100 per page" silently becomes a different table's setting. A table without an id is left
  **completely alone** (all rows, no bar) and warns on the console **only if it was long enough to
  have been paged** — a warning on the forty short tables in the estate teaches people to ignore
  the console.
- **Do not paginate a table that cannot outgrow a screen.** Most of the estate's tables are short
  reference tables — `infra-machines` lists four machines — and controls that can never do
  anything are noise. Nine tables in cockpit carry an id; the other 36 do not.
- **The bar appears only when it can act**: more rows than fit, *or* a non-default size in force.
  That second clause is not decoration — without it, picking 100 on a 30-row table removes the
  control you just used and there is no way back to 20.
- **Paging writes `hidden` on rows and rebuilds nothing.** That is what lets it sit under cockpit's
  in-place patching (`dom-patch.js`), which exists so a refresh cannot destroy half-typed input —
  a pager that re-rendered the table would hand all of that back. `dom-patch.js` exempts `hidden`
  on a `<tr>` for the same reason it exempts `open` on a `<details>`: the renderer does not own it.
- **A `hidden` row stays hidden**: tokens.css's `[hidden]` rule (`display: none !important`, on
  every element) beats any rule setting `display` on a row, which the UA's one-attribute rule loses
  to — and a `hidden` that loses to a stylesheet is still announced by a screen reader.
- An engine that renders a "nothing matched" message as a `<tr>` must mark it
  `data-table-placeholder`, or the pager counts a message as data.
- **`.table-pager` is not for a surface that loads only tokens+chrome.** It is built from
  `.btn-terminal`, which lives in `components.css`. netmon therefore cannot have this component,
  and must not borrow its class names — that is the fork `bin/design-conformance` catches.

## A table gets a search, a filter and a sort — and says which are on (0.29.0, Daniel)

Three rules, in order. The first one is the one people skip.

**1. Use a table when the data is a table, and not otherwise.** Rows that share a set of
fields, compared down columns — accounts, contacts, containers, transactions. If a reader
would never compare two rows field by field, it is a list, a definition list or a set of
cards, and forcing it into a table buys a header row nobody reads. The test is whether
sorting by a column would mean anything.

**2. Every table that is one gets all three, from the system.** One `data-table-tools`
attribute and `initTableTools()`:

```html
<table data-table-id="household-contacts" data-table-tools data-sort-key="name">
  <thead><tr>
    <th data-col="name">name</th>
    <th data-col="rel" data-filter="pick">relationship</th>
    <th data-col="amount" data-sort-type="num">amount</th>
  </tr></thead>
  <tbody>…</tbody>
</table>
```

- A search box above the table, matching every column at once.
- Per column, two controls **in the `<th>`**: sort, and a filter that opens a dropdown.
  `data-filter="pick"` builds the list from the column's own cells, so it can never offer
  a value the table does not contain; the default is a contains-box.
- `data-value` on a `<td>` is what the cell is worth, for matching and sorting, when that is not
  what it prints — an ISO date under a friendly one, cents under a formatted amount.
- `data-sort-value` on a `<td>` overrides it again for the order only: a duration filters on
  "1m 30s", as the reader types it, and sorts on the millisecond count.
- `data-col-label` on a `<th>` is the column's name in the controls' labels when the header's own
  text is not a good one.
- `data-sort-sticky="off"` on the `<table>` keeps the filters across visits but not the order: a
  table whose subject is time opens in its declared `data-sort-key` / `data-sort-dir` every time.
- A detail row that belongs to another is `data-row-for="<key>"`, its parent `data-row-key="<key>"`.
  It is left out of the match and the sort, follows its parent, and goes when its parent is filtered
  out.

**Do not write a row of filter boxes under the header.** That shape is what this replaces.
It spends a whole row of vertical space advertising a capability idle on most visits, it
reads as a form to fill in, and the estate grew four incompatible versions of it —
cockpit's `tr.act-filters`, cockpit's older `tr.filters`, and the family contacts table's
bare boxes, which is the one that prompted this rule.

**3. What is in force marks its own column.** A filtering column's header takes the
primary colour and an underline and carries a **badge with the selected value**; the
badge is a button that clears that filter. Sort direction shows as an up or down arrow on
the same header.

**Not a bar above the table.** 0.30.0 shipped one — a `.tbl-view` strip with a chip per
filter — and it was removed in 0.33.0. A separate strip is a second place to look, costs
a line of vertical space on every filtered table, prints `relationship = family` a long
way from the relationship column, and can be scrolled off a long table. The header
cannot. Do not reintroduce one.

This is not decoration. The view is remembered per table across a browser restart, so a
reader can arrive at a table that is already withholding rows for a reason nobody on
screen gave — and an empty table and a filtered one look nearly identical. The marked header
says which it is. It is derived from the view's *deviation from the table's defaults*, never
from "was this restored", so it cannot go stale while the filter is still in force.

It composes with the pager (0.22.0): filtered-out rows are detached from the tbody, so
the pager slices exactly the matching set and needs to know nothing about filtering. A filter pass
moves only the rows whose visibility changes (0.62.3): narrowing removes the rows that leave,
clearing inserts the ones that come back, and the rows already showing stay where they are.

**A page may write into a row the engine is showing** (0.62.3) — `cell.textContent`, a text node, a
`data-value` — and it is an update of that row: the filter is applied again over the whole set,
withheld rows included, and the rows showing keep the order the body has them in. The body is read as
the new set when a row was added, removed or moved in it, which is what a renderer that redraws the
rows usually does, or when the renderer says it wrote a different number of rows.

**A renderer that patches rows in place declares its row count: `data-table-rows="N"`** on the
`<table>`, set in the same task as the rows, where N is the number of rows it wrote into the tbody
not counting detail rows (`data-row-for`). **N is read only in the task that writes it** — a
`setAttribute`, even of an unchanged value, as cockpit's paint does every poll — so a value in the
first markup, or one left standing while the page adds or removes rows by hand, is never read.
When the N just written is not the number the engine holds, the body is read as the whole new set.
Without it, one case cannot be told apart from a page editing cells: a
renderer whose new set has exactly as many rows as are showing rewrites them in place and moves none,
and the engine keeps the withheld rows it no longer has. Until a render whose row count differs —
at most one poll on a page that polls, indefinitely on one that does not — those ghosts are counted
("3 of 10 rows — 7 hidden by the filters"), offered in a pick menu, and shown again when the filter
is cleared, where a record the renderer wrote into a shown row can then appear twice.
`resetTableView()` does not clear them. `data-table-rows` is the cure; it is optional, and a table
without it behaves exactly as described here.

### What the engine does besides (0.60.0 — cockpit's table, moved into the system)

```html
<search class="filter-bar" data-table-bar aria-label="runs">
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact">new run</button>
</search>
<div class="tablewrap">
  <table class="dense" data-table-tools data-table-id="review-runs" data-table-unit="runs"
         data-sort-key="started" data-sort-dir="desc" aria-label="runs">
    <thead><tr><th data-col="repo">repository</th><th data-col="state" data-filter="pick">state</th>…</tr></thead>
    <tbody><tr data-search-text="review 4417 job j-88">…</tr></tbody>
  </table>
</div>
```

- **The search finds what no column prints.** A row's `data-search-text` is matched with its text,
  so a review id or a job id needs no second box. `data-table-search="off"` is still there for a page
  whose search cannot be expressed per row — one that asks its server, say, over records the table
  does not hold.
- **The page's bar is used, not duplicated.** A `<search class="filter-bar" data-table-bar>` directly
  before the table's wrapper gets the search FIRST in it, on the left; the page's one action stays,
  on the right (the bar right-aligns everything but its lead). Without one, the engine builds the bar (a `.filter-bar` + `.search-field`, `filters.md`).
- **The box and the count survive a re-render.** Neither is in the page's markup, so a renderer that
  patches the whole mount takes both; the engine puts the same nodes back, the box holding the query.
  A patching renderer (cockpit's `cockpitPatch`) should draw them itself instead, and the engine adopts
  them, so a patch never has anything of the engine's to take away:

  ```html
  <search class="filter-bar" data-table-bar aria-label="runs">
    <div class="search-field"><input type="search" data-table-search aria-label="search runs">
      <button type="button" class="search-clear" aria-label="clear the search" hidden></button></div>
    …
  </search>
  <div class="tablewrap"><table data-table-tools …>…</table></div>
  <p class="result-count" role="status" data-table-count></p>
  ```

  A count another table already speaks through is never adopted.
- **Give every engine table a stable `data-table-id`.** It keys the remembered view, and it is how the
  engine knows which table a node IS: a positional patcher can hand one `<table>` node another table's
  markup (two engine tables in one mount), and a node whose `data-table-id` — or `aria-label`, without
  one — has changed is dropped and enhanced again as the table it now is, with every row it had withheld
  given back first. Without an id, renaming a table's `aria-label` counts as a different table.
  **Two engine tables in one patched mount need DISTINCT ids** (or page-drawn bars and counts, so the
  positions line up): the guard can only tell tables apart by what they are called, and two with the same
  id, label or neither can trade nodes unseen. The engine says so once in the console, naming the id.
- **A renderer that re-renders the mount draws the bar.** This is a contract. Without a page bar the engine inserts its own
  `<search>` before the wrapper, where the renderer's markup has none. A patcher matching by position
  (cockpit's `cockpitPatch`) then lines the page's `div.tablewrap` up against that bar, builds a new
  table in its place and discards the old one on every poll. The view is lost without a `data-table-id`;
  with one, the box's casing and the focus still go. So a mount that is patched carries
  `<search class="filter-bar" data-table-bar>` before each engine table's wrapper (the engine puts its
  box in it, or adopts the renderer's own). The engine warns once per table in the console when it sees
  its own bar taken out while that table, or a table of the same identity, is still in the mount.
- **Focus survives a re-render.** A patch that takes out the sort button, the badge, the summary or a
  menu item it had focused drops focus to `<body>`; the engine puts the same node back and focus with it.
  A focus the reader moved away on purpose is left alone.
- **The count is silent at rest.** A `p.result-count[role=status]` sits after the wrapper, after the
  pager when there is one, from the start and empty. While rows are withheld it says
  "7 of 55 runs — 48 hidden by the filters" (`data-table-unit`, default "rows"), written 400 ms after
  the last change. At rest it says nothing: the pager already states the total.
- **Two nothings, two sentences.** With no rows the engine's placeholder row says the table's
  `data-table-empty`, or "no runs yet". With rows and no match it says "no runs match these filters."
  and offers a real button, "reset filters", which is `resetTableView()`. The row spans every column,
  is `tr[data-table-placeholder]`, and is passed over by the match, the sort and the pager. It holds
  the inline empty state as `feedback.md` documents it: the sentence is the `.empty--inline` box's own
  text, the reset follows it, no `<p>` between.
- **A failure and a load are the page's.** A failed fetch is the empty state's failure form in the table's place
  (`.empty[data-tone="warning"][role="alert"]` with a retry); until the first rows arrive the mount
  holds a `.loading` row, not an empty table — which would otherwise say "no runs yet" and be wrong.
  Every exit path replaces it. Three sentences, never one "nothing here".
- **A pick filter is a menu.** `ul.dropdown-panel[role=menu] > li[role=none] >
  button.dropdown-item[role=menuitemradio][aria-checked]`, "all" first and checked at rest, then the
  values counted as a reader counts (gpt-5.9 before gpt-5.10). The menu keys and the one popup look's ✓ come with it.
  A filter's panel is placed `fixed` against its summary (`positionPopup()` from `popup.js`, as `select.js` does), so the
  scrolling `.tablewrap` never clips it — a table filtered down to its placeholder is shorter than its
  own menu. It follows its summary through every scroll, and closes once the reader scrolls the column
  out of the wrapper — moving no focus, unless focus was inside the panel, which then goes to its summary.
- **The header glyphs are the icon set's masks**, in the header's colour at `--icon-sm`: the sort
  arrows follow `aria-sort`, the funnel turns `--primary` while it filters, the badge ends in an x. The
  controls carry no text, only their `aria-label`; the badge carries no native `title`. They take the
  house ring, 2px off, and under a coarse pointer each — the badge too — is at least 44 × 44. Clearing a
  filter by its badge leaves focus on that column's filter summary.
- **A table rendered later is enhanced when it arrives**: call `initTableTools()` once at startup.
- **A moved table takes its bar, its pager and its count with it (0.61.0).** Append the table or its
  `.tablewrap` somewhere else and its bar goes directly before it — the engine's own, or since 0.62.3
  the page's `data-table-bar` it adopted, with the page's box and action in it, unless the new place
  has a page bar of its own — the pager and the count directly after it, with the sort, filters, search and page the reader had. A table detached and
  inserted again later comes back with that view too, with or without a `data-table-id`; a table
  removed for good leaves no count or pager where it stood. Focus in the bar goes with it (0.62.4): the
  page's box (with its caret), the page's action, the engine's box — given back without scrolling, and
  focus anywhere else is not moved. A detached table's engine box is a new one when it returns; it takes
  the focus and the caret, unless the reader did anything in between (a click, a key, a focus elsewhere).
  Focus is given back once the whole move has landed, so scroll anchoring cannot shift the page.
- **A pager survives a patched mount (0.62.3).** The pager is in no renderer's markup, so a patcher that
  re-renders the whole mount (cockpitTable's shell: bar, wrapper, count) puts the count's markup in its
  place; the same pager goes back after the wrapper, on the page the reader was on. Since 0.62.4 the
  focus does too: a reader on "next →" or the rows picker is still on it after the patch, the page not
  scrolled. A focus the reader took off the pager is not pulled back, and a pager the patch left with
  one page is hidden and holds no focus. A pager whose table left the document does not take focus back
  when the table returns. Known limit: a script that blurs a pager control and patches the mount in the
  same task gets the focus put back, since the blur is only forgotten a microtask later.
- **A renderer that re-renders the header gets the engine's parts back.** `aria-sort`, `.is-filtered`,
  the controls, the badge and `aria-checked` are the engine's; a patcher (cockpit's `cockpitPatch`)
  that writes the header's markup removes them, and the engine puts the same nodes back. Its
  `.tbl-*` rules are in `data.css`, so a surface loading tokens + chrome + data draws the same header.

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

### A description, an error, a tall value, a table (0.60.0)

```html
<div class="field-row">
  <label class="lbl" for="model">model</label>
  <div class="field-val">
    <select id="model" aria-describedby="model-desc model-err" aria-invalid="true">…</select>
    <p class="field-desc" id="model-desc">used for every review on this repository</p>
    <p class="field-error" id="model-err" role="alert">pick a model the agent supports</p>
  </div>
</div>
```

Cockpit wrote each of these locally, which is how one settings row came to exist in three
spellings.

- **`.field-desc` says what the setting does and `.field-error` what is wrong with it** — each a
  whole line under the control inside `.field-val`, muted and `--destructive`. Point the control at
  both with `aria-describedby`, set `aria-invalid="true"` on it while the error stands (the field
  takes the `--destructive` edge), and give an error that appears after an action `role="alert"`.
  **`aria-invalid` never stands without its `.field-error`**: the edge is colour alone (WCAG 1.4.1)
  and says nothing about the fix (3.3.1).
- **`.field-row--top`** heads a tall value with its label — a textarea, a stack of radios — where a
  centred label reads as belonging to neither line.
- **`.field-row--stacked`** puts the label over the value at every width, for a value that needs
  the whole row: a table, a long textarea.
- **A value that is a table** loses its first row's top padding, so the table's first line sits on
  the label's line.
- **`button.lbl` is a label that opens its explanation** — in a dialog, on a phone, where there is
  no hover to read a tip by. It keeps the label's look (no box, start-aligned, muted), turns
  `--primary` under the pointer and in focus, and is 44px tall under a coarse pointer.
