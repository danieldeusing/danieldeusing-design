#!/usr/bin/env node
/*
 * check-filters.mjs — the filter package, in a real browser: where a popup goes (popup.js), the
 * filter dropdown (select.js), the search field (search.js), the sort control (sort.js), the
 * boxes filters.css draws around them, and the demo page's own wiring.
 *
 * WHAT IS AT RISK, and why each half is here:
 *
 *   · "The list is never the OS list" (Daniel, 2026-09-28). The claim is about what a reader's
 *     POINTER and KEYBOARD reach, so it is asserted with dispatched input — a press at the
 *     trigger's pixel, Alt+ArrowDown on the trigger — not with element.click(), which proves only
 *     that a handler exists. A select rendered after the call, one still carrying the removed
 *     `data-select="off"`, and one MOVED out of its wrapper are asserted too: those are the ways a
 *     page ends up back on the system list.
 *   · The filter dropdown's promises from seedr and configr: the trigger names the facet and then
 *     the value, the active state wears --primary, the clear is joined and named, the list has an
 *     "all" row that carries the ✓ when nothing is filtered. Plus the keyboard — the APG
 *     select-only combobox — and the search row, which only a FILTER past twenty options gets
 *     unasked, which sits OUTSIDE the listbox, and which makes the popup a DIALOG whose box is the
 *     combobox. Both popup shapes, and an invalid select's error text reaching its trigger, are
 *     asserted in the accessibility tree — what is announced, not what the attributes say.
 *   · search.js: the clear button tracks the value and the box's disabled state, clears like a
 *     person would (input, then change), Escape clears a filled box WITHOUT reaching the dialog
 *     around it, and the pending line lasts `ms` after the LAST keystroke, not the first.
 *   · sort.js: the arrow flips and is named by what it will do; one pick is one `sortchange`.
 *   · positionPopup(): flips above only when that helps, clamps to every viewport edge, keeps a
 *     scrolled list where it was, and survives a zoomed root.
 *   · filters.css on a surface that loads ONLY tokens.css and filters.css (house rule 4): the
 *     controls must carry their own box, font, focus ring and forced-colours drawing there. Every
 *     focus-ring and forced-colours assertion runs on that page, where no base.css can supply a
 *     ring that the control's own rule has lost (X2).
 *
 * WHAT THIS RUN MEASURES AGAINST. Five things this package reads land with other packages. Until
 * they do, the harness stands in for each — and says which on every run, because a check measured
 * against a stand-in is a claim about the stand-in. Each is decided by BEHAVIOUR, on a probe page
 * that loads only the real file, never by how the file spells its rule (a regex once missed WP1's
 * `[hidden="until-found" i]`, and the suite went on measuring its own shim):
 *   · the design tokens (WP1: --control-h, --control-edge, --icon-*, --ico-*): does tokens.css
 *     alone define them?
 *   · the `[hidden]` rule (WP1): does a `display: flex` element with `hidden`, under tokens.css
 *     alone, compute `display: none`?
 *   · the `.btn-group` lifts (WP5): is there a src/controls.css?
 *   · an UNPLACED `.select-panel` (WP2, M0): under components.css, is a bare panel `static`? 0.59
 *     placed it itself, which hid the page scroll the place-before-scroll order prevents;
 *   · the trigger's box (WP2, C8): under components.css, is a plain `.select-trigger` 28px tall?
 *
 * DD_FORBID_STANDINS=1 injects none of them: each one the real files still need is a FAIL, and the
 * run measures the real files as they are.
 *
 * A REAL BROWSER, and no dependency: the headless chromium Playwright caches on these machines,
 * over the DevTools protocol, with Node's own fetch and WebSocket. It skips loudly with no browser;
 * DD_REQUIRE_BROWSER=1 makes a skip a failure, as for every DOM suite here.
 *
 * A THROW IS A FAIL, NEVER A BARE STACK. `check` takes a thunk and turns a throw inside it into a
 * FAIL naming the error; anything that still escapes is reported as a FAIL naming the last check to
 * complete, and the run exits 1. An aborted run must not read as a pass, nor as a detected mutant.
 *
 *   node scripts/check-filters.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.DD_CHROME
  ? (existsSync(process.env.DD_CHROME) ? process.env.DD_CHROME : null)
  : [
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((path) => existsSync(path));

if (!CHROME) {
  console.log("check-filters: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts dispatched keyboard and pointer input, computed styles and a MutationObserver,");
  console.log("  none of which a stub can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

/* ── the harness: a throw is a FAIL ───────────────────────────────────────── */

