# Overlays: dialogs, confirmations, alerts, drawers, the context menu, tooltips, the zoom view

Reference for the `danieldeusing-design` skill. Read it before a page opens a dialog, asks for a
confirmation, raises an alert, slides out a drawer, adds a context menu, explains something on hover
(`data-tip`), or makes a diagram or an image zoomable. The CSS is `src/overlays.css` and
`src/tooltip.css`; the runtime is `runtime/dialog.js`, `runtime/tooltip.js` and
`runtime/diagramzoom.js`. `examples/overlays.html` shows every element in every state and is the
working reference for the page code; `scripts/check-overlays.mjs` measures it.

**Everything that floats is in the top layer or goes into it.** A modal `<dialog>` renders above the
whole page, `z-index: 9999` included, and makes the rest of the page inert. That one fact decides
most of the rules below: why a dialog is a native `<dialog>`, why a list or a tip opened from inside
one is appended to it, and why a context menu opened in one does the same.

Contents:

- A dialog is a native `<dialog>` — `dialog.dialog`, `initDialogs()`, `openDialog()`, `closeDialog()`
- The parts: head, toolbar, body, foot
- Sizes
- The answer is `returnValue`
- A confirmation — the footer is the answer pair
- While the footer commits: busy is `aria-busy` + `aria-disabled`
- An alert — `.dialog--alert`
- A drawer — `.dialog--drawer`
- A popup opened inside a dialog goes into the dialog
- A context menu — `.select-panel.context-menu`, and the page code that opens it
- A hover is `data-tip` — never the native `title`
- The zoom view — `initDiagramZoom()`
- Framework apps, and a surface that loads only tokens

## A dialog is a native `<dialog>` — `dialog.dialog`, `initDialogs()`, `openDialog()`, `closeDialog()` (0.60.0)

Daniel, 2026-08-30, on cockpit: *"All dialogs in the whole cockpit should have: close button top
right with just an X and border as button. No Text. Action buttons bottom right."* configr has the
most dialogs in the estate and the most settled anatomy, so its layout is the one taken; cockpit's
native `<dialog>` is the mechanism, because `showModal()` brings the top layer, the inert page and
Escape to a build-free page for free. configr had rebuilt all three by hand.

```html
<button type="button" class="btn-terminal btn-terminal--compact" data-dialog-open="join-dlg">join</button>

<dialog class="dialog" id="join-dlg" aria-labelledby="join-t">
  <header class="dialog-head">
    <button type="button" class="btn-icon dialog-back" data-icon="arrow-left" aria-label="back"></button>   <!-- optional -->
    <h2 class="dialog-title" id="join-t">join the review</h2>
    <!-- optional header actions: .btn-icon -->
    <button type="button" class="btn-icon dialog-close" data-icon="x" data-dialog-close aria-label="close"></button>
  </header>
  <div class="dialog-toolbar">…</div>                  <!-- optional -->
  <div class="dialog-body">…</div>
  <footer class="dialog-foot form-actions">
    <p class="form-status" role="status"></p>
    <button type="button" class="btn-terminal btn-terminal--compact" data-dialog-close="join">join</button>
  </footer>
</dialog>
```

```js
import { initDialogs, openDialog, closeDialog } from "@danieldeusing/design/runtime";
initDialogs(); // once, at startup: [data-dialog-open], [data-dialog-close] and the backdrop, delegated
```

| call | what it does |
|---|---|
| `[data-dialog-open="<id>"]` | a click opens that dialog (an `aria-disabled="true"` opener opens nothing) |
| `[data-dialog-close]` / `[data-dialog-close="<answer>"]` | a click inside a dialog closes it, with `<answer>` as its `returnValue` |
| a press on the backdrop | closes a `.dialog` — not an alert, not one whose footer is committing |
| `openDialog(dialogOrId, opener?)` | opens it modally and returns it; an open dialog is returned as it is |
| `closeDialog(dialogOrId, answer?)` | closes it; its `returnValue` is `answer`, or `""` |

What the runtime adds to the platform, and why each one:

- **Focus starts on the dialog itself**, not on its first control. The platform focuses the first
  focusable descendant, which in this markup is the back arrow or the X, so a screen reader
  announced "close, button" before it ever read what the dialog was about, and a reader pressing
  Enter out of habit dismissed it unread. On the dialog, the title is read first and the first Tab
  lands on a control. **An `[autofocus]` control inside wins** — a dialog whose point is one field
  starts in it.
