/*
 * pagination.js — a long table shows 20 rows at a time, and the rest are still THERE.
 *
 * Markup contract:
 *   <table data-table-id="docs-scopes">
 *
 * One attribute — unlike `initTableScroll()` and `initSelects()`, whose contract is
 * nothing at all. The difference is deliberate and it is explained under "IDENTITY"
 * below: a remembered page size has to be remembered AGAINST something, and every
 * scheme for guessing that something is wrong the first time a table moves.
 *
 * ── THE ORDER IS FILTER, THEN SORT, THEN SLICE, AND THAT IS THE WHOLE FEATURE ──────
 *
 * The natural wrong implementation of paging is to cut the data to twenty rows and
 * then wire the sort and the filter to what is on screen. It looks right on page 1
 * and it is a table that lies: sorting by "newest" reorders twenty arbitrary rows
 * while the actual newest row sits on page 3, and filtering finds nothing because the
 * match was never in the slice being searched.
 *
 * THIS COMPONENT CANNOT MAKE THAT MISTAKE, because it cannot sort and it cannot
 * filter. It has no idea what a row means. It reads the `<tbody>` that is already in
 * the document — whatever produced those rows has already filtered and already sorted
 * the FULL dataset, because that is the only way rows get into a tbody — and hides
 * all but one window of them. Slicing last is not a rule anyone here has to remember;
 * it is the only thing this code is able to do. A page keeps its own sort and filter
 * and needs no edit to gain paging (cockpit's `cockpitTable` engine is the worked
 * example: `visibleRows()` filters and sorts `rows`, the full array, exactly as it did
 * before this existed).
 *
 * ── HIDING, NOT REMOVING ──────────────────────────────────────────────────────────
 *
 * Turning the page sets the `hidden` attribute on the rows that are off-window and
 * clears it on the twenty that are not. No markup is rebuilt, nothing is re-parsed and
 * no `innerHTML` is written — which matters here beyond speed: cockpit patches its
 * tables in place (`cockpit/pages/dom-patch.js`) precisely so a background refresh does
 * not destroy half-typed input, focus, or an opened <details>. A pager that re-rendered
 * the table on every page change would hand all of that back.
 *
 * ── IDENTITY: `data-table-id`, OR PAGINATION DOES NOT ENGAGE ──────────────────────
 *
 * The size the reader picks is remembered per table in localStorage, so the key has to
 * name a table. Deriving one from the page path plus the table's index on the page is
 * the obvious move and it is a bug with a delay on it: add a table above another one
 * and every reader's "100 per page" silently becomes some other table's setting, with
 * no error and nothing to notice. So the id is REQUIRED and never guessed.
 *
 * A table without one is left alone entirely — it keeps every row, which is what it did
 * before this ran, so a reader is never shown a broken or half-paged table. The warning
 * is aimed at the one person who can fix it and fires only when the omission actually
 * costs something: a table long enough to have been paged. Short reference tables (the
 * estate has around forty of them — four machines, three agents) are silent, because
 * "you forgot an id" on a table that would never have paged anyway is noise that
 * teaches people to ignore the console.
 */

import { initSelects } from "./select.js";

/** The sizes offered in the picker. 20 is the default; the rest are the reader's call. */
export const PAGE_SIZES = [5, 10, 20, 50, 100, 200];
export const DEFAULT_PAGE_SIZE = 20;

const STORE_PREFIX = "table-rows:";
const enhanced = new WeakMap();
// The instance a bar belongs to, so a bar taken out from beside a table still in the document is put back.
const owners = new WeakMap();
let documentObserver = null;

/* ── the pure core ────────────────────────────────────────────────────────────────
 * Three functions with no DOM in them, because they hold every decision worth being
 * wrong about — which window of rows, what to do with a stored value that is junk, and
 * which rows that window actually hides. `scripts/check-pagination.mjs` tests these
 * directly, so the assertions are about the shipped logic rather than about a copy of
 * it written into a harness.
 */

