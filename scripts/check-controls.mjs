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
 * reduced motion and print EMULATED.
 *
 * WHAT IT COVERS, in the order below:
 *   · each element's box, edge, colour and every state (rest, hover, focus, pressed, disabled, busy)
 *   · the drop zone's keyboard path: Tab reaches the hidden input and rings the ZONE; a mouse click
 *     opens the picker and draws no ring; Space opens it too
 *   · self-sufficiency: with base.css and components.css switched off, the controls compute the same
 *   · no radius anywhere except the radio, which is a circle
 *   · 44px under a coarse pointer; revealed actions visible under (hover: none); reduced motion; print
 *   · CONTRAST: every new text and edge pairing, on warm / green / mono / paper, over --background,
 *     --card and --muted. Text >= 4.5:1, control edges and glyphs >= 3:1. The table it prints is the
 *     one in the release notes.
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
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root + sep) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": (TYPES[extname(path)] || "application/octet-stream") + "; charset=utf-8" });
  res.end(readFileSync(path));
}).listen(0, "127.0.0.1");
await new Promise((ok) => server.on("listening", ok));
const PAGE = `http://127.0.0.1:${server.address().port}/examples/controls.html`;

/* ── the browser ── */
const profile = mkdtempSync(join(tmpdir(), "dd-controls-"));
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
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};

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

/*
 * THE STAND-IN BLOCK CAN HIDE A MISSING DECLARATION. examples/controls.html carries copies of tokens
 * and classes other packages own, so this branch renders before they land. Once they have landed, a
 * stand-in still in the page would keep this suite green over a declaration nobody made, and real
 * pages would paint a solid square where a glyph should be. So every run reports what the block is
 * still COVERING FOR: each item is measured with the block on and off, and listed if it changes.
 * Delete the block at integration; anything missing then fails below, loudly.
 */
const covering = await evaluate(`(() => {
  const block = document.getElementById('stand-ins');
  if (!block) return null;
  const read = () => {
    const root = getComputedStyle(document.documentElement), c = __c;
    return {
      '--control-h / --control-edge / --icon-*': ['--control-h', '--control-edge', '--icon-size'].map((p) => root.getPropertyValue(p)).join('|'),
      '[data-tone] -> --tone': getComputedStyle(c.el('${T("destructive")}')).getPropertyValue('--tone'),
      '[data-icon] -> --ico': getComputedStyle(c.el('${T("rest")}')).getPropertyValue('--ico'),
      '.ico / .ico--xl': c.cs('${T("dropzone")} .ico').width,
      'dd-spin + html.anim-off transitions': [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.name === 'dd-spin'); } catch { return false; } }) + '|' + (document.documentElement.classList.add('anim-off'), c.cs('${T("rest")}').transitionDuration),
      '.btn-terminal--danger': c.cs('${T("confirm-armed")} .btn-terminal--danger').color,
      '.filter-bar': c.cs('${T("filter-bar")}').display,
    };
  };
  const on = read();
  block.disabled = true;
  const off = read();
  block.disabled = false;
  return Object.keys(on).filter((k) => on[k] !== off[k]);
})()`);
console.log(covering === null
  ? "NOTE  no stand-in block: every token and class is the real one"
  : `NOTE  the demo's stand-in block is still covering for: ${covering.length ? covering.join(", ") : "nothing (delete it)"}`);

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

s = await withForced(T("rest"), ["focus", "focus-visible"], `(() => { const { cs, resolve, same } = __c; const b = cs('${T("rest")}');
  return { w: b.outlineWidth, st: b.outlineStyle, off: b.outlineOffset, ring: same(b.outlineColor, resolve('var(--ring)')) }; })()`);
check("focus-visible: a 2px solid --ring outline, 2px out", s.w === "2px" && s.st === "solid" && s.off === "2px" && s.ring, s);

s = await evaluate(`(() => { const { cs, resolve, same } = __c;
  const on = cs('${T("star-on")}'), exp = cs('${T("expanded")}'), wash = resolve('color-mix(in srgb, var(--primary) 12%, transparent)');
  return { pressed: same(on.backgroundColor, wash) && same(on.borderTopColor, on.color), expanded: same(exp.backgroundColor, wash),
    filled: cs('${T("star-on")}', '::before').maskImage === resolve('var(--ico-star-filled)', 'mask-image'),
    outline: cs('${T("star")}', '::before').maskImage === resolve('var(--ico-star)', 'mask-image') }; })()`);
