#!/usr/bin/env node
/*
 * check-cards.mjs — cards.css (0.60.0: K2–K12), measured in a real browser.
 *
 * FIVE QUESTIONS, and a stylesheet can pass any one of them while failing another:
 *   1. Does every element compute what the spec says, in every state, on all four themes? Asserted
 *      from COMPUTED style against the same declaration resolved by the browser on a probe element,
 *      so "12% of --primary" is compared as the browser computes it on each theme, not as a hex
 *      somebody worked out once and pasted in. Layout promises (the foot on the floor, the pane that
 *      takes the room, the stretched link that takes the click) are measured as geometry.
 *   2. Is every new pairing legible? WCAG contrast of each text, glyph, edge and ring on four themes
 *      and the three surfaces a component can land on (--background, --card, --muted), composited
 *      through every translucent layer and every opacity between the mark and the surface. Printed
 *      as a table; text under 4.5:1, or a glyph or ring under 3:1, FAILS. An `info` row is a
 *      divider or a decorative edge, reported and not gated.
 *   3. Does the file stand alone? The demo page is rendered twice — with reset, base, components and
 *      chrome, and with `?bare` (tokens.css + cards.css) — and 58 listed properties of every fixture
 *      this file styles must agree between the two, font-family and font-size among them (X2); an
 *      element's size is its rendered box, since computed width and height follow the page's
 *      box-sizing reset. The focus rings are asserted ONLY in ?bare, where no global
 *      :focus-visible rule exists to supply a ring the component forgot (X2).
 *   4. Does `hidden` hide every component? With tokens.css loaded, whatever display the class sets
 *      (X3). Until this branch carries WP1's rule the demo supplies it as a marked stand-in.
 *   5. Do the states survive forced colours (X1)? Read from PIXELS, on four themes × both palettes and
 *      again as an engine without preserve-parent-color sees the file: every glyph and line this file
 *      draws reaches 3:1 on what it sits on, a chosen row sits on Highlight where its neighbour does
 *      not, the words on both reach 4.5:1, and a focused row's ring 3:1 on its own fill. Every clip
 *      is proved to hold its element's ink: hidden, the mark takes its ink with it.
 *
 * WHAT IT READS. examples/cards.html is the environment: its stylesheets, and stand-ins for the
 * tokens and classes other packages of 0.60.0 own. Those switch themselves off once the real ones
 * exist, and this prints which were in force — a green run says what it measured. With
 * DD_NO_STANDINS=1 any stand-in still in force is a FAILURE: the integrated tree must not be
 * measuring copies. The fixtures are injected here, so the assertions do not depend on the demo's
 * prose.
 *
 * A real browser and no dependency, like check-tabletools.mjs: the headless chromium Playwright
 * caches on these machines, over the DevTools protocol with Node's own fetch and WebSocket. No
 * browser → it SKIPS loudly, and DD_REQUIRE_BROWSER=1 makes that a failure. The browser picks its
 * own DevTools port and the page is served from an ephemeral port, so this can run beside the other
 * checks without colliding.
 *
 *   node scripts/check-cards.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, extname, sep } from "node:path";
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
  console.log("check-cards: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts computed styles, layout and composited contrast, which only a browser can");
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
const BASE = `http://127.0.0.1:${server.address().port}/examples/cards.html`;

/* ── the browser ─────────────────────────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), "dd-cards-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=1280,900", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
// The throwaway profile goes too: one per run, and a release gate runs this often.
const shutdown = () => {
  try { socket?.close(); } catch {}
  chrome.kill("SIGKILL");
  server.close();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) { console.log(`note: could not remove the browser profile ${profile}: ${error.message}`); }
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
await send("DOM.enable");
await send("CSS.enable");

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
// Whatever still escapes a check (a throw between checks) is a located FAIL, never a bare stack.
process.on("uncaughtException", (error) => {
  console.log(`FAIL  the suite itself threw after "${lastPassed}": ${error.stack || error}`);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  console.log(`FAIL  the suite itself threw after "${lastPassed}": ${error?.stack || error}`);
  process.exit(1);
});

/* ── in the page: colour maths, "does this element compute what this declaration would" ──────── */
const HELPERS = String.raw`
window.__wp8 = (() => {
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
  // How much of a mark reaches the screen: every opacity from the surface down to the element, and the
  // pseudo-element's own. A colour read without it measures a glyph at full strength that is drawn at
  // 60% — the spec's first tree chevron was exactly that, and passed a colour-only reading.
  const alpha = (el, pseudo) => {
    let a = pseudo ? Number(getComputedStyle(el, pseudo).opacity) : 1;
    for (let n = el; n; n = n.parentElement) { a *= Number(getComputedStyle(n).opacity); if (n.dataset && n.dataset.surface) break; }
    return a;
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
  const q = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error(sel + ": no such element"); return el; };
  const box = (sel) => q(sel).getBoundingClientRect();
  return {
    parse, over, ratio, behind, alpha, q, box,
    tok: (name) => probe(document.body, "color", "var(" + name + ")"),
    sys: (name) => probe(document.body, "color", name),
    // [sel, pseudo, prop, expr | {is}] → a problem string, or null when it matches
    expect(sel, pseudo, prop, want) {
      const el = document.querySelector(sel);
      if (!el) return sel + ": no such element";
      const got = getComputedStyle(el, pseudo || null).getPropertyValue(prop).trim();
      const exp = typeof want === "object" ? want.is : probe(el, prop, want).trim();
      return got === exp ? null : sel + (pseudo || "") + " " + prop + ": got '" + got + "', want '" + exp + "'" +
        (typeof want === "object" ? "" : " (" + want + ")");
    },
    // A box in DOCUMENT coordinates for a screenshot clip, brought into view first (a clip below the
    // fold captures nothing), instantly (base.css scrolls smoothly). lead: only the row's ::before,
    // the first thing in it — a chevron clip must not also hold the row's .ico or its words, which
    // would pass for a chevron that is not there.
    // inset: CSS pixels kept off every edge. A box's edge lands between device pixels, so a clip cut
    // exactly on it takes in a sliver of whatever is outside — Canvas round a Highlight row, a pane's
    // CanvasText edge beside a splitter's line — and that sliver would pass a mark that is not drawn.
    // lead: the row's ::before box alone (first in the row, centred on its cross axis), so a chevron
    // clip holds neither the row's .ico nor its words.
    shot(sel, lead, inset = 0) {
      const el = q(sel);
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      let b = { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
      if (lead) {
        const pseudo = getComputedStyle(el, "::before"), w = parseFloat(pseudo.width), h = parseFloat(pseudo.height);
        b = { x: b.x + parseFloat(getComputedStyle(el).paddingLeft), y: b.y + (r.height - h) / 2, w, h };
      }
      return { x: b.x + inset, y: b.y + inset, w: b.w - 2 * inset, h: b.h - 2 * inset };
    },
    // A SCREENSHOT of that box, decoded by the page itself (no image library): the colour most of it
    // is (what the mark sits on), the strongest contrast any pixel reaches against it, that pixel's
    // colour, and how many pixels reach 3:1. Forced colours are judged from this and not from computed
    // style (X1): a glyph left in the AUTHOR's colour computes "not Canvas" and cannot be seen.
    async ink(png) {
      const img = new Image();
      img.src = "data:image/png;base64," + png;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, seen = new Map();
      for (let i = 0; i < d.length; i += 4) { const k = d[i] + ", " + d[i + 1] + ", " + d[i + 2]; seen.set(k, (seen.get(k) || 0) + 1); }
      const rgb = (k) => { const [r, g, b] = k.split(", ").map(Number); return { r: r / 255, g: g / 255, b: b / 255, a: 1 }; };
      const bg = [...seen].sort((a, b) => b[1] - a[1])[0][0];
      let strongest = 1, mark = bg, n = 0;
      for (const [k, m] of seen) {
        const v = ratio(rgb(k), rgb(bg));
        if (v > strongest) { strongest = v; mark = k; }
        if (v >= 3) n += m;
      }
      return { bg: "rgb(" + bg + ")", mark: "rgb(" + mark + ")", strongest, n };
    },
    // A strip along an element's start edge, just inside it: where its inset focus ring is drawn.
    // Half a pixel in, so a clip that begins between device pixels takes nothing from outside.
    // outside: the strip just OUTSIDE the start edge instead, for a ring drawn at a positive offset.
    edge(sel, outside) {
      const el = q(sel);
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      if (outside) return { x: r.x + scrollX - 8, y: r.y + scrollY + 1, w: 7.5, h: r.height - 2 };
      return { x: r.x + scrollX + 0.5, y: r.y + scrollY + 4, w: 5.5, h: r.height - 8 };
    },
    near: (a, b, label, tol = 0.6) => (Math.abs(a - b) <= tol ? null : label + ": " + a.toFixed(2) + " vs " + b.toFixed(2)),
    // Every listed computed property of every fixture this file styles, for the full-vs-bare
    // comparison. Another package's class (.btn-icon, .ico, .tag, .count, .dot, .value-filter,
    // .disclosure-btn) is skipped: once those land, the full stack draws the real class and ?bare the
    // page's stand-in. A .card-terminal is K1's box (components.css); on one, only the properties
    // this file sets on a card are compared.
    snapshot(ids, props, cardProps, mine) {
      const out = {};
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el.matches(mine) || el.matches(".btn-icon, .ico, .tag, .count, .dot, .value-filter, .disclosure-btn")) continue;
        const list = el.classList.contains("card-terminal") ? cardProps : props;
        for (const pseudo of ["", "::before", "::after"]) {
          const cs = getComputedStyle(el, pseudo || null);
          if (pseudo && cs.content === "none") continue;
          for (const prop of list) {
            if (/^border-(top|right|bottom|left)-(color|style)$/.test(prop) && cs.getPropertyValue(prop.replace(/(color|style)$/, "width")) === "0px") continue;
            if (/^outline-/.test(prop) && cs.outlineStyle === "none") continue;
            // An element's SIZE is its rendered box: computed width and height follow box-sizing, which
            // the page's reset decides, and the same box reads as two widths across the two modes.
            if ((prop === "width" || prop === "height") && !pseudo) {
              out[id + " box-" + prop] = el.getBoundingClientRect()[prop].toFixed(2);
              continue;
            }
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
      if (await evaluate("document.readyState === 'complete' && document.getElementById('standins').textContent !== ''")) break;
    } catch {}
    if (i > 100) throw new Error("the demo page never finished loading " + query);
  }
  await evaluate(HELPERS);
};
// A theme switch is a colour change and a stat tile transitions its edge: read after it settles, or
// the computed value is an interpolation rather than the theme's colour.
const setTheme = async (theme) => {
  await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; null`);
  await sleep(250);
};
const W = (expr) => evaluate(`(() => { const W = window.__wp8; return ${expr}; })()`);

