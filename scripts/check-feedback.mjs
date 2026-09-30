#!/usr/bin/env node
/*
 * check-feedback.mjs — feedback.css and tags.css (0.60.0: S1–S8, T1, T2), measured in a real browser.
 *
 * THREE QUESTIONS, and a stylesheet can pass any one of them while failing another:
 *   1. Does every element render what the spec says, in every state? Asserted from COMPUTED style,
 *      against the same declaration resolved by the browser on a probe element — so "6% of
 *      --warning" is compared as the browser computes it on each theme, not as a hex somebody worked
 *      out once and pasted in.
 *   2. Is every new pairing legible? WCAG contrast of each text, glyph and edge on four themes and
 *      the three surfaces a component lands on (--background, --card, --muted), composited through
 *      every translucent layer between it and the surface. Printed as a table. Text under 4.5:1 or a
 *      glyph under 3:1 FAILS; an `info` row is a decorative edge, reported and not gated.
 *   3. Do the two files stand alone? A surface that loads only tokens.css and these files (netmon)
 *      must get the same box. The demo page is rendered twice — with base, components and chrome,
 *      and with `?bare` — and the 45 properties listed in SNAP_PROPS must agree on every fixture
 *      between the two. A focus ring is asserted in `?bare` only, where base.css's global ring
 *      cannot stand in for a component's own (X2).
 *
 * And the modes a reader can switch on: forced colours on a light and a dark palette (every glyph
 * drawn in the forced colour of its words, every state pair still two looks — X1), `hidden` (every
 * component gone — X3), print, reduced motion, a coarse pointer.
 *
 * WHAT IT READS. examples/feedback.html is the environment: the real stylesheets, and nothing standing
 * in for them (check-integration.mjs fails a demo that carries a stand-in). The fixtures are injected
 * here, so the assertions do not depend on the demo's prose.
 *
 * A real browser and no dependency, like check-tabletools.mjs: the headless chromium Playwright
 * caches on these machines, over the DevTools protocol with Node's own fetch and WebSocket. No
 * browser → it SKIPS loudly, and DD_REQUIRE_BROWSER=1 makes that a failure. The browser picks its
 * own DevTools port (port 0), so this can run beside the other checks without colliding.
 *
 *   node scripts/check-feedback.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, extname, sep } from "node:path";
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
  console.log("check-feedback: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts computed styles and composited contrast, which only a browser can");
  console.log("  produce. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the worktree over loopback, so the demo's ../src/*.css resolve ─────────────────────────── */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = createServer((req, res) => {
  const file = join(root, decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname));
  let body = null;
  if (file.startsWith(root + sep)) { try { body = readFileSync(file); } catch {} }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(body);
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const BASE = `http://127.0.0.1:${server.address().port}/examples/feedback.html`;

/* ── the browser ─────────────────────────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), "dd-feedback-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=1280,900", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch (error) { console.error(`note: the browser profile ${profile} was not removed: ${error.message}`); } };
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
await send("Runtime.enable");

/* ── reporting: a check takes a THUNK, so one throw is one FAIL and never ends the run ───────── */
let failures = 0;
let lastPassed = "(none)";
const check = async (label, thunk) => {
  let problems;
  try { problems = await thunk(); } catch (error) { problems = [`threw: ${error.message}`]; }
  if (problems === true || (Array.isArray(problems) && problems.length === 0)) {
    console.log(`PASS  ${label}`);
    lastPassed = label;
    return;
  }
  failures += 1;
  const lines = Array.isArray(problems) ? problems : [String(problems)];
  console.log(`FAIL  ${label}${lines.map((line) => `\n        ${line}`).join("")}`);
};
// Whatever still escapes a check is a FAIL naming the last check to pass, never a bare stack.
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, (error) => {
    console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
    console.log("\ncheck-feedback: ABORTED");
    process.exit(1);
  });
}

/* ── in the page: colour maths, and "does this element compute what this declaration would" ─── */
const HELPERS = String.raw`
window.__wp7 = (() => {
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
  const nums = (s) => s.split(/[\s,/]+/).filter(Boolean).map(Number);
  const parse = (str) => {
    let m;
    if ((m = /^rgba?\((.+)\)$/.exec(str))) { const p = nums(m[1]); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 }; }
    if ((m = /^color\(srgb (.+)\)$/.exec(str))) { const p = nums(m[1]); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    if ((m = /^oklch\((.+)\)$/.exec(str))) { const p = nums(m[1]); const [r, g, b] = oklch(p[0], p[1], p[2]); return { r, g, b, a: p.length > 3 ? p[3] : 1 }; }
    throw new Error("cannot parse colour " + str);
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c) => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
  const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
  // The colour a pixel of el's content sits on: every background from the surface down to el.
  const behind = (el) => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) { chain.push(n); if (n.dataset && n.dataset.surface) break; }
    let colour = { r: 1, g: 1, b: 1, a: 1 };
    for (const n of chain.reverse()) colour = over(parse(getComputedStyle(n).backgroundColor), colour);
    return colour;
  };
  const probe = (el, prop, expr) => {
    const p = document.createElement("div");
    p.style.cssText = "position:absolute;visibility:hidden;display:block";
    p.style.setProperty(prop, expr);
    (el.parentElement || document.body).append(p);
    const value = getComputedStyle(p).getPropertyValue(prop);
    p.remove();
    return value;
  };
  return {
    parse, over, ratio, behind,
    tok: (name) => probe(document.body, "color", "var(" + name + ")"),
    // [sel, pseudo, prop, expr | {is}] → a problem string, or null when it matches
    expect(sel, pseudo, prop, want) {
      const el = document.querySelector(sel);
      if (!el) return sel + ": no such element";
      const got = getComputedStyle(el, pseudo || null).getPropertyValue(prop).trim();
      const exp = typeof want === "object" ? want.is : probe(el, prop, want).trim();
      return got === exp ? null : sel + (pseudo || "") + " " + prop + ": got '" + got + "', want '" + exp + "'" +
        (typeof want === "object" ? "" : " (" + want + ")");
    },
    // Every computed property a stylesheet here decides, for the full-vs-bare comparison. A
    // .btn-icon host and an .ico glyph belong to other packages, whose suites prove them. Their
    // placement and size are asserted in both modes above.
    snapshot(ids, props, ROOTS) {
      const out = {};
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el.matches(".btn-icon, .ico")) continue;
        for (const pseudo of ["", "::before", "::after"]) {
          const cs = getComputedStyle(el, pseudo || null);
          if (pseudo && cs.content === "none") continue;
          for (const prop of props) {
            if (/^border-(top|right|bottom|left)-color$/.test(prop) && cs.getPropertyValue(prop.replace("color", "width")) === "0px") continue;
            if (prop === "opacity" && cs.animationName !== "none") continue; // mid-animation, differs per read
            if (/^margin-/.test(prop) && !pseudo && el.matches(ROOTS)) continue; // outer margin: the page's layout
            out[id + pseudo + " " + prop] = cs.getPropertyValue(prop);
          }
        }
      }
      return out;
    },
  };
})();
`;

const load = async (query = "") => {
  await send("Page.navigate", { url: BASE + query });
  for (let i = 0; ; i += 1) {
    await sleep(100);
    try {
      if (await evaluate("document.readyState === 'complete'")) break;
    } catch {}
    if (i > 100) throw new Error("the demo page never finished loading " + query);
  }
  await evaluate(HELPERS);
};
// A theme switch is a colour change, and button.tag transitions its edge: read after it settles, or
// the computed value is an interpolation (serialised in oklab) rather than the theme's colour.
const setTheme = async (theme) => {
  await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
  await sleep(250);
};

/* ── fixtures ─────────────────────────────────────────────────────────────────────────────────── */
const STATES = ["ok", "bad", "warn", "info", "running", "pending", "skip", "none"];
const LONG = "the installer exited 1 — permission denied writing ~/.claude/settings.json. Nothing was changed; " +
  "fix the permission and install again, or install into this project only, which needs no write outside the repository.";
