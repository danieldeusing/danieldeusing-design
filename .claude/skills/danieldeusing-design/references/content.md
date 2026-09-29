# Content: titles, labels, markdown, code, commands, copy, the meta line, the error page

Reference for the `danieldeusing-design` skill. Read it before a page gets a title, a label over a
block, rendered markdown, a code block, a command someone will copy, a meta line, a series
navigator, the boot banner or an error page. The classes are `src/content.css`, the copy button's
behaviour is `runtime/copy.js`, and the error page is `templates/error-page.html`. Inline `code` and
`kbd` take no class: they are element defaults in `base.css` (see `foundations.md`).

Contents:

- `.page-title` and `.lede` — lit, and two sizes (P1)
- `.eyebrow` — the one label look (P2)
- `.section-head` and `.subhead` (P3)
- `.markdown`, and the lists outside it (P4) — `@tailwindcss/typography` is retired
- Code: `.code-block`, `.code-view`, syntax and diff colours (P5)
- `.cmd` — a command to copy (P6)
- The copy button: `data-copy` and `initCopyButtons()` (P7)
- `.meta`, and nothing is quieter than muted (P8)
- `.seq-nav` — "in this series" (P9)
- `.boot-log` (P10)
- The error page: `templates/error-page.html` (S9)
- Where it works: tokens-only, Tailwind, print, forced colours, `hidden`

## `.page-title` and `.lede` — lit, and two sizes (P1)

```html
<p class="prompt">cat ~/about.txt</p>
<h1 class="page-title">about<span class="cursor-block" aria-hidden="true"></span></h1>
<p class="lede">What this page is, in one or two sentences.</p>
```