/* ── fixtures ─────────────────────────────────────────────────────────────────────────────────── */
const LONG = "Reviews the current diff against the conventions of the repository, its tests and the house rules, and says which of them the change breaks and why that matters to the next reader of the code, at some length.";
const FIXTURE = `
<div id="fx" data-surface="background" style="position: relative; padding: 8px; background: var(--background); color: var(--foreground)">
  <ul class="card-grid" id="fx-grid" style="--card-min: 12rem; width: 640px">
    <li class="card-terminal card-terminal--link" id="fx-card">
      <div class="card-head" id="fx-card-head"><button type="button" class="value-filter" id="fx-card-filter" aria-label="filter by source: official"><span class="tag">official</span></button><button type="button" class="btn-icon btn-icon--sm" id="fx-card-star" data-icon="star" aria-label="favourite review"></button></div>
      <h3 class="card-title" id="fx-card-title"><a class="card-link" id="fx-card-link" href="#fx">review</a></h3>
      <p class="card-desc" id="fx-card-desc">${LONG} ${LONG}</p>
      <footer class="card-foot" id="fx-card-foot"><span>12</span><time datetime="2026-09-25">3 days ago</time></footer>
    </li>
    <li class="card-terminal card-terminal--link" id="fx-card-short"><h3 class="card-title"><a class="card-link" href="#fx">short</a></h3><footer class="card-foot" id="fx-card-short-foot">foot</footer></li>
    <li class="card-terminal card-terminal--link" id="fx-card-tone" data-tone="success"><h3 class="card-title" id="fx-card-tone-title"><a class="card-link" href="#fx">toned</a></h3><p class="card-desc" id="fx-card-tone-desc">d</p></li>
    <li class="card-terminal card-terminal--link card-terminal--rule" id="fx-card-rule" style="--rule-color: var(--cat-teal)"><h3 class="card-title"><a class="card-link" href="#fx">rule</a></h3></li>
    <li class="card-terminal card-terminal--rule" id="fx-card-rule-default"><h3 class="card-title">rule, default colour</h3></li>
    <li class="card-terminal card-terminal--link card-terminal--rule" id="fx-card-rule-tone" data-tone="destructive" style="--rule-color: var(--cat-violet)"><h3 class="card-title"><a class="card-link" href="#fx">rule and tone</a></h3></li>
    <li class="card-terminal" id="fx-card-static"><h3 class="card-title">static</h3></li>
    <li class="card-terminal card-terminal--flash" id="fx-card-flash" data-tone="success"><h3 class="card-title">flash</h3></li>
  </ul>
  <div data-tone="warning"><article class="card-terminal card-terminal--flash" id="fx-card-flash-leak"><h3 class="card-title">untoned flash in a toned box</h3></article></div>
  <div style="width: 20rem"><article class="card-terminal" id="fx-card-lone"><h3 class="card-title">lone</h3><p class="card-desc">desc</p></article></div>
  <div style="width: 20rem"><article class="card-terminal" id="fx-card-p-title"><p class="card-title" id="fx-title-on-p">a title on a p</p></article></div>
  <div style="width: 20rem"><div class="card-terminal" id="fx-card-orphan" style="position: relative"><h3 class="card-title"><a class="card-link" id="fx-card-orphan-link" href="#fx">no --link on the card</a></h3><p class="card-desc" id="fx-card-orphan-text">text</p></div></div>
  <ul class="card-grid" id="fx-grid-narrow" style="--card-min: 12rem; width: 150px"><li class="card-terminal">a</li></ul>
  <section class="panel" id="fx-panel-stack-1"><div class="panel-body">1</div></section>
  <section class="panel" id="fx-panel-stack-2"><div class="panel-body">2</div></section>

  <div class="stat-grid" id="fx-stat-grid" style="width: 720px">
    <a class="stat-tile" id="fx-tile" href="#fx"><span class="stat-label" id="fx-tile-label">review</span><span class="stat-value" id="fx-tile-value">0</span><span class="stat-note" id="fx-tile-note">nothing queued</span><span class="stat-cta" id="fx-tile-cta">open →</span></a>
    <a class="stat-tile" data-state="idle" id="fx-tile-idle" href="#fx"><span class="stat-label">idle</span><span class="stat-value" id="fx-tile-idle-value">0</span></a>
    <a class="stat-tile" data-state="action" id="fx-tile-action" href="#fx"><span class="stat-label" id="fx-tile-action-label">approvals</span><span class="stat-value" id="fx-tile-action-value">3</span><span class="stat-note" id="fx-tile-action-note">waiting</span><span class="stat-cta" id="fx-tile-action-cta">review →</span></a>
    <a class="stat-tile" data-state="broken" id="fx-tile-broken" href="#fx"><span class="stat-label">runners</span><span class="stat-value" id="fx-tile-broken-value">1 down</span></a>
    <a class="stat-tile" data-state="unknown" id="fx-tile-unknown" href="#fx"><span class="stat-label">executions</span><span class="stat-value" id="fx-tile-unknown-value">—</span></a>
    <div class="stat-tile" data-tone="info" id="fx-tile-tone"><span class="stat-label" id="fx-tile-tone-label">in flight</span><span class="stat-value">2</span></div>
    <div data-tone="warning"><div class="stat-tile" id="fx-tile-leak"><span class="stat-label" id="fx-tile-leak-label">no leak</span></div></div>
    <div class="stat-tile" id="fx-tile-div"><span class="stat-label">skills</span><span class="stat-value">128</span><a class="stat-cta" id="fx-tile-cta-link" href="#fx">browse →</a></div>
  </div>

  <section class="panel" id="fx-panel" style="block-size: 10rem; width: 30rem" aria-labelledby="fx-panel-title">
    <header class="panel-head" id="fx-panel-head"><span class="ico" id="fx-panel-ico" data-icon="folder-tree" aria-hidden="true"></span><h3 class="panel-title" id="fx-panel-title">a panel title long enough to be cut off before the actions at the end of the head</h3><div class="panel-actions" id="fx-panel-actions"><button type="button" class="btn-icon btn-icon--bare btn-icon--sm" data-icon="chevrons-up-down" aria-label="expand all folders"></button></div></header>
    <div class="panel-body" id="fx-panel-body"><p style="margin: 0; height: 20rem">tall</p></div>
    <footer class="panel-foot" id="fx-panel-foot"><span>12 files</span></footer>
  </section>
  <section class="panel" id="fx-panel-2"><header class="panel-head panel-head--eyebrow" id="fx-panel-eyebrow-head"><h3 class="panel-title" id="fx-panel-eyebrow">explorer</h3></header><div class="panel-body panel-body--flush" id="fx-panel-flush">x</div></section>
  <section class="panel" id="fx-panel-collapsed"><header class="panel-head" id="fx-panel-collapsed-head"><button type="button" class="disclosure-btn" aria-expanded="false" aria-controls="fx-panel-collapsed-body" aria-label="expand dd/infra"></button><h3 class="panel-title">collapsed</h3></header><div class="panel-body" id="fx-panel-collapsed-body" hidden>b</div></section>
  <section class="panel" id="fx-panel-lone"><header class="panel-head" id="fx-panel-lone-head"><h3 class="panel-title">a lone head</h3></header></section>
  <article class="panel panel--mark" id="fx-panel-mark" style="width: 30rem"><div class="panel-mark" id="fx-panel-mark-rail" aria-hidden="true">CX</div><div class="panel-main" id="fx-panel-main"><header class="panel-head"><h3 class="panel-title">codex</h3></header><div class="panel-body">b</div></div></article>

  <div style="width: 40rem"><div class="card-terminal card-terminal--flush" id="fx-rows-card">
    <ul class="row-list" id="fx-rows">
      <li id="fx-rows-li1"><a class="list-row" id="fx-row" href="#fx"><time class="list-row-lead" id="fx-row-lead" datetime="2026-09-25">2026-09-25</time><span class="list-row-title" id="fx-row-title">${LONG}</span><span class="list-row-meta" id="fx-row-meta">meta</span></a></li>
      <li id="fx-rows-li2"><a class="list-row" id="fx-row-2" href="#fx"><span class="list-row-title">t</span><span class="list-row-desc" id="fx-row-desc">${LONG} ${LONG}</span></a></li>
      <li><a class="list-row" id="fx-row-aria-disabled" href="#fx" aria-disabled="true"><span class="list-row-title" id="fx-row-aria-disabled-title">off</span></a></li>
    </ul>
  </div></div>
  <ul class="row-list row-list--ruled row-list--loose" id="fx-rows-ruled" style="--row-lead-w: 10.5rem; width: 40rem"><li><a class="list-row" id="fx-row-loose" href="#fx"><time class="list-row-lead" id="fx-row-lead-w">mon</time><span class="list-row-title">t</span></a></li></ul>
  <ul class="row-list row-list--select" id="fx-select" style="width: 30rem">
    <li><button type="button" class="list-row" id="fx-sel"><span class="list-row-lead" id="fx-sel-lead">1</span><span class="list-row-title" id="fx-sel-title">a</span><span class="list-row-meta" id="fx-sel-meta">rw-</span></button></li>
    <li><button type="button" class="list-row" id="fx-sel-current" aria-current="true"><span class="list-row-lead" id="fx-sel-current-lead">2</span><span class="list-row-title" id="fx-sel-current-title">b</span><span class="list-row-meta" id="fx-sel-current-meta">rw-</span><span class="list-row-desc" id="fx-sel-current-desc">d</span></button></li>
    <li><button type="button" class="list-row" id="fx-sel-false" aria-current="false"><span class="list-row-title" id="fx-sel-false-title">c</span></button></li>
    <li><button type="button" class="list-row" id="fx-sel-selected" aria-selected="true"><span class="list-row-title" id="fx-sel-selected-title">d</span></button></li>
    <li><button type="button" class="list-row" id="fx-sel-disabled" disabled><span class="list-row-title">e</span></button></li>
  </ul>

  <ol class="entry-list entry-list--ruled" id="fx-entries" style="width: 50rem">
    <li class="entry" id="fx-entry"><time class="entry-lead" id="fx-entry-lead" datetime="2026-09-25">2026-09-25</time><div id="fx-entry-body"><h2 class="entry-title" id="fx-entry-title"><a class="card-link" id="fx-entry-link" href="#fx">title</a></h2><p class="entry-desc" id="fx-entry-desc">d</p><p style="margin: 0"><button type="button" class="value-filter" id="fx-entry-filter" aria-label="filter by tag: agents">#agents</button></p></div></li>
    <li class="entry entry--wide" id="fx-entry-wide"><span class="entry-lead">x</span><div><p class="entry-title" id="fx-entry-title-p">p title</p></div></li>
  </ol>
  <ol class="entry-list" id="fx-entries-plain" style="width: 50rem"><li class="entry entry--narrow" id="fx-entry-narrow"><span class="entry-lead entry-lead--accent" id="fx-entry-accent">2026</span><p class="entry-title">x</p></li><li class="entry entry--narrow entry--keep" id="fx-entry-keep"><span class="entry-lead">2021</span><p class="entry-title">y</p></li></ol>

  <div style="width: 50rem"><article class="card-terminal manpage" id="fx-man">
    <p class="manpage-frame" id="fx-man-top"><span id="fx-man-top-1">A(1)</span><span id="fx-man-top-2">middle</span><span id="fx-man-top-3">end</span></p>
    <h2 class="manpage-sect" id="fx-man-sect1">NAME</h2>
    <div class="manpage-body" id="fx-man-body"><p id="fx-man-p1">a</p><p id="fx-man-p2">b</p></div>
    <h2 class="manpage-sect" id="fx-man-sect2">SYNOPSIS</h2>
    <div class="manpage-body"><p>c</p></div>
    <p class="manpage-frame" id="fx-man-bottom"><span>x</span><span>y</span><span>z</span></p>
  </article></div>

  <ul class="tree" role="tree" aria-label="files" id="fx-tree" style="width: 14rem">
    <li role="treeitem" aria-level="1" aria-expanded="true" tabindex="0" id="fx-tree-branch"><span class="tree-row" id="fx-tree-branch-row"><span class="ico" data-icon="folder-open" id="fx-tree-branch-ico" aria-hidden="true"></span><span class="tree-label">src</span></span>
      <ul role="group" id="fx-tree-group">
        <li role="treeitem" aria-level="2" aria-selected="true" tabindex="-1" id="fx-tree-selected"><span class="tree-row" id="fx-tree-selected-row"><span class="ico" data-icon="file-code" id="fx-tree-selected-ico" aria-hidden="true"></span><span class="tree-label" id="fx-tree-selected-label">app.ts</span><span class="tree-meta" id="fx-tree-selected-meta"><button type="button" class="btn-icon btn-icon--bare btn-icon--sm" data-icon="star" id="fx-tree-selected-action" aria-label="favourite app.ts"></button>3</span></span></li>
        <li role="treeitem" aria-level="2" aria-expanded="false" tabindex="-1" id="fx-tree-closed"><span class="tree-row" id="fx-tree-closed-row"><span class="ico" data-icon="folder" aria-hidden="true"></span><span class="tree-label">lib</span></span></li>
        <li role="treeitem" aria-level="2" tabindex="-1" id="fx-tree-leaf"><span class="tree-row" id="fx-tree-leaf-row"><span class="ico" data-icon="file" id="fx-tree-leaf-ico" aria-hidden="true"></span><span class="tree-label" id="fx-tree-long">a-file-name-long-enough-to-truncate-in-a-narrow-tree.md</span><span class="tree-meta" id="fx-tree-meta">m</span></span></li>
        <li role="treeitem" aria-level="2" aria-disabled="true" tabindex="-1" id="fx-tree-disabled"><span class="tree-row" id="fx-tree-disabled-row"><span class="tree-label">off</span></span></li>
      </ul>
    </li>
  </ul>
  <ul class="tree" role="tree" aria-label="chosen" id="fx-tree-chosen" style="width: 14rem"><li role="treeitem" aria-level="1" aria-expanded="false" aria-selected="true" tabindex="-1" id="fx-tree-selbranch"><span class="tree-row" id="fx-tree-selbranch-row"><span class="tree-label">docs</span></span></li></ul>
  <ul class="tree" role="tree" aria-label="settings" id="fx-navtree"><li role="treeitem" aria-expanded="true"><a class="tree-row" href="#fx" id="fx-navtree-parent"><span class="tree-label">agents</span></a><ul role="group"><li role="treeitem"><a class="tree-row" href="#fx" aria-current="page" id="fx-navtree-current"><span class="tree-label">codex</span></a></li></ul></li></ul>

  <div class="split" id="fx-split" style="--split-size: 12rem; width: 640px; height: 8rem">
    <section class="panel split-pane" id="fx-pane-a"><div class="panel-body">a</div></section>
    <div class="splitter" role="separator" tabindex="0" aria-orientation="vertical" aria-label="resize a" aria-valuenow="192" aria-valuemin="100" aria-valuemax="400" id="fx-vsplit"></div>
    <section class="panel split-pane" id="fx-pane-b"><div class="panel-body">b</div></section>
  </div>
  <div class="splitter" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="resize the split" aria-valuenow="128" aria-valuemin="100" aria-valuemax="400" id="fx-hsplit" style="width: 640px"></div>
  <div class="split" id="fx-split-fixed" style="--split-size: 10rem; width: 480px"><div class="split-pane" id="fx-fixed-a">a</div><div class="split-pane" id="fx-fixed-b">b</div></div>
  <div class="split" id="fx-split-left" style="width: 480px"><button type="button" class="pane-collapsed" id="fx-collapsed" aria-label="show files"><span class="ico" data-icon="panel-left-open" aria-hidden="true"></span><span id="fx-collapsed-label" aria-hidden="true">files</span></button><div class="split-pane" id="fx-left-rest">rest</div></div>
  <div class="split" id="fx-split-right" style="width: 480px; --split-size: 10rem"><div class="split-pane" id="fx-right-rest">rest</div><button type="button" class="pane-collapsed pane-collapsed--end" id="fx-collapsed-end" aria-label="show preview"><span class="ico" data-icon="panel-left-open" aria-hidden="true"></span><span aria-hidden="true">preview</span></button></div>
  <div class="split" id="fx-split-kept" style="width: 480px; --split-size: 10rem"><div class="split-pane" id="fx-kept-rest">rest</div><div class="splitter" role="separator" tabindex="0" aria-orientation="vertical" aria-label="resize kept" hidden></div><div class="split-pane" hidden>kept</div><button type="button" class="pane-collapsed pane-collapsed--end" aria-label="show kept"><span aria-hidden="true">kept</span></button></div>
  <button type="button" class="pane-collapsed" id="fx-collapsed-disabled" disabled aria-label="show nothing"><span aria-hidden="true">x</span></button>
  <button type="button" class="list-row" id="fx-focus-probe" style="display: none">never shown</button>

  <div class="card-terminal" id="fx-clamp-card"><div class="clamp" id="fx-clamp" data-clamped style="--clamp-h: 4rem"><p style="margin: 0; height: 10rem">tall</p></div></div>
  <div class="clamp" id="fx-clamp-page" data-clamped><p style="margin: 0; height: 20rem">tall</p></div>
  <div class="clamp" id="fx-clamp-open"><p style="margin: 0; height: 10rem">tall</p></div>
  <section class="panel"><div class="panel-body"><div class="clamp" id="fx-clamp-panel" data-clamped style="--clamp-h: 2rem"><p style="margin: 0; height: 5rem">x</p></div></div></section>

  <section class="console" id="fx-console" style="--console-h: 14rem; width: 30rem" aria-labelledby="fx-console-title"><header class="console-bar" id="fx-console-bar"><span class="console-dots" id="fx-console-dots" aria-hidden="true"></span><h3 class="console-title" id="fx-console-title">agent output</h3><p class="console-status" id="fx-console-status" role="status"><span class="dot" data-tone="success" aria-hidden="true"></span>live</p></header><div class="console-body" tabindex="0" id="fx-console-body" aria-labelledby="fx-console-title"><div id="fx-console-line">line 1</div><div class="console-line--current" id="fx-console-current">line <mark>2</mark></div></div></section>
  <div style="height: 20rem" id="fx-console-host"><section class="console console--fill" id="fx-console-fill"><div class="console-body" id="fx-console-fill-body">x</div></section></div>
</div>`;
const inject = () => evaluate(`document.querySelector("main").insertAdjacentHTML("afterbegin", ${JSON.stringify(FIXTURE)}); null`);

/* ── 1. what each element computes ───────────────────────────────────────────────────────────── */
const mix = (token, pct, base = "transparent") => `color-mix(in srgb, var(${token}) ${pct}%, ${base})`;
// Widths are literal: a probe with no border-style computes every border width to 0px.
const edge = (sel, side, width, style, color) => [
  [sel, "", `border-${side}-width`, { is: width }], [sel, "", `border-${side}-style`, { is: style }], [sel, "", `border-${side}-color`, color],
];
const ring = (sel, offset) => [
  [sel, "", "outline-style", { is: "solid" }], [sel, "", "outline-width", { is: "2px" }],
  [sel, "", "outline-color", "var(--ring)"], [sel, "", "outline-offset", { is: offset }],
];
const EYEBROW = (sel, colour) => [
  [sel, "", "margin-top", { is: "0px" }], [sel, "", "font-size", "var(--fs-base)"], [sel, "", "font-weight", { is: "500" }],
  [sel, "", "letter-spacing", "0.05em"], [sel, "", "text-transform", { is: "uppercase" }], [sel, "", "color", colour],
];
const CURRENT = (row, title) => [
  [row, "", "background-color", mix("--primary", 12)], [row, "", "box-shadow", "inset 3px 0 0 0 var(--primary)"],
  [title, "", "color", "var(--primary)"], [title, "", "font-weight", { is: "700" }], [title, "", "text-shadow", "0 0 8px var(--glow)"],
];

