#!/usr/bin/env node
/*
 * check-controls.mjs — src/controls.css, measured in a real browser on examples/controls.html.
 *
 * WHY A BROWSER AND NOT A GREP. Every rule in controls.css is a claim about what the browser COMPUTES:
 * that a state rule outranks another (the :where() levelling in .btn-icon is invisible in a diff and
 * decides whether a bare button grows an edge under the pointer), that a colour pairing clears AA on
 * four themes and three surfaces, that a hidden file input is still reachable with Tab. This estate has
 * twice shipped CSS that read correctly and computed otherwise (check-release.mjs #6 records one). So
 * each claim here is asserted against getComputedStyle, with :hover and :focus-visible FORCED through
 * the DevTools protocol, keys and clicks DISPATCHED rather than synthesised, and the coarse pointer,
 * reduced motion, print and forced colours EMULATED. Where the computed style can be right while the
 * screen is wrong (a forced-colours backplate), the screen is read.
 *
 * WHAT IT COVERS, in the order below:
 *   · each element's box, edge, colour and every state (rest, hover, pressed, disabled, busy)
 *   · busy keeps keyboard focus on the button for the whole press, and ignores a second press; an
 *     aria-disabled button does nothing in any of the demo's handlers (remove, bin, confirm)
 *   · the drop zone's keyboard path: Tab reaches the hidden input and rings the ZONE; a mouse click
 *     opens the picker and draws no ring; Space opens it too. Its drag state survives WebKit's null
 *     dragleave.relatedTarget
 *   · a revealed action waits for the pointer, except a pressed toggle, which shows at rest
 *   · BARE MODE, with base.css and components.css switched off:
 *       - every focus ring. base.css draws the same 2px ring on every element, so with it loaded a
 *         control whose own :focus-visible rule was deleted still passed; switched off, only the
 *         control's own rule can draw it
 *       - self-sufficiency: box, edge, colours, font family and size, and states compute the same
 *         with the two files and without them
 *       - every control that shows text follows the page's font. A button does not inherit it by
 *         default, so one that lost `font: inherit` renders in the browser's 13.33px Arial, beside
 *         base.css or not
 *   · no radius anywhere except the radio, which is a circle
 *   · 44px under a coarse pointer; revealed actions visible under (hover: none), and a DISABLED one
 *     still .45; reduced motion; print
 *   · FORCED COLOURS, on 4 themes x a light and a dark forced palette, and again as an engine without
 *     preserve-parent-color renders it: every on / off, checked / unchecked / indeterminate, pressed /
 *     unpressed and chosen / not pair paints two different colours; every glyph, mark and knob reaches
 *     3:1 and every word on a redrawn state 4.5:1; a part that opts out of forcing paints only system
 *     colours; and the PIXELS are read, because a text backplate paints over a word whose computed
 *     colours are perfect
 *   · `hidden` hides every control (X3), measured on a page of tokens.css and controls.css alone; the
 *     [hidden] rule is stood in there only while tokens.css lacks it, and DD_FORBID_STANDINS=1 fails
 *     the run instead
 *   · CONTRAST: every new text and edge pairing, on warm / green / mono / paper, over --background,
 *     --card and --muted. Text >= 4.5:1, control edges and glyphs >= 3:1. The table it prints is the
 *     one in the release notes. Pressed is told from hovered on every theme.
 *
 * It reads the demo page because the demo is where every state is rendered once. If the page loses a
 * `data-t` hook, the check fails on the missing element; it never passes over an empty selection.
 *
 * If no browser is on the machine it SKIPS loudly rather than failing (DD_REQUIRE_BROWSER=1 makes a
 * skip a failure, for CI). The DevTools port is chosen by the browser (0) and read back from
 * DevToolsActivePort, so this can run beside the other suites without a port collision.
 *
 *   node scripts/check-controls.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
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
  console.log("check-controls: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts computed styles, forced :hover/:focus-visible, dispatched keys and emulated");
  console.log("  media, none of which a stub can prove. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the worktree, served read-only (the page loads ../src and ../runtime by relative url) ── */
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

// X3 is measured on a page of its own: tokens.css and controls.css and nothing else (no demo, no
// stand-in block), every control with `hidden`. `?standin` adds WP1's rule, spelt as WP1 spells it,
// and the check only asks for that page while tokens.css does not hide the controls by itself.
const HIDDEN_PAGE = (standin) => `<!doctype html><html lang="en" data-theme="warm"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/controls.css">
${standin ? '<style id="x3-standin">[hidden]:not([hidden="until-found" i]) { display: none !important; }</style>' : ""}</head><body>
<button type="button" class="btn-icon" data-icon="x" aria-label="shown" id="shown"></button>
<button type="button" class="btn-icon" data-icon="x" aria-label="x" hidden data-case=".btn-icon"></button>
<button type="button" class="btn-icon btn-icon--sm" data-icon="x" aria-label="x" hidden data-case=".btn-icon--sm"></button>
<button type="button" role="switch" aria-checked="true" class="switch" hidden data-case=".switch">follow</button>
<input type="checkbox" aria-label="x" hidden data-case="checkbox"><input type="radio" aria-label="x" hidden data-case="radio">
<label class="check" hidden data-case=".check"><input type="checkbox"> label</label>
<div class="btn-group" hidden data-case=".btn-group"><button type="button" class="btn-icon" data-icon="x" aria-label="x"></button></div>
<div class="form-actions" hidden data-case=".form-actions"><button type="button">save</button></div>
<div class="form-actions"><p class="form-status" hidden data-case=".form-status">saved</p></div>
<div class="btn-row" hidden data-case=".btn-row"><button type="button">run</button></div>
<div class="segmented" hidden data-case=".segmented"><button type="button" aria-pressed="true">a</button></div>
<div class="segmented"><button type="button" aria-pressed="false" hidden data-case=".segmented > button">b</button></div>
<div class="choice-grid" hidden data-case=".choice-grid"></div>
<button type="button" class="choice-card" aria-pressed="false" hidden data-case=".choice-card"><span class="choice-title">t</span></button>
<label class="dropzone" data-icon="x" hidden data-case=".dropzone"><input type="file"> drop</label>
<ul class="thumb-grid" hidden data-case=".thumb-grid"></ul>
<ul class="thumb-grid"><li class="thumb" hidden data-case=".thumb"></li></ul>
<div class="reveal-host"><span class="reveal btn-row" hidden data-case=".reveal"><button type="button">a</button></span></div>
<span class="confirm-inline" hidden data-case=".confirm-inline"><button type="button">remove</button></span>
<span class="confirm-inline-note" hidden data-case=".confirm-inline-note">note</span>
<div class="confirm-code" hidden data-case=".confirm-code"></div>
<div class="confirm-code"><input class="confirm-code-input" aria-label="x" hidden data-case=".confirm-code-input"><p class="confirm-code-status" hidden data-case=".confirm-code-status">x</p></div>
</body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__harness/hidden.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HIDDEN_PAGE(url.searchParams.has("standin")));
    return;
  }
  const path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root + sep) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": (TYPES[extname(path)] || "application/octet-stream") + "; charset=utf-8" });
  res.end(readFileSync(path));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PAGE = `${ORIGIN}/examples/controls.html`;

/* ── the browser ── */
const profile = mkdtempSync(join(tmpdir(), "dd-controls-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new", "--no-first-run",
  "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
const shutdown = () => {
  try { socket?.close(); } catch {}
  chrome.kill("SIGKILL");
  server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 10 });
};
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
const events = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method) { events.push(message.method); return; }
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

let failures = 0;
let last = "(before the first check)"; // the last check to PASS
// `condition` may be a (synchronous) thunk: a throw inside it is that check's FAIL, and the suite goes on.
const check = (label, condition, detail) => {
  try { condition = typeof condition === "function" ? condition() : condition; } catch (error) {
    condition = false; detail = `threw: ${String(error?.message || error).split("\n")[0]}`;
  }
  if (typeof condition?.then === "function") { condition = false; detail = "handed a promise: await the measurement before the check"; }
  if (condition) { console.log(`PASS  ${label}`); last = label; return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};
// A throw (a hook the page lost, a selector that matches nothing) is a FAIL naming where the suite got
// to, never a bare stack: a mutation that aborts the run must read as detected, and say where.
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, (error) => {
    console.log(`FAIL  the suite threw after "${last}"\n        ${error?.message ?? error}`);
    console.log("\ncheck-controls: FAILED (aborted)");
    process.exit(1);
  });
}

/*
 * In-page helpers. `el()` THROWS on a missing selector, so a renamed hook fails loudly instead of the
 * check comparing undefined with undefined. Colours are parsed from what Chrome computes: rgb(), rgba()
 * and color(srgb …), which is how it serialises every color-mix().
 */
const HELPERS = `
window.__c = (() => {
  const el = (sel, from = document) => { const n = from.querySelector(sel); if (!n) throw new Error("no element for " + sel); return n; };
  const cs = (sel, pseudo) => getComputedStyle(typeof sel === "string" ? el(sel) : sel, pseudo || null);
  const rect = (sel) => { const r = el(sel).getBoundingClientRect(); return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, x: r.left, y: r.top }; };
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
  // What a colour is painted OVER: the surface panel, then every background between it and the node.
  const under = (node, inclusive = true) => {
    const chain = [];
    for (let n = inclusive ? node : node.parentElement; n && !n.matches("[data-surface]"); n = n.parentElement) chain.push(n);
    const panel = node.closest("[data-surface]");
    let colour = parse(getComputedStyle(panel).backgroundColor);
    for (const n of chain.reverse()) colour = over(parse(getComputedStyle(n).backgroundColor), colour);
    return colour;
  };
  // The same colour, resolved the way the page resolves it (tokens, color-mix, var()).
  const resolve = (value, prop = "color") => {
    const probe = document.createElement("i");
    probe.style.setProperty(prop, value);
    document.body.append(probe);
    const out = getComputedStyle(probe).getPropertyValue(prop);
    probe.remove();
    return out;
  };
  const same = (a, b) => { const p = parse(a), q = parse(b); return p.every((v, i) => Math.abs(v - q[i]) < 0.004); };
  const firstColour = (image) => /(color\\(srgb[^)]*\\)|rgba?\\([^)]*\\))/.exec(image)[1];
  return { el, cs, rect, parse, over, ratio, under, resolve, same, firstColour };
})();
null`;

const load = async () => {
  await send("Page.navigate", { url: PAGE });
  for (let i = 0; i < 100; i += 1) {
    await sleep(100);
    try {
      if (await evaluate("document.readyState === 'complete' && document.querySelectorAll('[data-surface] [data-probe]').length > 0 && !!document.querySelector('.select-field')")) break;
    } catch {}
  }
  await evaluate(HELPERS);
  // base.css scrolls smoothly; a click aimed at a rect measured while the page is still moving lands
  // somewhere else. The check is about the controls, not about scrolling.
  await evaluate("document.documentElement.style.scrollBehavior = 'auto'; null");
};

// :hover, :focus-visible and :focus-within forced on ONE node through the protocol, so a state rule
// is exercised without a pointer or a keyboard and without depending on what else is hovered.
const force = async (selector, states) => {
  const { root: doc } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  if (!nodeId) throw new Error(`no node to force ${states} on: ${selector}`);
  await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
  return async () => send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
};
const withForced = async (selector, states, expression) => {
  const release = await force(selector, states);
  try { return await evaluate(expression); } finally { await release(); }
};
const key = async (keyName, code, keyCode, text) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: keyCode, text });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: keyCode });
};

await send("Runtime.enable");
await send("Page.enable");
await send("DOM.enable");
await send("CSS.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await load();
// Transitions are .15s; a computed style read mid-transition is a colour halfway between two states.
// html.anim-off is the estate's switch that stops them (F6), so the state checks read end states.
await evaluate("document.documentElement.classList.add('anim-off'); null");

const T = (id) => `[data-t="${id}"]`;

/* ── .btn-icon ────────────────────────────────────────────────────────────────── */

let s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const b = cs('${T("rest")}'), g = cs('${T("rest")}', '::before');
  return { rect: rect('${T("rest")}'), glyph: [g.width, g.height], edge: same(b.borderTopColor, resolve('var(--control-edge)')),
    bw: b.borderTopWidth, style: b.borderTopStyle, radius: b.borderTopLeftRadius, sizing: b.boxSizing, cursor: b.cursor,
    bg: b.backgroundColor, ink: same(b.color, resolve('var(--primary)')), glyphInk: same(g.backgroundColor, b.color),
    mask: g.maskImage === resolve('var(--ico-refresh-cw)', 'mask-image') }; })()`);