check("pressed and expanded KEEP the hover look without a pointer", s.pressed && s.expanded, s);
check("a pressed star is the FILLED star; an unpressed one the outline", s.filled && s.outline, s);

for (const id of ["disabled", "aria-disabled"]) {
  s = await withForced(T(id), ["hover"], `(() => { const { cs, resolve, same } = __c; const b = cs('${T(id)}');
    return { op: b.opacity, cursor: b.cursor, edge: same(b.borderTopColor, resolve('var(--control-edge)')), bg: b.backgroundColor }; })()`);
  check(`${id}: .45, default cursor, and no hover under a forced :hover`, s.op === "0.45" && s.cursor === "default" && s.edge && s.bg === "rgba(0, 0, 0, 0)", s);
}

s = await evaluate(`(() => { const { cs, resolve } = __c; const g = cs('${T("busy")}', '::before');
  return { mask: g.maskImage === resolve('var(--ico-loader-circle)', 'mask-image'), anim: g.animationName, dur: g.animationDuration, n: g.animationIterationCount }; })()`);
check("aria-busy: the glyph becomes the loader (the animation is asserted with motion on, below)", s.mask, s);

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
s = await withForced(T("switch-off"), ["focus", "focus-visible"], `(() => { const b = __c.cs('${T("switch-off")}'); return [b.outlineWidth, b.outlineStyle, b.outlineOffset]; })()`);
check("...focus-visible rings the whole button, label and track", s.join() === "2px,solid,2px", s);
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
s = await withForced(T("cb-off"), ["focus", "focus-visible"], `(() => { const b = __c.cs('${T("cb-off")}'); return [b.outlineWidth, b.outlineStyle, b.outlineOffset]; })()`);
check("...focus-visible: the 2px ring", s.join() === "2px,solid,2px", s);
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
s = await withForced(`${T("seg-text")} > :nth-child(2)`, ["focus", "focus-visible"], `(() => { const b = __c.cs('${T("seg-text")} > :nth-child(2)'); return [b.outlineWidth, b.outlineStyle, b.outlineOffset, b.zIndex]; })()`);
check("...focus-visible: the ring, lifted above a pressed neighbour (z 2)", s.join() === "2px,solid,2px,2", s);

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
s = await withForced(T("choice-off"), ["focus", "focus-visible"], `(() => { const b = __c.cs('${T("choice-off")}'); return [b.outlineWidth, b.outlineStyle, b.outlineOffset]; })()`);
check("...focus-visible: the ring", s.join() === "2px,solid,2px", s);

/* ── .dropzone and .thumb-grid ────────────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const z = cs('${T("dropzone")}'), i = __c.el('${T("dropzone-input")}');
  return { z: [z.display, z.borderTopWidth, z.borderTopStyle, same(z.borderTopColor, resolve('var(--control-edge)')), same(z.color, resolve('var(--muted-foreground)')), z.paddingTop, z.cursor],
    input: [rect('${T("dropzone-input")}').w, rect('${T("dropzone-input")}').h, getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility === 'visible', i.tabIndex] }; })()`);
check(".dropzone: a padded grid behind a 1px DASHED --control-edge, in --muted-foreground", s.z.join() === "grid,1px,dashed,true,true,16px,pointer", s.z);
check("...its file input is hidden to the eye (1px) and still in the tab order", s.input.join() === "1,1,true,0", s.input);
for (const [how, go] of [["hover", (e) => withForced(T("dropzone"), ["hover"], e)], ["data-dragging", (e) => evaluate(e.replaceAll(T("dropzone"), T("dropzone-dragging")))]]) {
  s = await go(`(() => { const { cs, resolve, same } = __c; const z = cs('${T("dropzone")}');
    return [same(z.borderTopColor, resolve('var(--primary)')), same(z.color, resolve('var(--primary)')), same(z.backgroundColor, resolve('color-mix(in srgb, var(--primary) 8%, transparent)'))]; })()`);
  check(`...${how}: --primary edge, --primary text, an 8% --primary fill`, s.every(Boolean), s);
}
s = await withForced(T("dropzone-disabled"), ["hover"], `(() => { const { cs, resolve, same } = __c; const z = cs('${T("dropzone-disabled")}');
  return [z.opacity, z.cursor, same(z.borderTopColor, resolve('var(--control-edge)'))]; })()`);
check("...disabled input: the zone is .45 and does not light", s.join() === "0.45,default,true", s);

// The keyboard path, with REAL keys: Tab from the control before it lands on the hidden input and
// rings the zone; Space opens the picker. Then a real mouse click: it opens the picker too, and
// draws no ring, which is the difference between :has(:focus-visible) and :focus-within.
await send("Page.setInterceptFileChooserDialog", { enabled: true });
await evaluate(`__c.el('${T("choice-warning")}').focus(); null`);
await key("Tab", "Tab", 9);
s = await evaluate(`(() => { const z = __c.cs('${T("dropzone")}'); return { active: document.activeElement === __c.el('${T("dropzone-input")}'), ring: [z.outlineWidth, z.outlineStyle, z.outlineOffset] }; })()`);
check("Tab reaches the drop zone's hidden input", s.active, s);
check("...and the ZONE shows the focus ring", s.ring.join() === "2px,solid,2px", s.ring);
let before = events.filter((m) => m === "Page.fileChooserOpened").length;
await key(" ", "Space", 32, " ");
await sleep(200);
check("...Space opens the file picker", events.filter((m) => m === "Page.fileChooserOpened").length > before);
await evaluate("document.activeElement.blur(); null");
// `instant`: base.css makes scrolling smooth, and a rect read mid-scroll puts the click somewhere else.
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

/* ── .reveal ──────────────────────────────────────────────────────────────────── */