const EXPECT = [
  ["K2 card anatomy — head, title (500, body size), description (3-line clamp), foot", [
    ["#fx-card-head", "", "display", { is: "flex" }], ["#fx-card-head", "", "flex-wrap", { is: "wrap" }],
    ["#fx-card-head", "", "align-items", { is: "flex-start" }], ["#fx-card-head", "", "justify-content", { is: "space-between" }],
    ["#fx-card-head", "", "row-gap", "0.5rem"], ["#fx-card-head", "", "column-gap", "0.5rem"],
    ["#fx-card-title", "", "margin-top", { is: "0px" }], ["#fx-card-title", "", "margin-bottom", { is: "0px" }],
    ["#fx-card-title", "", "font-size", "var(--fs-base)"], ["#fx-card-title", "", "font-weight", { is: "500" }], ["#fx-card-title", "", "color", "var(--foreground)"],
    ["#fx-card-desc", "", "margin-top", { is: "0px" }], ["#fx-card-desc", "", "color", "var(--muted-foreground)"],
    ["#fx-card-desc", "", "-webkit-line-clamp", { is: "3" }], ["#fx-card-desc", "", "-webkit-box-orient", { is: "vertical" }],
    ["#fx-card-desc", "", "overflow-y", { is: "hidden" }],
    ["#fx-card-foot", "", "display", { is: "flex" }], ["#fx-card-foot", "", "flex-wrap", { is: "wrap" }], ["#fx-card-foot", "", "align-items", { is: "center" }],
    ["#fx-card-foot", "", "row-gap", "0.5rem"], ["#fx-card-foot", "", "column-gap", "1rem"], ["#fx-card-foot", "", "color", "var(--muted-foreground)"],
  ]],
  ["K2 the stretched link — the title's ::after covers a --link card; other controls are raised above it", [
    ["#fx-card", "", "position", { is: "relative" }], ["#fx-card-link", "", "color", "var(--foreground)"],
    ["#fx-card-link", "", "text-decoration-line", { is: "none" }], ["#fx-card-link", "::after", "content", { is: '""' }],
    ["#fx-card-link", "::after", "position", { is: "absolute" }], ["#fx-card-link", "::after", "top", { is: "0px" }],
    ["#fx-card-link", "::after", "left", { is: "0px" }], ["#fx-card-link", "::after", "right", { is: "0px" }], ["#fx-card-link", "::after", "bottom", { is: "0px" }],
    ["#fx-card-filter", "", "position", { is: "relative" }], ["#fx-card-filter", "", "z-index", { is: "1" }],
    ["#fx-card-star", "", "position", { is: "relative" }], ["#fx-card-star", "", "z-index", { is: "1" }],
    ["#fx-card-orphan-link", "::after", "content", { is: "none" }],
  ]],
  ["K2 modifiers — tone (half edge, 4% tint), rule (4px type edge, default --primary), flash; an untoned card resets --tone", [
    ["#fx-card-tone", "", "border-top-color", mix("--success", 50, "var(--border)")], ["#fx-card-tone", "", "background-color", mix("--success", 4, "var(--card)")],
    ...edge("#fx-card-rule", "left", "4px", "solid", "var(--cat-teal)"),
    ["#fx-card-rule-default", "", "border-left-color", "var(--primary)"], ["#fx-card-rule-default", "", "border-left-width", { is: "4px" }],
    ["#fx-card-rule-tone", "", "border-left-color", "var(--cat-violet)"], ["#fx-card-rule-tone", "", "border-top-color", mix("--destructive", 50, "var(--border)")],
    ["#fx-card-flash", "", "animation-name", { is: "dd-flash" }], ["#fx-card-flash", "", "animation-duration", { is: "0.5s" }],
    ["#fx-card-flash-leak", "", "--tone", { is: "" }],
  ]],
  ["K2/K3 in a grid a card is a flex column; a lone card built from the parts stacks the same way", [
    ["#fx-card", "", "display", { is: "flex" }], ["#fx-card", "", "flex-direction", { is: "column" }], ["#fx-card", "", "row-gap", "0.5rem"],
    ["#fx-card-lone", "", "display", { is: "flex" }], ["#fx-card-lone", "", "flex-direction", { is: "column" }],
    ["#fx-grid", "", "display", { is: "grid" }], ["#fx-grid", "", "row-gap", "1rem"], ["#fx-grid", "", "column-gap", "1rem"],
    ["#fx-grid", "", "list-style-type", { is: "none" }], ["#fx-grid", "", "padding-left", { is: "0px" }], ["#fx-grid", "", "margin-top", { is: "0px" }],
  ]],
  ["K4 stat tile — column, padding, card fill, 3px start edge; eyebrow label, --fs-xl tabular value", [
    ["#fx-tile", "", "display", { is: "flex" }], ["#fx-tile", "", "flex-direction", { is: "column" }], ["#fx-tile", "", "row-gap", "0.25rem"],
    ["#fx-tile", "", "padding-top", "0.75rem"], ["#fx-tile", "", "padding-right", "0.9rem"], ["#fx-tile", "", "box-sizing", { is: "border-box" }],
    ["#fx-tile", "", "color", "var(--foreground)"], ["#fx-tile", "", "text-decoration-line", { is: "none" }], ["#fx-tile", "", "background-color", "var(--card)"],
    ...edge("#fx-tile", "top", "1px", "solid", "var(--border)"), ...edge("#fx-tile", "left", "3px", "solid", "var(--border)"),
    ...EYEBROW("#fx-tile-label", "var(--muted-foreground)"),
    ["#fx-tile-value", "", "font-size", "var(--fs-xl)"], ["#fx-tile-value", "", "font-weight", { is: "700" }],
    ["#fx-tile-value", "", "font-variant-numeric", { is: "tabular-nums" }], ["#fx-tile-value", "", "line-height", "calc(var(--fs-xl) * 1.3)"],
    ["#fx-tile-note", "", "color", "var(--muted-foreground)"], ["#fx-tile-cta", "", "color", "var(--primary)"], ["#fx-tile-cta", "", "align-self", { is: "flex-end" }],
    ["#fx-stat-grid", "", "display", { is: "grid" }], ["#fx-stat-grid", "", "column-gap", "0.75rem"],
  ]],
  ["K4 states — idle success edge; action and broken edge + value + 4% tint; unknown dashed muted; data-tone; no leak", [
    ["#fx-tile-idle", "", "border-left-color", "var(--success)"], ["#fx-tile-idle-value", "", "color", "var(--foreground)"],
    ["#fx-tile-action", "", "border-left-color", "var(--warning)"], ["#fx-tile-action", "", "background-color", mix("--warning", 4, "var(--card)")],
    ["#fx-tile-action-value", "", "color", "var(--warning)"], ["#fx-tile-action-label", "", "color", "var(--muted-foreground)"],
    ["#fx-tile-broken", "", "border-left-color", "var(--destructive)"], ["#fx-tile-broken", "", "background-color", mix("--destructive", 4, "var(--card)")],
    ["#fx-tile-broken-value", "", "color", "var(--destructive)"],
    ["#fx-tile-unknown", "", "border-left-style", { is: "dashed" }], ["#fx-tile-unknown", "", "border-left-color", "var(--muted-foreground)"],
    ["#fx-tile-unknown-value", "", "color", "var(--muted-foreground)"],
    ["#fx-tile-tone", "", "border-left-color", "var(--info)"], ["#fx-tile-tone-label", "", "color", "var(--info)"],
    ["#fx-tile-leak", "", "border-left-color", "var(--border)"], ["#fx-tile-leak-label", "", "color", "var(--muted-foreground)"],
  ]],
  ["K5 panel — card fill, ruled 2.5rem head, truncating 500 title, scrolling body, mirrored foot", [
    ["#fx-panel", "", "display", { is: "flex" }], ["#fx-panel", "", "flex-direction", { is: "column" }], ["#fx-panel", "", "min-height", { is: "0px" }],
    ["#fx-panel", "", "background-color", "var(--card)"], ...edge("#fx-panel", "top", "1px", "solid", "var(--border)"), ["#fx-panel", "", "--clamp-fade", "var(--card)"],
    ["#fx-panel-head", "", "display", { is: "flex" }], ["#fx-panel-head", "", "align-items", { is: "center" }], ["#fx-panel-head", "", "column-gap", "0.5rem"],
    ["#fx-panel-head", "", "flex-shrink", { is: "0" }], ["#fx-panel-head", "", "min-height", "2.5rem"], ["#fx-panel-head", "", "padding-left", "var(--card-pad)"],
    ["#fx-panel-head", "", "padding-top", { is: "0px" }], ...edge("#fx-panel-head", "bottom", "1px", "solid", "var(--border)"),
    ["#fx-panel-ico", "", "color", "var(--primary)"], ["#fx-panel-ico", "", "width", "var(--icon-size)"],
    ["#fx-panel-title", "", "flex-grow", { is: "1" }], ["#fx-panel-title", "", "min-width", { is: "0px" }], ["#fx-panel-title", "", "margin-top", { is: "0px" }],
    ["#fx-panel-title", "", "font-size", "var(--fs-base)"], ["#fx-panel-title", "", "font-weight", { is: "500" }], ["#fx-panel-title", "", "color", "var(--foreground)"],
    ["#fx-panel-title", "", "overflow-x", { is: "hidden" }], ["#fx-panel-title", "", "text-overflow", { is: "ellipsis" }], ["#fx-panel-title", "", "white-space", { is: "nowrap" }],
    ["#fx-panel-actions", "", "display", { is: "flex" }], ["#fx-panel-actions", "", "column-gap", "0.25rem"], ["#fx-panel-actions", "", "flex-shrink", { is: "0" }],
    ["#fx-panel-body", "", "flex-grow", { is: "1" }], ["#fx-panel-body", "", "min-height", { is: "0px" }], ["#fx-panel-body", "", "overflow-y", { is: "auto" }],
    ["#fx-panel-body", "", "padding-top", "var(--card-pad)"],
    ["#fx-panel-foot", "", "display", { is: "flex" }], ["#fx-panel-foot", "", "min-height", "2.5rem"], ["#fx-panel-foot", "", "flex-shrink", { is: "0" }],
    ...edge("#fx-panel-foot", "top", "1px", "solid", "var(--border)"),
  ]],
  ["K5 variants — eyebrow head, flush body, a collapsed and a lone head lose their rule, the identity rail, no section rhythm", [
    ...EYEBROW("#fx-panel-eyebrow", "var(--muted-foreground)"), ["#fx-panel-flush", "", "padding-top", { is: "0px" }],
    ["#fx-panel-collapsed-head", "", "border-bottom-width", { is: "0px" }], ["#fx-panel-lone-head", "", "border-bottom-width", { is: "0px" }],
    ["#fx-panel-mark", "", "display", { is: "grid" }], ["#fx-panel-mark-rail", "", "background-color", mix("--muted-foreground", 5)],
    ...edge("#fx-panel-mark-rail", "right", "1px", "solid", "var(--border)"), ["#fx-panel-mark-rail", "", "color", "var(--muted-foreground)"],
    ["#fx-panel-mark-rail", "", "font-weight", { is: "700" }], ["#fx-panel-mark-rail", "", "letter-spacing", "0.06em"],
    ["#fx-panel-main", "", "display", { is: "flex" }], ["#fx-panel-main", "", "flex-direction", { is: "column" }],
    ["#fx-panel-stack-2", "", "margin-top", { is: "0px" }],
  ]],
  ["K6 row list — hairlines between rows, a reset row that is a link or a button", [
    ["#fx-rows", "", "list-style-type", { is: "none" }], ["#fx-rows", "", "padding-left", { is: "0px" }], ["#fx-rows", "", "margin-top", { is: "0px" }],
    ["#fx-rows-li1", "", "border-top-width", { is: "0px" }], ...edge("#fx-rows-li2", "top", "1px", "solid", "var(--border)"),
    ...edge("#fx-rows-ruled", "top", "1px", "solid", "var(--border)"), ...edge("#fx-rows-ruled", "bottom", "1px", "solid", "var(--border)"),
    ["#fx-row", "", "display", { is: "flex" }], ["#fx-row", "", "flex-wrap", { is: "wrap" }], ["#fx-row", "", "align-items", { is: "baseline" }],
    ["#fx-row", "", "row-gap", "0.25rem"], ["#fx-row", "", "column-gap", "1.5rem"], ["#fx-row", "", "box-sizing", { is: "border-box" }],
    ["#fx-row", "", "padding-top", "0.5rem"], ["#fx-row", "", "padding-left", "var(--card-pad)"], ["#fx-row", "", "color", "var(--foreground)"],
    ["#fx-row", "", "text-decoration-line", { is: "none" }], ["#fx-row", "", "background-color", "transparent"],
    ["#fx-sel", "", "font-family", "var(--font-mono)"], ["#fx-sel", "", "font-size", "var(--fs-base)"], ["#fx-sel", "", "text-align", { is: "start" }],
    ["#fx-sel", "", "border-top-width", { is: "0px" }], ["#fx-sel", "", "cursor", { is: "pointer" }],
    ["#fx-row-loose", "", "padding-top", "1rem"], ["#fx-row-lead-w", "", "flex-basis", "10.5rem"],
  ]],
  ["K6 row parts — lead, title (700 --primary, truncates), 2-line description, meta", [
    ["#fx-row-lead", "", "flex-basis", { is: "auto" }], ["#fx-row-lead", "", "flex-grow", { is: "0" }], ["#fx-row-lead", "", "color", "var(--muted-foreground)"],
    ["#fx-row-lead", "", "font-variant-numeric", { is: "tabular-nums" }], ["#fx-row-lead", "", "white-space", { is: "nowrap" }],
    ["#fx-row-title", "", "flex-basis", "12rem"], ["#fx-row-title", "", "flex-grow", { is: "1" }], ["#fx-row-title", "", "min-width", { is: "0px" }],
    ["#fx-row-title", "", "font-weight", { is: "700" }], ["#fx-row-title", "", "color", "var(--primary)"],
    ["#fx-row-title", "", "text-overflow", { is: "ellipsis" }], ["#fx-row-title", "", "white-space", { is: "nowrap" }],
    ["#fx-row-desc", "", "flex-basis", "100%"], ["#fx-row-desc", "", "color", "var(--muted-foreground)"], ["#fx-row-desc", "", "-webkit-line-clamp", { is: "2" }],
    ["#fx-row-meta", "", "color", "var(--muted-foreground)"], ["#fx-row-meta", "", "white-space", { is: "nowrap" }],
  ]],
  ["K6 selection list and the current row — the rail's marker; lead, meta and description turn --foreground", [
    ["#fx-sel", "", "padding-top", "0.25rem"], ["#fx-sel", "", "padding-left", "0.5rem"], ["#fx-sel", "", "column-gap", "0.75rem"],
    ["#fx-sel-title", "", "font-weight", { is: "400" }], ["#fx-sel-title", "", "color", "var(--foreground)"],
    ...CURRENT("#fx-sel-current", "#fx-sel-current-title"),
    ["#fx-sel-current-lead", "", "color", "var(--foreground)"], ["#fx-sel-current-meta", "", "color", "var(--foreground)"], ["#fx-sel-current-desc", "", "color", "var(--foreground)"],
    ["#fx-sel-false", "", "background-color", "transparent"], ["#fx-sel-false-title", "", "font-weight", { is: "400" }],
    ...CURRENT("#fx-sel-selected", "#fx-sel-selected-title"),
    ["#fx-sel-disabled", "", "opacity", { is: "0.45" }], ["#fx-sel-disabled", "", "cursor", { is: "default" }],
    ["#fx-row-aria-disabled", "", "opacity", { is: "0.45" }],
  ]],
  ["K7 entry — lead column 8.75rem / 5rem / 12.5rem, title, description, ruled list", [
    ["#fx-entry", "", "position", { is: "relative" }], ["#fx-entry", "", "display", { is: "grid" }], ["#fx-entry", "", "column-gap", "2rem"],
    ["#fx-entry", "", "row-gap", "0.25rem"], ["#fx-entry", "", "align-items", { is: "baseline" }],
    ["#fx-entry-narrow", "", "column-gap", "1.5rem"], ["#fx-entry-wide", "", "column-gap", "2.5rem"],
    ["#fx-entry-lead", "", "color", "var(--muted-foreground)"], ["#fx-entry-lead", "", "font-variant-numeric", { is: "tabular-nums" }],
    ["#fx-entry-accent", "", "color", "var(--primary)"], ["#fx-entry-accent", "", "font-weight", { is: "700" }],
    ["#fx-entry-title", "", "margin-top", { is: "0px" }], ["#fx-entry-title", "", "color", "var(--primary)"], ["#fx-entry-title", "", "font-weight", { is: "700" }],
    ["#fx-entry-link", "", "color", "var(--primary)"], ["#fx-entry-link", "", "text-decoration-line", { is: "none" }],
    ["#fx-entry-link", "::after", "position", { is: "absolute" }], ["#fx-entry-filter", "", "z-index", { is: "1" }],
    ["#fx-entry-desc", "", "margin-top", "0.75rem"], ["#fx-entry-desc", "", "color", "var(--muted-foreground)"],
    ["#fx-entries", "", "display", { is: "grid" }], ["#fx-entries", "", "row-gap", { is: "0px" }], ["#fx-entries", "", "list-style-type", { is: "none" }],
    ["#fx-entries-plain", "", "row-gap", "0.625rem"], ["#fx-entries-plain", "", "padding-left", { is: "0px" }],
    ["#fx-entry", "", "padding-top", "2rem"], ...edge("#fx-entry", "bottom", "1px", "solid", "var(--border)"), ...edge("#fx-entry", "top", "1px", "solid", "var(--border)"),
    ["#fx-entry-wide", "", "border-top-width", { is: "0px" }], ["#fx-entry-wide", "", "padding-top", "2.5rem"],
  ]],
  ["K8 man page — a muted frame of three, primary headings, an indented muted body", [
    ["#fx-man-top", "", "display", { is: "flex" }], ["#fx-man-top", "", "column-gap", "1rem"], ["#fx-man-top", "", "color", "var(--muted-foreground)"],
    ["#fx-man-top", "", "letter-spacing", "0.025em"], ["#fx-man-top", "", "margin-top", { is: "0px" }], ["#fx-man-top", "", "margin-bottom", "1.5rem"],
    ["#fx-man-bottom", "", "margin-top", "1.75rem"], ["#fx-man-top-1", "", "flex-grow", { is: "1" }], ["#fx-man-top-1", "", "flex-basis", { is: "0px" }],
    ["#fx-man-top-2", "", "text-align", { is: "center" }], ["#fx-man-top-3", "", "text-align", { is: "end" }],
    ["#fx-man-sect1", "", "margin-top", { is: "0px" }], ["#fx-man-sect2", "", "margin-top", "1.25rem"], ["#fx-man-sect1", "", "font-size", "var(--fs-base)"],
    ["#fx-man-sect1", "", "font-weight", { is: "700" }], ["#fx-man-sect1", "", "line-height", "calc(var(--fs-base) * 1.5)"],
    ["#fx-man-sect1", "", "letter-spacing", "0.025em"], ["#fx-man-sect1", "", "color", "var(--primary)"],
    ["#fx-man-body", "", "margin-top", "0.375rem"], ["#fx-man-body", "", "padding-left", "1.75rem"], ["#fx-man-body", "", "color", "var(--muted-foreground)"],
    ["#fx-man-p1", "", "margin-top", { is: "0px" }], ["#fx-man-p1", "", "margin-bottom", { is: "0px" }], ["#fx-man-p2", "", "margin-top", "0.75rem"],
  ]],
  ["K9 tree — unstyled lists, a drawn guide per level, rows, a chevron on a branch and a spacer on a leaf", [
    ["#fx-tree", "", "list-style-type", { is: "none" }], ["#fx-tree", "", "padding-left", { is: "0px" }],
    ["#fx-tree-group", "", "margin-left", "0.45rem"], ["#fx-tree-group", "", "padding-left", "0.55rem"],
    ...edge("#fx-tree-group", "left", "1px", "solid", mix("--muted-foreground", 40)),
    ["#fx-tree-leaf-row", "", "display", { is: "flex" }], ["#fx-tree-leaf-row", "", "align-items", { is: "center" }], ["#fx-tree-leaf-row", "", "column-gap", "0.375rem"],
    ["#fx-tree-leaf-row", "", "padding-top", "0.125rem"], ["#fx-tree-leaf-row", "", "padding-left", "0.25rem"], ["#fx-tree-leaf-row", "", "white-space", { is: "nowrap" }],
    ["#fx-tree-leaf-row", "", "color", "var(--foreground)"], ["#fx-tree-leaf-row", "", "cursor", { is: "pointer" }],
    ["#fx-tree-leaf-row", "::before", "width", "var(--icon-sm)"], ["#fx-tree-leaf-row", "::before", "mask-image", { is: "none" }],
    ["#fx-tree-leaf-row", "::before", "background-color", "transparent"],
    ["#fx-tree-branch-row", "::before", "background-color", "var(--muted-foreground)"], ["#fx-tree-branch-row", "::before", "mask-image", "var(--ico-chevron-down)"],
    ["#fx-tree-closed-row", "::before", "mask-image", "var(--ico-chevron-right)"], ["#fx-tree-closed-row", "::before", "background-color", "var(--muted-foreground)"],
    ["#fx-tree-leaf-ico", "", "color", "var(--muted-foreground)"], ["#fx-tree-branch-ico", "", "color", "var(--primary)"],
    ["#fx-tree-meta", "", "display", { is: "flex" }], ["#fx-tree-meta", "", "color", "var(--muted-foreground)"],
    ["#fx-tree-long", "", "text-overflow", { is: "ellipsis" }], ["#fx-tree-long", "", "overflow-x", { is: "hidden" }],
  ]],
  ["K9 selected and current rows — K6's marker; the meta turns --foreground; disabled is .45", [
    ...CURRENT("#fx-tree-selected-row", "#fx-tree-selected-row"), ["#fx-tree-selected-meta", "", "color", "var(--foreground)"],
    ["#fx-tree-selected-meta", "", "font-weight", { is: "400" }],
    ...CURRENT("#fx-navtree-current", "#fx-navtree-current"), ["#fx-navtree-parent", "", "text-decoration-line", { is: "none" }],
    ["#fx-navtree-parent", "::before", "mask-image", "var(--ico-chevron-down)"],
    ["#fx-tree-disabled-row", "", "opacity", { is: "0.45" }], ["#fx-tree-disabled-row", "", "cursor", { is: "default" }],
  ]],
  ["K10 split — panes, the splitter lines in --control-edge, the hairline without one", [
    ["#fx-split", "", "display", { is: "flex" }], ["#fx-pane-a", "", "overflow-y", { is: "auto" }], ["#fx-pane-a", "", "min-width", { is: "0px" }],
    ["#fx-pane-a", "", "flex-shrink", { is: "0" }], ["#fx-pane-b", "", "flex-grow", { is: "1" }],
    ["#fx-vsplit", "", "width", "0.75rem"], ["#fx-vsplit", "", "cursor", { is: "col-resize" }], ["#fx-vsplit", "", "touch-action", { is: "none" }],
    ["#fx-vsplit", "::before", "width", { is: "1px" }], ["#fx-vsplit", "::before", "background-color", "var(--control-edge)"],
    ["#fx-hsplit", "", "height", "1rem"], ["#fx-hsplit", "", "cursor", { is: "row-resize" }],
    ["#fx-hsplit", "::before", "width", "2.5rem"], ["#fx-hsplit", "::before", "height", "0.25rem"], ["#fx-hsplit", "::before", "background-color", "var(--control-edge)"],
    ...edge("#fx-fixed-b", "left", "1px", "solid", "var(--border)"), ["#fx-fixed-a", "", "border-left-width", { is: "0px" }],
  ]],
  ["K10 the strip a hidden pane leaves — a 2rem button, its label down it in eyebrow type, the rule on the content side", [
    ["#fx-collapsed", "", "display", { is: "flex" }], ["#fx-collapsed", "", "flex-direction", { is: "column" }], ["#fx-collapsed", "", "width", "2rem"],
    ["#fx-collapsed", "", "color", "var(--muted-foreground)"], ["#fx-collapsed", "", "background-color", "transparent"],
    ["#fx-collapsed", "", "font-family", "var(--font-mono)"], ["#fx-collapsed", "", "font-size", "var(--fs-base)"],
    ["#fx-collapsed", "", "box-sizing", { is: "border-box" }], ["#fx-vsplit", "", "box-sizing", { is: "border-box" }],
    ["#fx-tree-leaf-row", "", "box-sizing", { is: "border-box" }], ["#fx-console-body", "", "box-sizing", { is: "border-box" }],
    ["#fx-panel", "", "box-sizing", { is: "border-box" }], ["#fx-pane-a", "", "box-sizing", { is: "border-box" }],
    ...edge("#fx-collapsed", "right", "1px", "solid", "var(--border)"), ["#fx-collapsed", "", "border-left-width", { is: "0px" }],
    ["#fx-collapsed-label", "", "writing-mode", { is: "vertical-rl" }], ["#fx-collapsed-label", "", "text-transform", { is: "uppercase" }],
    ["#fx-collapsed-label", "", "letter-spacing", "0.05em"],
    ...edge("#fx-collapsed-end", "left", "1px", "solid", "var(--border)"), ["#fx-collapsed-end", "", "border-right-width", { is: "0px" }],
    ["#fx-collapsed > .ico", "", "transform", { is: "none" }], ["#fx-collapsed-end > .ico", "", "transform", { is: "matrix(-1, 0, 0, 1, 0, 0)" }],
    ["#fx-collapsed-disabled", "", "opacity", { is: "0.45" }], ["#fx-collapsed-disabled", "", "cursor", { is: "default" }],
  ]],
  ["K11 clamp — capped with a fade that blends into the surface under it; open is uncapped", [
    ["#fx-clamp", "", "position", { is: "relative" }], ["#fx-clamp", "", "max-height", "4rem"], ["#fx-clamp", "", "overflow-y", { is: "hidden" }],
    ["#fx-clamp", "::after", "content", { is: '""' }], ["#fx-clamp", "::after", "position", { is: "absolute" }], ["#fx-clamp", "::after", "height", "4rem"],
    ["#fx-clamp", "::after", "bottom", { is: "0px" }], ["#fx-clamp", "::after", "pointer-events", { is: "none" }],
    ["#fx-clamp", "::after", "background-image", "linear-gradient(to top, var(--card), transparent)"],
    ["#fx-clamp-page", "", "max-height", "15rem"], ["#fx-clamp-page", "::after", "background-image", "linear-gradient(to top, var(--background), transparent)"],
    ["#fx-clamp-panel", "::after", "background-image", "linear-gradient(to top, var(--card), transparent)"],
    ["#fx-clamp-open", "", "max-height", { is: "none" }], ["#fx-clamp-open", "::after", "content", { is: "none" }],
  ]],
  ["K12 console — the window bar, three dots, the eyebrow title, the status, a page-coloured body", [
    ["#fx-console", "", "display", { is: "flex" }], ["#fx-console", "", "flex-direction", { is: "column" }], ["#fx-console", "", "background-color", "var(--card)"],
    ...edge("#fx-console", "top", "1px", "solid", "var(--border)"),
    ["#fx-console-bar", "", "display", { is: "flex" }], ["#fx-console-bar", "", "min-height", "1.5rem"], ["#fx-console-bar", "", "padding-left", "0.5rem"],
    ...edge("#fx-console-bar", "bottom", "1px", "solid", "var(--border)"),
    ["#fx-console-dots", "", "width", "2rem"], ["#fx-console-dots", "::before", "width", "0.5rem"], ["#fx-console-dots", "::before", "border-top-left-radius", { is: "50%" }],
    ["#fx-console-dots", "::before", "background-color", "var(--border)"],
    ["#fx-console-dots", "::before", "box-shadow", "0.75rem 0 var(--border), 1.5rem 0 var(--border)"],
    ...EYEBROW("#fx-console-title", "var(--muted-foreground)"),
    ["#fx-console-status", "", "display", { is: "flex" }], // inline-flex, blockified as the bar's flex item ["#fx-console-status", "", "column-gap", "0.4rem"], ["#fx-console-status", "", "margin-top", { is: "0px" }],
    ["#fx-console-status", "", "color", "var(--muted-foreground)"], ["#fx-console-status", "", "white-space", { is: "nowrap" }],
    ["#fx-console-body", "", "flex-grow", { is: "1" }], ["#fx-console-body", "", "min-height", "12rem"], ["#fx-console-body", "", "height", "14rem"],
    ["#fx-console-body", "", "overflow-y", { is: "auto" }], ["#fx-console-body", "", "overscroll-behavior-y", { is: "contain" }], ["#fx-console-body", "", "padding-top", "0.75rem"],
    ["#fx-console-body", "", "background-color", "var(--background)"], ["#fx-console-body", "", "color", "var(--foreground)"],
    ["#fx-console-body", "", "white-space", { is: "pre-wrap" }], ["#fx-console-body", "", "overflow-wrap", { is: "anywhere" }],
    ["#fx-console-body", "", "line-height", "calc(var(--fs-base) * 1.5)"], ["#fx-console-body", "", "tab-size", { is: "2" }],
    ["#fx-console-current", "", "background-color", "var(--muted)"],
  ]],
];

