/*
 * chromium.mjs — the headless browser the DOM checks drive, and the reporter they share.
 *
 * The same launcher every check-*.mjs in this directory carries inline — the Chromium Playwright
 * caches on these machines, or Chrome, over the DevTools protocol with Node's own fetch and
 * WebSocket; nothing installed, nothing imported from npm — written once for the data checks
 * (tabs, time, tickstrip, charts, data) instead of five more copies of the same ninety lines.
 *
 * Two things differ from the older inline copies, both on purpose:
 *   · the browser picks its own DevTools port (`--remote-debugging-port=0`, read back from
 *     DevToolsActivePort), so checks run side by side never collide on a fixed number;
 *   · `check()` takes a THUNK. An assertion that throws is a FAIL naming the error, not a stack that
 *     aborts the suite — and anything that still escapes is reported as a FAIL naming the last check
 *     that completed, so an aborted run can never read as a pass.
 *
 * With no browser on the machine a check SKIPS loudly; DD_REQUIRE_BROWSER=1 makes that a failure,
 * which is what CI and the release gate set.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const CHROME = process.env.DD_CHROME
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

/** Exit 0 with a loud SKIPPED when there is no browser — or 1 under DD_REQUIRE_BROWSER=1. */
export function requireBrowser(name, why) {
  if (CHROME) return;
  console.log(`${name}: SKIPPED — no headless chromium on this machine.`);
  console.log(`  ${why} Install one with \`npx playwright install chromium\`.`);
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

/**
 * Serve a directory over loopback HTTP (ES modules and localStorage need a real origin), plus any
 * in-memory `pages` — a check's own harness, at a path beside the shipped files it imports.
 */
export async function serve(root, pages = {}) {
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (Object.hasOwn(pages, url.pathname)) {
      // By extension, so a harness can serve its own stylesheet: under `style-src 'self'` it has no other.
      res.writeHead(200, { "content-type": `${types[extname(url.pathname)] || "text/html"}; charset=utf-8` });
      res.end(pages[url.pathname]);
      return;
    }
    const path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!(path + sep).startsWith(root + sep) && path !== root) { res.writeHead(403); res.end(); return; }
    if (!existsSync(path) || statSync(path).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": `${types[extname(path)] || "application/octet-stream"}; charset=utf-8` });
    res.end(readFileSync(path));
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/** Launch the browser and open one page target. Returns the protocol helpers for it. */
export async function launch(name) {
  const profile = mkdtempSync(join(tmpdir(), `dd-${name}-`));
  const chrome = spawn(CHROME, [
    "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let socket;
  // The profile goes with the browser: every run otherwise left a 2 MB directory in the temp dir.
  const close = () => {
    try { socket?.close(); } catch { /* already closed */ }
    chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };
  process.on("exit", close);

  let port = 0;
  for (let i = 0; ; i += 1) {
    try {
      port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      await fetch(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch { /* not up yet */ }
    if (i > 80) { close(); throw new Error("headless chromium did not come up"); }
    await sleep(250);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method) { for (const fn of listeners.get(message.method) || []) fn(message.params); return; }
    const slot = pending.get(message.id);
    if (!slot) return;
    pending.delete(message.id);
    message.error ? slot.reject(new Error(JSON.stringify(message.error))) : slot.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  // Wait until an expression is truthy in the page (a module has run, a frame has drawn).
  const until = async (expression, what = expression) => {
    for (let i = 0; i < 100; i += 1) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(50);
    }
    throw new Error(`timed out waiting for: ${what}`);
  };
  const navigate = async (url) => {
    await send("Page.navigate", { url });
    await until("document.readyState === 'complete'", `load of ${url}`);
  };
  // A REAL key through the browser's input pipeline, so the page's own keydown handling is what runs.
  const KEYS = {
    ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Enter: 13, Tab: 9, " ": 32,
  };
  const press = async (key, modifiers = 0) => {
    const code = KEYS[key];
    const base = { key, code: key === " " ? "Space" : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(20);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return { send, on, evaluate, until, navigate, press, close };
}

/** PASS/FAIL lines, a thunk per check, and a summary that exits non-zero on any failure. */
export function reporter(name) {
  let failures = 0;
  let lastPassed = "(before the first check)";
  process.on("uncaughtException", (error) => {
    console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
    console.log(`\n${name}: ABORTED`);
    process.exit(1);
  });
  process.on("unhandledRejection", (error) => {
    console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
    console.log(`\n${name}: ABORTED`);
    process.exit(1);
  });
  const check = async (label, thunk, detail) => {
    let ok = false;
    let why = detail;
    try {
      ok = await thunk();
    } catch (error) {
      why = `threw: ${String(error?.message || error).split("\n")[0]}`;
    }
    if (ok) {
      console.log(`PASS  ${label}`);
      lastPassed = label;
      return true;
    }
    failures += 1;
    let shown = why;
    if (typeof why === "function") {
      try { shown = await why(); } catch (error) { shown = `(detail threw: ${error.message})`; }
    }
    console.log(`FAIL  ${label}${shown === undefined ? "" : `\n        ${typeof shown === "string" ? shown : JSON.stringify(shown)}`}`);
    return false;
  };
  const done = () => {
    console.log(failures ? `\n${name}: ${failures} FAILED` : `\n${name}: all checks passed`);
    process.exit(failures ? 1 : 0);
  };
  return { check, done };
}
