#!/usr/bin/env node
/*
 * check-dropdown.mjs — a `details.dropdown` is a MENU, and it stays one on markup rendered later.
 *
 * WHAT IS AT RISK. Until 0.60.0 runtime/dropdown.js was the "one open, close on a click away or
 * Escape" layer and nothing else, and it bound only the dropdowns that existed when it was called.
 * Two failures followed from that and neither was visible on a static page:
 *   · every dropdown runtime/tabletools.js builds in a table header — rendered AFTER the call —
 *     had no click-away and no Escape at all;
 *   · a keyboard reader who opened any dropdown got no arrow keys, and Escape dropped focus on
 *     <body> instead of handing it back to the summary.
 * 0.60.0 makes a panel of rows an ARIA APG menu, delegates every listener to the document and
 * marks later markup with a MutationObserver. Each of those is asserted here, including the
 * disclosure case — a panel holding a text field must NOT be announced as a menu.
 *
 * A REAL BROWSER AND REAL KEYS. The subject is default actions: a summary toggles itself on Enter
 * and Space, Tab moves focus, a button activates on Space's keyup. A dispatched KeyboardEvent skips
 * every one of those, so it would pass a build whose Space opens the menu and closes it again. Keys
 * go through the DevTools protocol's Input domain, exactly as a reader's would. The SHIPPED modules
 * are served off the working tree and imported as they are — nothing is inlined or rewritten.
 *
 * No dependency: headless chromium from the Playwright cache, Node's own fetch and WebSocket. The
 * debugging port is 0 and read back from DevToolsActivePort, so two suites running at once on one
 * machine cannot talk to each other's browser. No browser: it SKIPS loudly (and fails under
 * DD_REQUIRE_BROWSER=1), as the other browser checks do.
 *
 * A RENDERER THAT PATCHES ATTRIBUTES must not un-mark a menu: a page that strips the runtime's
 * attributes while the menu is open, and cockpit's real dom-patch.js (`cockpitPatch`), read from
 * the infra checkout beside this repository or DD_COCKPIT_DOM_PATCH. Missing, that case SKIPS
 * loudly, and fails under DD_REQUIRE_COCKPIT_DOM_PATCH=1. After the runtime has put the attributes
 * back, 1.5s must pass with no mutation at all: a re-mark that wrote even an equal value would loop.
 *
 *   node scripts/check-dropdown.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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
  console.log("check-dropdown: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts real key presses, focus movement and a MutationObserver, none of which");
  console.log("  a stub can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the page under test ──────────────────────────────────────────────────── */

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font: 14px system-ui; margin: 20px; }
  details.dropdown { display: inline-block; margin: 0 1rem 1rem 0; vertical-align: top; }
</style></head><body>
<button id="before">before</button>
<details class="dropdown" id="dd1"><summary id="s1">actions</summary>
  <ul class="dropdown-panel" role="list">
    <li><span class="dropdown-label">file</span></li>
    <li><button type="button" class="dropdown-item" id="i-rename">rename</button></li>
    <li><button type="button" class="dropdown-item" id="i-dup">duplicate</button></li>
    <li><button type="button" class="dropdown-item" id="i-del">delete</button></li>
    <li class="dropdown-sep" id="sep"></li>
    <li><button type="button" class="dropdown-item" id="i-dis" aria-disabled="true">disabled one</button></li>
    <li><button type="button" class="dropdown-item" id="i-focus">focus the field</button></li>
  </ul></details>
<button id="after">after</button>
<details class="dropdown" id="dd2"><summary id="s2">second</summary>
  <ul class="dropdown-panel"><li><button type="button" class="dropdown-item" id="i2">only</button></li></ul></details>
<details class="dropdown" id="ddv"><summary id="sv">view</summary>
  <ul class="dropdown-panel">
    <li><span class="dropdown-label">sort by</span></li>
    <li><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="true" id="v-name">name</button></li>
    <li><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="false" id="v-updated">updated</button></li>
    <li><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="false" id="v-stars">stars</button></li>
    <li class="dropdown-sep"></li>
    <li><span class="dropdown-label">order</span></li>
    <li><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="true" id="v-asc">ascending</button></li>
    <li><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="false" id="v-desc">descending</button></li>
  </ul></details>
<details class="dropdown" id="dda"><summary id="sa">links</summary>
  <ul class="dropdown-panel"><li><a class="dropdown-item" id="a-ok" href="#a-ok-followed">open</a></li>
    <li><a class="dropdown-item" id="a-off" href="#a-off-followed" aria-disabled="true">unavailable</a></li></ul></details>
<details class="dropdown" id="ddx"><summary id="sx">filter</summary>
  <div class="dropdown-panel"><input type="search" id="fx" aria-label="filter"></div></details>