const runExpect = async (suffix) => {
  for (const [label, rows] of EXPECT) {
    await check(`${label} (${suffix})`, async () => {
      const results = await evaluate(`(${JSON.stringify(rows)}).map((r) => window.__wp8.expect(...r))`);
      return results.filter(Boolean);
    });
  }
};

/* Geometry: what the declarations are FOR. Measured from the laid-out boxes. */
const GEOMETRY = [
  ["K2/K5/K7 a card, panel or entry title leads --lh-tight whatever element carries it (base.css gives only h1-h3 that leading)", () => W(`(() => {
    const want = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lh-tight"));
    return ["#fx-card-title", "#fx-panel-title", "#fx-entry-title", "#fx-title-on-p"].map((id) => {
      const cs = getComputedStyle(W.q(id)), got = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
      return Math.abs(got - want) < 0.01 ? null : id + " leads " + got.toFixed(3) + ", not --lh-tight " + want;
    }).filter(Boolean);
  })()`)],
  ["K2/K6 a description clamps at three lines in a card and two in a row, and hides the rest", () => W(`(() => {
    const lines = (id, n) => { const el = W.q(id), lh = parseFloat(getComputedStyle(el).lineHeight);
      return [W.near(el.getBoundingClientRect().height, n * lh, id + " height, " + n + " lines"),
        el.scrollHeight > el.clientHeight + lh / 2 ? null : id + " shows everything (no clamp)"]; };
    return [...lines("#fx-card-desc", 3), ...lines("#fx-row-desc", 2)].filter(Boolean);
  })()`)],
  ["K3 the grid fits as many 12rem tracks as the width allows (3 in 640px), and one below the minimum", () => W(`(() => {
    const cols = (id) => getComputedStyle(W.q(id)).gridTemplateColumns.split(" ").length;
    return [cols("#fx-grid") === 3 ? null : "640px grid: " + cols("#fx-grid") + " tracks, want 3",
      cols("#fx-grid-narrow") === 1 ? null : "150px grid: " + cols("#fx-grid-narrow") + " tracks, want 1",
      W.near(W.box("#fx-grid-narrow > li").width, 150, "the one card in a 150px grid is 150px wide")].filter(Boolean);
  })()`)],
  ["K2 cards in one grid row are one height, and every foot sits on the card's floor", () => W(`(() => {
    const a = W.box("#fx-card"), b = W.box("#fx-card-short"), pad = parseFloat(getComputedStyle(W.q("#fx-card")).paddingBottom) + 1;
    return [W.near(a.height, b.height, "row heights"),
      W.near(W.box("#fx-card-foot").bottom, a.bottom - pad, "the long card's foot"),
      W.near(W.box("#fx-card-short-foot").bottom, b.bottom - pad, "the short card's foot")].filter(Boolean);
  })()`)],
  ["K2 the click lands on the link anywhere on a --link card, on the filter over the filter, and nowhere on a card without --link", () => W(`(() => {
    const at = (sel, fx = 0.5, fy = 0.5) => { W.q(sel).scrollIntoView({ block: "center", behavior: "instant" }); const s = W.box(sel);
      return document.elementFromPoint(s.left + s.width * fx, s.top + s.height * fy); };
    const out = [];
    const desc = at("#fx-card-desc");
    if (!desc || !desc.closest(".card-link")) out.push("the middle of the description hits " + (desc ? desc.outerHTML.slice(0, 60) : "nothing") + ", not the card link");
    const foot = at("#fx-card-foot", 0.1);
    if (!foot || !foot.closest(".card-link")) out.push("the foot hits " + (foot ? foot.outerHTML.slice(0, 60) : "nothing") + ", not the card link");
    const filter = at("#fx-card-filter");
    if (!filter || !filter.closest(".value-filter")) out.push("the filter hits " + (filter ? filter.outerHTML.slice(0, 60) : "nothing"));
    const star = at("#fx-card-star");
    if (!star || !star.closest(".btn-icon")) out.push("the star hits " + (star ? star.outerHTML.slice(0, 60) : "nothing"));
    const orphan = at("#fx-card-orphan-text");
    if (orphan && orphan.closest(".card-link")) out.push("text in a card WITHOUT --link hits its title link — the overlay stretched");
    return out;
  })()`)],
  ["K4 the call to action sits at the tile's end corner", () => W(`(() => {
    const t = W.box("#fx-tile-action"), c = W.box("#fx-tile-action-cta"), cs = getComputedStyle(W.q("#fx-tile-action"));
    return [W.near(c.right, t.right - 1 - parseFloat(cs.paddingRight), "cta right edge"),
      W.near(c.bottom, t.bottom - 1 - parseFloat(cs.paddingBottom), "cta bottom edge")].filter(Boolean);
  })()`)],
  ["K5 a fixed-height panel scrolls its body and keeps its head and foot inside the box", () => W(`(() => {
    const p = W.box("#fx-panel"), f = W.box("#fx-panel-foot"), b = W.q("#fx-panel-body");
    return [b.scrollHeight > b.clientHeight + 10 ? null : "the body does not scroll (" + b.scrollHeight + " / " + b.clientHeight + ")",
      W.near(f.bottom, p.bottom - 1, "the foot's bottom"), W.near(p.height, 160, "the panel keeps its 10rem"),
      W.q("#fx-panel-title").scrollWidth > W.q("#fx-panel-title").clientWidth ? null : "the long title is not cut off"].filter(Boolean);
  })()`)],
  ["K6 a row is as wide as its list; the meta sits at the row's end; the long title is cut off on one line", () => W(`(() => {
    const row = W.box("#fx-row"), list = W.box("#fx-rows"), meta = W.box("#fx-row-meta"), t = W.q("#fx-row-title");
    const pad = parseFloat(getComputedStyle(W.q("#fx-row")).paddingRight);
    return [W.near(row.width, list.width, "row width"), W.near(meta.right, row.right - pad, "meta right edge"),
      t.scrollWidth > t.clientWidth ? null : "the title is not truncated", W.near(W.box("#fx-sel").width, W.box("#fx-select").width, "a button row's width")].filter(Boolean);
  })()`)],
  ["K7 the lead column is 8.75rem, 5rem and 12.5rem", () => W(`(() => {
    const first = (id) => parseFloat(getComputedStyle(W.q(id)).gridTemplateColumns.split(" ")[0]);
    return [W.near(first("#fx-entry"), 140, "default"), W.near(first("#fx-entry-narrow"), 80, "--narrow"), W.near(first("#fx-entry-wide"), 200, "--wide")].filter(Boolean);
  })()`)],
  ["K9 a long label is cut off inside the row; nesting indents one level by 1rem", () => W(`(() => {
    const l = W.q("#fx-tree-long");
    return [l.scrollWidth > l.clientWidth ? null : "the long label is not truncated",
      W.near(W.box("#fx-tree-selected-row").left - W.box("#fx-tree-branch-row").left, 16 + 1, "indent per level (1rem + the 1px guide)")].filter(Boolean);
  })()`)],
  ["K10 the first pane is --split-size, the last takes the room, and the remaining pane fills when either side is hidden", () => W(`(() => {
    const w = (id) => W.box(id).width;
    return [W.near(w("#fx-pane-a"), 192, "first pane"), W.near(w("#fx-pane-b"), 640 - 192 - 12, "last pane"),
      W.near(w("#fx-fixed-a"), 160, "fixed master"), W.near(w("#fx-left-rest"), 480 - 32, "left strip, rest"),
      W.near(w("#fx-right-rest"), 480 - 32, "right strip (--end), rest"),
      W.near(w("#fx-kept-rest"), 480 - 32, "right pane kept in place with hidden, rest"),
      W.near(W.box("#fx-vsplit").height, 128, "the vertical splitter spans the row"),
      W.near(parseFloat(getComputedStyle(W.q("#fx-vsplit"), "::before").height), 128, "its line spans it")].filter(Boolean);
  })()`)],
  ["K11 a clamp caps at --clamp-h, 15rem by default", () => W(`[W.near(W.box("#fx-clamp").height, 64, "4rem clamp"), W.near(W.box("#fx-clamp-page").height, 240, "default clamp")].filter(Boolean)`)],
  ["K12 the status sits at the bar's end; a --fill console fills its container", () => W(`(() => {
    const bar = W.box("#fx-console-bar"), st = W.box("#fx-console-status"), pad = parseFloat(getComputedStyle(W.q("#fx-console-bar")).paddingRight);
    return [W.near(st.right, bar.right - pad, "status right edge"), W.near(W.box("#fx-console-fill").height, 320, "console --fill"),
      W.near(W.box("#fx-console-fill-body").height, 318, "its body (the rest)")].filter(Boolean);
  })()`)],
];
const runGeometry = async (suffix) => { for (const [label, fn] of GEOMETRY) await check(`${label} (${suffix})`, fn); };

