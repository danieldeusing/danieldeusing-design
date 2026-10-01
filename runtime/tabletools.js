/*
 * danieldeusing-design — a table's search, its per-column filters and its sort.
 *
 * Every table in the estate had been growing these by hand. cockpit's own
 * `table-view.js` opens by explaining that `cockpitTable` "is copied into four
 * pages and has drifted into three generations"; the family contacts table grew
 * a row of bare filter boxes because nothing said what a table should look like.
 * Consolidating inside one surface fixed it for that surface. This is the same
 * move one level up, and the storage key is deliberately cockpit's own
 * (`table-view:<id>`) so a reader's saved views survive the migration.
 *
 * ── THE ICONS LIVE IN THE HEADER, THE SEARCH LIVES ON TOP ─────────────────────
 *
 * A row of text boxes under the header (`tr.filters`) spends a whole row of
 * vertical space announcing a capability that is idle on most visits, and it
 * reads as a form to fill in. Two small controls in the `<th>` cost nothing when
 * unused and sit on the column they act on. The filter opens a `<details
 * class="dropdown">` — the system's existing dropdown, so one-open, click-away
 * and Escape are already handled by initDropdowns() and are not reimplemented.
 *
 * ── COMPOSING WITH THE PAGER, WHICH ALSO OWNS `hidden` ────────────────────────
 *
 * runtime/pagination.js pages a table by setting `hidden` on the rows outside
 * the window. If filtering ALSO used `hidden` the two would overwrite each
 * other: the pager clears `hidden` on the first twenty rows in the tbody, which
 * would include rows the filter had just excluded.
 *
 * So a filtered-out row is DETACHED from the tbody and held here, and the tbody
 * is left containing exactly the matching rows in sort order. The pager then
 * sees the set it is documented to expect — "filter and sort produce the rows,
 * the pager slices them" — and needs no knowledge of this file. Its
 * MutationObserver notices the childList change and re-pages on its own.
 *
 * Detaching rather than hiding also means `:nth-child` striping and the pager's
 * own counts are honest without either of them having to know a filter exists.
 *
 * ── NORMALISE AGAINST TODAY'S COLUMNS ─────────────────────────────────────────
 *
 * Inherited from cockpit's engine, and the reason it is not a detail:
 * localStorage outlives the code. A stored sortKey naming a column that has
 * since been renamed would reach an undefined column and throw where the table
 * should be. Unknown keys are dropped, and a direction only survives WITH the
 * column it sorted — applying a remembered direction to a different column hands
 * back a view the reader never chose.
 *
 * ── THE SEARCH BOXES ARE THE SYSTEM'S (0.60.0) ───────────────────────────────
 *
 * The box above the table and the text box inside a column's filter are both a
 * `.search-field` — magnifier, a named clear button, Escape to clear — in a
 * `<search class="filter-bar">`. They used to be `.tbl-search` and
 * `.tbl-filter-input`: two more bespoke boxes on a `--border` edge that missed
 * WCAG's 3:1 for a control, with no clear button, beside the page's own search
 * boxes that had one. search.js owns the clear and Escape; this file only keeps
 * the clear's `hidden` in step when IT writes a value (a restored view, a reset),
 * because a value set from code fires no `input` for search.js to hear.
 *
 * ── WHAT COCKPIT'S ENGINE KNEW, NOW HERE (D2, 0.60.0) ────────────────────────
 *
 * cockpit's `cockpitTable` keeps fetching, `setRows`/`fail` and its column vocabulary; the
 * rest of what it had learned moves into the system:
 *   · THE HAYSTACK. A row's `data-search-text` is matched with its text, so a search can find
 *     what no column prints (a review id, a job id) without a second box.
 *   · THE PAGE'S OWN BAR. A `<search class="filter-bar" data-table-bar>` directly before the
 *     table's wrapper is used, not duplicated: the search goes FIRST in it, and whatever the page
 *     put there (its one action) stays. The bar puts the search on the left and the rest on the
 *     right (filters.css, 0.62.0), so nothing is drawn to push them apart.
 *   · THE COUNT. A `p.result-count[role=status]` after the wrapper (and after the pager) says
 *     "7 of 55 runs — 48 hidden by the filters" while rows are withheld, and NOTHING at rest: the
 *     pager already states the total. It is written 400 ms after the last apply, so it announces
 *     a settled result rather than every keystroke. It exists, empty, from the start, because a
 *     live region created at the moment it speaks is not heard.
 *   · TWO NOTHINGS. With no rows at all a placeholder row says "no <unit> yet" (or the table's
 *     `data-table-empty`); with rows and no match it says "no <unit> match these filters." and
 *     offers the reset. Two different sentences, because "nothing here" is a lie in one of the two
 *     cases. A failure and a load are the page's (S1's alert, S6's .loading) — three sentences.
 *   · THE HEADER GLYPHS ARE MASKS. The sort and filter controls carry no text; data.css draws the
 *     arrows, the funnel and the badge's x from the icon set, so they take the header's colour in
 *     every mode, forced colours included, and a screen reader hears only the `aria-label`.
 *
 * ── WHAT THIS WRITES, IT KEEPS WRITING ───────────────────────────────────────
 *
 * `aria-sort` and `.is-filtered` on a header, the controls and the badge inside it, `aria-checked`
 * on a pick row: none of it is in the page's markup, so a renderer that PATCHES attributes and
 * children into the header (cockpit's `cockpitPatch`) takes every one of them away on each poll.
 * The observer below watches the header as well as the body, and puts back what this file owns.
 * The same goes one level out: the box this file put in the bar and the count after the table are
 * not in the page's markup either, so a renderer that patches the whole MOUNT takes both — and the
 * search stayed in force with no box to show it. A second observer, on the bar and on the wrapper's
 * parent, puts the same nodes back. A renderer can draw them itself instead, and they are adopted:
 * an `input[type=search][data-table-search]` in the bar, a `p.result-count[role=status]
 * [data-table-count]` after the table (or after its pager). Then a patch keeps its own nodes.
 * Every write is conditional — an attribute set to the value it already has is still a mutation,
 * and an observer that answers its own writes never stops.
 */

import { positionPopup } from "./popup.js";
import { initSearchFields } from "./search.js";

const STORE_PREFIX = "table-view:";
const PLACEHOLDER = "data-table-placeholder";
// Every attribute this file reads from a body row or cell. An edit to any other one changes no view,
// so the body observer does not answer it — see "NOT EVERY OTHER WRITER IS A RENDERER" there.
const ROW_READS = new Set(["data-value", "data-sort-value", "data-search-text", "data-pin", "data-row-key", "data-row-for", PLACEHOLDER]);
const COUNT_DELAY = 400;
const instances = new WeakMap();

// Only a CHANGE is written: the observer hears every write, and one that changes nothing would wake it.
const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };

const textOf = (el) => (el ? (el.textContent || "").trim() : "");

/* A `.search-field`: the markup search.js wires. `data-1p-ignore` because cockpit
   learned the expensive way that a password manager otherwise offers to fill
   every filter box on the page. */
function searchField(name, placeholder, clearName) {
  const field = document.createElement("div");
  field.className = "search-field";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", name);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("data-1p-ignore", "");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "search-clear";
  clear.setAttribute("aria-label", clearName);
  clear.hidden = true;
  field.append(input, clear);
  return { field, input };
}

/* A value written from code fires no `input`, so the clear would keep the state
   of the last keystroke — shown over an empty box after a reset, hidden over a
   restored query. */
function setSearchValue(input, value) {
  input.value = value;
  const clear = input.parentElement && input.parentElement.querySelector(":scope > .search-clear");
  if (clear) clear.hidden = !value;
}

/* A header cell's own words, without the controls injected into it. */
const labelOf = (th) => {
  let out = "";
  for (const node of th.childNodes) {
    if (node.nodeType === 1 && node.classList && node.classList.contains("tbl-tools")) continue;
    out += node.textContent || "";
  }
  return out.trim();
};

