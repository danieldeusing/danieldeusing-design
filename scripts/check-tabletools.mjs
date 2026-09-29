#!/usr/bin/env node
/*
 * check-tabletools.mjs — a remembered view is untrusted input, and reset must reach the controls.
 *
 * WHERE THESE CAME FROM. Until 3bad5d6 cockpit carried its own saved-view layer (`table-view.js`)
 * and `bin/cockpit-render-check` asserted it in seven cases. That layer moved here — the component
 * owns the sort, the per-column filters and the memory now — and the cases went with it, except
 * they went nowhere: they were deleted and never landed on this side, so for several releases the
 * behaviour had no test in either repo. This is that port.
 *
 * Not all of it, on purpose. Three of the seven are obsolete rather than homeless:
 *   · the saved-view BAR ("it says the view is a remembered one", "it offers the way out") was
 *     removed deliberately in 0.33.0 — Daniel's objection was that it is a second place to look
 *     and prints "relationship = family" a long way from the relationship column. A filtering
 *     column now marks itself (`th.is-filtered` + `.tbl-badge`), which is asserted here instead.
 *   · "every cockpitTable copy remembers the same way" counted four copies of an engine that is
 *     now one file, and checked a `/table-view.js` route that no longer exists.
 *   · the paging cases are check-pagination.mjs, which already covers them properly.
 *
 * WHAT IS ACTUALLY AT RISK. `localStorage` is shared with every other tab, every older build of
 * the page and anyone with a devtools console, so a stored view is untrusted input — and it names
 * COLUMNS, which get renamed. `normalize()` guards that, and the guard is invisible when it works:
 * without it an unrecognised sortKey is not a wrong order, it is `col.sortValue` on undefined —
 * a stack trace where every reader with a saved view used to have a table.
 *
 * A REAL BROWSER, and no dependency. The subject is localStorage, live `.value` properties (a
 * reset that writes the attribute leaves the box still showing what it filtered by) and a
 * MutationObserver — a stub DOM would be asserting that the stub behaves. It runs on the shared
 * scripts/lib/chromium.mjs (0.60.0): each check is a thunk, so one that throws is a FAIL and not an
 * aborted suite, and the browser's profile is removed when it closes.
 *
 * D2 (0.60.0) adds the engine cockpit's table had grown: a search over `data-search-text`, the
 * page's own filter bar, a count that is silent at rest, two different placeholder sentences, a
 * pick menu of menuitemradios, glyphs that are masks rather than text, tables that arrive later,
 * and a header that keeps what the engine wrote in it when a renderer patches it.
 *
 * If no browser is on the machine it SKIPS loudly rather than failing: a missing browser is not a
 * broken design system, and a check that goes red for its own reasons is the trap this estate
 * keeps re-learning.
 *
 *   node scripts/check-tabletools.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, reporter, requireBrowser, serve, sleep } from "./lib/chromium.mjs";

// DD_REQUIRE_BROWSER=1 makes a missing browser a FAILURE: this suite gates the npm release, and a
// silent skip would publish a runtime nothing had exercised.
requireBrowser("check-tabletools", "This asserts localStorage, live .value properties and a MutationObserver, none of which a stub can prove.");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = reporter("check-tabletools");

/*
 * The SHIPPED modules, served straight off the filesystem, so the fixture cannot drift from the
 * thing being asserted. A `data:` URL has an opaque origin and no localStorage, so this is a
 * loopback HTTP server — the store is the subject here, not incidental to it.
 */
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="mount"></div>
<div id="later"></div>
<script type="module">
import { initTableTools, applyTableView, resetTableView } from "/runtime/tabletools.js";
import { initTablePagination } from "/runtime/pagination.js";
window.initTableTools = initTableTools;
window.applyTableView = applyTableView;
window.resetTableView = resetTableView;
window.initTablePagination = initTablePagination;

