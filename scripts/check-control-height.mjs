#!/usr/bin/env node
/*
 * check-control-height.mjs — every single-line control is --control-h, and it gets there on its own.
 *
 * WHAT IS AT RISK. 0.60.0 gives every single-line control one height, --control-h (28px): text
 * fields, the select trigger, the compact button, the bin and the pencil. A `min-block-size` floor
 * makes the RENDERED height look right while the control's own padding and line height say
 * something else — and a floor can only lift, never pull down. The failure this was written for
 * was measured on the foundations branch: a field with `.3rem` of padding under the line height it
 * INHERITS (1.5) is 29.6px, above the token, and the floor cannot fix that. Chrome's date field
 * then did it for real: 1px inside its own editor and 2px around its calendar button, 29.97px.
 *
 * So this asserts two heights per control, in all four themes and at a 20px root: the rendered one,
 * and the NATURAL one with the floor removed. Both must equal the token. It reads the verdict the
 * demo page computes over its own controls (examples/components.html, #height-check), and measures
 * a named set of controls itself too, so a page that stopped computing cannot report green.
 *
 * A real browser (layout is the subject), served off the working tree over loopback. No browser:
 * it SKIPS loudly, and fails under DD_REQUIRE_BROWSER=1.
 *
 *   node scripts/check-control-height.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, normalize, extname } from "node:path";
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
  console.log("check-control-height: SKIPPED — no headless chromium on this machine.");
  console.log("  Heights are layout, and layout needs a browser. `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || !TYPES[extname(file)]) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": `${TYPES[extname(file)]}; charset=utf-8` });
  res.end(readFileSync(file));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));

const profile = mkdtempSync(join(tmpdir(), "dd-height-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); };
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/examples/components.html` });
for (let i = 0; i < 50; i += 1) {
  const ran = await evaluate(`document.getElementById("height-check")?.dataset.result || ""`).catch(() => "");
  if (ran) break;
  await sleep(100);
}

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
};

// Measured here, not trusted from the page: rendered and natural (floor removed) height.
const MEASURE = `(() => {
  const probe = document.createElement("div"); probe.style.blockSize = "var(--control-h)"; document.body.appendChild(probe);
  const want = probe.getBoundingClientRect().height; probe.remove();
  const trigger = document.querySelector("#sel-model").closest(".select-field").querySelector(".select-trigger");
  const named = { "text field": "#in-text", "search field": "#in-search", "number field": "#in-number",
    "date field": 'input[type="date"]', "field with no type": "#in-notype", "compact ghost": "#btn-ghost",
    "compact primary": "#btn-primary-compact", "bin": "#btn-bin", "pencil": "#btn-edit" };
  const out = {};
  const measure = (el) => { const r = el.getBoundingClientRect().height; const keep = el.style.minBlockSize;
    el.style.minBlockSize = "0px"; const n = el.getBoundingClientRect().height; el.style.minBlockSize = keep; return [r, n]; };
  for (const [name, sel] of Object.entries(named)) out[name] = measure(document.querySelector(sel));
  out["select trigger"] = measure(trigger);
  return { want, out };
})()`;
const exact = (v, want) => Math.abs(v - want) <= 1 / 32; // Chrome lays out in 1/64px units

for (const theme of ["warm", "green", "mono", "paper"]) {
  await evaluate(`document.documentElement.dataset.theme = "${theme}"; null`);
  await sleep(80);
  const page = await evaluate(`({ ...document.getElementById("height-check").dataset })`);
  check(`${theme}: the page's own check passes over all ${page.count} single-line controls`,
    page.result === "pass" && Number(page.count) > 20, page);
  const { want, out } = await evaluate(MEASURE);
  const off = Object.entries(out).filter(([, [r, n]]) => !exact(r, want) || !exact(n, want));
  check(`${theme}: fields, trigger, compact buttons, bin and pencil are ${want}px rendered AND natural`, off.length === 0, off);
}

await evaluate(`document.documentElement.style.fontSize = "20px"; document.documentElement.dataset.theme = "warm"; null`);
await sleep(80);
const big = await evaluate(MEASURE);
const offBig = Object.entries(big.out).filter(([, [r, n]]) => !exact(r, big.want) || !exact(n, big.want));
check(`at a 20px root the box is still the token (${big.want}px), not a number that sat under it at 16px`,
  big.want === 35 && offBig.length === 0, offBig);

console.log(failures ? `\ncheck-control-height: ${failures} FAILED` : "\ncheck-control-height: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
