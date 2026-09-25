---
name: html-doc
description: >-
  Generate a single-file, self-contained HTML documentation page for a workflow,
  process, script, or project — styled with the danieldeusing terminal design
  system (CRT/JetBrains-Mono look, four themes) loaded build-free from the
  jsDelivr CDN. Use when the user says "create a documentation in html for this
  workflow", "make an HTML doc/page for this", "document this process as a
  webpage", "write this workflow up as a single HTML file", or wants a shareable
  standalone .html doc with the terminal look. Produces ONE .html file that needs
  no build step and opens directly in a browser, and can optionally be published to the
  password-protected docs.danieldeusing.de by moving it into the danieldeusing-docs repo and
  pushing (the push is the deploy). Also use when the user says "publish this doc", "put this
  on docs.danieldeusing.de", or asks where an existing HTML doc should be stored.
---

# html-doc

Turn a workflow, process, script, or project into one self-contained HTML page styled by
**danieldeusing-design** — the repo this skill lives in. The page pulls all CSS/JS from the
jsDelivr CDN, so the output is a **single `.html` file** that opens directly in a browser — no
build step, no companion assets.

For anything about the design system itself — tokens, themes, the component vocabulary, what a
consumer may and may not redeclare — use the **`danieldeusing-design`** skill next door. This one
is only about filling the template.

**A published doc is a machine-checked surface.** `danieldeusing-docs/site` and `site-internal`
are both roots in `bin/design-conformance` (in `danieldeusing-infra`), so a page that redeclares
one of the system's classes or names a token nothing defines is a *finding*, not a matter of
taste. Run it before you publish, not after:

```bash
cd ~/Work/danieldeusing/danieldeusing-infra && node bin/design-conformance
```

A genuine exception is a `design-conformance: <reason>` comment above the rule — the template
already carries two, and if you cannot write the sentence you do not have an exception.

## Steps

1. **Identify the subject.** Determine what to document from the conversation or the path the
   user names (a script, a routine, a directory, a project). If a path is given, read the
   relevant files so the documentation reflects what the thing actually does — don't invent.

2. **Load the template:** `templates/documentation.html`, in this skill's own repo —
   `/Users/daniel/Work/danieldeusing/danieldeusing-design/templates/documentation.html` on
   Daniel's machines, `../../../templates/documentation.html` relative to this file anywhere
   else. There is deliberately **no second copy** bundled with the skill: two copies drifted
   apart the moment the template changed, which is why the skill now ships inside the repo it
   documents.

3. **Keep the CDN urls pinned, and keep the offline fallback on the same version.** The template
   already carries both, exactly as the published pages on `docs.danieldeusing.de` do:

   ```html
   <link rel="stylesheet"
     href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.57.0/dist/danieldeusing-design.min.css"
     onerror="this.onerror=null;this.href='/_design/danieldeusing-design-0.57.0.min.css'" />
   ```

   **Copy the version from `templates/documentation.html`, never from this line.** The example
   above said `0.7.0` until 2026-09-12 — a version that predates the `ls -l` rail this same
   paragraph requires — because a version written in prose has nothing keeping it true. The
   template is the one that ships.

   - **Pinned because this page ships the system's markup.** Since 2026-08-06 a doc carries the
     `ls -l` rail and the fixed footer — the design system's own chrome — so it is coupled to the
     release that styles it. That is exactly the case the `danieldeusing-design` skill says must
     pin. Before that, a doc consumed only the *look* and unpinned was right.
   - **Why unpinned would break it, concretely.** jsDelivr serves the unpinned url
     `cache-control: max-age=604800` — **seven days in the browser** (measured 2026-08-06), 12h at
     the edge. A reader who opened a doc last week keeps applying last week's build. Cockpit
     2.65.0 shipped rail markup that way and those browsers applied 0.1.6, which predates the
     rail: both nav toggles on screen, a 613px header, the brand floating mid-page. **A release
     cannot fix a poisoned cache** — the url a release publishes to is the one being cached. The
     pinned url is served `immutable`.
   - **The `onerror` fallback is the same release, byte for byte**, served from the docs site — so
     a reader with no route to the CDN gets an identical page, not an older one. Snapshots live
     **once per version**, not once per doc, in `danieldeusing-docs/site/_design/` and
     `site-internal/_design/`. Verify a fallback that has to render the rail can actually do it:
     `.tablewrap` only exists from 0.7.0, the rail only from 0.2.0.
   - **All three versions must agree**: the CDN pin, the `dist` fallback path and the `fonts.css`
     fallback path. A version that was never snapshotted 404s — a fallback that does not fall
     back.
   - **Adopting a new design release is a deliberate pass, not a side effect.** Copy the bytes
     from this repo's committed `dist/` (that is exactly what jsDelivr serves for the tag — prove
     it with `shasum -a 256` against
     `https://cdn.jsdelivr.net/npm/@danieldeusing/design@<v>/dist/danieldeusing-design.min.css`)
     into both `_design/` dirs as `danieldeusing-design-<v>.min.css` and
     `danieldeusing-design-<v>.fonts.css` (the fonts file is `src/fonts.css` with its two
     `@font-face` urls repointed at the woff2 files sitting beside it — upstream loads those from
     the CDN, which is precisely what is unavailable when the fallback fires). Then update every
     page in one pass: `rg -l 'design@' site site-internal`.
   - **The path is site-absolute**, so it resolves only for a doc served from
     `docs.danieldeusing.de`. A doc kept on disk and opened over `file://` has no fallback: if
     the CDN is unreachable it renders unstyled — which is what the `var(--token, <literal>)`
     fallbacks in the `<style>` block are for. Say so when reporting a local-only doc.