// Classes this file owns — the no-radius sweep and the `hidden` sweep walk every element that has one.
const MINE = [".card-head", ".card-title", ".card-desc", ".card-foot", ".card-link", ".card-grid", ".stat-grid", ".stat-tile", ".stat-label",
  ".stat-value", ".stat-note", ".stat-cta", ".panel", ".panel-head", ".panel-title", ".panel-actions", ".panel-body", ".panel-foot",
  ".panel-mark", ".panel-main", ".row-list", ".list-row", ".list-row-lead", ".list-row-title", ".list-row-desc", ".list-row-meta",
  ".entry-list", ".entry", ".entry-lead", ".entry-title", ".entry-desc", ".manpage-frame", ".manpage-sect", ".manpage-body", ".tree",
  ".tree-row", ".tree-label", ".tree-meta", ".split", ".split-pane", ".splitter", ".pane-collapsed", ".clamp", ".console", ".console-bar",
  ".console-dots", ".console-title", ".console-status", ".console-body", ".console-line--current"].join(", ");
const noRadius = () => check("no radius anywhere but the console's three dots (every element and pseudo this file styles)", () => evaluate(`
  [...document.querySelectorAll(${JSON.stringify(MINE + ", .card-terminal")})].flatMap((el) => ["", "::before", "::after"].flatMap((p) => {
    const cs = getComputedStyle(el, p || null);
    if (p && cs.content === "none") return [];
    const want = el.classList.contains("console-dots") && p === "::before" ? "50%" : "0px";
    return ["border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius"]
      .filter((k) => cs.getPropertyValue(k) !== want)
      .map((k) => (el.id || el.className) + p + " " + k + " = " + cs.getPropertyValue(k));
  }))`));

const SNAP_PROPS = ["display", "position", "width", "height", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "row-gap", "column-gap", "font-family", "font-size", "font-weight", "line-height",
  "letter-spacing", "text-transform", "text-align", "text-decoration-line", "text-overflow", "white-space", "color", "background-color",
  "background-image", "border-top-width", "border-top-style", "border-top-color", "border-left-width", "border-left-style", "border-left-color",
  "border-right-width", "border-bottom-width", "border-bottom-style", "border-bottom-color", "min-height", "min-width", "max-height",
  "flex-grow", "flex-shrink", "flex-basis", "flex-direction", "flex-wrap", "align-items", "justify-content", "grid-template-columns",
  "overflow-x", "overflow-y", "opacity", "z-index", "list-style-type", "cursor", "content", "mask-image", "writing-mode", "box-shadow"];
const CARD_PROPS = ["position", "display", "flex-direction", "row-gap", "height", "border-left-width", "border-left-style", "border-left-color", "animation-name"];
// What this file styles: its own classes, a K1 card (on CARD_PROPS), and the children it reaches
// into — a man page body's paragraphs, the label of a collapsed pane's strip.
const SNAP_SCOPE = MINE + ", .card-terminal, .manpage-body > *, .pane-collapsed > :not(.ico)";
const snapshot = () => evaluate(`window.__wp8.snapshot([...document.querySelectorAll("#fx [id]")].map((e) => e.id), ${JSON.stringify(SNAP_PROPS)}, ${JSON.stringify(CARD_PROPS)}, ${JSON.stringify(SNAP_SCOPE)})`);

/* ── run: full stack, then tokens only ───────────────────────────────────────────────────────── */
const THEMES = ["warm", "green", "mono", "paper"];

await load();
const standins = await evaluate("document.documentElement.dataset.standins");
console.log(`stand-ins in force (tokens and classes other 0.60.0 packages own): ${standins}`);
if (process.env.DD_NO_STANDINS === "1") {
  await check("DD_NO_STANDINS=1: no stand-in is in force (the integrated tree measures the real tokens and classes)", () =>
    (standins === "none" ? [] : [`still standing in: ${standins}`]));
}

/* The YIELD, as numbers. Everything below compares this file's output with a token resolved on a
   probe, and an unresolved token resolves to nothing on BOTH sides: a missing --ico-chevron-right
   makes "mask-image: var(--ico-chevron-right)" equal "none" equal "none". So what the run depends
   on is counted first, and a short count fails. */
const ICONS = ["chevron-right", "chevron-down", "folder-tree", "folder-open", "folder", "file", "file-code", "panel-left-open", "chevrons-up-down"];
const TONE_NAMES = ["primary", "success", "warning", "destructive", "info", "pending", "muted"];
const TOKENS = ["--card-pad", "--control-edge", "--icon-sm", "--icon-size", "--icon-lg", "--icon-xl", "--cat-teal", "--cat-violet", "--fs-xl", "--lh-tight"];
const yieldOf = await evaluate(`(() => {
  const root = getComputedStyle(document.documentElement);
  const has = (name) => root.getPropertyValue(name).trim() !== "";
  const probe = document.createElement("span");
  document.body.append(probe);
  const tones = ${JSON.stringify(TONE_NAMES)}.filter((t) => { probe.dataset.tone = t; return getComputedStyle(probe).getPropertyValue("--tone").trim() !== ""; });
  probe.remove();
  const frames = new Set();
  for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (rule instanceof CSSKeyframesRule) frames.add(rule.name);
  return { tones, icons: ${JSON.stringify(ICONS)}.filter((i) => has("--ico-" + i)), tokens: ${JSON.stringify(TOKENS)}.filter(has),
    keyframes: ["dd-flash", "dd-pulse"].filter((k) => frames.has(k)) };
})()`);
console.log(`resolved: data-tone ${yieldOf.tones.length}/7 · --ico-* ${yieldOf.icons.length}/${ICONS.length} · tokens ${yieldOf.tokens.length}/${TOKENS.length} · keyframes ${yieldOf.keyframes.length}/2\n`);
await check("every token the measurements depend on resolved — none of them is measuring a fallback", () => [
  ...TONE_NAMES.filter((t) => !yieldOf.tones.includes(t)).map((t) => `data-tone="${t}" sets no --tone`),
  ...ICONS.filter((i) => !yieldOf.icons.includes(i)).map((i) => `--ico-${i} is not declared`),
  ...TOKENS.filter((t) => !yieldOf.tokens.includes(t)).map((t) => `${t} is not declared`),
  ...["dd-flash", "dd-pulse"].filter((k) => !yieldOf.keyframes.includes(k)).map((k) => `@keyframes ${k} is not declared`),
]);

await check("the demo page shows every element and state the spec names", () => evaluate(`
  [".card-grid > .card-terminal--link .card-head", ".card-title > .card-link", ".card-desc", ".card-foot", ".card-terminal[data-tone]",
   ".card-terminal--rule", ".card-terminal--rule[data-tone]", ".card-terminal:not(.card-terminal--link):not(.manpage)", "#k2-flash",
   ".card-terminal .value-filter", ".card-terminal .btn-icon[aria-pressed]",
   ".stat-grid", ".stat-tile[data-state='idle']", ".stat-tile[data-state='action']", ".stat-tile[data-state='broken']",
   ".stat-tile[data-state='unknown']", ".stat-tile[data-tone]", "div.stat-tile a.stat-cta", ".stat-tile .ico--xl",
   ".panel .panel-head .ico", ".panel-actions .btn-icon", ".panel-foot .filter-bar-spacer", ".panel-head--eyebrow", ".panel-body--flush",
   ".panel-head .disclosure-btn[aria-expanded='true']", ".panel-body[hidden]", ".panel--mark .panel-mark", ".panel--mark .panel-main",
   ".card-terminal--flush > .row-list--loose", ".row-list--ruled[style*='--row-lead-w']", ".list-row-desc", ".list-row-meta .tag",
   ".row-list--select .list-row[aria-current='true']", ".row-list--select .list-row[aria-selected='true']", ".list-row:disabled",
   ".list-row[aria-current='page']", ".list-row[aria-label*='opens']",
   ".entry-list--ruled .entry .card-link", ".entry .value-filter", ".entry--wide", ".entry--narrow .entry-lead--accent", ".entry--keep",
   ".manpage .manpage-frame", ".manpage .manpage-sect", ".manpage .manpage-body",
   ".tree[role='tree'] [role='treeitem'][aria-expanded='true']", ".tree [aria-expanded='false']", ".tree [aria-selected='true']",
   ".tree .tree-meta .count", ".tree [aria-disabled='true']", ".tree a.tree-row[aria-current='page']",
   ".split > .splitter[aria-orientation='vertical']", ".splitter[aria-orientation='horizontal']", ".split > .pane-collapsed",
   ".pane-collapsed--end", ".split:not(:has(.splitter)) > .split-pane + .split-pane",
   ".clamp[data-clamped]", ".clamp:not([data-clamped])", ".section-head .btn-icon[aria-expanded='false']",
   ".console .console-dots", ".console .console-status .dot--pulse", ".console-line--current", ".console-body mark"]
  .filter((sel) => !document.querySelector(sel)).map((sel) => "missing on the demo page: " + sel)`));