check(".btn-icon is one 28px square at --control-h", s.rect.w === 28 && s.rect.h === 28, s.rect);
check("...edged in --control-edge, 1px solid, square, border-box", s.edge && s.bw === "1px" && s.style === "solid" && s.radius === "0px" && s.sizing === "border-box", s);
check("...transparent, --primary, with a 14px glyph painted in currentColor through the named mask",
  s.bg === "rgba(0, 0, 0, 0)" && s.ink && s.glyphInk && s.glyph.join() === "14px,14px" && s.mask && s.cursor === "pointer", s);

s = await withForced(T("rest"), ["hover"], `(() => { const { cs, resolve, same } = __c; const b = cs('${T("rest")}');
  return { edge: same(b.borderTopColor, b.color), fill: same(b.backgroundColor, resolve('color-mix(in srgb, var(--primary) 12%, transparent)')) }; })()`);
check("hover: the edge takes the glyph's colour and a 12% wash fills the box", s.edge && s.fill, s);

// PRESSED IS SOLID (the lead's ruling): a --primary fill and edge, the glyph in --primary-foreground,
// on the bordered and the bare button alike, and it stays that way under the pointer. Expanded keeps
// the hover look, because an open menu is not a state the reader set.
const PRESSED = (id) => `(() => { const { cs, resolve, same } = __c; const b = cs('${T(id)}'), g = cs('${T(id)}', '::before');
  return { fill: same(b.backgroundColor, resolve('var(--primary)')), edge: same(b.borderTopColor, resolve('var(--primary)')),
    ink: same(b.color, resolve('var(--primary-foreground)')) && same(g.backgroundColor, b.color), look: [b.backgroundColor, b.borderTopColor, b.color].join('|') }; })()`;
for (const [id, name] of [["star-on", "a bordered toggle"], ["bare-on", "a --bare toggle"]]) {
  s = await evaluate(PRESSED(id));
  check(`pressed is SOLID on ${name}: --primary fill and edge, the glyph in --primary-foreground`, s.fill && s.edge && s.ink, s);
  const hovered = await withForced(T(id), ["hover"], PRESSED(id));
  check(`...and ${name} stays solid under the pointer`, hovered.look === s.look, { rest: s.look, hovered: hovered.look });
}
s = await evaluate(`(() => { const { cs, resolve, same } = __c; const exp = cs('${T("expanded")}');
  return { wash: same(exp.backgroundColor, resolve('color-mix(in srgb, var(--primary) 12%, transparent)')), edge: same(exp.borderTopColor, exp.color),
    filled: cs('${T("star-on")}', '::before').maskImage === resolve('var(--ico-star-filled)', 'mask-image'),
    outline: cs('${T("star")}', '::before').maskImage === resolve('var(--ico-star)', 'mask-image') }; })()`);
check("expanded keeps the hover look without a pointer", s.wash && s.edge, s);
check("a pressed star is the FILLED star; an unpressed one the outline", s.filled && s.outline, s);
s = await evaluate(`(() => { const { el, cs, resolve, same } = __c; const b = cs(el('[data-surface="background"] [data-probe="tone-destructive-pressed"]'));
  return [same(b.backgroundColor, resolve('var(--destructive)')), same(b.borderTopColor, resolve('var(--destructive)')), same(b.color, resolve('var(--primary-foreground)'))]; })()`);
check("a TONED pressed toggle fills with its tone instead", s.every(Boolean), s);

for (const id of ["disabled", "aria-disabled"]) {
  s = await withForced(T(id), ["hover"], `(() => { const { cs, resolve, same } = __c; const b = cs('${T(id)}');
    return { op: b.opacity, cursor: b.cursor, edge: same(b.borderTopColor, resolve('var(--control-edge)')), bg: b.backgroundColor }; })()`);
  check(`${id}: .45, default cursor, and no hover under a forced :hover`, s.op === "0.45" && s.cursor === "default" && s.edge && s.bg === "rgba(0, 0, 0, 0)", s);
}

// BUSY is aria-busy + aria-disabled, never `disabled` (X5): the spinner at FULL strength, because a
// busy button is working, not unavailable.
s = await evaluate(`(() => { const { el, cs, resolve } = __c; const b = el('${T("busy")}'), g = cs(b, '::before');
  return { mask: g.maskImage === resolve('var(--ico-loader-circle)', 'mask-image'), op: cs(b).opacity, cursor: cs(b).cursor,
    attrs: [b.getAttribute('aria-busy'), b.getAttribute('aria-disabled'), b.disabled] }; })()`);
check("aria-busy: the glyph becomes the loader (the animation is asserted with motion on, below)", s.mask, s);
check("...drawn at FULL strength with a progress cursor, never the disabled .45", s.op === "1" && s.cursor === "progress", s);
check("...and the demo marks it aria-busy + aria-disabled, never `disabled`", s.attrs.join() === "true,true,false", s.attrs);

// The live cycle, with REAL keys: Enter on the focused button starts it, a second Enter while it runs
// is ignored, and focus stays on the button the whole time. `disabled` would have thrown focus to
// <body> the moment the press began.
await evaluate(`__c.el('${T("busy-live")}').focus(); null`);
await key("Enter", "Enter", 13, "\r");
await sleep(50);
s = await evaluate(`(() => { const b = __c.el('${T("busy-live")}'); return { busy: b.getAttribute('aria-busy'), ariaDisabled: b.getAttribute('aria-disabled'), disabled: b.disabled, focused: document.activeElement === b, op: getComputedStyle(b).opacity }; })()`);
check("busy cycle: a press sets aria-busy and aria-disabled, not `disabled`", s.busy === "true" && s.ariaDisabled === "true" && s.disabled === false, s);
check("...focus STAYS on the button while it is busy, and the spinner is full strength", s.focused && s.op === "1", s);
await key("Enter", "Enter", 13, "\r");
await sleep(50);
s = await evaluate(`__c.el('${T("busy-live")}').dataset.demoRuns`);
check("...a second press while busy is ignored", s === "1", s);
await sleep(1600);
s = await evaluate(`(() => { const b = __c.el('${T("busy-live")}'); return { busy: b.getAttribute('aria-busy'), ariaDisabled: b.getAttribute('aria-disabled'), focused: document.activeElement === b }; })()`);
check("...and when it ends, focus is still on the button (the page never had to put it back)", s.busy === null && s.ariaDisabled === null && s.focused, s);
await evaluate("document.activeElement.blur(); null");

s = await evaluate(`(() => { const { cs, rect } = __c; const g = cs('${T("sm")}', '::before'); return { r: rect('${T("sm")}'), g: [g.width, g.height] }; })()`);
check("--sm is 24px with a 12px glyph", s.r.w === 24 && s.r.h === 24 && s.g.join() === "12px,12px", s);

s = await withForced(T("bare"), ["hover"], `(() => { const { cs, resolve, same } = __c; const b = cs('${T("bare")}');
  return { ink: same(b.color, resolve('var(--primary)')), bg: same(b.backgroundColor, resolve('var(--muted)')), edge: b.borderTopColor }; })()`);
const bareRest = await evaluate(`(() => { const { cs, resolve, same } = __c; const b = cs('${T("bare")}');
  return { ink: same(b.color, resolve('var(--muted-foreground)')), edge: b.borderTopColor }; })()`);
check("--bare rests edgeless in --muted-foreground", bareRest.ink && bareRest.edge === "rgba(0, 0, 0, 0)", bareRest);
check("--bare hover: --primary on --muted, and still NO edge (the :where() levelling)", s.ink && s.bg && s.edge === "rgba(0, 0, 0, 0)", s);

for (const id of ["destructive", "bare-tone"]) {
  s = await withForced(T(id), ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T(id)}').color, resolve('var(--destructive)')); })()`);
  check(`data-tone on ${id === "bare-tone" ? "a --bare button" : "a button"} stays the tone under the pointer`, s);
}
s = await evaluate(`(() => { const { cs, resolve, same } = __c; const b = __c.el('${T("in-tone")}');
  return [getComputedStyle(b).getPropertyValue('--tone') !== '', same(cs(b).color, resolve('var(--muted-foreground)'))]; })()`);
check("--tone does not leak: an untoned .btn-icon inside a [data-tone] keeps its own colour", s.join() === "true,true", s);

s = await evaluate(`(() => { const svg = __c.cs('${T("svg")} > svg'); return [svg.width, svg.height]; })()`);
check("an <svg> child is sized to the glyph, 14px", s.join() === "14px,14px", s);

