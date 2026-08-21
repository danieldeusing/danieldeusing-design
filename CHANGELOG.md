# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.43.1 (2026-08-21)

### A table with no layout box records no verdict

`measure()` read a wrapper that had never been laid out — width 0, scrollWidth 0 — as `none`,
"nothing to scroll". Tables routinely render into a hidden tab panel where every dimension is 0;
cockpit's activity tables do. So the one verdict 0.43.0 exists to stop a table asserting without
evidence was exactly the one it asserted, and the fades stayed off until something happened to
re-measure.

A wrapper with no box now leaves `data-scroll` unset. That paints nothing — chrome.css keys every
fade off a value — and, unlike `none`, claims nothing; the ResizeObserver fires when the panel is
shown and the real state lands then.

## 0.43.0 (2026-08-21)

### A table only says it scrolls when it scrolls

`.tablewrap` painted a right-edge fade on every table, always. Whether six columns were hidden
past the edge or none were, the page looked identical — so the affordance was a constant, and a
constant carries no information. Measured on cockpit's `/automation/review`: the 11-column
activity table overflowed by 41px and the 5-column ticker strip directly above it by zero, and
nothing on screen told them apart. Daniel had never found that table's `links` column; it is the
last one.

`initTableScroll()` now measures each wrapper and writes `data-scroll` on it — `none`, `start`,
`middle` or `end` — kept current through scrolls, resizes and re-renders (a column filter that
drops rows can take the widest cell with it). chrome.css paints from that: no fade on a table
that cannot scroll, a right fade when there is more to the right, and a **left** fade when there
is more to the left, which nothing could express before. `middle` paints both, because halfway
through a wide table there is more in both directions.

A wrapper with no `data-scroll` at all paints nothing. Silence is the safe way round — a fade is
a promise, and the old one was being broken on most of the tables in the estate.

### The horizontal scrollbar is visible without touching anything

macOS uses overlay scrollbars: they appear while you scroll and fade out after. So a table with
hidden columns showed no scrollbar, no gutter and no honest fade — literally nothing on screen
saying it went further right. `.tablewrap` now styles `::-webkit-scrollbar`, which is what opts
Chrome and Safari out of overlay behaviour into a permanent slim bar.

**The two scrollbar APIs cancel each other**, which is not obvious and took a measurement to
find. Setting `scrollbar-width` to anything but `auto` makes Chrome ignore every
`::-webkit-scrollbar` rule on the element — and `scrollbar-width: thin` is still an overlay
scrollbar on macOS. Declaring both, the obvious way to cover all three engines, gives back the
same invisible scrollbar you started with and looks like a fix: webkit rules alone measured an
8px permanent gutter, both together measured 0. The standard properties are therefore behind
`@supports not selector(::-webkit-scrollbar)`, which is false in Chrome and Safari and true in
Firefox.

### Note for reconcilers

`data-scroll` is runtime-owned, like `tabindex`/`aria-hidden` on a wrapped `<select>`. A patcher
that diffs its own markup against the live DOM will strip it from a hand-written
`<div class="tablewrap">` unless told not to — cockpit's `dom-patch.js` carries the exemption.

## 0.42.0 (2026-08-21)

### A pinned row outranks the sort

`data-pin` on a `<tr>` now sorts it above the rest whatever column is ordering the table, and the
pinned rows are still ordered among themselves by that column. cockpit's approvals record is the
caller: an ask still waiting on a human sits at the top and is coloured, so "nothing is waiting" is
read as the ABSENCE of a highlighted row rather than counted off a list.

It has to live in the comparator rather than in the caller. The caller renders once; this component
re-sorts the DOM on every header click, so a pin it does not know about survives exactly until the
reader sorts by something — and a marker that stops meaning anything when you touch the table never
meant anything.

### `resetTableView` could destroy the rows it was asked to restore

It re-read the rows from the DOM before resetting, unconditionally. That is right for the caller it
was written for — a page whose own clear-all re-renders first, where the rows the component is
holding are detached nodes and appending them would DUPLICATE the table (cockpit's container list
went 27 -> 54 on one click). It is silently destructive for a caller that does not re-render: a
column filter REMOVES its non-matching rows rather than hiding them, so the re-read adopted the
component's own filtered output as the full set and the withheld rows were gone. "Put the table
back" was the one action that could take it apart.

The two are now told apart by `lastWritten` — what this component itself put in the body, the same
signal the MutationObserver already uses to know its own output from a real re-render. Both
directions are asserted.

### `scripts/check-tabletools.mjs`, and two checks that were running nowhere

The saved-view behaviour moved here from cockpit in its `3bad5d6`, and the seven cases that covered
it were deleted there rather than ported — so for several releases the memory, the stale-column
guards and the reset had no test in either repo. 33 checks now cover the store round trip, a view
that outlives its columns, a rename, junk in the store, the reset reaching the CONTROLS by property
rather than attribute, and the pin above.

Only `check-pagination.mjs` was wired into CI; `check-tablescroll.mjs` had never been. Both browser
checks now run there, and both SKIP loudly where no chromium exists rather than going red for their
own reasons.

## 0.41.1 (2026-08-20)

### The 0.41.0 select/tooltip fix did not hold on a real click

0.41.0 guarded `show()` on "does a `.select-panel` exist" and hid on `pointerdown`. Neither covers
the ordering a genuine click actually produces: mousedown -> **focus** -> mouseup -> click, with the
listbox opening only on `click`. So `focusin` reaches `show()` while no panel exists yet — the guard
sees a clean document, the tip appears, and the panel opens underneath it. The `pointerdown` hide
fires even earlier, so it cannot help; the tip is re-shown after it.

It passed its test because the test dispatched `pointerdown` then `click` synthetically, skipping
the focus event a real click puts between them. Re-tested by driving an actual mouse: panel open,
tip visible, rectangles overlapping — the reported bug, reproduced.

Now a MutationObserver hides the tip when a `.select-panel` ARRIVES, rather than asking whether one
is already there. That is the only one of the three rules that is ordering-independent, and it is
what closes the bug. Verified with real clicks: panel open, tip hidden, no overlap; and hovering
after the panel closes still shows the tip.

## 0.41.0 (2026-08-15)

### A tooltip never covers an open select

The tip panel is `position: fixed; z-index: 9999` so it can never be clipped by an overflow
container; `.select-panel` is z-index 60. So whenever a listbox was open and the pointer was near a
`[data-tip]` — very often the ⓘ sitting inside the trigger's own label — the tip painted straight
over the options being chosen from.

Suppressed rather than re-positioned. A tip that flips to the other side still fights a panel that
can be full-width and viewport-tall, and "somewhere else on screen" is not a promise repositioning
can keep. While a listbox is open the choices ARE the content; an aside about the control you have
already opened is not worth one covered option.

Two halves, because there are two ways to end up overlapping: `show()` refuses while a
`.select-panel` exists, and a `pointerdown` anywhere hides a tip that is already up — which is the
ordinary path when the ⓘ is inside the trigger you just clicked. The scroll handler re-shows from
its anchor and would have put the tip back mid-scroll; `show()`'s guard refuses that too, so the
two rules do not fight.

Detected through the DOM (`document.querySelector(".select-panel")`) rather than by importing
select.js: the panel only exists while open, so its presence IS the state — no shared variable, no
import cycle, and it stays correct for anything else that renders a `.select-panel`.

## 0.40.0 (2026-08-19)

### `resetTableView` re-reads the rows before applying

A page with its own clear-all usually re-renders as part of it, so the rows held from the
last apply can be detached by the time the reset runs. Appending those on top of what the
page has just drawn duplicates the table — cockpit's container list went from 27 rows to
54 on one click.

## 0.39.0 (2026-08-19)

### `resetTableView(table)` — for a page that owns a "clear all"

cockpit's container list has one, beside its host and tag chips, and those are page-level
filters this component knows nothing about. With no way to reach the column filters, that
button would clear three of the four things in force and leave the fourth — a control
that lies about what it did.

This is **not** the reset button removed in 0.33.0. That was the component putting its own
affordance on every table; this is a page that already has one asking to be included.

## 0.38.0 (2026-08-19)

### A card has padding

`.card-terminal` had none, so every card in the estate put its content flush against its
own border. Each surface was free to add its own and most did not — the same drift the
one-size type scale was introduced to end. A card is a box with something in it, and the
gap between the box and the something is the card's business rather than the caller's.

`0.85rem 1.1rem`, in rem so it tracks the root font size: on a 4K screen the breathing
room grows with the text it is holding off the edge. No surface redeclared
`.card-terminal`, so nothing double-pads.

### `data-filter="none"` — sortable, but not filterable

A real kind of column rather than an oversight. cockpit's `duration` is the case: a filter
box matching `1m 30s` filters on the formatting rather than on the length, so the column
offers ordering only. Opting it out of `data-col` entirely would take its sort away with
its filter — which is precisely the regression that appeared when cockpit's shared engine
was first wired, quietly making every duration column unorderable.

## 0.37.0 (2026-08-19)

### `data-sort-value` — when a column filters on one thing and orders by another

`data-value` served both filtering and sorting, which is right until a column wants them
to differ. cockpit's tables are full of columns that do: `duration` filters on `1m 30s`
(what the reader sees and types) and must order on the millisecond count, or `9s` files
after `10m`; `ref` filters on the branch *and* the PR number but orders by the branch
alone.

`data-sort-value` overrides ordering only, falling back to `data-value` and then to the
cell's text. A cell needing neither still says nothing.

## 0.36.0 (2026-08-19)

### The filter badge quotes the reader's own casing

A filter value is stored lower-cased because that is what matching needs, and the badge
printed it back verbatim — so picking `Cash` from the dropdown produced a badge reading
`cash`, and `Sicredi · Daniel` came back mangled. The badge now shows the option's own
label for a `pick` column, or exactly what was typed for a text one.

## 0.35.0 (2026-08-19)

### `tbl:applied` — so a page's own row count cannot contradict the table

A page that prints its own "N of M" computes it from its own filtering and cannot see a
column filter applied here, so the line goes stale the moment one is used. Both family
pages do this: the contacts book's "6 of 1167 · 1036 quiet hidden" and the ledger's
"N of M rows · net €X".

`initTableTools()` now dispatches `tbl:applied` on the table after every apply, with
`detail: { shown, hidden, total }`. A page that keeps its own count listens and rewrites
it; a page that does not is unaffected.

## 0.34.0 (2026-08-19)

### The filter badge sits on the label's line

A narrow column wrapped the badge underneath its label and made that one header
taller than its neighbours, which reads as a layout fault rather than as state.
`th:has(.tbl-tools)` no longer wraps, so the column takes the width its header needs;
the badge is capped at 7rem with an ellipsis, so that width stays bounded.

## 0.33.0 (2026-08-19)

### An active filter marks its own column — the `.tbl-view` bar is gone

0.30.0 put "what is in force" in a strip above the table, promoted from cockpit's
`.act-view`. Daniel rejected it, and the objection is right: a separate strip is a
second place to look, it costs a line of vertical space on every filtered table, and
it prints `relationship = family` a long way from the relationship column.

A filtering column now marks itself — the header takes the primary colour and an
underline, and carries a **badge with the selected value**. The badge is a button that
clears that column's filter, so the way back is attached to the thing it undoes rather
than parked at the end of a strip. The header also cannot be scrolled off a long table,
which the bar could.

`.tbl-view`, `.tbl-view-lead` and `.tbl-view-chip` are removed along with the reset
button; `th.is-filtered` and `.tbl-badge` replace them. The badge and its underline
print, because a silently filtered table on paper is the same failure with no way to
interrogate it.

## 0.32.0 (2026-08-19)

### `data-table-search="off"` — for a page whose own search is richer

`initTableTools()` always added a search box over every column's rendered text. That is
the wrong trade where a page already searches something the table does not show: the
contacts book greps a haystack built from descriptions and conversation summaries, so
replacing its box would silently stop finding a thing that was *said*. Two search boxes
over one table is worse than either.

`data-table-search="off"` suppresses the built-in box and nothing else — per-column
filters, sort and the view bar are unchanged, and the bar then never claims a search it
has no field to show.

## 0.31.0 (2026-08-19)

### The table tools survive a re-render, and a detail row follows its parent