let failures = 0;
let passes = 0;
let lastPassed = "(before the first check)";
async function check(label, test, detail) {
  let ok = false;
  let why;
  try {
    ok = Boolean(await test());
  } catch (error) {
    why = `threw: ${String(error?.message || error).split("\n")[0]}`;
  }
  if (ok) {
    passes += 1;
    lastPassed = label;
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  if (why === undefined && detail !== undefined) {
    try { why = typeof detail === "function" ? await detail() : detail; } catch (error) { why = `(detail threw: ${error?.message})`; }
  }
  console.log(`FAIL  ${label}${why === undefined ? "" : `\n        ${why}`}`);
}
const abort = (error) => {
  console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
  console.log("\ncheck-filters: ABORTED");
  process.exit(1);
};
process.on("uncaughtException", abort);
process.on("unhandledRejection", abort);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

/*
 * PORT 0, READ BACK. The other suites pin 19224, so two of them running at once — two worktrees,
 * two agents — share one browser: each opens tabs in the other's, and the first to finish kills the
 * second's mid-run. Asking the browser for a free port and reading it from DevToolsActivePort in
 * its own profile cannot collide.
 */
const profile = mkdtempSync(join(tmpdir(), "dd-filters-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: true });

// THE PROFILE GOES WITH THE RUN, a failed or interrupted one included — otherwise every run leaves
// 2.3 MB of browser state in $TMPDIR. The browser is spawned detached so that it leads a process
// group, and the whole group is killed first: no renderer is still writing into what is removed.
let socket;
const shutdown = () => {
  try { socket?.close(); } catch {}
  try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (error) {
    console.log(`note: the browser profile ${profile} was not removed: ${error.message}`);
  }
};
process.on("exit", shutdown);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

let port = 0;
for (let i = 0; !port; i += 1) {
  try { port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch {}
  if (!port && i > 80) throw new Error("headless chromium did not come up");
  if (!port) await sleep(250);
}

/* ── what this run measures against ───────────────────────────────────────── */

const FORBID = process.env.DD_FORBID_STANDINS === "1";
const svg = (body) => `url("data:image/svg+xml,${
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`
    .replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
const TOKENS = ["--control-h", "--control-edge", "--icon-sm", "--icon-size", "--ico-search", "--ico-filter", "--ico-x",
  "--ico-check", "--ico-arrow-up", "--ico-arrow-down"];
// WP1 STAND-IN, declared BEFORE tokens.css: once the foundations package declares these, its values win.
const TOKEN_SHIM = `<style id="standin-wp1-tokens">:root {
  --control-h: 1.75rem;
  --control-edge: color-mix(in srgb, var(--foreground) 60%, transparent);
  --icon-sm: 0.75rem; --icon-size: 0.875rem;
  --ico-search: ${svg("<circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/>")};
  --ico-filter: ${svg("<path d='M22 3H2l8 9.46V19l4 2v-8.54z'/>")};
  --ico-x: ${svg("<path d='M18 6 6 18M6 6l12 12'/>")};
  --ico-check: ${svg("<path d='M20 6 9 17l-5-5'/>")};
  --ico-arrow-up: ${svg("<path d='m5 12 7-7 7 7M12 19V5'/>")};
  --ico-arrow-down: ${svg("<path d='M12 5v14M19 12l-7 7-7-7'/>")};
}</style>`;

// WP1 STAND-IN (X3): the one [hidden] rule, as WP1 spells it.
const HIDDEN_SHIM = `<style id="standin-wp1-hidden">[hidden]:not([hidden="until-found" i]) { display: none !important; }</style>`;
// WP5 STAND-IN: `.btn-group`'s join and lifts, copied from WP5's controls.css. Which child of a joined
// pair is on top is decided there, and nowhere here.
const BTN_GROUP_SHIM = `<style id="standin-wp5-btn-group">
.btn-group > * + * { margin-inline-start: -1px; }
.btn-group > :is(:hover, [aria-pressed="true"], [aria-expanded="true"]) { position: relative; z-index: 1; }
.btn-group > :focus-within { position: relative; z-index: 2; }</style>`;
// WP2 STAND-IN (M0): an UNPLACED panel — the only kind that shows what the place-before-scroll order
// in select.js prevents.
const PANEL_SHIM = `<style id="standin-wp2-m0">.select-panel { position: static; }</style>`;
// WP2 STAND-IN (C8): the trigger's block padding as WP2 derives it from --control-h, so its box is 28px.
const TRIGGER_SHIM = `<style id="standin-wp2-c8">select, .select-trigger {
  padding-block: calc((var(--control-h) - var(--fs-base) * var(--lh-tight) - 2px) / 2); }</style>`;

// What each page loads beside the real files: empty until the probes decide (below). A page is built
// when it is REQUESTED, so every page opened after the probes carries what they decided.
const load = { tokens: "", hidden: "", controls: "", components: "" };

const HELPERS = `
window.log = [];
for (const type of ["input", "change", "sortchange"]) {
  document.addEventListener(type, (e) => {
    const who = e.target.id || e.target.className;
    log.push(type + ":" + who + (type === "sortchange" ? ":" + e.detail.field + "/" + e.detail.dir : ""));
  });
}
window.$ = (s) => document.querySelector(s);
window.mount = (html) => { document.getElementById("mount").innerHTML = html; log.length = 0; };
window.probe = (value, prop = "color") => {
  const p = document.createElement("i"); p.style.setProperty(prop, value); document.body.append(p);
  const v = getComputedStyle(p).getPropertyValue(prop); p.remove(); return v;
};
window.cs = (s, prop, pseudo) => getComputedStyle(typeof s === "string" ? $(s) : s, pseudo || null).getPropertyValue(prop);
window.box = (s) => (typeof s === "string" ? $(s) : s).getBoundingClientRect().toJSON();
window.drawn = (s) => (typeof s === "string" ? $(s) : s).getClientRects().length > 0;
window.tick = () => new Promise((r) => setTimeout(r, 0));
`;

const PAGES = {
  // THE PROBES: a real file with nothing of ours in front of it, asked what it DOES.
  "/probe/tokens": `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"></head><body>
<div id="flex" style="display: flex" hidden>hidden</div><script>window.ready = true;</script></body></html>`,
  get "/probe/components"() { return `<!doctype html><html lang="en"><head><meta charset="utf-8">${load.tokens}
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/base.css">
<link rel="stylesheet" href="/src/components.css"></head><body>
<ul class="select-panel" id="panel"><li>row</li></ul>
<span class="select-field"><button type="button" class="select-trigger" id="trigger"><span class="select-value">source</span></button></span>
<script>window.ready = true;</script></body></html>`; },

  get "/main"() { return `<!doctype html><html lang="en"><head><meta charset="utf-8">${load.tokens}${load.hidden}
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/base.css">
<link rel="stylesheet" href="/src/components.css">${load.components}${load.controls}<link rel="stylesheet" href="/src/filters.css">
<style>body { margin: 0; padding: 20px; } body::after { display: none; }
/* Computed styles are asserted at a state's END. A .15s transition would be sampled mid-flight —
   an edge read as --control-edge a frame after it was told to turn --primary. base.css's smooth
   scrolling is the same trap for geometry: a scrollBy() still animating when the list is measured. */
*, *::before, *::after { transition: none !important; }
html { scroll-behavior: auto !important; }</style>
</head><body><button id="start" type="button">start</button><div id="mount"></div>
<script type="module">
import { positionPopup } from "/runtime/popup.js";
import { initSelects } from "/runtime/select.js";
import { initSearchFields, markPending } from "/runtime/search.js";
import { initSortControls } from "/runtime/sort.js";
Object.assign(window, { positionPopup, initSelects, initSearchFields, markPending, initSortControls });
${HELPERS}
window.triggerOf = (id) => document.getElementById(id).parentElement.querySelector(".select-trigger");
window.clearOf = (id) => document.getElementById(id).closest(".filter-dd")?.querySelector(".filter-clear") || null;
window.panel = () => document.querySelector(".select-panel");
window.listbox = () => { const p = panel(); return p && (p.matches("[role=listbox]") ? p : p.querySelector("[role=listbox]")); };
window.searchBox = () => panel()?.querySelector(".select-search input") || null;
// The rows a reader SEES — rendered boxes, not the \`hidden\` attribute. The attribute is the
// runtime's intent; \`.select-option { display: flex }\` once overrode it and every "filtered" row
// stayed on screen while an attribute-reading check reported the filter working.
window.rows = () => [...(panel()?.querySelectorAll(".select-option") || [])]
  .filter((r) => r.getClientRects().length > 0).map((r) => r.textContent);
window.activeRow = (el = document.activeElement) => {
  const id = el && el.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id).textContent : null;
};
window.activeRowEl = (el = document.activeElement) => {
  const id = el && el.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
};
window.ready = true;
</script></body></html>`; },

  // filters.css BEFORE components.css: the filter trigger must not depend on which loads last.
  get "/reversed"() { return `<!doctype html><html lang="en"><head><meta charset="utf-8">${load.tokens}${load.hidden}
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/filters.css">
<link rel="stylesheet" href="/src/components.css">${load.components}
<style>body { margin: 0; padding: 20px; }</style>
</head><body>
<select data-filter aria-label="source" id="rsrc"><option value="">all</option><option value="s">seedr</option></select>
<select aria-label="kind" id="rkind"><option>agent</option><option>skill</option></select>
<script type="module">
import { initSelects } from "/runtime/select.js";
${HELPERS}
window.triggerOf = (id) => document.getElementById(id).parentElement.querySelector(".select-trigger");
initSelects();
window.ready = true;
</script></body></html>`; },

  // ONLY tokens.css and filters.css — what a tokens + chrome surface like netmon would load. Every
  // focus-ring and forced-colours assertion runs here, where nothing else can draw one.
  get "/bare"() { return `<!doctype html><html lang="en"><head><meta charset="utf-8">${load.tokens}${load.hidden}
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/filters.css">
<style>body { margin: 0; padding: 20px; font: 12px/1.5 monospace; } *, *::before, *::after { transition: none !important; }</style>
</head><body><button id="start" type="button">start</button>
<search class="filter-bar" id="bar">
  <div class="search-field" id="sf"><input type="search" id="q" aria-label="search" value="x"><button type="button" class="search-clear" id="sclr" aria-label="clear search"></button></div>
  <span class="filter-dd" id="fdd"><button type="button" class="select-trigger select-trigger--filter" id="trig">source</button></span>
  <button type="button" class="filter-clear" id="clr" aria-label="clear source filter"></button>
  <div class="sort-ctl" id="sc"><button type="button" class="sort-dir" id="dir" data-dir="asc" aria-label="sort descending"></button></div>
  <span class="sep" id="sep" aria-hidden="true"></span>
</search>
<div class="chip-set" id="cs" role="group" aria-label="tags">
  <button type="button" class="chip" id="chip" aria-pressed="false">agents</button>
  <a class="chip" id="link" href="#a">#a</a>
</div>
<div class="filter-chips" id="fch" role="group" aria-label="in force"><button type="button" class="chip chip--remove" id="rm" aria-label="remove filter source: seedr"><span class="chip-key">source:</span> seedr</button></div>
<button type="button" class="value-filter" id="vf">official</button>
<span class="match-count" id="mc">3/17</span><p class="result-count" id="rc">7 of 55</p><p class="load-more" id="lm">showing 8</p>
<div class="select-search" id="ss"><div class="search-field"><input type="search" aria-label="row"></div></div>
<ul class="select-list" id="sl"><li>a</li></ul><div class="select-optgroup" id="og">g</div><div class="select-empty" id="se">no matches</div>
<script type="module">
${HELPERS}
window.ready = true;
</script></body></html>`; },
};

const server = createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url in PAGES) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGES[url]);
    return;
  }
  if (/^\/examples\/[a-z-]+\.html$/.test(url) || /^\/(src|runtime)\/[a-z-]+\.(css|js)$/.test(url)) {
    const path = join(root, url);
    if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
    const type = { ".css": "text/css", ".js": "text/javascript", ".html": "text/html" }[extname(url)];
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(readFileSync(path));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(0);
await new Promise((ok) => server.on("listening", ok));
const base = `http://127.0.0.1:${server.address().port}`;
process.on("exit", () => server.close());

/* ── the protocol ─────────────────────────────────────────────────────────── */

const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: "PUT" })).json();
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
await send("Page.enable");
await send("DOM.enable");
await send("CSS.enable");
await send("Accessibility.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

const open = async (path, readiness = "window.ready === true") => {
  await send("Page.navigate", { url: base + path });
  for (let i = 0; ; i += 1) {
    if (await evaluate(`document.readyState === "complete" && (${readiness})`).catch(() => false)) return;
    if (i > 50) throw new Error(`${path} never finished loading`);
    await sleep(100);
  }
};

const move = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const pressAt = async (x, y) => {
  await move(x, y);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};
// Where a real pointer would press. Dispatched, so the browser hit-tests it — which is the claim.
// NOTHING TO PRESS is a FAIL of its own, and the run goes on: a control the runtime failed to build
// must not take every later section down with it.
const centre = async (expression) => {
  const at = await evaluate(`(() => { const e = (${expression}); if (!e) return null; const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!at) {
    failures += 1;
    console.log(`FAIL  nothing to press: ${expression}\n        (after: ${lastPassed})`);
  }
  return at;
};
const click = async (expression) => { const at = await centre(expression); if (at) await pressAt(at.x, at.y); };
const hover = async (expression) => { const at = await centre(expression); if (at) await move(at.x, at.y); };

const KEYS = {
  Enter: { code: "Enter", keyCode: 13, text: "\r" },
  Escape: { code: "Escape", keyCode: 27 },
  Tab: { code: "Tab", keyCode: 9 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  Home: { code: "Home", keyCode: 36 },
  End: { code: "End", keyCode: 35 },
  " ": { code: "Space", keyCode: 32, text: " " },
};
const ALT = 1;
const press = async (key, modifiers = 0) => {
  const known = KEYS[key];
  const k = known || {
    code: /\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
    keyCode: key.toUpperCase().charCodeAt(0),
    text: key,
  };
  const common = { key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, modifiers };
  await send("Input.dispatchKeyEvent", { ...common, type: k.text ? "keyDown" : "rawKeyDown", text: k.text, unmodifiedText: k.text });
  await send("Input.dispatchKeyEvent", { ...common, type: "keyUp" });
};
const typeText = (text) => send("Input.insertText", { text });
// The pointer stays wherever the last press left it, and whatever is rendered under it next is
// HOVERED. Parked in a corner nothing occupies before a look is asserted at rest.
const park = () => move(998, 698);

// A hover or a keyboard focus, FORCED on one node — so a state's look is asserted without depending
// on the pointer heuristics that decide :focus-visible.
const force = async (selector, states) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`force: no node for ${selector}`);
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
};

/*
 * WHAT A SCREEN READER IS HANDED: the accessibility tree under one element, with containers that
 * carry no role of their own (ignored, `presentation`, `generic`) looked through — so a text box
 * wrapped in a presentational row still shows up as the listbox's child, which is the defect.
 */
const axTree = async (selector) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`ax: no node for ${selector}`);
  const { node } = await send("DOM.describeNode", { nodeId });
  const { nodes } = await send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const self = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
  if (!self) throw new Error(`ax: ${selector} is not in the accessibility tree`);
  const through = (n) => n.ignored || ["none", "presentation", "generic"].includes(n.role?.value);
  const kids = (n) => (n.childIds || []).flatMap((id) => {
    const c = byId.get(id);
    return !c ? [] : through(c) ? kids(c) : [c];
  });
  const shape = (n) => ({ role: n.role?.value, name: n.name?.value ?? "", children: kids(n).map((c) => ({
    role: c.role?.value, name: c.name?.value ?? "", children: kids(c).map((g) => g.role?.value) })) });
  return shape(self);
};
// ONE NODE as a screen reader is handed it: role, name, description, and every state and relation
// the tree gives it — a relation (controls, activedescendant) as the ids of the elements it reaches.
const axNode = async (selector) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`ax: no node for ${selector}`);
  const { node } = await send("DOM.describeNode", { nodeId });
  const { nodes } = await send("Accessibility.getFullAXTree");
  const self = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
  if (!self) throw new Error(`ax: ${selector} is not in the accessibility tree`);
  const idOf = async (backendNodeId) => {
    const { node: target } = await send("DOM.describeNode", { backendNodeId });
    const attributes = target.attributes || [];
    for (let i = 0; i < attributes.length; i += 2) if (attributes[i] === "id") return attributes[i + 1];
    return `(a ${target.nodeName} with no id)`;
  };
  const out = { role: self.role?.value, name: self.name?.value ?? "", description: self.description?.value ?? "", value: self.value?.value ?? null };
  for (const p of self.properties || []) {
    out[p.name] = p.value.relatedNodes ? await Promise.all(p.value.relatedNodes.map((r) => idOf(r.backendDOMNodeId))) : p.value.value;
  }
  return out;
};

// WHAT THE COMPOSITOR PAINTED: a screenshot of a clip, decoded, and WCAG contrast between two pixels.
// The only honest answer to "which of two overlapping things is on top", and to whether a colour
// that computes fine is visible at all.
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (p, q) => { const a = lum(p), b = lum(q); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
// A PNG screenshot, decoded: 8-bit RGB or RGBA, the five scanline filters.
const decode = (png) => {
  let w = 0, h = 0, type = 0;
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const tag = png.toString("ascii", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (tag === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9]; }
    if (tag === "IDAT") idat.push(body);
    offset += 12 + length;
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return Array.from({ length: w * h }, (_, i) => [out[i * bpp], out[i * bpp + 1], out[i * bpp + 2]]);
};
// CAPTURE WHAT YOU THINK YOU CAPTURE. A clip is in document coordinates and is taken from the page as
// laid out now — never `captureBeyondViewport`, which re-lays the page without its scrollbar and moves
// every clip computed beforehand (WP12 measured a 1.34:1 glyph read as 21:1). So the page must be
// unscrolled and the clip inside its layout viewport, or the shot is refused.
const shot = async (clip) => {
  const view = await evaluate(`({ x: scrollX, y: scrollY, w: document.documentElement.clientWidth, h: document.documentElement.clientHeight })`);
  if (view.x || view.y || clip.x < 0 || clip.y < 0 || clip.x + clip.width > view.w || clip.y + clip.height > view.h) {
    throw new Error(`screenshot clip ${JSON.stringify(clip)} is not inside the unscrolled viewport ${JSON.stringify(view)}`);
  }
  // Two animation frames before every capture (RULES-CROSSCUT X1): a capture taken as soon as a
  // theme, a palette, a hidden mark or a focus changed can read the frame before that paint landed.
  await evaluate("new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(null))))");
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: { ...clip, scale: 1 } });
  return decode(Buffer.from(data, "base64"));
};
const pixel = async (x, y) => `rgb(${(await shot({ x, y, width: 1, height: 1 }))[0].join(", ")})`;

/* ═══ what the real files do — decided before anything of ours is loaded ═══ */

const standins = [];
// A stand-in the real files NEED: named on every run; with DD_FORBID_STANDINS=1, a FAIL, and not loaded.
const need = (what, why, shim) => { standins.push([what, why]); return FORBID ? "" : shim; };

await open("/probe/tokens");
const tokensDo = await evaluate(`(() => { const root = getComputedStyle(document.documentElement);
  return { hidden: getComputedStyle(document.getElementById("flex")).display,
    missing: ${JSON.stringify(TOKENS)}.filter((name) => !root.getPropertyValue(name).trim()) }; })()`);
if (tokensDo.missing.length) {
  load.tokens = need("design tokens", `tokens.css does not define ${tokensDo.missing.join(" ")} (WP1)`, TOKEN_SHIM);
}
if (tokensDo.hidden !== "none") {
  load.hidden = need("[hidden] rule", `under tokens.css alone, a display:flex element with \`hidden\` computes "${tokensDo.hidden}" (WP1, X3)`, HIDDEN_SHIM);
}
load.controls = existsSync(join(root, "src/controls.css")) ? `<link rel="stylesheet" href="/src/controls.css">`
  : need(".btn-group lifts", "there is no src/controls.css (WP5)", BTN_GROUP_SHIM);

await open("/probe/components");
const componentsDo = await evaluate(`({ panel: getComputedStyle(document.getElementById("panel")).position,
  trigger: document.getElementById("trigger").getBoundingClientRect().height })`);
if (componentsDo.panel !== "static") {
  load.components += need("an unplaced .select-panel", `components.css places a bare panel itself (position: ${componentsDo.panel}) (WP2 M0)`, PANEL_SHIM);
}
if (!near(componentsDo.trigger, 28, 0.01)) {
  load.components += need("the trigger's 28px box", `a plain .select-trigger under components.css is ${componentsDo.trigger}px (WP2 C8)`, TRIGGER_SHIM);
}

console.log(`measuring against${FORBID ? " (DD_FORBID_STANDINS=1 — none loaded)" : ""}:`);
if (!standins.length) console.log("  the real files, and nothing else: no stand-in is needed");
for (const [what, why] of standins) console.log(`  ${FORBID ? "MISSING " : "STAND-IN"} ${what} — ${why}`);
console.log("");
if (FORBID) {
  for (const [what, why] of standins) await check(`the real files need no stand-in: ${what}`, () => false, why);
}

/* ═══ popup.js — positionPopup() ═══════════════════════════════════════════ */

await open("/main");

await evaluate(`window.place = (x, y, w, rows, opts, text = "row") => {
  document.getElementById("pa")?.remove(); document.getElementById("pp")?.remove();
  const a = document.createElement("button");
  a.id = "pa"; a.textContent = "anchor";
  a.style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;width:" + w + "px;height:28px;margin:0;padding:0;box-sizing:border-box";
  const p = document.createElement("ul");
  p.id = "pp"; p.className = "select-panel";
  p.innerHTML = Array.from({ length: rows }, (_, i) => "<li class='select-option'>" + text + " " + i + "</li>").join("");
  document.body.append(a, p);
  const anchor = opts && opts.point ? opts.point : a;
  const result = positionPopup(p, anchor, opts || {});
  return { side: result.side, p: p.getBoundingClientRect().toJSON(), a: a.getBoundingClientRect().toJSON(),
           vw: innerWidth, vh: innerHeight, position: p.style.position, minW: p.style.minInlineSize,
           maxH: p.style.maxBlockSize };
}; null`);

let r = await evaluate("place(20, 20, 120, 5)");
await check("popup: an anchor near the top opens BELOW, 4px under it, flush with its start",
  () => r.side === "below" && near(r.p.top, r.a.bottom + 4) && near(r.p.left, r.a.left), () => JSON.stringify(r));
await check("popup: it is position: fixed, written inline — the CSS no longer places a .select-panel",
  () => r.position === "fixed");
await check("popup: never narrower than the control that opened it", () => r.p.width >= r.a.width - 0.5,
  () => `${r.p.width} < ${r.a.width}`);

r = await evaluate("place(20, 640, 120, 5)");
await check("popup: near the bottom edge a short list FLIPS ABOVE, 4px over the anchor",
  () => r.side === "above" && near(r.p.bottom, r.a.top - 4), () => JSON.stringify(r));

r = await evaluate("place(20, 500, 120, 5)");
await check("popup: a list that fits below stays below, even with more room above",
  () => r.side === "below" && near(r.p.top, r.a.bottom + 4), () => JSON.stringify(r));

r = await evaluate("place(20, 640, 120, 100)");
await check("popup: a tall list near the bottom flips and is clamped to the room above, 8px off the top",
  () => r.side === "above" && r.p.top >= 8 - 0.5 && near(r.p.bottom, r.a.top - 4) && r.maxH !== "", () => JSON.stringify(r));

r = await evaluate("place(20, 20, 120, 100)");
await check("popup: a tall list near the top stays below, clamped 8px short of the bottom edge",
  () => r.side === "below" && r.p.bottom <= r.vh - 8 + 0.5 && near(r.p.top, r.a.bottom + 4), () => JSON.stringify(r));

r = await evaluate("place(950, 100, 40, 3, {}, 'a considerably wider row than its anchor, so it must be pushed back in')");
await check("popup: at the right edge it is pushed back in, 8px short of the viewport edge",
  () => r.p.right <= r.vw - 8 + 0.5 && r.p.left < r.a.left, () => JSON.stringify(r));

r = await evaluate("place(2, 100, 40, 3)");
await check("popup: at the left edge it is kept 8px in", () => r.p.left >= 8 - 0.5, () => JSON.stringify(r));

r = await evaluate("place(500, 100, 100, 3, { align: 'end' }, 'a row wider than the anchor')");
await check("popup: align 'end' lines its right edge up with the anchor's", () => near(r.p.right, r.a.right),
  () => JSON.stringify(r));

r = await evaluate("place(20, 100, 60, 3, { point: { x: 300, y: 200 }, minWidth: 140 })");
await check("popup: a POINT anchor (a context menu) opens at the point, below it by the gap",
  () => near(r.p.left, 300) && near(r.p.top, 204), () => JSON.stringify(r));
await check("popup: ...and minWidth is the floor when there is no anchor width",
  () => r.p.width >= 140 - 0.5 && r.minW === "140px", () => JSON.stringify(r));

r = await evaluate("place(20, 100, 200, 3, { minWidth: 260 })");
await check("popup: min-inline-size is max(anchor width, minWidth)", () => r.minW === "260px" && r.p.width >= 259.5,
  () => JSON.stringify(r));

r = await evaluate("place(20, 640, 120, 5, { side: 'below' })");
await check("popup: `side` keeps the side it is given instead of re-choosing", () => r.side === "below" && r.p.top > r.a.bottom,
  () => JSON.stringify(r));

r = await evaluate(`(() => { place(20, 20, 120, 100);
  const p = document.getElementById("pp"); p.scrollTop = 200;
  positionPopup(p, document.getElementById("pa"));
  return p.scrollTop; })()`);
await check("popup: re-placing a SCROLLED list leaves it where the reader had scrolled it", () => r === 200, () => `scrollTop ${r}`);

r = await evaluate(`(() => { document.documentElement.style.zoom = "1.5";
  const out = place(100, 100, 120, 5);
  document.documentElement.style.zoom = ""; return out; })()`);
await check("popup: under a zoomed root it still lands on its anchor (the zoom is divided on the WRITE)",
  () => near(r.p.left, r.a.left, 1.5) && near(r.p.top, r.a.bottom + 4, 1.5), () => JSON.stringify(r));
await evaluate(`document.getElementById("pa")?.remove(); document.getElementById("pp")?.remove(); null`);

/* ═══ select.js — the list is never the OS list ═══════════════════════════ */

await evaluate(`mount(\`
  <label>plain <select id="plain"><option>alpha</option><option selected>beta</option><option>gamma</option></select></label>
  <label for="forl">kind</label> <select id="forl"><option>agent</option><option selected>skill</option></select>
  <span id="byid-l">model</span> <select id="byid" aria-labelledby="byid-l"><option>claude</option><option selected>codex</option></select>
  <select id="off" data-select="off"><option>kept native before 0.60.0</option></select>
  <select id="src" data-filter aria-label="source"><option value="">all</option><option value="seedr">seedr</option>
    <option value="skills">skills.sh</option><option value="aitmpl" disabled>aitmpl</option></select>
  <select id="req" data-filter aria-label="repository"><option value="vu3">poi/vu3</option><option value="infra">dd/infra</option></select>
  <select id="order" data-filter aria-label="kind"><option value="a">agent</option><option value="">all</option><option value="s">skill</option></select>
  <select id="bad" aria-label="model" aria-invalid="true" aria-describedby="bad-err"><option data-icon="star">claude</option><option>codex</option></select>
  <p class="field-error" id="bad-err">pick a model this host can run</p>
  <select id="dis" data-filter aria-label="host" disabled><option value="">all</option><option value="m" selected>ddmini</option></select>
\`); initSelects(); null`);

await check("never the OS list: every <select> is wrapped, including one still carrying data-select=\"off\"",
  () => evaluate(`[...document.querySelectorAll("#mount select")].every((s) =>
    s.parentElement.classList.contains("select-field") && s.parentElement.querySelector(".select-trigger"))`));
await check("never the OS list: the native control is out of the tab order and hidden from assistive tech",
  () => evaluate(`[...document.querySelectorAll("#mount select")].every((s) =>
    s.getAttribute("tabindex") === "-1" && s.getAttribute("aria-hidden") === "true")`));
await check("never the OS list: the pixel a reader presses is the trigger, not the <select> laid over it",
  () => evaluate(`(() => { const t = triggerOf("plain"); const b = t.getBoundingClientRect();
    return t.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); })()`));

await click(`triggerOf("plain")`);
await check("never the OS list: a pointer press opens the system's listbox, in the page",
  () => evaluate(`!!panel() && panel().matches("ul.select-panel[role=listbox]") && panel().parentElement === document.body`));
await check("never the OS list: ...one row per option, the current one aria-selected",
  async () => (await evaluate("rows().join(',')")) === "alpha,beta,gamma" &&
    (await evaluate(`panel().querySelector("[aria-selected=true]").textContent`)) === "beta");
await check("never the OS list: ...placed by positionPopup (position: fixed inline)",
  async () => (await evaluate("panel().style.position")) === "fixed");
await check("never the OS list: ...and the trigger's aria-controls names that listbox",
  () => evaluate(`triggerOf("plain").getAttribute("aria-controls") === listbox().id`));
// With no search row nothing changes (lead ruling): the trigger is the combobox, the popup its listbox.
let axl = null;
await check("never the OS list: in the ACCESSIBILITY TREE the trigger pops up a LISTBOX, is expanded, controls it, and points at the highlighted row",
  async () => {
    axl = await axNode(`#${await evaluate(`triggerOf("plain").id`)}`);
    return axl.role === "combobox" && axl.hasPopup === "listbox" && axl.expanded === true &&
      axl.controls?.join() === (await evaluate("listbox().id")) &&
      axl.activedescendant?.join() === (await evaluate(`panel().querySelector('[data-active="true"]').id`));
  },
  () => JSON.stringify(axl));
await press("Escape");
await check("Escape closes it, focus back on the trigger",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement === triggerOf("plain")`)));
await press("ArrowDown", ALT);
await check("never the OS list: Alt+ArrowDown on the trigger opens the system's list", () => evaluate("!!panel()"));
await press("Escape");
await press(" ");
await check("...and so does Space", () => evaluate("!!panel()"));
await press("Escape");

// 0.61.0: the NAME is the label and the VALUE is the value — once each. A wrapping <label> used to be
// referenced along with the trigger itself, and its content holds the trigger, so the tree read
// "plain beta beta"; a for= label read "kind skill" and then skill again as the value.
const nameAndValue = async (id) => {
  const n = await axNode(`#${await evaluate(`triggerOf(${JSON.stringify(id)}).id`)}`);
  // components.css's zero-width space after .select-value (a line box for an empty option) is in the
  // value too; screen readers pass over it, so it is dropped here.
  return { name: n.name, value: n.value && n.value.replace(/\u200b/g, "") };
};
const named = {};
for (const id of ["plain", "forl", "byid"]) named[id] = await nameAndValue(id);
await evaluate(`(() => { const s = document.getElementById("plain"); s.value = "gamma"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
named.picked = await nameAndValue("plain");
await check("0.61.0 — a select WRAPPED in its <label> is named by the label's words alone, and its value is the combobox's value: \"plain\" / \"beta\"",
  () => JSON.stringify(named.plain) === JSON.stringify({ name: "plain", value: "beta" }), () => JSON.stringify(named));
await check("...and after a pick the name is still \"plain\" and the value \"gamma\"",
  () => JSON.stringify(named.picked) === JSON.stringify({ name: "plain", value: "gamma" }), () => JSON.stringify(named));
await check("0.61.0 — a select named by <label for> reads \"kind\" / \"skill\", and one by aria-labelledby \"model\" / \"codex\"",
  () => JSON.stringify([named.forl, named.byid]) === JSON.stringify([{ name: "kind", value: "skill" }, { name: "model", value: "codex" }]),
  () => JSON.stringify(named));
await evaluate(`(() => { const s = document.getElementById("plain"); s.value = "beta"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);

await evaluate(`document.getElementById("mount").insertAdjacentHTML("beforeend",
  '<select id="late"><option>rendered after initSelects()</option></select>'); null`);
await evaluate("tick()");
await check("never the OS list: a <select> rendered AFTER the call is enhanced too",
  () => evaluate(`document.getElementById("late").parentElement.classList.contains("select-field")`));

/* ═══ select.js — the filter dropdown (M5) ═════════════════════════════════ */

await check("filter: the select, its trigger and a clear sit in one labelled group",
  () => evaluate(`(() => { const g = document.getElementById("src").closest(".filter-dd");
    return !!g && g.matches(".btn-group[role=group]") && g.getAttribute("aria-label") === "source filter"
      && g.children.length === 2 && g.children[0].matches(".select-field") && g.children[1].matches("button.filter-clear"); })()`));
await check("filter: the trigger is the filter variant",
  () => evaluate(`triggerOf("src").classList.contains("select-trigger--filter")`));
await check("filter: at rest the trigger names the FACET",
  async () => (await evaluate(`triggerOf("src").textContent`)) === "source");
await check("filter: ...its accessible name carries facet AND value, so state is never colour alone",
  async () => (await evaluate(`triggerOf("src").getAttribute("aria-label")`)) === "source filter: all");
await check("filter: ...it is not active, and there is no clear to press",
  async () => (await evaluate(`triggerOf("src").hasAttribute("data-active")`)) === false &&
    (await evaluate(`clearOf("src").hidden`)) === true && !(await evaluate(`drawn(clearOf("src"))`)));
await check("filter: the clear names its facet, not a generic \"Clear filter\"",
  async () => (await evaluate(`clearOf("src").getAttribute("aria-label")`)) === "clear source filter");

await click(`triggerOf("src")`);
await check("filter: the list opens on an \"all\" row that carries the ✓ while nothing is filtered",
  async () => (await evaluate("rows()[0]")) === "all" &&
    (await evaluate(`panel().querySelector(".select-option").getAttribute("aria-selected")`)) === "true" &&
    (await evaluate(`panel().querySelectorAll("[aria-selected=true]").length`)) === 1);
await press("Escape");
await click(`triggerOf("order")`);
await check("filter: the \"all\" row comes FIRST even when the page wrote the empty option second",
  async () => (await evaluate("rows().join(',')")) === "all,agent,skill");
await press("Escape");

// Keyboard pick: ArrowDown opens on the value in force, ArrowDown moves, Enter picks.
await evaluate(`triggerOf("src").focus(); log.length = 0; null`);
await press("ArrowDown");
await check("filter: ArrowDown opens the list on the value in force",
  () => evaluate(`!!panel() && activeRow(triggerOf("src")) === "all"`));
await press("ArrowDown");
await check("filter: ArrowDown moves the highlight (aria-activedescendant)",
  async () => (await evaluate(`activeRow(triggerOf("src"))`)) === "seedr");
await press("Enter");
await check("filter: Enter picks it — the <select> holds the value",
  async () => (await evaluate(`document.getElementById("src").value`)) === "seedr");
await check("filter: ...announced the native way: input, then change, once each",
  async () => (await evaluate("log.join(',')")) === "input:src,change:src", () => evaluate("log.join(',')"));
await check("filter: FILTERING, the trigger names the VALUE",
  async () => (await evaluate(`triggerOf("src").textContent`)) === "seedr");
await check("filter: ...is marked active, and its name says so",
  async () => (await evaluate(`triggerOf("src").getAttribute("data-active")`)) === "true" &&
    (await evaluate(`triggerOf("src").getAttribute("aria-label")`)) === "source filter: seedr");
await check("filter: ...and the clear is there, joined to it (sharing one edge)",
  async () => (await evaluate(`clearOf("src").hidden`)) === false &&
    (await evaluate(`Math.abs(box(clearOf("src")).left - (box(triggerOf("src")).right - 1)) <= 0.5`)));
await check("filter: focus is back on the trigger after the pick",
  () => evaluate(`document.activeElement === triggerOf("src")`));

const primary = await evaluate(`probe("var(--primary)")`);
const edge = await evaluate(`probe("var(--control-edge)")`);
const fg = await evaluate(`probe("var(--foreground)")`);
const muted = await evaluate(`probe("var(--muted-foreground)")`);
const tint = await evaluate(`probe("color-mix(in srgb, var(--primary) 12%, transparent)", "background-color")`);
await check("filter: the active state carries --primary — ink, edge and funnel",
  async () => (await evaluate(`cs(triggerOf("src"), "color")`)) === primary &&
    (await evaluate(`cs(triggerOf("src"), "border-top-color")`)) === primary &&
    (await evaluate(`cs(triggerOf("src"), "background-color", "::before")`)) === primary,
  async () => `${await evaluate(`cs(triggerOf("src"), "color")`)} / ${await evaluate(`cs(triggerOf("src"), "border-top-color")`)} vs ${primary}`);
await check("filter: the clear is --primary on a --primary edge",
  async () => (await evaluate(`cs(clearOf("src"), "color")`)) === primary &&
    (await evaluate(`cs(clearOf("src"), "border-top-color")`)) === primary);

await evaluate("log.length = 0; null");
await click(`clearOf("src")`);
await park();
await check("filter: the clear empties the filter", async () => (await evaluate(`document.getElementById("src").value`)) === "");
await check("filter: ...announced as input then change", async () => (await evaluate("log.join(',')")) === "input:src,change:src",
  () => evaluate("log.join(',')"));
await check("filter: ...the trigger names the facet again and is no longer active",
  async () => (await evaluate(`triggerOf("src").textContent`)) === "source" &&
    !(await evaluate(`triggerOf("src").hasAttribute("data-active")`)));
await check("filter: ...the clear is gone, and focus did not go with it — it is on the trigger",
  async () => (await evaluate(`clearOf("src").hidden`)) === true &&
    (await evaluate(`document.activeElement === triggerOf("src")`)));
await check("filter: at rest the ink is --foreground on a --control-edge edge; the funnel is muted",
  async () => (await evaluate(`cs(triggerOf("src"), "color")`)) === fg &&
    (await evaluate(`cs(triggerOf("src"), "border-top-color")`)) === edge &&
    (await evaluate(`cs(triggerOf("src"), "background-color", "::before")`)) === muted);

// The "all" row is a way back too.
await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
await press("ArrowDown"); await press("Home");
await check("filter: Home jumps to the \"all\" row", async () => (await evaluate(`activeRow(triggerOf("src"))`)) === "all");
await press("Enter");
await check("filter: ...and picking it clears the filter", async () => (await evaluate(`document.getElementById("src").value`)) === "");

await press("ArrowDown"); await press("End");
await check("filter: End skips a disabled last option", async () => (await evaluate(`activeRow(triggerOf("src"))`)) === "skills.sh");
await press("Home"); await press("s");
await check("filter: typeahead finds the first match", async () => (await evaluate(`activeRow(triggerOf("src"))`)) === "seedr");
await press("s");
await check("filter: ...and the same letter again cycles to the next", async () => (await evaluate(`activeRow(triggerOf("src"))`)) === "skills.sh");
await evaluate("log.length = 0; null");
await press("Escape");
await check("filter: Escape closes without changing anything",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.getElementById("src").value`)) === "" &&
    (await evaluate("log.length")) === 0);
await press("ArrowDown"); await press("ArrowDown"); await press("Tab");
await check("filter: Tab closes and commits nothing",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.getElementById("src").value`)) === "");

await check("filter: a REQUIRED picker (no empty option) shows its value and is never \"active\"",
  async () => (await evaluate(`triggerOf("req").textContent`)) === "poi/vu3" &&
    !(await evaluate(`triggerOf("req").hasAttribute("data-active")`)) &&
    (await evaluate(`clearOf("req").hidden`)) === true);
await evaluate(`triggerOf("req").focus(); null`);
await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
await check("filter: ...and after a pick it still offers no clear — there is nothing to go back to",
  async () => (await evaluate(`document.getElementById("req").value`)) === "infra" &&
    (await evaluate(`triggerOf("req").textContent`)) === "dd/infra" &&
    !(await evaluate(`triggerOf("req").hasAttribute("data-active")`)) &&
    (await evaluate(`clearOf("req").hidden`)) === true);

await check("filter: a DISABLED filter still shows that it filters, but its clear cannot be pressed",
  async () => (await evaluate(`clearOf("dis").hidden`)) === false && (await evaluate(`clearOf("dis").disabled`)) === true);
await click(`clearOf("dis")`);
await check("filter: ...and a press on it changes nothing", async () => (await evaluate(`document.getElementById("dis").value`)) === "m");

/* ── aria-invalid and option icons (C8) ── */

await check("select: aria-invalid on the <select> is mirrored onto the trigger the reader sees",
  async () => (await evaluate(`triggerOf("bad").getAttribute("aria-invalid")`)) === "true");
// WCAG 1.4.1 / 3.3.1: what is wrong is said in WORDS, and they reach the control the reader is on.
let axe = null;
await check("select: ...and so is its aria-describedby — in the ACCESSIBILITY TREE the trigger is invalid AND described by the error's text",
  async () => {
    axe = await axNode(`#${await evaluate(`triggerOf("bad").id`)}`);
    return axe.invalid === "true" && axe.description === "pick a model this host can run";
  },
  () => JSON.stringify(axe));
await evaluate(`document.getElementById("bad").removeAttribute("aria-invalid"); document.getElementById("bad").removeAttribute("aria-describedby"); tick()`);
await check("select: ...and follows both when the page clears them",
  async () => !(await evaluate(`triggerOf("bad").hasAttribute("aria-invalid") || triggerOf("bad").hasAttribute("aria-describedby")`)));
await check("select: an <option data-icon> puts its .ico before the label in the trigger",
  () => evaluate(`(() => { const i = triggerOf("bad").querySelector(".ico");
    return !!i && i.dataset.icon === "star" && i.nextElementSibling.matches(".select-value"); })()`));
await click(`triggerOf("bad")`);
await check("select: ...and in its row", () => evaluate(`(() => { const row = panel().querySelector(".select-option");
    return row.firstElementChild?.matches(".ico[data-icon=star]") && row.textContent === "claude"; })()`));
await press("ArrowDown"); await press("Enter");
await check("select: ...and the trigger drops it when an option without one is chosen",
  async () => !(await evaluate(`!!triggerOf("bad").querySelector(".ico")`)));

/* ── a select moved out of its wrapper is the system's list again ── */

await evaluate(`mount(\`<div id="from"><select id="mv" data-filter aria-label="kind"><option value="">all</option>
  <option value="a">agent</option><option value="s">skill</option></select></div><div id="to"></div>\`); initSelects(); null`);
await evaluate(`document.getElementById("to").append(document.getElementById("mv")); tick()`);
await check("moved: a known select moved out of its wrapper is wrapped again where it now is",
  () => evaluate(`(() => { const s = document.getElementById("mv");
    return s.parentElement.matches(".select-field") && !!s.closest("#to .filter-dd") && !!triggerOf("mv"); })()`),
  () => evaluate(`document.getElementById("mv").parentElement.outerHTML.slice(0, 120)`));
await check("moved: ...and the wrapper it left behind is gone — no trigger for a select that is not there",
  () => evaluate(`!document.querySelector("#from .select-field, #from .filter-dd")`));
await click(`triggerOf("mv")`);
await press("ArrowDown"); await press("Enter");
await check("moved: ...its new trigger opens the system's list and a pick reaches the select",
  async () => (await evaluate(`document.getElementById("mv").value`)) === "a" &&
    (await evaluate(`triggerOf("mv").textContent`)) === "agent");
await evaluate(`document.getElementById("start").focus(); document.getElementById("mv").focus(); null`);
await check("moved: ...focus aimed at the select lands on the NEW trigger (the old listeners are gone)",
  () => evaluate(`document.activeElement === triggerOf("mv")`));

/* ── which lists get a search row: only a long FILTER, or one that asks (C8) ── */

const LANGS = ["ada", "basic", "cobol", "dart", "elixir", "fortran", "go", "haskell", "idris", "java", "kotlin",
  "lua", "ml", "nim", "ocaml", "perl", "qml", "ruby", "swift", "tcl", "unison", "vala"];
await evaluate(`mount(\`
  <select id="p22" aria-label="language">${LANGS.map((l) => `<option>${l}</option>`).join("")}</select>
  <select id="f22" data-filter aria-label="language"><option value="">all</option>${LANGS.slice(0, 21).map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
\`); initSelects(); null`);
await check("scope: [premise] both selects hold 22 options, over the threshold of twenty",
  () => evaluate(`document.getElementById("p22").options.length === 22 && document.getElementById("f22").options.length === 22`));
await click(`triggerOf("p22")`);
await check("scope: a PLAIN select of 22 opens as the listbox itself, with no search row, focus on its trigger",
  () => evaluate(`panel().matches("ul.select-panel[role=listbox]") && !panel().querySelector(".select-search, input")
    && document.activeElement === triggerOf("p22")`));
await press("r");
await check("scope: ...a typed letter JUMPS to the first option it starts",
  async () => (await evaluate(`activeRow(triggerOf("p22"))`)) === "ruby", () => evaluate(`activeRow(triggerOf("p22"))`));
await press("Home");
await check("scope: ...Home moves the highlight to the first row", async () => (await evaluate(`activeRow(triggerOf("p22"))`)) === "ada");
await press("End");
await check("scope: ...End to the last", async () => (await evaluate(`activeRow(triggerOf("p22"))`)) === "vala");
await press("Escape");
await press("ArrowDown"); await press("End"); await press(" ");
await check("scope: ...and Space picks",
  async () => (await evaluate(`document.getElementById("p22").value`)) === "vala" && !(await evaluate("!!panel()")));
await click(`triggerOf("f22")`);
await check("scope: a data-filter select of 22 opens WITH the search row, and focus in its box",
  () => evaluate(`!!searchBox() && document.activeElement === searchBox()`));
await press("Escape");

/* ── the search row: above the listbox, never in it ── */

await evaluate(`mount(\`
  <div style="height: 520px"></div>
  <select id="many" data-filter aria-label="label"><option value="">all</option>
    \${Array.from({ length: 24 }, (_, i) => '<option value="l' + i + '">label ' + i + '</option>').join("")}</select>
  <select id="few" data-search aria-label="scope"><option>user</option><option>project</option><option>local</option></select>
  <button id="after" type="button">after</button>
  <select id="grouped" data-search aria-label="model"><option value="">default</option>
    <optgroup label="anthropic"><option>claude</option><option>fable</option></optgroup>
    <optgroup label="openai"><option>codex</option></optgroup></select>
  <div style="height: 1200px"></div>
\`); initSelects(); scrollTo(0, 0); null`);

await evaluate("log.length = 0; null");
await click(`triggerOf("many")`);
await check("search row: a long filter opens a div.select-panel — the search row, THEN the ul.select-list listbox",
  () => evaluate(`panel().matches("div.select-panel") && panel().children[0].matches("div.select-search")
    && panel().children[1].matches("ul.select-list[role=listbox]") && !listbox().querySelector("input")`));
await check("search row: focus moves INTO its box, so it can be typed into",
  () => evaluate(`document.activeElement === searchBox()`));
await check("search row: the box keeps type=search, is named, and points at the listbox (aria-controls)",
  async () => (await evaluate(`searchBox().type`)) === "search" &&
    (await evaluate(`searchBox().getAttribute("aria-label")`)) === "search label" &&
    (await evaluate(`searchBox().getAttribute("aria-controls") === listbox().id`)));
// THE DIALOG SHAPE (lead ruling): read off the accessibility tree, since that is what is announced.
let axd = null;
await check("search row: in the ACCESSIBILITY TREE the popup is a DIALOG, named for its facet",
  async () => { axd = await axNode(".select-panel"); return axd.role === "dialog" && axd.name === "label"; },
  () => JSON.stringify(axd));
await check("search row: ...the trigger pops up a DIALOG, is expanded, controls the dialog — and points at nothing inside it",
  async () => {
    axd = await axNode(`#${await evaluate(`triggerOf("many").id`)}`);
    return axd.hasPopup === "dialog" && axd.expanded === true && axd.controls?.join() === (await evaluate("panel().id")) &&
      axd.activedescendant === undefined;
  },
  () => JSON.stringify(axd));
await check("search row: ...and the box in it is the COMBOBOX: expanded, autocompleting a list, controlling the listbox, pointing at the highlighted row",
  async () => {
    axd = await axNode(".select-search input");
    return axd.role === "combobox" && axd.expanded === true && axd.autocomplete === "list" &&
      axd.controls?.join() === (await evaluate("listbox().id")) &&
      axd.activedescendant?.join() === (await evaluate(`panel().querySelector('[data-active="true"]').id`));
  },
  () => JSON.stringify(axd));
// Whichever element is the listbox — the panel itself, or a list inside it — is the one measured.
const LISTBOX = ".select-panel[role=listbox], .select-panel [role=listbox]";
let ax = null;
await check("search row: in the ACCESSIBILITY TREE the listbox owns only options — 25 of them, no searchbox, no text",
  async () => { ax = await axTree(LISTBOX); return ax.role === "listbox" && ax.children.length === 25 && ax.children.every((c) => c.role === "option"); },
  () => JSON.stringify(ax?.children.filter((c) => c.role !== "option").slice(0, 4)));
await check("search row: ...and the listbox is named for what it lists",
  () => ax.name === "label", () => `name "${ax?.name}"`);
await typeText("1");
await check("search row: typing narrows to the labels containing the text, and the \"all\" row steps aside",
  async () => (await evaluate("rows().join(',')")) === "label 1,label 10,label 11,label 12,label 13,label 14,label 15,label 16,label 17,label 18,label 19,label 21",
  () => evaluate("rows().join(',')"));
await check("search row: the first match is highlighted, pointed at FROM THE BOX (aria-activedescendant)",
  async () => (await evaluate("activeRow()")) === "label 1");
await press("ArrowDown");
await check("search row: ArrowDown moves through the matches", async () => (await evaluate("activeRow()")) === "label 10");
await typeText("zz");
await check("search row: nothing matching says so, below the listbox and outside it",
  async () => (await evaluate("rows().length")) === 0 &&
    (await evaluate(`drawn(panel().querySelector(".select-empty"))`)) &&
    (await evaluate(`panel().querySelector(".select-empty").textContent`)) === "no matches" &&
    (await evaluate(`!listbox().contains(panel().querySelector(".select-empty"))`)) &&
    (await evaluate("activeRow()")) === null);
await evaluate(`(() => { const i = searchBox(); i.value = "label 2";
  i.dispatchEvent(new Event("input", { bubbles: true })); })(); null`);
await press("Enter");
await check("search row: Enter picks the highlighted match",
  async () => (await evaluate(`document.getElementById("many").value`)) === "l2" &&
    (await evaluate("log.filter((e) => e.endsWith(':many')).join(',')")) === "input:many,change:many",
  async () => `value ${await evaluate(`document.getElementById("many").value`)}, log ${await evaluate("log.join(',')")}`);
await check("search row: the query's own keystrokes never reached the page as input/change events",
  async () => !(await evaluate("log.some((e) => /^(input|change):$/.test(e))")), () => evaluate("log.join(',')"));
await check("search row: ...closes, and hands focus back to the trigger",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement === triggerOf("many")`)));

// The value in force matches the query too; the FIRST match must still be the highlight.
await evaluate(`document.getElementById("many").value = "l12"; document.getElementById("many").dispatchEvent(new Event("change")); null`);
await click(`triggerOf("many")`);
await check("search row: [premise] it opens on the value in force", async () => (await evaluate("activeRow()")) === "label 12");
await typeText("1");
await check("search row: once anything is typed the FIRST match is the highlight, even when the value in force matches",
  async () => (await evaluate("activeRow()")) === "label 1", () => evaluate("activeRow()"));
await press("Enter");
await check("search row: ...so \"type, Enter\" picks what was narrowed to",
  async () => (await evaluate(`document.getElementById("many").value`)) === "l1");

// A press on the row's padding — not on the box — must leave focus in the box.
await click(`triggerOf("many")`);
await evaluate(`scrollTo(0, 0); null`);
const row = await evaluate(`box(".select-search")`);
await pressAt(row.left + 2, row.top + 2);
await check("search row: a press on the row's PADDING keeps focus in the box — only the box takes a press",
  async () => (await evaluate(`!!panel() && document.activeElement === searchBox()`)),
  () => evaluate(`document.activeElement.tagName + "." + document.activeElement.className`));
await press("Escape");

await press("7");
await check("search row: a letter typed on the closed trigger opens it AS the search, not a lost key",
  async () => (await evaluate(`searchBox()?.value`)) === "7" && (await evaluate("rows().join(',')")) === "label 7,label 17");
await press("Escape");
await check("search row: Escape closes and returns focus to the trigger",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement === triggerOf("many")`)));
await click(`triggerOf("few")`);
await check("search row: `data-search` asks for one on a short list too", () => evaluate(`!!searchBox()`));
await press("Tab");
await check("search row: Tab closes it and moves on from the TRIGGER, not from the end of <body>",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement.id`)) === "after",
  () => evaluate("document.activeElement.id || document.activeElement.tagName"));
// THE BOX'S EVENTS ARE THE LIST'S OWN: a page listening on the document, in either phase, hears none
// of them — not a keystroke, not the `change` the browser fires as the edited box blurs (Tab) or
// leaves the page (Escape). The <select>'s own input/change on a pick are asserted above.
await evaluate(`window.leaked = []; for (const type of ["input", "change"]) for (const capture of [true, false])
  document.addEventListener(type, (e) => { if (e.target.closest?.(".select-panel")) leaked.push(type + (capture ? "/capture" : "/bubble")); }, capture); null`);
await click(`triggerOf("many")`);
await typeText("ab");
await press("Tab");
await click(`triggerOf("many")`);
await typeText("cd");
await press("Escape");
await check("search row: a document listener, capture or bubble, hears none of the box's input/change — typed, blurred by Tab, removed by Escape",
  async () => (await evaluate("leaked.length")) === 0, () => evaluate("leaked.join(',')"));
// ...and it is only the RUNTIME's box that is silenced: a window-capture listener added after
// initSelects() hears none of it either, while a box a page or framework rendered to the same
// contract (`.select-panel .select-search`) keeps every one of its events — root, form, document,
// both phases.
await evaluate(`window.lateHeard = 0; addEventListener("input", (e) => { if (e.target.closest?.(".select-search")) lateHeard += 1; }, true); null`);
await click(`triggerOf("many")`);
await typeText("ef");
await press("Escape");
await check("search row: a window-capture listener added AFTER initSelects() hears none of the runtime box's keystrokes",
  async () => (await evaluate("lateHeard")) === 0, () => evaluate("String(lateHeard)"));
await evaluate(`document.body.insertAdjacentHTML("beforeend", '<div id="page-root" style="position: fixed; right: 0; bottom: 0"><form id="page-form"><div class="select-panel" id="page-panel">' +
  '<div class="select-search"><div class="search-field"><input type="search" id="page-box" aria-label="page search"></div></div></div></form></div>');
  window.pageHeard = new Set();
  for (const [name, target] of [["root", $("#page-root")], ["form", $("#page-form")], ["document", document]])
    for (const type of ["input", "change"]) for (const capture of [true, false])
      target.addEventListener(type, (e) => { if (e.target.id === "page-box") pageHeard.add(name + "/" + type + (capture ? "/capture" : "/bubble")); }, capture);
  $("#page-box").focus(); null`);
await typeText("page");
await evaluate(`$("#page-box").blur(); null`);
await check("search row: a PAGE-owned box in the same classes reaches its root, form and document listeners — input and change, both phases (12)",
  async () => (await evaluate("pageHeard.size")) === 12, () => evaluate("[...pageHeard].join(',')"));
await evaluate(`$("#page-root").remove(); scrollTo(0, 0); null`);

// A POLL THAT SHRINKS AN OPEN DIALOG TO A LISTBOX: the rebuilt popup has no box to hold focus, so
// focus goes back to the trigger — which carries the highlight again, and the keys still work.
await evaluate(`document.getElementById("many").value = ""; document.getElementById("many").dispatchEvent(new Event("change")); null`);
await click(`triggerOf("many")`);
await typeText("1");
await evaluate(`(() => { const s = document.getElementById("many"); while (s.options.length > 6) s.lastElementChild.remove(); })(); tick()`);
const shrunk = () => evaluate(`({ panel: panel()?.getAttribute("role") ?? null, focus: document.activeElement === triggerOf("many")
  ? "trigger" : document.activeElement.tagName, row: activeRow(triggerOf("many")) })`);
await check("search row: when a poll shrinks the open dialog to a plain listbox, focus goes to the TRIGGER, which points at a row",
  async () => { const s = await shrunk(); return s.panel === "listbox" && s.focus === "trigger" && s.row !== null; },
  async () => JSON.stringify(await shrunk()));
const before = await evaluate(`activeRow(triggerOf("many"))`);
// Pressed only where the reader's focus is on the trigger: with focus lost to <body> (the bug) the key
// scrolls the page instead, and left the page in a state that aborted a later section.
if (await evaluate(`document.activeElement === triggerOf("many")`)) await press("ArrowDown");
await check("search row: ...and ArrowDown moves the highlight there",
  async () => { const after = await evaluate(`activeRow(triggerOf("many"))`); return !!before && !!after && after !== before; },
  async () => `${before} -> ${await evaluate(`activeRow(triggerOf("many"))`)}`);
// Closed by a press outside, not by Escape: with focus lost to <body> (the bug) Escape reaches
// nothing, and a list left open would take every later section down with it.
await click(`$("#after")`);

const popupOf = (id) => evaluate(`triggerOf(${JSON.stringify(id)}).getAttribute("aria-haspopup")`);
await evaluate(`document.getElementById("few").removeAttribute("data-search"); tick()`);
const withoutRow = await popupOf("few");
await evaluate(`document.getElementById("few").setAttribute("data-search", ""); tick()`);
await check("search row: the trigger says which popup it opens BEFORE it opens — `data-search` taken away and put back",
  async () => withoutRow === "listbox" && (await popupOf("few")) === "dialog",
  async () => `without: ${withoutRow}, with: ${await popupOf("few")}`);

// <optgroup>: a GROUP holding its rows, named by its heading — never a heading row in the listbox.
await click(`triggerOf("grouped")`);
ax = null;
await check("optgroup: the listbox owns an option and two GROUPS, each named by its <optgroup> label as written",
  async () => { ax = await axTree(LISTBOX); return ax.children.map((c) => `${c.role}:${c.name}`).join(",") === "option:default,group:anthropic,group:openai"; },
  () => ax?.children.map((c) => `${c.role}:${c.name}`).join(","));
await check("optgroup: ...and each group holds its own options and nothing else (the visible heading is not read twice)",
  () => ax.children[1]?.children.join(",") === "option,option" && ax.children[2]?.children.join(",") === "option",
  () => JSON.stringify(ax?.children.slice(1)));
await typeText("codex");
await check("optgroup: a group with no row left under the query is not drawn at all",
  async () => (await evaluate("rows().join(',')")) === "codex" &&
    (await evaluate(`[...panel().querySelectorAll(".select-optgroup")].map((g) => drawn(g)).join(",")`)) === "false,true");
await press("Escape");

// Where the list opens is KEPT while the query shrinks it — asserted where re-choosing would move it.
await evaluate(`mount(\`<div style="position: fixed; left: 20px; top: 440px">
  <select id="side" data-filter aria-label="label"><option value="">all</option>
    \${Array.from({ length: 24 }, (_, i) => '<option value="l' + i + '">label ' + i + '</option>').join("")}</select></div>\`);
  initSelects(); null`);
await click(`triggerOf("side")`);
const sideOf = () => evaluate(`box(panel()).bottom <= box(triggerOf("side")).top + 1 ? "above" : "below"`);
await check("search row: [premise] a long filter this close to the bottom opens ABOVE its trigger", async () => (await sideOf()) === "above");
await typeText("label 2");
await check("search row: the side it opened on is KEPT while the list shrinks — though the 5 rows left would now fit below",
  async () => (await evaluate("rows().length")) === 5 && (await sideOf()) === "above" &&
    (await evaluate(`box(panel()).height <= innerHeight - box(triggerOf("side")).bottom - 4 - 8`)),
  async () => `side ${await sideOf()}, rows ${await evaluate("rows().length")}, panel ${await evaluate("box(panel()).height")}px, room below ${await evaluate(`innerHeight - box(triggerOf("side")).bottom - 12`)}px`);
await press("Escape");

// A row the arrows bring into view lands BELOW the sticky search row, not under it — on a phone too.
for (const [label, coarse] of [["a mouse", false], ["a coarse pointer (a 53px row)", true]]) {
  if (coarse) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await evaluate(`triggerOf("side").focus(); null`);
  await press("ArrowDown");
  await evaluate(`panel().scrollTop = panel().scrollHeight; tick()`);
  await press("ArrowDown");
  await check(`search row: under ${label}, a row scrolled back into view sits below the search row, not behind it`,
    () => evaluate(`box(activeRowEl()).top >= box(".select-search").bottom - 0.5`),
    async () => `row top ${await evaluate("box(activeRowEl()).top")}, search row bottom ${await evaluate(`box(".select-search").bottom`)}`);
  await press("Escape");
  if (coarse) await send("Emulation.setTouchEmulationEnabled", { enabled: false });
}

/* ── the list is placed BEFORE anything scrolls ── */

await evaluate(`mount(\`<select id="far">\${Array.from({ length: 80 }, (_, i) =>
  "<option" + (i === 70 ? " selected" : "") + ">entry " + i + "</option>").join("")}</select><div style="height: 3000px"></div>\`);
  initSelects(); scrollTo(0, 0); null`);
await click(`triggerOf("far")`);
await check("select: opening on a value far down the list scrolls the LIST to it, never the page",
  async () => (await evaluate("scrollY")) === 0 && (await evaluate("panel().scrollTop")) > 0 && (await evaluate("activeRow(triggerOf('far'))")) === "entry 70",
  async () => `page scrollY ${await evaluate("scrollY")}, list scrollTop ${await evaluate("panel().scrollTop")}`);
await press("Escape");
await evaluate("scrollTo(0, 0); null");

/* ── a scrolled list stays put ── */

await evaluate(`mount(\`<div style="height: 200px"></div>
  <select id="long"><option>first</option>\${Array.from({ length: 80 }, (_, i) => "<option>entry " + i + "</option>").join("")}</select>
  <div style="height: 1400px"></div>\`); initSelects(); scrollTo(0, 0); null`);
await click(`triggerOf("long")`);
await evaluate(`panel().scrollTop = 300; tick()`);
await evaluate(`scrollBy(0, 12); new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))`);
await check("select: when the PAGE scrolls, an open list follows its trigger and keeps its own scroll",
  async () => (await evaluate("scrollY")) === 12 && (await evaluate("panel().scrollTop")) === 300 &&
    near(await evaluate(`box(panel()).top`), await evaluate(`box(triggerOf("long")).bottom + 4`)),
  async () => `page scrollY ${await evaluate("scrollY")}, list scrollTop ${await evaluate("panel().scrollTop")}, list top ${await evaluate("box(panel()).top")}, trigger bottom ${await evaluate(`box(triggerOf("long")).bottom`)}`);
await press("Escape");
await evaluate("scrollTo(0, 0); null");

/* ── inside a modal <dialog> ── */

await evaluate(`mount(\`<dialog id="dlg"><select id="indlg" data-filter data-search aria-label="scope">
  <option value="">all</option><option value="u">user</option><option value="p">project</option></select></dialog>\`);
  initSelects(); document.getElementById("dlg").showModal(); null`);
await click(`triggerOf("indlg")`);
await check("dialog: the list opens INSIDE the dialog — the top layer paints over anything on <body>",
  () => evaluate(`panel()?.parentElement === document.getElementById("dlg")`));
await press("Escape");
await check("dialog: Escape in the search row closes the list and NOT the dialog",
  async () => !(await evaluate("!!panel()")) && (await evaluate(`document.getElementById("dlg").open`)));
await evaluate(`document.getElementById("dlg").close(); null`);

/* ═══ search.js — .search-field ═══════════════════════════════════════════ */

await evaluate(`mount(\`
  <div class="search-field" id="sf"><input type="search" id="q" aria-label="search skills" placeholder="search…">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div class="search-field" id="sf2"><input type="search" id="q2" value="restored" aria-label="restored">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div id="host"><div class="search-field" id="sf3"><input type="search" id="q3" aria-label="in a dialog">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div></div>
  <div class="search-field" id="sfd"><input type="search" id="qd" value="kept" aria-label="switched off" disabled>
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div class="search-field" id="sf4"><input type="search" id="q4" value="later" aria-label="switched off later">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div class="search-field" id="sf5"><input type="search" id="q5" aria-label="re-rendered">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <button type="button" id="elsewhere">elsewhere</button>
\`); initSearchFields(); window.escapes = 0;
  document.getElementById("host").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { escapes += 1; window.lastPrevented = e.defaultPrevented; } }); null`);

await check("search: a box that already holds a value shows its clear from the start",
  async () => (await evaluate(`$("#sf2 .search-clear").hidden`)) === false);
await check("search: an empty one does not, and a hidden clear is really not drawn",
  async () => (await evaluate(`$("#sf .search-clear").hidden`)) === true && !(await evaluate(`drawn("#sf .search-clear")`)));
await click(`$("#q")`);
await typeText("abc");
await check("search: typing shows the clear", async () => (await evaluate(`$("#sf .search-clear").hidden`)) === false);
await evaluate("log.length = 0; null");
await click(`$("#sf .search-clear")`);
await check("search: the clear empties the box", async () => (await evaluate(`$("#q").value`)) === "");
await check("search: ...as a person would: input, then change, from the input, bubbling",
  async () => (await evaluate("log.join(',')")) === "input:q,change:q", () => evaluate("log.join(',')"));
await check("search: ...hides itself and leaves focus in the box",
  async () => (await evaluate(`$("#sf .search-clear").hidden`)) === true && (await evaluate(`document.activeElement.id`)) === "q");

// Focus goes back BEFORE the events: a handler that moves focus on purpose keeps it where it put it.
await evaluate(`$("#q5").addEventListener("change", () => $("#elsewhere").focus()); null`);
await click(`$("#q5")`);
await typeText("abc");
await click(`$("#sf5 .search-clear")`);
await check("search: a change handler that moves focus keeps it there — the clear focuses the box BEFORE dispatching",
  async () => (await evaluate(`document.activeElement.id`)) === "elsewhere", () => evaluate("document.activeElement.id"));

await check("search: a DISABLED box holding a query shows its clear, and the clear is disabled too",
  async () => (await evaluate(`$("#sfd .search-clear").hidden`)) === false && (await evaluate(`$("#sfd .search-clear").disabled`)) === true);
await evaluate("log.length = 0; null");
await click(`$("#sfd .search-clear")`);
await check("search: ...a press on it clears nothing and fires nothing",
  async () => (await evaluate(`$("#qd").value`)) === "kept" && (await evaluate("log.length")) === 0,
  async () => `value "${await evaluate(`$("#qd").value`)}", log ${await evaluate("log.join(',')")}`);
await check("search: ...and it looks it: .45, no pointer",
  async () => (await evaluate(`cs("#sfd .search-clear", "opacity")`)) === "0.45" && (await evaluate(`cs("#sfd .search-clear", "cursor")`)) === "default");
await evaluate(`$("#q4").disabled = true; tick()`);
await check("search: a box switched off AFTER it was drawn takes its clear with it",
  async () => (await evaluate(`$("#sf4 .search-clear").disabled`)) === true);
await evaluate(`$("#q4").disabled = false; tick()`);
await check("search: ...and back on again", async () => (await evaluate(`$("#sf4 .search-clear").disabled`)) === false);

await click(`$("#q3")`);
await typeText("x");
await evaluate("log.length = 0; null");
await press("Escape");
await check("search: Escape in a FILLED box clears it",
  async () => (await evaluate(`$("#q3").value`)) === "" && (await evaluate("log.join(',')")) === "input:q3,change:q3");
await check("search: ...and goes no further — the dialog around it never hears the key",
  async () => (await evaluate("escapes")) === 0);
await press("Escape");
await check("search: Escape in an EMPTY box does nothing, so it reaches the dialog",
  async () => (await evaluate("escapes")) === 1 && (await evaluate(`$("#q3").value`)) === "");
await evaluate(`$("#q3").setAttribute("aria-expanded", "true"); null`);
await typeText("y");
await press("Escape");
await check("search: an OPEN autocomplete keeps its Escape — it reaches the page, not prevented, to dismiss the list",
  async () => (await evaluate("escapes")) === 2 && (await evaluate("lastPrevented")) === false);
await evaluate(`$("#q3").removeAttribute("aria-expanded"); null`);

// The pending line: markPending at t=0 and t≈250 with ms=400 → still pending past t=400 (the first
// call alone would have expired there), gone 400 after the second. The sequence runs IN THE PAGE and is
// timed from each call as it happened: the timers under test are the page's, and a protocol round trip
// between a wait and its read is no part of them. On a loaded Linux host the old fixed t=800 read came
// before the second call's own deadline and saw the line still pending.
const pend = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))), on = () => $("#sf").hasAttribute("data-pending");
  const t0 = performance.now(); markPending($("#sf"), 400);
  const marked = [on(), $("#sf").style.getPropertyValue("--pending-ms"), cs("#sf", "animation-name", "::after"), cs("#sf", "animation-duration", "::after")];
  await sleep(t0 + 250 - performance.now());
  const t1 = performance.now(); markPending($("#q"), 400); // anything inside the field will do
  await sleep(t0 + 500 - performance.now());
  const read = performance.now() - t0, restarted = on();
  await sleep(t1 + 550 - performance.now());
  return { marked, second: Math.round(t1 - t0), read: Math.round(read), restarted, settled: !on() }; })()`);
await check("pending: markPending marks the field and gives the line its duration",
  () => pend.marked[0] === true && pend.marked[1] === "400ms", JSON.stringify(pend));
await check("pending: the line is the dd-drain animation, over exactly that long",
  () => pend.marked[2] === "dd-drain" && pend.marked[3] === "0.4s", JSON.stringify(pend));
// read between the first call's deadline and the second's, with the second made before the first expired
await check("pending: each call RESTARTS it — still pending past the first call's deadline",
  () => pend.restarted && pend.second < 400 && pend.read > 400 && pend.read < pend.second + 400, JSON.stringify(pend));
await check("pending: ...and it settles `ms` after the LAST call", () => pend.settled, JSON.stringify(pend));
await evaluate(`markPending($("#sf2"), 5000); null`);
await click(`$("#sf2 .search-clear")`);
await check("pending: clearing the box settles it at once — the pending query was thrown away",
  async () => !(await evaluate(`$("#sf2").hasAttribute("data-pending")`)));
await evaluate(`document.documentElement.classList.add("anim-off"); markPending($("#sf"), 400); null`);
await check("pending: html.anim-off stops the drain (the line just stands)",
  async () => (await evaluate(`cs("#sf", "animation-name", "::after")`)) === "none");
await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await check("pending: prefers-reduced-motion stops it too",
  async () => (await evaluate(`cs("#sf", "animation-name", "::after")`)) === "none");
await send("Emulation.setEmulatedMedia", { features: [] });

/* ═══ sort.js — .sort-ctl ═════════════════════════════════════════════════ */

await evaluate(`mount(\`
  <div class="sort-ctl btn-group" role="group" aria-label="sort" id="sc">
    <button type="button" class="sort-dir" data-dir="asc" aria-label="a label that lies"></button>
    <select data-sort aria-label="sort by" id="sortby"><option value="name">name</option><option value="updated">updated</option></select>
  </div>\`); initSelects(); initSortControls(); null`);

