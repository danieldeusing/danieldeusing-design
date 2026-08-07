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

3. **Keep the CDN urls PINNED, and keep the offline fallback on the SAME version.** The template
   already carries both, exactly as the published pages on `docs.danieldeusing.de` do:

   ```html
   <link rel="stylesheet"
     href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.7.0/dist/danieldeusing-design.min.css"
     onerror="this.onerror=null;this.href='/_design/danieldeusing-design-0.7.0.min.css'" />
   ```

   - **Pinned because this page ships the system's MARKUP.** Since 2026-08-06 a doc carries the
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
   - **The `onerror` fallback is the SAME release, byte for byte**, served from the docs site — so
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
     into BOTH `_design/` dirs as `danieldeusing-design-<v>.min.css` and
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
   - **Tables are styled by the SYSTEM from 0.10.0 — author a plain `<table>` and stop there.**
     Cell padding, top-aligned cells, the hairline between rows, the stronger header rule and
     `width: 100%` all ship in `src/base.css`. Do not add any of that to the page: a local
     `td { padding }` is a forked component and the conformance checker reports it. What a PAGE
     may still own is **column widths**, because only the page knows which column carries the
     prose — use a `<colgroup>` and keep the wide one from eating the table:
     ```html
     <table>
       <colgroup><col style="width:4rem" /><col /><col style="width:9rem" /></colgroup>
     ```
     Give the sentence column no width and let it take the remainder. Without this a
     three-sentence cell sizes the column to its longest line and squeezes every other column
     into a vertical stack of single words.
   - **Every table must scroll, never the page — and the markup contract for that is NOTHING.**
     Author a plain `<table>`. `initTableScroll()` (already wired at the bottom of the template)
     gives every table a `.tablewrap` parent: `overflow-x` plus a right-edge fade, because a
     scroll container with a hard edge is indistinguishable from a table that simply ends and
     nobody knows to scroll. Do **not** hand-write a wrapper, and never re-invent
     `.table-scroll` — that was this repo's private name for the same idea before 0.7.0 shipped
     `.tablewrap`, and two names for one thing is how the estate drifts.
     Without it, a long inline-code value or a cell holding more than one item forces the table
     wider than its column and the browser scrolls the WHOLE PAGE horizontally — the header
     slides off, the fixed footer stops reaching the edge, and body text needs two axes to read.
     Never set `white-space: nowrap` on a cell that can hold more than one short token (e.g. a
     list of file names) — that's what forces the runaway width in the first place; if a cell
     needs to list several items, join them with `<br />` so they stack instead of running wide.
   - **Never set a font-size on a table.** 0.7.0 sets `table { font-size: var(--fs-md) }` for the
     whole estate, which exists because cockpit's doc tables sat at 15px and its dashboard tables
     at 12px. A local size only reintroduces that.
   - `{{FLOW_*}}` — the placeholders of the example diagram in the `#flow` section. Replace the
     whole diagram with the real one, or delete the section (and its TOC entry) if the page has
     no flow to draw.
   - **Table of contents** — for every section add a matching
     `<a href="#SLUG" data-toc-link="SLUG">Label</a>` in the `.toc` nav (the scroll-spy wires itself
     from these). This mirrors the article TOC on danieldeusing.de.
   - **Navigation (top-right) — the `ls -l` RAIL, never a dropdown.** Fill the `<ul class="ls-panel">`
     with one `<li>` per entry: `ls-row--dir` for a directory (accent + weight), `ls-row--sub` /
     `ls-row--sub2` to draw the nesting, `aria-current="page"` on the doc itself. Never delete the
     rail — a page with no navigation is the reason three published docs had no way back to their
     own folder. **What it lists:** the doc's own subtree and nothing above it — its folder, its
     sibling docs, and any child folder. Access on this site is per folder, so a rail that
     enumerated the estate would tell a scoped reader what else exists. A doc that is genuinely
     alone still lists its folder (auto-indexed, so the link works) and itself.
     **Keep labels under ~18 characters**: the rail is 17rem and `.dropdown-item` sets
     `white-space: nowrap`, so a longer one is clipped with nothing to show for it — put the full
     filename in `title`.

   **Fixed chrome — do NOT change:** the top-left `danieldeusing-docs` wordmark (always); the
   `ls -l` head in the header bar (it sits there, not in the rail, so the toggle stays put whether
   the rail is open or closed — and the guillemet is generated by CSS from the state, so never
   type one); **every control in the footer** — the `danieldeusing.de` link, the theme picker and
   the `[x] anim` toggle — because the header names the page and the footer operates it, one place
   on every surface; the `.mobile-footer` copy of those controls inside the nav (the fixed footer
   is `display:none` below 48rem, so without it a phone reader cannot switch theme); and the
   pre-paint `<head>` scripts — theme, animation gate, **the `ls-nav` read** and
   **`initResolutionZoom`**. Those stay inline because a module at the end of `<body>` runs after
   first paint: a reader who hid the rail would watch it paint and jump away on every load.

   **Every measurement in the page's `<style>` block is a token with a literal fallback.**
   The local CSS is the page's own *layout* only (`.layout`, `.toc`, `ol.steps`, `table.kv`, …) —
   never a restyle of the system's own classes. Within it:
   - **No bare numbers.** The column is `max-width: var(--content-w, 78rem)` +
     `padding-inline: var(--content-pad, 1.5rem)`; sizes are `var(--fs-xs … --fs-2xl, <literal>)`
     and `var(--lh-tight|--lh-base, <literal>)`; colours are tokens and never a literal hex.
     A hardcoded `max-width: 78rem` is the old way and the reason five surfaces had four widths.
   - **Vertical room is `padding-block`, never the `padding` shorthand** — the shorthand resets
     `padding-inline` to 0 and silently drops the shared left/right margins.
   - **The `, <literal>` half is not decoration**, even now that the CDN url is pinned. A doc
     opened over `file://` with no route to the CDN gets no stylesheet at all — the site-absolute
     `onerror` path does not resolve there — and a bare `var(--content-w)` resolves to *nothing*:
     full-bleed page, collapsed type. Use the same literal the published docs use so every page
     degrades identically — `78rem` / `1.5rem` / `1.7rem` (h1) / `0.66rem` (toc label) /
     `0.76rem` (toc link) / `0.86rem` (`pre`) / `1.5` (line-height). Tables get no entry: their
     size is the system's (`table { font-size: var(--fs-md) }`).