<details class="dropdown" id="dth"><summary id="sth">theme <span data-theme-label></span></summary>
  <ul class="dropdown-panel" role="list">
    <li><button type="button" class="dropdown-item" data-theme-value="warm" id="t-warm">warm</button></li>
    <li><button type="button" class="dropdown-item" data-theme-value="green" id="t-green">green</button></li>
  </ul></details>
<div id="flat"><button type="button" class="dropdown-item" data-theme-value="green" id="flat-green">green</button></div>
<span id="late-theme-slot"></span>
<input id="field" aria-label="field">
<span id="late-slot"></span>
<dialog id="dlg"><details class="dropdown" id="ddd"><summary id="sd">in a dialog</summary>
  <ul class="dropdown-panel"><li><button type="button" class="dropdown-item" id="id1">one</button></li></ul></details></dialog>
<details class="dropdown" id="ddg"><summary id="sg">pre-grouped</summary>
  <ul class="dropdown-panel">
    <li role="none"><ul role="group" aria-labelledby="g-sort">
      <li role="none"><span class="dropdown-label" id="g-sort">sort by</span></li>
      <li role="none"><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="true" id="g-name">name</button></li>
      <li role="none"><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="false" id="g-stars">stars</button></li>
    </ul></li>
    <li class="dropdown-sep" role="separator"></li>
    <li role="none"><ul role="group" aria-labelledby="g-order">
      <li role="none"><span class="dropdown-label" id="g-order">order</span></li>
      <li role="none"><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="true" id="g-asc">ascending</button></li>
      <li role="none"><button type="button" class="dropdown-item" role="menuitemradio" aria-checked="false" id="g-desc">descending</button></li>
    </ul></li>
  </ul></details>
<span id="rowhdr">row actions</span>
<details class="dropdown" id="ddn"><summary id="sn">⋯</summary>
  <ul class="dropdown-panel" aria-labelledby="rowhdr"><li><button type="button" class="dropdown-item" id="n1">copy</button></li></ul></details>
<details class="dropdown" id="ddu"><summary>view</summary>
  <ul class="dropdown-panel"><li><button type="button" class="dropdown-item" id="u1">compact</button></li></ul></details>
<div id="patch-mount"></div>
<button id="pm-opener">opener</button>
<ul id="pm" role="menu" aria-label="page menu" hidden>
  <li role="none"><button type="button" role="menuitem" id="pm1">open</button></li>
  <li role="none"><button type="button" role="menuitem" id="pm2">copy</button></li>
</ul>
<script type="module">
  // Namespace imports: a module missing one export (an older build) still loads, and the cases
  // that need the export fail by name instead of the page never running at all.
  import * as dropdown from "/runtime/dropdown.js";
  import * as theme from "/runtime/theme.js";
  window.acts = [];
  for (const b of document.querySelectorAll("#dd1 .dropdown-item")) b.addEventListener("click", () => acts.push(b.id));
  document.getElementById("i-focus").addEventListener("click", () => document.getElementById("field").focus());
  // Theme first, exactly as cockpit, family and the template call them.
  theme.initThemeSwitcher();
  window.closeAll = dropdown.initDropdowns();
  window.setTheme = theme.setTheme;
  window.THEMES = theme.THEMES;
  window.attachMenuKeys = dropdown.attachMenuKeys;
  window.ready = true;
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  const file = { "/runtime/dropdown.js": "runtime/dropdown.js", "/runtime/theme.js": "runtime/theme.js" }[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
  res.end(readFileSync(join(root, file), "utf8"));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));

/* ── the browser ──────────────────────────────────────────────────────────── */

