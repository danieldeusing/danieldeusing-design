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
 *   FORCED  under forced colours, light and dark, every mask glyph stands 3:1 off what it sits on
 *           and every state still differs from its neighbour — the mode repaints backgrounds as
 *           Canvas, which erases both. "Not the Canvas colour" is not enough: an opted-out glyph
 *           paints the colour its element was GIVEN, so cream on the white Canvas passes that test;
 *   FOCUS   each component draws its OWN 2px --ring focus ring. Asserted with base.css switched
 *           off: base.css draws a global ring that would answer for a component that lost its rule;
 *   FONT    a control renders in its surroundings' font, not the browser's 13.33px control font;
 *   HIDDEN  `hidden` hides every component, whatever `display` the component sets;
 *   STATES  disabled is .45 and does not answer the pointer; busy is full strength and keeps focus;
 *           a popup whose first child is not a row still lays its rows out flush;
 *   RADIUS  no corner on the page is rounded, except a circle.
 *
 * A real browser (layout, cascade and the forced-colours mode are the subject), served off the
 * working tree over loopback, debugging port 0 read back from DevToolsActivePort. No browser: it
 * SKIPS loudly, and fails under DD_REQUIRE_BROWSER=1.
 *
 *   node scripts/check-components.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, normalize, extname } from "node:path";
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
], { stdio: "ignore" });
let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); };
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