5. **Draw every diagram with Mermaid.** Flows, sequences, state machines, decision trees and
   architecture sketches go in a `<pre class="mermaid">` block — **never** hand-drawn ASCII art
   with box characters. The template ships the renderer (theme-aware, re-renders on theme
   switch) and the `pre.mermaid` CSS; keep both when the page has diagrams, delete both when it
   has none. Rules that matter:

   - **Every diagram is ZOOMABLE, and the template already wires it (0.10.0).** A flowchart
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
     content is visible immediately.) For a stricter check, load the page in Puppeteer and assert
     that every `pre.mermaid` contains an `<svg>` and that no label still contains a literal
     `<br/>`.
   - **Also use this same screenshot to catch table overflow** whenever the page has any table —
     check the image for content running off the right edge or a page-level horizontal scrollbar,
     not just the diagrams. `initTableScroll()` doesn't guarantee every cell was authored safely
     (an accidental `nowrap` on a multi-item cell still makes a column absurdly wide, it just
     scrolls now instead of breaking the page). The exact assertion, if you drive a real browser:
     `document.documentElement.scrollWidth <= clientWidth` on the page, and
     `wrap.scrollWidth > wrap.clientWidth` on the `.tablewrap` — the table scrolls, the page does
     not. Do it at a NARROW viewport (~820px): at 1400px many wide tables still fit.
   - **Assert the page SHELL too, not just the content.** Mermaid and table checks pass happily on a
     page whose structure is broken, so they are not enough on their own. The classic failure is a
     dropped `</div>`: the `.content` column never closes, `<aside class="toc">` is swallowed into it
     instead of being its sibling, and the table of contents silently renders as a block at the
     BOTTOM of the page instead of the right-hand rail — on a page that otherwise looks fine and
     passes every other check. At a WIDE viewport (~1280px, above the 64rem breakpoint) assert:
     ```js
     const toc = document.querySelector('.toc'), content = document.querySelector('.content');
     toc.parentElement === document.querySelector('.layout')   // toc is NOT inside .content
     toc.previousElementSibling === content                    // …it is content's sibling
     getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length === 2
     toc.getBoundingClientRect().left >= content.getBoundingClientRect().right - 1  // it is to the RIGHT
     document.querySelectorAll('.toc nav a').length === document.querySelectorAll('section.doc').length
     ```
     From 0.10.0 the TOC sits against the right edge of the BODY, not of the reading column, so
     also check there is no dead band beside it — `document.body.getBoundingClientRect().right -
     toc.getBoundingClientRect().right` should be about one `--content-pad`, not the ~230px it
     was when the whole grid sat centred inside `.wrap`. Check it at 1920, not at 1280: at 1280
     the wrap nearly fills the viewport and a centred layout looks correct.
     The last line catches the other recurring slip — a section added without its TOC entry, or a TOC
     entry whose `href`/`data-toc-link` does not match any section `id`, which breaks the scroll-spy.
     A quick structural pre-check costs nothing either: inside the `.layout` region the count of
     `<div` and `</div>` must be equal.