/**
 * The window of row indices a page covers.
 *
 * `page` is CLAMPED rather than rejected, and that is the behaviour a live table needs:
 * rows arrive and leave under a reader who is on page 4 (a filter narrows the set, a 30s
 * poll returns fewer rows), and the answer to "page 4 of 2" is page 2, not an error and
 * not an empty screen. Clamping rather than resetting to 1 is equally deliberate — a
 * background refresh must not yank the reader back to the top of a table they are part
 * way through.
 *
 * @param {number} total Rows in the full, already-filtered, already-sorted set.
 * @param {number} size Rows per page.
 * @param {number} page 1-based page number, possibly out of range.
 * @returns {{page:number,pageCount:number,from:number,to:number}} `from`/`to` are a
 *   half-open index range into the full set.
 */
export function pageWindow(total, size, page) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const from = (current - 1) * size;
  return { page: current, pageCount, from, to: Math.min(from + size, total) };
}

/**
 * A stored page size, or the default.
 *
 * Everything that is not one of the offered sizes becomes 20: `null` (never set),
 * `"abc"` (junk), `999` (a size this build no longer offers), `""`, an object. The
 * store is shared with every other tab, every older build of the page and anyone with a
 * devtools console, so "it can only contain what we wrote" is not true of it.
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizePageSize(raw) {
  const size = Number(raw);
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE;
}

/**
 * Show the rows inside `[from, to)` and hide the rest.
 *
 * Writes are checked first so an unchanged row is not touched at all. That keeps the
 * function idempotent at the DOM level — no mutation record, so the observer watching
 * these very rows cannot be woken by this function's own work and cannot loop.
 *
 * @param {ArrayLike<{hidden:boolean}>} rows The full set, in display order.
 */
export function applyPageWindow(rows, from, to) {
  for (let i = 0; i < rows.length; i += 1) {
    const off = i < from || i >= to;
    if (rows[i].hidden !== off) rows[i].hidden = off;
  }
}

/* ── storage ──────────────────────────────────────────────────────────────────────
 * Both wrapped: Safari in private mode THROWS on localStorage access rather than
 * returning null, and a table that will not render because a preference could not be
 * read is a worse table than one that always starts at 20. Same shape as the theme
 * read every page in the estate does pre-paint.
 */
const storedSize = (id) => {
  try {
    return normalizePageSize(localStorage.getItem(STORE_PREFIX + id));
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
};
const storeSize = (id, size) => {
  try {
    localStorage.setItem(STORE_PREFIX + id, String(size));
  } catch {
    /* nothing to do and nothing to say — the size still applies for this visit */
  }
};

/* ── the component ────────────────────────────────────────────────────────────────*/

/*
 * The rows this pager owns: the first tbody's direct rows, minus any the renderer
 * marked `data-table-placeholder`. That opt-out exists because an engine's
 * "Nothing matches these filters." row is a full-width message wearing a <tr>, and
 * counting it would report "1 of 1" for an empty table and give it a page.
 */
function dataRows(table) {
  const body = table.tBodies[0];
  if (!body) return [];
  const rows = [];
  for (const row of body.rows) if (!row.hasAttribute("data-table-placeholder")) rows.push(row);
  return rows;
}

/*
 * Built ONCE per table and then only updated — the status text and the two
 * aria-disabled flags. Rebuilding it per page change would destroy and re-create the <select>, which
 * initSelects() has enhanced: the reader would lose the open list mid-click and the
 * focus with it.
 *
 * The picker is a plain <select> with no class and no wrapper, which is the entire
 * markup contract of the estate's dropdown — initSelects() finds it here exactly as it
 * finds one written by hand, including the ones this creates long after page load.
 * Hand-rolling a second picker beside the system's is how five copies of `.cfg-sel`
 * happened.
 *
 * The label WRAPS the select and carries no aria-label: initSelects() names the trigger
 * with the label's own words, "rows", and the trigger's text is its value, "20" — "rows,
 * combobox, 20", the way a native select is announced.
 */
function buildBar(instance) {
  const bar = document.createElement("div");
  bar.className = "table-pager";

  const status = document.createElement("p");
  status.className = "table-pager-status";
  // role="status" is aria-live="polite" with a sensible default: turning the page
  // changes nothing a screen reader would otherwise be told about, because the rows
  // themselves are not focused.
  status.setAttribute("role", "status");

  const label = document.createElement("label");
  label.className = "table-pager-size";
  label.append("rows ");
  const select = document.createElement("select");
  for (const size of PAGE_SIZES) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = String(size);
    if (size === instance.size) option.selected = true;
    select.appendChild(option);
  }
  label.appendChild(select);

  const nav = document.createElement("div");
  nav.className = "table-pager-nav";
  const button = (text) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "btn-terminal btn-terminal--ghost btn-terminal--compact";
    element.textContent = text;
    return element;
  };
  const previous = button("← prev");
  const next = button("next →");
  nav.append(previous, next);

  bar.append(status, label, nav);

  previous.addEventListener("click", () => {
    if (off(previous)) return;
    instance.page -= 1;
    render(instance);
  });
  next.addEventListener("click", () => {
    if (off(next)) return;
    instance.page += 1;
    render(instance);
  });
  select.addEventListener("change", () => {
    instance.size = normalizePageSize(select.value);
    storeSize(instance.id, instance.size);
    // Back to the top: after "show me 200" the reader is asking to see the set, and
    // landing on page 4 of a re-cut table is disorienting in a way clamping is not.
    instance.page = 1;
    render(instance);
  });

  // What holds focus in the bar, for rehome() below. A blur the reader chose (the node is still in
  // the document and something else, or nothing, has focus) forgets it; a removal does not.
  bar.addEventListener("focusin", (event) => { instance.lastFocus = event.target; });
  bar.addEventListener("focusout", (event) => {
    const node = event.target;
    queueMicrotask(() => {
      if (instance.lastFocus === node && node.isConnected && document.activeElement !== node) instance.lastFocus = null;
    });
  });

  Object.assign(instance, { bar, status, select, previous, next });
  return bar;
}