await check("no data-tip on the demo repeats its element's accessible name (X4)", () => evaluate(`
  [...document.querySelectorAll("[data-tip][aria-label]")].filter((el) => el.dataset.tip.trim() === el.getAttribute("aria-label").trim())
    .map((el) => (el.id || el.className) + ": data-tip equals aria-label")`));

await inject();
const full = {};
for (const theme of THEMES) {
  await setTheme(theme);
  await runExpect(`full, ${theme}`);
  full[theme] = await snapshot();
}
await setTheme("warm");
await runGeometry("full");
await noRadius();

/* ── 2. states, in the full stack: hover, motion, print, a coarse pointer, narrow screens ──────── */
// Hover is FORCED on the node (CSS.forcePseudoState), not aimed with the mouse: the assertion is
// about what the stylesheet draws under :hover, and a pointer aimed at a rect is one scroll away
// from hovering the element beside it. Where the question is "where does the click land", the
// geometry checks above ask the hit-test instead.
// ONE DOM.getDocument per batch: each call re-numbers the tree, so a node id taken before a second
// call points at nothing ("Could not find node with given id").
const forcing = async (pseudo, sels, fn) => {
  const ids = [];
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  for (const sel of sels) {
    const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector: sel });
    if (!nodeId) throw new Error(`no node for ${sel}`);
    ids.push(nodeId);
    await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [pseudo] });
  }
  await evaluate(`document.documentElement.classList.add("anim-off"); null`); // no transition mid-read
  try { return await fn(); } finally {
    for (const id of ids) await send("CSS.forcePseudoState", { nodeId: id, forcedPseudoClasses: [] });
    await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
  }
};
const hovering = (sels, fn) => forcing("hover", sels, fn);
const expectRows = (rows) => evaluate(`(${JSON.stringify(rows)}).map((r) => window.__wp8.expect(...r)).filter(Boolean)`);

await check("hover on a --link card is K1's, and the type rule keeps its colour through it", () => hovering(["#fx-card-rule"], () => expectRows([
  ["#fx-card-rule", "", "border-top-color", "var(--primary)"], ["#fx-card-rule", "", "background-color", "var(--secondary)"],
  ["#fx-card-rule", "", "border-left-color", "var(--cat-teal)"]])));
await check("hover on a toned --link card is K1's too — the tone does not outrank the hover", () => hovering(["#fx-card-tone"], () => expectRows([
  ["#fx-card-tone", "", "border-top-color", "var(--primary)"], ["#fx-card-tone", "", "background-color", "var(--secondary)"]])));
await check("hover on a toned card with a rule: K1's edge and fill, and the rule still its type colour", () => hovering(["#fx-card-rule-tone"], () => expectRows([
  ["#fx-card-rule-tone", "", "border-top-color", "var(--primary)"], ["#fx-card-rule-tone", "", "background-color", "var(--secondary)"],
  ["#fx-card-rule-tone", "", "border-left-color", "var(--cat-violet)"]])));
await check("a static card does not react to the pointer", () => hovering(["#fx-card-static"], () => expectRows([
  ["#fx-card-static", "", "border-top-color", "var(--border)"], ["#fx-card-static", "", "background-color", "var(--card)"]])));
await check("hover on a stat tile is K1's, except the state edge, which stays the state; the call to action underlines", () => hovering(["#fx-tile-action"], () => expectRows([
  ["#fx-tile-action", "", "border-top-color", "var(--primary)"], ["#fx-tile-action", "", "background-color", "var(--secondary)"],
  ["#fx-tile-action", "", "border-left-color", "var(--warning)"], ["#fx-tile-action-cta", "", "text-decoration-line", { is: "underline" }]])));
await check("hover on a link row underlines its title (offset 4px); a disabled link row does not", () => hovering(["#fx-row", "#fx-row-aria-disabled"], () => expectRows([
  ["#fx-row-title", "", "text-decoration-line", { is: "underline" }], ["#fx-row-title", "", "text-underline-offset", { is: "4px" }],
  ["#fx-row-aria-disabled-title", "", "text-decoration-line", { is: "none" }]])));
await check("hover in a selection list is the --muted highlight; the current row keeps its marker; a disabled row stays", () =>
  hovering(["#fx-sel", "#fx-sel-current", "#fx-sel-disabled"], () => expectRows([
    ["#fx-sel", "", "background-color", "var(--muted)"], ["#fx-sel-current", "", "background-color", mix("--primary", 12)],
    ["#fx-sel-disabled", "", "background-color", "transparent"]])));
await check("hover on an entry underlines its title link", () => hovering(["#fx-entry"], () => expectRows([
  ["#fx-entry-link", "", "text-decoration-line", { is: "underline" }], ["#fx-entry-link", "", "text-underline-offset", { is: "4px" }]])));
await check("hover on a tree row is --muted and --primary; the selected row keeps its marker; a disabled row does not light", () =>
  hovering(["#fx-tree-leaf-row", "#fx-tree-selected-row", "#fx-tree-disabled-row"], () => expectRows([
    ["#fx-tree-leaf-row", "", "background-color", "var(--muted)"], ["#fx-tree-leaf-row", "", "color", "var(--primary)"],
    ["#fx-tree-selected-row", "", "background-color", mix("--primary", 12)], ["#fx-tree-disabled-row", "", "background-color", "transparent"]])));
await check("hover on a splitter lights its line --primary; hover on the strip turns it --primary", () => hovering(["#fx-vsplit", "#fx-hsplit", "#fx-collapsed"], () => expectRows([
  ["#fx-vsplit", "::before", "background-color", "var(--primary)"], ["#fx-hsplit", "::before", "background-color", "var(--primary)"],
  ["#fx-collapsed", "", "color", "var(--primary)"]])));
await check("a splitter being dragged ([data-dragging]) lights its line --primary", async () => {
  await evaluate(`document.getElementById("fx-vsplit").dataset.dragging = ""; null`);
  const out = await expectRows([["#fx-vsplit", "::before", "background-color", "var(--primary)"]]);
  await evaluate(`delete document.getElementById("fx-vsplit").dataset.dragging; null`);
  return out;
});

await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await check("prefers-reduced-motion stops the outcome flash", () => expectRows([["#fx-card-flash", "", "animation-name", { is: "none" }]]));
await send("Emulation.setEmulatedMedia", { features: [] });
await evaluate(`document.documentElement.classList.add("anim-off"); null`);
await check("html.anim-off stops it too", () => expectRows([["#fx-card-flash", "", "animation-name", { is: "none" }]]));
await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
await check("an untoned card inside a toned box flashes in --primary, not in the box's tone", () => evaluate(`(() => {
  const el = document.getElementById("fx-card-flash-leak"), probe = document.createElement("div");
  probe.style.color = "var(--tone, var(--primary))"; el.append(probe);
  const got = getComputedStyle(probe).color; probe.remove();
  return got === window.__wp8.tok("--primary") ? [] : ["the flash colour resolves to " + got];
})()`));

await send("Emulation.setEmulatedMedia", { media: "print" });
await check("print: no splitter, no strip; panes, a panel body and a console show everything; a clamp opens; nothing splits", () => expectRows([
  ["#fx-vsplit", "", "display", { is: "none" }], ["#fx-hsplit", "", "display", { is: "none" }], ["#fx-collapsed", "", "display", { is: "none" }],
  ["#fx-pane-a", "", "overflow-y", { is: "visible" }], ["#fx-panel-body", "", "overflow-y", { is: "visible" }],
  ["#fx-console-body", "", "overflow-y", { is: "visible" }],
  ["#fx-clamp", "", "max-height", { is: "none" }], ["#fx-clamp", "", "overflow-y", { is: "visible" }], ["#fx-clamp", "::after", "content", { is: "none" }],
  ["#fx-panel", "", "break-inside", { is: "avoid" }], ["#fx-man", "", "break-inside", { is: "avoid" }], ["#fx-row", "", "break-inside", { is: "avoid" }],
  ["#fx-card-flash", "", "animation-name", { is: "none" }]]));
await check("print: a console body takes its content's height", () => W(`[W.near(W.box("#fx-console-body").height, W.q("#fx-console-body").scrollHeight, "console body height vs its content", 1)].filter(Boolean)`));
await send("Emulation.setEmulatedMedia", { media: "" });

const coarse = async () => {
  // Touch emulation is what flips (pointer: coarse) in Chromium; a media-feature override is tried
  // first where the protocol has one. Either way the query is asked, so a failed emulation FAILS.
  try { await send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }] }); } catch {}
  if (!(await evaluate(`matchMedia("(pointer: coarse)").matches`))) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  return evaluate(`matchMedia("(pointer: coarse)").matches`);
};
await check("a coarse pointer: 44px rows, tree rows, strips and link calls to action; a 2.75rem splitter that does not widen the gap", async () => {
  if (!(await coarse())) return ["could not emulate (pointer: coarse) — this check proved nothing"];
  const out = await expectRows([
    ["#fx-sel", "", "min-height", { is: "44px" }], ["#fx-row", "", "min-height", { is: "44px" }], ["#fx-tree-leaf-row", "", "min-height", { is: "44px" }],
    ["#fx-collapsed", "", "min-height", { is: "44px" }], ["#fx-tile-cta-link", "", "min-height", { is: "44px" }], ["#fx-tile-cta", "", "min-height", { is: "auto" }],
    ["#fx-vsplit", "", "width", "2.75rem"], ["#fx-vsplit", "", "margin-left", "-1rem"], ["#fx-vsplit", "", "z-index", { is: "1" }],
    ["#fx-hsplit", "", "height", "2.75rem"], ["#fx-hsplit", "", "margin-top", "-0.875rem"]]);
  const gap = await W(`W.box("#fx-pane-b").left - W.box("#fx-pane-a").right`);
  if (Math.abs(gap - 12) > 0.6) out.push(`the gap between the panes is ${gap}px under a coarse pointer, want the fine pointer's 12px`);
  return out;
});
try { await send("Emulation.setEmulatedMedia", { features: [] }); } catch {}
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

const viewport = (width) => send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
await viewport(600);
await check("below 40rem: an entry stacks (unless --keep), a row title wraps, the man page drops its middle and narrows its indent", () => W(`[
  getComputedStyle(W.q("#fx-entry")).gridTemplateColumns.split(" ").length === 1 ? null : "the entry still has two columns",
  getComputedStyle(W.q("#fx-entry-keep")).gridTemplateColumns.split(" ").length === 2 ? null : "the --keep entry stacked",
  W.expect("#fx-row-title", "", "white-space", { is: "normal" }), W.expect("#fx-man-top-2", "", "display", { is: "none" }),
  W.expect("#fx-man-body", "", "padding-left", "1.25rem")].filter(Boolean)`));
await viewport(700);
await check("below 48rem: panes stack, splitters inside the split go, the strip becomes a bar with its label read across", () => W(`[
  W.expect("#fx-split", "", "flex-direction", { is: "column" }), W.expect("#fx-split", "", "row-gap", "0.75rem"),
  W.expect("#fx-vsplit", "", "display", { is: "none" }), W.expect("#fx-hsplit", "", "display", { is: "grid" }),
  W.expect("#fx-pane-a", "", "flex-grow", { is: "0" }), W.expect("#fx-pane-a", "", "flex-basis", { is: "auto" }),
  W.expect("#fx-fixed-b", "", "border-left-width", { is: "0px" }), W.expect("#fx-pane-b", "", "border-left-width", { is: "1px" }),
  W.expect("#fx-collapsed", "", "flex-direction", { is: "row" }), W.expect("#fx-collapsed", "", "height", "2rem"),
  W.expect("#fx-collapsed", "", "border-bottom-width", { is: "1px" }), W.expect("#fx-collapsed", "", "border-right-width", { is: "0px" }),
  W.expect("#fx-collapsed-label", "", "writing-mode", { is: "horizontal-tb" })].filter(Boolean)`));
await send("Emulation.clearDeviceMetricsOverride");

/* ── 3. tokens.css + cards.css only: the same computed values, focus rings, and `hidden` ──────── */
await load("?bare");
await check("?bare really dropped reset, base, components and chrome", () => evaluate(`
  [...document.styleSheets].map((s) => (s.href || "").split("/").pop()).filter((f) => /^(reset|base|components|chrome)\\.css$/.test(f))
    .map((f) => f + " is still loaded")`));
await inject();
for (const theme of THEMES) {
  await setTheme(theme);
  await runExpect(`tokens only, ${theme}`);
  const bare = await snapshot();
  await check(`tokens-only renders every fixture as the full stack does — ${SNAP_PROPS.length} properties each (${theme})`, () => Object.keys(full[theme])
    .filter((key) => full[theme][key] !== bare[key])
    .map((key) => `${key}: full '${full[theme][key]}', tokens-only '${bare[key]}'`));
}
await setTheme("warm");
await runGeometry("tokens only");

// FOCUS, here and only here (X2): no base.css, so no global :focus-visible can draw a ring the
// component forgot. Tab from a button inserted just before the target, so the focus is a keyboard
// focus and :focus-visible matches.
const tabTo = async (sel) => {
  await evaluate(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); const b = document.createElement("button"); b.id = "fx-before"; b.textContent = "before"; t.before(b); b.focus(); })(); null`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await evaluate(`document.getElementById("fx-before").remove(); null`);
};
const focused = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
  if (document.activeElement !== el) return ["focus did not land on ${sel}: it is on " + (document.activeElement && (document.activeElement.id || document.activeElement.tagName))];
  return el.matches(":focus-visible") ? [] : ["${sel} is focused but not :focus-visible"]; })()`);
const focusCase = async (label, target, rows) => check(`${label} (tokens only — no global ring to lean on)`, async () => {
  await tabTo(target);
  const where = await focused(target);
  if (where.length) return where;
  return expectRows(rows);
});
await focusCase("a --link card draws ONE ring, on the card; the title link draws none", "#fx-card-link",
  [...ring("#fx-card", "2px"), ["#fx-card-link", "", "outline-style", { is: "none" }]]);
await focusCase("an entry draws the ring for its title link, and the link underlines", "#fx-entry-link",
  [...ring("#fx-entry", "2px"), ["#fx-entry-link", "", "outline-style", { is: "none" }], ["#fx-entry-link", "", "text-decoration-line", { is: "underline" }]]);
await focusCase("a stat tile that is a link draws the ring, offset 2px", "#fx-tile", ring("#fx-tile", "2px"));
await focusCase("a link call to action in a static tile draws the ring", "#fx-tile-cta-link", ring("#fx-tile-cta-link", "2px"));
await focusCase("a row that is a button draws an inset ring", "#fx-sel", ring("#fx-sel", "-2px"));
await focusCase("a row that is a link draws an inset ring", "#fx-row", ring("#fx-row", "-2px"));
await focusCase("a focused treeitem rings its ROW, not its subtree", "#fx-tree-branch",
  [...ring("#fx-tree-branch-row", "-2px"), ["#fx-tree-branch", "", "outline-style", { is: "none" }]]);