// X3: one hidden element per class that sets its own `display` (and the three that do not).
const HIDDEN = [
  ["empty", '<div class="empty" hidden><p>x</p></div>'], ["empty-inline", '<div class="empty empty--inline" hidden>x</div>'],
  ["notice", '<div class="notice" hidden><p>x</p></div>'], ["callout", '<p class="callout" hidden>x</p>'],
  ["banner", '<div class="banner" hidden><p>x</p></div>'], ["state", '<span class="state" data-state="ok" hidden>x</span>'],
  ["state-p", '<p class="state" data-state="bad" hidden>x</p>'], ["spinner", '<span class="spinner" hidden></span>'],
  ["loading", '<p class="loading" hidden>x</p>'], ["fence", '<figure class="fence" hidden><div class="fence-body">x</div></figure>'],
  ["dot", '<span class="dot" hidden></span>'], ["tag", '<span class="tag" hidden>x</span>'],
  ["tag-button", '<button type="button" class="tag" hidden>x</button>'], ["tag-bracket", '<span class="tag tag--bracket" hidden>x</span>'],
  ["count", '<span class="count" hidden>1</span>'], ["count-overlay", '<span class="count count--overlay" hidden>1</span>'],
];
const FIXTURE = `
<div id="fx" data-surface="background" style="position: relative; padding: 8px; background: var(--background); color: var(--foreground)">
  <div class="empty" id="fx-empty" data-icon="folder-open"><p id="fx-empty-p">no skills yet.</p></div>
  <div class="empty" id="fx-empty-fail" data-tone="warning" data-icon="triangle-alert"><p>could not load.</p></div>
  <div class="empty" id="fx-empty-plain"><p>nothing.</p></div>
  <div class="empty empty--inline" id="fx-empty-inline"><p>a</p><p id="fx-empty-inline-2">b</p></div>
  <div class="empty empty--inline" id="fx-empty-inline-icon" data-tone="warning" data-icon="triangle-alert">could not read the folder.</div>
  <div class="notice" id="fx-notice" data-tone="warning"><span class="notice-label" id="fx-notice-label">warning:</span><p id="fx-notice-body">two sources publish this skill.</p><button type="button" class="btn-icon btn-icon--bare btn-icon--sm notice-dismiss" id="fx-notice-dismiss" data-icon="x" aria-label="dismiss"></button></div>
  <div style="inline-size: 24rem"><div class="notice" id="fx-notice-long" data-tone="destructive"><span class="notice-label">failed:</span><p id="fx-notice-long-body">${LONG}</p><button type="button" class="btn-icon btn-icon--bare btn-icon--sm notice-dismiss" id="fx-notice-long-dismiss" data-icon="x" aria-label="dismiss"></button></div></div>
  <div class="notice" id="fx-notice-neutral"><span class="notice-label" id="fx-notice-neutral-label">note:</span><p>neutral.</p></div>
  <div class="notice notice--lg" id="fx-notice-lg" data-tone="success" data-icon="circle-check"><div><p id="fx-notice-lg-p1">you are on the latest version.</p><p id="fx-notice-lg-p2">version 0.60.0</p></div></div>
  <aside class="callout" id="fx-callout"><p class="callout-title" id="fx-callout-title">note</p><p id="fx-callout-body">the pin moves.</p></aside>
  <aside class="callout" id="fx-callout-warn" data-tone="warning"><p class="callout-title" id="fx-callout-warn-title">careful</p></aside>
  <p class="callout" id="fx-callout-icon" data-tone="info" data-icon="info"><strong class="callout-title">note</strong> one line of text.</p>
  <p class="callout" id="fx-callout-empty"></p>
  <div class="banner" id="fx-banner"><p class="banner-title" id="fx-banner-title">2 alerts</p><ul class="banner-list" id="fx-banner-list"><li>a</li><li id="fx-banner-li2">b <a id="fx-banner-link" href="#fx">fix →</a></li></ul></div>
  ${STATES.map((s) => `<span class="state" id="fx-state-${s}" data-state="${s}">${s}</span>`).join("")}
  <p class="state" id="fx-state-p" data-state="bad">could not read the file.</p>
  <span class="spinner" id="fx-spinner"></span><span class="spinner spinner--lg" id="fx-spinner-lg"></span>
  <p class="loading" id="fx-loading"><span class="spinner"></span>loading skills…</p>
  <figure class="fence" id="fx-fence"><figcaption class="fence-label" id="fx-fence-label">untrusted · pr</figcaption><div class="fence-body" id="fx-fence-body">text</div><p class="fence-end" id="fx-fence-end">end of untrusted text</p></figure>
  <figure class="fence"><figcaption class="fence-label">untrusted</figcaption><div class="fence-body" id="fx-fence-empty"></div><p class="fence-end">end</p></figure>
  <span class="dot" id="fx-dot" data-tone="success"></span>
  <span class="state" data-state="bad"><span class="dot" id="fx-dot-plain"></span>down</span>
  <span class="dot dot--pulse" id="fx-dot-pulse" data-tone="success"></span>
  <button type="button" class="btn-icon" id="fx-host" data-icon="mail" aria-label="messages"><span class="dot dot--overlay" id="fx-dot-overlay" data-tone="destructive"></span></button>
<p>a line of text <span class="tag" id="fx-tl-glyph" data-tone="info" data-icon="package">glyph</span> <span class="tag" id="fx-tl-word">word</span> <span class="tag tag--icon" id="fx-tl-icon" data-icon="eye-off" role="img" aria-label="private"></span></p>
    <span class="tag" id="fx-tag">untoned</span>
  <span class="tag" id="fx-tag-success" data-tone="success">installed</span>
  <span class="tag" id="fx-tag-cat" data-hue="teal"><span class="ico" id="fx-tag-ico" data-icon="package"></span>mcp</span>
  <span class="tag" id="fx-tag-dataicon" data-tone="info" data-icon="package">glyph</span>
  <span class="tag tag--dashed" id="fx-tag-dashed">dashed</span>
  <span class="tag tag--off" id="fx-tag-off" data-tone="success">off</span>
  <span class="tag tag--off tag--dashed" id="fx-tag-off-dashed">off</span>
  <span class="tag tag--strong" id="fx-tag-strong" data-tone="destructive">FAIL</span>
  <span class="tag tag--struck" id="fx-tag-struck">retired</span>
  <span class="tag tag--solid" id="fx-tag-solid" data-tone="primary">global</span>
  <span class="tag tag--solid" id="fx-tag-solid-cat" data-hue="violet">public</span>
  <span class="tag tag--icon" id="fx-tag-icon" data-tone="info" data-icon="eye-off" role="img" aria-label="private"></span>
  <span class="tag tag--bracket" id="fx-tag-bracket">beta</span>
  <span class="tag tag--bracket glow" id="fx-tag-glow">live</span>
  <button type="button" class="tag" id="fx-tag-button" data-tone="info">github.com</button>
  <button type="button" class="tag" id="fx-tag-disabled" data-tone="info" disabled>gitlab</button>
  <span class="count" id="fx-count">12</span>
  <span class="count" id="fx-count-tone" data-tone="destructive">7</span>
  <button type="button" class="btn-icon" id="fx-count-host" data-icon="download" aria-label="3 commits behind"><span class="count count--overlay" id="fx-count-overlay">3</span></button>
  <div id="fx-leak" data-tone="info">
    <span class="tag" id="fx-leak-tag">x</span><span class="count" id="fx-leak-count">1</span><span class="dot" id="fx-leak-dot"></span>
    <div class="notice" id="fx-leak-notice"><span class="notice-label" id="fx-leak-notice-label">note:</span><p>n</p></div>
    <aside class="callout" id="fx-leak-callout"><p>c</p></aside>
    <div class="banner" id="fx-leak-banner"><p>b</p></div>
    <div class="empty" id="fx-leak-empty" data-icon="folder-open"><p>e</p></div>
  </div>
  <span class="tag tag--dotted" id="fx-gone-dotted">removed</span>
  <div class="banner banner--sticky" id="fx-gone-sticky"><p>removed</p></div>
  <div id="fx-fc" style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; padding: 12px">
    <div class="empty" id="fx-fc-empty" data-icon="folder-open"></div>
    <div class="empty" id="fx-fc-empty-warn" data-tone="warning" data-icon="triangle-alert"></div>
    <div class="notice notice--lg" id="fx-fc-notice-lg" data-tone="success" data-icon="circle-check"></div>
    <p class="callout" id="fx-fc-callout" data-tone="info" data-icon="info">i</p>
    <span class="tag" id="fx-fc-tag-glyph" data-tone="info" data-icon="package"></span>
    <span class="tag tag--icon" id="fx-fc-tag-icon" data-tone="info" data-icon="eye-off" role="img" aria-label="private"></span>
    <span class="tag" data-hue="teal"><span class="ico" id="fx-fc-ico" data-icon="package"></span></span>
    <span class="spinner" id="fx-fc-spinner"></span>
    <span class="dot" id="fx-fc-dot" data-tone="success"></span>
    <button type="button" class="tag tag--solid" id="fx-fc-solid-button" data-tone="primary">global</button>
    <button type="button" class="tag" id="fx-fc-tag-button" data-tone="info">github.com</button>
    <div class="banner" id="fx-fc-banner"><p>x <a href="#fx" id="fx-fc-banner-link">fix →</a></p></div>
  </div>
  <div id="fx-hidden">${HIDDEN.map(([id, html]) => html.replace(/ hidden>/, ` id="fx-h-${id}" hidden>`)).join("")}</div>
</div>`;
const inject = () => evaluate(`document.querySelector("main").insertAdjacentHTML("afterbegin", ${JSON.stringify(FIXTURE)}); null`);

/* ── 1. what each element computes ───────────────────────────────────────────────────────────── */
const mix = (token, pct, base = "transparent") => `color-mix(in srgb, var(${token}) ${pct}%, ${base})`;
// Widths are literal: a probe with no border-style computes every border width to 0px.
const edge = (sel, side, width, style, color) => [
  [sel, "", `border-${side}-width`, { is: width }], [sel, "", `border-${side}-style`, { is: style }], [sel, "", `border-${side}-color`, color],
];
const STATE_GLYPH = { ok: ['"✓" / ""', "--success", "600"], bad: ['"✗" / ""', "--destructive", "700"],
  warn: ['"●" / ""', "--warning", "600"], info: ['"●" / ""', "--info", "600"], running: ['"●" / ""', "--info", "600"],
  pending: ['"○" / ""', "--pending", "600"], skip: ['"–" / ""', "--muted-foreground", "600"], none: ["none", "--muted-foreground", "400"] };

