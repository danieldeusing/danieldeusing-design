#!/usr/bin/env node
/*
 * check-chrome.mjs — the chrome package (src/chrome.css, runtime/lsnav.js, anim.js, toc.js), in a
 * real browser, on examples/chrome.html: the page's own bar, stack, toolbar, TOC, rail and footer
 * ARE the specimens, so every assertion is about chrome doing its job on a real page.
 *
 * WHAT IS AT RISK, and why each part is here:
 *
 *   · Everything that sticks parks on a MEASURED edge. The rail, the page toolbar and the table of
 *     contents read --ls-nav-top / --sticky-top, which initLsNav() writes; a banner above the bar,
 *     a toolbar that wraps, a page with no rail at all each used to leave them at a guessed number.
 *     A sticky banner and the header overlapped outright until .bar-stack (the lead's ruling).
 *   · The footer's clearance is a TOKEN, so it is only right while the footer really is --status-h
 *     tall. That is asserted by measuring the footer, the body's padding and where the last line of
 *     content ends, on the desktop and on a phone.
 *   · The runtime keeps several controls in step with one state (every rail toggle, every anim
 *     toggle, the one TOC entry that is current). Each is asserted through a real pointer press,
 *     and with a control rendered after the call.
 *   · Focus rings and `hidden` (RULES-CROSSCUT X2, X3): run on ?bare — tokens.css and chrome.css
 *     only — because base.css draws a global ring that would keep a deleted rule green.
 *   · Forced colours (X1) are read as PAINTED PIXELS off screenshots, on a light and a dark forced
 *     palette and all four themes: the computed style does not show the backplate the mode paints.
 *
 * MUTATION RUNS never edit a tracked file: DD_OVERRIDE="src/chrome.css=/tmp/mutant.css;…" makes the
 * built-in server answer those paths from the given files instead.
 *
 * A REAL BROWSER, and no dependency: the headless chromium Playwright caches on these machines,
 * over the DevTools protocol, with Node's own fetch and WebSocket. It skips loudly with no browser;
 * DD_REQUIRE_BROWSER=1 makes a skip a failure, as for every DOM suite here.
 *
 *   node scripts/check-chrome.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { launch as launchApart } from "./lib/chromium.mjs";

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
  console.log("check-chrome: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts layout, sticky positioning, observers and focus, none of which a stub");
  console.log("  can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

/* ── a static server over the repo, with the mutation override ────────────────────────────────── */
const overrides = new Map(
  (process.env.DD_OVERRIDE || "").split(";").filter(Boolean).map((pair) => {
    const [path, file] = pair.split("=");
    return [normalize(path).replace(/^\/+/, ""), file];
  }),
);
// Cockpit's real attribute patcher, when this machine has the infra checkout: the S1 checks drive it.
// A design-only checkout skips those (the always-on setAttribute cases still run), unless
// DD_REQUIRE_COCKPIT_DOM_PATCH=1 makes the missing file a failure.
const DOM_PATCH = process.env.DD_COCKPIT_DOM_PATCH || `${process.env.HOME}/Work/danieldeusing/danieldeusing-infra/cockpit/pages/dom-patch.js`;
if (existsSync(DOM_PATCH) && !overrides.has("cockpit/dom-patch.js")) overrides.set("cockpit/dom-patch.js", DOM_PATCH);
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml" };
/*
 * THE TAILWIND ENTRY'S CASCADE, without Tailwind: tokens.css unlayered, chrome.css in
 * `layer(components)`, exactly as src/tailwind.css imports them. An unlayered declaration beats
 * every layered one, custom properties included — so a phone override of a token that tokens.css
 * declares only survives there if it is !important. The unlayered `:root` line is the adversary:
 * the token's own declaration, as tokens.css makes it.
 */
const LAYERED = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@import url("/src/tokens.css"); @import url("/src/chrome.css") layer(components); :root { --status-h: 2rem; }</style>
</head><body><main>content</main><footer class="status"><span class="status-left">x</span><nav class="status-right">y</nav></footer></body></html>`;
/*
 * LOAD ORDER. chrome.css and components.css both style a rail row, the anim toggle and the cursor, and
 * a rule that wins only because its file loads second is a tie, not a decision: a surface that loads
 * the two the other way round gets the other answer. Each page loads tokens and then the pair in one
 * order; the three findings of 0.61.0's triage must come out the same both ways.
 */
const ORDER_FIXTURE = `<span class="cursor-block cursor-block--static" id="t-cursor"></span>
<div class="mobile-footer"><button type="button" class="anim-toggle" id="t-anim">anim</button></div>
<a class="dropdown-item ls-row" id="t-row" href="#"><span class="ls-perm">-rw-r--r--</span><span class="ls-name">row</span></a>`;
const ORDERS = Object.fromEntries([["components", "chrome"], ["chrome", "components"]].map((files, i) => [`__order-${i}.html`,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/tokens.css">${files.map((f) => `<link rel="stylesheet" href="/src/${f}.css">`).join("")}
<style>* { transition: none !important; }</style></head><body>${ORDER_FIXTURE}</body></html>`]));
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
  if (path === "__layered.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(LAYERED); return; }
  if (ORDERS[path]) { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(ORDERS[path]); return; }
  const file = overrides.get(path) ?? join(root, path);
  if (path.includes("..") || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": `${TYPES[extname(path)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
  res.end(readFileSync(file));
}).listen(Number(process.env.DD_HTTP_PORT) || 0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const BASE = `http://127.0.0.1:${server.address().port}/examples/chrome.html`;

/* ── the browser ──────────────────────────────────────────────────────────────────────────────── */
const PORT = Number(process.env.DD_CDP_PORT) || 19240 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "dd-chrome-"));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: true });
let socket;
// The browser leads its own process group, so the whole group goes before its profile does.
const shutdown = () => { try { socket?.close(); } catch {} try { process.kill(-chrome.pid, "SIGKILL"); } catch { chrome.kill("SIGKILL"); } try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} server.close(); };
process.on("exit", shutdown);
for (let i = 0; ; i += 1) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch {}
  if (i > 60) { shutdown(); throw new Error("headless chromium did not come up"); }
  await sleep(250);
}
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new`, { method: "PUT" })).json();
socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { socket.onopen = ok; socket.onerror = bad; });
let messageId = 0;
const pending = new Map();
const waiters = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method) { for (const w of waiters.splice(0)) (w.method === message.method ? w.ok : () => waiters.push(w))(); return; }
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
const next = (method) => new Promise((ok) => waiters.push({ method, ok }));
await send("Runtime.enable");
await send("Page.enable");

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

/*
 * One page load per scenario, each from a clean store: the rail and the anim toggle PERSIST their
 * state, and a scenario inheriting the last one's "off" would be asserting the wrong page.
 */
async function load(query = "", { width = 1440, height = 900, coarse = false, forced = false, scheme = "light", print = false, keep = false } = {}) {
  if (!keep) await evaluate("try { localStorage.clear() } catch {} null").catch(() => {});
  // A phone width is emulated AS a phone: its scrollbars overlay the page instead of taking 15px
  // of a 375px viewport, which would measure a narrower phone than any real one.
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await send("Emulation.setTouchEmulationEnabled", coarse ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send("Emulation.setEmulatedMedia", {
    media: print ? "print" : "",
    features: [{ name: "forced-colors", value: forced ? "active" : "none" }, { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-reduced-motion", value: "no-preference" }],
  });
  const loaded = next("Page.loadEventFired");
  await send("Page.navigate", { url: BASE + (query ? `?${query}` : "") });
  await loaded;
  await frames(3);
}
// Observers (Intersection, Resize, Mutation) deliver after a frame, not synchronously.
const frames = (n = 2) => evaluate(`new Promise((ok) => { let i = ${n}; const f = () => (--i ? requestAnimationFrame(f) : setTimeout(ok, 30)); requestAnimationFrame(f); })`);
const press = async (selector, { scroll = true } = {}) => {
  const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (${scroll}) el.scrollIntoView({ block: "center", behavior: "instant" });
    const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await frames(1);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
  }
  await frames(2);
};
const scrollTo = async (y) => { await evaluate(`scrollTo({ top: ${y}, behavior: "instant" }); null`); await frames(3); };
// base.css scrolls smoothly, so a followed anchor takes several hundred ms to arrive: wait until
// the scroll position has held still for a few frames.
const settle = () => evaluate(`new Promise((ok) => { let last = -1, still = 0, n = 0;
  const f = () => { still = scrollY === last ? still + 1 : 0; last = scrollY; if (still >= 5 || ++n > 150) setTimeout(ok, 50); else requestAnimationFrame(f); };
  requestAnimationFrame(f); })`);

/* ── the harness (a throw is a FAIL naming the check, never a bare stack) ─────────────────────── */
let failures = 0;
let lastPassed = "(none)";
const check = async (label, thunk, detail) => {
  let ok = false;
  let why = detail;
  try {
    ok = Boolean(await thunk());
  } catch (error) {
    why = `threw: ${error.message.split("\n")[0]}`;
  }
  if (ok) { lastPassed = label; console.log(`PASS  ${label}`); return; }
  failures += 1;
  const text = typeof why === "function" ? await Promise.resolve().then(why).catch((e) => `(detail threw: ${e.message})`) : why;
  console.log(`FAIL  ${label}${text === undefined ? "" : `\n        ${typeof text === "string" ? text : JSON.stringify(text)}`}`);
};
const near = (a, b, tol = 0.6) => Math.abs(Number(a) - Number(b)) <= tol;
const px = (value) => parseFloat(value);

/* In-page helpers, installed once per load. */
const HELPERS = `(() => {
  const d = document, root = d.documentElement;
  const q = (s) => d.querySelector(s), qa = (s) => [...d.querySelectorAll(s)];
  const rect = (s) => { const e = typeof s === "string" ? q(s) : s; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; };
  const cs = (s, p, pseudo) => getComputedStyle(typeof s === "string" ? q(s) : s, pseudo || null)[p];
  const inline = (n) => root.style.getPropertyValue(n);
  const token = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const colour = (css) => { const p = d.createElement("i"); p.style.color = css; d.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; };
  window.T = { q, qa, rect, cs, inline, token, colour };
})(); null`;
const page = async (expr) => { await evaluate(HELPERS); return evaluate(expr); };

/* ═══ 1. the header's slots ═════════════════════════════════════════════════════════════════════ */
await load("nobanner");
const slots = await page(`(() => { const c = T.rect(".bar-center"), m = T.rect("main");
  return { centre: (c.left + c.right) / 2, main: (m.left + m.right) / 2, flex: T.cs(".bar-side", "flex"),
    right: T.cs(".bar-side ~ .bar-side", "justifyContent"), nowrap: T.cs(".bar-side ~ .bar-side", "whiteSpace"),
    brandInSide: !!document.querySelector(".bar-side > a.brand"), railWrap: T.cs(".ls-nav", "whiteSpace") }; })()`);
await check("the bar's centre band is centred over <main>, not over the window, while the rail takes 17rem",
  () => near(slots.centre, slots.main, 1), slots);
await check("the two ends share what the centre leaves (flex 1 1 0) and the right end does not wrap",
  () => /^1 1 0(%|px)$/.test(slots.flex) && slots.right === "flex-end" && slots.nowrap === "nowrap", slots);
await check("…and the rail that hangs off the right end wraps normally again", () => slots.railWrap === "normal", slots);
await press(".ls-nav-toggle");
const slotsHidden = await page(`(() => { const c = T.rect(".bar-center"), m = T.rect("main"); return { centre: (c.left + c.right) / 2, main: (m.left + m.right) / 2 }; })()`);
await check("…and still centred over <main> once the rail is hidden and the column takes the width back",
  () => near(slotsHidden.centre, slotsHidden.main, 1), slotsHidden);
await load("nobanner", { width: 375, height: 812 });
await check("below 48rem the centre band gives way to the burger", () => page(`T.cs(".bar-center", "display") === "none"`));
await check("…and the burger's menu takes normal wrapping back from the right slot",
  () => page(`T.cs(".site-nav", "whiteSpace") === "normal"`));
await page(`document.querySelector(".brand .glow").textContent = "danieldeusing-docs"; null`);
await frames(2);
const phoneBar = await page(`({ flex: T.cs(".bar-side", "flex"), brand: T.rect(".brand").height, bar: T.rect("header.bar").height })`);
await check("…where the two ends take their own size again, so a hyphenated wordmark stays on one line",
  () => phoneBar.flex === "0 1 auto" && phoneBar.brand < 30, phoneBar);

/* THE BRAND GIVES WAY ON A PHONE (0.62.4). A long wordmark beside the controls made the bar — and the
   page — wider than a 320px phone (components.html's old 33-character wordmark and its nav: 332px).
   The wordmark shrinks and truncates; the controls keep their size. Both shapes a page writes: the
   documented `.bar-side > a.brand > .glow` (an ellipsis), and a `.brand` straight in the bar with its
   words as bare text (clipped: bare text has no box to take an ellipsis). Then a brand that FITS
   beside controls that must wrap to fit: the controls give way first and the brand is untouched. */
const LONG_BRAND = "components.css — 0.60.0 revisions";
const BAR_B = (brand, nav) => `<header class="bar" id="t-bar-b"><span class="brand glow">${brand}<span class="cursor-block" aria-hidden="true"></span></span>
  <nav aria-label="t" id="t-nav-b">${nav}</nav></header>`;
// components.html's own header, as it was when it measured 332px: its nav is a flex row.
const NAV_B = `<style>#t-nav-b { display: flex; align-items: center; gap: 1rem; }</style>
  <details class="dropdown"><summary><span class="visually-hidden">theme </span><span class="dd-dot" aria-hidden="true"></span><span>warm</span><span aria-hidden="true">▾</span></summary>
  <ul class="dropdown-panel dropdown-panel--end"><li><button type="button" class="dropdown-item">warm</button></li></ul></details>
  <button type="button" class="anim-toggle" aria-pressed="true"><span aria-hidden="true">[x]</span><span>anim</span></button>`;
// How far the brand's own content reaches, clipped or not: a Range over it, which no overflow hides.
const REACH = "((el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.right - el.getBoundingClientRect().left; })";
const barFit = (bar) => `(() => { const h = document.querySelector(${JSON.stringify(bar)}), cs = getComputedStyle(h);
  const inner = h.getBoundingClientRect().right - parseFloat(cs.paddingRight), kids = [...h.children].filter((k) => k.getClientRects().length);
  return { sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth,
    overhang: +(Math.max(...kids.map((k) => k.getBoundingClientRect().right)) - inner).toFixed(2) }; })()`;
await load("nobanner", { width: 320, height: 800 });
const shortSide = await page(`T.rect(".bar-side ~ .bar-side").width`);
await page(`document.querySelector(".brand .glow").textContent = ${JSON.stringify(LONG_BRAND)}; null`);
await frames(2);
const longA = { ...(await page(barFit("header.bar"))), ...(await page(`(() => { const g = T.q("header.bar .brand > .glow");
  return { side: T.rect(".bar-side ~ .bar-side").width, cut: g.scrollWidth > g.clientWidth, ellipsis: T.cs(g, "textOverflow"), brand: T.rect("header.bar .brand").height }; })()`)) };
await check(`a ${LONG_BRAND.length}-character wordmark in .bar-side > .brand > .glow at 320: the page does not scroll sideways and the bar's contents stay inside it`,
  () => longA.sw <= longA.cw && longA.overhang <= 0.5, longA);