await focusCase("a tree row that is a link rings itself", "#fx-navtree-parent", ring("#fx-navtree-parent", "-2px"));
await focusCase("a splitter draws an inset ring and lights its line", "#fx-vsplit",
  [...ring("#fx-vsplit", "-2px"), ["#fx-vsplit", "::before", "background-color", "var(--primary)"]]);
await focusCase("the strip a hidden pane leaves draws an inset ring", "#fx-collapsed", ring("#fx-collapsed", "-2px"));
await focusCase("a console body (focusable, so the keyboard can scroll it) draws an inset ring", "#fx-console-body", ring("#fx-console-body", "-2px"));
await evaluate(`document.activeElement && document.activeElement.blur(); null`);

// `hidden` (X3): with tokens.css loaded, `hidden` hides each component whatever display its class sets.
const hiddenSweep = await evaluate(`(() => {
  const out = [], seen = new Set();
  for (const el of document.querySelectorAll("#fx " + ${JSON.stringify(MINE)}.split(", ").join(", #fx ") + ", #fx .card-terminal")) {
    const key = [...el.classList].sort().join(".") + "|" + el.tagName;
    if (seen.has(key)) continue;
    seen.add(key);
    const was = el.hidden;
    el.hidden = true;
    const display = getComputedStyle(el).display;
    el.hidden = was;
    if (display !== "none") out.push((el.id || el.className) + " stays display: " + display + " with hidden set");
  }
  const until = document.createElement("div"); until.className = "panel"; until.setAttribute("hidden", "until-found");
  document.getElementById("fx").append(until);
  if (getComputedStyle(until).display === "none") out.push("hidden=until-found is display: none (it must stay findable)");
  until.remove();
  return { out, n: seen.size };
})()`);
await check(`\`hidden\` hides every element this file styles, whatever display its class sets — ${hiddenSweep.n} class combinations (tokens.css's rule, X3)`,
  () => (hiddenSweep.n < 45 ? [`only ${hiddenSweep.n} class combinations were swept — the sweep read too little`] : hiddenSweep.out));

/* ── 4. forced colours (X1): what reaches the SCREEN, four themes × both palettes ────────────── */
// Every glyph and line this file draws, and every chosen row, is screenshotted and read back as
// pixels. A computed colour cannot tell a chevron painted in its row's forced colour from one left in
// the author's: both are "not Canvas", and the second measures 1.1–1.8:1 on the palette its theme was
// not written for. Emulated: forced-colors active, with prefers-color-scheme light and then dark —
// Chromium picks its light or dark high-contrast palette from it.
// Captured in the viewport (the element scrolled into view first), never with
// captureBeyondViewport: that re-lays the page without its scrollbar and a clip measured before it
// lands up to ~7.5px off.
const clipInk = async (b) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 3 } });
  return W(`W.ink(${JSON.stringify(data)})`);
};
const setHide = (css) => evaluate(`(() => { let s = document.getElementById("wp8-hide");
  if (!s) { s = document.createElement("style"); s.id = "wp8-hide"; document.head.append(s); }
  s.textContent = ${JSON.stringify(css)}; return null; })()`);
// The ink in the clip, and the ink left in the SAME clip with the element's mark hidden. A clip that
// still finds ink with the mark gone is reading something else, and its ratio proves nothing.
const inkOf = async (sel, { lead = false, inset = 0, hide = "" } = {}) => {
  const b = await W(`W.shot(${JSON.stringify(sel)}, ${lead}, ${inset})`);
  const ink = await clipInk(b);
  await setHide(`${sel}${hide} { visibility: hidden !important; }`);
  const blank = await clipInk(b);
  await setHide("");
  return { ...ink, blank: blank.n };
};
const owns = (ink) => ink.blank <= Math.max(2, ink.n * 0.05);
// [what, selector, how to clip it and what to hide to take its mark away]
const CHEVRON = { lead: true, hide: "::before" }, LINE = { inset: 2, hide: "::before" };
const FORCED_GLYPHS = [
  ["an open branch's chevron", "#fx-tree-branch-row", CHEVRON], ["a closed branch's chevron", "#fx-tree-closed-row", CHEVRON],
  ["a navigation branch's chevron (a link row)", "#fx-navtree-parent", CHEVRON], ["a selected branch's chevron", "#fx-tree-selbranch-row", CHEVRON],
  ["a branch's folder glyph (a .ico this file colours)", "#fx-tree-branch-ico", {}], ["a leaf's file glyph (a .ico this file colours)", "#fx-tree-leaf-ico", {}],
  ["a selected leaf's glyph", "#fx-tree-selected-ico", {}], ["a panel head's glyph (a .ico this file colours)", "#fx-panel-ico", {}],
  ["the vertical splitter's line", "#fx-vsplit", LINE], ["the grip", "#fx-hsplit", LINE],
];
// [what, the focusable element, the element that draws its ring, whether the ring sits outside it]
const FORCED_RINGS = [
  ["a current row", "#fx-sel-current", "#fx-sel-current"], ["an aria-selected row", "#fx-sel-selected", "#fx-sel-selected"],
  ["a selected tree row", "#fx-tree-selected", "#fx-tree-selected-row"], ["a current tree link", "#fx-navtree-current", "#fx-navtree-current"],
  ["a control inside a selected tree row", "#fx-tree-selected-action", "#fx-tree-selected-action", true],
  ["a row at rest", "#fx-sel", "#fx-sel"],
];
// [what, the chosen row's words, the resting neighbour's words]
const FORCED_STATES = [
  ["a current row", "#fx-sel-current-title", "#fx-sel-title"], ["an aria-selected row", "#fx-sel-selected-title", "#fx-sel-title"],
  ["a selected tree row", "#fx-tree-selected-label", "#fx-tree-long"], ["a current tree link", "#fx-navtree-current .tree-label", "#fx-navtree-parent .tree-label"],
  ["the current console line", "#fx-console-current", "#fx-console-line"],
];
const forcedCell = async (label, theme, palette) => {
  await setTheme(theme);
  const where = `forced colours${label}, ${theme}, ${palette} palette`;
  // Chromium's Highlight is translucent (0.8), so a Highlight fill reaches the screen composited
  // over the Canvas behind it.
  const env = await W(`(() => { const c = W.over(W.parse(W.sys("Highlight")), W.parse(W.sys("Canvas")));
    return { forced: matchMedia("(forced-colors: active)").matches, dark: matchMedia("(prefers-color-scheme: dark)").matches,
      highlight: [c.r, c.g, c.b].map((v) => Math.round(v * 255)) }; })()`);
  const onHighlight = (rgb) => rgb.slice(4, -1).split(", ").map(Number).every((v, i) => Math.abs(v - env.highlight[i]) <= 2);
  await check(`${where}: precondition — the emulation took`, () =>
    [env.forced ? null : "(forced-colors: active) does not match", env.dark === (palette === "dark") ? null : "prefers-color-scheme is not " + palette].filter(Boolean));
  const faint = [], foreign = [];
  const own = (what, ink) => { if (!owns(ink)) foreign.push(`${what}: ${ink.blank} of its ${ink.n} px of ink stay with its mark hidden`); };
  for (const [what, sel, how] of FORCED_GLYPHS) {
    const ink = await inkOf(sel, how);
    own(what, ink);
    if (!(ink.n >= 30 && ink.strongest >= 3)) faint.push(`${what}: ${ink.strongest.toFixed(2)}:1 at best (${ink.mark} on ${ink.bg}), ${ink.n} px reach 3:1`);
  }
  await check(`${where}: every glyph and line reaches 3:1 on what it sits on (${FORCED_GLYPHS.length}, from pixels)`, () => faint);
  const wrong = [];
  for (const [what, chosen, rest] of FORCED_STATES) {
    const c = await inkOf(chosen, { inset: 1 }), r = await inkOf(rest, { inset: 1 });
    own(what, c);
    own(what + ", the row at rest", r);
    if (!onHighlight(c.bg)) wrong.push(`${what}: its words sit on ${c.bg}, not Highlight (rgb(${env.highlight.join(", ")}) over Canvas)`);
    if (c.bg === r.bg) wrong.push(`${what}: chosen and at rest on the same ${c.bg}`);
    if (c.strongest < 4.5) wrong.push(`${what}: its words reach ${c.strongest.toFixed(2)}:1 (${c.mark} on ${c.bg})`);
    if (r.strongest < 4.5) wrong.push(`${what}, the row at rest: its words reach ${r.strongest.toFixed(2)}:1`);
  }
  await check(`${where}: a chosen row sits on Highlight, its neighbour does not, and both rows' words reach 4.5:1 (${FORCED_STATES.length}, from pixels)`, () => wrong);
  const rest = await inkOf("#fx-hsplit", LINE);
  const lit = await hovering(["#fx-hsplit"], () => inkOf("#fx-hsplit", LINE));
  own("the grip under the pointer", lit);
  await check(`${where}: the grip under the pointer is another colour than at rest, and reaches 3:1`, () =>
    [lit.mark === rest.mark ? `rest and hover are both ${rest.mark}` : null, lit.strongest >= 3 ? null : `hover reaches ${lit.strongest.toFixed(2)}:1`].filter(Boolean));
  // An element under forced-color-adjust: none keeps its author outline-color too. Each focused row's
  // ring is read from a strip along its edge, focused and not: the unfocused strip must be blank, or
  // the ring measured is something else's ink. The focus is a REAL keyboard focus (Tab, as the X2
  // cases do): a :focus-visible forced through DevTools computes an outline that need not paint. A
  // roving treeitem (tabindex -1) is made tabbable for the press, as the focused item of a tree is.
  const rings = [];
  for (const [what, focusable, drawer, outside = false] of FORCED_RINGS) {
    const off = await clipInk(await W(`W.edge(${JSON.stringify(drawer)}, ${outside})`));
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(focusable)});
      el.dataset.tabindexWas = el.getAttribute("tabindex") ?? ""; if (el.tabIndex < 0) el.setAttribute("tabindex", "0"); })(); null`);
    await tabTo(focusable);
    const landed = await focused(focusable);
    const on = await clipInk(await W(`W.edge(${JSON.stringify(drawer)}, ${outside})`));
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(focusable)}); el.blur();
      const was = el.dataset.tabindexWas; delete el.dataset.tabindexWas;
      if (was === "") el.removeAttribute("tabindex"); else el.setAttribute("tabindex", was); })(); null`);
    rings.push(...landed.map((l) => `${what}: ${l}`));
    if (!(on.n >= 30 && on.strongest >= 3)) rings.push(`${what}: its ring reaches ${on.strongest.toFixed(2)}:1 (${on.mark} on ${on.bg}), ${on.n} px`);
    if (off.n > Math.max(2, on.n * 0.05)) rings.push(`${what}: ${off.n} px of ink in the strip unfocused — it reads something else`);
  }
  await check(`${where}: a focused row draws its ring at 3:1 on its own fill, chosen rows included (${FORCED_RINGS.length}, from pixels)`, () => rings);
  await check(`${where}: every clip holds its element's ink — hidden, the mark takes its ink with it (${FORCED_GLYPHS.length + 2 * FORCED_STATES.length + 1} clips)`, () => foreign);
};
for (const palette of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: palette }] });
  await load();
  await inject();
  const sys = await W(`["Canvas", "CanvasText", "Highlight", "HighlightText", "LinkText", "ButtonText"].map((n) => n + " " + W.sys(n)).join(" · ")`);
  console.log(`      ${palette} palette: ${sys}`);
  for (const theme of THEMES) await forcedCell("", theme, palette);
}
// The fallback, as an engine without preserve-parent-color sees it: every @supports block that
// declares it cut out of cards.css (and out of the icon stand-in, when it is in force). The chevron
// is then CanvasText, and HighlightText on a chosen row, where CanvasText would sit on Highlight.
const toFallback = String.raw`(async () => {
  const cut = (css) => css.replace(/@supports \(forced-color-adjust: preserve-parent-color\) \{[^{}]*\{[^{}]*\}\s*\}/g, "");
  const code = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.endsWith("/src/cards.css"));
  const before = await (await fetch(link.href)).text();
  const style = document.createElement("style");
  style.textContent = cut(before);
  link.replaceWith(style);
  const i1 = document.getElementById("standin-i1");
  i1.textContent = cut(i1.textContent);
  const out = [];
  if (!/preserve-parent-color/.test(code(before))) out.push("cards.css declares no preserve-parent-color to cut");
  if (/preserve-parent-color/.test(code(style.textContent) + code(i1.textContent))) out.push("preserve-parent-color survived the cut");
  return out;
})()`;
for (const palette of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: palette }] });
  await load();
  await inject();
  await check(`forced colours, the fallback (${palette} palette): precondition — preserve-parent-color is cut out of cards.css and nothing else`, () => evaluate(toFallback));
  for (const theme of ["warm", "green"]) await forcedCell(" (the fallback)", theme, palette);
}
await send("Emulation.setEmulatedMedia", { features: [] });

/* ── 5. contrast, every new pairing, four themes × three surfaces ────────────────────────────── */
await load();
const TONES = ["primary", "success", "warning", "destructive", "info", "pending", "muted"];
/* Each sample: markup, and what to measure in it. kind: text ≥ 4.5 · glyph ≥ 3 (a non-text mark,
   WCAG 1.4.11) · ring ≥ 3 (a focus indicator) · info (a divider or a decorative edge — reported, not
   gated). fg: the property that paints the mark (colour by default); against: "own" = the element's
   own background over everything under it (default), "outside" = what surrounds the element.
   `hover`: the marked element is forced into :hover before measuring. */
