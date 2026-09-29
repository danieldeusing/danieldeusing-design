#!/usr/bin/env node
/*
 * check-components.mjs — what components.css promises, asserted on examples/components.html.
 *
 * Every promise here can be broken by a page, a later release or a missing rule WITHOUT anything
 * erroring, so each is measured in a real browser, off the working tree:
 *
 *   HEIGHT  every single-line control is --control-h, rendered AND with its min-block-size floor
 *           removed — a floor only lifts, so a field whose own padding and line height overshoot
 *           (29.6px measured on the foundations branch) is invisible to a rendered-height check;
 *   FORCED  under forced colours, on BOTH palettes and all FOUR themes: every mask glyph paints at
 *           least 3:1 against what it sits on, every word on a state reads at 4.5:1 with the state's
 *           fill under it, every state differs from its neighbour, and a focused menu row's ring
 *           reaches 3:1, enabled or aria-disabled. All of it in PAINTED pixels (X1): a computed
 *           colour cannot see opacity, a Canvas backplate, or a glyph that kept its author colour
 *           (a .25 zoom hint and a .2 ✓ both passed the computed-colour version of this check).
 *           Every capture is taken inside the viewport with the scrollbars hidden, and a marker pass
 *           — the element painted magenta — proves each clip holds its own element before its ratio
 *           is believed. Rings are measured after REAL key presses: a forced :focus-visible paints
 *           no outline at all;
 *   HINT    the zoom hint reads at rest: 3:1 in painted pixels, on all four themes;
 *   CHOSEN  every chosen row shape (aria-selected, aria-checked, on either row class) draws its ✓;
 *   TONE    a fold's icon is its summary's colour, and an untoned fold does not take a container's
 *           tone (F7);
 *   FOCUS   each component draws its OWN 2px --ring focus ring. Asserted with base.css switched
 *           off: base.css draws a global ring that would answer for a component that lost its rule;
 *   FONT    a control renders in its surroundings' font, not the browser's 13.33px control font;
 *   HIDDEN  `hidden` hides every component, whatever `display` the component sets;
 *   STATES  disabled is .45 and does not answer the pointer, and neither does busy; busy is full
 *           strength and keeps focus; a popup whose first child is not a row lays its rows out flush;
 *   COARSE  under a coarse pointer every control is a 44px target: buttons, rows, summaries;
 *   MOTION  reduced motion stops the busy spinner and the cursor blink, and nothing else does;
 *   RADIUS  no corner on the page is rounded, except a circle;
 *   INVALID an invalid field says what is wrong in TEXT — every aria-invalid="true" in the demo and in
 *           the references' examples names a `.field-error` through aria-describedby (WCAG 1.4.1,
 *           3.3.1: the --destructive edge alone is colour only);
 *   SILENT  every `.ico`, in the demo and in the references' examples, is aria-hidden, and a menu's
 *           `.dropdown-label` names the role="group" it heads;
 *   REMOVED the classes 0.60.0 removed (§1.1) are not declared again, and the forced glyph rule and
 *           its `@supports not` fallback name the same selectors.
 *
 * The demo loads the real files and nothing standing in for them (check-integration.mjs fails a
 * demo that carries a stand-in).
 *
 * A real browser (layout, cascade and the forced-colours mode are the subject), served off the
 * working tree over loopback, debugging port 0 read back from DevToolsActivePort. No browser: it
 * SKIPS loudly, and fails under DD_REQUIRE_BROWSER=1.
 *
 *   node scripts/check-components.mjs
 *   DD_VERBOSE=1 node scripts/check-components.mjs    # also prints every forced-colours ratio
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, normalize, extname } from "node:path";
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
  console.log("check-components: SKIPPED — no headless chromium on this machine.");
  console.log("  Layout, the cascade and forced colours need a browser. `npx playwright install chromium`.");
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

const profile = mkdtempSync(join(tmpdir(), "dd-components-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: true });
let socket;
// The browser leads its own process group, so the whole group goes before its profile does.
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
const nodeOf = async (selector) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`nothing on the page matches ${selector}`);
  return nodeId;
};
const force = async (selector, states) => send("CSS.forcePseudoState", { nodeId: await nodeOf(selector), forcedPseudoClasses: states });
const KEYS = { ArrowDown: ["ArrowDown", 40], ArrowUp: ["ArrowUp", 38], Escape: ["Escape", 27], Tab: ["Tab", 9] };
const press = async (key) => {
  const [code, keyCode] = KEYS[key];
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
  await sleep(40); // `toggle` is dispatched asynchronously
};

// A PNG from captureScreenshot, decoded to RGB(A) bytes: 8-bit, non-interlaced, as Chromium writes it.
const decodePng = (base64) => {
  const buf = Buffer.from(base64, "base64");
  const idat = [];
  let width = 0, height = 0, bpp = 4;
  for (let pos = 8; pos < buf.length;) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bpp = data[9] === 6 ? 4 : 3; }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predict = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      px[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predict) & 255;
    }
  }
  const at = (x, y) => { const i = (y * width + x) * bpp; return [px[i], px[i + 1], px[i + 2]]; };
  return { width, height, at };
};
const lum = (c) => c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const near = (a, b, tolerance = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const MAGENTA = [255, 0, 255];
const isMagenta = ([r, g, b]) => r - g > 80 && b - g > 80;
const round2 = (n) => Math.round(n * 100) / 100;

let failures = 0;
let last = "(none yet)";
const check = (label, condition, detail) => {
  last = label;
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
};
// A throw inside a section is a FAIL that says where the suite got to, never a bare stack.
const section = async (name, body) => {
  console.log(`\n── ${name}`);
  try { await body(); } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}: threw after "${last}" — ${error.message.split("\n")[0]}`);
  }
};

/* ── SETUP ────────────────────────────────────────────────────────────────── */
await section("SETUP — the page loads, and the runtime has enhanced it", async () => {
  await send("Page.enable");
  await send("DOM.enable");
  await send("CSS.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/examples/components.html` });
  let ran = "";
  for (let i = 0; i < 50 && !ran; i += 1) {
    ran = await evaluate(`document.getElementById("height-check")?.dataset.result || ""`).catch(() => "");
    if (!ran) await sleep(100);
  }
  check("the page ran its own height check (the demo loaded and its script ran)", ran !== "", ran);
  // No transitions, so a forced :hover is not read mid-fade. No scrollbars for the whole run (X1): a
  // capture then lands where the layout was measured. `solid` switches every mask off, so a mask
  // glyph paints one flat block of its colour; `mark` is the marker pass's slot.
  await evaluate(`(() => {
    const add = (id, css, off) => { const s = document.createElement("style"); s.id = id; s.textContent = css; s.disabled = !!off; document.head.append(s); };
    add("no-motion", "*, *::before, *::after { transition: none !important; animation: none !important; }");
    add("no-scrollbars", "html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }");
    add("solid", "*, *::before, *::after { -webkit-mask: none !important; mask: none !important; }", true);
    add("mark", "");
    document.querySelector("#sel-model").closest(".select-field").querySelector(".select-trigger").id = "trigger-model";
    document.querySelector("select[disabled]").closest(".select-field").querySelector(".select-trigger").id = "trigger-disabled";
    window.token = (name, prop = "color") => { const p = document.createElement("i"); p.style[prop] = "var(" + name + ")"; document.body.append(p);
      const v = getComputedStyle(p)[prop]; p.remove(); return v; };
    window.cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo || null);
  })()`);
  // select.js places the panel it appends itself (position: fixed, inline): components.css gives
  // `.select-panel` no position, so a framework app can place its own listbox.
  const placed = await evaluate(`(() => {
    const trigger = document.getElementById("trigger-model"); trigger.click();
    const panel = [...document.body.children].find((n) => n.matches(".select-panel"));
    const inline = panel ? panel.style.position : "(no panel opened)"; trigger.click();
    return inline;
  })()`);
  check("select.js places the panel it appends (position: fixed, inline)", placed === "fixed", placed);
});
if (failures) {
  console.log(`\ncheck-components: ${failures} FAILED — the page did not come up, so nothing after the setup was run`);
  shutdown();
  process.exit(1);
}

/* ── HEIGHT ───────────────────────────────────────────────────────────────── */
const MEASURE = `(() => {
  const probe = document.createElement("div"); probe.style.blockSize = "var(--control-h)"; document.body.appendChild(probe);
  const want = probe.getBoundingClientRect().height; probe.remove();
  const named = { "text field": "#in-text", "search field": "#in-search", "number field": "#in-number",
    "date field": 'input[type="date"]', "field with no type": "#in-notype", "compact ghost": "#btn-ghost",
    "compact primary": "#btn-primary-compact", "bin": "#btn-bin", "pencil": "#btn-edit", "select trigger": "#trigger-model" };
  const out = {};
  const measure = (el) => { const r = el.getBoundingClientRect().height; const keep = el.style.minBlockSize;
    el.style.minBlockSize = "0px"; const n = el.getBoundingClientRect().height; el.style.minBlockSize = keep; return [r, n]; };
  for (const [name, sel] of Object.entries(named)) out[name] = measure(document.querySelector(sel));
  return { want, out };
})()`;
const exact = (v, want) => Math.abs(v - want) <= 1 / 32; // Chrome lays out in 1/64px units

await section("HEIGHT — one control height, and the box is the token", async () => {
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
  await evaluate(`document.documentElement.style.fontSize = ""; null`);
});

/* ── pixels: capture, clip proof, and the three measurements ─────────────── */
const setStyle = (id, css) => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent = ${JSON.stringify(css)}; null`);
const toggle = (id, on) => evaluate(`document.getElementById(${JSON.stringify(id)}).disabled = ${!on}; null`);
const reveal = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) throw new Error("nothing on the page matches " + ${JSON.stringify(selector)});
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }); })()`);