await check("sort: the arrow is named by what pressing it WILL do — an authored label is brought in line",
  async () => (await evaluate(`$(".sort-dir").getAttribute("aria-label")`)) === "sort descending");
const up = await evaluate(`probe("var(--ico-arrow-up)", "mask-image")`);
const down = await evaluate(`probe("var(--ico-arrow-down)", "mask-image")`);
await check("sort: ascending shows the up arrow", async () => (await evaluate(`cs(".sort-dir", "mask-image", "::before")`)) === up);
await evaluate("log.length = 0; null");
await click(`$(".sort-dir")`);
await check("sort: a press flips the direction", async () => (await evaluate(`$(".sort-dir").dataset.dir`)) === "desc");
await check("sort: ...renames the button for the NEXT press", async () => (await evaluate(`$(".sort-dir").getAttribute("aria-label")`)) === "sort ascending");
await check("sort: ...shows the down arrow", async () => (await evaluate(`cs(".sort-dir", "mask-image", "::before")`)) === down);
await check("sort: ...and says so once: sortchange { field, dir } on the .sort-ctl",
  async () => (await evaluate("log.join(',')")) === "sortchange:sc:name/desc", () => evaluate("log.join(',')"));
await evaluate(`log.length = 0; triggerOf("sortby").focus(); null`);
await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
await check("sort: picking a field is ONE sortchange carrying the new field and the direction in force",
  async () => (await evaluate("log.filter((e) => e.startsWith('sortchange')).join(',')")) === "sortchange:sc:updated/desc",
  () => evaluate("log.join(',')"));