0.30.0 shipped `initTableTools()` against static markup. Every table in this estate
that is worth filtering is not static: the contacts book does
`contact-rows.innerHTML = …` on each keystroke, cockpit patches its automation tables
in place behind a 30-second poll. A component that snapshotted its rows once held a
list of detached `<tr>`s after the first repaint and silently filtered nothing.

**Re-render resilience.** The table is observed; when the rows are not the ones we
last wrote, they are re-read and the view re-applied. The guard is an IDENTITY CHECK
against that last write, not a flag — `MutationObserver` delivers asynchronously, so
a synchronous "I am applying" flag is already cleared when the callback runs. The
first version used a flag and hung the page.

**`data-row-for` / `data-row-key`.** An expandable table puts a second `<tr>` under
the one it belongs to. Treated as data it gets filtered on its own text and sorted
away from its parent, which is how a detail panel ends up under a stranger. A child
row is now excluded from matching and sorting and simply follows its parent; an
orphan is left as ordinary content rather than deleted over a typo.

**A `pick` list tracks the data behind it.** Its options are derived from the
column's own cells, so they are rebuilt when those cells change — and only when the
set actually differs, so an open dropdown is not torn away on every poll.

### Fixed

- The column label excluded the controls injected into the same `<th>`; the view bar
  had begun reading `sorted by name↕⌕ ▼`.
- Column objects rebuilt on a re-render lost their control references, so the header
  showed `aria-sort="ascending"` while the button still wore the neutral glyph.

## 0.30.0 (2026-08-19)

### A table has a search, a filter and a sort — and says which are on

`initTableTools()` plus one `data-table-tools` attribute gives any table a search box
above it, a sort control and a filter dropdown **in each `<th>`**, and a `.tbl-view` bar
naming everything currently in force with a `reset view` button.

**Why this is in the system and not in a page.** Every surface had been growing its own.
cockpit's `table-view.js` opens by explaining that `cockpitTable` "is copied into four
pages and has drifted into three generations"; the family contacts table grew a bare row
of filter boxes because nothing said what a table should look like. Consolidating inside
one surface fixed it for that surface. This is the same move one level up — and the
storage key is deliberately cockpit's own (`table-view:<id>`), so a reader's saved views
survive the migration.

**The filter row is replaced, not restyled.** A `<tr class="filters">` spends a whole row
of vertical space advertising a capability that is idle on most visits, and reads as a
form to fill in. Two controls in the `<th>` cost nothing unused and sit on the column
they act on. The dropdown is the system's own `details.dropdown`, so one-open,
click-away and Escape come from `initDropdowns()` and are not reimplemented.

**It composes with the pager rather than fighting it.** `pagination.js` pages by setting
`hidden` on out-of-window rows; if filtering also used `hidden` the two would overwrite
each other. A filtered-out row is instead DETACHED from the tbody, so the pager sees
exactly the matching set — the arrangement it already documents ("filter and sort produce
the rows, the pager slices them") — and needs to know nothing about this file.

**Two behaviours inherited from cockpit's engine, both load-bearing.** A stored view is
normalised against the columns that exist *today*, because localStorage outlives the
code and a remembered sortKey naming a renamed column would otherwise throw where the
table should be. And the bar is derived from the view's deviation from the table's
defaults, never from "was this restored" — a restored-only marker vanishes the moment the
reader touches a filter, while the filter is still in force.

**A blank cell sorts last in BOTH directions.** Caught by the fixture, not by review: the
direction multiplier was being applied outside the comparator, which inverted the blank
rule along with everything else and put every blank row first when sorting descending.

### Also

- Three table rules added to the skill: when a table is the right shape at all, that
  every table gets all three controls from the system, and that what is in force must be
  visible with a way back.

## 0.29.0 (2026-08-19)

### Wide screens scale in CSS now, and `zoom` is gone

`initResolutionZoom()` laid every page out against a 1920px reference and applied
`html.style.zoom` above it. That is replaced by one declaration in `tokens.css`:

```css
font-size: max(1rem, calc(1rem + (100vw - 1920px) / 120));
```

**Nothing changes size.** Above 1920 the expression reduces to `100vw/120`, which is
exactly `16px * innerWidth/1920` — the curve `initResolutionZoom` drew. Verified live at
1280, 1920, 2560, 3440, 3840, 5120 and 7680: the computed root font size matches the old
zoom factor at every one, and `--content-w` stays 65% of the screen throughout.

**Why it changed.** `zoom` scales the coordinate *space*, leaving the page with a pixel
grid that no longer matches the browser's. Anything injected into the document from
outside — a password manager, a translation bar, any extension overlay — measures a field
through the browser's grid and writes the answer back into the page's, where it is
multiplied a second time. Measured on the family login page: 1Password's dropdown landed
1.9x down and across from the field it belonged to, on a window whose zoom factor was
1.89. The estate had already paid for this three times inside this runtime —
`tooltip.js`, `lsnav.js` and `select.js` each divide by the zoom before writing a length.
Scaling the unit instead of the space removes the second grid, so there is nothing left
to compensate for.

**The rule lives in `tokens.css`, not `base.css`,** because netmon loads `tokens.css` plus
its own frozen `chrome.css` and never sees `base.css`.

**The `1rem` term is load-bearing.** On the root element `rem` resolves against the
browser's default font size, so a reader who has set a larger default still gets it, and
browser text zoom keeps working (WCAG 1.4.4). A bare `100vw/120` would be pixel-exact and
silently override both.

### Migrating a surface

This release is **not breaking**. `initResolutionZoom()` is still exported and is now a
no-op, so a pin can be bumped before the `<head>` is touched.

**But delete the inline zoom IIFE in the same commit as the pin bump.** A page that still
assigns `document.documentElement.style.zoom` while loading 0.29.0 scales TWICE — once
geometrically and once through the root font size.

The three `zoom`-compensating divisions in the runtime are deliberately **kept**: they
resolve to 1 once no consumer sets zoom, and they remain correct for a surface that has
not migrated yet.

### Also

- `templates/page-chrome.html` no longer carries a pre-paint zoom block.
- `print.css` keeps `zoom: 1 !important` for un-migrated surfaces; its `font-size: 16px`
  pin is what neutralises the new fluid scale on paper.

## 0.28.1 (2026-08-15)

### A note between a heading and its table gets the same gap the table would have

0.28.0 gave `h2 + p` and `h2 + table` a 0.6rem gap, and missed the shape that sits between them:

```html
<h2>spend by category</h2>
<p class="comment">Trailing twelve months.</p>
<table>…</table>
```

`p + table` had no rule, the reset zeroes every margin, and the note rendered flush against the
table — measured at 0px on the family financing page, which worked around it with a private class
of its own. A surface inventing a gap in private is the exact drift 0.28.0 was written to remove,
so the rule belongs here rather than there.

Not scoped to `.comment`: the shape is "an explanatory line, then the thing it explains", and the
class the line happens to carry is not what makes that true. Zero specificity like the rest of the
block, so any surface that already had an answer keeps it.

## 0.28.0 (2026-08-15)

### Sections have a gap. It is the system's now, not each surface's.

Daniel, on the family financing dashboard: *"We need more space between sections."* The page was
right to look cramped — it had no section spacing at all, and neither did this package.

`reset.css` sets `* { margin: 0 }` and nothing ever put heading spacing back. So every surface has
been inventing its own answer in private: cockpit carries `section.doc { margin-top: 2.5rem }` and
`section.doc h2 { margin: 0.3rem 0 0 }` in `portal.css`, and the family site had nothing whatsoever.
Two surfaces, two answers, and the difference is invisible until they are opened side by side —
which is the exact drift this package exists to remove.

**New token `--space-section`, default `2.5rem`.** Cockpit's existing value, promoted rather than
invented, so the surface that already had a considered answer does not move a pixel.

**New rules, all at specificity ZERO.** Every selector is wrapped in `:where()`, which is what makes
this safe to add to a package five surfaces already depend on: any declaration a surface already
carries beats these outright, with no `!important` and no load-order argument. Nothing that had an
answer changes; only surfaces that had none gain one.

- `section + section` and `section.doc` get `--space-section` above them
- `h2` gets `--space-section`, `h3` gets 60% of it — but never as the first child of its container,
  where the container's own spacing already provides the gap and doubling the two is the usual
  reason a first section sits oddly low
- a `p`, `table`, `.tablewrap`, `svg` or `.legend` directly after a heading gets `0.6rem`, because
  content belongs to the heading above it — the rhythm is BETWEEN sections, not inside them

If your surface still declares its own section or heading margins, it is now a fork: delete it and
take the token, or retune `--space-section` locally if that surface genuinely needs a different
density.

## 0.27.0 (2026-08-11)

### One size for text. The four that were one pixel apart are gone.

Daniel, looking at a repository card in cockpit: *"why in details we have different font sizes?
Actually why in cockpit we have different font sizes at all for text (title okay)"*. That card was
rendering text at **10.2px, 10.8px, 10.88px, 11px, 12px and 13px at once**, measured in a browser.

**BREAKING: `--fs-xs`, `--fs-sm` and `--fs-md` are removed.** Not renamed, not aliased — a
compatibility alias would have kept every existing near-miss working and changed nothing. Anything
that used them wants `--fs-base`.

The scale had four steps for text at **10 / 11 / 12 / 13px**. That is not a hierarchy: differences
that small cannot be told apart on sight, so nothing ever *chose* between them — each surface picked
whichever felt right when it was written, and 578 hand-rolled `font-size` declarations grew across
the estate while every conformance check passed, because none of them had an opinion about type.

The fix is not discipline, it is removing the choice. With one text size there is no near-miss to
pick and `font-size` stops being a decision anybody makes while writing a component. What survives
is the part that genuinely is a hierarchy — three heading steps, each a clear jump rather than a
nudge. Something that must read as quieter than body text uses `--muted-foreground` and weight:
colour separates a label from its value far better than one pixel, and it keeps working at any zoom.

### The table rule was the loudest instance, and its own comment said so

`base.css` set `table { font-size: var(--fs-md) }` — 13px — directly under a comment reading *"A
table cell is body copy … so it takes the body-copy step"*. The comment and the code had disagreed
since the rule was written, and the comment was the one telling the truth. Every table in the estate
therefore rendered one step **louder** than the body around it; in a cockpit form row that put cells
at 13px beside an 11px label, so the caption read as a footnote to the data it introduced.

### Also

- The system's own 14 hand-rolled text sizes are now `--fs-base` (`.prompt`, `.tab`, `.legend`,
  `details.fold`, `.eli5`, `.dgm-btn`, `.ticktable`, `.ls-perm`, the tooltip bubble, the mobile nav).
- Five sizes deliberately stay hand-rolled and now say why inline (`/* not-text: … */`): four glyph
  pseudo-elements (`ⓘ`, `⤢`, the ELI5 marker, the tickstrip edge marker) and the wordmark. A glyph
  is sized against its own drawing, not as typography.
- `print.css` keeps its own scale — paper is a different medium and was always deliberate.
- The Tailwind bridge drops `--text-fs-xs`, `-sm` and `-md` with the tokens behind them.

## 0.26.0 (2026-08-11)

### Text inputs finally have a declaration, and every control is one height

Daniel: *"select should have the same height as input fields (everywhere) ... it might be better to
increase the height of the input instead of decreasing the height of the selects. Like this it would
also fit with the buttons."*

**The asymmetry was the bug.** This file styled `select` and said **nothing whatever about `input`** —
zero rules. So every consumer hand-rolled its own box (cockpit's `.cfg-in`, redeclared per page: the
same five-copies-that-disagree shape the select rule was itself written to end), and any input
*without* that class fell straight through to the user agent's default.

Measured on the built stylesheet, warm theme, before this release:

