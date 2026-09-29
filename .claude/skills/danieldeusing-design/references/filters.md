# Filters, search and sort

Reference for the `danieldeusing-design` skill. Read it before a page gets a search box, a filter,
a sort, a row of chips, or any list that drops down. The CSS is `src/filters.css`; the runtime is
`runtime/search.js`, `select.js`, `sort.js` and `popup.js`.

Contents:

- Every dropdown list is the system's list (0.60.0, Daniel)
- What replaces `.filter-ctl` and `.filter-set`
- The bar they sit in — `.filter-bar`
- A search box — `.search-field` and `initSearchFields()`
- A filter — `<select data-filter>`
- A long filter gets a search row — `data-search`
- A sort — `.sort-ctl` and `initSortControls()`
- Several values at once — `.chip-set` of `.chip`
- What is in force — `.filter-chips`
- A value that filters by itself — `.value-filter`
- The count and "show more" — `.result-count`, `.load-more`
- An autocomplete list
- Where a popup goes — `positionPopup()`
- A table's search is the same box
- Framework apps, and a surface that loads only tokens

Daniel, 2026-09-28: *"we have filter functionality already in seedr and configr. Look at how we did
the filters there (dropdown) and also search input field and sorting."* Both apps had built the same
controls independently and nearly identically. This file is those controls on the system's tokens.
When seedr and configr disagreed, the version more of the estate used won, then the accessible one.

## Every dropdown list is the system's list (0.60.0, Daniel)

> **A list that drops down — a `<select>`, a filter, a sort field, a menu — is drawn by the design
> system: never by the operating system, never by a component library's default skin.**

Daniel, with a screenshot of a rounded, blue-highlighted system list beside seedr's filter panel:
*"A dropdown should ALWAYS have the custom layout (screenshot 2) for the list, not the system one
(screenshot 1)."* He had found the system list in the seedr playgrounds, on a page that built a bare
`<select>` and never loaded the runtime.

- **A build-free page calls `initSelects()` once at startup.** It enhances every `<select>` on the
  page and every one rendered later — one MutationObserver — so a page that builds its selects in JS
  is covered by that one call. A page that calls `initTablePagination()` needs it too: the pager's
  `rows` picker is a `<select>`.
- **There is no opt-out.** `data-select="off"` is gone in 0.60.0: nothing used it, and an escape
  hatch nobody needs is the one the next page reaches for when the enhanced list is inconvenient.
  `multiple` and `size > 1` stay native because they are inline list boxes, not dropdowns.