// In VIEWPORT coordinates, taken inside the viewport: captureBeyondViewport re-lays the page and a
// clip measured before it lands up to ~7.5px off (X1).
// Two animation frames first: a capture straight after a scroll, a style switch or a DOM change
// can read a frame painted before it (measured: a highlighted row read as a Canvas backplate about
// one run in eight, while the fill beside it read Highlight).
const capture = async (clip) => {
  const [sx, sy] = await evaluate("new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok([scrollX, scrollY]))))");
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
    clip: { x: clip.x + sx, y: clip.y + sy, width: clip.width, height: clip.height, scale: 1 } });
  return decodePng(data);
};
// The border box of an element or of one of its pseudo-elements, in viewport coordinates.
const boxOf = async (selector, pseudo) => {
  const { root: doc } = await send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`nothing on the page matches ${selector}`);
  let node = { nodeId };
  if (pseudo) {
    const { node: described } = await send("DOM.describeNode", { nodeId, depth: 1 });
    const generated = (described.pseudoElements || []).find((p) => p.pseudoType === pseudo);
    if (!generated) return null;
    node = { backendNodeId: generated.backendNodeId };
  }
  try {
    const { model } = await send("DOM.getBoxModel", node);
    const q = model.border;
    return { x: q[0], y: q[1], width: q[2] - q[0], height: q[5] - q[1] };
  } catch { return null; }
};
const modeOf = (pixels) => {
  const counts = new Map();
  for (const p of pixels) counts.set(p.join(), (counts.get(p.join()) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
};
const PAD = 3;
const clipAround = (box) => {
  const x = Math.floor(box.x) - PAD, y = Math.floor(box.y) - PAD;
  return { x, y, width: Math.ceil(box.x + box.width) + PAD - x, height: Math.ceil(box.y + box.height) + PAD - y };
};

/*
 * A GLYPH: the colour it paints against what it sits on. With `solid` on, a mask glyph paints one
 * flat block, so the pixels down its middle column ARE its colour, whatever the mask's shape. The
 * surroundings are four pixels 2px outside its box, one per side, and the ratio is against the
 * worst of them. The marker pass paints the glyph magenta first: the middle column must turn
 * magenta and none of the four surroundings may, or the clip is not on the glyph and the ratio
 * would describe something else.
 */
const glyph = async (selector, pseudo) => {
  await reveal(selector);
  const box = await boxOf(selector, pseudo);
  if (!box || box.width < 1 || box.height < 1) return { drawn: false };
  const clip = clipAround(box);
  const cx = Math.floor(box.x + box.width / 2) - clip.x;
  const cy = Math.floor(box.y + box.height / 2) - clip.y;
  const column = [];
  for (let y = Math.floor(box.y) - clip.y; y < Math.ceil(box.y + box.height) - clip.y; y += 1) column.push(y);
  const around = (img) => [img.at(1, cy), img.at(clip.width - 2, cy), img.at(cx, 1), img.at(cx, clip.height - 2)];
  const rule = `${selector}${pseudo ? `::${pseudo}` : ""}`;
  await setStyle("mark", `${rule} { background: rgb(255 0 255) !important; color: rgb(255 0 255) !important;
    border-color: rgb(255 0 255) !important; forced-color-adjust: none !important; opacity: 1 !important; }`);
  const marked = await capture(clip);
  await setStyle("mark", "");
  const aligned = column.some((y) => isMagenta(marked.at(cx, y))) && around(marked).every((p) => !isMagenta(p));
  const img = await capture(clip);
  const under = around(img);
  let best = { ratio: 0, ink: null };
  for (const y of column) {
    const ink = img.at(cx, y);
    const ratio = Math.min(...under.map((u) => contrast(ink, u)));
    if (ratio > best.ratio) best = { ratio, ink };
  }
  // The colour it paints most: the page's scanline overlay darkens every third row a little, so the
  // single most-contrasting pixel is not the colour to compare with another element's.
  return { drawn: true, aligned, ratio: round2(best.ratio), ink: best.ink, under: under[0], mode: modeOf(column.map((y) => img.at(cx, y))) };
};

/*
 * A WORD ON A STATE: the text's ink against the colour that is actually under it. The dominant
 * colour of the text's own box is what the letters sit on; it must be the STATE's fill (sampled in
 * the row's padding), or the mode painted a Canvas backplate over the state and the word sits on
 * that instead — which a ratio against the row's fill would miss. The ratio is taken in the DRAWN
 * shot, over the word's tight text box.
 *
 * OWNERSHIP IS A TWO-SHOT DIFF: the same clip again with only the word hidden — its text wrapped
 * in a `visibility: hidden` span, so `forced-color-adjust` is never touched and the backplate goes
 * with the word. At least 3 pixels must change, and changed pixels must reach within 3px of BOTH
 * ends of the box: a clip slid 8px along the word still changed pixels, only not at the far end.
 * (Hiding a word by switching it to `none` would drop its backplate too, and a word painted in
 * the row's own colour then passed at 21:1 — measured in WP12.)
 */
const words = async (textSel, rowSel = textSel, pseudoState = null) => {
  await reveal(rowSel);
  if (pseudoState) await force(rowSel, pseudoState);
  const r = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(textSel)}), row = document.querySelector(${JSON.stringify(rowSel)});
    const range = document.createRange(); range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    const l = Math.min(...rects.map((q) => q.left)), t = Math.min(...rects.map((q) => q.top));
    const rr = Math.max(...rects.map((q) => q.right)), b = Math.max(...rects.map((q) => q.bottom));
    const e = row.getBoundingClientRect();
    return { x: l, y: t, width: rr - l, height: b - t, rowX: e.left, rowY: e.top };
  })()`);
  const clip = { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
  const img = await capture(clip);
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(textSel)});
    for (const n of [...el.childNodes]) if (n.nodeType === 3 && n.textContent.trim()) {
      const hide = document.createElement("span"); hide.dataset.xHidden = ""; hide.style.visibility = "hidden"; n.replaceWith(hide); hide.append(n); } })()`);
  const hidden = await capture(clip);
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(textSel)});
    for (const hide of el.querySelectorAll("[data-x-hidden]")) hide.replaceWith(...hide.childNodes); el.normalize(); })()`);
  const changedIn = (x) => Array.from({ length: img.height }, (_, y) => !near(img.at(x, y), hidden.at(x, y), 8)).filter(Boolean).length;
  const perColumn = Array.from({ length: img.width }, (_, x) => changedIn(x));
  const ends = [0, 1, 2];
  const aligned = perColumn.reduce((a, b) => a + b, 0) >= 3
    && ends.some((d) => perColumn[d] > 0) && ends.some((d) => perColumn[img.width - 1 - d] > 0);
  const fill = (await capture({ x: Math.floor(r.rowX) + 4, y: Math.floor(r.rowY) + 4, width: 1, height: 1 })).at(0, 0);
  if (pseudoState) await force(rowSel, []);
  const counts = new Map();
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const key = img.at(x, y).join(); counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
  let ink = dominant, best = 1;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const ratio = contrast(img.at(x, y), dominant);
    if (ratio > best) { best = ratio; ink = img.at(x, y); }
  }
  return { aligned, ratio: round2(best), ink, dominant, fill, onFill: near(dominant, fill) };
};

/* A FOCUS RING on the focused element: the inset ring's outer two pixel columns against the row's
   fill, 4px in. The marker pass paints the ring magenta, so the two columns must be the ring. */
const ring = async () => {
  const r = await evaluate(`(() => { const e = document.activeElement.getBoundingClientRect(); return { x: e.left, y: e.top, width: e.width, height: e.height }; })()`);
  const clip = { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
  const mid = Math.floor(clip.height / 2);
  await setStyle("mark", `:focus-visible { outline-color: rgb(255 0 255) !important; forced-color-adjust: none !important; }`);
  const marked = await capture(clip);
  await setStyle("mark", "");
  const aligned = isMagenta(marked.at(0, mid)) || isMagenta(marked.at(1, mid));
  const img = await capture(clip);
  const fill = img.at(4, 4);
  const ratio = Math.max(contrast(img.at(0, mid), fill), contrast(img.at(1, mid), fill));
  return { aligned, ratio: round2(ratio), ring: img.at(1, mid), fill };
};

/* ── FORCED ───────────────────────────────────────────────────────────────── */
// Probes the demo does not carry. `.x-approve` is cockpit's own button colour
// (`.btn-terminal.btn-approve { color: var(--success) }`, execution.css:288) — a page's colour beats
// the system's forced one, which is exactly when a glyph that opted out keeps the page's colour.
// `.x-desc` is a row's descendant with its own colour (WP6's `.option-desc`).
const PROBES = `
<style id="x-probe-style">
  .btn-terminal.x-approve { color: var(--success); }
  .x-desc { color: var(--muted-foreground); }