const EXPECT = [
  ["S1 .empty — centred grid, muted, 2rem of air, children unmargined", [
    ["#fx-empty", "", "display", { is: "grid" }], ["#fx-empty", "", "justify-items", { is: "center" }],
    ["#fx-empty", "", "row-gap", "0.5rem"], ["#fx-empty", "", "padding-top", "2rem"], ["#fx-empty", "", "padding-bottom", "2rem"],
    ["#fx-empty", "", "text-align", { is: "center" }], ["#fx-empty", "", "color", "var(--muted-foreground)"],
    ["#fx-empty", "", "font-size", "var(--fs-base)"], ["#fx-empty-p", "", "margin-top", "0px"], ["#fx-empty-p", "", "margin-bottom", "0px"],
  ]],
  ["S1 .empty[data-icon] — glyph at --icon-xl, shape from data-icon, colour from data-tone or the text", [
    ["#fx-empty", "::before", "width", "var(--icon-xl)"], ["#fx-empty", "::before", "height", "var(--icon-xl)"],
    ["#fx-empty", "::before", "background-color", "var(--muted-foreground)"], ["#fx-empty", "::before", "mask-image", "var(--ico-folder-open)"],
    ["#fx-empty-fail", "::before", "background-color", "var(--warning)"], ["#fx-empty-fail", "::before", "mask-image", "var(--ico-triangle-alert)"],
    ["#fx-empty-plain", "::before", "content", { is: "none" }],
  ]],
  ["S1 .empty--inline — block, start-aligned, .75rem; a glyph hangs on the first line", [
    ["#fx-empty-inline", "", "display", { is: "block" }], ["#fx-empty-inline", "", "padding-top", "0.75rem"],
    ["#fx-empty-inline", "", "text-align", { is: "start" }], ["#fx-empty-inline-2", "", "margin-top", "0.5rem"],
    ["#fx-empty-inline-icon", "", "padding-left", "calc(var(--icon-size) + 0.5rem)"],
    ["#fx-empty-inline-icon", "::before", "position", { is: "absolute" }], ["#fx-empty-inline-icon", "::before", "width", "var(--icon-size)"],
    ["#fx-empty-inline-icon", "::before", "top", "calc(0.75rem + (18px - var(--icon-size)) / 2)"],
    ["#fx-empty-inline-icon", "::before", "background-color", "var(--warning)"],
  ]],
  ["S2 .notice — flex on the baseline, the tone's tint and edge, --foreground sentence", [
    ["#fx-notice", "", "display", { is: "flex" }], ["#fx-notice", "", "align-items", { is: "baseline" }],
    ["#fx-notice", "", "column-gap", "0.5rem"], ["#fx-notice", "", "padding-top", "0.5rem"], ["#fx-notice", "", "padding-left", "0.75rem"],
    ["#fx-notice", "", "color", "var(--foreground)"], ["#fx-notice", "", "background-color", mix("--warning", 6, "var(--background)")],
    ...edge("#fx-notice", "top", "1px", "solid", mix("--warning", 30)),
    ["#fx-notice-label", "", "color", "var(--warning)"], ["#fx-notice-label", "", "font-weight", { is: "700" }],
    ["#fx-notice-body", "", "color", "var(--foreground)"], ["#fx-notice-body", "", "flex-grow", { is: "1" }], ["#fx-notice-body", "", "margin-top", "0px"],
    ["#fx-notice-dismiss", "", "align-self", { is: "flex-start" }], ["#fx-notice-dismiss", "", "margin-top", "calc((1.5 * 0.75rem - 1.5rem) / 2)"],
  ]],
  ["S2 .notice without data-tone is neutral — muted label on a muted tint", [
    ["#fx-notice-neutral", "", "background-color", mix("--muted-foreground", 6, "var(--background)")],
    ["#fx-notice-neutral-label", "", "color", "var(--muted-foreground)"],
  ]],
  ["S2 .notice--lg — more room, a leading glyph at --icon-xl in the tone", [
    ["#fx-notice-lg", "", "padding-top", "0.75rem"], ["#fx-notice-lg", "", "padding-left", "1rem"], ["#fx-notice-lg", "", "column-gap", "0.75rem"],
    ["#fx-notice-lg", "::before", "width", "var(--icon-xl)"], ["#fx-notice-lg", "::before", "background-color", "var(--success)"],
    ["#fx-notice-lg", "::before", "mask-image", "var(--ico-circle-check)"], ["#fx-notice-lg", "::before", "align-self", { is: "flex-start" }],
    ["#fx-notice-lg-p1", "", "margin-top", "0px"], ["#fx-notice-lg-p2", "", "margin-top", "0px"],
  ]],
  ["S3 .callout — 2px rule in the tone (primary by default), muted body, tone title", [
    ...edge("#fx-callout", "left", "2px", "solid", "var(--primary)"),
    ["#fx-callout", "", "padding-top", "0.25rem"], ["#fx-callout", "", "padding-left", "0.625rem"], ["#fx-callout", "", "padding-right", "0px"],
    ["#fx-callout", "", "color", "var(--muted-foreground)"], ["#fx-callout", "", "background-color", "transparent"],
    ["#fx-callout-title", "", "color", "var(--primary)"], ["#fx-callout-title", "", "font-weight", { is: "700" }],
    ["#fx-callout-body", "", "margin-top", "0.25rem"],
    ["#fx-callout-warn", "", "border-left-color", "var(--warning)"], ["#fx-callout-warn-title", "", "color", "var(--warning)"],
    ["#fx-callout-empty", "", "display", { is: "none" }],
  ]],
  ["S3 .callout[data-icon] — glyph in the tone, hanging on the first line", [
    ["#fx-callout-icon", "", "padding-left", "calc(0.625rem + var(--icon-size) + 0.5rem)"],
    ["#fx-callout-icon", "::before", "position", { is: "absolute" }], ["#fx-callout-icon", "::before", "left", "0.625rem"],
    ["#fx-callout-icon", "::before", "top", "calc(0.25rem + (18px - var(--icon-size)) / 2)"],
    ["#fx-callout-icon", "::before", "width", "var(--icon-size)"], ["#fx-callout-icon", "::before", "background-color", "var(--info)"],
    ["#fx-callout-icon", "::before", "mask-image", "var(--ico-info)"],
  ]],
  ["S4 .banner — destructive by default, 6% into --background, a rule under it and between items", [
    ["#fx-banner", "", "padding-top", "0.5rem"], ["#fx-banner", "", "padding-left", "1.25rem"],
    ["#fx-banner", "", "color", "var(--destructive)"], ["#fx-banner", "", "background-color", mix("--destructive", 6, "var(--background)")],
    ...edge("#fx-banner", "bottom", "1px", "solid", "var(--destructive)"), ["#fx-banner", "", "border-top-width", { is: "0px" }],
    ["#fx-banner-title", "", "font-weight", { is: "700" }], ["#fx-banner-title", "", "margin-top", "0px"],
    ["#fx-banner-list", "", "margin-top", "0.25rem"], ["#fx-banner-list", "", "padding-left", "0px"], ["#fx-banner-list", "", "list-style-type", { is: "none" }],
    ["#fx-banner-li2", "", "margin-top", "0.55rem"], ["#fx-banner-li2", "", "padding-top", "0.55rem"],
    ...edge("#fx-banner-li2", "top", "1px", "solid", mix("--destructive", 22)),
    ["#fx-banner-link", "", "color", "var(--destructive)"], ["#fx-banner-link", "", "text-decoration-line", { is: "underline" }],
    ["#fx-banner-link", "", "white-space", { is: "nowrap" }],
  ]],
  ["S5 .state — the word takes its glyph's colour; the glyph has empty alt text", [
    ["#fx-state-ok", "", "display", { is: "inline-flex" }], ["#fx-state-ok", "", "align-items", { is: "baseline" }],
    ["#fx-state-ok", "", "column-gap", "0.35rem"], ["#fx-state-ok", "", "white-space", { is: "nowrap" }],
    ...STATES.flatMap((s) => [
      [`#fx-state-${s}`, "", "color", `var(${STATE_GLYPH[s][1]})`], [`#fx-state-${s}`, "", "font-weight", { is: STATE_GLYPH[s][2] }],
      [`#fx-state-${s}`, "::before", "content", { is: STATE_GLYPH[s][0] }],
    ]),
    ["#fx-state-p", "", "display", { is: "flex" }], ["#fx-state-p", "", "white-space", { is: "normal" }],
  ]],
  ["S6 .spinner and .loading — loader-circle at the glyph size, 1s linear; the row is muted flex", [
    ["#fx-spinner", "", "width", "var(--icon-size)"], ["#fx-spinner", "", "height", "var(--icon-size)"],
    ["#fx-spinner", "", "background-color", "var(--foreground)"], ["#fx-spinner", "", "mask-image", "var(--ico-loader-circle)"],
    ["#fx-spinner", "", "animation-name", { is: "dd-spin" }], ["#fx-spinner", "", "animation-duration", { is: "1s" }],
    ["#fx-spinner", "", "animation-timing-function", { is: "linear" }], ["#fx-spinner", "", "animation-iteration-count", { is: "infinite" }],
    ["#fx-spinner-lg", "", "width", "var(--icon-xl)"],
    ["#fx-loading", "", "display", { is: "flex" }], ["#fx-loading", "", "align-items", { is: "center" }], ["#fx-loading", "", "column-gap", "0.5rem"],
    ["#fx-loading", "", "padding-top", "0.75rem"], ["#fx-loading", "", "color", "var(--muted-foreground)"],
  ]],
  ["S7 .fence — 2px dashed --warning on a 5% tint, P2's eyebrow labels at both ends, '(empty)'", [
    ["#fx-fence", "", "margin-left", "0px"], ["#fx-fence", "", "padding-top", "0.75rem"],
    ...edge("#fx-fence", "top", "2px", "dashed", "var(--warning)"), ...edge("#fx-fence", "left", "2px", "dashed", "var(--warning)"),
    ["#fx-fence", "", "background-color", mix("--warning", 5, "var(--background)")],
    ["#fx-fence-label", "", "color", "var(--warning)"], ["#fx-fence-label", "", "font-weight", { is: "700" }],
    ["#fx-fence-label", "", "font-style", { is: "normal" }], ["#fx-fence-label", "", "text-transform", { is: "uppercase" }],
    // P2 .eyebrow, restated: .05em and --lh-tight. ONE eyebrow look in the system (the lead's ruling).
    ["#fx-fence-label", "", "letter-spacing", "0.05em"], ["#fx-fence-label", "", "line-height", "var(--lh-tight)"],
    ["#fx-fence-end", "", "letter-spacing", "0.05em"], ["#fx-fence-end", "", "line-height", "var(--lh-tight)"], ...edge("#fx-fence-label", "bottom", "1px", "dashed", mix("--warning", 55)),
    ["#fx-fence-end", "", "color", "var(--warning)"], ...edge("#fx-fence-end", "top", "1px", "dashed", mix("--warning", 55)),
    ["#fx-fence-body", "", "white-space", { is: "pre-wrap" }], ["#fx-fence-body", "", "overflow-wrap", { is: "anywhere" }],
    ["#fx-fence-empty", "::before", "content", { is: '"(empty)"' }], ["#fx-fence-empty", "::before", "font-style", { is: "italic" }],
    ["#fx-fence-empty", "::before", "color", "var(--muted-foreground)"],
  ]],
  ["S8 .dot — a --dot-size circle in the tone or the text's colour; pulse; overlay", [
    ["#fx-dot", "", "width", "var(--dot-size)"], ["#fx-dot", "", "height", "var(--dot-size)"],
    ["#fx-dot", "", "border-top-left-radius", { is: "50%" }], ["#fx-dot", "", "background-color", "var(--success)"],
    ["#fx-dot-plain", "", "background-color", "var(--destructive)"],
    ["#fx-dot-pulse", "", "animation-name", { is: "dd-pulse" }], ["#fx-dot-pulse", "", "animation-duration", { is: "2s" }],
    ["#fx-dot-pulse", "", "animation-timing-function", { is: "ease-in-out" }],
    ["#fx-dot-overlay", "", "position", { is: "absolute" }], ["#fx-dot-overlay", "", "width", "0.375rem"],
    ["#fx-dot-overlay", "", "bottom", "-1px"], ["#fx-dot-overlay", "", "right", "-1px"],
    ["#fx-dot-overlay", "", "box-shadow", "0 0 0 1px var(--background)"], ["#fx-dot-overlay", "", "background-color", "var(--destructive)"],
  ]],
  ["T1 .tag — 20px, 600, border-only: the tone's word in a 50% edge of itself", [
    ["#fx-tag", "", "display", { is: "inline-flex" }], ["#fx-tag", "", "align-items", { is: "center" }], ["#fx-tag", "", "column-gap", "0.25rem"],
    ["#fx-tag", "", "box-sizing", { is: "border-box" }], ["#fx-tag", "", "min-height", "1.25rem"], ["#fx-tag", "", "height", "1.25rem"],
    ["#fx-tag", "", "padding-left", "0.375rem"], ["#fx-tag", "", "padding-top", "0px"],
    ["#fx-tag", "", "font-size", "var(--fs-base)"], ["#fx-tag", "", "font-weight", { is: "600" }], ["#fx-tag", "", "line-height", "12px"],
    ["#fx-tag", "", "white-space", { is: "nowrap" }], ["#fx-tag", "", "vertical-align", { is: "middle" }], ["#fx-tag", "", "color", "var(--muted-foreground)"], ["#fx-tag", "", "background-color", "transparent"],
    ...edge("#fx-tag", "top", "1px", "solid", mix("--muted-foreground", 50)),
    ["#fx-tag-success", "", "color", "var(--success)"], ["#fx-tag-success", "", "border-top-color", mix("--success", 50)],
    ["#fx-tag-cat", "", "color", "var(--cat-teal)"], ["#fx-tag-cat", "", "border-top-color", mix("--cat-teal", 50)],
    ["#fx-tag-ico", "", "width", "var(--icon-sm)"], ["#fx-tag-ico", "", "height", "var(--icon-sm)"],
    ["#fx-tag-dataicon", "::before", "width", "var(--icon-sm)"], ["#fx-tag-dataicon", "::before", "background-color", "var(--info)"],
    ["#fx-tag-dataicon", "::before", "mask-image", "var(--ico-package)"],
  ]],
  ["T1 .tag modifiers — dashed, off (dotted, and the only dotted edge), strong, struck, solid, icon, bracket, glow", [
    ["#fx-tag-dashed", "", "border-top-style", { is: "dashed" }],
    ["#fx-tag-off", "", "color", "var(--muted-foreground)"], ["#fx-tag-off", "", "border-top-style", { is: "dotted" }],
    // D10: dotted means off. An off tag that is also --dashed stays dotted, or "off" would have two looks.
    ["#fx-tag-off", "", "border-top-color", mix("--muted-foreground", 50)], ["#fx-tag-off-dashed", "", "border-top-style", { is: "dotted" }],
    ["#fx-tag-strong", "", "border-top-color", "var(--destructive)"], ["#fx-tag-strong", "", "font-weight", { is: "700" }],
    ["#fx-tag-struck", "", "text-decoration-line", { is: "line-through" }],
    ["#fx-tag-solid", "", "color", "var(--background)"], ["#fx-tag-solid", "", "background-color", "var(--primary)"],
    ["#fx-tag-solid", "", "border-top-color", "var(--primary)"], ["#fx-tag-solid", "", "font-weight", { is: "700" }],
    ["#fx-tag-solid-cat", "", "background-color", "var(--cat-violet)"], ["#fx-tag-solid-cat", "", "color", "var(--background)"],
    ["#fx-tag-icon", "", "width", "1.25rem"], ["#fx-tag-icon", "", "padding-left", "0px"], ["#fx-tag-icon", "", "justify-content", { is: "center" }],
    ["#fx-tag-icon", "", "background-color", mix("--info", 12)], ["#fx-tag-icon", "::before", "mask-image", "var(--ico-eye-off)"],
    ["#fx-tag-bracket", "", "border-top-width", { is: "0px" }], ["#fx-tag-bracket", "", "padding-left", "0px"], ["#fx-tag-bracket", "", "column-gap", "0px"],
    ["#fx-tag-bracket", "::before", "content", { is: '"[ " / ""' }], ["#fx-tag-bracket", "::after", "content", { is: '" ]" / ""' }],
    ["#fx-tag-bracket", "::before", "white-space", { is: "pre" }], ["#fx-tag-glow", "", "color", "var(--primary)"],
  ]],
  ["T1 button.tag — a control that still looks like a tag; disabled is .45", [
    ["#fx-tag-button", "", "cursor", { is: "pointer" }], ["#fx-tag-button", "", "box-sizing", { is: "border-box" }],
    ["#fx-tag-button", "", "font-family", "var(--font-mono)"], ["#fx-tag-button", "", "font-size", "var(--fs-base)"],
    ["#fx-tag-button", "", "color", "var(--info)"], ["#fx-tag-button", "", "background-color", "transparent"],
    ["#fx-tag-button", "", "border-top-color", mix("--info", 50)], ["#fx-tag-button", "", "height", "1.25rem"],
    ["#fx-tag-disabled", "", "opacity", { is: "0.45" }], ["#fx-tag-disabled", "", "cursor", { is: "default" }],
  ]],
  ["T2 .count — square, tabular, muted by default; the overlay is filled and ringed", [
    ["#fx-count", "", "display", { is: "inline-grid" }], ["#fx-count", "", "min-width", "1.25rem"], ["#fx-count", "", "height", "1.25rem"],
    ["#fx-count", "", "box-sizing", { is: "border-box" }], ["#fx-count", "", "padding-left", "0.25rem"],
    ["#fx-count", "", "font-weight", { is: "600" }], ["#fx-count", "", "font-variant-numeric", { is: "tabular-nums" }],
    ["#fx-count", "", "line-height", "12px"], ["#fx-count", "", "color", "var(--muted-foreground)"],
    ...edge("#fx-count", "top", "1px", "solid", mix("--muted-foreground", 50)),
    ["#fx-count-tone", "", "color", "var(--destructive)"], ["#fx-count-tone", "", "border-top-color", mix("--destructive", 50)],
    ["#fx-count-overlay", "", "position", { is: "absolute" }], ["#fx-count-overlay", "", "top", "-0.375rem"], ["#fx-count-overlay", "", "right", "-0.375rem"],
    ["#fx-count-overlay", "", "color", "var(--background)"], ["#fx-count-overlay", "", "background-color", "var(--primary)"],
    ["#fx-count-overlay", "", "border-top-color", "var(--background)"],
  ]],
  ["removed by the review: .tag--dotted draws nothing (only --off is dotted), .banner--sticky does not stick (.bar-stack does)", [
    ["#fx-gone-dotted", "", "border-top-style", { is: "solid" }], ["#fx-gone-sticky", "", "position", { is: "static" }],
  ]],
  ["a tone never leaks: untoned elements inside a data-tone=\"info\" container keep their own default", [
    ["#fx-leak-tag", "", "color", "var(--muted-foreground)"], ["#fx-leak-count", "", "color", "var(--muted-foreground)"],
    ["#fx-leak-dot", "", "background-color", "var(--foreground)"], ["#fx-leak-notice-label", "", "color", "var(--muted-foreground)"],
    ["#fx-leak-callout", "", "border-left-color", "var(--primary)"], ["#fx-leak-banner", "", "color", "var(--destructive)"],
    ["#fx-leak-empty", "::before", "background-color", "var(--muted-foreground)"],
  ]],
];

