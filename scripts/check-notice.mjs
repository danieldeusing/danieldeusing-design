#!/usr/bin/env node
/*
 * check-notice.mjs — the dismiss on a `.notice` (runtime/notice.js), in a real browser.
 *
 * WHAT IS AT RISK, and none of it is visible when it breaks:
 *   · FOCUS. The × is removed with its notice, so a keyboard user's focus goes with it — to <body>,
 *     which throws them back to the top of the page for having closed a message. The runtime moves
 *     focus to the next thing after the notice (or the one before it). A regression there looks fine
 *     with a mouse and is only found by someone who cannot use one.
 *   · NOTICES RENDERED LATER. A form's result and a poll's warning are inserted after load; a
 *     listener bound per notice at init would work in the demo and never in a real page.
 *   · THE PAGE'S VETO. `notice:dismiss` is cancelable so a page can remember or hide instead; if the
 *     runtime removed first and asked afterwards, the veto would be decoration.
 *   · WHERE FOCUS CANNOT GO. The next element after a notice is often one a keyboard user never lands
 *     on: the hidden <select> behind select.js's trigger, an inactive tab of a roving tablist, a
 *     button under `visibility: hidden`, `inert` or `aria-hidden`. Each is measured here with the
 *     real thing — the enhanced select is the SHIPPED select.js, served beside the harness.
 *
 * The keys are REAL key events through the DevTools input pipeline (Enter and Space on a native
 * button), not `.click()` — the claim is that the keyboard needs nothing extra, and only the browser's
 * own activation behaviour can prove that.
 *
 * The SHIPPED modules are read off the filesystem (notice.js inlined, runtime/*.js served), so the
 * fixture cannot drift from the thing asserted. Headless chromium as in check-tabletools.mjs; it
 * SKIPS loudly without one (DD_REQUIRE_BROWSER=1 makes that a failure), and lets the browser pick
 * its DevTools port.
 *
 *   node scripts/check-notice.mjs
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
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((path) => existsSync(path));

if (!CHROME) {
  console.log("check-notice: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts focus movement and real key activation, which only a browser has.");
  console.log("  Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUNTIME = readFileSync(join(root, "runtime/notice.js"), "utf8").replace(/^export /gm, "");
// components.css's two rules for an enhanced select: the native one stays in the box, transparent and
// unclickable, under the trigger the reader sees — so it HAS client rects, exactly as on a real page.
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><style>
.select-field { position: relative; display: inline-block; }
.select-field > select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; }
</style></head><body>
<input id="elsewhere" aria-label="elsewhere">
<div id="mount"></div>
<script type="module">
import { initSelects } from "/select.js";
${RUNTIME}
window.initNotices = initNotices;
window.initSelects = initSelects;
window.events = [];
// Every element that receives focus, in order — "never focused" is a claim about the whole path.
// \`focus\` in the capture phase, not \`focusin\`: select.js moves focus on to its trigger from
// inside the select's own focus event, and Chromium then never sends the select a focusin at all.
window.focusLog = [];
document.addEventListener("focus", (event) => window.focusLog.push(event.target.id || event.target.tagName), true);
document.addEventListener("notice:dismiss", (event) => window.events.push({
  target: event.target.id, bubbles: event.bubbles, cancelable: event.cancelable }));
// A notice between two focusable buttons, rebuilt per case.
window.build = (html) => { document.getElementById("mount").innerHTML = html; window.events = []; window.focusLog = []; };
window.NOTICE = (id) => '<div class="notice" id="' + id + '" role="alert"><span class="notice-label" id="' + id +
  '-label">warning:</span><p>two sources publish this skill.</p><button type="button" class="notice-dismiss" id="' + id +
  '-x" aria-label="dismiss">×</button></div>';
window.gone = (id) => !document.getElementById(id);
window.focused = () => document.activeElement && (document.activeElement.id || document.activeElement.tagName);
<\/script></body></html>`;

// Every runtime module, not just select.js: a module imports its siblings ("./popup.js"), and one
// the harness cannot serve kills the page before a single check runs.
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  let body = null;
  if (/^\/[\w.-]+\.js$/.test(req.url)) { try { body = readFileSync(join(root, "runtime", req.url.slice(1))); } catch {} }
  res.writeHead(body ? 200 : 404, { "content-type": "text/javascript; charset=utf-8" });
  res.end(body || "");
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));

const profile = mkdtempSync(join(tmpdir(), "dd-notice-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: true });
let socket;
// The browser leads its own process group, so the whole group goes before its profile does: no
// renderer is still writing into what is removed, and no run leaves a profile in $TMPDIR.
const shutdown = () => { try { socket?.close(); } catch {} try { process.kill(-chrome.pid, "SIGKILL"); } catch { chrome.kill("SIGKILL"); } try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} server.close(); };
process.on("exit", shutdown);

let port = 0;
for (let i = 0; ; i += 1) {
  try {
    port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
    await fetch(`http://127.0.0.1:${port}/json/version`);
    break;
  } catch {}
  if (i > 80) { shutdown(); throw new Error("headless chromium did not come up"); }
  await sleep(250);
}
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
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
for (let i = 0; !(await evaluate("typeof window.build === 'function'").catch(() => false)); i += 1) {
  if (i > 50) throw new Error("the harness never loaded");
  await sleep(100);
}

let failures = 0;
let lastPassed = "(none)";
const check = async (label, thunk, detail) => {
  let ok = false;
  let why = detail;
  try { ok = await thunk(); } catch (error) { why = `threw: ${error.message}`; }
  if (ok) { console.log(`PASS  ${label}`); lastPassed = label; return; }
  failures += 1;
  console.log(`FAIL  ${label}${why === undefined ? "" : `\n        ${typeof why === "function" ? await why() : why}`}`);
};
const press = async (key) => {
  const keys = { Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, " ": { code: "Space", windowsVirtualKeyCode: 32, text: " " } };
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, ...keys[key] });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: keys[key].code, windowsVirtualKeyCode: keys[key].windowsVirtualKeyCode });
  await sleep(30);
};
const state = () => evaluate("JSON.stringify({ focused: window.focused(), focusLog: window.focusLog, events: window.events, mount: document.getElementById('mount').innerHTML.length })");

await evaluate("window.initNotices(); null");

/* ── the click ────────────────────────────────────────────────────────────────────────────────── */
await evaluate(`window.build('<button id="before">before</button>' + window.NOTICE("n1") + '<button id="after">after</button>');
  document.getElementById("n1-x").click(); null`);