</style>
<div class="demo-row">
  <button type="button" class="btn-terminal btn-terminal--compact x-approve" id="x-approve-busy" aria-busy="true" aria-disabled="true">approving</button>
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--destructive x-approve" id="x-approve-bin" aria-label="remove"></button>
  <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--edit x-approve" id="x-approve-pencil" aria-label="edit"></button>
</div>
<div class="demo-cols demo-static">
  <ul class="select-panel" role="menu" aria-label="a Radix radio menu">
    <li role="none"><div class="select-option" role="menuitemradio" aria-checked="true" id="x-opt-checked">radio item, checked</div></li>
    <li role="none"><div class="select-option" role="menuitemradio" aria-checked="true" data-highlighted id="x-opt-checked-hl">checked, highlighted</div></li>
  </ul>
  <ul class="select-panel" role="listbox" aria-label="rows as options">
    <li class="dropdown-item" role="option" aria-selected="true" id="x-item-selected">option, selected</li>
  </ul>
  <ul class="select-panel" role="listbox" aria-label="described options">
    <li class="select-option" role="option" aria-selected="false" data-active="true" id="x-opt-desc"><span>/deploy</span><span class="x-desc" id="x-desc">ship it</span></li>
  </ul>
  <ul class="dropdown-panel" role="menu" aria-label="described items">
    <li role="none"><button type="button" class="dropdown-item" role="menuitem" data-highlighted id="x-item-desc"><span>open</span><span class="x-desc" id="x-desc-2">in a new view</span></button></li>
  </ul>
