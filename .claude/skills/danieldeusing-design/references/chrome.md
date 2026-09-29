# Chrome: the bar, the rail, the footer, the column, the table of contents

Reference for the `danieldeusing-design` skill. Read it before you write or change a page's
chrome: the header bar and its slots, a banner above it, the breadcrumb, the `ls -l` rail, the
status footer and what it clears, the page column, a table of contents, the burger, anything that
sticks under the header, a text action on a `<button>`. Everything here is `src/chrome.css` plus
four runtime calls, and it works on a surface that loads nothing but `tokens.css` and
`chrome.css` (netmon does exactly that). The canonical markup is `templates/page-chrome.html`;
this file says why each piece is shaped the way it is.

Contents:

- Start from the templates
- The header bar has three slots (0.60.0)
- `.bar-stack` — a banner and the header stick as one layer (0.60.0)
- `.crumbs` — the prompt-path breadcrumb (0.60.0)
- The `ls -l` rail
- `footer.status` is exactly `--status-h` tall, and the page clears it (0.60.0)
- The anim toggle, and a label that flips (0.60.0)
- The theme and language menus in the chrome (0.60.0)
- The page column — `.wrap` (0.60.0)
- A table of contents — `.layout`, `.toc`, `.navlist`, `initToc()` (0.60.0)
- The burger on a phone
- Sticky layers — `.page-toolbar` and `--sticky-top` (0.60.0)
- A text action on a `<button>` — `button.doc-link` (0.60.0)
- `.scrollbars-thin` (0.60.0)
- Two chrome.css lines that belong to other references (D1, D9)
- Forced colours and `hidden`
- The runtime calls

## Start from the templates

The chrome has a markup contract, and two templates ship it in the package, so a surface reads the
canonical markup out of its own `node_modules` instead of copying whatever the nearest surface does
today — which is how the pre-rail dropdown propagated in the first place:

- **`templates/page-chrome.html`** — the chrome alone: `header.bar`, the `ls -l` rail and
  `footer.status`, in that order, with the pre-paint `<head>` block and the runtime calls. Start
  here for any surface.
- **`templates/documentation.html`** — a whole one-file doc built on it.

**The rail is conditional; the bar and the footer are not.** A nav whose only entry is the current
page is furniture: it costs 17rem of width to say where the reader already is. Ship the rail when
there is somewhere else to go. To omit it, delete the `.ls-nav-head` and the `.ls-nav` and NOTHING
ELSE: `nav.site-nav`, the `.nav-burger` and the `.mobile-footer` stay, because the burger is where
a phone finds the footer's controls. The layout needs no edit — `html:has(.ls-nav)` reserves the
rail's width, so without one the page keeps its full width.

The rail's state is applied BEFORE first paint by one inline line in `<head>` (the runtime is a
module at the end of `<body>`, so a reader who hid the rail would otherwise watch it paint and jump
away on every load):

```js
try { if (localStorage.getItem("ls-nav") === "off") document.documentElement.dataset.lsNav = "off"; } catch {}
```

The same block applies the theme (`localStorage["theme"]`) and `html.anim-off`
(`localStorage["anim"]`, or `prefers-reduced-motion`) — see the template.

## The header bar has three slots (0.60.0)

danieldeusing.de and seedr both put browser history and the current path in the MIDDLE of the
bar, between the brand and the nav. Two sources, so it is an element, not a local layout:

