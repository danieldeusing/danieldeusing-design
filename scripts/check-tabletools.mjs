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
 * MutationObserver — a stub DOM would be asserting that the stub behaves. This drives the headless
 * chromium Playwright already caches on these machines over the DevTools protocol, with Node's own
 * fetch and WebSocket. Nothing is installed and nothing is imported.
 *
 * If no browser is on the machine it SKIPS loudly rather than failing: a missing browser is not a
 * broken design system, and a check that goes red for its own reasons is the trap this estate
 * keeps re-learning.
 *
 *   node scripts/check-tabletools.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// DD_CHROME, when set, IS the browser — a wrong path there fails loudly rather than
// falling through to a skip, which is the whole point of the DD_REQUIRE_BROWSER gate below.
const CHROME = process.env.DD_CHROME
  ? (existsSync(process.env.DD_CHROME) ? process.env.DD_CHROME : null)
  : [
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      // Linux, for CI. GitHub's ubuntu runners ship Chrome; without these the suite
      // skipped on every CI run and the release gate below proved nothing.
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ].find((path) => existsSync(path));

if (!CHROME) {
  console.log("check-tabletools: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts localStorage, live .value properties and a MutationObserver, none of");
  console.log("  which a stub can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here. This suite gates the npm");
    console.log("  release, and a silent skip would publish a runtime nothing had exercised.");
    process.exit(1);
  }
  process.exit(0);
}

const PORT = 19224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "dd-tabletools-"))}`, "about:blank",
], { stdio: "ignore" });

let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); };
process.on("exit", shutdown);

for (let i = 0; ; i += 1) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch {}
  if (i > 60) { shutdown(); throw new Error("headless chromium did not come up"); }
  await sleep(250);
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new`, { method: "PUT" })).json();
socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { socket.onopen = ok; socket.onerror = bad; });

let messageId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const slot = pending.get(message.id);
  if (!slot) return;
  pending.delete(message.id);
  message.error ? slot.bad(new Error(JSON.stringify(message.error))) : slot.ok(message.result);
};
const send = (method, params = {}) => new Promise((ok, bad) => {
  messageId += 1;
  pending.set(messageId, { ok, bad });
  socket.send(JSON.stringify({ id: messageId, method, params }));
});

await send("Runtime.enable");

/*
 * The SHIPPED module, read off the filesystem and inlined, so the fixture cannot drift from the
 * thing being asserted. A `data:` URL has an opaque origin and no localStorage, so this is served
 * over a loopback HTTP server instead — the store is the subject here, not incidental to it.
 */
const RUNTIME = readFileSync(join(root, "runtime/tabletools.js"), "utf8").replace(/^export /gm, "");
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="mount"></div>
<script type="module">
${RUNTIME}
window.initTableTools = initTableTools;
window.applyTableView = applyTableView;
window.resetTableView = resetTableView;