6. **Preserve graceful degradation.** Keep the pre-paint `<script>` blocks in `<head>` and the
   no-JS / `prefers-reduced-motion` fallbacks intact. Don't strip `aria-*` attributes. The page
   must stay fully readable with JavaScript disabled — which is also why diagram sources live in
   a `<pre>`: without JS the reader still sees the raw Mermaid source instead of an empty box.

7. **Write one file.** Save the filled HTML to the user's chosen path, or default to
   `./<slug>-docs.html` next to the subject. Do **not** create any companion `.css`/`.js` files —
   it's single-file by design; styling comes from the CDN.

8. **Offer to publish** to `docs.danieldeusing.de`. Ask first — some docs are local-only. If the
   user declines, stop here and report the local path.

   **a. Ask WHICH SURFACE, then where.** There are **two** trees, and the choice is a security
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

   Within the chosen tree the path is `<context>/<project>/`, mirroring how the estate is
   organised — e.g. `poi/vu3/`, `danieldeusing/automation/`. Offer the existing folders
   (`ls ~/Work/danieldeusing/danieldeusing-docs/{site,site-internal}/`) plus a new one. The
   filename is the kebab-case slug, `.html`.

   **b. Move it in** (`git mv` if it is already tracked, otherwise `mv` — the file lives in the
   docs repo, not next to the subject, so there is exactly one copy):

   ```bash
   DOCS=~/Work/danieldeusing/danieldeusing-docs
   TREE=site            # or site-internal
   mkdir -p "$DOCS/$TREE/<context>/<project>"
   mv <written-file> "$DOCS/$TREE/<context>/<project>/<slug>.html"
   ```

   **c. Check the folder is REACHABLE, and record it in 1Password.**

   > **Access is per-folder scopes in `danieldeusing-docs/docs-access.json`**, enforced by
   > `deploy/docs/server.py` — the single site-wide password is gone. A scope is a folder, the
   > users who may open it, and the `surface` it applies to (`public` / `internal` / `both`). It
   > **fails closed**: a folder no scope covers cannot be opened by anyone, so a doc published
   > into a brand-new folder is unreachable until a scope covers it. The root scope (`""`) is the
   > master key and covers everything beneath it, which is why most publishes need no change —
   > but check rather than assume, and say so in the report if a new scope is needed.
   > Adding or editing a scope is a repo edit in `docs-access.json`, reviewed like any other.

   Then record it so the doc can be handed to someone: vault `danieldeusing-agents`, item
   `docs - <context>/<project>/<slug>`, category LOGIN, with the **URL** and a note naming the
   scope that opens it. Do not invent a password — reference the credential the scope actually
   lists.

   **d. Pull before you push** — other machines publish to this repo too, so a blind push
   fails on a non-fast-forward:

   ```bash
   cd "$DOCS" && git pull --rebase && git add "$TREE/<context>/<project>/<slug>.html" \
     && git commit -m "docs: <what>" && git push
   ```

   Stage the **explicit path**, never `git add -A` or `git add site/`: other machines and agents
   publish into this repo concurrently, and a catch-all sweeps their in-progress work into your
   commit.

   The push is the deploy: GitHub fires a push webhook, `dd-infra-docs` on ddMini verifies the
   HMAC and re-syncs. Live in a few seconds — no build, no deploy step.

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