| control | height |
|---|---|
| `select` / `.select-trigger` | 25.23px |
| `.cfg-in` (cockpit's hand-rolled input) | 25.22px |
| **`input[type="search"]`** — every column filter in every cockpit table | **24.00px** |
| `.btn-terminal--compact` | **27.44px** |

Three heights for controls that sit on one row, and the widest gap was on the one control nobody had
declared. The button is now the reference and the controls rise to meet it (`padding-block` 0.28rem →
0.35rem on the closed select, and the same box on text inputs), rather than the button shrinking — a
filter box, a dropdown and a `refresh` button share a row constantly.

**Type-scoped, never bare `input`.** A bare selector would catch checkboxes and radios, and the estate
is full of them — every repository row on cockpit's `/automation/config` carries one. Handing those a
padded 27px box would not be a restyle, it would be a broken form. Only the types that render a text
field are selected, plus `:not([type])`, which is a valid text input. `textarea` takes the box but
keeps `--lh-base`: `--lh-tight` is for single-line chrome, and multi-line prose at 1.3 is unreadable.

The edge is the same 60%-of-`--foreground` the select already used, for the same measured reason —
`--border` is a container hairline and misses WCAG 1.4.11's 3:1 for a control edge on all four themes.

**Consumers get this by loading 0.26.0**; no markup changes. Cockpit's per-page `.cfg-in` copies are
now redundant and should be deleted in the adopting pass rather than left to disagree again.

## 0.25.0 (2026-08-11)

### The tooltip marker is an ⓘ, never an underline

Daniel: the estate already had an info icon for this, so the underlined text is redundant — use the
icon everywhere and never the underline.

`span[data-tip]`, `th[data-tip]` and `button[data-tip]` now render a muted ⓘ from `::after`. It
replaces the dotted `border-bottom`, which was the wrong signal twice over: an underline is the
web's mark for a LINK, so a dotted one reads as a link that is broken or disabled, and it disappears
entirely in a table header or against a busy row — which is exactly where these tips live.

**No consumer had to change.** The marker is `::after` rather than markup, so all 154 existing
`data-tip` call sites across cockpit, netmon, docs and danieldeusing.de gained the icon by loading
this release. Three hand-rolled ⓘ in cockpit (`automation-config`, `automation-cicd`,
`automation-review`) were deleted in the same pass — they were the estate arriving at the right
answer locally, and leaving them would have rendered two glyphs.

Opt out with `data-tip-bare` for an element that is already its own affordance — a minimap bar jumps
to a section, a chart segment names a series, and neither is an invitation to hover for prose.
`.minimap-bar` opts out by name. Print drops the glyph, as it dropped the underline: paper cannot be
hovered.

## 0.24.0 (2026-08-11)

### A hover is `data-tip`, and the native `title` is gone from the estate

Daniel: use the custom hover everywhere, never the system one. A `title` waits about a second before
appearing, is unstyled, is unreachable by keyboard on most engines, and **does not exist at all on a
touch screen** — cockpit is read from a phone over the tailnet, so there the explanation was simply
gone. 108 native titles in cockpit and 3 in netmon were converted in one pass.

**`title` does two unrelated jobs, and the conversion is not a rename.** On an element with visible
text it is a description (`data-tip`); on an icon button with no text it is the accessible NAME
(`aria-label`). `.anim-toggle` was the second kind on 35 pages with no `aria-label` at all, so a
blind rename would have left 35 buttons announced as "button" — a silent accessibility regression
that reads as a tidy-up in the diff. `templates/page-chrome.html`, where all 35 came from, now
carries both.

- **`initTooltips()` sets `aria-describedby` on the anchor while the panel is open**, and removes it
  on hide and when moving between anchors. `role="tooltip"` alone describes nothing: the panel was a
  div no screen reader reached, so `data-tip` was announced to nobody while the `title` it replaces
  IS announced. Without this, converting an estate from `title` to `data-tip` — the entire point of
  the component — trades a slow tooltip for a silent one.
- **`initSelects()` carries an `<option>`'s `title`/`data-tip` onto its rendered `.select-option`.**
  The panel replaces the native option list, so per-option explanations were unreachable in either
  attribute; every one written so far had been doing nothing. Same reasoning the trigger's own copy
  has always stated: a tooltip anchored to something nobody can hover never shows.


jsDelivr serves the committed `dist/` bundle per git tag, so every release is cut as an
immutable tag (`vX.Y.Z`).

**Which url a consumer loads depends on whether its MARKUP is coupled to a release.** Daniel's
call, 2026-08-05, was "make all unpinned" — one design system, every surface on the current
version. That holds for surfaces that consume only tokens and visual identity (netmon, the docs
site, the seedr playgrounds, pagr-docs, morning-briefs): a stale cached stylesheet there just
means slightly older colours, never a broken page.

**It does NOT hold for a surface whose markup requires a specific release, which must PIN.**
Learned the hard way the same day: cockpit 2.65.0 shipped the `.ls-nav` rail markup while
loading the unpinned url — and jsDelivr serves that url with `max-age=604800`, **seven days in
the browser**. Every browser that had opened cockpit that week kept applying 0.1.6, which
predates the rail, so the new markup rendered against CSS that had never heard of it: both
toggles visible, the rail in flow, a 613px header. A release cannot fix that, because the url a
release publishes to is the one being cached — only changing the url does. Cockpit is therefore
pinned and bumps its pin with each adoption.

Either way: a publish is instantly live on every unpinned surface with no staging, so **look at
them after publishing**, and keep new CSS backward-compatible with the markup consumers still
ship (0.2.0's `html:has(.ls-nav)` guard is the worked example).

## 0.23.0 (2026-08-09)

### Fixed — the scroll wrapper never reached the tables that are actually too wide

Daniel: *"we still have the issue that when a table does not fit, we cannot scroll the table in x
direction."*

`initTableScroll()` has shipped since 0.7.0 and its contract was right: a table wider than the
page should scroll ITSELF, because a page that scrolls sideways reads as broken — the header
slides off, the fixed footer stops reaching the edge, and body text needs two axes. What it
actually did was walk the document **once, at call time**.

That covers exactly the tables that do not need it. A static page authors its tables in the
markup, so the walk finds them; the docs site and the infrastructure reference pages have worked
this whole time. **Every table that is genuinely too wide is on a dashboard, and a dashboard's
tables arrive from a fetch** — after the walk has finished. Cockpit calls this from a deferred
module during page load, while every mount still reads `loading…`: the walk found nothing, the
tables appeared unwrapped a moment later, and stayed that way for the life of the page. Measured
in a browser at 375px, the whole document scrolled sideways
(`documentElement.scrollWidth > clientWidth`) — the precise failure the function exists to
prevent, in the feature that prevents it.

Sixteen releases, and it looked like a working capability the whole time, because the surfaces
where it works are the ones you look at first. `initSelects` (0.21.0) and `initTablePagination`
(0.22.0) had both already hit this and both answered with a MutationObserver; this is the third
and the answer is the same one. The markup contract is unchanged — author a plain `<table>` —
and the guard that made re-calling safe (`table.closest(".tablewrap")`) is what stops the
observer waking on its own output.

**A reconciler has to know about the wrapper, and this is the part to carry across if you build
another consumer.** A wrapper the runtime inserts appears in no renderer's markup, so an
in-place patcher that diffs markup against the live DOM sees a `<div>` where its markup says
`<table>` and replaces it — destroying the table, its row listeners and every half-typed filter
on every poll, after which the runtime wraps the replacement and the next poll does it again.
That is worse than a table that does not scroll. Proven in a real browser rather than argued:
with cockpit's `dom-patch.js` unmodified, a second patch left `first === second` false and a row
listener dead. The fix is one rule — `.tablewrap` STANDS IN FOR the table inside it, for its key,
its kind and as the node actually patched, and only against an incoming `<table>`, so a renderer
that writes its own wrapper is untouched. Cockpit carries it beside the two exemptions it already
had (`open` on a `<details>`, `hidden` on a `<tr>`), all three saying the same thing: the
renderer does not own this.

New: `scripts/check-tablescroll.mjs`, which drives a headless chromium over the DevTools protocol
with no dependency and no stub DOM. MutationObserver, `closest()` and live child lists are the
subject here, so a hand-written fake would only assert that the fake behaves. Six of its nine
checks were red against 0.22.0. It skips loudly when the machine has no browser.

### Fixed — the scroll fade blended to the page even when the wrapper sat on a card

`--tablewrap-fade`, read by `.tablewrap::after` and defaulting to `--background` as before. The
fade exists to say "there is more over here", and it painted `--background` wherever the wrapper
sat: on a `--card` surface that is a 1.5rem bright band, and it paints whether or not the table
can actually scroll. netmon had already found this and was carrying `.card .tablewrap::after` as
a private override; that is now a value the surface sets rather than a rule it re-declares.

CSS cannot ask "am I scrolling?" portably — `container-type: scroll-state` is Chrome-only, and a
fix that lands on one engine leaves the estate disagreeing with itself, the same reason
`appearance: base-select` was refused in 0.21.0.

`.tickstrip` sets it for itself, because from this release the runtime wraps the strip's table
too. That is wanted — `.ticktable td` is `white-space: nowrap`, so between 40rem and roughly
900px the strip really can be wider than the page — and without the token it would have put a
pale band down the right edge of a `--card` box on every page in the estate.

## 0.22.0 (2026-08-08)

### Added — a long table shows 20 rows, and sorting still sorts all of them

Daniel: *"All tables should be paginated to 20 entries. Sort/Filter and stuff should obviously
work still fine and not only to the shown 20 entries."* And: *"Give each table also the options
to switch between 5, 10, 20, 50, 100, 200 entries per page, but default 20. A selection should be
remembered for each table in localStorage."*

`initTablePagination()` pages every `<table data-table-id>` and remembers the size per table.

**The order is filter, then sort, then slice, and it is guaranteed by construction rather than by
care.** The natural wrong build of this cuts the data to twenty rows and wires the sort and the
filter to what is on screen — a table that reorders page 1 while the actual newest row sits on
page 3, and whose filter finds nothing because the match was never in the slice being searched.
It looks correct on the first screen, which is why it ships. **This component cannot express that
mistake: it has no sort and no filter.** It reads a `<tbody>` that something else has already
produced — and the only way rows get into a tbody is after that something has filtered and sorted
the full set — then hides all but one window of them. Slicing last is not a rule to remember here;
it is the only thing the code is able to do, so a page keeps its own sort and filter and needs no
edit to gain paging.

**Turning the page sets `hidden` on rows and clears it on twenty others. No markup is rebuilt.**
That matters past speed: cockpit patches its tables in place so a background refresh cannot
destroy half-typed input, focus, or an opened `<details>`, and a pager that re-rendered on every
page change would hand all of that straight back.

- **`data-table-id` is required, and a table without one is left completely alone.** The obvious
  alternative — page path plus the table's index on the page — is a bug with a delay on it: add a
  table above another one and every reader's "100 per page" silently becomes a different table's
  setting, with nothing to notice. Missing ids are reported to the console **only when the table
  was long enough to have been paged**; a warning on the forty short reference tables in the
  estate is noise that teaches people to ignore the console.
- **The controls appear only when they can do something** — more rows than fit, or a non-default
  size in force. That second clause is not decoration: without it, picking 100 on a 30-row table
  removes the very control that was just used and there is no way back to 20.
- **The size picker is a bare `<select>`.** `initSelects()` (0.21.0) enhances it like any other,
  including this one, which is created long after page load. The whole bar invents nothing: the
  two buttons are `.btn-terminal--ghost.btn-terminal--compact`, the same pair every refresh and
  cancel in the estate already wears, so there is no new colour and nothing to keep in step. The
  status text is `--muted-foreground`, 4.84:1 at worst (warm over `--card`).
- **A stored size is untrusted input** — the store is shared with every other tab, every older
  build and anyone with a console. `"abc"`, `999`, `""`, `25` and an object all fall back to 20,
  and localStorage throwing outright (Safari private mode) falls back too rather than refusing to
  render the table.
- `tr[hidden] { display: none !important }` in `base.css`, because the UA's own one-attribute
  rule loses to anything that sets `display` on a row — and the estate has such a rule, in a
  narrow-screen media query that restacks key/value tables. A `hidden` that loses to a stylesheet
  is still exposed to a screen reader, so the table would have announced rows nobody could see.
- `scripts/check-pagination.mjs` (wired into CI) asserts the window covers the set exactly once,
  clamps an out-of-range page instead of blanking the table, and stays idempotent — which is what
  makes the MutationObserver watching those rows unable to wake itself. Its three named cases are
  the brief's: a filter matching only a row on page 3 shows it, a descending sort puts the true
  global maximum on page 1, and paging never invents, drops or reorders a row. Verified against
  three mutants (off-by-one `from`, no junk guard, non-idempotent write); each is caught.

### Added — `.btn-terminal--edit`, the same icon button as the bin in an ordinary colour

Daniel, with a screenshot of two wide `edit →` text buttons: *"edit button should simple edit
icon, such as trash for delete."*

`edit →` was a word and an arrow in a cell next to a bin that is 22px square — two controls doing
the same job in one column, one four times the width of the other. At 375px the label broke
mid-word into "edi / t →", which cockpit had propped up with a `white-space: nowrap` rule.

- **Not destructive, and it must not borrow that colour.** Editing is an ordinary action; red is
  reserved for the press that cannot be taken back. The class carries **no colour at all** —
  compose with `--ghost` and it is `--primary` on a `--border` outline like every other secondary
  control (6.23 / 15.18 / 20.38 / 20.12 against `--background` on warm / green / mono / paper;
  5.59 at worst, on warm over `--muted`).
- **The glyph is a CSS mask painted with `currentColor`**, exactly as `--destructive` does it and
  for the reason its comment gives: a pasted SVG is one `fill=` that is wrong on two themes, once
  per surface that adopts it. A mask re-takes the composed colour on all four for free.
- Carries `::before { content: "" }` (the `> ` prefix would be the button's entire text content)
  and the `@media (pointer: coarse)` `min-*` growth to 44px.
- **`aria-label` is mandatory and must name the target** (`aria-label="edit poi/vu3"`), not repeat
  the verb — otherwise a column of these is a dozen identical announcements.

### Added — `.btn-terminal:disabled`

The button had no disabled state while the select beside it did, so a control row could show a
greyed dropdown next to a fully-lit button that does nothing when pressed. `opacity: 0.45;
cursor: default`, matching `select:disabled`. Declared **below** the hover rules: both are
(0,2,0), so source order settles it, and above them a disabled button would light up under the
pointer. Only the opacity is touched — setting `background: transparent` would strip a disabled
primary button to invisible text.

## 0.21.0 (2026-08-08)

### Added — the estate's own dropdown, because a native one's list belongs to the OS

Daniel, with a screenshot of a macOS select popup sitting in the middle of a terminal UI —
rounded corners, a blue system highlight, the system font: *"for all dropdowns we want to have
custom dropdown style, not system style."*

**No stylesheet has ever been able to fix that.** A `<select>`'s option list is painted by the
operating system, outside the document. Every surface in the estate could style the closed
control and none of them could touch the open one, which is why the estate contained **five
separate copies of a `.cfg-sel` rule** — in `automation-config`, `automation-review`,
`automation-execution`, `automation-cicd` and `docs` — all of them styling the one part that was
never the problem, and disagreeing about `:disabled` while they did it.

`appearance: base-select` would fix it in Chrome 135+ and nowhere else. Taking it would leave
Safari and Firefox on the system menu, so the estate would be **inconsistent with itself** —
strictly worse than being consistently wrong, because a reader can learn one look and cannot
learn two. So the list is rebuilt in the page instead, and the browser support accepted is
everything that has `MutationObserver` and `color-mix()`.

**The `<select>` stays, and stays authoritative.** It is not cloned into hidden inputs and not
replaced: it is still the element that holds the value, that a form submits, that `select.value`
reads and that emits `input` then `change`. That is the whole reason 28 call sites adopted this
with **no page edits** — a page script sees exactly the events, in the order, with the
`event.target`, that it saw from the native control.

`initSelects()` enhances what is on the page **and keeps enhancing**: cockpit rebuilds its config
tables out of `innerHTML` on every poll, so a widget that snapshotted the options once would work
until the first refresh and then quietly serve a list from before the last fetch.

Three things were measured rather than eyeballed, and each changed the design:

| | warm | green | mono | paper | |
|---|---|---|---|---|---|
| `--border` vs `--background` — why the control's edge is **not** `--border` | 1.37 | 2.00 | 1.61 | 1.42 | all fail 3:1 |
| the estate's hand-rolled `currentColor 30%` edge | 1.70 | 1.92 | 2.06 | 1.86 | all fail 3:1 |
| **`--foreground` 60%**, the first step that clears it on all three surfaces | **3.24** | 4.52 | 5.19 | 4.18 | ✓ |
| `--primary` vs `--popover-foreground` — selected ink beside ordinary ink | **1.65** | **1.31** | **1.48** | **1.27** | unusable |
| disabled option at 55% / at **65%** | 2.94 / **3.75** | 3.99 / 5.18 | 4.53 / 5.93 | 3.64 / 4.86 | 55% fails warm |

The middle row is the one that decided the component's look. **The selected option cannot be
marked by colour** — `--primary` against `--popover-foreground` is 1.27:1 on paper, two inks
nobody can tell apart. Same finding as the rail's current row in 0.19.0 and the same answer:
position and area. The selected option is the only one with a left edge marker, and it is bold;
the colour is the third signal rather than the only one.

`--border` is a *container* hairline and is correct for the cards it was made for; a control's
edge is what says "this is a control", which WCAG 1.4.11 puts at 3:1. Mixed with `transparent`
rather than with a surface, so it composites correctly on `--background`, `--card` and `--muted`
alike, and derived from a token so it stays per-theme without a fourth declaration.

Accessibility is the ARIA APG select-only combobox, driven with real key events in headless
Chrome rather than asserted: Enter/Space/Arrow open, Up/Down move (skipping disabled options),
Home/End jump, printable characters type ahead with a repeated character cycling as a native
select does, Enter selects, Escape closes and changes nothing, Tab moves on. **Focus never leaves
the trigger** — the active option is pointed at with `aria-activedescendant` — so there is nowhere
for a keyboard user to get stuck, and Escape both `preventDefault`s and `stopPropagation`s so
dismissing a list inside a modal `<dialog>` does not close the dialog and lose the form.

Three implementation notes that are load-bearing rather than incidental:

- **The panel is `position: fixed` and appended out of the flow** — to the nearest open
  `<dialog>` when there is one, `<body>` otherwise. Both halves are needed here: cockpit's selects
  live inside `.tablewrap`, which scrolls and therefore clips, and inside modal dialogs, which are
  a top layer nothing outside can paint above.
- **Positioning divides by the html `zoom` on the write, and only on the write.** Third time in
  this runtime after tooltip.js and lsnav.js: rects and `innerWidth` are visual px, already
  multiplied, while `style.left` is a CSS length the browser multiplies again. Verified at zoom
  1.35 — a trigger at visual x 21.59 gets `style.left: 15.9954px`, and 15.9954 × 1.35 = 21.59.
  The panel's `min-width` comes from `offsetWidth`, which is *already* a layout length and must
  **not** be divided; mixing the two spaces in one function is the trap.
- **The real `<select>` is transparent and laid over the trigger, never `display: none`.** Chrome
  refuses to show a validation bubble on a control it cannot focus and then blocks the submit with
  no message at all, so hiding it properly would have silently broken every `required` select.

`.select-panel` joins the screen-only chrome hidden by `print.css`.

## 0.20.0 (2026-08-08)

### Changed — the rail's permission column sits behind the name instead of beside it

Daniel: *"the folder info should also be in some grey style color so that it does not have the
same color as the path/folder name."*

The rules looked correct in the source — `.ls-perm` was `--muted-foreground`, a directory name is
`--primary` and bold — so this was measured before it was changed. Measured, it was worse than it
reads:

| contrast, `.ls-perm` vs the name beside it | warm | green | mono | paper |
|---|---|---|---|---|
| leaf row, **before** | **1.00** | **1.00** | **1.00** | **1.00** |
| directory row, **before** | **1.20** | 2.34 | 3.45 | 3.00 |

**The leaf row is the severe case and it is not what was reported.** `.ls-perm` and
`.ls-panel .ls-name` both resolve to `--muted-foreground`, so on every theme `drwxr-xr-x` and the
page name were literally the same ink — a ratio of exactly 1.00 — and most rows in a rail are
leaves. It survived review because the two declarations name different rules and only agree once
the tokens are substituted.

On the **directory** row the warm theme then compounds it: `--muted-foreground` `#71614e` beside
`--primary` `#8a4516` is a brown-grey next to a brown at 1.2:1, which the eye reads as one colour
however different the hexes are. That is the specific thing that was reported, and it is a warm
(and to a lesser extent green) problem — mono and paper were already fine, which is why the fix
had to push the column back on all four themes rather than re-tint it for one.

Mixed toward `--card` — the surface the panel is drawn on — rather than swapped for another
token, because the intent is *quieter than muted* and no token means that. **75% is the dimmest
mix that still clears 3:1 against the panel on every theme** (warm is the binding one, at 3.02).
It is not decoration: a trailing slash plus `drwxr-xr-x` is what says the thing has contents, so
it has to stay readable, only not compete.

| after | warm | green | mono | paper |
|---|---|---|---|---|
| legibility vs panel | 3.02 | 3.91 | 3.63 | 3.55 |
| vs leaf name | 1.60 | 1.56 | 1.55 | 1.75 |
| vs directory name | 1.92 | 3.67 | 5.35 | 5.24 |

The you-are-here row from 0.19.0 tints this same element toward `--primary` and still wins on
specificity, verified rather than assumed — its perm now stands 1.92 / 3.67 / 5.35 / 5.24 clear of
the dimmed base, so "here" and "not here" separated further rather than collapsing.

## 0.19.0 (2026-08-08)

### Added — the `ls -l` rail marks the current page, keyed on `aria-current="page"`

Daniel: *"We are missing a highlight of the current selection (e.g. if we are in netmon, from
the nav bar, we do not know that we are in that)."* A navigation that cannot say which row you
are standing on is a list of links, not a map.

The state of it before this release is the interesting part: **danieldeusing.de had already built
it privately** (`aria-current="page"` plus a local `.ls-here` rule in its `Header.astro`),
**cockpit had no concept of a current page in its nav at all**, and the design system styled
nothing. One consumer solved it, the others lacked the feature, and the system owned neither —
the same fork-by-omission that produced four copies of `.tab`, except there was nothing to
compare against so nobody noticed.

**The hook is the attribute, not a class.** `aria-current="page"` is the standard, it is what a
screen reader announces, and a page that paints "you are here" without saying it in the
accessibility tree has solved the problem only for people who can see the colour. Marking the row
correctly now earns the styling for free, and a surface cannot end up with one and not the other.
No class alias ships: the private `.ls-here` rule is redundant from this release and should be
deleted rather than aliased.

**It had to be distinguishable from a directory row**, which is the trap the private version fell
into — `--primary` plus bold is exactly what `.ls-row--dir` already takes, so a current leaf
became indistinguishable from any directory above it and a current *directory* got no marking at
all. The current row is therefore the only row with a **left edge marker** and a **background
tint** (position and area, not hue), plus a trailing `←` so the signal reads as "this row" rather
than "this region". `box-shadow: inset` rather than `border-left`, or the row's content would sit
3px right of every other row — a layout shift used as a highlight.

Scoped to `.ls-row`, so the desktop rail and the mobile burger menu mark the current page
identically. A phone is where "which page am I on?" is hardest to answer.

## 0.18.0 (2026-08-08)

### Changed — the ticker strip's stats column is right-aligned

Daniel, on the ci/cd strip: *"We should make the '42 runs · 55% pass rate · …' right aligned in
the box."*

`td.tick-stats` carries `width: 100%` so the four fixed columns keep one set of widths on every
row — which means it absorbs every pixel of slack. Left-aligned, its text therefore started hard
against the `next` column and trailed off into however much empty cell was left, so the row had
one anchored end and one floating middle, and the figures landed somewhere different at every
viewport width. Anchored right, a row reads name on the left and figures on the right, which is
how a table of numbers is read everywhere else in the estate.

**Checked at both extremes rather than assumed.** The busy case is ci/cd's six figures; the sparse
case is the review drain's single `0 queued`, and that is the one that could have gone wrong — a
lone value pinned to a far edge can read as detached from its row. It does not, because the
alignment is shared down the COLUMN: every row's last figure now ends at the same edge, so a
sparse row lines up with the busy rows above and below it instead of sitting adrift in the middle
of the box. It is more anchored, not less.

**Reset to left below 40rem**, where the cells stop being a table: `.tick-stats` becomes a block
on its own line beneath the inline name/last/next, and right-aligning it would push one wrapped
line to the far edge with nothing above it to line up against — a line pointing the other way
from the three it belongs to. Right alignment needs a column to be right-aligned in, and below
the breakpoint there is no column.

## 0.17.0 (2026-08-08)

### Changed — the ticker strip moved from `components.css` to `chrome.css`

Nineteen rules, byte for byte, no behaviour change for anyone loading `dist/`. The move is about
**who can reach them**.

`components.css` is not separable in practice. A surface that wants one component out of it takes
base.css's scanline overlay across its charts, its table type and its control styling along with
it — so a surface with its own layout cannot load it at all, and the estate's one standard answer
to "is this page's machinery still running?" was unavailable to exactly the surfaces that most
need to say so.

netmon is the case that forced it. It is read **during an outage**, so it ships `tokens.css` +
`chrome.css` as a committed same-origin snapshot and deliberately nothing else. For two releases
it therefore had no tickstrip, and reported its 10-second probe as a bare `tick 14:32:07` in the
header bar — no age, no cadence, and no way to tell a fresh reading from one frozen four minutes
ago, on the one page whose entire job is to notice that something stopped.

A tickstrip is **page-level status chrome**: it sits above the content and reports on the page's
own machinery, which is the same job as the header bar and the status footer, and not the job of a
card or a button. It was in components.css because that is where it was written, not because that
is where it belongs.

Consumers of the full bundle see nothing change: `dist/` concatenates both layers, and every rule
in the block resolves only against tokens (`--border`, `--card`, `--foreground`,
`--muted-foreground`, `--primary`, `--success`, `--destructive`), so source order cannot change
what they compute to.

**What a tokens+chrome consumer now gets:** the content column, table scroll, the a11y helpers,
`header.bar`, `footer.status`, the `ls -l` rail, the burger — and `.tickstrip` / `.ticktable` /
`.tick*`. One consequence worth stating, because it is the kind that surprises later:
`bin/design-conformance` in danieldeusing-infra derives each surface's owned vocabulary from the
CSS that surface actually loads, so from this release a tokens+chrome surface declaring any
`.tick*` class is reported as a **forked component**. Use the shared classes; scope a genuine
positional tweak under a surface-owned class.

## 0.16.1 (2026-08-07)

### Fixed — `.doc-link--forward` did nothing in 0.16.0, because prose became a selector

0.16.0's own headline fix never applied. The comment above the rule was extended by pasting
the new paragraph **after** its `*/` instead of before it, so six lines of English sat at the
top level of the stylesheet. CSS does not error on that: it reads the prose as the beginning of
a **selector** and keeps consuming until the next `{…}` — which swallowed **both**
`.doc-link--forward` rules whole. The accent colour went with the nowrap, so forward links across
the estate silently went back to reading as disabled grey text.

Everything agreed it was fine. The build succeeded, the diff read correctly, and grepping `dist/`
found the rule present and intact. It was caught by **measuring a real element in a browser** —
`white-space: normal` and the colour still `--muted-foreground` on a page pinned to 0.16.0 — which
is the second time in two days that reading the CSS agreed with itself while the browser
disagreed.

`check-release.mjs` gains check #6: a `*/` left outside any comment in the built CSS fails the
release and prints the line it is nearest. Same shape as the backtick that took the orchestrator
out — **a comment is code**, and a delimiter in the wrong place changes what parses, not just
what reads.

## 0.16.0 (2026-08-07)

### Added — `.btn-terminal--destructive`, the row action that deletes

Daniel: *"We still have wrong remove buttons. We wanted to have the trash icon in red instead as
normal buttons."* The estate had it wrong in **four** different ways at once, all for the same
verb: an underlined `remove` text link (`.repo-remove` — a footnote that deletes a credential), a
bordered ghost button reading `rm` (the word abbreviated to two letters to fit a table cell), a
muted-grey `remove` on `.doc-link.rowlink`, and a `remove` that was that same ghost button
spelling the word out. One page said both `rm` and `remove` for the same operation.

None of them said *this destroys something* before it was pressed, which is the only job a
destructive control has.

**Composed, not split into `--icon` + `--danger`.** `--compact` is the size and nothing else
because size and colour are genuinely independent — a compact button is wanted in every colour.
These two are not: the split's products are a red button with no icon and a bin with no warning,
and nobody wants either.

**The glyph is a CSS mask, not markup.** Three surfaces adopt this, and an SVG pasted into three
templates is three bins that drift. As a mask it paints in `currentColor`, so it takes
`--destructive` from the rule and re-takes it on all four themes for free; a `fill=` would have to
be declared four times or be wrong on two of them. It keeps a 44px target under a coarse pointer
via `min-*`, so the tap area grows without moving the glyph off centre.

The consumer supplies the accessible name: an icon-only control with no `aria-label` reads as
nothing to a screen reader and cannot be identified from the keyboard.

### Fixed — a forward link no longer breaks between its label and its arrow

`log → forge →` in cockpit's ci/cd activity table wrapped so an arrow landed alone on the next
line. Every `→` in the estate is an author-typed U+2192 after an ordinary space — 86 of them in
cockpit alone, **not one** using a no-break space — so every forward link was one narrow column
away from the same break. `.doc-link--forward` is `white-space: nowrap` now. Fixing it at the call
site would have fixed one cell and left the shape of the bug in place everywhere else.

## 0.15.0 (2026-08-07)

### Added — `.bleed-rail`, for chrome that must ignore the rail

`body` reserves the rail's width with `padding-right`, and `header.bar` cancels it with a
negative margin. Only the header did. Anything else mounted at body level stopped **17rem short**
while the header beside it ran the full width.

Cockpit's alert banner is mounted as the first child of `<body>` and did exactly that. Measured
at 1440px with the rail shown: the banner's right edge at **1168** against the header's **1440**
— a 272px shortfall that vanished the moment the rail was hidden, which is why it read as *"the
alert is fine when hidden and wrong when shown"*.

A class rather than naming `.alert-banner` upstream: the design system should not know what
cockpit calls its banner, and the next full-bleed strip should not have to rediscover this.

## 0.14.0 (2026-08-07)

### Fixed — `--field-label-w` was a phantom, not a token

`.field-row` read `var(--field-label-w, 8.5rem)` and nothing ever declared the name. A consumer
that overrode it got flagged by `design-conformance`'s phantom-token check — **correctly**: from
outside the package, a name the system never declares is indistinguishable from a typo, and that
check exists because a mistyped `var()` is silently dropped and renders almost right.

It is declared in `tokens.css` now, so overriding it is a supported thing to do rather than
something the estate's own linter argues with. A fallback is not a declaration.

## 0.13.1 (2026-08-07)

### `.btn-terminal--compact` was not compact — it lost to `.btn-terminal` on source order

The rule shipped **above** `.btn-terminal` in `components.css`. Both are single-class selectors,
so they carry **equal specificity** and the later declaration wins: `.btn-terminal`'s
`padding: 12px 24px` overrode the compact `0.28rem 0.7rem`, and every compact button in the estate
rendered at landing-page CTA size — roughly double a table row.

What let it pass review is that it looked half-right. `font-size` DID apply, because
`.btn-terminal` happens not to set one, so the class plainly "did something". Measured in a browser
against the published 0.13.0 bundle: `padding: 12px 24px`, `font-size: 11px`. It moves below
`.btn-terminal:hover`, and the comment above it now says the position is load-bearing rather than
tidiness.

Caught while adopting 0.13.0 in cockpit, which had just deleted its local `.btn-compact` in favour
of this — so the release meant to retire the fork would have shipped a worse button than the fork.

### Also recorded: 0.13.0's rail fix was necessary and not sufficient

`initLsNav()` reads the header's bottom edge correctly now, but it reads it **once, on load** —
and cockpit's banner is mounted by `alerts.js` after `await fetch("/api/alerts")`, which is later.
A correct measurement taken before the thing it measures exists is still the wrong number: with a
141px banner, `--ls-nav-top` stayed at 44 while the header ended at 186. No code change here — the
consumer that moves the chrome dispatches `resize`, the signal this module already listens for —
but it is written down, because the 0.13.0 notes claimed the bug was fixed and in the one place it
was reported it was not.

## 0.13.0 (2026-08-07)

### Fixed — the rail broke whenever anything sat above the header

`runtime/lsnav.js` set `--ls-nav-top` from the header's **height**. That is the header's bottom
edge only while nothing sits above it — and something does: cockpit's `alerts.js` mounts the
alert banner as the **first child of `<body>`**.

Measured with a 73px banner: the header ran **73→118** while `--ls-nav-top` was **44**, so the
rail started 74px too high, inside the banner, burying the `ls -l` head and its toggle. Reported
as *"the sidebar is broken, I cannot hide it any more"* — the toggle was not broken, it was
underneath the rail.

It now reads `getBoundingClientRect().bottom` — the only thing that answers *where does the
header end on screen* — divided by the zoom, because a rect is visual px and a CSS length is
re-multiplied by any ancestor `zoom`. The old comment was right that rects are dangerous under
zoom and drew the wrong conclusion: the answer is to convert, not to avoid. Verified at zoom 1
(rail 117, header bottom 118) and at 1.35 (182 vs 183) — a 1px tuck in both.

A `scroll` listener came with it: a sticky header's bottom edge **moves** while the banner
scrolls away. A height never did, so nothing needed one before.

### Added — `.doc-link--forward`, `.field-row`, `.btn-terminal--compact`

**`.doc-link--forward`** for `open →` / `log →`. `.doc-link` is deliberately quiet because it is
footer furniture, and row actions inherited that: a column of grey `open →` reads as disabled
text rather than as the way in. It carries the accent at rest, because a row action is the reason
the row is interactive and hover cannot advertise itself.

**`.field-row`** is a label column and a value column that line up. A settings panel is a
two-column table whether or not anyone writes it as one; built as flex rows, each value starts
wherever its own label happens to end and the panel reads as noise. Not `subgrid` — these rows
render independently, one block per repo, so they must align without a shared parent.

**`.btn-terminal--compact`** is the size only. Colour, corners and the `> ` prefix still come
from `.btn-terminal`/`--ghost`, so a compact button cannot drift into being a different button.

### The rule these encode
A row action that **navigates** is a link (`.doc-link--forward`). A row action that **mutates** —
`remove`, `add`, `update`, `save` — is a **button**. Underlined text that deletes something looks
like a footnote.

## 0.12.1 (2026-08-07)

### The minimap's label is the system's tooltip, not the browser's
The bars carried their section name in `title`. The native tooltip waits about a second before
it appears and renders in the OS's own chrome — useless on a strip whose entire job is to be
scrubbed, because the reader is two bars further on before the first label arrives. They now
carry `data-tip`, so they use the tooltip this system already ships (`src/tooltip.css` +
`initTooltips()`): instant on mouseover, in the page's own type and palette, and delegated, so
bars built at runtime need no extra wiring. `aria-label` stays — the accessible name was never
the browser's tooltip's job.

One cascade note: `tooltip.css` is imported after `components.css` and sets `cursor: help` on
every `[data-tip]`. A bar is clickable, so `.minimap-bar[data-tip]` restates `cursor: pointer` —
the attribute in the selector buys the specificity and also says why the rule is there.

### A release can no longer ship with a version someone else already used
Twice on 2026-08-07 both machines wrote the same version: ddAir published 0.11.0 while ddStudio
was writing 0.11.0 locally, and the collision surfaced only as a rejected push — after the
CHANGELOG entry, the commit message and every template pin had been written against the wrong
number. `scripts/check-release.mjs` asks the questions that are not local decisions before the
work leaves the machine: is this version already on npm, is `v<version>` already tagged on
origin, does the CHANGELOG have a heading for it, do the template pins match it, and is `dist/`
what `src/` currently builds to. Network checks degrade to warnings when offline; the local ones
stay hard. `npm run check:release` runs it, `--next` just prints the next free version, a
committed `.githooks/pre-push` runs it automatically after `npm run hooks:install`, and
`prepublishOnly` runs it too so a bad version cannot reach npm even if the hook was never set up.

## 0.12.0 (2026-08-07)

### The table of contents becomes a minimap, and the doc gets its column back
The doc template carried an "On this page" list in a 13rem column. It repeated headings the
reader was about to scroll past, and it charged a column of the page for doing so — on a wide
display that column was the difference between content that fills the page and content stranded
beside a strip of nothing. 0.10.0 made it worse by pushing the list to the body's right edge: the
content then sat hard against the left margin instead of centred, which is not how any other
surface in the estate lays out. Cockpit's pages declare no `.wrap` override at all; they take the
system's — `--content-w` wide, `margin-inline: auto`, side margins are whatever is left. The doc
template now does the same and overrides nothing.

Its two real jobs — how long is this, and where am I — move to `.minimap` + `initMinimap()`: one
bar per section down the LEFT gutter, fixed, 2rem wide, so it costs the column nothing. Bar
length encodes heading depth, which is the only structure a wordless strip can carry. Every bar
is a real `<button>` with the heading as its accessible name and its native tooltip, so the strip
is tabbable, hoverable and announced — wordless on screen is not wordless underneath. The strip
scrolls itself and keeps the active bar in view when a document has more sections than fit, and
it hides below the burger breakpoint, where a fixed gutter is width the content cannot spare.

The markup contract is nothing: `initMinimap({ sections: "section.doc" })` builds it from the
sections it finds. It returns `null` and renders nothing for fewer than two sections, on the same
reasoning as a one-entry nav — a map of one place is not a map. That also retires the whole class
of bug where a section was added without its TOC entry, or a stale `data-toc-link` broke the
scroll-spy: there is nowhere left for it to happen.

## 0.11.0 (2026-08-07)

### A table is a grid again — cell padding, a hairline between rows, top-aligned cells
Until now the system set exactly one property on `table`: the font size. Everything else was
the browser default, which means **zero cell padding and no rule between rows**. On a dashboard
of short numeric cells nobody noticed. On a doc table whose cells hold a sentence the rows merge
into a block of prose and the reader cannot tell which fragment on the right belongs to which
label on the left — and the wider the table, the worse it gets, because the eye has further to
travel with nothing to travel along. Reported against a 3-column, 17-row findings table where
every cell was a full sentence: "very hard for me to see which text belongs to which row".

`th, td` now take `0.45rem 0.85rem` of padding, `vertical-align: top` (so a one-line cell sits
level with the first line of a five-line neighbour instead of floating in its middle), and a
`border-block-end` of `--border` **mixed down to 55%**. Not `--border` itself: at full strength
a line under every row reads as a bordered spreadsheet and fights the terminal look. The mix is
a token operation, so it stays correct on all four themes. `thead th` keeps the undiluted rule
and `--muted-foreground`; the last body row drops its rule, which would otherwise draw a line
across the bottom of the table with nothing under it and read as a cut-off table. First and last
cells lose their outer padding so a table lines up with the text column around it rather than
sitting in a box.

`table` also takes `width: 100%`, so a table fills its column and wraps inside it instead of
sizing to its longest cell and pushing the page sideways.

### A long table scrolls itself, and its header stays put
`.tablewrap` already stopped a WIDE table from scrolling the whole page. A TALL one had the same
shape of problem and no answer: a 40-row table pushes everything after it below the fold, and the
header row is gone long before the rows that need it. `--tablewrap-max-h` (default `75vh`) caps
the wrapper; anything shorter is untouched, so short tables behave exactly as before. A surface
that genuinely wants an uncapped table — a full-bleed dashboard — sets the token to `none`
instead of redeclaring the rule.

The wrapper is now `overflow: auto` on both axes, which also makes it the scrollport for
`position: sticky`. That is what lets `.tablewrap thead th` stick to the TABLE rather than to the
viewport — sticking to the viewport is the failure this avoids, because the header row would then
float over the page's own fixed chrome on every page that has some.

## 0.10.0 (2026-08-07)

### Fixed — the tooltip landed in the wrong place on any zoomed page

`runtime/tooltip.js` measured with `getBoundingClientRect()` and `window.innerWidth` — both
**visual** pixels, already multiplied by an ancestor `zoom` — and then wrote the result into
`style.left`, a CSS length the browser multiplies **again**. So the tooltip rendered at
`x * zoom`, an error that grows with distance from the origin.

Measured at zoom 1.35: an anchor 198px in got a tooltip **69px adrift**; one 949px in got
**329px**, far enough to leave the viewport entirely. After the fix: 0px and −3px, the −3 being
the right-edge clamp doing its job. Only the write is converted — the clamp is already correct
because both its operands are visual, and "fixing" it too would break it the other way.

This is the same trap as `runtime/lsnav.js`, which measures with `offsetHeight` for exactly this
reason. Any code that measures in one space and writes in the other has it.

### Changed — square corners, everywhere, because the token always said so

`--radius` has been `0rem` since the first release and precisely one declaration in the whole
system used it. The rest hardcoded a number: this file carried a `5px` badge and the tooltip a
`4px` corner, both visible on screen. They resolve through the token now, so "no rounded corners"
is a fact rather than an intention.

That badge was also `#b42318` on `#fff` — a literal pair in the one file that argues no literal
can serve four themes. It takes `--destructive` and `--primary-foreground` now.

### Added — `.btn-terminal--ghost`

`.btn-terminal` is the loud one: filled `--primary`, one per view. Every surface that needed a
quieter button — refresh, dry run, cancel — invented its own local class instead, and every one
of those invented a border-radius with it. This is that button, square, so there is nothing left
to invent. Outlined rather than a lighter fill, because two filled buttons side by side compete
and the point of the primary is that it is the only filled thing in view.

## 0.10.1 (2026-08-07)

### The tall-table cap is opt-in — 0.10.0 made it the default and that broke page scrolling
`--tablewrap-max-h` shipped in 0.10.0 with a `75vh` default, so every table taller than the
viewport became its own scroll region. That is right for a dashboard, where a table is a panel
with a fixed slot. It is wrong for a document, and a document is what the doc template mostly
builds: a page with four long tables became a page with four scroll regions, and a reader
scrolling with the pointer over one of them moved the TABLE instead of the page.
`overscroll-behavior: contain` — also 0.10.0 — then refused to hand the scroll back when the
table hit its end, so the page simply stopped responding to the wheel with nothing on screen to
explain why. Rows past the cap were hidden with no affordance either: the wrapper's fade is on
the right edge, for the horizontal case, and there is nothing along the bottom.

The default is now `none` and `overscroll-behavior` is gone. A surface that wants a capped table
sets `--tablewrap-max-h: 60vh` on the wrapper or a container and gets the sticky header with it.
`overflow-y: auto` stays: it costs nothing while the wrapper is uncapped, since an unconstrained
box never scrolls, and it is what makes the opt-in work at all.

Everything 0.10.0 did for READABILITY — cell padding, top-aligned cells, the hairline row rule,
the header treatment, `width: 100%` — is unchanged. That was the part that fixed the reported
problem; the cap was an extra nobody asked for.

## 0.9.0 (2026-08-07)

### Added — `.tab--info`, because a tab row has two halves

A tab row mixes two different kinds of destination: the ones you open to **do** something (run a
review, edit config, dispatch a job) and the ones you open to **understand** something
(conformance, how it works). Undifferentiated, "where do I act?" is a reading task every time.

`.tab--info` on the **first** reference tab pushes it and every sibling after it to the right —
an auto inline-start margin in a flex row absorbs the free space. One class on one element, and
the split maintains itself as tabs are added to either side.

Dropped below the mobile breakpoint, where the row wraps: an auto margin there would strand one
tab alone on a line instead of aligning anything.

## 0.8.1 (2026-08-06)

**On a phone the rail's collapse toggle was a dead 16x6px nub.** Below the 48rem breakpoint the
rail is not a fixed column — it is inline inside the burger — so there is nothing for the control
to collapse, and its guillemet comes from a rule scoped to the desktop media query, leaving a
bare button with no glyph. Clicking it hid the navigation the reader had just opened. A control
that renders as working and does nothing is worse than no control.

Hidden below the breakpoint. Every surface shipping the rail markup has carried this since the
rail landed; danieldeusing.de had already worked around it locally, which is now redundant.

Found while converting netmon, where the same audit ALSO reported browser list bullets and a
40px indent on this markup. **That half does not generalise and is deliberately not fixed here:**
netmon loads `tokens.css` + `chrome.css` only, with no `reset.css`, so those `ul` defaults are
netmon's own to handle. Measured against the full bundle at 375px: `list-style-type: none`,
`padding-inline-start: 0px`.

## 0.8.0 (2026-08-06)

Three holes an audit found — each one something the package *claimed* rather than provided.

**`exports` gated away the layers a real consumer stacks.** `files` shipped `chrome.css`,
`tooltip.css`, `print.css` and `templates/` to npm, but `exports` never listed them, and
`exports` is what decides whether a subpath resolves. So `@danieldeusing/design/chrome.css` and
`@danieldeusing/design/templates/page-chrome.html` were both unreachable — **netmon's exact
stack (`tokens.css` + `chrome.css`, deliberately without `components.css`) was impossible via
npm**, and only worked because netmon loads from the CDN. The canonical template shipped in the
tarball and could not be opened. Now exported.

**The Tailwind entry point mapped one status colour of five.** `--color-destructive` was there;
`--success`, `--warning`, `--info` and `--pending` — shipped in 0.3.0 and 0.5.0 — were not. A
Tailwind app could write `text-destructive` and nothing else, and the workaround for a missing
mapping is a literal hex, which is the single thing the colour rules forbid. All four added.

**`.ls-group` was in the canonical template and styled by nothing.** It rendered as a plain
inline span, so every surface wanting grouped navigation wrote its own rule and they all
differed — netmon had already noticed and said so in a comment. Shipping a class name without
the look is worse than not shipping it, because the markup reads as supported.

## 0.7.3 (2026-08-06)

**0.7.2 fixed the duplicated mobile nav and left the remaining one unusable on a phone.** With
`.mobile-nav` hidden, navigation falls to the rail's rows — which are **18px** tall. WCAG 2.2's
Target Size (Minimum) floor is 24px and the size anyone actually aims with is 44px; the
`.mobile-item` rows that were just hidden carried 0.65rem of padding precisely for that. So the
previous release traded a nav that appeared twice for one that is hard to hit, which is the
worse of the two, and it is invisible on the desktop where the fix was written.

Rail rows below the breakpoint now take `min-height: 44px` — a fixed floor rather than more
padding, so it holds whatever the row's font size does, and it is the number the guideline
names. `.ls-name` stretches to fill the row, because a link you have to hit precisely is the
same problem wearing a bigger box. Group labels are not interactive and are left alone.

Caught by an agent converting danieldeusing.de, which declined to hide `.mobile-nav` locally
for exactly this reason — the rows it would have dropped were the finger-sized ones.

## 0.7.2 (2026-08-06)

**On a phone, a page that ships both nav forms showed its navigation TWICE.** `.mobile-nav`
predates the rail — it was the phone's only navigation back when the desktop nav was a
dropdown. Every cockpit page ships both, because one `NAV_ITEMS` array renders both, so the
whole tree appeared stacked on itself inside the burger. The mobile rule has said the flat list
*"replaces"* the rail since 0.2.0; it never actually hid anything.

`.site-nav:has(> .ls-nav) .mobile-nav { display: none }`. The rail wins because it is the one
carrying structure — groups, directories, the drawn nesting — while `.mobile-nav` is a flat
list of the same links. Hiding the OLDER form when the newer one is present is also what keeps
a pre-rail surface working untouched, and `:has()` degrades to the status quo rather than to a
page with no navigation at all.

Found by an agent converting the docs pages, which dropped `.mobile-nav` and got one list where
cockpit had two — the kind of thing that only shows up when two surfaces built from the same
vocabulary are compared side by side.

## 0.7.1 (2026-08-06)

**Print: `.tablewrap` was not in the "nothing scrolls on paper" rule.** 0.7.0 introduced the
class and the print layer still named only `.table-scroll`, the docs site's older private name
for the same idea. An `overflow-x` container has no scrollbar on paper — whatever sits past the
right edge is simply gone — so every newly-wrapped table was one `Cmd-P` away from losing its
last columns silently.

`.table-scroll` stays listed alongside it. Pages published under the old name are still on the
docs site and cannot be edited retroactively, and dropping the selector would start clipping
their tables with no visible cause.

## 0.7.0 (2026-08-06)

Daniel: *"the font size of container-page is different than on all other pages, e.g. cockpit.
Can we adjust but still having a proper table? The table (and all tables everywhere) should be
scrollable in x direction if content is bigger than width"*.

**`table { font-size: var(--fs-md) }` in base.css.** The type scale in 0.4.0 unified the
*steps* every surface could choose from; it did not stop them choosing differently. Cockpit's
documentation tables sat at `--fs-lg` (15px) while the containers dashboard's sat at
`--fs-base` (12px) — a 3px gap between two pages of the same site, set years apart and never
compared. A table cell is body copy: it is read, not scanned as chrome, so it takes the
body-copy step and surfaces stop deciding. One that genuinely differs still can, but it has to
say so rather than inherit an accident.

**`.tablewrap` + `runtime/tablescroll.js` — no table may push the page sideways.** A table
wider than the page is the commonest cause of a whole PAGE scrolling horizontally, and that is
the one layout failure that reads as broken: the header slides off, the fixed footer stops
reaching the edge, and body text needs two axes to read. The table is what is too wide, so the
table is what should scroll.

CSS cannot do this alone, which is why it is a runtime and not a rule. `overflow-x` has to sit
on an element WRAPPING the table; a table cannot wrap itself (`display: block` on a `<table>`
does make it scrollable and throws away the table layout algorithm, so columns stop aligning
across rows), and there is no selector for "my parent". So `initTableScroll()` walks the
document and gives every unwrapped table a `.tablewrap` parent.

The markup contract is therefore **nothing** — author a plain `<table>`. Pages that already
hand-wrapped theirs are left alone, so adopting this is never a migration, and it is safe to
call again after rendering more rows.

The right-edge fade is not decoration: a scroll container with a hard edge is
indistinguishable from a table that simply ends, so without it nobody knows to scroll. It
carries a `transparent` fallback on `--background` so an unpinned surface on an older build
fades to nothing rather than painting a grey bar over the last column.

`.tablewrap` had existed twice in cockpit — once in `portal.css` with the fade, once in
`index.html` with a border and no fade — which is the usual shape of a thing that should have
been upstream from the start.

## 0.6.0 (2026-08-06)

**`templates/page-chrome.html` — the standard chrome, written down.** Daniel, looking at
netmon: *"1) have `ls -l` right aligned 2) not a dropdown, but a sidebar (as cockpit). This
should be the case now for all (docs, netmon, cockpit, danieldeusing.de, container …)
3) have a footer and the theme switcher in the footer instead (also all should have the footer
and the controls in the footer)"*.

Every surface wears three pieces in one order — `header.bar` (brand left, the `ls -l` head
right), `.ls-nav` (the sticky right RAIL, always the rail, never a dropdown), and
`footer.status` (fixed, full width, and the home of EVERY control). The CSS for all of it has
shipped since 0.2.0. What had never been written down was the ARRANGEMENT, so each surface
arranged it privately: netmon grew its own header with the theme picker inside it and no footer
at all, while the docs pages and danieldeusing.de kept the pre-rail dropdown long after cockpit
moved on. Each was locally reasonable; together they stopped looking like one estate.

The template is the answer to "what does a page look like here?" and it carries the reasoning,
not just the tags:

- **the rail, not a dropdown** — a dropdown answers "where can I go?" only while you hold it
  open, and covers what you were reading to do it. The rail is the page's table of contents:
  always visible, always in the same place, hideable when you want the width back. It is also
  why the `ls -l` HEAD sits in the header bar and not in the rail — the toggle must stay put
  whether the rail is open or closed, so opening and closing changes the arrow and nothing else
  moves.
- **every control in the footer** — the header names the page, the footer operates it. Theme,
  language and animation are session preferences, not navigation. Mixing them into the header
  put a colour picker beside a brand on one surface and nowhere at all on another.
- **the two pre-paint reads**, inline in `<head>` before any stylesheet: theme and rail state.
  A module at the end of `<body>` runs after first paint, so a reader who chose green or hid
  the rail watches the default paint and then jump — on every page load.

`templates/` now ships in the package (`files`), so a consumer can read the canonical markup
from its own `node_modules` instead of copying whatever the nearest surface happens to do
today — which is how the pre-rail dropdown propagated in the first place.

## 0.5.0 (2026-08-05)

**`--info` and `--pending`, because three status accents cannot describe a state machine and
cockpit forked a literal for every state that was missing.** good / attention / bad is a verdict
vocabulary. It has no word for *in flight* and no word for *no answer yet* — and those are the
two states a dashboard spends most of its time showing. Lacking a token, cockpit picked hexes:
`#3f8fd9` and `#1a7f7f` for the first, `#7048e8`, `#9775fa` and `#b05fd9` for the second. Five
literals, two meanings, and **every one of the five missed AA 4.5:1 on warm — the default
theme**; `#7048e8` and `#1a7f7f` sat inside the 0.0692 luminance gap and cleared neither side,
so no amount of tuning at the call site could have saved them. That is the failure this release
fixes, and the fix has to be here because a per-theme value is the only kind that works.

- **`--info`** — a state, not a verdict: dispatching, gated, started by hand, "silent for a
  reason". Blue, so it never reads as an alarm.
  warm `#1c5f9e` 5.17 · green `#4dabf7` 7.57 · mono `#4dabf7` 7.63 · paper `#1c5f9e` 5.74.
- **`--pending`** — *no* verdict: still running, timed out, could not determine, not recorded.
  The answer is absent, which is a different thing from the answer being bad, and colouring it
  red says the opposite. Violet, so it never collapses into `--destructive`.
  warm `#5f3dc4` 5.58 · green `#b197fc` 7.77 · mono `#b197fc` 7.82 · paper `#5f3dc4` 6.19.

Ratios are the worst of `--background`, `--card` and `--muted` on that theme, measured rather
than eyeballed — the same three surfaces every other accent here is held to. Both follow the
shape the arithmetic forces: one value for the two light themes, one for the two near-black ones.

**What does NOT belong here, and the line is worth stating.** Cockpit also hardcodes a GitLab
orange. It stays in cockpit, per-theme, in cockpit's own stylesheet: a design system that knows
what GitLab is has a layering bug, and the next vendor would want the same favour. The rule that
falls out — *a token here names a STATE; a colour that names a THING belongs to the surface that
knows what the thing is* — is why this release adds two tokens and not three.

**Fixed: `tokens/tokens.json` had been dropping every warm colour since 0.4.0.** Adding the
layout scale gave `tokens.css` a *second* `:root` block, and the build assigned rather than
merged — so the second block replaced the first and the default theme exported the eleven
measurements with **not one colour**. It survived a release because the consumers of that file
are native/Figma exports nobody had regenerated. The CSS was never affected. Warm now exports
its full set, and this release's `--info`/`--pending` reach the JSON for all four themes.

## 0.4.0 (2026-08-05)

**Measurements are tokens now, because four surfaces had four answers.** Daniel: *"all pages
should behave the exact same (danieldeusing.de, cockpit, netmon, container, docs) regarding the
display and font size … same margins left and right … same font size depending of window size"*.

The audit that preceded this found the divergence real, and found that **none of it was
expressible here**: no width token, no type scale, so every surface picked a number in isolation
— cockpit `78rem`, netmon `1180px`, danieldeusing.de `72rem` (Tailwind `max-w-6xl`), the
containers dashboard none — and netmon additionally set a flat `font: 13px` where everything
else sat at `0.75rem`. Fixing that as five local edits would have produced five *new* numbers a
year from now, so the answer moves upstream:

- **`--content-w` (78rem) + `--content-pad` (1.5rem), and a `.wrap` that resolves them.** 78rem
  is cockpit's — the widest of the four, already tuned against the `ls -l` rail, and from the
  surface with the most page types; standardising on the narrowest would have reflowed every
  table. `.wrap` sets the **inline axis only**: vertical rhythm differs legitimately between a
  doc and a dashboard, and a shared rule that overreaches is precisely what earns a local
  override. Consumers set `padding-block` — the `padding` **shorthand** resets `padding-inline`
  and silently takes the margins back.
- **`--fs-xs … --fs-2xl`, `--lh-tight` / `--lh-base`.** The steps are 1px apart at the bottom on
  purpose: this is a terminal UI whose useful range is 10–15px, and a geometric ratio scale
  would give three usable steps then leap past everything that matters. `base.css` resolves the
  body against `--fs-base` instead of a literal.
- **Tailwind mapping** — `max-w-content`, `text-fs-*` — so an app consuming via `tailwind.css`
  reaches the same measurements as one loading the CDN bundle. Tailwind's own `text-xs` /
  `text-sm` / `text-base` are **deliberately left alone**: this scale bottoms out at 10px for
  terminal chrome, and remapping the default names would reskin every existing utility in a
  consuming app on upgrade. Opt in by name.

**The scale is only half of "same font size depending on window size", and the halves are easy
to conflate.** The scale fixes the **ratios** and does not track the viewport.
`initResolutionZoom()` (`runtime/zoom.js`, shipped since 0.1.x) is what makes a page track the
**window**, by laying out at a 1920px reference and zooming above it — and it works only if a
surface calls it pre-paint from `<head>`. Three of the five did. Scale without zoom is a page
frozen at one size on a 4K display; zoom without scale is uniform scaling of sizes that disagree
between pages.

## 0.3.4 (2026-08-05)

### Changed — nesting in the `ls -l` rail is drawn, not just indented
Whitespace alone was not carrying depth: with a permission column in front of every row a child
sat ~1rem right of its parent and the eye had nothing to follow. Three signals now:
- a **vertical guide per level** (`.ls-row--sub`, `.ls-row--sub2`) — stacked children form one
  continuous rule, which is what actually shows which parent a row belongs to;
- **directories** take `--primary` and bold via a new `.ls-row--dir` class, keyed on a class the
  renderer emits rather than the trailing slash in the label (CSS cannot select on text);
- **leaves** stay `--muted-foreground`.

The guide is the load-bearing one: colour alone fails on the two near-black themes and on paper.
Depth 2 is now a class instead of inline padding, so both levels are styled in one place.

## 0.3.3 (2026-08-05)

### Fixed — the seam between the rail and the chrome
`initLsNav()` set the inset to the chrome's exact measured height, and "exactly flush" turned
out to be a rounding coin-flip: `offsetHeight` is an INTEGER while the bar's real height is
fractional (44.97), and a zoomed layout multiplies the error — at `zoom: 1.25` the bar ended at
56.00 while a 45px inset put the rail at 56.25, a quarter-pixel line of page background that is
plainly visible on a wide screen. The rail now overlaps the chrome by **1px**. Both chrome
elements are opaque and sit above it (z-index 30 and 50 vs 25), so a pixel of tuck is invisible
where a pixel of gap is not — and the result no longer depends on rounding at all.

## 0.3.2 (2026-08-05)

### Changed — `ls -l` moves into the header bar, and the rail sits flush
- **`ls -l` is in the HEADER now**, not inside the rail. Daniel: *"the ls-l should be in the
  header"* — which is where it was before any of this, when it was a dropdown summary. That
  collapses the two toggles into **one control that never moves**: `.ls-nav-hide` and
  `.ls-nav-show` are replaced by a single `.ls-nav-toggle`, and open/closed is a pure CSS state
  change (the guillemet is generated by `::after`, so the arrow flips with nothing scripted).
  The rail below holds only the listing. **Markup change** — see the contract in `chrome.css`.
- **The rail is flush with the chrome.** `initLsNav()` measured with `getBoundingClientRect()`,
  which reports VISUAL pixels — already multiplied by any `zoom` on `<html>`. Consumers do set
  it (cockpit scales the layout to the viewport), so that number was zoomed a second time when
  written back as a CSS length, leaving the rail a few px below the bar with a visible seam.
  Now `offsetHeight`, which is layout px — the same unit the CSS is interpreted in. Verified at
  zoom 1 and 1.35: gaps 0.03px / 0px, identical at both.

### Changed — the ticker gets room to breathe
`.tickstrip` gains a top margin. Butted straight up against a page's lede it read as part of the
prose rather than as instrumentation.

## 0.3.1 (2026-08-05)

### Changed — the rail sits BETWEEN the chrome, and `ls -l` stops moving
- **The rail no longer overlays the header or the footer.** Daniel: *"the right sidebar then
  should not overlay footer and header. Footer and header wins."* It now runs from the bottom of
  the bar to the top of the status line, and both keep their full width. `--ls-nav-top` /
  `--ls-nav-bottom` are **measured off the real chrome** by `initLsNav()` (re-measured on resize
  and after webfonts land) rather than guessed at in CSS; the CSS carries fallbacks so a page
  that never runs the runtime still lays out sensibly.
- **`ls -l` is at the top right, open or shut** — the rail head and the tab that replaces it share
  `--ls-nav-top`, so the only thing that changes is which way the arrow points. The previous
  build centred the tab vertically on the right edge: correct for a drawer handle, wrong here,
  because it moved the one control the reader is hunting for to a place navigation has never been.
- Only the **header** gets the negative margin that pulls it back to full width. The footer is
  `position: fixed` with `inset-inline: 0`, so it ignores the body padding and was already full
  width — giving it the same margin pushed it 272px PAST the viewport edge (measured 1099px
  against an 842px viewport). Fixed and in-flow siblings look alike in markup and do not behave
  alike here.

### Added — zoomable diagrams (`runtime/diagramzoom.js`)
`initDiagramZoom()` makes every `.diagram` a real button: click or Enter/Space opens it
full-screen fitted to the viewport, then wheel zooms about the pointer, drag pans, and
`+`/`-`/`0` plus on-screen controls do the same. Escape or a backdrop click closes and returns
focus. An architecture diagram authored for a text column is unreadable at exactly the moment
someone needs it.
- The svg is **cloned, not moved**: mermaid holds references to the nodes it rendered and re-runs
  against them when a folded or tabbed diagram becomes visible, so moving the original out of the
  document and back is how a diagram silently stops updating.
- The clone is given the original's **measured pixel size**. A mermaid svg is sized by
  `width="100%"` plus an inline max-width; stripping those to "let it fill" leaves an svg with
  only a viewBox, which collapses to 0x0 in an auto-sized box — the first build did exactly that
  and fitted nothing.

### Changed — the ticker strip reads as status, not as brand
`ok` now uses the new per-theme `--success` instead of `--primary`: a healthy poller and the page
heading were the same ink, so "everything is fine" had to be read rather than seen. The row name
drops to `--foreground` for the same reason, each state gains a left edge-marker so a bad row is
findable by shape when the strip is scanned, and `next` is de-emphasised because it is a
prediction sitting beside a measurement.

## 0.3.0 (2026-08-05)

### Added
- **`--success` and `--warning`, per theme** — the design system shipped only `--destructive`,
  so every "good"/"caution" colour downstream had to be a literal, and a literal cannot be
  correct here. Measured worst case against each theme's `--background`, `--card` AND `--muted`:

  | | warm | green | mono | paper |
  |---|---|---|---|---|
  | `--success` | `#1a6b2e` 5.16:1 | `#4ade80` 10.76:1 | `#4ade80` 10.84:1 | `#1a7031` 5.36:1 |
  | `--warning` | `#845600` 4.97:1 | `#f5b32b` 10.15:1 | `#f5b32b` 10.22:1 | `#8f5d00` 4.89:1 |

  All twelve values (with `--destructive`, 5.68–6.24:1) clear **AA 4.5:1 on every surface**,
  re-derived from the committed file rather than from the values that were intended.

### Why they have to be per-theme (now written into `tokens.css`)
The two admissible luminance bands **do not overlap**: a light theme's darkest surface (warm's
`--muted` `#ece3cf`) demands `L <= 0.1328`, a dark theme's lightest (green's `--muted`
`#071509`) demands `L >= 0.2021` — a gap of 0.0692 with nothing in it. No single hex can serve
four themes; every compromise fails both sides. Cockpit's twelve hardcoded accents are the
worked example: all twelve miss AA on at least one theme and four sit inside the gap, clearing
neither. This is arithmetic, not taste, which is why each accent is declared four times.