const runExpect = async (suffix) => {
  for (const [label, rows] of EXPECT) {
    await check(`${label} (${suffix})`, async () => {
      const results = await evaluate(`(${JSON.stringify(rows)}).map((r) => window.__wp7.expect(...r))`);
      return results.filter(Boolean);
    });
  }
};

const MINE = ".empty, .notice, .notice-label, .callout, .callout-title, .banner, .banner-title, .banner-list, .state, .spinner, .loading, .fence, .fence-label, .fence-body, .fence-end, .dot, .tag, .count";
const noRadius = () => check("no radius anywhere but the dot's circle (every element and pseudo of both files)", () => evaluate(`
  [...document.querySelectorAll(${JSON.stringify(MINE)})].flatMap((el) => ["", "::before", "::after"].flatMap((p) => {
    const cs = getComputedStyle(el, p || null);
    if (p && cs.content === "none") return [];
    const want = el.classList.contains("dot") && !p ? "50%" : "0px";
    return ["border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius"]
      .filter((k) => cs.getPropertyValue(k) !== want)
      .map((k) => (el.id || el.className) + p + " " + k + " = " + cs.getPropertyValue(k));
  }))`));

const SNAP_PROPS = ["display", "position", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-bottom", "row-gap", "column-gap", "font-family", "font-size", "font-weight", "font-style", "line-height",
  "letter-spacing", "text-transform", "text-align", "text-decoration-line", "white-space", "color", "background-color",
  "border-top-width", "border-top-style", "border-top-color", "border-left-width", "border-left-style", "border-left-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color", "border-top-left-radius", "min-height", "min-width",
  "justify-items", "align-items", "align-self", "animation-name", "content", "mask-image", "opacity", "z-index", "list-style-type",
  "font-variant-numeric", "cursor"];
// A component's OUTER margin is the page's layout (the reset decides it), so it is not compared on a
// component root; everything the two files set on themselves and their children is.
const ROOTS = ".empty, .notice, .callout, .banner, .state, .spinner, .loading, .dot, .tag, .count";
const snapshot = () => evaluate(`window.__wp7.snapshot([...document.querySelectorAll("#fx [id]")].map((e) => e.id), ${JSON.stringify(SNAP_PROPS)}, ${JSON.stringify(ROOTS)})`);

/* ── run: full stack, then tokens only ───────────────────────────────────────────────────────── */
const THEMES = ["warm", "green", "mono", "paper"];

await load();

/* The YIELD, as numbers. Everything below compares this file's output with a token resolved on a
   probe, and an unresolved token resolves to nothing on BOTH sides: a missing --ico-mail makes
   "mask-image: var(--ico-mail)" equal "none" equal "none", and a missing --cat-teal measures the
   muted fallback's contrast under the teal row's name. So what the run depends on is counted first,
   and a short count fails — a check that measured the wrong thing must not read as a pass. */
const ICONS = ["loader-circle", "triangle-alert", "x", "folder-open", "circle-check", "info", "package", "download", "mail", "eye-off"];
/* X6: I1's set (SPEC-part3 §2.10 I1, "The set"). A name outside it has no mask, and whoever copies the
   markup gets an empty box. */
const I1 = ["check", "search", "filter", "arrow-up", "arrow-down", "trash-2", "pencil", "minus", "loader-circle", "star-filled", "x",
  "chevron-down", "chevron-left", "download", "history", "home", "image-plus", "package", "refresh-cw", "star", "triangle-alert",
  "circle-check", "circle-alert", "circle-x", "info", "copy", "clock", "arrow-up-down", "external-link", "github", "mail",
  "plus", "eye", "eye-off", "power", "upload", "send", "arrow-left", "arrow-right", "circle-fading-arrow-up", "chevron-right",
  "chevrons-up-down", "chevrons-down-up", "folder-tree", "folder-open", "file-code", "panel-left-open", "maximize-2", "folder",
  "file", "panel-left-close"];
const CAT_NAMES = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "purple", "pink"];
const TONE_NAMES = ["primary", "success", "warning", "destructive", "info", "pending", "muted"];
const SIZE_TOKENS = ["--icon-sm", "--icon-size", "--icon-xl", "--dot-size"];
const yieldOf = await evaluate(`(() => {
  const root = getComputedStyle(document.documentElement);
  const has = (name) => root.getPropertyValue(name).trim() !== "";
  const probe = document.createElement("span");
  document.body.append(probe);
  const tones = ${JSON.stringify(TONE_NAMES)}.filter((t) => { probe.dataset.tone = t; return getComputedStyle(probe).getPropertyValue("--tone").trim() !== ""; });
  probe.remove();
  const frames = new Set();
  for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (rule instanceof CSSKeyframesRule) frames.add(rule.name);
  return {
    cat: ${JSON.stringify(CAT_NAMES)}.filter((c) => has("--cat-" + c)),
    tones,
    icons: ${JSON.stringify(ICONS)}.filter((i) => has("--ico-" + i)),
    sizes: ${JSON.stringify(SIZE_TOKENS)}.filter(has),
    keyframes: ["dd-spin", "dd-pulse"].filter((k) => frames.has(k)),
  };
})()`);
console.log(`resolved: --cat-* ${yieldOf.cat.length}/12 · data-tone ${yieldOf.tones.length}/7 · --ico-* ${yieldOf.icons.length}/${ICONS.length} · ` +
  `sizes ${yieldOf.sizes.length}/${SIZE_TOKENS.length} · keyframes ${yieldOf.keyframes.length}/2\n`);
await check("every token the measurements depend on resolved — none of them is measuring a fallback", () => [
  ...CAT_NAMES.filter((c) => !yieldOf.cat.includes(c)).map((c) => `--cat-${c} is not declared`),
  ...TONE_NAMES.filter((t) => !yieldOf.tones.includes(t)).map((t) => `data-tone="${t}" sets no --tone`),
  ...ICONS.filter((i) => !yieldOf.icons.includes(i)).map((i) => `--ico-${i} is not declared`),
  ...SIZE_TOKENS.filter((s) => !yieldOf.sizes.includes(s)).map((s) => `${s} is not declared`),
  ...["dd-spin", "dd-pulse"].filter((k) => !yieldOf.keyframes.includes(k)).map((k) => `@keyframes ${k} is not declared`),
]);

