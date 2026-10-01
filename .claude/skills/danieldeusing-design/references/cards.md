# Cards and lists: anatomy, grids, tiles, panels, rows, entries, trees, splits, clamps, consoles

Reference for the `danieldeusing-design` skill. Read it before you build a grid of cards, a dashboard
tile, a pane with a title strip, a list of links or of choices, a timeline, a file tree, a resizable
split, a clamped README or a log view. All of it is `src/cards.css` (0.60.0). The card box itself,
`.card-terminal`, is in `components.css` — its padding, its edge and the hover of a card that is a
link are described in `components.md`; this file is what goes inside it and around it.

Before 0.60.0 most of these were drawn separately on several of seedr, configr, studio,
danieldeusing.de, cockpit, netmon and the family site, each a little different, and none of the
differences had been chosen. **Use the class; never re-draw one of these locally.**

Contents:

- Which one
- Card anatomy — `.card-head`, `.card-title`, `.card-link`, `.card-desc`, `.card-foot` and the modifiers
- `.card-grid`
- `.stat-tile` and `.stat-grid`
- `.panel`
- `.row-list` and `.list-row` — and the one current-row marker
- `.entry` — a dated or labelled record
- `.manpage`
- `.tree` — and the keyboard an app implements
- `.split`, `.splitter`, `.pane-collapsed` — and the keyboard an app implements
- `.clamp` — and the measuring an app implements
- `.console`
- What every one of them does for you: hidden, forced colours, print, motion

## Which one

| you have | write |
|---|---|
| a grid of things a reader clicks into — skills, projects, articles | `ul.card-grid` of `.card-terminal.card-terminal--link` cards, built from the anatomy below |
| one number on a dashboard, and what it means | `.stat-tile` in a `.stat-grid` |
| a box with a title strip, actions, a body that may scroll — a pane | `.panel` |
| a list of links, or of choices, one per line | `ul.row-list` of `.list-row` |
| a record with a date or a label beside it — a timeline, a CV, an article index | `ol.entry-list` of `.entry` |
| an about card that reads like `man daniel` | `.card-terminal.manpage` |
| files and folders, a nested settings outline | `ul.tree` |
| two panes side by side, fixed or resizable | `.split` of `.split-pane`s, a `.splitter` between them when it resizes |
| a long README shown short, with a way to open it | `.clamp` |
| a log, an agent's output, a live stream of lines | `.console` |

**A card is something you click into; a panel is something you work in.** A card has one link and a
hover. A panel has a head with actions, no hover and no focus of its own. When a cockpit "card" had
buttons in its head and no destination, it was a panel all along.

## Card anatomy

```html
<ul class="card-grid">
  <li class="card-terminal card-terminal--link">
    <div class="card-head">
      <button type="button" class="value-filter" aria-label="filter by source: official"><span class="tag">official</span></button>
      <span class="ico" data-icon="package" aria-hidden="true"></span>
    </div>
    <h3 class="card-title"><a class="card-link" href="/skills/review">review</a></h3>
    <p class="card-desc">Reviews the current diff against the repository's conventions.</p>
    <footer class="card-foot"><span class="meta-stat">…</span><time datetime="2026-09-25">3 days ago</time></footer>
  </li>
</ul>
```

**One link per card, and its name is the title.** The link is the `<a class="card-link">` inside the
title; `.card-terminal--link` on the card stretches that link's `::after` over the whole card, so
the whole box still takes the click. danieldeusing.de's cards made their whole text the link name,
so a screen reader read title, description, date and tags as one link; configr made the whole card
a `role=button` div. This is seedr's pattern, with one focus ring where seedr drew two.

- **Every other control in the card is raised above the link for you**: a `button`, another `a`,
  an `input`, a `select`, a `textarea`, a `summary`, a `label`, anything a `tabindex` of 0 or more
  makes focusable. A value filter (`button.value-filter`) or a favourite star (`.btn-icon`) presses
  as itself. Do not give it a z-index of your own.
- **The overlay stretches only inside a host that declares it** — `.card-terminal--link`, or the
  `.entry` below. A `.card-link` in a card without the modifier is a plain title link and the card has
  no hover: visibly wrong, and harmless. Unscoped, the same slip would lay an invisible link over
  whatever positioned box sits above the card.
- **One focus ring, on the card.** The card draws the ring when its link has keyboard focus
  (`:has(.card-link:focus-visible)`), and the link's own outline is suppressed — a ring around one
  word in the middle of a card says nothing about the card. An engine without `:has()` keeps the
  link's ring instead.