// One table, rebuilt from scratch per case: instances are keyed by the table ELEMENT, so a fresh
// element is the only honest way to ask "what happens on the next page load".
window.build = (opts = {}) => {
  const cols = opts.cols || ["name", "team", "score"];
  const rows = opts.rows || [
    ["ada", "core", "30"], ["linus", "core", "10"], ["grace", "ops", "20"],
  ];
  document.getElementById("mount").innerHTML = window.lastSource = (opts.before || "") +
    '<table data-table-tools data-table-id="' + (opts.id || "probe") + '" data-sort-key="' +
    (opts.sortKey || "name") + '"' + (opts.attrs || "") + '><thead><tr>' +
    cols.map((c) => '<th data-col="' + c + '"' + (c === "team" ? ' data-filter="pick"' : "") +
      (c === "score" ? ' data-sort-type="num"' : "") + ">" + c + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows.map((r, i) => "<tr" + (opts.pin && opts.pin(r, i) ? " data-pin" : "") +
      (opts.searchText ? ' data-search-text="' + opts.searchText(r, i) + '"' : "") + ">" +
      r.map((v) => "<td>" + v + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>" + (opts.after || "");
  const table = document.querySelector("#mount table[data-table-tools]");
  if (opts.paged) window.initTablePagination(document.getElementById("mount"));
  window.initTableTools(document.getElementById("mount"));
  return table;
};
// The rows a reader sees — never the placeholder, which is the engine's stand-in for none.
window.order = () => [...document.querySelectorAll("#mount tbody tr:not([data-table-placeholder])")]
  .filter((tr) => !tr.hidden).map((tr) => tr.cells[0].textContent);
window.placeholder = () => document.querySelector("#mount tbody tr[data-table-placeholder]");
window.stored = (id) => localStorage.getItem("table-view:" + (id || "probe"));
// A "text" column filters through the search box (a .search-field) inside its header dropdown;
// a "pick" column has no input at all, only a menu of rows built from the column's own cells.
// Driving the real controls is the point — a test that set inst.view directly would prove the
// component can filter and say nothing about whether a reader can reach it.
window.colInput = (key) =>
  document.querySelector('#mount th[data-col="' + key + '"] .search-field > input[type="search"]');
window.searchBox = () => document.querySelector("#mount search.filter-bar > .search-field > input[type='search']");
window.setFilter = (key, text) => {
  const input = window.colInput(key);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
window.pick = (key, label) => {
  const items = [...document.querySelectorAll('#mount th[data-col="' + key + '"] .dropdown-item')];
  const hit = items.find((b) => b.textContent === label);
  if (!hit) throw new Error("no option " + label + " offered on " + key);
  hit.click();
};
window.setSearch = (text) => {
  const box = window.searchBox();
  box.value = text;
  box.dispatchEvent(new Event("input", { bubbles: true }));
};
// The table's own chrome: the boxes in its bar (never a column's), the count, and what is shown.
window.chromeState = () => {
  const bar = document.querySelector("#mount search.filter-bar");
  const boxes = bar ? [...bar.querySelectorAll('input[type="search"]')] : [];
  const counts = [...document.querySelectorAll("#mount p.result-count[role=status]")];
  return { bars: document.querySelectorAll("#mount search.filter-bar").length, boxes: boxes.length,
    first: !!boxes[0] && bar.firstElementChild.contains(boxes[0]), value: boxes[0] ? boxes[0].value : null,
    counts: counts.length, count: counts[0] ? counts[0].textContent : null,
    countAfterTable: !!counts[0] && [counts[0].previousElementSibling, counts[0].previousElementSibling?.matches(".table-pager") ? counts[0].previousElementSibling.previousElementSibling : null].includes(document.querySelector("#mount table")), rows: window.order().join() };
};
window.sortBy = (key) => document.querySelector('#mount th[data-col="' + key + '"] .tbl-sort').click();
window.ready = true;
<\/script></body></html>`;

// A real origin, because localStorage is the subject.
const server = await serve(root, { "/__tabletools.html": HARNESS });
const browser = await launch("tabletools");
const { evaluate, until, navigate, send } = browser;
await navigate(`${server.origin}/__tabletools.html`);
await until("window.ready === true", "the harness module to load");

/* ── the store ────────────────────────────────────────────────────────────── */

await evaluate("localStorage.clear(); window.build(); null");
await check("an untouched table stores nothing — 'no key' and 'nothing in force' stay one fact", async () => ((await evaluate("window.stored()")) === null));

await evaluate('localStorage.clear(); window.build(); window.setFilter("name", "ada"); null');
const filterOnly = JSON.parse((await evaluate("window.stored()")) || "null");
await check("a filter ALONE reaches the store, with no sort click to carry it", async () => (Boolean(filterOnly) && filterOnly.filters && filterOnly.filters.name === "ada"), JSON.stringify(filterOnly));

await evaluate('localStorage.clear(); window.build(); window.pick("team", "ops"); null');
const pickOnly = JSON.parse((await evaluate("window.stored()")) || "null");
await check("...and so does a pick column, which has no input to type into", async () => (Boolean(pickOnly) && pickOnly.filters && pickOnly.filters.team === "ops"), JSON.stringify(pickOnly));

await evaluate('localStorage.clear(); window.build(); window.sortBy("score"); null');
const sortOnly = JSON.parse((await evaluate("window.stored()")) || "null");
await check("a sort ALONE reaches the store, with no filter to carry it", async () => (Boolean(sortOnly) && sortOnly.sortKey === "score"), JSON.stringify(sortOnly));

/* ── it comes back ────────────────────────────────────────────────────────── */

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "score", dir: -1, filters: { team: "core" }, search: "" }));
  window.build(); null`);
await check("the filter came back", async () => ((await evaluate("window.order()")).join(",") === "ada,linus"));
await check("...and so did the sort, not just the filter", async () => ((await evaluate("window.order()"))[0] === "ada"), "score descending puts ada (30) above linus (10)");
await check("a filtering column marks itself, which is what replaced the saved-view bar in 0.33.0", async () => (await evaluate('!!document.querySelector(\'#mount th[data-col="team"].is-filtered\')')));

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "name", dir: 1, filters: { name: "a" }, search: "" }));
  window.build(); null`);
await check("a restored TEXT filter is visible in the box that is doing it", async () => ((await evaluate('window.colInput("name").value')) === "a"), "otherwise the rows are filtered and the control looks untouched");

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "name", dir: 1, filters: {}, search: "gra" }));
  window.build(); null`);
await check("a restored SEARCH is visible in the box that is doing it", async () => ((await evaluate("window.searchBox().value")) === "gra"));
await check("...and it is actually in force", async () => ((await evaluate("window.order()")).join(",") === "grace"));

/* ── a stored view cannot outlive its columns ─────────────────────────────── */

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "gone", dir: -1, filters: { team: "ops", alsogone: "x" }, search: "" }));
  window.build(); null`);
await check("a sort on a column that no longer exists does not take the table down", async () => (await evaluate("!!document.querySelector('#mount table')")));
await check("...it falls back to the order the table ships with", async () => ((await evaluate("window.order()")).join(",") === "grace"), "team=ops still applies, leaving grace");
await check("...and the filter on a column that DOES still exist is kept", async () => (await evaluate('!!document.querySelector(\'#mount th[data-col="team"].is-filtered\')')));
// The stale key must not survive the next WRITE. Nothing rewrites the store on load — that would
// be the component editing a preference the reader never touched — so the assertion is about what
// it saves once they do touch it.
await evaluate('window.sortBy("name"); null');
await check("...while the filter on a column that does not is dropped, not carried into the next write", async () => (!String(await evaluate("window.stored()")).includes("alsogone")), async () => (String(await evaluate("window.stored()"))));

for (const junk of ['"not an object"', '"[1,2,3]"', '"{oops"', '""']) {
  await evaluate(`
    localStorage.clear(); localStorage.setItem("table-view:probe", ${junk});
    window.build(); null`);
  await check(`junk in the store (${junk}) is the default view, not an error`, async () => ((await evaluate("window.order()")).join(",") === "ada,grace,linus"));
}

/* ── the rename, which is the case that decides whether this can ship ─────── */

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "started", dir: -1, filters: { date: "2026" }, search: "" }));
  window.build({ cols: ["name", "when", "score"] }); null`);