**Two sizes, and which one is not a taste call** (the lead's ruling, 2026-09-28):

| the page | write | size |
|---|---|---|
| a view in an app — cockpit, configr, seedr's registry | `h1.page-title` | `--fs-2xl`, 24px at every width |
| a page of a public site — danieldeusing.de, an article | `h1.page-title.page-title--display` | `--fs-display`: 30px, 36px from 48rem |
| the error page's status line | `.page-title--display` | as above |

An app title sits above a table or a form, and a larger one only pushes the content down. The
public site titles its pages at 30/36px and is a source of truth, so the system got one display
step instead of the site being shrunk to fit the scale. **Nothing else takes the display step** — not
a section heading, not a card title, not a stat. The breakpoint lives in the token, so the class
needs no media query and neither does your page.

- **It is lit**: `--primary` with the large glow, as seedr and danieldeusing.de draw it. Do not add
  `.glow-lg` or a colour — the class already has both. Cockpit's unlit `h1.title` and configr's
  `--foreground` title move to it. `--primary` is 5.59:1 at worst (warm, over `--muted`).
- **The gaps are sibling rules**: 1.5rem under a `.prompt`, .5rem from the title to the `.lede`. A
  title with nothing above it carries no margin to strip. Do not add `mt-*` or a margin of your own.
- **A leading glyph** is `<span class="ico" data-icon="home" aria-hidden="true"></span>` as the
  title's first child: it takes the 24px step, sits on the text, and is the title's colour.
- **The cursor** is `.cursor-block` with `aria-hidden="true"`. `html.anim-off` hides it.
- **One `h1.page-title` per page.** A long path or package name wraps anywhere rather than overflow.
- **Tailwind**: pagr deletes `text-3xl sm:text-4xl tracking-tight font-bold glow-lg mt-6` from its
  titles. The entry is layered, so a utility left in place now beats the class.
- Replaces cockpit's `h1.title` and `.lede` in `portal.css`, and the DS template's local `h1.title`
  and `.lede`. Delete those when a page adopts this.

## `.eyebrow` — the one label look (P2)

```html
<h3 class="eyebrow">install</h3>
<p class="eyebrow" data-tone="warning">untrusted</p>
<h2 class="eyebrow comment">overview</h2>     <!-- the # prefix comes from .comment -->
```

The small upper-case label over a block: body size, 500, upper case, `.05em`, `--lh-tight`,
`--muted-foreground` (4.67:1 at worst). configr, seedr and pagr agree on all of it; cockpit spread
nine labels over five spacings from .05 to .1em, and those move to `.05em`.

- **It is still one text size.** Case, spacing and colour set the label apart, never a smaller font
  (pagr's 11px is corrected).
- **It sets no margin.** The block it heads spaces it: a card's gap, a list's own margin. An eyebrow
  sits in too many containers for one margin to be right in all of them.
- **`data-tone` colours it** (the tone map is in `tokens.css`): `warning` for "untrusted",
  `primary` for configr's settings sections.
- **Write the words in lower case.** The upper case is CSS; a screen reader reads the source, and
  some spell an upper-case source out letter by letter.
- **A label that heads a region is a heading element** (`h3`, `h4`), so it is in the outline.
- It is **the** eyebrow. A component with a label of its own — the fence (S7), the stat tile (K4), a
  dialog's labels — restates exactly these declarations in its own file (the fence at 700). Never a
  different letter-spacing.

## `.section-head` and `.subhead` (P3)

```html
<div class="section-head">
  <h2 class="prompt">whoami</h2>
  <a class="doc-link doc-link--forward" href="/about">man daniel →</a>
</div>
```

A section's name on the left and **one** thing on the right, one of three:

| trailing item | markup |
|---|---|
| a way in | `<a class="doc-link doc-link--forward">… →</a>` |
| a date | `<time datetime="…">…</time>` — the head colours it muted |
| an action | an icon button (C2), e.g. seedr's expand toggle |

- **The trailing item never shrinks and never wraps.** When the row runs out of room the whole item
  drops under the heading. That is why the link is `.doc-link--forward` and not pagr's quiet link
  with a typed ` →`: that one broke with its arrow alone on the next line.
- **Baseline, except for a button.** Text beside text aligns on the baseline; a row that ends in an
  icon button centres, because a button has no baseline and would hang below the heading.
- **The section's name is a heading.** `h2.prompt` keeps the prompt look (`.prompt` sets the size
  over the heading step). pagr's and seedr's `p.prompt` section names become headings in the
  migration.
- The head's children lose their own margins, and the head keeps 1rem below itself.

`.subhead` is a heading one level down inside a section: body size, bold, 1.4rem above and .3rem
below, and flush when it is the first thing in its container. It is cockpit's `h3.sub` — 37 of
cockpit's 40 sub-heads already use those numbers; config and ci/cd move to them.

## `.markdown`, and the lists outside it (P4)

```html
<article class="markdown">…rendered html…</article>
<div class="markdown text-muted-foreground">…a README inside a detail view…</div>
```

Put `.markdown` on the element that holds rendered HTML: a README, an article, a skill's
description. seedr and configr built this as a `MARKDOWN_CLASSES` string and cockpit as `.ov-md`;
all three become this. **It is not `.prose`** — that is the typography plugin's class, and on a
surface still loading the plugin the two would merge into a look nobody wrote.

- **The container decides the body colour.** An article inherits `--foreground`. A document embedded
  in a detail view is quieter: add `.text-muted-foreground` to the container, and the headings and
  `strong` come back to `--foreground` by themselves.
- **Headings never outrank the page.** `h1` and `h2` are both `--fs-xl`, `h3` is `--fs-lg`, `h4`–`h6`
  body size; all bold and `--foreground`. A document's `# Title` is its h1, and it must not be as
  loud as the page's own title. They are not `--primary`: the page title is the lit line.
- **The rhythm** is 1.625 line height, .5rem between blocks, .75rem above a heading (seedr and
  configr). pagr's 1.75 and its `em` gaps are corrected.
- **Links are the accent and underlined at rest**, so they are never told apart by colour alone.
  List markers are `--muted-foreground`; `del` is muted with the browser's line-through.
- Images and video stay inside the column with a `--border` edge. **A figure is full width** —
  pagr's 80% column is not adopted.
- **Not restated, on purpose:** `code`, `kbd`, `pre`, `blockquote`, `figure`, tables and `.eli5` look
  the same inside markdown as anywhere else. A second copy for markdown is how cockpit's JSON and its
  markdown ended up with two different code boxes.

### `@tailwindcss/typography` is retired

`.markdown` replaces it, and with it the trapdoor `tables-and-forms.md` used to warn about: the
plugin put its own colour on `.prose` and gave `td` none, so every table cell in a danieldeusing.de
article rendered in the plugin's grey — 1.29:1 on warm — while measuring fine on the dark themes.
`.markdown` colours only what it names (headings, `strong`, links, markers, `del`), so a `td`, a `dd`
or a `caption` inherits the container's colour like every other element. pagr removes the plugin,
`.prose-pagr`, its 18-variable palette mapping and its `.eli5` copy (`global.css`). Until that lands,
never put `.prose` and `.markdown` on one element.

### Lists outside markdown

| list | write | what it draws |
|---|---|---|
| numbered steps | `<ol class="steps">` | the number in `--primary`, bold, right-aligned in a 1.5rem gutter |
| items that are their own labels | `<ul class="plain">` | indented 1.1rem, no marker, .35rem apart |
| the terminal's bullet (a CV, a changelog) | `<ul class="dash">` | a `-` in `--primary`, the text hanging clear of it |

- **The dash is drawn, never typed.** pagr wrote `<span>-</span>` and a screen reader read "dash"
  before every item; the stylesheet's dash has empty alt text.
- **A `.dash` item may hold any inline markup.** It is a hanging indent, not a flex row: a flex item
  is every child, so `<code>`, `<strong>` or a link inside would split into columns with gaps — the
  bug `.legend` once had.
- All three are promoted from the cockpit portal and the DS template. Delete the local copies.

## Code: `.code-block`, `.code-view`, syntax and diff colours (P5)

**Inline code and `kbd` are elements, with no class** (`base.css`). Cockpit's `code.inline` (831
uses) and the template's `code.inline` / `pre.block` are deleted in the migration.

