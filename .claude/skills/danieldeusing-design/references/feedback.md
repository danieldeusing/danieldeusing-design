# Feedback, states, tags and badges

Reference for the `danieldeusing-design` skill. Read it before you render an empty list, report
what an action did, annotate a paragraph, raise an alarm about the whole app, print a status word,
show a load in progress, show text somebody else wrote, or put a tag, a count or a dot on anything.
The classes are `src/feedback.css` and `src/tags.css` (0.60.0); the dismiss is `runtime/notice.js`.

Contents:

- Which one — the decision table
- Colour is `data-tone`, and a tone never leaks into a child
- `.empty` — which nothing (S1)
- `.notice` — an outcome, reported where it happened (S2)
- `.callout` — an annotation where it stands (S3)
- `.banner` — a property of the whole app (S4)
- `.state` — a status word with a glyph (S5)
- `.spinner` and `.loading` — always with words (S6)
- `.fence` — text a stranger wrote (S7)
- `.dot` — never the state itself (S8)
- `.tag` — a word that classifies (T1)
- `.count` — how many (T2)
- Loading the files, tokens-only surfaces, frameworks

## Which one

Every surface in the estate grew its own version of each of these, and no two agreed on a padding,
a tint or which colour means what. Pick by **what you are saying**, not by how loud you want it:

| you are saying | write | not |
|---|---|---|
| this list has nothing in it — empty, no match, or failed to load | `.empty` | a notice, or one "nothing here" for all three |
| what an action did, or a state this view is in | `.notice` | a callout |
| a remark about the content right here | `.callout` | a notice |
| something true of the whole app — alerts, "control is frozen" | `.banner` | a notice at the top of one section |
| the status of one row, read down a column | `.state` | colour alone |
| work in progress | `.loading` with a `.spinner` in it | a spinner with no words |
| text a third party wrote — a PR description, a ticket body | `.fence` | a code block, a quote, rendered markdown |
| live / down at a glance, beside the word that says it | `.dot` | a dot on its own |
| a word that classifies a thing — a state badge, a type, a scope | `.tag` | a button dressed as a tag |
| how many | `.count` | a tag with a number in it |

A `.state` and a `.tag` can carry the same tone. Use `.state` when the column **is** the status
(`✓ passed`, `✗ failed`): its glyph makes the column scannable in grey. Use `.tag` when the word is
one of several badges on the thing.

## Colour is `data-tone`, and a tone never leaks into a child

**One attribute colours every element here:** `data-tone="primary | success | warning | destructive
| info | pending | muted"` (tokens.css sets `--tone` from it). No class name encodes a colour, so a
notice, a callout, a banner, a dot, a tag and a count all take the same seven words.

**The attribute on the element is the only thing that colours it.** `--tone` is a custom property
and custom properties inherit, so without a guard a neutral tag inside a `data-tone="success"` card
reads the card's tone and turns green. Every element in these two files that has no `data-tone` of
its own resets `--tone` and falls back to its own default: a tag or a count to muted, a callout to
`--primary`, a banner to `--destructive`, a dot to the colour of the words beside it. So give a
child its own `data-tone` when you want it coloured. Never rely on the one around it.

An **identity** (which agent, which type, which host) is not a state: it takes one of the twelve
categorical hues, `style="--tag-color: var(--cat-teal)"`, on a tag. Which thing gets which hue is
the surface's decision. The palette is shared and measured (`--cat-*`, foundations.md).

## `.empty` — which nothing (S1)

```html
<div class="empty"><p class="prompt">ls registry/</p><p>no skills match these filters.</p>
  <button type="button" class="doc-link doc-link--forward">reset filters</button></div>
<div class="empty" data-tone="warning" data-icon="triangle-alert" role="alert">
  <p>could not load the registry: github answered 502.</p>
  <button type="button" class="doc-link doc-link--forward">try again</button></div>
<div class="empty empty--inline">no files in this folder.</div>   <!-- a narrow pane -->
```

**Three states that look identical as a blank panel are three different facts, and each gets its
own sentence.** The estate used to say "nothing here" for all of them. Cockpit's table engine
learned to keep them apart first (C56), and configr's catalog filter had to learn it again (I12):

| the state | say | offer |
|---|---|---|
| the store is empty | "no skills yet" — nothing exists | how to add the first one, if the reader can |
| nothing matches | "no skills match these filters" — name the cause | the reset (`button.doc-link--forward`, never red: resetting a view destroys nothing) |
| it failed | "could not load the registry: …" — say it failed, and what failed | a retry |

- Centred and muted with 2rem of air, because the message is the only thing in the panel.
  `--inline` is the same message start-aligned and compact, for a narrow pane.
