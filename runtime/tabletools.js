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
 */

const STORE_PREFIX = "table-view:";
const instances = new WeakMap();

const textOf = (el) => (el ? (el.textContent || "").trim() : "");

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
  if (known.has(stored.sortKey)) {
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
    const hay = textOf(row).toLowerCase();
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
  const frag = document.createDocumentFragment();
  for (const row of keep) {
    frag.appendChild(row);
    for (const child of inst.childrenOf.get(row) || []) frag.appendChild(child);
  }
  for (const row of drop) {
    for (const child of inst.childrenOf.get(row) || []) child.remove();
    row.remove();
  }
  body.appendChild(frag);
  // What we just wrote, so the observer can tell OUR output from a real
  // re-render. A synchronous "applying" flag cannot: MutationObserver delivers
  // asynchronously, so the flag is already back to false when the callback
  // runs, and the observer re-enters forever. pagination.js avoids the same
  // trap by writing only real changes; this is that discipline for a reorder.
  inst.lastWritten = [...body.rows];

  paintHeader(inst);
  paintHeaderBadges(inst);

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

function paintHeader(inst) {
  for (const col of inst.columns) {
    const sorted = inst.view.sortKey === col.key;
    col.th.setAttribute("aria-sort", sorted ? (inst.view.dir === 1 ? "ascending" : "descending") : "none");
    if (col.sortBtn) col.sortBtn.textContent = sorted ? (inst.view.dir === 1 ? "▲" : "▼") : "↕";
    const on = Boolean(inst.view.filters[col.key]);
    if (col.filterWrap) col.filterWrap.classList.toggle("is-on", on);
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
    if (!badge || !badge.isConnected) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = "tbl-badge";
      badge.addEventListener("click", (event) => {
        event.stopPropagation();
        inst.view.filters[col.key] = "";
        if (col.filterInput) col.filterInput.value = "";
        save(inst); applyTableView(inst.table);
      });
      col.th.appendChild(badge);
      col.badge = badge;
    }
    const exact = col.filter === "pick";
    // The stored value is lower-cased because that is what matching needs. Showing
    // it back would print "cash" where the dropdown offered "Cash" — the badge is
    // the reader's own choice quoted back at them, so it uses their casing.
    badge.textContent = (exact && col.pickLabels && col.pickLabels.get(value))
      || (col.filterInput && col.filterInput.value.trim())
      || value;
    badge.title = (exact ? `${col.label} is exactly “${value}”` : `${col.label} contains “${value}”`)
                  + " — click to clear";
    badge.setAttribute("aria-label", `clear the ${col.label} filter`);
  }
}

function buildHeaderControls(inst) {
  for (const col of inst.columns) {
    const tools = document.createElement("span");
    tools.className = "tbl-tools";

    const sort = document.createElement("button");
    sort.type = "button";
    sort.className = "tbl-sort";
    // NO TOOLTIP ON A HEADER CONTROL (Daniel, 2026-08-21). `button[data-tip]::after` renders the ⓘ
    // marker, so every sortable column grew "↕ⓘ" and every filterable one "⌕ⓘ" — two glyphs of
    // furniture per column, on tables that can carry ten. The tip said "sort by <label>" beside a
    // sort arrow already sitting under the label it sorts, which is the definition of a tooltip
    // that repeats its own control. `aria-label` STAYS: the glyph is decoration, but a screen
    // reader still has to be told what an unlabelled ↕ button does.
    sort.setAttribute("aria-label", "sort by " + col.label);
    sort.textContent = "↕";
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
    summary.textContent = "⌕";
    wrap.appendChild(summary);

    const panel = document.createElement("div");
    panel.className = "dropdown-panel dropdown-panel--down tbl-filter-panel";

    if (col.filter === "pick") {
      // The list is built from the column's own cells, so it can never offer a
      // value the table does not contain.
      const seen = new Map();
      for (const row of inst.allRows) {
        const raw = cellValue(row, col.index);
        if (raw) seen.set(raw.toLowerCase(), raw);
      }
      col.pickLabels = seen;
      const any = document.createElement("button");
      any.type = "button"; any.className = "dropdown-item"; any.textContent = "(any)";
      any.addEventListener("click", () => {
        inst.view.filters[col.key] = ""; wrap.open = false; save(inst); applyTableView(inst.table);
      });
      panel.appendChild(any);
      for (const [lower, label] of [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "dropdown-item"; b.textContent = label;
        b.addEventListener("click", () => {
          inst.view.filters[col.key] = lower; wrap.open = false; save(inst); applyTableView(inst.table);
        });
        panel.appendChild(b);
      }
    } else {
      const input = document.createElement("input");
      input.type = "search";
      input.className = "tbl-filter-input";
      input.placeholder = col.label + " contains…";
      input.setAttribute("aria-label", "filter " + col.label);
      // cockpit learned this one the expensive way: without it a password
      // manager offers to fill every filter box on the page.
      input.setAttribute("data-1p-ignore", "");
      input.addEventListener("input", () => {
        inst.view.filters[col.key] = input.value.trim().toLowerCase();
        save(inst); applyTableView(inst.table);
      });
      col.filterInput = input;
      panel.appendChild(input);
    }

    wrap.appendChild(panel);
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
function snapshot(inst) {
  const body = inst.table.tBodies[0];
  if (!body) return;
  const rows = [...body.rows];
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
    }
    inst.columns = fresh;
    if (!inst.table.querySelector(".tbl-tools")) buildHeaderControls(inst);
    else refreshPickOptions(inst);
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
    if (col.filter !== "pick" || !col.filterWrap) continue;
    const seen = new Map();
    for (const row of inst.allRows) {
      const raw = cellValue(row, col.index);
      if (raw) seen.set(raw.toLowerCase(), raw);
    }
    col.pickLabels = seen;
    const wanted = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const panel = col.filterWrap.querySelector(".tbl-filter-panel");
    if (!panel) continue;
    const current = [...panel.querySelectorAll(".dropdown-item")].slice(1).map((b) => b.textContent);
    if (current.length === wanted.length && current.every((v, i) => v === wanted[i][1])) continue;
    for (const b of [...panel.querySelectorAll(".dropdown-item")].slice(1)) b.remove();
    for (const [lower, label] of wanted) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "dropdown-item"; b.textContent = label;
      b.addEventListener("click", () => {
        inst.view.filters[col.key] = lower;
        col.filterWrap.open = false;
        save(inst); applyTableView(inst.table);
      });
      panel.appendChild(b);
    }
  }
}