s = await evaluate(`(() => { const r = __c.cs('${T("reveal")}'); return [r.opacity, r.display, r.visibility]; })()`);
check(".reveal rests at opacity 0, never display: none or visibility: hidden", s[0] === "0" && s[1] !== "none" && s[2] === "visible", s);
s = await withForced(T("reveal-host"), ["hover"], `__c.cs('${T("reveal")}').opacity`);
check("...hovering its host shows it", s === "1", s);
s = await evaluate(`(() => { const b = __c.el('${T("reveal-btn")}'); b.focus(); const out = [document.activeElement === b, getComputedStyle(__c.el('${T("reveal")}')).opacity]; b.blur(); return out; })()`);
check("...and a hidden action is still a TAB STOP: focusing it shows it", s.join() === "true,1", s);

/* ── .confirm-inline and .confirm-code ────────────────────────────────────────── */

s = await evaluate(`(() => { const { cs, resolve, same } = __c; const c = cs('${T("confirm-armed")}');
  return [['inline-flex', 'flex'].includes(c.display), c.alignItems, c.columnGap, same(cs('${T("confirm-note")}').color, resolve('var(--warning)'))]; })()`);
// inline-flex, or flex once blockified as the item of a flex row, which is where the demo puts it.
check(".confirm-inline: an inline row 8px apart, its note in --warning", s.join() === "true,center,8px,true", s);

s = await evaluate(`(() => { const { cs, rect, resolve, same } = __c; const v = cs('${T("code-value")}'), i = cs('${T("code-input")}'), st = cs('${T("code-status")}'), bad = cs('${T("code-status-bad")}');
  return { value: [v.fontSize, v.fontWeight, v.letterSpacing, v.fontVariantNumeric, same(v.color, resolve('var(--primary)')), v.marginTop, v.fontFamily === resolve('var(--font-mono)', 'font-family')],
    input: [i.fontSize, i.letterSpacing, i.maxWidth, rect('${T("code-input")}').h, i.borderTopWidth, same(i.borderTopColor, resolve('var(--control-edge)')), i.fontFamily === resolve('var(--font-mono)', 'font-family')],
    status: [st.minHeight === st.lineHeight, same(st.color, resolve('var(--muted-foreground)')), same(bad.color, resolve('var(--warning)'))] }; })()`);
check(".confirm-code-value: --fs-xl, 700, tracked .16em, tabular, --primary, mono", s.value.join() === "18px,700,2.88px,tabular-nums,true,0px,true", s.value);
check(".confirm-code-input: the ONE text size, tracked .14em, capped at 14rem, at --control-h, mono",
  s.input.join() === "12px,1.68px,224px,28,1px,true,true", s.input);