```html
<header class="bar">
  <div class="bar-side"><a class="brand" href="/"><span class="glow">danieldeusing</span><span class="cursor-block" aria-hidden="true"></span></a></div>
  <div class="bar-center">                                   <!-- optional -->
    <div class="bar-history" role="group" aria-label="history">
      <button type="button" class="btn-icon btn-icon--bare" data-icon="chevron-left" aria-label="back" disabled></button>
      <button type="button" class="btn-icon btn-icon--bare" data-icon="chevron-right" aria-label="forward" disabled></button>
      <details class="dropdown" hidden>
        <summary class="btn-icon btn-icon--bare" data-icon="history" aria-label="history"></summary>
        <ul class="dropdown-panel dropdown-panel--down"><li><a class="dropdown-item" href="/articles" aria-current="true">~/articles</a></li></ul>
      </details>
    </div>
    <nav class="crumbs" aria-label="breadcrumb">…</nav>
  </div>
  <div class="bar-side bar-right">
    <p class="bar-status" role="status"><span class="dot" data-tone="pending" aria-hidden="true"></span>connecting…</p>  <!-- optional -->
    <button type="button" class="nav-burger" …></button>
    <nav class="site-nav" id="site-nav" aria-label="site">…the ls -l head, the rail, the burger's footer…</nav>
  </div>
</header>
```

- **The ends are wrappers, never the link.** pagr wrote `a.brand.bar-side`, which made half the
  bar a link to home. The brand is an `<a>` INSIDE the left `.bar-side`.
- **From 48rem the two ends take equal shares of what the centre leaves** (`flex: 1 1 0`), which is
  what centres the band, and neither may shrink below its own min-content — a long path cannot
  squeeze the brand or `ls -l` to nothing. The right end does not wrap, so `$ ls -l »` is pushed,
  never split. **Below 48rem the ends take their own size again**: squeezed to half a phone, the
  docs wordmark broke at its hyphen and the bar went from 45px to 68px.
- **The band is centred over `<main>`, not over the window.** The header runs full width over the
  rail, but the column it describes sits inside the rail's inset, so the band takes that inset
  back as a margin. It is sized by its content and capped at `--content-w`.
- **On a phone the band gives way to the burger** where there is one (the path and the burger never
  share the bar); a bar with no burger keeps the band and lets the path truncate (seedr).
- **History is the page's.** Back and forward are disabled at the ends of the visit stack; the
  history menu carries `hidden` until there are two entries to list, and the current entry is
  `aria-current="true"`. There is no `initNavHistory()`: danieldeusing.de keeps a sessionStorage
  stack, seedr asks its router — neither is chrome. The menu itself is an ordinary
  `details.dropdown` (`initDropdowns()`); do not fork the dropdown runtime for it.
- **`.bar-status`** is a connection that can drop, in words beside a dot: `connecting…` (tone
  `pending`), `live` (`success`), `down` (`destructive`). It is `role="status"` so the change is
  announced — cockpit's changed silently. The words are the state; the dot is aria-hidden.
- **A text summary in the bar** (a word and a caret) is padded to a finger-sized box; a summary that
  is a `.btn-icon` is already one and is left alone.
- **`.bar--app`** is a desktop app's window title strip (configr, seedr's studio): 36px, in px on
  purpose, because it has to stay level with the operating system's window controls, which do not
  scale with the page. The app sets `--bar-inset-start` to its traffic-light gutter and owns
  `data-tauri-drag-region`. It does not stick. Its wordmark cursor is
  `.cursor-block.cursor-block--static`: it sits beside the OS's own controls, where a blinking
  block reads as a caret waiting for input.
- `.brand` stays 1rem / 700 on every surface — three sources had three sizes; the system's is the
  estate's existing one.

A bar written before the slots (brand, burger and nav as direct children) still lays out: the bar
is `space-between`, and every slot rule keys on its own class.

## `.bar-stack` — a banner and the header stick as one layer (0.60.0)

A page-wide banner ("2 alerts", "control is frozen") and the header both want the top of the
viewport. Two sticky elements at `top: 0` do not stack, they overlap: measured, a sticky banner at
0–53px and the header at 0–44px, so the header — `ls -l` and its toggle with it — was entirely
hidden the moment the page scrolled. So they stick as ONE box:

```html
<div class="bar-stack">
  <div class="banner" data-tone="warning"><p><b>control is frozen</b> — …</p></div>
  <header class="bar">…</header>
</div>
```

