#!/usr/bin/env node
/*
 * check-filters.mjs — the filter package, in a real browser: where a popup goes (popup.js), the
 * filter dropdown (select.js), the search field (search.js), the sort control (sort.js), and the
 * boxes filters.css draws around them.
 *
 * WHAT IS AT RISK, and why each half is here:
 *
 *   · "The list is never the OS list" (Daniel, 2026-09-28). The claim is about what a reader's
 *     POINTER and KEYBOARD reach, so it is asserted with dispatched input — a press at the
 *     trigger's pixel, Alt+ArrowDown on the trigger — not with element.click(), which proves only
 *     that a handler exists. A select rendered after the call, and one still carrying the removed
 *     `data-select="off"`, are asserted too: those are the two ways a page used to end up back on
 *     the system list.
 *   · The filter dropdown's four promises from seedr and configr: the trigger names the facet and
 *     then the value, the active state wears --primary, the clear is joined and named, the list
 *     has an "all" row that carries the ✓ when nothing is filtered. Plus the keyboard — APG
 *     select-only combobox, and the search row past twenty options.
 *   · search.js: the clear button tracks the value, clears like a person would (input, then
 *     change), Escape clears a filled box WITHOUT reaching the dialog around it and does nothing in
 *     an empty one, and the pending line lasts `ms` after the LAST keystroke, not the first.
 *   · sort.js: the arrow flips and is named by what it will do; one pick is one `sortchange`.
 *   · positionPopup(): flips above only when that helps, clamps to every viewport edge, keeps a
 *     scrolled list where it was, and survives a zoomed root.
 *   · filters.css on a surface that loads ONLY tokens.css and filters.css (house rule 4): the
 *     controls must carry their own box there, or netmon gets a half-drawn control.
 *
 * THE TOKENS THIS PACKAGE READS land with the foundations package (--control-h, --control-edge,
 * --icon-*, --ico-*). Until they do, the harness declares them in a <style> BEFORE tokens.css —
 * so the day tokens.css declares them, its values win and this suite measures the real ones.
 *
 * A REAL BROWSER, and no dependency: the headless chromium Playwright caches on these machines,
 * over the DevTools protocol, with Node's own fetch and WebSocket. It skips loudly with no browser;
 * DD_REQUIRE_BROWSER=1 makes a skip a failure, as for every DOM suite here.
 *
 *   node scripts/check-filters.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
], { stdio: "ignore" });

let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); };
process.on("exit", shutdown);

let port = 0;
for (let i = 0; !port; i += 1) {
  try { port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch {}
  if (!port && i > 80) { shutdown(); throw new Error("headless chromium did not come up"); }
  if (!port) await sleep(250);
}

/* ── the pages ────────────────────────────────────────────────────────────── */

const svg = (body) => `url("data:image/svg+xml,${
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`
    .replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
// Declared BEFORE tokens.css: once the foundations package declares these, its values win.
const TOKEN_SHIM = `<style>:root {
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
window.tick = () => new Promise((r) => setTimeout(r, 0));
`;

const PAGES = {
  "/main": `<!doctype html><html lang="en"><head><meta charset="utf-8">${TOKEN_SHIM}
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/base.css">
<link rel="stylesheet" href="/src/components.css"><link rel="stylesheet" href="/src/filters.css">
<style>body { margin: 0; padding: 20px; } body::after { display: none; }
/* Computed styles are asserted at a state's END. A .15s transition would be sampled mid-flight —
   an edge read as --control-edge a frame after it was told to turn --primary. */
*, *::before, *::after { transition: none !important; }</style>
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
// The rows a reader SEES — rendered boxes, not the \`hidden\` attribute. The attribute is the
// runtime's intent; \`.select-option { display: flex }\` once overrode it and every "filtered" row
// stayed on screen while an attribute-reading check reported the filter working.
window.rows = () => [...(panel()?.querySelectorAll(".select-option") || [])]
  .filter((r) => r.getClientRects().length > 0).map((r) => r.textContent);
window.activeRow = (el = document.activeElement) => {
  const id = el && el.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id).textContent : null;
};
window.ready = true;
</script></body></html>`,

  // ONLY tokens.css and filters.css — what a tokens + chrome surface like netmon would load.
  "/bare": `<!doctype html><html lang="en"><head><meta charset="utf-8">${TOKEN_SHIM}
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/filters.css">
<style>body { margin: 0; padding: 20px; font: 12px/1.5 monospace; }</style>
</head><body><button id="start" type="button">start</button>
<div class="search-field"><input type="search" id="q" aria-label="search"><button type="button" class="search-clear" aria-label="clear search"></button></div>
<button type="button" class="chip" id="chip" aria-pressed="false">agents</button>
<button type="button" class="chip" id="chip-on" aria-pressed="true">skills</button>
<button type="button" class="sort-dir" id="dir" data-dir="asc" aria-label="sort descending"></button>
<button type="button" class="filter-clear" id="clr" aria-label="clear source filter"></button>
<button type="button" class="value-filter" id="vf">official</button>
<script type="module">
${HELPERS}
window.ready = true;
</script></body></html>`,
};