await check("the demo page shows every element and state the spec names", () => evaluate(`
  [".empty[data-icon]", ".empty--inline", ".empty[data-tone='warning'][role='alert']", ".notice:not([data-tone])",
   ".notice[data-tone='success'][role='status']", ".notice .notice-label", ".notice .notice-dismiss", ".notice--lg[data-icon]",
   ...["primary", "success", "warning", "destructive", "info", "pending", "muted"].map((t) => ".notice[data-tone='" + t + "']"),
   ".callout:not([data-tone])", ".callout[data-tone]", "p.callout > strong.callout-title", ".callout[data-icon]", ".callout:empty",
   ".banner:not([data-tone]) .banner-list", ".banner[data-tone='warning']", ".banner[role='status']",
   ...${JSON.stringify(STATES)}.map((s) => ".state[data-state='" + s + "']"), "p.state", ".spinner", ".spinner--lg", ".loading[role='status']",
   "[aria-busy='true'] .loading", ".fence .fence-label", ".fence .fence-end", ".fence-body:empty", ".dot", ".dot--pulse", ".dot--overlay",
   ...["primary", "success", "warning", "destructive", "info", "pending", "muted"].map((t) => ".tag[data-tone='" + t + "']"),
   ".tag:not([data-tone]):not([data-hue])", ".tag[data-hue]", ".tag--dashed", ".tag--off", ".tag--strong",
   ".tag--struck", ".tag--solid", ".tag--icon[role='img'][aria-label]", ".tag--bracket", ".tag--bracket.glow", ".tag > .ico",
   ".tag[data-icon]", "button.tag", "button.tag:disabled", ".count", ".count[data-tone]", ".count--overlay"]
  .filter((sel) => !document.querySelector(sel)).map((sel) => "missing on the demo page: " + sel)`));

// ONE HUE API: a tag's identity is `data-hue`, the name a chart series takes, never a style attribute
// (a page under `style-src 'self'` refuses those). Each of the twelve names must reach its --cat-* hue;
// a missing mapping would fall back to muted, which passes every contrast row, so it is asked here.
await check("data-hue gives a tag each of the twelve --cat-* hues; an unknown name sets nothing; no demo tag has a style attribute", () => evaluate(`(() => {
  const out = [];
  const colour = (html) => { const h = document.createElement("div"); h.innerHTML = html; document.body.append(h);
    const c = getComputedStyle(h.firstElementChild).color; h.remove(); return c; };
  for (const c of ${JSON.stringify(CAT_NAMES)}) {
    const want = colour('<span style="color: var(--cat-' + c + ')">x</span>'), got = colour('<span class="tag" data-hue="' + c + '">x</span>');
    if (got !== want) out.push(c + ": the tag is " + got + ", --cat-" + c + " is " + want);
  }
  if (colour('<span class="tag" data-hue="nonsense">x</span>') !== colour('<span class="tag">x</span>')) out.push("an unknown hue changed the tag");
  out.push(...[...document.querySelectorAll(".tag[style]")].map((el) => "a style attribute on a demo tag: " + el.outerHTML.slice(0, 70)));
  return out; })()`));

await check("every icon the demo names is in I1's set (X6)", () => evaluate(`
  [...new Set([...document.querySelectorAll("[data-icon]")].map((el) => el.dataset.icon))]
    .filter((name) => !${JSON.stringify(I1)}.includes(name)).map((name) => "data-icon=\\"" + name + "\\" is not in I1")`));

/* The lead's rulings on live roles, for a notice and a loading row alike:
   - NO LIVE ROLE INSIDE ANY LIVE REGION, status or alert: two live regions for one message, and the
     polite one can swallow the urgent one. This goes for every element with a live role on the page.
   - role="alert" only for warning and destructive, on the element itself, so a failed result is
     mounted BESIDE its status slot, never inside it.
   - Everything else is a status: carried by the element itself only when it is in the page from the
     first render, and otherwise by a role="status" region that was there first.
   - A --lg notice is a RESULT, which arrives after an action by definition, so a status one always goes
     into a region. */
const ROLES = String.raw`((root) => {
  const live = "[role='status'], [role='alert']";
  const name = (n) => (n.matches(".loading") ? "loading row" : n.matches(".notice") ? (n.dataset.tone || "untoned") +
    (n.matches(".notice--lg") ? " --lg" : "") + " notice" : n.tagName.toLowerCase() + "." + [...n.classList].join(".")) +
    " '" + n.textContent.trim().replace(/\s+/g, " ").slice(0, 40) + "'";
  const nested = [...root.querySelectorAll(live)].filter((n) => n.parentElement && n.parentElement.closest(live)).map((n) =>
    name(n) + " carries role=" + n.getAttribute("role") + " inside a role=" + n.parentElement.closest(live).getAttribute("role") +
    " region: no live role sits inside a live region");
  const own = [...root.querySelectorAll(".notice, .loading")].flatMap((n) => {
    const role = n.getAttribute("role"), region = n.parentElement && n.parentElement.closest(live);
    const loud = n.matches(".notice") && ["warning", "destructive"].includes(n.dataset.tone);
    if (region && n.matches(live)) return []; // reported above
    if (loud && !n.querySelector(".notice-label")) return [name(n) + " has no label: the label is the meaning, on every notice that is not a success"];
    if (loud) return role === "alert" ? [] : [name(n) + " has role=" + role + ", wants alert on itself, beside any status slot"];
    if (region) return region.getAttribute("role") === "status" ? [] : [name(n) + " sits in a role=alert region: a status goes into a status region"];
    if (n.matches(".notice--lg")) return [name(n) + " is a result: it goes into a role=status region already in the page"];
    return role === "status" ? [] : [name(n) + " has role=" + role + " and no status region around it"];
  });
  return [...nested, ...own];
})`;
await check("demo: no live role inside a live region; alert only for warning and destructive; a status on the element or on its region", () =>
  evaluate(`${ROLES}(document)`));
/* The reference is what gets copied, so it answers to the same rule — and it must SHOW the one placement
   that is easiest to get wrong: a failed result beside its status slot. The frozen banner is found by
   its word "frozen": S4 names that one example, and markup cannot say whether a banner is an alarm or
   information, so this is a pin on the example, accepted as a documented limit (WP7 review, round 3). */
await check("feedback.md's examples follow the same rule, show a failed result beside its slot, and keep the frozen banner a status (S4)", () => evaluate(`(async () => {
  const md = await (await fetch("/.claude/skills/danieldeusing-design/references/feedback.md")).text();
  const blocks = [...md.matchAll(/\x60\x60\x60html\\n([\\s\\S]*?)\x60\x60\x60/g)].map((m) => m[1]);
  const docs = blocks.map((html) => new DOMParser().parseFromString(html, "text/html"));
  const problems = docs.flatMap((doc) => ${ROLES}(doc));
  for (const b of docs.flatMap((doc) => [...doc.querySelectorAll(".banner")]))
    // In a role=status region, its own or one that was already there (the ruling puts it inside one).
    if (/frozen/.test(b.textContent) && !b.closest("[role='status']")) problems.push("the frozen banner has role=" + b.getAttribute("role") + " and sits in no role=status region");
  const failedResult = docs.some((doc) => [...doc.querySelectorAll(".notice--lg[role='alert']")]
    .some((n) => !n.parentElement.closest("[role='status'], [role='alert']")));
  if (!failedResult) problems.push("no failed result (a --lg notice with role=alert) is shown beside its status slot");
  const seen = docs.reduce((n, doc) => n + doc.querySelectorAll(".notice, .loading").length, 0);
  return seen ? problems : ["read " + blocks.length + " html examples and found no notice or loading row in them: the check measured nothing"];
})()`));
// A notice and a loading row mounted LATER: each goes into a status region the page rendered empty.
await check("the demo mounts a later notice and a later loading row into role=status regions that were already there", () => evaluate(`(async () => {
  const problems = [];
  for (const [button, region, sel] of [["install-demo", "install-status", ".notice"], ["reload-demo", "reload-status", ".loading"]]) {
    const b = document.getElementById(button), r = document.getElementById(region);
    if (!b || !r) { problems.push("no #" + button + " button / #" + region + " region on the demo page"); continue; }
    if (r.getAttribute("role") !== "status") problems.push("#" + region + " is not role=status");
    if (r.children.length) problems.push("#" + region + " is not empty before anything happened");
    b.click();
    await new Promise((ok) => setTimeout(ok, 50));
    const n = r.querySelector(sel);
    if (!n) problems.push("#" + button + " put no " + sel + " into #" + region);
    else if (n.hasAttribute("role")) problems.push(sel + " inside #" + region + " carries role=" + n.getAttribute("role") + ", the region carries it");
    r.replaceChildren();
  }
  return problems;
})()`));
// A load that FAILS: the row leaves the status region, and the failure is an alert mounted beside it.
await check("the demo's failing reload takes its row out of the status region and mounts the failure beside it, labelled", () => evaluate(`(async () => {
  const b = document.getElementById("reload-fail-demo"), r = document.getElementById("reload-status");
  if (!b || !r) return ["no #reload-fail-demo button / #reload-status region on the demo page"];
  b.click();
  await new Promise((ok) => setTimeout(ok, 1700));
  const problems = [];
  if (r.querySelector(".loading")) problems.push("the loading row is still spinning in #reload-status");
  if (r.querySelector("[role]")) problems.push("#reload-status holds an element with a live role");
  const alert = r.nextElementSibling;
  if (!alert || !alert.matches(".notice[role='alert']")) problems.push("no role=alert notice right after #reload-status");
  else if (!alert.querySelector(".notice-label")) problems.push("the failure notice has no label");
  problems.push(...${ROLES}(document));
  r.replaceChildren(); if (alert && alert.matches(".notice[role='alert']")) alert.remove();
  return problems;
})()`));

await inject();
await check("every glyph a fixture asks for is actually drawn (a mask, not 'none')", () => evaluate(`
  [["#fx-empty", "::before"], ["#fx-empty-fail", "::before"], ["#fx-empty-inline-icon", "::before"], ["#fx-notice-lg", "::before"],
   ["#fx-callout-icon", "::before"], ["#fx-spinner", ""], ["#fx-tag-dataicon", "::before"], ["#fx-tag-icon", "::before"]]
  .filter(([sel, p]) => !/^url\\(/.test(getComputedStyle(document.querySelector(sel), p || null).maskImage))
  .map(([sel, p]) => sel + p + " draws no glyph")`));
const full = {};
for (const theme of THEMES) {
  await setTheme(theme);
  await runExpect(`full, ${theme}`);
  full[theme] = await snapshot();
}
await noRadius();

// D10: opacity is never an axis. It dims the word below AA and reads as broken rather than off; the
// one element allowed below 1 is a disabled button.tag, which is a control's state, not a meaning.
const opaque = () => check("every .tag and .count computes opacity 1 (button.tag:disabled alone is .45)", () => evaluate(`
  [...document.querySelectorAll(".tag, .count")].filter((el) => !el.matches("button.tag:disabled") && el.getClientRects().length)
    .filter((el) => getComputedStyle(el).opacity !== "1").map((el) => (el.id || el.className) + " opacity " + getComputedStyle(el).opacity)`));
await opaque();
// X3: tokens.css hides [hidden] for every surface (WP1). An author
// `display` beats the UA's rule, so every class here that sets one would otherwise show.
const hides = (mode) => check(`X3: hidden hides every component (${mode})`, () => evaluate(`
  ${JSON.stringify(HIDDEN.map(([id]) => id))}.map((id) => document.getElementById("fx-h-" + id))
    .filter((el) => getComputedStyle(el).display !== "none").map((el) => el.id + " is display: " + getComputedStyle(el).display)`));