await check("a click on the × removes its notice", () => evaluate("window.gone('n1')"));
await check("...and fires notice:dismiss ONCE on the notice, bubbling and cancelable",
  () => evaluate(`window.events.length === 1 && window.events[0].target === "n1" && window.events[0].bubbles && window.events[0].cancelable`),
  () => state());

await evaluate(`window.build(window.NOTICE("n2"));
  const veto = (event) => event.preventDefault();
  document.addEventListener("notice:dismiss", veto);
  document.getElementById("n2-x").click();
  document.removeEventListener("notice:dismiss", veto); null`);
await check("a page that calls preventDefault() keeps the notice — the veto is asked BEFORE anything is removed",
  () => evaluate("!window.gone('n2')"));

await evaluate(`window.build(""); document.getElementById("mount").insertAdjacentHTML("beforeend", window.NOTICE("n3"));
  document.getElementById("n3-x").click(); null`);
await check("a notice rendered AFTER initNotices() is dismissible too (one listener on the document)",
  () => evaluate("window.gone('n3')"));

await evaluate(`window.build(window.NOTICE("n4")); document.getElementById("n4-label").click(); null`);
await check("a click anywhere else in the notice does nothing",
  () => evaluate("!window.gone('n4') && window.events.length === 0"), () => state());

await evaluate(`window.build('<button type="button" class="notice-dismiss" id="stray">×</button>');
  document.getElementById("stray").click(); null`);
await check("a .notice-dismiss outside any .notice is ignored, not an error",
  () => evaluate("!!document.getElementById('stray') && window.events.length === 0"));

// Asked through the veto, because that is the only way a second listener shows: without it the
// first listener removes the notice, and the second one's event fires on a detached node that
// nothing hears. Vetoed, the notice stays in the page and a second listener asks a second time.
await evaluate(`window.initNotices(); window.build(window.NOTICE("n5")); (() => {
  const veto = (event) => event.preventDefault();
  document.addEventListener("notice:dismiss", veto);
  document.getElementById("n5-x").click();
  document.removeEventListener("notice:dismiss", veto); })(); null`);