/* ── .btn-group ───────────────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs } = __c; const kids = [...document.querySelectorAll('${T("group-icons")} > *')].map((k) => getComputedStyle(k));
  const sort = [...document.querySelectorAll('${T("group-sort")} > *')];
  return { margins: kids.map((k) => k.marginLeft), pressedZ: kids[2].zIndex, pos: kids[2].position,
    field: sort[1].className, fieldH: Math.round(sort[1].getBoundingClientRect().height), iconH: Math.round(sort[0].getBoundingClientRect().height), fieldM: getComputedStyle(sort[1]).marginLeft }; })()`);
check(".btn-group: every child after the first overlaps by 1px", s.margins.join() === "0px,-1px,-1px", s.margins);
check("...the pressed child is lifted (z-index 1)", s.pressedZ === "1" && s.pos === "relative", s);
check("...an enhanced select joins it, and the icon button beside it stretches to the same height",
  s.field === "select-field" && s.fieldH === s.iconH && s.iconH >= 28 && s.fieldM === "-1px", s);
s = await evaluate(`[...document.querySelectorAll('${T("group-icons")} > .btn-icon')].map((b) => { const r = b.getBoundingClientRect(); return r.width + 'x' + r.height; })`);
check("...and a group of icon buttons alone stays 28px square", s.every((v) => v === "28x28"), s);
s = await withForced(`${T("group-icons")} > :first-child`, ["hover"], `__c.cs('${T("group-icons")} > :first-child').zIndex`);
check("...a hovered child is lifted (z-index 1)", s === "1", s);
s = await withForced(`${T("group-icons")} > :nth-child(2)`, ["focus-within"], `__c.cs('${T("group-icons")} > :nth-child(2)').zIndex`);
check("...and a focused one above that (z-index 2), so its ring is never cut", s === "2", s);

/* ── .form-actions and .btn-row ───────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, resolve, same } = __c; const a = cs('${T("actions")}'), st = cs('${T("actions")} .form-status');
  const r = cs('${T("actions-ruled")}'), row = cs('${T("btn-row")}');
  const long = __c.el('${T("status-long")}'), last = long.parentElement.lastElementChild;
  return { a: [a.display, a.flexWrap, a.justifyContent, a.alignItems, a.columnGap, a.marginTop],
    status: same(st.color, resolve('var(--muted-foreground)')) && st.marginTop === '0px' && st.textOverflow === 'ellipsis' && st.whiteSpace === 'nowrap',
    ruled: [r.borderTopWidth, r.borderTopStyle, same(r.borderTopColor, resolve('var(--border)')), r.paddingTop],
    truncated: long.scrollWidth > long.clientWidth, oneLine: Math.abs(long.getBoundingClientRect().top - last.getBoundingClientRect().top) < 8,
    row: [row.display, row.flexWrap, row.alignItems, row.columnGap] }; })()`);
check(".form-actions: a wrapping flex row, right-aligned, 8px apart, 16px under the form", s.a.join() === "flex,wrap,flex-end,center,8px,16px", s.a);
check("...the status is muted, unmargined and truncates on one line", s.status, s);
check("...and a status too long for the row TRUNCATES beside the buttons instead of wrapping them",
  s.truncated && s.oneLine, s);
check("--ruled: a 1px --border rule, 12px above the row", s.ruled.join() === "1px,solid,true,12px", s.ruled);
check(".btn-row: the same wrapping 8px row, without the footer's alignment", s.row.join() === "flex,wrap,center,8px", s.row);

/* ── .switch ──────────────────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, rect, resolve, same, firstColour } = __c; const h = cs('${T("switch-off")}'), t = cs('${T("switch-off")}', '::after');
  const on = cs('${T("switch-on")}', '::after');
  return { host: [rect('${T("switch-off")}').h, h.borderTopWidth, h.backgroundColor, same(h.color, resolve('var(--foreground)')), h.columnGap, h.paddingLeft],
    track: [t.width, t.height, t.borderTopWidth, t.borderTopStyle, same(t.borderTopColor, resolve('var(--control-edge)')), t.backgroundColor, t.borderTopLeftRadius],
    knobOff: [same(firstColour(t.backgroundImage), resolve('var(--muted-foreground)')), t.backgroundPosition, t.backgroundSize],
    on: [same(on.backgroundColor, resolve('var(--primary)')), same(on.borderTopColor, resolve('var(--primary)')), same(firstColour(on.backgroundImage), resolve('var(--primary-foreground)')), on.backgroundPosition] }; })()`);
check(".switch: a 28px-tall, edgeless, transparent host in --foreground, the track 8px after the label",
  s.host[0] === 28 && s.host[1] === "0px" && s.host[2] === "rgba(0, 0, 0, 0)" && s.host[3] && s.host[4] === "8px" && s.host[5] === "0px", s.host);
check("...a square 32x18 track edged in --control-edge", s.track.join() === "32px,18px,1px,solid,true,rgba(0, 0, 0, 0),0px", s.track);
check("...off: a 12px --muted-foreground knob 2px from the start", s.knobOff[0] && s.knobOff[1] === "2px 50%" && s.knobOff[2] === "12px 12px", s.knobOff);
check("...on: a --primary track with a --primary-foreground knob 2px from the end",
  s.on[0] && s.on[1] && s.on[2] && s.on[3] === "calc(100% - 2px) 50%", s.on);
s = await withForced(T("switch-off"), ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T("switch-off")}', '::after').borderTopColor, resolve('var(--primary)')); })()`);
check("...hover lights the track's edge", s);
s = await withForced(T("switch-disabled"), ["hover"], `(() => { const { cs, resolve, same } = __c; const h = cs('${T("switch-disabled")}');
  return { op: h.opacity, cursor: h.cursor, edge: same(cs('${T("switch-disabled")}', '::after').borderTopColor, resolve('var(--control-edge)')) }; })()`);
check("...disabled: .45, default cursor, no hover", s.op === "0.45" && s.cursor === "default" && s.edge, s);
s = await evaluate(`[__c.el('${T("switch-bar")}').closest('.filter-bar') !== null, __c.rect('${T("switch-bar")}').h]`);
check("...and it sits in a filter bar at the control height", s[0] && s[1] === 28, s);

/* ── checkbox and radio ───────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const b = cs('${T("cb-off")}'), on = cs('${T("cb-on")}'), mark = cs('${T("cb-on")}', '::before');
  return { box: [rect('${T("cb-off")}').w, rect('${T("cb-off")}').h, b.appearance, b.borderTopWidth, same(b.borderTopColor, resolve('var(--control-edge)')), b.borderTopLeftRadius, b.backgroundColor, b.marginLeft],
    on: [same(on.backgroundColor, resolve('var(--primary)')), same(on.borderTopColor, resolve('var(--primary)')), same(mark.backgroundColor, resolve('var(--primary-foreground)')),
      mark.maskImage === resolve('var(--ico-check)', 'mask-image'), mark.width, mark.height],
    mixed: [same(cs('${T("cb-mixed")}').backgroundColor, resolve('var(--primary)')), cs('${T("cb-mixed")}', '::before').maskImage === resolve('var(--ico-minus)', 'mask-image'), __c.el('${T("cb-mixed")}').indeterminate] }; })()`);
check("checkbox: a drawn 14px square on --control-edge, no margin, no radius", s.box.join() === "14,14,none,1px,true,0px,rgba(0, 0, 0, 0),0px", s.box);
check("...checked: a --primary fill with a 10px --primary-foreground check cut out", s.on.join() === "true,true,true,true,10px,10px", s.on);
check("...indeterminate: the fill with a minus", s.mixed.every(Boolean), s.mixed);
s = await withForced(T("cb-off"), ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T("cb-off")}').borderTopColor, resolve('var(--primary)')); })()`);
check("...hover lights the edge", s);
s = await withForced(`label:has(> ${T("cb-off")})`, ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T("cb-off")}').borderTopColor, resolve('var(--primary)')); })()`);
check("...and so does hovering its label's words", s);
s = await evaluate(`(() => { const { cs } = __c; return [cs('${T("check-disabled")}').opacity, cs('${T("check-disabled")}').cursor, cs('${T("cb-disabled")}').opacity]; })()`);
check("...a disabled one dims its whole label once (.45), the box inside it not twice", s.join() === "0.45,default,1", s);
s = await evaluate(`(() => { const { cs, resolve, same } = __c; const r = cs('${T("radio-on")}'), dot = cs('${T("radio-on")}', '::before'), none = cs('${T("radio-unanswered")}', '::before');
  return { r: [r.borderTopLeftRadius, same(r.borderTopColor, resolve('var(--primary)')), r.backgroundColor], dot: [dot.width, dot.height, dot.borderTopLeftRadius, same(dot.backgroundColor, resolve('var(--primary)'))],
    unanswered: [__c.el('${T("radio-unanswered")}').matches(':indeterminate'), none.content, none.backgroundColor, none.maskImage] }; })()`);
check("radio: the one circle, a --primary edge and a 6px --primary dot when checked",
  s.r.join() === "50%,true,rgba(0, 0, 0, 0)" && s.dot.join() === "6px,6px,50%,true", s);
check("...and an UNANSWERED radio (which matches :indeterminate) draws no minus", s.unanswered[0] === true && ["none", "normal"].includes(s.unanswered[1]), s.unanswered);
s = await evaluate(`(() => { const { cs, resolve, same } = __c; return same(cs('#c6 .check-meta').color, resolve('var(--muted-foreground)')); })()`);
check(".check-meta is --muted-foreground", s);

/* ── .segmented ───────────────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const kids = [...document.querySelectorAll('${T("seg-text")} > button')];
  const c = kids.map((k) => getComputedStyle(k)), icon = __c.el('${T("seg-icons")} > button');
  return { h: kids.map((k) => Math.round(k.getBoundingClientRect().height)), pad: c[1].paddingLeft, edge: same(c[1].borderTopColor, resolve('var(--control-edge)')),
    ink: same(c[1].color, resolve('var(--muted-foreground)')), margins: c.map((k) => k.marginLeft),
    pressed: [same(c[0].color, resolve('var(--primary)')), same(c[0].backgroundColor, resolve('color-mix(in srgb, var(--primary) 12%, transparent)')), same(c[0].borderTopColor, resolve('var(--primary)')), c[0].fontWeight, c[0].zIndex],
    disabled: [c[2].opacity, c[2].cursor, kids[2].hasAttribute('data-tip')],
    icon: [Math.round(icon.getBoundingClientRect().width), Math.round(icon.getBoundingClientRect().height), getComputedStyle(icon, '::before').width] }; })()`);
check(".segmented: every segment at --control-h, 11.2px of side padding, one --control-edge between neighbours",
  s.h.every((h) => h === 28) && s.pad === "11.2px" && s.edge && s.margins.join() === "0px,-1px,-1px", s);
check("...at rest --muted-foreground", s.ink, s);
check("...pressed: --primary, bold, on a 12% --primary fill, its --primary edge lifted (z 1)", s.pressed.join() === "true,true,true,700,1", s.pressed);
check("...unavailable: .45 and it keeps its data-tip", s.disabled.join() === "0.45,default,true", s.disabled);
check("...an icon segment is square, glyph 14px", s.icon.join() === "28,28,14px", s.icon);
s = await withForced(`${T("seg-text")} > :nth-child(2)`, ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T("seg-text")} > :nth-child(2)').color, resolve('var(--primary)')); })()`);
check("...hover turns a segment --primary", s);
s = await withForced(`${T("seg-text")} > :nth-child(3)`, ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T("seg-text")} > :nth-child(3)').color, resolve('var(--muted-foreground)')); })()`);
check("...but not an unavailable one", s);

/* ── .choice-card ─────────────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, resolve, same } = __c; const off = cs('${T("choice-off")}'), on = cs('${T("choice-on")}'), warn = cs('${T("choice-warning")}');
  const g = cs('${T("choice-off")}', '::before'), grid = cs('${T("choice-grid")}');
  return { off: [off.paddingTop, off.paddingLeft, off.borderTopWidth, same(off.borderTopColor, resolve('var(--border)')), same(off.backgroundColor, resolve('var(--card)')), off.textAlign, off.display, off.gridTemplateColumns.split(' ').length],
    glyph: [g.width, g.height, same(g.backgroundColor, resolve('var(--primary)'))],
    text: [cs('${T("choice-off")} .choice-title').fontWeight, same(cs('${T("choice-off")} .choice-desc').color, resolve('var(--muted-foreground)'))],
    on: [same(on.borderTopColor, resolve('var(--primary)')), same(on.backgroundColor, resolve('color-mix(in srgb, var(--primary) 12%, var(--card))')), same(cs('${T("choice-on")} .choice-desc').color, resolve('var(--foreground)'))],
    warn: [same(warn.borderTopColor, resolve('var(--warning)')), same(cs('${T("choice-warning")}', '::before').backgroundColor, resolve('var(--warning)'))],
    grid: [grid.display, grid.columnGap, grid.rowGap] }; })()`);
check(".choice-card: 12px 16px of padding on --card, a 1px --border edge, glyph column + text column",
  s.off.join() === "12px,16px,1px,true,true,start,grid,2", s.off);
check("...a 24px glyph in --primary, a bold title, a muted description", s.glyph.join() === "24px,24px,true" && s.text.join() === "700,true", s);
check("...pressed: --primary edge, 12% over --card, and the description turns --foreground (AA)", s.on.every(Boolean), s.on);
check("...data-tone recolours the edge and the glyph", s.warn.every(Boolean), s.warn);
check(".choice-grid: a grid, 8px gaps", s.grid.join() === "grid,8px,8px", s.grid);
s = await withForced(T("choice-off"), ["hover"], `(() => { const { cs, resolve, same } = __c; return same(cs('${T("choice-off")}').borderTopColor, resolve('var(--primary)')); })()`);
check("...hover lights the edge", s);
s = await withForced(T("choice-disabled"), ["hover"], `(() => { const { cs, resolve, same } = __c; const c = cs('${T("choice-disabled")}');
  return [c.opacity, c.cursor, same(c.borderTopColor, resolve('var(--border)'))]; })()`);
check("...disabled: .45, default cursor, no hover", s.join() === "0.45,default,true", s);
// F7: a neutral-default component resets --tone at its root. --tone inherits, so a card inside a
// toned container would otherwise take the container's colour for its edge and glyph.
s = await evaluate(`(() => { const { cs, resolve, same } = __c; const c = cs('${T("choice-in-tone-on")}'), g = cs('${T("choice-in-tone-on")}', '::before');
  return { container: getComputedStyle(__c.el('${T("choice-in-tone")}')).getPropertyValue('--tone') !== '', edge: same(c.borderTopColor, resolve('var(--primary)')), glyph: same(g.backgroundColor, resolve('var(--primary)')),
    fill: same(c.backgroundColor, resolve('color-mix(in srgb, var(--primary) 12%, var(--card))')) }; })()`);
check("...a card inside a toned container keeps its OWN tone: --primary edge, fill and glyph", s.container && s.edge && s.glyph && s.fill, s);

/* ── .dropzone and .thumb-grid ────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const z = cs('${T("dropzone")}'), i = __c.el('${T("dropzone-input")}');
  return { z: [z.display, z.borderTopWidth, z.borderTopStyle, same(z.borderTopColor, resolve('var(--control-edge)')), same(z.color, resolve('var(--muted-foreground)')), z.paddingTop, z.cursor],
    input: [rect('${T("dropzone-input")}').w, rect('${T("dropzone-input")}').h, getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility === 'visible', i.tabIndex] }; })()`);
check(".dropzone: a padded grid behind a 1px DASHED --control-edge, in --muted-foreground", s.z.join() === "grid,1px,dashed,true,true,16px,pointer", s.z);
check("...its file input is hidden to the eye (1px) and still in the tab order", s.input.join() === "1,1,true,0", s.input);
s = await evaluate(`(() => { const { el, cs, resolve, same } = __c; const z = cs('${T("dropzone")}'), g = cs('${T("dropzone")}', '::before');
  return [g.content, g.width, g.height, same(g.backgroundColor, z.color), g.maskImage === resolve('var(--ico-image-plus)', 'mask-image'), el('${T("dropzone")}').querySelector('.ico') === null]; })()`);
check("...its glyph is its OWN: data-icon on the zone, a 24px ::before in currentColor through the named mask, no .ico child",
  s.join() === '"",24px,24px,true,true,true', s);
for (const [how, go] of [["hover", (e) => withForced(T("dropzone"), ["hover"], e)], ["data-dragging", (e) => evaluate(e.replaceAll(T("dropzone"), T("dropzone-dragging")))]]) {
  s = await go(`(() => { const { cs, resolve, same } = __c; const z = cs('${T("dropzone")}');
    return [same(z.borderTopColor, resolve('var(--primary)')), same(z.color, resolve('var(--primary)')), same(z.backgroundColor, resolve('color-mix(in srgb, var(--primary) 8%, transparent)'))]; })()`);
  check(`...${how}: --primary edge, --primary text, an 8% --primary fill`, s.every(Boolean), s);
}
s = await withForced(T("dropzone-disabled"), ["hover"], `(() => { const { cs, resolve, same } = __c; const z = cs('${T("dropzone-disabled")}');
  return [z.opacity, z.cursor, same(z.borderTopColor, resolve('var(--control-edge)'))]; })()`);
check("...disabled input: the zone is .45 and does not light", s.join() === "0.45,default,true", s);

// THE DRAG STATE, fired the way WebKit fires it. Moving from the zone onto a child sends dragenter to
// the child and then dragleave to the zone, and WebKit (configr runs in WKWebView) leaves that
// dragleave's relatedTarget null. A handler that asks "did it leave the zone?" of relatedTarget clears
// the state there, while the pointer is still over the zone; counting enters and leaves does not.
s = await evaluate(`(() => { const z = __c.el('${T("dropzone")}'), child = __c.el('${T("dropzone")} .dropzone-note');
  const fire = (node, type) => node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, relatedTarget: null, dataTransfer: new DataTransfer() }));
  const on = () => z.hasAttribute('data-dragging');
  fire(z, 'dragenter'); const entered = on();
  fire(child, 'dragenter'); fire(z, 'dragleave'); const overChild = on();
  fire(child, 'dragleave'); const left = on();
  fire(z, 'dragenter'); fire(z, 'drop'); const dropped = on();
  return { entered, overChild, left, dropped }; })()`);
check("drag: entering the zone sets data-dragging", s.entered === true, s);
check("...crossing onto a child KEEPS it, though that dragleave carries a null relatedTarget (WebKit)", s.overChild === true, s);
check("...leaving the zone clears it, and so does a drop", s.left === false && s.dropped === false, s);

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const g = cs('${T("thumbs")}'), t = __c.el('${T("thumbs")} > .thumb'), r = t.getBoundingClientRect();
  const b = __c.el('${T("thumb-remove")}'), br = b.getBoundingClientRect(), bc = getComputedStyle(b);
  return { grid: [g.display, g.gridTemplateColumns.split(' ').length, g.columnGap, g.listStyleType, g.paddingLeft],
    ratio: Math.abs(r.width / r.height - 16 / 9) < 0.02, edge: [getComputedStyle(t).borderTopWidth, same(getComputedStyle(t).borderTopColor, resolve('var(--border)'))],
    btn: [bc.position, Math.round(br.top - r.top), Math.round(r.right - br.right), bc.opacity, same(bc.backgroundColor, resolve('var(--background)'))] }; })()`);
check(".thumb-grid: three columns, 8px apart, no list chrome", s.grid.join() === "grid,3,8px,none,0px", s.grid);
check("...a .thumb is 16:9 behind a 1px --border", s.ratio && s.edge.join() === "1px,true", s);
check("...its remove button sits 4px in from the corner on an OPAQUE --background plate, hidden until needed",
  s.btn.join() === "absolute,5,5,0,true", s.btn);
s = await withForced(`${T("thumbs")} > .thumb`, ["hover"], `__c.cs('${T("thumb-remove")}').opacity`);
check("...and shown when its thumbnail is hovered", s === "1", s);
s = await withForced(`${T("thumbs")} > .thumb`, ["focus-within"], `__c.cs('${T("thumb-remove")}').opacity`);
check("...or holds focus", s === "1", s);
s = await evaluate(`__c.cs('${T("thumb-remove-disabled")}').opacity`);
check("...a DISABLED remove rests hidden like the others", s === "0", s);
s = await withForced(`.thumb:has(> ${T("thumb-remove-disabled")})`, ["hover"], `__c.cs('${T("thumb-remove-disabled")}').opacity`);
check("...and shows at the disabled .45 when its thumbnail is hovered, never at full strength", s === "0.45", s);

/* ── .reveal ──────────────────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const r = __c.cs('${T("reveal")}'); return [r.opacity, r.display, r.visibility]; })()`);
check(".reveal rests at opacity 0, never display: none or visibility: hidden", s[0] === "0" && s[1] !== "none" && s[2] === "visible", s);
s = await withForced(T("reveal-host"), ["hover"], `__c.cs('${T("reveal")}').opacity`);
check("...hovering its host shows it", s === "1", s);
s = await evaluate(`(() => { const b = __c.el('${T("reveal-btn")}'); b.focus(); const out = [document.activeElement === b, getComputedStyle(__c.el('${T("reveal")}')).opacity]; b.blur(); return out; })()`);
check("...and a hidden action is still a TAB STOP: focusing it shows it", s.join() === "true,1", s);
s = await evaluate(`__c.cs('${T("reveal-disabled")}').opacity`);
check("...a disabled .btn-icon.reveal rests hidden like the others", s === "0", s);
s = await withForced(T("reveal-host-disabled"), ["hover"], `__c.cs('${T("reveal-disabled")}').opacity`);
check("...and shows at the disabled .45 when its host is hovered: the reveal never outranks disabled", s === "0.45", s);

// A PRESSED TOGGLE IS NEVER HIDDEN (the lead's ruling): pagr's star is on, so it shows at rest on a
// pointer device while the remove beside it still waits. Read as the opacity that reaches the
// screen, every ancestor's multiplied in: the reveal hid the WRAPPER, and a child cannot undo that.
const SEEN = (id) => `(() => { let o = 1; for (let n = __c.el('${T(id)}'); n; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; })()`;
s = { hover: await evaluate("matchMedia('(hover: hover)').matches"), star: await evaluate(SEEN("reveal-pressed")),
  remove: await evaluate(SEEN("reveal-pressed-remove")), unpressed: await evaluate(SEEN("reveal-btn")) };
check("a PRESSED toggle in a .reveal shows at rest on a pointer device; the remove beside it and an unpressed star stay hidden",
  s.hover && s.star === 1 && s.remove === 0 && s.unpressed === 0, s);
s = await withForced(T("reveal-host-pressed"), ["hover"], SEEN("reveal-pressed-remove"));
check("...and hovering that row still shows the rest", s === 1, s);

/* ── .confirm-inline and .confirm-code ────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, resolve, same } = __c; const c = cs('${T("confirm-armed")}');
  return [['inline-flex', 'flex'].includes(c.display), c.alignItems, c.columnGap, same(cs('${T("confirm-note")}').color, resolve('var(--warning)'))]; })()`);
// inline-flex, or flex once blockified as the item of a flex row, which is where the demo puts it.
check(".confirm-inline: an inline row 8px apart, its note in --warning", s.join() === "true,center,8px,true", s);

// ONE GUARD FOR EVERY HANDLER. aria-disabled leaves a button focusable and clickable, so the page
// must ignore it, and the demo is the reference for those handlers. Each of its click handlers gets an
// aria-disabled button: a thumbnail's remove (on a thumbnail of its own, so a handler that does remove
// it costs the rest of the run nothing), a row's bin, and the confirm of an armed pair. Every step
// puts the page back whichever way it went, so a failure here reports here and stops nothing below.
s = await evaluate(`(() => {
  const { el } = __c, out = {};
  const li = document.createElement('li');
  li.className = 'thumb';
  li.innerHTML = '<button type="button" class="btn-icon btn-icon--sm" data-tone="destructive" data-icon="x" aria-label="remove probe.png" aria-disabled="true"></button>';
  el('${T("thumbs")}').append(li); li.firstChild.click(); out.removeKept = li.isConnected; li.remove();
  const bin = el('${T("confirm-rest")}'), slot = bin.closest('[data-demo-confirm-slot]'), status = el('[data-demo-confirm-status]'), before = status.textContent;
  bin.setAttribute('aria-disabled', 'true'); bin.click(); out.binArmed = !!slot.querySelector('.confirm-inline');
  slot.querySelector('[data-demo-keep]')?.click(); bin.removeAttribute('aria-disabled');
  bin.click(); out.armsWhenEnabled = !!slot.querySelector('.confirm-inline');
  const go = slot.querySelector('[data-demo-confirm]');
  go?.setAttribute('aria-disabled', 'true'); go?.click();
  out.confirmIgnored = status.textContent === before && !!slot.querySelector('.confirm-inline');
  slot.querySelector('[data-demo-keep]')?.click(); out.disarmed = !slot.querySelector('.confirm-inline') && slot.contains(bin);
  status.textContent = before;
  return out; })()`);
check("aria-disabled: a thumbnail's remove does nothing", s.removeKept === true, s);
check("...a row's bin does not arm", s.binArmed === false, s);
check("...the confirm of an armed pair does not confirm (and the same bin arms once enabled)", s.armsWhenEnabled && s.confirmIgnored && s.disarmed, s);

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const v = cs('${T("code-value")}'), i = cs('${T("code-input")}'), st = cs('${T("code-status")}'), bad = cs('${T("code-status-bad")}');
  return { value: [v.fontSize, v.fontWeight, v.letterSpacing, v.fontVariantNumeric, same(v.color, resolve('var(--primary)')), v.marginTop, v.fontFamily === resolve('var(--font-mono)', 'font-family')],
    input: [i.fontSize, i.letterSpacing, i.maxWidth, rect('${T("code-input")}').h, i.borderTopWidth, same(i.borderTopColor, resolve('var(--control-edge)')), i.fontFamily === resolve('var(--font-mono)', 'font-family')],
    status: [st.minHeight === st.lineHeight, same(st.color, resolve('var(--muted-foreground)')), same(bad.color, resolve('var(--warning)'))] }; })()`);
check(".confirm-code-value: --fs-xl, 700, tracked .16em, tabular, --primary, mono", s.value.join() === "18px,700,2.88px,tabular-nums,true,0px,true", s.value);
check(".confirm-code-input: the ONE text size, tracked .14em, capped at 14rem, at --control-h, mono",
  s.input.join() === "12px,1.68px,224px,28,1px,true,true", s.input);
check(".confirm-code-status: one line reserved; muted by default, --warning under data-tone", s.status.every(Boolean), s.status);
s = await evaluate(`(() => { const { el, cs, resolve, same } = __c; const box = el('${T("confirm-code")}'); box.dataset.tone = 'destructive';
  const out = [getComputedStyle(box).getPropertyValue('--tone') !== '', same(cs('${T("code-status")}').color, resolve('var(--muted-foreground)'))];
  delete box.dataset.tone; return out; })()`);
check("...the status reads only its OWN data-tone: inside a toned container it stays muted", s.join() === "true,true", s);
s = await withForced(T("code-input-disabled"), ["hover"], `(() => { const { cs, resolve, same } = __c; const i = cs('${T("code-input-disabled")}');
  return [i.opacity, i.cursor, same(i.borderTopColor, resolve('var(--control-edge)'))]; })()`);
check("...a disabled code input is .45 with a default cursor, and does not light --primary under the pointer", s.join() === "0.45,default,true", s);

/* ── no radius, anywhere, except the one circle ───────────────────────────────── */

