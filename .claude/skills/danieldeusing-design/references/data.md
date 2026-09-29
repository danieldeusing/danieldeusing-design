# Data: time, charts, tabs, the ticker strip, state tags

Reference for the `danieldeusing-design` skill. Read it before a page shows an instant or an age,
draws a chart, gets a tab row, shows its pollers, or colours a state. The dense table, its cells,
the pick column and key/value pairs are in `tables-and-forms.md`.

Everything here was worked out in cockpit first — its activity tables, its `when` column, its trend
and bar charts, its five tab engines and its ticker strip — and is the system's since 0.60.0.

**`src/data.css` needs `tokens.css` and nothing else.** netmon, a framework app with its own base,
or any surface that cannot take `components.css` loads `tokens.css` + `data.css` and gets every rule
below whole; nothing in it leans on `base.css`, which is why the tab bar moved here out of
`components.css`. The runtime is plain ES modules: `runtime/time.js`, `runtime/charts.js`,
`runtime/tabs.js`, `runtime/tickstrip.js` (and `runtime/pick.js` for the table's pick column).

Contents:

- An instant is `formatStamp()`, an age is `formatAgo()` — in the viewer's zone (D5)
- The `when` cell: how long ago, over the exact stamp (D4)
- A chart is drawn at the size it is shown (D6, D7)
- One tab row, one engine: `.tabs` and `initTabs()` (D8)
- The ticker strip: push a row, register a refresher (D9)
- A state is a `.tag`: cockpit's vocabulary (D10)
- Forced colours and print

## An instant is `formatStamp()`, an age is `formatAgo()` — in the viewer's zone (D5)

```js
import { formatStamp, formatAgo, formatDuration, stampParts } from "@danieldeusing/design/runtime/time";

formatStamp("2026-09-28T10:04:00Z");   // "2026-09-28 12:04:00" — read in Berlin in September
formatAgo("2026-09-28T10:04:00Z");     // "3 minutes ago"
formatAgo(ts, { style: "short" });     // "3m ago"
formatDuration(48_000);                // "48s"; { style: "long" } → "48 seconds"
```

| export | returns |
| --- | --- |
| `formatStamp(value)` | `YYYY-MM-DD HH:MM:SS` in the viewer's zone; `""` for nullish or `""`; an unparseable value echoed as it came |
| `stampParts(value)` | `{ date, time, zone, utc, text }` — `zone` is the offset (`+02:00`, `Z` at UTC), `utc` the ISO instant for a `data-tip` |
| `formatAgo(value, { style = "long", now })` | `"3 minutes ago"` / `"3m ago"`; `"just now"` under 5 s **and for a future stamp**; `""` when unreadable |
| `formatDuration(ms, { style = "short" })` | a span, floored into the largest unit that gives at least 1: `s m h d w mo y` / `second … year`; `"0s"` for a negative or non-finite span |
| `parseInstant(value)` | epoch ms, or `null` — the one parser the rest use |

**The viewer's zone, and no zone named anywhere.** Daniel reads the same stores from Brazil and
from Germany, so a page cannot pick a zone; the browser knows where it is. **No offset is
rendered** — the exact instant is one hover away: put `stampParts(v).utc` on the element's
`data-tip`, as the `when` cell does.

**The shape is the estate's, the locale supplies only digits.** `YYYY-MM-DD HH:MM:SS` is the shape
of every log, filename and stored value, so a stamp on screen can be grepped for. Never
`toLocaleString()`: it hands the ORDER to the reader's regional setting, and one reader gets
`09/08/2026` where another gets `08/09/2026`.

**The unit changes before the number reaches 60.** At 60 s the minute claims it, so a label never
says "60 minutes ago", and an old item reads "1 year ago", not "400 days ago". A month is 30 days
and a year 365: a relative label is an approximation by nature.

**Only an ISO-8601 string, a `Date` or epoch milliseconds is an instant.** Anything else is echoed,
however date-like: V8 reads `"2026-13-45 junk"` as the 13th of June while Firefox refuses it, and a
stored value that means a date in one browser and nothing in another is the estate disagreeing with
itself. A space may stand for the `T`; it is then local time, like the system's own stamp.

**Data stays UTC.** Stored values, comparison keys, filename stamps and ISO sorts never go through
these functions — only what a person reads converts. A calendar DATE (a publication day, "last
updated") is not an instant: it keeps the surface's locale format in a `<time datetime>`.

The five are pure and touch no DOM, so a framework app imports them and renders the same strings.

## The `when` cell: how long ago, over the exact stamp (D4)

```js
import { whenHtml, initRelativeTimes } from "@danieldeusing/design/runtime/time";

cell.innerHTML = whenHtml(row.finishedAt);                   // a table's when column
foot.innerHTML = whenHtml(item.updatedAt, { inline: true }); // a card's foot: clock glyph + "3d ago"
initRelativeTimes();                                          // once per page
```

renders

```html
<time class="when" datetime="2026-09-28T10:04:00.000Z" data-tip="2026-09-28T10:04:00.000Z">
  <span class="when-ago" data-ago="2026-09-28T10:04:00.000Z">3 minutes ago</span>
  <span class="when-exact">2026-09-28 12:04:00</span>
</time>
```

- **The age leads, the exact stamp sits under it** (Daniel, 2026-08-22): a log is read to answer "is
  this recent?", and a bare wall clock makes every reader do the subtraction.
- **The second line is quieter by colour, not size.** `.when-exact` is `--muted-foreground`
  (4.67:1 or better on every theme and surface). Cockpit's opacity .6 measured 3.26 on warm; a
  smaller font is the near-miss the system deleted. Do not add either back.
- **The long form belongs in a table, the short one on a card.** "3 minutes ago" is Daniel's wording
  for the when column; "3d ago" is the cards'. `whenHtml` picks by `inline`; `style` overrides.
- **The column's 5.5rem floor comes from the content**, so the `<th>` needs no class.
- **`initRelativeTimes()` keeps every `[data-ago]` true**: every 30 s while the tab is visible, and at
  once when it becomes visible. It writes text only where the text changed, so a renderer that
  patches the same row from fresh markup simply agrees with it, and rows rendered later need nothing.
  A relative label computed once is the estate's most repeated bug — "3 minutes ago" at breakfast.
- An unparseable value renders as a bare `<span class="when-exact">` holding the raw text: visible
  and debuggable. Nothing renders nothing.

## A chart is drawn at the size it is shown (D6, D7)

```html
<figure class="chart">
  <div class="chart-plot" id="trend"></div>
  <figcaption>mistakes per graded review, per week · a hollow week has too few reviews</figcaption>
</figure>
```

```js
import { renderLineChart, renderBarChart } from "@danieldeusing/design/runtime/charts";

renderLineChart(document.getElementById("trend"), weeks, {
  label: "mistakes per graded review, per week",
  x: (w) => w.bucket, value: (w) => w.rate, solid: (w) => w.graded >= 5, sub: (w) => "n " + w.graded,
  tip: (w) => `${w.bucket}: ${w.rate} over ${w.graded} graded`,
  markers: [{ at: 4, kind: "line", tip: "the grader model changed" }, { at: 7, kind: "tick", tip: "3 rules added" }],
});
renderBarChart(plot, months, {
  label: "monthly income against expenses, in euros", x: (m) => m.month, grid: true, format: euro.format,
  series: [
    { key: "income", label: "income", value: (m) => m.income, color: "var(--cat-green)" },
    { key: "expenses", label: "expenses", value: (m) => m.expenses, color: "var(--cat-red)" },
  ],
  tip: (m, s) => `${m.month} ${s.label}: ${euro.format(s.value(m))}`,
});
```

| option | line | bar | meaning |
| --- | --- | --- | --- |
| `label` | ✓ | ✓ | the accessible name; the plot becomes `role="img"` |
| `x(row)` | ✓ | ✓ | the x label; thinned to every Nth when they would collide |
| `value(p)` | ✓ | per series | the plotted value; `null` or a non-number is a gap |
| `solid(p)` | ✓ | | `false` → a hollow dot, and the line breaks there |
| `sub(p)` | ✓ | | a second label line, e.g. `n 12` |
| `tip(...)` | ✓ | ✓ | a mark's `data-tip`; the bar's gets `(row, series)` |
| `markers` | ✓ | | `{ at: index, kind: "line" \| "tick", tip }` — a dashed vertical, or a 3px floor tick |
| `area` | ✓ | | fill under the line (12% of the series colour) |
| `grid` | ✓ | ✓ | four to six round ticks and gridlines; without it the y labels are 0 and the maximum |
| `format` | ✓ | ✓ | formats the y labels |
| `series` | | ✓ | `[{ key, label, value, color }]` — several are grouped side by side, 1px apart |

**Never scale a chart.** The SVG is written at the plot's measured pixels with no `viewBox`, so every
label is `--fs-base` because it IS `--fs-base`. Cockpit's and the family page's charts drew into a
720-unit viewBox with 9–11-unit text; shown 360px wide, that printed 5px labels. The price is a
redraw when the plot resizes — one ResizeObserver per plot, coalesced to a frame — and the same
observer draws a chart that measured 0 when it was rendered, which is every chart inside a hidden
tab. Height is `--chart-h` (default 12rem) on the plot; width is the column's.

**Colour comes from classes, never attributes.** A CSS variable in an SVG presentation attribute is
invalid and silently paints black, which on the two dark themes is invisible. So the runtime writes
geometry and class names only, and a theme switch recolours a chart without a redraw. A series'
colour is `--chart-color` — on the figure for a one-series chart, per series via `color` — and it is
always a token: `var(--cat-*)` for a categorical series (the family page's income, expenses and net
are `--cat-green`, `--cat-red` and `--cat-blue`). Never a hex.

**Marks draw at full strength.** Cockpit drew its line at .6 and its bars at .55 (2.47:1 on warm,
under the 3:1 a graphic needs). Labels are `--muted-foreground`; the axis is `--border`.

**The y axis starts at zero** whenever the data is all positive: starting at the minimum turns every
wobble into a cliff, which is how a chart lies without a wrong number.

- On a card, set `--chart-bg: var(--card)` on the card: a hollow dot is filled with it.
- The caption and anything like "peak 23" are HTML in the `figcaption`, never SVG text.
- A lazy chart in a tab draws on the tab's `tab-activated` (below), at the size the panel has when
  it is shown.
- **Every chart's numbers are also in a table on the page.** That is the accessibility contract: the
  plot is one image with a label saying what is plotted, and the tips are an extra for pointers.

**The key** is a list whose items carry the series colour; the swatch is square, because it names
a series and is not a status dot. List the series in the order they were passed: under forced
colours every second series and its swatch are drawn outlined (below).

```html
<ul class="chart-key">
  <li style="--chart-color: var(--cat-green)">income</li>
  <li style="--chart-color: var(--cat-red)">expenses</li>
</ul>
```

## One tab row, one engine: `.tabs` and `initTabs()` (D8)

```html
<div class="tabs" role="tablist" aria-label="review sections" data-tabs-hash>
  <button type="button" class="tab" role="tab" id="tab-activity" aria-controls="sec-activity" aria-selected="true">activity</button>
  <button type="button" class="tab" role="tab" id="tab-workers" aria-controls="sec-workers" aria-selected="false" tabindex="-1">workers <span class="tab-status" data-tone="destructive">failed</span></button>
  <button type="button" class="tab tab--info" role="tab" id="tab-how" aria-controls="sec-how" aria-selected="false" tabindex="-1">how it works</button>
</div>
<section class="doc tab-panel" id="sec-activity" role="tabpanel" aria-labelledby="tab-activity">…</section>
<section class="doc tab-panel" id="sec-workers" role="tabpanel" aria-labelledby="tab-workers" hidden>…</section>
```

Call `initTabs()` once. It is delegated on the document, so a tablist rendered later works without a
second call. **`aria-controls` is mandatory** — the panel it names is the tab's panel; the tablist
takes an `aria-label` and each panel an `aria-labelledby`.

**Why one engine.** Cockpit carried five, and they differed exactly where it mattered: which one
followed the hash, which one opened an ancestor, which one told a lazy panel it had been opened.

- **Activation is one path**, whatever the route — a click, a key, an incoming hash. It sets
  `aria-selected`, a roving `tabindex` and `hidden` on the group's panels, then dispatches a bubbling
  **`tab-activated`** on the tab, `detail: { panel }`. That event is the one signal a lazy panel
  listens to; cockpit's stats tab loaded on `click`, one route of three, and sat on "loading…"
  whenever it was reached by a key or a link. When an outer tab reveals a nested row, that row's
  selected tab is announced too. **To switch from code, call `tab.click()`.**
- **Keys** (APG, automatic activation): ←/→ with wrap, Home/End; disabled tabs are skipped. Alt, Ctrl
  and Meta combinations are left to the browser.
- **Deep links.** On load and on every `hashchange`, a hash naming a panel opens it — **ancestors
  first**, so `#sec-retros` also opens the outer tab around it. Following is always on; WRITING the
  hash is opt-in per row with `data-tabs-hash`, because a card's tab row must not rewrite the page's
  address. It writes with `replaceState` (a tab switch is not a history entry) and names **only the
  innermost panel** — cockpit let the ancestor write last and a reload landed on the wrong tab.
- **Disabled**: `disabled` or `aria-disabled="true"`. Either is .45, ignores the pointer (a control
  that lights up and then does nothing is lying) and is skipped by the keys.

**The look, and what not to add back.** The selected tab is the one filled thing on the row —
`--primary` with the page colour as its text, 700 — and the others are plain muted words. Daniel:
*"I am always searching the tabs."* An underline variant is retired; so are pills.

- **Focus is an inset ring** in `--ring`; on the selected tab it is the page colour, because `--ring`
  equals `--primary` on all four themes and would vanish on the fill.
- **`.tab-status`** is a state suffix in the tab — a failed worker stays visible while another tab
  is read. It takes its `data-tone` at rest and the tab's own colour when the tab is selected or
  under the pointer: a tone on the `--primary` fill measures 1.02–3.41, and on the hover tint
  paper's `--warning` measures 3.91. The word is the meaning.
- **`.tab--info`** on the first reference tab ("how it works", conformance) pushes it and its
  siblings right: on the left the tabs you go to in order to DO something, on the right the ones you
  go to in order to UNDERSTAND something.
- **`.tabs--compact`** — a tab row in a card or dialog: no margin above, tighter tabs.
- **`.tabs--strip`** — a row filling a fixed-height strip (configr's agent tabs): no wrap, no rule,
  tabs the strip's height, and the label in a `.tab-label` that truncates. A glyph in a tab is
  `--icon-size`: `<span class="ico" data-icon="package" aria-hidden="true"></span>`.
- **A truncated tab carries its full label in `data-tip`**, never a native `title`. That tip equals
  the tab's name on purpose — it is for the eye, which cannot see the cut-off text — and the tooltip
  does not describe an element with its own name, so it is not announced twice. Anywhere else, a tip
  that repeats the name is left off.
- 44px under a coarse pointer and on a phone: tabs are these pages' primary navigation.
- A filter over a card grid is not a tab. It is a `.filter-set`.

## The ticker strip: push a row, register a refresher (D9)

```html
<div class="tickstrip" id="tickers" data-label="pollers"></div>
```

```js
// Anywhere, before or after the runtime has loaded:
(window.__ddTicks ||= []).push({
  mount: "tickers", key: "review-poll", order: 1, label: "review poll",
  lastAt: heartbeat.at, intervalMs: 60000, stats: [[3, "queued"], [1, "running"]],
  busy: { since: heartbeat.runningSince }, hint: "polls the forges for pull requests to review",
});
window.__ddTickRender?.();
(window.__ddTickRefreshers ||= []).push(refreshHeartbeat); // narrow: re-fetch numbers, never a load()

// Once, from the page's module:
import { initTickStrips } from "@danieldeusing/design/runtime/tickstrip";
initTickStrips();
```

**Registration is a plain array, not a function call.** A page builds its panels in inline scripts
that run before a module at the end of `<body>`, so anything it had to call would not exist yet;
cockpit's `cockpitTickRegister?.()` swallowed every call on a cold load. Push, and poke the renderer
if it is there. `key` lets a re-push replace its row; `order` fixes the row order so it does not
depend on which fetch finished first. The array is compacted to the latest entry per mount and key.

**Two loops, and a page that ships only the first has a strip that lies.** Every second the strip
re-renders from memory ("12s ago · next 48s", no network). On its own that ages a `lastAt` fetched
once until the row turns red claiming the job stopped — and a reload turns it green, the signature
of the page being wrong. So every page that pushes a row also registers a **refresher**, run every
30 s: it re-reads the heartbeat and pushes the row again. Keep it narrow; a refresher that re-runs a
`load()` re-renders the form the reader is typing into. Both loops pause while the tab is hidden and
run at once when it returns.

| state | when | reads |
| --- | --- | --- |
| `never` | no readable `lastAt` | "never run" |
| `running` | `busy.since` parses — a run is in flight | "running 3m", and never red however old `lastAt` is |
| `stale` | older than three intervals | red, with its age |
| `ok` | otherwise | "12s ago", "next 48s" or "due now" |

`busy.since` must PARSE to count: an unreadable marker once suppressed the red for ever. The first
paint builds the table; every later one patches each row in place by `key`, so a tip open over a row
and whatever holds focus survive the 1-second clock. The strip is a named data table — a visually
hidden caption from `data-label`, a hidden header row and a hidden state word per row — and
deliberately not a live region: it changes every second. `renderTickStrip(mount, items)` draws one
mount (an element or its id) directly, for a page that keeps its own list. `hint` is the row's
`data-tip`: what the poller does, never its name again.

## A state is a `.tag`: cockpit's vocabulary (D10)

There is no state CSS here. A state is `.tag` (T1): a tone, and modifiers along four fixed axes, so
the look is the system's across the estate:

- **tone** (`data-tone`): what kind of state it is;
- **border**: `--dashed` = not the proof — skipped, superseded; `--off` (dotted) = switched off;
- **weight**: `--strong` = must not be missed;
- **strike**: `--struck` = retired.

Opacity is never an axis; cockpit's .55–.75 becomes `--off`.

| cockpit class | `.tag` |
| --- | --- |
| `st-ok`, `st-ready`, `tag-public`, `lstat-applied`, `v-PASS` | `data-tone="success"` |
| `st-failed`, `st-error`, `st-unreachable`, `lstat-invalid`, `lstat-error`, `v-FAIL` | `data-tone="destructive"` |
| `st-not-credentialed`, `tag-stranded` | `data-tone="destructive"` + `tag--strong` |
| `st-asked`, `st-credentialed`, `st-misconfigured`, `lstat-pending`, `v-INCONCLUSIVE` | `data-tone="warning"` |
| `st-warn` | `data-tone="warning"` + `tag--strong` |
| `st-gated`, `tag-silent`, `tag-manual`, `ty-review`, `st-issue-plan` | `data-tone="info"` |
| `tag-auto`, `v-BLOCKED`, `st-review-fix` | `data-tone="pending"` |
| `st-timed_out` | `data-tone="pending"` + `tag--dashed tag--strong` |
| `ty-plan`, `st-issue-impl` | `data-tone="primary"` |
| `st-disabled`, `st-excluded` | `tag--off` |
| `st-not-actionable`, `tag-unknown`, `ty-unknown`, `lstat-dismissed`, `v-SKIPPED` | `data-tone="muted"` + `tag--dashed` |
| `lstat-retired` | `data-tone="muted"` + `tag--struck` |
| `lstat-no-action`, `ty-ticket` | `data-tone="muted"` |
| the verdict families `.lstat`, `.v`, `.mx-chip` | add `tag--strong` |
| `scope-global`, `.surface-public .surface-badge` | `data-tone="primary"` + `tag--solid` — the widest blast radius only |
| `scope-repo`, `.surface-internal .surface-badge` | `data-tone="muted"` |
| `unreachable` (containers page) | `data-tone="destructive"` + `tag--strong`, in lower case |

```html
<span class="tag" data-tone="warning" data-tip="waiting for my approval">asked</span>
```

- **The words stay the surface's**; the look is the system's. Cockpit keeps its `STATE_TIP`
  explanations as each tag's `data-tip` — an explanation, never the word again.
- **A state with no class today** (`approved`, `dispatched`, `denied`) takes a tone by the same logic:
  waiting → warning, done well → success, spent or superseded → muted `tag--dashed`, broken →
  destructive.
- **The containers' status text is not a tag.** It is `.state` with the word unchanged.
- In a pinned row, the row's tint is 5% `--warning` because a tag's tone text sits on it (4.59:1 or
  better everywhere); see the dense table in `tables-and-forms.md`.

## Forced colours and print

Under a forced palette (Windows High Contrast) the browser replaces backgrounds with Canvas and text
with CanvasText, drops shadows, and paints a Canvas **backplate** behind text — which erases every
state drawn with a fill. `data.css` redraws each in system colours, and `scripts/check-data.mjs`
reads the PAINTED pixels of each in both of Chromium's palettes, light and dark — a computed style
says what was asked for, not what reached the screen:

- **The selected tab is `forced-color-adjust: none` with a whole system pair**, `HighlightText` on
  `Highlight` (11.31:1 light, 8.73:1 dark). Setting only the two colours is not enough, and that is
  the mistake to avoid anywhere a state carries text: the label is painted on the backplate in its
  own colour — white on white, black on black — so the fill is right and the word is gone (2.8:1 in
  pixels), while every computed style still looks correct.
- A disabled tab or row is `GrayText` at full strength (about 14:1): the palette's own word for
  unavailable. Faded to .45 on top of it, it painted at 2.98:1 light and 3.25:1 dark.
- A pinned row's bar is a real 3px `CanvasText` border, on the card's edge when stacked.
- **A chart is repainted.** SVG keeps its theme colours under a forced palette, so on a dark one
  warm's chart text measured 3.52:1, its line 2.94:1 and its first series' bars 2.93:1, and the key's
  swatches — backgrounds — vanished into Canvas. With `data.css`, text, line, axis, dots and bars are
  `CanvasText` (21:1), the grid `GrayText`, and the two states that were colour become fill against
  no fill: a hollow dot is Canvas inside a `CanvasText` ring, and **every second series is outlined
  instead of filled**, its swatch in the key too — so list the key in series order. A third series
  looks like the first; the key's words and the table beside the chart carry it, as they must anyway.
- Glyphs (`.ico`, the tickstrip's dots) are the icon set's and the strip's business: a mask glyph
  paints its parent's forced text colour (`forced-color-adjust: preserve-parent-color`).

**Print** carries every tab panel and no tab row (a printout has no controls, as every `<details>`
opens), prints a pinned row's bar as a border, and prints the tint, the charts and the key's swatches
exactly: a chart printed without its colours is a set of axes.