check(".confirm-code-status: one line reserved; muted by default, --warning under data-tone", s.status.every(Boolean), s.status);
s = await withForced(T("code-input"), ["focus", "focus-visible"], `(() => { const { cs, resolve, same } = __c; const i = cs('${T("code-input")}');
  return [i.outlineWidth, i.outlineStyle, same(i.borderTopColor, resolve('var(--primary)'))]; })()`);
check("...focus-visible: the ring AND a --primary edge", s.join() === "2px,solid,true", s);

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

/* ── self-sufficient: tokens.css + controls.css alone compute the same ────────── */

// What each control's own rules decide. Sizes only where the class fixes them (the rest track the
// inherited font, which base.css legitimately sets); colour only where the class sets it (a layout
// row inherits it from <body>); a border colour only where a border is drawn (base.css recolours
// every invisible one).
const SNAPSHOT = `(() => {
  const props = ['box-sizing', 'min-height', 'width', 'height', 'padding-top', 'padding-left', 'margin-left', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius', 'background-color', 'background-image', 'mask-image', 'color', 'cursor', 'opacity', 'display', 'gap', 'z-index', 'font-weight'];
  const subjects = [
    // [hook, pseudos, fixed size, own colour]
    ['rest', ['::before'], true, true], ['sm', ['::before'], true, true], ['bare', ['::before'], true, true],
    ['star-on', ['::before'], true, true], ['disabled', ['::before'], true, true], ['busy', ['::before'], true, true],
    ['switch-off', ['::after'], false, true], ['switch-on', ['::after'], false, true],
    ['cb-off', ['::before'], true, false], ['cb-on', ['::before'], true, false], ['cb-mixed', ['::before'], true, false], ['radio-on', ['::before'], true, false],
    ['choice-on', ['::before'], false, true], ['choice-warning', ['::before'], false, true],
    ['dropzone', [], false, true], ['dropzone-dragging', [], false, true], ['thumb-remove', ['::before'], true, true],
    ['code-value', [], false, true], ['code-input', [], false, true], ['code-status-bad', [], false, true], ['confirm-note', [], false, true],
    ['seg-text', [], false, false], ['confirm-armed', [], false, false], ['actions', [], false, false], ['actions-ruled', [], false, false],
    ['btn-row', [], false, false], ['group-icons', [], false, false], ['choice-grid', [], false, false], ['thumbs', [], false, false],
  ];
  const out = {};
  const snap = (key, c, sized, coloured) => {
    out[key] = props.filter((p) => (sized || !['width', 'height'].includes(p)) && (coloured || p !== 'color') && (p !== 'border-top-color' || c.borderTopStyle !== 'none'))
      .map((p) => p + ':' + c.getPropertyValue(p)).join(';');
  };
  for (const [id, pseudos, sized, coloured] of subjects) {
    const n = __c.el('[data-t="' + id + '"]');
    snap(id, getComputedStyle(n), sized, coloured);
    for (const pseudo of pseudos) snap(id + pseudo, getComputedStyle(n, pseudo), true, true);
  }
  for (const b of document.querySelectorAll('[data-t="seg-text"] > button, [data-t="seg-icons"] > button')) snap('segment ' + (b.textContent || b.getAttribute('aria-label')), getComputedStyle(b), !b.textContent, true);
  return out; })()`;
const full = await evaluate(SNAPSHOT);
await evaluate(`for (const l of document.querySelectorAll('link[href$="base.css"], link[href$="components.css"]')) l.disabled = true; null`);
const bare = await evaluate(SNAPSHOT);
// A disabled <link> leaves document.styleSheets, and its rules stop applying: both are asserted, so
// the comparison below cannot pass by comparing a page with itself.
const off = await evaluate(`[[...document.styleSheets].map((x) => (x.href || '').split('/').pop()).filter((n) => n === 'base.css' || n === 'components.css').length,
  getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.btn-terminal')).paddingTop]`);
const drift = Object.keys(full).filter((k) => full[k] !== bare[k]).map((k) => `${k}\n          with:    ${full[k]}\n          without: ${bare[k]}`);
check("precondition: base.css and components.css really are switched off (gone from the page, body unpainted, .btn-terminal unstyled)",
  off[0] === 0 && off[1] === "rgba(0, 0, 0, 0)" && off[2] === "1px", off);