/*
 * What a cell is WORTH, for filtering and for sorting — and they are not always
 * the same fact.
 *
 * `data-value` overrides the printed text, so a column can match on something it
 * does not show. `data-sort-value` overrides it again for ordering only, because
 * a column can legitimately want to be filtered one way and ordered another:
 * cockpit's `duration` filters on "1m 30s" (what the reader sees and types) and
 * must sort on the millisecond count, or 9s files after 10m. Its `ref` column
 * filters on the branch AND the PR number, but orders by the branch alone.
 *
 * Falling back value -> text at each step means a cell that needs neither says
 * nothing, which is most of them.
 */
const cellValue = (row, index) => {
  const cell = row.cells[index];
  if (!cell) return "";
  const explicit = cell.getAttribute("data-value");
  return explicit === null ? textOf(cell) : explicit.trim();
};

const cellSortValue = (row, index) => {
  const cell = row.cells[index];
  if (!cell) return "";
  const explicit = cell.getAttribute("data-sort-value");
  return explicit === null ? cellValue(row, index) : explicit.trim();
};

/*
 * THE DIRECTION IS APPLIED IN HERE, not by the caller, and that is the whole
 * reason this takes `dir`. A blank cell sorts LAST IN BOTH DIRECTIONS — treating
 * it as 0 would file "not reported" between the negative and the positive
 * numbers, which reads as a measurement rather than an absence. Multiplying the
 * comparator's result by the direction outside it inverts that rule along with
 * everything else, so descending puts every blank FIRST. Caught by the fixture:
 * ascending ended [...Carla, Dieter] and descending began [Dieter, Carla].
 */
const compare = (a, b, type, dir) => {
  const aBlank = a === "", bBlank = b === "";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  if (type === "num") {
    const na = parseFloat(a.replace(/[^0-9.eE+-]/g, ""));
    const nb = parseFloat(b.replace(/[^0-9.eE+-]/g, ""));
    const aNaN = Number.isNaN(na), bNaN = Number.isNaN(nb);
    if (aNaN && bNaN) return 0;
    if (aNaN) return 1;
    if (bNaN) return -1;
    return dir * (na - nb);
  }
  return dir * a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

function columnsOf(table) {
  const head = table.tHead && table.tHead.rows[0];
  if (!head) return [];
  const out = [];
  for (let i = 0; i < head.cells.length; i += 1) {
    const th = head.cells[i];
    const key = th.getAttribute("data-col");
    if (!key) continue;                       // a column opted out is left alone
    out.push({
      key, index: i, th,
      // The label must EXCLUDE the controls this file injects into the same cell.
      // textOf(th) after a snapshot picks up the sort and filter glyphs, and the
      // view bar then reads "sorted by name↕⌕ ▼". data-col-label wins when set.
      label: th.getAttribute("data-col-label") || labelOf(th),
      type: th.getAttribute("data-sort-type") || "text",
      filter: th.getAttribute("data-filter") || "text",
    });
  }
  return out;
}

const defaults = (inst) => ({ sortKey: inst.defaultSortKey, dir: inst.defaultDir, filters: {}, search: "" });

const activeFilters = (inst, view) => {
  const out = {};
  for (const col of inst.columns) {
    const value = view.filters && view.filters[col.key];
    if (value) out[col.key] = String(value);
  }
  return out;
};

const isDefault = (inst, view) =>
  view.sortKey === inst.defaultSortKey && view.dir === inst.defaultDir &&
  !view.search && Object.keys(activeFilters(inst, view)).length === 0;

function normalize(inst, raw) {
  const view = defaults(inst);
  let stored;
  try { stored = JSON.parse(raw); } catch { return view; }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return view;
  const known = new Set(inst.columns.map((c) => c.key));
  // `data-sort-sticky="off"` — REMEMBER THE FILTERS, NEVER THE ORDER (Daniel, 2026-08-27:
  // "I should put the newest first. Always as default").
  //
  // A saved view is right for a filter: it is a question the reader asked and will ask again. It
  // is wrong for the sort on a table whose subject is TIME. An activity log answers "what happened
  // recently", so it opens newest-first or it opens useless — and one click on the ▲ a month ago
  // pinned it oldest-first for ever, with no affordance to undo since the per-table reset button
  // went in 0.33.0. The reader is then left with a table that is wrong every time and no way to
  // say so, which is worse than not remembering at all.
  //
  // Deliberately narrow: sorting still works, and it still persists on every table that does not
  // set the attribute. Only the RESTORE is skipped, and only where the page says time is the axis.
  if (!inst.sortSticky) {
    // fall through to the page's declared default
  } else if (known.has(stored.sortKey)) {
    view.sortKey = stored.sortKey;
    if (stored.dir === 1 || stored.dir === -1) view.dir = stored.dir;
  }
  if (stored.filters && typeof stored.filters === "object" && !Array.isArray(stored.filters)) {
    for (const key of Object.keys(stored.filters)) {
      if (!known.has(key)) continue;
      const text = String(stored.filters[key] ?? "").trim().toLowerCase();
      if (text) view.filters[key] = text;
    }
  }
  if (typeof stored.search === "string") view.search = stored.search.trim().toLowerCase();
  return view;
}

/* Both wrapped: Safari in private mode THROWS on localStorage rather than
   returning null, and a table that refuses to render because a preference could
   not be read is worse than one that starts at its defaults. */
function save(inst) {
  if (!inst.id) return;
  try {
    if (isDefault(inst, inst.view)) localStorage.removeItem(STORE_PREFIX + inst.id);
    else localStorage.setItem(STORE_PREFIX + inst.id, JSON.stringify({
      // Written even when it will not be restored, so a stored view stays a full description of
      // what was in force — but see normalize(): a non-sticky table ignores these two on load.
      sortKey: inst.view.sortKey, dir: inst.view.dir,
      filters: activeFilters(inst, inst.view), search: inst.view.search || "",
    }));
  } catch { /* the view still applies for this visit; only the memory is lost */ }
}

function restore(inst) {
  if (!inst.id) return defaults(inst);
  try { return normalize(inst, localStorage.getItem(STORE_PREFIX + inst.id)); }
  catch { return defaults(inst); }
}

const matches = (inst, row) => {
  const view = inst.view;
  if (view.search) {
    // `data-search-text` is matched with what the row prints: a search can find a review id or a
    // job id no column shows, which is why cockpit had grown a second box beside this one.
    const hay = (textOf(row) + " " + (row.getAttribute("data-search-text") || "")).toLowerCase();
    if (!hay.includes(view.search)) return false;
  }
  for (const col of inst.columns) {
    const want = view.filters[col.key];
    if (!want) continue;
    const got = (cellValue(row, col.index) || "").toLowerCase();
    // `pick` is an exact match and `text` is a contains — spelling both as
    // "contains" would be a small lie about why a row is missing.
    if (col.filter === "pick" ? got !== want : !got.includes(want)) return false;
  }
  return true;
};

export function applyTableView(table) {
  const inst = instances.get(table);
  if (!inst) return;
  const body = table.tBodies[0];
  if (!body) return;

  const keep = [], drop = [];
  for (const row of inst.allRows) (matches(inst, row) ? keep : drop).push(row);

  /*
   * A PINNED ROW OUTRANKS THE SORT. `data-pin` marks a row that belongs at the top
   * whatever column is ordering the table — cockpit's approvals record uses it for an
   * ask still waiting on a human, where the highlight IS the signal: no coloured row
   * at the top means nothing is waiting, which is read at a glance rather than counted.
   *
   * It has to live HERE rather than in the caller, because the caller renders once and
   * this re-sorts the DOM on every header click. A pin the sort does not know about
   * survives exactly until the reader sorts by something, and a marker that means
   * something until you touch the table teaches that it never meant anything.
   *
   * Ahead of the comparator, never instead of it: pinned rows are still ordered among
   * themselves by the chosen column.
   */
  const pinRank = (row) => (row.hasAttribute("data-pin") ? 0 : 1);
  const col = inst.columns.find((c) => c.key === inst.view.sortKey);
  if (col) {
    keep.sort((a, b) => pinRank(a) - pinRank(b) ||
      compare(cellSortValue(a, col.index), cellSortValue(b, col.index), col.type, inst.view.dir));
  } else if (keep.some((row) => pinRank(row) === 0)) {
    // No sort in force: the caller's own order stands, pins lifted out of it. Array sort is
    // stable, so everything keeps its relative place inside each group.
    keep.sort((a, b) => pinRank(a) - pinRank(b));
  }

  /*
   * A DETAIL ROW IS NOT A ROW. An expandable table puts a second <tr> under the
   * one it belongs to — the contacts book's per-person panel, spanning every
   * column. Treated as data it would be filtered on its own text and sorted away
   * from its parent, which is how a detail panel ends up under a stranger.
   *
   * So `data-row-for="<key>"` marks a child of `data-row-key="<key>"`: it is
   * excluded from matching and from the sort, and simply follows its parent
   * wherever the parent lands. A child whose parent is filtered out goes with it.
   */
  const want = [];
  for (const row of keep) want.push(row, ...(inst.childrenOf.get(row) || []));
  for (const row of drop) {
    for (const child of inst.childrenOf.get(row) || []) child.remove();
    row.remove();
  }
  const placeholder = keep.length ? null : placeholderRow(inst);
  if (inst.placeholder && inst.placeholder !== placeholder) inst.placeholder.remove();
  inst.placeholder = placeholder;
  if (placeholder) want.push(placeholder);
  /*
   * ONLY A ROW OUT OF PLACE MOVES (0.62.3). This used to append every kept row again on every pass,
   * so clearing a narrow filter on the contacts book moved all of them (580 ms against 490 ms at 4x
   * CPU throttle). One walk down the body: a row already where it belongs is passed over, any other
   * is inserted there. Narrowing removes the rows that leave and moves none; clearing inserts the
   * rows that come back and moves none; a pass that changes nothing writes nothing.
   */
  let cursor = body.firstElementChild;
  for (const row of want) {
    if (row === cursor) cursor = cursor.nextElementSibling;
    else body.insertBefore(row, cursor);
  }
  // What we just wrote, so the observer can tell OUR output from a real
  // re-render. A synchronous "applying" flag cannot: MutationObserver delivers
  // asynchronously, so the flag is already back to false when the callback
  // runs, and the observer re-enters forever. pagination.js avoids the same
  // trap by writing only real changes; this is that discipline for a reorder.
  inst.lastWritten = [...body.rows];

  paintHeader(inst);
  paintHeaderBadges(inst);
  writeCount(inst, keep.length, drop.length);

  /*
   * A page that prints its own "N of M" has to be told, or it reports the count
   * from before the filter and quietly contradicts the table under it. Both
   * family pages do exactly that — the contacts book's "6 of 1167" and the
   * ledger's "N of M rows · net €X" are computed by the page, from the page's
   * own filtering, and neither can see a column filter applied here.
   */
  table.dispatchEvent(new CustomEvent("tbl:applied", {
    bubbles: true,
    detail: { shown: keep.length, hidden: drop.length, total: inst.allRows.length },
  }));
}

const unitOf = (inst) => inst.table.getAttribute("data-table-unit") || "rows";

/*
 * The row that stands in for no rows. Spans every column, carries `data-table-placeholder` so the
 * pager, the match and the sort all pass over it, and is REPLACED rather than edited when what it
 * says changes: its text is written before it is inserted, so the only record it makes is a
 * childList one on the body, which the observer knows is this file's own.
 */
function placeholderRow(inst) {
  const unit = unitOf(inst);
  const none = inst.allRows.length === 0;
  const kind = none ? "empty" : "no-match";
  const text = none ? (inst.table.getAttribute("data-table-empty") || `no ${unit} yet`) : `no ${unit} match these filters.`;
  const held = inst.placeholder;
  if (held && held.getAttribute(PLACEHOLDER) === kind && held.textContent.startsWith(text)) return held;
  const row = document.createElement("tr");
  row.setAttribute(PLACEHOLDER, kind);
  const cell = row.insertCell();
  const head = inst.table.tHead && inst.table.tHead.rows[0];
  cell.colSpan = head ? [...head.cells].reduce((n, th) => n + th.colSpan, 0) : 1;
  // S1's inline markup as feedback.html documents it: the sentence is the box's own text, the reset
  // follows it on the same line. No <p>: a block inside would be aligned by .empty's grid rules.
  const box = document.createElement("div");
  box.className = "empty empty--inline";
  box.append(none ? text : text + " ");
  if (!none) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "doc-link doc-link--forward";
    reset.textContent = "reset filters";
    reset.addEventListener("click", () => resetTableView(inst.table));
    box.append(reset);
  }
  cell.append(box);
  return row;
}

