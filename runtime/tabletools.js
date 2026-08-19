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

/* Sort value: `data-value` wins so a column can sort by something it does not
   print (an ISO date under a friendly one, cents under a formatted amount). */
const cellValue = (row, index) => {
  const cell = row.cells[index];
  if (!cell) return "";
  const explicit = cell.getAttribute("data-value");
  return explicit === null ? textOf(cell) : explicit.trim();
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
      label: th.getAttribute("data-col-label") || textOf(th),
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

  const all = inst.allRows.slice();
  const keep = [], drop = [];
  for (const row of all) (matches(inst, row) ? keep : drop).push(row);

  const col = inst.columns.find((c) => c.key === inst.view.sortKey);
  if (col) {
    keep.sort((a, b) => compare(cellValue(a, col.index), cellValue(b, col.index), col.type, inst.view.dir));
  }

  // Written in one pass so the pager's observer wakes once, not per row.
  const frag = document.createDocumentFragment();
  for (const row of keep) frag.appendChild(row);
  for (const row of drop) if (row.parentNode) row.parentNode.removeChild(row);
  body.appendChild(frag);

  paintHeader(inst);
  paintBar(inst);
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

function paintBar(inst) {
  const view = inst.view, bar = inst.bar;
  const chips = [];
  const chip = (text, title) => {
    const s = document.createElement("span");
    s.className = "tbl-view-chip";
    s.textContent = text;
    if (title) s.title = title;
    return s;
  };
  const active = activeFilters(inst, view);
  for (const col of inst.columns) {
    const value = active[col.key];
    if (!value) continue;
    const exact = col.filter === "pick";
    chips.push(chip(col.label + (exact ? " = " : " ~ ") + value,
      exact ? `${col.label} is exactly “${value}”` : `${col.label} contains “${value}”`));
  }
  if (view.search) chips.push(chip("search ~ " + view.search, `any column contains “${view.search}”`));
  if (view.sortKey !== inst.defaultSortKey || view.dir !== inst.defaultDir) {
    const col = inst.columns.find((c) => c.key === view.sortKey);
    if (col) chips.push(chip(`sorted by ${col.label} ${view.dir === 1 ? "▲" : "▼"}`,
      `sorted by ${col.label}, ${view.dir === 1 ? "ascending" : "descending"}`));
  }

  bar.textContent = "";
  if (!chips.length) { bar.hidden = true; return; }
  const lead = document.createElement("span");
  lead.className = "tbl-view-lead";
  lead.title = "This table remembers its filters and its sort in this browser. Reset view puts it back to the order and the rows it ships with.";
  lead.textContent = "saved view";
  bar.appendChild(lead);
  for (const c of chips) bar.appendChild(c);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn-terminal btn-terminal--ghost btn-terminal--compact";
  reset.setAttribute("data-view-reset", "");
  reset.textContent = "reset view";
  bar.appendChild(reset);
  bar.hidden = false;
}

function buildHeaderControls(inst) {
  for (const col of inst.columns) {
    const tools = document.createElement("span");
    tools.className = "tbl-tools";

    const sort = document.createElement("button");
    sort.type = "button";
    sort.className = "tbl-sort";
    sort.setAttribute("data-tip", "sort by " + col.label);
    sort.setAttribute("aria-label", "sort by " + col.label);
    sort.textContent = "↕";
    sort.addEventListener("click", () => {
      if (inst.view.sortKey === col.key) inst.view.dir = inst.view.dir === 1 ? -1 : 1;
      else { inst.view.sortKey = col.key; inst.view.dir = 1; }
      save(inst); applyTableView(inst.table);
    });
    col.sortBtn = sort;
    tools.appendChild(sort);

    const wrap = document.createElement("details");
    wrap.className = "dropdown tbl-filter";
    const summary = document.createElement("summary");
    summary.setAttribute("data-tip", "filter " + col.label);
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

function enhance(table) {
  if (instances.has(table)) return;
  const columns = columnsOf(table);
  if (!columns.length) return;
  const body = table.tBodies[0];
  if (!body) return;

  const inst = {
    table, columns,
    id: table.getAttribute("data-table-id") || "",
    allRows: [...body.rows],
    defaultSortKey: table.getAttribute("data-sort-key") || columns[0].key,
    defaultDir: table.getAttribute("data-sort-dir") === "desc" ? -1 : 1,
  };
  instances.set(table, inst);
  inst.view = restore(inst);

  // Before the scroll wrapper, never inside it — `.tablewrap` scrolls sideways,
  // and a search box in there slides out of reach on exactly the wide tables
  // that need one. Same reasoning as the pager's anchor, opposite side.
  const anchor = table.closest(".tablewrap") || table;

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
  toolbar.appendChild(search);
  inst.searchInput = search;

  const bar = document.createElement("div");
  bar.className = "tbl-view";
  bar.hidden = true;
  bar.addEventListener("click", (event) => {
    if (!event.target.closest("[data-view-reset]")) return;
    inst.view = defaults(inst);
    if (inst.searchInput) inst.searchInput.value = "";
    for (const col of inst.columns) if (col.filterInput) col.filterInput.value = "";
    save(inst); applyTableView(table);
  });
  inst.bar = bar;

  anchor.before(toolbar);
  anchor.before(bar);

  buildHeaderControls(inst);
  for (const col of inst.columns) {
    if (col.filterInput) col.filterInput.value = inst.view.filters[col.key] || "";
  }
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