s = await evaluate(`(() => {
  const bad = [];
  const sel = '.btn-icon, .btn-group, .form-actions, .btn-row, .switch, .check, input[type=checkbox], input[type=radio], .segmented, .segmented > button, .choice-card, .dropzone, .thumb, .reveal, .confirm-inline, .confirm-code, .confirm-code-input';
  for (const n of document.querySelectorAll(sel)) {
    const circle = n.matches('input[type=radio]');
    for (const pseudo of [null, '::before', '::after']) {
      const r = getComputedStyle(n, pseudo);
      const radii = [r.borderTopLeftRadius, r.borderTopRightRadius, r.borderBottomLeftRadius, r.borderBottomRightRadius];
      const ok = circle && pseudo !== '::after' ? radii.every((v) => v === '50%' || v === '0px') : radii.every((v) => v === '0px');
      if (!ok) bad.push((n.dataset.t || n.className || n.tagName) + (pseudo || '') + ' ' + radii.join('/'));
    }
  }
  return bad; })()`);
check("no border-radius on any control or pseudo-element, except the radio and its dot (50%)", s.length === 0, s.slice(0, 6));

/* ── BARE MODE: base.css and components.css switched off ──────────────────────── */

// A disabled <link> leaves document.styleSheets and its rules stop applying. Both are asserted on the
// way in, so nothing in this section can pass by reading a page that still has them. Re-enabled, a
// sheet comes back asynchronously, so the way out waits for it.
//
// THE PAGE KEEPS ITS FONT. The body's font is base.css's to set, and a surface without base.css sets
// its own (netmon does), so the bare page gets the same body font, inline. That is what makes font
// family and size comparable in the snapshot: a control that takes its font from the page computes
// the same in both, and one that took it from a base.css or components.css rule does not.
const setBare = async (on) => {
  await evaluate(on
    ? `(() => { const b = getComputedStyle(document.body), keep = [b.fontFamily, b.fontSize, b.lineHeight];
        for (const l of document.querySelectorAll('link[href$="base.css"], link[href$="components.css"]')) l.disabled = true;
        [document.body.style.fontFamily, document.body.style.fontSize, document.body.style.lineHeight] = keep; })(); null`
    : `(() => { for (const l of document.querySelectorAll('link[href$="base.css"], link[href$="components.css"]')) l.disabled = false;
        document.body.style.removeProperty('font-family'); document.body.style.removeProperty('font-size'); document.body.style.removeProperty('line-height'); })(); null`);
  const read = () => evaluate(`[[...document.styleSheets].map((x) => (x.href || '').split('/').pop()).filter((n) => n === 'base.css' || n === 'components.css').length,
    getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.btn-terminal')).paddingTop]`);
  let state = await read();
  for (let i = 0; !on && state[0] !== 2 && i < 50; i += 1) { await sleep(50); state = await read(); }
  return state;
};

