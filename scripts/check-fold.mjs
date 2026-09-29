#!/usr/bin/env node
/*
 * check-fold.mjs — a printout carries what the folds were holding, and the page gets its folds back.
 *
 * WHAT IS AT RISK. A closed <details> prints as its summary alone. runtime/fold.js (initFolds, 0.60.0)
 * opens every closed <details> on `beforeprint` and closes THOSE again on `afterprint`. Each half can
 * fail without anything on screen saying so:
 *   · the opener misses a fold (one nested in another, a plain <details>, one rendered after the
 *     call), and the paper silently loses its content;
 *   · the closer closes too much — the fold the reader had opened — or nothing at all, which is what
 *     cockpit's copy did: every fold on the page stayed open after the print dialog closed;
 *   · a `details.dropdown` is opened, and a menu prints over the content.
 *
 * REAL PRINT EVENTS. The browser prints to PDF through the DevTools protocol, which fires the real
 * `beforeprint` and `afterprint` — no synthetic event. The page records the open state of every
 * <details> from a listener registered AFTER initFolds(), so it reads exactly what was printed.
 *
 * No dependency: headless chromium from the Playwright cache, Node's own fetch and WebSocket, port 0
 * read back from DevToolsActivePort. No browser: it SKIPS loudly (fails under DD_REQUIRE_BROWSER=1).
 *
 *   node scripts/check-fold.mjs
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
  console.log("check-fold: SKIPPED — no headless chromium on this machine.");
  console.log("  The subject is the browser's own print events. `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<details class="fold" id="closed"><summary>closed fold</summary><div class="fold-body">A
  <details class="fold" id="nested"><summary>nested, closed</summary><div class="fold-body">B</div></details>
</div></details>
<details class="fold" id="reader" open><summary>the reader opened this one</summary><div class="fold-body">C</div></details>
<details id="plain"><summary>a plain details</summary>D</details>
<details class="dropdown" id="menu"><summary>a menu</summary><ul class="dropdown-panel"><li><button type="button">x</button></li></ul></details>
<div id="later"></div>
<script type="module">
  import * as fold from "/runtime/fold.js";
  fold.initFolds();
  const state = () => Object.fromEntries([...document.querySelectorAll("details")].map((d) => [d.id, d.open]));
  window.during = [];
  window.after = [];
  addEventListener("beforeprint", () => during.push(state()));
  addEventListener("afterprint", () => after.push(state()));
  window.initFolds = fold.initFolds;
  window.ready = true;
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  if (req.url !== "/runtime/fold.js") { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
  res.end(readFileSync(join(root, "runtime/fold.js"), "utf8"));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));

const profile = mkdtempSync(join(tmpdir(), "dd-fold-"));
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

await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
for (let i = 0; i < 50 && !(await evaluate("window.ready === true").catch(() => false)); i += 1) await sleep(100);

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
};
const print = async () => { await send("Page.printToPDF", {}); await sleep(100); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await print();
const [during1] = await evaluate("during");
const [after1] = await evaluate("after");
check("the print fired real beforeprint/afterprint events (the check can see a print at all)", !!during1 && !!after1, { during1, after1 });
check("while printing: the closed fold, the one nested in it and a plain <details> are open",
  during1?.closed && during1?.nested && during1?.plain, during1);
check("...and the menu (details.dropdown) is NOT opened for the print", during1?.menu === false, during1);
check("after the print: the folds the opener opened are closed again",
  after1?.closed === false && after1?.nested === false && after1?.plain === false, after1);
check("...and the fold the READER had opened stays open", after1?.reader === true, after1);

// A fold rendered after initFolds() is found at print time; a second call does not break it.
await evaluate(`document.getElementById("later").innerHTML = '<details class="fold" id="late"><summary>late</summary>E</details>';
  initFolds(); null`);
await print();
const [, during2] = await evaluate("during");
const [, after2] = await evaluate("after");
check("a fold rendered AFTER initFolds() is opened for the print too", during2?.late === true, during2);
check("a second print, after a second initFolds() call, opens and restores exactly as the first",
  same({ ...during2, late: undefined }, during1) && same({ ...after2, late: undefined }, after1) && after2?.late === false,
  { during2, after2 });

console.log(failures ? `\ncheck-fold: ${failures} FAILED` : "\ncheck-fold: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