await check("a view saved under the OLD column names does not take the table down", async () => (await evaluate("!!document.querySelector('#mount table')")));
await check("...it falls back to the order the table ships with", async () => ((await evaluate("window.order()")).join(",") === "ada,grace,linus"));
await check("...and claims no filter on a key that no longer exists", async () => (await evaluate('!document.querySelector("#mount th.is-filtered")')));

/* ── reset reaches the CONTROLS, not just the rows ────────────────────────── */

await evaluate(`
  localStorage.clear(); window.build();
  window.setFilter("name", "gra"); window.setSearch("gr"); null`);
await check("precondition: the table is filtered down", async () => ((await evaluate("window.order()")).join(",") === "grace"));
await evaluate("window.resetTableView(document.querySelector('#mount table')); null");
const afterReset = await evaluate("window.order()");
await check("reset brings every row back, in the table's own order", async () => (afterReset.join(",") === "ada,grace,linus"), `actual: ${JSON.stringify(afterReset)}`);
await check("...and the control that was SET is cleared by its PROPERTY, which the attribute cannot do", async () => ((await evaluate('window.colInput("name").value')) === ""));
await check("...and the search box with it", async () => ((await evaluate("window.searchBox().value")) === ""));
await check("...and the memory of the view is gone, not merely emptied", async () => ((await evaluate("window.stored()")) === null));
await check("...and no column still claims to be filtering", async () => (await evaluate('!document.querySelector("#mount th.is-filtered")')));

/* ── ...and the opposite failure, which is the one the snapshot was added for ── */

await evaluate(`
  localStorage.clear(); window.build();
  window.setFilter("name", "gra");
  // The page redraws its rows from its own data, exactly as cockpit's clear-all does before it
  // asks the component to join in. The rows the component is holding are detached nodes now.
  document.querySelector("#mount tbody").innerHTML =
    [["ada","core","30"],["linus","core","10"],["grace","ops","20"]]
      .map((r) => "<tr>" + r.map((v) => "<td>" + v + "</td>").join("") + "</tr>").join("");
  null`);
await evaluate("window.resetTableView(document.querySelector('#mount table')); null");
const afterRedraw = await evaluate("window.order()");
await check("a page that REDREW its rows before resetting does not get the stale ones appended too", async () => (afterRedraw.length === 3), `cockpit's container list went 27 -> 54 this way; actual: ${JSON.stringify(afterRedraw)}`);
await check("...and the rows it shows are the page's own, not a mix of both", async () => (afterRedraw.slice().sort().join(",") === "ada,grace,linus"), JSON.stringify(afterRedraw));

/* ── a pinned row outranks the sort (0.42.0) ──────────────────────────────── */

await evaluate('localStorage.clear(); window.build({ pin: (r) => r[0] === "linus" }); null');
await check("a pinned row sits at the top of the table's own order", async () => ((await evaluate("window.order()"))[0] === "linus"));
await evaluate('window.sortBy("score"); null');
await check("...and stays there when the reader sorts by another column", async () => ((await evaluate("window.order()"))[0] === "linus"));
await evaluate('window.sortBy("score"); null');
await check("...and when they reverse it, which luck cannot survive", async () => ((await evaluate("window.order()"))[0] === "linus"), "score descending puts ada (30) first unless the pin outranks the comparator");
await check("...while the rows that are NOT pinned are still ordered by the column", async () => ((await evaluate("window.order()")).slice(1).join(",") === "ada,grace"));

/* ── the search boxes are the system's `.search-field` (0.60.0) ───────────── */
// The bespoke `.tbl-search` / `.tbl-filter-input` boxes are gone: the table's search sits in a
// `<search class="filter-bar">` as a `.search-field`, and so does each text column's filter. The
// clear buttons and Escape come from search.js, which initTableTools() installs itself.