// What each control's own rules decide. Sizes only where the class fixes them (the rest track the
// inherited font); colour only where the class sets it (a layout row inherits it from <body>); a
// border colour only where a border is drawn (base.css recolours every invisible one).
const SNAPSHOT = `(() => {
  const props = ['box-sizing', 'min-height', 'width', 'height', 'padding-top', 'padding-left', 'margin-left', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius', 'background-color', 'background-image', 'mask-image', 'color', 'cursor', 'opacity', 'display', 'gap', 'z-index', 'font-family', 'font-size', 'font-weight'];
  const subjects = [
    // [hook, pseudos, fixed size, own colour]
    ['rest', ['::before'], true, true], ['sm', ['::before'], true, true], ['bare', ['::before'], true, true],
    ['star-on', ['::before'], true, true], ['disabled', ['::before'], true, true], ['busy', ['::before'], true, true],
    ['switch-off', ['::after'], false, true], ['switch-on', ['::after'], false, true],
    ['cb-off', ['::before'], true, false], ['cb-on', ['::before'], true, false], ['cb-mixed', ['::before'], true, false], ['radio-on', ['::before'], true, false],
    ['choice-on', ['::before'], false, true], ['choice-warning', ['::before'], false, true],
    ['dropzone', ['::before'], false, true], ['dropzone-dragging', ['::before'], false, true], ['thumb-remove', ['::before'], true, true],
    ['code-value', [], false, true], ['code-input', [], false, true], ['code-input-disabled', [], false, true], ['code-status-bad', [], false, true], ['confirm-note', [], false, true],
    ['seg-text', [], false, false], ['confirm-armed', [], false, false], ['actions', [], false, false], ['actions-ruled', [], false, false],
    ['btn-row', [], false, false], ['group-icons', [], false, false], ['choice-grid', [], false, false], ['thumbs', [], false, false],
  ];
  const out = {};
  const snap = (key, n, pseudo, sized, coloured) => {
    const c = getComputedStyle(n, pseudo);
    out[key] = props.filter((p) => (sized || !['width', 'height'].includes(p)) && (coloured || p !== 'color') && (p !== 'border-top-color' || c.borderTopStyle !== 'none'))
      .map((p) => p + ':' + c.getPropertyValue(p)).join(';');
  };
  for (const [id, pseudos, sized, coloured] of subjects) {
    const n = __c.el('[data-t="' + id + '"]');
    snap(id, n, null, sized, coloured);
    for (const pseudo of pseudos) snap(id + pseudo, n, pseudo, true, true);
  }
  for (const b of document.querySelectorAll('[data-t="seg-text"] > button, [data-t="seg-icons"] > button')) snap('segment ' + (b.textContent || b.getAttribute('aria-label')), b, null, !b.textContent, true);
  return out; })()`;

// A control that shows text inherits the page's font. A <button> does NOT by default: the browser gives
// it 13.33px Arial, beside base.css or not, so a control that lost `font: inherit` is caught here in
// either mode, and nowhere else.
const FONTS = `(() => {
  const nodes = [['.btn-icon', '${T("rest")}'], ['.switch', '${T("switch-off")}'], ['.choice-card', '${T("choice-off")}'], ['.choice-card (pressed)', '${T("choice-on")}'],
    ...[...document.querySelectorAll('${T("seg-text")} > button')].map((b, i) => ['.segmented > button ' + (i + 1), '${T("seg-text")} > :nth-child(' + (i + 1) + ')'])];
  return nodes.map(([name, sel]) => { const n = __c.el(sel), c = getComputedStyle(n), p = getComputedStyle(n.parentElement);
    return c.fontFamily === p.fontFamily && c.fontSize === p.fontSize ? null : name + ': ' + c.fontFamily + ' ' + c.fontSize + ', the page ' + p.fontFamily + ' ' + p.fontSize; }).filter(Boolean); })()`;

const full = await evaluate(SNAPSHOT);
s = await evaluate(FONTS);
check("every control that shows text follows the page's font, family and size (with base.css)", s.length === 0, s);

const off = await setBare(true);
check("precondition: base.css and components.css really are switched off (gone from the page, body unpainted, .btn-terminal unstyled)",
  off[0] === 0 && off[1] === "rgba(0, 0, 0, 0)" && off[2] === "1px", off);

// FOCUS RINGS. base.css draws this same ring on every :focus-visible element, so with it loaded a
// control whose own rule was deleted still showed one and the assertion could not fail. Here only the
// control's own rule can draw it; the browser's default ring is `auto`, 1px, and fails the check.
const RING = (sel, extra) => `(() => { const { cs, resolve, same } = __c; const b = cs('${sel}');
  return [b.outlineWidth, b.outlineStyle, b.outlineOffset, same(b.outlineColor, resolve('var(--ring)'))${extra}].join(); })()`;
for (const [name, sel, want, extra = ""] of [
  [".btn-icon", T("rest"), "2px,solid,2px,true"],
  [".switch, around its label and track", T("switch-off"), "2px,solid,2px,true"],
  ["a checkbox", T("cb-off"), "2px,solid,2px,true"],
  ["a radio", T("radio-off"), "2px,solid,2px,true"],
  [".segmented > button, lifted above a pressed neighbour (z 2)", `${T("seg-text")} > :nth-child(2)`, "2px,solid,2px,true,2", ", b.zIndex"],
  [".choice-card", T("choice-off"), "2px,solid,2px,true"],
  [".confirm-code-input, with a --primary edge", T("code-input"), "2px,solid,2px,true,true", ", same(b.borderTopColor, resolve('var(--primary)'))"],
]) {
  s = await withForced(sel, ["focus", "focus-visible"], RING(sel, extra));
  check(`bare: ${name} draws its OWN 2px --ring outline, 2px out, on :focus-visible`, s === want, s);
}

// The drop zone's keyboard path, with REAL keys: Tab from the control before it lands on the hidden
// input and rings the zone; Space opens the picker. Then a real mouse click: it opens the picker too,
// and draws no ring, which is the difference between :has(:focus-visible) and :focus-within.
await send("Page.setInterceptFileChooserDialog", { enabled: true });
await evaluate(`__c.el('${T("choice-in-tone-on")}').focus(); null`);
await key("Tab", "Tab", 9);
s = await evaluate(`(() => { const { cs, resolve, same } = __c; const z = cs('${T("dropzone")}');
  return { active: document.activeElement === __c.el('${T("dropzone-input")}'), ring: [z.outlineWidth, z.outlineStyle, z.outlineOffset, same(z.outlineColor, resolve('var(--ring)'))] }; })()`);
check("bare: Tab reaches the drop zone's hidden input", s.active, s);
check("...and the ZONE shows its own focus ring", s.ring.join() === "2px,solid,2px,true", s.ring);
let before = events.filter((m) => m === "Page.fileChooserOpened").length;
await key(" ", "Space", 32, " ");
await sleep(200);
check("...Space opens the file picker", events.filter((m) => m === "Page.fileChooserOpened").length > before);
await evaluate("document.activeElement.blur(); null");
const zone = await evaluate(`(() => { const z = __c.el('${T("dropzone")}'); z.scrollIntoView({ block: 'center', behavior: 'instant' }); const q = z.getBoundingClientRect();
  return { x: q.left + 12, y: q.top + 12, hit: document.elementFromPoint(q.left + 12, q.top + 12) === z }; })()`);
before = events.filter((m) => m === "Page.fileChooserOpened").length;
for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: zone.x, y: zone.y, button: "left", clickCount: 1 });
}
await sleep(200);
s = await evaluate(`[document.activeElement === __c.el('${T("dropzone-input")}'), __c.cs('${T("dropzone")}').outlineStyle]`);
check("precondition: the click lands on the zone itself", zone.hit, zone);
check("a mouse click anywhere on the zone opens the picker", events.filter((m) => m === "Page.fileChooserOpened").length > before);
check("...and focuses the input, as :focus-within would see it, yet draws NO ring", s.join() === "true,none", s);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
await evaluate("document.activeElement.blur(); null");

const bareSnapshot = await evaluate(SNAPSHOT);
const drift = Object.keys(full).filter((k) => full[k] !== bareSnapshot[k]).map((k) => `${k}\n          with:    ${full[k]}\n          without: ${bareSnapshot[k]}`);
check("SELF-SUFFICIENT: with base.css and components.css off, every control computes the same box, edge, colours, font and state",
  drift.length === 0, drift.slice(0, 3).join("\n        "));
s = await evaluate(FONTS);
check("...and every control that shows text still follows the page's font without them", s.length === 0, s);
const back = await setBare(false);
check("...and the two files are back on for everything below", back[0] === 2, back);

/* ── motion ───────────────────────────────────────────────────────────────────── */

await evaluate("document.documentElement.classList.remove('anim-off'); null");
s = await evaluate(`(() => { const g = __c.cs('${T("busy")}', '::before'), t = __c.cs('${T("switch-off")}', '::after');
  return { anim: [g.animationName, g.animationDuration, g.animationIterationCount], knob: t.transitionProperty.includes('background-position') && t.transitionDuration.split(', ').every((d) => d === '0.15s') }; })()`);
check("busy spins (dd-spin, 1s, infinite)", s.anim.join() === "dd-spin,1s,infinite", s.anim);
check("the switch's knob slides (background-position, .15s)", s.knob, s);
await evaluate("document.documentElement.classList.add('anim-off'); null");
s = await evaluate(`[__c.cs('${T("busy")}', '::before').animationName, __c.cs('${T("switch-off")}', '::after').transitionDuration, __c.cs('${T("rest")}').transitionDuration]`);
check("html.anim-off stops the spinner and every transition", s[0] === "none" && /^0s(, 0s)*$/.test(s[1]) && /^0s(, 0s)*$/.test(s[2]), s);
await evaluate("document.documentElement.classList.remove('anim-off'); null");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
s = await evaluate(`__c.cs('${T("busy")}', '::before').animationName`);
check("prefers-reduced-motion stops the spinner; the glyph stays", s === "none", s);
await send("Emulation.setEmulatedMedia", { features: [] });
await evaluate("document.documentElement.classList.add('anim-off'); null");

/* ── print ────────────────────────────────────────────────────────────────────── */

// WP6's filter dropdown and sort control are .btn-group too, and they carry the value a printed list
// was filtered and sorted by. They are not on this page, so two stand in for them, markup only.
await evaluate(`(() => { const host = __c.el('#c3 .demo-states');
  for (const kind of ['filter-dd', 'sort-ctl']) { const g = document.createElement('div'); g.className = 'btn-group ' + kind; g.dataset.t = 'print-' + kind; g.innerHTML = '<button type="button">source: seedr</button>'; host.append(g); } })(); null`);
await send("Emulation.setEmulatedMedia", { media: "print" });
s = await evaluate(`(() => { const shown = (sel) => getComputedStyle(__c.el(sel)).display;
  return { gone: ['${T("rest")}', '${T("group-icons")}', '${T("actions")}', '${T("btn-row")}', '${T("dropzone")}', '${T("reveal")}', '${T("confirm-armed")}', '${T("confirm-code")}'].map(shown),
    kept: [shown('${T("switch-on")}'), shown('${T("cb-on")}'), shown('${T("choice-on")}')],
    valueGroups: [shown('${T("print-filter-dd")}'), shown('${T("print-sort-ctl")}'), shown('${T("seg-text")}'), shown('${T("seg-icons")}')],
    exact: [['${T("cb-on")}'], ['${T("cb-on")}', '::before'], ['${T("radio-on")}', '::before'], ['${T("switch-on")}', '::after'],
      ['${T("seg-text")} > [aria-pressed="true"]'], ['${T("seg-icons")} > [data-icon]', '::before']].map(([sel, pseudo]) => { const c = __c.cs(sel, pseudo); return c.printColorAdjust || c.webkitPrintColorAdjust; }) }; })()`);