- The stack is the sticky element, at the bar's own layer; the banner comes first, the header after
  it, in flow. The header does not stick on its own inside the stack.
- `initLsNav()` measures the STACK's bottom edge, so the rail, the page toolbar and the table of
  contents park under both — and it re-measures when the stack changes size (a banner mounted or
  dismissed after load) without waiting for a scroll.
- The stack bleeds past the rail's inset as the header does; do not put `.bleed-rail` on the banner
  inside it as well (the system cancels it there, but it says nothing).
- A page without a banner needs no stack. `.banner--sticky` is gone: a banner that must stay on
  screen goes in the stack. (A page with no header cannot pin a banner; no such page exists.)
- The banner itself — tones, roles, the list of items — is `references/feedback.md`.

## `.crumbs` — the prompt-path breadcrumb (0.60.0)

`visitor@danieldeusing:~/articles/fantasy-football` — a shell prompt's path, which is where
danieldeusing.de and seedr already put "where am I". Muted path, `~` in the accent, the current
segment in the foreground and not a link:

```html
<nav class="crumbs" aria-label="breadcrumb"><span class="crumbs-host" aria-hidden="true">visitor@danieldeusing:</span><ol><li><a class="crumbs-home" href="/" aria-label="home">~</a></li><li><a href="/articles">articles</a></li><li><span aria-current="page">fantasy-football</span></li></ol></nav>
```

- **Write it WITHOUT whitespace between the tags.** The segments are one line of inline text, and a
  newline between two `<li>` is a space in the path: `~ /articles /fantasy-football`. Markup
  generated by code (Astro, JSX, a string join) has none; a hand-written page must not add any.
- It is a named `nav` holding an ordered list, and the current page carries `aria-current="page"`.
  pagr drew the same look as bare spans, so a screen reader heard a run of words with no structure
  and no "you are here". The host and the `/` separators are drawn, not read (the host is
  aria-hidden, the `/` is generated with empty alt text). The `~` link is named "home".
- **It replaces cockpit's opacity trail**, whose segments sat at .6 and .4 opacity — .4 is under AA
  on text. The path is `--muted-foreground` (≥ 4.67:1 on every surface, measured).
- **One line, an ellipsis at the end.** The path must not push the bar taller. The clip box is
  grown by padding and an equal negative margin, so a focus ring is not cut off by the ellipsis.