Adding a status colour later: put a **token** here with its measured worst case in a trailing
comment. Tuning a literal at the call site forks the palette and fixes exactly one theme.

## 0.2.0 (2026-08-05)

### Added
- **`ls -l` site rail** (`src/chrome.css` + `runtime/lsnav.js`) — the navigation that was a
  dropdown is now a sticky, full-height panel on the **right**, **shown by default**. Content
  and the fixed footer shift left to sit against its edge. Hiding it leaves a labelled
  `« ls -l` tab on the screen edge, so a hidden rail stays discoverable by someone who did not
  hide it. The affordance is a guillemet, never a caret — a caret means "a menu drops from
  here", which is the thing this stopped being.
  - State persists in `localStorage` under `ls-nav` and **must be applied by an inline `<head>`
    script**, not by the runtime: the runtime is a module at the end of `<body>`, so a reader
    who hid the rail would watch it paint and then jump away on every page load. `initLsNav()`
    only wires the clicks. The snippet is in the `chrome.css` header comment.
  - Below the 48rem breakpoint the rail is not rendered; the burger keeps navigation.
  - The toggle is not animated on `body`/`footer`: animating padding reflows the whole document
    every frame, and these pages render tables of hundreds of rows. Only the rail's own
    `transform` transitions, which is composited.