/* Silent at rest — the pager states the total — and settled: written once the applies stop. */
function writeCount(inst, shown, hidden) {
  if (!inst.count) return;
  const text = hidden ? `${shown} of ${shown + hidden} ${unitOf(inst)} — ${hidden} hidden by the filters` : "";
  clearTimeout(inst.countTimer);
  inst.countTimer = setTimeout(() => { inst.countText = text; setText(inst.count, text); }, COUNT_DELAY);
}

function paintHeader(inst) {
  for (const col of inst.columns) {
    const sorted = inst.view.sortKey === col.key;
    setAttr(col.th, "aria-sort", sorted ? (inst.view.dir === 1 ? "ascending" : "descending") : "none");
    const on = Boolean(inst.view.filters[col.key]);
    if (col.filterWrap) col.filterWrap.classList.toggle("is-on", on);
    // The pick rows are menuitemradios: exactly one is checked — "all" when nothing is filtered.
    if (col.pickPanel) {
      const want = inst.view.filters[col.key] || "";
      for (const item of col.pickPanel.querySelectorAll(".dropdown-item")) {
        setAttr(item, "aria-checked", String(item.getAttribute("data-pick") === want));
      }
    }
  }
}

/*
 * WHAT IS IN FORCE GOES ON THE COLUMN, not in a bar above the table (Daniel,
 * 2026-08-19). A separate strip is a second place to look, it costs a line of
 * vertical space on every filtered table, and it says "relationship = family"
 * a long way from the relationship column. The header is where the reader
 * already is when they wonder where a row went.
 *
 * So a filtering column wears two things: a highlight, and a badge carrying the
 * value. The badge is a button — clicking it clears that column's filter, which
 * is the way back the bar used to provide, now attached to the thing it undoes.
 */
function paintHeaderBadges(inst) {
  for (const col of inst.columns) {
    const value = inst.view.filters[col.key];
    col.th.classList.toggle("is-filtered", Boolean(value));
    let badge = col.badge;
    if (!value) {
      if (badge) { badge.remove(); col.badge = null; }
      continue;
    }
    // A patch of the header takes the badge out with everything else it did not write: the same
    // node goes back. Removal drops its focus to <body>; restoreFocus() gives it back.
    if (badge && !col.th.contains(badge)) col.th.appendChild(badge);
    if (!badge) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = "tbl-badge";
      badge.addEventListener("click", (event) => {
        event.stopPropagation();
        inst.view.filters[col.key] = "";
        if (col.filterInput) setSearchValue(col.filterInput, "");
        save(inst); applyTableView(inst.table);
        // The badge has just removed itself, and focus would fall to <body>: it goes to the control
        // that set what was cleared, where the next Tab carries on along the header.
        col.filterWrap?.querySelector(":scope > summary")?.focus();
      });
      col.th.appendChild(badge);
      col.badge = badge;
    }
    const exact = col.filter === "pick";
    // The stored value is lower-cased because that is what matching needs. Showing
    // it back would print "cash" where the dropdown offered "Cash" — the badge is
    // the reader's own choice quoted back at them, so it uses their casing.
    setText(badge, (exact && col.pickLabels && col.pickLabels.get(value))
      || (col.filterInput && col.filterInput.value.trim())
      || value);
    // No native `title` (house rule 7): the badge's text IS the value, and its name says what a
    // press does. A tip on a header control was dropped on 2026-08-21 for the same reason.
    setAttr(badge, "aria-label", `clear the ${col.label} filter`);
  }
}