const server = createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url in PAGES) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGES[url]);
    return;
  }
  if (/^\/(src|runtime)\/[a-z-]+\.(css|js)$/.test(url)) {
    const type = extname(url) === ".css" ? "text/css" : "text/javascript";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(readFileSync(join(root, url)));
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
await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

const open = async (path) => {
  await send("Page.navigate", { url: base + path });
  for (let i = 0; ; i += 1) {
    if (await evaluate("window.ready === true").catch(() => false)) return;
    if (i > 50) throw new Error(`${path} never finished loading`);
    await sleep(100);
  }
};

// Where a real pointer would press. Dispatched, so the browser hit-tests it — which is the claim.
const click = async (expression) => {
  const { x, y } = await evaluate(`(() => { const b = (${expression}).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};

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
const park = () => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 998, y: 698 });

// A hover or a keyboard focus, FORCED on one node — so a state's look is asserted without depending
// on the pointer heuristics that decide :focus-visible.
const force = async (selector, states) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`force: no node for ${selector}`);
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
};

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
};
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

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
check("popup: an anchor near the top opens BELOW, 4px under it, flush with its start",
  r.side === "below" && near(r.p.top, r.a.bottom + 4) && near(r.p.left, r.a.left), JSON.stringify(r));
check("popup: it is position: fixed, written inline — the CSS no longer places a .select-panel",
  r.position === "fixed");
check("popup: never narrower than the control that opened it", r.p.width >= r.a.width - 0.5,
  `${r.p.width} < ${r.a.width}`);

r = await evaluate("place(20, 640, 120, 5)");
check("popup: near the bottom edge a short list FLIPS ABOVE, 4px over the anchor",
  r.side === "above" && near(r.p.bottom, r.a.top - 4), JSON.stringify(r));

r = await evaluate("place(20, 500, 120, 5)");
check("popup: a list that fits below stays below, even with more room above",
  r.side === "below" && near(r.p.top, r.a.bottom + 4), JSON.stringify(r));

r = await evaluate("place(20, 640, 120, 100)");
check("popup: a tall list near the bottom flips and is clamped to the room above, 8px off the top",
  r.side === "above" && r.p.top >= 8 - 0.5 && near(r.p.bottom, r.a.top - 4) && r.maxH !== "", JSON.stringify(r));

r = await evaluate("place(20, 20, 120, 100)");
check("popup: a tall list near the top stays below, clamped 8px short of the bottom edge",
  r.side === "below" && r.p.bottom <= r.vh - 8 + 0.5 && near(r.p.top, r.a.bottom + 4), JSON.stringify(r));

r = await evaluate("place(950, 100, 40, 3, {}, 'a considerably wider row than its anchor, so it must be pushed back in')");
check("popup: at the right edge it is pushed back in, 8px short of the viewport edge",
  r.p.right <= r.vw - 8 + 0.5 && r.p.left < r.a.left, JSON.stringify(r));

r = await evaluate("place(2, 100, 40, 3)");
check("popup: at the left edge it is kept 8px in", r.p.left >= 8 - 0.5, JSON.stringify(r));

r = await evaluate("place(500, 100, 100, 3, { align: 'end' }, 'a row wider than the anchor')");
check("popup: align 'end' lines its right edge up with the anchor's", near(r.p.right, r.a.right),
  JSON.stringify(r));

r = await evaluate("place(20, 100, 60, 3, { point: { x: 300, y: 200 }, minWidth: 140 })");
check("popup: a POINT anchor (a context menu) opens at the point, below it by the gap",
  near(r.p.left, 300) && near(r.p.top, 204), JSON.stringify(r));
check("popup: ...and minWidth is the floor when there is no anchor width", r.p.width >= 140 - 0.5 && r.minW === "140px",
  JSON.stringify(r));

r = await evaluate("place(20, 100, 200, 3, { minWidth: 260 })");
check("popup: min-inline-size is max(anchor width, minWidth)", r.minW === "260px" && r.p.width >= 259.5,
  JSON.stringify(r));

r = await evaluate("place(20, 640, 120, 5, { side: 'below' })");
check("popup: `side` keeps the side it is given instead of re-choosing", r.side === "below" && r.p.top > r.a.bottom,
  JSON.stringify(r));

r = await evaluate(`(() => { place(20, 20, 120, 100);
  const p = document.getElementById("pp"); p.scrollTop = 200;
  positionPopup(p, document.getElementById("pa"));
  return p.scrollTop; })()`);
check("popup: re-placing a SCROLLED list leaves it where the reader had scrolled it", r === 200, `scrollTop ${r}`);

r = await evaluate(`(() => { document.documentElement.style.zoom = "1.5";
  const out = place(100, 100, 120, 5);
  document.documentElement.style.zoom = ""; return out; })()`);
check("popup: under a zoomed root it still lands on its anchor (the zoom is divided on the WRITE)",
  near(r.p.left, r.a.left, 1.5) && near(r.p.top, r.a.bottom + 4, 1.5), JSON.stringify(r));
await evaluate(`document.getElementById("pa")?.remove(); document.getElementById("pp")?.remove(); null`);

/* ═══ select.js — the list is never the OS list ═══════════════════════════ */

await evaluate(`mount(\`
  <label>plain <select id="plain"><option>alpha</option><option selected>beta</option><option>gamma</option></select></label>
  <select id="off" data-select="off"><option>kept native before 0.60.0</option></select>
  <select id="src" data-filter aria-label="source"><option value="">all</option><option value="seedr">seedr</option>
    <option value="skills">skills.sh</option><option value="aitmpl" disabled>aitmpl</option></select>
  <select id="req" data-filter aria-label="repository"><option value="vu3">poi/vu3</option><option value="infra">dd/infra</option></select>
  <select id="order" data-filter aria-label="kind"><option value="a">agent</option><option value="">all</option><option value="s">skill</option></select>
  <select id="bad" aria-label="model" aria-invalid="true"><option data-icon="star">claude</option><option>codex</option></select>
  <select id="dis" data-filter aria-label="host" disabled><option value="">all</option><option value="m" selected>ddmini</option></select>
\`); initSelects(); null`);

check("never the OS list: every <select> is wrapped, including one still carrying data-select=\"off\"",
  await evaluate(`[...document.querySelectorAll("#mount select")].every((s) =>
    s.parentElement.classList.contains("select-field") && s.parentElement.querySelector(".select-trigger"))`));
check("never the OS list: the native control is out of the tab order and hidden from assistive tech",
  await evaluate(`[...document.querySelectorAll("#mount select")].every((s) =>
    s.getAttribute("tabindex") === "-1" && s.getAttribute("aria-hidden") === "true")`));
check("never the OS list: the pixel a reader presses is the trigger, not the <select> laid over it",
  await evaluate(`(() => { const t = triggerOf("plain"); const b = t.getBoundingClientRect();
    return t.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); })()`));

await click(`triggerOf("plain")`);
check("never the OS list: a pointer press opens the system's listbox, in the page",
  await evaluate(`!!panel() && panel().matches("ul.select-panel[role=listbox]") && panel().parentElement === document.body`));
check("never the OS list: ...one row per option, the current one aria-selected",
  (await evaluate("rows().join(',')")) === "alpha,beta,gamma" &&
  (await evaluate(`panel().querySelector("[aria-selected=true]").textContent`)) === "beta");
check("never the OS list: ...placed by positionPopup (position: fixed inline)",
  (await evaluate("panel().style.position")) === "fixed");
await press("Escape");
check("Escape closes it, focus back on the trigger",
  !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement === triggerOf("plain")`)));
await press("ArrowDown", ALT);
check("never the OS list: Alt+ArrowDown on the trigger opens the system's list",
  await evaluate("!!panel()"));
await press("Escape");
await press(" ");
check("...and so does Space", await evaluate("!!panel()"));
await press("Escape");

await evaluate(`document.getElementById("mount").insertAdjacentHTML("beforeend",
  '<select id="late"><option>rendered after initSelects()</option></select>'); null`);
await evaluate("tick()");
check("never the OS list: a <select> rendered AFTER the call is enhanced too",
  await evaluate(`document.getElementById("late").parentElement.classList.contains("select-field")`));

/* ═══ select.js — the filter dropdown (M5) ═════════════════════════════════ */

check("filter: the select, its trigger and a clear sit in one labelled group",
  await evaluate(`(() => { const g = document.getElementById("src").closest(".filter-dd");
    return !!g && g.matches(".btn-group[role=group]") && g.getAttribute("aria-label") === "source filter"
      && g.children.length === 2 && g.children[0].matches(".select-field") && g.children[1].matches("button.filter-clear"); })()`));
check("filter: the trigger is the filter variant",
  await evaluate(`triggerOf("src").classList.contains("select-trigger--filter")`));
check("filter: at rest the trigger names the FACET",
  (await evaluate(`triggerOf("src").textContent`)) === "source");
check("filter: ...its accessible name carries facet AND value, so state is never colour alone",
  (await evaluate(`triggerOf("src").getAttribute("aria-label")`)) === "source filter: all");
check("filter: ...it is not active, and there is no clear to press",
  (await evaluate(`triggerOf("src").hasAttribute("data-active")`)) === false &&
  (await evaluate(`clearOf("src").hidden`)) === true);
check("filter: the clear names its facet, not a generic \"Clear filter\"",
  (await evaluate(`clearOf("src").getAttribute("aria-label")`)) === "clear source filter");

await click(`triggerOf("src")`);
check("filter: the list opens on an \"all\" row that carries the ✓ while nothing is filtered",
  (await evaluate("rows()[0]")) === "all" &&
  (await evaluate(`panel().querySelector(".select-option").getAttribute("aria-selected")`)) === "true" &&
  (await evaluate(`panel().querySelectorAll("[aria-selected=true]").length`)) === 1);
await press("Escape");
await click(`triggerOf("order")`);
check("filter: the \"all\" row comes FIRST even when the page wrote the empty option second",
  (await evaluate("rows().join(',')")) === "all,agent,skill");
await press("Escape");

// Keyboard pick: ArrowDown opens on the value in force, ArrowDown moves, Enter picks.
await evaluate(`triggerOf("src").focus(); log.length = 0; null`);
await press("ArrowDown");
check("filter: ArrowDown opens the list on the value in force",
  await evaluate(`!!panel() && activeRow(triggerOf("src")) === "all"`));
await press("ArrowDown");
check("filter: ArrowDown moves the highlight (aria-activedescendant)",
  (await evaluate(`activeRow(triggerOf("src"))`)) === "seedr");
await press("Enter");
check("filter: Enter picks it — the <select> holds the value",
  (await evaluate(`document.getElementById("src").value`)) === "seedr");
check("filter: ...announced the native way: input, then change, once each",
  (await evaluate("log.join(',')")) === "input:src,change:src", await evaluate("log.join(',')"));
check("filter: FILTERING, the trigger names the VALUE",
  (await evaluate(`triggerOf("src").textContent`)) === "seedr");
check("filter: ...is marked active, and its name says so",
  (await evaluate(`triggerOf("src").getAttribute("data-active")`)) === "true" &&
  (await evaluate(`triggerOf("src").getAttribute("aria-label")`)) === "source filter: seedr");
check("filter: ...and the clear is there, joined to it (sharing one edge)",
  (await evaluate(`clearOf("src").hidden`)) === false &&
  (await evaluate(`Math.abs(box(clearOf("src")).left - (box(triggerOf("src")).right - 1)) <= 0.5`)));
check("filter: focus is back on the trigger after the pick",
  await evaluate(`document.activeElement === triggerOf("src")`));

const primary = await evaluate(`probe("var(--primary)")`);
const edge = await evaluate(`probe("var(--control-edge)")`);
const fg = await evaluate(`probe("var(--foreground)")`);
check("filter: the active state carries --primary — ink, edge and funnel",
  (await evaluate(`cs(triggerOf("src"), "color")`)) === primary &&
  (await evaluate(`cs(triggerOf("src"), "border-top-color")`)) === primary &&
  (await evaluate(`cs(triggerOf("src"), "background-color", "::before")`)) === primary,
  `${await evaluate(`cs(triggerOf("src"), "color")`)} / ${await evaluate(`cs(triggerOf("src"), "border-top-color")`)} vs ${primary}`);
check("filter: the clear is --primary on a --primary edge",
  (await evaluate(`cs(clearOf("src"), "color")`)) === primary &&
  (await evaluate(`cs(clearOf("src"), "border-top-color")`)) === primary);

await evaluate("log.length = 0; null");
await click(`clearOf("src")`);
await park();
check("filter: the clear empties the filter", (await evaluate(`document.getElementById("src").value`)) === "");
check("filter: ...announced as input then change", (await evaluate("log.join(',')")) === "input:src,change:src",
  await evaluate("log.join(',')"));
check("filter: ...the trigger names the facet again and is no longer active",
  (await evaluate(`triggerOf("src").textContent`)) === "source" &&
  !(await evaluate(`triggerOf("src").hasAttribute("data-active")`)));
check("filter: ...the clear is gone, and focus did not go with it — it is on the trigger",
  (await evaluate(`clearOf("src").hidden`)) === true &&
  (await evaluate(`document.activeElement === triggerOf("src")`)));
check("filter: at rest the ink is --foreground on a --control-edge edge; the funnel is muted",
  (await evaluate(`cs(triggerOf("src"), "color")`)) === fg &&
  (await evaluate(`cs(triggerOf("src"), "border-top-color")`)) === edge &&
  (await evaluate(`cs(triggerOf("src"), "background-color", "::before")`)) === (await evaluate(`probe("var(--muted-foreground)")`)));

// The "all" row is a way back too.
await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
await press("ArrowDown"); await press("Home");
check("filter: Home jumps to the \"all\" row", (await evaluate(`activeRow(triggerOf("src"))`)) === "all");
await press("Enter");
check("filter: ...and picking it clears the filter", (await evaluate(`document.getElementById("src").value`)) === "");

await press("ArrowDown"); await press("End");
check("filter: End skips a disabled last option", (await evaluate(`activeRow(triggerOf("src"))`)) === "skills.sh");
await press("Home"); await press("s");
check("filter: typeahead finds the first match", (await evaluate(`activeRow(triggerOf("src"))`)) === "seedr");
await press("s");
check("filter: ...and the same letter again cycles to the next", (await evaluate(`activeRow(triggerOf("src"))`)) === "skills.sh");
await evaluate("log.length = 0; null");
await press("Escape");
check("filter: Escape closes without changing anything",
  !(await evaluate("!!panel()")) && (await evaluate(`document.getElementById("src").value`)) === "" &&
  (await evaluate("log.length")) === 0);
await press("ArrowDown"); await press("ArrowDown"); await press("Tab");
check("filter: Tab closes and commits nothing",
  !(await evaluate("!!panel()")) && (await evaluate(`document.getElementById("src").value`)) === "");

check("filter: a REQUIRED picker (no empty option) shows its value and is never \"active\"",
  (await evaluate(`triggerOf("req").textContent`)) === "poi/vu3" &&
  !(await evaluate(`triggerOf("req").hasAttribute("data-active")`)) &&
  (await evaluate(`clearOf("req").hidden`)) === true);
await evaluate(`triggerOf("req").focus(); null`);
await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
check("filter: ...and after a pick it still offers no clear — there is nothing to go back to",
  (await evaluate(`document.getElementById("req").value`)) === "infra" &&
  (await evaluate(`triggerOf("req").textContent`)) === "dd/infra" &&
  !(await evaluate(`triggerOf("req").hasAttribute("data-active")`)) &&
  (await evaluate(`clearOf("req").hidden`)) === true);

check("filter: a DISABLED filter still shows that it filters, but its clear cannot be pressed",
  (await evaluate(`clearOf("dis").hidden`)) === false && (await evaluate(`clearOf("dis").disabled`)) === true);
await click(`clearOf("dis")`);
check("filter: ...and a press on it changes nothing", (await evaluate(`document.getElementById("dis").value`)) === "m");

/* ── aria-invalid and option icons (C8) ── */

check("select: aria-invalid on the <select> is mirrored onto the trigger the reader sees",
  (await evaluate(`triggerOf("bad").getAttribute("aria-invalid")`)) === "true");
await evaluate(`document.getElementById("bad").removeAttribute("aria-invalid"); tick()`);
check("select: ...and follows it when the page clears it",
  !(await evaluate(`triggerOf("bad").hasAttribute("aria-invalid")`)));
check("select: an <option data-icon> puts its .ico before the label in the trigger",
  await evaluate(`(() => { const i = triggerOf("bad").querySelector(".ico");
    return !!i && i.dataset.icon === "star" && i.nextElementSibling.matches(".select-value"); })()`));
await click(`triggerOf("bad")`);
check("select: ...and in its row", await evaluate(`(() => { const row = panel().querySelector(".select-option");
    return row.firstElementChild?.matches(".ico[data-icon=star]") && row.textContent === "claude"; })()`));
await press("ArrowDown"); await press("Enter");
check("select: ...and the trigger drops it when an option without one is chosen",
  !(await evaluate(`!!triggerOf("bad").querySelector(".ico")`)));

/* ── the search row past twenty options ── */

await evaluate(`mount(\`
  <div style="height: 520px"></div>
  <select id="many" data-filter aria-label="label"><option value="">all</option>
    \${Array.from({ length: 24 }, (_, i) => '<option value="l' + i + '">label ' + i + '</option>').join("")}</select>
  <select id="few" data-search aria-label="scope"><option>user</option><option>project</option><option>local</option></select>
  <button id="after" type="button">after</button>
  <div style="height: 1200px"></div>
\`); initSelects(); scrollTo(0, 0); null`);

await evaluate("log.length = 0; null");
await click(`triggerOf("many")`);
check("search row: a list of more than twenty opens with a search row at the top",
  await evaluate(`panel().firstElementChild.matches("li.select-search") && !!panel().querySelector(".select-search .search-field > input[type=search]")`));
check("search row: focus moves INTO it, so it can be typed into",
  await evaluate(`document.activeElement === panel().querySelector(".select-search input")`));
check("search row: it is named and points at the list it filters",
  (await evaluate(`document.activeElement.getAttribute("aria-label")`)) === "search label" &&
  (await evaluate(`document.activeElement.getAttribute("aria-controls") === panel().id`)));
const sideBefore = await evaluate(`box(panel()).bottom <= box(triggerOf("many")).top + 1 ? "above" : "below"`);
await typeText("1");
check("search row: typing narrows to the labels containing the text, and the \"all\" row steps aside",
  (await evaluate("rows().join(',')")) === "label 1,label 10,label 11,label 12,label 13,label 14,label 15,label 16,label 17,label 18,label 19,label 21",
  await evaluate("rows().join(',')"));
check("search row: the first match is highlighted, pointed at FROM THE BOX (aria-activedescendant)",
  (await evaluate("activeRow()")) === "label 1");
check("search row: the side it opened on is kept while the list shrinks under the typing",
  (await evaluate(`box(panel()).bottom <= box(triggerOf("many")).top + 1 ? "above" : "below"`)) === sideBefore,
  `opened ${sideBefore}`);
await press("ArrowDown");
check("search row: ArrowDown moves through the matches", (await evaluate("activeRow()")) === "label 10");
await typeText("zz");
check("search row: nothing matching says so", (await evaluate("rows().length")) === 0 &&
  (await evaluate(`panel().querySelector(".select-empty").getClientRects().length`)) === 1 &&
  (await evaluate(`panel().querySelector(".select-empty").textContent`)) === "no matches" &&
  (await evaluate("activeRow()")) === null);
await evaluate(`(() => { const i = panel().querySelector(".select-search input"); i.value = "label 2";
  i.dispatchEvent(new Event("input", { bubbles: true })); })(); null`);
await press("Enter");
check("search row: Enter picks the highlighted match",
  (await evaluate(`document.getElementById("many").value`)) === "l2" &&
  (await evaluate("log.filter((e) => e.endsWith(':many')).join(',')")) === "input:many,change:many",
  `value ${await evaluate(`document.getElementById("many").value`)}, log ${await evaluate("log.join(',')")}`);
check("search row: the query's own keystrokes never reached the page as input/change events",
  !(await evaluate("log.some((e) => /^(input|change):$/.test(e))")), await evaluate("log.join(',')"));
check("search row: ...closes, and hands focus back to the trigger",
  !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement === triggerOf("many")`)));
await press("7");
check("search row: a letter typed on the closed trigger opens it AS the search, not a lost key",
  (await evaluate(`panel()?.querySelector(".select-search input").value`)) === "7" && (await evaluate("rows().join(',')")) === "label 7,label 17");
await press("Escape");
check("search row: Escape closes and returns focus to the trigger",
  !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement === triggerOf("many")`)));
await click(`triggerOf("few")`);
check("search row: `data-search` asks for one on a short list too",
  await evaluate(`!!panel().querySelector(".select-search")`));
await press("Tab");
check("search row: Tab closes it and moves on from the TRIGGER, not from the end of <body>",
  !(await evaluate("!!panel()")) && (await evaluate(`document.activeElement.id`)) === "after",
  `focus on ${await evaluate("document.activeElement.id || document.activeElement.tagName")}`);

/* ── a scrolled list stays put ── */

await evaluate(`mount(\`<div style="height: 200px"></div>
  <select id="long"><option>first</option>\${Array.from({ length: 80 }, (_, i) => "<option>entry " + i + "</option>").join("")}</select>
  <div style="height: 1400px"></div>\`); initSelects(); scrollTo(0, 0); null`);
await click(`triggerOf("long")`);
await evaluate(`panel().scrollTop = 300; tick()`);
await evaluate(`scrollBy(0, 12); new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))`);
check("select: when the PAGE scrolls, an open list follows its trigger and keeps its own scroll",
  (await evaluate("panel().scrollTop")) === 300 &&
  near(await evaluate(`box(panel()).top`), await evaluate(`box(triggerOf("long")).bottom + 4`)),
  `scrollTop ${await evaluate("panel().scrollTop")}`);
await press("Escape");
await evaluate("scrollTo(0, 0); null");

/* ── inside a modal <dialog> ── */

await evaluate(`mount(\`<dialog id="dlg"><select id="indlg" data-filter data-search aria-label="scope">
  <option value="">all</option><option value="u">user</option><option value="p">project</option></select></dialog>\`);
  initSelects(); document.getElementById("dlg").showModal(); null`);
await click(`triggerOf("indlg")`);
check("dialog: the list opens INSIDE the dialog — the top layer paints over anything on <body>",
  await evaluate(`panel()?.parentElement === document.getElementById("dlg")`));
await press("Escape");
check("dialog: Escape in the search row closes the list and NOT the dialog",
  !(await evaluate("!!panel()")) && (await evaluate(`document.getElementById("dlg").open`)));
await evaluate(`document.getElementById("dlg").close(); null`);

/* ═══ search.js — .search-field ═══════════════════════════════════════════ */

await evaluate(`mount(\`
  <div class="search-field" id="sf"><input type="search" id="q" aria-label="search skills" placeholder="search…">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div class="search-field" id="sf2"><input type="search" id="q2" value="restored" aria-label="restored">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div>
  <div id="host"><div class="search-field" id="sf3"><input type="search" id="q3" aria-label="in a dialog">
    <button type="button" class="search-clear" aria-label="clear search" hidden></button></div></div>
\`); initSearchFields(); window.escapes = 0;
  document.getElementById("host").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { escapes += 1; window.lastPrevented = e.defaultPrevented; } }); null`);

check("search: a box that already holds a value shows its clear from the start",
  (await evaluate(`$("#sf2 .search-clear").hidden`)) === false);
check("search: an empty one does not", (await evaluate(`$("#sf .search-clear").hidden`)) === true);
check("search: a hidden clear is really not drawn — [hidden] wins over the class's display",
  (await evaluate(`cs("#sf .search-clear", "display")`)) === "none");
await click(`$("#q")`);
await typeText("abc");
check("search: typing shows the clear", (await evaluate(`$("#sf .search-clear").hidden`)) === false);
await evaluate("log.length = 0; null");
await click(`$("#sf .search-clear")`);
check("search: the clear empties the box", (await evaluate(`$("#q").value`)) === "");
check("search: ...as a person would: input, then change, from the input, bubbling",
  (await evaluate("log.join(',')")) === "input:q,change:q", await evaluate("log.join(',')"));
check("search: ...hides itself and leaves focus in the box",
  (await evaluate(`$("#sf .search-clear").hidden`)) === true && (await evaluate(`document.activeElement.id`)) === "q");

await click(`$("#q3")`);
await typeText("x");
await evaluate("log.length = 0; null");
await press("Escape");
check("search: Escape in a FILLED box clears it", (await evaluate(`$("#q3").value`)) === "" &&
  (await evaluate("log.join(',')")) === "input:q3,change:q3");
check("search: ...and goes no further — the dialog around it never hears the key",
  (await evaluate("escapes")) === 0);
await press("Escape");
check("search: Escape in an EMPTY box does nothing, so it reaches the dialog",
  (await evaluate("escapes")) === 1 && (await evaluate(`$("#q3").value`)) === "");
await evaluate(`$("#q3").setAttribute("aria-expanded", "true"); null`);
await typeText("y");
await press("Escape");
check("search: an OPEN autocomplete keeps its Escape — it reaches the page, not prevented, to dismiss the list",
  (await evaluate("escapes")) === 2 && (await evaluate("lastPrevented")) === false);
await evaluate(`$("#q3").removeAttribute("aria-expanded"); null`);

// The pending line: markPending at t=0 and t=250 with ms=400 → still pending at t≈500 (the first
// call alone would have expired at 400), gone by t≈800 (400 after the second).
await evaluate(`window.t0 = performance.now(); markPending($("#sf"), 400); null`);
check("pending: markPending marks the field and gives the line its duration",
  (await evaluate(`$("#sf").hasAttribute("data-pending")`)) &&
  (await evaluate(`$("#sf").style.getPropertyValue("--pending-ms")`)) === "400ms");
check("pending: the line is the dd-drain animation, over exactly that long",
  (await evaluate(`cs("#sf", "animation-name", "::after")`)) === "dd-drain" &&
  (await evaluate(`cs("#sf", "animation-duration", "::after")`)) === "0.4s");
await evaluate("new Promise((r) => setTimeout(r, 250))");
await evaluate(`markPending($("#q"), 400); null`); // anything inside the field will do
await evaluate(`new Promise((r) => setTimeout(r, Math.max(0, 500 - (performance.now() - t0))))`);
check("pending: each call RESTARTS it — still pending past the first call's deadline",
  await evaluate(`$("#sf").hasAttribute("data-pending")`));
await evaluate(`new Promise((r) => setTimeout(r, Math.max(0, 800 - (performance.now() - t0))))`);
check("pending: ...and it settles `ms` after the LAST call", !(await evaluate(`$("#sf").hasAttribute("data-pending")`)));
await evaluate(`markPending($("#sf2"), 5000); null`);
await click(`$("#sf2 .search-clear")`);
check("pending: clearing the box settles it at once — the pending query was thrown away",
  !(await evaluate(`$("#sf2").hasAttribute("data-pending")`)));
await evaluate(`document.documentElement.classList.add("anim-off"); markPending($("#sf"), 400); null`);
check("pending: html.anim-off stops the drain (the line just stands)",
  (await evaluate(`cs("#sf", "animation-name", "::after")`)) === "none");
await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
check("pending: prefers-reduced-motion stops it too",
  (await evaluate(`cs("#sf", "animation-name", "::after")`)) === "none");
await send("Emulation.setEmulatedMedia", { features: [] });

/* ═══ sort.js — .sort-ctl ═════════════════════════════════════════════════ */

await evaluate(`mount(\`
  <div class="sort-ctl btn-group" role="group" aria-label="sort" id="sc">
    <button type="button" class="sort-dir" data-dir="asc" aria-label="a label that lies"></button>
    <select data-sort aria-label="sort by" id="sortby"><option value="name">name</option><option value="updated">updated</option></select>
  </div>\`); initSelects(); initSortControls(); null`);

check("sort: the arrow is named by what pressing it WILL do — an authored label is brought in line",
  (await evaluate(`$(".sort-dir").getAttribute("aria-label")`)) === "sort descending");
const up = await evaluate(`probe("var(--ico-arrow-up)", "mask-image")`);
const down = await evaluate(`probe("var(--ico-arrow-down)", "mask-image")`);
check("sort: ascending shows the up arrow", (await evaluate(`cs(".sort-dir", "mask-image", "::before")`)) === up);
await evaluate("log.length = 0; null");
await click(`$(".sort-dir")`);
check("sort: a press flips the direction", (await evaluate(`$(".sort-dir").dataset.dir`)) === "desc");
check("sort: ...renames the button for the NEXT press", (await evaluate(`$(".sort-dir").getAttribute("aria-label")`)) === "sort ascending");
check("sort: ...shows the down arrow", (await evaluate(`cs(".sort-dir", "mask-image", "::before")`)) === down);
check("sort: ...and says so once: sortchange { field, dir } on the .sort-ctl",
  (await evaluate("log.join(',')")) === "sortchange:sc:name/desc", await evaluate("log.join(',')"));
await evaluate(`log.length = 0; triggerOf("sortby").focus(); null`);
await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
check("sort: picking a field is ONE sortchange carrying the new field and the direction in force",
  (await evaluate("log.filter((e) => e.startsWith('sortchange')).join(',')")) === "sortchange:sc:updated/desc",
  await evaluate("log.join(',')"));
await evaluate(`$("#sc").addEventListener("sortchange", (e) => {
  if (e.detail.field === "name") $(".sort-dir").dataset.dir = "asc"; }, { once: true }); null`);
await evaluate(`triggerOf("sortby").focus(); null`);
await press("ArrowDown"); await press("Home"); await press("Enter");
await evaluate("tick()");
check("sort: a page that resets the direction from its handler gets the label for free",
  (await evaluate(`$(".sort-dir").dataset.dir`)) === "asc" &&
  (await evaluate(`$(".sort-dir").getAttribute("aria-label")`)) === "sort descending");
check("sort: the two halves share one edge", await evaluate(
  `Math.abs(box(".sort-dir").right - 1 - box(triggerOf("sortby").parentElement).left) <= 0.5`));

/* ═══ filters.css — the boxes ═════════════════════════════════════════════ */

await evaluate(`mount(\`
  <search class="filter-bar" id="bar">
    <div class="search-field" id="bsf"><input type="search" id="bq" aria-label="search" value="x">
      <button type="button" class="search-clear" aria-label="clear search"></button></div>
    <span class="filter-bar-spacer"></span>
    <select data-filter aria-label="source" id="bsrc"><option value="">all</option><option value="s" selected>seedr</option></select>
    <div class="sort-ctl btn-group" role="group" aria-label="sort"><button type="button" class="sort-dir" data-dir="asc"></button>
      <select data-sort aria-label="sort by" id="bsort"><option>name</option></select></div>
  </search>
  <div class="chip-set" role="group" aria-label="tags">
    <button type="button" class="chip" id="c-all" aria-pressed="true">all</button>
    <button type="button" class="chip" id="c-off" aria-pressed="false">#agents <span class="chip-count">12</span></button>
    <button type="button" class="chip" id="c-id" aria-pressed="true" style="--chip-accent: rgb(0, 128, 0)">ddmini</button>
    <button type="button" class="chip" id="c-dis" aria-pressed="false" disabled>disabled</button>
    <button type="button" class="chip" id="c-pc" aria-pressed="true">#infra <span class="chip-count">31</span></button>
  </div>
  <div class="filter-chips"><button type="button" class="chip chip--remove" id="c-rm" aria-label="remove filter source: seedr"><span class="chip-key">source:</span> seedr</button></div>
  <button type="button" class="value-filter" id="vf" aria-label="filter by source: official">official</button>
  <input type="search" id="stray" aria-label="a bare search input, outside any .search-field">
\`); initSelects(); initSearchFields(); initSortControls(); null`);

const h = (expression) => evaluate(`box(${expression}).height`);
await park();
check("css: the search box, the filter trigger and its clear are --control-h (28px) tall",
  (await h(`"#bq"`)) === 28 && (await h(`triggerOf("bsrc")`)) === 28 && (await h(`clearOf("bsrc")`)) === 28,
  [await h(`"#bq"`), await h(`triggerOf("bsrc")`), await h(`clearOf("bsrc")`)].join("/"));
// The sort pair is one row: its arrow stretches to the field beside it. The FIELD's own height is
// the plain select's (components.css), so this asserts the join; the arrow's 28px alone is asserted
// on the bare page below.
check("css: the direction button and its field stand at one height",
  (await h(`".sort-dir"`)) === (await h(`triggerOf("bsort")`)),
  [await h(`".sort-dir"`), await h(`triggerOf("bsort")`)].join("/"));
check("css: the clear and the direction button are 1.5rem wide",
  (await evaluate(`box(clearOf("bsrc")).width`)) === 24 && (await evaluate(`box(".sort-dir").width`)) === 24);
check("css: no corner is rounded, on any control or its glyphs",
  await evaluate(`[...document.querySelectorAll("#mount *")].every((e) =>
    ["", "::before", "::after"].every((p) => getComputedStyle(e, p || null).borderTopLeftRadius === "0px"))`));
check("css: the search box's edge is --control-edge, not the --border hairline",
  (await evaluate(`cs("#bq", "border-top-color")`)) === edge);
check("css: the box keeps its text clear of the magnifier and the clear (2rem each side)",
  (await evaluate(`cs("#bq", "padding-left")`)) === "32px" && (await evaluate(`cs("#bq", "padding-right")`)) === "32px");
check("css: the magnifier sits inside the box, centred on it",
  await evaluate(`(() => { const f = box("#bsf"), g = getComputedStyle($("#bsf"), "::before");
    return g.position === "absolute" && g.width === "14px" && g.insetInlineStart === "10px"; })()`));
check("css: a bare input[type=search] outside a .search-field is untouched by this file",
  (await evaluate(`cs("#stray", "padding-left")`)) !== "32px");

await force("#bq", ["focus-visible"]);
check("css: focus on the search box is ONE box — a 2px --ring outline 2px out, and a --primary edge",
  (await evaluate(`cs("#bq", "outline-style")`)) === "solid" && (await evaluate(`cs("#bq", "outline-width")`)) === "2px" &&
  (await evaluate(`cs("#bq", "outline-offset")`)) === "2px" &&
  (await evaluate(`cs("#bq", "outline-color")`)) === (await evaluate(`probe("var(--ring)")`)) &&
  (await evaluate(`cs("#bq", "border-top-color")`)) === primary &&
  (await evaluate(`cs("#bsf", "outline-style")`)) === "none");
await force("#bq", []);
for (const [label, selector] of [["the clear", "#bsf .search-clear"], ["the filter clear", ".filter-dd .filter-clear"],
  ["the filter trigger", ".select-trigger--filter"], ["the direction button", ".sort-dir"], ["a chip", "#c-off"],
  ["a value filter", "#vf"]]) {
  await force(selector, ["focus-visible"]);
  check(`css: ${label} takes the 2px --ring focus ring`,
    (await evaluate(`cs(${JSON.stringify(selector)}, "outline-width")`)) === "2px" &&
    (await evaluate(`cs(${JSON.stringify(selector)}, "outline-color")`)) === (await evaluate(`probe("var(--ring)")`)));
  await force(selector, []);
}
await force(".sort-dir", ["hover"]);
check("css: hovering the direction button lights its edge and a 12% --primary tint",
  (await evaluate(`cs(".sort-dir", "border-top-color")`)) === primary &&
  (await evaluate(`cs(".sort-dir", "background-color")`)) === (await evaluate(`probe("color-mix(in srgb, var(--primary) 12%, transparent)", "background-color")`)));
await force(".sort-dir", []);

check("css: a pressed chip is --primary, bold, on a 12% --primary fill",
  (await evaluate(`cs("#c-all", "color")`)) === primary && (await evaluate(`cs("#c-all", "font-weight")`)) === "700" &&
  (await evaluate(`cs("#c-all", "background-color")`)) === (await evaluate(`probe("color-mix(in srgb, var(--primary) 12%, transparent)", "background-color")`)));
check("css: an unpressed chip is muted, regular weight, on the --border hairline",
  (await evaluate(`cs("#c-off", "color")`)) === (await evaluate(`probe("var(--muted-foreground)")`)) &&
  (await evaluate(`cs("#c-off", "font-weight")`)) === "400" &&
  (await evaluate(`cs("#c-off", "border-top-color")`)) === (await evaluate(`probe("var(--border)")`)));
check("css: a count inside a PRESSED chip takes the chip's ink — muted on the 12% fill fails AA",
  (await evaluate(`cs("#c-pc .chip-count", "color")`)) === primary &&
  (await evaluate(`cs("#c-off .chip-count", "color")`)) === (await evaluate(`probe("var(--muted-foreground)")`)));
// Rest BEFORE the forced hover: clearing a FORCED pseudo-state does not restyle descendants keyed
// on it (measured — `.chip--remove:hover .chip-key` kept its hover ink with :hover false), which is
// a DevTools artifact, not the page's behaviour.
check("css: the key of a remove chip at rest is muted", (await evaluate(`cs("#c-rm .chip-key", "color")`)) ===
  (await evaluate(`probe("var(--muted-foreground)")`)));
await force("#c-rm", ["hover"]);
check("css: ...and on the hovered remove chip's fill it takes the chip's ink",
  (await evaluate(`cs("#c-rm .chip-key", "color")`)) === primary);
await force("#c-rm", []);
check("css: a row of in-force chips hidden with the attribute is really hidden",
  (await evaluate(`($(".filter-chips").hidden = true, cs(".filter-chips", "display"))`)) === "none");
check("css: an identity chip takes its --chip-accent instead of --primary",
  (await evaluate(`cs("#c-id", "color")`)) === "rgb(0, 128, 0)" && (await evaluate(`cs("#c-id", "border-top-color")`)) === "rgb(0, 128, 0)");
await evaluate(`$("#bsrc").disabled = true; tick()`);
check("css: disabled is .45 opacity (chip, and a disabled filter trigger)",
  (await evaluate(`cs("#c-dis", "opacity")`)) === "0.45" &&
  (await evaluate(`cs(triggerOf("bsrc"), "opacity")`)) === "0.45");
check("css: a remove chip is --primary with its × after the label",
  (await evaluate(`cs("#c-rm", "color")`)) === primary &&
  (await evaluate(`cs("#c-rm", "mask-image", "::after")`)) === (await evaluate(`probe("var(--ico-x)", "mask-image")`)));

// Touch emulation is what makes (pointer: coarse) match; setEmulatedMedia accepts the feature and
// changes nothing (measured).
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
check("css: under a coarse pointer every control is at least 44px",
  (await h(`"#bq"`)) >= 44 && (await h(`clearOf("bsrc")`)) >= 44 && (await h(`".sort-dir"`)) >= 44 &&
  (await h(`"#c-off"`)) >= 44 && (await evaluate(`box(".sort-dir").width`)) >= 44,
  [await h(`"#bq"`), await h(`clearOf("bsrc")`), await h(`".sort-dir"`), await h(`"#c-off"`)].join("/"));
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 700, deviceScaleFactor: 1, mobile: false });
check("css: on a phone the search takes the bar's whole first row and the spacer is gone",
  near(await evaluate(`box("#bsf").width`), await evaluate(`box("#bar").width`)) &&
  (await evaluate(`cs(".filter-bar-spacer", "display")`)) === "none",
  `${await evaluate(`box("#bsf").width`)} of ${await evaluate(`box("#bar").width`)}`);
