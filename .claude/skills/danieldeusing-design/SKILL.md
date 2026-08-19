---
name: danieldeusing-design
description: >-
  How to build a page, app or dashboard that looks like the rest of the danieldeusing
  estate — the terminal design system (@danieldeusing/design): the four themes and
  html[data-theme], the colour/layout/type tokens, the shared component vocabulary
  (.tab/.tabs, .tickstrip, .legend, details.fold, the `ls -l` rail, .dgm-* diagram zoom,
  .wrap), the vanilla-JS runtime, and the pin-vs-unpin rule for the jsDelivr CDN. Use when
  building or restyling ANY danieldeusing surface (cockpit, netmon, docs, seedr, pagr /
  danieldeusing.de, briefs, a new tool), when picking a colour / font-size / page width,
  when a page "doesn't look like the others", when adopting a new design-system release, or
  before writing ANY CSS for a danieldeusing page.
---

# danieldeusing-design

The terminal design system every danieldeusing surface wears: CRT phosphor on JetBrains Mono,
`$`-prompts, ASCII rules, a scanline overlay, four switchable themes. Framework-agnostic plain
CSS + a dependency-free ES-module runtime. Repo: this one
(`/Users/daniel/Work/danieldeusing/danieldeusing-design`), published as `@danieldeusing/design`.

**The one thing to internalise:** a surface brings its *layout*; the system brings *everything
else*. Every colour, every font size, the content width, the chrome and the shared components
already exist here. Writing a local value is not a shortcut — it is a fork that silently
disagrees with four other pages and, for colour, is provably wrong on at least one theme.

## Load it — build-free, one file

```html
<head>
  <meta name="theme-color" content="#f5efe2" />

  <!-- PRE-PAINT, inline, before any stylesheet. Theme + zoom must be settled before
       first paint or the page visibly flashes the wrong one. -->
  <script>
    (() => {
      const bg = { warm: "#f5efe2", green: "#020604", mono: "#050505", paper: "#fafafa" };
      let t = "warm";
      try { const s = localStorage.getItem("theme"); if (s && s in bg) t = s; } catch {}
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg[t]);
      let animOff = matchMedia("(prefers-reduced-motion: reduce)").matches;
      try { if (localStorage.getItem("anim") === "off") animOff = true; } catch {}
      if (animOff) document.documentElement.classList.add("anim-off");
    })();
    // resolution zoom — lay out at a 1920px reference, scale up past it, never below 1×
    (() => {
      const z = () => { document.documentElement.style.zoom = String(Math.max(1, innerWidth / 1920)); };
      z(); addEventListener("resize", z);
    })();
  </script>

  <!-- UNPINNED — correct ONLY if this page consumes the look and none of the system's markup.
       The moment you paste in the `ls -l` rail, header.bar or footer.status from the section
       below, add the `@x.y.z` — see "Pin or unpin". Shipping rail markup against this url is
       the exact bug that took cockpit apart for a week. -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design/dist/danieldeusing-design.min.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design/src/fonts.css" />
</head>
```

Other entry points: `@danieldeusing/design` (npm, the `.` export = full bundle) ·
`@danieldeusing/design/tailwind.css` (Tailwind v4 — import *after* `tailwindcss`, and add
`@source "../node_modules/@danieldeusing/design";` or Tailwind tree-shakes the component
classes away) · `@danieldeusing/design/tokens.css` alone, for a surface that wants only the
palette and none of the look (netmon does exactly this).

**`tokens.css` + `chrome.css`, without `components.css`, is a supported combination** — it is
what netmon ships (as a committed same-origin snapshot, because it is read during outages). Know
what that gets you, because the split is not where it looks: `components.css` is effectively
**not separable**. Taking one component out of it drags base.css's scanline overlay, its table
type and its control styling onto a surface with its own layout, so in practice a surface either
takes the whole look or takes none of it.

A tokens+chrome consumer therefore gets the content column (`.wrap`), `.tablewrap`, the a11y
helpers, `header.bar`, `footer.status`, the `ls -l` rail — **and, since 0.17.0, the ticker strip**
(`.tickstrip` / `.ticktable` / `.tick*`), which moved out of `components.css` for exactly this
reason: a tickstrip is page-level status chrome, and the surfaces that most need to say "my
poller is still running" were the ones that could not load it. It does **not** get `.btn-terminal`,
`.card-terminal`, `.legend`, `.tabs`, `details.fold`, `.dropdown`, `.field-row` or the diagram
zoom — those stay in `components.css`. A surface needing that vocabulary must mirror it under its
OWN class names, never borrow the system's for a stylesheet it does not load; borrowing the name
is the silent fork `bin/design-conformance` exists to catch.

## Themes: four, selected by `html[data-theme]`

`warm` (default, warm paper / sepia ink) · `green` (CRT phosphor) · `mono` (white phosphor) ·
`paper` (black on white, e-ink / printout). `:root` carries the warm values, so the page works
with no attribute set. The choice persists in `localStorage["theme"]` — **the same key on every
surface**, which is why picking a theme in the cockpit carries into the embedded netmon.

Anything you build must be legible in all four. Test by flipping the attribute, not by trusting
that it "should be fine": the two near-black themes and the two light ones fail in opposite
directions.

## Colour: every value is a token, and a literal hex is never acceptable

Not a style preference — arithmetic. A status colour has to clear WCAG AA 4.5:1 against every
surface it can land on (`--background`, `--card`, `--muted`). Do that across the four themes and
the admissible luminance bands **do not overlap**:

```
light themes: darkest surface warm  --muted #ece3cf  ->  accent L <= 0.1328
dark themes:  lightest surface green --muted #071509  ->  accent L >= 0.2021
```

A gap of 0.0692 with nothing in it. No single hex can serve four themes — the dark themes need a
light tint, the light themes a dark one, and every compromise fails both. That is why
`--destructive`, `--success`, `--warning`, `--info` and `--pending` are each declared **four
times**. Cockpit carried twelve hardcoded accents that predated the tokens; every one missed AA
on at least one theme and four sat inside the gap, clearing neither side.