/* A pick row: a menuitemradio carrying the value it sets (`""` for "all"). */
function pickItem(inst, col, value, label) {
  const li = document.createElement("li");
  li.setAttribute("role", "none");
  const item = document.createElement("button");
  item.type = "button";
  item.className = "dropdown-item";
  item.setAttribute("role", "menuitemradio");
  item.setAttribute("aria-checked", "false");
  item.setAttribute("data-pick", value);
  item.textContent = label;
  item.addEventListener("click", () => {
    inst.view.filters[col.key] = value;
    col.filterWrap.open = false;
    save(inst); applyTableView(inst.table);
  });
  li.append(item);
  return li;
}

const pickValues = (inst, col) => {
  const seen = new Map();
  for (const row of inst.allRows) {
    const raw = cellValue(row, col.index);
    if (raw) seen.set(raw.toLowerCase(), raw);
  }
  col.pickLabels = seen;
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
};

/* 128px is `.dropdown-panel`'s own floor (components.css): positionPopup() writes the width floor
   inline, which would otherwise shrink the panel to its 16px summary. */
function placePanel(wrap) {
  const panel = wrap.querySelector(":scope > .dropdown-panel");
  const summary = wrap.querySelector(":scope > summary");
  if (panel && summary) positionPopup(panel, summary, { minWidth: 128 });
}

function buildHeaderControls(inst) {
  for (const col of inst.columns) {
    // Already built: put the same controls back where a patch took them from, never a second set.
    if (col.tools) {
      if (!col.th.contains(col.tools)) col.th.appendChild(col.tools);
      continue;
    }
    const tools = document.createElement("span");
    tools.className = "tbl-tools";
    col.tools = tools;

    const sort = document.createElement("button");
    sort.type = "button";
    sort.className = "tbl-sort";
    // NO TOOLTIP ON A HEADER CONTROL (Daniel, 2026-08-21). `button[data-tip]::after` renders the ⓘ
    // marker, so every sortable column grew "↕ⓘ" and every filterable one "⌕ⓘ" — two glyphs of
    // furniture per column, on tables that can carry ten. The tip said "sort by <label>" beside a
    // sort arrow already sitting under the label it sorts, which is the definition of a tooltip
    // that repeats its own control. `aria-label` STAYS: the glyph is decoration, but a screen
    // reader still has to be told what an unlabelled ↕ button does.
    // No text: data.css draws the arrows as a mask from `aria-sort` on the header.
    sort.setAttribute("aria-label", "sort by " + col.label);
    sort.addEventListener("click", () => {
      if (inst.view.sortKey === col.key) inst.view.dir = inst.view.dir === 1 ? -1 : 1;
      else { inst.view.sortKey = col.key; inst.view.dir = 1; }
      save(inst); applyTableView(inst.table);
    });
    col.sortBtn = sort;
    tools.appendChild(sort);

    /*
     * `data-filter="none"` — SORTABLE BUT NOT FILTERABLE, which is a real kind of column rather
     * than an oversight. cockpit's `duration` is the case: a box matching "1m 30s" filters on the
     * formatting rather than on the length. Opting the column out of `data-col` entirely would
     * take its SORT away with the filter, which is exactly the regression that surfaced when this
     * was first wired — every duration column quietly stopped being orderable.
     */
    if (col.filter === "none") {
      col.th.appendChild(tools);
      continue;
    }

    const wrap = document.createElement("details");
    wrap.className = "dropdown tbl-filter";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "filter " + col.label);
    wrap.appendChild(summary);

    let panel;
    if (col.filter === "pick") {
      // The list is built from the column's own cells, so it can never offer a value the table
      // does not contain. A menu of menuitemradios (M5's word "all" first, where this used to write
      // "(any)"): M1 gives it the arrow keys and M0 draws the ✓ on the checked row.
      panel = document.createElement("ul");
      panel.className = "dropdown-panel dropdown-panel--down";
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", "filter " + col.label);
      panel.append(pickItem(inst, col, "", "all"));
      for (const [lower, label] of pickValues(inst, col)) panel.append(pickItem(inst, col, lower, label));
      col.pickPanel = panel;
    } else {
      panel = document.createElement("div");
      panel.className = "dropdown-panel dropdown-panel--down tbl-filter-panel";
      const { field, input } = searchField(
        "filter " + col.label, col.label + " contains…", "clear the " + col.label + " filter");
      input.addEventListener("input", () => {
        inst.view.filters[col.key] = input.value.trim().toLowerCase();
        save(inst); applyTableView(inst.table);
      });
      col.filterInput = input;
      panel.appendChild(field);
    }

    wrap.appendChild(panel);
    // Out of the wrapper's clip: `.tablewrap` scrolls, so a panel absolute inside it was cut off at
    // the wrapper's edge — on a table filtered down to its placeholder, most of the list. Placed
    // fixed against its summary, as select.js places its list (WP6's popup.js).
    wrap.addEventListener("toggle", () => { if (wrap.open) placePanel(wrap); });
    col.filterWrap = wrap;
    tools.appendChild(wrap);
    col.th.appendChild(tools);
  }
}

/*
 * Re-read the rows and the header from the DOM as it is NOW.
 *
 * Every table in this estate that is worth filtering is rendered from data and
 * rewritten wholesale — `contact-rows.innerHTML = …` on the contacts book,
 * cockpit's in-place patcher on its automation tables, a 30-second poll behind
 * both. A component that snapshotted its rows once would hold a list of detached
 * <tr>s after the first repaint and quietly filter nothing, and its header
 * controls would be gone with the <thead> that carried them.
 */
/*
 * BUT ONLY FROM THE BODY WHEN THE BODY IS NO LONGER WHAT THIS FILE WROTE (0.62.3). A filter detaches
 * the rows it withholds, so a body still holding exactly the rows this file last put there (`lastWritten`,
 * the same nodes in the same order) is the filtered view, not the table: read from it, every withheld row
 * left the set for good. That is what a page writing `cell.textContent` into a visible row did, and a
 * renderer replacing the <thead>. So while the body is ours, the rows are the ones held here — withheld
 * included — and a write inside one is an update of that row.
 *
 * THE SHOWN ROWS KEEP THE BODY'S ORDER. A patcher matching by position (cockpit's `cockpitPatch`) moves
 * CONTENT between row nodes, so the nodes' read order no longer says which record came first: rebuilt in
 * that order, rows tied on the sort column changed places on polls that changed nothing. So the slots
 * the shown rows held go to the shown rows in the order the body has them, as reading the body did, and
 * a withheld row keeps its own slot.
 *
 * WHAT IT CANNOT TELL APART, and the cure. A renderer that rewrites the body IN PLACE with exactly as
 * many rows as are showing moves no row either. Without being told, the rows it no longer has stay held:
 * withheld, counted in "3 of 10 — 7 hidden", offered in a pick menu, and back on screen when the filter
 * is cleared, possibly beside the same record written into a shown row. `resetTableView()` keeps them
 * too. They go at the next render whose row count differs. A renderer says how many rows it wrote with
 * `data-table-rows` on the table, detail rows (`data-row-for`) not counted, read only in the task that writes
 * it; when that is not the number held here, the body is the set (`fromBody`).
 */
const sameRows = (body, rows) => body.rows.length === rows.length && rows.every((row, i) => body.rows[i] === row);

/* The renderer's own count of the rows it wrote (`data-table-rows`), when it gives one and it is not what is held. */
const declaredOtherwise = (inst) => {
  const declared = inst.table.getAttribute("data-table-rows");
  return declared !== null && Number(declared) !== inst.allRows.filter((row) => !row.hasAttribute("data-row-for")).length;
};