await check("…the wordmark is what gives way, on one line, ending in an ellipsis; the controls keep the width they had beside a short one",
  () => longA.cut && longA.ellipsis === "ellipsis" && longA.brand < 30 && near(longA.side, shortSide, 0.01), { ...longA, shortSide });
const inject = (html) => page(`document.getElementById("t-bar-b")?.remove(); document.body.insertAdjacentHTML("afterbegin", ${JSON.stringify(html)}); null`);
await inject(BAR_B(LONG_BRAND, NAV_B));
await frames(2);
const longB = { ...(await page(barFit("#t-bar-b"))), ...(await page(`(() => { const REACH = ${REACH}, b = T.q("#t-bar-b .brand");
  return { box: b.getBoundingClientRect().width, words: REACH(b), overflow: T.cs(b, "overflowX") }; })()`)) };
await check(`…and as bare words in a .brand straight in the bar, beside a menu and the anim toggle: the page does not scroll sideways, the bar's contents stay inside it, the wordmark is clipped`,
  () => longB.sw <= longB.cw && longB.overhang <= 0.5 && longB.words > longB.box + 1 && longB.overflow === "clip", longB);
await inject(BAR_B("components", NAV_B.replace(/<details[\s\S]*<\/details>/, "").replace("<span>anim</span>", "<span>animation and motion</span>")));
await frames(2);
const fitB = await page(`(() => { const REACH = ${REACH}, b = T.q("#t-bar-b .brand"), one = T.q("#t-nav-b .anim-toggle span:last-child");
  return { brand: b.getBoundingClientRect().width, words: REACH(b), wrapped: one.getBoundingClientRect().height > 1.5 * parseFloat(getComputedStyle(one).fontSize) * 1.3 }; })()`);
await check("…while a wordmark that fits keeps its whole width beside controls that wrap to fit: they give way first",
  () => fitB.wrapped && fitB.brand >= fitB.words - 0.01, fitB);

/* THE BAR AT 320, IN THE SHAPES PAGES SHIP (0.62.4, review round 1). What must hold in each: the
   page never scrolls sideways and nothing overhangs the bar; no control is squashed below its own
   min-content; a brand that fits stays whole; and if the brand is cut, every control is already at
   its min-content — nothing else had anything left to give. A control's min-content is measured on
   a copy of it laid out at `width: min-content` beside it; the overhang counts margins, because the
   burger leans 0.3rem into the bar's padding on purpose. */
const JUDGE = (bar, controls) => `(() => { const h = document.querySelector(${JSON.stringify(bar)}), cs = getComputedStyle(h);
  const inner = h.getBoundingClientRect().right - parseFloat(cs.paddingRight), kids = [...h.children].filter((k) => k.getClientRects().length);
  const minOf = (el) => { const c = el.cloneNode(true); c.removeAttribute("id"); c.style.cssText += ";position:absolute;visibility:hidden;inline-size:min-content;flex:none";
    el.after(c); const w = c.getBoundingClientRect().width; c.remove(); return w; };
  const glow = h.querySelector(".brand > .glow") || h.querySelector(".brand");
  return { sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth,
    overhang: +(Math.max(...kids.map((k) => k.getBoundingClientRect().right + parseFloat(getComputedStyle(k).marginRight))) - inner).toFixed(2),
    cut: glow.scrollWidth > glow.clientWidth + 0.5,
    controls: [...h.querySelectorAll(${JSON.stringify(controls)})].filter((k) => k.getClientRects().length)
      .map((k) => ({ el: k.tagName.toLowerCase() + "." + k.className, w: +k.getBoundingClientRect().width.toFixed(2), min: +minOf(k).toFixed(2) })) }; })()`;
const holds = (j, { whole } = {}) => j.sw <= j.cw && j.overhang <= 0.5 && j.controls.length > 0
  && j.controls.every((c) => c.w >= c.min - 0.5) && (!j.cut || j.controls.every((c) => c.w <= c.min + 0.5)) && (whole === undefined || j.cut !== whole);
const BURGER = `<button type="button" class="nav-burger" aria-label="menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg></button>`;
const shapes = [
  ["(a) a wordmark that fits, beside a nav that wraps: the nav wraps, the wordmark stays whole", true,
    `<header class="bar" id="t-bar-b"><div class="bar-side"><a class="brand" href="#"><span class="glow">danieldeusing-docs</span><span class="cursor-block" aria-hidden="true"></span></a></div>
     <div class="bar-side"><nav aria-label="t" style="display: flex; flex-wrap: wrap; column-gap: 0.75rem"><a href="#">blog</a><a href="#">about</a><a href="#">rss</a></nav></div></header>`, "#t-bar-b nav"],
  ["(b) a wordmark beside a search field: nothing overhangs, the field keeps its min-content", undefined,
    `<header class="bar" id="t-bar-b"><div class="bar-side"><a class="brand" href="#"><span class="glow">danieldeusing</span><span class="cursor-block" aria-hidden="true"></span></a></div>
     <div class="bar-side"><div class="search-field"><input type="search" aria-label="search" placeholder="search…"></div></div></header>`, "#t-bar-b .search-field"],
  [`(c) a ${LONG_BRAND.length}-character wordmark and a burger in .bar-side wrappers: the wordmark is cut, the burger keeps its 40px`, false,
    `<header class="bar" id="t-bar-b"><div class="bar-side"><a class="brand" href="#"><span class="glow">${LONG_BRAND}</span><span class="cursor-block" aria-hidden="true"></span></a></div>
     <div class="bar-side">${BURGER}</div></header>`, "#t-bar-b .nav-burger"],
  [`(c) …and as danieldeusing-family writes it, brand and burger straight in the bar`, false,
    `<header class="bar" id="t-bar-b"><a class="brand" href="#"><span class="glow">${LONG_BRAND}</span><span class="cursor-block" aria-hidden="true"></span></a>${BURGER}</header>`, "#t-bar-b .nav-burger"],
];
await load("nobanner", { width: 320, height: 800 });
for (const [label, whole, html, controls] of shapes) {
  await inject(html);
  await frames(2);
  const j = await page(JUDGE("#t-bar-b", controls));
  const burger = controls.endsWith("nav-burger") ? j.controls[0]?.w : null;
  await check(`at 320, ${label}`, () => holds(j, { whole }) && (burger === null || near(burger, 39.59, 0.5)), j);
}

/* A WORDMARK THAT FITS IS NEVER BOXED. The clip that truncates a long one must leave the glow of a
   short one alone, in an engine without `overflow-clip-margin` too (WebKit, so every iOS browser):
   the run takes the property away (`overflow-clip-margin: 0`) and compares the bar's pixels with the
   same bar unclipped (`overflow: visible`, and none of the padding the clip spends on the glow).
   They must be identical, on the glowing themes. */
for (const theme of ["green", "warm"]) {
  await load("nobanner", { width: 375, height: 800 });
  for (const [shape, html] of [[".bar-side > .brand > .glow", null],
    ["words straight in a .brand", BAR_B("components", NAV_B)]]) {
    if (html) await inject(html);
    const bar = html ? "#t-bar-b" : "header.bar";
    await page(`document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      document.head.insertAdjacentHTML("beforeend", "<style id='t-still'>*, *::before, *::after { animation: none !important; transition: none !important; overflow-clip-margin: 0px !important; }</style>"); null`);
    await frames(3);
    const box = await page(`(() => { const r = document.querySelector(${JSON.stringify(bar)}).getBoundingClientRect(); return { x: 0, y: r.top, width: 375, height: r.height }; })()`);
    // The page settles for a while after load (fonts, the rail, observers): a shot counts once the
    // next one, three frames later, is the same picture.
    const shot = async () => {
      let last = null;
      for (let i = 0; i < 40; i += 1) {
        const now = (await send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 1 }, captureBeyondViewport: false })).data;
        if (now === last) return now;
        last = now;
        await frames(3);
      }
      throw new Error("the bar never stopped changing");
    };
    const clipped = await shot();
    await page(`document.head.insertAdjacentHTML("beforeend", "<style id='t-open'>header.bar .brand, header.bar .brand > .glow { overflow: visible !important; padding: 0 !important; margin: 0 !important; }</style>"); null`);
    await frames(3);
    const open = await shot();
    await page(`document.getElementById("t-open").remove(); document.getElementById("t-still").remove(); document.getElementById("t-bar-b")?.remove(); null`);
    await check(`a wordmark that fits (${shape}, ${theme}, 375) paints exactly as it does unclipped, with no overflow-clip-margin to lean on`,
      () => clipped === open, "the clip cuts the glow");
  }
}
await load("nobanner");
await load("nobanner");
const app = await page(`({ h: T.rect("#app-bar").height, pos: T.cs("#app-bar", "position"), pl: T.cs("#app-bar", "paddingLeft"),
  anim: T.cs(".cursor-block--static", "animationName"), status: T.cs(".bar-status", "color"), muted: T.colour("var(--muted-foreground)") })`);
await check(".bar--app is the 36px window strip: static, with the traffic-light gutter as its start padding",
  () => near(app.h, 36, 0.01) && app.pos === "static" && app.pl === "80px", app);
await check("…and its wordmark cursor does not blink", () => app.anim === "none", app);
await check(".bar-status speaks in the muted ink", () => app.status === app.muted, app);
await check("an icon-button summary in the bar keeps its own box (the bar's summary padding skips it)",
  () => page(`T.cs("header.bar .bar-history summary", "paddingTop") === "0px"`));

/* ═══ 2. .bar-stack: a banner and the header stick as ONE layer ═════════════════════════════════ */
await load();
await scrollTo(600);
const stack = await page(`({ scrolled: scrollY, banner: T.rect("#demo-banner"), header: T.rect("header.bar"), stack: T.rect(".bar-stack"),
  toolbar: T.rect(".page-toolbar"), toc: T.rect(".toc-inner"), rail: T.rect(".ls-nav"),
  top: parseFloat(T.inline("--ls-nav-top")), sticky: parseFloat(T.inline("--sticky-top")) })`);
await check("scrolled 600px, the banner is still on screen at the top", () => stack.scrolled === 600 && near(stack.banner.top, 0) && stack.banner.height > 20, stack.banner);
await check("…the header sits right under the banner, not under it and not scrolled away",
  () => near(stack.header.top, stack.banner.bottom) && stack.header.bottom > stack.banner.bottom + 20, { banner: stack.banner, header: stack.header });