</div>
<div style="padding: 0.5rem 0"><span class="term-caret" id="x-caret"></span></div>
<div data-tone="destructive"><details class="fold" id="x-tone-fold" open>
  <summary><span class="ico" data-icon="package" aria-hidden="true" id="x-tone-ico"></span>skills/ <span class="fold-count">3</span></summary>
  <div class="fold-body"><p>an untoned fold, inside a toned container</p></div></details></div>`;

const GLYPHS = [
  ["busy spinner, filled button", "#btn-busy", "before"],
  ["busy spinner, ghost button", "#btn-ghost-busy", "before"],
  ["bin", "#btn-bin", "after"],
  ["pencil", "#btn-edit", "after"],
  ["busy spinner in a page's own button colour", "#x-approve-busy", "before"],
  ["bin in a page's own button colour", "#x-approve-bin", "after"],
  ["pencil in a page's own button colour", "#x-approve-pencil", "after"],
  ["menu ✓ (aria-checked)", "#static-checked", "before"],
  ["menu ✓ in the live theme menu", '#theme-menu [aria-checked="true"]', "before"],
  ["listbox ✓ (aria-selected)", "#opt-chosen", "before"],
  ["✓ on .select-option[aria-checked] (a Radix radio item)", "#x-opt-checked", "before"],
  ["✓ on a highlighted chosen row", "#x-opt-checked-hl", "before"],
  ["✓ on .dropdown-item[aria-selected]", "#x-item-selected", "before"],
  ["zoom hint at rest", "#dgm", "after"],
  ["theme dot", "#theme-menu .dd-dot", null],
  ["icon in a button", "#btn-ico .ico", null],
  ["icon in an option", "#static-listbox .select-option .ico", null],
  ["icon in a fold summary", "#fold-count .ico", null],
  ["icon in a toned fold", "#fold-tone .ico", null],
  ["icon in an untoned fold inside a toned container", "#x-tone-ico", null],
  ["icon in a dropdown summary", "#dd-history .ico", null],
  ["block cursor", ".cursor-block", null],
  ["typing caret (.term-caret)", "#x-caret", null],
  ["minimap bar", ".minimap-bar:not([aria-current])", null],
  ["minimap bar, current", '.minimap-bar[aria-current="true"]', null],
  ["menu separator", "#static-menu .dropdown-sep", null],
  ["select caret ▾", "#trigger-model", "after"],
];
const WORDS = [
  ["listbox row, keyboard-active", "#opt-active"],
  ["menu row, keyboard-active", '#static-menu [data-active="true"]'],
  ["menu row, checked, under the pointer", "#static-checked", "#static-checked", ["hover"]],
  ["menu row, where you are", "#static-current"],
  ["menu row, where you are, under the pointer", "#static-current", "#static-current", ["hover"]],
  ["menu row, danger, under the pointer", "#static-danger", "#static-danger", ["hover"]],
  ["own-coloured text on a highlighted option (WP6's .option-desc)", "#x-desc", "#x-opt-desc"],
  ["own-coloured text on a highlighted menu item", "#x-desc-2", "#x-item-desc"],
];
const PLAIN_OPTION = '#static-listbox .select-option[aria-selected="false"]:not([data-active]):not([aria-disabled])';
const THEMES = ["warm", "green", "mono", "paper"];

await section("FORCED — both palettes, four themes, painted pixels (X1)", async () => {
  await evaluate(`(() => { const s = document.createElement("section"); s.id = "x-probes"; s.innerHTML = ${JSON.stringify(PROBES)};
    document.querySelector("main").append(s); })()`);
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
    await sleep(120);
    check(`${scheme}: the forced-colours mode is on (the check can see it at all)`,
      await evaluate(`matchMedia("(forced-colors: active)").matches`));
    for (const theme of THEMES) {
      const cell = `${scheme} · ${theme}`;
      await evaluate(`document.documentElement.dataset.theme = "${theme}"; null`);
      await sleep(60);
      const misaligned = [];

      // Glyphs: 3:1 against what they sit on.
      await evaluate(`document.getElementById("theme-menu").open = true; null`);
      await toggle("solid", true);
      const glyphs = {};
      for (const [name, selector, pseudo] of GLYPHS) glyphs[name] = await glyph(selector, pseudo);
      const unchecked = await glyph('#static-menu [aria-checked="false"]', "before");
      await toggle("solid", false);
      await evaluate(`document.getElementById("theme-menu").open = false; null`);
      for (const [name, g] of Object.entries(glyphs)) if (g.drawn && !g.aligned) misaligned.push(name);
      const faint = Object.entries(glyphs).filter(([, g]) => !g.drawn || !(g.ratio >= 3))
        .map(([name, g]) => (g.drawn ? `${name}: ${g.ratio}:1 (ink ${g.ink} on ${g.under})` : `${name}: not drawn`));
      check(`${cell}: all ${GLYPHS.length} glyphs paint at least 3:1 against what they sit on`, faint.length === 0, faint);

      // Words on a state: 4.5:1 against the state's own fill.
      const texts = {};
      for (const [name, textSel, rowSel, pseudoState] of WORDS) texts[name] = await words(textSel, rowSel, pseudoState);
      for (const [name, t] of Object.entries(texts)) if (!t.aligned) misaligned.push(name);
      const unread = Object.entries(texts).filter(([, t]) => !(t.ratio >= 4.5 && t.onFill))
        .map(([name, t]) => `${name}: ${t.ratio}:1 (ink ${t.ink} on ${t.dominant}; the state's fill is ${t.fill}${t.onFill ? "" : " — NOT under the text"})`);
      check(`${cell}: all ${WORDS.length} words on a state read at 4.5:1, with the state's fill under them`, unread.length === 0, unread);
      if (process.env.DD_VERBOSE === "1") {
        console.log(`      glyphs: ${Object.entries(glyphs).map(([n, g]) => `${n} ${g.ratio}`).join(" · ")}`);
        console.log(`      words: ${Object.entries(texts).map(([n, t]) => `${n} ${t.ratio}`).join(" · ")}`);
      }

      // Pairs: each state is told apart from its neighbour.
      const fillOf = async (selector) => { await reveal(selector); const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [e.left, e.top]; })()`);
        return (await capture({ x: Math.floor(r[0]) + 4, y: Math.floor(r[1]) + 4, width: 1, height: 1 })).at(0, 0); };
      const inkOf = async (selector) => (await words(selector)).ink;
      const pairs = {
        "listbox row, keyboard-active vs rest (fill, 3:1)": contrast(await fillOf("#opt-active"), await fillOf(PLAIN_OPTION)) >= 3,
        "menu row, keyboard-active vs rest (fill, 3:1)": contrast(await fillOf('#static-menu [data-active="true"]'), await fillOf("#static-plain")) >= 3,
        "menu row, off vs on (ink)": !near(await inkOf("#static-disabled"), await inkOf("#static-plain"), 24),
        "listbox row, off vs on (ink)": !near(await inkOf("#opt-disabled"), await inkOf(PLAIN_OPTION), 24),
        "menu row, where you are vs rest (ink)": !near(await inkOf("#static-current"), await inkOf("#static-plain"), 24),
        "✓ column, chosen vs not": glyphs["menu ✓ (aria-checked)"].ratio >= 3 && unchecked.drawn && unchecked.ratio < 1.2,
        "minimap bar, current vs rest": glyphs["minimap bar, current"].drawn && glyphs["minimap bar"].drawn
          && !near(glyphs["minimap bar, current"].ink, glyphs["minimap bar"].ink, 24),
      };
      const same = Object.entries(pairs).filter(([, ok]) => !ok).map(([name]) => name);
      check(`${cell}: all ${Object.keys(pairs).length} state pairs are told apart`, same.length === 0, same);

      // Rings, after real key presses: an enabled row and an aria-disabled one (Q1).
      await evaluate(`(() => { const d = document.getElementById("dd-actions"); d.scrollIntoView({ block: "start", behavior: "instant" });
        window.scrollBy({ top: -120, behavior: "instant" }); d.querySelector("summary").focus(); })()`);
      await press("ArrowDown");
      const enabled = { who: await evaluate(`[document.activeElement.textContent.trim(), document.activeElement.matches(":focus-visible")]`), ...(await ring()) };
      for (let i = 0; i < 3; i += 1) await press("ArrowDown");
      const disabled = { who: await evaluate(`[document.activeElement.textContent.trim(), document.activeElement.matches(":focus-visible"), document.activeElement.getAttribute("aria-disabled")]`), ...(await ring()) };
      await press("Escape");
      if (!enabled.aligned) misaligned.push("ring on an enabled row");
      if (!disabled.aligned) misaligned.push("ring on an aria-disabled row");
      check(`${cell}: a keyboard-focused row's ring reaches 3:1 on its row — enabled (${enabled.ratio}:1) and aria-disabled (${disabled.ratio}:1)`,
        enabled.who[1] && disabled.who[1] && disabled.who[2] === "true" && enabled.ratio >= 3 && disabled.ratio >= 3, { enabled, disabled });

      check(`${cell}: every clip holds its own element (a marker pass for glyphs and rings, a two-shot diff for words)`, misaligned.length === 0, misaligned);
    }
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
  await sleep(80);
  const plain = await evaluate(`[cs("#trigger-model", "::after").content, cs("#trigger-model").backgroundImage]`);
  check("without the mode the caret is the gradient again, and there is no text glyph", plain[0] === "none" && plain[1].includes("gradient"), plain);
});