- **A card whose whole box is the link and that holds no other control** may be the `<a>` itself —
  `a.card-terminal` — or, when it opens something in place rather than a page, the `<button>`
  itself. The moment it needs a second control, it is `--link` and `.card-link`, because an
  interactive element inside an `<a>` or a `<button>` is invalid HTML.
- **A link that opens a new tab says so**: an `aria-label` suffix ("… (opens seedr.dev)") or a
  visible `↗`.

The parts:

| class | what it is |
|---|---|
| `.card-head` | the top row — a value filter, a tag, a glyph, a star. Wraps, first item start, last item end. Its words sit on one baseline, so a `.card-title` beside a `.tag--bracket` lines up (0.61.0; they were 3px apart), and a lone `.ico` or `.btn-icon` centres on the row |
| `.card-title` | the name, **any heading level**; the class sets the size (body size, weight 500). 500, not bold: forty bold titles in a grid are a wall |
| `.card-link` | the title's link. Takes the title's colour, no underline; the card's hover is its hover |
| `.card-desc` | the description, muted, clamped to 3 lines (`--clamp-lines: 2` on it, in the page's stylesheet, to change it). Left-aligned — seedr's justified text opens rivers in a narrow monospace column |
| `.card-foot` | stats and a date, muted. Sits on the card's floor, so every foot in a row of cards lines up |

The parts are spaced as a column (0.5rem apart) by the card itself: inside a `.card-grid`, and on any
card that has a `.card-title` child. In a grid every card also stretches to the tallest in its row.

### Modifiers

- **`[data-tone]` — the state of the thing the card stands for** (configr's "installed" is
  `data-tone="success"`): a half-strength edge and a **4% tint**, lighter than the 6% step the
  system puts under tone-coloured text, because a card also carries its description and foot in
  `--muted-foreground`. On warm that text measures 4.49:1 on a 5% destructive tint and 4.42 on 6%;
  with 4% the worst of all seven tones is 4.56. The tint is a hint. **Write the state as well** — a tag inside the card —
  because forced colours (Windows High Contrast) erase both the tint and the edge colour. A card's
  tone is its own or none: an untoned card inside a toned box keeps its own colours.
- **`--rule` — the TYPE of the thing** (configr's list cards: a skill, an agent, a hook): a 4px start
  edge in `var(--rule-color, var(--primary))`, where the surface sets `--rule-color: var(--cat-teal)`
  — a categorical hue, never a free colour. It keeps its colour under the pointer and beside a tone,
  because it is content, not chrome. Write the type too; forced colours erase the hue.
- **`--flash` — an outcome just landed on this card** (configr pulses an installed card): a ring in
  the card's tone that fades over half a second. Add the class, remove it on `animationend`; to play
  it again, remove it, force a reflow (`card.offsetWidth`), add it. It never moves the card —
  configr's hover lift is not adopted: a card that moves under the pointer is a card the pointer can
  lose. Reduced motion and `html.anim-off` stop it.

**No hover on a card that is not a link**: a static card, a settings box, a figure. The pointer
is answered only where a click lands.

## `.card-grid`

```html
<ul class="card-grid skill-grid">…cards…</ul>
<!-- the page's stylesheet: .skill-grid { --card-min: 18rem; --card-gap: 0.75rem; } -->
```

As many columns of at least `--card-min` (16rem) as fit, and one column on a phone — `min(…, 100%)`
stops a 16rem track from overflowing a narrower screen. The gap is `--card-gap`, 1rem (seedr's and
danieldeusing.de's). **`auto-fill`, not `auto-fit`**: a row of two cards keeps card-sized cards
instead of stretching them across the page. It resets the list, so the grid can be the `<ul>` a list
of cards semantically is, and it zeroes its children's margins: base.css spaces a `<section>` that
follows another one, and a grid item pushed down by that sits lower than its neighbours.

Two lists side by side (the CV's certificates and awards) are two `.entry-list`s in a `.card-grid`.
Nothing new is needed.

## `.stat-tile` and `.stat-grid`

```html
<div class="stat-grid">
  <a class="stat-tile" data-state="action" href="/automation/approvals">
    <span class="stat-label">approvals</span><span class="stat-value">3</span>
    <span class="stat-note">waiting on me</span><span class="stat-cta">review →</span></a>
  <div class="stat-tile" data-state="unknown">
    <span class="stat-label">executions</span><span class="stat-value">—</span>
    <span class="stat-note">could not count</span><a class="stat-cta" href="/automation/execution">retry →</a></div>
</div>
```

One number and what it means. cockpit's home tiles, netmon's summary, seedr's category tiles,
configr's stat counter and three family pages each drew their own; this is the one tile. The value is
`--fs-xl` (seedr's 18px; cockpit's 24px and the family pages' own sizes move to it), bold and
tabular.

| part | what it is |
|---|---|
| `.stat-label` | the eyebrow — upper case by CSS, so **write it in lower case** (a screen reader reads the source) |
| `.stat-value` | the number. Tabular figures, so a refresh does not jitter |
| `.stat-note` | what the number means, muted |
| `.stat-cta` | `--primary`, at the tile's end corner. A `<span>` when the whole tile is the link (`a.stat-tile`); an `<a>` of its own in a static tile (44px on a touch screen) |
| a leading `.ico.ico--xl` | seedr's category glyph. It paints the colour of the text around it, so a category hue (`--cat-*`) goes on a wrapper, not on the glyph: forced colours cannot reach a `color` declared on the glyph itself |

**The state is `data-state`**, cockpit's vocabulary:

| `data-state` | draws | means |
|---|---|---|
| `idle` | a `--success` start edge | fine, nothing waits |
| `action` | `--warning` edge and value, a 4% tint | something waits on me |
| `broken` | the same in `--destructive` | it is failing |
| `unknown` | a dashed muted edge, a muted value | the count could not be taken |

**Unknown never reads as 0.** A tile that could not count renders `—` or `?`, never `0`: a confident
zero on a dashboard is a lie that looks exactly like good news. A tile can also take a plain
`data-tone`, which colours its start edge and its label.

- **4% tint, not 6%**: the label and the note are `--muted-foreground`, which measures 4.47:1 on a
  6% warning tint and 4.42 on a 6% destructive one (warm, over `--card`). At 4% the worst is 4.56,
  and the warning value on its own tint is still 4.89.
- **The state edge keeps its colour under the pointer.** A tile that is a link takes the card's hover
  (`--primary` edge, `--secondary` fill) on every side but the state edge, so hovering a broken
  service never makes it look fine.
- **Write the state in the note.** Forced colours reduce every edge to one colour; the dashed
  unknown edge survives, the others do not. The words are what always survives.
- `--stat-min` (11rem) is the grid's one knob. `.stat-grid` uses `auto-fit`: a dashboard's tiles
  share the row.

## `.panel`

```html
<section class="panel" aria-labelledby="files-t">
  <header class="panel-head">
    <span class="ico" data-icon="folder-tree" aria-hidden="true"></span>
    <h3 class="panel-title" id="files-t">files</h3>
    <div class="panel-actions">
      <button type="button" class="btn-icon btn-icon--bare btn-icon--sm" data-icon="chevrons-up-down"
              aria-controls="files-tree" aria-expanded="false" aria-label="expand all folders"></button>
    </div>
  </header>
  <div class="panel-body">…</div>
  <footer class="panel-foot">…</footer>                    <!-- optional -->
</section>
```

A `--card` box whose head is a ruled 2.5rem strip: seedr's and configr's shape, which cockpit's
transparent, rule-less entity cards move to. **A container: no hover, no focus of its own.**

| part | what it is |
|---|---|
| `.panel-head` | the strip. Its colour is `--primary`, which only its glyph takes: every other child is `--foreground`, a plain link (no class) included, while a classed child — a tag, a count, an icon button, a `.link-quiet` — keeps its own colour. Bare text straight in the head takes the head's colour — wrap it |
| `.panel-title` | any heading level; body size, weight 500 like a card title; cut off with an ellipsis rather than wrapped, so the head stays one line |
| `.panel-head--eyebrow` | the title in eyebrow type — studio's pane heads and explorer strips |
| `.panel-actions` | at the head's end: `.btn-icon`s, a `.segmented`, a select |
| `.panel-body` | padded by `--card-pad`; `.panel-body--flush` runs a tree, a row list, a table or code edge to edge |
| `.panel-foot` | the head mirrored, ruled above; a `.panel-actions` in it sits at the end, as in the head |

- **Fixed height**: give the panel a `block-size` (or make it a `.split-pane`) and only the body
  scrolls; the head and the foot stay put.
- **Collapsible** (cockpit's config cards): a `.disclosure-btn` first in the head, whose
  `aria-controls` is the body's id and whose name says what it opens ("expand poi/vu3"); the
  collapsed body carries `hidden`. The page keeps the set of open panels across re-renders, or a
  poll collapses what the reader opened. A collapsed panel is one line: its head drops its rule.
- **Never put the actions inside a `<summary>`**: a summary is one control, and a button in it is a
  second control inside the first. A section whose head carries actions is a panel with a
  `.disclosure-btn`, not a `details.fold`.
- **The identity rail** (cockpit's agent cards):
  `<article class="panel panel--mark"><div class="panel-mark" aria-hidden="true"><img src="…" alt=""></div><div class="panel-main">…head, body…</div></article>`
  — a 2.5rem column holding a logo or initials on a 5% muted tint (cockpit's 7% put muted text at
  4.44:1 on warm; 5% is 4.55). Decorative; the title names the thing.
- **A panel sets no outer margin**, and it resets the 2.5rem that base.css gives a `<section>` after
  a section: in a stack of panels that rhythm is a hole. Space a stack with the container (a flex or
  grid gap); a margin you set yourself still wins.
- configr's `--primary`/25 pane edge is not adopted — a fifth edge colour, under 3:1.

## `.row-list` and `.list-row`

```html
<div class="card-terminal card-terminal--flush">
  <ul class="row-list row-list--loose">
    <li><a class="list-row" href="/articles/fantasy-football">
      <time class="list-row-lead" datetime="2026-09-25">2026-09-25</time>
      <span class="list-row-title">AI agents play fantasy football</span>
      <span class="list-row-meta"><span class="tag">series · part 2</span></span></a></li>
  </ul>
</div>

<!-- a selection list: the master column of a master-detail view -->
<ul class="row-list row-list--select" aria-label="capabilities">
  <li><button type="button" class="list-row" aria-current="true">
    <span class="list-row-title">review</span><span class="list-row-meta">rw-</span></button></li>
</ul>
```

A hairline between rows, never around each one: a list is one thing. **The row is the control** — an
`<a>` or a `<button>`, one per row — and it brings its own reset, so link rows and button rows look
alike.

| part | what it is |
|---|---|
| `.list-row-lead` | a date or an id, muted, tabular, never wrapped. `--row-lead-w: 10.5rem` on the list, in the page's stylesheet, gives every lead one width, so the titles start on one line |
| `.list-row-title` | bold `--primary`, cut off on one line from 40rem up and wrapped below it (on a phone the title is the only thing the row has) |
| `.list-row-desc` | a line under the row, muted, clamped to 2 lines |
| `.list-row-meta` | at the row's end, muted: a tag, a permission string, `↗` |

Modifiers go on the list: `--ruled` (a list standing on the page: a rule over the first row and
under the last), `--loose` (1rem rows — danieldeusing.de's articles), `--select` (a selection list:
tight rows, the title in the ordinary weight and colour). Inside `.card-terminal--flush` the rows
carry the card's inset, so the hairlines run edge to edge.

**Two hovers for two jobs.** A row that navigates underlines its title, because the row IS a link. A
row in a `--select` list takes the menu highlight, `--muted`, because it is a choice among siblings.

### The current row — one marker for the whole system

`aria-current="true"` (the chosen item of a selection list), `aria-current="page"` (the page you are
on, in a nav list) or `aria-selected="true"` marks the row. **`aria-selected` belongs only to a role
that supports it** — `option` (a `role="listbox"` list), `row`, `gridcell`, `tab` or `treeitem` —
never to a plain `<button>` or link: `<ul role="listbox"><li role="none"><button class="list-row"
role="option" aria-selected="true">`. **The marker is the rail's**: the
same 12% `--primary` tint, the same 3px inset edge, the same bold `--primary` title with the rail's
glow (`chrome.css`, `.ls-row[aria-current="page"]`). configr drew "this one" six different ways and
cockpit a seventh; a reader who has learned one marker should never have to learn a second. The
tree's selected row is the same marker.

- **On the tint, muted text fails**: 3.95–4.37:1 on warm and 3.96–4.55 on mono, over the three
  surfaces. So a chosen row (here and in the tree) makes `--muted-foreground` its `--foreground`,
  and everything muted inside follows — the lead, the meta, the description, and a muted `.tag`,
  `.count` or glyph from any package: 7.80:1 or better on every theme.
- **A tone on the tint fails too** — a warning tag measured 3.73:1 (paper, over `--muted`), and no
  lighter tint saves it. Inside a chosen row every tone (`data-tone`) is mixed 20% toward
  `--foreground`: it keeps its hue and reaches 4.63:1 or better on every theme and surface. Only the
  five status tones are lifted — `success`, `warning`, `destructive`, `info`, `pending`; `primary`
  (4.72) and `muted` (7.80) need no lift. A category hue (`--cat-*`) is not lifted and passes by
  its own margin (4.70 at worst). Any other colour inside a chosen row is not covered: measure it.
- **The rail's trailing `←` is not copied.** It points from the right-hand rail back at the content;
  a list or a tree sits on the content's left, where the same arrow points away from what it
  describes.
- A disabled row (`disabled` on a button, `aria-disabled="true"` on a link) is .45 and takes no
  hover. The page must ignore a click on an `aria-disabled` link; CSS cannot.
- Decorative lead glyphs (danieldeusing.de's emoji) are `aria-hidden`. A row that opens a new tab
  says so (`↗` or an `aria-label` suffix), as a card does.

## `.entry`

```html
<ol class="entry-list entry-list--ruled">
  <li class="entry">
    <time class="entry-lead" datetime="2026-09-25">2026-09-25</time>
    <div>
      <h2 class="entry-title"><a class="card-link" href="/articles/fantasy-football">AI agents play fantasy football</a></h2>
      <p class="entry-desc">…</p>
      <p class="meta">~6 min read · <button type="button" class="value-filter" aria-label="filter by tag: agents">#agents</button></p>
    </div>
  </li>
</ol>
```

A record with a label column: danieldeusing.de's timeline, CV, article index and apps page. They used
eight label widths; there are three.

| class | lead column | gap | for |
|---|---|---|---|
| `.entry` | 8.75rem | 2rem | a date — the default |
| `.entry--narrow` | 5rem | 1.5rem | a year; a certificate |
| `.entry--wide` | 12.5rem | 2.5rem | an aside holding a name, a status and a stack line |

Below 40rem the lead sits over the body; `.entry--keep` stays two columns at every width
(certificates, awards). `.entry-lead--accent` is the timeline's bold `--primary` year. The title
takes its **element's** size (an `h2` is `--fs-xl`, a `p` the body size) in bold `--primary`; the
description sits .75rem under it, muted. `.entry-list--ruled` rules each entry off, above the first
and below every one, with 2rem of air (2.5rem around `--wide` ones).

**The whole entry opens the title.** danieldeusing.de underlined the title when the pointer was
anywhere on the entry while only the title took the click — a hover that promised more than it
delivered. The title link is the card's `.card-link`, stretched over the entry, the `#tag` buttons are
raised above it, and the entry draws the one focus ring. The title is a real heading; the date is a
`<time datetime>`; a list whose order means something (a timeline) is an `ol`.

## `.manpage`

```html
<article class="card-terminal manpage" aria-labelledby="man-name">
  <p class="manpage-frame"><span>DANIEL(1)</span><span>personal manual</span><span>danieldeusing.de</span></p>
  <h2 class="manpage-sect" id="man-name">NAME</h2>
  <div class="manpage-body"><p>Daniel Deusing</p></div>
  <h2 class="manpage-sect">SYNOPSIS</h2>
  <div class="manpage-body"><p>…</p></div>
  <p class="manpage-frame"><a class="link-quiet" href="/about">~/about</a><span>2026</span><span>(END)</span></p>
</article>
```

danieldeusing.de's man-page card, on its home, configr and seedr pages. A header and a footer row
of three equal slots (the middle one hidden below 40rem), section headings in bold `--primary`,
bodies indented 1.25rem (1.75rem from 40rem) in `--muted-foreground`. Two corrections to the original: the frame rows were
faint text at 11px (2.3–2.9:1) and are the body size in `--muted-foreground` now (4.84:1 on
`--card`); the section labels were paragraphs and are **headings** now, at the level the page's
outline needs, so NAME → SYNOPSIS is something a screen reader can jump between. The capitals are
authored, as a man page prints them. The card is static: the card's padding, no hover.

## `.tree`

```html
<ul class="tree" role="tree" aria-label="files of review">
  <li role="treeitem" aria-level="1" aria-expanded="true" tabindex="0">
    <span class="tree-row"><span class="ico" data-icon="folder-open" aria-hidden="true"></span><span class="tree-label">src</span></span>
    <ul role="group">
      <li role="treeitem" aria-level="2" aria-selected="true" tabindex="-1">
        <span class="tree-row"><span class="ico" data-icon="file-code" aria-hidden="true"></span><span class="tree-label">app.ts</span>
          <span class="tree-meta"><span class="count">3</span></span></span>
      </li>
    </ul>
  </li>
</ul>
```

Files, folders, a nested outline. The look and the markup are the system's; **the keyboard is the
app's** — there is no runtime, because no build-free page has a tree and seedr's and configr's are
framework components (a framework never lets a design-system script walk nodes it owns).

- **Depth is drawn, as in the rail**: each level hangs 1rem further in off a vertical guide, so the
  eye can follow which parent a row belongs to.
- **The label goes in `.tree-label`, and it is required.** The row carries its glyph's colour (muted
  on a leaf, `--primary` on a branch), because a glyph paints its parent's colour; the label resets
  to `--foreground`. Text straight in the row would take the glyph's colour. The span is also what
  is cut off with an ellipsis when the name is longer than the tree is wide.
- **A branch** (a treeitem with `aria-expanded`) gets a chevron — right when closed, down when open —
  and its folder glyph is `--primary`; a leaf gets a spacer, so leaves and branches line up. Glyphs:
  `folder-open` / `folder` for a branch, `file` / `file-code` for a leaf. The chevron is
  `--muted-foreground`, not the row's colour faded: faded `--primary` on a hovered or selected row
  measured 2.39–2.59:1, under the 3:1 a state glyph needs, on exactly the rows being looked at.
- **Hover** is `--muted` behind `--primary`. **Selected** (`aria-selected="true"`) and **current**
  (`aria-current="page"`) are the one current-row marker (above).
- **The focus ring sits on the row**, not around the item: a focused open branch would otherwise
  outline its whole subtree.
- `.tree-meta` pushes counts, tags or a hover-revealed action (`.reveal`) to the row's end.
- **A tree that navigates** (configr's settings) follows APG's navigation treeview: the LINK is the
  treeitem, and the `<li>` steps aside.

  ```html
  <ul class="tree" role="tree" aria-label="settings">
    <li role="none">
      <a class="tree-row" role="treeitem" aria-level="1" aria-expanded="true" href="/agents" tabindex="-1"><span class="tree-label">agents</span></a>
      <ul role="group">
        <li role="none"><a class="tree-row" role="treeitem" aria-level="2" aria-current="page" href="/agents/codex" tabindex="0"><span class="tree-label">codex</span></a></li>
      </ul>
    </li>
  </ul>
  ```

  `aria-expanded` and `aria-current="page"` go on the `<a>`, and so does the roving `tabindex`: the
  tree is ONE tab stop, not a tab stop per link. Enter follows the link; the arrows move as below.
  A search above it is a `.search-field`; matches are `<mark>`, and the ancestors of a match open.
- `aria-disabled="true"` on a treeitem draws it at .45 with no hover.

### The keyboard the app implements (APG tree view; seedr's handler is the reference)

| key | does |
|---|---|
| Tab | one tab stop for the whole tree — roving `tabindex`: the focused item `0`, every other `-1` |
| ↓ / ↑ | next / previous VISIBLE item |
| → | on a closed branch: open it. On an open branch: move to its first child |
| ← | on an open branch: close it. Otherwise: move to the parent |
| Home / End | first / last visible item |
| Enter / Space | activate: select a leaf, toggle a branch (in a navigation tree, Enter follows the link) |
| a printable character | type-ahead: focus the next visible item whose label starts with it (typed quickly, the characters add up to a prefix) |
| `*` | open every closed sibling branch at the focused item's level |
| Shift+F10 or the Menu key | the row's context menu, when it has one |

ARIA: `role="tree"` with a label; `role="treeitem"` with `aria-level`; `aria-expanded` on every
branch; `aria-selected` on selectable items, or `aria-current="page"` in a navigation tree;
`role="group"` on each nested list. **Select on activation, not on focus** — seedr fetches a file
when it is selected, and arrowing past forty files must not fetch forty.

## `.split`, `.splitter`, `.pane-collapsed`

```html
<div class="split" id="explorer">   <!-- the page's stylesheet: #explorer { --split-size: 18rem; } -->
  <section class="panel split-pane" id="files">…</section>
  <div class="splitter" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="files"
       aria-label="resize file list" aria-valuemin="160" aria-valuemax="640" aria-valuenow="288"></div>
  <section class="panel split-pane">…</section>
</div>
<div class="splitter" role="separator" tabindex="0" aria-orientation="horizontal" aria-controls="…"
     aria-label="resize file preview" aria-valuemin="150" aria-valuemax="1200" aria-valuenow="500"></div>

<!-- what a hidden pane leaves behind -->
<button type="button" class="pane-collapsed" aria-controls="files" aria-expanded="false" aria-label="show files">
  <span class="ico" data-icon="panel-left-open" aria-hidden="true"></span><span aria-hidden="true">files</span></button>
```

- **The first pane is `--split-size` wide (33% by default) and the last takes the rest.** When a
  pane is hidden and its strip stands in for it — on either side, the pane removed or kept in place
  with `hidden` — the pane left over takes the room. Hide the pane's splitter with it.
- **Without a splitter** (cockpit's fixed master-detail) a hairline separates the panes; give the
  first one a `min-inline-size` if it must not get narrower than its content.
- **Below 48rem** the panes stack .75rem apart and the splitters inside the split go. Give each
  pane its own `max-block-size` there (seedr: 16rem of tree, 24rem of preview), or one long pane
  crowds out the other.
- **`aria-orientation` decides the splitter's shape**: `vertical` is the line between side-by-side
  panes (col-resize), `horizontal` is a grip under a block (row-resize). The line rests in
  `--control-edge` — **it is a control, so it has a control's edge**: drawn in `--border` it was
  1.23–2.00:1, a divider's contrast on a thing a reader has to find and grab. Under the pointer, on
  focus and while dragged it lights `--primary`.
- **On a touch screen** the splitter grows to a 44px target and takes the growth back with negative
  margins, so the hit area overlaps the panes while the line and the gap stay where they were.
- **`.pane-collapsed`** is what a hidden pane leaves: a 2rem strip with the pane's name written down
  it, which brings the pane back in one click. Its rule sits on the content side; `--end` is for a
  right-hand pane, and mirrors its glyph (the set has no right-hand panel glyph). Below 48rem it becomes a 2rem bar with the label read across. Its name is its
  `aria-label` ("show files"); a `data-tip` saying the same thing again is announced twice — leave
  it off, or make it say something the name does not.
- Nothing animates: a pane follows the pointer.

### The keyboard and pointer the app implements (APG window splitter; seedr's values)

| input | does |
|---|---|
| ← / → (vertical) or ↑ / ↓ (horizontal) | move by 1.5rem (24px) |
| PageUp / PageDown | move by 6rem (96px) |
| Home / End | to the minimum / the maximum |
| Enter | may collapse the controlled pane and restore it (APG). Collapsed, `aria-valuenow` is `0` (the pane has no size), so a collapsible pane's `aria-valuemin` is `0`; restored, it returns to the size before the collapse |
| pointer | drag with pointer capture; set `data-dragging` on the splitter while dragging |

Keep `aria-valuenow` (px) in step with the size. **A pane that can be resized can also be hidden and
restored with one click** — the strip, and a hide `.btn-icon` (`panel-left-close`) in the pane's
`.panel-head` — because dragging must never be the only way (WCAG 2.5.7). Remember the size per key
when the page wants it (studio: `localStorage`). ARIA: `role="separator"`, `tabindex="0"`,
`aria-orientation`, `aria-controls`, `aria-valuemin` / `aria-valuemax` / `aria-valuenow`, and a name
that says what it resizes.

## `.clamp`

```html
<div class="section-head">
  <h3 class="prompt">cat README.md</h3>
  <button type="button" class="btn-icon btn-icon--bare btn-icon--sm" data-icon="chevrons-up-down"
          aria-expanded="false" aria-controls="readme" aria-label="show full content"></button>
</div>
<div class="clamp" id="readme" data-clamped>…</div>
```

seedr's and configr's detail pages cap a README at 240px with a fade — one component written twice. A
height clamp, not a disclosure: `details.fold` hides everything or nothing; this shows the first
screenful so the reader can decide whether to open the rest.

`data-clamped` caps the content at `--clamp-h` (15rem) and fades its last 4rem into the surface
under it. **The fade has to match that surface**: `--clamp-fade` is `--background` by default, and a
card, a panel and a dialog set it to `--card` for you. A fade to the wrong colour paints a band across
the text instead of dissolving it. Print opens every clamp.

### The measuring the app implements

1. Render the content open: no `data-clamped`, no toggle.
2. Measure. When `scrollHeight` exceeds `--clamp-h` by more than half a rem, set `data-clamped` and
   show the toggle. A clamp that is always on puts a button that opens nothing under every short
   README.
3. The toggle flips `data-clamped` and its own `aria-expanded`, its name ("show full content" /
   "show less content") and its glyph (`chevrons-up-down` while clamped, `chevrons-down-up` while
   open).
4. Measure again when the width changes (a ResizeObserver). Content that stops overflowing loses its
   toggle.

The toggle carries `aria-expanded` and `aria-controls`. Clipping is visual only: the hidden text stays
in the accessibility tree.

## `.console`

```html
<section class="console" aria-labelledby="log-t">
  <header class="console-bar">
    <span class="console-dots" aria-hidden="true"></span>
    <h3 class="console-title" id="log-t">agent output</h3>
    <p class="console-status" role="status"><span class="dot dot--pulse" data-tone="success" aria-hidden="true"></span>live</p>
  </header>
  <div class="console-body" tabindex="0" aria-labelledby="log-t"></div>
</section>
```

studio's agent log and test panel (the window chrome) with cockpit's live log (the status word and the
follow behaviour). The body is the page colour inside a `--card` frame, so the output reads as a well
in the window.

- **Lines are elements, appended from script with `textContent`** — log lines are untrusted text. The
  body keeps whitespace (`pre-wrap`, tab size 2) and wraps long lines, which also means any whitespace
  BETWEEN the line elements renders: never indent them in markup.
- **Height**: `--console-h` (55vh by default, never under 12rem). A horizontal `.splitter` under the
  console can set it (studio remembers it). `.console--fill` fills its container instead — a drawer,
  a pane; inside a drawer, drop the bar and let the drawer's title name the body.
- **The status** is one short word and a dot, never a sentence: it does not wrap, and a longer one is
  clipped at the bar's edge (`min-inline-size: 0`) rather than widening the bar and the page.
  `data-tone="pending"` connecting, `"success"` + `dot--pulse` live,
  `"muted"` ended, `"destructive"` refused. The word says it too — the colour is never the only signal.
- **It follows the theme.** cockpit's drawer pinned a near-black log in every theme to protect ANSI
  colours it never parsed, and its highlight pair measured 4.07:1. A search match is `<mark>`.

### The behaviour the page implements

- **Follow the bottom** while the reader is within 1.5rem (24px) of it. Scrolling up pauses, and the
  status says so (`paused`), and a "jump to newest"
  `.btn-terminal.btn-terminal--ghost.btn-terminal--compact` resumes; the hint ("scroll to the bottom to
  resume") belongs on that button, as its `data-tip`, not in the status.
- **Search** sits above the body (a `.search-field` with its match count, in a drawer's toolbar or a
  `.panel-head`); Enter and Shift+Enter move between matches, and the line holding the current one
  carries `.console-line--current`.
- **Not a live region.** Thousands of lines announced one by one would make the page unusable with a
  screen reader (studio's reasoning, kept). The STATUS line is `role="status"`, so "reconnecting…"
  and "ended" are heard. The body is focusable (`tabindex="0"`) so the keyboard can scroll it, and
  named by the title.

## What every one of them does for you

- **`hidden` hides any of them**, whatever `display` the class sets: tokens.css answers that once for
  the whole system. Do not add a `[hidden]` rule of your own.
- **Forced colours** (Windows High Contrast): the tree's chevrons and the glyphs in panel heads and
  tree rows take the colour their row is forced to, the splitter rests in the system's button colour
  and lights up in `Highlight`, and a current or selected row — and the console's current line — is
  drawn as the platform draws a selection, `Highlight` behind `HighlightText`. Tints, tones, type
  rules and state edges lose their colour in that mode, which is why each of them is also written as
  a word.
- **Print**: splitters and strips go, every scroller shows all its content, clamps open, and a panel,
  a row or a man page is not cut across two sheets.
- **Motion**: only the card flash moves, and reduced motion and `html.anim-off` stop it.
- **Touch**: rows, tree rows, strips, link calls to action and splitters are 44px targets under a
  coarse pointer.

`scripts/check-cards.mjs` asserts all of the above in a real browser, on four themes, with and
without the rest of the bundle.