const profile = mkdtempSync(join(tmpdir(), "dd-dropdown-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: true });
let socket;
// The browser leads its own process group, so the whole group goes before its profile does: no
// renderer is still writing into what is removed, and no run leaves a profile in $TMPDIR.
const shutdown = () => { try { socket?.close(); } catch {} try { process.kill(-chrome.pid, "SIGKILL"); } catch { chrome.kill("SIGKILL"); } try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} server.close(); };
process.on("exit", shutdown);

let port;
for (let i = 0; i < 100 && !port; i += 1) {
  try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {}
  if (!port) await sleep(100);
}
if (!port) { shutdown(); throw new Error("headless chromium did not come up"); }

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
// Declared before send(): its timeout can fire before the first check has run.
let last = "(none yet)";
// A page stuck in a loop (a MutationObserver that feeds itself) never answers again, and a suite
// that waits for it forever says nothing at all. So no DevTools call waits longer than 20s: past
// that the run ends with a FAIL naming the last check that completed.
const send = (method, params = {}) => new Promise((ok, bad) => {
  messageId += 1;
  const id = messageId;
  const timer = setTimeout(() => {
    console.log(`FAIL  the page stopped answering (${method}, 20s) after "${last}" — a runaway loop in the page`);
    console.log("\ncheck-dropdown: FAILED");
    shutdown();
    process.exit(1);
  }, 20000);
  pending.set(id, { ok: (v) => { clearTimeout(timer); ok(v); }, bad: (e) => { clearTimeout(timer); bad(e); } });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
for (let i = 0; i < 50 && !(await evaluate("window.ready === true").catch(() => false)); i += 1) await sleep(100);

const KEYS = {
  Enter: { code: "Enter", keyCode: 13, text: "\r" }, " ": { code: "Space", keyCode: 32, text: " " },
  Tab: { code: "Tab", keyCode: 9 }, Escape: { code: "Escape", keyCode: 27 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 }, ArrowUp: { code: "ArrowUp", keyCode: 38 },
  Home: { code: "Home", keyCode: 36 }, End: { code: "End", keyCode: 35 },
};
const press = async (key, { shift = false } = {}) => {
  const def = KEYS[key] || { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), text: key };
  const modifiers = shift ? 8 : 0;
  await send("Input.dispatchKeyEvent", { type: def.text ? "keyDown" : "rawKeyDown", key, code: def.code,
    windowsVirtualKeyCode: def.keyCode, text: def.text, unmodifiedText: def.text, modifiers });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: def.code, windowsVirtualKeyCode: def.keyCode, modifiers });
  await sleep(40); // `toggle` is dispatched asynchronously
};
const click = async (id) => {
  const box = await evaluate(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(40);
};
const focused = () => evaluate("document.activeElement?.id || document.activeElement?.tagName");
const isOpen = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).open`);
const attr = (id, name) => evaluate(`document.getElementById(${JSON.stringify(id)}).getAttribute(${JSON.stringify(name)})`);
const reset = () => evaluate("closeAll(); document.getElementById('before').focus(); acts.length = 0; null");
const focusOn = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).focus(); null`);

let failures = 0;
const check = (label, condition, detail) => {
  last = label;
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
};
/*
 * A THROW IS A FAIL, NOT A STACK. Each group runs inside section(): an exception — an older build
 * without attachMenuKeys, a node a re-render detached — is reported as a FAIL naming the group and
 * the last check that completed, and the next group still runs. A suite one throw can abort says
 * nothing about everything after the throw, and to a grep for FAIL that reads like a pass.
 */