- **Shared page vocabulary promoted from the cockpit portal** into `src/components.css`:
  `.tabs`/`.tab` (filled active tab), `.tickstrip`/`.ticktable` (the poller header strip),
  `details.fold` + `.fold-body`, and `.legend`. Each was built once and then wanted everywhere —
  the tabs had already drifted into four separate page style blocks before being consolidated.

### Compatibility
- **Safe to adopt before your markup changes.** The rail reserves its space only through
  `html:has(.ls-nav)`, so a consumer still shipping the old dropdown nav — or no nav at all —
  keeps its full width instead of growing a 17rem gutter with nothing in it. The pre-rail
  `.dropdown-panel.ls-panel` alignment is kept for the same reason. Both verified against a page
  built from the old markup, which is the case every unpinned surface hits first.
- `print.css` resets the body shift: hiding a fixed element does not reclaim the room something
  else was told to leave for it.

## 0.1.6 (2026-08-01)

### Added
- `src/print.css` — the print layer, imported last by both entry points. Paper is a
  different device, not a narrow screen: black on white regardless of the active theme,
  **12px body text** with a proportional heading scale (24/18/16/14px), page margins,
  sane page breaks (headings never orphaned, tables break between rows and repeat their
  header), and no screen chrome — the `header.bar`, `footer.status`, `ls -l` dropdown,
  burger nav, scanline overlay, phosphor glow and the **"On this page" `.toc`** are all
  dropped from the printout.