- The glyph is optional. Its shape comes from `data-icon`, its colour from `data-tone`, and a failure
  is `data-tone="warning" data-icon="triangle-alert"`. Most empty states should not have a glyph.
- **Not a live region.** An empty state re-renders on every keystroke of a filter, and announcing
  each one is noise. Only the failure is `role="alert"`.
- In a table, put it inside the placeholder cell: `<td colspan="…"><div class="empty">`. `display:
  grid` on the `<td>` itself stops it being a cell.
- No dashed edge. Dashed is the fence's mark ("this came from outside"), so it is not used for "empty".

## `.notice` — an outcome, reported where it happened (S2)

```html
<!-- the region is rendered EMPTY with the view; when the install finishes, the notice goes into it -->
<div role="status" id="install-result">
  <div class="notice" data-tone="success"><p>installed review into ~/.claude/skills.</p></div>
</div>

<div class="notice" data-tone="warning" role="alert">
  <span class="notice-label">warning:</span><p>two sources publish this skill; the newer one wins.</p>
  <button type="button" class="btn-icon btn-icon--bare btn-icon--sm notice-dismiss" data-icon="x"
          aria-label="dismiss"></button>
</div>

<!-- a dialog's result slot, the same pattern: a --lg notice is a result, so it always arrives later -->
<div role="status" id="update-result">
  <div class="notice notice--lg" data-tone="success" data-icon="circle-check">
    <div><p>you are on the latest version.</p><p class="text-muted-foreground">version 0.60.0</p></div>
  </div>
</div>
<!-- a FAILED result is an alert: it is mounted BESIDE the slot, with its words, never inside it -->
<div class="notice notice--lg" data-tone="warning" data-icon="triangle-alert" role="alert">
  <div><p>the update could not be downloaded.</p><p class="text-muted-foreground">github answered 502.</p></div>
</div>
```

**The label is the meaning; the colour only speeds the scan.** Write a lower-case word and a colon,
bold in the tone: `warning:`, `refused:`, `failed:`, `unknown:`. A reader who cannot tell amber from
red still reads it. A **success has no label**, because it confirms what was expected and a label
would only repeat the colour. No `data-tone` is a neutral notice.

- **The sentence is `--foreground`, never the tone.** The label carries the tone and the sentence
  carries the content.
- **The contract is a label, ONE body element, and an optional dismiss.** The body takes the free
  width and wraps under itself, so the label hangs at the start of the first line. More than one
  paragraph goes inside one `<div>`.
- **`role="alert"` only for `warning` and `destructive`. Every other tone, and no tone, is
  `role="status"`.** An info, pending or primary notice that interrupts is noise; a warning or a
  failure the reader misses gets acted on as if the install had run.
- **The two roles are announced differently, so they are mounted differently.**
  - An `alert` may arrive with its words: mount the notice, text and all, with `role="alert"` on
    it, and it is read out at once.
  - A `status` is polite, and a polite live region is only announced reliably when it was ALREADY
    in the page before its content changed. So render an empty `<div role="status">` with the view
    and put the notice into it when there is something to say. The region carries the role; the
    notice inside it carries none. A notice that is in the page from the first render may carry
    `role="status"` itself, since there is nothing to announce yet.
  - **No live role ever sits inside a live region**, status or alert, so a failed result is mounted
    beside the status slot, never inside it.
- **One dismiss, the bare ×, named "dismiss".** `.notice-dismiss` only places it (end of the first
  line). The button itself is `.btn-icon.btn-icon--bare.btn-icon--sm` from controls.css. configr had
  three spellings of this one act; there is one now.
- `--lg` is a **result**, not a remark: the "update finished / update failed" block of a dialog. It
  has more room and a leading `data-icon` glyph at the display size, in the tone. A result arrives
  after an action: a finished one goes INTO the dialog's status slot and carries no role itself; a
  failed one is an alert, mounted beside the slot.
- **The tint is 6% of the tone mixed into `--background`.** Do not raise it and do not change it to
  sit over `transparent`. Over `transparent` the box takes on the colour of whatever surface it sits
  on, and on warm's `--muted` the neutral label then measures 4.34:1. Mixed into the page colour it
  clears 4.5:1 on every theme and surface (4.82 at worst). `scripts/check-feedback.mjs` measures it
  on every run.

**On a build-free page call `initNotices()` once** (runtime/notice.js). It handles every
`.notice-dismiss`, including notices rendered later, with one listener on the document. On a
click it:

1. fires `notice:dismiss` on the notice, **bubbling and cancelable**. Listen for it when your next
   render would otherwise put the notice straight back. Call `preventDefault()` to hide it your own
   way instead.
2. moves focus to the next focusable element after the notice, or to the one before it, but only if
   focus was inside the notice. Otherwise focus would fall to `<body>` and send a keyboard user back
   to the top of the page. "Focusable" means somewhere the reader could Tab to: never a negative
   `tabindex` (select.js's hidden `<select>`, an inactive tab), nothing inside `aria-hidden="true"`
   or `inert`, nothing disabled or unrendered. If a focus does not take (`visibility: hidden`), the
   next candidate is tried.
3. removes the notice.

## `.callout` — an annotation where it stands (S3)

```html
<aside class="callout" data-tone="warning">
  <p class="callout-title">outside the default folder</p>
  <p>Skills here are not picked up until the path is added to the registry list.</p>
</aside>
<p class="callout"><strong class="callout-title">note</strong> the pin moves with the release.</p>
<aside class="callout" data-tone="info" data-icon="info">…</aside>
```

**A notice reports; a callout annotates.** Use a callout for a permanent remark about the content
beside it. Use a notice for what just happened or the state the view is in. Cockpit's `.note` did
both jobs 186 times, which is why a form result and a standing explanation looked identical there.

- A 2px rule in the tone (`--primary` by default), a short inset, a title in the tone over a muted
  body, and **no fill**. seedr and configr drew it this way independently. A filled box reads as a
  panel, and a page with twenty of them reads as a page of panels.
- The title is a `<p class="callout-title">` on its own line, or a `<strong class="callout-title">`
  lead word inside one line of text.
- `data-icon` adds a glyph in the tone, hanging at the start of the first line. It works on the
  one-line form too.
- **Empty means absent.** An empty callout is `display: none`, so a form can park its result slot
  in the page and fill it on submit without an accent rule pointing at nothing in the meantime.
- `.eli5` stays the one **marked** callout (components.md).

## `.banner` — a property of the whole app (S4)

```html
<div class="banner bleed-rail" role="alert">
  <p class="banner-title">2 alerts</p>
  <ul class="banner-list"><li>netmon: adguard unreachable <a href="/netmon/">fix →</a></li>…</ul>
</div>
<div class="bar-stack">                               <!-- chrome.css: the sticky layer -->
  <div class="banner" role="status"><p class="banner-title">control is frozen</p>…</div>
  <header class="bar">…</header>
</div>
```

**For a fact about everything under it, not about one section:** an alert list, a frozen control
plane, a maintenance window. It is full bleed, so mount it as a child of `<body>` above the content
and add `.bleed-rail` so it spans the `ls -l` rail's reserved gutter like the header does.

- `--destructive` by default, since a banner is usually a stop. Any other tone takes `data-tone`.
- Items in a `.banner-list` are divided by a faint rule in the banner's own colour, because three
  wrapped alerts separated by space alone read as one paragraph. Links are underlined and never wrap.
- **A banner that must stay in view goes first inside `.bar-stack`, the header's sticky layer
  (chrome.md, WP3). Never two siblings sticking at top 0**: they do not stack, they overlap, and the
  header disappears under the banner the moment the page scrolls. The stack is the sticky element
  and it bleeds past the rail itself, so a banner inside it takes no `.bleed-rail` of its own.
- `role="alert"` for an alarm, `role="status"` for information: a frozen control plane is a state,
  not an alarm, so it is a status (S4). **Render it only when there is something to say.** An empty
  banner is still a red strip.

## `.state` — a status word with a glyph (S5)

```html
<span class="state" data-state="ok">passed</span>
<p class="state" data-state="bad" role="alert">could not read the file</p>
```

| `data-state` | glyph | colour |
|---|---|---|
| `ok` | ✓ | `--success` |
| `bad` | ✗ | `--destructive`, bold — the one not to miss |
| `warn` | ● | `--warning` |
| `info`, `running` | ● | `--info` |
| `pending` | ○ | `--pending` — hollow: no verdict yet |
| `skip` | – | `--muted-foreground` |
| `none` | — | `--muted-foreground`, regular weight |

**The word carries the meaning and the glyph is hidden from assistive technology.** The stylesheet
draws the glyph with empty alternative text (`content: "✓" / ""`). Never type it into the markup: a
screen reader would hear "check mark passed", and the page and the state would have two sources.
The glyph's shape is what lets a column be scanned in grey, because ✓ and ✗ differ in shape, not
only in hue. In a cell it never wraps. As a `<p>` it is an inline error line that does wrap.

## `.spinner` and `.loading` — always with words (S6)

```html
<!-- in the page from the first render: the row may carry the role itself -->
<div aria-busy="true">
  <p class="loading" role="status"><span class="spinner" aria-hidden="true"></span>loading skills…</p>
</div>

<!-- mounted later (a reload, a retry): into a status region the view rendered empty -->
<div role="status" id="reload-status">
  <p class="loading"><span class="spinner" aria-hidden="true"></span>reloading skills…</p>
</div>
```

**A spinner is never the message.** `html.anim-off` and `prefers-reduced-motion` stop it and leave
the arc standing, so the words have to say everything on their own. `.loading` is the row it lives
in: muted, and a status. **Its role follows the notice's rule** (the lead's ruling): a row that is
in the page from the first render may carry `role="status"` itself; one mounted later goes into a
`role="status"` region that was already in the page and carries no role of its own, since a live
region created together with its words is announced unreliably. The region being FILLED (the list,
not the status region) carries `aria-busy="true"` until it settles.
A spinner inside a busy BUTTON is the control's own state (controls.md): `aria-busy="true"` with
`aria-disabled="true"`, never `disabled`, which throws keyboard focus to `<body>` mid-action.
`.spinner` is the text's glyph size and takes its line's colour, and `--lg` is for a whole-page
load. It is one glyph, lucide's loader-circle, where configr had four sizes in three colours.