const section = async (name, body) => {
  try {
    await body();
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}: aborted after "${last}"\n        ${String(error.message).split("\n")[0]}`);
  }
};

/* ── a panel of rows is a menu; a panel holding a field is not ───────────── */
await section("a panel of rows is a menu; a panel holding a field is not", async () => {
  const roles = await evaluate(`(() => {
    const p = document.querySelector("#dd1 .dropdown-panel");
    return { panel: p.getAttribute("role"), labelledby: p.getAttribute("aria-labelledby"),
      lis: [...p.children].map((li) => li.getAttribute("role")),
      items: [...p.querySelectorAll(".dropdown-item")].map((b) => b.getAttribute("role") + "/" + b.getAttribute("tabindex")),
      haspopup: document.getElementById("s1").getAttribute("aria-haspopup"),
      expanded: document.getElementById("s1").getAttribute("aria-expanded") };
  })()`);
  check("a panel of rows becomes role=menu, labelled by its summary", roles.panel === "menu" && roles.labelledby === "s1", roles);
  check("...its <li>s are role=none and its separator role=separator (the labelled section is one <li> now)",
    roles.lis.join() === "none,separator,none,none", roles.lis);
  check("...its items are menuitems out of the tab order (tabindex -1)",
    roles.items.every((r) => r === "menuitem/-1"), roles.items);
  check("...and the summary says it opens a menu, and that it is shut", roles.haspopup === "menu" && roles.expanded === "false", roles);

  // A labelled section is an APG group named by its label, read off the accessibility tree.
  await send("Accessibility.enable");
  // A menu's shape: each group with its name and the roles of the items under it, and any item
  // outside a group. Opened one at a time (a closed <details> has no tree, and one open closes the other).
  const shape = async (id, name) => {
    await evaluate(`document.getElementById("${id}").open = true; null`);
    await sleep(60);
    const { nodes } = await send("Accessibility.getFullAXTree", {});
    await evaluate(`document.getElementById("${id}").open = false; null`);
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const out = [];
    const walk = (n, group) => {
      if (!n) return;
      const role = n.ignored ? null : n.role?.value;
      if (role === "group") { group = { group: n.name?.value, items: [] }; out.push(group); }
      else if (/^menuitem/.test(role || "")) (group ? group.items : out).push(role);
      for (const c of n.childIds || []) walk(byId.get(c), group);
    };
    walk(nodes.find((n) => n.role?.value === "menu" && n.name?.value === name), null);
    return out;
  };
  const view = await shape("ddv", "view"), actions = await shape("dd1", "actions");
  check("a menu with a \"sort by\" and an \"order\" section exposes two named groups, 3 and 2 radios",
    JSON.stringify(view) === JSON.stringify([{ group: "sort by", items: ["menuitemradio", "menuitemradio", "menuitemradio"] },
      { group: "order", items: ["menuitemradio", "menuitemradio"] }]), view);
  check("...and a label over part of a menu groups only its own items, up to the separator",
    JSON.stringify(actions) === JSON.stringify([{ group: "file", items: ["menuitem", "menuitem", "menuitem"] }, "menuitem", "menuitem"]), actions);
  check("...the label is not hidden: it is the group's name",
    (await evaluate(`document.querySelector("#ddv .dropdown-label").hasAttribute("aria-hidden")`)) === false);
  await reset(); await focusOn("sv"); await press("ArrowDown"); await press("ArrowDown"); await press("ArrowDown"); await press("ArrowDown");
  check("...and the arrow keys walk from one group into the next", (await focused()) === "v-asc", await focused());

  // Markup already written in the grouped shape (a renderer that writes it, a page-built menu
  // copied into a details) is read through its groups, not rejected as "holds something else".
  const pre = await shape("ddg", "pre-grouped");
  check("a details.dropdown written ALREADY GROUPED is a menu with its two named groups",
    (await evaluate(`document.querySelector("#ddg .dropdown-panel").getAttribute("role")`)) === "menu"
      && JSON.stringify(pre) === JSON.stringify([{ group: "sort by", items: ["menuitemradio", "menuitemradio"] },
        { group: "order", items: ["menuitemradio", "menuitemradio"] }]), pre);
  await reset(); await focusOn("sg"); await press("ArrowDown"); await press("ArrowDown"); await press("ArrowDown");
  check("...and ArrowDown crosses from its first group into its second", (await focused()) === "g-asc", await focused());
  await reset();

  const disclosure = await evaluate(`({ role: document.querySelector("#ddx .dropdown-panel").getAttribute("role"),
    haspopup: document.getElementById("sx").getAttribute("aria-haspopup"),
    tabindex: document.getElementById("fx").getAttribute("tabindex") })`);
  check("a panel holding a text field stays a DISCLOSURE: no menu role, no aria-haspopup, field still tabbable",
    disclosure.role === null && disclosure.haspopup === null && disclosure.tabindex === null, disclosure);

  const theme = await evaluate(`[...document.querySelectorAll("#dth .dropdown-item")].map((b) => b.getAttribute("role") + "/" + b.getAttribute("aria-checked"))`);
  check("theme items in a menu are menuitemradio with aria-checked, and marking kept the role",
    theme.join() === "menuitemradio/true,menuitemradio/false", theme);
  check("...a theme item OUTSIDE a menu is a toggle button (aria-pressed), never a stray menuitem",
    (await attr("flat-green", "role")) === null && (await attr("flat-green", "aria-pressed")) === "false");
});

/* ── the summary opens the menu from the keyboard ────────────────────────── */
await section("the summary opens the menu from the keyboard", async () => {
  await reset(); await focusOn("s1"); await press("ArrowDown");
  check("ArrowDown on the summary opens the menu onto the FIRST item",
    (await isOpen("dd1")) && (await focused()) === "i-rename", await focused());
  check("...and aria-expanded follows", (await attr("s1", "aria-expanded")) === "true");
  await press("ArrowDown");
  check("ArrowDown moves to the next item", (await focused()) === "i-dup", await focused());
  await press("End");
  check("End jumps to the last item", (await focused()) === "i-focus", await focused());
  await press("ArrowDown");
  check("ArrowDown on the last item WRAPS to the first", (await focused()) === "i-rename", await focused());
  await press("ArrowUp");
  check("ArrowUp on the first item wraps to the last", (await focused()) === "i-focus", await focused());
  await press("Home");
  check("Home jumps to the first item", (await focused()) === "i-rename", await focused());
  await press("d");
  check("typeahead: 'd' goes to the first item starting with d", (await focused()) === "i-dup", await focused());
  await press("d");
  check("...'d' again CYCLES to the next d-item", (await focused()) === "i-del", await focused());
  await press("d");
  check("...and reaches an aria-disabled item, which APG keeps focusable", (await focused()) === "i-dis", await focused());
  // The precondition is part of the claim: a menu that never opened would "close to the summary"
  // trivially, and pass on a build with no keys at all.
  const beforeEscape = { open: await isOpen("dd1"), focus: await focused() };
  await press("Escape");
  check("Escape closes the OPEN menu and hands focus from the item back to the summary",
    beforeEscape.open && beforeEscape.focus === "i-dis" && !(await isOpen("dd1")) && (await focused()) === "s1",
    { beforeEscape, focus: await focused() });
  check("...and aria-expanded follows", (await attr("s1", "aria-expanded")) === "false");

  await reset(); await focusOn("s1"); await press("ArrowUp");
  check("ArrowUp on the summary opens the menu onto the LAST item",
    (await isOpen("dd1")) && (await focused()) === "i-focus", await focused());

  await reset(); await focusOn("s1"); await press("Enter");
  check("Enter on the summary opens the menu onto the first item — and it STAYS open",
    (await isOpen("dd1")) && (await focused()) === "i-rename", { open: await isOpen("dd1"), focus: await focused() });

  await reset(); await focusOn("s1"); await press(" ");
  check("Space on the summary opens the menu onto the first item — and it STAYS open",
    (await isOpen("dd1")) && (await focused()) === "i-rename", { open: await isOpen("dd1"), focus: await focused() });
  await press(" ");
  check("...Space then activates the focused item, and does not reopen anything",
    (await evaluate("acts.join()")) === "i-rename" && !(await isOpen("dd1")), await evaluate("acts"));
});

/* ── leaving and activating ──────────────────────────────────────────────── */
await section("leaving and activating", async () => {
  await reset(); await focusOn("s1"); await press("ArrowDown");
  const beforeTab = await focused();
  await press("Tab");
  check("Tab from an ITEM closes the menu and moves on, past the dropdown",
    beforeTab === "i-rename" && !(await isOpen("dd1")) && (await focused()) === "after", { beforeTab, focus: await focused() });

  await reset(); await focusOn("s1"); await press("ArrowDown"); await press("Tab", { shift: true });
  check("Shift+Tab from an item closes the menu and lands on its summary",
    !(await isOpen("dd1")) && (await focused()) === "s1", await focused());

  await reset(); await focusOn("s1"); await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
  check("Enter on an item runs it, closes the menu and hands focus back to the summary",
    (await evaluate("acts.join()")) === "i-dup" && !(await isOpen("dd1")) && (await focused()) === "s1",
    { acts: await evaluate("acts"), focus: await focused() });

  await reset(); await click("s1"); await click("i-del");
  check("a mouse click on an item runs it and closes the menu",
    (await evaluate("acts.join()")) === "i-del" && !(await isOpen("dd1")), await evaluate("acts"));

  await reset(); await click("s1"); await click("i-dis");
  check("an aria-disabled item does NOT close the menu when pressed", await isOpen("dd1"));

  await evaluate("history.replaceState(null, '', location.pathname); null");
  await reset(); await focusOn("sa"); await press("ArrowDown"); await press("ArrowDown");
  const onOff = await focused();
  await press("Enter");
  check("Enter on an aria-disabled LINK item does not follow it, and the menu stays open",
    onOff === "a-off" && (await evaluate("location.hash")) === "" && (await isOpen("dda")),
    { focus: onOff, hash: await evaluate("location.hash"), open: await isOpen("dda") });
  await reset(); await click("sa"); await click("a-off");
  check("...and neither does a click on it",
    (await evaluate("location.hash")) === "" && (await isOpen("dda")), { hash: await evaluate("location.hash"), open: await isOpen("dda") });
  await reset(); await focusOn("sa"); await press("ArrowDown"); await press("Enter");
  check("...while Enter on an available link item still follows it (so the check can fail)",
    (await evaluate("location.hash")) === "#a-ok-followed", await evaluate("location.hash"));
  await evaluate("history.replaceState(null, '', location.pathname); null");

  await reset(); await click("s1"); await click("i-focus");
  check("an action that moves focus on purpose keeps it — the summary does not steal it back",
    !(await isOpen("dd1")) && (await focused()) === "field", await focused());
});

/* ── one open, click-away, Escape from anywhere ──────────────────────────── */
await section("one open, click-away, Escape from anywhere", async () => {
  await reset(); await click("s1"); await click("s2");
  check("opening one dropdown closes the other", (await isOpen("dd2")) && !(await isOpen("dd1")));
  await click("before");
  check("a click outside closes it", !(await isOpen("dd2")));

  await reset(); await click("s1"); await focusOn("before"); await press("Escape");
  check("Escape with focus OUTSIDE closes an open menu", !(await isOpen("dd1")));

  await reset(); await click("sx"); await focusOn("fx"); await press("Tab", { shift: true }); await press("Tab");
  check("a disclosure's field is reachable with Tab (it is not a menu)", (await focused()) === "fx", await focused());
  await press("Escape");
  check("Escape inside a disclosure closes it and returns focus to its summary",
    !(await isOpen("ddx")) && (await focused()) === "sx", await focused());

  await reset();
  await evaluate("document.getElementById('dlg').showModal(); document.getElementById('sd').focus(); null");
  await press("ArrowDown"); await press("Escape");
  check("Escape in a menu inside a modal <dialog> closes the MENU, not the dialog",
    !(await isOpen("ddd")) && (await evaluate("document.getElementById('dlg').open")) && (await focused()) === "sd",
    { dialog: await evaluate("document.getElementById('dlg').open"), focus: await focused() });
  await click("sd"); await focusOn("sd"); await press("Escape");
  check("...and so does Escape on the SUMMARY of a menu opened by mouse",
    !(await isOpen("ddd")) && (await evaluate("document.getElementById('dlg').open")),
    { menu: await isOpen("ddd"), dialog: await evaluate("document.getElementById('dlg').open") });
  await evaluate("document.getElementById('dlg').close(); null");

  await reset(); await click("s1");
  await evaluate(`(() => { const p = document.createElement("ul"); p.className = "select-panel"; p.id = "sp";
    p.innerHTML = '<li class="select-option" id="spo">x</li>'; document.body.appendChild(p); })()`);
  await click("spo");
  check("a pick in a select's list on <body> does not close the dropdown holding the select", await isOpen("dd1"));
  await evaluate("document.getElementById('sp').remove(); null");
});

/* ── markup rendered later ───────────────────────────────────────────────── */
await section("markup rendered later", async () => {
  await reset();
  await evaluate(`document.getElementById("late-slot").innerHTML =
    '<details class="dropdown" id="ddl"><summary id="sl">late</summary><ul class="dropdown-panel">' +
    '<li><button type="button" class="dropdown-item" id="l1">alpha</button></li>' +
    '<li><button type="button" class="dropdown-item" id="l2">beta</button></li></ul></details>'; null`);
  await sleep(40);
  check("a dropdown rendered AFTER initDropdowns() is marked as a menu",
    (await evaluate("document.querySelector('#ddl .dropdown-panel').getAttribute('role')")) === "menu");
  await focusOn("sl"); await press("ArrowDown"); await press("ArrowDown");
  check("...and its keys work", (await focused()) === "l2", await focused());
  await click("before"); await click("sl");
  const lateOpened = await isOpen("ddl");
  await click("before");
  check("...and a click away closes it (opened by a click first)", lateOpened && !(await isOpen("ddl")), { lateOpened });
  await evaluate(`document.querySelector("#ddl .dropdown-panel").insertAdjacentHTML("beforeend",
    '<li><button type="button" class="dropdown-item" id="l3">gamma</button></li>'); null`);
  await sleep(40);
  check("a row ADDED to an existing menu is marked too (a pick list rebuilt from new values)",
    (await attr("l3", "role")) === "menuitem" && (await attr("l3", "tabindex")) === "-1",
    { role: await attr("l3", "role"), tabindex: await attr("l3", "tabindex") });
});

/* ── a renderer that patches attributes ──────────────────────────────────── */
// Every attribute the runtime owns inside a dropdown, as one string to compare before and after.
const OWNED = ["role", "tabindex", "aria-haspopup", "aria-expanded", "aria-labelledby", "id"];
const owned = (id) => evaluate(`JSON.stringify([...document.getElementById(${JSON.stringify(id)}).querySelectorAll("*")]
  .map((el) => ${JSON.stringify(OWNED)}.map((a) => el.getAttribute(a))))`);
// Mutation records under `id` in a window of `ms`, starting now.
const quiet = (id, ms) => evaluate(`new Promise((ok) => { let n = 0; const o = new MutationObserver((r) => { n += r.length; });
  o.observe(document.getElementById(${JSON.stringify(id)}), { attributes: true, childList: true, subtree: true });
  setTimeout(() => { o.disconnect(); ok(n); }, ${ms}); })`);

await section("a renderer that patches attributes cannot un-mark a menu (N1)", async () => {
  await reset(); await focusOn("s1"); await press("ArrowDown");
  const before = await owned("dd1");
  const stripped = quiet("dd1", 80);
  await evaluate(`(() => { const p = document.querySelector("#dd1 .dropdown-panel");
    p.removeAttribute("role"); p.removeAttribute("aria-labelledby");
    for (const el of p.querySelectorAll("li, .dropdown-item, [role='group']")) { el.removeAttribute("role"); el.removeAttribute("tabindex"); el.removeAttribute("aria-labelledby"); }
    const s = document.getElementById("s1"); s.removeAttribute("aria-haspopup"); s.setAttribute("aria-expanded", "false"); })()`);
  const seen = await stripped;
  const after = await owned("dd1");
  const settled = await quiet("dd1", 1500);
  check("the page strips the menu's roles, tabindex and aria-* while it is open, and the runtime puts every one back",
    seen > 0 && after === before, { records: seen, same: after === before });
  check(`...and then nothing moves for 1.5s — ${settled} mutation records (a re-mark that rewrites loops)`, settled === 0, settled);
  await press("ArrowDown");
  check("...and the arrow keys still walk it", (await focused()) === "i-dup", await focused());
  await reset();

  // The menu's NAME through a strip: an author's aria-labelledby is the author's; the runtime's own
  // (a dd-menu-* id on the summary) follows the summary to the id the runtime has to re-make.
  const nameOf = (id) => evaluate(`(() => { const p = document.querySelector("#${id} .dropdown-panel"); const ref = p.getAttribute("aria-labelledby");
    return { ref, name: document.getElementById(ref)?.textContent.trim() ?? null }; })()`);
  await evaluate(`(() => { const p = document.querySelector("#ddn .dropdown-panel"); p.removeAttribute("role");
    const s = document.getElementById("sn"); s.removeAttribute("id"); s.removeAttribute("aria-haspopup"); })()`);
  await sleep(40);
  const authored = await nameOf("ddn");
  check("a menu the author names (aria-labelledby → \"row actions\") keeps that name through a strip and repair",
    authored.ref === "rowhdr" && authored.name === "row actions"
      && (await evaluate(`document.querySelector("#ddn .dropdown-panel").getAttribute("role")`)) === "menu", authored);
  const own = (await nameOf("ddu")).ref;
  await evaluate(`document.querySelector("#ddu summary").removeAttribute("id"); null`);
  await sleep(40);
  const renamed = await nameOf("ddu");
  check("remove ONLY the summary's id: the runtime's own aria-labelledby moves to the summary's new dd-menu-* id, and the menu keeps its name",
    renamed.ref !== own && /^dd-menu-/.test(renamed.ref) && renamed.name === "view", { before: own, after: renamed });

  const candidates = [process.env.DD_COCKPIT_DOM_PATCH, join(root, "../danieldeusing-infra/cockpit/pages/dom-patch.js"),
    join(root, "../../danieldeusing-infra/cockpit/pages/dom-patch.js")].filter(Boolean);
  const file = candidates.find((path) => existsSync(path));
  if (!file) {
    console.log(`SKIP  cockpit's dom-patch.js is not beside this checkout (looked in ${candidates.join(", ")})`);
    check("DD_REQUIRE_COCKPIT_DOM_PATCH is not set, so a missing dom-patch.js may skip", process.env.DD_REQUIRE_COCKPIT_DOM_PATCH !== "1");
    return;
  }
  await evaluate(readFileSync(file, "utf8"));
  // What a cockpit renderer writes: no runtime attribute, and a labelled section in the grouped shape.
  const html = '<details class="dropdown" id="ddp"><summary id="sp">patched</summary><ul class="dropdown-panel">' +
    '<li><ul role="group" aria-labelledby="p-lbl"><li><span class="dropdown-label" id="p-lbl">view</span></li>' +
    '<li><button type="button" class="dropdown-item" id="p1">one</button></li><li><button type="button" class="dropdown-item" id="p2">two</button></li></ul></li>' +
    '<li class="dropdown-sep"></li><li><button type="button" class="dropdown-item" id="p3">three</button></li></ul></details>';
  await evaluate(`document.getElementById("patch-mount").innerHTML = ${JSON.stringify(html)}; null`);
  await sleep(40);
  await focusOn("sp"); await press("ArrowDown");
  const marked = await owned("patch-mount");
  const patched = quiet("patch-mount", 80);
  await evaluate(`cockpitPatch(document.getElementById("patch-mount"), ${JSON.stringify(html)}); null`);
  const touched = await patched;
  const repaired = await owned("patch-mount");
  const calm = await quiet("patch-mount", 1500);
  check(`cockpitPatch (${file.split("/").slice(-3).join("/")}) strips the runtime's attributes, and the runtime puts every one back`,
    touched > 0 && repaired === marked && (await evaluate(`document.querySelector("#ddp .dropdown-panel").getAttribute("role")`)) === "menu",
    { records: touched, same: repaired === marked });
  check(`...and then nothing moves for 1.5s — ${calm} mutation records`, calm === 0, calm);
  await evaluate(`document.getElementById("patch-mount").innerHTML = ""; null`);
  await reset();
});

