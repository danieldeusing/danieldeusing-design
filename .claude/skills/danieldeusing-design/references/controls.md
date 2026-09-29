# Controls: icon buttons, groups, form footers, switches, boxes, choices, uploads, confirmations

Reference for the `danieldeusing-design` skill. Read it before you write an icon-only button, join
controls into one, end a form, add an on/off toggle, a checkbox or a radio, a segmented choice, choice
cards, a file upload, actions that appear on hover, or a confirmation. Everything here is in
`src/controls.css`. Buttons with words are `.btn-terminal`, in `components.md`, next to this file.

**None of it has a runtime.** Every state is an attribute the page already owns (`aria-pressed`,
`aria-checked`, `aria-busy`, `aria-disabled`, `data-dragging`, `disabled`), and the stylesheet draws it. A build-free
page flips the attribute in a click handler; seedr and configr render the same markup from their own
components and keep their own handlers. `examples/controls.html` shows every element in every state
and is the working reference for the handlers, and `scripts/check-controls.mjs` measures it.

**It works on `tokens.css` alone.** Each class states its own box, font, edge, focus ring and
disabled state, so a surface that loads `tokens.css` and `controls.css` (netmon loads tokens + chrome
only) gets all of it. Do not "fix" a control here by adding a rule that only works beside `base.css`.

Contents:

- Which control: decide by what the press does
- `.btn-icon`: the icon-only button
- `.btn-group`: controls that share an edge
- `.form-actions` and `.btn-row`: the footer that commits
- `.switch`: on or off, and it says which
- Checkboxes and radios: drawn, element-level
- `.segmented`: one value of a few, chosen in place
- `.choice-card`: an option with a sentence under it
- `.dropzone` and `.thumb-grid`: a file input the keyboard can reach
- `.reveal`: actions that appear on hover, on focus, and always on touch
- `.confirm-inline`: the second press, in place
- `.confirm-code`: type it back
- Touch, motion, paper, forced colours and `hidden`

## Which control: decide by what the press does

| the reader … | write | never |
|---|---|---|
| acts, and a word says it (save, run, approve) | `.btn-terminal` (`components.md`) | an icon-only button for a primary action |
| acts, and a glyph says it (refresh, back, favourite, dismiss) | `.btn-icon` + `aria-label` | a `.btn-terminal` with no text |
| turns one thing on or off, and it takes effect now (`follow`, `hide handled`, `live`) | `.switch` | a checkbox; a `[x]` text toggle (`.filter-ctl`, gone in 0.60.0) |
| sets a yes/no that a form sends when it is submitted | a checkbox in a `.check` label | a switch |
| picks one of a few values, in place (formatted / raw, 1h / 24h / 7d) | `.segmented` | a radio row; `.tabs` |
| picks one option that needs a sentence to be understood (install scope) | `.choice-card` in a `.choice-grid` | radios with small print |
| picks one of several values a form submits | radios in `.check` labels, inside a `fieldset` | a `.segmented` |
| narrows a list (by source, by tag) | a filter dropdown or a chip set (`filters.md`) | a checkbox, a switch, a `.segmented` |
| switches whole panels of the page | `.tab` | a `.segmented` |

A switch and a checkbox are not interchangeable. **A switch acts when it is pressed; a checkbox is a
value the form sends later.** That is the whole difference, and it is the one the reader relies on:
flipping a switch must change the page at once, and ticking a box must not change anything until the
form is saved.

**There are two "on" looks, on purpose; do not unify them.** A control with words (a `.segmented`
segment here, a filter chip in `filters.md`) is on as a 12% `--primary` wash with a `--primary` edge
and bold words: the words carry the state, and a solid fill behind them would shout over the row. An
icon-only toggle (`.btn-icon` with `aria-pressed`) has no words to make bold, so it is on as a solid
`--primary` fill with the glyph cut out of it. Hover is neither of them: it is a wash that leaves with
the pointer.

## `.btn-icon`: the icon-only button

```html
<button type="button" class="btn-icon" data-icon="refresh-cw" aria-label="refresh catalog" data-tip="last refreshed 2 minutes ago"></button>
<button type="button" class="btn-icon btn-icon--bare" data-icon="chevron-left" aria-label="back"></button>
<button type="button" class="btn-icon" data-icon="star" aria-pressed="false" aria-label="favourite seedr"></button>
<button type="button" class="btn-icon btn-icon--sm" data-tone="destructive" data-icon="x" aria-label="remove shot-1.png"></button>
<button type="button" class="btn-icon" aria-label="open file"><svg …></svg></button>
```