```html
<pre class="code-block" tabindex="0">…</pre>
<pre class="code-block code-block--wrap">…a log line that should wrap…</pre>
<pre class="code-block code-block--scroll" tabindex="0" style="--code-max-h: 22rem">…</pre>
```

- `.code-block` is the bare `pre`'s look — `--muted` box, `--border` hairline, the one text size,
  1.5 line height, tab stop 2 — as a class, for a `div`, for a tokens-only app, or for a block that
  must look like code without `base.css` behind it. The two are written to agree.
- `--wrap` breaks long lines instead of scrolling them: a log or a trace is read, not compared column
  by column. `--scroll` caps the height at `--code-max-h` (40vh unless you set it) and scrolls. It
  deliberately does not contain overscroll — a contained scroller swallows the wheel at its ends.
- **A block that can scroll takes `tabindex="0"`**, or a keyboard reader cannot reach its hidden
  part; the focus ring is drawn for you. **A block that needs a name is `role="region"` with an
  `aria-label`** — an `aria-label` on a bare `pre` names nothing, because a `pre` has no role.
- A visible thin scrollbar is `.scrollbars-thin` on the block.

### `.code-view` — a file with line numbers

```html
<pre class="code-block code-view" style="--code-gutter: 3ch" tabindex="0" role="region" aria-label="SKILL.md"><code><span class="line"><span class="tok-keyword">export</span> …
</span><span class="line">…
</span></code></pre>
```

- **The contract:** one `span.line` per line, each ending with its own newline, nothing between two
  lines. Set `--code-gutter` to the digit count plus one: `3ch` up to 99 lines, `4ch` to 999.
- **The numbers are a CSS counter, not text.** Selecting the view and copying gives the file — its
  line breaks, and none of the numbers (measured in Chromium). Read `textContent` from script;
  `innerText` doubles every newline, because each `.line` is a block.
- The view wraps; a wrapped line continues at the text column, never back under the numbers.

### Syntax and diff colours

| class | colour |
|---|---|
| `.tok-comment`, `.tok-literal` (true / false / null) | `--muted-foreground`, italic |
| `.tok-string` | `--cat-green` |
| `.tok-number` | `--cat-amber` |
| `.tok-keyword`, `.tok-key` | `--primary` |
| `.tok-punct` | `--muted-foreground` |
| `.tok-heading` | `--foreground`, bold |
| `.diff-add` / `.diff-del` / `.diff-hunk` / `.diff-meta` | `--success` / `--destructive` / `--primary` / `--muted-foreground` |