function render(instance) {
  const rows = dataRows(instance.table);
  const total = rows.length;
  const window_ = pageWindow(total, instance.size, instance.page);
  instance.page = window_.page;
  applyPageWindow(rows, window_.from, window_.to);

  /*
   * WHEN THE BAR IS THERE AT ALL. A control that can never do anything is noise, and
   * most of the estate's tables are short reference tables — four machines, three
   * agents. So: only when there is more than one page of rows to look at.
   *
   * The second clause is what stops that rule from being a trap. Pick 100 on a 30-row
   * table and the first clause alone would remove the very control that was just used,
   * with no way back to 20. While a non-default size is in force the bar stays.
   */
  const useful = total > instance.size || instance.size !== DEFAULT_PAGE_SIZE;
  instance.bar.hidden = !useful;
  if (!useful) return;

  instance.status.textContent = total ? `${window_.from + 1}–${window_.to} of ${total}` : "no rows";
  turnOff(instance.previous, window_.page <= 1);
  turnOff(instance.next, window_.page >= window_.pageCount);
}

/*
 * OFF IS `aria-disabled`, NEVER `disabled` (the X5 rule). Enter on "next" that reaches the last page
 * disables the very button that holds focus, and a `disabled` button throws focus to <body>: the
 * next Tab started from the top of the page. `aria-disabled` keeps it focusable, says it is off, and
 * the click handlers above ignore it.
 */
const off = (button) => button.getAttribute("aria-disabled") === "true";
function turnOff(button, on) {
  if (on && !off(button)) button.setAttribute("aria-disabled", "true");
  else if (!on && button.hasAttribute("aria-disabled")) button.removeAttribute("aria-disabled");
}

/*
 * A MOVED TABLE TAKES ITS PAGER WITH IT, and a removed one takes it out. The instance is the table
 * node's, so a page that appends the table (or its wrapper) somewhere else keeps its page and its size;
 * the bar is put back directly after the wrapper wherever that is now. A table taken out of the
 * document leaves no bar standing where it was, and gets it back if it is inserted again.
 *
 * A BAR TAKEN FROM A TABLE THAT STAYED comes back too (0.62.3). The bar is in no renderer's markup, so a
 * patcher that re-renders the table's whole mount (cockpit's `cockpitPatch` over cockpitTable's shell —
 * bar, wrapper, count) matches the count's markup against the bar, puts a fresh count in its place and
 * the pager was gone for good, its rows still paged with no way to turn the page. The same node goes
 * back, so the page, the size and the picker stay.
 *
 * AND THE FOCUS IN IT (0.62.4). A focused node taken out of the document drops focus to <body>, so a
 * reader on "next →" whose table was re-rendered by a poll found the next Tab starting from the top of
 * the page. The same node goes back, so the same control takes focus again, on the same page, without
 * scrolling. Only when focus was in the bar when it left and nothing has taken it since: a reader who
 * focused something else is never pulled back. A pager the patch left with one page is hidden and can
 * hold no focus; focus then stays where the browser put it.
 */