// One table, rebuilt from scratch per case: instances are keyed by the table ELEMENT, so a fresh
// element is the only honest way to ask "what happens on the next page load".
window.build = (opts = {}) => {
  const cols = opts.cols || ["name", "team", "score"];
  const rows = opts.rows || [
    ["ada", "core", "30"], ["linus", "core", "10"], ["grace", "ops", "20"],
  ];
  document.getElementById("mount").innerHTML =
    '<table data-table-tools data-table-id="' + (opts.id || "probe") + '" data-sort-key="' +
    (opts.sortKey || "name") + '"><thead><tr>' +
    cols.map((c) => '<th data-col="' + c + '"' + (c === "team" ? ' data-filter="pick"' : "") +
      (c === "score" ? ' data-sort-type="num"' : "") + ">" + c + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows.map((r, i) => "<tr" + (opts.pin && opts.pin(r, i) ? " data-pin" : "") + ">" +
      r.map((v) => "<td>" + v + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>";
  const table = document.querySelector("table[data-table-tools]");
  window.initTableTools(document.getElementById("mount"));
  return table;
};
window.order = () => [...document.querySelectorAll("#mount tbody tr")]
  .filter((tr) => !tr.hidden).map((tr) => tr.cells[0].textContent);
window.stored = (id) => localStorage.getItem("table-view:" + (id || "probe"));
// A "text" column filters through an <input class="tbl-filter-input"> inside its header dropdown;
// a "pick" column has no input at all, only a list of buttons built from the column's own cells.
// Driving the real controls is the point — a test that set inst.view directly would prove the
// component can filter and say nothing about whether a reader can reach it.
window.colInput = (key) => document.querySelector('#mount th[data-col="' + key + '"] .tbl-filter-input');
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
  const box = document.querySelector("#mount .tbl-search");
  box.value = text;
  box.dispatchEvent(new Event("input", { bubbles: true }));
};
window.sortBy = (key) => document.querySelector('#mount th[data-col="' + key + '"] .tbl-sort').click();
<\/script></body></html>`;

// A real origin, because localStorage is the subject.
const { createServer } = await import("node:http");
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(HARNESS);
}).listen(0);
await new Promise((ok) => server.on("listening", ok));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;
process.on("exit", () => server.close());

await send("Page.enable");
await send("Page.navigate", { url: pageUrl });
await sleep(500);

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
};

/* ── the store ────────────────────────────────────────────────────────────── */

await evaluate("localStorage.clear(); window.build(); null");
check("an untouched table stores nothing — 'no key' and 'nothing in force' stay one fact",
  (await evaluate("window.stored()")) === null);

await evaluate('localStorage.clear(); window.build(); window.setFilter("name", "ada"); null');
const filterOnly = JSON.parse((await evaluate("window.stored()")) || "null");
check("a filter ALONE reaches the store, with no sort click to carry it",
  Boolean(filterOnly) && filterOnly.filters && filterOnly.filters.name === "ada",
  JSON.stringify(filterOnly));

await evaluate('localStorage.clear(); window.build(); window.pick("team", "ops"); null');
const pickOnly = JSON.parse((await evaluate("window.stored()")) || "null");
check("...and so does a pick column, which has no input to type into",
  Boolean(pickOnly) && pickOnly.filters && pickOnly.filters.team === "ops", JSON.stringify(pickOnly));

await evaluate('localStorage.clear(); window.build(); window.sortBy("score"); null');
const sortOnly = JSON.parse((await evaluate("window.stored()")) || "null");
check("a sort ALONE reaches the store, with no filter to carry it",
  Boolean(sortOnly) && sortOnly.sortKey === "score", JSON.stringify(sortOnly));

/* ── it comes back ────────────────────────────────────────────────────────── */

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "score", dir: -1, filters: { team: "core" }, search: "" }));
  window.build(); null`);
check("the filter came back", (await evaluate("window.order()")).join(",") === "ada,linus");
check("...and so did the sort, not just the filter",
  (await evaluate("window.order()"))[0] === "ada", "score descending puts ada (30) above linus (10)");
check("a filtering column marks itself, which is what replaced the saved-view bar in 0.33.0",
  await evaluate('!!document.querySelector(\'#mount th[data-col="team"].is-filtered\')'));

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "name", dir: 1, filters: { name: "a" }, search: "" }));
  window.build(); null`);
check("a restored TEXT filter is visible in the box that is doing it",
  (await evaluate('window.colInput("name").value')) === "a",
  "otherwise the rows are filtered and the control looks untouched");

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "name", dir: 1, filters: {}, search: "gra" }));
  window.build(); null`);
check("a restored SEARCH is visible in the box that is doing it",
  (await evaluate("document.querySelector('#mount .tbl-search').value")) === "gra");
check("...and it is actually in force", (await evaluate("window.order()")).join(",") === "grace");