await hides("full");

/* ── 2. states: hover, keyboard focus, disabled, motion off, print, a coarse pointer ─────────── */
await setTheme("warm");
const rect = (sel) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const hover = async (sel) => {
  // "instant": base.css sets `scroll-behavior: smooth`, so a plain scrollIntoView is still moving
  // when the rect is read and the pointer lands where the element used to be.
  await evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center", behavior: "instant" }); null`);
  const { x, y } = await rect(sel);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(250); // past the .15s edge transition
};
await hover("#fx-tag-button");
await check("button.tag :hover firms the edge to the full tone", async () =>
  [await evaluate(`window.__wp7.expect("#fx-tag-button", "", "border-top-color", "var(--info)")`)].filter(Boolean));
await hover("#fx-tag-disabled");
await check("...and a disabled one does not react to the pointer", async () =>
  [await evaluate(`window.__wp7.expect("#fx-tag-disabled", "", "border-top-color", ${JSON.stringify(mix("--info", 50))})`)].filter(Boolean));
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });

const tabTo = async (sel) => {
  await evaluate(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); const b = document.createElement("button"); b.id = "fx-before"; t.before(b); b.focus(); })(); null`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await evaluate(`document.getElementById("fx-before").remove(); null`);
};
const ring = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (document.activeElement !== el) return ["focus did not land on ${sel}"];
  return [window.__wp7.expect(${JSON.stringify(sel)}, "", "outline-style", { is: "solid" }), window.__wp7.expect(${JSON.stringify(sel)}, "", "outline-width", "2px"),
    window.__wp7.expect(${JSON.stringify(sel)}, "", "outline-color", "var(--ring)"), window.__wp7.expect(${JSON.stringify(sel)}, "", "outline-offset", "2px"),
    el.matches(":focus-visible") ? null : "not :focus-visible"].filter(Boolean); })()`);
// The rings themselves are asserted in ?bare (section 3): with base.css loaded its global
// :focus-visible ring would pass them even with the components' own rules deleted (X2).

await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await check("prefers-reduced-motion stops the spinner and the pulse, and the glyph stays", async () => (await evaluate(`[
  window.__wp7.expect("#fx-spinner", "", "animation-name", { is: "none" }), window.__wp7.expect("#fx-dot-pulse", "", "animation-name", { is: "none" }),
  window.__wp7.expect("#fx-spinner", "", "mask-image", "var(--ico-loader-circle)")]`)).filter(Boolean));
await send("Emulation.setEmulatedMedia", { features: [] });
await evaluate(`document.documentElement.classList.add("anim-off"); null`);
await check("html.anim-off stops them too", async () => (await evaluate(`[
  window.__wp7.expect("#fx-spinner", "", "animation-name", { is: "none" }), window.__wp7.expect("#fx-dot-pulse", "", "animation-name", { is: "none" })]`)).filter(Boolean));
await evaluate(`document.documentElement.classList.remove("anim-off"); null`);

await send("Emulation.setEmulatedMedia", { media: "print" });
await check("print: no dismiss, the fence does not split, and a fill-only mark is outlined or forced", async () => (await evaluate(`[
  window.__wp7.expect("#fx-notice-dismiss", "", "display", { is: "none" }), window.__wp7.expect("#fx-notice-long-dismiss", "", "display", { is: "none" }),
  window.__wp7.expect("#fx-fence", "", "break-inside", { is: "avoid" }), window.__wp7.expect("#fx-dot", "", "print-color-adjust", { is: "exact" }),
  window.__wp7.expect("#fx-tag-solid", "", "background-color", "transparent"), window.__wp7.expect("#fx-tag-solid", "", "color", "var(--primary)"),
  window.__wp7.expect("#fx-count-overlay", "", "background-color", "transparent"), window.__wp7.expect("#fx-count-overlay", "", "color", "var(--primary)")]`)).filter(Boolean));
await send("Emulation.setEmulatedMedia", { media: "" });

await check("a coarse pointer gets a 44px button.tag", async () => {
  // Touch emulation is what flips (pointer: coarse) in Chromium; a media-feature override is tried
  // first where the protocol has one. Either way the query is asked, so a failed emulation FAILS.
  try { await send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }] }); } catch {}
  if (!(await evaluate(`matchMedia("(pointer: coarse)").matches`))) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  }
  if (!(await evaluate(`matchMedia("(pointer: coarse)").matches`))) return ["could not emulate (pointer: coarse) — this check proved nothing"];
  return [await evaluate(`window.__wp7.expect("#fx-tag-button", "", "min-height", "44px")`)].filter(Boolean);
});
try { await send("Emulation.setEmulatedMedia", { features: [] }); } catch {}
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

await check("a tag with a glyph, a word-only tag and an icon-only tag sit on one line at one height", () => evaluate(`(() => {
  const mid = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top + r.height / 2; };
  const [a, b, c] = ["fx-tl-glyph", "fx-tl-word", "fx-tl-icon"].map(mid);
  return Math.max(Math.abs(a - b), Math.abs(b - c)) < 0.6 ? [] : ["centres " + a + " / " + b + " / " + c];
})()`));
// A one-line notice and one whose sentence wraps (the fixture asserts that it does): the × stays at
// the end of the FIRST line, centred on it, and never drops to the last line or the middle.
await check("the dismiss sits at the end of the notice's first line, centred on it — one line or several", () => evaluate(`(() => {
  const out = [];
  for (const [id, lines] of [["fx-notice", 1], ["fx-notice-long", 3]]) {
    const notice = document.getElementById(id), cs = getComputedStyle(notice), body = notice.querySelector("p");
    const d = notice.querySelector(".notice-dismiss").getBoundingClientRect();
    const edge = notice.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    if (Math.abs(edge - d.right) > 0.6) out.push(id + ": dismiss right edge " + d.right + ", content edge " + edge);
    const range = document.createRange();
    range.setStart(body.firstChild, 0);
    range.setEnd(body.firstChild, 1);
    const first = range.getClientRects()[0], line = first.top + first.height / 2, mid = d.top + d.height / 2;
    if (Math.abs(line - mid) > 1) out.push(id + ": dismiss centred at y " + mid + ", the first line at " + line);
    const got = Math.round(body.getBoundingClientRect().height / parseFloat(getComputedStyle(body).lineHeight));
    if (got < lines) out.push(id + ": the sentence is " + got + " line(s), the fixture needs " + lines + " or it tests nothing");
  }
  return out;
})()`));

/* ── 3. the same page with tokens.css + feedback.css + tags.css only ─────────────────────────── */
await load("?bare");
await check("?bare really dropped base, components and chrome", () => evaluate(`
  [...document.styleSheets].map((s) => (s.href || "").split("/").pop()).filter((f) => /^(base|components|chrome)\\.css$/.test(f))
    .map((f) => f + " is still loaded")`));
await inject();
for (const theme of THEMES) {
  await setTheme(theme);
  await runExpect(`tokens only, ${theme}`);
  const bare = await snapshot();
  await check(`tokens-only renders every fixture exactly as the full stack does (${theme}, ${SNAP_PROPS.length} properties)`, () => Object.keys(full[theme])
    .filter((key) => full[theme][key] !== bare[key])
    .map((key) => `${key}: full '${full[theme][key]}', tokens-only '${bare[key]}'`));
}
await hides("tokens only");
await setTheme("warm");
await tabTo("#fx-tag-button");
await check("button.tag reached by Tab shows the 2px --ring, offset 2px (?bare: only tags.css can draw it)", () => ring("#fx-tag-button"));
await tabTo("#fx-banner-link");
await check("a link inside a banner shows the same ring (?bare: only feedback.css can draw it)", () => ring("#fx-banner-link"));

/* ── X1: forced colours, in ?bare so nothing but these two files can pass it ────────────────────
   Chromium's forced colours replace every background-color with Canvas. A glyph drawn as a
   background through a mask then vanishes, and a state drawn only by a fill collapses into its
   neighbour. Text survives on its own: the .state glyphs are text, and are in the list for the
   record, not because they need a rule. */
const GLYPHS = [["#fx-empty", "::before", "background-color"], ["#fx-empty-fail", "::before", "background-color"],
  ["#fx-empty-inline-icon", "::before", "background-color"], ["#fx-notice-lg", "::before", "background-color"],
  ["#fx-callout-icon", "::before", "background-color"], ["#fx-spinner", "", "background-color"],
  ["#fx-dot", "", "background-color"], ["#fx-dot-plain", "", "background-color"], ["#fx-dot-overlay", "", "background-color"],
  ["#fx-tag-dataicon", "::before", "background-color"], ["#fx-tag-icon", "::before", "background-color"], ["#fx-tag-ico", "", "background-color"],
  ...STATES.filter((s) => s !== "none").map((s) => [`#fx-state-${s}`, "::before", "color"])];
// [element, property, element, property, what must tell them apart]
const PAIRS = [["#fx-tag", "background-color", "#fx-tag-solid", "background-color", "--solid against a plain tag"],
  ["#fx-tag-solid", "color", "#fx-tag-solid", "background-color", "--solid's word against its own fill"],
  ["#fx-count", "background-color", "#fx-count-overlay", "background-color", "an overlay count against a plain one"],
  ["#fx-count-overlay", "color", "#fx-count-overlay", "background-color", "the overlay's number against its own fill"],
  ["#fx-tag-button", "color", "#fx-tag-disabled", "color", "button.tag against a disabled one"],
  ["#fx-tag", "border-top-style", "#fx-tag-off", "border-top-style", "--off (dotted) against a plain tag"],
  ["#fx-tag", "border-top-style", "#fx-tag-dashed", "border-top-style", "--dashed against a plain tag"],
  ["#fx-tag", "font-weight", "#fx-tag-strong", "font-weight", "--strong against a plain tag"],
  ["#fx-tag", "text-decoration-line", "#fx-tag-struck", "text-decoration-line", "--struck against a plain tag"]];
/* ── X1, painted: what reaches the screen, read back as pixels ─────────────────────────────────
   Computed colours cannot see the one failure that matters most here. Under `forced-color-adjust:
   auto` Chromium paints a Canvas BACKPLATE behind every run of text, so a --solid tag's word, drawn
   Canvas on a CanvasText fill, lands on Canvas and vanishes — while its computed pair still says
   21:1. So each glyph, each word on a fill and each focus ring is captured and decoded. Twice the
   pixel density, so a 1px stroke has pixels it covers fully. */
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
  return { width, height, at: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
};
const lum8 = (p) => p.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
const ratio8 = (p, q) => { const [hi, lo] = [lum8(p), lum8(q)].sort((a, b) => b - a); return (hi + 0.05) / (lo + 0.05); };
/* [what, its kind, minimum]. What each clip is FOR, and what hides only it:
   · a glyph: its ::before's own box — hidden as that ::before — or, for a glyph that is an element
     (.ico, .spinner, .dot), the box inside its border — hidden as the element;
   · a word: the box of its own text, where a backplate would sit — hidden as its text nodes, wrapped
     in a `visibility: hidden` span (the word and its backplate go, nothing else; `color: transparent`
     is repainted by a forced palette, measured);
   · a ring: the outline's top band (offset 2px, width 2px), edge to edge along the outline box — an element opted out with
     `none` owns its ring too, and keeps --ring unless the forced block says otherwise — hidden as its outline. */