Every exit path replaces the loading row: rows, the empty state, or the failure. None of them may
leave it spinning.

## `.fence` — text a stranger wrote (S7)

```html
<figure class="fence">
  <figcaption class="fence-label">untrusted · pull request description</figcaption>
  <div class="fence-body"></div>          <!-- set with textContent -->
  <p class="fence-end">end of untrusted text</p>
</figure>
```

**Third-party text is never blended into the page.** A PR description, a ticket body and a commit
message are bytes somebody else chose, shown on a page that also shows your words. Summarising while
reading is where an injection gets passed off as your own note, so the text is fenced verbatim and
labelled at **both** ends. Where it starts and where it stops are then never a judgement call.

- **Write the body with `textContent`. Never render it as markdown and never make it links.**
  Rendered markup would let the stranger decide what the inside of the fence looks like.
- The dashed `--warning` frame is this mark and nothing else in the estate uses it. Do not borrow
  it for "empty" or "draft".
- An empty body shows *(empty)*. It is read out, because the fact that the stranger wrote nothing
  is information.
- It never scrolls inside a box and it does not split across printed pages.

## `.dot` — never the state itself (S8)

```html
<span class="dot dot--pulse" data-tone="success" aria-hidden="true"></span> live
<button type="button" class="btn-icon" data-icon="mail" aria-label="messages — 1 unread">
  <span class="dot dot--overlay" data-tone="destructive" aria-hidden="true"></span></button>
```

**Always `aria-hidden="true"`, always beside a word.** The word is the state. A connection label
that changes is `role="status"`. With no `data-tone` the dot takes the colour of the text around it.

- `--pulse` is for **live only**. A pulsing dead dot is the bug wearing the fix. It stops under
  `anim-off` and reduced motion.
- `--overlay` sits on the corner of its host, which must be `position: relative` (`.btn-icon` already
  is). A ring in the page colour cuts it out of the host's edge.
- `.dd-dot` is a different thing and stays: it is the theme indicator.

## `.tag` — a word that classifies (T1)

```html
<span class="tag" data-tone="success">installed</span>
<span class="tag" style="--tag-color: var(--cat-teal)"><span class="ico" data-icon="package"></span>mcp</span>
<span class="tag tag--bracket glow">live</span>
<button type="button" class="tag" data-tone="info" data-tip="open the forge's settings">github.com</button>
```

**Border-only: the word in the colour, a 50% edge of the same colour, no fill.** seedr and configr
both settled on this (R81). A filled chip in every row of a twenty-row table is a column of loud boxes.

| modifier | means | reach for it when |
|---|---|---|
| (none) | a state (`data-tone`) or an identity (`--tag-color`) | almost always |
| `--dashed` | it does not count | not the proof, skipped, superseded, not actionable |
| `--off` | off — muted and dotted, the only dotted edge | excluded, disabled; it would once have been `opacity: .6` |
| `--strong` | must not be missed — full edge, bold | a verdict: PASS / FAIL |
| `--struck` | retired | history, not an error |
| `--solid` | the widest blast radius — the page colour on a fill of the tone | **one per view at most**: `global` vs `repo`, `public` vs `internal` |
| `--icon` | icon only, a square with a 12% tint | `role="img"` and an `aria-label` are mandatory |
| `--bracket` | the terminal's own `[ live ]`, no box | pagr's status; add `.glow` to light it |