/* ── HINT ─────────────────────────────────────────────────────────────────── */
await section("HINT — the zoom hint reads at rest, 3:1 in painted pixels", async () => {
  await toggle("solid", true);
  const out = {};
  for (const theme of THEMES) {
    await evaluate(`document.documentElement.dataset.theme = "${theme}"; null`);
    await sleep(60);
    out[theme] = await glyph("#dgm", "after");
  }
  await toggle("solid", false);
  check("the marker pass painted where the hint was measured, on every theme", Object.values(out).every((g) => g.drawn && g.aligned), out);
  check(`the hint is 3:1 at rest on all four themes (${Object.entries(out).map(([t, g]) => `${t} ${g.ratio}`).join(", ")})`,
    Object.values(out).every((g) => g.ratio >= 3), out);
});

/* ── CHOSEN ───────────────────────────────────────────────────────────────── */
// With the masks ON: the forced pass switches them off to read a glyph's colour, so it cannot see
// a ✓ that has no mask at all. The middle column of the ✓ crosses its stroke.
await section("CHOSEN — every chosen row shape draws its ✓, in the page's own colours (M0)", async () => {
  const shapes = [["listbox option, aria-selected", "#opt-chosen"], ["menu item, aria-checked", "#static-checked"],
    [".select-option[aria-checked] (a Radix radio item)", "#x-opt-checked"], [".dropdown-item[aria-selected]", "#x-item-selected"]];
  const out = {};
  for (const theme of THEMES) {
    await evaluate(`document.documentElement.dataset.theme = "${theme}"; null`);
    await sleep(60);
    for (const [name, selector] of shapes) {
      const g = await glyph(selector, "before");
      const mask = await evaluate(`cs(${JSON.stringify(selector)}, "::before").maskImage`);
      if (!(g.drawn && g.aligned && g.ratio >= 3 && mask.startsWith("url("))) out[`${theme} · ${name}`] = { ...g, mask: mask.slice(0, 12) };
    }
  }
  check(`all ${shapes.length} chosen shapes draw the ✓ mask at 3:1 on all four themes`, Object.keys(out).length === 0, out);
});

