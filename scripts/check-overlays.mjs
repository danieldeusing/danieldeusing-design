#!/usr/bin/env node
/*
 * check-overlays.mjs — the overlays package in a real browser, driven through examples/overlays.html:
 * src/overlays.css, src/tooltip.css, runtime/dialog.js, runtime/tooltip.js, runtime/diagramzoom.js
 * and the context-menu recipe.
 *
 * WHY A BROWSER. Every claim here is about what the platform DOES with the markup: that a modal
 * dialog makes the page inert and keeps Tab inside, that Escape closes the topmost of a stack and not
 * the one under it, that a prevented `cancel` does or does not survive a second Escape, that a panel
 * on <body> is hidden behind the top layer. None of that exists in a stub. Input is DISPATCHED
 * through the DevTools protocol — real key and mouse events, not element.click() — because the
 * behaviours under test (a click that ends a drag, a press that starts inside and ends on the
 * backdrop, Shift+F10) are exactly what a synthetic call skips.
 *
 * WHAT IT COVERS, in order:
 *   · the dialog's box, parts, sizes, phone rule, drawer, print and `hidden`;
 *   · forced colours on BOTH palettes and all four themes: every glyph the overlays show stands 3:1
 *     and every text 4.5:1 off what it is painted on — contrast, never "not the Canvas colour";
 *   · dialog.js: focus in and back, Tab stays inside, Escape, the backdrop, the answer
 *     (`returnValue`, reset on every open), a stack of two, [autofocus], naming, the alert, and a
 *     committing footer that nothing may dismiss;
 *   · the tooltip: the panel, the top layer, Escape, suppression, and a tip that repeats the name;
 *   · the context menu's keyboard, placement, width and outside press;
 *   · the zoom view: a named opener, a modal view, keys, a pan that does not close it, a canvas;
 *   · the files on a TOKENS-ONLY page (`?bare`): the same box and the same face as with every
 *     stylesheet loaded, and their own face on a host page whose body says otherwise;
 *   · the dialog footer against controls.css loaded AFTER overlays.css;
 *   · contrast for every new pairing, four themes x three surfaces.
 *
 * The demo loads the real files and imports the sibling runtimes it borrows (attachMenuKeys,
 * positionPopup); nothing stands in for them (check-integration.mjs fails a demo that carries a
 * stand-in).
 *
 * If no browser is on the machine it SKIPS loudly (DD_REQUIRE_BROWSER=1 makes that a failure). Both
 * ports are chosen by the OS and read back, so it runs beside the other suites without colliding.
 *
 *   node scripts/check-overlays.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
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
  console.log("check-overlays: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts the top layer, inert content, dispatched keys and pointer gestures, none of");
  console.log("  which a stub can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the worktree, served read-only, plus one harness page ─────────────────────────────────────────
   The harness is the dialog footer with controls.css loaded AFTER overlays.css, the order in which a
   tie on specificity would hand the footer controls.css's `margin-top: 1rem`. It uses the real
   src/controls.css when the tree has one, and otherwise the rules WP5 ships (wp5-controls 7720f24),
   copied here so the order can be tested before the two packages meet. */
const WP5_FORM_ACTIONS = `.form-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 0.5rem; margin-top: 1rem; }
.form-actions--ruled { padding-top: 0.75rem; border-top: 1px solid var(--border); }`;
const realControls = existsSync(join(root, "src/controls.css"));
const HARNESS_FOOT = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/overlays.css">
${realControls ? '<link rel="stylesheet" href="/src/controls.css">' : `<style>${WP5_FORM_ACTIONS}</style>`}
</head><body>
<dialog class="dialog" open><footer class="dialog-foot form-actions form-actions--ruled" id="foot"><button type="button">ok</button></footer></dialog>
</body></html>`;

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x").pathname;
  if (url === "/harness/foot-order") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS_FOOT);
    return;
  }
  const path = normalize(join(root, decodeURIComponent(url)));
  if (!path.startsWith(root + sep) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": (TYPES[extname(path)] || "application/octet-stream") + "; charset=utf-8" });
  res.end(readFileSync(path));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const BASE = `http://127.0.0.1:${server.address().port}`;
const PAGE = `${BASE}/examples/overlays.html`;