await check("…the rail starts under BOTH (--ls-nav-top is the stack's bottom edge, 1px tucked)",
  () => near(stack.top, stack.stack.bottom - 1) && near(stack.rail.top, stack.top), { top: stack.top, stack: stack.stack.bottom, rail: stack.rail.top });
await check("…the page toolbar parks under both", () => near(stack.toolbar.top, stack.top), { toolbar: stack.toolbar.top, top: stack.top });
await check("…and the table of contents parks under the toolbar, at --sticky-top",
  () => near(stack.sticky, stack.top + stack.toolbar.height, 1) && near(stack.toc.top, stack.sticky), { sticky: stack.sticky, toc: stack.toc.top });
// At the top of the page, and pressed where it stands: no scroll event and no resize can happen,
// so only the stack's own size change can tell the runtime (scrolled, the browser's scroll
// anchoring would fire a scroll event and hide a missing observer).
await load();
const before = await page(`({ top: parseFloat(T.inline("--ls-nav-top")), header: T.rect("header.bar").bottom })`);
await press("#banner-dismiss", { scroll: false });
const dismissed = await page(`({ header: T.rect("header.bar"), top: parseFloat(T.inline("--ls-nav-top")), scrolled: scrollY })`);
await check("dismissing the banner re-measures with no scroll and no resize: the rail follows the header up",
  () => dismissed.scrolled === 0 && before.top > dismissed.top + 20 && near(dismissed.top, dismissed.header.bottom - 1), { before, after: dismissed });

/* ═══ 3. the rail: measured chrome, toggles in step ══════════════════════════════════════════════ */
await load("nobanner");
const measured = await page(`({ top: parseFloat(T.inline("--ls-nav-top")), bottom: parseFloat(T.inline("--ls-nav-bottom")),
  bar: T.rect("header.bar").bottom, footer: document.querySelector("footer.status").offsetHeight,
  rail: T.rect(".ls-nav"), vh: innerHeight })`);
await check("--ls-nav-top is the header's bottom edge, 1px tucked", () => near(measured.top, measured.bar - 1), measured);
await check("--ls-nav-bottom is the footer's height, 1px tucked", () => near(measured.bottom, measured.footer - 1), measured);
await check("the rail runs between the two", () => near(measured.rail.top, measured.top) && near(measured.rail.bottom, measured.vh - measured.bottom), measured);
await load("norail&nobanner");
const railless = await page(`({ toggles: document.querySelectorAll("[data-ls-nav-toggle]").length, top: T.inline("--ls-nav-top"), bottom: T.inline("--ls-nav-bottom"), sticky: T.inline("--sticky-top") })`);
await check("a page with NO rail is still measured (the minimap and the sticky layers read it)",
  () => railless.toggles === 0 && railless.top !== "" && railless.bottom !== "" && railless.sticky !== "", railless);

await load("nobanner");
const expanded = () => page(`T.qa("[data-ls-nav-toggle]").map((b) => b.getAttribute("aria-expanded") + (b.hasAttribute("aria-pressed") ? "+pressed" : ""))`);
await check("every rail toggle starts expanded", async () => (await expanded()).every((v) => v === "true"), expanded);
await press(".ls-nav-toggle");
const off = await page(`new Promise((ok) => setTimeout(() => ok({ state: document.documentElement.dataset.lsNav, stored: localStorage.getItem("ls-nav"),
  railLeft: T.rect(".ls-nav").left, vw: document.documentElement.clientWidth, arrow: T.cs(".ls-nav-toggle", "content", "::after") }), 300))`);
await check("a press on the rail's own toggle slides the rail off, turns the arrow and remembers it",
  () => off.state === "off" && off.stored === "off" && off.railLeft >= off.vw - 1 && off.arrow === '"«"', off);
await check("…and EVERY toggle on the page now says collapsed, the second one included", async () => (await expanded()).every((v) => v === "false"), expanded);
await press("#second-rail-toggle");
await check("the second toggle drives the same rail, and every toggle follows it",
  async () => (await page(`document.documentElement.dataset.lsNav`)) === "on" && (await expanded()).every((v) => v === "true"), expanded);
await page(`document.documentElement.dataset.lsNav = "off"; null`);
await frames(2);
await check("a change to html[data-ls-nav] from anywhere re-syncs the toggles", async () => (await expanded()).every((v) => v === "false"), expanded);
await page(`document.querySelector("#rail").insertAdjacentHTML("beforeend", '<button type="button" id="late-toggle" data-ls-nav-toggle aria-controls="nav" aria-expanded="true" aria-pressed="true">late</button>'); null`);
await frames(2);
await check("a toggle rendered later is told the state at once, and loses a stale aria-pressed",
  () => page(`document.getElementById("late-toggle").getAttribute("aria-expanded") === "false" && !document.getElementById("late-toggle").hasAttribute("aria-pressed")`));
await press("#late-toggle");
await check("…and it works: a press on it shows the rail again", () => page(`document.documentElement.dataset.lsNav === "on"`));

/* ═══ 4. --sticky-top and the anchors ═══════════════════════════════════════════════════════════ */
await load("nobanner");
const sticky = await page(`({ top: parseFloat(T.inline("--ls-nav-top")), sticky: parseFloat(T.inline("--sticky-top")), toolbar: document.querySelector(".page-toolbar").offsetHeight,
  pad: parseFloat(T.cs("html", "scrollPaddingTop")) })`);
await check("--sticky-top is the header's edge plus the page toolbar's height", () => near(sticky.sticky, sticky.top + sticky.toolbar), sticky);
await check("anchors land a line below every sticky layer (scroll-padding = --sticky-top + 1rem)", () => near(sticky.pad, sticky.sticky + 16), sticky);
await load("nobanner&notoolbar");
await check("without a toolbar, --sticky-top is the header's edge alone",
  () => page(`parseFloat(T.inline("--sticky-top")) === parseFloat(T.inline("--ls-nav-top"))`));
await load("nobanner");
await press('.toc a[data-toc-link="footer"]');
await settle();
const landed = await page(`({ section: T.rect("#footer").top, sticky: parseFloat(T.inline("--sticky-top")), toolbar: T.rect(".page-toolbar").bottom })`);
await check("a TOC link lands its section below the toolbar, not under it", () => landed.section >= landed.toolbar && near(landed.section, landed.sticky + 16, 1.5), landed);
await scrollTo(900);
await page(`window.__writes = 0; const set = document.documentElement.style.setProperty.bind(document.documentElement.style);
  document.documentElement.style.setProperty = (...a) => { window.__writes += 1; return set(...a); }; null`);
for (const y of [901, 902, 903, 904]) await scrollTo(y);
await check("a scroll that moves no chrome writes nothing to <html> (it runs on every scroll event)",
  () => page(`window.__writes === 0`), () => page(`window.__writes`));

await load("nobanner");
await page(`const ol = document.querySelector(".toc ol"); for (let i = 0; i < 40; i++) ol.insertAdjacentHTML("beforeend", '<li><a href="#top">padding entry ' + i + '</a></li>'); null`);
await scrollTo(900);
const longToc = await page(`({ toc: T.rect(".toc-inner"), footer: T.rect("footer.status").top, sticky: parseFloat(T.inline("--sticky-top")),
  scrolls: document.querySelector(".toc-inner").scrollHeight > document.querySelector(".toc-inner").clientHeight })`);
await check("a long TOC stays between the sticky layers and the footer, and scrolls itself",
  () => near(longToc.toc.top, longToc.sticky) && longToc.toc.bottom <= longToc.footer + 0.5 && longToc.scrolls, longToc);

/* ═══ 5. the footer and its clearance ═══════════════════════════════════════════════════════════ */
const clearance = async () => {
  await scrollTo(1e6);
  return page(`(() => { const f = document.querySelector("footer.status");
    return { display: T.cs(f, "display"), footer: f.getBoundingClientRect().height, footerTop: f.getBoundingClientRect().top,
      status: T.token("--status-h"), statusPx: parseFloat(T.cs(document.body, "paddingBottom")),
      scrollPad: parseFloat(T.cs("html", "scrollPaddingBottom")), mainBottom: T.rect("main").bottom,
      left: T.rect(".status-left"), right: T.rect(".status-right"), vw: document.documentElement.clientWidth,
      controls: T.qa("footer.status .status-right > :is(details, button)").map((c) => (c.matches("details") ? c.querySelector("summary") : c).getBoundingClientRect().height),
      reach: T.qa("footer.status .status-right > *").every((c) => { const b = c.getBoundingClientRect(); return b.left >= 0 && b.right <= document.documentElement.clientWidth + 0.5 && b.bottom <= innerHeight + 0.5; }) }; })()`);
};
await load("nobanner");
const desk = await clearance();
await check("desktop: the footer is exactly --status-h (2rem) tall", () => desk.status === "2rem" && near(desk.footer, 32, 0.01), desk);
await check("…because its controls are one control height (--control-h, 28px), not 36px of padding", () => desk.controls.length === 3 && desk.controls.every((h) => near(h, 28, 0.01)), desk.controls);
await check("…the body reserves exactly that below its content, and the viewport's scroll padding too",
  () => near(desk.statusPx, desk.footer, 0.01) && near(desk.scrollPad, desk.footer, 0.01), desk);
await check("…so at the very bottom the last of <main> ends where the footer starts, not under it",
  () => desk.mainBottom <= desk.footerTop + 0.5, { main: desk.mainBottom, footer: desk.footerTop });
await load("nobanner&nomf&nolang", { width: 375, height: 812 });
const phone = await clearance();
await check("phone, no .mobile-footer: the footer stays, wraps to two rows and --status-h follows (3.25rem)",
  () => phone.display === "flex" && phone.status === "3.25rem" && near(phone.footer, 52, 0.01) && phone.right.top >= phone.left.bottom, phone);
await check("…the body reserves the two rows", () => near(phone.statusPx, 52, 0.01) && near(phone.scrollPad, 52, 0.01), phone);
await check("…and the last of <main> ends above the footer", () => phone.mainBottom <= phone.footerTop + 0.5, { main: phone.mainBottom, footer: phone.footerTop });
await load("nobanner&nomf", { width: 375, height: 812 });
const crowded = await clearance();
await check("phone, a footer too full for one row: the controls wrap and NONE is clipped off the screen",
  () => crowded.reach, crowded);
await check("…and the page reserves what that footer really is (a third row), not the token: body and scroll padding = its rendered height",
  () => crowded.footer > 60 && near(crowded.statusPx, crowded.footer, 0.01) && near(crowded.scrollPad, crowded.footer, 0.01) && crowded.mainBottom <= crowded.footerTop + 0.5, crowded);
await load("nobanner", { width: 375, height: 812 });
const folded = await clearance();
await check("phone, with a .mobile-footer: the footer folds into the burger and reserves nothing",
  () => folded.display === "none" && folded.status === "0rem" && folded.statusPx === 0 && folded.scrollPad === 0, folded);

/* ═══ 6. the anim toggle keeps every copy and its label in step ═════════════════════════════════ */
await load("nobanner");
const anim = () => page(`T.qa("[data-anim-toggle]").map((t) => [t.getAttribute("aria-pressed"), t.querySelector("[data-anim-box]")?.textContent, t.querySelector("[data-anim-label]")?.textContent ?? null])`);
await check("every anim toggle starts on, and the labelled one says so", async () => {
  const all = await anim();
  return all.every(([p, box]) => p === "true" && box === "[x]") && all.some(([, , l]) => l === "enabled");
}, anim);
await press("#labelled-anim-toggle");
await check("one press turns animation off and EVERY toggle follows: box, pressed state and the label",
  async () => {
    const all = await anim();
    return (await page(`document.documentElement.classList.contains("anim-off") && localStorage.getItem("anim") === "off"`)) &&
      all.every(([p, box]) => p === "false" && box === "[ ]") && all.some(([, , l]) => l === "disabled");
  }, anim);
await page(`document.querySelector("#footer .demo-row").insertAdjacentHTML("beforeend", '<button type="button" id="late-anim" class="anim-toggle" data-anim-toggle aria-pressed="true" data-label-on="an" data-label-off="aus"><span data-anim-box>[x]</span> <span data-anim-label>an</span></button>'); null`);
await frames(2);
await check("a toggle rendered later shows the current state at once, in its own words",
  () => page(`(() => { const t = document.getElementById("late-anim"); return t.getAttribute("aria-pressed") === "false" && t.querySelector("[data-anim-label]").textContent === "aus"; })()`));
await press("footer.status .anim-toggle");
await check("the footer's toggle turns it back on, and the labelled one says enabled again",
  () => page(`!document.documentElement.classList.contains("anim-off") && document.querySelector("#labelled-anim-toggle [data-anim-label]").textContent === "enabled"`));
await check("a toggle with no data-label-on/off keeps the words it was written with",
  () => page(`document.querySelector("footer.status .anim-toggle").textContent.replace(/\\s+/g, " ").trim() === "[x] anim"`));