await send("Page.enable");
await send("DOM.enable");
await send("CSS.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/examples/components.html` });
for (let i = 0; i < 50; i += 1) {
  const ran = await evaluate(`document.getElementById("height-check")?.dataset.result || ""`).catch(() => "");
  if (ran) break;
  await sleep(100);
}
// A forced :hover would otherwise be read mid-transition. The select.js trigger gets a name to aim at.
await evaluate(`(() => {
  const s = document.createElement("style");
  s.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(s);
  document.querySelector("#sel-model").closest(".select-field").querySelector(".select-trigger").id = "trigger-model";
  document.querySelector("select[disabled]").closest(".select-field").querySelector(".select-trigger").id = "trigger-disabled";
  window.token = (name, prop = "color") => { const p = document.createElement("i"); p.style[prop] = "var(" + name + ")"; document.body.append(p);
    const v = getComputedStyle(p)[prop]; p.remove(); return v; };
  window.sys = (name) => { const p = document.createElement("i"); p.style.backgroundColor = name; document.body.append(p);
    const v = getComputedStyle(p).backgroundColor; p.remove(); return v; };
  window.cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo || null);
})()`);

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

/* ── FORCED ───────────────────────────────────────────────────────────────── */
const FORCED = `(() => {
  const canvas = sys("Canvas");
  const bg = (sel, pseudo) => cs(sel, pseudo).backgroundColor;
  const fg = (sel) => cs(sel).color;
  const rgb = (c) => c.match(/[\\d.]+/g).map(Number);
  const over = (top, under) => { const a = top[3] ?? 1; return [0, 1, 2].map((i) => a * top[i] + (1 - a) * under[i]); };
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  // What a glyph sits on: the first opaque-ish background from its host up, over Canvas.
  const backdrop = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor);
    if ((c[3] ?? 1) > 0) return over(c, rgb(canvas)); } return rgb(canvas); };
  const standsOff = (sel, pseudo) => { const el = document.querySelector(sel); const under = backdrop(pseudo ? el : el.parentElement);
    const ink = over(rgb(bg(sel, pseudo)), under); const [x, y] = [lum(ink), lum(under)];
    return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); };
  const plainOption = '#static-listbox .select-option:not([aria-selected="true"]):not([data-active]):not([aria-disabled="true"])';
  const glyphs = {
    "busy spinner": standsOff("#btn-busy", "::before"), "bin": standsOff("#btn-bin", "::after"), "pencil": standsOff("#btn-edit", "::after"),
    "menu ✓": standsOff("#static-checked", "::before"), "listbox ✓": standsOff("#opt-chosen", "::before"),
    "zoom hint": standsOff("#dgm", "::after"), "theme dot": standsOff("#theme-menu .dd-dot"),
  };
  const pairs = {
    "menu ✓ — checked vs not": [bg("#static-checked", "::before"), bg('#static-menu [aria-checked="false"]', "::before")],
    "listbox ✓ — selected vs not": [bg("#opt-chosen", "::before"), bg(plainOption, "::before")],
    "listbox row — keyboard-active vs rest": [bg("#opt-active"), bg(plainOption)],
    "menu row — active vs rest": [bg('#static-menu [data-active="true"]'), bg("#static-plain")],
    "menu row — off vs on": [fg("#static-disabled"), fg("#static-plain")],
    "listbox row — off vs on": [fg("#opt-disabled"), fg(plainOption)],
    "menu row — where you are vs rest": [fg("#static-current"), fg("#static-plain")],
    "minimap bar — current vs rest": [bg('.minimap-bar[aria-current="true"]'), bg(".minimap-bar:not([aria-current])")],
  };
  return { forced: matchMedia("(forced-colors: active)").matches, canvas, glyphs, pairs,
    caret: [cs("#trigger-model").backgroundImage, cs("#trigger-model", "::after").content] };
})()`;

await section("FORCED — forced colours keep every glyph and every state (X1)", async () => {
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
    await sleep(120);
    const r = await evaluate(FORCED);
    check(`${scheme}: the forced-colours mode is on (the check can see it at all)`, r.forced, r.forced);
    const lost = Object.entries(r.glyphs).filter(([, ratio]) => !(ratio >= 3));
    check(`${scheme}: every mask glyph stands at least 3:1 off what it sits on (Canvas is ${r.canvas})`, lost.length === 0, r.glyphs);
    const same = Object.entries(r.pairs).filter(([, [a, b]]) => a === b);
    check(`${scheme}: every state differs from its neighbour — ${Object.keys(r.pairs).length} pairs`, same.length === 0, same);
    check(`${scheme}: the select's caret survives — the mode drops its gradient, and a text glyph stands in`,
      /▾/.test(r.caret[1]), r.caret);
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
  await sleep(80);
  const plain = await evaluate(`[cs("#trigger-model", "::after").content, cs("#trigger-model").backgroundImage]`);
  check("without the mode the caret is the gradient again, and there is no text glyph", plain[0] === "none" && plain[1].includes("gradient"), plain);
});

/* ── FOCUS and FONT, with base.css switched off ───────────────────────────── */
const RINGS = [
  [".btn-terminal (filled)", "#btn-cta", "2px"], [".btn-terminal--ghost", "#btn-ghost", "2px"], [".btn-terminal--destructive", "#btn-bin", "2px"],
  ["a.link-quiet", "#lq-a", "2px"], ["button.link-quiet", "#lq-button", "2px"], [".disclosure-btn", "#disc-1", "2px"],
  ["a.card-terminal", "#card-link", "2px"], ["button.card-terminal", "#card-button", "2px"],
  [".dropdown > summary", "#dd-actions > summary", "2px"], [".dropdown-item (inset)", "#static-plain", "-2px"],
  ["text field", "#in-text", "2px"], ["textarea", "#in-textarea", "2px"], [".select-trigger", "#trigger-model", "2px"],
  [".field-row > button.lbl", "#f-hint", "2px"], ["details.fold > summary", "#fold-plain > summary", "2px"],
  [".dgm-zoomable", "#dgm", "2px"], [".minimap-bar", ".minimap-bar", "3px"],
];
const ringOf = async (selector) => {
  await force(selector, ["focus", "focus-visible"]);
  const ring = await evaluate(`(() => { const c = cs(${JSON.stringify(selector)}); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset]; })()`);
  await force(selector, []);
  return ring;
};

await section("FOCUS — each component draws its own ring, base.css off (X2)", async () => {
  await evaluate(`document.querySelector('link[href$="base.css"]').disabled = true;
    const probe = document.createElement("button"); probe.id = "bare-probe"; probe.textContent = "probe"; document.body.append(probe); null`);
  const ring = await evaluate(`token("--ring")`);
  const bare = await ringOf("#bare-probe");
  check("with base.css off, an element with no component rule has no system ring — so this check can fail",
    !(bare[0] === "solid" && bare[1] === "2px" && bare[2] === ring), bare);
  const wrong = [];
  for (const [name, selector, offset] of RINGS) {
    const [style, width, colour, off] = await ringOf(selector);
    if (!(style === "solid" && width === "2px" && colour === ring && off === offset)) wrong.push({ name, style, width, colour, off, want: offset });
  }
  check(`${RINGS.length} components each draw a 2px solid --ring ring at their offset, from their own rule`, wrong.length === 0, wrong);
});

await section("FONT — a control takes its surroundings' font, not the browser's (X2)", async () => {
  const fonts = await evaluate(`(() => {
    const fsBase = token("--fs-base", "fontSize");
    return ["#btn-cta", "#btn-ghost", "#btn-bin", "#lq-button", "#disc-1", "#card-button", "#f-hint", "#in-text", "#in-textarea",
      "#trigger-model", "#static-plain"].map((sel) => {
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
      "#theme-menu .dd-dot", "#dd-actions", ".minimap", ".minimap-bar"];
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
  for (const sel of ["#btn-ghost-disabled", "#in-disabled", "#trigger-disabled"]) inert[sel] = await pointerProof(sel);
  // WP6's filtering trigger holds a --primary edge at (0,2,0); a disabled one keeps it under the pointer.
  await evaluate(`(() => { const s = document.createElement("style"); s.id = "filtering-stand-in";
    s.textContent = '.x-filtering[data-active="true"] { border-color: var(--primary); }'; document.head.append(s);
    const t = document.getElementById("trigger-disabled"); t.classList.add("x-filtering"); t.dataset.active = "true"; })()`);
  inert["#trigger-disabled (filtering)"] = await pointerProof("#trigger-disabled");
  await evaluate(`(() => { document.getElementById("filtering-stand-in").remove(); const t = document.getElementById("trigger-disabled");
    t.classList.remove("x-filtering"); delete t.dataset.active; })()`);
  const moved = Object.entries(inert).filter(([, v]) => v.rest !== v.hovered);
  check("a disabled button, field or trigger — a filtering trigger included — does not change under the pointer", moved.length === 0, moved);
  const live = await pointerProof("#in-text");
  check("...while an enabled field still does (so the pointer is really forced)", live.rest !== live.hovered, live);

  const busy = await evaluate(`(() => { const b = document.getElementById("btn-busy"); b.focus();
    return { opacity: cs("#btn-busy").opacity, spinner: cs("#btn-busy", "::before").maskImage.startsWith("url("),
      focused: document.activeElement === b, disabled: b.disabled, ariaDisabled: b.getAttribute("aria-disabled") }; })()`);
  check("busy: full strength, the spinner drawn, focus kept — aria-disabled, never disabled (X5)",
    busy.opacity === "1" && busy.spinner && busy.focused && !busy.disabled && busy.ariaDisabled === "true", busy);

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

console.log(failures ? `\ncheck-components: ${failures} FAILED` : "\ncheck-components: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