await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });

/* ── self-sufficient: tokens.css + filters.css and nothing else ── */

await open("/bare");
check("bare: the search box still has its whole box — 28px, 1px --control-edge, border-box, the page's font",
  (await evaluate(`box("#q").height`)) === 28 && (await evaluate(`cs("#q", "border-top-width")`)) === "1px" &&
  (await evaluate(`cs("#q", "border-top-color")`)) === (await evaluate(`probe("var(--control-edge)")`)) &&
  (await evaluate(`cs("#q", "box-sizing")`)) === "border-box" &&
  (await evaluate(`cs("#q", "font-family")`)) === (await evaluate(`cs("body", "font-family")`)));
check("bare: the chip, the direction button and the clear keep theirs",
  (await evaluate(`box("#chip").height`)) === 24 && (await evaluate(`cs("#chip", "border-top-width")`)) === "1px" &&
  (await evaluate(`box("#dir").height`)) === 28 && (await evaluate(`box("#dir").width`)) === 24 &&
  (await evaluate(`box("#clr").height`)) === 28 && (await evaluate(`cs("#chip", "font-family")`)) === (await evaluate(`cs("body", "font-family")`)));
check("bare: no user-agent button chrome survives (no UA padding, no UA grey fill)",
  (await evaluate(`["#dir", "#clr", "#vf"].every((s) => cs(s, "padding-top") === "0px")`)) &&
  (await evaluate(`["#chip", "#dir", "#clr", "#vf"].every((s) => cs(s, "background-color") === "rgba(0, 0, 0, 0)")`)));
await force("#chip", ["focus-visible"]);
check("bare: focus is still the 2px ring, with no base.css to supply one",
  (await evaluate(`cs("#chip", "outline-width")`)) === "2px" && (await evaluate(`cs("#chip", "outline-style")`)) === "solid");

console.log(failures
  ? `\ncheck-filters: ${failures} FAILED`
  : "\ncheck-filters: all checks passed");
process.exit(failures ? 1 : 0);