/* ═══ 7. the table of contents' spy ═════════════════════════════════════════════════════════════ */
await load("nobanner");
const current = () => page(`T.qa("[data-toc-link][aria-current]").map((a) => a.dataset.tocLink + "=" + a.getAttribute("aria-current"))`);
for (const id of ["rail", "scrollbars", "table"]) {
  await page(`document.getElementById("${id}").scrollIntoView({ behavior: "instant" }); null`);
  await frames(4);
  await check(`scrolled to #${id}: its entry, and only its entry, is aria-current="true"`,
    async () => { const c = await current(); return c.length === 1 && c[0] === `${id}=true`; }, current);
}
// The case the sources got wrong: a TOC link lands its section a line under the toolbar, where the
// PREVIOUS section's tail is still inside the top 30% band. The clicked entry must be the marked one.
for (const id of ["footer", "language", "text-actions"]) {
  await press(`.toc a[data-toc-link="${id}"]`);
  await settle();
  await frames(3);
  await check(`a press on the TOC's "${id}" entry marks THAT entry, not the section before it`,
    async () => { const c = await current(); return c.length === 1 && c[0] === `${id}=true`; }, current);
}
const tocLook = await page(`(() => { const on = document.querySelector('.toc [aria-current="true"]'), off = document.querySelector(".toc a:not([aria-current])");
  return { on: T.cs(on, "color"), off: T.cs(off, "color"), primary: T.colour("var(--primary)"), muted: T.colour("var(--muted-foreground)"),
    onWeight: T.cs(on, "fontWeight"), offWeight: T.cs(off, "fontWeight"), series: [T.cs('#series a[aria-current="page"]', "color"), T.cs('#series a[aria-current="page"]', "fontWeight")] }; })()`);
await check("the current entry is --primary, the rest --muted-foreground", () => tocLook.on === tocLook.primary && tocLook.off === tocLook.muted, tocLook);
await check("…COLOUR ONLY: the same weight, so the list never re-wraps as the mark moves", () => tocLook.onWeight === tocLook.offWeight, tocLook);
await check("the series list marks its current PAGE with weight as well as colour", () => tocLook.series[0] === tocLook.primary && tocLook.series[1] === "700", tocLook.series);
await page(`document.querySelector(".content").insertAdjacentHTML("beforeend", '<section id="late-section" style="min-block-size: 70rem"><h2>late</h2></section>');
  document.querySelector(".toc ol").insertAdjacentHTML("beforeend", '<li><a href="#late-section" data-toc-link="late-section">late</a></li>'); null`);
await frames(3);
await page(`document.getElementById("late-section").scrollIntoView({ behavior: "instant" }); null`);
await frames(4);
await check("an entry and a section rendered after initToc() are spied on too",
  async () => { const c = await current(); return c.length === 1 && c[0] === "late-section=true"; }, current);
await page(`window.ddToc.destroy(); null`);
await frames(1);
await check("destroy() clears the mark", async () => (await current()).length === 0, current);
await page(`document.getElementById("rail").scrollIntoView({ behavior: "instant" }); null`);
await frames(4);
await check("…and stops the spy", async () => (await current()).length === 0, current);

/* ═══ 8. crumbs, navlist and the burger: shape and targets ══════════════════════════════════════ */
await load("nobanner");
const crumbs = await page(`(() => { const lis = T.qa("#demo-crumbs li");
  return { sep: T.cs(lis[1], "content", "::before"), first: T.cs(lis[0], "content", "::before"), host: document.querySelector("#demo-crumbs .crumbs-host").getAttribute("aria-hidden"),
    path: T.cs("#demo-crumbs", "color"), home: T.cs("#demo-crumbs .crumbs-home", "color"), current: T.cs('#demo-crumbs [aria-current="page"]', "color"),
    muted: T.colour("var(--muted-foreground)"), primary: T.colour("var(--primary)"), fg: T.colour("var(--foreground)"),
    buttonFont: [T.cs("#demo-crumbs button", "fontFamily"), T.cs("#demo-crumbs", "fontFamily")], ellipsis: T.cs("#demo-crumbs", "textOverflow"),
    line: T.rect('#demo-crumbs [aria-current="page"]').top - T.rect("#demo-crumbs").top - parseFloat(T.cs("#demo-crumbs", "paddingTop")), nav: document.querySelector("#demo-crumbs").tagName, label: document.querySelector("#demo-crumbs").getAttribute("aria-label") }; })()`);
await check('crumbs: a named nav, an ordered list, the separator drawn and not read ("/" / "")',
  () => crumbs.nav === "NAV" && crumbs.label === "breadcrumb" && crumbs.sep === '"/" / ""' && crumbs.first === "none" && crumbs.host === "true", crumbs);
await check("…muted path, --primary home, --foreground current", () => crumbs.path === crumbs.muted && crumbs.home === crumbs.primary && crumbs.current === crumbs.fg, crumbs);
await check("…a button segment reads as the link beside it, and the path ellipsizes", () => crumbs.buttonFont[0] === crumbs.buttonFont[1] && crumbs.ellipsis === "ellipsis", crumbs);
await load("nobanner", { coarse: true });
// The line is measured from the nav's CONTENT box, not the page: anything above the crumbs that a
// coarse pointer makes taller (another package's 44px rows) would move an absolute top.
const coarse = await page(`({ link: T.rect("#demo-crumbs a").height, button: T.rect("#demo-crumbs button").height,
  line: T.rect('#demo-crumbs [aria-current="page"]').top - T.rect("#demo-crumbs").top - parseFloat(T.cs("#demo-crumbs", "paddingTop")),
  navlist: T.rect(".toc a").height })`);
await check("coarse pointer: every crumb is a 44px target (a link's padding grows its 14px content area, not the line)",
  () => coarse.link >= 44 && coarse.button >= 44, coarse);
await check("…inside the SAME line box: the path does not move", () => near(coarse.line, crumbs.line, 0.01), { fine: crumbs.line, coarse: coarse.line });
await check("…and a TOC entry is a 44px row", () => near(coarse.navlist, 44, 0.01), coarse);
// A series entry's lead ("part 5") beside a title long enough to wrap: the lead stays one line at its
// own width and the title wraps. On 0.60.0 the lead shrank as a flex item and broke into "part" / "5".
await load("nobanner", { width: 375, height: 812 });
const lead = await page(`(() => { const a = T.q("#series li:first-child a"); a.textContent = "a design system for one person, and why it keeps every surface on one release";
  const lines = (node) => { const r = document.createRange(); r.selectNodeContents(node); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
  const el = T.q("#series li:first-child .navlist-lead");
  return { lines: lines(el), titleLines: lines(a),
    flex: T.cs(el, "flex"), ws: T.cs(el, "whiteSpace") }; })()`);
await check("a series entry's lead stays one line at its own width beside a title that wraps (flex none, nowrap)",
  () => lead.lines === 1 && lead.titleLines > 1 && lead.flex === "0 0 auto" && lead.ws === "nowrap", lead);
await load("nobanner&burger", { width: 375, height: 812, coarse: true });
const burger = await page(`({ rows: T.qa(".mobile-footer :is(.doc-link, .mobile-theme > summary, .anim-toggle, .mf-panel .dropdown-item)").map((e) => e.getBoundingClientRect().height),
  list: [T.cs(".site-nav .ls-panel", "listStyleType"), T.cs(".site-nav .ls-panel", "paddingLeft"), T.cs(".site-nav .ls-panel", "marginTop")],
  chev: T.qa(".mobile-theme[open] .mf-chev").map((c) => T.cs(c, "transform")) })`);
await check("burger, coarse pointer: every folded footer control is a 44px row", () => burger.rows.length >= 8 && burger.rows.every((h) => near(h, 44, 0.01)), burger.rows);
await check("…the chevron of an open accordion is turned", () => burger.chev.length === 2 && burger.chev.every((t) => t !== "none"), burger.chev);
await load("bare&nobanner&burger", { width: 375, height: 812 });
// NETMON'S CASE: tokens + chrome, no components.css. The burger's anim toggle is a <button>, and without
// chrome.css's own reset it rendered as the platform's button — Arial 13.33px, a grey fill, a 2px
// outset border — in a font the page never chose. The body takes the mono face as netmon's does.
{
  const { root: doc } = await (async () => { await send("DOM.enable"); await send("CSS.enable"); return send("DOM.getDocument", { depth: 0 }); })();
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector: ".mobile-footer .anim-toggle" });
  const read = () => page(`(() => { document.body.style.fontFamily = "var(--font-mono)"; const c = getComputedStyle(T.q(".mobile-footer .anim-toggle"));
    return { font: c.fontFamily, mono: getComputedStyle(document.body).fontFamily, bg: c.backgroundColor, border: c.borderTopStyle + " " + c.borderTopWidth,
      colour: c.color, primary: T.colour("var(--primary)") }; })()`);
  const rest = await read();
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
  await frames(2);
  const hover = await read();
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
  await check("with tokens + chrome only, the burger's anim toggle is not a native button: the page's mono face, no fill, no outset border — and it lights --primary under the pointer",
    () => /JetBrains Mono/.test(rest.font) && rest.font === rest.mono && rest.bg === "rgba(0, 0, 0, 0)" && rest.border === "none 0px" &&
      rest.colour !== rest.primary && hover.colour === hover.primary, { rest, hover });
}
await check("the rail's list is reset in the burger with NOTHING but tokens + chrome loaded (no bullets, no indent)",
  () => page(`T.cs(".site-nav .ls-panel", "listStyleType") === "none" && T.cs(".site-nav .ls-panel", "paddingLeft") === "0px" && T.cs(".site-nav .ls-panel", "marginTop") === "0px"`));

/* ═══ 9. text actions on a <button>, the page column, the scrollbars, the table, the strip ════════ */
await load("bare&nobanner");
const buttons = await page(`(() => { const b = document.getElementById("btn-forward"), p = b.parentElement;
  return { pad: T.cs(b, "padding"), border: T.cs(b, "borderTopWidth"), bg: T.cs(b, "backgroundColor"), cursor: T.cs(b, "cursor"),
    font: [T.cs(b, "fontFamily"), T.cs(p, "fontFamily"), T.cs(b, "fontSize"), T.cs(p, "fontSize")], color: T.cs(b, "color"), primary: T.colour("var(--primary)"),
    disabled: [T.cs("#btn-disabled", "opacity"), T.cs("#btn-disabled", "cursor")], doc: [T.cs("#btn-doc", "color"), T.colour("var(--muted-foreground)")] }; })()`);
await check("button.doc-link: no box of its own — padding 0, no border, no fill, a pointer",
  () => buttons.pad === "0px" && buttons.border === "0px" && buttons.bg === "rgba(0, 0, 0, 0)" && buttons.cursor === "pointer", buttons);
await check("…in its parent's font, not the browser's button font (X2)", () => buttons.font[0] === buttons.font[1] && buttons.font[2] === buttons.font[3], buttons.font);
await check("…the forward one in --primary, the quiet one muted (never red)", () => buttons.color === buttons.primary && buttons.doc[0] === buttons.doc[1], buttons);
await check("…and disabled at .45 with no pointer", () => buttons.disabled[0] === "0.45" && buttons.disabled[1] === "default", buttons.disabled);
// reset.css gives every button `font: inherit`, so these can only fail with it off: ?bare.
const inherits = await page(`[["#demo-crumbs button", "#demo-crumbs"], [".ls-nav-toggle", ".ls-nav-head"]].map(([c, p]) =>
  [c, T.cs(c, "fontFamily") === T.cs(p, "fontFamily") && T.cs(c, "fontSize") === T.cs(p, "fontSize")]).filter(([, ok]) => !ok)`);
await check("bare page: the crumbs' button segment and the rail toggle carry their parent's font themselves", () => inherits.length === 0, inherits);
await load("nobanner");
const column = await page(`({ max: T.cs("main.wrap", "maxWidth"), pad: T.cs("main.wrap", "paddingLeft"), full: T.cs("#full-wrap", "maxWidth"), fullPad: T.cs("#full-wrap", "paddingLeft") })`);
await check(".wrap is --content-w wide with the --content-pad gutter; .wrap--full drops the cap and keeps the gutter",
  () => column.max === "1440px" && column.pad === "24px" && column.full === "none" && column.fullPad === "24px", column);
await load("nobanner", { width: 375, height: 812 });
await check("…and the gutter is 1.25rem on a phone", () => page(`T.cs("main.wrap", "paddingLeft") === "20px"`));
await load("nobanner");
const bars = await page(`(() => { const g = (id) => { const e = document.getElementById(id); return e.offsetWidth - e.clientWidth - 2; };
  document.getElementById("scroller-thin").firstElementChild.insertAdjacentHTML("beforeend", '<div id="nested" style="overflow:auto;block-size:3rem;inline-size:8rem"><div style="inline-size:20rem;block-size:6rem">nested</div></div>');
  return { thin: g("scroller-thin"), plain: g("scroller-default"), nested: g("nested") + 2 }; })()`);