await evaluate(`$("#sc").addEventListener("sortchange", (e) => {
  if (e.detail.field === "name") $(".sort-dir").dataset.dir = "asc"; }, { once: true }); null`);
await evaluate(`triggerOf("sortby").focus(); null`);
await press("ArrowDown"); await press("Home"); await press("Enter");
await evaluate("tick()");
await check("sort: a page that resets the direction from its handler gets the label for free",
  async () => (await evaluate(`$(".sort-dir").dataset.dir`)) === "asc" &&
    (await evaluate(`$(".sort-dir").getAttribute("aria-label")`)) === "sort descending");
await check("sort: the two halves share one edge", () => evaluate(
  `Math.abs(box(".sort-dir").right - 1 - box(triggerOf("sortby").parentElement).left) <= 0.5`));

/* ═══ filters.css — the boxes ═════════════════════════════════════════════ */

await evaluate(`mount(\`
  <search class="filter-bar" id="bar">
    <div class="search-field" id="bsf"><input type="search" id="bq" aria-label="search" value="x">
      <button type="button" class="search-clear" aria-label="clear search"></button></div>
    <select data-filter aria-label="source" id="bsrc"><option value="">all</option><option value="s" selected>seedr</option></select>
    <select data-filter data-search aria-label="scope" id="bscope"><option value="">all</option><option value="u">user</option></select>
    <div class="sort-ctl btn-group" role="group" aria-label="sort"><button type="button" class="sort-dir" data-dir="asc"></button>
      <select data-sort aria-label="sort by" id="bsort"><option>name</option></select></div>
  </search>
  <div class="search-field" id="esf"><input type="search" id="eq" aria-label="empty"><button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div class="search-field" id="isf"><input type="search" id="iq" aria-label="bad query" aria-invalid="true" value="((("><button type="button" class="search-clear" aria-label="clear search"></button></div>
  <div class="chip-set" role="group" aria-label="tags">
    <button type="button" class="chip" id="c-all" aria-pressed="true">all</button>
    <button type="button" class="chip" id="c-off" aria-pressed="false">#agents <span class="chip-count">12</span></button>
    <button type="button" class="chip" id="c-id" aria-pressed="true" style="--chip-accent: rgb(0, 128, 0)">ddmini</button>
    <button type="button" class="chip" id="c-dis" aria-pressed="false" disabled>disabled</button>
    <button type="button" class="chip" id="c-pc" aria-pressed="true">#infra <span class="chip-count">31</span></button>
  </div>
  <div class="filter-chips" role="group" aria-label="in force"><button type="button" class="chip chip--remove" id="c-rm" aria-label="remove filter source: seedr"><span class="chip-key">source:</span> seedr</button></div>
  <button type="button" class="value-filter" id="vf" aria-label="filter by source: official">official</button>
  <input type="search" id="stray" aria-label="a bare search input, outside any .search-field">
\`); initSelects(); initSearchFields(); initSortControls(); null`);