- Three fixes in there are load-bearing and easy to lose in a refactor:
  - **The terminal reveal is forced open.** `runtime/terminal.js` reveals a
    `[data-term-out]` only when its section scrolls into view, so a long page printed
    straight after load had most of its content at `visibility: hidden` — it printed
    blank, silently, and the reader only found out on paper.
  - **`zoom` is reset to 1.** Pages using the resolution-independent zoom
    (`html.style.zoom = innerWidth / 1920`) carried that multiplier into the print box.
    That is what made printouts come out oversized.
  - **Mermaid SVGs are repainted for paper.** Mermaid bakes the active theme's colours
    into the SVG at render time, so a diagram rendered under `green`/`mono` printed as
    dark boxes with invisible labels no matter what the page tokens said.
- Overflow containers (`.table-scroll`, `pre`, `.diagram`) wrap instead of scrolling —
  in print there is no scrollbar, so anything past the right edge was simply lost.

## 0.1.5 (2026-07-09)

### Added
- `[data-tip]` tooltip system: `runtime/tooltip.js` (`initTooltips()`) + `src/tooltip.css`.
  Body-level singleton, `position: fixed`, viewport-clamped (clamps horizontally, flips
  above when out of room) — tooltips are never cut off and always render on top of any
  overflow/clip context. Event-delegated (dynamic nodes work), hover + keyboard focus.

