#!/usr/bin/env node
/*
 * check-minimap.mjs — the current bar is drawn as current, and a page with a TOC gets no minimap.
 *
 * WHAT IS AT RISK. 0.60.0 moves the minimap's "you are here" from a class to the attribute a screen
 * reader already announced: runtime/minimap.js sets only `aria-current="true"`, and components.css
 * draws the current bar from that attribute. The two halves ship in different files, so each can
 * change without the other — a runtime that stops writing the class the CSS still reads (or the
 * reverse) leaves every bar grey, and nothing errors. So this loads the SHIPPED runtime AND the
 * shipped stylesheet and asserts the bar's computed colour, not the attribute alone.
 *
 * And a page shows a TOC or a minimap, never both: initMinimap() returns null on a page that has
 * any `[data-toc-link]`, and adds nothing to it.
 *
 * A real browser: the current bar follows an IntersectionObserver as the page scrolls. Served off
 * the working tree over loopback; port 0 read back from DevToolsActivePort. No browser: it SKIPS
 * loudly (fails under DD_REQUIRE_BROWSER=1).
 *
 *   node scripts/check-minimap.mjs
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
  console.log("check-minimap: SKIPPED — no headless chromium on this machine.");
  console.log("  The current bar follows an IntersectionObserver. `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = (extra) => `<!doctype html><html data-theme="warm"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/components.css">
<style>section { min-height: 1400px; margin-left: 4rem; }</style></head><body>
${extra}
<section id="one"><h2>one</h2></section>
<section id="two"><h3>two</h3></section>
<section id="three"><h2>three</h2></section>
<script type="module">
  import * as minimap from "/runtime/minimap.js";
  window.result = minimap.initMinimap({ sections: "section" });
  window.ready = true;
</script></body></html>`;
const ROUTES = {
  "/": ["text/html", () => page("")],
  "/toc": ["text/html", () => page('<nav class="toc"><a href="#one" data-toc-link="one">one</a></nav>')],
  "/runtime/minimap.js": ["text/javascript", () => readFileSync(join(root, "runtime/minimap.js"), "utf8")],
  "/src/tokens.css": ["text/css", () => readFileSync(join(root, "src/tokens.css"), "utf8")],
  "/src/components.css": ["text/css", () => readFileSync(join(root, "src/components.css"), "utf8")],
};
const server = createServer((req, res) => {
  const route = ROUTES[req.url];
  if (!route) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": `${route[0]}; charset=utf-8` });
  res.end(route[1]());
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));

const profile = mkdtempSync(join(tmpdir(), "dd-minimap-"));
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
const open = async (path) => {
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}${path}` });
  for (let i = 0; i < 50 && !(await evaluate("window.ready === true").catch(() => false)); i += 1) await sleep(100);
  await sleep(150);
};

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
};

// Every bar: its name, whether it is current, and whether it is DRAWN as current (--primary).
const BARS = `(() => {
  const probe = document.createElement("i"); probe.style.color = "var(--primary)"; document.body.append(probe);
  const primary = getComputedStyle(probe).color; probe.remove();
  return [...document.querySelectorAll(".minimap-bar")].map((b) => ({ name: b.getAttribute("aria-label"),
    current: b.getAttribute("aria-current"), drawn: getComputedStyle(b).backgroundColor === primary,
    cls: b.className, radius: getComputedStyle(b).borderTopLeftRadius }));
})()`;
const currentIs = (bars, name) => bars.filter((b) => b.current === "true").map((b) => b.name).join() === name;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await open("/");
let bars = await evaluate(BARS);
check("three sections, three bars, each a button named by its heading",
  bars.map((b) => b.name).join() === "one,two,three" && (await evaluate(`[...document.querySelectorAll(".minimap-bar")].every((b) => b.tagName === "BUTTON")`)), bars);
check("the first bar is current (aria-current) and the ONLY one drawn in --primary",
  currentIs(bars, "one") && bars.filter((b) => b.drawn).map((b) => b.name).join() === "one", bars);
check("no bar carries a class for its state, and no bar has a radius",
  bars.every((b) => b.cls === "minimap-bar" && b.radius === "0px"), bars);

await evaluate(`window.scrollTo({ top: document.getElementById("three").offsetTop, behavior: "instant" }); null`);
for (let i = 0; i < 20 && !currentIs(await evaluate(BARS), "three"); i += 1) await sleep(100);
await sleep(300); // the bar's .15s colour transition
bars = await evaluate(BARS);
check("scrolling to the last section makes ITS bar current, and only that bar is drawn as current",
  currentIs(bars, "three") && bars.filter((b) => b.drawn).map((b) => b.name).join() === "three", bars);

await open("/toc");
check("a page that has a TOC ([data-toc-link]) gets no minimap: initMinimap() returns null and adds nothing",
  (await evaluate("window.result === null")) && (await evaluate(`document.querySelectorAll(".minimap").length`)) === 0,
  { result: await evaluate("String(window.result)"), navs: await evaluate(`document.querySelectorAll(".minimap").length`) });

console.log(failures ? `\ncheck-minimap: ${failures} FAILED` : "\ncheck-minimap: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