- **A framework app never renders a native `<select>`** (seedr web and studio, configr): its listbox
  and menu put `.select-panel` on the panel and `.select-option` on each row, with
  `aria-selected`/`aria-checked` for the choice and `data-active` (or Radix's `data-highlighted`) for
  the highlight. `select.js` reparents the `<select>` into its own wrapper — never run it over nodes
  React owns.
- `bin/design-conformance` (danieldeusing-infra) fails a page that ships a `<select>` and never runs
  `initSelects()`, any `data-select="off"`, and a JSX `<select` in a framework app.

## What replaces `.filter-ctl` and `.filter-set`

`.filter-ctl` (a text toggle marked `[x]`) and `.filter-set` (a labelled row marked `(•)`) are
removed in 0.60.0. They answered "a filter must not look like a button" and never answered "this is
a filter, and this is what it is set to". Each use goes to the control that says what it is:

| the job | write |
|---|---|
| pick ONE value, required (cockpit's stats "which repository") | `<select data-filter aria-label="repository">` with no empty option |
| pick one value OR none | `<select data-filter aria-label="source">` whose first option is `<option value="">all</option>` |
| turn one thing on or off (`follow`, `hide handled`) | `<button type="button" role="switch" aria-checked="false" class="switch">follow</button>` (`controls.md`) |
| an action that was filed as a filter (`select all pending`) | `.btn-terminal.btn-terminal--ghost.btn-terminal--compact` |
| pick SEVERAL values (pagr's tags, cockpit's host and tag pills) | `.chip-set` of `button.chip[aria-pressed]` |
| push the filters to the far edge of a row | `.filter-bar-spacer` inside a `.filter-bar` |

## The bar they sit in — `.filter-bar`

```html
<search class="filter-bar">
  <div class="search-field">…</div>
  <span class="filter-bar-spacer"></span>
  <select data-filter aria-label="type">…</select>
  <select data-filter aria-label="source">…</select>
  <div class="sort-ctl btn-group" role="group" aria-label="sort">…</div>
  <span class="sep" aria-hidden="true"></span>
  <button type="button" class="btn-icon" data-icon="refresh-cw" aria-label="refresh catalog"></button>
</search>
```

**The order is the rule: search → spacer → filters → sort → separator → actions.** configr's
RegistryBrowser and seedr's Browse arrived at it without comparing notes. The search is where the
eye starts; the spacer pushes everything that narrows the list to the far edge; actions — refresh,
add — come last and apart, because they do something rather than choose something.

- The search field takes `flex: 1 1 14rem`, capped at `24rem`. Below `40rem` it takes the whole first
  row, the spacer disappears, and the filters wrap under it where a thumb can reach them.
- `<search>` is the landmark (or `role="search"` on a `<div>`). **Label it when a page has more than
  one**: `<search class="filter-bar" aria-label="skills">`.
- `.filter-bar--sticky` pins the bar under a page's header — set `--sticky-top` to the header's
  height — on an OPAQUE `--background`. configr blurred what scrolled under its bar; text read
  through a translucent surface is not something this estate does.
- It sets no height of its own: every control in it is `--control-h` (28px), so the row lines up.

## A search box — `.search-field` and `initSearchFields()`

```html
<div class="search-field">
  <input type="search" aria-label="search skills" placeholder="search…"
         autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore>
  <button type="button" class="search-clear" aria-label="clear search" hidden></button>
</div>
```

seedr's input, redrawn: a magnifier inside the start of the box, a clear button inside its end, 2rem
of padding on each side so text never runs under either. The box is `--control-h` tall on the
`--control-edge`, which turns `--primary` on hover and on focus.

**`initSearchFields()` owns three things, and the page owns the rest.** Call it once; it is
delegated, so a field rendered later needs nothing.

- **The clear is there exactly when there is something to clear.** It toggles `hidden` from the
  value on every `input`. A value set FROM CODE fires no `input` — restore a query from the URL and
  set the clear's `hidden` yourself, or the box shows a query with no way to clear it.
- **…and usable exactly when the box is.** A disabled box that holds a query keeps it visible, and
  its clear is `disabled` with it (followed when the page switches the box off or on later): it
  clears nothing and fires nothing.
- **The clear is a real edit.** It empties the box and dispatches `input` then `change`, bubbling,
  from the input — exactly what a person clearing it by hand produces — and puts focus back in the
  box. A page's handler cannot tell the difference, so there is no second path to drift. A press on
  the clear does not take focus from the box, so no stray blur-`change` carrying the old query.
- **Escape clears a FILLED box and goes no further**; in an EMPTY box it does nothing, so it reaches
  whatever else Escape means there — the dialog or dropdown around the box. Two boxes are left
  alone: the search row inside a select's list (Escape closes the list), and a box that is an open
  autocomplete (`aria-expanded="true"` — the page dismisses its list first).

**The query is the page's**: what it filters, and whether it waits. A debounced search calls
`markPending(field, ms)` on every keystroke with its own delay: a 1px `--primary` line along the
inside bottom edge drains over `ms` and goes away `ms` after the LAST call — the moment the page
applies the query. It replaces configr's DebounceRing, a rounded SVG rect, with a square line; with
motion off it simply stands while the query is pending.

```js
input.addEventListener("input", () => {
  markPending(field, 300);
  clearTimeout(timer);
  timer = setTimeout(apply, 300);
});
```

- **Name it with `aria-label` or a `<label>`, never the placeholder alone.** seedr's fell back to the
  placeholder; a placeholder disappears the moment it is needed.
- **One box, never two.** Nothing is drawn on the wrapper. cockpit's `.grepline` put the border on a
  wrapper and `outline: none` on the input; pagr's `grep` ended up with a box inside a box.
- `.match-count` ("3/17") sits beside a search that steps through matches. The field is not a live
  region; the count is.
- A query the page cannot use (a broken regex) is `aria-invalid="true"` on the input: its edge turns
  `--destructive` and stays so under the pointer and in focus.
- `data-1p-ignore` because a password manager otherwise offers to fill every filter box on a page.

## A filter — `<select data-filter>`

```html
<select data-filter aria-label="source">
  <option value="">all</option>
  <option value="seedr">seedr</option>
  <option value="skills">skills.sh</option>
</select>
```

That is all a page writes. `initSelects()` renders seedr's and configr's filter dropdown around it:

```
  at rest     [⏷ source ▾]         the trigger names the FACET — the select's label
  filtering   [⏷ seedr ▾][×]       the trigger names the VALUE, wears --primary, and a clear is joined
```

```html
<span class="filter-dd btn-group" role="group" aria-label="source filter">
  <span class="select-field"><select data-filter …></select>
    <button type="button" class="select-trigger select-trigger--filter" aria-label="source filter: seedr" data-active="true">seedr</button></span>
  <button type="button" class="filter-clear" aria-label="clear source filter"></button>
</span>
```

> **`span.filter-dd` is built by the runtime, exactly like `span.select-field` inside it.** A renderer
> that patches the DOM (cockpit's `dom-patch.js`) must treat `.filter-dd` as a SLOT standing in for
> the `<select>` it holds — as it already treats `.select-field` — and descend to the select, never
> replace the span. Otherwise "the DOM says `<span>`, my markup says `<select>`" resolves to replace,
> and a patch landing while the list is open destroys the panel mid-click. A select that is moved out
> of its wrapper anyway is wrapped again where it lands (the old wrapper is removed), so it never
> falls back to the OS list — but the open panel is still lost.

- **The `<select>` stays the control.** It holds the value; it fires `input` then `change` on a pick
  and on a clear, bubbling. Listen on it exactly as on any select.
- **The facet is the select's name** — `aria-label`, `aria-labelledby` or a `<label>` — so write it
  as a noun: `type`, `source`, `label`. It is what the trigger says until something is chosen.
- **Active means "filtering"**: a value other than `""` on a select that HAS an empty option. The
  trigger then takes `data-active="true"` — `--primary` ink, edge and funnel — and the clear appears.
  Colour is the third signal, not the only one: the trigger's words change from the facet to the
  value, and the accessible name says both ("source filter: seedr").
- **The list opens on an "all" row.** The empty option comes first whatever order the page wrote it
  in, labelled "all" when it has no text of its own, and it carries the ✓ exactly when nothing is
  filtered. Picking it clears the filter, like the clear button.
- **The clear names its facet**: "clear source filter". seedr's and configr's both said "Clear filter"
  — seven identical announcements on one bar.
- **A required picker has no empty option** (cockpit's repository chart, configr's worktree picker):
  it always shows its value, is never "active" and never offers a clear, because there is nothing to
  go back to.
- A disabled filter that is filtering still shows its value and its clear — dimmed, and the clear
  cannot be pressed.
- Keys are the APG select-only combobox: Enter, Space, ArrowDown and Alt+ArrowDown open; ↑/↓ move;
  Home/End jump; typing jumps to a label (a repeated letter cycles); Enter picks; Escape closes and
  changes nothing; Tab moves on. Focus stays on the trigger; the highlighted row is pointed at with
  `aria-activedescendant`.
- **This control needs `components.css`**: it is an enhanced select, and the select's wrapper, panel
  and rows live there. Everything else in `filters.css` works on tokens alone. Which half of the pair
  is drawn on top — the focused one above the hovered one — is `.btn-group`'s (`controls.css`).

An `<option data-icon="…">` shows its `.ico` before its label in the row and, while it is the value,
in the trigger (configr's option icons). `aria-invalid="true"` on the `<select>` is mirrored onto the
trigger, whose edge turns `--destructive` — the select itself is transparent and hidden from
assistive technology, so an error pinned to it reaches nobody.

## A long filter gets a search row — `data-search`

A **filter** (`select[data-filter]`) of more than twenty options opens with a search row (configr's
threshold); `data-search` asks for one on any select, of any length. **A plain select never gets
one unasked**, however long: it keeps the listbox keys — a typed letter jumps to the first option it
starts, Home and End move the highlight, Space picks (C8).

```html
<div class="select-panel">                              <!-- the popup; it scrolls -->
  <div class="select-search"><div class="search-field">
    <input type="search" aria-label="search label" aria-controls="dd-select-4-listbox" aria-activedescendant="dd-select-4-o3">
  </div></div>
  <ul class="select-list" role="listbox" id="dd-select-4-listbox" aria-label="label">
    <li class="select-option" role="option" id="dd-select-4-o3" aria-selected="false">label 2</li> …
  </ul>
  <div class="select-empty" hidden>no matches</div>
</div>
```

- **The row sits ABOVE the listbox, never in it.** A listbox may own only options and groups; a text
  box inside one is read as part of the list. So a list with a search row is a `div.select-panel`
  holding the row, then `ul.select-list[role=listbox]`, then the "no matches" line. The row is
  sticky and opaque, so rows scroll under it.
- **Opening moves focus into the box**, which keeps `type="search"` and carries `aria-controls` (the
  listbox) and `aria-activedescendant` (the highlighted row). Typing narrows the rows to labels
  containing the text, case-insensitively; the "all" row steps aside while anything is typed. **Once
  anything is typed, the first match is the highlight** — even when the value in force matches too —
  so "type, Enter" picks what was narrowed to. "no matches" says so.
- ↑/↓ move, Enter picks, Escape closes and hands focus back to the trigger, Tab closes and moves on
  from the trigger. Home and End move the caret, as they do in any text box. Only a press on the box
  itself takes focus; a press anywhere else in the panel leaves it in the box.
- A letter typed on the closed trigger opens the list with that letter already in the box.
- The side the list opened on is kept while it shrinks under the typing: re-choosing it would jump
  the box being typed in from one side of the trigger to the other.
- The box's own `input` and `change` never reach the page. The `<select>` announces the pick;
  nothing else should.

## A sort — `.sort-ctl` and `initSortControls()`

```html
<div class="sort-ctl btn-group" role="group" aria-label="sort">
  <button type="button" class="sort-dir" data-dir="asc" aria-label="sort descending"></button>
  <select data-sort aria-label="sort by">
    <option value="name">name</option><option value="updated">updated</option>
  </select>
</div>
```

seedr's, and configr's matches: an arrow that flips the order, joined to the field. The arrow is
`--primary` at rest — it is the action; the field beside it is a value. The select is an ordinary
enhanced select: no funnel, no clear.

- **`sortchange` is the one event to listen for.** It fires on the `.sort-ctl`, bubbling, with
  `detail: { field, dir }` (`dir` is `"asc"` or `"desc"`), once per change of either half. The page
  sorts its own list.
- **The arrow is named by what pressing it WILL do** — an ascending list's button says "sort
  descending". The arrow already shows the state.
- **To set the direction from code, write `data-dir` and nothing else**: the name follows on its own.
  That is how a page resets the direction when the field changes (configr opens `updated` newest
  first) — from its `sortchange` handler.
- A list has no `aria-sort`; a table does. **Tables keep their own column sort** in the header
  (`initTableTools()`); this control is for lists and cards.

## Several values at once — `.chip-set` of `.chip`

```html
<div class="chip-set" role="group" aria-label="tags">
  <button type="button" class="chip" aria-pressed="true">all</button>
  <button type="button" class="chip" aria-pressed="false">#agents <span class="chip-count">12</span></button>
</div>
```

pagr's tag bar and cockpit's tag and host pills: any number of values on at once. **The state is
`aria-pressed`**, and the pressed chip repeats it in fill and weight as well as colour — pagr's and
cockpit's said "on" by colour alone.

- **The page owns the behaviour**: each chip toggles; the `all` chip clears the set and is pressed
  when nothing else is; OR within one set, AND across sets.
- **An identity chip** — a host, a tag, a person, a netmon series — sets `--chip-accent` to one of the
  categorical `--cat-*` colours; hover and pressed then take that hue instead of `--primary`.
- **A chip that is a link** (pagr's static tag pages) is `<a class="chip" href>`, and the current one
  wears the pressed look on `aria-current="page"`. It navigates with no JS at all. **Never
  `aria-pressed` on an `<a>`** — a link is not a toggle, and ARIA does not allow it there. When JS
  runs and the chip starts TOGGLING a filter in place instead of navigating, it becomes a toggle,
  and says so one of two ways:

  ```html
  <!-- preferred: the page renders a button once JS is up -->
  <button type="button" class="chip" aria-pressed="true">#agents</button>
  <!-- only if it must stay a link (its href is the no-JS fallback): the role, the state, and the
       key a button answers to — Space, which a link ignores, as well as Enter -->
  <a class="chip" href="/tags/agents" role="button" aria-pressed="true">#agents</a>
  ```

  The second form needs its own keydown handler for Space (prevent the page scroll, toggle), and
  its click handler must `preventDefault()` the navigation.
- A count inside a pressed chip takes the chip's ink, not muted: `--muted-foreground` on the 12%
  fill measures 3.91:1 on warm. The weight still separates it from the label.
- A chip's resting edge is the `--border` hairline, like `.btn-terminal--ghost`: its label is what
  identifies it. Never a pill — the corners are square.
- It is a filter, not a checkbox, and not a `.segmented` choice between views.

## What is in force — `.filter-chips`

```html
<div class="filter-chips" role="group" aria-label="filters in force">
  <button type="button" class="chip chip--remove" aria-label="remove filter source: seedr"><span class="chip-key">source:</span> seedr</button>
  <button type="button" class="doc-link doc-link--forward">reset filters</button>
</div>
```

`role="group"` is what lets the `aria-label` count: on a bare `<div>` a label names nothing and is
dropped.

seedr's Browse: under the bar, one chip per filter in force, then "reset filters". **The whole chip is
the remove button** — cockpit's put an unlabelled 9px × inside a chip. Its `aria-label` says what it
removes.

- **Do not render the row when nothing is in force.** (`hidden` works too.)
- After a removal, move focus to the chip now in its place, or to the search box if none is left.
- "reset filters" is a view change, not a destruction: `button.doc-link--forward`, never red.
- A value the URL asked for and the page could not honour is a `.notice` under the row, not a chip.
- **Tables do not get this row.** A table marks a filter on its own column header (`th.is-filtered`
  and its badge): a strip above a table is a second place to look and scrolls away with a long table.

## A value that filters by itself — `.value-filter`

```html
<button type="button" class="value-filter" aria-label="filter by source: official"><span class="tag">official</span></button>
```

A tag on a card that narrows the list to that tag (seedr's source badge, pagr's in-card `#tags`).
**A real `<button>`** — configr's was a `span role="button"` no keyboard could reach — whose name says
what it filters by. It is lifted above a stretched card link so the press lands on the filter. Hover
draws a full edge on an inner `.tag`, or underlines bare text; never `brightness()`, which lightens
on the dark themes and darkens nothing on the light ones. It is never a link.

## The count and "show more" — `.result-count`, `.load-more`

```html
<p class="result-count" role="status">7 of 55 skills</p>
<p class="load-more">showing 48 of 312 · <button type="button" class="doc-link doc-link--forward">show more</button></p>
```

- **"N of M things" when filtered, "M things" when not**, plus "— K hidden by the filters" when rows
  are withheld. It is the live region, so update it once the input settles, not on every keystroke.
- **A long list shows a window and grows it** by a fixed step (seedr 48, configr 60). An
  IntersectionObserver may extend it near the end; the button is always there for the keyboard.
  After "show more", move focus to the first new item; reset the window when the results change.

## An autocomplete list

A text field whose suggestions drop down (seedr studio's slash commands) is the system's list too.
There is no runtime module: the page implements the APG combobox with a listbox popup, and the
system draws the list.

```html
<input type="search" role="combobox" aria-autocomplete="list" aria-expanded="true"
       aria-controls="cmd-list" aria-activedescendant="cmd-3" aria-label="command">
<ul class="select-panel" id="cmd-list" role="listbox">
  <li class="select-option" role="option" id="cmd-3">/review <span class="option-desc">review the current diff</span><span class="tag">user</span></li>
</ul>
```

- ↑/↓ cycle, Enter or Tab accept, Escape dismisses (and keeps the text); focus stays in the field.
  The highlighted row takes `data-active="true"`.
- Place the list with `positionPopup(list, field)`.
- `.option-desc` takes the room left in the row and is cut with an ellipsis rather than wrapping it.

## Where a popup goes — `positionPopup()`

```js
import { positionPopup } from "@danieldeusing/design/runtime";
const { side } = positionPopup(panel, anchor, { gap: 4, edge: 8, minWidth: 0, align: "start" });
```

One copy of the flip-and-clamp geometry, used by the select, the context menu and any page-built
popup. `anchor` is an element or a point `{ x, y }` in viewport coordinates (a pointer, for a
context menu). It writes, inline on the panel: `position: fixed`, `left`/`top`, `min-inline-size`
= max(anchor width, `minWidth`), and `max-inline-size`/`max-block-size` = the room the viewport
leaves, minus `edge`.

- **It opens below, and flips above only when that helps** — the list does not fit below AND there
  is more room above. A long list near the bottom of a tall page has room in neither direction.
- `align: "end"` lines the panel's right edge up with the anchor's. `side: "below" | "above"` keeps a
  side instead of choosing one — for a panel that changes height while it is open.
- It divides by a zoom on `<html>` when it writes, keeps a scrolled list's scroll position, and parks
  the panel above the viewport to measure it — never at the origin, where a pointer mid-click can be.
- A panel it places needs no `position` in CSS; `.select-panel` has none since 0.60.0, so a framework
  can put the class on its own panel and place it however its library does.

## A table's search is the same box

`initTableTools()` renders its search as a `.search-field` in a `<search class="filter-bar">` (named
after the table when the table has an `aria-label` or `<caption>`), and each text column's filter as a
`.search-field` too. `.tbl-toolbar`, `.tbl-search` and `.tbl-filter-input` are gone. It installs
`initSearchFields()` itself, so a table's clear buttons work whether or not the page called it.

## Framework apps, and a surface that loads only tokens

**seedr and configr render the same classes on their own components and keep their own keyboard
models** — never run `initSelects()` or any other enhancer over nodes React owns. State (URL params, a
store) stays the app's. The contract is the markup the runtime builds, every class of it; a framework
component renders the same classes on the same roles:

| the part | the markup |
|---|---|
| a search box | `div.search-field` > `input[type=search]` + `button.search-clear[aria-label]` — `hidden` while the box is empty, `disabled` while the box is |
| a filter, closed | `span.filter-dd.btn-group[role=group][aria-label="<facet> filter"]` > `span.select-field` (the `<select>` and its trigger) + `button.filter-clear[aria-label="clear <facet> filter"]` |
| its trigger | `button.select-trigger.select-trigger--filter[role=combobox][aria-expanded][aria-controls=<listbox id>]`, `data-active="true"` while it filters |
| the popup, no search row | `ul.select-panel[role=listbox]` |
| the popup, with one | `div.select-panel` > `div.select-search` (> `div.search-field` > `input[type=search]`), then `ul.select-list[role=listbox]`, then `div.select-empty` ("no matches", `hidden` while anything matches) |
| a row | `li.select-option[role=option][aria-selected]`, `data-active="true"` on the highlighted one, an `.ico` before the label when the option has an icon |
| an `<optgroup>` | `div.select-optgroup[role=group][aria-label=<label>]` > `div.select-group[aria-hidden=true]` (the visible heading), then its rows |
| a sort | `div.sort-ctl.btn-group[role=group]` > `button.sort-dir[data-dir]` named by the NEXT action + the field |
| several values | `div.chip-set[role=group][aria-label]` of `button.chip[aria-pressed]` |

A listbox owns only options and groups — a framework's search box goes above its listbox, not in it.

**A surface that loads `tokens.css` and `filters.css`, and nothing else, gets working controls** —
every class here declares its own box, font, edge, focus ring, disabled state and 44px touch target,
and draws itself in a forced-colours palette: each glyph in its control's forced colour, a pressed or
current chip `HighlightText` on `Highlight`, a filtering trigger's edge `Highlight`, disabled
`GrayText`. The filter dropdown is the one exception: it needs `components.css`, because it is an
enhanced select — and its search row needs `filters.css`.