### Fixed
- `.worktrees/` (hermes tester worktrees) untracked + gitignored; was accidentally
  committed once, never published (npm `files` whitelist).

## 0.1.4 (2026-07-05)

- **chrome kit** (`src/chrome.css`): the full app chrome as reusable components —
  sticky `header.bar`, fixed `footer.status`, skip-link/visually-hidden helpers,
  `ls -l` listing rows (`.ls-row`/`.ls-perm`/`.ls-panel`, right-anchored), and the
  responsive site nav: desktop dropdown, **mobile burger** (`.nav-burger` +
  `.site-nav`/`.mobile-nav`) with the **footer folded into the menu**
  (`.mobile-footer`) and the fixed footer hidden below 48rem — the
  danieldeusing.de pattern, extracted so apps stop rebuilding it.
- **runtime**: `initBurgerNav()` (`runtime/nav.js`) — burger toggle,
  outside-click + Escape close, aria-expanded sync.
- template updated to use the chrome kit.

## [Unreleased]

## [0.1.2] — 2026-06-27

Make the chrome controls reusable so every consumer (apps + one-page docs) shares them.

### Added

- **`.anim-toggle`** component class + **`initAnimToggle()`** runtime — a footer/status-bar
  "animations on/off" control wired to `html.anim-off` + `localStorage "anim"` (was duplicated
  inline in each app).