await check(".scrollbars-thin gives a scroller the .tablewrap scrollbar (.55rem, always visible) instead of the browser's own",
  () => bars.thin >= 8 && bars.thin <= 9 && bars.plain !== bars.thin, bars);
await check("…and it reaches the scrollers inside it", () => bars.nested >= 8 && bars.nested <= 9, bars);
const table = await page(`({ th: T.cs("#card-table thead th", "backgroundColor"), card: T.colour("var(--card)"), sticky: T.cs("#card-table thead th", "position") })`);
await check("a sticky table header inside a --card card paints the card, not a band of page colour", () => table.th === table.card && table.sticky === "sticky", table);
const ticks = await page(`(() => { const g = (s) => T.cs(s, "content", "::before");
  return { ok: g(".tick--ok .tick-dot"), running: g(".tick--running .tick-dot"), stale: g(".tick--stale .tick-dot"), never: g(".tick--never .tick-dot"),
    size: [T.cs(".tick-dot", "fontSize"), T.cs(".tickstrip", "fontSize")], next: [T.cs(".tick-next", "opacity"), T.cs(".tick-next", "color")], muted: T.colour("var(--muted-foreground)"),
    sep: T.cs(".tick-sep", "color"), border: T.colour("var(--border)"), runningInk: [T.cs(".tick--running .tick-dot", "color"), T.cs(".tick--ok .tick-dot", "color")], info: T.colour("var(--info)"),
    head: T.rect(".ticktable thead").height, tint: [T.cs(".tick--stale", "backgroundColor"), T.colour("color-mix(in srgb, var(--destructive) 6%, transparent)")] }; })()`);
await check("tick glyphs come from the state class, with empty alt text: ● ok and running, ✕ stale, ○ never",
  () => ticks.ok === '"●" / ""' && ticks.running === '"●" / ""' && ticks.stale === '"✕" / ""' && ticks.never === '"○" / ""', ticks);
await check("…at the text size, not .7em", () => ticks.size[0] === ticks.size[1], ticks.size);
await check("…a running row is --info: never red, and not the idle ok either", () => ticks.runningInk[0] === ticks.info && ticks.runningInk[0] !== ticks.runningInk[1], ticks.runningInk);
await check("the runtime's visually hidden header row takes no box (base.css would pad its cells and rule them)", () => ticks.head === 0, ticks.head);
await check("a stale row's tint is the house 6% step for a background that carries tone text", () => ticks.tint[0] === ticks.tint[1], ticks.tint);
await check(".tick-next reads like .tick-last: muted, no opacity", () => ticks.next[0] === "1" && ticks.next[1] === ticks.muted, ticks.next);
await check(".tick-sep is decoration in the rule colour", () => ticks.sep === ticks.border, ticks);
const flat = await page(`T.qa("header.bar, .bar-stack, footer.status, .page-toolbar, .toc-inner, .crumbs, .ls-nav, .navlist a, button.doc-link, .ls-nav-toggle").filter((e) => T.cs(e, "borderTopLeftRadius") !== "0px").map((e) => e.className || e.tagName)`);
await check("no rounded corner anywhere in the chrome", () => flat.length === 0, flat);

/* ═══ 10. focus rings, with ONLY tokens + chrome loaded (X2) ════════════════════════════════════ */
const rings = async (selectors) => page(`(${JSON.stringify(selectors)}).map((s) => { const e = document.querySelector(s); e.focus({ focusVisible: true });
  const r = { s, visible: e.matches(":focus-visible"), style: T.cs(e, "outlineStyle"), width: T.cs(e, "outlineWidth"), colour: T.cs(e, "outlineColor") }; e.blur(); return r; })
  .filter((r) => !(r.visible && r.style === "solid" && r.width === "2px" && r.colour === T.colour("var(--ring)")))`);
await load("bare&nobanner");
const badRings = await rings(["#demo-crumbs a", "#demo-crumbs button", ".toc a", "#btn-forward", "#btn-doc", ".status-right .doc-link", ".ls-nav-toggle"]);
await check("bare page: every chrome control draws the --ring focus ring itself (crumbs, TOC, doc-links, rail toggle)",
  () => badRings.length === 0, badRings);
await load("bare&nobanner&burger", { width: 375, height: 812 });
const badBurger = await rings([".mobile-theme > summary"]);
await check("bare page: the burger's accordion summary draws its own ring", () => badBurger.length === 0, badBurger);

/* ═══ 11. `hidden` hides every chrome part (X3) ═════════════════════════════════════════════════ */
await load("bare&nobanner");
const shown = await page(`T.qa(".bar-stack, .bar-side, .bar-center, .bar-history, .bar-status, .crumbs, .page-toolbar, .layout, .toc, .navlist, footer.status, .status-right, .ls-nav, .navlist a")
  .map((e) => { e.hidden = true; const d = T.cs(e, "display"); e.hidden = false; return [e.className || e.tagName, d]; }).filter(([, d]) => d !== "none")`);
await check("with tokens.css loaded, `hidden` hides each of them whatever display its class sets", () => shown.length === 0, shown);

/* ═══ 12. forced colours (X1): PAINTED pixels, two palettes, four themes ════════════════════════
 * Under forced colours the computed style is not what reaches the screen. Text that keeps the
 * adjustment gets a Canvas BACKPLATE no style mentions, so a HighlightText word on a Highlight row
 * reads 21:1 in getComputedStyle and 1:1 on screen; and a glyph under `none` keeps its author colour,
 * which passes on one palette and not the other. So every figure here is read off a screenshot, on a
 * light AND a dark forced palette (prefers-color-scheme under forced-colors), on all four themes. */