4. **Fill the placeholders.** Replace every `{{PLACEHOLDER}}`:
   - `{{FOLDER}}` — the project / folder slug (e.g. `pagr`); used in the `cat …/README.md` prompt
     and the footer status line.
   - `{{DOC_TITLE}}` — the document title (e.g. `Source Code documentation`); fills the `<title>`,
     the `<h1>`, and the footer, which renders `[{{FOLDER}}] {{DOC_TITLE}}` (e.g.
     `[pagr] Source Code documentation`).
   - `{{DOC_DESCRIPTION}}` — the `<meta name="description">`.
   - `{{TAGLINE}}` — the full-width lede under the title (it has no max-width — let it run full).
   - **Sections** — one `<section class="doc" id="SLUG" data-term>` per topic, each with a `.prompt`
     header and a `[data-term-out]` body. Add/remove sections to fit the subject; give each a unique
     `id`. Inside, use `.prompt` for shell-style headers, `ol.steps` for ordered steps, `ul.plain`
     for lists, `table.kv` (see below) for key/value specs, `pre.block` + `code.inline` for code,
     `.grid` + `.card-terminal` for cards, `.eli5` for callouts/tips, `.ascii-rule` for dividers,
     `.link-quiet` for inline links, and `pre.mermaid` for diagrams (see step 5).
   - **Reader first.** Open the page with a TL;DR: three to five bullets in the first section
     (`#overview`), for a reader who reads it once. Put a diagram before the paragraph it
     explains. Fold detail into `details.fold`.
   - **Tables: author a plain `<table>` and stop there.** The system styles it by element (0.10.0), and
     `initTableScroll()` (already wired at the bottom of the template) wraps every table so the
     table scrolls, never the page. What the page may still own is column widths, with a
     `<colgroup>`. The rules and the traps behind them (no local padding or row border, the
     `<colgroup>` example, never `white-space: nowrap` on a multi-item cell, never a font-size on
     a table, never a hand-written wrapper or `.table-scroll`) live in the design skill: read
     `references/tables-and-forms.md` of `danieldeusing-design`
     (`../danieldeusing-design/references/tables-and-forms.md` from this file) before the page
     gets a table.
   - `{{FLOW_*}}` — the placeholders of the example diagram in the `#flow` section. Replace the
     whole diagram with the real one, or delete the section (its minimap bar goes with it) if the
     page has no flow to draw.
   - **There is no table of contents, and the page is one centred column.** Both of those are
     the same decision. A text "On this page" list repeated the headings the reader was about
     to scroll past and charged a 13rem column for it — on a wide display that column was the
     difference between content that fills the page and content stranded beside a strip of
     nothing. It is replaced by the **minimap** (0.11.0): one bar per section down the left
     gutter, fixed, 2rem wide, so it costs the column nothing.
     **The markup contract is nothing.** Give each `<section class="doc">` an `id` and call
     `initMinimap({ sections: "section.doc" })` — bars, bar-length-by-heading-depth, click-to-jump
     and the scroll-spy all build themselves. Never hand-author a `.toc`, and never add a
     per-section entry anywhere: the failure that used to cause (a section added without its TOC
     link, or a stale `data-toc-link` breaking the scroll-spy) no longer has anywhere to happen.
   - **Do not override `.wrap`.** The template declares it once as a token declaration with
     literal fallbacks, and that is the layout: `--content-w` wide, `margin-inline: auto`, side
     margins are whatever is left. Every other surface in the estate does exactly this —
     cockpit's pages declare no `.wrap` rule at all. A doc that widens it, or puts the content in
     a grid column beside something, ends up left-aligned against the margin while every sibling
     page is centred, and that difference is visible the moment you have both open.
   - **The chrome is full-bleed, the content is capped, and nothing scales with the window.**
     `header.bar` and `footer.status` span the viewport; `main.wrap` is the only capped thing, at
     `--content-w` (90rem / 1440px since 0.56.0). Three states, one rule — and the reason it is
     written down rather than left to the template: **a doc must never set `zoom`, and must never
     restate a width.** Until 2026-09-12 the estate scaled the root font-size above 1920px so every
     rem grew with the display, and 17 published docs additionally ran a pre-paint
     `documentElement.style.zoom` of their own. Both are gone. A page that reintroduces either gets
     a column that is 2944px wide on a 4K monitor with type to match, which is what this rule
     exists to prevent — measured, not imagined. `bin/design-conformance` check 5 fails a page that
     applies a zoom.

   - **Navigation (top-right) — the `ls -l` rail, and most docs should not have one.**
     **The rule: a doc lists only itself, so the rail has one entry, so there is no rail.**
     A navigation whose only destination is the page you are already on is not navigation — it is
     a 17rem column of furniture that takes width from the content and states the obvious. Ship
     the rail only when there is somewhere else to go: a folder with sibling docs a reader is
     meant to move between, or a doc with child pages. One entry means delete it.
     **Do not list sibling docs just because they exist in the same folder.** Access on this site
     is per folder, and a rail that enumerates the neighbours tells a scoped reader what else is
     there. It is also how a doc grows a nav it never needed.
     When you do ship one: one `<li>` per entry, `ls-row--dir` for a directory (accent + weight),
     `ls-row--sub` / `ls-row--sub2` for nesting, `aria-current="page"` on the doc itself, and
     **labels under ~18 characters** — the rail is 17rem and `.dropdown-item` sets
     `white-space: nowrap`, so a longer one is clipped with nothing to show for it; put the full
     filename in `data-tip`, never `title`
     (`../danieldeusing-design/references/components.md`).

   - **Deleting the rail — delete the rail, not the nav element around it.** Remove exactly two
     things: the `<div class="ls-nav-head">` (the `$ ls -l` toggle in the header bar) and the
     `<div class="ls-nav" id="nav">` that follows it. **Keep `<nav class="site-nav">`, the
     `.nav-burger` button, and the `.mobile-footer` inside it.** That last one is not optional:
     `footer.status` is `display: none` below 48rem, so on a phone the burger menu is the only
     place the theme picker and the anim toggle exist. Deleting the whole `<nav>` because "there
     is no navigation" silently strips a phone reader of every control on the page.
     Nothing else needs touching — the system keys its own layout off `html:has(.ls-nav)`, so with
     the rail gone `--ls-nav-inset` falls to `0`, `body` loses its right padding and the content
     spans the full width by itself. `initLsNav()` is safe to leave in the runtime call list; with
     no rail in the page it has nothing to wire.

   **Fixed chrome — do not change:** the top-left `danieldeusing-docs` wordmark (always); the
   `ls -l` head in the header bar (it sits there, not in the rail, so the toggle stays put whether
   the rail is open or closed — and the guillemet is generated by CSS from the state, so never
   type one); **every control in the footer** — the `danieldeusing.de` link, the theme picker and
   the `[x] anim` toggle — because the header names the page and the footer operates it, one place
   on every surface; the `.mobile-footer` copy of those controls inside the nav (the fixed footer
   is `display:none` below 48rem, so without it a phone reader cannot switch theme); and the
   pre-paint `<head>` scripts — theme, animation gate and **the `ls-nav` read**. Those stay
   inline because a module at the end of `<body>` runs after first paint: a reader who hid the
   rail would watch it paint and jump away on every load. **There is no zoom script**, and
   since 0.56.0 no wide-screen scaling at all (from 0.29.0 to 0.55.0 it was the fluid root font
   size in `tokens.css`, which needed no pre-paint block either). Do not copy a zoom script in
   from an older page — `bin/design-conformance` check 5 fails a page that applies a zoom.

   **Every measurement in the page's `<style>` block is a token with a literal fallback.**
   The local CSS is the page's own *layout* only (`.wrap`, `.content`, `ol.steps`, `table.kv`, …) —
   never a restyle of the system's own classes. `.minimap` is the system's, not the page's: do not
   declare it locally, the same as any other class in the shared vocabulary. Within it:
   - **No bare numbers.** The column is `max-width: var(--content-w, 90rem)` +
     `padding-inline: var(--content-pad, 1.5rem)`; sizes are `var(--fs-base|--fs-lg|--fs-xl|--fs-2xl, <literal>)`
     and `var(--lh-tight|--lh-base, <literal>)`; colours are tokens and never a literal hex.
     A hardcoded `max-width: 78rem` is the old way and the reason five surfaces had four widths.
   - **Vertical room is `padding-block`, never the `padding` shorthand** — the shorthand resets
     `padding-inline` to 0 and silently drops the shared left/right margins.
   - **The `, <literal>` half is not decoration**, even now that the CDN url is pinned. A doc
     opened over `file://` with no route to the CDN gets no stylesheet at all — the site-absolute
     `onerror` path does not resolve there — and a bare `var(--content-w)` resolves to *nothing*:
     full-bleed page, collapsed type. Use the token's own value as the literal, so an offline
     reader gets the same column as every live surface — `90rem` / `1.5rem` / `1.7rem` (h1) / `0.75rem` (`pre`, as
     `var(--fs-base, 0.75rem)`) / `1.5` (line-height). Tables get no entry: their size is the
     system's (`table { font-size: var(--fs-base) }`). Neither does the minimap — it is fixed, sized in the
     system's own CSS, and a page that never loads that CSS has no minimap to size.

