# Components: row actions, the rail, hovers, `.eli5`

Reference for the `danieldeusing-design` skill. Read it before you write a row action, mark the
rail's current page, touch `.ls-perm`, add a hover explanation or an `.eli5` box. The component
vocabulary, and the rule that a consumer never redeclares any of it, are in `SKILL.md`.

Contents:

- `.eli5` is opt-in per item (0.45.0)
- A row action's shape says whether it changes anything (0.13.0)
- The rail marks the current page on `aria-current="page"` (0.19.0)
- `.ls-perm` is deliberately dimmer than muted (0.20.0)
- A hover is `data-tip`, never the native `title` (0.26.0)

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
| `edit` — writes, and is the row's own settings | `<button class="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--edit" aria-label="edit <what>">` — see below |
| `remove` `delete` — **destroys** | `<button class="btn-terminal btn-terminal--ghost btn-terminal--destructive" aria-label="remove <what>">` — see below |
| the one primary action of a view | the same, **filled**: `btn-terminal btn-terminal--compact` |
| a toggle (`follow`, `live`) | the same button; press = drop `--ghost`, release = add it back. The two states are the two buttons the system already ships, so a toggle never needs a third look. |

Two filled buttons side by side compete, which is the whole reason `--ghost` exists.

**`.btn-terminal--destructive` (0.16.0) is the red bin, and it is the only remove control.** Before
it, the estate spelled one verb four ways at once: an underlined `remove` text link, a bordered
ghost button reading `rm`, a muted-grey `remove` on `.doc-link.rowlink`, and the same ghost button
spelling `remove` out — one page used both `rm` and `remove` for the same operation. It is
**composed on purpose** rather than split into `--icon` + `--danger`: `--compact` is the size and
nothing else because size and colour are independent, and these two are not — the split's products
are a red button with no icon and a bin with no warning. The glyph is a **CSS mask painted in
`currentColor`**, so no surface writes an SVG and no surface can draw a different bin.

**It takes an `aria-label` — always.** The button has no text, so without one it reads as nothing to
a screen reader and cannot be identified from the keyboard. Name the target, not the verb:
`aria-label="remove ddmini"`, not `aria-label="remove"`. `bin/design-conformance` fails a
`--destructive` button with no accessible name. Under a coarse pointer it grows to 44px via `min-*`,
so never set a width on it.

**`.btn-terminal--edit` (0.22.0) is the same icon button in the ordinary colour.** `edit →` was a
word and an arrow in a cell beside a bin that is 22px square — two controls doing one job, one four
times the width of the other, and at 375px the label broke into "edi / t →". Identical mechanism to
the bin (`currentColor` mask, `::before { content: "" }`, the coarse-pointer `min-*` growth) and one
deliberate difference: **it carries no colour at all.** Editing is an ordinary action and red is
reserved for the press that cannot be taken back, so composing it with `--ghost` gives `--primary`
on a `--border` outline like every other secondary control (5.59:1 at worst — warm over `--muted`).
Never reach for `--destructive` to get the icon shape. **The `aria-label` is mandatory and names the
target** (`aria-label="edit poi/vu3"`); without it a column of these announces "button" a dozen
times over.

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
puts six side by side and a table cell is half that height. Cockpit carried this as a local
`.btn-compact` for months — every surface with a table needs it, so it lives here now. **Never
declare a local one**, and never a local button class at all: five invented classes (`.cfg-btn`,
`.copy-btn`, `.tbtn`, `.xbtn`, `.fw-btn`) is how 77 rounded corners accumulated on a system whose
`--radius` has been `0` since its first release.

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

## A hover is `data-tip` — never the native `title` (0.26.0, Daniel)

```html
<span data-tip="Explanation shown instantly on hover">metric</span>
```

### There is no marker — discovery is by hover (0.45.0, Daniel)

**Write the tip and nothing else. A `data-tip` host renders no glyph, no underline, no dotted
border.** Daniel: *"Remove the info icons everywhere. People will just hover and see if there is
a tooltip coming or not."*

```html
<span data-tip="…">budget</span>          <!-- renders: budget -->
<span data-tip="…">budget ⓘ</span>        <!-- WRONG — a glyph nobody draws for you -->
```

**Do not re-add one, and do not write it in markup.** The estate has now tried both alternatives
and rejected both, so this is settled rather than merely current:

- Until 0.26.0 it was a dotted `border-bottom` — the web's mark for a link, so it read as a link
  that was broken or disabled, and it disappeared in a table header or against a busy row.