check("print removes the controls that only act", s.gone.every((d) => d === "none"), s.gone);
check("...keeps the ones that carry a value", s.kept.every((d) => d !== "none"), s.kept);
check("...keeps a .btn-group that is a filter dropdown or a sort control, and a .segmented: the printed page says how it was narrowed, ordered and ranged",
  s.valueGroups.every((d) => d !== "none"), s.valueGroups);
check("...and keeps their fills on paper (print-color-adjust: exact), the chosen segment's and an icon segment's glyph among them, or a checked box prints empty",
  s.exact.every((v) => v === "exact"), s.exact);
await send("Emulation.setEmulatedMedia", { media: "" });
await evaluate(`for (const g of document.querySelectorAll('[data-t^="print-"]')) g.remove(); null`);

/* ── forced colours (X1): 4 themes x 2 forced palettes, and the fallback engine ─ */

// High Contrast replaces every author colour with a system colour and every fill with Canvas. Read on
// every theme, because an author colour that leaks through is only caught where it happens to be
// dark on dark (warm's brown on a black Canvas) or light on light (green's green on a white one).
//   · each state pair is read on the part that SHOWS the state (a track, a box's fill, a card's fill)
//     and must compute two different PAINTED colours;
//   · each glyph, mark, knob and dot must reach 3:1 against what it is painted on, and each word on a
//     redrawn state 4.5:1. A disabled one only has to differ: it is .45 in every mode, and WCAG
//     exempts an inactive control;
//   · PAINTED means the host's opacity is in it, and for text it means PIXELS, below.
// Deleting the block, or switching a glyph to `forced-color-adjust: none`, turns these red.
const FORCED = `(() => {
  const { el, cs, parse, over, ratio, resolve } = __c;
  const canvas = parse(resolve('Canvas'));
  const T = (id) => el('[data-t="' + id + '"]');
  const P = (id) => el('[data-surface="background"] [data-probe="' + id + '"]');
  const opacity = (n) => { let o = 1; for (let m = n; m; m = m.parentElement) o *= +getComputedStyle(m).opacity; return o; };
  const faded = (v, o) => { const c = parse(v); return [c[0], c[1], c[2], c[3] * o]; };
  const fill = (n) => over(faded(cs(n).backgroundColor, opacity(n)), canvas);
  const ink = (n) => over(faded(cs(n).color, opacity(n)), fill(n));
  const mark = (n, pseudo = '::before') => { const g = cs(n, pseudo); return { ink: over(faded(g.backgroundColor, opacity(n)), fill(n)), mask: g.maskImage }; };
  const knob = (n) => { const a = cs(n, '::after'), o = opacity(n), track = over(faded(a.backgroundColor, o), fill(n)), m = /(color\\(srgb[^)]*\\)|rgba?\\([^)]*\\))/.exec(a.backgroundImage);
    return { track, edge: over(faded(a.borderTopColor, o), fill(n)), knob: m ? over(faded(m[1], o), track) : null }; };
  const edge = (n) => over(faded(cs(n).borderTopColor, opacity(n)), canvas);
  const k = (c) => c ? c.slice(0, 3).map((v) => Math.round(v * 255)).join(',') : 'none';
  const r = (a, b) => a && b ? Math.round(ratio(a, b) * 100) / 100 : 0;
  const out = [];
  const pair = (name, a, b) => out.push({ name: name + ' differ', ok: k(a) !== k(b), got: k(a) + ' vs ' + k(b) });
  const shows = (name, fg, bg, floor = 3) => out.push({ name: name + ' reaches ' + floor + ':1', ok: r(fg, bg) >= floor, got: r(fg, bg) + ' — ' + k(fg) + ' on ' + k(bg) });
  const apart = (name, fg, bg) => out.push({ name: name + ' is drawn in a colour of its own', ok: k(fg) !== k(bg), got: k(fg) + ' on ' + k(bg) });
  // A part that opts out of forcing keeps whatever colour it names, so it must name only the reader's
  // system colours. An author colour there can clear 3:1 on the emulated palette by luck and fail on
  // the reader's own.
  const SYSTEM = ['Canvas', 'CanvasText', 'ButtonText', 'ButtonFace', 'ButtonBorder', 'Highlight', 'HighlightText', 'GrayText', 'Field', 'FieldText', 'LinkText']
    .map((name) => k(over(parse(resolve(name)), canvas)));
  const system = (name, parts) => { const foreign = parts.filter(([, c]) => !SYSTEM.includes(k(c)));
    out.push({ name: name + ' paints only system colours', ok: foreign.length === 0, got: foreign.map(([part, c]) => part + ' ' + k(c)).join(', ') }); };

  const sOff = knob(T('switch-off')), sOn = knob(T('switch-on')), sdOff = knob(T('switch-disabled')), sdOn = knob(T('switch-disabled-on'));
  pair('switch: the on and off tracks', sOn.track, sOff.track);
  pair('switch: the on and off knobs', sOn.knob, sOff.knob);
  shows('switch off: the knob on its track', sOff.knob, sOff.track);
  shows('switch on: the knob on its track', sOn.knob, sOn.track);
  shows('switch off: the track edge', sOff.edge, fill(T('switch-off')));
  system('switch off', [['edge', sOff.edge], ['knob', sOff.knob]]);
  system('switch on', [['track', sOn.track], ['edge', sOn.edge], ['knob', sOn.knob]]);
  pair('switch, disabled: the on and off tracks', sdOn.track, sdOff.track);
  apart('switch, disabled on: the knob', sdOn.knob, sdOn.track);

  const box = (id) => { const n = T(id), m = mark(n); return { fill: fill(n), ink: m.ink, sig: k(fill(n)) + '|' + k(m.ink) + '|' + m.mask }; };
  const cOff = box('cb-off'), cOn = box('cb-on'), cMixed = box('cb-mixed'), cdOff = box('cb-disabled'), cdOn = box('cb-disabled-on');
  pair('checkbox: the checked and unchecked fills', cOn.fill, cOff.fill);
  out.push({ name: 'checkbox: unchecked, checked and indeterminate are three different drawings', ok: new Set([cOff.sig, cOn.sig, cMixed.sig]).size === 3, got: [cOff.sig, cOn.sig, cMixed.sig].map((x) => x.slice(0, 60)).join(' / ') });
  shows('checkbox checked: the check on its fill', cOn.ink, cOn.fill);
  shows('checkbox indeterminate: the minus on its fill', cMixed.ink, cMixed.fill);
  pair('checkbox, disabled: the checked and unchecked fills', cdOn.fill, cdOff.fill);
  apart('checkbox, disabled checked: the check', cdOn.ink, cdOn.fill);
  const rOff = box('radio-off'), rOn = box('radio-on');
  pair('radio: the checked and unchecked fills', rOn.fill, rOff.fill);
  shows('radio checked: the dot on its fill', rOn.ink, rOn.fill);
  system('checkbox checked', [['fill', cOn.fill], ['check', cOn.ink]]);
  system('checkbox indeterminate', [['fill', cMixed.fill], ['minus', cMixed.ink]]);
  system('radio checked', [['fill', rOn.fill], ['dot', rOn.ink]]);

  for (const [off, pressed, name] of [['star', 'star-on', '.btn-icon'], ['bare', 'bare-on', '.btn-icon--bare']]) {
    const a = T(off), b = T(pressed);
    pair(name + ': the pressed and unpressed fills', fill(b), fill(a));
    pair(name + ': the pressed and unpressed glyphs', mark(b).ink, mark(a).ink);
    shows(name + ' unpressed: the glyph', mark(a).ink, fill(a));
    shows(name + ' pressed: the glyph on its fill', mark(b).ink, fill(b));
  }
  const toned = P('tone-destructive-pressed'), tonedOff = P('tone-destructive');
  pair('.btn-icon[data-tone]: the pressed and unpressed fills', fill(toned), fill(tonedOff));
  shows('.btn-icon[data-tone] pressed: the glyph on its fill', mark(toned).ink, fill(toned));
  shows('.btn-icon[data-tone] unpressed: the glyph', mark(tonedOff).ink, fill(tonedOff));
  shows('.btn-icon --bare with a tone: the glyph', mark(T('bare-tone')).ink, fill(T('bare-tone')));
  shows('.btn-icon --bare --sm inside a toned container (the shape of a notice dismiss): the glyph', mark(T('in-tone')).ink, fill(T('in-tone')));
  shows('.btn-icon busy: the spinner', mark(T('busy')).ink, fill(T('busy')));
  shows('.btn-icon expanded: the glyph', mark(T('expanded')).ink, fill(T('expanded')));
  pair('.btn-icon, disabled: the pressed and unpressed fills', fill(T('star-on-disabled')), fill(T('disabled')));
  apart('.btn-icon, disabled: the glyph', mark(T('disabled')).ink, fill(T('disabled')));
  apart('.btn-icon, aria-disabled: the glyph', mark(T('aria-disabled')).ink, fill(T('aria-disabled')));
  apart('.btn-icon, disabled pressed: the glyph', mark(T('star-on-disabled')).ink, fill(T('star-on-disabled')));

  const segOn = el('[data-t="seg-text"] > [aria-pressed="true"]'), segOff = el('[data-t="seg-text"] > [aria-pressed="false"]:not(:disabled)');
  pair('.segmented: the pressed and unpressed fills', fill(segOn), fill(segOff));
  shows('.segmented pressed: its word on its fill', ink(segOn), fill(segOn), 4.5);
  shows('.segmented unpressed: its word', ink(segOff), fill(segOff), 4.5);
  const iconOn = el('[data-t="seg-icons"] > [aria-pressed="true"]'), iconOff = el('[data-t="seg-icons"] > [aria-pressed="false"]');
  shows('.segmented icon pressed: the glyph on its fill', mark(iconOn).ink, fill(iconOn));
  shows('.segmented icon unpressed: the glyph', mark(iconOff).ink, fill(iconOff));
  system('.segmented pressed', [['fill', fill(segOn)], ['word', ink(segOn)], ['edge', edge(segOn)], ['glyph', mark(iconOn).ink]]);

  const chOn = T('choice-on'), chOff = T('choice-off');
  pair('.choice-card: the chosen and unchosen fills', fill(chOn), fill(chOff));
  shows('.choice-card chosen: its title on its fill', ink(el('.choice-title', chOn)), fill(chOn), 4.5);
  shows('.choice-card chosen: its description on its fill', ink(el('.choice-desc', chOn)), fill(chOn), 4.5);
  shows('.choice-card chosen: the glyph on its fill', mark(chOn).ink, fill(chOn));
  shows('.choice-card unchosen: the glyph', mark(chOff).ink, fill(chOff));
  shows('.choice-card chosen with a tone: the glyph on its fill', mark(T('choice-warning')).ink, fill(T('choice-warning')));
  pair('.choice-card with a tone: chosen against unchosen', fill(T('choice-warning')), fill(chOff));
  system('.choice-card chosen', [['fill', fill(chOn)], ['edge', edge(chOn)], ['title', ink(el('.choice-title', chOn))], ['description', ink(el('.choice-desc', chOn))], ['glyph', mark(chOn).ink]]);
  system('.btn-icon pressed', [['fill', fill(T('star-on'))], ['edge', edge(T('star-on'))], ['glyph', mark(T('star-on')).ink]]);

  const zone = T('dropzone'), dragging = T('dropzone-dragging');
  pair('.dropzone: the dragging and resting colours', ink(dragging), ink(zone));
  shows('.dropzone: the glyph', mark(zone).ink, fill(zone));
  shows('.dropzone dragging: the glyph', mark(dragging).ink, fill(dragging));
  return out; })()`;