/* ── attachMenuKeys: a menu the page builds itself ───────────────────────── */
await section("attachMenuKeys: a menu the page builds itself", async () => {
  await reset();
  await evaluate(`(() => {
    const menu = document.getElementById("pm"); menu.hidden = false; window.closeCount = 0;
    window.detach = attachMenuKeys(menu, { onClose: () => { closeCount += 1; menu.hidden = true; },
                                           returnFocusTo: document.getElementById("pm-opener") });
    document.getElementById("pm1").focus();
  })()`);
  check("attachMenuKeys takes the items out of the tab order", (await attr("pm2", "tabindex")) === "-1");
  await evaluate(`(() => { const li = document.createElement("li"); li.setAttribute("role", "none");
    li.innerHTML = '<button type="button" role="menuitem" id="pm3">added later</button>'; document.getElementById("pm").append(li); })()`);
  await sleep(20);
  check("...and an item the page adds AFTER the call as well", (await attr("pm3", "tabindex")) === "-1", await attr("pm3", "tabindex"));
  await evaluate("document.getElementById('pm3').closest('li').remove(); null");
  await press("ArrowDown");
  check("...ArrowDown moves through the page's menu", (await focused()) === "pm2", await focused());
  await press("Escape");
  check("...Escape calls onClose and returns focus to the opener",
    (await evaluate("closeCount")) === 1 && (await focused()) === "pm-opener", { closed: await evaluate("closeCount"), focus: await focused() });
  await evaluate("document.getElementById('pm').hidden = false; document.getElementById('pm2').focus(); null");
  await press("Enter");
  check("...activating an item calls onClose and returns focus to the opener",
    (await evaluate("closeCount")) === 2 && (await focused()) === "pm-opener", { closed: await evaluate("closeCount"), focus: await focused() });
  await evaluate("document.getElementById('pm').hidden = false; detach(); document.getElementById('pm1').focus(); null");
  await press("ArrowDown");
  check("...and detach() removes the keys", (await focused()) === "pm1", await focused());
});