- From 0.26.0 to 0.45.0 it was an `::after` ⓘ. The reasoning was sound — a tooltip nobody can see
  is a tooltip nobody finds — but `span[data-tip]`, `th` and `button` meant **154 call sites**:
  beside sort arrows, inside buttons that already say what they do, after labels that were never
  ambiguous. A ten-column table carried ten pieces of furniture explaining controls that explain
  themselves. Discovery by hover costs the reader nothing; the marker cost every surface.

`initTableTools` also stopped putting `data-tip` on the ↕ sort button and the ⌕ filter summary — a
bubble reading "sort by repo" anchored under the word *repo* is a tooltip repeating its own
control. **`aria-label` stays on both.** The glyph was decoration; the accessible name is not, and
a screen reader still has to be told what an unlabelled ↕ does.

`[data-tip-bare]` and `.minimap-bar` are kept as opt-outs though they now suppress nothing. They
cost nothing, and a future marker would otherwise have to re-derive which elements are already
their own affordance:

```html
<span data-tip="…" data-tip-bare>2026-08-11</span>
```

**An action always shows its action cursor (0.46.2, Daniel).** `cursor: help` belongs only to
non-interactive tip hosts — spans, labels, badges, table cells, headings. On anything clickable
the cursor states what a click does, tooltip or not: `tooltip.css` gives `button`, `a[href]`,
`summary`, `[role="button"]`, `[role="menuitem"]` and `[role="tab"]` carrying a `data-tip`
`cursor: pointer` (and `not-allowed` while disabled). A question-mark cursor on a button is bad
UX; you get the right one for free — do not re-declare it per page.

**A tip never covers an open select (0.41.0, Daniel).** The tip panel is `position: fixed;
z-index: 9999` so it can never be clipped by an overflow container; `.select-panel` is 60. With a
listbox open and the pointer near a `[data-tip]` — very often inside the trigger's own label —
the tip painted straight over the options. `initTooltips()` now refuses to show while a
`.select-panel` exists, and a `pointerdown` anywhere hides one already up.

**You get this for free; do not re-solve it per page.** In particular do not raise a select's
z-index above the tip to "win" — the two are not competing for the same moment. While a listbox is
open the choices are the content, and an aside about the control you already opened is not worth one
covered option. Repositioning was rejected for the same reason: a panel can be full-width and
viewport-tall, so "flip it to the other side" is not a promise that can be kept.

`initTooltips()` handles every `[data-tip]`, including nodes rendered later. **Never use `title` for
explanatory text on any danieldeusing surface.** The browser's tooltip waits about a second, is
unstyled, is unreachable by keyboard on most engines, and **does not exist on a touch screen** —
cockpit is read from a phone over the tailnet, so there the explanation is simply gone.

**`title` does two unrelated jobs and only one of them is a tooltip.** This is the part that makes
a bulk conversion dangerous, because getting it wrong is an accessibility regression that reads as
a tidy-up in the diff:

| the element | what `title` was doing | write |
| --- | --- | --- |
| has visible text | a description | `data-tip` |
| an icon button with no text | the accessible **name** | `aria-label` |
| an icon button that also wants a hover | both | `aria-label` **and** `data-tip` |
| `<iframe>` / `<svg>` | the accessible name | leave `title` — no hover to replace |

Converted estate-wide on 2026-08-10: **108 in cockpit and 3 in netmon**. Two traps found doing it,
both of which would have shipped silently:

- **`.anim-toggle` had a `title` and no `aria-label` on 35 pages** — its content is an aria-hidden
  glyph, so `title` was the name. A blind rename leaves 35 buttons announced as "button". It now
  carries both, and so does `templates/page-chrome.html`, which is where all 35 came from.
- **`role="tooltip"` on the panel described nothing.** Nothing pointed the anchor at it, so
  `data-tip` was announced to no one while the `title` it replaces is announced — the swap would
  have traded a slow tooltip for a silent one. `show()` now sets `aria-describedby` and `hide()`
  removes it, including when moving between anchors.

**netmon carries its own inline copy** of this component (it loads tokens+chrome, never
components.css). When `runtime/tooltip.js` changes, `deploy/netmon/index.html` changes with it —
that duplication is deliberate but it is not automatic. `bin/cockpit-render-check` fails a native
`title` on any cockpit page or on netmon, and fails an icon toggle that lost its name.
