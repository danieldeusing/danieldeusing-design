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
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
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
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
  if (path === "__layered.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(LAYERED); return; }
  const file = overrides.get(path) ?? join(root, path);
  if (path.includes("..") || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": `${TYPES[extname(path)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
  res.end(readFileSync(file));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const BASE = `http://127.0.0.1:${server.address().port}/examples/chrome.html`;

/* ── the browser ──────────────────────────────────────────────────────────────────────────────── */
const PORT = 19240 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "dd-chrome-"))}`, "about:blank",
], { stdio: "ignore" });
let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); };
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

/* ═══ 0. what the demo's stand-in block is still covering for ══════════════════════════════════ */
await load();
const covering = await page(`(() => {
  const block = document.getElementById("stand-ins");
  if (!block) return null;
  const sheet = [...document.styleSheets].find((s) => (s.href || "").endsWith("/src/tokens.css"));
  const text = sheet ? [...sheet.cssRules].map((r) => r.cssText).join("\\n") : "";
  return ["--control-h", "--status-h", "--dot-size", "--icon-sm", "--icon-size", "--ico-check", "--ico-history", "[hidden]"]
    .filter((name) => !text.includes(name === "[hidden]" ? "[hidden]" : name + ":"));
})()`);
console.log(covering === null
  ? "NOTE  no stand-in block: every token and class is the real one"
  : `NOTE  the demo's stand-in block is still covering for: ${covering.length ? covering.join(", ") : "nothing (delete it)"}`);

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
console.log(`NOTE  …that footer is ${crowded.footer}px against --status-h ${crowded.status}: a third row is not cleared (documented; such a page folds its controls into the burger)`);
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
    line: T.rect('#demo-crumbs [aria-current="page"]').top, nav: document.querySelector("#demo-crumbs").tagName, label: document.querySelector("#demo-crumbs").getAttribute("aria-label") }; })()`);
await check('crumbs: a named nav, an ordered list, the separator drawn and not read ("/" / "")',
  () => crumbs.nav === "NAV" && crumbs.label === "breadcrumb" && crumbs.sep === '"/" / ""' && crumbs.first === "none" && crumbs.host === "true", crumbs);
await check("…muted path, --primary home, --foreground current", () => crumbs.path === crumbs.muted && crumbs.home === crumbs.primary && crumbs.current === crumbs.fg, crumbs);
await check("…a button segment reads as the link beside it, and the path ellipsizes", () => crumbs.buttonFont[0] === crumbs.buttonFont[1] && crumbs.ellipsis === "ellipsis", crumbs);
await load("nobanner", { coarse: true });
const coarse = await page(`({ link: T.rect("#demo-crumbs a").height, button: T.rect("#demo-crumbs button").height, line: T.rect('#demo-crumbs [aria-current="page"]').top,
  navlist: T.rect(".toc a").height })`);
await check("coarse pointer: every crumb is a 44px target (a link's padding grows its 14px content area, not the line)",
  () => coarse.link >= 44 && coarse.button >= 44, coarse);
await check("…inside the SAME line box: the path does not move", () => near(coarse.line, crumbs.line, 0.01), { fine: crumbs.line, coarse: coarse.line });
await check("…and a TOC entry is a 44px row", () => near(coarse.navlist, 44, 0.01), coarse);
await load("nobanner&burger", { width: 375, height: 812, coarse: true });
const burger = await page(`({ rows: T.qa(".mobile-footer :is(.doc-link, .mobile-theme > summary, .anim-toggle, .mf-panel .dropdown-item)").map((e) => e.getBoundingClientRect().height),
  list: [T.cs(".site-nav .ls-panel", "listStyleType"), T.cs(".site-nav .ls-panel", "paddingLeft"), T.cs(".site-nav .ls-panel", "marginTop")],
  chev: T.qa(".mobile-theme[open] .mf-chev").map((c) => T.cs(c, "transform")) })`);
await check("burger, coarse pointer: every folded footer control is a 44px row", () => burger.rows.length >= 8 && burger.rows.every((h) => near(h, 44, 0.01)), burger.rows);
await check("…the chevron of an open accordion is turned", () => burger.chev.length === 2 && burger.chev.every((t) => t !== "none"), burger.chev);
await load("bare&nobanner&burger", { width: 375, height: 812 });
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
    sep: T.cs(".tick-sep", "color"), border: T.colour("var(--border)"), runningColour: T.cs(".tick--running .tick-dot", "color"), success: T.colour("var(--success)") }; })()`);
await check("tick glyphs come from the state class, with empty alt text: ● ok and running, ✕ stale, ○ never",
  () => ticks.ok === '"●" / ""' && ticks.running === '"●" / ""' && ticks.stale === '"✕" / ""' && ticks.never === '"○" / ""', ticks);