- **Syntax colours are categorical, never status.** A string is not a success and a number is not a
  warning; cockpit's JSON view said both, on pages whose badges use those tokens to mean exactly
  that. On the `--muted` code sits on, `--cat-green` is 5.62:1 and `--cat-amber` 5.88:1 at worst
  (warm).
- **In a diff the status tokens are right**, and they are still the second signal: the `+` and `-`
  are the first. A context line inherits the text colour — cockpit's context at .6 opacity went
  under AA to say "unchanged".
- configr's Monaco editor maps the same roles from computed tokens: text `--foreground`, comment
  muted italic, string `--cat-green`, number `--cat-amber`, keyword `--primary`, type `--cat-teal`,
  attribute `--cat-violet`, regexp `--cat-orange`, invalid `--destructive`.
- cockpit's `.logview` drops its 13px and its `ui-monospace` family for the one size and the token
  face.

## `.cmd` — a command to copy (P6)

```html
<p class="eyebrow">install</p>
<div class="cmd">
  <code class="cmd-text">npm install -g @danieldeusing/seedr</code>
  <button type="button" class="btn-icon btn-icon--bare" data-icon="copy" data-copy
          aria-label="copy install command"></button>
</div>
```

- **What is shown is what is copied.** No `$ ` prefix and no prompt: a reader who selects the text
  by hand gets the same thing the button gives them.
- **A multi-line command is `<pre class="cmd-text">`**; the button then sits at the top.
- **An inline command is plain `code` followed by a button with the value in `data-copy`**, and no
  `.cmd` around it:
  `Restart it with <code>bin/hermes poi start</code> <button … data-copy="bin/hermes poi start" …>`.
- **It wraps, it never scrolls** (seedr, configr). cockpit's `.cmdblock` scrolled one long line
  under an absolutely placed button and needed a 2.6rem gutter to stop the text sliding beneath it;
  in a flex row the text simply ends where the button starts, and a long path breaks anywhere.
- The box is the code look, `--muted` with `--border`, so commands and code are one family. With the
  28px icon button the row is 44px tall.

## The copy button: `data-copy` and `initCopyButtons()` (P7)

`data-copy` adds a behaviour to a button that already has a look — the icon button or the ghost
text button. There is no copy-button class.

| what | markup |
|---|---|
| the `.cmd-text` of the `.cmd` it sits in | `<button type="button" class="btn-icon btn-icon--bare" data-icon="copy" data-copy aria-label="copy install command">` |
| a literal | `data-copy="docker compose up -d"` |
| another element's text | `data-copy data-copy-from="#file-body"` |
| the text form | `<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact" data-copy="…">copy</button>` |

Call `initCopyButtons()` once. It is one delegated listener, so buttons rendered later work and a
second call installs nothing.

- **What is copied**: a non-empty `data-copy` exactly as written; otherwise the `data-copy-from`
  element's `textContent` exactly; otherwise the `.cmd-text`, **trimmed** — a command copied with a
  trailing newline runs the moment it is pasted into a shell. With no source at all the press
  fails; it never writes an empty string over the clipboard.
- **The result is shown and said.** For 2000ms the button carries `data-state="copied"` (the glyph
  becomes a check, `--success`) or `"failed"` (an x, `--destructive`); a text button reads "copied"
  or "copy failed". Another press restarts the 2000ms. The glyph changes **shape**, so colour is
  never the only signal. The same words go to one visually hidden `role="status"` region — made on
  the first press, moved into an open modal `<dialog>` when the button is inside one, because
  everything outside a modal is inert and an inert region is never read.
- **The accessible name never changes.** seedr and configr swapped the name to "Copied", which a
  screen reader announces inconsistently on a focused button. The live region reports instead; a
  text button's label is pinned into `aria-label` for the length of the state and released after.