configr's IconButton is the most-used control in the estate (81 call sites), and the system had no
answer for it, so each surface drew its own square: configr at five sizes, seedr at three, and one
toolbar could hold three sizes of the same button. There is one box now.

- **28px square, `--control-h`**, the height of the field and the compact button beside it, so a
  refresh button in a filter bar lines up with the search box without anybody measuring. **`--sm` is
  24px**, for a button that sits *inside* something: a notice's dismiss, a thumbnail's remove. There is
  no other size, and a local width is a fork.
- **The edge is `--control-edge`**, the measured 3:1 control edge. **`--bare`** drops it, for chrome
  that sits in a bar of its own (a header's back and forward, a drawer's close); it rests in
  `--muted-foreground` and lights `--primary` on `--muted` under the pointer.
- **The glyph is a mask**, named by `data-icon` from the icon set and painted in `currentColor`. One
  colour rule then recolours it on all four themes and in every state. An inline `<svg>` child works
  for a glyph the set does not have; it is sized for you.
- **Hover and open are one look**: the edge takes the glyph's colour and a 12% wash of it fills the
  box. An expand-all carries `aria-expanded` and `aria-controls`, and open keeps that look without a
  pointer.
- **Pressed is solid**, a different look on purpose: a toggle carries `aria-pressed`, and pressed is a
  `--primary` fill and edge with the glyph in `--primary-foreground`, bordered or `--bare`. It stays
  solid under the pointer, so a reader pointing at a toggle can still tell whether it is on (the
  first version drew pressed as the hover wash, and hovering an unpressed toggle looked exactly like
  a pressed one). A toned toggle fills with its tone. A favourite star swaps to the filled star when
  pressed.