await check("…at the text size, not .7em", () => ticks.size[0] === ticks.size[1], ticks.size);
await check("…a running row keeps the ok colour (never red)", () => ticks.runningColour === ticks.success, ticks);
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
// What a region PAINTS: its commonest colour is what the ink sits on, and the ink is the pixel that
// stands out from it most (a stem reaches the glyph's full colour; anti-aliasing only fades it).
const paint = async (clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  const pixels = decodePng(Buffer.from(data, "base64"));
  const counts = new Map();
  for (const p of pixels) counts.set(p.join(), (counts.get(p.join()) || 0) + 1);
  const bg = [...counts].sort((x, y) => y[1] - x[1])[0][0].split(",").map(Number);
  let ink = bg, ratio = 1;
  for (const p of pixels) { const r = ratioOf(p, bg); if (r > ratio) { ratio = r; ink = p; } }
  return { bg: bg.join(), ink: ink.join(), ratio: Math.round(ratio * 100) / 100 };
};
// The regions, as page clips: each element's CONTENT box (a border is ink too, and would pass a
// glyph that is not there). Only an element outside the viewport is scrolled to: the sticky layers
// are always on screen, and scrolling for them would move the TOC's current entry mid-measurement.
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
  const x = Math.ceil(r.left + scrollX), y = Math.ceil(r.top + scrollY);
  return { x, y, width: Math.floor(r.right + scrollX) - x, height: Math.floor(r.bottom + scrollY) - y };
}; null`;
const measure = async (items) => {
  await evaluate(REGIONS);
  const out = {};
  for (const [name, selector, part] of items) {
    const region = await evaluate(`R(${JSON.stringify(selector)}, ${JSON.stringify(part || null)})`);
    await frames(1);
    out[name] = region && region.width > 0 && region.height > 0 ? await paint(region) : null;
  }
  return out;
};
const PALETTES = ["light", "dark"], THEMES = ["warm", "green", "mono", "paper"];
// [name, selector, part] — text on a state (4.5:1), a glyph (3:1), a state's neighbour (must differ)
const TEXT_ON_STATE = [
  ["rail current: name", '.ls-nav .ls-row[aria-current="page"] .ls-name'],
  ["rail current: permissions", '.ls-nav .ls-row[aria-current="page"] .ls-perm'],
  ["rail current: the ← mark", '.ls-nav .ls-row[aria-current="page"]', "after-name"],
  ["rail row another rule selects: name", ".ls-nav .ls-row.__selected .ls-name"],
  ["rail row another rule selects: permissions", ".ls-nav .ls-row.__selected .ls-perm"],
  ["TOC current entry", '.toc a[aria-current="true"]'],
  ["series current part", '#series a[aria-current="page"]'],
];
const PAIRS = [
  ["rail current row", '.ls-nav .ls-row[aria-current="page"]', '.ls-nav .ls-row:not([aria-current]):not(.__selected)'],
  ["TOC current entry", '.toc a[aria-current="true"]', ".toc a:not([aria-current])"],
  ["series current part", '#series a[aria-current="page"]', "#series a:not([aria-current])"],
];
const GLYPHS = [
  ["tick ● ok", ".tick--ok .tick-dot"], ["tick ● running", ".tick--running .tick-dot"],
  ["tick ✕ stale", ".tick--stale .tick-dot"], ["tick ○ never", ".tick--never .tick-dot"],
  ["rail toggle »", ".ls-nav-toggle"], ["crumbs /", "#bar-crumbs li + li", "before-child"],
  ["history ‹ (WP4 mask, stand-in)", '.bar-history [data-icon="chevron-left"]'], ["history ⟲ (WP4 mask, stand-in)", '.bar-history [data-icon="history"]'],
];
const PHONE_GLYPHS = [["burger (inline svg)", ".nav-burger svg"], ["accordion ▾", ".mobile-footer .mf-chev"],
  ["burger menu current row: name", '.site-nav .ls-row[aria-current="page"] .ls-name']];
const cells = [];
for (const scheme of PALETTES) {
  await load("nobanner", { forced: true, scheme });
  // The pointer parks in the page's left gutter: a hovered row would be measured as another state.
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 450 });
  // What components.css does to a menu row under the pointer, on a rail row: opt it out and give it
  // the selected pair. The row's name and permissions must follow it, whoever set the pair.
  await page(`(() => { const s = document.createElement("style");
    s.textContent = "@media (forced-colors: active) { .ls-row.__selected { forced-color-adjust: none; background: Highlight; color: HighlightText; } }";
    document.head.append(s); document.querySelector('.ls-nav .ls-row:not([aria-current])').classList.add("__selected");
    for (const [id, text] of [["__blank", ""], ["__ink", "MMMM"]]) { const e = document.createElement("div"); e.id = id; e.textContent = text;
      e.style.cssText = "position:fixed;left:8px;top:" + (id === "__blank" ? 300 : 340) + "px;width:60px;height:24px;font:16px monospace;background:white;z-index:99";
      document.body.append(e); } })()`);
  const probe = await measure([["an empty patch", "#__blank"], ["a line of body text", "#__ink"]]);
  for (const theme of THEMES) {
    await page(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
    // Parked on the TOC's own section: the TOC has a current entry (nothing is current above the
    // first section) and the series list is on screen, so nothing below scrolls until the glyphs.
    await page(`document.getElementById("toc").scrollIntoView({ block: "start", behavior: "instant" }); null`);
    await frames(4);
    const text = await measure(TEXT_ON_STATE);
    const pairs = {};
    for (const [name, on, off] of PAIRS) {
      const [a, b] = Object.values(await measure([[`${name} (on)`, on], [`${name} (off)`, off]]));
      pairs[name] = a && b ? [a.bg, b.bg] : null;
    }
    const glyphs = await measure(GLYPHS);
    const disabled = Object.values(await measure([["disabled", "#btn-disabled"], ["enabled", "#btn-forward"]])).map((m) => m && m.ink);
    cells.push({ scheme, theme, probe, text, glyphs, pairs, disabled });
  }
  await load("nobanner&burger", { forced: true, scheme, width: 375, height: 812 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 805 });
  for (const theme of THEMES) {
    await page(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
    await frames(2);
    Object.assign(cells.find((c) => c.scheme === scheme && c.theme === theme).glyphs, await measure(PHONE_GLYPHS));
  }
}
const cellName = (c) => `${c.scheme} ${c.theme}`;
console.log(`\nFORCED COLOURS  painted contrast (ink against what it sits on), ${cells.map(cellName).join(" · ")}`);
for (const [group, key] of [["text on a state", "text"], ["glyph", "glyphs"]]) {
  for (const name of Object.keys(cells[0][key])) {
    console.log(`  ${group.padEnd(15)} ${name.padEnd(44)} ${cells.map((c) => (c[key][name] ? c[key][name].ratio.toFixed(2) : "  —").padStart(6)).join(" ")}`);
  }
}
const below = (key, floor) => cells.flatMap((c) => Object.entries(c[key]).filter(([, m]) => !m || m.ratio < floor).map(([n, m]) => `${cellName(c)} ${n}: ${m ? m.ratio : "not found"}`));
await check("forced colours, the reader can tell: an empty patch paints nothing (1:1), a line of text paints ink (≥ 7:1), on both palettes",
  () => cells.every((c) => c.probe["an empty patch"].ratio < 1.1 && c.probe["a line of body text"].ratio >= 7), cells.map((c) => [cellName(c), c.probe]));
await check("forced colours: every piece of text on a drawn state paints at 4.5:1 or better, on both palettes and all four themes",
  () => below("text", 4.5).length === 0, () => below("text", 4.5));
await check("…every glyph the chrome shows paints at 3:1 or better against what it sits on",
  () => below("glyphs", 3).length === 0, () => below("glyphs", 3));
const same = cells.flatMap((c) => Object.entries(c.pairs).filter(([, p]) => !p || p[0] === p[1]).map(([n, p]) => `${cellName(c)} ${n}: ${p ? p[0] : "not found"}`));
await check("…each state paints a different background from its neighbour (the rail's row, the TOC's and the series' current entries)",
  () => same.length === 0, same);
await check("…a disabled text action paints a different colour from an enabled one",
  () => cells.every((c) => c.disabled[0] && c.disabled[1] && c.disabled[0] !== c.disabled[1]), cells.map((c) => [cellName(c), c.disabled]));

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
    const card = surfaces.card;
    const tint = over(c("color-mix(in srgb, var(--destructive) 8%, transparent)"), card);
    row["destructive on the stale row (8% over --card)"] = { card: Math.round(ratio(over(c("var(--destructive)"), tint), tint) * 100) / 100 };
    out[theme] = row;
  }
  document.documentElement.dataset.theme = "warm";
  return out; })()`);