- **Focus comes back** to what held it when the dialog opened, or else to the opener. The "or else"
  is Safari, where a mouse click does not focus a button. When both are gone — the page re-rendered
  the row the opener sat in while the dialog was open, as cockpit's approvals do — it goes to a
  connected `[data-dialog-open="<this dialog's id>"]` if there is one. **A page that re-renders its
  opener as something else, or somewhere else, hands focus back itself**, in the dialog's `close`.
- **A dialog with no name gets its title's.** Every cockpit dialog was unnamed: "dialog" was all a
  screen reader said. Write `aria-labelledby` yourself when you can; the runtime links an unnamed
  dialog to its `.dialog-title` when you did not.
- **Tab stays inside, and Escape closes the topmost.** That is the platform, and it is only true of
  a dialog opened with `showModal()`. Never open one with `show()`, and never build one out of a
  `div[role=dialog]` — the zoom view was one until 0.60.0 and Tab walked straight out of it.
- **The page does not scroll under it.** `html:has(dialog:modal) { overflow: hidden }` in the
  stylesheet: any modal dialog, no script, nothing to undo on every way out. configr locked `<body>`
  from script.

Rules for the markup:

- **The X is an icon button with a border, and nothing else.** `.btn-icon.dialog-close`,
  `data-icon="x"`, named "close" (or "close logs"). No text beside it — cockpit's "× esc" and the zoom
  view's red "close ×" are gone — and no `data-tip`: the glyph says it (configr's lint rule). The back
  arrow is the same with `data-icon="arrow-left"`, named "back", first in the head. Both are inked in
  `--foreground`, not the icon button's `--primary`: they are the dialog's furniture, and the one
  primary action lives in the footer.
- **The footer only commits.** Dismissing is the X's job (configr's lint rule: a dialog footer never
  carries a dismiss), except in a confirmation, whose footer is the answer pair. It is the controls'
  `.form-actions` (`controls.md`): status first, cancel next, the one primary action last.
- **The head is outside the body, and that is load-bearing.** Eight cockpit call sites re-render an
  open dialog's content with `cockpitPatch()` as it arrives; with the X inside the patched markup,
  each had to remember to re-emit it, and the one that forgot left a dialog with no way out but
  Escape. Patch `.dialog-body`. The title and the X are never in what you replace.
- **Never set `display` on a dialog.** The stylesheet sets `display: flex` on `[open]` only, so the
  user agent's `dialog:not([open]) { display: none }` keeps a closed one hidden. Cockpit declared the
  box five ways and needed `!important` to get out of its own rule.
- A `<form>` directly inside the dialog is transparent to the layout, so `<form method="dialog">` may
  wrap the body and the footer; its submit button's `value` becomes the `returnValue`.
- A dialog does not print: the page does.

## The parts: head, toolbar, body, foot

| part | what it is |
|---|---|
| `.dialog-head` | `[back] title [actions] [X]` on one row, `1rem 1.5rem`, a `--border` rule under it. It never shrinks. |
| `.dialog-title` | an `h2`, `--fs-xl` (configr's 18px title on the heading step), one line, cut with an ellipsis rather than pushing the X out |
| `.dialog-toolbar` | controls that stay put while the body scrolls under them — a search, a switch, a count |
| `.dialog-body` | the one part that scrolls, so the X and the commit button are always one press away. `--flush` drops its inset for a `.split`, a `.console` or a card grid. |
| `.dialog-foot` | on `.form-actions`, pinned under the body with a `--border` rule above it |
| `.dialog-section` | a new part of the body; the second one starts `1.5rem` down |

Cockpit's own primitives are the system's now: `.dlg-x` → `.dialog-close`, `.dlg-body` →
`.dialog-body`, `.dlg-actions` → `.dialog-foot.form-actions`, `.dlg-lead--gap` → `.dialog-section`,
`.dlg-label` → the eyebrow, `.dlg-field` → `.field-row--stacked`, `.dlg-hint` → `.field-desc`.

A table inside a dialog needs nothing: the dialog sets `--tablewrap-fade` and `--clamp-fade` to its
`--card`, and chrome.css paints a sticky table header in `--tablewrap-fade`, so it is `--card` there
instead of the page's `--background` (cockpit painted both `--background`, a stripe of page showing
through the box).