const h = (expression) => evaluate(`box(${expression}).height`);
await park();
await check("css: the search box, the filter trigger and its clear are --control-h (28px) tall",
  async () => (await h(`"#bq"`)) === 28 && (await h(`triggerOf("bsrc")`)) === 28 && (await h(`clearOf("bsrc")`)) === 28,
  async () => [await h(`"#bq"`), await h(`triggerOf("bsrc")`), await h(`clearOf("bsrc")`)].join("/"));
// A filter is the plain trigger with a funnel, not a second box: whatever block padding components.css
// derives from --control-h is the filter's too. A padding of its own reaches 28px only through the
// min-block-size floor, so the height alone cannot see one.
const pads = (id) => evaluate(`["padding-top", "padding-bottom"].map((p) => cs(triggerOf(${JSON.stringify(id)}), p)).join(" ")`);
await check("css: the filter trigger has no block padding of its own — exactly the plain trigger's",
  async () => (await pads("bsrc")) === (await pads("bsort")),
  async () => `filter ${await pads("bsrc")}, plain ${await pads("bsort")}`);
// The sort pair is one row: its arrow stretches to the field beside it. The FIELD's own height is
// the plain select's (components.css), so this asserts the join; the arrow's 28px alone is asserted
// on the bare page below.
await check("css: the direction button and its field stand at one height",
  async () => (await h(`".sort-dir"`)) === (await h(`triggerOf("bsort")`)),
  async () => [await h(`".sort-dir"`), await h(`triggerOf("bsort")`)].join("/"));
await check("css: the clear and the direction button are 1.5rem wide",
  async () => (await evaluate(`box(clearOf("bsrc")).width`)) === 24 && (await evaluate(`box(".sort-dir").width`)) === 24);
await click(`triggerOf("bscope")`);
await check("css: no corner is rounded — all four, on every control, its glyphs, and an open list with its search row",
  () => evaluate(`[...document.querySelectorAll("#mount *, .select-panel, .select-panel *")].every((e) =>
    ["", "::before", "::after"].every((p) => { const s = getComputedStyle(e, p || null);
      return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].every((v) => v === "0px"); }))`),
  () => evaluate(`[...document.querySelectorAll("#mount *, .select-panel, .select-panel *")].flatMap((e) =>
    ["", "::before", "::after"].map((p) => { const s = getComputedStyle(e, p || null);
      const v = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
      return v.every((x) => x === "0px") ? null : (e.id || e.className) + p + " " + v.join(" "); })).filter(Boolean).slice(0, 3).join("; ")`));
await press("Escape");
await check("css: the search box's edge is --control-edge, not the --border hairline",
  async () => (await evaluate(`cs("#bq", "border-top-color")`)) === edge);
await check("css: the box keeps its text clear of the magnifier and the clear (2rem each side)",
  async () => (await evaluate(`cs("#bq", "padding-left")`)) === "32px" && (await evaluate(`cs("#bq", "padding-right")`)) === "32px");
await check("css: the magnifier sits inside the box, 10px in — and centred on it vertically",
  () => evaluate(`(() => { const f = box("#bsf"), i = box("#bq"), g = getComputedStyle($("#bsf"), "::before");
    const middle = f.top + parseFloat(g.top) + parseFloat(g.height) / 2;
    return g.position === "absolute" && g.width === "14px" && g.insetInlineStart === "10px"
      && Math.abs(middle - (i.top + i.height / 2)) <= 0.5; })()`),
  () => evaluate(`(() => { const f = box("#bsf"), i = box("#bq"), g = getComputedStyle($("#bsf"), "::before");
    return "glyph middle " + (f.top + parseFloat(g.top) + parseFloat(g.height) / 2) + ", box middle " + (i.top + i.height / 2); })()`));
await check("css: a bare input[type=search] outside a .search-field is untouched by this file",
  async () => (await evaluate(`cs("#stray", "padding-left")`)) !== "32px");

const destructive = await evaluate(`probe("var(--destructive)")`);
await check("css: an INVALID search box wears the --destructive edge at rest…",
  async () => (await evaluate(`cs("#iq", "border-top-color")`)) === destructive, () => evaluate(`cs("#iq", "border-top-color")`));
await force("#iq", ["hover"]);
await check("css: …under the pointer…", async () => (await evaluate(`cs("#iq", "border-top-color")`)) === destructive);
await force("#iq", ["focus-visible"]);
await check("css: …and in focus, where the ring is still --ring",
  async () => (await evaluate(`cs("#iq", "border-top-color")`)) === destructive &&
    (await evaluate(`cs("#iq", "outline-color")`)) === (await evaluate(`probe("var(--ring)")`)));
await force("#iq", []);

await force(".sort-dir", ["hover"]);
await check("css: hovering the direction button lights its edge and a 12% --primary tint",
  async () => (await evaluate(`cs(".sort-dir", "border-top-color")`)) === primary &&
    (await evaluate(`cs(".sort-dir", "background-color")`)) === tint);
await force(".sort-dir", []);

/*
 * WHICH OF TWO JOINED CONTROLS IS ON TOP, asserted as PIXELS. The trigger holds keyboard focus; its
 * ring's right band lies 2-4px past its edge, which is inside the clear it is joined to. Hovering the
 * clear lifts it — and it must not be lifted above the child that holds focus.
 *
 * The clear's own hover fill is a 12% tint of the ring's own hue: painted over the ring it moves the
 * pixel by ONE unit (measured on the unfixed code), too little to trust. So for this measurement the
 * hovered clear is dyed an opaque colour nothing else uses — the question is the stacking order, and
 * a dye makes it visible.
 */
await evaluate(`document.head.insertAdjacentHTML("beforeend",
  '<style id="dye">.filter-dd > .filter-clear:hover { background: rgb(0, 255, 0) !important; }</style>'); null`);
await evaluate(`$("#bsf .search-clear").focus(); null`);
await press("Tab");
await park();
await check("css: [premise] the filter trigger holds KEYBOARD focus (:focus-visible), its clear showing",
  () => evaluate(`document.activeElement === triggerOf("bsrc") && triggerOf("bsrc").matches(":focus-visible") && drawn(clearOf("bsrc"))`));
const ringAt = await evaluate(`(() => { const t = box(triggerOf("bsrc")), c = box(clearOf("bsrc"));
  const x = Math.round(t.right) + 3, y = Math.round(t.top + t.height / 2);
  return { x, y, inClear: x > c.left && x < c.right }; })()`);
const ringAlone = await pixel(ringAt.x, ringAt.y);
await hover(`clearOf("bsrc")`);
const ringHovered = await pixel(ringAt.x, ringAt.y);
await check("css: a HOVERED clear does not paint over the focused trigger's ring (.btn-group lifts focus above hover)",
  () => ringAt.inClear && ringHovered === ringAlone && ringAlone !== "rgb(0, 255, 0)",
  () => `ring pixel ${ringAlone} alone, ${ringHovered} with the clear hovered (x in clear: ${ringAt.inClear})`);
await park();
await evaluate(`document.getElementById("dye").remove(); null`);

await check("css: a pressed chip is --primary, bold, on a 12% --primary fill",
  async () => (await evaluate(`cs("#c-all", "color")`)) === primary && (await evaluate(`cs("#c-all", "font-weight")`)) === "700" &&
    (await evaluate(`cs("#c-all", "background-color")`)) === tint);
await check("css: an unpressed chip is muted, regular weight, on the --border hairline",
  async () => (await evaluate(`cs("#c-off", "color")`)) === muted &&
    (await evaluate(`cs("#c-off", "font-weight")`)) === "400" &&
    (await evaluate(`cs("#c-off", "border-top-color")`)) === (await evaluate(`probe("var(--border)")`)));
await check("css: a count inside a PRESSED chip takes the chip's ink — muted on the 12% fill fails AA",
  async () => (await evaluate(`cs("#c-pc .chip-count", "color")`)) === primary &&
    (await evaluate(`cs("#c-off .chip-count", "color")`)) === muted);
// Rest BEFORE the forced hover: clearing a FORCED pseudo-state does not restyle descendants keyed
// on it (measured — `.chip--remove:hover .chip-key` kept its hover ink with :hover false), which is
// a DevTools artifact, not the page's behaviour.
await check("css: the key of a remove chip at rest is muted", async () => (await evaluate(`cs("#c-rm .chip-key", "color")`)) === muted);
await force("#c-rm", ["hover"]);
await check("css: ...and on the hovered remove chip's fill it takes the chip's ink",
  async () => (await evaluate(`cs("#c-rm .chip-key", "color")`)) === primary);
await force("#c-rm", []);
await check("css: an identity chip takes its --chip-accent instead of --primary",
  async () => (await evaluate(`cs("#c-id", "color")`)) === "rgb(0, 128, 0)" && (await evaluate(`cs("#c-id", "border-top-color")`)) === "rgb(0, 128, 0)");
await check("css: a remove chip is --primary with its × after the label",
  async () => (await evaluate(`cs("#c-rm", "color")`)) === primary &&
    (await evaluate(`cs("#c-rm", "mask-image", "::after")`)) === (await evaluate(`probe("var(--ico-x)", "mask-image")`)));

await send("Emulation.setEmulatedMedia", { media: "print" });
await check("print: a search box holding NO query does not print — its clear is hidden exactly then",
  async () => (await evaluate(`cs("#esf", "display")`)) === "none");
await check("print: ...one holding a query prints, without its clear",
  async () => (await evaluate(`cs("#bsf", "display")`)) !== "none" && (await evaluate(`cs("#bsf .search-clear", "display")`)) === "none");
await check("print: a filtering trigger still prints its value; the clear beside it does not",
  async () => (await evaluate(`drawn(triggerOf("bsrc"))`)) && (await evaluate(`cs(clearOf("bsrc"), "display")`)) === "none");
await send("Emulation.setEmulatedMedia", { media: "" });

await evaluate(`$("#bsrc").disabled = true; tick()`);
await check("css: disabled is .45 opacity (chip, and a disabled filter trigger)",
  async () => (await evaluate(`cs("#c-dis", "opacity")`)) === "0.45" &&
    (await evaluate(`cs(triggerOf("bsrc"), "opacity")`)) === "0.45");

// Touch emulation is what makes (pointer: coarse) match; setEmulatedMedia accepts the feature and
// changes nothing (measured).
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await check("css: under a coarse pointer every control is at least 44px",
  async () => (await h(`"#bq"`)) >= 44 && (await h(`clearOf("bsrc")`)) >= 44 && (await h(`".sort-dir"`)) >= 44 &&
    (await h(`"#c-off"`)) >= 44 && (await evaluate(`box(".sort-dir").width`)) >= 44,
  async () => [await h(`"#bq"`), await h(`clearOf("bsrc")`), await h(`".sort-dir"`), await h(`"#c-off"`)].join("/"));
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 700, deviceScaleFactor: 1, mobile: false });
await check("css: on a phone the search takes the bar's whole first row, and the controls wrapped under it end at the bar's right edge (0.62.0)",
  async () => near(await evaluate(`box("#bsf").width`), await evaluate(`box("#bar").width`)) &&
    near(await evaluate(`box("#bar .sort-ctl").right`), await evaluate(`box("#bar").right`)) &&
    (await evaluate(`box("#bar .sort-ctl").top`)) > (await evaluate(`box("#bsf").bottom`)),
  async () => `search ${await evaluate(`box("#bsf").width`)} of ${await evaluate(`box("#bar").width`)}; sort ends ${await evaluate(`box("#bar .sort-ctl").right`)} of ${await evaluate(`box("#bar").right`)}`);