await evaluate("localStorage.clear(); window.build(); null");
await check("the search above the table is a .search-field in a <search class=\"filter-bar\">", async () => (await evaluate("!!document.querySelector('#mount search.filter-bar > .search-field > input[type=search] + button.search-clear')")));
await check("...and nothing still renders the removed classes", async () => (await evaluate("!document.querySelector('#mount .tbl-toolbar, #mount .tbl-search, #mount .tbl-filter-input')")));
await check("a text column's filter box is a .search-field too, its clear named after the column", async () => ((await evaluate('window.colInput("name").nextElementSibling.getAttribute("aria-label")')) === "clear the name filter"));
await check("an empty box offers no clear", async () => (await evaluate("window.searchBox().nextElementSibling.hidden === true")));

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "name", dir: 1, filters: { name: "a" }, search: "gra" }));
  window.build(); null`);
await check("a RESTORED search shows its clear — a value set from code fires no input for search.js", async () => (await evaluate("window.searchBox().nextElementSibling.hidden === false")));
await check("...and so does a restored column filter", async () => (await evaluate('window.colInput("name").nextElementSibling.hidden === false')));
await evaluate("window.searchBox().nextElementSibling.click(); null");
await check("the clear empties the box", async () => ((await evaluate("window.searchBox().value")) === ""));
await check("...and takes the search OUT OF FORCE, leaving the column filter that is still set", async () => ((await evaluate("window.order()")).join(",") === "ada,grace"), async () => (JSON.stringify(await evaluate("window.order()"))));
await check("...and the stored view forgets the search", async () => (!(JSON.parse((await evaluate("window.stored()")) || "{}").search)));
await evaluate(`window.setSearch("ada");
  window.searchBox().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  null`);
await check("Escape in the filled table search clears it too", async () => ((await evaluate("window.searchBox().value")) === "" && (await evaluate("window.order()")).join(",") === "ada,grace"));
await evaluate("window.resetTableView(document.querySelector('#mount table')); null");
await check("reset hides every clear button it emptied", async () => (await evaluate("[...document.querySelectorAll('#mount .search-clear')].every((b) => b.hidden)")));

/* ── D2 (0.60.0) · the haystack: a row is found by what it does not print ───────────────────────
   cockpit searched review ids and job ids that no column shows, with a second box beside the
   table's. `data-search-text` on the row is matched with its text. */

await evaluate(`localStorage.clear();
  window.build({ searchText: (r) => ({ ada: "review 4417 job j-88", linus: "review 12", grace: "" })[r[0]] }); null`);
await evaluate('window.setSearch("j-88"); null');
await check("D2 — the search matches a row's data-search-text, which no cell prints", async () =>
  (await evaluate("window.order()")).join(",") === "ada", async () => JSON.stringify(await evaluate("window.order()")));
await evaluate('window.setSearch("review"); null');
await check("...and its text as before: \"review\" finds the two rows that carry it, not the one that does not", async () =>
  (await evaluate("window.order()")).join(",") === "ada,linus", async () => JSON.stringify(await evaluate("window.order()")));

/* ── the page's own bar, with its one action ────────────────────────────────────────────────────── */

await evaluate(`localStorage.clear(); window.build({ before:
  '<search class="filter-bar" data-table-bar aria-label="runs"><span class="filter-bar-spacer"></span><button type="button" id="new-run">new run</button></search>' }); null`);
await check("D2 — a <search class=\"filter-bar\" data-table-bar> before the table is USED: the search goes first in it, its spacer and action stay", async () =>
  evaluate(`(() => { const bars = document.querySelectorAll("#mount search.filter-bar");
    const kids = [...bars[0].children].map((c) => c.className || c.id);
    return bars.length === 1 && kids.join() === "search-field,filter-bar-spacer,new-run" && bars[0].getAttribute("aria-label") === "runs"; })()`),
  async () => evaluate(`JSON.stringify([...document.querySelectorAll("#mount search")].map((b) => [...b.children].map((c) => c.className || c.id)))`));

/* ── the count: silent at rest, settled, after the pager ────────────────────────────────────────── */

await evaluate("localStorage.clear(); window.build(); null");
const countAt = () => evaluate(`(() => { const c = document.querySelector("#mount p.result-count[role=status]"); return c ? c.textContent : null; })()`);
await sleep(500);
await check("D2 — the count is a role=status region that is THERE from the start — and silent at rest (the pager states the total)", async () =>
  (await countAt()) === "", async () => JSON.stringify(await countAt()));
await evaluate('window.setFilter("name", "a"); null');
const early = await countAt();
await sleep(500);
await check("...it says nothing while the input is still moving (400 ms after the last apply), then the settled result", async () =>
  early === "" && (await countAt()) === "2 of 3 rows — 1 hidden by the filters", async () => JSON.stringify([early, await countAt()]));
await evaluate(`localStorage.clear(); window.build({ attrs: ' data-table-unit="runs"' }); window.setFilter("name", "gr"); null`);
await sleep(500);
await check("...in the table's own unit (data-table-unit)", async () => (await countAt()) === "1 of 3 runs — 2 hidden by the filters",
  async () => JSON.stringify(await countAt()));
await evaluate(`localStorage.clear(); window.build({ paged: true, id: "paged",
  rows: Array.from({ length: 25 }, (_, i) => ["row" + String(i).padStart(2, "0"), i % 2 ? "core" : "ops", String(i)]) }); null`);
await check("...and it sits after the table and after the pager — the order a reader meets them in", async () =>
  evaluate(`(() => { const t = document.querySelector("#mount table"); const a = t.nextElementSibling, b = a && a.nextElementSibling;
    return !!a && a.classList.contains("table-pager") && !!b && b.matches("p.result-count[role=status]"); })()`),
  async () => evaluate(`JSON.stringify([...document.getElementById("mount").children].map((e) => e.tagName + "." + e.className))`));

/* ── two nothings: two sentences ────────────────────────────────────────────────────────────────── */

await evaluate("localStorage.clear(); window.build({ rows: [] }); null");
await check("D2 — no rows at all: one placeholder row across every column saying \"no rows yet\", with no reset (there is nothing to reset)", async () =>
  evaluate(`(() => { const p = window.placeholder(); return !!p && p.cells.length === 1 && p.cells[0].colSpan === 3 &&
    p.getAttribute("data-table-placeholder") === "empty" && p.textContent.trim() === "no rows yet" && !p.querySelector("button") &&
    !!p.querySelector(".empty.empty--inline"); })()`),
  async () => evaluate(`window.placeholder() ? window.placeholder().outerHTML : "no placeholder"`));
await evaluate(`localStorage.clear(); window.build({ rows: [], attrs: ' data-table-empty="no runs have been recorded"' }); null`);
await check("...or the table's own data-table-empty sentence", async () =>
  evaluate(`window.placeholder() && window.placeholder().textContent.trim() === "no runs have been recorded"`));
await evaluate(`localStorage.clear(); window.build({ attrs: ' data-table-unit="runs"' }); window.setFilter("name", "zzz"); null`);
await check("D2 — rows, but none match: \"no runs match these filters.\" and a reset that is a real button", async () =>
  evaluate(`(() => { const p = window.placeholder(); const b = p && p.querySelector("button.doc-link.doc-link--forward");
    return !!p && p.getAttribute("data-table-placeholder") === "no-match" && p.querySelector(".empty--inline").textContent.startsWith("no runs match these filters.") &&
      !!b && b.type === "button" && b.textContent === "reset filters"; })()`),
  async () => evaluate(`window.placeholder() ? window.placeholder().outerHTML : "no placeholder"`));
await check("...in S1's documented inline markup: the sentence is the box's own text and the reset follows it, no <p> between (feedback.html)", async () =>
  evaluate(`(() => { const box = window.placeholder()?.querySelector(".empty.empty--inline");
    return !!box && !box.querySelector("p") && box.firstChild.nodeType === 3 && box.firstChild.nodeValue === "no runs match these filters. " &&
      box.lastElementChild === box.querySelector("button.doc-link") && box.childNodes.length === 2; })()`),
  async () => evaluate(`window.placeholder()?.querySelector(".empty")?.outerHTML || "no placeholder"`));
await check("...and the placeholder is not data: the rows a reader sees are none", async () => (await evaluate("window.order()")).length === 0);
await evaluate("window.placeholder()?.querySelector('button')?.click(); null");
await check("...its reset brings every row back and takes the placeholder away", async () =>
  (await evaluate("window.order()")).join(",") === "ada,grace,linus" && (await evaluate("!window.placeholder()")) &&
  (await evaluate('window.colInput("name").value')) === "");
// 50 rows a page, a size the reader chose, keeps the pager's bar up with nothing to page — so its
// status says what it counted: "no rows", or "1–1 of 1" had it taken the placeholder for data.
await evaluate(`localStorage.clear(); localStorage.setItem("table-rows:paged2", "50"); window.build({ paged: true, id: "paged2",
  rows: Array.from({ length: 25 }, (_, i) => ["row" + String(i).padStart(2, "0"), "core", String(i)]) }); window.setFilter("name", "zzz"); null`);
await sleep(100);
await check("...and the pager does not count it: with no match the pager's status says no rows", async () =>
  evaluate(`(() => { const s = document.querySelector("#mount .table-pager-status"); return !!s && !s.parentElement.hidden && s.textContent === "no rows"; })()`),
  async () => evaluate(`(document.querySelector("#mount .table-pager-status") || {}).textContent || "no pager"`));

/* ── the pick filter is a menu of menuitemradios ─────────────────────────────────────────────────── */

await evaluate("localStorage.clear(); window.build(); null");
const menu = () => evaluate(`(() => { const ul = document.querySelector('#mount th[data-col="team"] ul.dropdown-panel');
  return ul && { role: ul.getAttribute("role"), rows: [...ul.children].map((li) => {
    const b = li.firstElementChild;
    return [li.getAttribute("role"), b.tagName, b.className, b.getAttribute("role"), b.textContent, b.getAttribute("aria-checked")].join("|"); }) }; })()`);
const atRest = await menu();
await check("D2 — the pick panel is ul[role=menu] > li[role=none] > button.dropdown-item[role=menuitemradio]; \"all\" first, and checked at rest", async () =>
  atRest && atRest.role === "menu" && atRest.rows.join() ===
    "none|BUTTON|dropdown-item|menuitemradio|all|true,none|BUTTON|dropdown-item|menuitemradio|core|false,none|BUTTON|dropdown-item|menuitemradio|ops|false",
  JSON.stringify(atRest));
await evaluate('window.pick("team", "ops"); null');
const picked = await menu();
await check("...and choosing a value checks exactly that row", async () =>
  picked.rows.map((r) => r.split("|").slice(4).join("=")).join() === "all=false,core=false,ops=true", JSON.stringify(picked));

/* ── the header controls carry no text and no tip ────────────────────────────────────────────────── */

await check("D2 — the sort button and the filter summary carry no glyph TEXT (data.css draws masks) — only their names", async () =>
  evaluate(`[...document.querySelectorAll("#mount .tbl-sort, #mount .tbl-filter > summary")].every((c) =>
    c.textContent === "" && /^(sort by|filter) /.test(c.getAttribute("aria-label")))`));
await check("...and the badge has no native title: its text is the value and its name says what a press does", async () =>
  evaluate(`(() => { const b = document.querySelector("#mount .tbl-badge");
    return !!b && !b.hasAttribute("title") && b.textContent === "ops" && b.getAttribute("aria-label") === "clear the team filter"; })()`));

/* ── fix round 1 · a pick menu orders values the way a reader counts ──────────────────────────────
   gpt-5.9 before gpt-5.10: a plain localeCompare files "10" before "9". "all" stays first. */

await evaluate(`localStorage.clear(); window.build({ rows: [["a", "gpt-5.10", "1"], ["b", "gpt-5.9", "2"], ["c", "gpt-5.2", "3"], ["d", "claude", "4"]] }); null`);
const pickOrder = await evaluate(`[...document.querySelectorAll('#mount th[data-col="team"] .dropdown-item')].map((b) => b.textContent).join()`);
await check("fix round 1 — a pick menu sorts numerically: all, claude, gpt-5.2, gpt-5.9, gpt-5.10", async () =>
  pickOrder === "all,claude,gpt-5.2,gpt-5.9,gpt-5.10", pickOrder);

/* ── fix round 1 · clearing a filter by its badge leaves focus on that column ──────────────────────
   The badge is removed as it clears, so its focus fell to <body> and the next Tab started over at the
   top of the page. It goes to the column's filter summary: the control that set what was just cleared. */

await evaluate(`localStorage.clear(); window.build(); window.pick("team", "ops"); document.querySelector("#mount .tbl-badge").focus(); null`);
for (const type of ["keyDown", "keyUp"]) {
  await send("Input.dispatchKeyEvent", type === "keyDown"
    ? { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }
    : { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
}
await sleep(100);
const afterBadge = await evaluate(`JSON.stringify({ badge: !!document.querySelector("#mount .tbl-badge"), rows: window.order().join(),
  focus: document.activeElement === document.querySelector('#mount th[data-col="team"] .tbl-filter > summary') ? "team summary" : document.activeElement.tagName })`);
await check("fix round 1 — Enter on a filter's badge clears it, and focus lands on that column's filter summary, not <body>", async () =>
  afterBadge === JSON.stringify({ badge: false, rows: "ada,grace,linus", focus: "team summary" }), afterBadge);

/* ── fix round 1 · the box in the bar and the count are the engine's, and it keeps them ───────────
   A renderer that patches the MOUNT writes the bar and the wrapper back from its own markup, which has
   neither the engine's box nor its count: both went, and the search stayed in force with no box to
   show it or clear it. The engine puts back the same nodes, the box FIRST in the bar and holding the
   query, the count after the table saying what it said. Or a renderer draws them itself, and the
   engine adopts them: an input[type=search][data-table-search] in the bar, a p.result-count[role=status]
   [data-table-count] after the table. */

const BAR = '<search class="filter-bar" data-table-bar aria-label="runs"><span class="filter-bar-spacer"></span><button type="button" id="new-run">new run</button></search>';
const THEIR_BAR = '<search class="filter-bar" data-table-bar aria-label="runs"><div class="search-field"><input type="search" data-table-search aria-label="search runs"><button type="button" class="search-clear" aria-label="clear the search" hidden></button></div><span class="filter-bar-spacer"></span></search>';
const THEIR_COUNT = '<p class="result-count" role="status" data-table-count></p>';
const chromeNow = () => evaluate("JSON.stringify(window.chromeState())");
const WHOLE = JSON.stringify({ bars: 1, boxes: 1, first: true, value: "a", counts: 1, count: "2 of 3 runs — 1 hidden by the filters", countAfterTable: true, rows: "ada,grace" });

await evaluate(`localStorage.clear(); window.build({ before: ${JSON.stringify(BAR)}, attrs: ' data-table-unit="runs"' }); window.setSearch("a"); null`);
await sleep(500);
const chromeBefore = await chromeNow();
await evaluate(`window.keepBox = document.querySelector("#mount search .search-field"); window.keepCount = document.querySelector("#mount p.result-count");
  window.keepBox.remove(); window.keepCount.remove(); null`);
await sleep(100);
const chromeHand = await chromeNow();
await check("fix round 1 — the page takes the bar's box and the count away: the SAME box goes back first in the bar with the query, the SAME count after the table", async () =>
  chromeBefore === WHOLE && chromeHand === WHOLE &&
    (await evaluate(`document.querySelector("#mount search .search-field") === window.keepBox && document.querySelector("#mount p.result-count") === window.keepCount`)),
  JSON.stringify({ before: chromeBefore, after: chromeHand }));
const chromeQuiet = await evaluate(`new Promise((resolve) => { let n = 0;
  const o = new MutationObserver((r) => { n += r.length; }); o.observe(document.getElementById("mount"), { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => { o.disconnect(); resolve(n); }, 300); })`);
await check("...and it settles: nothing answers its own re-insertion", async () => chromeQuiet === 0, `${chromeQuiet} mutation record(s) in 300 ms`);

await evaluate(`localStorage.clear(); window.build({ before: ${JSON.stringify(THEIR_BAR)}, after: ${JSON.stringify(THEIR_COUNT)}, attrs: ' data-table-unit="runs"' });
  window.theirBox = document.querySelector("#mount input[data-table-search]"); window.theirCount = document.querySelector("#mount p[data-table-count]");
  window.theirBox.value = "a"; window.theirBox.dispatchEvent(new Event("input", { bubbles: true })); null`);
await sleep(500);
const adopted = await chromeNow();
await check("fix round 1 — a renderer draws the box and the count itself: the engine ADOPTS both, adding neither — the page's box searches, the page's count speaks", async () =>
  adopted === WHOLE && (await evaluate(`document.querySelector("#mount search input[type=search]") === window.theirBox && document.querySelector("#mount p.result-count") === window.theirCount`)),
  adopted);

/* ── a table that arrives later ──────────────────────────────────────────────────────────────────── */

await evaluate(`document.getElementById("later").innerHTML =
  '<div><table data-table-tools data-table-id="later" aria-label="later"><thead><tr><th data-col="a">a</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table></div>'; null`);
await sleep(100);
await check("D2 — a table rendered AFTER initTableTools() is enhanced when it arrives, with no second call", async () =>
  evaluate(`!!document.querySelector("#later th .tbl-tools .tbl-sort") && !!document.querySelector("#later search.filter-bar .search-field")`));
await evaluate(`document.getElementById("later").replaceChildren(); null`);

/* ── what the engine writes, it keeps writing ─────────────────────────────────────────────────────
   A renderer that re-renders the header from its own markup takes away everything the engine put
   there: aria-sort, .is-filtered, the controls, the badge, aria-checked on the pick rows. Done by
   the page here, with removeAttribute and remove(), so it runs from a design checkout alone; the
   real dom-patch.js follows when a danieldeusing-infra checkout sits beside this one. */

const headerState = () => evaluate(`(() => {
  const th = (k) => document.querySelector('#mount th[data-col="' + k + '"]');
  const checked = [...document.querySelectorAll('#mount th[data-col="team"] .dropdown-item')].map((b) => b.getAttribute("aria-checked"));
  return JSON.stringify({ sort: th("score").getAttribute("aria-sort"), filtered: th("team").classList.contains("is-filtered"),
    tools: [...document.querySelectorAll("#mount th")].every((t) => !!t.querySelector(".tbl-tools")),
    sameTools: th("team").querySelector(".tbl-tools") === window.keepTools,
    badge: (th("team").querySelector(".tbl-badge") || {}).textContent || "", checked: checked.join() });
})()`);
await evaluate(`localStorage.clear(); window.build(); window.sortBy("score"); window.pick("team", "ops");
  window.keepTools = document.querySelector('#mount th[data-col="team"] .tbl-tools'); null`);
await sleep(500); // the count's settled write, so the quiet window below hears the header alone
const beforePatch = await headerState();
await evaluate(`(() => {
  const th = (k) => document.querySelector('#mount th[data-col="' + k + '"]');
  for (const t of document.querySelectorAll("#mount th")) { t.removeAttribute("aria-sort"); t.classList.remove("is-filtered");
    for (const c of [...t.children]) c.remove(); }
  for (const b of document.querySelectorAll("#mount .dropdown-item")) b.removeAttribute("aria-checked");
})(); null`);
await sleep(100);
const afterHand = await headerState();
await check("D2 — the page strips the header in place (removeAttribute, remove()): aria-sort, .is-filtered, the SAME controls, the badge and aria-checked come back", async () =>
  afterHand === beforePatch && JSON.parse(afterHand).sameTools && JSON.parse(afterHand).sort === "ascending",
  JSON.stringify({ before: beforePatch, after: afterHand }));
const quiet = await evaluate(`new Promise((resolve) => { let n = 0;
  const o = new MutationObserver((r) => { n += r.length; }); o.observe(document.getElementById("mount"), { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => { o.disconnect(); resolve(n); }, 300); })`);
await check("...and it settles: no write answers another once the header is whole", async () => quiet === 0, `${quiet} mutation record(s) in 300 ms`);

/* ── fix round 2 · a table node that becomes another table is enhanced as that table ────────────────
   A positional patch can hand one table's NODE another table's markup — two engine tables in one mount,
   and the first <table> in the markup matches whichever <table> sits first. The instance that node
   carried would then govern the other table with its own view. Its identity is data-table-id, or
   aria-label without one; when that changes, the old instance is dropped and the node enhanced anew. */
const twoTables = ["A", "B"].map((t) => `<table data-table-tools data-table-id="swap-${t}" aria-label="${t}"><thead><tr><th data-col="v">v</th></tr></thead><tbody>` +
  [1, 2, 3, 4].map((i) => `<tr><td>${t.toLowerCase()}${i}</td></tr>`).join("") + "</tbody></table>");
const tablesNow = () => evaluate(`JSON.stringify([...document.querySelectorAll("#later table")].map((t) => { const bar = t.previousElementSibling;
  return [t.getAttribute("aria-label"), [...t.tBodies[0].rows].filter((r) => !r.hasAttribute("data-table-placeholder")).map((r) => r.cells[0].textContent).join(" "),
    bar && bar.matches("search") ? bar.querySelector("input").value : "no bar"]; }))`);
const searchIn = (label, text) => evaluate(`(() => { const box = document.querySelector('#later search[aria-label="search ${label}"] input');
  box.value = ${JSON.stringify(text)}; box.dispatchEvent(new Event("input", { bubbles: true })); })(); null`);

await evaluate(`localStorage.clear(); document.getElementById("later").innerHTML = ${JSON.stringify(twoTables[0])}; null`);
await sleep(100);
await searchIn("A", "a1");
await sleep(100);
await evaluate(`(() => { const t = document.querySelector("#later table"); t.setAttribute("data-table-id", "swap-B"); t.setAttribute("aria-label", "B");
  t.tBodies[0].innerHTML = ${JSON.stringify([1, 2, 3, 4].map((i) => `<tr><td>b${i}</td></tr>`).join(""))}; })(); null`);
await sleep(200);
const renamedByHand = await tablesNow();
await check("fix round 2 — the page renames a table node and gives it other rows (setAttribute): it is enhanced as the new table, with that table's own view", async () =>
  renamedByHand === JSON.stringify([["B", "b1 b2 b3 b4", ""]]), renamedByHand);
await evaluate(`document.getElementById("later").replaceChildren(); null`);

const parents = (dir) => { const out = []; while (dirname(dir) !== dir) { dir = dirname(dir); out.push(dir); } return out; };
const DOM_PATCH = [process.env.DD_COCKPIT_DOM_PATCH, ...parents(root).map((dir) => join(dir, "danieldeusing-infra", "cockpit", "pages", "dom-patch.js"))]
  .find((path) => path && existsSync(path));
if (!DOM_PATCH) {
  console.log("check-tabletools: the dom-patch section SKIPPED — no danieldeusing-infra checkout beside this one (set DD_COCKPIT_DOM_PATCH).");
  if (process.env.DD_REQUIRE_COCKPIT_DOM_PATCH === "1") {
    await check("DD_REQUIRE_COCKPIT_DOM_PATCH=1: the real dom-patch.js was found and driven", async () => false,
      "no danieldeusing-infra checkout beside this one and no DD_COCKPIT_DOM_PATCH");
  }
} else {
  await evaluate(readFileSync(DOM_PATCH, "utf8") + "; null");
  // cockpit's renderer writes the header it knows — the labels — back into the table on every poll.
  await evaluate(`localStorage.clear(); window.build(); window.sortBy("score"); window.pick("team", "ops");
    window.keepTools = document.querySelector('#mount th[data-col="team"] .tbl-tools');
    window.cockpitPatch(document.querySelector("#mount thead"), '<tr><th data-col="name">name</th><th data-col="team" data-filter="pick">team</th><th data-col="score" data-sort-type="num">score</th></tr>');
    null`);
  await sleep(100);
  const afterPatch = await headerState();
  console.log(`dom-patch: ${DOM_PATCH}`);
  await check("D2 — cockpit's cockpitPatch re-renders the header: the engine puts back what it owns, the same nodes, the view intact", async () =>
    afterPatch === beforePatch && JSON.parse(afterPatch).sameTools, JSON.stringify({ before: beforePatch, after: afterPatch }));

  // The whole MOUNT, as a cockpit load() writes it: the bar, the table and nothing after it.
  await evaluate(`localStorage.clear(); window.build({ before: ${JSON.stringify(BAR)}, attrs: ' data-table-unit="runs"' }); window.setSearch("a"); null`);
  await sleep(500);
  await evaluate(`window.keepBox = document.querySelector("#mount search .search-field"); window.keepCount = document.querySelector("#mount p.result-count");
    window.cockpitPatch(document.getElementById("mount"), window.lastSource); null`);
  await sleep(600);
  const mountPatched = await chromeNow();
  await check("fix round 1 — cockpitPatch re-renders the whole mount: the engine's box is back first in the bar with the query, its count after the table, the view intact", async () =>
    mountPatched === WHOLE &&
      (await evaluate(`document.querySelector("#mount search .search-field") === window.keepBox && document.querySelector("#mount p.result-count") === window.keepCount`)),
    mountPatched);
  await evaluate(`localStorage.clear(); window.build({ before: ${JSON.stringify(THEIR_BAR)}, after: ${JSON.stringify(THEIR_COUNT)}, attrs: ' data-table-unit="runs"' });
    window.theirBox = document.querySelector("#mount input[data-table-search]"); window.theirCount = document.querySelector("#mount p[data-table-count]");
    window.theirBox.value = "a"; window.theirBox.dispatchEvent(new Event("input", { bubbles: true })); null`);
  await sleep(500);
  await evaluate(`window.cockpitPatch(document.getElementById("mount"), window.lastSource); null`);
  await sleep(100);
  const adoptedPatched = await chromeNow();
  // Two engine tables, no bars and no ids in the markup order a patcher could key on: A's node is
  // matched against B's markup.
  await evaluate(`localStorage.clear(); document.getElementById("later").innerHTML = ${JSON.stringify(twoTables.join(""))}; null`);
  await sleep(100);
  await searchIn("A", "a1");
  await sleep(500);
  await evaluate(`window.cockpitPatch(document.getElementById("later"), ${JSON.stringify(twoTables.join(""))}); null`);
  await sleep(600);
  const swapped = await tablesNow();
  await check("fix round 2 — cockpitPatch hands A's table node B's markup: B shows its own rows under its own empty search, A keeps its view", async () =>
    swapped === JSON.stringify([["A", "a1", "a1"], ["B", "b1 b2 b3 b4", ""]]), swapped);
  await evaluate(`document.getElementById("later").replaceChildren(); null`);

  // The count is not asked to be the same node: the pager this mount carries sits between the table
  // and the page's count, so the patch matches the count's markup against the pager and draws a fresh
  // one — which is the renderer's own, and is adopted.
  await check("...and when the renderer draws them itself, its patch keeps its box (the same node, holding the query) and its count still says it", async () =>
    adoptedPatched === WHOLE && (await evaluate(`document.querySelector("#mount search input[type=search]") === window.theirBox`)),
    adoptedPatched);
}

/* ── fix round 1 · a count belongs to one table ────────────────────────────────────────────────────
   LAST, because the failure it guards is a page that never answers again: a table rendered between a
   neighbour and its count adopted that count, and the two re-asserted their own text over each other's
   in an endless run of observer callbacks. The wait is bounded here, in node, so a hang reads as a
   FAIL rather than a stalled suite. */
const answered = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve("no answer in " + ms + " ms"), ms))]);
const shared = await answered(evaluate(`(async () => {
  const later = document.getElementById("later");
  later.innerHTML = '<table data-table-tools data-table-unit="runs" aria-label="first"><thead><tr><th data-col="a">a</th></tr></thead><tbody><tr><td>x</td></tr><tr><td>y</td></tr></tbody></table>';
  await new Promise((r) => setTimeout(r, 50));
  const first = later.querySelector("table");
  first.insertAdjacentHTML("afterend", '<table data-table-tools data-table-unit="runs" aria-label="second"><thead><tr><th data-col="b">b</th></tr></thead><tbody><tr><td>p</td></tr><tr><td>q</td></tr></tbody></table>');
  await new Promise((r) => setTimeout(r, 50));
  const box = [...later.querySelectorAll("search.filter-bar")].find((b) => b.getAttribute("aria-label") === "search second").querySelector("input");
  box.value = "p"; box.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  const counts = [...later.querySelectorAll("p.result-count[role=status]")];
  return JSON.stringify({ counts: counts.map((c) => c.textContent), afterSecond: counts[0].previousElementSibling.getAttribute("aria-label") });
})()`), 5000);
await check("fix round 1 — a table drawn between a neighbour and its count makes its own count, and the two say their own things", async () =>
  shared === JSON.stringify({ counts: ["1 of 2 runs — 1 hidden by the filters", ""], afterSecond: "second" }), shared);

browser.close();
server.close();
done();