const decodePng = (buffer) => {
  let at = 8, width = 0, height = 0, bpp = 0;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), type = buffer.toString("ascii", at + 4, at + 8), data = buffer.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bpp = { 2: 3, 6: 4 }[data[9]];
      if (data[8] !== 8 || data[12] !== 0 || !bpp) throw new Error("png: only 8-bit, non-interlaced RGB(A) is decoded here");
    }
    if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      out[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
  }
  const pixels = [];
  for (let i = 0; i < out.length; i += bpp) pixels.push([out[i], out[i + 1], out[i + 2]]);
  return pixels;
};
const luminance = (rgb) => rgb.map((v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratioOf = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// One page clip, captured IN the viewport. `captureBeyondViewport` re-lays the page without its
// scrollbar, and a clip computed beforehand then reads pixels up to ~7.5px off (RULES-CROSSCUT X1).
const shoot = async (clip) => decodePng(Buffer.from((await send("Page.captureScreenshot",
  { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })).data, "base64"));
const commonest = (pixels) => {
  const counts = new Map();
  for (const p of pixels) counts.set(p.join(), (counts.get(p.join()) || 0) + 1);
  return [...counts].sort((x, y) => y[1] - x[1])[0][0].split(",").map(Number);
};
// What a region PAINTS: its commonest colour is what the ink sits on, and the ink is the pixel that
// stands out from it most (a stem reaches the glyph's full colour; anti-aliasing only fades it).
const paint = (pixels) => {
  const bg = commonest(pixels);
  let ink = bg, ratio = 1;
  for (const p of pixels) { const r = ratioOf(p, bg); if (r > ratio) { ratio = r; ink = p; } }
  return { bg: bg.join(), ink: ink.join(), ratio: Math.round(ratio * 100) / 100 };
};
// The regions, as page clips: each element's CONTENT box (a border is ink too, and would pass a
// glyph that is not there). Only an element outside the viewport is scrolled to: the sticky layers
// are always on screen, and scrolling for them would move the TOC's current entry mid-measurement.
// INK hides just the ink a figure is about (the element, one of its pseudo-elements, or a child), so
// the clip can be shown to hold it and nothing else, on each forced palette: with the ink hidden the
// clip must change AND be empty. Forced colours can paint ink normal colours never did (a neighbour's
// transparent text), and a clip holding a stranger's ink passes every ratio. `visibility: hidden`
// removes the element's paint without moving its neighbours, so the clip still means the same box.
const REGIONS = `window.R = (selector, part) => {
  const e = document.querySelector(selector);
  if (!e) return null;
  const at = e.getBoundingClientRect();
  if (at.top < 0 || at.bottom > innerHeight) e.scrollIntoView({ block: "center", behavior: "instant" });
  const b = e.getBoundingClientRect(), s = getComputedStyle(e), n = (p) => parseFloat(s[p]) || 0;
  const r = { left: b.left + n("borderLeftWidth") + n("paddingLeft"), right: b.right - n("borderRightWidth") - n("paddingRight"),
    top: b.top + n("borderTopWidth") + n("paddingTop"), bottom: b.bottom - n("borderBottomWidth") - n("paddingBottom") };
  if (part === "after-name") r.left = e.querySelector(".ls-name").getBoundingClientRect().right + 1;
  if (part === "before-child") r.right = e.firstElementChild.getBoundingClientRect().left - 1;
  if (part === "ring") Object.assign(r, { left: Math.max(0, b.left - 4), right: Math.min(document.documentElement.clientWidth, b.right + 4),
    top: Math.max(0, b.top - 4), bottom: Math.min(innerHeight, b.bottom + 4) });
  const x = Math.ceil(r.left + scrollX), y = Math.ceil(r.top + scrollY);
  return { x, y, width: Math.floor(r.right + scrollX) - x, height: Math.floor(r.bottom + scrollY) - y };
};
window.INK = (selector, ink, on) => {
  const e = document.querySelector(selector);
  const target = ink === "self" || ink === "before" || ink === "after" ? e : e.querySelector(ink);
  target.classList.toggle(ink === "before" ? "__hide-before" : ink === "after" ? "__hide-after" : "__hide", on);
}; null`;
const measure = async (items) => {
  await evaluate(REGIONS);
  const out = {};
  for (const [name, selector, part, ink] of items) {
    const region = await evaluate(`R(${JSON.stringify(selector)}, ${JSON.stringify(part || null)})`);
    await frames();
    if (!region || region.width <= 0 || region.height <= 0) { out[name] = null; continue; }
    const shown = await shoot(region);
    out[name] = paint(shown);
    if (!ink) continue;
    await evaluate(`INK(${JSON.stringify(selector)}, ${JSON.stringify(ink)}, true)`);
    await frames();
    const hidden = await shoot(region);
    await evaluate(`INK(${JSON.stringify(selector)}, ${JSON.stringify(ink)}, false)`);
    await frames(1);
    out[name].holds = shown.some((p, i) => p.join() !== hidden[i].join());
    out[name].rest = paint(hidden).ratio;
    out[name].groundHidden = paint(hidden).bg;
  }
  return out;
};
// A focused ring, as painted: the pixels focusing changes, and what they were before. An element
// opted out of the adjustment keeps its author outline colour unless it names a system one.
const ringOf = async (selector) => {
  await evaluate(REGIONS);
  const clip = await evaluate(`R(${JSON.stringify(selector)}, "ring")`);
  await frames();
  const before = await shoot(clip);
  // REAL keyboard focus: the focusable element before this one, then Tab. A :focus-visible forced
  // through DevTools computes the outline and paints nothing (RULES-CROSSCUT X1).
  const primed = await evaluate(`(() => { const target = document.querySelector(${JSON.stringify(selector)});
    const all = [...document.querySelectorAll('a[href], button:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')].filter((e) => e.getClientRects().length);
    const prev = all[all.indexOf(target) - 1];
    if (!prev) return false;
    prev.focus({ preventScroll: true });
    return true; })()`);
  for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await frames();
  const tabbed = primed && await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)}) && document.activeElement.matches(":focus-visible")`);
  const focused = await shoot(clip);
  await evaluate(`document.activeElement.blur(); null`);
  await frames(1);
  const changed = before.map((p, i) => [p, focused[i]]).filter(([p, q]) => p.join() !== q.join());
  if (!changed.length) return { ratio: 1, changed: 0, tabbed };
  const ring = commonest(changed.map(([, q]) => q)), under = commonest(changed.map(([p]) => p));
  return { ring: ring.join(), under: under.join(), ratio: Math.round(ratioOf(ring, under) * 100) / 100, changed: changed.length, tabbed };
};
const PALETTES = ["light", "dark"], THEMES = ["warm", "green", "mono", "paper"];
// [name, selector, part, ink] — text on a state (4.5:1), a glyph (3:1), a state's neighbour (must differ)
const TEXT_ON_STATE = [
  ["rail current: name", '.ls-nav .ls-row[aria-current="page"] .ls-name', null, "self"],
  ["rail current: permissions", '.ls-nav .ls-row[aria-current="page"] .ls-perm', null, "self"],
  ["rail current: the ← mark", '.ls-nav .ls-row[aria-current="page"]', "after-name", "after"],
  ["rail row another rule selects: name", ".ls-nav .ls-row.__selected .ls-name", null, "self"],
  ["rail row another rule selects: permissions", ".ls-nav .ls-row.__selected .ls-perm", null, "self"],
  ["TOC current entry", '.toc a[aria-current="true"]', null, ".__ink"],
  ["series current part", '#series a[aria-current="page"]', null, ".__ink"],
  // The same two words in their OWN box (the wrapped text), where a backplate would be the ground: in
  // the whole entry the state's fill around the words stays the commonest colour either way.
  ["TOC current entry: its words", '.toc a[aria-current="true"] .__ink', null, "self"],
  ["series current part: its words", '#series a[aria-current="page"] .__ink', null, "self"],
];
const PAIRS = [
  ["rail current row", '.ls-nav .ls-row[aria-current="page"]', '.ls-nav .ls-row:not([aria-current]):not(.__selected)'],
  ["TOC current entry", '.toc a[aria-current="true"]', ".toc a:not([aria-current])"],
  ["series current part", '#series a[aria-current="page"]', "#series a:not([aria-current])"],
];
const GLYPHS = [
  ["tick ● ok", ".tick--ok .tick-dot", null, "before"], ["tick ● running", ".tick--running .tick-dot", null, "before"],
  ["tick ✕ stale", ".tick--stale .tick-dot", null, "before"], ["tick ○ never", ".tick--never .tick-dot", null, "before"],
  ["rail toggle »", ".ls-nav-toggle", null, "after"], ["crumbs /", "#bar-crumbs li + li", "before-child", "before"],
  ["history ‹ (WP4 mask)", '.bar-history [data-icon="chevron-left"]', null, "before"],
  ["history ⟲ (WP4 mask)", '.bar-history [data-icon="history"]', null, "before"],
];
const PHONE_GLYPHS = [["burger (inline svg)", ".nav-burger svg", null, "self"], ["accordion ▾", ".mobile-footer .mf-chev", null, "self"],
  ["burger menu current row: name", '.site-nav .ls-row[aria-current="page"] .ls-name', null, "self"]];
// Every element this file opts out of the adjustment, and so owns the colour of its focus ring.
const FOCUSED = [["rail current row", '.ls-nav .ls-row[aria-current="page"]'], ["TOC current entry", '.toc a[aria-current="true"]'],
  ["series current part", '#series a[aria-current="page"]']];
// A glyph is its context's forced colour ([name, selector, pseudo, the property it paints with,
// the context if not its host]). Pixels prove it can be seen on these two palettes; this proves it
// follows whatever palette the reader chose — `none` would keep an author colour that clears 3:1 here
// by luck (the burger's --muted-foreground measured 3.00:1 on dark paper).
const FOLLOWS = [
  ["tick ● ok", ".tick--ok .tick-dot", "::before", "color"], ["tick ● running", ".tick--running .tick-dot", "::before", "color"],
  ["tick ✕ stale", ".tick--stale .tick-dot", "::before", "color"], ["tick ○ never", ".tick--never .tick-dot", "::before", "color"],
  ["rail toggle »", ".ls-nav-toggle", "::after", "color"], ["crumbs /", "#bar-crumbs li + li", "::before", "color"],
  ["rail current ←", '.ls-nav .ls-row[aria-current="page"]', "::after", "color"],
  ["history ‹ (WP4 mask)", '.bar-history [data-icon="chevron-left"]', "::before", "backgroundColor"],
  ["history ⟲ (WP4 mask)", '.bar-history [data-icon="history"]', "::before", "backgroundColor"],
];
const PHONE_FOLLOWS = [["burger (inline svg)", ".nav-burger svg path", null, "stroke", "button"], ["accordion ▾", ".mobile-footer .mf-chev", null, "color", "summary"]];
const follows = (items) => page(`(${JSON.stringify(items)}).map(([name, selector, pseudo, prop, context]) => {
  const e = document.querySelector(selector);
  if (!e) return [name, null, "not found"];
  const host = context ? e.closest(context) : pseudo ? e : e.parentElement;
  return [name, getComputedStyle(e, pseudo)[prop], getComputedStyle(host).color]; })`);
// The page each forced load measures: the pointer parked in the left gutter (a hovered row would be
// another state), what components.css does to a menu row under the pointer applied to one rail row
// (opted out and given the selected pair: its name and permissions must follow it), the TOC's and the
// series' link text wrapped so it can be hidden apart from its background, and the reader's probes.
const PREPARE = `(() => {
  const s = document.createElement("style");
  s.textContent = "@media (forced-colors: active) { .ls-row.__selected { forced-color-adjust: none; background: Highlight; color: HighlightText; } }"
    + " .__hide, .__hide-before::before, .__hide-after::after { visibility: hidden !important; }";
  document.head.append(s);
  document.querySelector('.ls-nav .ls-row:not([aria-current])').classList.add("__selected");
  for (const a of document.querySelectorAll(".toc a, #series a")) a.innerHTML = '<span class="__ink">' + a.innerHTML + "</span>";
  for (const [id, html, top] of [["__blank", "", 300], ["__ink", "MMMM", 340], ["__two", '<span class="__one">MM</span>MM', 380]]) {
    const e = document.createElement("div"); e.id = id; e.innerHTML = html;
    e.style.cssText = "position:fixed;left:8px;top:" + top + "px;width:60px;height:24px;font:16px monospace;background:white;z-index:99";
    document.body.append(e);
  } })(); null`;
const cells = [];
// THE COLLECTION RUNS INSIDE A CHECK: a throw anywhere in it (a selector gone, a screenshot refused)
// is a FAIL naming the error, and the suite still finishes and reports the rest (07-controls).
await check("forced colours: the measurement pass runs to the end on both palettes", async () => {
  if (process.env.DD_FORCED_PROBE_THROW === "1") throw new Error("probe: the forced pass threw on purpose");
  for (const scheme of PALETTES) {
    await load("nobanner", { forced: true, scheme });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 450 });
    await page(PREPARE);
    const probe = await measure([["an empty patch", "#__blank"], ["a line of body text", "#__ink", null, "self"],
      ["a clip holding a stranger's ink", "#__two", null, ".__one"]]);
    for (const theme of THEMES) {
      await page(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
      // Parked on the TOC's own section: the TOC has a current entry (nothing is current above the
      // first section) and the series list is on screen, so nothing below scrolls until the glyphs.
      await page(`document.getElementById("toc").scrollIntoView({ block: "start", behavior: "instant" }); null`);
      await frames(4);
      const text = await measure(TEXT_ON_STATE);
      const states = await measure([["rail current row", '.ls-nav .ls-row[aria-current="page"]'], ["rail selected row", ".ls-nav .ls-row.__selected"],
        ["TOC current entry", '.toc a[aria-current="true"]'], ["series current part", '#series a[aria-current="page"]']]);
      const pairs = {};
      for (const [name, on, off] of PAIRS) {
        const [a, b] = Object.values(await measure([[`${name} (on)`, on], [`${name} (off)`, off]]));
        pairs[name] = a && b ? [a.bg, b.bg] : null;
      }
      const rings = {};
      for (const [name, selector] of FOCUSED) rings[name] = await ringOf(selector);
      const followed = await follows(FOLLOWS);
      const glyphs = await measure(GLYPHS);
      const disabled = Object.values(await measure([["disabled", "#btn-disabled", null, "self"], ["enabled", "#btn-forward", null, "self"]]));
      cells.push({ scheme, theme, probe, text, states, glyphs, pairs, rings, followed, disabled });
    }
    await load("nobanner&burger", { forced: true, scheme, width: 375, height: 812 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 805 });
    await page(PREPARE);
    for (const theme of THEMES) {
      await page(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
      await frames(2);
      const cell = cells.find((c) => c.scheme === scheme && c.theme === theme);
      Object.assign(cell.glyphs, await measure(PHONE_GLYPHS));
      Object.assign(cell.states, await measure([["burger menu current row", '.site-nav .ls-row[aria-current="page"]']]));
      cell.followed.push(...await follows(PHONE_FOLLOWS));
    }
  }
  return cells.length === PALETTES.length * THEMES.length;
});
const cellName = (c) => `${c.scheme} ${c.theme}`;
console.log(`\nFORCED COLOURS  painted contrast (ink against what it sits on), ${cells.map(cellName).join(" · ")}`);
for (const [group, key] of cells.length ? [["text on a state", "text"], ["glyph", "glyphs"], ["focused ring", "rings"]] : []) {
  for (const name of Object.keys(cells[0][key])) {
    console.log(`  ${group.padEnd(15)} ${name.padEnd(44)} ${cells.map((c) => (c[key][name] ? c[key][name].ratio.toFixed(2) : "  —").padStart(6)).join(" ")}`);
  }
}
// Every assertion below also needs ALL the cells: over zero cells an `every` is true and a list of
// failures is empty, so a pass that threw early would otherwise read as green.
const full = () => cells.length === PALETTES.length * THEMES.length;
const below = (key, floor) => cells.flatMap((c) => Object.entries(c[key]).filter(([, m]) => !m || m.ratio < floor).map(([n, m]) => `${cellName(c)} ${n}: ${m ? m.ratio : "not found"}`));
await check("forced colours, the reader can tell: an empty patch paints nothing (1:1), a line of text paints ink (≥ 7:1), and a clip that "
  + "still holds a stranger's ink once its own is hidden is seen, on both palettes",
  () => full() && cells.every((c) => c.probe["an empty patch"].ratio < 1.1 && c.probe["a line of body text"].ratio >= 7 && c.probe["a clip holding a stranger's ink"].rest >= 7),
  cells.map((c) => [cellName(c), c.probe]));
const figures = (c) => ({ ...c.text, ...c.glyphs, "disabled action": c.disabled[0], "enabled action": c.disabled[1] });
const missed = cells.flatMap((c) => Object.entries(figures(c)).filter(([, m]) => !m || !m.holds || m.rest >= 1.1)
  .map(([n, m]) => `${cellName(c)} ${n}: ${m ? (m.holds ? `${m.rest}:1 left with its ink hidden` : "unchanged with its ink hidden") : "not found"}`));
await check("…and every clip a figure comes from holds that element's ink and nothing else: hidden, the clip changes and is empty",
  () => full() && missed.length === 0, missed);
await check("forced colours: every piece of text on a drawn state paints at 4.5:1 or better, on both palettes and all four themes",
  () => full() && below("text", 4.5).length === 0, () => below("text", 4.5));
// A WORD ON ITS STATE, NOT ON A BACKPLATE. A word that kept the adjustment is drawn on a Canvas
// backplate the state's fill never shows: the ratio (the word on its own plate) and the ownership
// proof both still pass. So the ground of each word's own clip must be (a) the same with the word
// hidden and (b) the ground of the state it belongs to. (a) alone misses a plate that belongs to the
// LINE rather than to the word (measured on the TOC entry: the plate stays when the words are hidden).
const WORDS = [["rail current: name", "rail current row"], ["rail current: permissions", "rail current row"], ["rail current: the ← mark", "rail current row"],
  ["rail row another rule selects: name", "rail selected row"], ["rail row another rule selects: permissions", "rail selected row"],
  ["TOC current entry: its words", "TOC current entry"], ["series current part: its words", "series current part"],
  ["burger menu current row: name", "burger menu current row"]];
const plated = cells.flatMap((c) => WORDS.map(([n, state]) => [n, c.text[n] || c.glyphs[n], c.states[state]])
  .filter(([, m, st]) => !m || !st || m.bg !== m.groundHidden || m.bg !== st.bg)
  .map(([n, m, st]) => `${cellName(c)} ${n}: ${m && st ? `drawn on ${m.bg}, ${m.groundHidden} with it hidden, its state ${st.bg}` : "not found"}`));
await check("…and every such word sits on its state's own ground: the same with the word hidden, and the state's (no backplate)",
  () => full() && plated.length === 0, plated);
await check("…every glyph the chrome shows paints at 3:1 or better against what it sits on",
  () => full() && below("glyphs", 3).length === 0, () => below("glyphs", 3));
const strays = cells.flatMap((c) => c.followed.filter(([, paint, context]) => !paint || paint !== context).map(([n, paint, context]) => `${cellName(c)} ${n}: ${paint} in ${context}`));
await check("…and every glyph paints its context's forced colour, so it follows a palette the reader chose (never an author colour)",
  () => full() && strays.length === 0, strays);
const untabbed = cells.flatMap((c) => Object.entries(c.rings).filter(([, m]) => !m.tabbed).map(([n]) => `${cellName(c)} ${n}`));
await check("…a focused element this file opts out, reached with Tab, draws its ring in a system colour, at 3:1 or better against what it covers",
  () => full() && untabbed.length === 0 && below("rings", 3).length === 0, () => ({ untabbed, below: below("rings", 3) }));
const same = cells.flatMap((c) => Object.entries(c.pairs).filter(([, p]) => !p || p[0] === p[1]).map(([n, p]) => `${cellName(c)} ${n}: ${p ? p[0] : "not found"}`));
await check("…each state paints a different background from its neighbour (the rail's row, the TOC's and the series' current entries)",
  () => full() && same.length === 0, same);
await check("…a disabled text action paints a different colour from an enabled one",
  () => full() && cells.every((c) => c.disabled[0] && c.disabled[1] && c.disabled[0].ink !== c.disabled[1].ink), cells.map((c) => [cellName(c), c.disabled.map((m) => m && m.ink)]));

/* ═══ 13. the rail's boot reveal and print ══════════════════════════════════════════════════════ */
await load("nobanner");
const reveal = await page(`document.documentElement.classList.add("term-anim"); ({ rows: T.qa(".ls-panel[data-term-list] > li").map((li) => [T.cs(li, "animationName"), T.cs(li, "animationDelay")]),
  title: T.cs(".ls-nav-title", "animationName"), resting: T.cs(".ls-panel[data-term-list] > li:last-child", "opacity") })`);
await check("boot reveal: every row prints with dd-print, 0.6s + i × 0.11s after the title",
  () => reveal.title === "dd-print" && reveal.rows.every(([n, d], i) => n === "dd-print" && near(parseFloat(d), 0.6 + i * 0.11, 0.001)), reveal);
await page(`document.documentElement.classList.add("anim-off"); null`);
await check("…and html.anim-off stops it", () => page(`T.qa(".ls-panel[data-term-list] > li").every((li) => T.cs(li, "animationName") === "none")`));
await load("nobanner", { width: 375, height: 812 });
await check("…desktop only: the burger's copy of the list does not replay it",
  () => page(`document.documentElement.classList.add("term-anim"); T.qa(".ls-panel[data-term-list] > li").every((li) => T.cs(li, "animationName") === "none")`));
await load("nobanner", { print: true });
const paper = await page(`({ toolbar: [T.cs(".page-toolbar", "position"), T.cs(".page-toolbar", "borderBottomWidth")], stack: T.cs(".bar-stack", "position"),
  body: T.cs(document.body, "paddingBottom"), toc: T.cs(".toc", "display") })`);
await check("print: the toolbar stops sticking and loses its rule, the stack does not stick, the body drops the footer's room",
  () => paper.toolbar[0] === "static" && paper.toolbar[1] === "0px" && paper.stack === "static" && paper.body === "0px" && paper.toc === "none", paper);

/* ═══ 13b. the phone overrides survive the Tailwind entry's layering ═══════════════════════════ */
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setEmulatedMedia", { media: "", features: [] });
{
  const loaded = next("Page.loadEventFired");
  await send("Page.navigate", { url: BASE.replace("examples/chrome.html", "__layered.html") });
  await loaded;
  await frames(2);
}
const layered = await evaluate(`({ status: getComputedStyle(document.documentElement).getPropertyValue("--status-h").trim(),
  pad: getComputedStyle(document.body).paddingBottom, layers: [...document.styleSheets[0].cssRules].filter((r) => r.layerName === "components").length })`);
await check("with chrome.css in layer(components) under an unlayered tokens.css (the Tailwind entry), a phone footer still gets 3.25rem",
  () => layered.layers === 1 && layered.status === "3.25rem" && layered.pad === "52px", layered);

/* ═══ 14. contrast of every text pairing the chrome adds, on four themes and three surfaces ═════ */
await load("nobanner");
const contrast = await page(`(() => {
  const parse = (s) => { let m = s.match(/^rgba?\\(([^)]+)\\)/); if (m) { const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    m = s.match(/^color\\(srgb ([^)]+)\\)/); if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    throw new Error("unparsed colour " + s); };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const c = (css) => parse(T.colour(css));
  const out = {};
  for (const theme of ["warm", "green", "mono", "paper"]) {
    document.documentElement.dataset.theme = theme;
    const surfaces = { background: c("var(--background)"), card: c("var(--card)"), muted: c("var(--muted)") };
    const row = {};
    for (const [name, ink] of [["muted-foreground", "var(--muted-foreground)"], ["primary", "var(--primary)"], ["foreground", "var(--foreground)"], ["ring", "var(--ring)"], ["border", "var(--border)"]]) {
      row[name] = Object.fromEntries(Object.entries(surfaces).map(([s, bg]) => [s, Math.round(ratio(over(c(ink), bg), bg) * 100) / 100]));
    }
    // The stale row as rendered: each of its inks on the row's own tint over the strip's --card.
    const strip = parse(T.cs(".tickstrip", "backgroundColor")), tint = over(parse(T.cs(".tick--stale", "backgroundColor")), strip);
    const on = (s, p = "color") => Math.round(ratio(over(parse(T.cs(s, p)), tint), tint) * 100) / 100;
    row["stale row: name · last · next · stats · figure"] = { name: on(".tick--stale .tick-name"), last: on(".tick--stale .tick-last"),
      next: on(".tick--stale .tick-next"), stats: on(".tick--stale .tick-stats"), figure: on(".tick--stale .tick-stats b") };
    row["stale ✕ on its tint · running ● on the strip"] = { stale: on(".tick--stale .tick-dot"),
      running: Math.round(ratio(over(parse(T.cs(".tick--running .tick-dot", "color")), strip), strip) * 100) / 100 };
    out[theme] = row;
  }
  document.documentElement.dataset.theme = "warm";
  return out; })()`);
console.log("\nCONTRAST  (WCAG ratio; rows = ink, columns = --background / --card / --muted)");
for (const [theme, rows] of Object.entries(contrast)) {
  for (const [ink, cells] of Object.entries(rows)) console.log(`  ${theme.padEnd(6)} ${ink.padEnd(46)} ${Object.values(cells).map((v) => v.toFixed(2).padStart(6)).join(" ")}`);
}
const textInks = ["muted-foreground", "primary", "foreground", "stale row: name · last · next · stats · figure"];
const lows = Object.entries(contrast).flatMap(([t, rows]) => textInks.flatMap((ink) => Object.entries(rows[ink]).filter(([, v]) => v < 4.5).map(([s, v]) => `${t} ${ink} on ${s}: ${v}`)));
await check("every text ink the chrome uses clears 4.5:1 on every theme and surface", () => lows.length === 0, lows);
const ringLows = Object.entries(contrast).flatMap(([t, rows]) => Object.entries(rows.ring).filter(([, v]) => v < 3).map(([s, v]) => `${t} ring on ${s}: ${v}`));
await check("the focus ring clears 3:1 against every surface", () => ringLows.length === 0, ringLows);
const tickLows = Object.entries(contrast).flatMap(([t, rows]) => Object.entries(rows["stale ✕ on its tint · running ● on the strip"]).filter(([, v]) => v < 3).map(([s, v]) => `${t} ${s}: ${v}`));
await check("the stale ✕ and the running ● clear 3:1 as graphics", () => tickLows.length === 0, tickLows);

/* ═══ 15. fix round 1: jumps, rewritten attributes, late chrome, coarse targets, inline style ═════ */
// The TOC's truth, read the moment it is asked: the last entry whose target's top is above the
// reading line (30% down). Independent of the spy, which must agree with it after ANY jump.
const tocTruth = `(() => { let t = null; for (const a of document.querySelectorAll("[data-toc-link]")) {
  const e = document.getElementById(a.dataset.tocLink); if (e && e.getBoundingClientRect().top <= innerHeight * 0.3) t = a.dataset.tocLink; } return t; })()`;
const tocMarked = `[...document.querySelectorAll("[data-toc-link][aria-current]")].map((a) => a.dataset.tocLink).join(",") || null`;
for (const [query, instant] of [["bare&nobanner", false], ["nobanner", true]]) {
  await load(query);
  if (instant) await page(`document.head.insertAdjacentHTML("beforeend", "<style>html { scroll-behavior: auto !important; }</style>"); null`);
  const wrong = [];
  for (const id of ["crumbs", "footer", "sticky", "table", "column", "rail", "header", "text-actions", "language", "toc", "crumbs"]) {
    await press(`.toc a[data-toc-link="${id}"]`);
    await settle();
    await frames(3);
    const [marked, truth] = [await page(tocMarked), await page(tocTruth)];
    if (marked !== truth) wrong.push(`${id}: marked ${marked}, truth ${truth}`);
  }
  await check(`TOC, ${query}${instant ? " with scroll-behavior: auto" : ""}: after every one of 11 clicks, up and down, the marked entry is the true one`,
    () => wrong.length === 0, wrong);
  await page(`scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); null`);
  await frames(4);
  const bottom = await page(tocMarked);
  await page(`scrollTo({ top: 0, behavior: "instant" }); null`);
  await frames(4);
  // At y=0 the full page has nothing past the line; on ?bare (no base.css margins) the first section
  // starts 1.4px above it, so the reading-line rule marks that one. Either way: the truth, and never
  // the entry the bottom of the page had marked.
  const top = { bottom, marked: await page(tocMarked), truth: await page(tocTruth) };
  await check(`…and an instant scrollTo(0) from the bottom marks the truth there${instant ? " (nothing)" : ""}, never the bottom's entry (${query})`,
    () => top.bottom !== null && top.marked === top.truth && top.marked !== top.bottom && (!instant || top.marked === null), top);
}
// Removed WITHOUT anything the observer would report. An IntersectionObserver delivers an entry
// when a target that intersected the band is removed, and whenever a removal shifts one that does;
// either would pass whether or not the spy listens for removals. So the section is made the current
// one while lying wholly ABOVE the band (a tall spacer keeps the next section below the line), lifted
// out of the flow over a spacer holding its box, and then removed in a mutation that adds nothing:
// no target changes its intersection, and only the spy's own removal handling can move the mark.
await load("nobanner");
const held = await page(`(async () => { const r = document.getElementById("rail"), next = r.nextElementSibling;
  const gap = document.createElement("div"); gap.style.height = "3000px"; r.after(gap);
  const cs = getComputedStyle(r), hold = document.createElement("div");
  hold.style.height = r.offsetHeight + "px"; hold.style.margin = cs.margin;
  const x = r.offsetLeft, y = r.offsetTop, w = r.offsetWidth;
  r.before(hold);
  Object.assign(r.style, { position: "absolute", left: x + "px", top: y + "px", width: w + "px", margin: "0" });
  scrollTo({ top: scrollY + r.getBoundingClientRect().bottom + 40, behavior: "instant" });
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 60))));
  const before = next.getBoundingClientRect().top;
  return { railBottom: r.getBoundingClientRect().bottom, nextTop: before, line: innerHeight * 0.3 }; })()`);