function snapshot(inst, fromBody = false) {
  const body = inst.table.tBodies[0];
  if (!body) return;
  let rows;
  if (!fromBody && sameRows(body, inst.lastWritten)) {
    const held = new Set(inst.allRows);
    const shown = [...body.rows].filter((row) => held.has(row));
    const inBody = new Set(shown);
    let k = 0;
    rows = inst.allRows.map((row) => (inBody.has(row) ? shown[k++] : row))
      .flatMap((row) => [row, ...(inst.childrenOf.get(row) || [])]);
  } else {
    // A placeholder is this file's own stand-in for no rows, never data.
    rows = [...body.rows].filter((row) => !row.hasAttribute(PLACEHOLDER));
  }
  inst.childrenOf = new Map();
  inst.allRows = [];
  const byKey = new Map();
  for (const row of rows) {
    const parentKey = row.getAttribute("data-row-for");
    if (parentKey === null) {
      inst.allRows.push(row);
      const key = row.getAttribute("data-row-key");
      if (key !== null) byKey.set(key, row);
    }
  }
  for (const row of rows) {
    const parentKey = row.getAttribute("data-row-for");
    if (parentKey === null) continue;
    const parent = byKey.get(parentKey);
    // An orphan detail row — parent filtered out by the page itself, or a stale
    // key — is left as ordinary content rather than dropped. Removing a row
    // because its key did not resolve would delete data over a typo.
    if (!parent) { inst.allRows.push(row); continue; }
    if (!inst.childrenOf.has(parent)) inst.childrenOf.set(parent, []);
    inst.childrenOf.get(parent).push(row);
  }
  // The <thead> may have been replaced too, so the column objects must be
  // re-read and the controls re-injected onto the cells that exist now.
  const fresh = columnsOf(inst.table);
  if (fresh.length) {
    // Carry the CONTROLS across, not just the inputs. columnsOf() builds new
    // column objects, and paintHeader() writes the sort glyph and the active-filter
    // mark through col.sortBtn / col.filterWrap — drop those and the header stops
    // reporting the state it is actually in. Measured: aria-sort said "ascending"
    // while the button still showed the neutral glyph.
    for (const col of fresh) {
      const prev = inst.columns.find((c) => c.key === col.key);
      if (!prev) continue;
      col.filterInput = prev.filterInput;
      col.sortBtn = prev.sortBtn;
      col.filterWrap = prev.filterWrap;
      col.badge = prev.badge;
      col.pickLabels = prev.pickLabels;
      col.pickPanel = prev.pickPanel;
      col.tools = prev.tools;
    }
    inst.columns = fresh;
    buildHeaderControls(inst);
    refreshPickOptions(inst);
  }
}

/*
 * A `pick` list is derived from the column's own cells, so it has to be rebuilt
 * when those cells change — a re-render that introduces a new relationship would
 * otherwise leave a dropdown that cannot offer it, and the reader would conclude
 * the value does not exist. Rebuilt only when the set actually differs, so an
 * open dropdown is not torn out from under the pointer on every poll.
 */
function refreshPickOptions(inst) {
  for (const col of inst.columns) {
    if (col.filter !== "pick" || !col.pickPanel) continue;
    const wanted = pickValues(inst, col);
    const panel = col.pickPanel;
    const current = [...panel.children].slice(1).map((li) => li.textContent);
    if (current.length === wanted.length && current.every((v, i) => v === wanted[i][1])) continue;
    for (const li of [...panel.children].slice(1)) li.remove();
    for (const [lower, label] of wanted) panel.append(pickItem(inst, col, lower, label));
  }
}

/* The PAGE'S bar, when it put one directly before the table's wrapper — looking back past a pager or a count
   another table left there when it moved (never past a table's wrapper), so a table that lands after a moved
   one's leavings adopts the bar rather than drawing a second. */
const pageBarOf = (anchor) => {
  let before = anchor.previousElementSibling;
  while (before && before.matches(".table-pager, p.result-count")) before = before.previousElementSibling;
  return before && before.matches("search.filter-bar[data-table-bar]") ? before : null;
};

// Which instance a box speaks for. A page's box outlives the instance that first adopted it — a table
// detached and inserted again is a new instance — so its listener asks here rather than closing over one.
const boxOwners = new WeakMap();
// Which table a count speaks for. A count another table already holds is never adopted: a table
// rendered between a neighbour and its count would otherwise take that count, and the two would
// re-assert their own text over each other's for ever — measured, a renderer that never answered.
const countOwners = new WeakMap();
// The counts this file made, as against one a renderer drew and the engine adopted: only its own goes
// with a table that leaves for good.
const madeCounts = new WeakSet();
// A retired instance's view, keyed by its table node, for the node coming back somewhere else.
const carried = new WeakMap();

/* The box the table search reads. A box is bound once, and given the query in force by each instance it serves. */
function useSearchBox(inst, input) {
  inst.searchInput = input;
  if (boxOwners.get(input) === inst) return;
  const bound = boxOwners.has(input);
  boxOwners.set(input, inst);
  setSearchValue(input, inst.view.search || "");
  if (bound) return;
  input.addEventListener("input", () => {
    const owner = boxOwners.get(input);
    if (owner.retired) return;
    owner.view.search = input.value.trim().toLowerCase();
    save(owner); applyTableView(owner.table);
  });
}

/* The page bar this table adopted, unless another engine table now stands directly after it and takes it. */
function barToBring(inst) {
  const bar = inst.bar || inst.carriedBar;
  if (!bar || !bar.isConnected) return null;
  // A pager or a count beside it is what this table left behind, not a table standing after the bar. Only
  // an engine table that searches (and would adopt the bar) keeps it; a neighbour with its own bar or with
  // `data-table-search="off"` never takes it, so the bar goes with its table.
  let next = bar.nextElementSibling;
  while (next && next.matches(".table-pager, p.result-count")) next = next.nextElementSibling;
  const other = next && (next.matches("table") ? next : next.matches(".tablewrap") ? next.querySelector(":scope > table") : null);
  const adopter = other && other !== inst.table && other.hasAttribute("data-table-tools") && other.getAttribute("data-table-search") !== "off";
  return adopter ? null : bar;
}

/*
 * THE BAR'S BOX AND THE COUNT, put where they belong and put BACK when a renderer's patch took them.
 *
 * The search goes FIRST in the page's bar (`data-table-bar`) — its spacer and its action stay — or in
 * a `<search class="filter-bar">` of the engine's own, before the wrapper, never inside it:
 * `.tablewrap` scrolls sideways, and a box in there slides out of reach on the wide tables that need
 * one. The count follows the wrapper, and the pager when there is one; it is there from the start,
 * empty, because a status region that appears as it speaks is not announced.
 *
 * Either can be the page's own (adopted, above). Every write here is conditional, so the observer
 * that calls this hears its own re-insertion once, finds everything in place, and stops.
 */
/*
 * THE BAR IS THE RENDERER'S WHEN THE RENDERER PATCHES THE MOUNT. The engine's OWN <search> sits before
 * the wrapper, where no renderer's markup has one — so a patcher matching children by position lines
 * the page's `div.tablewrap` up against the engine's bar, builds a new table there and throws the old
 * one away, on every poll. That cannot be fixed from here without changing the markup (the bar cannot
 * go inside the wrapper, which scrolls, or after it), so it is a contract: a renderer that re-renders
 * this mount draws `<search class="filter-bar" data-table-bar>` itself. The engine says so when it can
 * tell — its own bar gone while an engine table is still in that mount — once per table identity, as
 * the node is new on every poll. A page that clears the whole mount is not warned.
 */
const warnedBars = new Set();
function ownBarLost(inst) {
  const mount = inst.ownBarParent;
  // Only when the table is still there, or a table of the SAME identity took its place: that is a
  // re-render of this table. A mount cleared, or filled with a different table, is the page's business.
  const again = inst.table.isConnected ||
    [...mount.querySelectorAll("table[data-table-tools]")].some((t) => identityOf(t) === inst.identity);
  if (warnedBars.has(inst.identity) || !again) return;
  warnedBars.add(inst.identity);
  console.warn(`initTableTools: a renderer that re-renders this mount must draw <search class="filter-bar" data-table-bar> ` +
    `before the table "${inst.identity || "(no data-table-id or aria-label)"}" itself. The engine's own bar was taken out, and a ` +
    "patcher matching by position rebuilds the table in its place on every render.");
}