const PAINTED = [...["#fx-fc-empty", "#fx-fc-empty-warn", "#fx-fc-notice-lg", "#fx-fc-callout", "#fx-fc-tag-glyph", "#fx-fc-tag-icon"]
  .map((sel) => [sel, "glyph", 3, "::before"]), ...["#fx-fc-ico", "#fx-fc-spinner", "#fx-fc-dot"].map((sel) => [sel, "glyph", 3, ""]),
  ["#fx-tag-solid", "text", 4.5], ["#fx-count-overlay", "text", 4.5],
  ...["#fx-fc-solid-button", "#fx-fc-tag-button", "#fx-fc-banner-link"].map((sel) => [sel, "ring", 3])];
/* OWNERSHIP, by a TWO-SHOT DIFF (X1). The same clip is captured twice, as drawn and with ONLY the target
   hidden, and only the pixels that change are the target's: at least 3, all of them inside the target's
   box ±1px (a ring: its band, edge to edge), the clip grown by PAD so ink that lands beside the box is
   seen there. A neighbour's ink is the same in both shots and counts for nothing; a clip that slid off
   its target (a scrollbar, captureBeyondViewport's re-layout, a box measured before a scroll) reads the
   ink in the wrong place and fails. The first form of this proof — "the clip measures under 1.2:1 with
   the element taken away" — passed a clip slid 8px along a fixture: the element took its border with it.
   Then the ratio:
   · a glyph or a ring: over the changed pixels, drawn against hidden — what it paints on what it covers;
   · a word: inside the DRAWN shot, over its text box less the outermost 1px ring (where a backplate's
     anti-aliased edge lands), changed pixels against the box's commonest colour — what the word
     actually sits on. Never against the hidden shot: that is what lies UNDER a backplate, and a word
     painted in its backplate's colour would read 21:1.
   Captured WITHOUT captureBeyondViewport, after scrolling the element into view: that flag re-lays the
   page without its scrollbar, and a clip computed beforehand then reads pixels up to 7.5px away (WP12
   measured a 1.34:1 glyph passing at 21:1 that way). */
const PAD = 3;
const targetOf = (sel, kind) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const b = el.getBoundingClientRect(), cs = getComputedStyle(el), px = (p) => parseFloat(cs.getPropertyValue(p));
  let r;
  if (${JSON.stringify(kind)} === "text") { const range = document.createRange(); range.selectNodeContents(el); r = range.getBoundingClientRect(); }
  else if (${JSON.stringify(kind)} === "ring") r = { left: b.left - 4, top: b.top - 4, width: b.width + 8, height: b.height + 8 };
  else r = { left: b.left + px("border-left-width"), top: b.top + px("border-top-width"),
    width: b.width - px("border-left-width") - px("border-right-width"), height: b.height - px("border-top-width") - px("border-bottom-width") };
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
})()`);
const HIDE = {
  glyph: (sel, pseudo) => `(() => { const s = document.createElement("style"); s.id = "fx-unown";
    s.textContent = ${JSON.stringify(`${sel}${pseudo} { visibility: hidden !important; }`)}; document.head.append(s); })()`,
  text: (sel) => `(() => { const n = document.querySelector(${JSON.stringify(sel)});
    for (const t of [...n.childNodes].filter((c) => c.nodeType === 3)) { const s = document.createElement("span"); s.className = "fx-unown"; s.style.visibility = "hidden"; t.replaceWith(s); s.append(t); } })()`,
  // the outline alone: blurring would also take whatever else focus draws on the element
  ring: (sel) => `document.querySelector(${JSON.stringify(sel)}).style.setProperty("outline-style", "none", "important")`,
};
const UNHIDE = `(() => { document.getElementById("fx-unown")?.remove(); for (const n of document.querySelectorAll("[style*=outline-style]")) n.style.removeProperty("outline-style"); for (const s of document.querySelectorAll("span.fx-unown")) s.replaceWith(...s.childNodes); })()`;
/* A ::before glyph's OWN box, from the protocol: the page has no rect for a pseudo-element, and the
   fixture's box is no stand-in for it. A glyph sitting 8px or more inside its panel reads the same
   ink slid 8px and is still inside the panel (the callout, the large notice and the tag passed an 8px
   slide that way). `DOM.getBoxModel` answers in the viewport's CSS px. */
const pseudoBox = async (sel, pseudo) => {
  const { root } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
  const { node } = await send("DOM.describeNode", { nodeId, depth: 1 });
  const own = (node.pseudoElements || []).find((p) => p.pseudoType === pseudo.replace(/^::/, ""));
  if (!own) throw new Error(`${sel} has no ${pseudo} to measure`);
  const q = (await send("DOM.getBoxModel", { backendNodeId: own.backendNodeId })).model.border;
  const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
  const [sx, sy] = await evaluate("[scrollX, scrollY]");
  return { x: Math.min(...xs) + sx, y: Math.min(...ys) + sy, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const paintOf = async (sel, kind, pseudo = "") => {
  if (kind === "ring") await tabTo(sel);
  let t = await targetOf(sel, kind); // scrolls it into view
  if (kind === "glyph" && pseudo) t = await pseudoBox(sel, pseudo);
  // a ring is read along its top band only (2px), but it is the whole outline box its ink must sit in
  const clip = { x: t.x - PAD, y: t.y - PAD, width: t.w + 2 * PAD, height: (kind === "ring" ? 2 : t.h) + 2 * PAD, scale: 1 };
  // Two animation frames before every capture (RULES-CROSSCUT X1): a capture taken as soon as a
  // theme, a palette, a hidden mark or a focus changed can read the frame before that paint landed.
  await evaluate("new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(null))))");
  const drawn = decodePng(Buffer.from((await send("Page.captureScreenshot", { format: "png", clip })).data, "base64"));
  await evaluate(HIDE[kind](sel, pseudo));
  await evaluate("new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(null))))");
  const bare = decodePng(Buffer.from((await send("Page.captureScreenshot", { format: "png", clip })).data, "base64"));
  await evaluate(UNHIDE);
  // the target's box in the capture's pixels (device pixels: k per CSS px), where the code believes the clip was placed
  const k = drawn.width / clip.width, L = PAD * k, T = PAD * k, R = (PAD + t.w) * k, B = (PAD + t.h) * k;
  const changed = (x, y) => { const p = drawn.at(x, y), q = bare.at(x, y); return Math.max(...p.map((v, i) => Math.abs(v - q[i]))) > 2; };
  let n = 0, carried = 1, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < drawn.height; y += 1) for (let x = 0; x < drawn.width; x += 1) {
    if (!changed(x, y)) continue;
    n += 1; carried = Math.max(carried, ratio8(drawn.at(x, y), bare.at(x, y)));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  const slack = k; // 1 CSS px
  const inside = n > 0 && x0 >= L - slack && x1 <= R + slack && y0 >= T - slack && y1 <= B + slack;
  const owns = n >= 3 && inside && (kind !== "ring" || (Math.abs(x0 - L) <= slack && Math.abs(x1 - R) <= slack && Math.abs(y0 - T) <= slack));
  let ratio = carried;
  if (kind === "text") {
    const counts = new Map(), il = Math.ceil(L), it = Math.ceil(T), ir = Math.floor(R), ib = Math.floor(B);
    for (let y = it; y < ib; y += 1) for (let x = il; x < ir; x += 1) { const key = drawn.at(x, y).join(","); counts.set(key, (counts.get(key) || 0) + 1); }
    const ground = [...counts].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
    ratio = 1;
    const e = Math.round(k); // the outermost 1 CSS px, in device pixels
    for (let y = it + e; y < ib - e; y += 1) for (let x = il + e; x < ir - e; x += 1) if (changed(x, y)) ratio = Math.max(ratio, ratio8(drawn.at(x, y), ground));
  }
  const off = n ? [x0 - L, y0 - T, x1 - R, y1 - B].map((v) => Math.round(v / k)).join(",") : "";
  return { owns, ratio, got: `${n} px changed${n ? `, off its box by [${off}] CSS px` : ""}, ${ratio.toFixed(2)}:1` };
};
/* Before any ratio is trusted, each clip must be reading ITS element: in normal colours first, then on
   each forced palette, which paints ink the page did not paint before (a forced border, a Highlight
   ring). `painted` asks the same again with each ratio, per theme: a ratio is never read off a clip
   whose changed pixels are not its target's. */
const owned = async () => {
  const problems = [];
  for (const [sel, kind, , pseudo] of PAINTED) {
    const p = await paintOf(sel, kind, pseudo);
    if (!p.owns) problems.push(`${sel} (${kind}): ${p.got} — the ink in this clip is not this ${kind}'s, or not where it is`);
  }
  return problems;
};
const painted = async () => {
  const problems = [];
  for (const [sel, kind, min, pseudo] of PAINTED) {
    const p = await paintOf(sel, kind, pseudo);
    if (!p.owns) problems.push(`${sel} (${kind}): ${p.got} — not its own ink, no ratio read`);
    else if (!(p.ratio >= min)) problems.push(`${sel} (${kind}): the painted ${kind} reaches ${p.ratio.toFixed(2)}:1, wants ${min} (${p.got})`);
  }
  return problems;
};

const FORCED = String.raw`(() => {
  const W = window.__wp7, probe = document.createElement("div");
  probe.style.cssText = "forced-color-adjust: none; background: Canvas";
  document.body.append(probe);
  const canvas = W.parse(getComputedStyle(probe).backgroundColor);
  probe.remove();
  // a colour as it lands on the forced page: composited over Canvas
  const on = (value) => W.over(W.parse(value), canvas);
  const key = (c) => [c.r, c.g, c.b].map((v) => Math.round(v * 255)).join(",");
  return { canvas, on, key, ratio: W.ratio, isColour: (prop) => /color$/.test(prop) };
})()`;
/* Both palettes, because the failure shows on only one of them: a glyph drawn in the page's OWN
   colour is plainly visible on a light forced palette's white Canvas and 1.8:1 on a dark one's
   black — which is what `forced-color-adjust: none` + `currentColor` does in Chromium. So "not
   the Canvas colour" is not enough: a glyph must be drawn in the FORCED colour of the words it
   sits with (its host's, or its parent's for a glyph that is an element), on both palettes. */
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
await evaluate(`document.documentElement.classList.add("anim-off"); null`);
await check("X1 painted: every clip reads its own element (its changed pixels, where the element is), before any forced ratio is trusted", owned);
for (const scheme of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
  await sleep(100);
  await check(`X1 forced colours are really on (${scheme} palette)`, () => evaluate(`matchMedia("(forced-colors: active)").matches ? [] : ["forced-colors did not emulate — the checks below proved nothing"]`));
  await check(`X1 forced colours, ${scheme} palette: every glyph is drawn in the forced colour of its words`, () => evaluate(`(() => {
    const F = ${FORCED};
    return ${JSON.stringify(GLYPHS)}.flatMap(([sel, pseudo, prop]) => {
      const el = document.querySelector(sel), words = pseudo ? el : el.parentElement;
      const got = F.on(getComputedStyle(el, pseudo || null).getPropertyValue(prop)), want = F.on(getComputedStyle(words).color);
      return F.key(got) === F.key(want) ? [] : [sel + pseudo + " " + prop + " " + F.key(got) + " (" + F.ratio(got, F.canvas).toFixed(2) +
        ":1 on Canvas " + F.key(F.canvas) + "), its words " + F.key(want)];
    });
  })()`));
  await check(`X1 forced colours, ${scheme} palette: every state pair still differs on the part that shows it`, () => evaluate(`(() => {
    const F = ${FORCED};
    return ${JSON.stringify(PAIRS)}.flatMap(([a, pa, b, pb, what]) => {
      let va = getComputedStyle(document.querySelector(a)).getPropertyValue(pa), vb = getComputedStyle(document.querySelector(b)).getPropertyValue(pb);
      if (F.isColour(pa)) { va = F.key(F.on(va)); vb = F.key(F.on(vb)); }
      return va === vb ? [what + ": both " + va] : [];
    });
  })()`));
  await check(`X1 forced colours, ${scheme} palette: each clip's changed pixels are its element's, where the element is`, owned);
  // Every theme: a forced palette overrides the glyphs and the words, but a ring under `none` keeps
  // the THEME's --ring, which is dark on warm and paper and light on green and mono.
  for (const theme of THEMES) {
    await setTheme(theme);
    await check(`X1 forced colours, ${scheme} palette, ${theme}, PAINTED: glyphs 3:1, words on a fill 4.5:1, focus rings 3:1 (pixels read back)`, painted);
  }
  await setTheme("warm");
}
await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
await send("Emulation.clearDeviceMetricsOverride");
await send("Emulation.setEmulatedMedia", { features: [] });