/* ── TONE ─────────────────────────────────────────────────────────────────── */
// A colour as the page paints it, BESIDE the element it is compared with: the capture is
// colour-managed and the page's scanline overlay darkens everything under it, so a painted pixel
// is compared with a painted swatch in the same place, never with a computed colour string.
const swatch = async (colour, beside) => {
  const box = await evaluate(`(() => { const s = document.createElement("span"); s.id = "x-swatch";
    s.style.cssText = "display: inline-block; inline-size: 14px; block-size: 14px; background: " + ${JSON.stringify(colour)};
    document.querySelector(${JSON.stringify(beside)}).after(s); const r = s.getBoundingClientRect(); return [r.left, r.top]; })()`);
  const clip = { x: Math.ceil(box[0]) + 6, y: Math.ceil(box[1]) + 1, width: 1, height: 12 };
  const drawn = await capture(clip);
  await evaluate(`document.getElementById("x-swatch").remove(); null`);
  const gone = await capture(clip);
  // Ownership, two shots: the same clip with the swatch and without it must differ.
  const changed = Array.from({ length: 12 }, (_, y) => !near(drawn.at(0, y), gone.at(0, y), 0)).filter(Boolean).length;
  return { colour: modeOf(Array.from({ length: 12 }, (_, y) => drawn.at(0, y))), owned: changed >= 3 };
};

await section("TONE — a fold's icon is its summary's colour (F7)", async () => {
  await evaluate(`document.documentElement.dataset.theme = "warm"; null`);
  const out = {};
  let destructive = null;
  for (const [name, fold] of [["an untoned fold inside a toned container", "#x-tone-fold"], ["a toned fold", "#fold-tone"], ["an untoned fold", "#fold-count"]]) {
    await reveal(fold);
    const own = await swatch(await evaluate(`cs(${JSON.stringify(`${fold} > summary`)}).color`), `${fold} > summary .ico`);
    const summary = own.colour;
    destructive ??= await swatch(await evaluate(`token("--destructive")`), `${fold} > summary .ico`);
    await toggle("solid", true);
    const g = await glyph(`${fold} > summary .ico`, null);
    await toggle("solid", false);
    out[name] = { icon: g.mode, summary, aligned: g.aligned && own.owned, same: !!g.mode && near(g.mode, summary, 3) };
  }
  check("each icon paints its summary's colour, as painted — and the untoned fold's is not the container's destructive",
    Object.values(out).every((o) => o.aligned && o.same) && destructive.owned && !near(out["an untoned fold inside a toned container"].icon, destructive.colour, 3),
    { destructive, ...out });
  const tone = await evaluate(`[getComputedStyle(document.getElementById("x-tone-fold")).getPropertyValue("--tone").trim(),
    getComputedStyle(document.getElementById("fold-tone")).getPropertyValue("--tone").trim()]`);
  check("an untoned fold resets --tone at its root, and a toned one keeps its own", tone[0] === "" && tone[1] !== "", tone);
  await evaluate(`document.getElementById("x-probes").remove(); null`);
});

/* ── FOCUS and FONT, with base.css switched off ───────────────────────────── */
const RINGS = [
  [".btn-terminal (filled)", "#btn-cta", "2px"], [".btn-terminal--ghost", "#btn-ghost", "2px"], [".btn-terminal--destructive", "#btn-bin", "2px"],
  ["a.link-quiet", "#lq-a", "2px"], ["button.link-quiet", "#lq-button", "2px"], [".disclosure-btn", "#disc-1", "2px"],
  ["a.card-terminal", "#card-link", "2px"], ["button.card-terminal", "#card-button", "2px"],
  [".dropdown > summary", "#dd-actions > summary", "2px"], [".dropdown-item (inset)", "#static-plain", "-2px"],
  ["text field", "#in-text", "2px"], ["textarea", "#in-textarea", "2px"], [".select-trigger", "#trigger-model", "2px"],
  [".field-row > button.lbl", "#f-hint", "2px"], ["details.fold > summary", "#fold-plain > summary", "2px"],
  [".dgm-zoomable", "#dgm", "2px"], [".minimap-bar", ".minimap-bar", "3px"], [".anim-toggle", ".anim-toggle", "2px"],
];
const ringOf = async (selector) => {
  await force(selector, ["focus", "focus-visible"]);
  const outline = await evaluate(`(() => { const c = cs(${JSON.stringify(selector)}); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset]; })()`);
  await force(selector, []);
  return outline;
};

await section("FOCUS — each component draws its own ring, base.css off (X2)", async () => {
  await evaluate(`document.querySelector('link[href$="base.css"]').disabled = true;
    const probe = document.createElement("button"); probe.id = "bare-probe"; probe.textContent = "probe"; document.body.append(probe); null`);
  const want = await evaluate(`token("--ring")`);
  const bare = await ringOf("#bare-probe");
  check("with base.css off, an element with no component rule has no system ring — so this check can fail",
    !(bare[0] === "solid" && bare[1] === "2px" && bare[2] === want), bare);
  const wrong = [];
  for (const [name, selector, offset] of RINGS) {
    const [style, width, colour, off] = await ringOf(selector);
    if (!(style === "solid" && width === "2px" && colour === want && off === offset)) wrong.push({ name, style, width, colour, off, want: offset });
  }
  check(`${RINGS.length} components each draw a 2px solid --ring ring at their offset, from their own rule`, wrong.length === 0, wrong);
});

await section("FONT — a control takes its surroundings' font, not the browser's (X2)", async () => {
  const fonts = await evaluate(`(() => {
    const fsBase = token("--fs-base", "fontSize");
    return ["#btn-cta", "#btn-ghost", "#btn-bin", "#lq-button", "#disc-1", "#card-button", "#f-hint", "#in-text", "#in-textarea",
      "#trigger-model", "#static-plain", ".anim-toggle"].map((sel) => {
      const el = document.querySelector(sel); const c = getComputedStyle(el); const p = getComputedStyle(el.parentElement);
      return { sel, family: c.fontFamily, parentFamily: p.fontFamily, size: c.fontSize, ok: c.fontFamily === p.fontFamily && [p.fontSize, fsBase].includes(c.fontSize) };
    });
  })()`);
  const off = fonts.filter((f) => !f.ok);
  check(`${fonts.length} controls render in their parent's family at its size or --fs-base, with no reset and no base.css`, off.length === 0, off);
  await evaluate(`document.querySelector('link[href$="base.css"]').disabled = false; document.getElementById("bare-probe").remove(); null`);
});