- Use the semantic tokens: `--background --foreground --card --card-foreground --popover(-foreground)
  --primary(-foreground) --secondary(-foreground) --muted --muted-foreground --accent(-foreground)
  --destructive --success --warning --info --pending --border --input --ring`, plus the CRT
  atmosphere `--glow --glow-soft --scanline-opacity`, `--radius` (0 everywhere) and `--font-mono`.
- **Five status accents, not three** (0.5.0). good / attention / bad is a *verdict* vocabulary and
  a dashboard mostly shows neither: `--info` is a state, not a verdict (in flight, gated, started
  by hand, deliberately silent — blue, never an alarm); `--pending` is the *absence* of a verdict
  (still running, timed out, could not determine — violet, never `--destructive`, because "no
  answer" is not "bad answer"). Reach for these before inventing a hue.
- Need a colour the system has no token for? **Add the token here, four times, with its measured
  worst-case contrast ratio in a trailing comment** (see `src/tokens.css`). Do not tune a literal
  at the call site — that forks the palette and fixes exactly one theme. But a token here names a
  **state**; a colour that names a **thing** (a vendor, an agent, a chart series) belongs to the
  surface that knows what the thing is — per-theme, in that surface's own stylesheet. Cockpit's
  GitLab orange is the worked example of the second kind.
- The only legitimate literal is a *fallback inside a var()*: `var(--background, #f5efe2)` takes
  the published token when the stylesheet arrived and the literal when it did not.
  `deploy/netmon/index.html` in `danieldeusing-infra` is the worked example, including why it
  beats a second stylesheet request. See "Pin or unpin" below — an unpinned consumer needs this
  for *measurements* too, not just colour.
- Deriving a shade: `color-mix(in srgb, var(--primary) 10%, transparent)` — the system does this
  itself for hovers. Still a token, still per-theme.

## Measurements: one column, one type scale (0.4.0)

Colours are declared four times because arithmetic forces it. Measurements are the opposite:
one right answer, and it must not vary by theme, page or surface. Audited 2026-08-05, five
surfaces had **four** content widths (78rem / 1180px / 72rem / none) and netmon a flat `13px`
where everything else sat at `0.75rem` — because the system offered no token to inherit.

```css
--content-w: 78rem;     --content-pad: 1.5rem;
--fs-base: 0.75rem; /* 12px — ALL normal text. The only size you write. */
--fs-lg: 0.9375rem; /* 15px — h3 / section heads */
--fs-xl: 1.125rem;  /* 18px — h2 / page title */
--fs-2xl: 1.5rem;   /* 24px — h1 / hero, display only */
--lh-tight: 1.3;    --lh-base: 1.5;
```

### ONE SIZE FOR TEXT (0.27.0, Daniel) — `--fs-xs`, `--fs-sm` and `--fs-md` are GONE

Body, tables, labels, badges, notes, buttons, form controls, meta lines: **all `--fs-base`.** If you
are reaching for a `font-size` on anything a person reads, the answer is already decided. The only
sizes left are the three heading steps, and each is a jump rather than a nudge.

**Do not re-derive the old scale from memory.** It had four text steps at 10 / 11 / 12 / 13px, and
this very section used to defend them: *"steps are 1px apart at the bottom on purpose."* That
reasoning was wrong in a way only usage could show. Differences that small cannot be told apart on
sight, so nothing ever **chose** between them — every surface picked whichever felt right when it was
written, and **578 hand-rolled `font-size` declarations** grew across the estate while every
conformance check passed, because none of them had an opinion about type. One cockpit repository card
rendered text at 10.2px, 10.8px, 10.88px, 11px, 12px and 13px at once. Daniel found it by looking:
*"why in details we have different font sizes?"*

The fix is not discipline, it is **removing the choice**. With one text size there is no near-miss to
pick, and `font-size` stops being a decision anybody makes while writing a component.

- **Must read as quieter?** `--muted-foreground`, `opacity`, or weight. Colour separates a label from
  its value far better than one pixel ever did, and it survives zoom and a printout.
- **Must read as louder?** Then it is a heading — `--fs-lg`/`-xl`/`-2xl`, or `font-weight`.
- **A glyph is not text.** A `content:`-drawn pseudo-element (`ⓘ`, `⤢`, a marker) is sized against its
  own drawing and may keep a hand-rolled `em`. Say so inline: `/* not-text: … */`. Five in the system
  do; nothing else may.
- **`table` is `--fs-base`.** It was `--fs-md` until 0.27.0, sitting under a comment that already said
  *"a table cell is body copy"* — so every table in the estate rendered one step louder than the body
  around it and louder than the label naming it. Do not re-add a table size.
- **`em` compounds, `rem` does not.** Mixing them is how `0.85em`, `0.9em` and `0.68rem` landed as
  three near-identical pixel values inside one card. Write the token, not a ratio.

- **`.wrap` resolves the column** (`max-width: var(--content-w); margin-inline: auto;
  padding-inline: var(--content-pad)`). Use it, and never restate a bare `78rem` locally. A
  build-free page on an **unpinned** url writes the tokens itself *with literal fallbacks* —
  `max-width: var(--content-w, 78rem)` — because `.wrap` itself only exists from 0.4.0; see
  "Pin or unpin".
- **`.wrap` sets the inline axis ONLY** — vertical rhythm differs legitimately between a doc and a
  dashboard. A consumer adds `padding-block: 2.5rem 5rem`. **Never the `padding` shorthand**: it
  resets `padding-inline` to 0 and silently takes the shared margins back.
- A page that genuinely is not a column (a full-bleed dashboard table) sets `max-width: none`
  deliberately. It does not invent a fifth number.
- There is exactly **one** text step and three heading steps. The bottom of the scale used to be
  four sizes 1px apart, defended here as deliberate; see "ONE SIZE FOR TEXT" above for what usage
  showed instead.
- Tailwind apps get `max-w-content` and `text-fs-base` / `-lg` / `-xl` / `-2xl`. `text-fs-xs`, `-sm`
  and `-md` went with the tokens behind them. Tailwind's own `text-xs/sm/base` are deliberately
  **not** remapped — opt in by name.
- **The scale fixes the *ratios*; the ROOT FONT SIZE makes them track the window.** Since 0.29.0
  `tokens.css` sets `font-size: max(1rem, calc(1rem + (100vw - 1920px) / 120))` on the root, so
  every rem in the package — type, `--content-w`, `--space-section` — grows together above 1920.
  A 4K screen gets a bigger page, not a postage stamp of 12px text. It needs no script and
  cannot be forgotten, which is the point: the old `initResolutionZoom()` failed silently when a
  page was written without it.
- **Never set `zoom` on a page.** It scales the coordinate *space*, so the page's pixel grid stops
  matching the browser's, and anything injected from outside — a password manager's dropdown, a
  translation bar — is positioned through one grid and written into the other. Measured on the
  family login page: 1Password's dropdown landed 1.9x down and across from its field. Scaling the
  unit has no second grid. A page that sets `style.zoom` on top of 0.29.0 scales TWICE.

## The shared component vocabulary — a consumer must NOT redeclare any of it

If a class below appears in your page's own `<style>`, that is a bug in waiting: the system's
rule and your copy will disagree at the next release, and whichever loses is decided by source
order. Use them as-is; if one is wrong for everybody, fix it *here*. (The one sanctioned
exception is `.wrap` on an unpinned build-free page — a *token* declaration with literal
fallbacks, not a copy of the system's rule. See "Measurements" above.)

**Tables are in that set too, by ELEMENT rather than by class (0.10.0).** `table`, `th` and `td`
carry the system's padding, top alignment, hairline row rule, header treatment and `width: 100%`
— so a consumer authors a plain `<table>` and adds nothing. A local `td { padding }` or a
hand-rolled row border is a fork exactly like redeclaring `.legend`, and it will disagree with
the system at the next release. The three things a PAGE legitimately owns are **column widths**
(only the page knows which column holds the prose — use a `<colgroup>`),
**`--tablewrap-max-h`**, the token that caps a tall table's own scroll area (set it to `none` for
a full-bleed dashboard table rather than redeclaring `.tablewrap`), and **`--tablewrap-fade`**
(0.23.0), the colour the right-edge scroll fade blends into — set it whenever the wrapper does
not sit on `--background`, because on a `--card` surface the default paints a 1.5rem bright band.

**`td` deliberately has NO colour, and on a Tailwind-typography surface that is a trapdoor.** The
system styles `td`'s padding, alignment and rule but never its ink, because a cell is body copy and
must inherit `body { color: var(--foreground) }` — correct everywhere the page is plain HTML, which
is cockpit, docs, netmon, ci-orchestrator and the seedr playgrounds (audited 2026-08-08: not one of
them colours a `td`, and the three cockpit columns that use `--muted-foreground` are deliberate
de-emphasis measuring 4.67:1 at worst). But `@tailwindcss/typography` puts a `color` on the `.prose`
ROOT and gives `td` none of its own, so inside an article the cell inherits the plugin's palette
instead of the body's. danieldeusing.de shipped that: `--tw-prose-invert-body` unmapped meant every
table cell in a published article rendered Tailwind gray-300 — **1.29:1 on warm and 1.41:1 on
paper**, invisible in the default theme, while measuring a healthy 13.84:1 on the two dark themes,
which is why it survived review. A `td` grep finds nothing, because nothing declares it.

So on a Tailwind surface, **map the plugin's whole palette to tokens — every variable, in one
block — and never patch the elements.** pagr had mapped four of eighteen and patched `prose-p:` /
`prose-li:` by hand; the casualties were exactly the elements nobody thought to name (`td`, `dd`,
`caption`, an `<ol>`'s markers at 2.27:1). An unmapped variable is not "close enough" — it is a
fixed grey against four themes, the same arithmetic that makes every accent in `tokens.css` a
per-theme declaration. Drop `prose-invert` while you are there: once every value is a token it is
an extra hop whose name asserts a dark theme, and a variable missed *behind* it fails invisibly on
the default one.

| Group | Classes | Source |
| --- | --- | --- |
| chrome | `.wrap` `.tablewrap` (+ `--tablewrap-max-h`, `--tablewrap-fade`) `.bleed-rail` `.skip-link` `.visually-hidden` `header.bar` `.brand` `.bar-right` `footer.status` `.status-left` `.status-right` `.sep` `.doc-link` (+ `--forward`) `.nav-burger` `.mobile-nav` `.mobile-footer` | `src/chrome.css` |
| `ls -l` rail | `.ls-nav-head` `.ls-nav-title` `.ls-nav-toggle` `.ls-nav` `.ls-panel` `.ls-row` (`--sub`, `--sub2`, `--dir`, **`[aria-current="page"]`**) `.ls-perm` `.ls-name` `.ls-group` | `src/chrome.css` |
| text primitives | `.glow` `.glow-lg` `.prompt` (prepends `$ `) `.comment` (prepends `# `) `.cursor-block` `.link-quiet` `.ascii-rule` | `src/components.css` |
| blocks | `.card-terminal` `.btn-terminal` (+ `--ghost`, `--compact`, `--destructive`, `--edit`, `:disabled`) `.field-row` (`> .lbl`, `> .field-val`, `--field-label-w`) `.eli5` / `.eli5-term` `details.fold` / `.fold-body` `.legend` | `src/components.css` |
| tabs | `.tabs` `.tab` (`[aria-selected]`) `section.doc.tab-panel` | `src/components.css` |
| status ticker | `.tickstrip` `.tick` (`--ok`, `--stale`, `--never`) `.tick-dot` `.tick-name` `.tick-last` `.tick-next` `.tick-sep` `.tick-stats` `.ticktable` | `src/chrome.css` (moved from components 0.17.0) |
| diagram zoom | `.dgm-zoomable` `.dgm-overlay` `.dgm-stage` `.dgm-bar` `.dgm-btn` `.dgm-close` `.dgm-art` | `src/components.css` |
| minimap | `.minimap` `.minimap-bar` (`.active`) | `src/components.css` |
| dropdown (a MENU) | `.dropdown` `.dropdown-panel` (`--down`) `.dropdown-item` `.anim-toggle` | `src/components.css` |
| table pager | `.table-pager` `.table-pager-status` `.table-pager-size` `.table-pager-nav` — **all rendered for you** by `initTablePagination()`; the markup contract is `data-table-id` on the `<table>` and nothing else |
| select (a VALUE) | the `select` ELEMENT, plus `.select-field` `.select-trigger` `.select-value` `.select-panel` `.select-option` (`[aria-selected]`, `[data-active]`, `[aria-disabled]`) `.select-group` — **all rendered for you**, see below | `src/components.css` |
| misc | `.dd-dot` `.dd-flag` (`-de/-en/-es/-pt`) | `src/components.css` |
| typing animation | the `[data-term]` / `[data-term-out]` contract + the `html.anim-off` kill switch | `src/components.css` |

`.prompt` already prepends `$ ` — never author a literal leading `$ ` inside one (it doubles).

## A row action's SHAPE says whether it changes anything (0.13.0)

The one rule that decides what to reach for. It is not a style preference — it is the only thing
that tells a reader, before they click, whether this control will take them somewhere or alter
something:

> **A row action that NAVIGATES is a link. A row action that MUTATES is a button.**
> Underlined text that deletes something looks like a footnote.

| the action | what to write |
|---|---|
| `open →` `log →` `detail` `forge →` — goes somewhere, changes nothing | `<a class="doc-link doc-link--forward">` (or a `<button>` carrying the same classes when the destination is an in-page dialog and there is no url) |
| `add` `update` `save` `apply` `dismiss` `enrol` — writes | `<button class="btn-terminal btn-terminal--ghost btn-terminal--compact">` |
| `edit` — writes, and is the row's own settings | `<button class="btn-terminal btn-terminal--ghost btn-terminal--compact btn-terminal--edit" aria-label="edit <what>">` — see below |
| `remove` `delete` — **destroys** | `<button class="btn-terminal btn-terminal--ghost btn-terminal--destructive" aria-label="remove <what>">` — see below |
| the ONE primary action of a view | the same, **filled**: `btn-terminal btn-terminal--compact` |
| a toggle (`follow`, `live`) | the same button; press = drop `--ghost`, release = add it back. The two states are the two buttons the system already ships, so a toggle never needs a third look. |

Two filled buttons side by side compete, which is the whole reason `--ghost` exists.

**`.btn-terminal--destructive` (0.16.0) is the red bin, and it is the ONLY remove control.** Before
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

**`.btn-terminal--edit` (0.22.0) is the same icon button in the ORDINARY colour.** `edit →` was a
word and an arrow in a cell beside a bin that is 22px square — two controls doing one job, one four
times the width of the other, and at 375px the label broke into "edi / t →". Identical mechanism to
the bin (`currentColor` mask, `::before { content: "" }`, the coarse-pointer `min-*` growth) and one
deliberate difference: **it carries no colour at all.** Editing is an ordinary action and red is
reserved for the press that cannot be taken back, so composing it with `--ghost` gives `--primary`
on a `--border` outline like every other secondary control (5.59:1 at worst — warm over `--muted`).
Never reach for `--destructive` to get the icon shape. **The `aria-label` is mandatory and names the
target** (`aria-label="edit poi/vu3"`); without it a column of these announces "button" a dozen
times over.

**`.doc-link--forward` carries the accent AT REST**, not on hover. `.doc-link` is deliberately
quiet because it is footer furniture, and row actions inherited that quietness: a column of grey
`open →` reads as *disabled text* rather than as the way in. Hover cannot advertise itself, and a
row action is the reason the row is interactive at all. Keep plain `.doc-link` for what it was
built for — the footer, and links inside running prose. A **value** that happens to be clickable
(a repo name, a PR ref, a path in the identity column) is not an action either; the forward accent
belongs to the action column.

**`.btn-terminal--compact` is the SIZE and nothing else.** Colour, square corner, the `> ` prefix
and the glow still come from `.btn-terminal` / `--ghost`, so a compact button cannot drift into
being a different button. The system's own button is a landing-page CTA at `12px 24px`; a tool row
puts six side by side and a table cell is half that height. Cockpit carried this as a local
`.btn-compact` for months — every surface with a table needs it, so it lives here now. **Never
declare a local one**, and never a local button class at all: five invented classes (`.cfg-btn`,
`.copy-btn`, `.tbtn`, `.xbtn`, `.fw-btn`) is how 77 rounded corners accumulated on a system whose
`--radius` has been `0` since its first release.

## The rail marks the current page on `aria-current="page"` (0.19.0) — an ATTRIBUTE, not a class

A rail row that is the page you are on takes `aria-current="page"` **on the `<a>` that carries
`.ls-row`**, and the styling follows from that alone:

```html
<li><a class="ls-row ls-row--dir" href="/automation" aria-current="page">
  <span class="ls-perm" aria-hidden="true">drwxr-xr-x</span><span class="ls-name">automation/</span></a></li>
```

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

## A hover is `data-tip` — NEVER the native `title` (0.26.0, Daniel)

```html
<span data-tip="Explanation shown instantly on hover">metric</span>
```

### The marker is an ⓘ, NEVER an underline (0.26.0, Daniel)

**Write nothing extra — the ⓘ comes from the stylesheet.** `span`, `th` and `button` carrying
`data-tip` get it from `::after`, so every existing call site gained one on upgrade.

```html
<span data-tip="…">budget</span>          <!-- renders: budget ⓘ -->
<span data-tip="…">budget ⓘ</span>        <!-- WRONG — two glyphs -->
```

Until 0.26.0 this was a dotted `border-bottom`, and an underline is the wrong signal twice over: it
is the web's mark for a LINK, so a dotted one reads as a link that is broken or disabled, and it
vanishes in a table header or against a busy row — which is exactly where these sit. Two cockpit
pages had already hand-rolled the ⓘ, which is the estate telling you the answer; 0.26.0 made it the
system's, and those local copies were deleted in the same pass.

**Never write the glyph in markup.** If you are typing `ⓘ` or `&#9432;` on a danieldeusing surface,
the stylesheet is already doing it and you are about to ship two.

**An element that is already its own affordance opts out** — a minimap bar jumps to a section, a
chart segment names a series, and neither is an invitation to hover for prose:

```html
<span data-tip="…" data-tip-bare>2026-08-11</span>   <!-- tip, no glyph -->
```

`initTooltips()` handles every `[data-tip]`, including nodes rendered later. **Never use `title` for
explanatory text on any danieldeusing surface.** The browser's tooltip waits about a second, is
unstyled, is unreachable by keyboard on most engines, and **does not exist on a touch screen** —
cockpit is read from a phone over the tailnet, so there the explanation is simply gone.

**`title` does TWO unrelated jobs and only one of them is a tooltip.** This is the part that makes
a bulk conversion dangerous, because getting it wrong is an accessibility regression that reads as
a tidy-up in the diff:

| the element | what `title` was doing | write |
| --- | --- | --- |
| has visible text | a description | `data-tip` |
| an icon button with no text | the accessible **NAME** | `aria-label` |
| an icon button that also wants a hover | both | `aria-label` **and** `data-tip` |
| `<iframe>` / `<svg>` | the accessible name | leave `title` — no hover to replace |

Converted estate-wide on 2026-08-10: **108 in cockpit and 3 in netmon**. Two traps found doing it,
both of which would have shipped silently:

- **`.anim-toggle` had a `title` and no `aria-label` on 35 pages** — its content is an aria-hidden
  glyph, so `title` WAS the name. A blind rename leaves 35 buttons announced as "button". It now
  carries both, and so does `templates/page-chrome.html`, which is where all 35 came from.
- **`role="tooltip"` on the panel described nothing.** Nothing pointed the anchor at it, so
  `data-tip` was announced to no one while the `title` it replaces IS announced — the swap would
  have traded a slow tooltip for a silent one. `show()` now sets `aria-describedby` and `hide()`
  removes it, including when moving between anchors.

**netmon carries its own inline copy** of this component (it loads tokens+chrome, never
components.css). When `runtime/tooltip.js` changes, `deploy/netmon/index.html` changes with it —
that duplication is deliberate but it is not automatic. `bin/cockpit-render-check` fails a native
`title` on any cockpit page or on netmon, and fails an icon toggle that lost its name.

## A `<select>` is enhanced AUTOMATICALLY (0.21.0) — write plain HTML, add nothing

```html
<select data-k="mode">
  <option value="public" selected>public — posts on the PR</option>
  <option value="silent">silent — private report only</option>
</select>
```

That is the whole markup contract — the same "nothing" as `<table>` and `initTableScroll()`.
Call `initSelects()` once and every `<select>` on the page, **and every one rendered
afterwards**, gets the estate's dropdown. Do not add a class, a wrapper, or a data attribute;
`.select-trigger` / `.select-panel` / `.select-option` are what the runtime *renders*, and a
page that writes them by hand has hand-rolled the component it was given.

**Why this exists at all, and why CSS could never have done it:** a `<select>`'s option list is
painted by the OPERATING SYSTEM, outside the document. Rounded corners, a blue system highlight,
the system font, in the middle of a terminal UI — and unreachable from any stylesheet. Cockpit
carried **five copies of a `.cfg-sel` rule**, one per page, every one of them styling the closed
control, which was never the part that looked wrong. `appearance: base-select` reaches the list
in Chrome 135+ and nowhere else, so taking it would leave Safari and Firefox on the system menu
and the estate **disagreeing with itself** — worse than being consistently wrong.

**The `<select>` is still the control.** It holds the value, it is what a form submits, what
`select.value` reads, and what fires `input` then `change` (both, in that order, bubbling, with
`event.target` the select). That is why 28 call sites adopted this with **zero page edits** — and
it is the property to preserve if you ever touch this. It is laid transparently over the trigger
rather than `display: none`, because Chrome refuses to show a validation bubble on a control it
cannot focus and then blocks the submit **with no message at all**, which would silently break
every `required` select.

- **Sizing goes on the wrapper, and a page inline `style` is copied there for you.** A width set
  in the page's own CSS via a class on the `<select>` (`.cfg-sel { width: 100% }`) acts on an
  element that is no longer in the flow, so it does nothing. Size `.select-field`.
- **`title` and `data-tip` are copied to the trigger**, or the tooltip would be anchored to
  something nobody can hover — and **since 0.26.0 an `<option>`'s pair is copied onto its rendered
  `.select-option` too**. Before that it was dropped: the panel replaces the native option list, so
  every per-option explanation ever written was unreachable, in either attribute. Labels are found
  the way the platform finds them — `aria-label`, then `aria-labelledby`, then a `<label>` by `for=`
  or by wrapping — and the trigger's name becomes *label + current value*, as a native select
  announces.
- **The opt-outs are real ones**: `multiple` and `size > 1` are left alone (the platform renders
  those inline; there is no popup to replace), and `data-select="off"` skips a select entirely.
- **Selection is NOT marked by colour, and that is arithmetic.** `--primary` against
  `--popover-foreground` measures 1.65 / 1.31 / 1.48 / **1.27** on warm/green/mono/paper — two
  inks a reader cannot tell apart. Same finding as the rail's current row, same answer: a left
  **edge marker** plus **bold**, with the colour as the third signal. Do not "simplify" it back
  to a tint.
- **The control's border is `--foreground` at 60%, not `--border`.** `--border` is a container
  hairline measuring 1.37 / 2.00 / 1.61 / 1.42 against `--background` — invisible as a control
  edge, where WCAG 1.4.11 wants 3:1. 60% is the first step that clears it on all four themes
  against all three surfaces a control can land on (warm binds, at 3.24).

## A WIDE table scrolls itself (0.23.0) — including one you render after the page loads

`initTableScroll()` gives every `<table>` a `.tablewrap` parent, so a table wider than its column
scrolls **itself** rather than handing the whole PAGE a horizontal scrollbar — the one layout
failure that reads as broken, because the header slides off and body text needs two axes. Markup
contract: nothing. Author a plain `<table>`.

**The thing to rely on: it keeps wrapping.** Call it once; a table rendered from a fetch twenty
minutes later is wrapped too, by a MutationObserver, exactly like `initSelects()` and
`initTablePagination()`. Until 0.23.0 it was a single walk at call time, which is why it appeared
to work for sixteen releases and covered only the tables that are never too wide: a static page
authors its tables in the markup, and **every table that genuinely overflows is on a dashboard,
where the tables arrive after the walk has finished.** Cockpit's called it from a deferred module
during load, while every mount still read `loading…`. So do not "help" by re-calling it after each
render, and above all do not hand-wrap in the markup to work around the old behaviour — a wrapper
in the markup is a wrapper the system now has to leave alone forever.

**If your page reconciles markup against the live DOM, teach the reconciler about the wrapper.**
This is the one integration cost, and it is not optional: a wrapper the runtime inserted is in no
renderer's markup, so a patcher sees `<div>` where its markup says `<table>` and replaces it —
killing the table, its row listeners and every half-typed filter on every poll, after which the
runtime wraps the replacement and the next poll does it again. One rule fixes it: **a `.tablewrap`
holding a single `<table>` stands in for that table** — for its key, its kind, and as the node
actually patched — and *only* when the incoming node is a `<table>`, so a renderer that writes its
own wrapper still lines up. Cockpit's `dom-patch.js` is the worked example, filed beside the two
exemptions it already had (`open` on a `<details>`, `hidden` on a `<tr>`). A page that assigns
`innerHTML` outright needs none of this.

**Colour the fade when the wrapper is not on the page background.** `.tablewrap::after` is a
1.5rem gradient that says "there is more over here", and it blends to `--tablewrap-fade`
(default `--background`). On a `--card` surface the default is a visible bright band — and it
paints whether or not the table can actually scroll, because CSS cannot ask "am I scrolling?" on
every engine. `.tickstrip` sets it upstream; your own card-like container sets it itself.

`--tablewrap-max-h` caps the wrapper's HEIGHT and defaults to `none` on purpose — see the tables
paragraph under "The shared component vocabulary".

## A long table PAGES to 20 (0.22.0) — one attribute, and it slices LAST

```html
<table data-table-id="review-activity">
```

`initTablePagination()` then hides all but 20 rows and puts a bar under the table: `1–20 of 55`,
a `rows` picker (5/10/20/50/100/200, remembered per table in
`localStorage["table-rows:<id>"]`), and prev/next. Everything in that bar is already yours — the
buttons are `.btn-terminal--ghost.btn-terminal--compact` and the picker is a bare `<select>` that
`initSelects()` enhances — so **there is no new colour and nothing to hand-write.**

**The order is filter → sort → slice, over the FULL dataset, and it is guaranteed by construction.**
The natural wrong build cuts the data to twenty rows and wires the sort and the filter to the cut:
page 1 reorders while the actual newest row sits on page 3, and a filter finds nothing because the
match was never in the slice being searched. It looks right on the first screen, which is why it
ships. **The component cannot express that mistake — it has no sort and no filter.** It reads a
`<tbody>` something else already produced and hides all but one window of it. So a page keeps its
own sort and filter and needs *no edit at all* to gain paging; cockpit's `cockpitTable` still
filters and sorts `rows`, the full array, and still writes every matching row into the tbody.
**If you ever make an engine emit only the visible page, you have broken this** — and the guard is
`bin/cockpit-render-check`'s "the engine hands the pager the WHOLE set".

- **`data-table-id` is REQUIRED and never guessed.** Page path plus table index is the obvious
  alternative and it is a bug with a delay on it: add a table above another and every reader's
  "100 per page" silently becomes a different table's setting. A table without an id is left
  **completely alone** (all rows, no bar) and warns on the console **only if it was long enough to
  have been paged** — a warning on the forty short tables in the estate teaches people to ignore
  the console.
- **Do not paginate a table that cannot outgrow a screen.** Most of the estate's tables are short
  reference tables — `infra-machines` lists four machines — and controls that can never do
  anything are noise. Nine tables in cockpit carry an id; the other 36 do not.
- **The bar appears only when it can act**: more rows than fit, *or* a non-default size in force.
  That second clause is not decoration — without it, picking 100 on a 30-row table removes the
  control you just used and there is no way back to 20.
- **Paging writes `hidden` on rows and rebuilds nothing.** That is what lets it sit under cockpit's
  in-place patching (`dom-patch.js`), which exists so a refresh cannot destroy half-typed input —
  a pager that re-rendered the table would hand all of that back. `dom-patch.js` exempts `hidden`
  on a `<tr>` for the same reason it exempts `open` on a `<details>`: the renderer does not own it.
- **`tr[hidden] { display: none !important }`** ships in `base.css`, because the UA's
  one-attribute rule loses to any rule setting `display` on a row — and a `hidden` that loses to a
  stylesheet is still announced by a screen reader.
- An engine that renders a "nothing matched" message as a `<tr>` must mark it
  `data-table-placeholder`, or the pager counts a message as data.
- **`.table-pager` is NOT for a surface that loads only tokens+chrome.** It is built from
  `.btn-terminal`, which lives in `components.css`. netmon therefore cannot have this component,
  and must not borrow its class names — that is the fork `bin/design-conformance` catches.

## `.field-row` — a settings panel is a two-column table, so write it as one

```html
<div class="field-row">
  <span class="lbl">review type</span>
  <div class="field-val">…control(s)…</div>
</div>
```

Built as flex rows with a label beside a control, every row starts its value wherever *its own*
label happens to end — the labels are different lengths, so the eye gets no vertical edge to
follow and the panel reads as noise. Daniel, looking at exactly that: *"make this more a table
layout and always do it like this. This currently looks chaotic."* `.field-row` decides the value
edge once, for every row.

- `.field-val` is a flex box, so several controls on one row **wrap together** instead of each
  finding its own line.
- Widen the label column with **`--field-label-w`** (default `8.5rem`) when a panel's labels are
  genuinely longer. Note the checker cannot see this one: upstream only ever *reads* it (with a
  fallback), so `bin/design-conformance` reports `var(--field-label-w)` as a **phantom token**.
  Either set it as a real declaration on the panel first, or avoid it.
- Deliberately **not** `subgrid`: these rows usually render independently — one block per repo, one
  per source — so they must align without sharing a parent. The failure mode of a fixed column is
  "the label column is a bit wide", not a broken layout.
- Below `40rem` it stacks on its own. A form's submit gets a `.field-row` with an **empty** `.lbl`,
  so it lands on the same value edge as the fields above it and stacks with them for free — rather
  than a local margin that writes the label width down a second time.

The chrome has a **markup contract**, documented at the top of `src/chrome.css` and shown end to
end in two templates that ship in the package (`files`), so a consumer reads the canonical markup
out of its own `node_modules` instead of copying whatever the nearest surface happens to do today
— which is how the pre-rail dropdown propagated in the first place:

- **`templates/page-chrome.html`** (0.6.0) — the standard chrome ALONE: `header.bar` + the `ls -l`
  rail + `footer.status`, in that order, with the reasoning for each. Start here for any surface.
  **The rail is conditional, and the other two are not.** A nav whose only entry is the current
  page is furniture: it costs 17rem of width to tell the reader where they already are. Ship the
  rail when there is somewhere else to go, and omit it otherwise — the system is built for that,
  `html:has(.ls-nav)` drops `--ls-nav-inset` to `0` and the page reclaims the width on its own.
  When you omit it, remove the `.ls-nav-head` and the `.ls-nav` **only**: `nav.site-nav`, the
  `.nav-burger` and the `.mobile-footer` inside it must stay, because `footer.status` is
  `display: none` below 48rem and that burger is the only place a phone has the theme picker.
- **`templates/documentation.html`** — a whole page built on it, for a one-file doc.

Follow it exactly; the rail in particular reads state from `html[data-ls-nav]` and needs its own
pre-paint line:

```js
try { if (localStorage.getItem("ls-nav") === "off") document.documentElement.dataset.lsNav = "off"; } catch {}
```

## This is machine-checked — `bin/design-conformance` in danieldeusing-infra

The rules above are not advice; a cockpit redeploy runs the checker and **fails on a violation**.
Run it yourself before you get there:

```bash
cd ~/Work/danieldeusing/danieldeusing-infra
node bin/design-conformance            # forked components + phantom tokens — must be zero
node bin/design-conformance --strict   # + the literal-colour backlog
node bin/design-conformance --list     # what the system currently owns
```

It reads the owned vocabulary **from the published CSS**, so it cannot fall behind a release the
way a hand-written list would. Four findings:

| finding | what it means |
|---|---|
| **forked component** | your page declares a class the system styles, unscoped, setting a property the system also sets. `.pair details.fold {…}` and `button.doc-link.rowlink {…}` are fine — a page-owned class scopes them. `.legend {…}` is not. |
| **literal colour** | a hex as the value of a real property. Defining a token (`--grid: #d9cdb6`) and a fallback (`var(--background, #f5efe2)`) are both correct and are not reported. |
| **bare token on an unpinned surface** | `var(--content-w)` with no literal fallback on a page loading the unpinned url. The served build may predate the token, and then the declaration is dropped entirely — full-bleed page, collapsed type. See "Pin or unpin" below. |
| **phantom token** | `var(--x)` nothing defines — silently dropped, and the element renders at its inherited value, which usually looks *almost* right. |

**A genuine exception is a comment, not a config entry.** Put `design-conformance: <reason>` in
the comment above the rule and it is waived. Nine exist today (a full-bleed data table, WCAG
tap-target sizing under a coarse pointer, a phone gutter, a deliberately fixed-dark pane…) and
each states a real reason. If you cannot write the sentence, you do not have an exception — you
have a fork.

**It only knows three surfaces** — `cockpit`, `netmon` and `docs`, listed in `SURFACES` at the top
of the script. `apps/pagr`, the seedr playgrounds and `deploy/ci-orchestrator` are unchecked, and
every one of them has drifted. Adding a surface is one entry in that array.

## Runtime — `runtime/*.js`, dependency-free ESM, tree-shakeable

| Function | What it does |
| --- | --- |
| `applyStoredTheme()` / `setTheme()` / `getStoredTheme()` | Apply + persist the theme. **Pre-paint from `<head>`.** |
| `initThemeSwitcher()` | Wires `[data-theme-value]` buttons and `[data-theme-label]`. |
| `initResolutionZoom(1920)` | **Deprecated in 0.29.0 — does nothing.** Wide-screen scaling is the fluid root font size in `tokens.css`, so there is no script to call and no pre-paint flash to avoid. Still exported so a pin can be bumped without editing `<head>` in the same commit. Delete the call and any inline zoom IIFE with it. |
| `initDropdowns()` | `<details class="dropdown">`: one-open, click-away, Escape. |
| `initSelects()` | Replaces the OS dropdown on every `<select>` with the estate's listbox — the one component CSS alone can never reach, because the option list is painted outside the page. **Markup contract is NOTHING**; the `<select>` stays authoritative (value, form submission, `input`+`change`). Keeps enhancing: selects rendered later are picked up by a MutationObserver, so a page that rebuilds its tables out of `innerHTML` needs no second call. Keyboard is the ARIA APG select-only combobox and focus never leaves the trigger. |
| `initBurgerNav()` | Mobile burger (breakpoint 48rem) with the footer folded in. |
| `initLsNav()` | The rail's show/hide, and it **measures** the real chrome into `--ls-nav-top` / `--ls-nav-bottom`. The top is the header's **bottom edge** (`getBoundingClientRect().bottom / zoom`), not its height — those agree only while nothing sits above the header, and cockpit's alert banner mounts as the first child of `<body>`. A rect is visual px and a CSS length is re-multiplied by any ancestor `zoom`, so **convert, don't avoid** (0.13.0; before that a 73px banner buried the rail's own toggle). Re-measured on `scroll` too, because a sticky header's bottom edge moves as the banner scrolls away. |
| `initTerminal()` | The `$ command` typing animation; no-ops under reduced motion / `html.anim-off`. Fires `term:contentdone`. |
| `initAnimToggle()` | Wires `[data-anim-toggle]`, persists `localStorage["anim"]`. |
| `initDiagramZoom(".diagram")` | Click / Enter / Space opens a diagram full-screen; wheel-zoom about the pointer, drag-pan, `+ - 0`, Escape closes. Clones the svg — mermaid re-runs against the nodes it rendered, so moving the original is how a diagram silently stops updating. |
| `initMinimap({sections})` | Builds the left-gutter minimap: one bar per section, scroll-spy included, bar length by heading depth. Markup contract is NOTHING. Returns `null` for fewer than two sections — a map of one place is not a map. Use it INSTEAD of a text "On this page" column: that column repeated headings the reader was about to scroll past and cost the content its width. |
| `initTableScroll()` | Gives every unwrapped `<table>` a `.tablewrap` parent so a wide table scrolls itself instead of scrolling the whole PAGE sideways. **The markup contract is nothing** — author a plain `<table>`; already-wrapped tables are left alone, so it is never a migration. **Tables rendered LATER are wrapped too** (0.23.0, MutationObserver), so a page that fetches its rows needs no second call. Colour the right-edge fade with `--tablewrap-fade` when the wrapper does not sit on `--background`. |
| `initTablePagination()` | Pages every `<table data-table-id>` to 20 rows, with a 5/10/20/50/100/200 picker remembered per table. **Markup contract is one attribute**, and a table without it is left alone — the id cannot be guessed without silently reassigning readers' settings when a table moves. It has **no sort and no filter**: it hides all but one window of rows a page has *already* filtered and sorted, so the order is filter → sort → slice over the full set by construction. Turning the page writes `hidden` on rows and rebuilds no markup, so it composes with in-place patching. Tables rendered later are picked up by a MutationObserver. |
| `initTooltips()` | One viewport-clamped panel for every `[data-tip]`, including nodes rendered later. Shows **instantly**, on hover AND focus, and sets `aria-describedby` on the anchor while open (0.26.0) so it is announced the way a `title` is. `src/tooltip.css` counterpart. **This REPLACES the native `title` — see below.** |

The runtime is progressive enhancement: with JS off, content is visible and the theme is `warm`.

## Pin or unpin the CDN url — decided by whether your MARKUP is coupled to a release

- **Tokens-only / look-only consumer → UNPINNED** (`…/npm/@danieldeusing/design/dist/…`, no
  `@x.y.z`). One design system, every surface on the current version — Daniel's call, 2026-08-05.
  A stale cached stylesheet there means slightly older colours, never a broken page. netmon's
  `tokens.css` layer, the seedr playgrounds and pagr-docs are on this side today.
  **This is where a surface SHOULD sit, not a roster of where they are** — audited 2026-08-06,
  morning-briefs is hard-pinned at **0.1.3** in four `@import url()` lines in its `lib/tokens.css`
  and `deploy/ci-orchestrator` at **0.1.5**, so neither has had a token since. A pin nobody bumps
  is the failure mode on this side, exactly as a poisoned cache is on the other.
- **A surface that ships the system's MARKUP → PIN** and bump the pin in the same commit as the
  markup that needs it. Cockpit — and **the docs site since 2026-08-06**, when its pages adopted
  the rail and the fixed footer. It sat on the unpinned list above right up until that day, which
  is the shape of this rule: the side a surface belongs on is not a property of the surface, it is
  a property of what its markup needs, so it changes the day the markup does.
  **Cockpit is the case that proves it:** 2.65.0 shipped the `.ls-nav` rail
  markup against the unpinned url, and jsDelivr serves that url `cache-control: max-age=604800` —
  **seven days in the browser**. Every browser that had opened cockpit that week kept applying
  0.1.6, which predates the rail: both nav toggles on screen, a 613px header, the brand floating
  mid-page. **A release cannot fix a poisoned cache** — the url a release publishes to is the one
  being cached. Only a *changed url* can.
- **Unpinned is not "always current" — it is "current, eventually."** Same cache, other
  direction: measured 2026-08-05, hours after `0.4.0` went to npm, the unpinned url still served
  **`0.2.0`** (`curl -sI …` → `x-jsd-version: 0.2.0`, `age: 11267` against `s-maxage=43200`), and
  browsers hold their copy for the full seven days. So an unpinned consumer must survive a build
  that *predates the token it is asking for*: `0.2.0` has no `.wrap` and no `--fs-*` at all, and
  a bare `var(--content-w)` resolves to nothing — full-bleed page, collapsed type. **Give every
  token an unpinned consumer depends on structurally a literal fallback**: `var(--content-w,
  78rem)`, `var(--fs-2xl, 1.7rem)`. Check what is actually being served before concluding a new
  token "doesn't work": `curl -sI <url> | grep x-jsd-version`.
- Consequence for this repo: **a publish is instantly live on every unpinned surface, with no
  staging** (once the edge turns over). So (a) look at them after publishing, and (b) keep new
  CSS backward-compatible with the markup consumers still ship — `0.2.0`'s `html:has(.ls-nav)`
  guard is the worked example.

## Changing the system

`dist/` and `tokens/tokens.json` are **committed on purpose** (jsDelivr serves them) — run
`npm run build` and commit them with the source change. Publishing to npm is automatic via
Trusted Publishing on any push to `main` that bumps `package.json` version; an unchanged version
is skipped, so docs/skills/template pushes are safe. Write the CHANGELOG entry the way the
existing ones read: what changed, and the measurement or failure that forced it.

**PUSH `main` FIRST, TAG AFTER npm HAS THE VERSION.** The order is load-bearing and neither the
CHANGELOG nor this file used to say so. `prepublishOnly` runs `check-release.mjs` inside the
publish job, and check #2 refuses a version that is **already tagged on origin** — so tagging
before the workflow finishes makes the release gate block the very publish it is gating. 0.16.0
failed exactly that way: `✗ v0.16.0 is already a tag on origin — that release was cut.`, npm
untouched, while the tag sat there implying it had shipped. Recovery is
`git push origin :refs/tags/vX.Y.Z`, `gh run rerun <id>`, then tag once `npm view` reports the new
version. The workflow re-creates the tag itself on success, so the manual tag is a no-op — which
is the clue that it was never yours to push first.