- **A segment an SPA renders as a `<button>`** (seedr's router) reads as the link beside it.
- **Under a coarse pointer** every segment is a 44px target inside the same line box — the path does
  not move. (The padding is .9375rem: an inline link's padding grows its 14px content area, not
  the 18px line; the arithmetic with the line gave a 40px target.)
- **Where it goes:** the bar's centre band (pagr, seedr), or a `.page-toolbar` under the bar when
  the path must stay on a phone or the bar is full (cockpit). In print, a toolbar's crumbs are the
  page's kicker line.
- The segments are the page's: danieldeusing.de localizes the labels over English URLs, cockpit
  maps a route to its group (whose segment links to `/#<group>`). The BreadcrumbList JSON-LD stays
  the page's too.

## The `ls -l` rail

The markup, the current-page marker (`aria-current="page"` on the `<a>` that carries `.ls-row`) and
`.ls-perm` are in `references/components.md`. What 0.60.0 changed:

- **The chrome is measured on EVERY page, rail or not.** `initLsNav()` used to return before
  measuring anything on a page without a toggle, so the minimap — which reads `--ls-nav-top` /
  `--ls-nav-bottom` to sit between the header and the footer — fell back to a guess on exactly the
  rail-less docs the template recommends. Call `initLsNav()` on every page.
- **The list reset holds at every width.** In the burger (the same list below 48rem) a surface
  without a global reset got bullets and a 40px indent.
- **The toggle's focus ring is `--ring`**, like every other control, not a 55% `--primary`.
- **The state is `aria-expanded`, never `aria-pressed`**, on every `[data-ls-nav-toggle]` — it opens
  and closes a region; it is not a setting. Every toggle carries `aria-controls="nav"`. A second
  toggle elsewhere on the page (danieldeusing.de's home banner) is kept in step by the same
  `initLsNav()`, including one rendered later, and a stale `aria-pressed` is removed.
- **The listing can print row by row** under the typed `ls -l`, opt-in:
  `<ul class="ls-panel" data-term-list>`, nothing on the rows: each row's step comes from its
  position, the first twelve 0.11s apart and the rest with the twelfth. No `style` attribute —
  documented markup has to run under a CSP that refuses inline style. CSS only, and it fails visible: nothing rests at
  `opacity: 0`, so with animation off, reduced motion or no script every row is simply there. The
  title fades in rather than typing (a second typing engine beside `terminal.js` is not wanted).
  Desktop only — the burger would replay it on every open. **It keys on `html.term-anim`: set that
  class PRE-PAINT**, as danieldeusing.de does; set later by the runtime, the rows paint once and
  then snap back to invisible to run the reveal.
- **The current row is THE current-row look of the system.** Row lists and the tree (cards.md) take
  the same 12% `--primary` tint, 3px inset edge and `--primary` title, so "you are here" is one look
  everywhere.

## `footer.status` is exactly `--status-h` tall, and the page clears it (0.60.0)

The footer is fixed, full width, the home of every control (theme, language, animation, links),
and exactly `--status-h` (2rem) tall: its controls are one control height (`--control-h`, the height
of every single-line control) with no block padding. Until 0.60.0 it was 47.8px — the menus' padding
set the height, not the declared 2rem — and every page guessed: danieldeusing.de padded its body
2rem, cockpit padded its column 6rem, others not at all.

**The page clears it, not each column.** `body` reserves `--status-h` below its content and the
viewport's scroll padding does the same, so the last line and anything scrolled into view — a
focused control, a link target — land above the footer (WCAG 2.4.11). **Do not pad a column for the
footer any more**; a `padding-block-end` sized "to get past the footer" now counts it twice. This
keys on the page-level footer, so `footer.status` is a direct child of `<body>`, as in the
templates; one nested in a wrapper is not cleared.

On a phone:

- **With a `.mobile-footer` in the burger, the footer folds into it** and reserves nothing
  (`--status-h: 0`). Keep the two in step: the same links, the same menus (as accordions), the same
  toggle.
- **Without one, the footer stays** (seedr): the path takes the first row, the controls the second,
  and the body reserves both (`--status-h: 3.25rem`). A control that does not fit wraps rather than
  running off the screen — a clipped control cannot be reached at all. Three controls (a link, the
  theme menu, the anim toggle) fit a 375px row; a fourth takes a third row, and the reserve follows it (below).
  A page with that many controls folds them into the burger.
- **Under a coarse pointer every footer control is a 44px target**, and the footer grows to hold
  them: `--status-h` is 2.875rem on one row and 4.25rem on a phone's two. The rail's toggle is 44px
  too, and a rail row's text sits in the middle of its 44px row.
- **The page reserves the footer's RENDERED height.** `--status-h` is the footer's designed minimum
  and the pre-JS reserve; once `initLsNav()` runs it writes `--status-reserve` (the page footer's
  height) and the body and scroll padding read that. A footer whose controls wrap outgrows the token
  (measured: 115px against 68px on a coarse phone with four controls). It is a separate property on
  purpose: the footer's own min-height reads `--status-h`, so a measured value written there would
  hold the footer at its tallest. Do not set `--status-reserve` yourself.
- **The phone and coarse values of `--status-h` are `!important`, so a page cannot override them.**
  They have to be: the Tailwind entry imports `tokens.css` unlayered and this file in
  `@layer components`, and an unlayered declaration beats every layered one, custom properties
  included (measured: the layered 3.25rem resolved to 2rem). A page that needs a different
  clearance changes the footer (fewer controls, or a `.mobile-footer`), not the number.
- Before 0.60.0 the footer hid below 48rem whether or not the burger had anywhere to put it, so a
  page without a `.mobile-footer` lost its theme picker on a phone. `templates/page-chrome.html`
  itself was such a page.

Text is `--fs-base` (seedr's 11px is corrected). Cockpit's logout is a `button.doc-link` (below).

## The anim toggle, and a label that flips (0.60.0)

```html
<button type="button" class="anim-toggle" data-anim-toggle aria-pressed="true" aria-label="Toggle animations">
  <span data-anim-box aria-hidden="true">[x]</span><span>anim</span>
</button>
```

`initAnimToggle()` keeps EVERY `[data-anim-toggle]` on the page in step — the footer's, the burger's
copy, any other, including one rendered later: `aria-pressed`, the `[x]` / `[ ]` box, and, where the
toggle names both words, the label:

```html
<button … data-anim-toggle data-label-on="enabled" data-label-off="disabled">
  <span data-anim-box aria-hidden="true">[x]</span> <span data-anim-label>enabled</span>
</button>
```

The words come from the markup, so a translated page supplies its own; a label without
`data-label-on/off` is left as written. danieldeusing.de forked `anim.js` for exactly this; the fork
goes. The box must be its own `[data-anim-box]` element — written as `[x] anim` in one text node it
never flips (the page-chrome template shipped it that way).

The accessible name is `aria-label`, never `title`. **Do not add a `data-tip` that repeats it**: the
tooltip is announced as a description, so the name is heard twice.

## The theme and language menus in the chrome (0.60.0)

How `initThemeSwitcher()` marks the chosen theme (a ✓ via `menuitemradio`/`aria-checked` in a menu,
`aria-pressed` elsewhere) is `references/components.md`. In the chrome:

- The summary reads **"theme warm"**: `<span class="visually-hidden">theme </span>` names the menu and
  `[data-theme-label]` says the value. An `aria-label="theme"` on the summary would REPLACE the value
  in what is read.
- The indicator is `.dd-dot` everywhere — never an inline `<svg>` circle (both templates shipped one).
- The order is the runtime's: warm, green, mono, paper.
- A per-theme favicon: `<link rel="icon" id="favicon">` and `initThemeSwitcher({ faviconHref: (t) =>
  "/favicon-" + t + ".svg" })`. The package ships the hook, not the files: a favicon names a surface.

**The language menu** exists only where a site is multilingual (danieldeusing.de). It is a menu of
LINKS, each the same page in that locale, with `lang` + `hreflang` so each name is read in its own
language, flags hidden:

```html
<details class="dropdown">
  <summary><span class="visually-hidden">language </span><span class="dd-flag dd-flag-en" aria-hidden="true"></span><span>en</span><span aria-hidden="true">▾</span></summary>
  <ul class="dropdown-panel">
    <li><a class="dropdown-item" href="/de/articles" hreflang="de" lang="de" data-lang-value="de"><span class="dd-flag dd-flag-de" aria-hidden="true"></span>deutsch</a></li>
    <li><a class="dropdown-item" href="/articles" hreflang="en" lang="en" data-lang-value="en" aria-current="true"><span class="dd-flag dd-flag-en" aria-hidden="true"></span>english</a></li>
  </ul>
</details>
```

- Picking a language NAVIGATES, so the current one is marked where you are — `aria-current="true"`,
  the accent — not with a ✓, which means "a value you chose".
- The same rows sit in the burger in a `details.mobile-theme` accordion (below).
- There is no `initLangSwitcher()`: storing the choice (`localStorage["lang"]`) and forwarding a
  first visit are routing, which is the app's.

## The page column — `.wrap` (0.60.0)

`.wrap` is `--content-w` wide, centred, `--content-pad` from the edges — and `--content-pad` is
1.25rem below 40rem (danieldeusing.de's phone gutter; seedr's 16px and cockpit's 1.5rem converge on
it), so no page needs a breakpoint for its gutter. It sets the inline axis only: the page sets
`padding-block`, never the `padding` shorthand, which resets the inline padding to 0.

`.wrap--full` drops the cap and keeps the gutter — cockpit's containers dashboard, which genuinely is
not a column. Never a fifth width.

## A table of contents — `.layout`, `.toc`, `.navlist`, `initToc()` (0.60.0)

danieldeusing.de's articles and every multi-section cockpit page carry an "on this page" column, so
it is an element. **A page with more than one section shows one when it has room for the column —
and a page shows a TOC or a minimap, never both** (the TOC where there is room, the minimap on a
full-width document such as the html-doc template; `initMinimap()` refuses on a page with a TOC).

```html
<div class="layout">
  <div class="content">…sections with ids…</div>
  <aside class="toc">
    <nav class="navlist toc-inner" aria-labelledby="toc-h">
      <p class="navlist-label" id="toc-h">on this page</p>
      <ol>
        <li><a href="#overview" data-toc-link="overview">overview</a></li>
        <li class="navlist-sub"><a href="#steps" data-toc-link="steps">steps</a></li>
      </ol>
    </nav>
  </aside>
</div>
```

- From 64rem the page is a grid: the content and a 14rem column (`--toc-w`), 2.5rem apart. Below
  that the column is not there — a TOC squeezed beside a phone's text costs the text its width.
- The column is left-aligned with a rule on top (danieldeusing.de's; cockpit's 13rem right-aligned
  column adopts it). It sticks under every sticky layer (`--sticky-top`) and a long list scrolls
  itself between those layers and the footer.
- `.navlist-sub` indents an `h3`-level entry. `.navlist-label` is the eyebrow.
- **`initToc()` marks the current entry `aria-current="true"`** — an attribute, announced, where both
  spies it replaced toggled a class. **The mark is colour only**: bold would re-measure the entry,
  and a list that re-wraps under the reader's eyes while they scroll is the one thing a TOC must not
  do. (Under forced colours it becomes the system's Highlight pair.)
- **Which entry is current: the last one whose section has reached the reading line**, 30% down the
  viewport. Both sources marked the topmost target inside that top band, which is right for small
  targets (headings) and wrong for sections: a TOC link lands its section just under the toolbar,
  where the previous section's last lines are still inside the band — measured, every one of five
  clicks marked the section BEFORE the one clicked. Above the first section nothing is marked. A
  last section shorter than the lower 70% of the viewport never reaches the line; give the page room
  below it if its entry must be markable.
- Entries and sections rendered after the call are picked up; `initToc()` returns `{ destroy }`.
  One call per page. Cockpit's spy in `portal.js` and danieldeusing.de's go.
- **The same list is a series navigator**, in a card, where the current part is a PAGE —
  `aria-current="page"`, weight and colour, since nothing moves under it (under forced colours, the
  Highlight pair as well):

  ```html
  <nav class="navlist card-terminal" aria-labelledby="ser-h">
    <p class="navlist-label" id="ser-h">in this series</p>
    <ol><li><span class="navlist-lead">part 1</span><a href="/articles/a">…</a></li>
        <li><span class="navlist-lead">part 2</span><a href="/articles/b" aria-current="page">…</a></li></ol>
  </nav>
  ```

  `.navlist-lead` is the muted "part N" (danieldeusing.de drew it at an unmeasured /70).
- Under a coarse pointer every entry is a 44px row. In print the TOC is hidden; a series list prints.
- Cockpit's `.toc-label` and its bare `nav` move to this markup (`.navlist-label`).

## The burger on a phone

Below 48rem `initBurgerNav()`'s burger owns navigation (an outside press and Escape close it; Escape
returns focus to the burger). Its menu holds the rail's list — ONE list; `.mobile-nav` is only for a
surface with no rail — and the `.mobile-footer`:

- **`details.mobile-theme` is the burger's accordion for ANY footer menu** — the theme, and on a
  multilingual site the language. `.mf-panel` holds the same `.dropdown-item` rows the footer's menu
  does (a theme row there carries `aria-pressed` and shows the ✓; a language row `aria-current`, the
  accent). `.mf-chev` turns when the accordion opens, so the open state is shape as well as panel.
- Every folded control is a 44px row under a coarse pointer (they measured about 22px), and the
  accordion's summary has a focus ring of its own.
- The phone's navigation is the burger; do not also hide the rail below the breakpoint to keep
  `.mobile-nav`, or the page ends up with no navigation at all.

## Sticky layers — `.page-toolbar` and `--sticky-top` (0.60.0)

Three things stick under the header — a page's toolbar, the table of contents, a sticky filter bar
(`references/filters.md`) — and each used to be parked by a hand-computed offset (cockpit's
`--crumb-h: 2.9rem`, pagr's `scroll-margin-top: 6rem`, the TOC's `top: 2rem`). A number written
down is a claim about someone else's height; all three broke when a banner mounted or the toolbar
wrapped. **`initLsNav()` measures it**: `--sticky-top` is the header's (or the stack's) bottom edge
plus the page toolbar's height, kept current through load, resize, scroll, font load and any change
in the chrome's size. Everything that sticks reads that one number.

```html
<main class="wrap">
  <div class="page-toolbar"><nav class="crumbs" aria-label="breadcrumb">…</nav></div>
  <div class="layout">…</div>
</main>
```

- The toolbar is the first thing in `<main>`, ABOVE `.layout`, so its rule spans both columns
  (inside the content column it stopped halfway across the page, at a different height from the
  TOC's own rule). It sticks at the header's edge, above a sticky table header and below the
  header and the footer. It is not a landmark; what it holds is (the crumbs' `nav`, a `<search>`).
- **Anchors land below every sticky layer on their own**: the viewport's scroll padding is
  `--sticky-top` plus a line. **Delete any `scroll-margin-top` a page carries** (pagr's 6rem,
  cockpit's 4rem on `section.doc`) — a scroll margin ADDS to the padding and lands the heading a
  header-height too low.
- In print the toolbar stops sticking and loses its rule; its crumbs become the page's kicker line.

## A text action on a `<button>` — `button.doc-link` (0.60.0)

A text action that changes the VIEW — "reset filters", "show more", "dismiss", "try again",
cockpit's logout — is a `<button>` that reads as a link. `button.doc-link` and
`button.doc-link--forward` reset the browser's box, padding and font (every surface used to re-type
that reset beside the class); the colour and underline rules still apply:

| the action | write |
|---|---|
| changes the view — reset, show more, dismiss, try again | `<button type="button" class="doc-link doc-link--forward">` — `--primary`, underlined on hover |
| a quiet inline action | `<button type="button" class="link-quiet">` (components.md) |
| goes somewhere | an `<a>` with the same classes |

- **Resetting a view is not destructive and is never red.** Red text is for the `--danger` buttons.
- It has the `--ring` focus ring of its own, and `disabled` is .45 with no pointer (GrayText under
  forced colours). A busy action is `aria-busy` + `aria-disabled`, not `disabled`.

## `.scrollbars-thin` (0.60.0)

The `.tablewrap` scrollbar (thumb `--border`, `--muted-foreground` on hover, no track, .55rem and
always visible) for any scroller that is chrome rather than content: a side panel, a code pane, a
tree. It covers the element and every scroller inside it, so on `html` it is the whole app
(configr's and seedr's studio's global rule, now a choice). Opt-in, never global by default — the
default scrollbar is the one a reader already knows. `references/foundations.md` has why the two
scrollbar APIs must not be declared together.

## Two chrome.css lines that belong to other references (D1, D9)

- **A sticky table header paints `--tablewrap-fade`**, not always `--background`: a table in a
  `--card` card or a dialog had a band of page colour across its header row. A surface that sets
  `--tablewrap-fade` for the scroll fade has already said what the colour is. (Tables:
  `references/tables-and-forms.md`.)
- **The ticker strip draws its state glyph from the row's class** — `●` ok and running, `✕` stale,
  `○` never — with empty alt text, at the text size. A renderer must NOT type the glyph into the
  cell any more (it would show twice); the row's visually hidden state word is what is read.
  A running row's dot is `--info`: never red, and not the idle ok either. `.tick-next` is
  `--muted-foreground` with no opacity (it measured 2.80–3.76:1 with one), and the `·` between
  figures is decoration in `--border`. The runtime's visually hidden header row takes no box.
- **A stale row is tinted at the house 6% step**, and its next-run and figures cells read
  `--foreground` on the tint: `--muted-foreground` there measured 4.29:1 on warm (8%) and 4.42:1
  (6%). The row that has stopped is the one that must be readable. (The strip: `references/data.md`.)

## Forced colours and `hidden`

- Three "you are here" marks were drawn only with what Windows' high-contrast modes repaint (a tint,
  an inset shadow, a colour): the rail's current row, the TOC's current entry and a series' current
  part. Each takes the system's selected pair, `HighlightText` on `Highlight`, **on the element that
  carries the text, with `forced-color-adjust: none`**. Both halves are needed. Without `none` the
  mode paints a Canvas backplate behind the text, and the word vanishes on its Highlight row. With
  it, everything inside keeps its author colour, so the rail's name and permissions take the row's
  colour in this mode, whoever gave the row its pair: components.css opts a menu row under the
  pointer out the same way.
- **A glyph never takes `none`**: under it the glyph keeps its author colour, which can pass on one
  palette and measure under 2:1 on the other. The chrome's own glyphs are characters (the tick
  states, `←`, `»`, `/`, `▾`), which the mode forces like any text. The burger is an inline `<svg>`
  painting `currentColor`, which the user agent already gives `preserve-parent-color`. The history
  buttons' glyphs are `[data-icon]` masks, which `tokens.css` gives `preserve-parent-color`
  (`references/icons.md`); a new mask glyph in the chrome copies that pattern.
- **An element opted out of the adjustment owns its focus ring**: `none` stops forcing the outline
  colour too, so the author `--ring` stayed on the Highlight fill at 1.59–2.97:1. The current row,
  entry and part draw an inset `HighlightText` ring in forced colours (11.31:1 and 8.73:1).
- Do not redraw a state as a tint alone. The check reads all of this as painted pixels, on a light
  and a dark forced palette, because the backplate appears in no computed style; it proves each clip
  holds the ink it reports (hiding the ink must change the clip), and that every glyph paints its
  context's forced colour, which is what holds under a palette the reader chose.
- `hidden` hides every chrome part whatever `display` its class sets; the one rule that guarantees
  it is in `tokens.css`. Do not add per-class `[hidden]` guards.

## The runtime calls

| call | does |
|---|---|
| `initLsNav()` | Every page. The rail's show/hide (every `[data-ls-nav-toggle]`, `aria-expanded`, `localStorage["ls-nav"]`), and the measured chrome: `--ls-nav-top` (the header's or `.bar-stack`'s bottom edge), `--ls-nav-bottom` (the footer), `--sticky-top` (plus the page toolbar), `--status-reserve` (the page footer's rendered height). A property is written only when it changed — it runs on every scroll. The rail's initial state is applied PRE-PAINT by the inline `<head>` line, never by this. |
| `initBurgerNav()` | The phone burger; required wherever the markup has a `.nav-burger`. |
| `initAnimToggle()` | Every `[data-anim-toggle]`, its box and its `data-label-on/off` label; `localStorage["anim"]`. Apply `html.anim-off` pre-paint. |
| `initToc(root?)` | The table of contents' spy: `aria-current="true"` on the current entry. Returns `{ destroy }`. |