/* ── HIDDEN ───────────────────────────────────────────────────────────────── */
await section("HIDDEN — `hidden` hides every component (X3)", async () => {
  const shown = await evaluate(`(() => {
    const sels = ["#btn-ghost", "#btn-bin", "#btn-cta", "#static-plain", "#opt-chosen", "#static-menu", "#static-listbox", "#row-default",
      "#row-default .field-val", "#f-model-desc", "#legend-label", "#legend-list", "#fold-plain", "#fold-plain > summary", "#fold-empty",
      "#disc-1", "#card-static", "#card-link", "#lq-a", "#lq-button", "#in-text", "#in-textarea", "#trigger-model", "#dgm",
      "#theme-menu .dd-dot", "#dd-actions", ".minimap", ".minimap-bar", ".anim-toggle"];
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      const before = el.getClientRects().length > 0;
      el.hidden = true; const after = el.getClientRects().length > 0; el.hidden = false;
      return { sel, before, after };
    });
  })()`);
  check("every component is on screen to begin with (the check can fail)", shown.every((s) => s.before), shown.filter((s) => !s.before));
  check(`${shown.length} components disappear under \`hidden\`, whatever display they set`, shown.every((s) => !s.after), shown.filter((s) => s.after));
});

/* ── STATES ───────────────────────────────────────────────────────────────── */
const pointerProof = async (selector) => {
  const read = `(() => { const c = cs(${JSON.stringify(selector)}); return [c.borderTopColor, c.backgroundColor, c.color, c.transform, c.boxShadow].join(" | "); })()`;
  const rest = await evaluate(read);
  await force(selector, ["hover"]);
  const hovered = await evaluate(read);
  await force(selector, []);
  return { rest, hovered };
};

await section("STATES — disabled, busy, and a panel that starts with something else", async () => {
  const dim = await evaluate(`["button.btn-terminal:disabled", "#btn-ghost-disabled", "#in-disabled", "#trigger-disabled", "textarea:disabled"].map((s) => [s, cs(s).opacity])`);
  check("disabled buttons, fields, the trigger and a textarea are .45", dim.every(([, o]) => o === "0.45"), dim);
  const inert = {};
  for (const sel of ["#btn-ghost-disabled", "#in-disabled", "#trigger-disabled", "#btn-busy", "#btn-ghost-busy", "#btn-bin-busy"]) inert[sel] = await pointerProof(sel);
  // WP6's filtering trigger holds a --primary edge at (0,2,0); a disabled one keeps it under the pointer.
  await evaluate(`(() => { const s = document.createElement("style"); s.id = "filtering-stand-in";
    s.textContent = '.x-filtering[data-active="true"] { border-color: var(--primary); }'; document.head.append(s);
    const t = document.getElementById("trigger-disabled"); t.classList.add("x-filtering"); t.dataset.active = "true"; })()`);
  inert["#trigger-disabled (filtering)"] = await pointerProof("#trigger-disabled");
  await evaluate(`(() => { document.getElementById("filtering-stand-in").remove(); const t = document.getElementById("trigger-disabled");
    t.classList.remove("x-filtering"); delete t.dataset.active; })()`);
  const moved = Object.entries(inert).filter(([, v]) => v.rest !== v.hovered);
  check("a disabled button, field or trigger (a filtering trigger included) and a BUSY button do not change under the pointer", moved.length === 0, moved);
  const live = await pointerProof("#btn-cta");
  check("...while an enabled button still does (so the pointer is really forced)", live.rest !== live.hovered, live);

  const busy = await evaluate(`(() => { const b = document.getElementById("btn-busy"); b.focus();
    return { opacity: cs("#btn-busy").opacity, spinner: cs("#btn-busy", "::before").maskImage.startsWith("url("),
      focused: document.activeElement === b, disabled: b.disabled, ariaDisabled: b.getAttribute("aria-disabled") }; })()`);
  check("busy: full strength, the spinner drawn, focus kept — aria-disabled, never disabled (X5)",
    busy.opacity === "1" && busy.spinner && busy.focused && !busy.disabled && busy.ariaDisabled === "true", busy);

  const pad = await evaluate(`cs(".anim-toggle").padding`);
  check("the anim toggle declares its own padding, not the browser's button padding", pad === "0px", pad);

  const flush = await evaluate(`(() => {
    const panel = document.createElement("div"); panel.className = "select-panel"; panel.style.cssText = "position: fixed; left: 10px; top: 10px;";
    panel.innerHTML = '<div class="x-search">search</div><ul role="listbox"><li class="select-option" role="option" aria-selected="true">one</li></ul>';
    document.body.append(panel);
    const ul = panel.querySelector("ul"), li = panel.querySelector("li");
    const out = { ulPad: getComputedStyle(ul).paddingInlineStart, ulMargin: getComputedStyle(ul).marginBlockStart,
      rowLeft: li.getBoundingClientRect().left - panel.getBoundingClientRect().left };
    panel.remove(); return out;
  })()`);
  check("a panel whose first child is not a row (a search row, then the listbox) lays its rows out flush",
    flush.ulPad === "0px" && flush.ulMargin === "0px" && flush.rowLeft === 1, flush);
});

/* ── COARSE and MOTION ────────────────────────────────────────────────────── */
await section("COARSE — a 44px target under a coarse pointer", async () => {
  // Touch emulation is what makes (pointer: coarse) match in a headless shell; the media override alone does not.
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }] });
  await sleep(80);
  const box = await evaluate(`(() => {
    const b = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100]; };
    return { coarse: matchMedia("(pointer: coarse)").matches, ghost: b("#btn-ghost"), bin: b("#btn-bin"), pencil: b("#btn-edit"), disclosure: b("#disc-1"),
      label: b("#f-hint"), fold: b("#fold-plain > summary"), compactFold: b("#fold-compact > summary"),
      item: b("#static-plain"), option: b("#opt-chosen"), textSummary: b("#dd-actions > summary"), iconSummary: b("#dd-history > summary"),
      anim: b(".anim-toggle") };
  })()`);
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  check("the coarse pointer is emulated (the check can see it at all)", box.coarse, box);
  check("buttons, a button label and every fold summary are 44px tall; the bin, the pencil and the disclosure 44px square",
    box.ghost[1] >= 44 && box.label[1] >= 44 && box.fold[1] >= 44 && box.compactFold[1] >= 44 &&
    [box.bin, box.pencil, box.disclosure].every(([w, h]) => w >= 44 && h >= 44), box);
  check("a menu item and an option are 44px tall; a text summary, an icon summary and the anim toggle are 44px targets",
    box.item[1] >= 44 && box.option[1] >= 44 && [box.textSummary, box.iconSummary, box.anim].every(([w, h]) => w >= 44 && h >= 44), box);
});