/* ── the theme items follow the theme, whoever changes it ────────────────── */
await section("the theme items follow the theme, whoever changes it", async () => {
  await reset(); await click("sth"); await click("t-green");
  check("picking a theme sets html[data-theme] and moves the ✓ (aria-checked) to it",
    (await evaluate("document.documentElement.dataset.theme")) === "green" &&
    (await attr("t-green", "aria-checked")) === "true" && (await attr("t-warm", "aria-checked")) === "false");
  check("...the label follows and the menu closes",
    (await evaluate("document.querySelector('[data-theme-label]').textContent")) === "green" && !(await isOpen("dth")));
  await evaluate("setTheme('warm'); null");
  await sleep(40);
  check("a theme set from PAGE CODE re-syncs the items too (the observer, not the click)",
    (await attr("t-warm", "aria-checked")) === "true" && (await attr("flat-green", "aria-pressed")) === "false");

  await reset(); await evaluate("document.getElementById('sth').focus(); null");
  await press("ArrowDown"); await press("ArrowDown"); await press("Enter");
  check("a keyboard pick (ArrowDown, ArrowDown, Enter) sets the theme, closes the menu and hands focus back to the summary",
    (await evaluate("document.documentElement.dataset.theme")) === "green" && !(await isOpen("dth")) && (await focused()) === "sth",
    { theme: await evaluate("document.documentElement.dataset.theme"), open: await isOpen("dth"), focus: await focused() });

  // Delegated: a switcher rendered after initThemeSwitcher() works without another call.
  await evaluate(`document.getElementById("late-theme-slot").innerHTML =
    '<details class="dropdown" id="dth2"><summary id="sth2">theme later</summary><ul class="dropdown-panel">' +
    '<li><button type="button" class="dropdown-item" data-theme-value="mono" id="t2-mono">mono</button></li>' +
    '<li><button type="button" class="dropdown-item" data-theme-value="paper" id="t2-paper">paper</button></li></ul></details>'; null`);
  await sleep(40);
  check("a theme menu rendered LATER is marked (menuitemradio, aria-checked) with no second call",
    (await attr("t2-mono", "role")) === "menuitemradio" && (await attr("t2-paper", "aria-checked")) === "false",
    { role: await attr("t2-mono", "role"), checked: await attr("t2-paper", "aria-checked") });
  await reset(); await click("sth2"); await click("t2-paper");
  check("...and picking from it sets the theme and moves the ✓ in EVERY switcher on the page",
    (await evaluate("document.documentElement.dataset.theme")) === "paper" && (await attr("t2-paper", "aria-checked")) === "true" &&
    (await attr("t-green", "aria-checked")) === "false" && !(await isOpen("dth2")));
  check("one theme order everywhere: THEMES is warm, green, mono, paper",
    (await evaluate("(window.THEMES || []).join()")) === "warm,green,mono,paper", await evaluate("window.THEMES"));
  await evaluate("setTheme('warm'); null");
});

console.log(failures ? `\ncheck-dropdown: ${failures} FAILED` : "\ncheck-dropdown: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