/* ── a stored view cannot outlive its columns ─────────────────────────────── */

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "gone", dir: -1, filters: { team: "ops", alsogone: "x" }, search: "" }));
  window.build(); null`);
check("a sort on a column that no longer exists does not take the table down",
  await evaluate("!!document.querySelector('#mount table')"));
check("...it falls back to the order the table ships with",
  (await evaluate("window.order()")).join(",") === "grace", "team=ops still applies, leaving grace");
check("...and the filter on a column that DOES still exist is kept",
  await evaluate('!!document.querySelector(\'#mount th[data-col="team"].is-filtered\')'));
// The stale key must not survive the next WRITE. Nothing rewrites the store on load — that would
// be the component editing a preference the reader never touched — so the assertion is about what
// it saves once they do touch it.
await evaluate('window.sortBy("name"); null');
check("...while the filter on a column that does not is dropped, not carried into the next write",
  !String(await evaluate("window.stored()")).includes("alsogone"),
  String(await evaluate("window.stored()")));

for (const junk of ['"not an object"', '"[1,2,3]"', '"{oops"', '""']) {
  await evaluate(`
    localStorage.clear(); localStorage.setItem("table-view:probe", ${junk});
    window.build(); null`);
  check(`junk in the store (${junk}) is the default view, not an error`,
    (await evaluate("window.order()")).join(",") === "ada,grace,linus");
}

/* ── the rename, which is the case that decides whether this can ship ─────── */

await evaluate(`
  localStorage.clear();
  localStorage.setItem("table-view:probe", JSON.stringify(
    { sortKey: "started", dir: -1, filters: { date: "2026" }, search: "" }));
  window.build({ cols: ["name", "when", "score"] }); null`);
check("a view saved under the OLD column names does not take the table down",
  await evaluate("!!document.querySelector('#mount table')"));
check("...it falls back to the order the table ships with",
  (await evaluate("window.order()")).join(",") === "ada,grace,linus");
check("...and claims no filter on a key that no longer exists",
  await evaluate('!document.querySelector("#mount th.is-filtered")'));

/* ── reset reaches the CONTROLS, not just the rows ────────────────────────── */

await evaluate(`
  localStorage.clear(); window.build();
  window.setFilter("name", "gra"); window.setSearch("gr"); null`);
check("precondition: the table is filtered down",
  (await evaluate("window.order()")).join(",") === "grace");
await evaluate("window.resetTableView(document.querySelector('#mount table')); null");
const afterReset = await evaluate("window.order()");
check("reset brings every row back, in the table's own order",
  afterReset.join(",") === "ada,grace,linus", `actual: ${JSON.stringify(afterReset)}`);
check("...and the control that was SET is cleared by its PROPERTY, which the attribute cannot do",
  (await evaluate('window.colInput("name").value')) === "");
check("...and the search box with it",
  (await evaluate("document.querySelector('#mount .tbl-search').value")) === "");
check("...and the memory of the view is gone, not merely emptied",
  (await evaluate("window.stored()")) === null);
check("...and no column still claims to be filtering",
  await evaluate('!document.querySelector("#mount th.is-filtered")'));

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
check("a page that REDREW its rows before resetting does not get the stale ones appended too",
  afterRedraw.length === 3, `cockpit's container list went 27 -> 54 this way; actual: ${JSON.stringify(afterRedraw)}`);
check("...and the rows it shows are the page's own, not a mix of both",
  afterRedraw.slice().sort().join(",") === "ada,grace,linus", JSON.stringify(afterRedraw));

/* ── a pinned row outranks the sort (0.42.0) ──────────────────────────────── */

await evaluate('localStorage.clear(); window.build({ pin: (r) => r[0] === "linus" }); null');
check("a pinned row sits at the top of the table's own order",
  (await evaluate("window.order()"))[0] === "linus");
await evaluate('window.sortBy("score"); null');
check("...and stays there when the reader sorts by another column",
  (await evaluate("window.order()"))[0] === "linus");
await evaluate('window.sortBy("score"); null');
check("...and when they reverse it, which luck cannot survive",
  (await evaluate("window.order()"))[0] === "linus",
  "score descending puts ada (30) first unless the pin outranks the comparator");
check("...while the rows that are NOT pinned are still ordered by the column",
  (await evaluate("window.order()")).slice(1).join(",") === "ada,grace");

console.log(failures
  ? `\ncheck-tabletools: ${failures} FAILED`
  : "\ncheck-tabletools: all checks passed");
process.exit(failures ? 1 : 0);