**The edge is `--control-edge`, and it is what separates the box on the dark themes.** The scrim
(`--backdrop`) dims the page; on green and mono no scrim can separate a near-black card from a
near-black page (1.04–1.08:1), and there the edge does it (4.76:1 at worst). On warm and paper the
card's own fill does (3.60:1 at worst). There is no backdrop blur: configr blurred the page behind
its modals, and text read through frosted glass is not something this estate does.

Below 40rem a dialog takes the screen's width less `.5rem` a side, and its parts inset `1rem`.

## Sizes

| class | inline size | for |
|---|---|---|
| `.dialog--sm` | 24rem | a question, one field |
| (none) | 28rem | the default |
| `.dialog--lg` | 42rem | a form with a few rows |
| `.dialog--xl` | 56rem | a table, a plan |
| `.dialog--full` | `min(80vw, 90rem)` × `90dvh` | a whole tool: a split, a console, a grid (pair with `.dialog-body--flush`) |
| `.dialog--fit` | its content, at most `90vw` | cockpit's content-sized overlay and stats dialogs |

Every size stops at the viewport, and every dialog at `90dvh`: a dialog wider than the screen has
an X nobody can reach (seedr studio's rule).

## The answer is `returnValue`

```js
const dlg = openDialog("rm-dlg");
dlg.addEventListener("close", () => {
  if (dlg.returnValue === "remove") removeRepository();
}, { once: true });
```

`[data-dialog-close="remove"]` closes with `"remove"`; Escape, the backdrop and a bare
`[data-dialog-close]` close with `""`. **`openDialog()` empties it on every open, and that is the
line that matters:** the platform keeps `returnValue` across opens, and a close without a value does
not overwrite it — so a confirmation answered "remove" once and dismissed the next time read
"remove" again, and the page removed twice.

## A confirmation — the footer is the answer pair

```html
<dialog class="dialog dialog--sm" id="rm-dlg" aria-labelledby="rm-t">
  <header class="dialog-head"><h2 class="dialog-title" id="rm-t">remove poi/vu3?</h2></header>
  <div class="dialog-body">
    <p>Its reviews, its runs and its settings go with it.</p>
    <div class="callout" data-tone="warning"><p>This cannot be undone from cockpit.</p></div>
  </div>
  <footer class="dialog-foot form-actions">
    <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact" data-dialog-close="cancel">cancel</button>
    <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--danger" data-dialog-close="remove">remove</button>
  </footer>
</dialog>
```

- **No X.** The footer is the answer pair: cancel first, then the committing action.
- **Both answers are words.** configr's ✓ / × confirm buttons are corrected: a glyph pair asks the
  reader to guess which way round it goes.
- A destructive answer is `.btn-terminal--danger` (a word in red). `--destructive` is the icon-only
  bin, for a row.
- Escape and a press on the backdrop cancel (`""`).
- A warning inside is a `.callout[data-tone="warning"]`; the message is ordinary body text.
- A two-step confirm that stays in the row is `.confirm-inline`, and typing a code back is
  `.confirm-code` (`controls.md`). A dialog is for a decision that deserves the whole screen.

## While the footer commits: busy is `aria-busy` + `aria-disabled`

```js
go.addEventListener("click", async () => {
  if (go.getAttribute("aria-disabled") === "true") return;       // aria-disabled still delivers clicks
  go.setAttribute("aria-busy", "true");
  answers.forEach((b) => b.setAttribute("aria-disabled", "true"));
  const ok = await discardDraft();
  go.removeAttribute("aria-busy");
  answers.forEach((b) => b.removeAttribute("aria-disabled"));
  closeDialog(dlg, ok ? "discard" : "");
});
```

- **Never `disabled`.** Disabling the focused button throws focus to `<body>` mid-action; the reader
  is left nowhere, and the dialog's focus return has nothing to return to. A busy control keeps
  focus, draws its spinner at full strength (busy is working, not unavailable), and ignores
  activation while `aria-disabled` is set — your handler has to check it, because the click still
  arrives.
- **While an action in `.dialog-foot` is `aria-busy`, nothing dismisses the dialog but your code.**
  The runtime ignores Escape, the backdrop and every `[data-dialog-close]` — each would walk away
  from a write that is still running, and the page would have nowhere left to say how it ended.
  Close it with `closeDialog()` when the write returns. A region in the BODY that is `aria-busy`
  (content loading) does not lock anything. The runtime marks the closers it is ignoring (the X)
  `aria-disabled="true"` while that lasts, and takes the mark off after — only its own mark.

## An alert — `.dialog--alert`

```html
<dialog class="dialog dialog--alert dialog--sm" id="crash" aria-labelledby="crash-t">
  <header class="dialog-head">
    <span class="ico ico--xl" data-icon="triangle-alert" data-tone="destructive" aria-hidden="true"></span>
    <h2 class="dialog-title" id="crash-t">configr stopped</h2>
  </header>
  <div class="dialog-body"><p>The scanner crashed while reading ~/.claude. …</p></div>
  <footer class="dialog-foot form-actions">
    <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact" data-dialog-close="ok">ok</button>
    <button type="button" class="btn-terminal btn-terminal--compact" data-dialog-close="send">send report</button>
  </footer>
</dialog>
```

For something the reader must acknowledge before going on — configr's crash reporter. Not for a
confirmation (that is `--confirm`, which Escape cancels) and not for news (that is a `.notice`).

- It is `role="alertdialog"`, described by its message; the runtime adds both if the markup lacks
  them (`aria-describedby` points at `.dialog-body`).
- No X; a leading glyph in the head (an `.ico` at `--icon-xl` in `var(--tone)`; configr's 40px
  tinted tile is dropped); the footer carries the answers.
- **Escape and the backdrop do nothing, and it took two mechanisms.** Preventing the dialog's
  `cancel` event is not enough on current Chromium: the close-watcher rule makes a cancel cancelable
  once per user activation, and Escape is not an activation, so the SECOND Escape closed the alert
  regardless (measured on HeadlessChrome 151). The runtime also cancels the Escape key itself, after
  any menu or list inside the alert has had it. Do not "simplify" it back to the `cancel` listener.
- Both guards sit on the ROOT (`initDialogs()`), so an alert a page opened with its own
  `showModal()` is covered too, and they act on the topmost modal — the one holding focus. A native
  dialog a page puts on top of an alert still closes on Escape.

## A drawer — `.dialog--drawer`

```html
<dialog class="dialog dialog--drawer" id="logs" aria-labelledby="logs-t">
  <header class="dialog-head">
    <h2 class="dialog-title" id="logs-t">logs — <span class="text-primary">ddstudio</span> / dd-infra-cockpit</h2>
    <button type="button" class="btn-icon dialog-close" data-icon="x" data-dialog-close aria-label="close logs"></button>
  </header>
  <div class="dialog-toolbar">
    <select aria-label="lines">…</select>
    <button type="button" role="switch" aria-checked="true" class="switch">follow</button>
    <div class="search-field">…</div><span class="match-count">3/17</span>
    <button type="button" class="btn-icon" data-icon="arrow-up" aria-label="previous match"></button>
    <button type="button" class="btn-icon" data-icon="arrow-down" aria-label="next match"></button>
    <button type="button" class="btn-icon" data-icon="download" aria-label="download the log"></button>
  </div>
  <div class="dialog-body dialog-body--flush">
    <div class="console console--fill"><div class="console-body" tabindex="0" aria-labelledby="logs-t">…</div></div>
  </div>
  <footer class="dialog-foot form-actions"><p class="form-status" role="status">streaming · 1 204 lines</p></footer>
</dialog>
```

The same dialog, against the right edge: full height, up to `50rem` wide, the edge on the content side
only. Everything above holds — the parts, the runtime, the name, Escape, the backdrop, focus in and
back. For detail that sits beside the page rather than replacing it: a container's logs, a run's
output. Cockpit's logs drawer was an `aside` with its own `.backdrop` div and a "× esc" button, and
moved no focus at all. `follow` is a `.switch` (never a `[x]` text toggle); there is no slide-in, and
cockpit never had one.

## A popup opened inside a dialog goes into the dialog

A modal dialog is in the top layer and the rest of the page is inert beneath it, so anything opened
from inside it and appended to `<body>` renders UNDER it — correctly placed, and invisible.

- A `<select>`'s list: `select.js` already appends it to the dialog.
- A tip: `tooltip.js` does from 0.60.0.
- Anything your page places itself with `positionPopup()` — a context menu, an autocomplete list:
  append it to `anchor.closest("dialog[open]") ?? document.body`. A `position: fixed` panel inside the
  dialog still escapes the dialog's own `overflow: hidden`.

## A context menu — `.select-panel.context-menu`, and the page code that opens it

```html
<ul class="select-panel context-menu" role="menu" aria-label="actions for src/app.ts">
  <li role="none"><ul role="group" aria-labelledby="ctx-file">
    <li role="none"><span class="dropdown-label" id="ctx-file">file</span></li>
    <li role="none"><button type="button" class="dropdown-item" role="menuitem">open in editor</button></li>
    <li role="none"><button type="button" class="dropdown-item" role="menuitem" aria-disabled="true">no history — this file is not in a repository yet</button></li>
  </ul></li>
  <li class="dropdown-sep" role="separator"></li>
  <li role="none"><button type="button" class="dropdown-item dropdown-item--danger" role="menuitem">delete</button></li>
</ul>
```

The rows are the one popup look (`components.md`): the same row as a dropdown menu and a listbox,
so a menu opened at the pointer cannot drift from one opened by a button. `.context-menu` adds only
what a menu with no trigger needs: `position: fixed` and `z-index: 60`.

**There is no module.** A context menu belongs to the rows it acts on, and those are the page's. The
page opens it, places it and wires its keys with two shared functions:

```js
import { positionPopup } from "@danieldeusing/design/runtime/popup";    // where it goes
import { attachMenuKeys } from "@danieldeusing/design/runtime/dropdown"; // the menu's keys

let menu = null; // { panel, row, detach }
const closeMenu = () => {
  if (!menu) return;
  const { panel, detach } = menu;
  menu = null;
  detach();
  panel.remove();
};
const openMenu = (row, at) => {
  closeMenu();
  const panel = template.content.firstElementChild.cloneNode(true);
  panel.setAttribute("aria-label", `actions for ${row.dataset.name}`);
  (row.closest("dialog[open]") ?? document.body).append(panel);   // into an open dialog, if any
  positionPopup(panel, at);
  menu = { panel, row, detach: attachMenuKeys(panel, { onClose: closeMenu, returnFocusTo: row }) };
  panel.querySelector('[role="menuitem"]').focus();
};

list.addEventListener("contextmenu", (e) => {                // the pointer
  const row = e.target.closest("[data-row]");
  if (!row) return;
  e.preventDefault();
  row.focus();
  openMenu(row, { x: e.clientX, y: e.clientY });
});
list.addEventListener("keydown", (e) => {                    // Shift+F10 and the Menu key
  if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
  const row = e.target.closest("[data-row]");
  if (!row) return;
  e.preventDefault();                                        // also stops the browser's own contextmenu event
  const r = row.getBoundingClientRect();
  openMenu(row, { x: r.left, y: r.bottom });
});
document.addEventListener("pointerdown", (e) => {            // a press outside
  if (!menu || menu.panel.contains(e.target)) return;
  const { row } = menu;
  closeMenu();
  setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) row.focus(); });
}, true);
```

- **Keys** (APG menu, from `attachMenuKeys`): ArrowDown / ArrowUp move and wrap, Home / End jump,
  typing jumps to an item, Enter and Space run one, Escape closes back to the row, Tab closes and
  moves on from the row. An item's own click handler runs the action; the menu closes on it.
- **A press outside closes it** and leaves focus where the press put it. Only a press that put focus
  nowhere (on `<body>`) hands it back to the row — pulling focus back from a control the reader just
  pressed would fight them (configr's rule).
- **Its width is 12–20rem, and the rows carry it.** `positionPopup()` writes `min-inline-size` and
  `max-inline-size` inline on the panel, which beats any selector, so the stylesheet puts the width
  on the rows instead, where nothing writes. Do not "fix" it back onto the panel.
- **A row that states something is `aria-disabled`, not `disabled`, and it wraps.** configr's menus
  say why a section is empty or an action unavailable in a sentence; the row stays in the arrow-key
  walk so a screen reader hears it, does nothing when activated, and wraps instead of truncating the
  half that explains. It is `--muted-foreground` (4.84:1 at worst), meant to be read, and `GrayText`
  under forced colours.
- A danger row is `.dropdown-item--danger`; a rule is `.dropdown-sep` with `role="separator"`.
- **A labelled section is a group**: its `.dropdown-label` and the items under it sit in a
  `role="group"` named by that label (`aria-labelledby`), as a `details.dropdown` menu's do
  (`components.md`). The label is read, not hidden: a reader hears "file, group" and then its items,
  and the arrow keys walk from one group into the next. A context menu is the page's markup, so the
  page writes the group; give the label an id of its own.
- Shift+F10 and the Menu key make it reachable from the keyboard. An action a reader needs often
  still deserves a visible control as well: nothing on a row says "right-click me".

## A hover is `data-tip` — never the native `title` (0.26.0, Daniel)

```html
<span data-tip="claude-fable-5 · effort xhigh · (copilot reported the model)">model</span>
```

`initTooltips()` handles every `[data-tip]` on the page, including nodes rendered later. **Never use
`title` for explanatory text on any danieldeusing surface.** The browser's tooltip waits about a
second, is unstyled, is unreachable by keyboard on most engines, and does not exist on a touch
screen — cockpit is read from a phone over the tailnet, so there the explanation is simply gone.

**`title` does two unrelated jobs and only one of them is a tooltip.** This is what makes a bulk
conversion dangerous: getting it wrong is an accessibility regression that reads as a tidy-up.

| the element | what `title` was doing | write |
| --- | --- | --- |
| has visible text | a description | `data-tip` |
| an icon button with no text | the accessible **name** | `aria-label` |
| an icon button that also wants a hover | both | `aria-label`, and a `data-tip` that says something the name does not |
| `<iframe>` / `<svg>` | the accessible name | leave `title` — there is no hover to replace |

### A tip never repeats the name (0.60.0)

`tooltip.js` points the anchor at the panel with `aria-describedby`, so a tip is read out after the
name. A `data-tip` equal to the `aria-label` was therefore announced twice — the accessibility tree
read name "refresh catalog", description "refresh catalog".

- **Write a tip that says something the name does not, or leave it off.** On an icon button:
  `aria-label="download the log"`, `data-tip="the last 1 000 lines · as plain text"`. Never a tip
  that names the glyph ("download icon").
- As a safety net the runtime does not wire up a tip equal to the host's accessible name, computed
  in accname's order — `aria-labelledby`, then `aria-label`, then a `<label for>`, then the rendered
  text (an `<img>` by its alt; `display: none` and `aria-hidden` children left out) — and compared
  without case, runs of spaces or trailing punctuation. The tip still shows, and is not read twice.
  Do not rely on the net — a sighted reader still sees the same words twice.
- **A description the page wrote is kept.** The tip adds its id to `aria-describedby` as one token
  and takes back only that token, so a select trigger pointing at its `.field-error` keeps it while
  the tip shows and after it goes.

### Toned segments — `data-tip-parts` (0.61.0, Daniel)

A tip can colour a segment: a size read as "+210 −109 · 319 lines", with "+210" green and "−109" red.
Write the tip twice — once as plain text, once as parts:

```html
<span data-tip="+210 −109 · 319 lines"
      data-tip-parts='[{"text": "+210", "tone": "success"}, " ", {"text": "−109", "tone": "destructive"}, " · 319 lines"]'>M</span>
```

- **`data-tip` stays the tip.** It is required (the runtime finds tips by it), it is the fallback, and
  it is **all a screen reader hears**: while parts are shown the panel is labelled with `data-tip`,
  so the anchor's description is exactly that text. The parts are visual only.
- **So the two must say the same words.** Build both from the same values in the renderer. The
  runtime compares their text with runs of whitespace collapsed and `console.warn`s once for an
  element whose parts say something else — it still shows the parts.
- **`data-tip-parts` is a JSON array.** An item is a string (untoned) or `{"text": "…", "tone": "…"}`.
  The tone is a word from the fixed set `data-tone` takes everywhere — `primary`, `success`,
  `warning`, `destructive`, `info`, `pending`, `muted` — and anything else renders untoned. It is
  set as `data-tone` on a span; it never becomes a class or a style, and every text goes in by
  `textContent`. **Never build markup for a tip**: there is no HTML path, by design.
- **JSON that does not parse, a non-array, or an item that is neither a string nor `{text}` shows
  `data-tip` instead**, with one `console.warn` per element (not per hover).
- **The row rules still apply across parts.** Rows are cut from the joined text, so ` · `, a line
  break, `key<TAB>value` and a `(parenthetical)` behave exactly as in a plain tip, whichever segment
  they sit in. In the example, "+210 −109" is the first row (bold, both counts toned) and
  "319 lines" the second.
- **Contrast is the panel's job.** `tooltip.css` paints `#ddtip [data-tone]` in `--tone`, and every
  tone stands at least 4.5:1 on `--popover` in all four themes (`check-overlays.mjs` measures it; the
  lowest is `muted` on warm, 4.84:1). In forced colours a segment loses its hue and keeps its words.
- **A renderer that patches the open tip's anchor updates the panel.** When `cockpitPatch` (or any
  patcher) rewrites `data-tip` or `data-tip-parts` on the element whose tip is showing, the panel
  re-renders in place; removing `data-tip` closes it. Before 0.61.0 an open tip kept the text it
  opened with, for `data-tip` as well. The anchor also keeps its `aria-describedby` token when a
  patcher strips attributes its markup does not carry.

### No tip on a column header (Daniel, 2026-08-21, confirmed 2026-09-29)

**A `<th>` carries no `data-tip`.** A header already holds the sort button, the filter and the
badge, and a tip there sits over the controls a reader is reaching for. Explain a column where it
is read instead: in the cell's own tip, in a `.field-desc` or note above the table, or in a clearer
header word.

### There is no marker — discovery is by hover (0.45.0, Daniel)

**Write the tip and nothing else. A `data-tip` host renders no glyph, no underline, no dotted
border, no cursor of its own.** Daniel: *"Remove the info icons everywhere. People will just hover
and see if there is a tooltip coming or not."*

- Until 0.26.0 the marker was a dotted `border-bottom` — the web's mark for a link, so it read as a
  broken link and vanished in a table header.
- From 0.26.0 to 0.45.0 it was an `::after` ⓘ on 154 call sites: beside sort arrows, inside buttons
  that already say what they do. Discovery by hover costs the reader nothing; the marker cost every
  surface.
- `cursor: help` went in 0.49.0 (*"No cursor help"*). A tipped element has exactly the cursor it
  would have untipped: a button's pointer, a span's text cursor.
- **The opt-outs went in 0.60.0.** `[data-tip-bare]` and the `.minimap-bar` exception suppressed a
  marker that no longer exists; the package now holds no rule keyed off `[data-tip]` at all, and
  `scripts/check-tooltip-marks.mjs` fails one. A `data-tip-bare` left in markup is inert — delete it.

### What the panel does, for free — do not re-solve any of it per page

- **It is a popup.** `--popover` under `--popover-foreground` (9.57:1 at worst), the `--control-edge`
  every popup is edged with, the `--elev-float` glow, no radius. Parts separated by ` · ` or a line
  break become rows, the first one bold; a `(parenthetical)` is muted; `key<TAB>value` rows line up
  as a table.
- **It never covers an open list.** No tip for anything OUTSIDE an open list while any
  `.select-panel` exists (a listbox, a filter dropdown, an autocomplete list, a context menu) or a
  `details.dropdown` is open, and none on a control whose own popup is open
  (`[aria-haspopup][aria-expanded="true"]`). A tip already showing goes when one opens. Do not raise
  a list's `z-index` to "win": while a list is open the choices are the content. **A row of the open
  list shows its own tip** — an option explaining itself, which `select.js` copies onto its rows.
- **Escape hides it** (WCAG 1.4.13), and only it: the first Escape takes the tip, the second the
  dialog or menu it sits in. It returns when the pointer leaves and comes back, or focus moves.
- **Inside an open `<dialog>` it goes into the dialog**, so it renders in the top layer.
- **It ignores the pointer** (`pointer-events: none`), and the click fixes in `tooltip.js` rest on
  that. So a tip cannot be hovered or selected: it explains, and is never the only place a reader
  finds something they must act on.
- A press anywhere hides it; it follows its anchor when the page scrolls; it is clamped into the
  viewport and flips above its anchor when there is no room below.

**netmon carries its own inline copy** of this component (it loads tokens and chrome only). When
`runtime/tooltip.js` changes, `deploy/netmon/index.html` changes with it. `bin/cockpit-render-check`
fails a native `title` on any cockpit page or on netmon, and an icon toggle that lost its name.

## The zoom view — `initDiagramZoom()`

```js
initDiagramZoom();                                            // every .diagram
initDiagramZoom(".prose-pagr :is(figure, p:has(> img))");     // pagr's article images
```

An architecture diagram authored for a text column is unreadable at exactly the moment someone needs
it, and so is a screenshot in an article. Every element the selector matches — anything that wraps an
`<svg>`, an `<img>` or a `<canvas>` — becomes a real button that opens a full-screen view, fitted to
the viewport, then zoomable and pannable. **The markup contract is nothing**; do not hand-roll a
lightbox (pagr's `.88` scrim, with no dialog semantics and an image the keyboard could not reach, is
what this replaces).

- **The opener says what it opens:** "zoom: network map" for an image with that alt text or an svg
  with that `aria-label` (or `<title>`), "zoom image" for an image with neither, "zoom diagram"
  otherwise. An `aria-label` you wrote on the opener is kept. The view takes the opener's name. So
  write the alt text: it is now the name of a control, not only of a picture.
- An opener you already marked `.dgm-zoomable` in the markup is wired like any other.
- **The view is a modal `<dialog>`:** the page is inert, Tab stays in the view, the page does not
  scroll under it, Escape closes it and focus goes back to the opener.
- **Inside:** the wheel zooms about the pointer, a drag pans, the arrow keys pan (40px a press),
  `+` `-` `0` and the bar's buttons zoom, and a click on the empty stage closes it — a click that
  began there, not the end of a pan and not a click on the picture.
- **Touch is the view's own:** the stage is `touch-action: none` (the browser's pinch would zoom
  the page behind a modal), so one finger pans and two fingers zoom about their midpoint. Under a
  coarse pointer the bar's buttons are 44×44 at least.