await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

/* ── load order: filters.css FIRST, components.css after it ── */

await open("/reversed");
const reversed = () => evaluate(`[box(triggerOf("rsrc")).height, cs(triggerOf("rsrc"), "padding-top"), cs(triggerOf("rkind"), "padding-top"), cs(triggerOf("rsrc"), "column-gap")].join(" ")`);
await check("css: the filter trigger does not depend on load order — filters.css first, it is still 28px, on the plain trigger's padding, with its own gap",
  async () => { const [height, filter, plain, gap] = (await reversed()).split(" "); return height === "28" && filter === plain && gap === "6px"; },
  async () => `height, filter padding, plain padding, gap: ${await reversed()}`);

/* ── self-sufficient: tokens.css + filters.css and nothing else ── */

await open("/bare");
await check("bare: the search box still has its whole box — 28px, 1px --control-edge, border-box",
  async () => (await evaluate(`box("#q").height`)) === 28 && (await evaluate(`cs("#q", "border-top-width")`)) === "1px" &&
    (await evaluate(`cs("#q", "border-top-color")`)) === (await evaluate(`probe("var(--control-edge)")`)) &&
    (await evaluate(`cs("#q", "box-sizing")`)) === "border-box");
await check("bare: the chip, the direction button and the clear keep theirs",
  async () => (await evaluate(`box("#chip").height`)) === 24 && (await evaluate(`cs("#chip", "border-top-width")`)) === "1px" &&
    (await evaluate(`box("#dir").height`)) === 28 && (await evaluate(`box("#dir").width`)) === 24 &&
    (await evaluate(`box("#clr").height`)) === 28);
await check("bare: no user-agent button chrome survives (no UA padding, no UA grey fill)",
  async () => (await evaluate(`["#dir", "#clr", "#vf", "#sclr"].every((s) => cs(s, "padding-top") === "0px")`)) &&
    (await evaluate(`["#chip", "#dir", "#clr", "#vf", "#sclr"].every((s) => cs(s, "background-color") === "rgba(0, 0, 0, 0)")`)));
for (const selector of ["#q", "#sclr", "#clr", "#dir", "#chip", "#link", "#vf"]) {
  await check(`bare: ${selector} is in the page's font — family AND size (a lost \`font: inherit\` is Arial 13.33px)`,
    () => evaluate(`cs(${JSON.stringify(selector)}, "font-family") === cs("body", "font-family") && cs(${JSON.stringify(selector)}, "font-size") === cs("body", "font-size")`),
    () => evaluate(`cs(${JSON.stringify(selector)}, "font-family") + " " + cs(${JSON.stringify(selector)}, "font-size") + " vs " + cs("body", "font-family") + " " + cs("body", "font-size")`));
}
await check("bare: a filter bar's separator draws itself — 1px wide, 1.5rem tall, on --border",
  async () => (await evaluate(`box("#sep").width`)) === 1 && (await evaluate(`box("#sep").height`)) === 24 &&
    (await evaluate(`cs("#sep", "background-color")`)) === (await evaluate(`probe("var(--border)", "background-color")`)),
  async () => `${await evaluate(`box("#sep").width`)}x${await evaluate(`box("#sep").height`)} ${await evaluate(`cs("#sep", "background-color")`)}`);

// X2: every ring is asserted HERE, where no base.css can draw one the control's own rule has lost.
const ring = await evaluate(`probe("var(--ring)")`);
for (const [label, selector] of [["the search box", "#q"], ["the search clear", "#sclr"], ["the filter clear", "#clr"],
  ["the filter trigger", "#trig"], ["the direction button", "#dir"], ["a chip", "#chip"], ["a link chip", "#link"],
  ["a value filter", "#vf"]]) {
  await force(selector, ["focus-visible"]);
  await check(`bare: ${label} draws its OWN focus ring — 2px solid --ring, 2px out`,
    async () => (await evaluate(`cs(${JSON.stringify(selector)}, "outline-style")`)) === "solid" &&
      (await evaluate(`cs(${JSON.stringify(selector)}, "outline-width")`)) === "2px" &&
      (await evaluate(`cs(${JSON.stringify(selector)}, "outline-offset")`)) === "2px" &&
      (await evaluate(`cs(${JSON.stringify(selector)}, "outline-color")`)) === ring,
    () => evaluate(`["outline-style", "outline-width", "outline-offset", "outline-color"].map((p) => cs(${JSON.stringify(selector)}, p)).join(" ")`));
  await force(selector, []);
}
await force("#q", ["focus-visible"]);
await check("bare: focus on the search box is ONE box — the ring and a --primary edge on the input, nothing on the wrapper",
  async () => (await evaluate(`cs("#q", "border-top-color")`)) === (await evaluate(`probe("var(--primary)")`)) &&
    (await evaluate(`cs("#sf", "outline-style")`)) === "none");
await force("#q", []);

// X3: `hidden` hides every class here — by the ONE rule tokens.css carries, not by a guard per class.
const HIDEABLE = ["#sf", "#sclr", "#fdd", "#trig", "#clr", "#sc", "#dir", "#bar", "#sep", "#cs", "#chip", "#link",
  "#fch", "#rm", "#vf", "#mc", "#rc", "#lm", "#ss", "#sl", "#og", "#se"];
const stillDrawn = await evaluate(`${JSON.stringify(HIDEABLE)}.filter((s) => { const e = $(s); e.hidden = true;
  const shown = e.getClientRects().length > 0; e.hidden = false; return shown; })`);
await check(`bare: \`hidden\` hides each of ${HIDEABLE.length} components — the one rule in tokens.css, no guard per class`,
  () => stillDrawn.length === 0, () => `still drawn: ${stillDrawn.join(" ")}`);

/*
 * X1 · FORCED COLOURS, measured in PAINTED PIXELS. Chromium repaints author backgrounds with Canvas and
 * puts a Canvas backplate behind text, so a mask glyph, a state drawn by fill, and text on a redrawn
 * state can each vanish while every computed value still reads 21:1 (WP7 measured 1.78:1 and 1.14:1 in
 * pixels that computed-colour checks passed). So every assertion here is read off a screenshot, under
 * both palettes the emulation offers (light and dark) and, for the glyphs, on all four themes — a glyph
 * that keeps an AUTHOR colour passes on one cell and disappears on another.
 *
 *   · a glyph is shot twice, with and without itself; its contrast is the largest between the same
 *     pixel in the two shots — what it paints against what it covers. >= 3:1 (WCAG 1.4.11);
 *   · a state pair: the part that shows the state paints differently in the two states;
 *   · text on a state: the commonest colour in its line box is what it sits on (a backplate included),
 *     the pixel furthest from that is its ink. >= 4.5:1.
 *
 * On the FULL page, not the bare one: the filter trigger's glyph is sized as a flex item of the
 * trigger components.css draws, and on a page without components.css it paints nothing at all —
 * measured, 1.00:1 — which says nothing about the filter as it ships.
 */
await open("/main");
await evaluate(`mount(\`
  <div class="search-field" id="sf"><input type="search" aria-label="search" value="x"><button type="button" class="search-clear" id="sclr" aria-label="clear search"></button></div>
  <select data-filter aria-label="source" id="fx-rest"><option value="">all</option><option value="s">seedr</option></select>
  <select data-filter aria-label="type" id="fx-on"><option value="">all</option><option value="a" selected>agent</option></select>
  <button type="button" class="sort-dir" id="dir" data-dir="asc" aria-label="sort descending"></button>
  <button type="button" class="sort-dir" id="dir-off" data-dir="asc" aria-label="sort descending" disabled></button>
  <div class="filter-chips" role="group" aria-label="in force"><button type="button" class="chip chip--remove" id="rm" aria-label="remove filter source: seedr"><span class="chip-key">source:</span> seedr</button></div>
  <div class="search-field" id="sf-pend" data-pending style="--pending-ms: 600000ms"><input type="search" aria-label="pending"></div>
  <div class="search-field" id="sf-off"><input type="search" aria-label="off" value="y" disabled><button type="button" class="search-clear" id="sclr-off" aria-label="clear search"></button></div>
  <div class="chip-set" role="group" aria-label="tags"><button type="button" class="chip" id="chip" aria-pressed="false">agents</button>
    <button type="button" class="chip" id="chip-on" aria-pressed="true">skills <span class="chip-count">3</span></button>
    <a class="chip" id="link" href="#a">#a</a><a class="chip" id="link-on" href="#b" aria-current="page">#b</a></div>
  <div id="offs"><select data-filter aria-label="kind" id="fx-off" disabled><option value="">all</option><option value="k" selected>skill</option></select>
    <button type="button" class="chip" id="chip-off" aria-pressed="false" disabled>off</button>
    <button type="button" class="value-filter" id="vf-off" disabled>official</button></div>
  <div><select data-filter aria-label="source" id="fx-bad" aria-invalid="true"><option value="">all</option><option value="s" selected>seedr</option></select></div>
\`); initSelects(); initSearchFields(); null`);

// INVALID BEATS FILTERING (lead ruling): both states at once paint --destructive, edge and text,
// and the filtering funnel and clear stay.
const invalidFiltering = () => evaluate(`(() => { const t = $("#fx-bad ~ .select-trigger");
  return { active: t.getAttribute("data-active"), invalid: t.getAttribute("aria-invalid"), edge: cs(t, "border-top-color"),
    ink: cs(t, "color"), funnel: cs(t, "background-color", "::before"), clear: drawn($(".filter-dd:has(#fx-bad) > .filter-clear")),
    destructive: probe("var(--destructive)"), primary: probe("var(--primary)", "background-color") }; })()`);
await park();
await check("css: a filter that is filtering AND invalid paints --destructive, edge and text — and keeps its --primary funnel and its clear",
  async () => { const s = await invalidFiltering(); return s.active === "true" && s.invalid === "true" && s.edge === s.destructive &&
    s.ink === s.destructive && s.funnel === s.primary && s.clear; },
  async () => JSON.stringify(await invalidFiltering()));
const boxOf = (selector) => evaluate(`(() => { const b = $(${JSON.stringify(selector)}).getBoundingClientRect();
  return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.right) - Math.floor(b.left), height: Math.ceil(b.bottom) - Math.floor(b.top) }; })()`);
// What a mark paints against what it covers: the same clip shot with the mark and without it. Only
// the mark's own pixels differ between the two, so a neighbour's ink can never stand in for it, and
// a clip that holds NO changed pixel is reported as that — never as a contrast.
const markPaint = async (clip, show, hide) => {
  await show();
  const drawn = await shot(clip);
  await hide();
  const bare = await shot(clip);
  let best = { ratio: 1, ink: null, changed: 0 };
  drawn.forEach((p, i) => {
    const q = contrast(p, bare[i]);
    if (q > 1.05) best.changed += 1;
    if (q > best.ratio) best = { ...best, ratio: q, ink: p.join(",") };
  });
  return best;
};
const glyphPaint = async (selector, pseudo) => {
  const hide = `<style id="unglyph">${selector}${pseudo} { visibility: hidden !important; }</style>`;
  const paint = await markPaint(await boxOf(selector), async () => {},
    () => evaluate(`document.head.insertAdjacentHTML("beforeend", ${JSON.stringify(hide)}); null`));
  await evaluate(`document.getElementById("unglyph").remove(); null`);
  return paint;
};
// A FOCUS RING, on and off: its left band, 2-4px outside the control, halfway down. REAL keyboard
// focus — Tab from the control before it — because a pseudo-state forced through DevTools is not a
// reliable stand-in for real focus across browser builds: it once painted nothing here, and did not
// reproduce for the reviewer. Real focus is what a reader's Tab produces.
const ringPaint = async (selector, before) => {
  const b = await evaluate(`box(${JSON.stringify(selector)})`);
  const clip = { x: Math.floor(b.left) - 6, y: Math.floor(b.top + b.height / 2) - 2, width: 6, height: 4 };
  let focused = false;
  const paint = await markPaint(clip,
    async () => {
      await evaluate(`$(${JSON.stringify(before)}).focus(); null`);
      await press("Tab");
      focused = await evaluate(`$(${JSON.stringify(selector)}).matches(":focus-visible")`);
    },
    () => evaluate("document.activeElement.blur(); null"));
  return { ...paint, focused };
};
// The text's contrast as PAINTED. Two shots of its tight text box, with the text and with it gone,
// only to find WHICH pixels are the text: a clip slid onto a neighbour's words holds none. Their
// contrast is then read inside the DRAWN shot alone, against its dominant colour — what the word
// actually sits on. Against the second shot it was against what lies UNDER a backplate, so a word
// painted Canvas on a Canvas backplate still read as high contrast.
// `forced-color-adjust: none` in the hiding rule, because a forced palette overrides `transparent`.
const textPaint = async (selector) => {
  const clip = await evaluate(`(() => { const e = $(${JSON.stringify(selector)});
    const text = [...e.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const range = document.createRange(); range.selectNodeContents(text);
    const b = [...range.getClientRects()].filter((x) => x.width > 2).pop();
    return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width), height: Math.ceil(b.height) }; })()`);
  const drawn = await shot(clip);
  const hide = `<style id="untext">${selector} { color: transparent !important; forced-color-adjust: none !important; }</style>`;
  await evaluate(`document.head.insertAdjacentHTML("beforeend", ${JSON.stringify(hide)}); null`);
  const bare = await shot(clip);
  await evaluate(`document.getElementById("untext").remove(); null`);
  const counts = new Map();
  for (const p of drawn) counts.set(p.join(","), (counts.get(p.join(",")) || 0) + 1);
  const ground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
  // Not the box's outermost ring: a backplate is exactly the text box, and its anti-aliased edge lands
  // there (measured: a row of rgb(20,20,20) under a Canvas backplate on CanvasText, read at 19:1 as
  // "text"). The glyphs sit inside the line box's leading.
  const inside = (i) => { const x = i % clip.width, y = Math.floor(i / clip.width);
    return x > 0 && y > 0 && x < clip.width - 1 && y < clip.height - 1; };
  const text = drawn.filter((p, i) => inside(i) && contrast(p, bare[i]) > 1.05).map((p) => contrast(p, ground));
  return { ratio: Math.max(1, ...text), ink: text.filter((q) => q >= 1.5).length };
};
// A fill, read 3px inside the left edge, halfway down — padding, never text.
const fillPaint = async (selector) => {
  const b = await evaluate(`box(${JSON.stringify(selector)})`);
  return (await shot({ x: Math.floor(b.left) + 3, y: Math.floor(b.top + b.height / 2), width: 1, height: 1 }))[0].join(",");
};
// An edge, read down the middle of the top border: of the rows it may straddle, the one furthest from Canvas.
const edgePaint = async (selector, canvas) => {
  const b = await evaluate(`box(${JSON.stringify(selector)})`);
  const strip = await shot({ x: Math.floor(b.left + b.width / 2), y: Math.floor(b.top) - 1, width: 1, height: 3 });
  return strip.reduce((far, p) => (contrast(p, canvas) > contrast(far, canvas) ? p : far)).join(",");
};

// A DISABLED control keeps its .45 in every palette (lead ruling, estate-wide): its glyph must still
// paint, and paint differently from an enabled one, but it is exempt from the 3:1 (WCAG 1.4.11).
const GLYPHS = [["magnifier", "#sf", "::before"], ["search clear ×", "#sclr", "::before"],
  ["filter funnel", "#fx-rest ~ .select-trigger", "::before"], ["filter funnel, filtering", "#fx-on ~ .select-trigger", "::before"],
  ["filter clear ×", ".filter-dd:has(#fx-on) > .filter-clear", "::before"], ["sort arrow", "#dir", "::before"],
  ["remove chip ×", "#rm", "::after"], ["pending line", "#sf-pend", "::after"], ["magnifier, switched-off box", "#sf-off", "::before"],
  ["search clear ×, disabled", "#sclr-off", "::before", "disabled"], ["sort arrow, disabled", "#dir-off", "::before", "disabled"],
  ["filter funnel, disabled", "#fx-off ~ .select-trigger", "::before", "disabled"]];
const ENABLED = GLYPHS.filter((g) => !g[3]).length;
const DIMMED = ["#sf-off input", "#sclr-off", "#fx-off ~ .select-trigger", ".filter-dd:has(#fx-off) > .filter-clear", "#dir-off",
  "#chip-off", "#vf-off"];
