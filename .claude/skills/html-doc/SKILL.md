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

3. **Leave the CDN urls UNPINNED — and keep the offline fallback.** The template already carries
   both, exactly as the published pages on `docs.danieldeusing.de` do:

   ```html
   <link rel="stylesheet"
     href="https://cdn.jsdelivr.net/npm/@danieldeusing/design/dist/danieldeusing-design.min.css"
     onerror="this.onerror=null;this.href='/_design/danieldeusing-design-0.4.0.min.css'" />
   ```

   - **Unpinned is the decision** — one design system, every surface on the current version. **Do
     not add a version to the CDN url**, and do not "helpfully" resolve one from `package.json`
     or `git describe` (the tags lag several releases behind npm — a real source of wrong pins).
     A generated doc consumes the *look*, not a release-specific feature, so unpinned is correct;
     the rule that decides this, and the one surface that must pin instead, is in the
     `danieldeusing-design` skill.
   - **The `onerror` fallback is what makes unpinned safe to read during an outage**: a
     byte-for-byte snapshot of the release the doc was written against, served from the docs site
     itself. Snapshots live **once per version**, not once per doc, in
     `danieldeusing-docs/site/_design/` and `site-internal/_design/`.
   - **The version in the two `onerror` paths is a real dependency — check it.** Compare it to
     `package.json` in this repo; if the design system has moved, add the new snapshot to BOTH
     `_design/` dirs (`dist/danieldeusing-design.min.css` → `danieldeusing-design-<v>.min.css`,
     `src/fonts.css` → `danieldeusing-design-<v>.fonts.css`, plus the woff2 files the fonts css
     references by relative name) and point the new doc at it. A stale version here still works —
     it just falls back to an older look — but a version that was never snapshotted 404s, which
     is a fallback that does not fall back.
   - **The path is site-absolute**, so it resolves only for a doc served from
     `docs.danieldeusing.de`. A doc kept on disk and opened over `file://` has no fallback: if
     the CDN is unreachable it renders unstyled. Say so when reporting a local-only doc.

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
   - **Every table must scroll, never the page.** Wrap every `table.kv` (or any custom table
     variant) like this:
     ```html
     <div class="table-scroll"><table class="kv">...</table></div>
     ```
     `.table-scroll` (`overflow-x: auto; max-width: 100%;`) ships with the template. Without the
     wrapper, a long inline-code value or a cell holding more than one item forces the table wider
     than its column, and the browser scrolls the WHOLE PAGE horizontally instead of just the
     table — easy to miss at a glance, obvious once someone opens it at a normal viewport width.
     Never set `white-space: nowrap` on a cell that can hold more than one short token (e.g. a list
     of file names) — that's what forces the runaway width in the first place; if a cell needs to
     list several items, join them with `<br />` so they stack instead of running wide.
   - `{{FLOW_*}}` — the placeholders of the example diagram in the `#flow` section. Replace the
     whole diagram with the real one, or delete the section (and its TOC entry) if the page has
     no flow to draw.
   - **Table of contents** — for every section add a matching
     `<a href="#SLUG" data-toc-link="SLUG">Label</a>` in the `.toc` nav (the scroll-spy wires itself
     from these). This mirrors the article TOC on danieldeusing.de.
   - **Navigation (top-right)** — KEEP the `<details id="nav">` dropdown ONLY for a multi-page doc
     set (fill `{{NAV_*_HREF}}` / `{{NAV_*_LABEL}}`, one `<li>` per page). For a single-page doc,
     DELETE the entire `<details id="nav">`.

   **Fixed chrome — do NOT change:** the top-left `danieldeusing-docs` wordmark (always); the
   footer's `danieldeusing.de` link, the theme (page-settings) dropdown, and the `[x] anim`
   on/off toggle (bottom-right); and the pre-paint `<head>` scripts — theme, animation gate and
   **`initResolutionZoom`** — which stay inline so there is no flash and so the page tracks the
   window like every other surface.

   **Every measurement in the page's `<style>` block is a token with a literal fallback.**
   The local CSS is the page's own *layout* only (`.layout`, `.toc`, `ol.steps`, `table.kv`, …) —
   never a restyle of the system's own classes. Within it:
   - **No bare numbers.** The column is `max-width: var(--content-w, 78rem)` +
     `padding-inline: var(--content-pad, 1.5rem)`; sizes are `var(--fs-xs … --fs-2xl, <literal>)`
     and `var(--lh-tight|--lh-base, <literal>)`; colours are tokens and never a literal hex.
     A hardcoded `max-width: 78rem` is the old way and the reason five surfaces had four widths.
   - **Vertical room is `padding-block`, never the `padding` shorthand** — the shorthand resets
     `padding-inline` to 0 and silently drops the shared left/right margins.
   - **The `, <literal>` half is not decoration.** The page loads the system unpinned and
     jsDelivr caches an unpinned url for seven days in the browser, so a reader can be holding a
     build that predates a token (0.2.0 has neither `.wrap` nor `--fs-*`). A bare
     `var(--content-w)` resolves to *nothing* there: full-bleed page, collapsed type. Use the
     same literal the published docs use so a new page and an old one degrade identically —
     `78rem` / `1.5rem` / `1.7rem` (h1) / `0.66rem` (toc label) / `0.76rem` (toc link) /
     `0.86rem` (`pre`) / `0.92rem` (`table.kv`) / `1.5` (line-height).