await section("MOTION — reduced motion stops the spinner and the blink", async () => {
  const read = `[cs("#btn-busy", "::before").animationName, cs(".cursor-block").animationName]`;
  await evaluate(`document.getElementById("no-motion").disabled = true; null`);
  const moving = await evaluate(read);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await sleep(80);
  const still = await evaluate(read);
  const spinner = await evaluate(`cs("#btn-busy", "::before").maskImage.startsWith("url(")`);
  await send("Emulation.setEmulatedMedia", { features: [] });
  await evaluate(`document.getElementById("no-motion").disabled = false; null`);
  check("without the preference the spinner turns and the cursor blinks (so the check can fail)", moving.every((n) => n !== "none"), moving);
  check("with it both stop, and the spinner's glyph stays", still.every((n) => n === "none") && spinner, { still, spinner });
});

/* ── RADIUS ───────────────────────────────────────────────────────────────── */
await section("RADIUS — no rounded corner anywhere, a circle excepted", async () => {
  const round = await evaluate(`(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      for (const pseudo of [null, "::before", "::after"]) {
        const c = getComputedStyle(el, pseudo);
        const r = [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius];
        if (r.some((v) => v !== "0px" && v !== "50%")) out.push((el.id || el.className || el.tagName) + (pseudo || "") + " " + r.join(" "));
      }
    }
    return out;
  })()`);
  check("every corner on the page is square (50% circles allowed)", round.length === 0, round.slice(0, 10));
});

/* ── INVALID ──────────────────────────────────────────────────────────────── */
// Resolves every aria-invalid="true" in `doc` through its aria-describedby to a .field-error with text.
const DESCRIBED = `(doc) => [...doc.querySelectorAll('[aria-invalid="true"]')].map((el) => {
  const ids = (el.getAttribute("aria-describedby") || "").split(/\\s+/).filter(Boolean);
  const said = ids.map((id) => doc.getElementById(id)).filter((n) => n && n.classList.contains("field-error") && n.textContent.trim() !== "");
  return { field: el.id || el.outerHTML.slice(0, 90), says: said.map((n) => n.textContent.trim()) };
})`;

await section("INVALID — an invalid field says what is wrong in text (WCAG 1.4.1, 3.3.1)", async () => {
  const demo = await evaluate(`(${DESCRIBED})(document)`);
  const mute = demo.filter((d) => d.says.length === 0);
  check(`demo: all ${demo.length} aria-invalid fields name a .field-error with text through aria-describedby`,
    demo.length >= 4 && mute.length === 0, mute.length ? mute : demo);
  const refs = ["components.md", "tables-and-forms.md"].flatMap((file) => {
    const text = readFileSync(join(root, ".claude/skills/danieldeusing-design/references", file), "utf8");
    return [...text.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => ({ file, html: m[1] })).filter((b) => b.html.includes("aria-invalid"));
  });
  const found = await evaluate(`(() => { const describe = ${DESCRIBED};
    return ${JSON.stringify(refs)}.flatMap(({ file, html }) => describe(new DOMParser().parseFromString(html, "text/html")).map((d) => ({ file, ...d }))); })()`);
  const bare = found.filter((d) => d.says.length === 0);
  check(`references: all ${found.length} aria-invalid examples name a .field-error with text through aria-describedby`,
    found.length >= 2 && bare.length === 0, bare.length ? bare : found);
});

/* ── SILENT — what is for the eye stays out of the accessibility tree ────── */
await section("SILENT — an icon is for the eye; a menu's label names its group", async () => {
  const demo = await evaluate(`({ icons: [...document.querySelectorAll(".ico")].filter((i) => i.getAttribute("aria-hidden") !== "true").map((i) => i.outerHTML),
    labels: [...document.querySelectorAll('[role="menu"] .dropdown-label')].filter((l) => !(l.id && !l.hasAttribute("aria-hidden")
      && l.closest('[role="group"]')?.getAttribute("aria-labelledby") === l.id)).map((l) => l.outerHTML),
    total: document.querySelectorAll(".ico").length })`);
  check(`demo: all ${demo.total} .ico glyphs are aria-hidden, and every .dropdown-label in a menu names the group it heads`,
    demo.total >= 5 && demo.icons.length === 0 && demo.labels.length === 0, demo);
  const blocks = ["components.md", "tables-and-forms.md"].flatMap((file) =>
    [...readFileSync(join(root, ".claude/skills/danieldeusing-design/references", file), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]));
  const loud = await evaluate(`${JSON.stringify(blocks)}.flatMap((html) => [...new DOMParser().parseFromString(html, "text/html").querySelectorAll(".ico")]
    .filter((i) => i.getAttribute("aria-hidden") !== "true").map((i) => i.outerHTML))`);
  check("references: every .ico in an example is aria-hidden", loud.length === 0, loud);
});

/* ── REMOVED ──────────────────────────────────────────────────────────────── */
// Code, not prose: the comments that record a removal name the class, so they are stripped first.
await section("REMOVED — the classes 0.60.0 removed are not declared (§1.1), and the glyph lists agree", async () => {
  const css = readFileSync(join(root, "src/components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // The tab bar moved to data.css with its runtime (WP11): a second .tab here would tie with it and
  // the bundle's import order would pick the look.
  const back = [".filter-ctl", ".filter-set", ".filter-set-label", ".tbl-toolbar", ".tbl-search", ".tbl-filter-input",
    ".tabs", ".tab", ".tab--info", ".tab-panel"]
    .filter((name) => new RegExp(`${name.replace(".", "\\.")}(?![\\w-])`).test(css));
  check("components.css declares none of .filter-ctl, .filter-set(-label), .tbl-toolbar, .tbl-search, .tbl-filter-input, and not the tab bar (data.css)", back.length === 0, back);
  // The forced glyph rule and its `@supports not` fallback list the same selectors twice, by hand.
  const list = (re) => (css.match(re)?.[1] || "").split(",").map((sel) => sel.trim()).filter(Boolean).sort();
  const glyphs = list(/\}\s*([^{}]+)\{\s*forced-color-adjust:\s*preserve-parent-color;/);
  const fallback = list(/@supports not \(forced-color-adjust: preserve-parent-color\)\s*\{([^{}]+)\{/);
  check(`the forced glyph rule and its fallback name the same ${glyphs.length} selectors`,
    glyphs.length >= 10 && JSON.stringify(glyphs) === JSON.stringify(fallback), { glyphs, fallback });
});


console.log(failures ? `\ncheck-components: ${failures} FAILED` : "\ncheck-components: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