for (const scheme of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
  const canvas = (await evaluate(`probe("Canvas")`)).match(/\d+/g).slice(0, 3).map(Number);
  const faint = [];
  const rings = [];
  const inks = {};
  for (const theme of ["warm", "green", "mono", "paper"]) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
    for (const [name, selector, pseudo, disabled] of GLYPHS) {
      const paint = await glyphPaint(selector, pseudo);
      if (paint.changed < 3) faint.push(`${theme} ${name}: its clip holds no ink`);
      else if (!disabled && !(paint.ratio >= 3)) faint.push(`${theme} ${name} ${paint.ratio.toFixed(2)}:1`);
      if (theme === "warm") inks[name] = paint.ink;
    }
    for (const [name, selector, before] of [["pressed chip", "#chip-on", "#chip"], ["current link chip", "#link-on", "#link"]]) {
      const paint = await ringPaint(selector, before);
      if (!paint.focused) rings.push(`${theme} ${name}: Tab did not give it keyboard focus`);
      else if (paint.changed < 3) rings.push(`${theme} ${name}: its clip holds no ring`);
      else if (!(paint.ratio >= 3)) rings.push(`${theme} ${name} ${paint.ratio.toFixed(2)}:1`);
    }
  }
  await evaluate(`delete document.documentElement.dataset.theme; null`);
  await check(`forced colours (${scheme}): every glyph PAINTS on what it covers — the ${ENABLED} enabled ones at >= 3:1, the ${GLYPHS.length - ENABLED} disabled ones at all — x 4 themes, in pixels`,
    () => faint.length === 0, () => faint.slice(0, 6).join("; "));
  await check(`forced colours (${scheme}): the focus ring of a chip that opts out (pressed, current) paints at >= 3:1 — 4 themes`,
    () => rings.length === 0, () => rings.slice(0, 6).join("; "));
  await check(`forced colours (${scheme}): a disabled control keeps its .45 — GrayText AND dimmed, as everywhere in the estate (${DIMMED.length} controls)`,
    () => evaluate(`${JSON.stringify(DIMMED)}.every((s) => cs(s, "opacity") === "0.45") && cs("#dir-off", "color") === probe("GrayText")`),
    () => evaluate(`${JSON.stringify(DIMMED)}.map((s) => s + " " + cs(s, "opacity")).join(", ")`));
  await check(`forced colours (${scheme}): ...and its glyph paints differently from an enabled one`,
    () => inks["sort arrow, disabled"] !== inks["sort arrow"] && inks["search clear ×, disabled"] !== inks["search clear ×"] &&
      inks["filter funnel, disabled"] !== inks["filter funnel, filtering"],
    () => `sort arrow ${inks["sort arrow"]} / disabled ${inks["sort arrow, disabled"]}`);
  // The opt-out itself is pinned as well as painted: the painted check once missed its removal (it
  // measured under the backplate), and a computed value cannot be fooled that way.
  await check(`forced colours (${scheme}): a pressed chip and the current link chip opt out WHOLE — forced-color-adjust: none, HighlightText on Highlight`,
    () => evaluate(`["#chip-on", "#link-on"].every((s) => cs(s, "forced-color-adjust") === "none" &&
      cs(s, "color") === probe("HighlightText") && cs(s, "background-color") === probe("Highlight", "background-color"))`),
    () => evaluate(`["#chip-on", "#link-on"].map((s) => s + " " + cs(s, "forced-color-adjust") + " " + cs(s, "color") + " on " + cs(s, "background-color")).join("; ")`));
  const fills = { chip: await fillPaint("#chip"), chipOn: await fillPaint("#chip-on"), link: await fillPaint("#link"), linkOn: await fillPaint("#link-on") };
  await check(`forced colours (${scheme}): a PRESSED chip and the current LINK chip paint a fill their neighbours do not`,
    () => fills.chipOn !== fills.chip && fills.linkOn !== fills.link, () => JSON.stringify(fills));
  const edges = { rest: await edgePaint("#fx-rest ~ .select-trigger", canvas), on: await edgePaint("#fx-on ~ .select-trigger", canvas),
    bad: await edgePaint("#fx-bad ~ .select-trigger", canvas) };
  await check(`forced colours (${scheme}): a FILTERING trigger paints a different edge from one at rest`,
    () => edges.on !== edges.rest, () => JSON.stringify(edges));
  await check(`forced colours (${scheme}): a filtering trigger that is also INVALID paints a different edge from plain filtering`,
    () => edges.bad !== edges.on, () => JSON.stringify(edges));
  const texts = [];
  for (const [name, selector] of [["pressed chip", "#chip-on"], ["its count", "#chip-on .chip-count"], ["current link chip", "#link-on"]]) {
    texts.push([name, await textPaint(selector)]);
  }
  await check(`forced colours (${scheme}): text on a redrawn state reads at >= 4.5:1 in pixels (no Canvas backplate)`,
    () => texts.every(([, t]) => t.ink >= 3 && t.ratio >= 4.5),
    () => texts.map(([name, t]) => `${name} ${t.ratio.toFixed(2)}:1 (${t.ink} ink px)`).join("; "));
}
await send("Emulation.setEmulatedMedia", { features: [] });

/* ═══ the demo page — its own code paths ══════════════════════════════════ */

const I1 = new Set(("check search filter arrow-up arrow-down trash-2 pencil minus loader-circle star-filled x chevron-down " +
  "chevron-left download history home image-plus package refresh-cw star triangle-alert circle-check circle-alert circle-x info " +
  "copy clock arrow-up-down external-link github mail plus eye eye-off power upload send arrow-left arrow-right " +
  "circle-fading-arrow-up chevron-right chevrons-up-down chevrons-down-up folder-tree folder-open file-code panel-left-open " +
  "maximize-2 folder file panel-left-close").split(" "));
await open("/examples/filters.html", `!!document.querySelector("#f-type")?.parentElement?.classList.contains("select-field")`);
await evaluate(`window.$ = (s) => document.querySelector(s);
  window.cs = (s, prop, pseudo) => getComputedStyle(typeof s === "string" ? $(s) : s, pseudo || null).getPropertyValue(prop);
  window.tick = () => new Promise((r) => setTimeout(r, 0)); null`);
const icons = await evaluate(`[...new Set([...document.querySelectorAll("[data-icon]")].map((e) => e.dataset.icon))]`);
await check("demo: every data-icon it names is in I1's set (X6)",
  () => icons.length > 0 && icons.every((name) => I1.has(name)), () => icons.filter((name) => !I1.has(name)).join(" "));
await check("demo: every labelled .filter-chips row is a group (role=group)",
  () => evaluate(`[...document.querySelectorAll(".filter-chips[aria-label]")].every((e) => e.getAttribute("role") === "group")`));
await check("demo: no link carries aria-pressed — a link chip says where it is with aria-current",
  () => evaluate(`!document.querySelector("a[aria-pressed]")`));
await check("demo: a .filter-bar--sticky example is on the page, and it sticks",
  () => evaluate(`!!$(".filter-bar--sticky") && cs(".filter-bar--sticky", "position") === "sticky"`));

// WCAG 1.4.1 / 3.3.1: every invalid control this package SHOWS says what is wrong in words — the demo
// as the runtime leaves it (the trigger mirrors its select), and every html example in the reference,
// each read on its own. An id that resolves to anything but a `.field-error` with text does not count.
await evaluate(`window.undescribed = (root) => [...root.querySelectorAll('[aria-invalid="true"]')].filter((e) => {
  const ids = (e.getAttribute("aria-describedby") || "").split(/\\s+/).filter(Boolean);
  return !ids.some((id) => { const d = root.querySelector("#" + CSS.escape(id)); return !!d && d.matches(".field-error") && d.textContent.trim() !== ""; });
}).map((e) => e.outerHTML.slice(0, 90)); null`);
const demoInvalid = await evaluate(`[document.querySelectorAll('[aria-invalid="true"]').length, undescribed(document)]`);
await check(`demo: every aria-invalid="true" on the page (${demoInvalid[0]}) is described by a .field-error with text`,
  () => demoInvalid[0] > 0 && demoInvalid[1].length === 0, () => `undescribed: ${demoInvalid[1].join(" | ")}`);
const EXAMPLES = [...readFileSync(join(root, ".claude/skills/danieldeusing-design/references/filters.md"), "utf8")
  .matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);
const referenceInvalid = await evaluate(`(() => { let count = 0; const bad = [];
  for (const html of ${JSON.stringify(EXAMPLES)}) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    count += doc.querySelectorAll('[aria-invalid="true"]').length;
    bad.push(...undescribed(doc));
  }
  return [count, bad]; })()`);
await check(`reference: every aria-invalid="true" in filters.md's ${EXAMPLES.length} html examples (${referenceInvalid[0]}; the search box and the select at least) is described by a .field-error with text in the same example`,
  () => referenceInvalid[0] >= 2 && referenceInvalid[1].length === 0,
  () => `${referenceInvalid[0]} found; undescribed: ${referenceInvalid[1].join(" | ")}`);

// M13: the demo's autocomplete, driven through its own handlers — typed into by a real keyboard.
await evaluate(`$("#cmd").scrollIntoView({ block: "center", behavior: "instant" }); null`);
await click(`$("#cmd")`);
await typeText("/");
await evaluate("tick()");
const highlight = () => evaluate(`(() => { const rows = [...document.querySelectorAll("#cmd-list .select-option")];
  return { n: rows.length, attr: rows[0]?.getAttribute("data-active") ?? null,
    active: rows[0] ? cs(rows[0], "background-color") : null, rest: rows[1] ? cs(rows[1], "background-color") : null }; })()`);
await check("demo: the autocomplete's highlighted row carries data-active=\"true\" — the value the system reads",
  async () => { const s = await highlight(); return s.n > 1 && s.attr === "true"; }, async () => JSON.stringify(await highlight()));
await check("demo: ...and so it IS highlighted: its fill differs from a row at rest",
  async () => { const s = await highlight(); return s.n > 1 && s.active !== s.rest; }, async () => JSON.stringify(await highlight()));
await press("ArrowDown");
await check("demo: ArrowDown moves the highlight — the next row takes data-active=\"true\", the first loses it",
  () => evaluate(`(() => { const rows = [...document.querySelectorAll("#cmd-list .select-option")];
    return rows[1].getAttribute("data-active") === "true" && !rows[0].hasAttribute("data-active")
      && $("#cmd").getAttribute("aria-activedescendant") === rows[1].id; })()`));
await press("Escape");

// S4: the trigger's aria-describedby is merged BY TOKEN. A change to the options re-syncs the trigger,
// and that sync copied the select's list over the trigger's wholesale: with a tip showing, "s4-err
// ddtip" became "s4-err" while the tip was still on screen.
await open("/main");
await evaluate(`(async () => { (await import("/runtime/tooltip.js")).initTooltips();
  const mount = document.getElementById("mount");
  mount.innerHTML = '<label for="s4">kind</label> <select id="s4" aria-invalid="true" aria-describedby="s4-err" data-tip="the kind of agent to run">' +
    '<option>agent</option><option>skill</option></select><p class="field-error" id="s4-err">pick one</p>';
  initSelects(mount); })()`);
await sleep(100);
await hover(`triggerOf("s4")`);
await sleep(150);
const s4 = { showing: await evaluate(`triggerOf("s4").getAttribute("aria-describedby")`) };
await evaluate(`document.getElementById("s4").append(new Option("tool")); null`);
await sleep(100);
s4.optionsChanged = await evaluate(`triggerOf("s4").getAttribute("aria-describedby")`);
s4.options = await evaluate(`document.getElementById("s4").options.length`);
await evaluate(`document.getElementById("s4").setAttribute("aria-describedby", "s4-err s4-hint"); null`);
await sleep(100);
s4.selectChanged = await evaluate(`triggerOf("s4").getAttribute("aria-describedby")`);
await check("S4 — with the tip showing, a change to the options keeps the tip's token on the trigger: \"s4-err ddtip\" stays \"s4-err ddtip\"",
  () => s4.showing === "s4-err ddtip" && s4.options === 3 && s4.optionsChanged === "s4-err ddtip", JSON.stringify(s4));
await check("...and a change to the select's own list replaces the select's tokens and keeps the tip's: \"s4-err s4-hint ddtip\"",
  () => s4.selectChanged === "s4-err s4-hint ddtip", JSON.stringify(s4));
await move(2, 2);

/* ═══ 0.62.0 — the filter rule ════════════════════════════════════════════
   Daniel, 2026-09-30: "Filters, sort and so on are always right aligned. Search input field always
   left aligned. Active filters have colored text and there must be the 'x' icon to remove the filter
   (only not if one filter must always be set)." Measured three ways: the bars on the demo page at a
   desktop and a phone width, findMisplacedFilters() against a fixture that breaks each part of the
   rule once, and the same function over every example page (and every dialog on it, opened). */

// An element is named by its id, or the id of the first thing inside it that has one.
const MISPLACED = (root) => `(async () => { const { findMisplacedFilters } = await import("/runtime/rhythm.js");
  return findMisplacedFilters(${root}).map(({ element, reason }) => reason + " " +
    (element.id || element.querySelector("[id]")?.id || element.tagName.toLowerCase() + "." + [...element.classList].join("."))).sort(); })()`;
// A throw here becomes a reason the checks below fail on, never an abort (an old runtime has no function).
const misplaced = (root = "document") => evaluate(MISPLACED(root)).catch((error) => [`threw: ${String(error.message).split("\n")[0]}`]);
// findFlushBlocks(), named the same way: "upper / lower".
const FLUSH = (root) => `(async () => { const { findFlushBlocks } = await import("/runtime/rhythm.js");
  const name = (el) => el.id || el.dataset.t || el.tagName.toLowerCase() + "." + [...el.classList].join(".");
  return findFlushBlocks(${root}).map(({ upper, lower }) => name(upper) + " / " + name(lower)).sort(); })()`;
const flushPairs = (root = "document") => evaluate(FLUSH(root)).catch((error) => [`threw: ${String(error.message).split("\n")[0]}`]);
const sameSet = (got, want) => JSON.stringify([...got].sort()) === JSON.stringify([...want].sort());

await open("/main");
await evaluate(`mount(\`
  <div class="filter-bar" id="ok-bar"><div class="search-field" id="ok-lead"><input type="search" aria-label="ok"></div>
    <select data-filter aria-label="source" id="ok-src"><option value="">all</option><option value="s">seedr</option></select>
    <select data-filter aria-label="repository" id="ok-repo"><option value="a">a</option><option value="b">b</option></select></div>
  <div class="filter-bar" id="nolead"><select data-filter aria-label="no lead" id="nolead-sel"><option value="">all</option><option value="x">x</option></select></div>
  <div class="filter-bar" id="wrap-bar" style="inline-size: 300px"><div class="chip-set" id="wrap-set" role="group" aria-label="many">
    \${Array.from({ length: 12 }, (_, i) => '<button type="button" class="chip" aria-pressed="false">#tag-' + i + '</button>').join("")}</div></div>
  <div class="filter-bar" id="chip-bar"><div class="chip-set" role="group" aria-label="x"><button type="button" class="chip" id="chip-all" aria-pressed="true" data-all>all</button>
    <button type="button" class="chip" id="chip-on" aria-pressed="true">#on</button><button type="button" class="chip" id="chip-off" aria-pressed="false">#off</button></div></div>
  <select data-filter aria-label="loose" id="fx-a"><option value="">all</option><option value="x">x</option></select>
  <div class="sort-ctl" id="fx-a-sort"><button type="button" class="sort-dir" data-dir="asc" aria-label="sort descending"></button></div>
  <div class="chip-set" id="fx-a-chips"><button type="button" class="chip" aria-pressed="false">loose</button></div>
  <table><thead><tr><th><div class="chip-set" id="fx-th"><button type="button" class="chip" aria-pressed="false">th</button></div></th></tr></thead></table>
  <details class="dropdown" open><summary>menu</summary><div class="dropdown-panel"><div class="chip-set" id="fx-dd"><button type="button" class="chip" aria-pressed="false">menu</button></div></div></details>
  <dialog id="fx-dlg"><select data-filter aria-label="in a dialog" id="fx-dlg-sel"><option value="">all</option><option value="x">x</option></select></dialog>
  <div class="filter-bar" id="fx-b"><button type="button" id="fx-b-first">first</button><div class="search-field" id="fx-b-lead"><input type="search" aria-label="b"></div></div>
  <div class="filter-bar" id="fx-c" style="justify-content: flex-start"><h3 id="fx-c-lead" style="margin-inline-end: 0">title</h3>
    <select data-filter aria-label="c" id="fx-c-sel"><option value="">all</option><option value="x">x</option></select></div>
  <div class="filter-bar" id="fx-de"><select data-filter aria-label="d" id="fx-d"><option value="">all</option><option value="v">v</option></select>
    <select data-filter aria-label="e" id="fx-e"><option value="a">a</option><option value="b">b</option></select></div>
  <div class="chip-set" id="fx-values" role="group" aria-label="authors"><button type="button" class="chip chip--remove" aria-label="remove ada">ada</button></div>
  <div class="filter-bar" id="two-leads"><label class="filter-bar-lead" id="tl-label" for="tl-in">~ $</label>
    <div class="search-field" id="tl-search"><input type="search" id="tl-in"></div>
    <select data-filter aria-label="two leads" id="tl-sel"><option value="">all</option><option value="x">x</option></select></div>
  <div class="filter-bar" id="bare-lead"><input type="search" id="bl-in" aria-label="bare">
    <select data-filter aria-label="bare lead" id="bl-sel"><option value="">all</option><option value="x">x</option></select></div>
  <div class="filter-bar" id="bare-late"><select data-filter aria-label="late" id="bl2-sel"><option value="">all</option><option value="x">x</option></select>
    <input type="search" id="bl2-in" aria-label="late"></div>
  <div class="filter-bar" id="inc-bar"><div class="chip-set" data-inclusive role="group" aria-label="series">
    <button type="button" class="chip" id="chip-inc" aria-pressed="true">ddmini</button></div></div>
\`); initSelects(); initSortControls(); document.getElementById("fx-dlg").showModal(); tick()`);
await evaluate("tick()");

const BASE = ["outside-filter-bar fx-a", "outside-filter-bar fx-a-sort", "outside-filter-bar fx-a-chips", "outside-filter-bar fx-dlg-sel",
  "lead-not-left fx-b-lead", "controls-not-right fx-b-first", "controls-not-right fx-c-sel",
  "lead-not-left bl2-in", "controls-not-right bl2-sel"];
// A throw inside the function arrives as a "threw: …" line: every check below that could pass on an
// EMPTY or partial answer also asks that the fixture's known faults are there, so a throw fails it.
const ran = (list) => !list.some((r) => r.startsWith("threw: ")) && list.includes("outside-filter-bar fx-a");
const m0 = await misplaced();
await check("findMisplacedFilters: a filter, a sort and a chip set outside any bar are reported — one in an open dialog too; one in a th and one in an open .dropdown-panel are not",
  async () => ["outside-filter-bar fx-a", "outside-filter-bar fx-a-sort", "outside-filter-bar fx-a-chips", "outside-filter-bar fx-dlg-sel"].every((r) => m0.includes(r)) &&
    !m0.some((r) => /fx-th|fx-dd/.test(r)) && (await evaluate(`drawn("#fx-th") && drawn("#fx-dd") && drawn("#fx-dlg-sel")`)), JSON.stringify(m0));
await check("findMisplacedFilters: a lead that is not first is reported off the left edge, and the control before it short of the right",
  () => m0.includes("lead-not-left fx-b-lead") && m0.includes("controls-not-right fx-b-first"), JSON.stringify(m0));
await check("findMisplacedFilters: a bar whose controls are not pushed right is reported, naming the right-most control",
  () => m0.includes("controls-not-right fx-c-sel"), JSON.stringify(m0));
await check("findMisplacedFilters: nothing else — a searched bar, a bar with no lead, a wrapped chip bar and a quiet filter pass",
  () => sameSet(m0, BASE), JSON.stringify(m0));
await check("findMisplacedFilters: a chip set of .chip--remove chips outside a bar is a list of values, not a filter, and is not reported",
  () => ran(m0) && !m0.some((r) => r.includes("fx-values")), JSON.stringify(m0));
await check("findMisplacedFilters: a row led by a prompt label AND a search passes; a search after a control is lead-not-left",
  () => ran(m0) && !m0.some((r) => /tl-|bl-in|bl-sel/.test(r)) && m0.includes("lead-not-left bl2-in"), JSON.stringify(m0));