5. **Draw every diagram with Mermaid.** Flows, sequences, state machines, decision trees and
   architecture sketches go in a `<pre class="mermaid">` block — **never** hand-drawn ASCII art
   with box characters. The template ships the renderer (theme-aware, re-renders on theme
   switch) and the `pre.mermaid` CSS; keep both when the page has diagrams, delete both when it
   has none. Rules that matter:

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
   - **Also use this same screenshot to catch table overflow** (see the `.table-scroll` rule in
     step 4) whenever the page has any table — check the image for content running off the right
     edge or a page-level horizontal scrollbar, not just the diagrams. This is the actual way the
     bug gets caught; the `.table-scroll` wrapper alone doesn't guarantee every cell was authored
     safely (e.g. an accidental `nowrap` on a multi-item cell).

6. **Preserve graceful degradation.** Keep the pre-paint `<script>` blocks in `<head>` and the
   no-JS / `prefers-reduced-motion` fallbacks intact. Don't strip `aria-*` attributes. The page
   must stay fully readable with JavaScript disabled — which is also why diagram sources live in
   a `<pre>`: without JS the reader still sees the raw Mermaid source instead of an empty box.

7. **Write one file.** Save the filled HTML to the user's chosen path, or default to
   `./<slug>-docs.html` next to the subject. Do **not** create any companion `.css`/`.js` files —
   it's single-file by design; styling comes from the CDN.

8. **Offer to publish** to `docs.danieldeusing.de`. Ask first — some docs are local-only. If the
   user declines, stop here and report the local path.

   **a. Ask where it goes.** The published tree is `<context>/<project>/`, mirroring how the
   estate is organised — e.g. `poi/vu3/`, `danieldeusing/homepage/`, `ihk/einwilligungen/`,
   `promonco/`. Offer the existing folders (`ls ~/Work/danieldeusing/danieldeusing-docs/site/`)
   plus a new one; never guess. The filename is the kebab-case slug, `.html`.

   **b. Move it in** (`git mv` if it is already tracked, otherwise `mv` — the file lives in the
   docs repo, not next to the subject, so there is exactly one copy):

   ```bash
   DOCS=~/Work/danieldeusing/danieldeusing-docs
   mkdir -p "$DOCS/site/<context>/<project>"
   mv <written-file> "$DOCS/site/<context>/<project>/<slug>.html"
   ```

   **c. Record it in 1Password** so the doc can be handed to someone. Vault
   `danieldeusing-agents`, item `docs - <context>/<project>/<slug>`, category LOGIN, with the
   **URL** and a note naming the credential that opens it.

   > **Phase 1 has ONE site-wide password** (`docs - basicauth`, user `daniel`). Do **not**
   > generate a per-doc password and store it as if it were enforced — nothing would check it,
   > and an item claiming otherwise is worse than no item. Reference `docs - basicauth` instead.
   > Per-folder passwords arrive with the phase-2 cockpit manager
   > (`danieldeusing-infra/docs/runbooks/docs-site.md` §Phase 2); when that lands, this step
   > generates a real per-folder password and stores the plaintext here with the hash in
   > `docs-access.json`.

   **d. Pull before you push** — other machines publish to this repo too, so a blind push
   fails on a non-fast-forward:

   ```bash
   cd "$DOCS" && git pull --rebase && git add site/ \
     && git commit -m "docs: <what>" && git push
   ```

   The push is the deploy: GitHub fires a push webhook, `dd-infra-docs` on ddMini verifies the
   HMAC and re-syncs. Live in a few seconds — no build, no deploy step.

9. **Report.** Give the local path (or the published URL
   `https://docs.danieldeusing.de/<context>/<project>/<slug>.html` and the 1P item name if it was
   published), that it opens directly in a browser, and that themes (warm / green / mono / paper)
   are switchable from the page-settings dropdown in the bottom-right of the footer.

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