await frames(4);
const heldMark = await page(tocMarked);
const nextBefore = await page(`document.getElementById("rail").nextElementSibling.nextElementSibling.getBoundingClientRect().top`);
await page(`document.getElementById("rail").remove(); null`);
await frames(4);
const nextAfter = await page(`document.querySelector("#rail") ? null : [...document.querySelectorAll(".content > section")].find((e) => e.previousElementSibling && e.previousElementSibling.style.height === "3000px")?.getBoundingClientRect().top`);
await check("precondition: the removed section was the marked one, wholly above the band with the next section below the line, and nothing moved when it went",
  () => heldMark === "rail" && held.railBottom < 0 && held.nextTop > held.line && near(nextBefore, nextAfter, 0.5), { held, heldMark, nextBefore, nextAfter });
await check("a target removed with nothing added is let go: its entry is no longer marked, and the mark is the true one",
  async () => { const [m, t] = [await page(tocMarked), await page(tocTruth)]; return m !== "rail" && m === t; }, async () => [await page(tocMarked), await page(tocTruth)]);

// S1, ALWAYS ON: the page itself rewrites the attributes the runtime owns, as a renderer would.
await load("nobanner");
await page(`document.getElementById("rail").scrollIntoView({ behavior: "instant" }); null`);
await frames(4);
await page(`(() => { const on = document.querySelector('.toc [aria-current="true"]'); on.removeAttribute("aria-current");
  document.querySelector('.toc a[data-toc-link="header"]').setAttribute("aria-current", "true"); })(); null`);
await frames(2);
await check("a TOC mark the page rewrites is put back (the entry that is current, and only it)", async () => (await page(tocMarked)) === "rail", () => page(tocMarked));
await press(".ls-nav-toggle");
await page(`(() => { const b = document.getElementById("second-rail-toggle"); b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-pressed", "true"); })(); null`);
await frames(2);
await check("a rail toggle whose aria-expanded the page rewrites says collapsed again, and loses aria-pressed",
  () => page(`(() => { const b = document.getElementById("second-rail-toggle"); return b.getAttribute("aria-expanded") === "false" && !b.hasAttribute("aria-pressed"); })()`));
await press("footer.status .anim-toggle");
await page(`document.querySelector("footer.status .anim-toggle").setAttribute("aria-pressed", "true"); null`);
await frames(2);
await check("an anim toggle whose aria-pressed ALONE is rewritten (its box untouched) says false again",
  () => page(`document.documentElement.classList.contains("anim-off") && document.querySelector("footer.status .anim-toggle").getAttribute("aria-pressed") === "false"`));
