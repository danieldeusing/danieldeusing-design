# Tables and forms

Reference for the `danieldeusing-design` skill. Read it before a page gets a table, a `<select>`
or a settings panel. That a table is styled by element, and the three things a page may own
(column widths, `--tablewrap-max-h`, `--tablewrap-fade`), are in `SKILL.md` under "The shared
component vocabulary".

Contents:

- A `td` has no colour: the Tailwind-typography trapdoor
- Authoring a plain table: column widths and cell content
- A `<select>` is enhanced automatically (0.21.0)
- A wide table scrolls itself (0.23.0)
- A long table pages to 20 (0.22.0)
- A table gets a search, a filter and a sort (0.29.0)
- `.field-row`: a settings panel is a two-column table

## A `td` has no colour: the Tailwind-typography trapdoor

**`td` deliberately has no colour, and on a Tailwind-typography surface that is a trapdoor.** The
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
<table>
  <colgroup><col style="width:4rem" /><col /><col style="width:9rem" /></colgroup>
```

Give the sentence column no width and let it take the remainder. Without this a
three-sentence cell sizes the column to its longest line and squeezes every other column
into a vertical stack of single words.

A long inline-code value or a cell holding more than one item forces the table wider than its
column; without a scrolling wrapper the browser scrolls the whole page horizontally — the header
slides off, the fixed footer stops reaching the edge, and body text needs two axes to read.
Never set `white-space: nowrap` on a cell that can hold more than one short token (e.g. a
list of file names) — that's what forces the runaway width in the first place; if a cell
needs to list several items, join them with `<br />` so they stack instead of running wide.

Never set a font-size on a table. 0.7.0 gave `table` one size for the whole estate (`--fs-md`
until 0.27.0, `--fs-base` since), which exists because cockpit's doc tables sat at 15px and its
dashboard tables at 12px. A local size only reintroduces that.

## A `<select>` is enhanced automatically (0.21.0) — write plain HTML, add nothing

```html
<select data-k="mode">
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
  or by wrapping — and the trigger's name becomes *label + current value*, as a native select
  announces.
- **The opt-outs are real ones**: `multiple` and `size > 1` are left alone (the platform renders
  those inline; there is no popup to replace), and `data-select="off"` skips a select entirely.
- **Selection is not marked by colour, and that is arithmetic.** `--primary` against
  `--popover-foreground` measures 1.65 / 1.31 / 1.48 / **1.27** on warm/green/mono/paper — two
  inks a reader cannot tell apart. Same finding as the rail's current row, same answer: a left
  **edge marker** plus **bold**, with the colour as the third signal. Do not "simplify" it back
  to a tint.
- **The control's border is `--foreground` at 60%, not `--border`.** `--border` is a container
  hairline measuring 1.37 / 2.00 / 1.61 / 1.42 against `--background` — invisible as a control
  edge, where WCAG 1.4.11 wants 3:1. 60% is the first step that clears it on all four themes
  against all three surfaces a control can land on (warm binds, at 3.24).

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
`initSelects()` enhances — so **there is no new colour and nothing to hand-write.**

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
- **`tr[hidden] { display: none !important }`** ships in `base.css`, because the UA's
  one-attribute rule loses to any rule setting `display` on a row — and a `hidden` that loses to a
  stylesheet is still announced by a screen reader.
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
- `data-value` on a `<td>` sorts by something the cell does not print — an ISO date under
  a friendly one, cents under a formatted amount.

**Do not write a row of filter boxes under the header.** That shape is what this replaces.
It spends a whole row of vertical space advertising a capability idle on most visits, it
reads as a form to fill in, and the estate grew four incompatible versions of it —
cockpit's `tr.act-filters`, cockpit's older `tr.filters`, and the family contacts table's
bare boxes, which is the one that prompted this rule.

**3. What is in force marks its own column.** A filtering column's header takes the
primary colour and an underline and carries a **badge with the selected value**; the
badge is a button that clears that filter. Sort direction shows as `▲`/`▼` on the same
header.

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
the pager slices exactly the matching set and needs to know nothing about filtering.

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