console.log("\nCONTRAST  (WCAG ratio; rows = ink, columns = --background / --card / --muted)");
for (const [theme, rows] of Object.entries(contrast)) {
  for (const [ink, cells] of Object.entries(rows)) console.log(`  ${theme.padEnd(6)} ${ink.padEnd(46)} ${Object.values(cells).map((v) => v.toFixed(2).padStart(6)).join(" ")}`);
}
const textInks = ["muted-foreground", "primary", "foreground", "destructive on the stale row (8% over --card)"];
const lows = Object.entries(contrast).flatMap(([t, rows]) => textInks.flatMap((ink) => Object.entries(rows[ink]).filter(([, v]) => v < 4.5).map(([s, v]) => `${t} ${ink} on ${s}: ${v}`)));
await check("every text ink the chrome uses clears 4.5:1 on every theme and surface", () => lows.length === 0, lows);
const ringLows = Object.entries(contrast).flatMap(([t, rows]) => Object.entries(rows.ring).filter(([, v]) => v < 3).map(([s, v]) => `${t} ring on ${s}: ${v}`));
await check("the focus ring clears 3:1 against every surface", () => ringLows.length === 0, ringLows);

console.log(failures ? `\ncheck-chrome: ${failures} FAILED (last check to pass: ${lastPassed})` : "\ncheck-chrome: all checks passed");
process.exit(failures ? 1 : 0);