function rehome(instance) {
  const anchor = instance.table.closest(".tablewrap") || instance.table;
  if (!instance.table.isConnected || anchor.nextElementSibling === instance.bar) return;
  anchor.after(instance.bar);
  const node = instance.lastFocus;
  const lost = !document.activeElement || document.activeElement === document.body;
  if (!node || !lost || !instance.bar.contains(node)) return;
  node.focus({ preventScroll: true });
  if (document.activeElement !== node) instance.lastFocus = null;
}

function enhance(table) {
  const known = enhanced.get(table);
  if (known) {
    rehome(known);
    return;
  }

  const id = table.dataset.tableId;
  if (!id) {
    // Only worth saying when the omission cost something — see IDENTITY above.
    if (dataRows(table).length > DEFAULT_PAGE_SIZE) {
      console.warn(
        "[design] this table is long enough to paginate but has no data-table-id, so it is showing every row. " +
          "Add a stable data-table-id to page it and remember the reader's rows-per-page.",
        table,
      );
    }
    return;
  }

  const instance = { table, id, size: storedSize(id), page: 1 };
  enhanced.set(table, instance);
  buildBar(instance);
  owners.set(instance.bar, instance);

  // After the scroll wrapper, never inside it: `.tablewrap` scrolls horizontally, and a
  // pager parked in there slides out of reach on exactly the wide tables that need it.
  // `closest` because initTableScroll may not have run yet — and if it runs later it
  // wraps the <table> alone, so the bar stays put either way.
  const anchor = table.closest(".tablewrap") || table;
  anchor.after(instance.bar);

  /*
   * Rows change under us constantly: a filter keystroke, a 30s poll, a sort. childList
   * catches a re-render; the `hidden` attributeFilter catches an in-place patcher that
   * has stripped our own attribute off a row it kept (cockpit's dom-patch.js removes
   * any attribute the incoming markup lacks — correct in general, and this is the
   * exception, so it also exempts `hidden` on a <tr>). applyPageWindow() writes only
   * real changes, so this observer cannot be woken by its own output.
   *
   * WATCHING THE TABLE, NOT THE TBODY, and the difference is not caution. A renderer is
   * entitled to REPLACE the tbody rather than fill it — `tbody.outerHTML = …` is how
   * cockpit's docs page still repaints, and it swaps in a new node. An observer bound to
   * the old tbody would be left watching a detached element: the first paint would be
   * paged and every one after it silently unpaged. The table element survives that, and
   * `dataRows()` re-reads `tBodies[0]` on every render, so a swapped body is simply the
   * body now.
   */
  instance.observer = new MutationObserver(() => render(instance));
  instance.observer.observe(table, { childList: true, attributes: true, attributeFilter: ["hidden"], subtree: true });
  render(instance);
}

/**
 * Page every `<table data-table-id>` to 20 rows, and keep doing so for tables rendered
 * later.
 *
 * Filtering and sorting are none of this function's business and stay with whatever
 * already owns them — it slices the rows it finds, which are by definition the whole
 * set after that work has happened.
 *
 * @param {ParentNode} [root=document] Where to look for the initial pass.
 */
export function initTablePagination(root = document) {
  // The `rows` picker is a <select> this module creates, so this module enhances it: every dropdown
  // list is the system's list, and a pager whose list opened in the operating system's menu because
  // its page never called initSelects() was the one exception. Idempotent, and its observer covers
  // every pager built later.
  initSelects();
  for (const table of root.querySelectorAll("table")) enhance(table);

  if (documentObserver) return;
  // Same reasoning as initSelects(): cockpit rebuilds whole panels out of innerHTML on
  // a poll, so a pager that only enhanced what existed at load would work until the
  // first refresh and then quietly stop.
  const tablesIn = (node) => (node.tagName === "TABLE" ? [node] : node.querySelectorAll("table"));
  documentObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        const owner = owners.get(node);
        if (owner) rehome(owner);
        for (const table of tablesIn(node)) if (!table.isConnected) enhanced.get(table)?.bar.remove();
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        for (const table of tablesIn(node)) enhance(table);
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