/*
 * A MOVED TABLE TAKES ITS BAR AND ITS COUNT WITH IT. A page that appends the table (or its wrapper) into
 * another container keeps the node, so this instance and the reader's view — sort, filters, search, the
 * pager's page — stay; what was left behind is the bar before the old position and the count after it,
 * saying things about a table that is no longer there. So both are placed against where the table IS:
 * the bar directly before the wrapper, the count directly after it (after the pager, when there is one),
 * and the new parent is watched from then on.
 *
 * The bar is the engine's own or the page's `data-table-bar` it adopted (0.62.3): an adopted bar goes as
 * an adopted count always did. Left behind, it held the page's action and, when the page drew it, a box
 * still searching this table, while the engine drew a second bar at the new place. Not when the new place
 * has a page bar of its own, and not when another engine table now stands directly after it.
 */
function ensureChrome(inst) {
  const table = inst.table;
  if (inst.ownBar && inst.ownBarParent && !inst.ownBar.isConnected) ownBarLost(inst);
  const anchor = table.closest(".tablewrap") || table;
  if (anchor.parentElement && anchor.parentElement !== inst.chromeParent) {
    inst.chromeParent = anchor.parentElement;
    inst.chrome.observe(inst.chromeParent, { childList: true });
  }
  if (!table.isConnected) return;

  if (inst.wantsSearch) {
    let pageBar = pageBarOf(anchor);
    if (!pageBar) {
      pageBar = barToBring(inst);
      if (pageBar) keepingFocus(pageBar, () => anchor.before(pageBar));
    }
    const theirs = pageBar && pageBar.querySelector('input[type="search"][data-table-search]');
    if (theirs) {
      useSearchBox(inst, theirs);
    } else {
      if (!inst.searchField) {
        const { field, input } = searchField("search this table", "search this table…", "clear table search");
        inst.searchField = field;
        inst.searchBox = input;
        watchFocus(inst, field);
      }
      useSearchBox(inst, inst.searchBox);
      let bar = pageBar;
      if (!bar) {
        if (!inst.ownBar) {
          inst.ownBar = document.createElement("search");
          inst.ownBar.className = "filter-bar";
          if (inst.label) inst.ownBar.setAttribute("aria-label", "search " + inst.label);
        }
        bar = inst.ownBar;
      }
      if (!bar.contains(inst.searchField)) bar.prepend(inst.searchField);
      if (bar.nextElementSibling !== anchor) {
        keepingFocus(bar, () => anchor.before(bar));
        if (bar === inst.ownBar) inst.ownBarParent = bar.parentElement;
      }
      if (inst.carriedCaret) giveFocusBack(inst.searchBox, inst.carriedCaret);
      inst.carriedCaret = null;
    }
    if (pageBar && pageBar !== inst.bar) {
      inst.bar = pageBar;
      inst.chrome.observe(pageBar, { childList: true, subtree: true });
    }
  }

  let at = anchor;
  if (at.nextElementSibling && at.nextElementSibling.classList.contains("table-pager")) at = at.nextElementSibling;
  if (inst.count && inst.count.isConnected) {
    if (at.nextElementSibling !== inst.count) at.after(inst.count);
  } else {
    const next = at.nextElementSibling;
    const free = next && next.matches("p.result-count[role=status][data-table-count]") && (countOwners.get(next) || inst) === inst;
    let count = free ? next : inst.count;
    if (!count) {
      count = document.createElement("p");
      count.className = "result-count";
      count.setAttribute("role", "status");
      count.setAttribute("data-table-count", "");
      madeCounts.add(count);
    }
    if (!count.isConnected) at.after(count);
    if (count !== inst.count) {
      countOwners.set(count, inst);
      inst.count = count;
      inst.chrome.observe(count, { childList: true, characterData: true, subtree: true });
    }
  }
  // What it last said, back in place — a patch writing the page's empty count would silence it.
  setText(inst.count, inst.countText);
  restoreFocus(inst);
}

/*
 * WHICH TABLE THIS NODE IS. A patcher matching by position can hand one table's NODE another table's
 * markup — two engine tables in one mount, and the first <table> in the new markup lands on whichever
 * <table> is first. The instance that node carried would go on governing it with the OTHER table's
 * view: measured, B showed 0 of 4 under A's search. So a node whose `data-table-id` (or `aria-label`,
 * without one) is no longer the one it was enhanced as is dropped and enhanced again, as itself.
 */
const identityOf = (table) => table.getAttribute("data-table-id") || table.getAttribute("aria-label") || "";

function retire(inst) {
  inst.retired = true;
  inst.observer?.disconnect();
  inst.chrome.disconnect();
  clearTimeout(inst.countTimer);
  instances.delete(inst.table);
  if (inst.count) countOwners.delete(inst.count);
  // The node may come back elsewhere (a page that detaches a table and inserts it later): it comes back
  // with the view the reader left it in, not only what was saved — a table without an id saves nothing.
  // The engine's box goes below, and a reader typing in it would be left on <body>: where its caret was goes
  // with the view, for the box drawn when the node comes back — until the reader does anything at all. A
  // click on nothing also leaves focus on <body>, and a box that took focus after it would turn the next
  // Space into a query.
  const box = inst.searchField && document.activeElement === inst.searchBox ? inst.searchBox : null;
  const entry = { identity: inst.identity, view: inst.view, bar: inst.bar, caret: box && [box.selectionStart, box.selectionEnd] };
  carried.set(inst.table, entry);
  if (entry.caret) {
    const done = new AbortController();
    const drop = () => { entry.caret = null; done.abort(); };
    for (const type of ["pointerdown", "keydown", "focusin"]) document.addEventListener(type, drop, { capture: true, signal: done.signal });
  }
  // Gone, not renewed in place: the count this file made would go on standing where the table was.
  if (!inst.table.isConnected && madeCounts.has(inst.count)) inst.count.remove();
  /*
   * THE ROWS GO BACK FIRST. A filter DETACHES what it withholds, so the body holds only what this
   * instance chose to show — and the next instance reads the body as the whole table. Measured: an
   * `aria-label` going from "runs (8)" to "runs (9)" over a search for "L1" re-enhanced one row and
   * lost seven. So unless a patch has already rewritten the body (then the renderer supplied the rows,
   * and the ones held here are not resurrected), every row goes back in the order it was read, and the
   * placeholder goes, before anything reads the body again.
   */
  const body = inst.table.tBodies[0];
  const untouched = !!body && sameRows(body, inst.lastWritten);
  if (inst.placeholder && inst.placeholder.hasAttribute(PLACEHOLDER)) inst.placeholder.remove();
  if (untouched) {
    const frag = document.createDocumentFragment();
    for (const row of inst.allRows) {
      frag.appendChild(row);
      for (const child of inst.childrenOf.get(row) || []) frag.appendChild(child);
    }
    body.appendChild(frag);
  }
  // What is still unmistakably its own goes with it; a node a patch already rewrote is the page's now.
  if (inst.searchField && inst.searchField.contains(inst.searchBox)) inst.searchField.remove();
  if (inst.ownBar && !inst.ownBar.childElementCount) inst.ownBar.remove();
  for (const col of inst.columns) {
    if (col.tools && col.tools.classList.contains("tbl-tools")) col.tools.remove();
    if (col.badge && col.badge.classList.contains("tbl-badge")) col.badge.remove();
    col.th.classList.remove("is-filtered");
  }
}

/*
 * TWO TABLES, ONE IDENTITY. The guard above can only tell tables apart by what they are called: two
 * engine tables with the same `data-table-id` (or the same `aria-label`, or neither) in a mount a
 * renderer patches by position can still trade nodes unseen. Said once per identity, so a page that
 * re-renders does not fill the console.
 */
const warnedIdentities = new Set();
function warnShared(inst) {
  if (warnedIdentities.has(inst.identity)) return;
  for (const other of document.querySelectorAll("table[data-table-tools]")) {
    if (other === inst.table || !instances.has(other) || identityOf(other) !== inst.identity) continue;
    warnedIdentities.add(inst.identity);
    console.warn(`initTableTools: two tables are both "${inst.identity || "(no data-table-id or aria-label)"}". ` +
      "Give each a distinct data-table-id: a renderer that patches by position can hand one table's node the other's markup.");
    return;
  }
}