check("SELF-SUFFICIENT: with base.css and components.css off, every control computes the same", drift.length === 0, drift.slice(0, 3).join("\n        "));
await evaluate(`for (const l of document.querySelectorAll('link[disabled], link')) l.disabled = false; null`);

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

await send("Emulation.setEmulatedMedia", { media: "print" });
s = await evaluate(`(() => { const shown = (sel) => getComputedStyle(__c.el(sel)).display;
  return { gone: ['${T("rest")}', '${T("group-icons")}', '${T("seg-text")}', '${T("actions")}', '${T("btn-row")}', '${T("dropzone")}', '${T("reveal")}', '${T("confirm-armed")}', '${T("confirm-code")}'].map(shown),
    kept: [shown('${T("switch-on")}'), shown('${T("cb-on")}'), shown('${T("choice-on")}')],
    exact: [['${T("cb-on")}'], ['${T("cb-on")}', '::before'], ['${T("radio-on")}', '::before'], ['${T("switch-on")}', '::after']].map(([sel, pseudo]) => { const c = __c.cs(sel, pseudo); return c.printColorAdjust || c.webkitPrintColorAdjust; }) }; })()`);
check("print removes the controls that only act", s.gone.every((d) => d === "none"), s.gone);
check("...keeps the ones that carry a value", s.kept.every((d) => d !== "none"), s.kept);
check("...and keeps their fills on paper (print-color-adjust: exact), or a checked box prints empty", s.exact.every((v) => v === "exact"), s.exact);
await send("Emulation.setEmulatedMedia", { media: "" });

/* ── a coarse pointer: 44px, and revealed actions always visible ──────────────── */

await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await load();
await evaluate("document.documentElement.classList.add('anim-off'); null");
s = await evaluate(`(() => { const { rect, cs } = __c; return {
  media: [matchMedia('(pointer: coarse)').matches, matchMedia('(hover: none)').matches],
  sizes: { btnIcon: rect('${T("rest")}'), sm: rect('${T("sm")}'), switch: rect('${T("switch-off")}').h, check: rect('label:has(> ${T("cb-off")})').h,
    segment: rect('${T("seg-text")} > button').h, iconSegment: rect('${T("seg-icons")} > button'), card: rect('${T("choice-off")}').h, code: rect('${T("code-input")}').h },
  shown: [cs('${T("reveal")}').opacity, cs('${T("thumb-remove")}').opacity] }; })()`);
check("precondition: the page sees a coarse pointer and no hover", s.media.join() === "true,true", s.media);
const z = s.sizes;
check("coarse: every control reaches 44px — icon buttons both ways, a segment, a switch, a .check label, a card, the code input",
  z.btnIcon.w >= 44 && z.btnIcon.h >= 44 && z.sm.w >= 44 && z.sm.h >= 44 && z.switch >= 44 && z.check >= 44 && z.segment >= 44 &&
  z.iconSegment.w >= 44 && z.iconSegment.h >= 44 && z.card >= 44 && z.code >= 44, z);
check("(hover: none): revealed actions and a thumbnail's remove are simply visible", s.shown.join() === "1,1", s.shown);
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
    ['edge', '.btn-icon glyph hover / pressed: on its 12% wash', (p) => glyph(P(p, 'icon-pressed'))],
    ['edge', '.btn-icon--bare glyph at rest: --muted-foreground', (p) => glyph(P(p, 'icon-bare'))],
    ['edge', '.btn-icon--bare glyph hover / pressed: --primary on --muted', (p) => glyph(P(p, 'icon-bare-pressed'))],
    ['edge', '.btn-icon[data-tone] glyph at rest (worst of 6 tones)', (p) => tones.map((t) => glyph(P(p, 'tone-' + t)))],
    ['edge', '.btn-icon[data-tone] glyph pressed (worst of 6 tones)', (p) => tones.map((t) => glyph(P(p, 'tone-' + t + '-pressed')))],
    ['edge', '.btn-icon[data-tone] edge pressed (worst of 6 tones)', (p) => tones.map((t) => edge(P(p, 'tone-' + t + '-pressed')))],
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
    ['edge', '.dropzone glyph at rest', (p) => { const i = el('.ico', P(p, 'drop-rest')); return [parse(getComputedStyle(i).color), under(i, false)]; }],
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
