#!/usr/bin/env node
/*
 * check-copy.mjs — a copy button must say whether it worked, and must never change its name.
 *
 * WHAT IS AT RISK. runtime/copy.js is small, and every one of its promises fails silently:
 *   · a failure nobody is told about leaves the reader pasting whatever was on the clipboard before
 *     (seedr's own comment, and the reason the failed state exists);
 *   · a result shown only as a glyph is not heard — cockpit's ✓/✗ announced nothing;
 *   · a button whose NAME flips to "copied" is announced inconsistently while it has focus, which is
 *     why the name is pinned and a live region reports instead;
 *   · a second listener from a second init copies twice, and a reset timer that is not restarted
 *     cuts a second press's feedback short.
 * None of those shows up by looking at the page. Each is asserted here in a real browser: presses
 * are DISPATCHED mouse and key events (a user activation, which the clipboard requires), the
 * clipboard is the browser's own and is read back, and the accessible name is the one Chromium's
 * accessibility tree computes — not a guess from attributes.
 *
 * It drives examples/content.html, whose module calls initCopyButtons() once, served from this
 * checkout by a loopback server. With no browser it SKIPS loudly; DD_REQUIRE_BROWSER=1 makes that
 * skip a failure.
 *
 *   node scripts/check-copy.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, sep } from "node:path";
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
  console.log("check-copy: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts the real clipboard, dispatched presses and the accessibility tree, none of");
  console.log("  which a stub can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const STATE_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the worktree over loopback ─────────────────────────────────────────────────────────────── */

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
// A page under seedr's style policy, to prove the runtime does not need an inline style attribute:
// the only style it writes is through the CSSOM, which `style-src 'self'` allows.
const CSP = "default-src 'self'; style-src 'self'; script-src 'self'";
const CSP_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="cmd"><code class="cmd-text">npm run build</code><button type="button" data-copy aria-label="copy build command">copy</button></div>
<script type="module" src="/__csp/boot.js"></script></body></html>`;
const CSP_BOOT = `window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => __violations.push(e.violatedDirective));
import("/runtime/copy.js").then((m) => { m.initCopyButtons(); window.__ready = true; });`;
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/__csp/") { res.writeHead(200, { "content-type": TYPES[".html"], "content-security-policy": CSP }); res.end(CSP_PAGE); return; }
  if (path === "/__csp/boot.js") { res.writeHead(200, { "content-type": TYPES[".js"], "content-security-policy": CSP }); res.end(CSP_BOOT); return; }
  const file = join(root, decodeURIComponent(path));
  let body = null;
  if (file.startsWith(root + sep)) { try { body = readFileSync(file); } catch {} }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(body);
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/* ── the browser, on a port it picks itself so parallel suites cannot collide ─────────────────── */

const profile = mkdtempSync(join(tmpdir(), "dd-copy-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=1280,900", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); };
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
const pageErrors = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
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

/* ── reporting: a check takes a THUNK, so one throw is one FAIL and never ends the run ───────── */

let failures = 0;
let passes = 0;
let lastPassed = "(none)";
const check = async (label, thunk) => {
  let problems;
  try { problems = await thunk(); } catch (error) { problems = [`threw: ${String(error.message).split("\n")[0]}`]; }
  if (problems === true || (Array.isArray(problems) && problems.length === 0)) {
    console.log(`PASS  ${label}`);
    passes += 1;
    lastPassed = label;
    return;
  }
  failures += 1;
  const lines = Array.isArray(problems) ? problems : [String(problems)];
  console.log(`FAIL  ${label}${lines.map((line) => `\n        ${line}`).join("")}`);
};
process.on("uncaughtException", (error) => {
  console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
  console.log("\ncheck-copy: ABORTED");
  process.exit(1);
});

/* ── the page, the clipboard, and a recorder on it ──────────────────────────────────────────── */

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
// The clipboard is permission-gated and wants a focused document; a headless page has neither.
await send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: ORIGIN });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.navigate", { url: `${ORIGIN}/examples/content.html?theme=warm` });
for (let i = 0; i < 60; i += 1) {
  await sleep(100);
  try { if (await evaluate(`document.readyState === "complete" && document.getElementById("standins").textContent !== ""`)) break; } catch {}
}
console.log(`stand-ins in force: ${await evaluate("document.documentElement.dataset.standins")}`);

// Every write is recorded and then passed to the REAL clipboard. `mode` makes the next writes
// refuse (as an insecure origin or a denied permission does) or removes the API entirely.
await evaluate(`(() => {
  window.__copy = { writes: [], mode: "real", errors: [] };
  addEventListener("error", (e) => __copy.errors.push(String(e.message)));
  addEventListener("unhandledrejection", (e) => __copy.errors.push(String(e.reason)));
  const clipboard = navigator.clipboard;
  const real = clipboard.writeText.bind(clipboard);
  clipboard.writeText = (text) => {
    __copy.writes.push(text);
    return __copy.mode === "reject" ? Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")) : real(text);
  };
  __copy.absent = (on) => {
    if (on) Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    else delete navigator.clipboard;
  };
})(); null`);

const center = (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("no element ${sel}"); e.scrollIntoView({ block: "center", behavior: "instant" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const press = async (sel) => {
  const p = await center(sel);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
};
const KEYS = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
};
const key = async (sel, name) => {
  await evaluate(`document.querySelector(${JSON.stringify(sel)}).focus(); null`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...KEYS[name] });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...KEYS[name] });
};
const writes = () => evaluate("__copy.writes.slice()");
const mode = (m) => evaluate(`__copy.mode = ${JSON.stringify(m)}; null`);
const stateOf = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).getAttribute("data-state")`);
const regions = () => evaluate(`[...document.querySelectorAll("[data-copy-status]")].map((n) => ({ role: n.getAttribute("role"), text: n.textContent, parent: n.parentElement.tagName.toLowerCase() }))`);
const regionText = async () => (await regions())[0]?.text;
const glyph = (sel) => evaluate(`(() => {
  const own = getComputedStyle(document.querySelector(${JSON.stringify(sel)})).getPropertyValue("--ico").trim();
  const root = getComputedStyle(document.documentElement);
  return ["copy", "check", "x"].find((n) => root.getPropertyValue("--ico-" + n).trim() === own) || "(other)";
})()`);
const colourIs = (sel, token) => evaluate(`(() => {
  const p = document.createElement("span"); p.style.color = "var(${token})"; document.body.append(p);
  const want = getComputedStyle(p).color; p.remove();
  return getComputedStyle(document.querySelector(${JSON.stringify(sel)})).color === want;
})()`);
// The name Chromium's accessibility tree computes, which is what a screen reader is given.
const axName = async (sel) => {
  const { result } = await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(sel)})` });
  const { nodes } = await send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
  return nodes[0]?.name?.value;
};
// The pointer stays where it pressed, and a hovered bare button is --primary by design — so a
// colour assertion about the RESTING state moves the pointer off first.
// It waits out the button's .15s colour transition too: mid-fade, the computed colour is neither.
const away = async () => { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }); await sleep(300); };
const settle = () => sleep(250); // past the 100ms announcement delay
const waitReset = () => sleep(STATE_MS + 300);

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */

await check("init is idempotent: after initCopyButtons() ran three times, one press writes once", async () => {
  await evaluate(`import("/runtime/copy.js").then((m) => { m.initCopyButtons(); m.initCopyButtons(); }).then(() => null)`);
  const before = (await writes()).length;
  await press("#cmd-one > button");
  await settle();
  const after = (await writes()).length;
  return after - before === 1 ? [] : [`${after - before} writes for one press`];
});

await check("an icon button in a .cmd copies its .cmd-text, trimmed — into the real clipboard", async () => {
  const out = [];
  const w = await writes();
  if (w[w.length - 1] !== "npm install -g @danieldeusing/seedr") out.push(`wrote ${JSON.stringify(w[w.length - 1])}`);
  const clip = await evaluate("navigator.clipboard.readText()");
  if (clip !== "npm install -g @danieldeusing/seedr") out.push(`clipboard holds ${JSON.stringify(clip)}`);
  return out;
});
await check("copied: data-state, the check glyph, --success, and the live region says \"copied\"", async () => {
  const out = [];
  if ((await stateOf("#cmd-one > button")) !== "copied") out.push(`data-state is ${await stateOf("#cmd-one > button")}`);
  if ((await glyph("#cmd-one > button")) !== "check") out.push(`glyph is ${await glyph("#cmd-one > button")}`);
  if (!(await colourIs("#cmd-one > button", "--success"))) out.push("colour is not --success");
  const r = await regions();
  if (r.length !== 1) out.push(`${r.length} live regions`);
  else {
    if (r[0].role !== "status") out.push(`region role is ${r[0].role}`);
    if (r[0].text !== "copied") out.push(`region says ${JSON.stringify(r[0].text)}`);
  }
  return out;
});
await check("the region is visually hidden but in the accessibility tree", async () => {
  const s = await evaluate(`(() => { const n = document.querySelector("[data-copy-status]"); const r = n.getBoundingClientRect(); return { w: r.width, h: r.height, pos: getComputedStyle(n).position }; })()`);
  const { result } = await send("Runtime.evaluate", { expression: `document.querySelector("[data-copy-status]")` });
  const { nodes } = await send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
  const out = [];
  if (!(s.w <= 1 && s.h <= 1 && s.pos === "absolute")) out.push(`region box ${JSON.stringify(s)}`);
  if (nodes[0]?.ignored) out.push("the region is ignored by the accessibility tree");
  if (nodes[0]?.role?.value !== "status") out.push(`AX role ${nodes[0]?.role?.value}`);
  return out;
});
await check("the accessible name is the page's own before, during and after", async () => {
  const during = await axName("#cmd-one > button");
  await waitReset();
  const after = await axName("#cmd-one > button");
  const out = [];
  for (const [when, name] of [["during", during], ["after", after]]) {
    if (name !== "copy install command") out.push(`${when}: ${JSON.stringify(name)}`);
  }
  return out;
});
await check(`after ${STATE_MS}ms everything is back: no state, the copy glyph, the bare colour, a silent region`, async () => {
  const out = [];
  await away();
  if ((await stateOf("#cmd-one > button")) !== null) out.push(`data-state is ${await stateOf("#cmd-one > button")}`);
  if ((await glyph("#cmd-one > button")) !== "copy") out.push(`glyph is ${await glyph("#cmd-one > button")}`);
  if (!(await colourIs("#cmd-one > button", "--muted-foreground"))) out.push("colour is not the bare --muted-foreground");
  if ((await regionText()) !== "") out.push(`the region still says ${JSON.stringify(await regionText())}`);
  return out;
});

await check("a second press restarts the clock instead of being cut short by the first", async () => {
  await press("#copy-literal");
  await sleep(1200);
  await press("#copy-literal");
  await sleep(1300); // 2500ms after the first press: its timer would have reset by now
  const mid = await stateOf("#copy-literal");
  await sleep(1000); // 3500ms: past the second press's 2000ms
  const end = await stateOf("#copy-literal");
  const out = [];
  if (mid !== "copied") out.push(`2.5s after the first press (1.3s after the second) the state is ${mid}`);
  if (end !== null) out.push(`3.5s after the first press the state is still ${end}`);
  return out;
});

await check("a refused write: the x, --destructive, the command SELECTED, and it says so", async () => {
  await mode("reject");
  await evaluate("getSelection().removeAllRanges(); null");
  const name = await axName("#cmd-one > button");
  await press("#cmd-one > button");
  await settle();
  const out = [];
  if ((await stateOf("#cmd-one > button")) !== "failed") out.push(`data-state is ${await stateOf("#cmd-one > button")}`);
  if ((await glyph("#cmd-one > button")) !== "x") out.push(`glyph is ${await glyph("#cmd-one > button")}`);
  if (!(await colourIs("#cmd-one > button", "--destructive"))) out.push("colour is not --destructive");
  const sel = await evaluate("getSelection().toString()");
  if (sel !== "npm install -g @danieldeusing/seedr") out.push(`selection is ${JSON.stringify(sel)} — ⌘C would not work`);
  if ((await regionText()) !== "copy failed — text selected") out.push(`region says ${JSON.stringify(await regionText())}`);
  if ((await axName("#cmd-one > button")) !== name) out.push(`the name changed from ${JSON.stringify(name)}`);
  return out;
});
await check("a refused literal has nothing to select, and says only \"copy failed\"", async () => {
  await waitReset();
  await evaluate("getSelection().removeAllRanges(); null");
  await press("#copy-literal");
  await settle();
  const out = [];
  if ((await stateOf("#copy-literal")) !== "failed") out.push(`data-state is ${await stateOf("#copy-literal")}`);
  if ((await regionText()) !== "copy failed") out.push(`region says ${JSON.stringify(await regionText())}`);
  if ((await evaluate("getSelection().toString()")) !== "") out.push("something was selected");
  return out;
});
await check("no clipboard API at all (an insecure origin) is a failure, not an exception", async () => {
  await mode("real");
  await evaluate("__copy.absent(true); getSelection().removeAllRanges(); null");
  await press("#cmd-long > button");
  await settle();
  await evaluate("__copy.absent(false); null");
  const out = [];
  if ((await stateOf("#cmd-long > button")) !== "failed") out.push(`data-state is ${await stateOf("#cmd-long > button")}`);
  if ((await regionText()) !== "copy failed — text selected") out.push(`region says ${JSON.stringify(await regionText())}`);
  const errors = await evaluate("__copy.errors.slice()");
  if (errors.length) out.push(`page errors: ${errors.join("; ")}`);
  return out;
});

await check("the text form: the label reads \"copied\", the name stays \"copy\", and both come back", async () => {
  await waitReset();
  const out = [];
  const before = await axName("#copy-text");
  await press("#copy-text");
  await settle();
  const during = { text: await evaluate(`document.querySelector("#copy-text").textContent`), name: await axName("#copy-text"),
    attr: await evaluate(`document.querySelector("#copy-text").getAttribute("aria-label")`) };
  const w = await writes();
  await waitReset();
  const after = { text: await evaluate(`document.querySelector("#copy-text").textContent`), name: await axName("#copy-text"),
    attr: await evaluate(`document.querySelector("#copy-text").getAttribute("aria-label")`) };
  if (before !== "copy") out.push(`name before is ${JSON.stringify(before)}`);
  if (during.text !== "copied") out.push(`label during is ${JSON.stringify(during.text)}`);
  if (during.name !== "copy") out.push(`name during is ${JSON.stringify(during.name)}`);
  if (w[w.length - 1] !== "npm run build") out.push(`wrote ${JSON.stringify(w[w.length - 1])}`);
  if (after.text !== "copy") out.push(`label after is ${JSON.stringify(after.text)}`);
  if (after.name !== "copy") out.push(`name after is ${JSON.stringify(after.name)}`);
  if (after.attr !== null) out.push(`the pinned aria-label was left behind: ${JSON.stringify(after.attr)}`);
  return out;
});
await check("the text form, refused: \"copy failed\", and the name still \"copy\"", async () => {
  await mode("reject");
  await press("#copy-text");
  await settle();
  const out = [];
  const text = await evaluate(`document.querySelector("#copy-text").textContent`);
  if (text !== "copy failed") out.push(`label is ${JSON.stringify(text)}`);
  if ((await axName("#copy-text")) !== "copy") out.push(`name is ${JSON.stringify(await axName("#copy-text"))}`);
  if (!(await colourIs("#copy-text", "--destructive"))) out.push("colour is not --destructive");
  await mode("real");
  return out;
});

await check("data-copy-from copies that element's text exactly", async () => {
  await press("#copy-from");
  await settle();
  const [w, want] = [await writes(), await evaluate(`document.querySelector("#file-body").textContent`)];
  return w[w.length - 1] === want && want === "name: poi\ncontext: vu3\n" ? [] : [`wrote ${JSON.stringify(w[w.length - 1])}, the element holds ${JSON.stringify(want)}`];
});
await check("a button rendered after load is wired too, and a .code-view copies without its numbers", async () => {
  await evaluate(`document.querySelector("#p7 .demo-grid").insertAdjacentHTML("beforeend",
    '<div class="demo-cell" id="late"><button type="button" class="btn-icon" data-icon="copy" data-copy data-copy-from="#code-view" aria-label="copy package.json"></button></div>'); null`);
  await press("#late > button");
  await settle();
  const w = (await writes()).at(-1) || "";
  const out = [];
  if ((await stateOf("#late > button")) !== "copied") out.push(`data-state is ${await stateOf("#late > button")}`);
  if (!w.startsWith("{\n  \"name\"")) out.push(`wrote ${JSON.stringify(w.slice(0, 30))}… — the file should start with "{"`);
  if (/^\d/m.test(w)) out.push("a copied line starts with a digit — a line number was copied");
  return out;
});

await check("the keyboard: Enter and Space press it (a native button)", async () => {
  await waitReset();
  const out = [];
  let n = (await writes()).length;
  await key("#copy-literal", "Enter");
  await settle();
  if ((await writes()).length !== n + 1) out.push("Enter did not copy");
  if ((await stateOf("#copy-literal")) !== "copied") out.push(`after Enter the state is ${await stateOf("#copy-literal")}`);
  await waitReset();
  n = (await writes()).length;
  await key("#copy-literal", "Space");
  await settle();
  if ((await writes()).length !== n + 1) out.push("Space did not copy");
  return out;
});

await check("aria-disabled: the press does nothing at all", async () => {
  await evaluate(`document.querySelector("#late").insertAdjacentHTML("beforeend",
    '<button type="button" class="btn-icon" id="off" data-icon="copy" data-copy="never" aria-disabled="true" aria-label="copy (off)"></button>'); null`);
  const n = (await writes()).length;
  await press("#off");
  await settle();
  const out = [];
  if ((await writes()).length !== n) out.push("it wrote to the clipboard");
  if ((await stateOf("#off")) !== null) out.push(`it took data-state=${await stateOf("#off")}`);
  return out;
});

await check("nothing to copy fails instead of writing an empty string over the clipboard", async () => {
  await evaluate(`document.querySelector("#late").insertAdjacentHTML("beforeend",
    '<button type="button" class="btn-icon" id="empty" data-icon="copy" data-copy data-copy-from="#does-not-exist" aria-label="copy nothing"></button>'); null`);
  const n = (await writes()).length;
  await press("#empty");
  await settle();
  const out = [];
  if ((await writes()).length !== n) out.push("writeText was called");
  if ((await stateOf("#empty")) !== "failed") out.push(`data-state is ${await stateOf("#empty")}`);
  if ((await regionText()) !== "copy failed") out.push(`region says ${JSON.stringify(await regionText())}`);
  return out;
});

await check("one region, and it follows the button into a modal <dialog> (outside is inert there)", async () => {
  await evaluate(`document.body.insertAdjacentHTML("beforeend",
    '<dialog id="dlg"><div class="cmd"><code class="cmd-text">in a dialog</code><button type="button" class="btn-icon btn-icon--bare" data-icon="copy" data-copy aria-label="copy dialog command"></button></div></dialog>');
    document.getElementById("dlg").showModal(); null`);
  await press("#dlg button");
  await settle();
  const inDialog = await regions();
  const w = (await writes()).at(-1);
  await evaluate(`document.getElementById("dlg").close(); null`);
  await waitReset();
  await press("#copy-literal");
  await settle();
  const back = await regions();
  const out = [];
  if (w !== "in a dialog") out.push(`wrote ${JSON.stringify(w)}`);
  if (inDialog.length !== 1 || inDialog[0].parent !== "dialog" || inDialog[0].text !== "copied") out.push(`while the dialog was open: ${JSON.stringify(inDialog)}`);
  if (back.length !== 1 || back[0].parent !== "body") out.push(`after it closed: ${JSON.stringify(back)}`);
  return out;
});

await check("no page error during the whole run", async () => {
  const errors = [...(await evaluate("__copy.errors.slice()")), ...pageErrors];
  return errors.length ? errors : [];
});

await check("under style-src 'self' the region still hides itself and nothing is refused", async () => {
  await send("Page.navigate", { url: `${ORIGIN}/__csp/` });
  for (let i = 0; i < 40 && !(await evaluate("window.__ready === true")); i += 1) await sleep(100);
  await press("button[data-copy]");
  await settle();
  const r = await evaluate(`(() => { const n = document.querySelector("[data-copy-status]"); const b = n && n.getBoundingClientRect();
    return { region: !!n, text: n?.textContent, pos: n && getComputedStyle(n).position, w: b?.width, h: b?.height,
             state: document.querySelector("button[data-copy]").getAttribute("data-state"), violations: window.__violations }; })()`);
  const out = [];
  if (r.state !== "copied") out.push(`data-state is ${r.state}`);
  if (!r.region || r.text !== "copied") out.push(`region ${JSON.stringify(r.text)}`);
  if (!(r.pos === "absolute" && r.w <= 1 && r.h <= 1)) out.push(`the region is not visually hidden: ${JSON.stringify(r)}`);
  if (r.violations.length) out.push(`CSP refused: ${r.violations.join(", ")}`);
  return out;
});

console.log(failures
  ? `\ncheck-copy: ${failures} FAILED, ${passes} passed`
  : `\ncheck-copy: all ${passes} checks passed`);
process.exit(failures ? 1 : 0);