/*
 * FOCUS SURVIVES A PATCH. A renderer that writes the header (or the bar) back removes what this file
 * put there, and a focused node that is removed drops focus to <body> — the same node goes back a
 * moment later, unfocused, and the next Tab starts from the top of the page. So focus inside what this
 * file owns is remembered, and given back when that node is connected again and nothing else took it.
 * A focus the reader moved away on purpose is forgotten, so this never pulls focus back.
 */
function watchFocus(inst, root) {
  root.addEventListener("focusin", (event) => { inst.lastFocus = event.target; });
  root.addEventListener("focusout", (event) => {
    const node = event.target;
    queueMicrotask(() => { if (inst.lastFocus === node && node.isConnected && document.activeElement !== node) inst.lastFocus = null; });
  });
}
function restoreFocus(inst) {
  if (inst.lastFocus && focusLost()) giveFocusBack(inst.lastFocus);
}
const focusLost = () => !document.activeElement || document.activeElement === document.body;

/*
 * FOCUS GOES BACK ONCE THE MOVES HAVE LANDED (0.62.4). focus() lays the page out, and in the middle of a
 * move that layout is of a page that is half moved: a table's bar already at its new place, its count or
 * pager still at the old one. Scroll anchoring (Chromium, Firefox) takes the focused box as its anchor in
 * that state and holds it there when the rest lands — measured, a bar under a mount the count had not
 * left yet carried the 0.6rem block gap, and the page scrolled 10px when the count went. So focus is given
 * back in a microtask: after this observer batch, the pager's moves included, and before anything paints.
 * Only to a node still in the document, and only while focus is on <body> — what else took it keeps it.
 */
function giveFocusBack(node, caret) {
  queueMicrotask(() => {
    if (!node.isConnected || !focusLost()) return;
    node.focus({ preventScroll: true });
    if (caret) node.setSelectionRange(...caret);
  });
}

/*
 * A BAR THE ENGINE MOVES KEEPS ITS FOCUS (0.62.4). Moving a node takes it out of the document first, and a
 * focused node taken out drops focus to <body>. watchFocus() covers the engine's own box; a page's bar holds
 * the page's box and its action, which nothing here watches. So focus inside is read before the move and
 * given back after it — a text box keeps its caret, which the element holds — and focus outside is left alone.
 */
function keepingFocus(node, move) {
  const held = node.contains(document.activeElement) ? document.activeElement : null;
  move();
  if (held && document.activeElement !== held) giveFocusBack(held);
}

/* true when the node is no longer this instance's table — it has been handed to a fresh one. */
function renewed(inst) {
  if (inst.retired) return true;
  if (identityOf(inst.table) === inst.identity) return false;
  retire(inst);
  enhance(inst.table);
  return true;
}

function enhance(table) {
  if (instances.has(table)) return;
  const columns = columnsOf(table);
  if (!columns.length) return;
  const body = table.tBodies[0];
  if (!body) return;

  const inst = {
    table, columns,
    identity: identityOf(table),
    id: table.getAttribute("data-table-id") || "",
    allRows: [],
    childrenOf: new Map(),
    lastWritten: [],
    defaultSortKey: table.getAttribute("data-sort-key") || columns[0].key,
    defaultDir: table.getAttribute("data-sort-dir") === "desc" ? -1 : 1,
    // Opt OUT of restoring a remembered sort. Default is to remember, so every existing table
    // behaves exactly as before; a table whose subject is time says so with the attribute.
    sortSticky: table.getAttribute("data-sort-sticky") !== "off",
  };
  instances.set(table, inst);
  const kept = carried.get(table);
  carried.delete(table);
  const same = kept && kept.identity === inst.identity;
  inst.view = same ? kept.view : restore(inst);
  inst.carriedBar = same ? kept.bar : null;
  inst.carriedCaret = same ? kept.caret : null;
  warnShared(inst);
  watchFocus(inst, table);

  const anchor = table.closest(".tablewrap") || table;

  /*
   * `data-table-search="off"` — for a page whose OWN search is richer than this
   * one can be: one that asks its server, say, over records the table does not
   * hold. A box that only sees the rows in the body would silently stop finding
   * what the page's search finds. Two search boxes over one table is worse than
   * either.
   *
   * The per-column filters, the sort and the view bar are unaffected — this
   * turns off the built-in box only, and the bar then never claims a search.
   */
  const wantsSearch = table.getAttribute("data-table-search") !== "off";

  inst.wantsSearch = wantsSearch;
  if (!wantsSearch) inst.view.search = "";       // a restored search with no box is invisible in force
  inst.label = table.getAttribute("aria-label") || textOf(table.caption);
  // A page bar with no name of its own is named after the table: a page with three tables would
  // otherwise offer three identical landmarks.
  const bar = pageBarOf(anchor);
  if (bar && inst.label && !bar.hasAttribute("aria-label")) bar.setAttribute("aria-label", "search " + inst.label);
  inst.countText = "";
  inst.chrome = new MutationObserver((records) => {
    if (renewed(inst)) return;
    if (inst.table.isConnected) { ensureChrome(inst); return; }
    /*
     * GONE, AND NOT PUT BACK (a move lands before this runs: observers deliver after the script that
     * moved it). The mount outlives the table, and this observer on the mount held the instance, its
     * header controls and its rows for the life of the tab — measured, +13,800 nodes, +1,100
     * listeners and +200 observers over 50 innerHTML repaints. So it is retired. A mount repainted
     * WHOLESALE (innerHTML, replaceChildren) takes the bar and the table out in ONE record: that is
     * the page drawing a new table, not a patcher rebuilding this one, and it is not warned.
     */
    const anchor = inst.table.closest(".tablewrap") || inst.table;
    const wholesale = records.some((r) => [...r.removedNodes].includes(anchor) && [...r.removedNodes].includes(inst.ownBar));
    if (inst.ownBar && inst.ownBarParent && !inst.ownBar.isConnected && !wholesale) ownBarLost(inst);
    retire(inst);
  });
  ensureChrome(inst);

  // snapshot() builds the header controls itself when they are absent, and it
  // must run FIRST: a `pick` column's option list is derived from the rows, so
  // building the controls against an empty set yields a dropdown offering only
  // "(any)".
  snapshot(inst);
  for (const col of inst.columns) {
    if (col.filterInput) setSearchValue(col.filterInput, inst.view.filters[col.key] || "");
  }
  applyTableView(table);

  /*
   * WATCHING THE TABLE, NOT THE TBODY — a renderer is entitled to replace the
   * tbody node rather than fill it, and an observer bound to the old one would
   * be left watching a detached element. Same reasoning as pagination.js.
   *
   * The guard is an IDENTITY CHECK against the row order we last wrote, not a
   * flag. applyTableView() moves every row, so without a guard this re-enters
   * forever — and a synchronous flag cannot close it, because MutationObserver
   * delivers asynchronously and the flag is already cleared by then. Measured:
   * the first version hung the page.
   */
  inst.observer = new MutationObserver((records) => {
    if (renewed(inst)) return;
    const body = table.tBodies[0];
    if (!body) return;
    const moved = !sameRows(body, inst.lastWritten);

    /*
     * A PATCHING RENDERER REWRITES A ROW WITHOUT MOVING IT, and neither the identity
     * check above nor a childList-only observer can see that.
     *
     * cockpit re-renders by patching: it diffs new markup against the live DOM and
     * writes only the differences, which is what keeps focus, scroll and open panels.
     * With no key on a row it matches BY POSITION — so on a table the reader has
     * sorted, a poll rewrites row 1's cells with row 1's data in the RENDERER's
     * order. Every node is the same node, in the same place, holding somebody else's
     * values. The rows then sit in the caller's order while paintHeader keeps the
     * arrow pointing at the reader's column: the table lying about itself rather
     * than merely resetting.
     *
     * MEASURED, because the obvious diagnosis was wrong. Watching a real patch land
     * on a sorted table: 18 records, every one of them `attributes` on a <td> or
     * `characterData` on a text node, and NOT ONE childList. A patch never adds or
     * removes a node when the row count matches — it edits values in place. So the
     * observer was not returning early on its guard; it was never being called at
     * all, because it only watched childList.
     *
     * Hence characterData and attributes below, and the discriminator here is the
     * mutation TARGET. Everything this component does to the body is a childList
     * change on the body ITSELF (appendChild of a fragment, row.remove()), and every
     * header repaint targets the thead — so a record whose target is inside the body
     * but is not the body is, by construction, somebody else's write. That is what
     * keeps this from re-entering on its own output.
     *
     * BUT NOT EVERY OTHER WRITER IS A RENDERER. Until 0.62.3 a rewrite was answered
     * with snapshot() reading the set from the BODY — which holds only what the filter
     * let through, so every row it withheld was dropped from the set for good. Since
     * then a body no row has moved in is read from the rows held here (see snapshot()),
     * and the list below saves only the work. The pager writes `hidden` on the rows it pages, a tooltip
     * writes `aria-describedby` on the cell it describes, a copy button its
     * `data-state`: none of them changes a value, and each of them took the withheld
     * rows with it. Found on cockpit /links; measured in check-tabletools: a pick
     * filter set back to "all" on a paged 65-row table showed the 22 it had filtered
     * to, because the pager had re-windowed the filtered set in between.
     *
     * So an attribute record counts only when it names an attribute this file READS
     * from a row or a cell — ROW_READS, a finite list owned here, not a list of other
     * writers, which would never be complete. Skipping anything else loses nothing:
     * no matter what it is set to, applyTableView() would compute the same view. A
     * renderer that rewrites a row's text or a `data-value` is still seen, by the
     * characterData, childList or attribute record that write makes.
     *
     * A RELATIVE TIME RELABELLING ITSELF is the one text write treated the same way.
     * Inside a `[data-ago]` element the only writer is the one keeping "3 minutes ago"
     * true — time.js's initRelativeTimes() and cockpit's stamp.js share the hook, every
     * 30 s — and it relabels a time the row already showed; answering it dropped the
     * withheld rows as surely as the pager did. A renderer's rewrite of a row touches
     * other cells or attributes and is still seen through them. The cost, accepted: a
     * search can match a relative label up to 30 s stale until something else re-applies.
     */
    const relabel = (node) => !!(node.nodeType === 1 ? node : node.parentElement)?.closest("[data-ago]");
    const rewritten = !moved && records.some((rec) =>
      rec.target !== body && body.contains(rec.target) &&
      (rec.type === "attributes" ? ROW_READS.has(rec.attributeName) : !relabel(rec.target)));

    // A renderer that declares how many rows it wrote, and it is not the number held, rewrote the set. Read
    // only in the batch that WRITES it: answered on every callback, a count that was wrong, or went stale when
    // the page later removed a row, read the body on the next filter keystroke and dropped every withheld row.
    // An unchanged value written again (cockpit's paint() writes it on every paint) matches and reads nothing.
    const stale = records.some((rec) => rec.target === table && rec.attributeName === "data-table-rows") && declaredOtherwise(inst);
    if (moved || rewritten || stale) {
      snapshot(inst, stale);
      applyTableView(table);
      restoreFocus(inst);
      return;
    }
    // THE HEADER, patched: `aria-sort`, `.is-filtered`, the controls, the badge and `aria-checked`
    // are this file's, and a renderer writing the header's markup back removes all of them. Put
    // back what is missing; every write is conditional, so answering our own writes ends here.
    const head = table.tHead;
    if (records.some((rec) => (head && head.contains(rec.target)) ||
        (rec.target === table && [...rec.addedNodes, ...rec.removedNodes].some((n) => n.nodeName === "THEAD")))) {
      const fresh = columnsOf(table);
      if (fresh.some((col, i) => !inst.columns[i] || inst.columns[i].th !== col.th)) snapshot(inst);
      else buildHeaderControls(inst);
      paintHeader(inst);
      paintHeaderBadges(inst);
      restoreFocus(inst);
    }
  });
  /*
   * characterData and attributes are NOT optional here — see the callback. A patching
   * renderer emits nothing else when it rewrites a row in place, so a childList-only
   * observer sleeps through the one event that loses the reader's sort. The extra
   * volume is header repaints and cell edits, both bounded by the table's own size,
   * and the callback's work is one `some()` over the batch.
   */
  inst.observer.observe(table, { childList: true, subtree: true, characterData: true, attributes: true });
}