await page(`(() => { const t = document.querySelector("footer.status .anim-toggle"); t.setAttribute("aria-pressed", "true"); t.querySelector("[data-anim-box]").textContent = "[x]"; })(); null`);
await frames(2);
await check("an anim toggle whose state the page rewrites shows the real state again (off: false, [ ])",
  () => page(`(() => { const t = document.querySelector("footer.status .anim-toggle"); return document.documentElement.classList.contains("anim-off") && t.getAttribute("aria-pressed") === "false" && t.querySelector("[data-anim-box]").textContent === "[ ]"; })()`));

// S1 with cockpit's real dom-patch.js, when the infra checkout is here.
if (overrides.has("cockpit/dom-patch.js")) {
  const inject = () => page(`new Promise((ok) => { const s = document.createElement("script"); s.src = "/cockpit/dom-patch.js"; s.onload = () => ok(typeof cockpitPatch); document.head.append(s); })`);
  await load("nobanner");
  await check("cockpit's dom-patch.js loads", async () => (await inject()) === "function");
  await page(`document.getElementById("rail").scrollIntoView({ behavior: "instant" }); null`);
  await frames(4);
  // Each patch is shown to have WRITTEN the stale state (read synchronously, before any observer
  // runs), so a patch that changed nothing cannot pass for one the runtime repaired.
  const tocWrote = await page(`(() => { window.__toc = document.querySelector(".toc-inner").innerHTML.replace(/ aria-current="true"/g, "");
    cockpitPatch(document.querySelector(".toc-inner"), __toc); return !document.querySelector(".toc [aria-current]"); })()`);
  await frames(3);
  await check("dom-patch: the TOC re-rendered from markup without the mark keeps the current entry marked",
    async () => tocWrote && (await page(tocMarked)) === "rail", async () => ({ tocWrote, marked: await page(tocMarked) }));
  await press(".ls-nav-toggle");
  const railWrote = await page(`(() => { const row = document.getElementById("second-rail-toggle").parentElement;
    cockpitPatch(row, row.innerHTML.replace(/aria-expanded="false"/, 'aria-expanded="true" aria-pressed="true"'));
    return document.getElementById("second-rail-toggle").getAttribute("aria-expanded") === "true"; })()`);
  await frames(3);
  await check("dom-patch: a rail toggle patched with its server markup says collapsed, without aria-pressed",
    async () => railWrote && (await page(`[...document.querySelectorAll("[data-ls-nav-toggle]")].every((b) => b.getAttribute("aria-expanded") === "false" && !b.hasAttribute("aria-pressed"))`)));
  await press("footer.status .anim-toggle");
  const animWrote = await page(`(() => { const f = document.querySelector("footer.status .status-right");
    cockpitPatch(f, f.innerHTML.replace(/aria-pressed="false"/g, 'aria-pressed="true"').replace(/\\[ \\]/g, "[x]"));
    const t = f.querySelector("[data-anim-toggle]"); return t.getAttribute("aria-pressed") === "true" && t.querySelector("[data-anim-box]").textContent === "[x]"; })()`);
  await frames(3);
  await check("dom-patch: the footer's controls patched with server markup still show animation off",
    async () => animWrote && await page(`[...document.querySelectorAll("[data-anim-toggle]")].every((t) => t.getAttribute("aria-pressed") === "false" && (!t.querySelector("[data-anim-box]") || t.querySelector("[data-anim-box]").textContent === "[ ]"))`));
} else if (process.env.DD_REQUIRE_COCKPIT_DOM_PATCH === "1") {
  await check(`cockpit's dom-patch.js is present (DD_REQUIRE_COCKPIT_DOM_PATCH=1): ${DOM_PATCH}`, () => false);
} else {
  console.log(`NOTE  no cockpit dom-patch.js at ${DOM_PATCH}: the patcher cases are skipped (the setAttribute cases above still ran)`);
}

// S2: chrome mounted after initLsNav() is measured, and follows its own size.
await load("nobanner&notoolbar");
await page(`document.querySelector("main").insertAdjacentHTML("afterbegin", '<div class="page-toolbar" id="late-toolbar"><span>late toolbar</span></div>'); null`);
await frames(4);
const lateSticky = () => page(`({ sticky: parseFloat(T.inline("--sticky-top")), top: parseFloat(T.inline("--ls-nav-top")), h: document.getElementById("late-toolbar").offsetHeight })`);
const late1 = await lateSticky();
await check("a .page-toolbar mounted after initLsNav() (a route that renders its own) is measured: --sticky-top = edge + toolbar",
  () => late1.h > 0 && near(late1.sticky, late1.top + late1.h, 0.5), late1);
await page(`document.getElementById("late-toolbar").insertAdjacentHTML("beforeend", '<p class="demo-grow">a second line</p>'); document.querySelector("#late-toolbar .demo-grow").style.flexBasis = "100%"; null`);
await frames(4);
const late2 = await lateSticky();
await check("…and when it grows, --sticky-top follows with no scroll and no resize", () => late2.h > late1.h && near(late2.sticky, late2.top + late2.h, 0.5), { late1, late2 });

// S3/S4: a coarse pointer, on a 1024px tablet and on a phone without .mobile-footer.
const targets = () => page(`(() => {
  const box = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100]; };
  const small = T.qa("footer.status .status-right > :is(a, button, details > summary, .dropdown > summary), footer.status .status-right .dropdown > summary, .ls-nav-toggle")
    .filter((e) => e.getClientRects().length).map((e) => [e.className || e.tagName, ...box(e)]).filter(([, w, h]) => w < 44 || h < 44);
  const f = document.querySelector("footer.status"), fb = f.getBoundingClientRect();
  const clipped = T.qa("footer.status .status-right > *").filter((e) => { const b = e.getBoundingClientRect(); return b.height && (b.top < fb.top - 0.5 || b.bottom > fb.bottom + 0.5 || b.right > innerWidth); }).length;
  const rows = T.qa(".ls-nav .ls-row").filter((e) => e.getClientRects().length).map((r) => { const b = r.getBoundingClientRect(), n = r.querySelector(".ls-name").getBoundingClientRect(); return Math.round(((n.top - b.top) - (b.bottom - n.bottom)) * 100) / 100; });
  return { small, footer: f.offsetHeight, status: parseFloat(getComputedStyle(document.body).paddingBottom), clipped, rows,
    count: T.qa("footer.status .status-right > :is(a, button), footer.status .status-right .dropdown > summary").length }; })()`);
await load("nobanner", { width: 1024, height: 768, coarse: true });
const tablet = await targets();
await check("coarse 1024px tablet: every footer control and the rail toggle is at least 44×44", () => tablet.count >= 3 && tablet.small.length === 0, tablet);
await check("…the footer grows to hold them and the body reserves exactly its height (--status-h follows)",
  () => tablet.footer >= 45 && near(tablet.status, tablet.footer, 0.01) && tablet.clipped === 0, tablet);
await check("…and a rail row's text sits in the middle of its row (the gaps above and below within 2px)",
  () => tablet.rows.length >= 5 && tablet.rows.every((d) => Math.abs(d) <= 2), tablet.rows);
await load("nobanner&nomf&nolang", { width: 375, height: 812, coarse: true });
const phoneCoarse = await targets();
await check("coarse phone, no .mobile-footer: every footer control is at least 44×44, none clipped, and the body reserves the footer",
  () => phoneCoarse.count >= 3 && phoneCoarse.small.length === 0 && phoneCoarse.clipped === 0 && near(phoneCoarse.status, phoneCoarse.footer, 0.01), phoneCoarse);

await load("nobanner&nomf", { width: 375, height: 812, coarse: true });
const longest = await clearance();
await check("coarse phone with the demo's longest footer (four controls, no .mobile-footer): the body reserves the footer's rendered height",
  () => longest.footer > 100 && near(longest.statusPx, longest.footer, 0.01) && near(longest.scrollPad, longest.footer, 0.01) && longest.mainBottom <= longest.footerTop + 0.5, longest);

// N2: the reveal's step comes from the position, capped at the twelfth row; and no documented markup
// carries a style attribute (a strict CSP refuses inline style).
await load("nobanner");
const capped = await page(`(() => { const ul = document.querySelector(".ls-panel[data-term-list]");
  for (let i = 0; i < 8; i += 1) ul.insertAdjacentHTML("beforeend", '<li><a class="dropdown-item ls-row" href="#top"><span class="ls-name">x' + i + '</span></a></li>');
  document.documentElement.classList.add("term-anim");
  return T.qa(".ls-panel[data-term-list] > li").map((li) => parseFloat(T.cs(li, "animationDelay"))); })()`);
await check("the reveal steps by position: row n at 0.6s + (n−1) × 0.11s for the first twelve, every later row with the twelfth",
  () => capped.length >= 14 && capped.every((d, i) => near(d, 0.6 + Math.min(i, 11) * 0.11, 0.001)), capped);
const inline = ["examples/chrome.html", "templates/page-chrome.html", "templates/documentation.html", ".claude/skills/danieldeusing-design/references/chrome.md"]
  .flatMap((f) => readFileSync(join(root, f), "utf8").split("\n").map((l, i) => [f, i + 1, l]).filter(([, , l]) => /<[a-z][^>]*\sstyle\s*=\s*["']/i.test(l) || /`style="/.test(l)).map(([f, n]) => `${f}:${n}`));
await check("no documented markup carries a style attribute: the demo, both templates, chrome.md", () => inline.length === 0, inline);

/* ═══ 15b. no rule of chrome.css wins by load order alone (0.61.0) ═════════════════════════════════ */
await send("DOM.enable");
await send("CSS.enable");
for (const [i, order] of ["components → chrome (the bundle)", "chrome → components"].entries()) {
  for (const coarse of [false, true]) {
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", coarse ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    const loaded = next("Page.loadEventFired");
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/__order-${i}.html` });
    await loaded;
    await send("CSS.enable");
    const { root: doc } = await send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector: "#t-anim" });
    await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
    const got = await evaluate(`(() => { const cs = (id) => getComputedStyle(document.getElementById(id)); const p = document.createElement("i");
      p.style.color = "var(--primary)"; document.body.append(p); const primary = getComputedStyle(p).color; p.remove();
      return { coarse: matchMedia("(pointer: coarse)").matches, cursor: cs("t-cursor").animationName, hover: cs("t-anim").color, primary,
        row: cs("t-row").alignItems + " " + cs("t-row").columnGap }; })()`);
    const pointer = coarse ? "coarse" : "fine";
    await check(`${order}, ${pointer} pointer: a static cursor does not blink, the burger's anim toggle lights --primary under the pointer, a rail row keeps its ${coarse ? "centred" : "baseline"} 14.4px row`,
      () => got.coarse === coarse && got.cursor === "none" && got.hover === got.primary && got.row === (coarse ? "center 14.4px" : "baseline 14.4px"), got);
  }
}
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

/* ═══ 16. a second initToc() never hangs the tab ══════════════════════════════════════════════════
   Two spies over the same entries used to re-assert their own stored `current` over each other's in
   microtasks that never yield: the renderer sat at 100% and never answered again. Each case runs in a
   browser of its own, because a hung renderer takes every later check down with it, and the wait is
   bounded here in node, so a hang reads as a FAIL. chrome.html has already called initToc() once. */
const TOC_AGAIN = [
  ["initToc(); initToc() — the same root twice returns the first call's handle",
    `const a = initToc(), b = initToc(); same = a === window.ddToc && b === window.ddToc;`],
  ["initToc() and then initToc(aside) — a second root over the same entries",
    `initToc(document.querySelector("aside.toc")); same = true;`],
  ["a second initToc() 800 ms after the first, and then a scroll",
    `await new Promise((ok) => setTimeout(ok, 800)); same = initToc() === window.ddToc;`],
];
for (const [label, call] of TOC_AGAIN) {
  const apart = await launchApart("chrome-toc");
  try {
    await apart.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await apart.navigate(BASE + "?nobanner");
    await apart.until("window.ddToc");
    const answer = await Promise.race([
      apart.evaluate(`(async () => { const { initToc } = await import("/runtime/toc.js"); let same = false;
        const frames = (n) => new Promise((ok) => { const f = () => (--n ? requestAnimationFrame(f) : setTimeout(ok, 30)); requestAnimationFrame(f); });
        ${call}
        await frames(4);
        document.getElementById("table").scrollIntoView({ behavior: "instant" });
        await frames(4);
        return { same, marked: [...document.querySelectorAll("[data-toc-link][aria-current]")].map((a) => a.dataset.tocLink + "=" + a.getAttribute("aria-current")) }; })()`),
      sleep(6000).then(() => "no answer in 6 s — the tab hung"),
    ]);
    await check(`${label}: the page answers, and a scroll to #table marks that entry alone`,
      () => typeof answer === "object" && answer.same && answer.marked.length === 1 && answer.marked[0] === "table=true", answer);
  } finally {
    apart.close();
  }
}

console.log(failures ? `\ncheck-chrome: ${failures} FAILED (last check to pass: ${lastPassed})` : "\ncheck-chrome: all checks passed");
process.exit(failures ? 1 : 0);