### Changed

- **`initThemeSwitcher()`** now closes the enclosing `<details class="dropdown">` after a theme
  is picked (no-op when the switcher isn't inside a dropdown).

## [0.1.1] — 2026-06-26

Sync the core with the canonical terminal animation as it evolved in pagr.

### Added

- **Per-card child-cascade reveal**: a revealed `[data-term-out]` now staggers its direct
  children (rows/lines) in one by one — applies to every card on every page.

### Changed

- `html.anim-off` now hides the cursor with `display: none` (was `opacity`) and kills only
  keyframe animations, not transitions.
- `runtime/terminal.js` gate now reads `localStorage "anim"`: an explicit pick wins over the
  OS reduced-motion setting (explicit `"on"` animates even under reduced motion), and box
  reveals run non-blocking so the next prompt keeps typing.

## [0.1.0] — 2026-06-26

Initial extraction of the terminal design system shared by danieldeusing.de and seedr into a
standalone, framework-agnostic package.

### Added

- **Tokens** (`src/tokens.css`): the four themes — `warm`, `green`, `mono`, `paper` — as plain
  CSS custom properties (18 palette tokens + `--glow`/`--glow-soft`/`--scanline-opacity` +
  `--radius` + `--font-mono`).
- **Base** (`src/base.css`): monospace body, CRT scanline overlay, themed border colour, focus
  ring, `::selection` — plus a minimal `src/reset.css` for the build-free path.
- **Components** (`src/components.css`): `.glow`, `.prompt`, `.comment`, `.cursor-block`,
  `.btn-terminal`, `.link-quiet`, `.card-terminal`, `.ascii-rule`, the `.dropdown` system,
  `.eli5`, the `[data-term]` typing-animation contract, and the `html.anim-off` kill-switch — all
  plain CSS, no `@apply`.
- **Tailwind v4 entry** (`src/tailwind.css`): `@theme inline` mapping the tokens to
  `--color-*`/`--font-*`/`--radius-*` utilities.
- **Runtime** (`runtime/*.js`): dependency-free ESM for theme switching, the terminal typing
  animation, dropdown behaviour, and resolution-independent zoom.
- **Webfont** (`src/fonts.css`): optional pinned JetBrains Mono Variable for the build-free path.
- **Distribution**: committed `dist/` bundle (+ minified) for jsDelivr, generated
  `tokens/tokens.json` for native consumers, and an npm `exports` map.
- **Docs**: `examples/style-guide.html`, `templates/documentation.html`, and migration plans
  under `docs/migrations/`.

[Unreleased]: https://github.com/danieldeusing/danieldeusing-design/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/danieldeusing/danieldeusing-design/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/danieldeusing/danieldeusing-design/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/danieldeusing/danieldeusing-design/releases/tag/v0.1.0