5. **Draw every diagram with Mermaid.** Flows, sequences, state machines, decision trees and
   architecture sketches go in a `<pre class="mermaid">` block — **never** hand-drawn ASCII art
   with box characters. The template ships the renderer (theme-aware, re-renders on theme
   switch) and the `pre.mermaid` CSS; keep both when the page has diagrams, delete both when it
   has none. Rules that matter:

   - **Every diagram is zoomable, and the template already wires it (0.10.0).** A flowchart
     scaled to fit a text column is unreadable at exactly the moment someone needs to read it,
     so `initDiagramZoom("pre.mermaid")` runs after the first render and the system's overlay
     does the rest: click / Enter / Space to open, wheel-zoom about the pointer, drag-pan,
     `+ - 0`, Escape to close. Do not hand-roll a lightbox and do not drop the call when you
     trim the diagram block — a diagram nobody can enlarge is the failure this exists to
     prevent. Two things to preserve if you touch that code: it is wired **once** behind a
     flag (the opener binds a listener per element and is not idempotent, so a second call
     opens two overlays per click), and it is wired **after** the first render because it
     clones the rendered `<svg>` — cloning is also why the theme re-render keeps working.
   - **Escape the line breaks.** Inside a `<pre>`, write `&lt;br/&gt;` in node labels, never a
     raw `<br/>`. A raw tag is parsed as an HTML element and the renderer — which reads
     `textContent` — receives the label with the break silently stripped, so every label runs
     together on one line. Same for any other markup: don't put `<code>` in labels; the page is
     already monospace, so it buys nothing and gets sanitized away.
   - **Keep labels short.** One idea plus an optional `file.ts:12-34` reference. Long prose makes
     Mermaid render a tall narrow column; put the explanation in the surrounding paragraph.
   - **Mark failure/gap nodes** with a red class so problems read at a glance, e.g.
     `class D warn` + `classDef warn fill:#a02c2c22,stroke:#a02c2c,stroke-width:2px`. Use the
     `--destructive` hue (`#a02c2c`), and the primary hue (`#8a4516`) for "new/proposed" nodes,
     so diagrams stay in the design system's palette across themes. (Mermaid's `classDef` takes
     literal colours only — this is the one place a hex is unavoidable, and the reason the
     renderer is otherwise fed `themeVariables` read from the live tokens.)
   - **Verify it renders — don't assume.** A diagram that fails to parse silently falls back to
     its source. Render the finished page headlessly and check every diagram produced an SVG:
     ```bash
     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
       --force-prefers-reduced-motion --virtual-time-budget=20000 --window-size=1400,2400 \
       --screenshot=/tmp/doc.png "file:///path/to/doc.html"
     ```
     Then look at the screenshot. (`--force-prefers-reduced-motion` skips the typing animation so
     content is visible immediately.) Before you judge a diagram or a wide table, zoom into its
     region at full resolution — the browser tool's zoom action, or a crop of the PNG
     (`sips -c <h> <w> --cropOffset <y> <x> /tmp/doc.png --out /tmp/doc-part.png`): at
     full-page scale a clipped label or a squeezed column does not show. For a stricter check,
     load the page in Puppeteer and assert that every `pre.mermaid` contains an `<svg>` and that
     no label still contains a literal `<br/>`.
   - **Also use this same screenshot to catch table overflow** whenever the page has any table —
     check the image for content running off the right edge or a page-level horizontal scrollbar,
     not just the diagrams. `initTableScroll()` doesn't guarantee every cell was authored safely
     (an accidental `nowrap` on a multi-item cell still makes a column absurdly wide, it just
     scrolls now instead of breaking the page). The exact assertion, if you drive a real browser:
     `document.documentElement.scrollWidth <= clientWidth` on the page, and
     `wrap.scrollWidth > wrap.clientWidth` on the `.tablewrap` — the table scrolls, the page does
     not. Do it at a narrow viewport (~820px): at 1400px many wide tables still fit.
   - **Assert the page shell too, not just the content.** Mermaid and table checks pass happily on
     a page whose structure is broken, so they are not enough on their own. The classic failure is
     a dropped `</div>` — the page still renders, still passes every content check, and is quietly
     mis-laid-out. At a wide viewport (1920, not 1280 — at 1280 the wrap nearly fills the screen
     and almost any layout looks centred) assert:
     ```js
     const wrap = document.querySelector('main.wrap'), r = wrap.getBoundingClientRect();
     const gapL = r.left, gapR = document.documentElement.clientWidth - r.right;
     Math.abs(gapL - gapR) <= 2                 // the column is centred, not left-aligned
     r.width <= parseFloat(getComputedStyle(document.documentElement)
                  .getPropertyValue('--content-w')) * 16 + 2   // still capped at --content-w
     document.querySelectorAll('.minimap-bar').length ===
       document.querySelectorAll('section.doc[id]').length     // one bar per section
     !document.querySelector('.toc')            // no text TOC — it was replaced in 0.11.0
     ```
     The centring check is the one that matters: it is exactly what a stray `.wrap` override or a
     leftover grid column breaks, and it is invisible on a laptop. The bar count catches a section
     added without an `id`, which is the only way a section can now go missing from the minimap.
     A structural pre-check costs nothing either: inside `<main class="wrap">` the count of `<div`
     and `</div>` must be equal.