/**
 * Put a table back to the view it ships with — default sort, no filters, no search.
 *
 * For a page that owns a CLEAR ALL of its own. cockpit's container list has one, next to its
 * host and tag chips, and those are page-level filters this component knows nothing about. With
 * no way to reach the column filters, that button would clear three of the four things in force
 * and leave the fourth — a control that lies about what it did.
 *
 * This is NOT the reset button removed in 0.33.0. That one was the component putting its own
 * affordance on every table; this is a page that already has one asking to be included.
 *
 * @param {HTMLTableElement} table
 */
export function resetTableView(table) {
  const inst = instances.get(table);
  if (!inst) return;
  // RE-READ THE ROWS FROM THE PAGE ONLY IF IT ACTUALLY REDREW THEM. A page with its own clear-all
  // typically re-renders as part of it, so the rows held from the last apply can be detached nodes
  // by the time this is called. Appending those on top of the ones the page just drew DUPLICATES
  // the table: cockpit's container list went from 27 rows to 54 on a single click of "clear all".
  // Without a re-render the body is this component's own filtered output, and reading it as the
  // full set would make "put the table back" the one action that destroys it. snapshot() tells the
  // two apart by `lastWritten`, as the MutationObserver does.
  snapshot(inst);
  inst.view = defaults(inst);
  if (inst.searchInput) setSearchValue(inst.searchInput, "");
  for (const col of inst.columns) if (col.filterInput) setSearchValue(col.filterInput, "");
  save(inst);
  applyTableView(table);
}

/**
 * Give every `<table data-table-tools>` a search box, per-column sort and filter
 * controls in its header, and a badge naming the value on each filtering column.
 * `data-table-id` is optional here and keys the remembered view.
 *
 * Markup contract: `<th data-col="key">` on each column that participates.
 * Optional: `data-filter="pick"` for a value list instead of a text box,
 * `data-sort-type="num"`, `data-col-label`, and `data-value` on a `<td>` to sort
 * by something other than what it prints.
 *
 * @param {ParentNode} [root=document]
 */
let watching = false;

export function initTableTools(root = document) {
  // The search boxes built here are `.search-field`s, and a clear button that
  // does nothing because the page never called initSearchFields() would be a
  // control that lies. So the table asks for it itself; the call is idempotent.
  initSearchFields(root);
  for (const table of root.querySelectorAll("table[data-table-tools]")) enhance(table);
  // A table rendered LATER is enhanced when it arrives, as select.js does for a <select>: a page
  // that builds its tables after a fetch calls this once, at startup, like every other init.
  if (watching) return;
  watching = true;
  // Capture, because the summary usually sits in a `.tablewrap` that scrolls on its own and a scroll
  // there does not bubble. A panel scrolling its own list moves nothing and is skipped.
  // A summary scrolled out of its wrapper leaves the panel floating beside nothing: the reader scrolled
  // away, so it closes — and focus stays where it is, since nothing was asked of it.
  const follow = (event) => {
    for (const wrap of document.querySelectorAll("details.tbl-filter[open]")) {
      if (event.type === "scroll" && event.target instanceof Node && wrap.querySelector(":scope > .dropdown-panel")?.contains(event.target)) continue;
      const clip = wrap.closest(".tablewrap");
      const summary = wrap.querySelector(":scope > summary");
      if (clip && summary) {
        const s = summary.getBoundingClientRect(), c = clip.getBoundingClientRect();
        if (s.right <= c.left || s.left >= c.right || s.bottom <= c.top || s.top >= c.bottom) {
          // Focus inside the panel would be stranded in a closed <details>: it goes to the summary.
          const held = wrap.querySelector(":scope > .dropdown-panel")?.contains(document.activeElement);
          wrap.open = false;
          if (held) summary.focus({ preventScroll: true });
          continue;
        }
      }
      placePanel(wrap);
    }
  };
  addEventListener("resize", follow);
  addEventListener("scroll", follow, true);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("table[data-table-tools]")) enhance(node);
        for (const table of node.querySelectorAll("table[data-table-tools]")) enhance(table);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