- **`data-tone`** (`success`, `warning`, `destructive`, `info`, `pending`, `muted`) recolours it, and
  a toned button keeps its tone under the pointer. The tone must be on the **button**: a `.btn-icon`
  inside a toned container (a notice's dismiss) keeps its own colour.
- **Busy**: set `aria-busy="true"` **and** `aria-disabled="true"` while the press runs, never
  `disabled`. `disabled` throws keyboard focus to `<body>` the moment the press begins, and a keyboard
  user then has to find their place again. With `aria-disabled` focus stays on the button, the glyph
  becomes the spinner at full strength (a busy button is working, not unavailable, so it is not
  dimmed), and the page ignores a second press:

  ```js
  button.addEventListener("click", async () => {
    if (button.getAttribute("aria-disabled") === "true") return;   // busy, or unavailable
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-disabled", "true");
    try { await refresh(); } finally { button.removeAttribute("aria-busy"); button.removeAttribute("aria-disabled"); }
  });
  ```
- **Disabled**: `disabled` dims it to .45. It still shows its `data-tip` to the pointer (measured in
  Chromium), but it leaves the tab order, so a keyboard user cannot reach the reason. When the reason
  matters, use `aria-disabled="true"` instead: same look, still focusable, and the page must then
  ignore the click itself. One listener in the capture phase does that for every handler on the page,
  the busy one's included, and for any handler written later; a guard in each handler is the one the
  next handler forgets:

  ```js
  document.addEventListener("click", (event) => {
    if (event.target.closest("button")?.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  ```
- It is `position: relative`, so a `.count--overlay` sits on its corner; the button's name then carries
  the number (`aria-label="3 commits behind — pull"`), because the overlay is hidden from assistive
  technology.
- It can be the `<summary>` of a `details.dropdown`: `<summary class="btn-icon btn-icon--bare"
  data-icon="history" aria-label="history"></summary>`.

**`aria-label` is mandatory, and it names the target, not the glyph**: "refresh catalog", never
"refresh icon", and "remove shot-1.png", never "remove". A mask is not text, so without a label the
button is announced as "button", and a column of them as "button" a dozen times.

**A `data-tip` says what the name does not, or it is left off**: when it last ran ("last refreshed 2
minutes ago"), why it is off ("refresh runs every 5 minutes"). It never repeats the `aria-label`:
`tooltip.js` points `aria-describedby` at the tip, so a tip equal to the name is announced twice. The
native `title` is never used.

## `.btn-group`: controls that share an edge

```html
<div class="btn-group" role="group" aria-label="sort">
  <button type="button" class="btn-icon" data-icon="arrow-up" aria-label="sort descending"></button>
  <select aria-label="sort by">…</select>
</div>
```

Two or more controls that read as one: a filter trigger and its clear, a sort direction and its field,
a row of icon toggles, a pager's prev and next. The group overlaps them by the width of one edge, so
neighbours share a line instead of drawing two. It takes `.btn-icon`, `.btn-terminal--ghost`, an
enhanced `<select>` (its `.select-field`) and a `.filter-clear`.

- **Label the group**: `role="group"` and an `aria-label`. Each child keeps its own tab stop, name and
  focus ring; the group adds no keyboard model.
- The hovered, pressed or open child is lifted above its neighbours, and the focused one above that,
  so its ring is never cut by the control beside it.
- **One height.** Every child stretches to the tallest, with `--control-h` as the floor. A `.btn-icon`
  gives up its fixed 28px inside a group for that reason, and stays square everywhere else.

## `.form-actions` and `.btn-row`: the footer that commits

```html
<div class="form-actions">
  <p class="form-status" role="status">saved 12s ago</p>
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact">cancel</button>
  <button type="button" class="btn-terminal btn-terminal--compact">save</button>
</div>
```

Every form and dialog in the estate ends in this row, and until now each surface built its own, so the
order of cancel and save and the place of the status line differed by surface.

- **The order: status first, then cancel, then the one primary action last.** One filled button per
  row; everything else is `--ghost`.
- **Buttons carry words.** configr's icon-only ✓ / × confirm is not adopted: two glyphs are a guess.
- `.form-status` is a live region (`role="status"`): muted, one line, and it **truncates** rather than
  pushing the buttons onto a line of their own.
- **A dialog's dismiss is the X in its header**, so its footer only commits, except in a confirmation,
  whose footer *is* the answer pair (deny / approve).
- `--ruled` draws a `--border` rule above the row, for a footer that closes a long form.
- **`.btn-row`** is the same wrapping row without the footer's alignment and margin, for buttons that
  are not the end of a form: a tool row, cockpit's `.cfg-actions`.
- A settings panel whose submit must line up with the value column keeps the `.field-row` with an
  empty `.lbl` (`tables-and-forms.md`). `.form-actions` is for a form or dialog that ends in cancel and
  save.

## `.switch`: on or off, and it says which

```html
<button type="button" role="switch" aria-checked="false" class="switch">follow</button>
```

```js
switchEl.addEventListener("click", () => {
  const on = switchEl.getAttribute("aria-checked") !== "true";
  switchEl.setAttribute("aria-checked", String(on));
  // …apply it now: a switch acts when it is pressed
});
```

It replaces every boolean `.filter-ctl`: `follow` in the log drawer, `hide handled` on the review
page, `hide review/` on the docs page, and netmon's hidden-checkbox `label.chk`. 0.59.0 drew those as
`[ ] follow` / `[x] follow`, which said "this is a choice" but still read as a row of words. A switch
is the control every reader already knows means "this stays on until I turn it off".

- **A `<button>` with `role="switch"`**, not a checkbox dressed up. The page flips `aria-checked`
  exactly as it flipped `aria-pressed` before; Space and Enter come from the button, and the name is
  the visible text. Nothing else: no hidden input, no `for`, nothing a re-render can orphan.
- **The label comes first and the track after it.** The state is the knob's position as well as the
  fill, so it never rests on colour alone: off is a `--muted-foreground` knob at the start of an empty
  track, on is a `--primary-foreground` knob at the end of a `--primary` one.
- It is square. configr's Toggle is the source, with its pill, round knob and literal colours
  corrected onto tokens.
- **In a filter bar** it sits among the filters, before the separator and the actions (`filters.md`
  has the order). "Select all pending" and "clear selection" beside it are actions, so they are ghost
  buttons, not switches.

## Checkboxes and radios: drawn, element-level

```html
<label class="check"><input type="checkbox" name="agents" value="claude"> claude <span class="check-meta">· new</span></label>

<fieldset>
  <legend>review type</legend>
  <label class="check"><input type="radio" name="rt" value="public" checked> public</label>
  <label class="check"><input type="radio" name="rt" value="silent"> silent</label>
</fieldset>
```

**Every `input[type="checkbox"]` and `input[type="radio"]` is restyled by loading the file**; there is
no class to add. A native box is the operating system's: on macOS each of the 37 in cockpit's source
was a rounded, system-blue control in a square terminal page, and `accent-color` (seedr studio's
answer) recolours the fill but keeps the rounded box. It cannot be restyled, only replaced, so it is
`appearance: none` and drawn: a 14px square on `--control-edge`, and when checked a `--primary` fill
with the check cut out of it. The radio is the one circle the estate allows.

- **Wrap the input in `label.check`**, input first, as its direct child. The words are then part of
  the target, hovering them lights the box, and a disabled box dims its whole label once.
- `.check-meta` is the quiet part of a label ("· new", "— posts on the PR").
- **A group has a name**: `fieldset` + `legend`, or `role="group"` + `aria-label`.
- **Indeterminate is a property, not an attribute**: `box.indeterminate = true` from script (a
  select-all whose rows are partly chosen). It draws the fill with a minus. A radio group with nothing
  chosen also matches `:indeterminate` in CSS, and correctly draws nothing.
- **A filter is never a checkbox.** A box that narrows a list is a filter dropdown or a chip set; a
  box that turns something on now is a switch.

## `.segmented`: one value of a few, chosen in place

```html
<div class="segmented" role="group" aria-label="preview mode">
  <button type="button" aria-pressed="true">formatted</button>
  <button type="button" aria-pressed="false">raw</button>
  <button type="button" aria-pressed="false" disabled data-tip="no diff: this file is new">diff</button>
</div>
```

A preview's formatted / raw, a chart's range, a list's view. The segments are joined into one control;
the chosen one is the only one in `--primary`, bold, on a 12% fill, with its own edge lifted over its
neighbours'. 12% is the ceiling: `--primary` on its own 12% tint is 4.72:1 on warm over `--muted`, and
a stronger fill drops it under AA.

- **Exactly one `aria-pressed="true"`**, and the page moves it; the group is labelled.
- **An icon-only segment is empty**, not even a space, with a `data-icon` and an `aria-label`. That is
  what makes it square.
- **An unavailable segment is `disabled` and keeps its `data-tip`**, which is where the reader learns
  why.
- **It is not a tab bar and not a filter.** Switching whole panels is `.tabs`; narrowing a list is a
  filter. A segmented control chooses a value inside a view that stays where it is.

## `.choice-card`: an option with a sentence under it

```html
<div class="choice-grid" role="group" aria-label="install scope">
  <button type="button" class="choice-card" aria-pressed="true" data-icon="home">
    <span class="choice-title">user</span><span class="choice-desc">~/.claude, every project</span></button>
  <button type="button" class="choice-card" aria-pressed="false" data-icon="folder">
    <span class="choice-title">project</span><span class="choice-desc">.claude/ in this repository</span></button>
</div>
```

For a question whose options need explaining, where "user" and "project" are different decisions and
the difference is a sentence. Each card is a button with a glyph (`data-icon`, optional), a title and
a description, and the whole card is the target.

- **Same state model as `.segmented`**: `aria-pressed` on each card, exactly one pressed, the grid
  labelled.
- **Pressed is the tone's edge, a 12% tone fill over `--card`, and the description turns
  `--foreground`.** That last part is measured, not styled: `--muted-foreground` on that fill is under
  4.5:1 on warm and mono whatever the tone. `data-tone` recolours the edge, the fill and the glyph.
- **Unavailable is `disabled` plus a `data-tip` giving the reason** ("this folder is not a git
  repository").
- **Its tone is its own.** `data-tone` on the card recolours it; a card inside a toned container
  (a warning notice, a danger zone) does not take the container's colour, because it resets `--tone`
  at its root like every neutral-default component.
- `.choice-grid` fills the width with cards of at least 14rem.

## `.dropzone` and `.thumb-grid`: a file input the keyboard can reach

```html
<label class="dropzone" data-icon="image-plus">
  <input type="file" accept="image/*" multiple>
  drop screenshots or choose files
  <span class="dropzone-note">max 5 MB each</span>
</label>
<ul class="thumb-grid">
  <li class="thumb"><img alt="" src="…">
    <button type="button" class="btn-icon btn-icon--sm" data-tone="destructive" data-icon="x" aria-label="remove shot-1.png"></button></li>
</ul>
```

configr's uploader was a `div` with an `onClick`: a mouse could open the picker and a keyboard could
not reach it at all. **The zone is a `<label>` around a real `<input type="file">`**, which fixes that
by construction: Tab lands on the input and Space opens the picker, and a click anywhere on the zone is
a click on the label. The zone hides its own input, so no utility class is needed, and it draws its
own glyph from `data-icon` on the label (24px, above the words), so it needs no `.ico` child either:
it renders on a page that loads `tokens.css` and `controls.css` and nothing else.

- The focus ring is drawn on the **zone** while the input has keyboard focus, and not after a mouse
  click (which focuses the input too).
- **Hover and drag light the whole zone**: `--primary` edge, text and glyph, on an 8% fill. The text
  changes colour with the fill because `--muted-foreground` on it measures under AA.
- **The page sets `data-dragging`.** Enter and leave fire for every child the pointer crosses, and
  WebKit (configr runs in WKWebView) sends `dragleave` with a null `relatedTarget`, so "did it leave
  the zone?" cannot be asked of the event. Count instead: the drag has left when every enter has had
  its leave.

  ```js
  let depth = 0;
  zone.addEventListener("dragenter", (e) => { e.preventDefault(); depth += 1; zone.dataset.dragging = ""; });
  zone.addEventListener("dragover", (e) => e.preventDefault());
  zone.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) delete zone.dataset.dragging; });
  zone.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; delete zone.dataset.dragging; add(e.dataTransfer.files); });
  input.addEventListener("change", () => add(input.files));
  ```

- A disabled input (the limit is reached) dims the zone and stops it lighting; say why in the zone's
  text ("5 of 5 screenshots attached").
- **Thumbnails** are three to a row, 16:9. The remove button sits in the corner on an opaque plate, so
  its glyph is legible on any picture, and it shows on hover or focus (always on touch). Its label
  names the file. After a removal, focus moves to the next remove button, or back to the input when
  none is left, never to the page.

## `.reveal`: actions that appear on hover, on focus, and always on touch

```html
<li class="reveal-host">poi/vu3
  <span class="reveal btn-row"><button type="button" class="btn-icon btn-icon--sm" data-icon="star" aria-pressed="false" aria-label="favourite poi/vu3"></button></span>
</li>
```

A card's star, a row's remove: shown only while the reader is on that item, so a list of forty does not
carry forty sets of buttons. **It is opacity, never `display` or `visibility`.** configr hid one list's
actions with `display: none`, which took them out of the tab order: until the pointer arrived, a
keyboard could not reach them. An invisible action here is still a tab stop, and the moment focus lands
on it the host's `:focus-within` shows it. On a screen with no hover (a phone) the actions are simply
visible. A `.thumb`'s remove button follows the same rule without the classes.

The reveal only ever takes opacity AWAY (while the host is neither hovered nor focused). A revealed
action therefore shows at its own opacity, so a **disabled** one stays at .45 when its row is hovered
and on a phone, instead of lighting up at full strength and looking pressable.

**A pressed toggle is never hidden.** A favourite that is on is something the row says, not an action
waiting for the pointer, so a pressed toggle stays visible at rest: as the `.reveal` itself, or as a
direct child of one, beside actions that still wait.

Do not reveal the only way to do something that matters. Hover-revealed actions are for secondary
actions on items in a list; the item's primary action stays visible.

## `.confirm-inline`: the second press, in place

```html
<!-- at rest -->
<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--destructive" aria-label="remove poi/vu3"></button>
<!-- armed: the page swaps the button for this -->
<span class="confirm-inline" role="group" aria-label="confirm remove poi/vu3">
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--danger btn-terminal--compact">remove</button>
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact">keep</button>
  <span class="confirm-inline-note">commits on main</span>
</span>
```

The first press **arms** the action, the second **decides** it, without a dialog. It fits an action
that is one row's business and cannot be taken back, where a modal would weigh more than the question.

- **The page owns the swap and the focus**: arming moves focus to the confirming button; keep, Escape,
  or any change to the row disarms and returns focus to the original button. A pair left armed on a row
  that has re-rendered or lost the selection would confirm something the reader is no longer looking
  at. `examples/controls.html` has a complete handler.
- **The pair says the verb in words** (remove / keep), never ✓ / ✗.
- `.confirm-inline-note` says what the press does that the verb does not, in `--warning`.
- **A refused action is a disabled button with its reason in a `data-tip`.** Put the tip on a wrapper
  when the reason must reach the keyboard, since a disabled button leaves the tab order.

## `.confirm-code`: type it back

```html
<div class="confirm-code">
  <p class="confirm-code-value" role="img" aria-label="code 4 8 1 7">4817</p>
  <label>type the code <input class="confirm-code-input" inputmode="numeric" autocomplete="off" spellcheck="false"></label>
  <p class="confirm-code-status" role="status"></p>
</div>
<div class="form-actions">
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact">cancel</button>
  <button type="button" class="btn-terminal btn-terminal--compact" disabled>approve</button>
</div>
```

Cockpit's approval dialog: a press that spends money is confirmed by typing back a code shown beside
it, so the decision cannot be a reflex.

- **The confirming button stays `disabled` until the typed value matches.** Compare trimmed, and in
  the code's own case rules (cockpit lower-cases a hash head).
- **The status line is a polite live region whose tone the page sets**: `data-tone="warning"` and
  "that is not the code shown above" on a mismatch, no tone while it works. It reads only its OWN
  `data-tone`, so inside a toned notice it stays muted until the page says otherwise. It always
  reserves one line, so the dialog does not jump when the message appears.
- **The code is read one character at a time**: it is set in the mono face and tracked, and it is
  named for assistive technology digit by digit with `role="img"` and an `aria-label`. An `aria-label`
  on a bare `<p>` is not allowed by ARIA and is ignored.
- `inputmode` fits the code's alphabet: `numeric` for digits; for a hash head leave it off (or
  `text`), since letters are part of it.
- The input is the one text size and at most 14rem wide; only the code itself is `--fs-xl`.
- A code that expired or an ask that was withdrawn is a `disabled` input: .45, and it does not light
  under the pointer.

## Touch, motion, paper, forced colours and `hidden`

- **Under a coarse pointer every control grows to 44px** by `min-*`, so the glyph or the label stays
  where it was drawn: icon buttons both ways, segments, switches, `.check` labels, choice cards, the
  code input. A checkbox grows through its `.check` label, which is what a thumb actually hits.
- **Motion** is `.15s` transitions and the busy spinner. `html.anim-off` stops all of it, and
  `prefers-reduced-motion` stops the spinner (the loader glyph stays).
- **On paper**, the controls that only act (icon buttons, groups, footers, drop zones, revealed
  actions, the confirmations) are removed. Checkboxes, radios, switches and `.segmented` carry a
  value, so they print, with their fills kept (`print-color-adjust: exact`): without it a checked box
  would print empty, and an icon segment would print without its glyph. A `.btn-group` that is a
  filter dropdown or a sort control (`filters.md`) prints too: it says how the printed list was
  narrowed and ordered.
- **Forced colours** (Windows High Contrast) are answered in the file, on every theme and both
  palettes. Glyphs take `forced-color-adjust: preserve-parent-color` and paint in the colour their
  control was forced to (CanvasText where the engine lacks it). The drawn states are redrawn in system
  colours: on, checked, pressed and chosen are a `Highlight` fill with a `HighlightText` knob, mark or
  glyph; off is a `ButtonText` edge; disabled is `GrayText`. A pressed segment and a chosen card carry
  text on that fill, so they opt out of forcing with both colours named: otherwise the browser paints
  a Canvas backplate behind the words and they vanish. Nothing to add on a page; do not "fix" a glyph
  here with `forced-color-adjust: none`, which keeps the author colour instead of the reader's.
- **`hidden` hides every control.** Each class sets its own `display`, which beats the browser's own
  `[hidden]` rule, so `tokens.css` carries the one rule that makes `hidden` win for every component.
  Nothing here repeats it, and a page should not add a per-class `[hidden]` guard either.
