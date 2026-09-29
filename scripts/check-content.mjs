#!/usr/bin/env node
/*
 * check-content.mjs — src/content.css and templates/error-page.html, measured in a browser.
 *
 * WHAT IT GUARDS. Nothing in content.css fails loudly. A title one step too small still renders a
 * title; a gutter number that leaks into a copied selection still looks like a gutter; a list
 * marker at 3:1 still looks like a marker; a class that quietly leans on base.css looks perfect on
 * every page that happens to load base.css and wrong on the tokens-only surface nobody opens. So
 * every one of those is asserted by measuring it:
 *
 *   · computed metrics of every class, P1–P8 and P10, against the spec's numbers (P9's series
 *     navigator is WP3's `.navlist`, by the lead's ruling)
 *   · the same values on ?bare — tokens.css + content.css and nothing else — as on the full page
 *   · contrast of every text and glyph colour the file introduces, from the browser's own computed
 *     colours, on four themes and the three surfaces (--background, --card, --muted); code on the
 *     --muted it always sits on. The table is printed so it can be held against the comments.
 *   · forced colours on both palettes: glyphs, state words and focus rings, read back as pixels
 *   · hover, keyboard focus, print, a phone width
 *   · no border-radius anywhere
 *   · the error-page template: its structure, and its title rendering at the display step
 *
 * It drives examples/content.html, the package's demo page, served from this checkout by a loopback
 * server. Where another 0.60.0 package has not landed yet the demo switches on a stand-in for it, and
 * this prints which, every run: a stand-in is a copy of someone else's work and the reader must know
 * when a green result leans on one.
 *
 * A REAL BROWSER, and no dependency — the headless chromium Playwright caches, over the DevTools
 * protocol with Node's own fetch and WebSocket. With no browser it SKIPS loudly; DD_REQUIRE_BROWSER=1
 * makes that skip a failure. DD_FORBID_STANDINS=1 makes every stand-in in force a failure too — for
 * the run after integration, when a green result must stand on the real files alone.
 *
 *   node scripts/check-content.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

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
  console.log("check-content: SKIPPED — no headless chromium on this machine.");
  console.log("  Metrics and contrast are read from computed styles; no stub can stand in for them.");
  console.log("  Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const THEMES = ["warm", "green", "mono", "paper"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the worktree over loopback; the template's CDN urls are pointed at this checkout ────────── */

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
// The template pins a published release, which predates content.css. Served here, its stylesheet is
// this checkout's bundle source and its runtime is this checkout's — so what is measured is the
// template's markup under the code that will ship with it. Two pieces of that code may not be in the
// bundle yet, and each is injected ONLY while it is missing, and NAMED as a stand-in when it is: the
// content.css import (WP13 adds it to index.css) and --fs-display (WP1 adds it to tokens.css). Once
// both land, the template is measured on src/index.css alone.
const tokensHaveDisplay = /--fs-display\s*:/.test(readFileSync(join(root, "src/tokens.css"), "utf8"));
const indexImportsContent = /@import\s+(url\()?["']\.\/content\.css["']/.test(readFileSync(join(root, "src/index.css"), "utf8"));
const DISPLAY_STANDIN = "<style data-standin>:root{--fs-display:1.875rem}@media (min-width:40rem){:root{--fs-display:2.25rem}}</style>";
const TEMPLATE_STANDINS = [
  ...(indexImportsContent ? [] : ["content.css beside index.css (index.css does not import it yet)"]),
  ...(tokensHaveDisplay ? [] : ["--fs-display (tokens.css does not declare it yet)"]),
];
const templateHtml = () => {
  const cdn = `https://cdn.jsdelivr.net/npm/@danieldeusing/design@${pkg.version}`;
  let html = readFileSync(join(root, "templates/error-page.html"), "utf8");
  html = html.replace(/<link\s+rel="stylesheet"\s+href="[^"]*fonts\.css"[^>]*>/, "");
  html = html.replace(/<link\s+rel="stylesheet"\s+href="[^"]*danieldeusing-design\.min\.css"[^>]*>/,
    '<link rel="stylesheet" href="/src/index.css">' +
    (indexImportsContent ? "" : '<link rel="stylesheet" href="/src/content.css" data-standin>') +
    (tokensHaveDisplay ? "" : DISPLAY_STANDIN));
  return html.split(`${cdn}/runtime/index.js`).join("/runtime/index.js");
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  if (path.startsWith("/__template/")) {
    res.writeHead(200, { "content-type": TYPES[".html"] });
    res.end(templateHtml());
    return;
  }
  const file = join(root, path);
  let body = null;
  if (file.startsWith(root + sep)) { try { body = readFileSync(file); } catch {} }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(body);
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/* ── the browser, on a port it picks itself so parallel suites cannot collide ─────────────────── */

const profile = mkdtempSync(join(tmpdir(), "dd-content-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=1280,900", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
// The profile goes with the browser, on every exit path, a failed or aborted run included: each one
// is 2.5MB, and 91 of them had piled up in the temp directory before this line existed.
const shutdown = () => {
  try { socket?.close(); } catch {}
  chrome.kill("SIGKILL");
  server.close();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
};
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
const consoleErrors = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
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
// Anything that still escapes is a FAIL that says where the suite got to, never a bare stack.
process.on("uncaughtException", (error) => {
  console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
  console.log("\ncheck-content: ABORTED");
  process.exit(1);
});
// Every stand-in in force is printed; under DD_FORBID_STANDINS=1 each one is also a failure.
const standins = async (where, list) => {
  console.log(`stand-ins in force (${where}): ${list}`);
  if (process.env.DD_FORBID_STANDINS === "1") {
    await check(`DD_FORBID_STANDINS=1: nothing stands in for the real files (${where})`, () => (list === "none" ? [] : [`in force: ${list}`]));
  }
};

/* ── in the page: computed-style assertions and colour maths ────────────────────────────────── */

const HELPERS = String.raw`
window.__t = (() => {
  const el = (sel) => { const e = typeof sel === "string" ? document.querySelector(sel) : sel; if (!e) throw new Error("no element " + sel); return e; };
  const cs = (sel, pseudo) => getComputedStyle(el(sel), pseudo || null);
  const probe = (prop, expr) => {
    const p = document.createElement("span");
    p.style.cssText = "position:absolute;visibility:hidden";
    p.style.setProperty(prop, expr);
    document.body.append(p);
    const value = getComputedStyle(p).getPropertyValue(prop);
    p.remove();
    return value;
  };
  const token = (name) => probe("color", "var(" + name + ")");
  // want: { prop: "exact" | { token: "--x" } | { re: "..." } | { px: n } }
  const expect = (sel, pseudo, want) => {
    const s = cs(sel, pseudo);
    const out = [];
    for (const [prop, w] of Object.entries(want)) {
      const got = s.getPropertyValue(prop).trim();
      let ok, show;
      if (typeof w === "string") { ok = got === w; show = JSON.stringify(w); }
      else if (w.token) { const t = token(w.token); ok = got === t; show = w.token + " (" + t + ")"; }
      else if (w.re) { ok = new RegExp(w.re).test(got); show = "/" + w.re + "/"; }
      else if ("px" in w) { ok = Math.abs(parseFloat(got) - w.px) < 0.05; show = w.px + "px"; }
      if (!ok) out.push(sel + (pseudo || "") + " " + prop + ": got " + JSON.stringify(got) + ", want " + show);
    }
    return out;
  };
  const rect = (sel) => { const r = el(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };

  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const oklch = (L, C, H) => {
    const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => clamp(fromLin(c)));
  };
  const nums = (s) => s.split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : Number(v)));
  const parse = (str) => {
    let m;
    if ((m = /^rgba?\((.+)\)$/.exec(str))) { const p = nums(m[1]); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 }; }
    if ((m = /^color\(srgb (.+)\)$/.exec(str))) { const p = nums(m[1]); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    if ((m = /^oklch\((.+)\)$/.exec(str))) { const p = nums(m[1]); const [r, g, b] = oklch(p[0], p[1], p[2]); return { r, g, b, a: p.length > 3 ? p[3] : 1 }; }
    throw new Error("cannot parse colour " + str);
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c) => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
  const ratio = (fg, bg) => { const b = parse(bg), f = over(parse(fg), b); const [hi, lo] = [lum(f), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
  const surface = (name) => probe("background-color", "var(" + name + ")");
  // What a thing is painted ON: the backgrounds from node outwards, composited down to the first
  // opaque one (Canvas when none is), so a glyph on a filled box is measured against that fill.
  const backdrop = (node) => {
    const layers = [];
    for (let n = node; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
    }
    let base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : parse(probe("background-color", "Canvas"));
    while (layers.length) base = over(layers.pop(), base);
    return "rgb(" + [base.r, base.g, base.b].map((v) => Math.round(v * 255)).join(", ") + ")";
  };
  return { el, cs, probe, token, expect, rect, ratio, surface, backdrop };
})();
null`;

const load = async (query, { width = 1280, height = 900 } = {}) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${ORIGIN}/examples/content.html${query}` });
  for (let i = 0; i < 60; i += 1) {
    await sleep(100);
    try { if (await evaluate(`document.readyState === "complete" && document.getElementById("standins").textContent !== ""`)) break; } catch {}
  }
  await evaluate(HELPERS);
};
const expect = (sel, pseudo, want) => evaluate(`__t.expect(${JSON.stringify(sel)}, ${JSON.stringify(pseudo)}, ${JSON.stringify(want)})`);
const expectAll = async (list) => (await Promise.all(list.map(([sel, pseudo, want]) => expect(sel, pseudo, want)))).flat();
const rect = (sel) => evaluate(`__t.rect(${JSON.stringify(sel)})`);
const center = async (sel) => evaluate(`(() => { const e = __t.el(${JSON.stringify(sel)}); e.scrollIntoView({ block: "center", behavior: "instant" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const hover = async (sel) => { const p = await center(sel); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y }); await sleep(250); };
// Focus the way a keyboard reader gets there: the element before it in tab order takes focus, then a
// REAL Tab moves it on. Returns whether the Tab landed on the element — a ring measured on an element
// that focus never reached would prove nothing, so every caller fails on false.
const focusByTab = async (sel) => {
  const ready = await evaluate(`(() => {
    const target = __t.el(${JSON.stringify(sel)});
    const tabbable = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
      .filter((e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden");
    const i = tabbable.indexOf(target);
    if (i < 1) return false;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    tabbable[i - 1].focus({ preventScroll: true });
    return true;
  })()`);
  if (!ready) return false;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(80);
  return evaluate(`document.activeElement === __t.el(${JSON.stringify(sel)})`);
};
const ring = (sel) => expect(sel, null, { "outline-style": "solid", "outline-width": { px: 2 }, "outline-color": { token: "--ring" }, "outline-offset": { px: 2 } });
const ringByTab = async (sel) => ((await focusByTab(sel)) ? ring(sel) : [`a real Tab did not land on ${sel}`]);
// The name Chromium's accessibility tree computes — what a screen reader is given.
const axName = async (sel) => {
  const { result } = await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(sel)})` });
  if (!result.objectId) return null;
  const { nodes } = await send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
  return nodes[0]?.name?.value ?? null;
};

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */

await load("?theme=warm");
await standins("full page", await evaluate("document.documentElement.dataset.standins"));
await standins("template", TEMPLATE_STANDINS.join(" · ") || "none");

/* ── P1 page title and lede ─────────────────────────────────────────────────────────────────── */

await check("P1 .page-title: 24px, 700, tight, -0.025em, --primary, the large glow, 1.5rem under the prompt", () => expectAll([
  ["#p1-app .page-title", null, {
    "font-size": "24px", "font-weight": "700", "line-height": { px: 31.2 }, "letter-spacing": { px: -0.6 },
    color: { token: "--primary" }, "text-shadow": { re: "12px$" }, "overflow-wrap": "anywhere",
    "margin-top": "24px", "margin-bottom": "0px", "margin-left": "0px", "margin-right": "0px",
  }],
]));
// pagr's display titles lead at 1.2 (Tailwind's text-3xl/4xl, and ArticlePostPage's leading-[1.2]).
await check("P1 .page-title--display is --fs-display at pagr's 1.2 leading: 36px on 43.2px from 40rem", () => expectAll([
  ["#p1-display .page-title", null, { "font-size": "36px", "line-height": { px: 43.2 }, "letter-spacing": { px: -0.9 } }],
]));
// The step and the boot log's one-column switch both turn at 40rem (WP1's breakpoint, the site's sm:),
// so they are pinned on both sides of it: 639px is below, 640px is the step.
await check("40rem, pinned: at 639px the display title is 30px and a boot line one column; at 640px 36px and two", async () => {
  const out = [];
  for (const [width, size, cols] of [[639, "30px", 1], [640, "36px", 2]]) {
    await load("?theme=warm", { width, height: 900 });
    const got = await evaluate(`[getComputedStyle(__t.el("#p1-display .page-title")).fontSize,
      getComputedStyle(__t.el("#boot .boot-line")).gridTemplateColumns.split(" ").length]`);
    if (got[0] !== size) out.push(`at ${width}px the display title is ${got[0]}, want ${size}`);
    if (got[1] !== cols) out.push(`at ${width}px a boot line has ${got[1]} column(s), want ${cols}`);
  }
  await load("?theme=warm");
  return out;
});
await check("P1 .lede: muted, .5rem under the title, no other margin", () => expectAll([
  ["#p1-app .lede", null, { color: { token: "--muted-foreground" }, "margin-top": "8px", "margin-bottom": "0px" }],
]));
await check("P1 a leading glyph is the 24px step with .5rem after it", () => expectAll([
  ["#p1-glyph .page-title > .ico", null, { width: "24px", height: "24px", "margin-right": "8px" }],
]));
await check("P1 a long token wraps inside its column instead of overflowing it", async () => {
  const [title, frame] = await Promise.all([rect("#p1-long .page-title"), rect("#p1-long")]);
  return title.r <= frame.r + 0.5 ? [] : [`title right ${title.r} > frame right ${frame.r}`];
});

/* ── P2 eyebrow ─────────────────────────────────────────────────────────────────────────────── */

await check("P2 .eyebrow: body size, 500, upper case, .05em, muted, no margin", () => expectAll([
  ["#eyebrow-plain", null, {
    "font-size": "12px", "font-weight": "500", "letter-spacing": { px: 0.6 }, "text-transform": "uppercase",
    "line-height": { px: 15.6 }, color: { token: "--muted-foreground" },
    "margin-top": "0px", "margin-bottom": "0px",
  }],
]));
await check("P2 data-tone colours an eyebrow (warning, primary)", () => expectAll([
  ["#eyebrow-warning", null, { color: { token: "--warning" } }],
  ["#eyebrow-primary", null, { color: { token: "--primary" } }],
]));
await check("P2 an h2.eyebrow.comment still reads at body size (the class beats the heading step)", () => expectAll([
  ["#eyebrow-comment", null, { "font-size": "12px", "font-weight": "500" }],
]));
// F7: --tone inherits, so a component that is neutral by default resets it at its root.
await check("P2 an eyebrow with no tone of its own stays muted inside a toned container", () => expectAll([
  ["#eyebrow-in-tone", null, { color: { token: "--muted-foreground" } }],
]));

/* ── P3 section head and sub-head ───────────────────────────────────────────────────────────── */

await check("P3 .section-head: a wrapping flex row on the baseline, 4px 16px gaps, 1rem under it", () => expectAll([
  ["#head-link", null, {
    display: "flex", "flex-wrap": "wrap", "align-items": "baseline", "justify-content": "space-between",
    "row-gap": "4px", "column-gap": "16px", "margin-bottom": "16px",
  }],
  ["#head-link > h2", null, { "margin-top": "0px", "margin-bottom": "0px" }],
]));
await check("P3 the trailing item never shrinks or wraps; a <time> there is muted", () => expectAll([
  ["#head-link > a", null, { "flex-shrink": "0", "flex-grow": "0", "white-space": "nowrap" }],
  ["#head-time > time", null, { color: { token: "--muted-foreground" }, "white-space": "nowrap" }],
]));
await check("P3 a row that ends in an icon button centres instead (it has no baseline)", () => expectAll([
  ["#head-button", null, { "align-items": "center" }],
]));
await check("P3 in a narrow column the trailing link drops under the heading and stays one line", async () => {
  const [h, a] = await Promise.all([rect("#head-narrow > h2"), rect("#head-narrow > a")]);
  const lh = await evaluate(`parseFloat(getComputedStyle(__t.el("#head-narrow > a")).lineHeight)`);
  const out = [];
  if (!(a.y >= h.b - 0.5)) out.push(`link top ${a.y} is not below the heading bottom ${h.b}`);
  if (a.h > lh + 1) out.push(`link is ${a.h}px tall — it wrapped (line height ${lh})`);
  return out;
});
await check("P3 .subhead: body size, 700, 1.4rem above and .3rem below, the first flush", () => expectAll([
  ["#subheads .subhead:first-child", null, { "margin-top": "0px", "margin-bottom": "4.8px", "font-size": "12px", "font-weight": "700" }],
  ["#subheads .subhead:nth-of-type(2)", null, { "margin-top": "22.4px", "margin-bottom": "4.8px" }],
]));

/* ── P4 markdown and the lists ──────────────────────────────────────────────────────────────── */

await check("P4 .markdown: 1.625, a .5rem rhythm, .75rem above a heading, headings --foreground", () => expectAll([
  ["#md-article", null, { "line-height": { px: 19.5 }, "overflow-wrap": "break-word" }],
  ["#md-article > p", null, { "margin-top": "8px", "margin-bottom": "0px" }],
  ["#md-article > h1", null, { "font-size": "18px", "margin-top": "0px", color: { token: "--foreground" } }],
  ["#md-article > h2", null, { "font-size": "18px", "font-weight": "700", "margin-top": "12px", "line-height": { px: 23.4 }, color: { token: "--foreground" } }],
  ["#md-article > h3", null, { "font-size": "15px", "margin-top": "12px" }],
  ["#md-article > h4", null, { "font-size": "12px", "margin-top": "12px" }],
  ["#md-article strong", null, { color: { token: "--foreground" } }],
  ["#md-article > hr", null, { "margin-top": "16px", "margin-bottom": "16px" }],
]));
await check("P4 lists: disc / decimal at 1rem, .25rem between items, muted markers", () => expectAll([
  ["#md-article > ul", null, { "list-style-type": "disc", "padding-left": "16px" }],
  ["#md-article > ol", null, { "list-style-type": "decimal", "padding-left": "16px" }],
  ["#md-article > ul > li + li", null, { "margin-top": "4px" }],
  ["#md-article > ul > li > ul", null, { "margin-top": "4px" }],
  ["#md-article > ul > li", "::marker", { color: { token: "--muted-foreground" } }],
]));
// marked and remark put paragraphs inside list items and quotes, and code inside a list item, and a
// hand-written body can hold a list class. Every block in that flow, at any depth, starts flush and
// sits .5rem under the block before it — on the full page, and on tokens.css alone, where the user
// agent's 12px would otherwise leak (seedr and configr space a paragraph anywhere: `[&_p]:mb-2`).
const NESTED_GAPS = [
  ["#nest-li-p1", "#nest-li-p2", "two paragraphs in one list item"],
  ["#nest-li-p3", "#nest-li-pre", "a paragraph, then code, in a list item"],
  ["#nest-bq-p1", "#nest-bq-p2", "two paragraphs in a quote"],
  ["#nest-before-plain", "#nest-plain", "a paragraph, then ul.plain"],
  ["#nest-before-dash", "#nest-dash", "a paragraph, then ul.dash"],
  ["#nest-hr-p1", "#nest-hr", "a paragraph, then a rule, in a quote"],
  ["#nest-hr", "#nest-hr-p2", "a rule, then a paragraph, in a quote"],
];
// A flex row and a grid inside the body lay out their own items: the rhythm must not push the
// second one down.
const LEVEL = [["#nest-row-a", "#nest-row-b", "a flex row's two items"], ["#nest-fig-a", "#nest-fig-b", "two figures in a two-column grid"]];
const nestedRhythm = () => evaluate(`(() => {
  const out = [];
  for (const [a, b, what] of ${JSON.stringify(NESTED_GAPS)}) {
    const gap = __t.el(b).getBoundingClientRect().top - __t.el(a).getBoundingClientRect().bottom;
    if (Math.abs(gap - 8) > 0.5) out.push(what + ": " + gap.toFixed(1) + "px apart, want 8");
  }
  // ol.steps' first item carries its own .6rem, which collapses through the list's top margin
  for (const sel of ["#nest-plain", "#nest-steps", "#nest-dash"]) {
    const m = getComputedStyle(__t.el(sel)).marginTop;
    if (m !== "8px") out.push(sel + " margin-top " + m + ", want 8px — the list class sits flush against the paragraph");
  }
  for (const [a, b, what] of ${JSON.stringify(LEVEL)}) {
    const off = __t.el(b).getBoundingClientRect().top - __t.el(a).getBoundingClientRect().top;
    if (Math.abs(off) > 0.5) out.push(what + ": the second sits " + off.toFixed(1) + "px lower, want level");
  }
  for (const sel of ["#nest-li-p1", "#nest-bq-p1"]) {
    const m = getComputedStyle(__t.el(sel)).marginTop;
    if (m !== "0px") out.push(sel + " is first in its container and has margin-top " + m);
  }
  for (const e of __t.el("#md-nested").querySelectorAll("p, pre, ul, ol, blockquote, hr, figure")) {
    const m = getComputedStyle(e).marginBottom;
    if (m !== "0px") out.push((e.id ? "#" + e.id : e.tagName.toLowerCase()) + " keeps a margin-bottom of " + m);
  }
  return out;
})()`);
await check("P4 .markdown spaces every block at any depth: .5rem after a block, flush first, nothing from the user agent; a row and a grid stay level", nestedRhythm);
await check("P4 a link is the accent AND underlined at rest (never colour alone); del is muted", () => expectAll([
  ["#md-article a", null, { color: { token: "--primary" }, "text-decoration-line": "underline", "text-underline-offset": "4px" }],
  ["#md-article del", null, { color: { token: "--muted-foreground" } }],
  ["#md-article img", null, { "max-width": "100%", "border-top-width": "1px", "border-top-style": "solid" }],
]));
await check("P4 an embedded document is muted, and its headings and strong return to --foreground", () => expectAll([
  ["#md-embedded > p", null, { color: { token: "--muted-foreground" } }],
  ["#md-embedded > h2", null, { color: { token: "--foreground" } }],
  ["#md-embedded strong", null, { color: { token: "--foreground" } }],
]));
await check("P4 ol.steps: the number in --primary, bold, right-aligned in a 1.5rem gutter", () => expectAll([
  ["#list-steps", null, { "list-style-type": "none", "padding-left": "0px" }],
  ["#list-steps > li", null, { "padding-left": "36px", "margin-top": "9.6px", position: "relative" }],
  ["#list-steps > li", "::before", { color: { token: "--primary" }, "font-weight": "700", width: "24px", "text-align": "end", position: "absolute" }],
]));
await check("P4 ul.plain: indented 1.1rem, no marker, .35rem between items", () => expectAll([
  ["#list-plain", null, { "list-style-type": "none", "padding-left": "17.6px" }],
  ["#list-plain > li + li", null, { "margin-top": "5.6px" }],
]));
await check("P4 ul.dash: a drawn dash with no alt text, and a real hanging indent", async () => {
  const out = await expectAll([
    ["#list-dash > li", "::before", { content: '"-" / ""', color: { token: "--primary" }, position: "absolute" }],
    ["#list-dash > li + li", null, { "margin-top": "6px" }],
  ]);
  const geo = await evaluate(`(() => {
    const li = document.querySelectorAll("#list-dash > li")[1];
    const text = li.firstChild;
    const range = document.createRange(); range.selectNodeContents(text);
    const rects = [...range.getClientRects()];
    const dash = li.getBoundingClientRect().left;
    const first = document.querySelector("#list-dash > li");
    return { lines: rects.length, x1: rects[0].left, x2: rects[1]?.left, li: dash,
             display: getComputedStyle(first).display,
             mixedTop: first.getBoundingClientRect().top, strongTop: first.querySelector("strong").getBoundingClientRect().top };
  })()`);
  if (geo.lines < 2) out.push("the long item did not wrap — the hang is untested");
  else if (Math.abs(geo.x1 - geo.x2) > 0.5) out.push(`second line starts at ${geo.x2}, first at ${geo.x1} — not hanging`);
  if (!(geo.x1 > geo.li + 4)) out.push(`text starts at ${geo.x1}, the dash column at ${geo.li} — no room for the dash`);
  if (geo.display !== "list-item" && geo.display !== "block") out.push(`li is display:${geo.display} — a flex row splits mixed inline content`);
  if (Math.abs(geo.mixedTop - geo.strongTop) > 6) out.push("the <strong> in the first item is not on its first line");
  return out;
});

/* ── P5 code ────────────────────────────────────────────────────────────────────────────────── */

const CODE_BOX = {
  display: "block", "padding-top": "12px", "padding-left": "16px", "font-size": "12px", "line-height": "18px",
  "white-space": "pre", "tab-size": "2", color: { token: "--foreground" },
  "background-color": { re: "." }, "border-top-width": "1px", "border-top-style": "solid", "margin-top": "0px",
};
await check("P5 .code-block: F5's pre look — --muted, --border, 12px/1.5, pre, tab 2", async () => {
  const out = await expectAll([["#code-plain", null, CODE_BOX]]);
  const bg = await evaluate(`[getComputedStyle(__t.el("#code-plain")).backgroundColor, __t.surface("--muted"), getComputedStyle(__t.el("#code-plain")).borderTopColor, __t.probe("color", "var(--border)")]`);
  if (bg[0] !== bg[1]) out.push(`background ${bg[0]} is not --muted ${bg[1]}`);
  if (bg[2] !== bg[3]) out.push(`border ${bg[2]} is not --border ${bg[3]}`);
  return out;
});
await check("P5 a div.code-block computes the same box as a pre.code-block", async () => {
  const props = ["display", "padding-top", "padding-left", "font-family", "font-size", "line-height", "white-space", "tab-size", "color", "background-color", "border-top-width", "border-top-color"];
  const [pre, div] = await evaluate(`[${JSON.stringify("#code-plain")}, ${JSON.stringify("#code-div")}].map((s) => ${JSON.stringify(props)}.map((p) => getComputedStyle(__t.el(s)).getPropertyValue(p)))`);
  return props.filter((p, i) => pre[i] !== div[i]).map((p) => `${p}: pre ${pre[props.indexOf(p)]} vs div ${div[props.indexOf(p)]}`);
});
await check("P5 --wrap breaks a long line instead of scrolling it", async () => {
  const out = await expectAll([["#code-wrap", null, { "white-space": "pre-wrap", "overflow-wrap": "anywhere" }]]);
  const s = await evaluate(`[__t.el("#code-wrap").scrollWidth, __t.el("#code-wrap").clientWidth]`);
  if (s[0] > s[1]) out.push(`scrollWidth ${s[0]} > clientWidth ${s[1]}`);
  return out;
});
await check("P5 --scroll caps at --code-max-h and scrolls, without trapping the wheel", async () => {
  const out = await expectAll([["#code-scroll", null, { "max-height": "96px", "overflow-y": "auto", "overscroll-behavior-y": "auto" }]]);
  const s = await evaluate(`[__t.el("#code-scroll").scrollHeight, __t.el("#code-scroll").clientHeight]`);
  if (!(s[0] > s[1])) out.push(`scrollHeight ${s[0]} <= clientHeight ${s[1]} — it does not scroll`);
  return out;
});
await check("P5 .code-view: a counter gutter 3ch wide, end-aligned, muted, unselectable, with empty alt text", async () => {
  const out = await expectAll([
    ["#code-view", null, { "white-space": "pre-wrap" }],
    ["#code-view .line", null, { display: "block", "overflow-wrap": "anywhere" }],
    ["#code-view .line", "::before", { content: 'counter(line) / ""', "text-align": "end", color: { token: "--muted-foreground" }, "user-select": "none" }],
  ]);
  const w = await evaluate(`(() => { const s = document.createElement("span"); s.style.cssText = "display:inline-block;inline-size:3ch"; __t.el("#code-view").append(s); const w = s.getBoundingClientRect().width; s.remove(); return [parseFloat(getComputedStyle(__t.el("#code-view .line"), "::before").width), w]; })()`);
  if (Math.abs(w[0] - w[1]) > 0.5) out.push(`gutter ${w[0]}px, 3ch is ${w[1]}px`);
  return out;
});
await check("P5 a wrapped .code-view line continues at the text column, never under the number", async () => {
  // Column 0 is where line 1's "{" starts; the wrapped comment (line 5) must continue there, which is
  // .75rem right of the gutter — not back at the numbers.
  const g = await evaluate(`(() => {
    const first = document.querySelector("#code-view .line .tok-punct").firstChild;
    const r0 = document.createRange(); r0.selectNodeContents(first);
    const line = document.querySelectorAll("#code-view .line")[4];
    const text = line.querySelector(".tok-comment").firstChild;
    const range = document.createRange(); range.selectNodeContents(text);
    const rects = [...range.getClientRects()];
    const gutter = parseFloat(getComputedStyle(line, "::before").width);
    return { n: rects.length, col0: r0.getClientRects()[0].left, cont: rects[rects.length - 1].left,
             box: line.getBoundingClientRect().left, gutter };
  })()`);
  if (g.n < 2) return ["the long line did not wrap — the hanging gutter is untested"];
  const out = [];
  if (Math.abs(g.col0 - g.cont) > 0.5) out.push(`continuation starts at ${g.cont}, column 0 is at ${g.col0}`);
  if (!(g.cont >= g.box + g.gutter + 12 - 0.5)) out.push(`continuation at ${g.cont} is not clear of the ${g.gutter}px gutter + .75rem`);
  return out;
});
await check("P5 selecting a .code-view copies the file: its line breaks, and none of the numbers", async () => {
  const [sel, text] = await evaluate(`(() => {
    const r = document.createRange(); r.selectNodeContents(__t.el("#code-view"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const out = [s.toString(), __t.el("#code-view").textContent]; s.removeAllRanges(); return out;
  })()`);
  const out = [];
  if (sel !== text.replace(/\n$/, "")) out.push(`selection ${JSON.stringify(sel.slice(0, 60))}… differs from the file text`);
  if (/^\d/m.test(sel)) out.push("a line of the copied selection starts with a digit — a gutter number leaked");
  if (sel.split("\n").length !== 7) out.push(`copied ${sel.split("\n").length} lines, the view shows 7`);
  return out;
});
await check("P5 syntax colours: categorical hues, never the status tokens", () => expectAll([
  ["#code-view .tok-string", null, { color: { token: "--cat-green" } }],
  ["#code-view .tok-number", null, { color: { token: "--cat-amber" } }],
  ["#code-view .tok-key", null, { color: { token: "--primary" } }],
  ["#code-view .tok-keyword", null, { color: { token: "--primary" } }],
  ["#code-view .tok-punct", null, { color: { token: "--muted-foreground" } }],
  ["#code-view .tok-comment", null, { color: { token: "--muted-foreground" }, "font-style": "italic" }],
  ["#code-view .tok-literal", null, { color: { token: "--muted-foreground" }, "font-style": "italic" }],
  ["#code-view .tok-heading", null, { color: { token: "--foreground" }, "font-weight": "700" }],
]));
await check("P5 diff lines: add/del/hunk/meta tokens; a context line inherits", () => expectAll([
  ["#code-diff .diff-add", null, { color: { token: "--success" } }],
  ["#code-diff .diff-del", null, { color: { token: "--destructive" } }],
  ["#code-diff .diff-hunk", null, { color: { token: "--primary" } }],
  ["#code-diff .diff-meta", null, { color: { token: "--muted-foreground" } }],
  ["#code-diff", null, { color: { token: "--foreground" } }],
]));

/* ── P6 command block ───────────────────────────────────────────────────────────────────────── */

await check("P6 .cmd: the code box as a flex row, 8px 12px, the button does not shrink", () => expectAll([
  ["#cmd-one", null, {
    display: "flex", "align-items": "center", "column-gap": "8px", "padding-top": "8px", "padding-left": "12px",
    "border-top-width": "1px", "border-top-style": "solid",
  }],
  ["#cmd-one > button", null, { "flex-shrink": "0" }],
  ["#cmd-multi", null, { "align-items": "flex-start" }],
]));
await check("P6 .cmd-text cancels the inline-code box and wraps anywhere", async () => {
  const out = await expectAll([
    ["#cmd-one .cmd-text", null, {
      "flex-grow": "1", "min-width": "0px", "padding-left": "0px", "border-top-width": "0px",
      "background-color": "rgba(0, 0, 0, 0)", "white-space": "pre-wrap", "overflow-wrap": "anywhere",
      color: { token: "--foreground" }, "margin-top": "0px",
    }],
    ["#cmd-multi .cmd-text", null, { "margin-top": "0px", "padding-top": "0px", "border-top-width": "0px", "background-color": "rgba(0, 0, 0, 0)" }],
  ]);
  // The cancel only proves something if inline code HAS a box on this page.
  const box = await evaluate(`getComputedStyle(__t.el("#md-article > p code")).borderTopWidth`);
  if (box !== "1px") console.log(`        note: inline code has no box here (${box}), so the cancel is not exercised`);
  return out;
});
await check("P6 with a 28px button the row is 44px inside its border", async () => {
  const [cmd, btn] = await Promise.all([rect("#cmd-one"), rect("#cmd-one > button")]);
  const out = [];
  if (Math.abs(btn.h - 28) > 0.5) out.push(`button is ${btn.h}px, not 28 — C2 changed?`);
  if (Math.abs(cmd.h - 46) > 0.5) out.push(`row is ${cmd.h}px outside, want 44 + 2 borders`);
  return out;
});
await check("P6 a long command wraps and ends before the button, which stays in the box", async () => {
  const [cmd, text, btn] = await Promise.all([rect("#cmd-long"), rect("#cmd-long .cmd-text"), rect("#cmd-long > button")]);
  const out = [];
  if (!(text.h > 20)) out.push(`the command did not wrap (${text.h}px tall)`);
  if (text.r > btn.x - 8 + 0.5) out.push(`text right ${text.r} runs into the 8px gap before the button at ${btn.x}`);
  if (btn.r > cmd.r - 12 - 1 + 0.5) out.push(`button right ${btn.r} is outside the padding (${cmd.r - 13})`);
  return out;
});
await check("P6 a multi-line command puts the button at the top", async () => {
  const [cmd, btn] = await Promise.all([rect("#cmd-multi"), rect("#cmd-multi > button")]);
  return Math.abs(btn.y - (cmd.y + 1 + 8)) <= 0.5 ? [] : [`button top ${btn.y}, content top ${cmd.y + 9}`];
});

/* ── P7 copy states ─────────────────────────────────────────────────────────────────────────── */

const icoIs = (sel, token) => evaluate(`getComputedStyle(__t.el(${JSON.stringify(sel)})).getPropertyValue("--ico").trim() === getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(token)}).trim()`);
await check("P7 copied: the glyph is the check, in --success", async () => {
  const out = await expectAll([["#states-icon .btn-icon:not(.btn-icon--bare)[data-state=copied]", null, { color: { token: "--success" } }]]);
  if (!(await icoIs("#states-icon .btn-icon:not(.btn-icon--bare)[data-state=copied]", "--ico-check"))) out.push("--ico is not --ico-check");
  if (!(await icoIs("#states-icon .btn-icon:not(.btn-icon--bare):not([data-state])", "--ico-copy"))) out.push("at rest --ico is not --ico-copy");
  return out;
});
await check("P7 failed: the glyph is the x, in --destructive", async () => {
  const out = await expectAll([["#states-icon .btn-icon:not(.btn-icon--bare)[data-state=failed]", null, { color: { token: "--destructive" } }]]);
  if (!(await icoIs("#states-icon .btn-icon:not(.btn-icon--bare)[data-state=failed]", "--ico-x"))) out.push("--ico is not --ico-x");
  return out;
});
await check("P7 a bare copied button stays --success, at rest AND under the pointer", async () => {
  const sel = "#states-icon .btn-icon--bare[data-state=copied]";
  const out = await expectAll([[sel, null, { color: { token: "--success" } }]]);
  await hover(sel);
  out.push(...(await expectAll([[sel, null, { color: { token: "--success" } }]])));
  return out;
});
await check("P7 the text form takes the state colour too", () => expectAll([
  ["#states-text [data-state=copied]", null, { color: { token: "--success" } }],
  ["#states-text [data-state=failed]", null, { color: { token: "--destructive" } }],
]));

/* ── P8 meta ────────────────────────────────────────────────────────────────────────────────── */

await check("P8 .meta: a muted, wrapping flex line, 4px 8px gaps, no margin", () => expectAll([
  ["#meta-article", null, {
    display: "flex", "flex-wrap": "wrap", "align-items": "baseline", "row-gap": "4px", "column-gap": "8px",
    "margin-top": "0px", "margin-bottom": "0px", color: { token: "--muted-foreground" },
  }],
  ["#meta-kv .meta-val", null, { color: { token: "--foreground" } }],
]));
await check("P8 .meta-stat: glyph + tabular count; the glyph is 12px whatever class it carries, tinted through --tone", () => expectAll([
  // inline-flex, blockified to flex because .meta is itself a flex row
  ["#meta-stats .meta-stat", null, { display: { re: "^(inline-)?flex$" }, "align-items": "center", "column-gap": "4px", "font-variant-numeric": "tabular-nums" }],
  ["#meta-stats .meta-stat:first-child > .ico", null, { width: "12px", height: "12px", "background-color": { token: "--cat-teal" } }],
  ["#meta-stats .meta-stat:last-child > .ico", null, { width: "12px", height: "12px", "background-color": { token: "--cat-violet" } }],
]));

/* ── P10 boot log ───────────────────────────────────────────────────────────────────────────── */

await check("P10 .boot-log: muted rows .375rem apart; 14rem step column; [ ok ] bold --primary with no alt text", () => expectAll([
  ["#boot", null, { display: "grid", "row-gap": "6px", color: { token: "--muted-foreground" } }],
  ["#boot .boot-line", null, { display: "grid", "grid-template-columns": { re: "^224px \\d" }, "column-gap": "8px", "margin-top": "0px", "align-items": "baseline" }],
  ["#boot .boot-step", null, { "white-space": "nowrap" }],
  ["#boot .boot-step", "::before", { content: '"[ ok ]" / ""', "font-weight": "700", color: { token: "--primary" } }],
  ["#boot .boot-val", null, { color: { token: "--foreground" } }],
  ["#boot .boot-note", null, { "margin-top": "0px", "margin-bottom": "0px" }],
]));
await check("P10 the [ ok ] marker sits 1ch before the step name", async () => {
  const [mr, ch] = await evaluate(`(() => { const s = document.createElement("span"); s.style.cssText = "display:inline-block;inline-size:1ch"; __t.el("#boot .boot-step").append(s); const w = s.getBoundingClientRect().width; s.remove(); return [parseFloat(getComputedStyle(__t.el("#boot .boot-step"), "::before").marginRight), w]; })()`);
  return Math.abs(mr - ch) <= 0.5 ? [] : [`margin ${mr}px, 1ch is ${ch}px`];
});

/* ── S9 the error page body (demo frames) ───────────────────────────────────────────────────── */

await check("S9 404: the display title 1.5rem under the prompt, the lede .5rem under it, the way out 1.5rem further", () => expectAll([
  ["#s9-404 .page-title", null, { "font-size": "36px", "margin-top": "24px", color: { token: "--primary" } }],
  ["#s9-404 .lede", null, { "margin-top": "8px" }],
  ["#s9-404 .lede + p", null, { "margin-top": "24px" }],
]));
await check("S9 crash: the same title, and the body is an alert", async () => {
  const out = await expectAll([["#s9-crash .page-title", null, { "font-size": "36px" }]]);
  if ((await evaluate(`__t.el("#s9-crash > div").getAttribute("role")`)) !== "alert") out.push("the crash body is not role=alert");
  return out;
});

/* ── nothing is rounded ─────────────────────────────────────────────────────────────────────── */

await check("no border-radius on any element or pseudo-element content.css styles", () => evaluate(`(() => {
  const sel = ".page-title, .lede, .eyebrow, .section-head, .subhead, .markdown, .markdown *, ol.steps, ol.steps > li, ul.plain, ul.dash, ul.dash > li, .code-block, .code-view .line, .cmd, .cmd-text, [data-copy], .meta, .meta-stat, .boot-log, .boot-line, .boot-step";
  const out = [];
  for (const e of document.querySelectorAll(sel)) for (const pseudo of [null, "::before"]) {
    const s = getComputedStyle(e, pseudo);
    for (const c of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"])
      if (s[c] !== "0px") out.push(e.tagName.toLowerCase() + "." + e.className + (pseudo || "") + " " + c + " " + s[c]);
  }
  return out.slice(0, 8);
})()`));

/* ── print ──────────────────────────────────────────────────────────────────────────────────── */

await send("Emulation.setEmulatedMedia", { media: "print" });
await check("print: copy buttons are gone, code and commands wrap uncapped, the title loses its glow", async () => {
  const out = await evaluate(`[...document.querySelectorAll("[data-copy]")].filter((b) => getComputedStyle(b).display !== "none").map((b) => "a [data-copy] button still displays: " + (b.getAttribute("aria-label") || b.textContent))`);
  out.push(...(await expectAll([
    ["#code-plain", null, { "white-space": "pre-wrap", "overflow-wrap": "anywhere" }],
    ["#code-scroll", null, { "max-height": "none", "overflow-y": "visible" }],
    ["#cmd-one .cmd-text", null, { "white-space": "pre-wrap" }],
    ["#p1-app .page-title", null, { "text-shadow": "none" }],
  ])));
  return out;
});
await send("Emulation.setEmulatedMedia", { media: "" });

/* ── `hidden` hides every component (X3: tokens.css answers it once) ─────────────────────────── */

// Every class here that sets `display` outranks the user agent's [hidden] rule, so this fails unless
// tokens.css carries [hidden]:not([hidden="until-found"]) { display: none !important } (WP1) — or the
// demo's marked stand-in for it, which the header line above names while WP1 has not landed.
const HIDDEN = ["#p1-app .page-title", "#p1-app .lede", "#p1-glyph .page-title > .ico", "#eyebrow-plain", "#head-link",
  "#subheads .subhead", "#md-article", "#list-steps", "#list-plain", "#list-dash", "#code-plain", "#code-div",
  "#code-view .line", "#cmd-one", "#cmd-one .cmd-text", "#cmd-one > button", "#states-text [data-state=copied]",
  "#meta-article", "#meta-stats .meta-stat", "#boot", "#boot .boot-line"];
const hiddenHides = () => evaluate(`${JSON.stringify(HIDDEN)}.flatMap((sel) => {
  const e = __t.el(sel); e.hidden = true; const d = getComputedStyle(e).display; e.hidden = false;
  return d === "none" ? [] : [sel + " is display:" + d + " with hidden set"];
})`);
await check("hidden hides every content.css component (tokens.css + the full page)", hiddenHides);

/* ── forced colours (X1): every glyph still draws, every state still differs ────────────────── */

// Forced colours replace author colours with the user's palette, and a user picks a LIGHT or a DARK
// one — so every theme is run under both. A mask glyph is a background: painted in Canvas it is
// gone, and painted in an author colour — which is what forced-color-adjust: none keeps, and what a
// glyph with a `color` of its own keeps even under preserve-parent-color — it can land ON Canvas
// (mono's white --primary on a light palette measured 1.00:1). So the assertion is the CONTRAST of
// what is painted against what it is painted on, never merely "not Canvas" (X1, corrected).
// A fresh load per theme: under forced colours Chromium does not restyle a pseudo-element that
// opted out with forced-color-adjust: none when data-theme changes.
//
// Computed colours are only half of it. Chromium paints a Canvas BACKPLATE behind every run of text
// in this mode, and it is visible in no computed value, so a word can vanish while its computed
// pair reads 21:1 (WP7 measured 1.14:1 that way). So each glyph and each word that carries a state
// is also CAPTURED and decoded, twice — as drawn and with only it hidden — and the pixels that change
// are measured against themselves without it (inkDiff, below). Twice the pixel density, so a 1px
// stroke covers whole pixels. (The decoder is WP7's, check-feedback.mjs.)
const decodePng = (png) => { // 8-bit RGB or RGBA, not interlaced: what Page.captureScreenshot writes
  let pos = 8, width = 0, height = 0, bpp = 4;
  const idat = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos), type = png.toString("ascii", pos + 4, pos + 8), data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bpp = data[9] === 6 ? 4 : 3; }
    if (type === "IDAT") idat.push(data);
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)], line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0, p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * stride + x] = (raw[line + x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
  }
  const lum = (i, px = out) => [0, 1, 2].map((k) => px[i + k] / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
  let lo = 1, hi = 0;
  const counts = new Map();
  for (let i = 0; i < out.length; i += bpp) {
    const l = lum(i); lo = Math.min(lo, l); hi = Math.max(hi, l);
    const key = out.readUIntBE(i, 3); counts.set(key, (counts.get(key) || 0) + 1);
  }
  const [top] = [...counts].sort((p, q) => q[1] - p[1])[0];
  const mode = [top >> 16, (top >> 8) & 255, top & 255];
  // `mode`: the colour most of the capture is painted in, and its relative luminance
  return { width, height, bpp, px: out, lum, ratio: (hi + 0.05) / (lo + 0.05), mode, modeLum: lum(0, Buffer.from(mode)) };
};
// OWNERSHIP BY DIFFERENCE (X1, as WP6's re-review refined it). The same clip is taken twice: as drawn,
// and with ONLY the thing being measured hidden. The pixels that change are that thing's ink and
// nothing else's — a neighbour's border or fill is identical in both shots and counts for nothing —
// and the ratio is read from them alone: each changed pixel as drawn against the same pixel without
// it. Fewer than 3 changed pixels means the target paints nothing visible (ink the colour of its
// ground: mono's glyph on a light palette did exactly that) or the clip does not hold it.
const inkDiff = (drawn, bare) => {
  let changed = 0, ratio = 1, x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let i = 0; i < drawn.px.length; i += drawn.bpp) {
    if (Math.max(...[0, 1, 2].map((k) => Math.abs(drawn.px[i + k] - bare.px[i + k]))) <= 2) continue;
    changed += 1;
    const [a, b] = [drawn.lum(i), bare.lum(i, bare.px)].sort((p, q) => q - p);
    ratio = Math.max(ratio, (a + 0.05) / (b + 0.05));
    const x = (i / drawn.bpp) % drawn.width, y = Math.floor(i / drawn.bpp / drawn.width);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // `boxRatio`: brightest against darkest in the DRAWN shot, inside the box the changed pixels span.
  let lo = 1, hi = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const l = drawn.lum((y * drawn.width + x) * drawn.bpp); lo = Math.min(lo, l); hi = Math.max(hi, l);
  }
  return { changed, ratio, boxRatio: changed ? (hi + 0.05) / (lo + 0.05) : 1 };
};
// How each kind is hidden: a button's glyph is its ::before (the button, its border and its fill stay);
// an element glyph is the element; a word goes transparent and loses its backplate, the box stays (for
// a word the diff only locates it; its ratio is read from the drawn shot, see below).
const HIDE_PROBE = `<style id="own-probe">
  [data-own-probe="pseudo"]::before { visibility: hidden !important; }
  [data-own-probe="self"] { visibility: hidden !important; }
  [data-own-probe="text"] { forced-color-adjust: none !important; color: transparent !important; }
</style>`;
const PAINTED = [
  ...["#states-icon .btn-icon:not(.btn-icon--bare):not([data-state])", "#states-icon .btn-icon:not(.btn-icon--bare)[data-state=copied]",
    "#states-icon .btn-icon:not(.btn-icon--bare)[data-state=failed]", "#states-icon .btn-icon--bare[data-state=copied]", "#cmd-one > button",
    "#p1-glyph .page-title > .ico", "#meta-stats .meta-stat:first-child > .ico", "#meta-stats .meta-stat:last-child > .ico"].map((sel) => [sel, "glyph", 3]),
  ...["#states-text [data-state=copied]", "#states-text [data-state=failed]"].map((sel) => [sel, "text", 4.5]),
];
// A FOCUS RING IS PAINTED TOO (X1). An element that opts out with forced-color-adjust: none stops
// having its outline-color forced and keeps the author's --ring (WP7 measured 1.00-2.94:1 that way).
// Nothing content.css draws opts out, and this is where one that did would show: each focusable
// element's ring, read in pixels, against what it sits on. The strip is the middle of the ring's
// left side, taken from the element's FOCUSED outline; captured blurred it is the backdrop, focused
// it is the ring, and the two most-painted colours must reach 3:1.
const FOCUSABLE = ["#code-plain", "#code-view", "#md-article a", "#cmd-one > button", "#states-text [data-state=copied]"];
const ringYield = { captures: 0, lowest: Infinity };
const focusRings = async () => {
  const problems = [];
  for (const sel of FOCUSABLE) {
    if (!(await focusByTab(sel))) { problems.push(`${sel}: a real Tab did not land on it`); continue; }
    const clip = await evaluate(`(() => {
      const el = __t.el(${JSON.stringify(sel)});
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const r = el.getClientRects()[0], cs = getComputedStyle(el);
      const w = parseFloat(cs.outlineWidth), off = parseFloat(cs.outlineOffset);
      if (!(w > 0)) return null;
      return { x: r.left - off - w / 2 - 0.5 + scrollX, y: r.top + 2 + scrollY, width: 1, height: Math.max(1, r.height - 4), scale: 1 };
    })()`);
    if (!clip) { problems.push(`${sel}: no outline when focused from the keyboard`); continue; }
    const shot = async () => decodePng(Buffer.from((await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false })).data, "base64"));
    const ring = await shot();
    await evaluate(`document.activeElement?.blur(); null`);
    const ground = await shot();
    ringYield.captures += 2;
    const [hi, lo] = [ring.modeLum, ground.modeLum].sort((p, q) => q - p);
    const ratio = (hi + 0.05) / (lo + 0.05);
    ringYield.lowest = Math.min(ringYield.lowest, ratio);
    if (!(ratio >= 3)) problems.push(`${sel}: the focused ring is rgb(${ring.mode}) on rgb(${ground.mode}), ${ratio.toFixed(2)}:1, wants 3`);
  }
  return problems;
};
// The yield, printed once after every cell has run: how many captures decoded, and the lowest ratio
// of each kind. A pass says nothing fell under the bar; this says what the pixels actually were.
const paintedYield = { captures: 0, owned: 0, glyph: Infinity, text: Infinity };
const painted = async () => {
  const problems = [];
  for (const [sel, kind, min] of PAINTED) {
    // A glyph: the box inside the border, where nothing but the glyph is drawn. A word: the box of its
    // text, where a backplate would sit. Both inset one CSS pixel: a box edge that falls between device
    // pixels paints a blended row, and a border's or a fill's row would lend the capture a contrast
    // its glyph or word does not have.
    const clip = await evaluate(`(() => {
      const el = __t.el(${JSON.stringify(sel)});
      el.scrollIntoView({ block: "center", behavior: "instant" });
      let r;
      if (${JSON.stringify(kind)} === "text") { const range = document.createRange(); range.selectNodeContents(el); r = range.getBoundingClientRect(); }
      else {
        const b = el.getBoundingClientRect(), cs = getComputedStyle(el), px = (p) => parseFloat(cs.getPropertyValue(p));
        r = { left: b.left + px("border-left-width"), top: b.top + px("border-top-width"),
          width: b.width - px("border-left-width") - px("border-right-width"), height: b.height - px("border-top-width") - px("border-bottom-width") };
      }
      return { x: r.left + 1 + scrollX, y: r.top + 1 + scrollY, width: r.width - 2, height: r.height - 2, scale: 1 };
    })()`);
    // NOT captureBeyondViewport: it lays the page out again at full height with no scrollbar, and this
    // page's centred column moves 7.5px right under a clip measured before it (measured: the at-rest
    // glyph's capture held its button's border, and a glyph painted at 1.34:1 passed at 21:1). The
    // element is scrolled into view above, so the viewport as it is holds it.
    const shot = async () => decodePng(Buffer.from((await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false })).data, "base64"));
    const drawn = await shot();
    await evaluate(`(() => {
      if (!document.getElementById("own-probe")) document.head.insertAdjacentHTML("beforeend", ${JSON.stringify(HIDE_PROBE)});
      const el = __t.el(${JSON.stringify(sel)});
      el.dataset.ownProbe = ${JSON.stringify(kind)} === "text" ? "text" : el.classList.contains("ico") ? "self" : "pseudo";
    })(); null`);
    const bare = await shot();
    await evaluate(`delete __t.el(${JSON.stringify(sel)}).dataset.ownProbe; null`);
    // A WORD's ratio is read inside the drawn shot, brightest pixel against darkest, over the box its
    // changed pixels span — the word and its backplate, nothing of the button around them. Neither
    // simpler reading holds. Changed pixel against itself hidden: hiding the word with
    // forced-color-adjust: none also drops the backplate and brings the fill back, so it measures
    // backplate against fill. The whole text clip: the line box is taller than the backplate, so the
    // fill shows above and below it. A word painted Canvas-on-Canvas into a CanvasText box read 21:1
    // both ways (the reviewer's MX6); inside the changed box it is one flat colour.
    const diff = inkDiff(drawn, bare), changed = diff.changed, ratio = kind === "text" ? diff.boxRatio : diff.ratio;
    paintedYield.captures += 1;
    paintedYield[kind] = Math.min(paintedYield[kind], ratio);
    if (changed < 3) { problems.push(`${sel} (${kind}): hiding it changes ${changed} pixel(s) in the clip — it paints nothing visible there, or the clip does not hold it`); continue; }
    paintedYield.owned += 1;
    if (!(ratio >= min)) problems.push(kind === "text" ? `${sel} (text): the word and its backplate read ${ratio.toFixed(2)}:1 brightest to darkest, wants ${min}`
      : `${sel} (${kind}): its own ink reaches ${ratio.toFixed(2)}:1 over ${changed} changed pixels, wants ${min}`);
  }
  return problems;
};
for (const theme of THEMES) {
  await load(`?theme=${theme}`);
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
    await check(`forced colours, ${theme}, ${scheme} palette: glyphs >= 3:1 and text >= 4.5:1 on what they sit on, the copy states differ in shape`, async () => {
      if (!(await evaluate(`matchMedia("(forced-colors: active)").matches`))) return ["could not emulate forced colours — this check proved nothing"];
      return evaluate(`(() => {
        const out = [];
        const ICON = "#states-icon .btn-icon:not(.btn-icon--bare)";
        // A pseudo-element glyph sits on its own element's box; an element glyph on its parent's.
        const glyphs = [
          [ICON + ":not([data-state])", "::before"], [ICON + "[data-state=copied]", "::before"], [ICON + "[data-state=failed]", "::before"],
          ["#states-icon .btn-icon--bare[data-state=copied]", "::before"], ["#cmd-one > button", "::before"],
          ["#p1-glyph .page-title > .ico", null], ["#meta-stats .meta-stat:first-child > .ico", null], ["#meta-stats .meta-stat:last-child > .ico", null],
        ];
        for (const [sel, pseudo] of glyphs) {
          const e = __t.el(sel);
          const paint = getComputedStyle(e, pseudo).backgroundColor;
          const under = __t.backdrop(pseudo ? e : e.parentElement);
          const r = paint === "rgba(0, 0, 0, 0)" ? 1 : __t.ratio(paint, under);
          if (r < 3) out.push(sel + (pseudo || "") + " glyph " + paint + " is " + r.toFixed(2) + ":1 on " + under);
        }
        // Text that carries a state (the copy button's words) and text drawn as a mark.
        const TEXT = [["#list-dash > li", "::before"], ["#list-steps > li", "::before"], ["#boot .boot-step", "::before"], ["#code-view .line", "::before"],
          ["#md-article a", null], ["#states-text [data-state=copied]", null], ["#states-text [data-state=failed]", null]];
        for (const [sel, pseudo] of TEXT) {
          const e = __t.el(sel);
          const under = __t.backdrop(e);
          const r = __t.ratio(getComputedStyle(e, pseudo).color, under);
          if (r < 4.5) out.push(sel + (pseudo || "") + " text is " + r.toFixed(2) + ":1 on " + under);
        }
        const mask = (sel) => { const st = getComputedStyle(__t.el(sel), "::before"); return st.maskImage || st.webkitMaskImage; };
        const [rest, copied, failed] = [":not([data-state])", "[data-state=copied]", "[data-state=failed]"].map((x) => mask(ICON + x));
        if (rest === copied || rest === failed || copied === failed) out.push("two of copy / copied / failed draw the same glyph");
        if (getComputedStyle(__t.el("#md-article a")).textDecorationLine !== "underline") out.push("the markdown link lost its underline");
        return out;
      })()`);
    });
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
    await evaluate(`document.documentElement.classList.add("anim-off"); null`);
    await check(`forced colours, ${theme}, ${scheme} palette, PAINTED: every glyph reaches 3:1 and every state word 4.5:1 (pixels read back)`, painted);
    await check(`forced colours, ${theme}, ${scheme} palette, FOCUS: every focused ring reaches 3:1 on what it sits on (pixels read back)`, focusRings);
    await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
}
console.log(`painted under forced colours: ${paintedYield.captures} of ${PAINTED.length * THEMES.length * 2} captures decoded, ` +
  `${paintedYield.owned} holding their own element's ink (measured from the pixels hiding it changes); ` +
  `lowest glyph ${paintedYield.glyph.toFixed(2)}:1, lowest state word ${paintedYield.text.toFixed(2)}:1; ` +
  `focus rings: ${ringYield.captures} of ${FOCUSABLE.length * THEMES.length * 2 * 2} captures, lowest ${ringYield.lowest.toFixed(2)}:1`);

// THE FALLBACK BRANCH. Chromium supports preserve-parent-color, so every run above measured only
// that branch, and the `@supports not` one — `none` and a CanvasText fill — would ship unmeasured.
// So every `@supports` rule that asks about it, in every sheet the page loads (the real files and the
// stand-ins alike), is swapped for one asking about a value no engine knows: the supporting branch
// turns off, the other on. The count is reported, and zero fails — then this measured nothing.
const FORCE_FALLBACK = `(() => {
  let swapped = 0;
  const walk = (list) => {
    for (let i = 0; i < list.cssRules.length; i += 1) {
      const r = list.cssRules[i];
      if (r instanceof CSSImportRule) { if (r.styleSheet) walk(r.styleSheet); continue; }
      if (r instanceof CSSSupportsRule && r.conditionText.includes("preserve-parent-color")) {
        const text = r.cssText, at = text.indexOf("{");
        list.deleteRule(i);
        list.insertRule(text.slice(0, at).replaceAll("preserve-parent-color", "preserve-parent-colour-x") + text.slice(at), i);
        swapped += 1;
      } else if (r.cssRules) walk(r);
    }
  };
  for (const sheet of document.styleSheets) walk(sheet);
  return swapped;
})()`;
const fallbackYield = { swapped: [], captures: 0 };
for (const theme of THEMES) {
  await load(`?theme=${theme}`);
  const swapped = await evaluate(FORCE_FALLBACK);
  fallbackYield.swapped.push(swapped);
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
    await evaluate(`document.documentElement.classList.add("anim-off"); null`);
    await check(`forced colours, ${theme}, ${scheme} palette, FALLBACK (no preserve-parent-color): every glyph 3:1, every state word 4.5:1 (pixels read back)`, async () => {
      if (!swapped) return ["no @supports (forced-color-adjust: preserve-parent-color) rule found to swap — the fallback branch was not measured"];
      const adjust = await evaluate(`getComputedStyle(__t.el("#states-icon .btn-icon:not(.btn-icon--bare)[data-state=copied]"), "::before").forcedColorAdjust`);
      if (adjust !== "none") return [`the copy glyph is forced-color-adjust: ${adjust} after the swap, want none — still on the supporting branch`];
      const before = paintedYield.captures;
      const problems = await painted();
      fallbackYield.captures += paintedYield.captures - before;
      return problems;
    });
    await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
}
console.log(`forced colours down the fallback branch: @supports rules swapped per load ${fallbackYield.swapped.join(" / ")}; ` +
  `${fallbackYield.captures} of ${PAINTED.length * THEMES.length * 2} captures decoded`);
await load("?theme=warm");

/* ── the same classes on tokens.css alone ───────────────────────────────────────────────────── */

const IDENTITY = [
  ["#p1-app .page-title", null, ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color", "margin-top", "margin-bottom", "text-shadow", "overflow-wrap"]],
  ["#p1-app .lede", null, ["font-family", "font-size", "color", "margin-top", "margin-bottom"]],
  ["#p1-display .page-title", null, ["font-size"]],
  ["#p1-glyph .page-title > .ico", null, ["width", "height", "margin-right", "vertical-align"]],
  ["#eyebrow-plain", null, ["font-family", "font-size", "font-weight", "letter-spacing", "text-transform", "color", "margin-top", "margin-bottom", "line-height"]],
  ["#eyebrow-warning", null, ["color"]],
  ["#head-link", null, ["display", "flex-wrap", "align-items", "justify-content", "row-gap", "column-gap", "margin-bottom"]],
  ["#head-link > h2", null, ["margin-top", "margin-bottom"]],
  ["#head-link > a", null, ["flex-shrink", "white-space"]],
  ["#head-button", null, ["align-items"]],
  ["#head-time > time", null, ["color"]],
  ["#subheads .subhead:nth-of-type(2)", null, ["margin-top", "margin-bottom", "font-size", "font-weight", "line-height"]],
  ["#md-article", null, ["line-height", "overflow-wrap"]],
  ["#md-article > p", null, ["margin-top", "margin-bottom"]],
  ["#md-article > h2", null, ["font-family", "font-size", "font-weight", "color", "margin-top", "line-height"]],
  ["#md-article > h3", null, ["font-size"]],
  ["#md-article > ul", null, ["list-style-type", "padding-left"]],
  ["#md-article > ol", null, ["list-style-type", "padding-left"]],
  ["#md-article > ul > li + li", null, ["margin-top"]],
  ["#md-article > ul > li", "::marker", ["color"]],
  ["#md-article a", null, ["color", "text-decoration-line", "text-underline-offset"]],
  ["#md-article del", null, ["color"]],
  ["#md-article > hr", null, ["margin-top", "margin-bottom"]],
  ["#nest-li-p1", null, ["margin-top", "margin-bottom"]],
  ["#nest-li-p2", null, ["margin-top", "margin-bottom"]],
  ["#nest-li-pre", null, ["margin-top", "margin-bottom"]],
  ["#nest-bq-p2", null, ["margin-top", "margin-bottom"]],
  ["#nest-plain", null, ["margin-top"]],
  ["#nest-steps", null, ["margin-top"]],
  ["#nest-dash", null, ["margin-top"]],
  ["#list-steps > li", null, ["padding-left", "margin-top"]],
  ["#list-steps > li", "::before", ["color", "font-weight", "width", "text-align", "position"]],
  ["#list-plain", null, ["list-style-type", "padding-left", "margin-top"]],
  ["#list-dash > li", null, ["padding-left", "position"]],
  ["#list-dash > li", "::before", ["content", "color", "position"]],
  ["#code-plain", null, ["display", "padding-top", "padding-left", "font-family", "font-size", "line-height", "white-space", "tab-size", "color", "background-color", "border-top-width", "border-top-color", "margin-top"]],
  ["#code-div", null, ["padding-top", "font-family", "font-size", "line-height", "white-space", "background-color"]],
  ["#code-view .line", null, ["display", "padding-left"]],
  ["#code-view .line", "::before", ["content", "width", "margin-left", "margin-right", "text-align", "color", "user-select"]],
  ["#code-view .tok-string", null, ["color"]],
  ["#code-view .tok-comment", null, ["color", "font-style"]],
  ["#code-diff .diff-add", null, ["color"]],
  ["#cmd-one", null, ["display", "align-items", "column-gap", "padding-top", "padding-left", "background-color", "border-top-width"]],
  ["#cmd-one .cmd-text", null, ["font-family", "font-size", "flex-grow", "min-width", "padding-left", "border-top-width", "background-color", "white-space", "overflow-wrap", "color"]],
  ["#cmd-multi .cmd-text", null, ["font-family", "font-size", "line-height", "margin-top", "white-space"]],
  ["#states-icon .btn-icon--bare[data-state=copied]", null, ["color", "--ico"]],
  ["#meta-article", null, ["font-family", "font-size", "display", "flex-wrap", "row-gap", "column-gap", "color", "margin-top"]],
  ["#meta-stats .meta-stat:first-child > .ico", null, ["width", "height"]],
  ["#boot", null, ["display", "row-gap", "color"]],
  ["#boot .boot-line", null, ["grid-template-columns", "column-gap", "margin-top"]],
  ["#boot .boot-step", null, ["font-family", "font-size"]],
  ["#boot .boot-step", "::before", ["content", "font-weight", "color", "margin-right"]],
  ["#boot .boot-val", null, ["color"]],
];
// The value column of a boot line is whatever width is left, and the card around it only exists on
// the full page — so for grid-template-columns only the first track (the step column) is compared.
const snapshot = () => evaluate(`${JSON.stringify(IDENTITY)}.map(([sel, pseudo, props]) => props.map((p) => {
  const v = getComputedStyle(__t.el(sel), pseudo).getPropertyValue(p).trim();
  return p === "grid-template-columns" ? v.split(" ")[0] : v;
}))`);
const full = await snapshot();
await load("?theme=warm&bare");
await standins("?bare", await evaluate("document.documentElement.dataset.standins"));
await check("?bare: reset, base, components, chrome and utilities dropped — the page really lost them", async () => {
  const n = await evaluate(`[...document.styleSheets].map((s) => (s.href || "").split("/").pop()).filter((f) => /^(reset|base|components|chrome|utilities)\\.css$/.test(f)).length`);
  return n === 0 ? [] : [`${n} of those stylesheets are still loaded`];
});
await check("?bare: every content.css class computes exactly what it computes on the full page", async () => {
  const bare = await snapshot();
  const out = [];
  IDENTITY.forEach(([sel, pseudo, props], i) => props.forEach((p, j) => {
    if (full[i][j] !== bare[i][j]) out.push(`${sel}${pseudo || ""} ${p}: full ${JSON.stringify(full[i][j])} vs bare ${JSON.stringify(bare[i][j])}`);
  }));
  return out;
});

await check("?bare: hidden still hides every component — tokens.css is all that is left", hiddenHides);
await check("?bare: the markdown rhythm holds at any depth with no user-agent margin leaking in; a row and a grid stay level", nestedRhythm);
// X2: base.css draws a global :focus-visible ring, so on the full page these would pass with the
// component's own rule deleted. Here nothing but content.css can draw them.
await check("?bare: a scrollable .code-block takes the --ring focus ring from a real Tab", () => ringByTab("#code-plain"));
await check("?bare: a .markdown link takes the --ring focus ring from a real Tab", () => ringByTab("#md-article a"));

/* ── a phone ────────────────────────────────────────────────────────────────────────────────── */

await load("?theme=warm", { width: 375, height: 812 });
await check("375px: the display title steps down to 30px on a 36px line (1.2); the app title stays 24px", () => expectAll([
  ["#p1-display .page-title", null, { "font-size": "30px", "line-height": { px: 36 } }],
  ["#p1-app .page-title", null, { "font-size": "24px" }],
]));
await check("375px: a boot line is one column, the value under its step", async () => {
  const out = await expectAll([["#boot .boot-line", null, { "grid-template-columns": { re: "^\\d+(\\.\\d+)?px$" } }]]);
  const [step, val] = await Promise.all([rect("#boot .boot-line .boot-step"), rect("#boot .boot-line .boot-val")]);
  if (!(val.y >= step.b - 0.5)) out.push(`value top ${val.y} is not under the step (bottom ${step.b})`);
  return out;
});
await check("375px: nothing on the page scrolls sideways", async () => {
  const [sw, cw] = await evaluate(`[document.documentElement.scrollWidth, document.documentElement.clientWidth]`);
  return sw <= cw ? [] : [`page is ${sw}px wide in a ${cw}px viewport`];
});

/* ── contrast: every colour this file puts on text or a glyph, four themes, three surfaces ─── */

const ON_SURFACES = [
  // [label, selector, pseudo, minimum]
  ["page title --primary", "#p1-app .page-title", null, 4.5],
  ["lede --muted-foreground", "#p1-app .lede", null, 4.5],
  ["eyebrow (muted)", "#eyebrow-plain", null, 4.5],
  ["eyebrow data-tone=warning", "#eyebrow-warning", null, 4.5],
  ["eyebrow data-tone=primary", "#eyebrow-primary", null, 4.5],
  ["section-head <time>", "#head-time > time", null, 4.5],
  ["markdown body", "#md-article > p", null, 4.5],
  ["markdown heading", "#md-article > h2", null, 4.5],
  ["markdown link", "#md-article a", null, 4.5],
  ["markdown list marker", "#md-article > ul > li", "::marker", 4.5],
  ["markdown del", "#md-article del", null, 4.5],
  ["embedded markdown body (muted)", "#md-embedded > p", null, 4.5],
  ["ol.steps number", "#list-steps > li", "::before", 4.5],
  ["ul.dash dash", "#list-dash > li", "::before", 4.5],
  ["meta (muted)", "#meta-article", null, 4.5],
  ["meta-val", "#meta-kv .meta-val", null, 4.5],
  ["boot step / note (muted)", "#boot .boot-step", null, 4.5],
  ["boot [ ok ]", "#boot .boot-step", "::before", 4.5],
  ["boot value", "#boot .boot-val", null, 4.5],
  ["copy text: copied", "#states-text [data-state=copied]", null, 4.5],
  ["copy text: failed", "#states-text [data-state=failed]", null, 4.5],
  ["copy glyph: copied (non-text)", "#states-icon .btn-icon--bare[data-state=copied]", null, 3],
  ["copy glyph: failed (non-text)", "#states-icon .btn-icon--bare[data-state=failed]", null, 3],
  // An .ico paints its background; tinted through --tone, the tint IS the background.
  ["meta-stat glyph --cat-teal (non-text)", "#meta-stats .meta-stat:first-child > .ico", null, 3, "background-color"],
  ["meta-stat glyph --cat-violet (non-text)", "#meta-stats .meta-stat:last-child > .ico", null, 3, "background-color"],
];
const ON_MUTED = [
  ["code text", "#code-plain", null, 4.5],
  ["code gutter number", "#code-view .line", "::before", 4.5],
  ["tok-comment / literal / punct", "#code-view .tok-comment", null, 4.5],
  ["tok-string --cat-green", "#code-view .tok-string", null, 4.5],
  ["tok-number --cat-amber", "#code-view .tok-number", null, 4.5],
  ["tok-keyword / key --primary", "#code-view .tok-keyword", null, 4.5],
  ["diff-add --success", "#code-diff .diff-add", null, 4.5],
  ["diff-del --destructive", "#code-diff .diff-del", null, 4.5],
  ["diff-hunk --primary", "#code-diff .diff-hunk", null, 4.5],
  ["cmd text", "#cmd-one .cmd-text", null, 4.5],
  ["copy glyph at rest in .cmd (non-text)", "#cmd-one > button", null, 3],
];
const table = new Map();
for (const theme of THEMES) {
  await load(`?theme=${theme}`);
  await check(`contrast, ${theme}: every text pairing >= 4.5:1 and every glyph >= 3:1`, async () => {
    const rows = await evaluate(`(() => {
      const surfaces = ["--background", "--card", "--muted"].map((s) => __t.surface(s));
      const fg = (sel, pseudo, prop) => getComputedStyle(__t.el(sel), pseudo).getPropertyValue(prop || "color");
      const onSurfaces = ${JSON.stringify(ON_SURFACES)}.map(([label, sel, pseudo, min, prop]) => [label, min, surfaces.map((bg) => __t.ratio(fg(sel, pseudo, prop), bg))]);
      const onMuted = ${JSON.stringify(ON_MUTED)}.map(([label, sel, pseudo, min]) => {
        const host = __t.el(sel).closest(".code-block, .cmd");
        return [label, min, [__t.ratio(fg(sel, pseudo), getComputedStyle(host).backgroundColor)]];
      });
      const ringRow = ["focus ring --ring (non-text)", 3, surfaces.map((bg) => __t.ratio(__t.token("--ring"), bg))];
      return [...onSurfaces, ringRow, ...onMuted];
    })()`);
    const out = [];
    for (const [label, min, ratios] of rows) {
      if (!table.has(label)) table.set(label, {});
      table.get(label)[theme] = ratios;
      ratios.forEach((r, i) => { if (r < min) out.push(`${label}: ${r.toFixed(2)}:1 on ${ratios.length === 1 ? "--muted (own)" : ["--background", "--card", "--muted"][i]}, needs ${min}`); });
    }
    return out;
  });
}
console.log("\ncontrast (bg / card / muted; code and commands on their own --muted):");
console.log(`| pairing | ${THEMES.join(" | ")} |`);
console.log(`|---|${THEMES.map(() => "---").join("|")}|`);
for (const [label, byTheme] of table) {
  console.log(`| ${label} | ${THEMES.map((t) => (byTheme[t] || []).map((r) => r.toFixed(2)).join(" / ")).join(" | ")} |`);
}
console.log();

/* ── the error-page template ────────────────────────────────────────────────────────────────── */

const templateSource = readFileSync(join(root, "templates/error-page.html"), "utf8");
await check("template: noindex, one h1 at the display step with an aria-hidden cursor, the lede and the way home", async () => {
  consoleErrors.length = 0;
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${ORIGIN}/__template/error-page.html` });
  await sleep(900);
  await evaluate(HELPERS);
  const t = await evaluate(`({
    robots: document.querySelector('meta[name="robots"]')?.content,
    h1s: document.querySelectorAll("h1").length,
    h1class: document.querySelector("h1")?.className,
    h1text: document.querySelector("h1")?.textContent,
    cursor: document.querySelector("h1 .cursor-block")?.getAttribute("aria-hidden"),
    prompt: document.querySelector("main .prompt + h1") !== null,
    lede: document.querySelector("h1 + .lede")?.textContent,
    home: document.querySelector('main a.link-quiet[href="/"]')?.textContent,
    chrome: !!document.querySelector("header.bar") && !!document.querySelector("footer.status"),
  })`);
  const out = [];
  if (t.robots !== "noindex") out.push(`robots meta is ${t.robots}`);
  if (t.h1s !== 1) out.push(`${t.h1s} h1 elements`);
  if (t.h1class !== "page-title page-title--display") out.push(`h1 class is "${t.h1class}"`);
  if (!/^404: command not found/.test(t.h1text || "")) out.push(`h1 reads "${t.h1text}"`);
  if (t.cursor !== "true") out.push("the cursor is not aria-hidden");
  if (!t.prompt) out.push("the prompt does not precede the title");
  if (t.lede !== "no such file or directory.") out.push(`lede reads "${t.lede}"`);
  if (t.home !== "cd ~") out.push("no cd ~ link home");
  if (!t.chrome) out.push("header.bar / footer.status missing");
  out.push(...(await expectAll([
    ["main h1", null, { "font-size": "36px", "line-height": { px: 43.2 }, "margin-top": "24px", color: { token: "--primary" } }],
    ["main .lede", null, { "margin-top": "8px", color: { token: "--muted-foreground" } }],
    ["main .lede + p", null, { "margin-top": "24px" }],
  ])));
  return out;
});
const openTemplate = async (width, height = 900) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${ORIGIN}/__template/error-page.html` });
  await sleep(800);
};
await check("template: its display step turns at 40rem too — 30px at 639px, 36px at 640px", async () => {
  const out = [];
  for (const [width, size] of [[639, "30px"], [640, "36px"]]) {
    await openTemplate(width);
    const got = await evaluate(`getComputedStyle(document.querySelector("main h1")).fontSize`);
    if (got !== size) out.push(`at ${width}px the title is ${got}, want ${size}`);
  }
  return out;
});
// S9 says "page chrome from page-chrome.html", and 0.60.0's is WP3's (matched at wp3-chrome 0d65016):
// the header's two .bar-side slots, a footer nav that is a NAMED landmark, and a phone theme menu that
// says what it is. WP13 re-checks the template against page-chrome.html if WP3 changes it later.
await check("template: it wears 0.60.0's page chrome — two .bar-side slots, the footer nav named \"page settings\", the phone theme menu \"theme warm\"", async () => {
  const out = [];
  await openTemplate(1280);
  const sides = await evaluate(`[...document.querySelectorAll("header.bar > .bar-side")].map((s) => ({
    right: s.classList.contains("bar-right"), brand: !!s.querySelector(":scope > .brand"), nav: !!s.querySelector(":scope > #site-nav"), burger: !!s.querySelector(":scope > .nav-burger") }))`);
  if (sides.length !== 2) out.push(`${sides.length} .bar-side slots in the header, want 2`);
  else {
    if (!(sides[0].brand && !sides[0].right)) out.push(`the first slot does not hold the brand: ${JSON.stringify(sides[0])}`);
    if (!(sides[1].right && sides[1].nav && sides[1].burger)) out.push(`the second slot is not .bar-right with the burger and the site nav: ${JSON.stringify(sides[1])}`);
  }
  const footer = await axName("footer.status nav");
  if (footer !== "page settings") out.push(`the footer nav is named ${JSON.stringify(footer)}, want "page settings"`);
  await openTemplate(375, 812);
  // On a phone the footer's controls live in the burger: open it, as a reader has to.
  await evaluate(`document.querySelector(".nav-burger").click(); null`);
  await sleep(200);
  const phone = await axName(".mobile-footer .mobile-theme > summary");
  if (phone !== "theme warm") out.push(`the phone theme menu is named ${JSON.stringify(phone)}, want "theme warm"`);
  return out;
});
await check("template: the prompt is filled from the address bar, as text", async () => {
  await send("Page.navigate", { url: `${ORIGIN}/__template/articles/%3Cb%3Enope%3C%2Fb%3E` });
  await sleep(900);
  const p = await evaluate(`[document.querySelector("[data-requested-path]").textContent, document.querySelector("[data-requested-path] b") === null]`);
  const out = [];
  if (p[0] !== "__template/articles/<b>nope</b>") out.push(`prompt reads ${JSON.stringify(p[0])}`);
  if (!p[1]) out.push("the path was parsed as markup");
  return out;
});
await check("template: no script error on load", () => consoleErrors.filter((e) => !/favicon/.test(e)));
await check("template: the crash variant is documented — alert, 'something broke', a reload button", () => {
  const block = (templateSource.match(/THE CRASH VARIANT, in place of[\s\S]*?-->/) || [""])[0];
  const out = [];
  if (!block) out.push("no crash-variant block after <main>");
  for (const want of ['role="alert"', "something broke", 'class="page-title page-title--display"', 'class="btn-terminal btn-terminal--compact" data-reload', "{{ERROR_MESSAGE}}"]) {
    if (!block.includes(want)) out.push(`crash block lacks ${want}`);
  }
  return out;
});

console.log(failures
  ? `\ncheck-content: ${failures} FAILED, ${passes} passed`
  : `\ncheck-content: all ${passes} checks passed`);
process.exit(failures ? 1 : 0);