// COMPUTED COLOURS CANNOT SEE EVERYTHING. Chromium paints a Canvas backplate behind each line of text in
// forced colours, over whatever fill the box has: the word computes HighlightText on Highlight and is
// painted HighlightText on Canvas, a solid block. So the PIXELS are asked too.
//
// OWNERSHIP FIRST, by a TWO-SHOT DIFF. Each region is captured twice, as drawn and with ONLY its target
// hidden: a glyph's ::before, or a word's own text (its text nodes wrapped in a `visibility: hidden`
// span, which takes the word and its backplate and nothing else — `color: transparent` would not do it,
// a forced palette paints over it). Only the pixels that change are the target's: at least 3 (6 for a
// glyph), and all of them inside the target's box ±1px, so a clip that landed beside it (a scrollbar, a
// re-layout, a box measured before a scroll) reads the ink in the wrong place and fails, and a
// neighbour's ink — the same in both shots — counts for nothing. Then:
//   · a glyph reaches 3:1 over its changed pixels, drawn against hidden (what it paints on what it covers);
//   · a word is read in the DRAWN shot, over its text box less the outermost 1px ring (where a
//     backplate's anti-aliased edge lands): it must sit on its fill (most of the box is the fill colour,
//     which it cannot be under a backplate), and its changed pixels reach 4.5:1 against the box's
//     commonest colour — what the word actually sits on. Never against the hidden shot: that is what
//     lies UNDER a backplate, and a word painted in its backplate's colour would read 21:1.
const REGIONS = `(() => {
  const { el, cs, parse, over, resolve } = __c;
  const canvas = parse(resolve('Canvas'));
  const rgb = (c) => c.slice(0, 3).map((v) => Math.round(v * 255));
  const fillOf = (n) => over(parse(cs(n).backgroundColor), canvas);
  const page = (r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  let own = 0;
  const tag = (n) => { if (!n.hasAttribute('data-dd-own')) n.setAttribute('data-dd-own', ++own); return +n.getAttribute('data-dd-own'); };
  const text = (name, n) => { const range = document.createRange(); range.selectNodeContents(n); const host = n.closest('button'), fill = fillOf(host);
    return { name, kind: 'text', own: tag(n), ...page(range.getBoundingClientRect()), ink: rgb(over(parse(cs(n).color), fill)), under: rgb(fill) }; };
  const glyph = (name, n, box) => { const fill = fillOf(n), r = n.getBoundingClientRect();
    return { name, kind: 'glyph', own: tag(n), ...page({ left: r.left + box[0], top: r.top + box[1], width: box[2], height: box[3] }), ink: rgb(over(parse(cs(n, '::before').backgroundColor), fill)), under: rgb(fill) }; };
  const centred = (n, size) => { const r = n.getBoundingClientRect(); return [(r.width - size) / 2, (r.height - size) / 2, size, size]; };
  for (const n of document.querySelectorAll('[data-dd-own]')) n.removeAttribute('data-dd-own');
  const segOn = el('[data-t="seg-text"] > [aria-pressed="true"]'), chOn = el('[data-t="choice-on"]');
  return [
    text('.segmented pressed: its word', segOn),
    text('.choice-card chosen: its title', el('.choice-title', chOn)),
    text('.choice-card chosen: its description', el('.choice-desc', chOn)),
    glyph('.btn-icon: the glyph', el('[data-t="rest"]'), centred(el('[data-t="rest"]'), 14)),
    glyph('.btn-icon pressed: the glyph', el('[data-t="star-on"]'), centred(el('[data-t="star-on"]'), 14)),
    glyph('.btn-icon--bare--sm in a toned container (the shape of a notice dismiss): the glyph', el('[data-t="in-tone"]'), centred(el('[data-t="in-tone"]'), 12)),
    glyph('.segmented icon pressed: the glyph', el('[data-t="seg-icons"] > [aria-pressed="true"]'), centred(el('[data-t="seg-icons"] > [aria-pressed="true"]'), 14)),
    glyph('.choice-card chosen: the glyph', chOn, [17, 13, 24, 24]),
    glyph('.dropzone: the glyph', el('[data-t="dropzone-dragging"]'), [(el('[data-t="dropzone-dragging"]').getBoundingClientRect().width - 24) / 2, 17, 24, 24]),
  ]; })()`;
// Hide ONLY the target, and put it back: a glyph's ::before, or a word's text nodes.
const HIDE = (r) => r.kind === "glyph"
  ? `(() => { const s = document.createElement('style'); s.id = 'dd-unown'; s.textContent = '[data-dd-own="${r.own}"]::before { visibility: hidden !important; }'; document.head.append(s); })()`
  : `(() => { const n = document.querySelector('[data-dd-own="${r.own}"]');
      for (const t of [...n.childNodes].filter((c) => c.nodeType === 3)) { const s = document.createElement('span'); s.className = 'dd-unown'; s.style.visibility = 'hidden'; t.replaceWith(s); s.append(t); } })()`;
const UNHIDE = `(() => { document.getElementById('dd-unown')?.remove(); for (const s of document.querySelectorAll('span.dd-unown')) s.replaceWith(...s.childNodes); })()`;
const PAD = 3;
const paint = async () => {
  const regions = await evaluate(REGIONS);
  const shots = [];
  for (const r of regions) {
    // The clip is the region's box in PAGE coordinates, grown by PAD so ink that lands beside the box can
    // be seen there. It lands on the region only because the browser runs with --hide-scrollbars (the
    // launch, above): with a scrollbar, the capture is offset from the page by its width. Do not drop the
    // flag — and if the capture does land elsewhere, the ownership test below reads the ink off its box.
    const clip = { x: r.x - PAD, y: r.y - PAD, width: Math.max(1, r.w) + 2 * PAD, height: Math.max(1, r.h) + 2 * PAD, scale: 1 };
    const drawn = (await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true })).data;
    await evaluate(HIDE(r));
    const bare = (await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true })).data;
    await evaluate(UNHIDE);
    shots.push([drawn, bare]);
  }
  return evaluate(`(async () => { const regions = ${JSON.stringify(regions)}, shots = ${JSON.stringify(shots)}, PAD = ${PAD};
    const { ratio } = __c;
    const decode = async (png) => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; return { w: c.width, h: c.height, at: (x, y) => { const o = (y * c.width + x) * 4; return [d[o], d[o + 1], d[o + 2]]; } }; };
    const wcag = (p, q) => ratio(p.map((v) => v / 255), q.map((v) => v / 255));
    const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    const out = [];
    for (const [at, r] of regions.entries()) {
      const [a, b] = [await decode(shots[at][0]), await decode(shots[at][1])];
      // the target's box in the clip's pixels, where the code believes the clip was placed
      const L = PAD, T = PAD, R = PAD + r.w, B = PAD + r.h;
      const changed = (x, y) => { const p = a.at(x, y), q = b.at(x, y); return Math.max(...p.map((v, k) => Math.abs(v - q[k]))) > 2; };
      let n = 0, carried = 1, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let y = 0; y < a.h; y += 1) for (let x = 0; x < a.w; x += 1) {
        if (!changed(x, y)) continue;
        n += 1; carried = Math.max(carried, wcag(a.at(x, y), b.at(x, y)));
        x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
      const inside = n > 0 && x0 >= L - 1 && x1 <= R + 1 && y0 >= T - 1 && y1 <= B + 1;
      const where = n + ' px changed' + (n ? ', off its box by [' + [x0 - L, y0 - T, x1 - R, y1 - B].map((v) => Math.round(v)).join(',') + ']' : '');
      if (r.kind === 'glyph') {
        out.push({ name: r.name, ok: n >= 6 && inside && carried >= 3, got: where + ', ' + (Math.round(carried * 100) / 100) + ':1' });
        continue;
      }
      const il = Math.ceil(L), it = Math.ceil(T), ir = Math.floor(R), ib = Math.floor(B), counts = new Map();
      let all = 0, onFill = 0;
      for (let y = it; y < ib; y += 1) for (let x = il; x < ir; x += 1) { const p = a.at(x, y), k = p.join(',');
        counts.set(k, (counts.get(k) || 0) + 1); all += 1; if (d2(p, r.under) <= 3 * 12 * 12) onFill += 1; }
      const ground = [...counts].sort((p, q) => q[1] - p[1])[0][0].split(',').map(Number);
      let word = 1;
      for (let y = it + 1; y < ib - 1; y += 1) for (let x = il + 1; x < ir - 1; x += 1) if (changed(x, y)) word = Math.max(word, wcag(a.at(x, y), ground));
      const share = Math.round((onFill / Math.max(1, all)) * 100) / 100;
      out.push({ name: r.name, ok: n >= 3 && inside && share >= 0.4 && word >= 4.5,
        got: where + '; ' + share + ' of the box the fill ' + r.under + ', the word ' + (Math.round(word * 100) / 100) + ':1 on ' + ground });
    }
    return out; })()`);
};

const forcedCells = async (engine) => {
  for (const theme of ["warm", "green", "mono", "paper"]) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; null`);
    for (const scheme of ["light", "dark"]) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
      await sleep(60);
      const cell = `${engine}, ${theme}, ${scheme} palette`;
      const active = await evaluate("matchMedia('(forced-colors: active)').matches");
      if (!active) { check(`precondition: forced colours are active (${cell})`, false, active); continue; }
      const bad = (await evaluate(FORCED)).filter((row) => !row.ok);
      check(`forced colours (${cell}): every state pair differs and every glyph, mark, knob and word on a state reaches its ratio`, bad.length === 0, bad.map((row) => `${row.name}: ${row.got}`).join("\n        "));
      const unpainted = (await paint().catch((error) => [{ name: "the pixel read", ok: false, got: `threw: ${error.message}` }])).filter((row) => !row.ok);
      check(`forced colours (${cell}): PIXELS: each word on a redrawn state sits on its fill, not a Canvas backplate, and each glyph is painted`, unpainted.length === 0, unpainted.map((row) => `${row.name}: ${row.got}`).join("\n        "));
      const rings = [];
      for (const sel of [`${T("seg-text")} > [aria-pressed="true"]`, T("choice-on")]) {
        rings.push(await withForced(sel, ["focus", "focus-visible"], `(() => { const { cs, resolve, same } = __c; const b = cs('${sel}');
          return b.outlineStyle + ' ' + (same(b.outlineColor, resolve('Highlight')) ? 'Highlight' : b.outlineColor); })()`));
      }
      check(`forced colours (${cell}): a pressed segment and a chosen card, opted out of forcing, still ring in the system's Highlight`,
        rings.every((r) => r === "solid Highlight"), rings);
    }
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
  await evaluate("document.documentElement.dataset.theme = 'warm'; null");
};
s = await evaluate("CSS.supports('forced-color-adjust', 'preserve-parent-color')");
check("precondition: this browser has preserve-parent-color, so the first pass renders the glyphs' main branch", s === true, s);
await forcedCells("preserve-parent-color");

// THE FALLBACK, for an engine without preserve-parent-color: the same stylesheet with that condition
// made false in both @supports rules, so the `none` + CanvasText branch is the one that renders. It
// has to pass the same measurements.
s = await evaluate(`(async () => { const link = document.querySelector('link[href$="controls.css"]'); const css = await (await fetch(link.href)).text();
  const swapped = css.replaceAll('(forced-color-adjust: preserve-parent-color)', '(forced-color-adjust: no-such-value)');
  const style = document.createElement('style'); style.id = 'fallback-engine'; style.textContent = swapped; link.after(style); link.disabled = true;
  return [(css.match(/\\(forced-color-adjust: preserve-parent-color\\)/g) || []).length, CSS.supports('forced-color-adjust', 'no-such-value')]; })()`);
check("precondition: the fallback pass swapped both @supports conditions, and the swapped one is false", s[0] === 2 && s[1] === false, s);
await forcedCells("fallback (no preserve-parent-color)");
await evaluate(`(() => { document.getElementById('fallback-engine').remove(); document.querySelector('link[href$="controls.css"]').disabled = false; })(); null`);

/* ── hidden hides every control (X3), measured by behaviour on a page of its own ─ */

// Every class here sets its own display, and an author display beats the browser's [hidden] rule, so
// `hidden` hid NOTHING until tokens.css carried the one rule that answers it for the whole system.
// Asked of the files, not of a spelling: a page with tokens.css and controls.css and nothing else,
// 23 controls, groups and rows with `hidden`. While tokens.css does not hide them itself (WP1 not
// merged), WP1's rule is stood in on that page, and the NOTE says the result proves only that no
// control defeats the rule; DD_FORBID_STANDINS=1 fails instead.
const hiddenCases = async (standin) => {
  await send("Page.navigate", { url: `${ORIGIN}/__harness/hidden.html${standin ? "?standin" : ""}` });
  for (let i = 0; i < 50; i += 1) {
    await sleep(50);
    try { if (await evaluate("document.readyState === 'complete' && document.styleSheets.length >= 2")) break; } catch {}
  }
  return evaluate(`(() => ({ shown: getComputedStyle(document.getElementById('shown')).display,
    sheets: [...document.styleSheets].map((s) => (s.href || s.ownerNode.id).split('/').pop()),
    leaks: [...document.querySelectorAll('[data-case]')].filter((n) => { const r = n.getBoundingClientRect(); return getComputedStyle(n).display !== 'none' || r.width * r.height > 0; })
      .map((n) => n.dataset.case + ' -> ' + getComputedStyle(n).display),
    cases: document.querySelectorAll('[data-case]').length }))()`);
};
let hidden = await hiddenCases(false);
check("precondition: the X3 page loads tokens.css and controls.css only, and a control without `hidden` is displayed",
  hidden.sheets.join() === "tokens.css,controls.css" && hidden.shown === "inline-grid" && hidden.cases === 23, hidden);