/* ── the browser ── */
const profile = mkdtempSync(join(tmpdir(), "dd-overlays-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new", "--no-first-run",
  "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); };
process.on("exit", shutdown);

let port;
for (let i = 0; !port; i += 1) {
  try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {}
  if (i > 100) { shutdown(); throw new Error("headless chromium did not come up"); }
  if (!port) await sleep(100);
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

/*
 * A check takes a VALUE or a THUNK. A thunk that throws is a FAIL naming the error, and the suite
 * goes on: one missing element must not abort everything after it and leave no FAIL line at all.
 * Whatever still escapes is caught at the bottom and reported against the last check that finished.
 */
let failures = 0;
let lastLabel = "(none yet)";
const check = async (label, test, detail) => {
  let ok;
  let info = detail;
  try {
    ok = typeof test === "function" ? await test() : test;
  } catch (error) {
    ok = false;
    info = `threw: ${error.message.split("\n")[0]}`;
  }
  lastLabel = label;
  if (ok) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  const text = typeof info === "function" ? await Promise.resolve().then(info).catch((e) => `(detail threw: ${e.message})`) : info;
  console.log(`FAIL  ${label}${text === undefined ? "" : `\n        ${typeof text === "string" ? text : JSON.stringify(text)}`}`);
};
const section = (title) => console.log(`\n── ${title} ──`);

/* ── input, dispatched ── */
const KEYS = {
  Escape: { code: "Escape", vk: 27 }, Tab: { code: "Tab", vk: 9 }, Enter: { code: "Enter", vk: 13, text: "\r" },
  ArrowDown: { code: "ArrowDown", vk: 40 }, ArrowUp: { code: "ArrowUp", vk: 38 }, Home: { code: "Home", vk: 36 },
  End: { code: "End", vk: 35 }, F10: { code: "F10", vk: 121 }, ContextMenu: { code: "ContextMenu", vk: 93 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 }, ArrowRight: { code: "ArrowRight", vk: 39 },
  "+": { code: "Equal", vk: 187, text: "+", shift: true }, "-": { code: "Minus", vk: 189, text: "-" },
  "0": { code: "Digit0", vk: 48, text: "0" },
};
const key = async (name, { shift = false } = {}) => {
  const k = KEYS[name] || { code: `Key${name.toUpperCase()}`, vk: name.toUpperCase().charCodeAt(0), text: name };
  const modifiers = shift || k.shift ? 8 : 0;
  const base = { key: name, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers };
  await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...base, ...(k.text ? { text: k.text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await sleep(60);
};
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...extra });
const click = async (x, y, button = "left") => {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, { button, clickCount: 1 });
  await mouse("mouseReleased", x, y, { button, clickCount: 1 });
  await sleep(80);
};
const drag = async (x1, y1, x2, y2) => {
  await mouse("mouseMoved", x1, y1);
  await mouse("mousePressed", x1, y1, { button: "left", clickCount: 1 });
  for (let i = 1; i <= 5; i += 1) {
    await mouse("mouseMoved", x1 + ((x2 - x1) * i) / 5, y1 + ((y2 - y1) * i) / 5, { button: "left", buttons: 1 });
  }
  await mouse("mouseReleased", x2, y2, { button: "left", clickCount: 1 });
  await sleep(80);
};
/* The centre of a [data-t] element, in viewport px, after scrolling it into view. */
const centre = (t) => evaluate(`(() => { const n = __o.$(${JSON.stringify(t)}); n.scrollIntoView({ block: "center" });
  const r = n.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const clickT = async (t, button) => { const p = await centre(t); await click(p.x, p.y, button); };
const clickT_id = async (id) => {
  const p = await evaluate(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await click(p.x, p.y);
};

/* :hover or :focus-visible forced on ONE node through the protocol. */
const withForced = async (selector, states, expression) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`no node to force ${states} on: ${selector}`);
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
  try { return await evaluate(expression); } finally { await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }); }
};
/* The same, held while `body` runs — a screenshot of the forced state has to be taken inside it. */
const whileForced = async (selector, states, body) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`no node to force ${states} on: ${selector}`);
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
  try { return await body(); } finally { await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }); }
};

/*
 * PAINTED PIXELS. Forced colours are applied when the page is PAINTED, and two of their effects never
 * reach getComputedStyle: the Canvas backplate the mode lays behind text, and the author colour an
 * opted-out glyph inherits. So the X1 pass reads what reached the screen: a viewport screenshot,
 * decoded here (8-bit RGB/RGBA, not interlaced — what Page.captureScreenshot writes), cropped to a box
 * in CSS px. In the crop the most frequent colour is what the thing is painted ON, and the INK is the
 * pixel that stands furthest off it; the ratio between the two is the contrast a reader gets. That is
 * also what a backplate cannot hide from: a slab behind a word becomes the dominant colour, and the
 * word is measured against the slab it is actually on.
 */
const decodePng = (png) => {
  let pos = 8, width = 0, height = 0, bpp = 4;
  const idat = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos), type = png.toString("ascii", pos + 4, pos + 8), data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bpp = data[9] === 6 ? 4 : 3; }
    if (type === "IDAT") idat.push(data);
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)], line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0, p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * stride + x] = (raw[line + x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
  }
  return { width, height, bpp, px };
};
const DPR = 2; // the X1 pass renders at 2x, so a 1px stroke has pixels it covers fully
const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const inkIn = ({ width, bpp, px }, box) => {
  const counts = new Map();
  for (let y = Math.ceil(box.y * DPR); y < Math.floor((box.y + box.h) * DPR); y += 1) {
    for (let x = Math.ceil(box.x * DPR); x < Math.floor((box.x + box.w) * DPR); x += 1) {
      const i = (y * width + x) * bpp, key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (!counts.size) throw new Error(`an empty crop: ${JSON.stringify(box)}`);
  const rgb = (key) => [(key >> 16) & 255, (key >> 8) & 255, key & 255];
  const on = rgb([...counts].sort((p, q) => q[1] - p[1])[0][0]);
  let ink = on, ratio = 1;
  for (const key of counts.keys()) { const r = contrast(rgb(key), on); if (r > ratio) { ratio = r; ink = rgb(key); } }
  return { ratio: Math.round(ratio * 100) / 100, ink: ink.join(","), on: on.join(",") };
};
const parseCss = (value) => {
  let m = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/.exec(value);
  if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
  m = /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)/.exec(value);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`unparsed colour: ${value}`);
};
const holdsColour = ({ width, bpp, px }, box, paint) => {
  const want = parseCss(paint);
  if (want[3] < 1) throw new Error(`a translucent paint cannot be looked for as it is: ${paint}`);
  for (let y = Math.ceil(box.y * DPR); y < Math.floor((box.y + box.h) * DPR); y += 1) {
    for (let x = Math.ceil(box.x * DPR); x < Math.floor((box.x + box.w) * DPR); x += 1) {
      const i = (y * width + x) * bpp;
      if ([0, 1, 2].every((k) => Math.abs(px[i + k] - want[k]) <= 12)) return true;
    }
  }
  return false;
};
/*
 * OWNERSHIP, AS A TWO-SHOT DIFF. The same crop is read twice: as drawn, and with ONLY its element
 * hidden. The pixels that change are the element's; everything else in the crop belongs to
 * something else — a neighbour the forced palette made visible, a border the crop slid onto — and
 * is left out. The ratio is carried by the changed pixels alone. Where what the crop is mostly
 * painted in stays when the element goes (a glyph or a ring on a surface), each changed pixel is
 * read against that surface, and only where hiding the element shows that surface: a pixel that
 * uncovers something else is the element drawn over a neighbour, and a glyph's antialiased edge
 * blended into a neighbour's ink would otherwise borrow the neighbour's contrast (the reviewer's
 * transparent "x" under an opted-out X measured 15-20:1 that way). Where it goes too (a word or a ring on the element's own fill), the
 * fill's change proves the crop is the element's, and every pixel that is not the fill is read
 * against it — HighlightText on Highlight does not change when hidden (it IS the Canvas colour), yet
 * it is the element's; and a fill alone carries nothing, so a word the fill hides reads 1:1.
 * Fewer than 3 changed pixels: the crop is not on its element, and no ratio read from it counts.
 */
const diffIn = (shown, hidden, box) => {
  const { width, bpp } = shown;
  const on = inkIn(shown, box).on.split(",").map(Number);
  const ownFill = inkIn(hidden, box).on !== on.join(",");
  let changed = 0, ratio = 1, ink = null;
  for (let y = Math.ceil(box.y * DPR); y < Math.floor((box.y + box.h) * DPR); y += 1) {
    for (let x = Math.ceil(box.x * DPR); x < Math.floor((box.x + box.w) * DPR); x += 1) {
      const i = (y * width + x) * bpp;
      const a = [shown.px[i], shown.px[i + 1], shown.px[i + 2]], b = [hidden.px[i], hidden.px[i + 1], hidden.px[i + 2]];
      const same = a.every((v, k) => Math.abs(v - b[k]) <= 8);
      if (!same) changed += 1;
      if (!ownFill && (same || !b.every((v, k) => Math.abs(v - on[k]) <= 8))) continue;
      const r = contrast(a, on);
      if (r > ratio) { ratio = r; ink = a.join(","); }
    }
  }
  return { changed, ratio: Math.round(ratio * 100) / 100, ownInk: ink };
};
const screenshot = async () => decodePng(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));

const axOf = async (selector) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`no node for ${selector}`);
  const { nodes } = await send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
  const node = nodes.find((n) => !n.ignored) || nodes[0];
  return { name: node.name?.value ?? "", description: node.description?.value ?? "" };
};

/*
 * In-page helpers. `$()` THROWS on a missing hook, so a renamed element fails loudly instead of the
 * check comparing undefined with undefined. Colours are parsed from what Chrome computes: rgb(),
 * rgba() and color(srgb …), which is how it serialises a color-mix().
 */
const HELPERS = `
window.__o = (() => {
  const $ = (t) => { const n = document.querySelector('[data-t="' + t + '"]'); if (!n) throw new Error("no [data-t=" + t + "]"); return n; };
  const el = (x) => (typeof x === "string" ? $(x) : x);
  const cs = (x, pseudo) => getComputedStyle(el(x), pseudo || null);
  const rect = (x) => { const r = el(x).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const parse = (value) => {
    let m = /color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.e-]+))?\\)/.exec(value);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = /rgba?\\(([\\d.]+),? ([\\d.]+),? ([\\d.]+)(?:,? \\/? ?([\\d.]+))?\\)/.exec(value);
    if (m) return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : +m[4]];
    throw new Error("unparsed colour: " + value);
  };
  const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3])).concat(1);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const resolve = (value, prop = "color") => {
    const probe = document.createElement("i");
    probe.style.setProperty(prop, value);
    document.body.append(probe);
    const out = getComputedStyle(probe).getPropertyValue(prop);
    probe.remove();
    return out;
  };
  const same = (a, b) => { const p = parse(a), q = parse(b); return p.every((v, i) => Math.abs(v - q[i]) < 0.004); };
  const tip = () => document.getElementById("ddtip");
  const tipShown = () => { const t = tip(); return !!t && t.style.display === "grid" && t.getClientRects().length > 0; };
  const menu = () => document.querySelector(".context-menu");
  const active = () => { const a = document.activeElement; return a ? (a.dataset?.t || a.id || (a.textContent || "").trim().slice(0, 40) || a.tagName) : null; };
  const open = () => [...document.querySelectorAll("dialog[open]")].map((d) => d.dataset.t || d.id || d.className);
  const closeAll = () => { document.querySelector(".context-menu")?.remove(); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); };
  // Viewport boxes in CSS px for a crop: a control's box inside its border (where only its glyph is
  // drawn), and the box of an element's own text (where a backplate would sit).
  const inner = (x) => { const n = el(x), b = n.getBoundingClientRect(), s = getComputedStyle(n), w = (p) => parseFloat(s.getPropertyValue(p));
    return { x: b.left + w("border-left-width"), y: b.top + w("border-top-width"),
      w: b.width - w("border-left-width") - w("border-right-width"), h: b.height - w("border-top-width") - w("border-bottom-width") }; };
  const textBox = (x) => { const range = document.createRange(); range.selectNodeContents(el(x)); const b = range.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  // The left band of an element's outline, 3px wider than the ring (outward for an outset ring,
  // inward for an inset one), so what the ring sits on is the crop's majority and the ring its ink.
  const ringBand = (x) => { const n = el(x), b = n.getBoundingClientRect(), s = getComputedStyle(n);
    const o = parseFloat(s.outlineOffset) || 0, w = s.outlineStyle === "none" ? 0 : parseFloat(s.outlineWidth) || 0;
    return { x: b.left - o - w - (o >= 0 ? 3 : 0), y: b.top + 4, w: w + 3, h: b.height - 8 }; };
  return { $, el, cs, rect, parse, over, ratio, resolve, same, tip, tipShown, menu, active, open, closeAll, inner, textBox, ringBand };
})();
null`;

const load = async (query = "") => {
  await send("Page.navigate", { url: PAGE + query });
  for (let i = 0; i < 100; i += 1) {
    await sleep(100);
    try { if (await evaluate("window.demoReady === true")) break; } catch {}
  }
  await evaluate(HELPERS);
  // base.css scrolls smoothly; a gesture aimed at a rect measured mid-scroll lands somewhere else.
  // And a colour read mid-transition is the colour it is leaving: html.anim-off (F6) stops every
  // transition, so a state is read at its end. (A .15s colour change once read as "no hover".)
  await evaluate("document.documentElement.style.scrollBehavior = 'auto'; document.documentElement.classList.add('anim-off'); null");
};
const reset = async () => {
  await evaluate("__o.closeAll(); document.activeElement?.blur?.(); window.scrollTo(0, 0); null");
  await mouse("mouseMoved", 2, 2);
  await sleep(60);
};
const T = (t) => `__o.$(${JSON.stringify(t)})`;

await send("Runtime.enable");
await send("Page.enable");
await send("DOM.enable");
await send("CSS.enable");
await send("Accessibility.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

try {
  await load();

  /* ── the dialog's box ──────────────────────────────────────────────────────────────────────── */
  section("dialog.dialog — the box");
  await check("a closed dialog is display: none (the base rule does not outrank the UA's)",
    () => evaluate(`__o.cs("dlg-default").display === "none"`));
  await evaluate(`${T("open-default")}.click(); null`);
  const box = await evaluate(`(() => {
    const d = __o.$("dlg-default"), s = getComputedStyle(d), r = d.getBoundingClientRect();
    return { display: s.display, dir: s.flexDirection, sizing: s.boxSizing, padding: s.padding, w: r.width, h: r.height,
      left: r.left, right: innerWidth - r.right, top: r.top, bottom: innerHeight - r.bottom,
      border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.borderTopStyle].join(" "),
      edge: __o.same(s.borderTopColor, __o.resolve("var(--control-edge)")),
      radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius].join(" "),
      bg: __o.same(s.backgroundColor, __o.resolve("var(--card)")), ink: __o.same(s.color, __o.resolve("var(--foreground)")),
      shadow: s.boxShadow === __o.resolve("var(--elev-modal)", "box-shadow") && s.boxShadow !== "none",
      overflow: s.overflow, fade: __o.same(__o.resolve(s.getPropertyValue("--tablewrap-fade")), __o.resolve("var(--card)")),
      clampFade: __o.same(__o.resolve(s.getPropertyValue("--clamp-fade")), __o.resolve("var(--card)")),
      font: s.fontSize, family: s.fontFamily, backdrop: __o.same(getComputedStyle(d, "::backdrop").backgroundColor, __o.resolve("var(--backdrop)")),
      modal: d.matches(":modal") };
  })()`);
  await check("an open dialog is a flex column, modal", box.display === "flex" && box.dir === "column" && box.modal, box);
  await check("border-box, no padding of its own, centred (the reset's margin: 0 does not win)",
    box.sizing === "border-box" && box.padding === "0px" && Math.abs(box.left - box.right) < 1 && Math.abs(box.top - box.bottom) < 1, box);
  await check("default inline size 28rem (448px)", Math.abs(box.w - 448) < 0.5, box.w);
  await check("edge: 1px solid --control-edge on all four sides, no radius",
    box.border === "1px 1px 1px 1px solid" && box.edge && box.radius === "0px 0px 0px 0px", box);
  await check("surface --card, ink --foreground, glow --elev-modal, overflow hidden",
    box.bg && box.ink && box.shadow && box.overflow === "hidden", box);
  await check("--tablewrap-fade and --clamp-fade are the dialog's --card", box.fade && box.clampFade, box);
  await check("one text size (--fs-base, 12px) in the mono face, set by the dialog itself",
    box.font === "12px" && /JetBrains Mono/.test(box.family), box);
  await check("::backdrop is --backdrop, with no blur", box.backdrop, box);
  await check("the dialog holding focus draws no ring (base.css's :focus-visible is loaded and overruled)",
    () => evaluate(`document.activeElement === __o.$("dlg-default") && __o.cs("dlg-default").outlineStyle === "none"`));

  const sizes = await evaluate(`(() => {
    const out = {};
    for (const t of ["dlg-sm", "dlg-lg", "dlg-xl", "dlg-full", "dlg-fit"]) {
      const d = __o.$(t); d.showModal(); const r = d.getBoundingClientRect(); out[t] = { w: Math.round(r.width), h: Math.round(r.height) }; d.close();
    }
    return out;
  })()`);
  await check("sizes: --sm 24rem, --lg 42rem, --xl 56rem", sizes["dlg-sm"].w === 384 && sizes["dlg-lg"].w === 672 && sizes["dlg-xl"].w === 896, sizes);
  await check("--full is min(80vw, 90rem) by 90dvh (1024 x 810 at 1280 x 900)", sizes["dlg-full"].w === 1024 && sizes["dlg-full"].h === 810, sizes);
  await check("--fit is as wide as its content, well under the default", sizes["dlg-fit"].w > 100 && sizes["dlg-fit"].w < 448, sizes);
  await check("every size stops at the viewport: --xl on a 700px screen is 700 - 2rem",
    async () => {
      await send("Emulation.setDeviceMetricsOverride", { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
      const w = await evaluate(`(() => { const d = __o.$("dlg-xl"); d.showModal(); const w = d.getBoundingClientRect().width; d.close(); return w; })()`);
      await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      return Math.abs(w - 668) < 0.5;
    });

  /* ── the parts ── */
  section("dialog.dialog — the parts");
  await reset();
  await evaluate(`${T("open-rich")}.click(); null`);
  await sleep(50);
  const parts = await evaluate(`(() => {
    const s = (t) => __o.cs(t);
    const head = __o.$("rich-title").parentElement, hs = getComputedStyle(head);
    const title = __o.$("rich-title"), ts = getComputedStyle(title);
    const d = __o.rect("dlg-rich"), x = __o.rect("rich-x"), foot = __o.rect("rich-foot"), body = __o.$("rich-body");
    const status = __o.$("rich-foot").querySelector(".form-status");
    return {
      head: [hs.display, hs.alignItems, hs.columnGap, hs.padding, hs.borderBottomWidth, hs.flexShrink].join(" "),
      headRule: __o.same(hs.borderBottomColor, __o.resolve("var(--border)")),
      title: [ts.fontSize, ts.fontWeight, ts.lineHeight, ts.whiteSpace, ts.textOverflow, ts.overflow, ts.marginTop].join(" "),
      truncated: title.scrollWidth > title.clientWidth,
      xInside: x.r <= d.r - 23 && x.x > d.x, xSize: [Math.round(x.w), Math.round(x.h)],
      xInk: __o.same(getComputedStyle(__o.$("rich-x")).color, __o.resolve("var(--foreground)")),
      backInk: __o.same(getComputedStyle(__o.$("rich-back")).color, __o.resolve("var(--foreground)")),
      toolbar: [s("rich-toolbar").display, s("rich-toolbar").flexWrap, s("rich-toolbar").columnGap, s("rich-toolbar").padding, s("rich-toolbar").borderBottomWidth, s("rich-toolbar").flexShrink].join(" "),
      body: [s("rich-body").overflowY, s("rich-body").flexGrow, s("rich-body").minHeight, s("rich-body").padding].join(" "),
      scrolls: body.scrollHeight > body.clientHeight,
      h: Math.round(d.h), footInside: foot.b <= d.b + 0.5 && foot.b >= d.b - 1.5,
      foot: [s("rich-foot").marginTop, s("rich-foot").marginBottom, s("rich-foot").padding, s("rich-foot").borderTopWidth, s("rich-foot").flexShrink].join(" "),
      footRule: __o.same(s("rich-foot").borderTopColor, __o.resolve("var(--border)")),
      statusCut: status.scrollWidth > status.clientWidth && getComputedStyle(status).textOverflow === "ellipsis",
      section: s("rich-section-2").marginTop,
      th: __o.same(s("rich-th").backgroundColor, __o.resolve("var(--card)")),
    };
  })()`);
  await check("head: flex row, centred, .75rem gap, 1rem 1.5rem inset, a 1px --border rule, never shrinks",
    parts.head === "flex center 12px 16px 24px 1px 0" && parts.headRule, parts);
  await check("title: --fs-xl, 700, --lh-tight, one line cut with an ellipsis", parts.title === "18px 700 23.4px nowrap ellipsis hidden 0px" && parts.truncated, parts);
  await check("...and a long title never pushes the X out of the head", parts.xInside, parts);
  await check("the X and the back arrow are icon buttons inked in --foreground, not the icon button's --primary",
    parts.xInk && parts.backInk, parts);
  await check("the X is the 28px control (--control-h)", parts.xSize[0] === 28 && parts.xSize[1] === 28, parts.xSize);
  await check("toolbar: wrapping flex row, .5rem gap, .5rem 1.5rem inset, a rule under it, never shrinks",
    parts.toolbar === "flex wrap 8px 8px 24px 1px 0", parts.toolbar);
  await check("body: the one part that scrolls (flex 1, min-height 0, overflow auto, 1rem 1.5rem)",
    parts.body === "auto 1 0px 16px 24px" && parts.scrolls, parts);
  await check("...so a tall dialog stops at 90dvh with its footer on screen", parts.h <= 810 && parts.footInside, parts);
  await check("foot: no margin (it outranks .form-actions), .75rem 1.5rem, a --border rule above, never shrinks",
    parts.foot === "0px 0px 12px 24px 1px 0" && parts.footRule, parts);
  await check("...and a long status is cut, not wrapped over the buttons", parts.statusCut, parts);
  await check("a second .dialog-section starts 1.5rem down", parts.section === "24px", parts.section);
  await check("a sticky table header inside the dialog is painted in --card, not the page's --background", parts.th, parts);
  await check("a --flush body has no inset", () => evaluate(`(() => { const d = __o.$("dlg-full"); d.showModal(); const p = __o.cs("full-body").padding; d.close(); return p === "0px"; })()`));
  await reset();
  await evaluate(`(() => { const d = document.createElement("dialog"); d.className = "dialog"; d.id = "form-dlg";
    d.innerHTML = '<header class="dialog-head"><h2 class="dialog-title">a form</h2></header><form method="dialog">' +
      '<div class="dialog-body" id="form-body"><p style="height: 2000px">tall</p></div>' +
      '<footer class="dialog-foot form-actions" id="form-foot"><button value="save" id="form-save">save</button></footer></form>';
    document.body.append(d); d.showModal(); })(); null`);
  const form = await evaluate(`(() => { const d = document.getElementById("form-dlg"), r = d.getBoundingClientRect(), f = document.getElementById("form-foot").getBoundingClientRect(), b = document.getElementById("form-body");
    return { h: Math.round(r.height), footAtBottom: Math.abs(f.bottom - (r.bottom - 1)) < 1, scrolls: b.scrollHeight > b.clientHeight, form: getComputedStyle(d.querySelector("form")).display }; })()`);
  await check("a <form method=dialog> wrapping the body and the footer does not break the layout (it is display: contents)",
    form.form === "contents" && form.h === 810 && form.footAtBottom && form.scrolls, form);
  await clickT_id("form-save");
  await check("...and its submit button's value is the answer", () => evaluate(`(() => { const d = document.getElementById("form-dlg"); const ok = !d.open && d.returnValue === "save"; d.remove(); return ok; })()`));

  /* ── the drawer, the phone, print ── */
  section("drawer, phone, print");
  await reset();
  await evaluate(`${T("open-drawer")}.click(); null`);
  await sleep(50);
  const drawer = await evaluate(`(() => { const d = __o.$("dlg-drawer"), s = getComputedStyle(d), r = d.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].join(" "),
      edge: __o.same(s.borderLeftColor, __o.resolve("var(--control-edge)")), shadow: s.boxShadow === __o.resolve("var(--elev-modal)", "box-shadow"),
      backdrop: __o.same(getComputedStyle(d, "::backdrop").backgroundColor, __o.resolve("var(--backdrop)")), modal: d.matches(":modal"),
      flush: __o.cs("drawer-body").padding }; })()`);
  await check("the drawer: flush right, full height, 50rem wide", drawer.r === 1280 && drawer.t === 0 && drawer.b === 900 && drawer.w === 800 && drawer.modal, drawer);
  await check("...edged on the content side only, with the dialog's glow and scrim",
    drawer.border === "0px 0px 0px 1px" && drawer.edge && drawer.shadow && drawer.backdrop, drawer);
  await reset();
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 1, mobile: false });
  const phone = await evaluate(`(() => {
    const d = __o.$("dlg-default"); d.showModal();
    const r = d.getBoundingClientRect(), s = getComputedStyle(d);
    const out = { w: r.width, maxH: s.maxHeight, head: getComputedStyle(d.querySelector(".dialog-head")).paddingInline,
      body: getComputedStyle(d.querySelector(".dialog-body")).paddingInline, foot: getComputedStyle(d.querySelector(".dialog-foot")).paddingInline };
    d.close();
    const f = __o.$("dlg-full"); f.showModal(); out.flush = __o.cs("full-body").padding; f.close();
    const dr = __o.$("dlg-drawer"); dr.showModal(); const q = dr.getBoundingClientRect(); out.drawer = [q.left, q.width, q.height]; dr.close();
    return out; })()`);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await check("below 40rem: the dialog takes the width less .5rem a side, at most the height less 1rem",
    Math.abs(phone.w - 374) < 0.5 && phone.maxH === "784px", phone);
  await check("...its parts inset 1rem, the flush body still none", phone.head === "16px" && phone.body === "16px" && phone.foot === "16px" && phone.flush === "0px", phone);
  await check("...and the drawer keeps the whole screen", phone.drawer.join() === "0,390,800", phone.drawer);
  await send("Emulation.setEmulatedMedia", { media: "print" });
  const printed = await evaluate(`(() => {
    const d = __o.$("dlg-default"); d.showModal();
    const menu = document.createElement("ul"); menu.className = "select-panel context-menu"; document.body.append(menu);
    const view = document.createElement("dialog"); view.className = "dgm-overlay"; document.body.append(view); view.showModal();
    const out = { dialog: getComputedStyle(d).display, menu: getComputedStyle(menu).display, view: getComputedStyle(view).display,
      tip: getComputedStyle(__o.tip()).display };
    view.close(); view.remove(); menu.remove(); d.close(); return out; })()`);
  await send("Emulation.setEmulatedMedia", { media: "" });
  await check("print: the page prints, not what floats over it (dialog, context menu, zoom view, tip)",
    printed.dialog === "none" && printed.menu === "none" && printed.view === "none" && printed.tip === "none", printed);

  /* ── hidden (X3) ── */
  section("hidden — every class here that sets display still hides (tokens.css answers it, X3)");
  const hidden = await evaluate(`(() => {
    const out = {};
    const probe = (name, node) => { node.hidden = true; out[name] = getComputedStyle(node).display; node.hidden = false; };
    const d = __o.$("dlg-rich"); d.showModal();
    for (const sel of [".dialog-head", ".dialog-toolbar", ".dialog-body", ".dialog-foot"]) probe(sel, d.querySelector(sel));
    probe("dialog.dialog[open]", d);
    const form = document.createElement("form"); d.append(form); probe("dialog.dialog > form", form); form.remove();
    d.close();
    const menu = document.createElement("ul"); menu.className = "select-panel context-menu"; document.body.append(menu); probe(".context-menu", menu); menu.remove();
    return out; })()`);
  await check("hidden hides .dialog-head, -toolbar, -body, -foot, an open dialog, a form in it, a context menu",
    Object.values(hidden).every((v) => v === "none") && Object.keys(hidden).length === 7, hidden);

  /* ── forced colours (X1) ──────────────────────────────────────────────────────────────────────
     Windows High Contrast and every forced palette paint each background Canvas and lay a Canvas
     backplate behind text. A glyph is a mask over a background, so it shows only when it is opted
     out of the forcing — and an opted-out glyph paints whatever colour it INHERITS, which is the
     author's unless its host was handed a system colour. An opted-out element owns its focus ring the
     same way: `none` stops forcing `outline-color` too. Whether any of that shows depends on the
     palette and the theme (a dark ink vanishes on a dark palette's black Canvas, a light one on
     white), so this runs on a LIGHT and a DARK forced palette and all four themes, and it reads
     PAINTED PIXELS: a computed-colour check reads 21:1 for a word its backplate has hidden.
     This package draws none of these glyphs — the icon button's is controls.css's, .ico is
     icons.css's, the popup rows are components.css's — so what it can get wrong is what it adds on
     top: an opt-out of its own, an author colour, and the one row whose colour it sets.

     WHOSE PIXELS. Screenshots are taken in the viewport of a browser started with --hide-scrollbars,
     never with captureBeyondViewport (which re-lays the page without its scrollbar and moves every
     box measured beforehand). Every crop is shown to hold its element twice over: once in normal
     colours, where it must contain the colour its element itself paints there; and on each forced
     palette, where the element alone is hidden and the shot retaken: only the pixels that change
     are the element's, they must number 3 or more, and the ratio is read from them alone (diffIn).
     Ink a forced palette gives a neighbour, or a border a crop slid onto, never changes, so it can
     neither pass nor fail a measurement it is not part of.

     REAL FOCUS. Every ring is drawn by focus the keyboard put there — a Tab into the dialog, the
     arrow keys down the menu — never by a forced pseudo-class, which draws a ring no reader gets. */
  section("forced colours — painted pixels on a light and a dark forced palette, four themes (X1)");
  const FORCED_THEMES = ["warm", "green", "mono", "paper"];
  const STATED = `__o.menu().querySelector('[aria-disabled="true"]')`;
  const ITEM = (i) => `__o.menu().querySelectorAll(".dropdown-item")[${i}]`;
  // Each scene: what, its floor, the state it is shot in, the element, its crop and its own paint.
  const SCENES = [
    { what: "the X (glyph)", floor: 3, state: "dlg:dlg-default", el: T("default-x"), crop: "inner", paint: "glyph" },
    { what: "the X under a real Tab: its focus ring", floor: 3, state: "tab:open-default", el: T("default-x"), crop: "ring", paint: "ring" },
    { what: "the back arrow (glyph)", floor: 3, state: "dlg:dlg-rich", el: T("rich-back"), crop: "inner", paint: "glyph" },
    { what: "the alert glyph (glyph)", floor: 3, state: "dlg:dlg-alert", el: T("alert-glyph"), crop: "inner", paint: "fill" },
    { what: "a context-menu row under the keys (text on its highlight)", floor: 4.5, state: "menu:0", el: ITEM(0), crop: "text", paint: "text" },
    { what: "a context-menu row under the keys: its focus ring", floor: 3, state: "menu:0", el: ITEM(0), crop: "ring", paint: "ring" },
    { what: "the stated row at rest (text)", floor: 4.5, state: "menu:0", el: STATED, crop: "text", paint: "text" },
    { what: "an action row at rest (text) — the stated row's pair", floor: 4.5, state: "menu:0", el: ITEM(1), crop: "text", paint: "text" },
    { what: "the stated row under the keys (text)", floor: 4.5, state: "menu:3", el: STATED, crop: "text", paint: "text" },
    { what: "the stated row under the keys: its focus ring", floor: 3, state: "menu:3", el: STATED, crop: "ring", paint: "ring" },
  ];
  const CROP = { inner: (e) => `__o.inner(${e})`, ring: (e) => `__o.ringBand(${e})`, text: (e) => `__o.textBox(${e})` };
  const PAINT = {
    glyph: (e) => `getComputedStyle(${e}, "::before").backgroundColor`, fill: (e) => `getComputedStyle(${e}).backgroundColor`,
    ring: (e) => `getComputedStyle(${e}).outlineColor`, text: (e) => `getComputedStyle(${e}).color`,
  };
  const enter = async (state) => {
    await reset();
    const [kind, arg] = state.split(":");
    if (kind === "dlg") {
      await evaluate(`(() => { __o.$("${arg}").showModal(); document.activeElement?.blur?.(); })()`);
    } else if (kind === "tab") {
      await evaluate(`${T(arg)}.click(); null`); // the runtime focuses the dialog; one Tab reaches its X
      await key("Tab");
    } else {
      await centre("row-app");
      await evaluate(`${T("row-app")}.focus(); null`);
      await key("F10", { shift: true });
      for (let i = 0; i < Number(arg); i += 1) await key("ArrowDown");
    }
    await sleep(40);
  };
  // One pass: every state entered once, one shot, every crop handed on; with `removal`, each
  // element is then hidden in turn (the focused one last: hiding it drops its focus) and retaken.
  const shootScenes = async (onShot, removal) => {
    for (const state of [...new Set(SCENES.map((sc) => sc.state))]) {
      const group = SCENES.filter((sc) => sc.state === state);
      await enter(state);
      const shot = await screenshot();
      const boxes = new Map();
      const shownOf = new Map();
      for (const sc of group) {
        const { box, paint } = await evaluate(`({ box: ${CROP[sc.crop](sc.el)}, paint: ${PAINT[sc.paint](sc.el)} })`);
        boxes.set(sc, box);
        shownOf.set(sc, shot);
        onShot(sc, shot, box, paint);
      }
      if (!removal) continue;
      const els = [...new Set(group.map((sc) => sc.el))];
      const focused = await evaluate(`[${els.join(", ")}].map((n) => n === document.activeElement)`);
      for (const e of els.filter((_, i) => !focused[i]).concat(els.filter((_, i) => focused[i]))) {
        await evaluate(`${e}.style.setProperty("visibility", "hidden", "important"); null`);
        await sleep(40);
        const without = await screenshot();
        await evaluate(`${e}.style.removeProperty("visibility"); null`);
        for (const sc of group.filter((g) => g.el === e)) removal(sc, without, boxes.get(sc), shownOf.get(sc));
      }
    }
    await reset();
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: DPR, mobile: false });
  await reset();
  const misses = [];
  await shootScenes((sc, shot, box, paint) => {
    if (!holdsColour(shot, box, paint)) misses.push(`${sc.what}: no ${paint} in ${JSON.stringify(box)}`);
  });
  await check("every crop lands on its element: in normal colours each holds the colour its element paints there",
    misses.length === 0, misses.join("; "));

  const forcedCells = new Map(); // what -> { floor, cells: { "light/warm": { ratio, ink, on } } }
  const canvasText = {};
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
    await sleep(100);
    await check(`forced colours really are on, ${scheme} palette (a check under no forcing would pass by default)`,
      () => evaluate(`matchMedia("(forced-colors: active)").matches && matchMedia("(prefers-color-scheme: ${scheme})").matches`));
    canvasText[scheme] = parseCss(await evaluate(`(() => { const i = document.createElement("i"); i.style.cssText = "forced-color-adjust: none; color: CanvasText";
      document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; })()`)).slice(0, 3).map(Math.round).join(",");
    for (const theme of FORCED_THEMES) {
      await evaluate(`document.documentElement.dataset.theme = "${theme}"; null`);
      await shootScenes(() => {}, ({ what, floor }, without, box, shown) => {
        const entry = forcedCells.get(what) || { floor, cells: {} };
        entry.cells[`${scheme}/${theme}`] = { ...inkIn(shown, box), ...diffIn(shown, without, box) };
        forcedCells.set(what, entry);
      });
    }
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.documentElement.dataset.theme = "warm"; null`);
  await reset();
  const unowned = [...forcedCells].flatMap(([what, { cells }]) => Object.entries(cells).filter(([, m]) => m.changed < 3).map(([c, m]) => `${c} ${what}: ${m.changed} px change`));
  await check("forced colours, both palettes: every crop is owned — hiding its element changes 3 pixels or more there",
    forcedCells.size === SCENES.length && unowned.length === 0, unowned.join("; ") || `${forcedCells.size} of ${SCENES.length} scenes measured`);
  for (const [what, { floor, cells }] of forcedCells) {
    const low = Object.entries(cells).filter(([, m]) => m.ratio < floor).map(([c, m]) => `${c} ${m.ratio} (ink ${m.ink} on ${m.on})`);
    await check(`forced colours, both palettes x four themes: ${what} reaches ${floor}:1, carried by its own changed pixels`,
      Object.keys(cells).length === 8 && low.length === 0, low.join("; ") || `${Object.keys(cells).length} of 8 cells measured`);
  }
  // The ring's colour is the ink its own changed pixels carry.
  const statedRing = forcedCells.get("the stated row under the keys: its focus ring")?.cells ?? {};
  const notCanvasText = Object.entries(statedRing).filter(([c, m]) => m.ownInk !== canvasText[c.split("/")[0]]).map(([c, m]) => `${c}: ${m.ownInk}, CanvasText is ${canvasText[c.split("/")[0]]}`);
  await check("forced colours: the stated row's ring under the keys is CanvasText (the lead's ruling for a disabled or stated row)",
    Object.keys(statedRing).length === 8 && notCanvasText.length === 0, notCanvasText.join("; "));
  const statedInk = forcedCells.get("the stated row at rest (text)")?.cells ?? {};
  const actionInk = forcedCells.get("an action row at rest (text) — the stated row's pair")?.cells ?? {};
  const alike = Object.keys(statedInk).filter((c) => statedInk[c].ink === actionInk[c]?.ink);
  await check("forced colours: the stated row still reads differently from an action (its own ink, GrayText), in every cell",
    Object.keys(statedInk).length === 8 && alike.length === 0, alike.map((c) => `${c}: both ${statedInk[c].ink}`).join("; "));
  console.log("\n| painted under forced colours — contrast on what it sits on | floor | light: warm / green / mono / paper | dark: warm / green / mono / paper |\n|---|---:|---|---|");
  for (const [what, { floor, cells }] of forcedCells) {
    const row = (scheme) => FORCED_THEMES.map((t) => cells[`${scheme}/${t}`]?.ratio.toFixed(2) ?? "—").join(" / ");
    console.log(`| ${what} | ${floor} | ${row("light")} | ${row("dark")} |`);
  }
  console.log("");

  /* ── the dialog runtime ────────────────────────────────────────────────────────────────────── */
  section("dialog.js — focus, Tab, Escape, the answer");
  await reset();
  await clickT("open-default");
  await check("a real click on [data-dialog-open] opens it modally", () => evaluate(`__o.$("dlg-default").matches(":modal")`));
  await check("focus starts on the dialog itself (tabindex -1), so its name is read first",
    () => evaluate(`document.activeElement === __o.$("dlg-default") && __o.$("dlg-default").tabIndex === -1`));
  await check("it is named by its title", () => evaluate(`__o.$("dlg-default").getAttribute("aria-labelledby") === "dlg-default-t"`));
  const walk = [];
  for (let i = 0; i < 9; i += 1) { await key("Tab"); walk.push(await evaluate(`(() => { const a = document.activeElement; return a === document.body ? "BODY" : (__o.$("dlg-default").contains(a) ? "in:" + __o.active() : "OUT:" + __o.active()); })()`)); }
  await check("Tab walks the dialog's controls and never reaches the page behind it",
    walk.every((w) => !w.startsWith("OUT")) && walk.filter((w) => w.startsWith("in:")).length >= 6 && walk[0] === "in:default-x", walk);
  const back = [];
  for (let i = 0; i < 5; i += 1) { await key("Tab", { shift: true }); back.push(await evaluate(`__o.$("dlg-default").contains(document.activeElement) || document.activeElement === document.body`)); }
  await check("...and so does Shift+Tab", back.every(Boolean), back);
  await evaluate(`${T("default-x")}.focus(); null`);
  await key("Escape");
  await check("Escape closes it, and focus goes back to the opener",
    () => evaluate(`!__o.$("dlg-default").open && document.activeElement === __o.$("open-default")`));
  await check("...with an empty answer", () => evaluate(`__o.$("dlg-default").returnValue === ""`));
  await clickT("open-default");
  await clickT("default-join");
  await check("[data-dialog-close=\"join\"] closes with returnValue \"join\"",
    () => evaluate(`!__o.$("dlg-default").open && __o.$("dlg-default").returnValue === "join"`));
  await clickT("open-default");
  await click(12, 890);
  await check("a press and release on the backdrop closes it", () => evaluate(`!__o.$("dlg-default").open`));
  await clickT("open-default");
  const inside = await centre("default-body");
  await drag(inside.x, inside.y, 12, 890);
  await check("a press that starts inside and ends on the backdrop (a text selection dragged out) does not",
    () => evaluate(`__o.$("dlg-default").open`));
  await evaluate(`__o.$("dlg-default").close(); null`);
  await clickT("open-default");
  const edge = await evaluate(`(() => { const r = __o.$("dlg-default").getBoundingClientRect(); return { x: Math.round(r.left + 60), y: Math.round(r.top + 0.4) }; })()`);
  await mouse("mouseMoved", 12, 890);
  await mouse("mousePressed", 12, 890, { button: "left", clickCount: 1 });
  await mouse("mouseReleased", edge.x, edge.y + 30, { button: "left", clickCount: 1 });
  await sleep(80);
  await check("...nor one that starts on the backdrop and ends inside", () => evaluate(`__o.$("dlg-default").open`));
  await evaluate(`__o.$("dlg-default").close(); null`);
  await clickT("open-default");
  // The border's own pixel: at left + 0.5 the hit test already lands on the body inside it.
  const rim = await evaluate(`(() => { const d = __o.$("dlg-default"), r = d.getBoundingClientRect(), x = Math.floor(r.left), y = Math.round(r.top + r.height / 2);
    window.__rimTarget = null; d.addEventListener("pointerdown", (e) => { window.__rimTarget = e.target === d; }, { once: true, capture: true }); return { x, y }; })()`);
  await mouse("mouseMoved", rim.x, rim.y);
  await mouse("mousePressed", rim.x, rim.y, { button: "left", clickCount: 1 });
  await mouse("mouseReleased", 12, 890, { button: "left", clickCount: 1 });
  await sleep(80);
  await check("...nor one that starts on the dialog's 1px edge and is released on the scrim",
    () => evaluate(`window.__rimTarget === true && __o.$("dlg-default").open`), () => evaluate(`({ pressedTheDialog: window.__rimTarget, open: __o.$("dlg-default").open })`));
  await reset();
  await clickT("open-inactive");
  await check("an aria-disabled opener opens nothing", () => evaluate(`__o.open().length === 0`));
  await clickT("open-autofocus");
  await check("[autofocus] in the content wins over focusing the dialog", () => evaluate(`document.activeElement === __o.$("autofocus-input")`));
  await reset();
  await clickT("open-unnamed");
  await check("a dialog with no name in the markup is linked to its .dialog-title",
    () => evaluate(`(() => { const id = __o.$("dlg-unnamed").getAttribute("aria-labelledby"); return !!id && document.getElementById(id) === __o.$("unnamed-title"); })()`));
  await check("...which the accessibility tree reads as its name",
    async () => (await axOf('[data-t="dlg-unnamed"]')).name === "named by its title");

  // FOCUS RETURN, the branches Chromium does not cover by itself. With <body> focused at open the
  // platform restores nothing, so only the opener passed in brings focus back — and it is a plain
  // page button here, not a [data-dialog-open], so the last fallback cannot stand in for it. Then a
  // page that re-renders its opener while the dialog is open: both remembered elements are gone.
  await reset();
  await evaluate(`(async () => { const m = await import("/runtime/dialog.js"); document.activeElement?.blur?.(); m.openDialog("dlg-default", ${T("after-rows")}); })()`);
  await key("Escape");
  await check("opened from code with <body> focused, focus goes back to the opener it was given",
    () => evaluate(`document.activeElement === ${T("after-rows")}`));
  await reset();
  await clickT("open-default");
  await evaluate(`(() => { const old = ${T("open-default")}, again = old.cloneNode(true); again.dataset.t = "open-default-again"; old.replaceWith(again); })(); null`);
  await key("Escape");
  const cameBack = await evaluate(`document.activeElement?.dataset?.t ?? document.activeElement?.tagName`);
  await evaluate(`document.querySelector('[data-t="open-default-again"]').dataset.t = "open-default"; null`);
  await check("an opener the page re-rendered while the dialog was open gets focus back (the dialog's [data-dialog-open])",
    cameBack === "open-default-again", cameBack);

  section("dialog.js — a stack, the answer reset, a committing footer, the alert");
  await reset();
  await clickT("open-nest");
  await clickT("open-nest-b");
  await check("a dialog opened from a dialog goes on top, both open", () => evaluate(`__o.open().join() === "dlg-nest-a,dlg-nest-b" && __o.$("dlg-nest-b").matches(":modal")`));
  await check("the one underneath is inert: its button refuses focus and the pointer",
    () => evaluate(`(() => { const b = __o.$("open-nest-b"); b.focus(); const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return document.activeElement !== b && hit !== b; })()`));
  await key("Escape");
  await check("Escape closes the topmost only", () => evaluate(`__o.open().join() === "dlg-nest-a"`));
  await check("...and focus goes back to the button in the first dialog that opened it", () => evaluate(`document.activeElement === __o.$("open-nest-b")`));
  await key("Escape");
  await check("the second Escape closes the first, focus back on the page's opener",
    () => evaluate(`__o.open().length === 0 && document.activeElement === __o.$("open-nest")`));

  await clickT("open-confirm");
  await check("a confirm has no X", () => evaluate(`!__o.$("dlg-confirm").querySelector(".dialog-close")`));
  await clickT("confirm-remove");
  await check("remove answers \"remove\"", () => evaluate(`__o.$("dlg-confirm").returnValue === "remove"`));
  await clickT("open-confirm");
  await key("Escape");
  // Current Chromium empties returnValue on an Escape close by itself, so this one passes without
  // the reset too; the backdrop close below does not, and is the one that catches a missing reset.
  await check("the same confirm dismissed with Escape answers \"\", not the last open's \"remove\"",
    () => evaluate(`__o.$("dlg-confirm").returnValue === ""`));
  await clickT("open-confirm");
  await clickT("confirm-remove");
  await clickT("open-confirm");
  await click(12, 890);
  await check("...and dismissed on the backdrop, the same", () => evaluate(`!__o.$("dlg-confirm").open && __o.$("dlg-confirm").returnValue === ""`));
  await clickT("open-confirm");
  await clickT("confirm-cancel");
  await check("cancel answers \"cancel\"", () => evaluate(`__o.$("dlg-confirm").returnValue === "cancel"`));

  await evaluate("window.discardMs = 1500; null");
  await clickT("open-discard");
  await clickT("discard-go");
  const busy = await evaluate(`(() => { const go = __o.$("discard-go"), foot = go.parentElement;
    return { busy: go.getAttribute("aria-busy"), disabled: [...foot.querySelectorAll("button")].map((b) => b.getAttribute("aria-disabled") + "/" + b.disabled).join(" "),
      focus: document.activeElement === go }; })()`);
  await check("committing: the action is aria-busy, both answers aria-disabled — never disabled", busy.busy === "true" && busy.disabled === "true/false true/false", busy);
  await check("...and focus stays on the action (X5)", busy.focus, busy);
  await key("Escape");
  await key("Escape");
  await click(12, 890);
  const cancelBtn = await evaluate(`(() => { const b = __o.$("dlg-discard").querySelector('[data-dialog-close="cancel"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(cancelBtn.x, cancelBtn.y);
  await check("while it commits, Escape (twice), the backdrop and cancel all leave it open", () => evaluate(`__o.$("dlg-discard").open`));
  await sleep(1600);
  await check("the page closes it when the write returns, answering \"discard\", focus back on the opener",
    () => evaluate(`!__o.$("dlg-discard").open && __o.$("dlg-discard").returnValue === "discard" && document.activeElement === __o.$("open-discard")`));
  await evaluate("window.discardMs = 1000; null");
  await reset();
  await clickT("open-default");
  await evaluate(`${T("default-join")}.setAttribute("aria-busy", "true"); null`);
  await sleep(30);
  const xLocked = await evaluate(`${T("default-x")}.getAttribute("aria-disabled")`);
  await clickT("default-x");
  const xWhileBusy = await evaluate(`__o.$("dlg-default").open`);
  await evaluate(`${T("default-join")}.removeAttribute("aria-busy"); null`);
  await sleep(30);
  const xUnlocked = await evaluate(`${T("default-x")}.getAttribute("aria-disabled")`);
  await check("...and it says so: aria-disabled while the footer commits, not once it is done", xLocked === "true" && xUnlocked === null, { xLocked, xUnlocked });
  await clickT("default-x");
  await check("the X of a dialog whose footer is committing does nothing either — and closes once it is done",
    xWhileBusy && await evaluate(`!__o.$("dlg-default").open`), { xWhileBusy });

  await reset();
  await clickT("open-alert");
  await check("an alert opens as role=alertdialog, described by its body",
    () => evaluate(`(() => { const d = __o.$("dlg-alert"); return d.getAttribute("role") === "alertdialog" && d.getAttribute("aria-describedby") === __o.$("alert-body").id; })()`));
  await key("Escape"); await key("Escape"); await key("Escape");
  await check("three Escapes leave an alert open (a prevented cancel alone lets the second through)",
    () => evaluate(`__o.$("dlg-alert").open`));
  await click(12, 890);
  await check("...and so does the backdrop", () => evaluate(`__o.$("dlg-alert").open`));
  await clickT("alert-send");
  await check("its answer closes it: \"send\"", () => evaluate(`!__o.$("dlg-alert").open && __o.$("dlg-alert").returnValue === "send"`));
  await reset();
  await evaluate(`(() => { const d = document.createElement("dialog"); d.id = "bare-alert"; d.className = "dialog dialog--alert";
    d.innerHTML = '<div class="dialog-body"><p>a page opened this with its own showModal()</p><button type="button">ok</button></div>';
    document.body.append(d); d.showModal(); })(); null`);
  await key("Escape"); await key("Escape"); await key("Escape");
  // A close request that is not a key — requestClose(), a phone's back gesture — reaches the
  // dialog only as `cancel`, and only the root's cancel guard stands in its way.
  const bareHeld = await evaluate(`(() => { const d = document.getElementById("bare-alert"); if (typeof d.requestClose !== "function") return "no requestClose";
    d.requestClose(); return d.open; })()`);
  await evaluate(`document.getElementById("bare-alert").remove(); null`);
  await check("an alert a page opened with a bare showModal() holds against Escape and requestClose() too (the guards are the root's)", bareHeld === true, { bareHeld });
  await evaluate(`(async () => { const m = await import("/runtime/dialog.js"); m.openDialog("dlg-alert");
    const d = document.createElement("dialog"); d.id = "native-top"; d.innerHTML = '<button type="button">ok</button>'; document.body.append(d);
    d.showModal(); d.querySelector("button").focus(); })()`);
  await key("Escape");
  const overAlert = await evaluate(`({ native: document.getElementById("native-top").open, alert: __o.$("dlg-alert").open })`);
  await evaluate(`document.getElementById("native-top").remove(); __o.$("dlg-alert").close(); null`);
  await check("a native dialog a page put on top of an alert closes on Escape; the alert under it stays",
    !overAlert.native && overAlert.alert, overAlert);

  await check("openDialog / closeDialog from code: the answer comes back, an open dialog is returned as is",
    () => evaluate(`(async () => { const m = await import("/runtime/dialog.js");
      const d = m.openDialog("dlg-sm"); const again = m.openDialog(d); m.closeDialog("dlg-sm", "x");
      return d === again && !d.open && d.returnValue === "x"; })()`));
  await check("openDialog with an id that is not a <dialog> throws, naming it",
    () => evaluate(`(async () => { const m = await import("/runtime/dialog.js"); try { m.openDialog("nope"); return false; } catch (e) { return /#nope/.test(e.message); } })()`));
  await reset();
  await clickT("open-drawer");
  await check("the drawer is the same dialog: modal, focus on it, Escape closes, focus back",
    async () => {
      const opened = await evaluate(`__o.$("dlg-drawer").matches(":modal") && document.activeElement === __o.$("dlg-drawer")`);
      await key("Escape");
      return opened && await evaluate(`!__o.$("dlg-drawer").open && document.activeElement === __o.$("open-drawer")`);
    });

  /* ── scroll lock ── */
  section("scroll lock");
  await reset();
  await evaluate("window.scrollTo(0, 400); null");
  await clickT("open-default");
  const lock = await evaluate(`({ y: scrollY, overflow: getComputedStyle(document.documentElement).overflow })`);
  await mouse("mouseWheel", 40, 60, { deltaX: 0, deltaY: 600 });
  await sleep(300);
  const lockedY = await evaluate("scrollY");
  await key("Escape");
  await mouse("mouseWheel", 40, 60, { deltaX: 0, deltaY: 600 });
  await sleep(300);
  const freeY = await evaluate("scrollY");
  await check("with a modal dialog open the root is overflow: hidden and the wheel does not move the page",
    lock.overflow === "hidden" && lockedY === lock.y, { lock, lockedY });
  await check("...and once it closes, the page scrolls again", freeY > lockedY && await evaluate(`getComputedStyle(document.documentElement).overflow === "visible"`), { lockedY, freeY });

  /* ── the tooltip ───────────────────────────────────────────────────────────────────────────── */
  section("tooltip — the panel");
  await reset();
  const tc = await centre("tip-card");
  await mouse("mouseMoved", tc.x, tc.y);
  await sleep(80);
  const panel = await evaluate(`(() => { const t = __o.tip(), s = getComputedStyle(t), rows = [...t.children];
    return { shown: __o.tipShown(), display: s.display, bg: __o.same(s.backgroundColor, __o.resolve("var(--popover)")),
      ink: __o.same(s.color, __o.resolve("var(--popover-foreground)")), border: s.borderTopWidth + " " + s.borderTopStyle,
      edge: __o.same(s.borderTopColor, __o.resolve("var(--control-edge)")), radius: s.borderTopLeftRadius,
      shadow: s.boxShadow === __o.resolve("var(--elev-float)", "box-shadow"), padding: s.padding, max: s.maxWidth,
      font: s.fontSize, family: /JetBrains Mono/.test(s.fontFamily),
      gap: rows.length > 1 ? Math.round((rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom) * 10) / 10 : null }; })()`);
  await check("the panel is a popup: --popover, --popover-foreground, 1px --control-edge, the --elev-float glow, no radius",
    panel.shown && panel.bg && panel.ink && panel.border === "1px solid" && panel.edge && panel.shadow && panel.radius === "0px", panel);
  await check("...a rem box (.45rem .625rem, at most 21.25rem) at --fs-base in the mono face",
    panel.padding === "7.2px 10px" && panel.max === "340px" && panel.font === "12px" && panel.family, panel);
  await check("...and its rows are .2rem apart (a later `gap` shorthand had zeroed that since 0.57.0)", panel.gap === 3.2, panel);

  section("tooltip — the top layer, Escape");
  await reset();
  await clickT("open-default");
  const td = await centre("tip-in-dialog");
  await mouse("mouseMoved", td.x, td.y);
  await sleep(80);
  const layer = await evaluate(`(() => { const t = __o.tip(); t.style.pointerEvents = "auto"; const r = t.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); t.style.pointerEvents = "";
    return { parent: t.parentElement === __o.$("dlg-default"), visible: !!hit && (hit === t || t.contains(hit)),
      described: __o.$("tip-in-dialog").getAttribute("aria-describedby") }; })()`);
  await check("a tip for a control inside a modal dialog is appended to that dialog", layer.parent, layer);
  await check("...so it is actually on top: the hit test at its centre finds the tip, not the dialog", layer.visible, layer);
  await key("Escape");
  await check("Escape hides the tip and nothing else: the dialog stays open, the anchor keeps its description",
    () => evaluate(`!__o.tipShown() && __o.$("dlg-default").open && __o.$("tip-in-dialog").getAttribute("aria-describedby") === "ddtip"`));
  // The browser re-fires mouseover on the element under a still pointer whenever it re-resolves the
  // hover; moving within the element fires none, so the re-fire is dispatched here as it arrives.
  await evaluate(`${T("tip-in-dialog")}.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); null`);
  await sleep(40);
  await check("...and it does not come straight back on the next mouseover of the same anchor", () => evaluate(`!__o.tipShown()`));
  const away = await evaluate(`(() => { const r = __o.$("default-status").getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; })()`);
  await mouse("mouseMoved", away.x, away.y);
  await sleep(60);
  await mouse("mouseMoved", td.x, td.y);
  await sleep(80);
  await check("...it returns when the pointer leaves and comes back", () => evaluate(`__o.tipShown()`));
  await key("Escape");
  await key("Escape");
  await check("the first Escape takes the tip, the second the dialog", () => evaluate(`!__o.$("dlg-default").open`));
  await reset();
  // A panel left `display: grid` inside a dialog that has since closed (hovered, not focused, so no
  // focusout ever hid it): it has no box, and the Escape guard must see that, or it swallows the
  // next Escape on the page. Focus stays on <body> throughout — any focus move would hide the panel
  // and hand this check a pass it did not earn.
  await evaluate(`(() => { window.__escapes = 0;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.__escapes += 1; });
    const d = __o.$("dlg-default"); d.append(__o.tip()); __o.tip().style.display = "grid"; })(); null`);
  await key("Escape");
  await check("a tip left inside a dialog that has since closed does not swallow the next Escape",
    () => evaluate(`window.__escapes === 1 && document.activeElement === document.body`));

  section("tooltip — suppression, and a tip that repeats the name (X4)");
  await reset();
  await centre("row-app");
  await evaluate(`${T("row-app")}.focus(); null`);
  await key("F10", { shift: true });
  const tc2 = await centre("tip-card");
  await mouse("mouseMoved", tc2.x, tc2.y);
  await sleep(80);
  await check("no tip while a list is open (the context menu is a .select-panel)", () => evaluate(`!!__o.menu() && !__o.tipShown()`));
  await key("Escape");
  await reset();
  await evaluate(`${T("tip-popup")}.setAttribute("aria-expanded", "true"); null`);
  const tp = await centre("tip-popup");
  await mouse("mouseMoved", tp.x, tp.y);
  await sleep(80);
  const whileOpen = await evaluate("__o.tipShown()");
  await mouse("mouseMoved", 2, 2);
  await evaluate(`${T("tip-popup")}.setAttribute("aria-expanded", "false"); null`);
  await mouse("mouseMoved", tp.x, tp.y);
  await sleep(80);
  const whenClosed = await evaluate("__o.tipShown()");
  await evaluate(`${T("tip-popup")}.setAttribute("aria-expanded", "true"); null`);
  await sleep(80);
  const afterFlip = await evaluate("__o.tipShown()");
  await evaluate(`${T("tip-popup")}.setAttribute("aria-expanded", "false"); null`);
  await check("no tip on a control whose own popup is open ([aria-haspopup][aria-expanded=true])", !whileOpen && whenClosed, { whileOpen, whenClosed });
  await check("...and a tip already showing goes when that popup opens", !afterFlip, { afterFlip });
  await reset();
  await evaluate(`(() => { const host = document.createElement("div"); host.id = "x4"; host.innerHTML =
    '<button type="button" id="x4-same" aria-label="refresh catalog" data-tip="refresh catalog">r</button>' +
    '<button type="button" id="x4-text" data-tip=" Refresh   now">refresh now</button>' +
    '<button type="button" id="x4-diff" aria-label="download the log" data-tip="the last 1 000 lines">d</button>' +
    '<span id="x4-lb">reload the plan</span>' +
    '<button type="button" id="x4-lbl" aria-labelledby="x4-lb" aria-label="refresh" data-tip="reload the plan">r</button>' +
    '<button type="button" id="x4-lbl-diff" aria-labelledby="x4-lb" aria-label="refresh" data-tip="refresh">r</button>' +
    '<label for="x4-input">search the log</label><input id="x4-input" data-tip="Search the log">' +
    '<button type="button" id="x4-img" data-tip="refresh"><img alt="refresh" width="8" height="8" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></button>' +
    '<button type="button" id="x4-hidden" data-tip="save">save<span style="display: none"> draft</span><span aria-hidden="true"> ✓</span></button>' +
    '<button type="button" id="x4-punct" aria-label="Refresh catalog." data-tip="refresh catalog">r</button>';
    document.querySelector("main").prepend(host); })()`);
  const x4 = {};
  for (const id of ["x4-same", "x4-text", "x4-diff", "x4-lbl", "x4-lbl-diff", "x4-input", "x4-img", "x4-hidden", "x4-punct"]) {
    await evaluate(`document.getElementById("${id}").focus(); null`);
    await sleep(40);
    x4[id] = { attr: await evaluate(`document.getElementById("${id}").getAttribute("aria-describedby")`), shown: await evaluate("__o.tipShown()"), ax: await axOf(`#${id}`) };
  }
  await evaluate(`document.getElementById("x4").remove(); null`);
  await check("a tip equal to the aria-label is shown but not wired as a description (no name read twice)",
    x4["x4-same"].attr === null && x4["x4-same"].shown && x4["x4-same"].ax.name === "refresh catalog" && x4["x4-same"].ax.description === "", x4["x4-same"]);
  await check("...nor one equal to the element's own text, case and spacing aside", x4["x4-text"].attr === null && x4["x4-text"].ax.description === "", x4["x4-text"]);
  await check("a tip that says something else IS the description", x4["x4-diff"].attr === "ddtip" && x4["x4-diff"].ax.description === "the last 1 000 lines", x4["x4-diff"]);
  const named = (id) => x4[id].attr === null && x4[id].shown;
  await check("the name is accname's: aria-labelledby before aria-label — a tip equal to the labelledby text is not a description",
    named("x4-lbl") && x4["x4-lbl"].ax.name === "reload the plan", x4["x4-lbl"]);
  await check("...and a tip equal to the aria-label a labelledby overrides IS one", x4["x4-lbl-diff"].attr === "ddtip", x4["x4-lbl-diff"]);
  await check("...a <label for> names an input, an <img alt> names its button, hidden children and trailing punctuation do not count",
    named("x4-input") && named("x4-img") && named("x4-hidden") && named("x4-punct"),
    { input: x4["x4-input"], img: x4["x4-img"], hidden: x4["x4-hidden"], punct: x4["x4-punct"] });
  // A description the page already wrote survives the tip: the tip is one token of the list.
  await reset();
  const errAt = await evaluate(`(() => { const host = document.createElement("p"); host.id = "x4-err-host";
    host.innerHTML = '<button type="button" id="x4-err" aria-describedby="x4-err-msg" data-tip="checked every 5 minutes">run</button> <span id="x4-err-msg">the last run failed</span>';
    document.querySelector("main").prepend(host); const b = document.getElementById("x4-err"); b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await mouse("mouseMoved", errAt.x, errAt.y);
  await sleep(60);
  const errWhile = await evaluate(`({ attr: document.getElementById("x4-err").getAttribute("aria-describedby"), shown: __o.tipShown() })`);
  await mouse("mouseMoved", 2, 2);
  await sleep(60);
  const errAfter = await evaluate(`document.getElementById("x4-err").getAttribute("aria-describedby")`);
  await evaluate(`document.getElementById("x4-err-host").remove(); null`);
  await check("a description the page wrote survives the tip: both ids while it shows, exactly the page's once it goes",
    errWhile.shown && errWhile.attr === "x4-err-msg ddtip" && errAfter === "x4-err-msg", { errWhile, errAfter });

  /* ── the context menu ──────────────────────────────────────────────────────────────────────── */
  section("context menu — the keyboard (page code on attachMenuKeys + positionPopup)");
  await reset();
  await centre("row-app");
  await evaluate(`${T("row-app")}.focus(); null`);
  await key("F10", { shift: true });
  const opened = await evaluate(`(() => { const m = __o.menu(); if (!m) return null; const r = m.getBoundingClientRect(), row = __o.rect("row-app"), s = getComputedStyle(m);
    return { parent: m.parentElement === document.body, role: m.getAttribute("role"), label: m.getAttribute("aria-label"), active: __o.active(),
      top: r.top, rowBottom: row.b, left: r.left, rowLeft: row.x, w: r.width, position: s.position, z: s.zIndex }; })()`);
  await check("Shift+F10 on a focused row opens the menu on <body>, a named role=menu",
    !!opened && opened.parent && opened.role === "menu" && opened.label === "actions for src/app.ts", opened);
  await check("...under the row, focus on its first item", !!opened && Math.abs(opened.top - opened.rowBottom - 4) < 1.5 && Math.abs(opened.left - opened.rowLeft) < 1.5 && opened.active === "open in editor", opened);
  await check("...fixed, above the page's own popups (z 60), and 12-20rem wide whoever placed it",
    !!opened && opened.position === "fixed" && opened.z === "60" && opened.w >= 192 && opened.w <= 322, opened);
  const rowTipAt = await evaluate(`(() => { const r = __o.menu().querySelector('[data-action="reveal"]').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; })()`);
  await mouse("mouseMoved", rowTipAt.x, rowTipAt.y);
  await sleep(60);
  const rowTip = await evaluate(`({ shown: __o.tipShown(), text: __o.tip().textContent })`);
  await mouse("mouseMoved", 2, 2);
  await sleep(40);
  await check("a row of the open list shows its own tip — only what is outside the list waits", rowTip.shown && rowTip.text.includes("opens the folder"), rowTip);
  const stated = await evaluate(`(() => { const b = __o.menu().querySelector('[aria-disabled="true"]'), s = getComputedStyle(b);
    return { ws: s.whiteSpace, muted: __o.same(s.color, __o.resolve("var(--muted-foreground)")), lines: Math.round(b.getBoundingClientRect().height / parseFloat(s.lineHeight || 15)) }; })()`);
  await check("a row that states something wraps, in --muted-foreground", stated.ws === "normal" && stated.muted && stated.lines >= 2, stated);
  const walkMenu = [];
  for (const k of ["ArrowDown", "ArrowUp", "ArrowUp", "Home", "End", "c", "n"]) {
    if (k === "n") await sleep(750); // past the 700ms typeahead window, so "n" starts a new search
    await key(k);
    walkMenu.push(await evaluate("__o.active()"));
  }
  await check("arrows move and wrap, Home/End jump, typing finds an item — the stated row included",
    walkMenu.slice(0, 6).join(" | ") === "reveal in finder | open in editor | delete | open in editor | delete | copy path"
      && walkMenu[6].startsWith("no history"), walkMenu);
  const before = await evaluate(`${T("result")}.textContent`);
  await key("Enter");
  await check("Enter on the stated row does nothing: still open, nothing run", () => evaluate(`!!__o.menu() && ${T("result")}.textContent === ${JSON.stringify(before)}`));
  await key("ArrowUp");
  await key("Enter");
  await check("Enter runs an item, closes the menu and hands focus back to the row",
    () => evaluate(`!__o.menu() && ${T("result")}.textContent === "copy · src/app.ts" && document.activeElement === __o.$("row-app")`));
  await key("F10", { shift: true });
  await key("Escape");
  await check("Escape closes it back to the row", () => evaluate(`!__o.menu() && document.activeElement === __o.$("row-app")`));
  await key("F10", { shift: true });
  await key("Tab");
  await check("Tab closes it and moves on from the row", () => evaluate(`!__o.menu() && __o.active() === "src/index.css"`));
  await evaluate(`${T("row-app")}.focus(); null`);
  await key("ContextMenu");
  await check("the Menu key opens it too", () => evaluate(`!!__o.menu() && __o.active() === "open in editor"`));
  await key("Escape");
  const rr = await evaluate(`(() => { const r = __o.rect("row-readme"); return { x: Math.round(r.x + 40), y: Math.round(r.y + 6) }; })()`);
  await click(rr.x, rr.y, "right");
  const atPointer = await evaluate(`(() => { const m = __o.menu(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: r.left, top: r.top, label: m.getAttribute("aria-label"), active: __o.active() }; })()`);
  await check("a right-click opens it at the pointer, focus on the first item",
    !!atPointer && Math.abs(atPointer.left - rr.x) < 1.5 && Math.abs(atPointer.top - rr.y - 4) < 1.5 && atPointer.label === "actions for README.md" && atPointer.active === "open in editor", { atPointer, rr });
  await click(1265, 450);
  await sleep(40);
  await check("a press on nothing closes it, and focus goes back to the row", () => evaluate(`!__o.menu() && document.activeElement === __o.$("row-readme")`));
  await click(rr.x, rr.y, "right");
  await clickT("after-rows");
  await sleep(40);
  await check("a press on another control closes it and leaves focus there", () => evaluate(`!__o.menu() && document.activeElement === __o.$("after-rows")`));
  await reset();
  await clickT("open-ctx");
  await evaluate(`${T("row-in-dialog")}.focus(); null`);
  await key("F10", { shift: true });
  await check("inside a modal dialog the menu goes into the dialog (on <body> it would be under the top layer)",
    () => evaluate(`!!__o.menu() && __o.menu().parentElement === __o.$("dlg-ctx")`));
  await key("Escape");
  await check("...and its Escape closes the menu, not the dialog", () => evaluate(`!__o.menu() && __o.$("dlg-ctx").open && document.activeElement === __o.$("row-in-dialog")`));

  /* ── the zoom view ─────────────────────────────────────────────────────────────────────────── */
  section("zoom view");
  await reset();
  const openers = await evaluate(`["dgm-background", "dgm-figure", "dgm-canvas"].map((t) => { const n = __o.$(t);
    return [n.getAttribute("role"), n.tabIndex, n.classList.contains("dgm-zoomable"), n.getAttribute("aria-label")].join("|"); })`);
  await check("every opener is a button named by what it opens",
    openers.join(" ; ") === "button|0|true|zoom: request flow ; button|0|true|zoom: network map ; button|0|true|zoom diagram", openers);
  await centre("dgm-figure");
  await evaluate(`${T("dgm-figure")}.focus(); null`);
  await key("Enter");
  await sleep(120);
  const view = await evaluate(`(() => { const v = document.querySelector("dialog.dgm-overlay"), s = getComputedStyle(v), r = v.getBoundingClientRect();
    return { modal: v.matches(":modal"), label: v.getAttribute("aria-label"), focus: document.activeElement === v, box: [r.left, r.top, r.width, r.height].join(","),
      frame: [s.paddingTop, s.marginTop, s.borderTopWidth].join(" "), backdrop: getComputedStyle(v, "::backdrop").backgroundColor,
      bar: [...v.querySelectorAll(".dgm-bar button")].map((b) => (b.classList.contains("btn-icon") ? "icon:" + b.dataset.icon + ":" + b.getAttribute("aria-label") : b.className === "btn-terminal btn-terminal--ghost btn-terminal--compact" ? "ghost" : "?")).join(" "),
      locked: getComputedStyle(document.documentElement).overflow }; })()`);
  await check("Enter opens the view as a modal <dialog> named like its opener, focus on the view",
    view.modal && view.label === "zoom: network map" && view.focus, view);
  await check("...covering the viewport with no frame and nothing painted behind it",
    view.box === "0,0,1280,900" && view.frame === "0px 0px 0px" && view.backdrop === "rgba(0, 0, 0, 0)", view);
  await check("...its bar the system's: three compact ghost buttons and the dialog's X, and the page is locked",
    view.bar === "ghost ghost ghost icon:x:close" && view.locked === "hidden", view);
  const onArt = await evaluate(`(() => { const r = document.querySelector(".dgm-art > img").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await click(onArt.x, onArt.y);
  await check("a click on the picture itself does not close the view (capture retargets its end to the stage)",
    () => evaluate(`document.querySelector("dialog.dgm-overlay").open`));
  const scaleOf = () => evaluate(`Number(/scale\\(([\\d.]+)\\)/.exec(document.querySelector(".dgm-art").style.transform)?.[1] ?? NaN)`);
  const fitted = await scaleOf();
  await key("+");
  const zoomedIn = await scaleOf();
  await key("-"); await key("-");
  const zoomedOut = await scaleOf();
  await key("0");
  const refit = await scaleOf();
  await check("+ zooms in, - out, 0 fits again", zoomedIn > fitted && zoomedOut < zoomedIn && Math.abs(refit - fitted) < 1e-6, { fitted, zoomedIn, zoomedOut, refit });
  const zoomWalk = [];
  for (let i = 0; i < 6; i += 1) { await key("Tab"); zoomWalk.push(await evaluate(`(() => { const a = document.activeElement; return a === document.body ? "BODY" : document.querySelector("dialog.dgm-overlay").contains(a) ? "in" : "OUT"; })()`)); }
  await check("Tab stays in the view", zoomWalk.every((w) => w !== "OUT") && zoomWalk.includes("in"), zoomWalk);
  const art = await evaluate(`(() => { const r = document.querySelector(".dgm-art").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const translateOf = () => evaluate(`(() => { const m = /translate\\(([-\\d.]+)px, ([-\\d.]+)px\\)/.exec(document.querySelector(".dgm-art").style.transform); return m ? [Number(m[1]), Number(m[2])] : null; })()`);
  const beforePan = await translateOf();
  await drag(art.x, art.y, art.x + 120, art.y + 60);
  const afterPan = await translateOf();
  await check("a drag on the image pans it by the whole drag — not hijacked by the browser's own image drag",
    !!beforePan && !!afterPan && Math.abs(afterPan[0] - beforePan[0] - 120) < 2 && Math.abs(afterPan[1] - beforePan[1] - 60) < 2, { beforePan, afterPan });
  await check("...and the click that ends the pan does NOT close the view (0.59.0 closed it after every pan)",
    () => evaluate(`document.querySelector("dialog.dgm-overlay").open`));
  await drag(20, 880, 120, 830);
  await check("...nor does one that begins on the empty stage (a pan by the background is still a pan)",
    () => evaluate(`document.querySelector("dialog.dgm-overlay").open`));
  const beforeKeys = await translateOf();
  await key("ArrowRight");
  await key("ArrowDown");
  const afterKeys = await translateOf();
  await check("the arrow keys pan it, 40px a press",
    !!beforeKeys && !!afterKeys && Math.abs(afterKeys[0] - beforeKeys[0] + 40) < 0.5 && Math.abs(afterKeys[1] - beforeKeys[1] + 40) < 0.5, { beforeKeys, afterKeys });
  await click(20, 880);
  await check("a click on the empty stage closes it, and focus goes back to the opener",
    () => evaluate(`!document.querySelector("dialog.dgm-overlay").open && document.activeElement === __o.$("dgm-figure")`));
  await key("Enter");
  await sleep(120);
  await key("Escape");
  await check("Escape closes it, focus back on the opener", () => evaluate(`!document.querySelector("dialog.dgm-overlay").open && document.activeElement === __o.$("dgm-figure")`));
  await evaluate(`${T("dgm-canvas")}.focus(); null`);
  await key("Enter");
  await sleep(120);
  await check("a <canvas> opens with its picture (it used to clone empty)",
    () => evaluate(`(() => { const c = document.querySelector(".dgm-art canvas"); return !!c && c.getContext("2d").getImageData(40, 40, 1, 1).data[3] === 255; })()`));
  await key("Escape");
  await evaluate(`(() => { const d = document.createElement("div"); d.id = "fx-authored"; d.className = "dgm-zoomable"; d.setAttribute("aria-label", "zoom: the pipeline");
    d.innerHTML = '<svg viewBox="0 0 10 10" width="100" height="100"><rect width="10" height="10"/></svg>'; document.querySelector("main").append(d); })(); null`);
  await evaluate(`(async () => { const m = await import("/runtime/diagramzoom.js"); m.initDiagramZoom("#fx-authored"); })()`);
  const authored = await evaluate(`(() => { const d = document.getElementById("fx-authored"); return [d.getAttribute("role"), d.tabIndex, d.getAttribute("aria-label")].join("|"); })()`);
  await evaluate(`document.getElementById("fx-authored").focus(); null`);
  await key("Enter");
  await sleep(120);
  const authoredView = await evaluate(`[...document.querySelectorAll("dialog.dgm-overlay")].find((v) => v.open)?.getAttribute("aria-label") ?? null`);
  await key("Escape");
  await evaluate(`document.getElementById("fx-authored").remove(); null`);
  await check("an opener the author already marked .dgm-zoomable is wired too, and keeps the name the author gave it",
    authored === "button|0|zoom: the pipeline" && authoredView === "zoom: the pipeline", { authored, authoredView });

  /* TOUCH, as raw CDP touch points on a phone-sized page with a coarse pointer. The stage is
     `touch-action: none`, so the browser's own pinch never happens there: the view does its own. */
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await load();
  await evaluate(`${T("dgm-figure")}.click(); null`);
  await sleep(200);
  const coarse = await evaluate(`({ coarse: matchMedia("(pointer: coarse)").matches, bar: [...document.querySelectorAll("dialog.dgm-overlay .dgm-bar button:not(.btn-icon)")].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }) })`);
  await check("under a coarse pointer the bar's zoom out, fit and zoom in are 44x44 at least",
    coarse.coarse && coarse.bar.length === 3 && coarse.bar.every((wh) => wh.split("x").every((v) => Number(v) >= 44)), coarse);
  const artState = `(() => { const s = document.querySelector(".dgm-stage").getBoundingClientRect(), a = document.querySelector(".dgm-art").getBoundingClientRect();
    const mx = s.left + s.width / 2, my = s.top + s.height / 2, m = /scale\\(([\\d.]+)\\)/.exec(document.querySelector(".dgm-art").style.transform);
    return { mx, my, fx: (mx - a.left) / a.width, fy: (my - a.top) / a.height, scale: Number(m?.[1] ?? NaN), open: document.querySelector("dialog.dgm-overlay").open }; })()`;
  const beforePinch = await evaluate(artState);
  const fingers = (d) => [{ x: beforePinch.mx - d, y: beforePinch.my, id: 1 }, { x: beforePinch.mx + d, y: beforePinch.my, id: 2 }];
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(40) });
  for (let d = 46; d <= 100; d += 6) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(d) }); await sleep(16); }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(120);
  const afterPinch = await evaluate(artState);
  const pinchRatio = afterPinch.scale / beforePinch.scale;
  await check("two fingers spread 80px -> 200px apart zoom it x2.5, about their midpoint, and it stays open",
    Math.abs(pinchRatio - 2.5) < 0.1 && Math.abs(afterPinch.fx - beforePinch.fx) < 0.02 && Math.abs(afterPinch.fy - beforePinch.fy) < 0.02 && afterPinch.open,
    { pinchRatio, beforePinch, afterPinch });
  const beforeSwipe = await translateOf();
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: beforePinch.mx, y: beforePinch.my, id: 3 }] });
  for (let d = 10; d <= 80; d += 10) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: beforePinch.mx + d, y: beforePinch.my, id: 3 }] }); await sleep(16); }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(120);
  const afterSwipe = await translateOf();
  await check("one finger pans it by the whole drag, and lifting it does not close the view",
    !!beforeSwipe && !!afterSwipe && Math.abs(afterSwipe[0] - beforeSwipe[0] - 80) < 2 && await evaluate(`document.querySelector("dialog.dgm-overlay").open`), { beforeSwipe, afterSwipe });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ── a tokens-only page ────────────────────────────────────────────────────────────────────── */
  section("tokens + overlays.css + tooltip.css alone (?bare): the same box and face as with everything loaded (X2)");
  const snapshot = `(async () => {
    const pick = (s, props) => props.map((p) => p + "=" + s.getPropertyValue(p)).join("; ");
    const out = {};
    const d = __o.$("dlg-rich"); d.showModal();
    out.dialog = pick(getComputedStyle(d), ["box-sizing", "padding-top", "inline-size", "max-block-size", "border-top-width", "border-top-style", "border-top-color", "background-color", "color", "box-shadow", "overflow-x", "font-family", "font-size", "line-height", "display", "flex-direction"]);
    out.head = pick(getComputedStyle(d.querySelector(".dialog-head")), ["display", "align-items", "column-gap", "padding-top", "padding-left", "border-bottom-width", "border-bottom-color"]);
    out.title = pick(getComputedStyle(d.querySelector(".dialog-title")), ["font-family", "font-size", "font-weight", "line-height", "white-space", "text-overflow", "margin-top"]);
    out.toolbar = pick(getComputedStyle(d.querySelector(".dialog-toolbar")), ["display", "flex-wrap", "column-gap", "padding-top", "padding-left", "border-bottom-width"]);
    out.body = pick(getComputedStyle(d.querySelector(".dialog-body")), ["overflow-y", "flex-grow", "min-height", "padding-top", "padding-left"]);
    out.foot = pick(getComputedStyle(d.querySelector(".dialog-foot")), ["margin-top", "padding-top", "padding-left", "border-top-width", "border-top-color"]);
    d.close();
    const t = __o.tip(); t.style.display = "grid";
    out.tip = pick(getComputedStyle(t), ["background-color", "color", "border-top-width", "border-top-color", "padding-top", "padding-left", "max-width", "font-family", "font-size", "box-shadow", "row-gap"]);
    t.style.display = "none";
    return out; })()`;
  const full = await evaluate(snapshot);
  await load("?bare");
  const bare = await evaluate(snapshot);
  const differs = Object.keys(full).filter((k) => full[k] !== bare[k]).map((k) => ({ part: k, full: full[k], bare: bare[k] }));
  await check("with base.css, components.css and chrome.css gone the dialog, its parts and the tip compute the same — font included",
    differs.length === 0, differs);
  // The demo page sets a mono body itself (as a tokens-only surface does), so the snapshot above
  // cannot tell a dialog that declares its face from one that inherits it. A host page that says
  // otherwise can: serif at 20px on <body>, and the overlays must still be mono at --fs-base.
  const ownFont = await evaluate(`(() => {
    document.body.style.fontFamily = "serif"; document.body.style.fontSize = "20px";
    const d = __o.$("dlg-default"); d.showModal();
    const t = __o.tip(); t.style.display = "grid";
    const read = (n) => { const s = getComputedStyle(n); return /JetBrains Mono/.test(s.fontFamily) && s.fontSize === "12px"; };
    const out = { dialog: read(d), title: read(d.querySelector(".dialog-title")) || getComputedStyle(d.querySelector(".dialog-title")).fontSize === "18px", tip: read(t) };
    t.style.display = "none"; d.close();
    document.body.style.fontFamily = ""; document.body.style.fontSize = "";
    return out; })()`);
  await check("on a host page whose body is serif 20px, the dialog and the tip are still mono at --fs-base (their own declarations)",
    ownFont.dialog && ownFont.title && ownFont.tip, ownFont);
  await check("the page really is bare (no base.css, no components.css)",
    () => evaluate(`![...document.styleSheets].some((s) => /\\/(base|components|chrome)\\.css$/.test(s.href || ""))`));

  /* ── the footer against controls.css loaded AFTER overlays.css ── */
  section("the dialog footer against controls.css loaded after overlays.css");
  await send("Page.navigate", { url: `${BASE}/harness/foot-order` });
  await sleep(300);
  const foot = await evaluate(`(() => { const s = getComputedStyle(document.getElementById("foot"));
    return { margin: s.marginTop, padding: s.paddingTop + " " + s.paddingLeft, border: s.borderTopWidth, display: s.display }; })()`);
  console.log(`NOTE  controls.css in the harness: ${realControls ? "src/controls.css" : "WP5's .form-actions rules, copied (no src/controls.css in this tree)"}`);
  await check("the footer keeps margin 0 and its own inset when .form-actions / --ruled load after it",
    foot.margin === "0px" && foot.padding === "12px 24px" && foot.border === "1px" && foot.display === "flex", foot);

  /* ── contrast ──────────────────────────────────────────────────────────────────────────────── */
  section("contrast — every new pairing, four themes x three surfaces");
  await load();
  const PAIRS = `(() => {
    const { parse, over, ratio, resolve } = __o;
    const tok = (name) => parse(resolve("var(" + name + ")"));
    const surfaces = ["--background", "--card", "--muted"];
    const card = tok("--card"), popover = tok("--popover"), backdrop = parse(resolve("var(--backdrop)", "background-color"));
    const edge = parse(resolve("var(--control-edge)"));
    const r = (fg, bg) => Math.round(ratio(over(fg, bg), bg) * 100) / 100;
    const each = (fn) => Object.fromEntries(surfaces.map((s) => [s.slice(2), Math.round(fn(tok(s)) * 100) / 100]));
    const flat = (v) => ({ background: v, card: v, muted: v });
    return [
      ["text", "dialog text and title: --foreground on --card", flat(r(tok("--foreground"), card))],
      ["text", ".form-status in the footer: --muted-foreground on --card", flat(r(tok("--muted-foreground"), card))],
      ["edge", "the X / back arrow glyph: --foreground on --card", flat(r(tok("--foreground"), card))],
      ["edge", "the X edge: --control-edge on --card", flat(r(edge, card))],
      ["edge", "the dialog (and drawer) stands off the scrimmed page — the better of its edge and its fill",
        each((s) => Math.max(ratio(over(edge, card), over(backdrop, s)), ratio(card, over(backdrop, s))))],
      ["info", "(its edge alone against the scrimmed page)", each((s) => ratio(over(edge, card), over(backdrop, s)))],
      ["edge", "the alert glyph: --destructive on --card", flat(r(tok("--destructive"), card))],
      ["edge", "focus ring on a dialog control: --ring on --card", flat(r(tok("--ring"), card))],
      ["text", "tooltip text: --popover-foreground on --popover", flat(r(tok("--popover-foreground"), popover))],
      ["text", "tooltip aside and key column: --muted-foreground on --popover", flat(r(tok("--muted-foreground"), popover))],
      ["edge", "tooltip and context-menu edge against the page", each((s) => ratio(over(edge, popover), s))],
      ["text", "context-menu stated row: --muted-foreground on --popover", flat(r(tok("--muted-foreground"), popover))],
      ["info", "(its --card fill alone against the scrimmed page)", each((s) => ratio(card, over(backdrop, s)))],
    ];
  })()`;
  const THEMES = ["warm", "green", "mono", "paper"];
  const table = new Map();
  for (const theme of THEMES) {
    await evaluate(`document.documentElement.dataset.theme = "${theme}"; null`);
    await sleep(40);
    for (const [kind, name, per] of await evaluate(PAIRS)) {
      const entry = table.get(name) || { kind, themes: {} };
      entry.themes[theme] = per;
      table.set(name, entry);
    }
  }
  for (const [name, { kind, themes }] of table) {
    if (kind === "info") continue;
    const floor = kind === "text" ? 4.5 : 3;
    const low = THEMES.flatMap((t) => Object.entries(themes[t]).filter(([, v]) => v < floor).map(([s, v]) => `${t}/${s} ${v}`));
    await check(`contrast >= ${floor}:1 on 4 themes x 3 surfaces — ${name}`, low.length === 0, low.join(", "));
  }
  console.log("\n| pairing | floor | warm | green | mono | paper |\n|---|---:|---|---|---|---|");
  for (const [name, { kind, themes }] of table) {
    const cell = (t) => { const v = Object.values(themes[t]); return new Set(v).size === 1 ? v[0].toFixed(2) : v.map((x) => x.toFixed(2)).join(" / "); };
    console.log(`| ${name} | ${kind === "text" ? "4.5" : kind === "edge" ? "3.0" : "—"} | ${THEMES.map(cell).join(" | ")} |`);
  }
} catch (error) {
  failures += 1;
  console.log(`FAIL  the suite threw after "${lastLabel}": ${error.message.split("\n")[0]}`);
}

console.log(failures
  ? `\n\x1b[31m-- check-overlays: ${failures} FAILED --\x1b[0m`
  : "\n\x1b[32m-- check-overlays: all checks passed --\x1b[0m");
shutdown();
process.exit(failures ? 1 : 0);