/* ── 4. contrast, every new pairing, four themes × three surfaces ────────────────────────────── */
await load();
const TONES = ["primary", "success", "warning", "destructive", "info", "pending", "muted"];
const CATS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "purple", "pink"];
const toneAttr = (t) => (t ? ` data-tone="${t}"` : "");
const catStyle = (c) => ` data-hue="${c}"`;
/* Each sample: markup, and what to measure in it. kind: text ≥ 4.5 · glyph ≥ 3 (non-text graphic,
   WCAG 1.4.11) · ring ≥ 3 (focus indicator) · info (a decorative or text-labelled edge — reported,
   not gated). fg: the property that paints the mark; against: "own" = the element's own
   background over everything under it, "outside" = what surrounds the element. */
const SAMPLES = [
  ...[null, ...TONES].flatMap((t) => [
    { name: `notice label · ${t || "neutral"}`, html: `<div class="notice"${toneAttr(t)}><span class="notice-label" data-m>note:</span><p>x</p></div>`, kind: "text" },
    { name: `notice sentence · ${t || "neutral"}`, html: `<div class="notice"${toneAttr(t)}><span class="notice-label">note:</span><p data-m>x</p></div>`, kind: "text" },
    { name: `notice--lg glyph · ${t || "neutral"}`, html: `<div class="notice notice--lg" data-icon="circle-check"${toneAttr(t)} data-m><p>x</p></div>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
    { name: `notice edge · ${t || "neutral"}`, html: `<div class="notice"${toneAttr(t)} data-m><p>x</p></div>`, kind: "info", fg: "border-top-color", against: "outside" },
  ]),
  { name: "callout body", html: `<aside class="callout"><p class="callout-title">t</p><p data-m>x</p></aside>`, kind: "text" },
  ...[null, ...TONES].flatMap((t) => [
    { name: `callout title · ${t || "default (primary)"}`, html: `<aside class="callout"${toneAttr(t)}><p class="callout-title" data-m>t</p></aside>`, kind: "text" },
    { name: `callout glyph · ${t || "default (primary)"}`, html: `<aside class="callout" data-icon="info"${toneAttr(t)} data-m><p>x</p></aside>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
    { name: `callout rule · ${t || "default (primary)"}`, html: `<aside class="callout"${toneAttr(t)} data-m><p>x</p></aside>`, kind: "info", fg: "border-left-color", against: "outside" },
  ]),
  ...[null, ...TONES].flatMap((t) => [
    { name: `banner text · ${t || "default (destructive)"}`, html: `<div class="banner"${toneAttr(t)}><p data-m>x <a href="#">fix →</a></p></div>`, kind: "text" },
    { name: `banner link ring · ${t || "default (destructive)"}`, html: `<div class="banner"${toneAttr(t)}><p>x <a href="#" data-m>fix →</a></p></div>`, kind: "ring" },
    { name: `banner item rule · ${t || "default (destructive)"}`, html: `<div class="banner"${toneAttr(t)}><ul class="banner-list"><li>a</li><li data-m>b</li></ul></div>`, kind: "info", fg: "border-top-color", against: "outside" },
  ]),
  ...STATES.map((s) => ({ name: `state · ${s}`, html: `<span class="state" data-state="${s}" data-m>${s}</span>`, kind: "text" })),
  { name: "empty text", html: `<div class="empty"><p data-m>no skills yet.</p></div>`, kind: "text" },
  { name: "empty glyph · untoned", html: `<div class="empty" data-icon="folder-open" data-m><p>x</p></div>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "empty glyph · warning (failure)", html: `<div class="empty" data-tone="warning" data-icon="triangle-alert" data-m><p>x</p></div>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "loading text", html: `<p class="loading" data-m><span class="spinner"></span>loading…</p>`, kind: "text" },
  { name: "spinner (in a loading row)", html: `<p class="loading"><span class="spinner" data-m></span>loading…</p>`, kind: "glyph", fg: "background-color", against: "outside" },
  { name: "fence label", html: `<figure class="fence"><figcaption class="fence-label" data-m>untrusted</figcaption><div class="fence-body">x</div></figure>`, kind: "text" },
  { name: "fence end", html: `<figure class="fence"><div class="fence-body">x</div><p class="fence-end" data-m>end</p></figure>`, kind: "text" },
  { name: "fence body", html: `<figure class="fence"><div class="fence-body" data-m>x</div></figure>`, kind: "text" },
  { name: "fence '(empty)'", html: `<figure class="fence"><div class="fence-body" data-m></div></figure>`, kind: "text", pseudo: "::before" },
  { name: "fence frame", html: `<figure class="fence" data-m><div class="fence-body">x</div></figure>`, kind: "glyph", fg: "border-top-color", against: "outside" },
  ...[null, ...TONES].map((t) => ({ name: `dot · ${t || "untoned (text colour)"}`, html: `<span class="dot"${toneAttr(t)} data-m></span>`, kind: "glyph", fg: "background-color", against: "outside" })),
  ...[null, ...TONES].flatMap((t) => [
    { name: `tag · ${t || "untoned"}`, html: `<span class="tag"${toneAttr(t)} data-m>x</span>`, kind: "text" },
    { name: `tag edge · ${t || "untoned"}`, html: `<span class="tag"${toneAttr(t)} data-m>x</span>`, kind: "info", fg: "border-top-color", against: "outside" },
    { name: `tag--solid · ${t || "untoned"}`, html: `<span class="tag tag--solid"${toneAttr(t)} data-m>x</span>`, kind: "text" },
    { name: `tag--icon glyph · ${t || "untoned"}`, html: `<span class="tag tag--icon" data-icon="eye-off"${toneAttr(t)} data-m></span>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
    { name: `button.tag edge at rest · ${t || "untoned"}`, html: `<button type="button" class="tag"${toneAttr(t)} data-m>x</button>`, kind: "info", fg: "border-top-color", against: "outside" },
    { name: `count · ${t || "untoned"}`, html: `<span class="count"${toneAttr(t)} data-m>3</span>`, kind: "text" },
    { name: `count--overlay · ${t || "default (primary)"}`, html: `<span class="count count--overlay" style="position: static"${toneAttr(t)} data-m>3</span>`, kind: "text" },
  ]),
  { name: "tag--off", html: `<span class="tag tag--off" data-tone="success" data-m>x</span>`, kind: "text" },
  { name: "button.tag focus ring", html: `<button type="button" class="tag" data-m>x</button>`, kind: "ring" },
  ...CATS.flatMap((c) => [
    { name: `tag · cat-${c}`, html: `<span class="tag"${catStyle(c)} data-m>x</span>`, kind: "text" },
    { name: `tag--solid · cat-${c}`, html: `<span class="tag tag--solid"${catStyle(c)} data-m>x</span>`, kind: "text" },
  ]),
];
const SURFACES = ["background", "card", "muted"];
const MIN = { text: 4.5, glyph: 3, ring: 3 };
const table = new Map(); // name → { kind, theme → [bg, card, muted] }
for (const theme of THEMES) {
  await setTheme(theme);
  const results = await evaluate(`(() => {
    const W = window.__wp7, out = [];
    const host = document.createElement("div");
    document.body.append(host);
    for (const surface of ${JSON.stringify(SURFACES)}) {
      for (const s of ${JSON.stringify(SAMPLES)}) {
        host.innerHTML = '<div data-surface="' + surface + '" style="padding: 8px; background: var(--' + surface + '); color: var(--foreground)">' + s.html + "</div>";
        const el = host.querySelector("[data-m]");
        const cs = getComputedStyle(el, s.pseudo || null);
        let fg, bg;
        if (s.kind === "ring") { fg = W.parse(W.tok("--ring")); bg = W.behind(el.parentElement); }
        else if (s.against === "outside") {
          const under = W.behind(el.parentElement);
          fg = W.over(W.parse(cs.getPropertyValue(s.fg)), W.over(W.parse(getComputedStyle(el).backgroundColor), under));
          bg = under;
        } else { fg = W.parse(cs.getPropertyValue(s.fg || "color")); bg = W.behind(el); fg = W.over(fg, bg); }
        out.push([s.name, s.kind, surface, W.ratio(fg, bg)]);
      }
    }
    host.remove();
    return out;
  })()`);
  for (const [name, kind, surface, value] of results) {
    if (!table.has(name)) table.set(name, { kind });
    const row = table.get(name);
    (row[theme] ||= [])[SURFACES.indexOf(surface)] = value;
  }
}
const low = [];
for (const [name, row] of table) {
  if (!MIN[row.kind]) continue;
  for (const theme of THEMES) row[theme].forEach((value, i) => {
    if (value < MIN[row.kind]) low.push(`${name} on ${theme}/${SURFACES[i]}: ${value.toFixed(3)} < ${MIN[row.kind]}`);
  });
}
console.log("\ncontrast — each cell is --background / --card / --muted");
console.log("| pairing | kind | warm | green | mono | paper |\n|---|---|---|---|---|---|");
for (const [name, row] of table) {
  console.log(`| ${name} | ${row.kind} | ${THEMES.map((t) => row[t].map((v) => v.toFixed(2)).join(" / ")).join(" | ")} |`);
}
console.log("");
await check(`every text pairing clears 4.5:1 and every glyph and ring 3:1, on 4 themes × 3 surfaces (${table.size} pairings)`, () => low);

console.log(failures
  ? `\ncheck-feedback: ${failures} FAILED (last check to pass: ${lastPassed})`
  : "\ncheck-feedback: all checks passed");
process.exit(failures ? 1 : 0);