if (hidden.leaks.length === 0) {
  check("hidden: tokens.css and controls.css alone hide every control, group and row (23 cases)", true);
} else {
  console.log(`NOTE  X3 STAND-IN in force: tokens.css does not hide them yet (${hidden.leaks.length} of 23 still displayed, e.g. ${hidden.leaks[0]}).`);
  console.log("      WP1's rule is stood in on the X3 page, so what follows proves only that no control defeats it.");
  if (process.env.DD_FORBID_STANDINS === "1") {
    check("DD_FORBID_STANDINS=1: tokens.css hides every control itself, with no [hidden] stand-in", false, hidden.leaks);
  }
  hidden = await hiddenCases(true);
  check("hidden: beside WP1's [hidden] rule (stood in), every control, group and row is display: none and draws no box (23 cases)",
    hidden.sheets.includes("x3-standin") && hidden.leaks.length === 0, hidden.leaks);
}

/* ── a coarse pointer: 44px, and revealed actions always visible ──────────────── */

await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await load();
await evaluate("document.documentElement.classList.add('anim-off'); null");
s = await evaluate(`(() => { const { rect, cs } = __c; return {
  media: [matchMedia('(pointer: coarse)').matches, matchMedia('(hover: none)').matches],
  sizes: { btnIcon: rect('${T("rest")}'), sm: rect('${T("sm")}'), switch: rect('${T("switch-off")}').h, check: rect('label:has(> ${T("cb-off")})').h,
    segment: rect('${T("seg-text")} > button').h, iconSegment: rect('${T("seg-icons")} > button'), card: rect('${T("choice-off")}').h, code: rect('${T("code-input")}').h },
  shown: [cs('${T("reveal")}').opacity, cs('${T("thumb-remove")}').opacity],
  disabled: [cs('${T("reveal-disabled")}').opacity, cs('${T("thumb-remove-disabled")}').opacity] }; })()`);
check("precondition: the page sees a coarse pointer and no hover", s.media.join() === "true,true", s.media);
const z = s.sizes;
check("coarse: every control reaches 44px — icon buttons both ways, a segment, a switch, a .check label, a card, the code input",
  z.btnIcon.w >= 44 && z.btnIcon.h >= 44 && z.sm.w >= 44 && z.sm.h >= 44 && z.switch >= 44 && z.check >= 44 && z.segment >= 44 &&
  z.iconSegment.w >= 44 && z.iconSegment.h >= 44 && z.card >= 44 && z.code >= 44, z);
check("(hover: none): revealed actions and a thumbnail's remove are simply visible", s.shown.join() === "1,1", s.shown);
check("...and a DISABLED revealed action and a disabled remove stay at .45, never full strength", s.disabled.join() === "0.45,0.45", s.disabled);
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await load();
await evaluate("document.documentElement.classList.add('anim-off'); null");

/* ── contrast, on every theme and surface ─────────────────────────────────────── */

const PAIRS = `(() => {
  const { el, cs, parse, over, ratio, under, firstColour, resolve } = __c;
  const P = (panel, probe) => el('[data-probe="' + probe + '"]', panel);
  const text = (node) => [parse(getComputedStyle(node).color), under(node)];
  const glyph = (node) => [parse(getComputedStyle(node, '::before').backgroundColor), under(node)];
  const edge = (node) => [parse(getComputedStyle(node).borderTopColor), under(node, false)];
  const track = (node) => over(parse(getComputedStyle(node, '::after').backgroundColor), under(node));
  const worst = (pairs) => Math.min(...pairs.map(([f, b]) => ratio(over(f, b), b)));
  const tones = ['success', 'warning', 'destructive', 'info', 'pending', 'muted'];
  const rows = [
    ['text', '.segmented at rest: --muted-foreground', (p) => text(P(p, 'seg-rest'))],
    ['text', '.segmented pressed: --primary on its 12% fill', (p) => text(P(p, 'seg-pressed'))],
    ['text', '.switch label: --foreground', (p) => text(P(p, 'switch-off'))],
    ['text', '.check label: --foreground', (p) => text(P(p, 'check'))],
    ['text', '.check-meta: --muted-foreground', (p) => text(P(p, 'check-meta'))],
    ['text', '.form-status: --muted-foreground', (p) => text(P(p, 'form-status'))],
    ['text', '.choice-title at rest, on --card', (p) => text(el('.choice-title', P(p, 'choice-rest')))],
    ['text', '.choice-desc at rest: --muted-foreground on --card', (p) => text(el('.choice-desc', P(p, 'choice-rest')))],
    ['text', '.choice-title pressed, on 12% --primary over --card', (p) => text(el('.choice-title', P(p, 'choice-pressed')))],
    ['text', '.choice-desc pressed: --foreground on 12% --primary', (p) => text(el('.choice-desc', P(p, 'choice-pressed')))],
    ['text', '.choice-desc pressed, warning tone', (p) => text(el('.choice-desc', P(p, 'choice-warning')))],
    ['text', '.dropzone at rest: --muted-foreground', (p) => text(P(p, 'drop-rest'))],
    ['text', '.dropzone hover / dragging: --primary on 8% --primary', (p) => text(P(p, 'drop-dragging'))],
    ['text', '.confirm-inline-note: --warning', (p) => text(P(p, 'confirm-note'))],
    ['text', '.confirm-code-value: --primary', (p) => text(P(p, 'code-value'))],
    ['text', '.confirm-code-status, data-tone=warning', (p) => text(P(p, 'code-status'))],
    ['edge', '--control-edge (btn-icon, segment, box, track, zone)', (p) => edge(P(p, 'icon-rest'))],
    ['edge', '.btn-icon glyph at rest: --primary', (p) => glyph(P(p, 'icon-rest'))],
    ['edge', '.btn-icon glyph hover / open: on its 12% wash', (p) => glyph(P(p, 'icon-expanded'))],
    ['edge', '.btn-icon pressed: the --primary fill against the surface', (p) => [[parse(cs(P(p, 'icon-pressed')).backgroundColor), under(P(p, 'icon-pressed'), false)]]],
    ['edge', '.btn-icon pressed: --primary-foreground glyph on --primary', (p) => glyph(P(p, 'icon-pressed'))],
    ['edge', '.btn-icon--bare glyph at rest: --muted-foreground', (p) => glyph(P(p, 'icon-bare'))],
    ['edge', '.btn-icon--bare glyph hover / open: --primary on --muted', (p) => glyph(P(p, 'icon-bare-expanded'))],
    ['edge', '.btn-icon--bare pressed: --primary-foreground glyph on --primary', (p) => glyph(P(p, 'icon-bare-pressed'))],
    ['edge', '.btn-icon[data-tone] glyph at rest (worst of 6 tones)', (p) => tones.map((t) => glyph(P(p, 'tone-' + t)))],
    ['edge', '.btn-icon[data-tone] pressed: --primary-foreground glyph on the tone (worst of 6)', (p) => tones.map((t) => glyph(P(p, 'tone-' + t + '-pressed')))],
    ['edge', '.btn-icon[data-tone] pressed: the tone fill against the surface (worst of 6)', (p) => tones.map((t) => edge(P(p, 'tone-' + t + '-pressed')))],
    ['edge', '.switch off: knob against its track', (p) => [[parse(firstColour(cs(P(p, 'switch-off'), '::after').backgroundImage)), track(P(p, 'switch-off'))]]],
    ['edge', '.switch on: --primary track against the surface', (p) => [[parse(cs(P(p, 'switch-on'), '::after').backgroundColor), under(P(p, 'switch-on'))]]],
    ['edge', '.switch on: knob against the track', (p) => [[parse(firstColour(cs(P(p, 'switch-on'), '::after').backgroundImage)), track(P(p, 'switch-on'))]]],
    ['edge', 'checkbox checked: --primary fill against the surface', (p) => [[parse(cs(P(p, 'cb-on')).backgroundColor), under(P(p, 'cb-on'), false)]]],
    ['edge', 'checkbox checked: the check against the fill', (p) => glyph(P(p, 'cb-on'))],
    ['edge', 'radio checked: --primary edge', (p) => edge(P(p, 'radio-on'))],
    ['edge', 'radio checked: --primary dot', (p) => glyph(P(p, 'radio-on'))],
    ['edge', '.segmented pressed: --primary edge', (p) => edge(P(p, 'seg-pressed'))],
    ['edge', '.choice-card pressed: the tone edge (primary, warning)', (p) => [edge(P(p, 'choice-pressed')), edge(P(p, 'choice-warning'))]],
    ['edge', '.choice-card glyph, rest and pressed', (p) => [glyph(P(p, 'choice-rest')), glyph(P(p, 'choice-pressed')), glyph(P(p, 'choice-warning'))]],
    ['edge', '.dropzone hover / dragging: --primary edge', (p) => edge(P(p, 'drop-dragging'))],
    ['edge', '.dropzone glyph, at rest and dragging', (p) => [glyph(P(p, 'drop-rest')), glyph(P(p, 'drop-dragging'))]],
    ['edge', 'focus ring: --ring', (p) => [[parse(resolve('var(--ring)')), under(p)]]],
  ];
  return rows.map(([kind, name, get]) => {
    const per = {};
    for (const panel of document.querySelectorAll('[data-surface]')) {
      let pairs = get(panel);
      if (!Array.isArray(pairs[0][0])) pairs = [pairs];
      per[panel.dataset.surface] = Math.round(worst(pairs) * 100) / 100;
    }
    return { kind, name, per };
  }); })()`;

// PRESSED IS TOLD FROM HOVERED, on every theme. The first version drew pressed as the hover wash, so a
// reader pointing at a toggle could not tell whether it was on. The fills (over the page) must differ
// by 3:1, the same bar as any other edge a state rests on.
const LOOK = (id) => `(() => { const { cs, parse, over, resolve } = __c; const page = parse(resolve('var(--background)'));
  const b = cs('${T(id)}'), fill = over(parse(b.backgroundColor), page); return { fill, glyph: over(parse(cs('${T(id)}', '::before').backgroundColor), fill) }; })()`;
const THEMES = ["warm", "green", "mono", "paper"];
const table = new Map();
for (const theme of THEMES) {
  await evaluate(`document.documentElement.dataset.theme = '${theme}'; null`);
  await sleep(50);
  for (const row of await evaluate(PAIRS)) {
    const entry = table.get(row.name) || { kind: row.kind, themes: {} };
    entry.themes[theme] = row.per;
    table.set(row.name, entry);
  }
  for (const [off, pressed, name] of [["star", "star-on", "bordered"], ["bare", "bare-on", "--bare"]]) {
    const hovered = await withForced(T(off), ["hover"], LOOK(off));
    s = await evaluate(`(() => { const { ratio } = __c; const h = ${JSON.stringify(hovered)}, p = ${LOOK(pressed)};
      return { fills: Math.round(ratio(h.fill, p.fill) * 100) / 100, glyphs: Math.round(ratio(h.glyph, p.glyph) * 100) / 100 }; })()`);
    check(`pressed is told from hovered, ${theme}, ${name}: the two fills differ by 3:1 or more`, s.fills >= 3, s);
  }
}
await evaluate("document.documentElement.dataset.theme = 'warm'; null");
for (const [name, { kind, themes }] of table) {
  const floor = kind === "text" ? 4.5 : 3;
  const low = THEMES.flatMap((t) => Object.entries(themes[t]).filter(([, v]) => v < floor).map(([surface, v]) => `${t}/${surface} ${v}`));
  check(`contrast >= ${floor}:1 on 4 themes x 3 surfaces — ${name}`, low.length === 0, low.join(", "));
}

console.log("\n| pairing | min | warm | green | mono | paper |\n|---|---:|---:|---:|---:|---:|");
for (const [name, { kind, themes }] of table) {
  const worstOf = (t) => Math.min(...Object.values(themes[t])).toFixed(2);
  console.log(`| ${name} | ${kind === "text" ? "4.5" : "3.0"} | ${THEMES.map(worstOf).join(" | ")} |`);
}

console.log(failures
  ? `\ncheck-controls: ${failures} FAILED`
  : "\ncheck-controls: all checks passed");
process.exit(failures ? 1 : 0);