- **The opener is `components.css`'s, the view is this file's.** The opener's class is
  `.dgm-zoomable`, and its always-drawn corner hint (the `maximize-2` glyph) and its focus ring are
  specified with it in `components.md`: it sits in the page's content. `overlays.css` draws only
  what floats — the `<dialog class="dgm-overlay">`, its bar and its stage.
- The artwork is cloned into the view, never moved: mermaid re-runs against the nodes it rendered,
  and a moved diagram silently stops updating. A canvas is copied with its picture.

## Framework apps, and a surface that loads only tokens

- **Framework apps (configr, seedr studio) do not run `dialog.js`** — they own their nodes (house
  rule 10). They render the same markup on a native `<dialog>`, call `showModal()` from their own
  code and apply the same rules: focus the dialog (or its `[autofocus]` control), hand focus back on
  close, empty `returnValue` on open, cancel Escape at the key for an alert. configr's hand-built
  inert stack becomes the platform's.
- **The tooltip is the exception:** a tokens-only app loads `tooltip.css` and calls `initTooltips()`
  rather than restyling `#ddtip` (seedr studio's local `--popover` panel and its `cursor: help` go).
  It touches nothing React renders except the anchor's `aria-describedby`.
- **`overlays.css` and `tooltip.css` need only `tokens.css`**: the dialog states its own box, font,
  colours and edge. What it composes with lives where it is owned — the X and the footer are
  `controls.css` (`.btn-icon`, `.form-actions`), the zoom bar's buttons are `.btn-terminal`
  (`components.css`), and the context menu's rows are the popup look in `components.css`; a
  tokens-only app reproduces that look on its own classes until it loads the component CSS.
- **Forced colours** (Windows high contrast) paint every background `Canvas` and lay a `Canvas`
  backplate behind text. The dialog, the tip and the menu are text and borders, which survive. The
  glyphs they show are drawn by the files that own them — the X and the back arrow by
  `controls.css`, the alert glyph by `icons.css` — and each takes the forced colour of what it sits in
  (`forced-color-adjust: preserve-parent-color`). Never opt one out with `none` from a page or a
  variant: an opted-out X painted the theme's ink, 1.27–1.78:1 in four of the eight theme × palette
  cells. (Its ink is set through `--btn-icon-color`, never `color`, which would tie with
  `.btn-icon`'s own on specificity.) The one row this file colours, the stated
  context-menu row, is `GrayText` there; without it the row read like an action and, under the keys,
  painted the theme's muted ink at 3.00–3.52:1. Its focus ring is `CanvasText`, and that one is
  `components.css`'s, not this file's: the popup row's ring is `HighlightText`, drawn for a
  `Highlight` fill, and a disabled row has no fill — `HighlightText` is the `Canvas` colour on both
  palettes, so the keys vanished on it (1:1). `scripts/check-overlays.mjs` reads all
  of these back as painted pixels, on a light and a dark forced palette, with real keyboard focus,
  and hides each element and shoots again to prove the ink it measured was that element's.