6. **Preserve graceful degradation.** Keep the pre-paint `<script>` blocks in `<head>` and the
   no-JS / `prefers-reduced-motion` fallbacks intact. Don't strip `aria-*` attributes. The page
   must stay fully readable with JavaScript disabled — which is also why diagram sources live in
   a `<pre>`: without JS the reader still sees the raw Mermaid source instead of an empty box.

7. **Write one file.** Save the filled HTML to the user's chosen path, or default to
   `./<slug>-docs.html` next to the subject. Do **not** create any companion `.css`/`.js` files —
   it's single-file by design; styling comes from the CDN.

   Then have the saved page checked for contradictions by a fresh-context subagent that
   receives only the saved file's path — not this conversation, not your notes. It returns
   every place where the page's text, tables and diagrams disagree with each other (ticket ids,
   file and method names, counts, versions and dates), each with both locations. Fix each one
   before step 8. Where no subagent is available, run the same check yourself. The check is
   never written into the page.

8. **Offer to publish** to `docs.danieldeusing.de`. Ask first — some docs are local-only. If the
   user declines, stop here and report the local path.

   **Ask which surface, then where.** There are **two** trees, and the choice is a security
   decision, not a filing one — ask, never guess:
   - **`site-internal/`** → `docs.internal.danieldeusing.de`, tailnet-only. **This is the
     default and the right answer when in doubt**: client material, private-repo content,
     review reports, infrastructure notes, anything under NDA. It costs nothing extra — same
     repo, same login, same publish command.
   - **`site/`** → `docs.danieldeusing.de`, reachable from the **public internet** behind a
     password. Only for something you would hand a stranger along with the password.

   Publishing is not reversible: `git rm` does not un-publish, so promoting later
   (`git mv site-internal/x site/x`) is a one-line decision while demoting is not.
   Full table: `danieldeusing-infra/docs/runbooks/docs-site.md`.

   Once the user has chosen, read `references/publish.md` (next to this file) and follow it:
   where in the tree the file goes, moving it into the docs repo, checking that the folder is
   reachable and recording it in 1Password, and the pull-before-push that deploys it.