- **A failure leaves the text in hand.** The clipboard refuses on an insecure origin, without
  permission, or when there is no `navigator.clipboard` at all. The button shows the x, and when the
  text came from an element that element's text is **selected**, so Cmd-C / Ctrl-C still works; the
  region says "copy failed — text selected". A literal has nothing to select and says "copy failed".
  Saying nothing would leave the reader pasting whatever was on the clipboard before.
- **Name the target** — "copy install command", never "copy icon" and never just "copy" in a column
  of them. **No `data-tip` that repeats the name**: the tooltip is announced as a description, so it
  would be heard twice. A tip says something the name does not, or it is left off.
- `aria-disabled="true"` makes the press do nothing (the button stays focusable, so a tip can say
  why). A copy has no busy state: the write is immediate.
- **Never the filled primary.** `--success` text on a `--primary` fill has nothing to stand on.
- The glyphs are `copy`, `check` and `x` from the icon set.
- **Framework apps** (seedr, configr) render the same attributes from their own state, with their own
  `role="status"` region, and never run `initCopyButtons()` over nodes the framework owns.
- In print the button is gone.

## `.meta`, and nothing is quieter than muted (P8)

```html
<p class="meta"><time datetime="2026-09-02">02 Sep 2026</time><span class="meta-sep" aria-hidden="true">·</span><a class="doc-link" href="/about">by Daniel Deusing</a><span class="meta-sep" aria-hidden="true">·</span><span>~6 min read</span></p>
<span class="meta-stat"><span class="ico ico--sm" data-icon="package" aria-hidden="true" style="color: var(--cat-teal)"></span>12</span>
```

The line under a title or in a card's foot. Muted, and laid out as items that wrap **with** their
separators, never as one sentence that breaks in the middle of a date.