const twoLeads = await evaluate(`(() => { const bar = $("#two-leads").getBoundingClientRect(), l = box("#tl-label"), s = box("#tl-search"), f = box(triggerOf("tl-sel").closest(".filter-dd"));
  return { label: l.left - bar.left, gap: s.left - l.right, last: bar.right - f.right }; })()`);
await check("css: two leads — the label at the left edge, the search one gap (8px) after it, not floated mid-row; the filter at the right",
  () => near(twoLeads.label, 0) && near(twoLeads.gap, 8) && near(twoLeads.last, 0), JSON.stringify(twoLeads));
const bareLead = await evaluate(`(() => { const bar = $("#bare-lead").getBoundingClientRect();
  return { lead: box("#bl-in").left - bar.left, last: bar.right - box(triggerOf("bl-sel").closest(".filter-dd")).right }; })()`);
await check("css: a bare input[type=search] leads its bar — flush left, the filter flush right",
  () => near(bareLead.lead, 0) && near(bareLead.last, 0), JSON.stringify(bareLead));

await evaluate(`$("#fx-d").value = "v"; null`);
const md = await misplaced();
await check("findMisplacedFilters: an optional filter given a value by code, with no event, is \"active-unmarked\" — no active edge, no ×",
  () => sameSet(md, [...BASE, "active-unmarked fx-d"]), JSON.stringify(md));
await evaluate(`$("#fx-d").dispatchEvent(new Event("change", { bubbles: true })); tick()`);
const md2 = await misplaced();
await check("...and once the page says so (change), the runtime marks it and shows the ×, and it is not reported",
  async () => sameSet(md2, BASE) && (await evaluate(`triggerOf("fx-d").getAttribute("data-active") === "true" && drawn(clearOf("fx-d"))`)), JSON.stringify(md2));
await evaluate(`clearOf("fx-e").hidden = false; null`);
const me = await misplaced();
await check("findMisplacedFilters: a required picker showing a × is \"required-clearable\"",
  () => sameSet(me, [...BASE, "required-clearable fx-e"]), JSON.stringify(me));
await evaluate(`clearOf("fx-e").hidden = true; $("#fx-dlg").close(); null`);
const closed = await misplaced();
await check("findMisplacedFilters: a closed dialog is not rendered, and is skipped",
  () => ran(closed) && !closed.includes("outside-filter-bar fx-dlg-sel"), JSON.stringify(closed));

await check("css: a chip set in a bar wraps against the right edge — every row of twelve chips in 300px ends at the set's right",
  () => evaluate(`(() => { const set = $("#wrap-set").getBoundingClientRect(), rows = new Map();
    for (const c of $("#wrap-set").children) { const b = c.getBoundingClientRect(); rows.set(Math.round(b.top), Math.max(rows.get(Math.round(b.top)) || 0, b.right)); }
    return rows.size > 1 && [...rows.values()].every((r) => Math.abs(r - set.right) <= 1); })()`),
  () => evaluate(`JSON.stringify([...$("#wrap-set").children].map((c) => [Math.round(c.getBoundingClientRect().top), Math.round(c.getBoundingClientRect().right)]))`));
const x = await evaluate(`probe("var(--ico-x)", "mask-image")`);
await check("css: a pressed chip carries the × (--ico-x, --icon-sm), drawn",
  async () => (await evaluate(`cs("#chip-on", "mask-image", "::after")`)) === x &&
    (await evaluate(`cs("#chip-on", "width", "::after")`)) === (await evaluate(`probe("var(--icon-sm)", "width")`)),
  async () => `${await evaluate(`cs("#chip-on", "mask-image", "::after")`)} ${await evaluate(`cs("#chip-on", "width", "::after")`)}`);
await check("css: ...the pressed \"all\" chip (data-all) carries none, and a chip at rest keeps the slot unpainted",
  async () => (await evaluate(`cs("#chip-all", "content", "::after")`)) === "none" &&
    (await evaluate(`cs("#chip-off", "background-color", "::after")`)) === "rgba(0, 0, 0, 0)" &&
    (await evaluate(`cs("#chip-on", "background-color", "::after")`)) !== "rgba(0, 0, 0, 0)",
  async () => `${await evaluate(`cs("#chip-all", "content", "::after")`)} / ${await evaluate(`cs("#chip-off", "background-color", "::after")`)}`);
await check("css: a pressed chip in a data-inclusive set (pressed = shown, not a filter in force) carries no ×",
  async () => (await evaluate(`cs("#chip-inc", "content", "::after")`)) === "none", () => evaluate(`cs("#chip-inc", "content", "::after")`));
const pressWidth = await evaluate(`(async () => { const before = [box("#chip-off").width, box("#chip-all").left];
  $("#chip-off").setAttribute("aria-pressed", "true"); await tick();
  const after = [box("#chip-off").width, box("#chip-all").left];
  $("#chip-off").setAttribute("aria-pressed", "false"); return { before, after }; })()`);
await check("css: pressing a chip does not change its width, and moves nothing before it in a right-aligned set",
  () => near(pressWidth.before[0], pressWidth.after[0], 0.5) && near(pressWidth.before[1], pressWidth.after[1], 0.5), JSON.stringify(pressWidth));
await evaluate(`mount('<div class="filter-bar"><span class="filter-bar-spacer" id="old-spacer"></span><button type="button">x</button></div>'); null`);
await check("css: .filter-bar-spacer is gone — an old one left in a page is an empty span that grows nothing",
  async () => (await evaluate(`cs("#old-spacer", "flex-grow")`)) === "0");
await evaluate(`mount('<div class="filter-bar" id="safe-bar" style="inline-size: 200px"><button type="button" id="wide" style="inline-size: 400px; flex: none">wide</button></div>'); null`);
const safe = await evaluate(`({ value: cs("#safe-bar", "justify-content"), start: box("#wide").left - box("#safe-bar").left })`);
await check("css: the bar is safe flex-end — an item wider than the bar starts at its left edge and overflows to the right, never off the start",
  () => safe.value === "safe flex-end" && near(safe.start, 0), JSON.stringify(safe));

// The demo page's bars, measured directly — not through the function above.
const edgesOf = (bar, lead, last) => evaluate(`(() => { const $ = (s) => document.querySelector(s), b = $(${JSON.stringify(bar)}).getBoundingClientRect();
  const l = ${lead ? `$(${JSON.stringify(lead)}).getBoundingClientRect()` : "null"}, r = $(${JSON.stringify(last)}).getBoundingClientRect();
  return { lead: l ? l.left - b.left : 0, last: b.right - r.right, leadW: l ? l.width : 0, barW: b.width, below: l ? r.top >= l.bottom : null }; })()`)
  .catch((error) => ({ lead: NaN, last: NaN, error: String(error.message).split("\n")[0] }));
for (const width of [1280, 375]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false });
  await open("/examples/filters.html", `!!document.querySelector("#f-type")?.closest(".filter-dd")`);
  const browse = await edgesOf("#browse .filter-bar", "#q-field", "#refresh");
  await check(`demo at ${width}px: the search is flush left in the bar and the last action flush right${width < 640 ? ", on its own row under the search" : ""}`,
    () => near(browse.lead, 0) && near(browse.last, 0) && (width >= 640 || (near(browse.leadW, browse.barW) && browse.below)), JSON.stringify(browse));
  const chips = await edgesOf("#tags-bar", null, "#tags > .chip:last-child");
  await check(`demo at ${width}px: a bar with no lead (the tags) has its chips flush right`,
    () => near(chips.last, 0), JSON.stringify(chips));
  const noSearch = await edgesOf("#no-search", "#no-search h3", "#no-search .filter-dd");
  await check(`demo at ${width}px: a bar with no search — its heading leads on the left, its required picker sits on the right`,
    () => near(noSearch.lead, 0) && near(noSearch.last, 0), JSON.stringify(noSearch));
}

// 32c3fb6: the header's filter funnel sits on the sort arrows' baseline, at their size. As a block
// <details> it rode 1.70px above them.
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await open("/examples/data.html", `!!document.querySelector("th .tbl-sort") && !!document.querySelector("th .tbl-filter > summary")`);
const funnels = await evaluate(`[...document.querySelectorAll("th")].filter((th) => th.getClientRects().length && th.querySelector(".tbl-sort") && th.querySelector(".tbl-filter > summary"))
  .map((th) => { const a = th.querySelector(".tbl-sort").getBoundingClientRect(), b = th.querySelector(".tbl-filter > summary").getBoundingClientRect();
    return { col: th.dataset.col, offset: +(b.top - a.top).toFixed(2), sort: a.height, funnel: b.height }; })`);
await check(`data demo: every header with a sort and a filter (${funnels.length}) has the funnel within 0.5px of the arrows' top, at their height`,
  () => funnels.length > 0 && funnels.every((f) => Math.abs(f.offset) <= 0.5 && f.sort === f.funnel), JSON.stringify(funnels));

// Every example page, and every dialog on it opened, at both widths. Each page reports its YIELD — the
// rendered bars and filter controls the function measured — because "nothing found" on a page that
// showed it nothing is not a pass.
const COUNT = (root) => `[...${root}.querySelectorAll(".filter-bar, .filter-dd, select[data-filter], .sort-ctl, .chip-set")]
  .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden").length`;
const pages = readdirSync(join(root, "examples")).filter((f) => f.endsWith(".html")).sort();
let dialogBars = 0;
for (const page of pages) {
  const wrong = [];
  let measured = 0;
  for (const width of [1280, 375]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false });
    await open(`/examples/${page}`, `![...document.querySelectorAll("select[data-filter]")].some((s) => !s.closest(".filter-dd"))`);
    await sleep(150);
    measured += await evaluate(COUNT("document"));
    wrong.push(...(await misplaced()).map((r) => `${width}: ${r}`));
    wrong.push(...(await flushPairs()).map((r) => `${width}: flush ${r}`));
    wrong.push(...(await evaluate(`document.querySelectorAll(".filter-bar-spacer").length ? ["a .filter-bar-spacer"] : []`)).map((r) => `${width}: ${r}`));
    const dialogs = await evaluate(`document.querySelectorAll("dialog").length`);
    for (let i = 0; i < dialogs; i += 1) {
      const found = await evaluate(`(async () => { const d = document.querySelectorAll("dialog")[${i}]; if (!d.open) d.showModal();
        await new Promise((r) => setTimeout(r, 50));
        const out = [...await ${MISPLACED("d")}, ...(await ${FLUSH("d")}).map((r) => "flush " + r)], bars = [...d.querySelectorAll(".filter-bar")].filter((e) => e.getClientRects().length).length;
        const n = ${COUNT("d")}; d.close(); return { bars, n, out: out.map((r) => (d.id || "dialog " + ${i}) + ": " + r) }; })()`)
        .catch((error) => ({ bars: 0, n: 0, out: [`dialog ${i} threw: ${String(error.message).split("\n")[0]}`] }));
      dialogBars += found.bars;
      measured += found.n;
      wrong.push(...found.out.map((r) => `${width}: ${r}`));
    }
  }
  await check(`examples/${page}: findMisplacedFilters() and findFlushBlocks() find nothing at 1280 and 375, dialogs opened, and no .filter-bar-spacer (${measured} rendered bars and controls measured)`,
    () => wrong.length === 0, () => wrong.join(" | "));
}
await check(`examples: the sweep opened the dialogs and measured their filter bars (${dialogBars} rendered; overlays' two toolbars at two widths is 4)`,
  () => dialogBars >= 4);

/* ═══ 0.62.1 — a dialog's toolbar sits on its body, and the two layouts the filter rule missed ════
   Cockpit's logs drawer, twice. Its fixed form was flagged by findFlushBlocks(): overlays.css draws
   `.dialog-toolbar.filter-bar` flush on the body on purpose, and the drawer had to mark its console
   `data-flush` to pass. Its old form passed findMisplacedFilters(): a plain `.dialog-toolbar`, a plain
   `<select>` and a `.switch` beside the search, none of which the function judged. The reference
   drawer is lifted from overlays.md itself, so the skill's own markup is what is measured. */

const reference = readFileSync(join(root, ".claude/skills/danieldeusing-design/references/overlays.md"), "utf8")
  .split("## A drawer")[1]?.match(/```html\n([\s\S]*?)```/)?.[1] ?? "";
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await open("/examples/overlays.html", `!!document.querySelector("#logs .select-field")`);
await evaluate(`(() => {
  const at = document.createElement("div");
  at.id = "fx-0621";
  at.innerHTML = ${JSON.stringify(reference.replace(/id="logs"/, 'id="ref-logs"').replace(/logs-t/g, "ref-logs-t"))} + \`
  <dialog class="dialog dialog--drawer" id="fx-old" aria-label="old drawer">
    <header class="dialog-head"><h2 class="dialog-title">logs</h2></header>
    <div class="dialog-toolbar" id="old-tb">
      <select aria-label="lines" id="old-lines"><option>200 lines</option><option>all</option></select>
      <button type="button" class="switch" role="switch" aria-checked="true" id="old-follow">follow</button>
      <span class="search-field"><input type="search" aria-label="search the log" id="old-q"></span>
      <span class="match-count">3/17</span>
    </div>
    <div class="dialog-body dialog-body--flush"><div class="console console--fill" id="old-console"><div class="console-body">line</div></div></div>
  </dialog>
  <dialog class="dialog dialog--drawer" id="fx-new" aria-label="fixed drawer">
    <header class="dialog-head"><h2 class="dialog-title">logs</h2></header>
    <div class="dialog-toolbar filter-bar" id="new-tb">
      <span class="search-field"><input type="search" aria-label="search the log"></span>
      <select aria-label="lines" id="new-lines"><option>200 lines</option><option>all</option></select>
      <button type="button" class="switch" role="switch" aria-checked="true" id="new-follow">follow</button>
      <span class="match-count">3/17</span>
    </div>
    <div class="dialog-body dialog-body--flush"><div class="console console--fill" id="new-console"><div class="console-body">line</div></div></div>
  </dialog>
  <section id="fx-out" style="display: block">
    <div class="dialog-toolbar filter-bar" id="out-tb"><span class="search-field"><input type="search" aria-label="out"></span></div>
    <div class="dialog-body dialog-body--flush"><table id="out-table"><tbody><tr><td>a</td></tr></tbody></table></div>
    <div class="filter-bar" id="out-bar" style="margin-block-end: 0"><span class="search-field"><input type="search" aria-label="bar"></span></div>
    <table id="out-table-2"><tbody><tr><td>b</td></tr></tbody></table>
  </section>
  <form id="fx-form">
    <p><button type="button" class="switch" role="switch" aria-checked="false" id="form-switch">notify me</button></p>
    <p><button type="button" class="switch" role="switch" aria-checked="false" id="form-switch-2">digest</button>
      <select aria-label="interval" id="form-sel"><option>daily</option><option>weekly</option></select>
      <input type="text" aria-label="name"></p>
  </form>\`;
  document.querySelector("main").append(at); })(); null`);
await sleep(150);
// Open one dialog, measure both functions inside it and the toolbar-to-content edge, close it.
const inDialog = (id, toolbar, content) => evaluate(`(async () => { const d = document.getElementById(${JSON.stringify(id)}); d.showModal();
  await new Promise((r) => setTimeout(r, 50));
  const tb = d.querySelector(${JSON.stringify(toolbar)}), c = d.querySelector(${JSON.stringify(content)});
  const out = { misplaced: await ${MISPLACED("d")}, flush: await ${FLUSH("d")},
    edge: tb && c ? c.getBoundingClientRect().top - tb.getBoundingClientRect().bottom : null,
    drawn: !!tb && !!c && tb.getClientRects().length > 0 && c.getClientRects().length > 0, wrapped: !!d.querySelector("select")?.closest(".select-field") };
  d.close(); return out; })()`).catch((error) => ({ misplaced: [`threw: ${String(error.message).split("\n")[0]}`], flush: [], edge: null, drawn: false }));

const ref = await inDialog("ref-logs", ".dialog-toolbar", ".console");
await check("0.62.1 reference drawer (overlays.md): its toolbar sits ON the console (0px) and findFlushBlocks() reports nothing, with no data-flush",
  () => reference.includes("dialog-toolbar filter-bar") && !reference.includes("data-flush") && ref.drawn && near(ref.edge, 0, 0.5) &&
    ref.flush.length === 0 && ref.misplaced.length === 0, JSON.stringify(ref));
const drawer = await inDialog("logs", ".dialog-toolbar", ".console");
await check("0.62.1 examples/overlays.html: the logs drawer's toolbar sits on its console (0px), no flush pair, and the page carries no data-flush",
  async () => drawer.drawn && near(drawer.edge, 0, 0.5) && drawer.flush.length === 0 &&
    (await evaluate(`document.querySelectorAll("[data-flush]").length`)) === 0, JSON.stringify(drawer));
const outside = await flushPairs(`document.getElementById("fx-out")`);
await check("0.62.1 findFlushBlocks: the same toolbar and body OUTSIDE a dialog are still a flush pair, and so is a margin-less bar over a table",
  () => outside.some((p) => p.startsWith("out-tb / ")) && outside.some((p) => p.startsWith("out-bar / ")), JSON.stringify(outside));
const old = await inDialog("fx-old", ".dialog-toolbar", ".console");
await check("0.62.1 findMisplacedFilters: the old cockpit drawer — a plain .dialog-toolbar is \"toolbar-not-filter-bar\", and its select and switch beside the search are \"outside-filter-bar\"",
  () => old.wrapped && sameSet(old.misplaced, ["toolbar-not-filter-bar old-tb", "outside-filter-bar old-lines", "outside-filter-bar old-follow"]), JSON.stringify(old));
const fixed = await inDialog("fx-new", ".dialog-toolbar", ".console");
await check("0.62.1 findMisplacedFilters: the fixed drawer (dialog-toolbar filter-bar, the search first) — nothing, and no flush pair",
  () => fixed.drawn && fixed.wrapped && fixed.misplaced.length === 0 && fixed.flush.length === 0, JSON.stringify(fixed));
const form = await misplaced(`document.getElementById("fx-form")`);
await check("0.62.1 findMisplacedFilters: a .switch and a select in a form with no search beside them are settings, not filters — not reported",
  async () => form.length === 0 && (await evaluate(`["form-switch", "form-switch-2", "form-sel"].every((id) => document.getElementById(id).getClientRects().length > 0)`)), JSON.stringify(form));

await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

console.log(failures
  ? `\ncheck-filters: ${failures} FAILED, ${passes} passed`
  : `\ncheck-filters: all ${passes} checks passed`);
process.exit(failures ? 1 : 0);