function enhance(table) {
  if (instances.has(table)) return;
  const columns = columnsOf(table);
  if (!columns.length) return;
  const body = table.tBodies[0];
  if (!body) return;

  const inst = {
    table, columns,
    id: table.getAttribute("data-table-id") || "",
    allRows: [],
    childrenOf: new Map(),
    lastWritten: [],
    defaultSortKey: table.getAttribute("data-sort-key") || columns[0].key,
    defaultDir: table.getAttribute("data-sort-dir") === "desc" ? -1 : 1,
  };
  instances.set(table, inst);
  inst.view = restore(inst);

  // Before the scroll wrapper, never inside it — `.tablewrap` scrolls sideways,
  // and a search box in there slides out of reach on exactly the wide tables
  // that need one. Same reasoning as the pager's anchor, opposite side.
  const anchor = table.closest(".tablewrap") || table;

  /*
   * `data-table-search="off"` — for a page whose OWN search is richer than this
   * one can be. The contacts book searches a haystack built from descriptions
   * and conversation summaries, none of which is in a cell; replacing it with a
   * box that only sees rendered text would silently stop finding a thing that
   * was said. Two search boxes over one table is worse than either.
   *
   * The per-column filters, the sort and the view bar are unaffected — this
   * turns off the built-in box only, and the bar then never claims a search.
   */
  const wantsSearch = table.getAttribute("data-table-search") !== "off";

  const toolbar = document.createElement("div");
  toolbar.className = "tbl-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "tbl-search";
  search.placeholder = "search this table…";
  search.setAttribute("aria-label", "search this table");
  search.setAttribute("data-1p-ignore", "");
  search.value = inst.view.search || "";
  search.addEventListener("input", () => {
    inst.view.search = search.value.trim().toLowerCase();
    save(inst); applyTableView(table);
  });
  if (wantsSearch) {
    toolbar.appendChild(search);
    inst.searchInput = search;
  } else {
    inst.view.search = "";       // a restored search with no box is invisible in force
  }


  if (wantsSearch) anchor.before(toolbar);

  // snapshot() builds the header controls itself when they are absent, and it
  // must run FIRST: a `pick` column's option list is derived from the rows, so
  // building the controls against an empty set yields a dropdown offering only
  // "(any)".
  snapshot(inst);
  for (const col of inst.columns) {
    if (col.filterInput) col.filterInput.value = inst.view.filters[col.key] || "";
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
  inst.observer = new MutationObserver(() => {
    const body = table.tBodies[0];
    if (!body) return;
    const now = body.rows;
    const last = inst.lastWritten || [];
    if (now.length === last.length && last.every((row, i) => now[i] === row)) return;
    snapshot(inst);
    applyTableView(table);
  });
  inst.observer.observe(table, { childList: true, subtree: true });
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
  // RE-READ THE ROWS, BUT ONLY IF THE PAGE ACTUALLY REDREW THEM. A page with its own clear-all
  // typically re-renders as part of it, so the rows held from the last apply can be detached nodes
  // by the time this is called. Appending those on top of the ones the page just drew DUPLICATES
  // the table: cockpit's container list went from 27 rows to 54 on a single click of "clear all".
  //
  // Snapshotting UNCONDITIONALLY has the opposite failure, and it is worse because it is silent: a
  // filter removes its non-matching rows from the DOM rather than hiding them, so a reset called
  // without a re-render adopts the component's OWN filtered output as the full set and the rows it
  // withheld are gone for good. "Put the table back" would then be the one action that destroys it.
  //
  // `lastWritten` tells them apart — it is what this component put in the body, and it is the same
  // signal the MutationObserver uses to know its own output from a real re-render.
  const body = table.tBodies[0];
  const stillOurs = body && inst.lastWritten &&
    body.rows.length === inst.lastWritten.length &&
    inst.lastWritten.every((row, i) => body.rows[i] === row);
  if (!stillOurs) snapshot(inst);
  inst.view = defaults(inst);
  if (inst.searchInput) inst.searchInput.value = "";
  for (const col of inst.columns) if (col.filterInput) col.filterInput.value = "";
  save(inst);
  applyTableView(table);
}

/**
 * Give every `<table data-table-tools>` a search box, per-column sort and filter
 * controls in its header, and a bar naming whatever is currently in force.
 *
 * Markup contract: `<th data-col="key">` on each column that participates.
 * Optional: `data-filter="pick"` for a value list instead of a text box,
 * `data-sort-type="num"`, `data-col-label`, and `data-value` on a `<td>` to sort
 * by something other than what it prints.
 *
 * @param {ParentNode} [root=document]
 */
export function initTableTools(root = document) {
  for (const table of root.querySelectorAll("table[data-table-tools]")) enhance(table);
}