await check("calling initNotices() twice installs ONE listener — a vetoed dismiss is asked once, not twice",
  () => evaluate("!window.gone('n5') && window.events.length === 1"), () => state());

/* ── the keyboard, and where focus goes ───────────────────────────────────────────────────────── */
await evaluate(`window.build('<button id="before">before</button>' + window.NOTICE("k1") + '<button id="after">after</button>');
  document.getElementById("k1-x").focus(); null`);
await press("Enter");
await check("Enter on the focused × dismisses — a native button needs nothing extra",
  () => evaluate("window.gone('k1')"), () => state());
await check("...and focus moves to the next focusable AFTER the notice, not to <body>",
  () => evaluate("window.focused() === 'after'"), () => state());

await evaluate(`window.build('<button id="before">before</button>' + window.NOTICE("k2") +
  '<button id="hidden" hidden>hidden</button><a id="link" href="#x">link</a>');
  document.getElementById("k2-x").focus(); null`);
await press(" ");
await check("Space does the same, and focus skips what is not rendered (a hidden button) for the link after it",
  () => evaluate("window.gone('k2') && window.focused() === 'link'"), () => state());

await evaluate(`window.build('<button id="before">before</button>' + window.NOTICE("k3"));
  document.getElementById("elsewhere").remove(); document.getElementById("k3-x").focus(); null`);
await press("Enter");
await check("with nothing focusable after the notice, focus moves back to the one BEFORE it",
  () => evaluate("window.gone('k3') && window.focused() === 'before'"), () => state());

await evaluate(`document.body.insertAdjacentHTML("afterbegin", '<input id="elsewhere" aria-label="elsewhere">');
  window.build(window.NOTICE("k4") + '<button id="after">after</button>');
  document.getElementById("elsewhere").focus();
  document.getElementById("k4-x").click(); null`);
await check("a dismiss that did not hold focus leaves focus where it was — nothing is stolen",
  () => evaluate("window.gone('k4') && window.focused() === 'elsewhere'"), () => state());

/* ── where focus cannot go: each case puts the trap first and a real target after it ────────────── */
const dismissByKey = async (id, html) => {
  await evaluate(`window.build(window.NOTICE(${JSON.stringify(id)}) + ${JSON.stringify(html)}); window.initSelects(document.getElementById("mount"));
    document.getElementById(${JSON.stringify(`${id}-x`)}).focus(); window.focusLog = []; null`);
  await press("Enter");
};
await dismissByKey("f1", '<label>model <select id="model"><option>opus</option><option>sonnet</option></select></label>');
await check("an enhanced select after the notice: focus lands on its trigger, and the hidden <select> never receives it",
  () => evaluate(`window.gone('f1') && document.activeElement.classList.contains("select-trigger") && !window.focusLog.includes("model")`),
  () => state());

await dismissByKey("f2", '<div role="tablist"><button role="tab" id="tab-b" tabindex="-1" aria-selected="false">b</button>' +
  '<button role="tab" id="tab-a" tabindex="0" aria-selected="true">a</button></div>');
await check("a roving tablist after the notice: focus goes to the ACTIVE tab, never to a tabindex=-1 one",
  () => evaluate(`window.gone('f2') && window.focused() === "tab-a" && !window.focusLog.includes("tab-b")`), () => state());

await dismissByKey("f3", '<button id="invisible" style="visibility: hidden">invisible</button><button id="after">after</button>');
await check("a visibility:hidden button after the notice cannot take focus: the next one does, not <body>",
  () => evaluate(`window.gone('f3') && window.focused() === "after"`), () => state());

await dismissByKey("f4", '<div inert><button id="inert-btn">inert</button></div><button id="after">after</button>');
await check("an inert subtree after the notice is skipped",
  () => evaluate(`window.gone('f4') && window.focused() === "after"`), () => state());

await dismissByKey("f5", '<div aria-hidden="true"><button id="aria-hidden-btn">hidden from AT</button></div><button id="after">after</button>');
await check("an aria-hidden subtree after the notice is skipped — focus inside it would be a place nobody can hear",
  () => evaluate(`window.gone('f5') && window.focused() === "after" && !window.focusLog.includes("aria-hidden-btn")`), () => state());

console.log(failures
  ? `\ncheck-notice: ${failures} FAILED (last check to pass: ${lastPassed})`
  : "\ncheck-notice: all checks passed");
process.exit(failures ? 1 : 0);