9. **Report.** Give the local path (or the published URL — `https://docs.internal.danieldeusing.de/…`
   for `site-internal/`, `https://docs.danieldeusing.de/…` for `site/` — plus the 1P item name if
   it was published), that it opens directly in a browser, and that themes (warm / green / mono /
   paper) are switchable from the page-settings dropdown in the bottom-right of the footer.

   If published, **verify it actually landed** rather than assuming — `curl -u daniel -s -o
   /dev/null -w '%{http_code}' <url>` should be 200. A push that succeeded while the webhook
   failed leaves the site silently stale until the hourly reconcile.

## Notes

- This is a fill-a-template skill, not a generator framework. No config, no flags beyond the
  output path.
- Mermaid is pinned to `@11.16.0` and loaded as an ESM module from jsDelivr, independently of the
  design-system version. Bump it deliberately, never to `@latest`.
- The renderer waits for the `term:contentdone` event before drawing, because a diagram inside a
  not-yet-revealed `[data-term-out]` is `visibility: hidden` and cannot be measured. It also
  serializes render passes — an unguarded theme-change observer fires while the first pass is
  still running and stacks every diagram into one box.
- The terminal typing animation runs only when motion is allowed; with reduced motion or JS off,
  all content is shown immediately.
- **Visual defaults this system rejects.** Each was found in a published doc and removed:
  - rounded corners: `4px` on inline code chips, badges and verdict tags, `6px` on `pre` blocks,
    warning boxes and the Mermaid source fallback (twenty declarations, 2026-08-07; Daniel: "We
    have no rounded corners.");
  - a second type size for code: `code.inline { font-size: 0.92em }` (2026-09-08), and `pre` at
    `var(--fs-md, 0.86rem)`, whose fallback kept 13.76px alive after `--fs-md` was deleted
    (17 pages, 2026-08-11);
  - a status colour written as a hex outside a Mermaid `classDef`: `#a02c2c` 41 times across
    four pages, right on warm and wrong on the other three themes (2026-08-06);
  - the navigation as a dropdown menu instead of the rail (2026-08-06; Daniel: "not a dropdown,
    but a sidebar").

  After each review, add what the page reached for instead.