- **The separator is a `.meta-sep` span with `aria-hidden="true"`.** A typed `·` is read as "dot".
- **A date is a `<time datetime>`.** pagr shipped none.
- A link inside is `.doc-link` (muted, then `--primary` under the pointer). A value that must read
  louder than its key is `.meta-val` (configr's key/value lines).
- **`.meta-stat`** is a glyph and a count, tabular so a column of counts does not jitter. The glyph
  is 12px whatever class it carries. Its colour, when it names a TYPE, is the surface's categorical
  choice (`--cat-*`).

**There is no text step below `--muted-foreground`.** This is where the estate kept inventing one.
pagr's faint steps, measured on the three surfaces across the four themes:

| step | contrast |
|---|---|
| /80 | 3.22–4.42 |
| /70 | 2.71–3.60 |
| /60 | 2.30–2.92 |
| /50 | 1.97–2.38 |
| /40 | 1.69–1.95 |

Every one is under 4.5:1, and /50 was the colour of the unselected options a reader was meant to
pick from. `--muted-foreground` measures 4.67–6.71. So there is no `--faint-foreground` token and no
opacity step: pagr's faint text and configr's neutral-600 tertiary become `--muted-foreground`.
Only decoration that carries no information may sit lower — the `# ` of `.comment`, `.ls-perm` — and
never an option or a control.

## `.seq-nav` — "in this series" (P9)

```html
<nav class="seq-nav card-terminal" aria-labelledby="seq-label">
  <p class="eyebrow" id="seq-label">in this series</p>
  <ol class="seq-list">
    <li><span class="seq-num">part 1</span><a href="/articles/a">…</a></li>
    <li><span class="seq-num">part 2</span><a href="/articles/b" aria-current="page">…</a></li>
  </ol>
</nav>
```

danieldeusing.de's series card. **The current part is a link with `aria-current="page"`**, like the
rail's current row — pagr rendered it as a bare span, so a screen reader heard one item without a
link and no word for why. It is `--primary` **and bold**: the weight is what survives for a reader
who cannot see the colour. The part numbers are muted (pagr's faint /70 is corrected), the links are
muted and warm to `--primary` under the pointer, and each is a 44px target under a coarse pointer.
The card is static, so it has no hover. The page's table of contents is `.navlist` in `chrome.md`.

## `.boot-log` (P10)

```html
<div class="boot-log card-terminal">
  <p class="boot-note">Last login: <time datetime="2026-09-28">today</time> · from a browser near you</p>
  <p class="boot-line"><span class="boot-step">init timezone</span><span class="boot-val">America/Sao_Paulo · 14:03:12 BRT</span></p>
  <p class="boot-note">welcome, visitor.</p>
</div>
```

danieldeusing.de's home hero: a login banner that reads like a machine starting up. **A system
element** by the lead's ruling — it shipped from the design gallery beside the man-page card, and any
surface may reuse the idiom.

- **`[ ok ]` is decoration.** It says every line succeeded because this is a banner, not a log. A
  surface with a real per-step status puts `.state` in the value column; a second marker that could
  say "ok" over a step that failed is the green-when-broken this estate keeps finding. The marker has
  empty alt text, so a screen reader hears the step and its value.
- **A control may stand in the value's place**, keeping its own class: the rail toggle
  (`[data-ls-nav-toggle]`), the animation toggle, the theme or language picker.
- Two columns from 40rem — the step at `--boot-step-w` (14rem) and the value — and one below it,
  where 14rem is most of a phone. The notes are muted (pagr's faint first line is corrected).

## The error page: `templates/error-page.html` (S9)

```
$ articles/no-such-post
404: command not found▮
no such file or directory.
cd ~
```

The terminal saying no: the path asked for, the shell's answer as the title, its errno as the lede,
and the way home. **Start from the template**; it carries the standard chrome
(`page-chrome.html`) and this body:

```html
<main class="wrap" id="main" style="padding-block: 6rem 5rem">
  <p class="prompt" data-requested-path>page</p>
  <h1 class="page-title page-title--display">404: command not found<span class="cursor-block" aria-hidden="true"></span></h1>
  <p class="lede">no such file or directory.</p>
  <p style="margin-block-start: 1.5rem"><a class="link-quiet" href="/">cd ~</a></p>
</main>
```

- **The title is the display step** (the lead's ruling names the error page's status line). pagr's
  48–60px and seedr's 18px both come to it.
- **The prompt comes from the address bar.** A static host serves one `404.html` for every missing
  path, so the path cannot be written in at build time: danieldeusing.de's built `dist/404.html`
  prints `$ 404/` for every missing page. The
  template's script writes `location.pathname` into the prompt with `textContent` — the path is
  whatever the visitor typed, and it must never become markup. Without script the placeholder stays.
- **Serve it with status 404, and it carries `noindex` anyway.** Static hosts send the status for
  `404.html`; a single-page app that renders its not-found view answers 200, and the robots meta is
  the one statement that survives the wrong status.
- **Keep the surface's rail.** A reader who followed a dead link has one next move.
- A multilingual surface's language menu links each locale's **home** on a 404 — the page asked for
  exists in none of them.

**The crash variant** — an app's last resort when a render throws (seedr's error boundary): the
prompt is the route that failed, the title "something broke", the lede the error's message (set with
`textContent`), and a filled `.btn-terminal.btn-terminal--compact` "reload", because it is the one
thing to do. The body is wrapped in `<div role="alert">` **inside** `main`, so it is heard at once
and `main` keeps its landmark. The markup is in the template, in a comment after `main`.

## Where it works: tokens-only, Tailwind, print, forced colours, `hidden`

- **tokens.css alone is enough.** Every class here states its own margins, font and colours, so a
  surface that loads only the tokens and this file (configr, seedr's studio) gets the same result
  as the full bundle — asserted by `scripts/check-content.mjs`, which compares the two renderings
  property by property.
- **Tailwind**: the entry imports this file into `@layer components`, so a utility on the same
  element wins. Remove the utilities a class replaces rather than stacking them.
- **Print**: copy buttons are gone, code and commands wrap with no height cap (a scrollbar does not
  exist on paper), and the page title loses its glow.
- **Forced colours**: everything here is text, so it survives. The copy states are glyph SHAPES
  (copy, check, x), the current series part is bold, and links stay underlined.
- **`hidden` hides every one of these**, flex and grid rows included. `tokens.css` answers that once
  for the whole system; never add a `[hidden]` rule for one class.