const SAMPLES = [
  { name: "K2 card title", html: `<div class="card-terminal"><h3 class="card-title" data-m>t</h3></div>`, kind: "text" },
  { name: "K2 card description", html: `<div class="card-terminal"><p class="card-desc" data-m>d</p></div>`, kind: "text" },
  { name: "K2 card foot", html: `<div class="card-terminal"><footer class="card-foot" data-m>f</footer></div>`, kind: "text" },
  { name: "K2 card description · hovered --link card", html: `<div class="card-terminal card-terminal--link" data-hover><p class="card-desc" data-m>d</p></div>`, kind: "text" },
  ...TONES.flatMap((t) => [
    { name: `K2 toned card title · ${t}`, html: `<div class="card-terminal" data-tone="${t}"><h3 class="card-title" data-m>t</h3></div>`, kind: "text" },
    { name: `K2 toned card description · ${t}`, html: `<div class="card-terminal" data-tone="${t}"><p class="card-desc" data-m>d</p></div>`, kind: "text" },
    { name: `K2 toned card edge · ${t}`, html: `<div class="card-terminal" data-tone="${t}" data-m>x</div>`, kind: "info", fg: "border-top-color", against: "outside" },
  ]),
  { name: "K2 toned --link card description · hovered (success)", html: `<div class="card-terminal card-terminal--link" data-tone="success" data-hover><p class="card-desc" data-m>d</p></div>`, kind: "text" },
  { name: "K2 type rule · cat-teal", html: `<div class="card-terminal card-terminal--rule" style="--rule-color: var(--cat-teal)" data-m>x</div>`, kind: "info", fg: "border-left-color", against: "outside" },
  { name: "K2 card ring (outside the card)", html: `<div class="card-terminal card-terminal--link" data-m>x</div>`, kind: "ring", against: "outside" },
  { name: "K4 tile label", html: `<div class="stat-tile"><span class="stat-label" data-m>l</span></div>`, kind: "text" },
  { name: "K4 tile value", html: `<div class="stat-tile"><span class="stat-value" data-m>3</span></div>`, kind: "text" },
  { name: "K4 tile note", html: `<div class="stat-tile"><span class="stat-note" data-m>n</span></div>`, kind: "text" },
  { name: "K4 tile call to action", html: `<div class="stat-tile"><span class="stat-cta" data-m>go →</span></div>`, kind: "text" },
  ...["action", "broken"].flatMap((s) => [
    { name: `K4 ${s} · value`, html: `<div class="stat-tile" data-state="${s}"><span class="stat-value" data-m>3</span></div>`, kind: "text" },
    { name: `K4 ${s} · label`, html: `<div class="stat-tile" data-state="${s}"><span class="stat-label" data-m>l</span></div>`, kind: "text" },
    { name: `K4 ${s} · note`, html: `<div class="stat-tile" data-state="${s}"><span class="stat-note" data-m>n</span></div>`, kind: "text" },
    { name: `K4 ${s} · call to action`, html: `<div class="stat-tile" data-state="${s}"><span class="stat-cta" data-m>go</span></div>`, kind: "text" },
    { name: `K4 ${s} · hovered value`, html: `<a class="stat-tile" href="#" data-state="${s}" data-hover><span class="stat-value" data-m>3</span></a>`, kind: "text" },
    { name: `K4 ${s} · hovered note`, html: `<a class="stat-tile" href="#" data-state="${s}" data-hover><span class="stat-note" data-m>n</span></a>`, kind: "text" },
  ]),
  { name: "K4 unknown · value", html: `<div class="stat-tile" data-state="unknown"><span class="stat-value" data-m>—</span></div>`, kind: "text" },
  { name: "K4 data-tone info · label", html: `<div class="stat-tile" data-tone="info"><span class="stat-label" data-m>l</span></div>`, kind: "text" },
  ...["idle", "action", "broken", "unknown"].map((s) => ({ name: `K4 ${s} · state edge`, html: `<div class="stat-tile" data-state="${s}" data-m>x</div>`, kind: "glyph", fg: "border-left-color", against: "outside" })),
  { name: "K4 action · state edge, hovered", html: `<a class="stat-tile" href="#" data-state="action" data-hover data-m>x</a>`, kind: "glyph", fg: "border-left-color", against: "outside" },
  { name: "K4 tile ring", html: `<a class="stat-tile" href="#" data-m>x</a>`, kind: "ring", against: "outside" },
  { name: "K5 panel title", html: `<section class="panel"><header class="panel-head"><h3 class="panel-title" data-m>t</h3></header></section>`, kind: "text" },
  { name: "K5 panel title · eyebrow", html: `<section class="panel"><header class="panel-head panel-head--eyebrow"><h3 class="panel-title" data-m>t</h3></header></section>`, kind: "text" },
  { name: "K5 panel body text", html: `<section class="panel"><div class="panel-body" data-m>b</div></section>`, kind: "text" },
  { name: "K5 panel head glyph (--primary)", html: `<section class="panel"><header class="panel-head"><span class="ico" data-icon="folder-tree" data-m></span></header></section>`, kind: "glyph", fg: "background-color", against: "outside" },
  { name: "K5 identity rail text", html: `<article class="panel panel--mark"><div class="panel-mark" data-m>CX</div><div class="panel-main"></div></article>`, kind: "text" },
  { name: "K5 panel edge", html: `<section class="panel" data-m>x</section>`, kind: "info", fg: "border-top-color", against: "outside" },
  { name: "K6 row title", html: `<ul class="row-list"><li><a class="list-row" href="#"><span class="list-row-title" data-m>t</span></a></li></ul>`, kind: "text" },
  { name: "K6 row lead", html: `<ul class="row-list"><li><a class="list-row" href="#"><span class="list-row-lead" data-m>l</span></a></li></ul>`, kind: "text" },
  { name: "K6 row meta", html: `<ul class="row-list"><li><a class="list-row" href="#"><span class="list-row-meta" data-m>m</span></a></li></ul>`, kind: "text" },
  { name: "K6 row description", html: `<ul class="row-list"><li><a class="list-row" href="#"><span class="list-row-desc" data-m>d</span></a></li></ul>`, kind: "text" },
  { name: "K6 selection title", html: `<ul class="row-list row-list--select"><li><button class="list-row"><span class="list-row-title" data-m>t</span></button></li></ul>`, kind: "text" },
  { name: "K6 selection title · hovered", html: `<ul class="row-list row-list--select"><li><button class="list-row" data-hover><span class="list-row-title" data-m>t</span></button></li></ul>`, kind: "text" },
  { name: "K6 selection meta · hovered", html: `<ul class="row-list row-list--select"><li><button class="list-row" data-hover><span class="list-row-meta" data-m>m</span></button></li></ul>`, kind: "text" },
  { name: "K6 current · title", html: `<ul class="row-list row-list--select"><li><button class="list-row" aria-current="true"><span class="list-row-title" data-m>t</span></button></li></ul>`, kind: "text" },
  { name: "K6 current · lead", html: `<ul class="row-list row-list--select"><li><button class="list-row" aria-current="true"><span class="list-row-lead" data-m>l</span></button></li></ul>`, kind: "text" },
  { name: "K6 current · meta", html: `<ul class="row-list row-list--select"><li><button class="list-row" aria-current="true"><span class="list-row-meta" data-m>m</span></button></li></ul>`, kind: "text" },
  { name: "K6 current · description", html: `<ul class="row-list row-list--select"><li><button class="list-row" aria-current="true"><span class="list-row-desc" data-m>d</span></button></li></ul>`, kind: "text" },
  { name: "K6 current · title, hovered", html: `<ul class="row-list row-list--select"><li><button class="list-row" aria-current="true" data-hover><span class="list-row-title" data-m>t</span></button></li></ul>`, kind: "text" },
  { name: "K6 current · edge marker", html: `<ul class="row-list"><li><button class="list-row" aria-current="true" data-m>x</button></li></ul>`, kind: "glyph", fg: "--edge" },
  { name: "K6 row ring (inset, rest)", html: `<ul class="row-list"><li><button class="list-row" data-m>x</button></li></ul>`, kind: "ring" },
  { name: "K6 row ring (inset, on the current row)", html: `<ul class="row-list"><li><button class="list-row" aria-current="true" data-m>x</button></li></ul>`, kind: "ring" },
  { name: "K6 hairline between rows", html: `<ul class="row-list"><li>a</li><li data-m>b</li></ul>`, kind: "info", fg: "border-top-color", against: "outside" },
  { name: "K7 entry lead", html: `<ol class="entry-list"><li class="entry"><span class="entry-lead" data-m>2026</span><div></div></li></ol>`, kind: "text" },
  { name: "K7 entry lead · accent", html: `<ol class="entry-list"><li class="entry"><span class="entry-lead entry-lead--accent" data-m>2026</span><div></div></li></ol>`, kind: "text" },
  { name: "K7 entry title", html: `<ol class="entry-list"><li class="entry"><span class="entry-lead">x</span><div><p class="entry-title" data-m>t</p></div></li></ol>`, kind: "text" },
  { name: "K7 entry description", html: `<ol class="entry-list"><li class="entry"><span class="entry-lead">x</span><div><p class="entry-desc" data-m>d</p></div></li></ol>`, kind: "text" },
  { name: "K7 entry ring (outside the entry)", html: `<ol class="entry-list"><li class="entry" data-m><span class="entry-lead">x</span><div></div></li></ol>`, kind: "ring", against: "outside" },
  { name: "K8 man page frame", html: `<article class="card-terminal manpage"><p class="manpage-frame" data-m><span>A(1)</span></p></article>`, kind: "text" },
  { name: "K8 man page section", html: `<article class="card-terminal manpage"><h2 class="manpage-sect" data-m>NAME</h2></article>`, kind: "text" },
  { name: "K8 man page body", html: `<article class="card-terminal manpage"><div class="manpage-body" data-m>b</div></article>`, kind: "text" },
  { name: "K9 tree label", html: `<ul class="tree"><li><span class="tree-row" data-m>x</span></li></ul>`, kind: "text" },
  { name: "K9 tree label · hovered", html: `<ul class="tree"><li><span class="tree-row" data-hover data-m>x</span></li></ul>`, kind: "text" },
  { name: "K9 tree label · selected", html: `<ul class="tree"><li aria-selected="true"><span class="tree-row" data-m>x</span></li></ul>`, kind: "text" },
  { name: "K9 tree meta", html: `<ul class="tree"><li><span class="tree-row"><span class="tree-meta" data-m>3</span></span></li></ul>`, kind: "text" },
  { name: "K9 tree meta · selected", html: `<ul class="tree"><li aria-selected="true"><span class="tree-row"><span class="tree-meta" data-m>3</span></span></li></ul>`, kind: "text" },
  { name: "K9 chevron · rest", html: `<ul class="tree"><li aria-expanded="false"><span class="tree-row" data-m>x</span></li></ul>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "K9 chevron · hovered row", html: `<ul class="tree"><li aria-expanded="false"><span class="tree-row" data-hover data-m>x</span></li></ul>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "K9 chevron · selected row", html: `<ul class="tree"><li aria-expanded="false" aria-selected="true"><span class="tree-row" data-m>x</span></li></ul>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "K9 leaf glyph (muted)", html: `<ul class="tree"><li><span class="tree-row"><span class="ico" data-icon="file" data-m></span></span></li></ul>`, kind: "glyph", fg: "background-color", against: "outside" },
  { name: "K9 branch glyph (--primary)", html: `<ul class="tree"><li aria-expanded="true"><span class="tree-row"><span class="ico" data-icon="folder-open" data-m></span></span></li></ul>`, kind: "glyph", fg: "background-color", against: "outside" },
  { name: "K9 branch glyph · hovered row", html: `<ul class="tree"><li aria-expanded="true"><span class="tree-row" data-hover><span class="ico" data-icon="folder-open" data-m></span></span></li></ul>`, kind: "glyph", fg: "background-color", against: "outside" },
  { name: "K9 leaf glyph · selected row", html: `<ul class="tree"><li aria-selected="true"><span class="tree-row"><span class="ico" data-icon="file" data-m></span></span></li></ul>`, kind: "glyph", fg: "background-color", against: "outside" },
  { name: "K9 row ring (inset, on the selected row)", html: `<ul class="tree"><li aria-selected="true"><span class="tree-row" data-m>x</span></li></ul>`, kind: "ring" },
  { name: "K9 guide per level", html: `<ul class="tree"><li><ul role="group" data-m><li>x</li></ul></li></ul>`, kind: "info", fg: "border-left-color", against: "outside" },
  { name: "K10 splitter line · rest", html: `<div class="splitter" aria-orientation="vertical" style="height: 2rem" data-m></div>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "K10 grip · rest", html: `<div class="splitter" data-m></div>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "K10 splitter line · hovered", html: `<div class="splitter" aria-orientation="vertical" style="height: 2rem" data-hover data-m></div>`, kind: "glyph", pseudo: "::before", fg: "background-color" },
  { name: "K10 splitter ring (inset)", html: `<div class="splitter" data-m></div>`, kind: "ring" },
  { name: "K10 strip label", html: `<button class="pane-collapsed"><span data-m>files</span></button>`, kind: "text" },
  { name: "K10 strip label · hovered", html: `<button class="pane-collapsed" data-hover><span data-m>files</span></button>`, kind: "text" },
  { name: "K10 strip ring (inset)", html: `<button class="pane-collapsed" data-m><span>files</span></button>`, kind: "ring" },
  { name: "K10 strip rule / pane hairline", html: `<button class="pane-collapsed" data-m><span>files</span></button>`, kind: "info", fg: "border-right-color", against: "outside" },
  { name: "K12 console title", html: `<section class="console"><header class="console-bar"><h3 class="console-title" data-m>t</h3></header></section>`, kind: "text" },
  { name: "K12 console status", html: `<section class="console"><header class="console-bar"><p class="console-status" data-m>live</p></header></section>`, kind: "text" },
  { name: "K12 console body", html: `<section class="console"><div class="console-body" data-m>x</div></section>`, kind: "text" },
  { name: "K12 console current line", html: `<section class="console"><div class="console-body"><div class="console-line--current" data-m>x</div></div></section>`, kind: "text" },
  { name: "K12 console body ring (inset)", html: `<section class="console"><div class="console-body" data-m>x</div></section>`, kind: "ring" },
  { name: "K12 console dots", html: `<section class="console"><header class="console-bar"><span class="console-dots" data-m></span></header></section>`, kind: "info", pseudo: "::before", fg: "background-color" },
];
const SURFACES = ["background", "card", "muted"];
const MIN = { text: 4.5, glyph: 3, ring: 3 };
const table = new Map(); // name → { kind, theme → [bg, card, muted] }
for (const theme of THEMES) {
  await setTheme(theme);
  await evaluate(`(() => {
    const host = document.createElement("div"); host.id = "cx"; document.body.append(host);
    host.innerHTML = ${JSON.stringify(SURFACES)}.map((surface) => '<div data-surface="' + surface + '" style="padding: 8px; background: var(--' + surface + '); color: var(--foreground)">' +
      ${JSON.stringify(SAMPLES)}.map((s, i) => '<div data-sample="' + i + '">' + s.html + "</div>").join("") + "</div>").join("");
  })(); null`);
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeIds } = await send("DOM.querySelectorAll", { nodeId: doc.nodeId, selector: "#cx [data-hover]" });
  for (const id of nodeIds) await send("CSS.forcePseudoState", { nodeId: id, forcedPseudoClasses: ["hover"] });
  await evaluate(`document.documentElement.classList.add("anim-off"); null`);
  const results = await evaluate(`(() => {
    const W = window.__wp8, out = [], samples = ${JSON.stringify(SAMPLES)};
    for (const wrap of document.querySelectorAll("#cx [data-sample]")) {
      const s = samples[wrap.dataset.sample], el = wrap.querySelector("[data-m]"), surface = wrap.parentElement.dataset.surface;
      const cs = getComputedStyle(el, s.pseudo || null);
      let fg, bg;
      if (s.kind === "ring") {
        fg = W.parse(W.tok("--ring"));
        bg = s.against === "outside" ? W.behind(el.parentElement) : W.behind(el);
      } else if (s.fg === "--edge") {
        // the current row's inset edge: --primary over the row's own tint
        fg = W.over(W.parse(W.tok("--primary")), W.behind(el)); bg = W.behind(el);
      } else if (s.against === "outside") {
        const under = W.behind(el.parentElement), mark = W.parse(cs.getPropertyValue(s.fg));
        mark.a *= W.alpha(el, s.pseudo);
        fg = W.over(mark, W.over(W.parse(getComputedStyle(el).backgroundColor), under));
        bg = under;
      } else {
        bg = W.behind(el);
        const mark = W.parse(cs.getPropertyValue(s.fg || "color"));
        mark.a *= W.alpha(el, s.pseudo);
        fg = W.over(mark, bg);
      }
      out.push([s.name, s.kind, surface, W.ratio(fg, bg)]);
    }
    document.getElementById("cx").remove();
    return out;
  })()`);
  await evaluate(`document.documentElement.classList.remove("anim-off"); null`);
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
  ? `\ncheck-cards: ${failures} FAILED (last check to pass: ${lastPassed})`
  : "\ncheck-cards: all checks passed");
process.exit(failures ? 1 : 0);