- **Modifiers compose**, and the border style is a second axis a reader can use in grey (D10):
  dashed means it does not count, dotted means off. `tag--dashed tag--strong` in `--pending` is
  "timed out". There is no `--dotted`: dotted means off, `--off` is the only thing that draws it,
  and an off tag stays dotted whatever else it carries.
- **Opacity is never an axis.** `--off` replaced it (R85): opacity dims the word below AA and makes
  the tag look broken rather than off. The one thing here below full opacity is a disabled
  `button.tag`, which is a control's state, not a tag's meaning.
- **An icon** is `data-icon` on the tag or a `.ico` child, drawn at the small glyph size. The word
  stays the meaning.
- **Never type the brackets** of `--bracket`, because the stylesheet draws them with empty alt text.
  A screen reader hears "live".
- **A tip is `data-tip`, with no marker and no cursor change** (R86). You find it by hovering. It
  never repeats the accessible name: `tooltip.js` sets `aria-describedby`, so the same words would be
  read twice. Say something the name does not, or leave the tip off.
- **`button.tag`** is a tag that *does* something, such as opening the forge's settings. It keeps the
  tag's look, its edge firms up under the pointer, it has a focus ring, it is .45 when disabled, and
  it grows to 44px under a coarse pointer. **A tag that filters by its own value** is
  `button.value-filter` around a plain `.tag` (filters.md), not a `button.tag`.
- Tags sit on a line of text centred on its x-height (`vertical-align: middle`), so tags with and
  without a glyph line up.

## `.count` — how many (T2)

```html
skills <span class="count">12</span>
<button type="button" class="btn-icon" data-icon="download" aria-label="3 commits behind — pull">
  <span class="count count--overlay" aria-hidden="true">3</span></button>
```

- **Square** (R83). Every source drew a pill and there is no pill in this estate. It uses tabular
  figures, so a count ticking from 9 to 10 widens by a whole digit and never jitters.
- Muted by default. `data-tone` colours it.
- **`--overlay` is filled and hidden.** It sits on the host's corner (the host is `position:
  relative`), `--primary` unless it has its own `data-tone`, and it is `aria-hidden`. The host's
  `aria-label` contains the number ("3 commits behind — pull"), so a screen reader hears it once, in
  a sentence.
- **Cap it yourself:** "99+" is the page's decision. The box grows to fit whatever it is given. On a
  28px `.btn-icon` the 20px overlay covers the glyph's top-right corner. When the count matters more
  than the glyph, put a plain `.count` beside the button instead.

## Loading the files, tokens-only surfaces, frameworks

- **Both files need `tokens.css` and nothing else.** They set their own font size, line height and
  inner margins, so a surface that loads only tokens + chrome (netmon) can load them beside it and
  get the same box. `scripts/check-feedback.mjs` proves this on every run by rendering the demo with
  and without base, components, chrome and the reset and comparing 45 listed computed properties
  of every fixture, font family and size among them.
- **They never set a component's outer margin.** How far a notice stands from the paragraph above
  it is your page's layout, and your reset decides it for every element alike. The fence is the one
  exception, because a `<figure>` arrives with 40px side margins.
- **Print:** the dismiss disappears, a fence does not split, a dot keeps its fill, and `--solid`
  tags and overlay counts print outlined. The page colour on a fill would otherwise print white on
  white once the browser drops background colours.
- **Forced colours** (Windows high contrast): every glyph here is a background shown through a mask,
  which a forced palette would paint over with the page colour. Each one takes
  `forced-color-adjust: preserve-parent-color`, so it is drawn in the forced colour of its words,
  on a light palette and a dark one. Not `none` for a glyph of your own: `none` hands
  `currentColor` the page's unforced colour, which on a dark palette's black Canvas measured
  1.78:1. `--solid` tags and overlay counts are redrawn as the palette's own pair, inverted, so loud
  still differs from quiet. Words, `.state` glyphs, dashed and dotted edges, weight and strike
  survive on their own.
- **`hidden` hides every one of these**, including those that set their own `display`: tokens.css
  carries the one `[hidden]` rule for the whole system. Do not add a per-class guard.
- **Framework apps** (seedr, configr, pagr islands) render this markup and never run
  `initNotices()` over nodes they own. Removing a node React rendered desynchronises React. Render
  the notice from state, remove it in your own click handler, and move focus as the runtime does:
  to the next element after the notice that the reader could Tab to, else the one before it, and
  check that the focus took.
- The demo, with every element in every state, is `examples/feedback.html`. Add `?bare` for the
  tokens-only rendering.
