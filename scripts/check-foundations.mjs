#!/usr/bin/env node
/*
 * check-foundations.mjs — the token layer and the element defaults, measured in a browser.
 *
 * WHAT IT GUARDS. The foundations are the numbers every other file resolves against: one control
 * height, a field edge that clears WCAG 1.4.11 on four themes, twelve categorical hues that clear
 * AA text contrast on three surfaces per theme, the motion kill switch, the tone map, the element
 * defaults and the icon masks. None of that fails loudly when it breaks. A hue retuned by eye still
 * renders a colour; a kill switch that stops keyframes but not transitions still looks like it
 * works; an icon whose SVG is invalid simply paints nothing. So each is asserted by MEASURING it.
 *
 * MEASURED THROUGH THE BROWSER, NOT BESIDE IT. A contrast figure computed from the hexes in
 * tokens.css proves the arithmetic, not the page. Here every colour is the browser's own computed
 * value of the token, rasterised on a canvas — composited over the surface it sits on when it is
 * translucent — and the WCAG ratio is taken from those pixels. The same four themes, the same
 * three surfaces (--background, --card, --muted) the token comments quote, and the numbers are
 * printed so a reader can hold them against those comments.
 *
 * It drives examples/foundations.html, the package's demo page, served from this checkout by a
 * loopback server: the page loads reset.css + tokens.css + base.css and nothing else, which is
 * also the proof that none of this leans on components.css.
 *
 * A REAL BROWSER, and no dependency — the headless chromium Playwright caches, over the DevTools
 * protocol with Node's own fetch and WebSocket. With no browser on the machine it SKIPS loudly;
 * DD_REQUIRE_BROWSER=1 makes that skip a failure.
 *
 *   node scripts/check-foundations.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
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
  console.log("check-foundations: SKIPPED — no headless chromium on this machine.");
  console.log("  Contrast is measured from rendered pixels and motion from computed styles; no stub");
  console.log("  can stand in for either. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const THEMES = ["warm", "green", "mono", "paper"];
const SURFACES = ["--background", "--card", "--muted"];
const CATS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "purple", "pink"];
const ICONS = ["check", "minus", "x", "search", "filter", "arrow-up", "arrow-down", "chevron-down", "chevron-left",
  "trash-2", "pencil", "loader-circle", "refresh-cw", "star", "star-filled", "history", "home", "image-plus",
  "triangle-alert", "package", "download"];
const TONES = ["primary", "success", "warning", "destructive", "info", "pending", "muted"];
const TEXT = ["foreground", "muted-foreground", "primary", "success", "warning", "destructive", "info", "pending"];

/* ── serve this checkout ─────────────────────────────────────────────────── */

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript" };
// One page on the REAL build-free bundle, for the question the demo cannot answer: does a text
// utility beat a component class that sets colour (F8)? The demo loads no component file.
const BUNDLE_F8 = `<!doctype html><html data-theme="warm"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/index.css"></head><body>
<a id="f8-doclink" class="doc-link text-primary" href="#">doc-link text-primary</a>
<p id="f8-prompt" class="prompt text-destructive">prompt text-destructive</p>
<button id="f8-ghost" class="btn-terminal btn-terminal--ghost text-destructive">ghost text-destructive</button>
<span id="probe"></span></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/__bundle-f8.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(BUNDLE_F8);
    return;
  }
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": `${TYPES[extname(path)] || "application/octet-stream"}; charset=utf-8` });
  res.end(readFileSync(path));
}).listen(0);
await new Promise((ok) => server.on("listening", ok));

/* ── the browser ─────────────────────────────────────────────────────────── */

const PORT = 19232;
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "dd-foundations-"))}`, "about:blank",
], { stdio: "ignore" });
let socket;
process.on("exit", () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i += 1) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch {}
  if (i > 60) throw new Error("headless chromium did not come up");
  await sleep(250);
}
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new`, { method: "PUT" })).json();
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

let failures = 0;
let lastPassed = "(before the first check)";
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); lastPassed = label; return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
};
// A throw is a FAIL, never a bare stack: an aborted run must not read as a pass, nor as a
// mutant the suite detected. Say where it got to.
process.on("uncaughtException", (error) => {
  console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
  console.log(`\ncheck-foundations: ABORTED`);
  process.exit(1);
});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/examples/foundations.html?theme=warm` });
await sleep(700);

/*
 * The instrument, installed in the page. `tok` resolves a token through a probe's `color`, so the
 * browser does the var() substitution and the colour maths; `px` rasterises a colour (over an
 * opaque surface when it is translucent) exactly as the page composites it; `ratio` is WCAG 2.x.
 */
await evaluate(`window.M = {
  probe(scope) { const p = document.createElement("span"); (scope || document.body).append(p); return p; },
  tok(expr, scope) { const p = M.probe(scope); p.style.color = expr.startsWith("--") ? "var(" + expr + ")" : expr;
    const v = getComputedStyle(p).color; p.remove(); return v; },
  len(expr) { const p = M.probe(); p.style.cssText = "position:absolute;inline-size:" + (expr.startsWith("--") ? "var(" + expr + ")" : expr);
    const w = p.getBoundingClientRect().width; p.remove(); return w; },
  px(top, bottom) { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d");
    x.fillStyle = bottom || "#fff"; x.fillRect(0, 0, 1, 1); x.fillStyle = top; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3); },
  lum(rgb) { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; },
  ratio(a, b) { const [x, y] = [M.lum(a), M.lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); },
  // A colour against a surface: both rasterised, the colour composited over the surface first.
  contrast(color, surface) { const s = M.px(M.tok(surface)); return M.ratio(M.px(M.tok(color), "rgb(" + s + ")"), s); },
  theme(t) { document.documentElement.dataset.theme = t; },
}; null`);
const r2 = (n) => n.toFixed(2);

/* ── F1 · control, size and layout tokens ─────────────────────────────────── */

for (const [token, px] of [["--control-h", 28], ["--card-pad", 12], ["--icon-sm", 12], ["--icon-size", 14],
  ["--icon-lg", 16], ["--icon-xl", 24], ["--dot-size", 8], ["--status-h", 32]]) {
  const measured = await evaluate(`M.len(${JSON.stringify(token)})`);
  check(`${token} is ${px}px`, measured === px, `${measured}px`);
}
check("a box sized by --control-h renders 28px tall",
  (await evaluate('document.getElementById("ctl-box").getBoundingClientRect().height')) === 28);
check("...and so does a text field that takes it as its min-block-size",
  (await evaluate('document.getElementById("ctl-field").getBoundingClientRect().height')) === 28,
  await evaluate('document.getElementById("ctl-field").getBoundingClientRect().height'));
check("a card padded by --card-pad has a 12px inset",
  (await evaluate('getComputedStyle(document.getElementById("card-pad")).paddingTop')) === "12px");
check("--content-pad is 1.5rem (24px) on a desktop viewport", (await evaluate('M.len("--content-pad")')) === 24);
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(150);
check("...and 1.25rem (20px) on a 375px phone", (await evaluate('M.len("--content-pad")')) === 20,
  `${await evaluate('M.len("--content-pad")')}px`);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(150);

/* ── the display step (the lead's ruling, 0.60.0) ───────────────────────── */

// 30px below 40rem and 36px from it: danieldeusing.de's own `sm:` step, which is also the system's
// phone breakpoint (F1). 639 and 640 pin the breakpoint itself, so a media query written against
// another width cannot pass.
for (const [width, px] of [[375, 30], [639, 30], [640, 36], [1440, 36]]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  const [size, title, code, app] = await evaluate(`[M.len("--fs-display"),
    ...["display-title", "display-code", "display-app-title"].map((id) =>
      parseFloat(getComputedStyle(document.getElementById(id)).fontSize))]`);
  check(`--fs-display is ${px}px at ${width}px wide on a public title and an error code; an app title stays 24px`,
    size === px && title === px && code === px && app === 24,
    `token ${size}px, title ${title}px, code ${code}px, app title ${app}px`);
}
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(150);

for (const theme of THEMES) {
  const edge = await evaluate(`(M.theme(${JSON.stringify(theme)}),
    ${JSON.stringify(SURFACES)}.map((s) => M.contrast("--control-edge", s)))`);
  check(`${theme}: --control-edge clears 3:1 against --background / --card / --muted (${edge.map(r2).join(" / ")})`,
    edge.every((r) => r >= 3), edge.map(r2).join(" / "));
}
check("a demo field's edge IS --control-edge (the token reaches a border)",
  await evaluate('(M.theme("warm"), getComputedStyle(document.getElementById("ctl-field")).borderTopColor === M.tok("--control-edge"))'));

/* ── F2 · categorical colours ─────────────────────────────────────────────── */

for (const theme of THEMES) {
  const rows = await evaluate(`(M.theme(${JSON.stringify(theme)}), ${JSON.stringify(CATS)}.map((c) => {
    const t = ${JSON.stringify(SURFACES)}.map((s) => M.contrast("--cat-" + c, s));
    const solid = M.ratio(M.px(M.tok("--background")), M.px(M.tok("--cat-" + c)));
    return { c, min: Math.min(...t), solid };
  }))`);
  const worst = rows.reduce((a, b) => (b.min < a.min ? b : a));
  const worstSolid = rows.reduce((a, b) => (b.solid < a.solid ? b : a));
  check(`${theme}: all twelve --cat-* clear 4.5:1 as text on every surface (worst ${worst.c} ${r2(worst.min)})`,
    rows.every((row) => row.min >= 4.5), rows.map((row) => `${row.c} ${r2(row.min)}`).join(", "));
  check(`${theme}: --background on every --cat-* fill clears 4.5:1 (worst ${worstSolid.c} ${r2(worstSolid.solid)})`,
    rows.every((row) => row.solid >= 4.5));
}
check("the categorical pair is per theme: --cat-teal on green is not --cat-teal on warm",
  await evaluate('(M.theme("warm"), M.tok("--cat-teal")) !== (M.theme("green"), M.tok("--cat-teal"))'));
await send("Emulation.setEmulatedMedia", { media: "print" });
const printCat = await evaluate(`(M.theme("green"), Math.min(...${JSON.stringify(CATS)}.map((c) =>
  M.ratio(M.px(M.tok("--cat-" + c)), [255, 255, 255]))))`);
check(`on paper the dark themes take the light pair: --cat-* on white from green clears 4.5:1 (${r2(printCat)})`,
  printCat >= 4.5, r2(printCat));
await send("Emulation.setEmulatedMedia", { media: "" });

/* ── F3 · elevation and backdrop ──────────────────────────────────────────── */

const elev = await evaluate(`(M.theme("warm"), [getComputedStyle(document.getElementById("popup")).boxShadow,
  getComputedStyle(document.getElementById("dialog")).boxShadow])`);
check("--elev-float is a 20px glow on a popup", elev[0].includes("20px") && !elev[0].startsWith("none"), elev[0]);
check("--elev-modal is a 40px glow on a dialog", elev[1].includes("40px"), elev[1]);
for (const theme of THEMES) {
  const light = theme === "warm" || theme === "paper";
  const sep = await evaluate(`(() => { M.theme(${JSON.stringify(theme)});
    const scrimmed = M.px(M.tok("--backdrop"), "rgb(" + M.px(M.tok("--background")) + ")");
    const card = M.px(M.tok("--card"));
    const edge = M.px(M.tok("--control-edge"), "rgb(" + card + ")");
    return { alpha: M.tok("--backdrop"), fill: M.ratio(card, scrimmed), edge: M.ratio(edge, scrimmed) }; })()`);
  check(`${theme}: --backdrop is ${light ? "0.5" : "0.6"} black (${sep.alpha})`, sep.alpha.includes(light ? "0.5" : "0.6"), sep.alpha);
  check(light
    ? `${theme}: a --card dialog separates from the scrimmed page by its fill (${r2(sep.fill)}:1 ≥ 3)`
    : `${theme}: the scrim cannot separate the dialog (fill ${r2(sep.fill)}:1) — its --control-edge does (${r2(sep.edge)}:1 ≥ 3)`,
  light ? sep.fill >= 3 : sep.edge >= 3, JSON.stringify(sep));
}

/* ── F5 · element defaults ────────────────────────────────────────────────── */

await evaluate('M.theme("warm"); null');
const cs = (id, prop) => evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}))[${JSON.stringify(prop)}]`);
for (const [id, size] of [["el-h1", "24px"], ["el-h2", "18px"], ["el-h3", "15px"], ["el-h4", "12px"], ["el-h5", "12px"], ["el-h6", "12px"]]) {
  check(`<${id.slice(3)}> is ${size}, bold`, (await cs(id, "fontSize")) === size && (await cs(id, "fontWeight")) === "700",
    `${await cs(id, "fontSize")} ${await cs(id, "fontWeight")}`);
}
check("h1-h3 take --lh-tight (1.3)", Math.abs(parseFloat(await cs("el-h2", "lineHeight")) - 18 * 1.3) < 0.01,
  await cs("el-h2", "lineHeight"));
const bodyFamily = await evaluate("getComputedStyle(document.body).fontFamily");
for (const id of ["el-code", "el-kbd", "el-samp", "el-pre"]) {
  check(`<${id.slice(3)}> is the page's font, not the user agent's monospace`, (await cs(id, "fontFamily")) === bodyFamily,
    await cs(id, "fontFamily"));
}
check("<code> inside an h2 is the one text size (12px)", (await cs("el-code-h2", "fontSize")) === "12px", await cs("el-code-h2", "fontSize"));
check("inline <code> is a --muted box with a 1px --border hairline",
  (await cs("el-code", "backgroundColor")) === (await evaluate('M.tok("--muted")'))
    && (await cs("el-code", "borderTopWidth")) === "1px" && (await cs("el-code", "borderTopColor")) === (await evaluate('M.tok("--border")')));
check("<kbd> is the same box", (await cs("el-kbd", "backgroundColor")) === (await cs("el-code", "backgroundColor")));
check("<pre> is a --muted block, 12px by 16px of padding, --lh-base",
  (await cs("el-pre", "backgroundColor")) === (await evaluate('M.tok("--muted")'))
    && (await cs("el-pre", "padding")) === "12px 16px" && (await cs("el-pre", "lineHeight")) === "18px",
  `${await cs("el-pre", "padding")} ${await cs("el-pre", "lineHeight")}`);
check("...and the <code> inside it draws no second box",
  (await cs("el-pre-code", "borderTopWidth")) === "0px" && (await cs("el-pre-code", "backgroundColor")) === "rgba(0, 0, 0, 0)");
check("nothing here is rounded (code, kbd, pre, mark)",
  (await Promise.all(["el-code", "el-kbd", "el-pre", "el-mark"].map((id) => cs(id, "borderTopLeftRadius")))).every((v) => v === "0px"));
for (const theme of THEMES) {
  const mark = await evaluate(`(M.theme(${JSON.stringify(theme)}), ${JSON.stringify(SURFACES)}.map((s) => {
    const tint = M.px(getComputedStyle(document.getElementById("el-mark")).backgroundColor, "rgb(" + M.px(M.tok(s)) + ")");
    return M.ratio(M.px(M.tok("--foreground")), tint); }))`);
  check(`${theme}: <mark> text clears 4.5:1 on its tint over --background / --card / --muted (${mark.map(r2).join(" / ")})`,
    mark.every((r) => r >= 4.5));
}
check("a <mark> inside muted text still takes --foreground, the measured pair",
  await evaluate('(M.theme("warm"), getComputedStyle(document.getElementById("el-mark-muted")).color === M.tok("--foreground"))'));
check("<hr> is one 1px solid --border rule with 1.5rem around it",
  (await cs("el-hr", "borderTopStyle")) === "solid" && (await cs("el-hr", "borderTopWidth")) === "1px"
    && (await cs("el-hr", "borderBottomWidth")) === "0px" && (await cs("el-hr", "marginTop")) === "24px");
check("<blockquote> is a 2px start rule in the muted colour",
  (await cs("el-quote", "borderLeftWidth")) === "2px" && (await cs("el-quote", "color")) === (await evaluate('M.tok("--muted-foreground")')));
check("<cite> sits on its own line, upright", (await cs("el-cite", "display")) === "block" && (await cs("el-cite", "fontStyle")) === "normal");
check("<figure> has no margin; its svg a 1px edge; the caption muted italic",
  (await cs("el-figure", "marginLeft")) === "0px" && (await cs("el-figure-svg", "borderTopWidth")) === "1px"
    && (await cs("el-figcaption", "fontStyle")) === "italic"
    && (await cs("el-figcaption", "color")) === (await evaluate('M.tok("--muted-foreground")')));
check("in normal colours the mark is the 30% --warning tint (a forced-colours rule must not leak here)",
  (await cs("el-mark", "backgroundColor")) === (await evaluate('M.tok("color-mix(in srgb, var(--warning) 30%, transparent)")')),
  await cs("el-mark", "backgroundColor"));

// A page's own rule must still beat an element default. The page loads these rules BEFORE the
// system (examples/foundations.html, style#page-own), so specificity wins them, not order.
check("a page's `.demo-scope h2` beats the heading default (20px, weight 400)",
  (await cs("contest-scoped", "fontSize")) === "20px" && (await cs("contest-scoped", "fontWeight")) === "400",
  `${await cs("contest-scoped", "fontSize")} ${await cs("contest-scoped", "fontWeight")}`);
check("a page's `h2.demo-cls` beats the heading default (20px)",
  (await cs("contest-cls", "fontSize")) === "20px", await cs("contest-cls", "fontSize"));
check("a page's `.demo-scope code { border: 0 }` beats the inline-code box",
  (await cs("contest-code", "borderTopWidth")) === "0px", await cs("contest-code", "borderTopWidth"));
check("a page's `mark.demo-cls` beats the mark tint",
  (await cs("contest-mark", "backgroundColor")) === "rgba(0, 0, 0, 0)", await cs("contest-mark", "backgroundColor"));

/* ── X3 · `hidden` hides, whatever display an author set ─────────────────── */

check("`hidden` beats a class that sets display: flex",
  (await cs("hid-class", "display")) === "none", await cs("hid-class", "display"));
check("`hidden` beats an inline style that sets display",
  (await cs("hid-inline", "display")) === "none", await cs("hid-inline", "display"));
check("`hidden` beats a table row a narrow-screen rule restacks as display: block",
  (await cs("hid-row", "display")) === "none", await cs("hid-row", "display"));
check('`hidden="until-found"` is NOT forced to display: none — find-in-page must be able to reveal it',
  (await cs("hid-until", "display")) !== "none", await cs("hid-until", "display"));
// And on paper: the rule is not scoped to a medium, so a print-only reveal of a `hidden` element
// cannot work (cockpit's `.case-details[hidden]` did). Something to reveal in print carries a class.
await send("Emulation.setEmulatedMedia", { media: "print" });
check("`hidden` hides on paper as well: the rule is not scoped to the screen",
  (await cs("hid-class", "display")) === "none", await cs("hid-class", "display"));
await send("Emulation.setEmulatedMedia", { media: "" });

/* ── F6 · motion ──────────────────────────────────────────────────────────── */

check("the dd-spin and dd-pulse keyframes are declared",
  await evaluate(`(() => { const names = new Set();
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (rule.name) names.add(rule.name);
    return names.has("dd-spin") && names.has("dd-pulse"); })()`));
await evaluate('document.documentElement.classList.remove("anim-off"); null');
check("precondition: with motion on, the spinner spins and the fade transitions",
  (await cs("spin", "animationName")) === "dd-spin" && (await cs("fade", "transitionDuration")) !== "0s"
    && (await cs("pulse", "animationName")) === "dd-pulse");
await evaluate('document.documentElement.classList.add("anim-off"); null');
check("html.anim-off stops keyframes", (await cs("spin", "animationName")) === "none" && (await cs("pulse", "animationName")) === "none",
  await cs("spin", "animationName"));
check("html.anim-off stops transitions too", (await cs("fade", "transitionDuration")) === "0s", await cs("fade", "transitionDuration"));
check("html.anim-off hides the block cursor", (await cs("cursor", "display")) === "none", await cs("cursor", "display"));
await evaluate('document.documentElement.classList.remove("anim-off"); null');

/* ── F7 · tone ────────────────────────────────────────────────────────────── */

for (const theme of ["warm", "green"]) {
  for (const tone of TONES) {
    const [got, want] = await evaluate(`(M.theme(${JSON.stringify(theme)}),
      [M.tok("var(--tone)", document.getElementById("tone-${tone}")), M.tok("--${tone === "muted" ? "muted-foreground" : tone}")])`);
    check(`${theme}: data-tone="${tone}" resolves --tone to --${tone === "muted" ? "muted-foreground" : tone}`, got === want, `${got} vs ${want}`);
  }
}
check("a child inherits its container's tone",
  await evaluate('(M.theme("warm"), M.tok("var(--tone)", document.getElementById("tone-nested")) === M.tok("--warning"))'));
check("an unknown tone sets nothing, so the component's own default applies",
  (await evaluate('getComputedStyle(document.getElementById("tone-unknown")).getPropertyValue("--tone")')) === "");

/* ── F8 · text colour utilities ───────────────────────────────────────────── */

for (const name of TEXT) {
  check(`.text-${name} is --${name}`,
    await evaluate(`getComputedStyle(document.querySelector("#f8-bg .text-${name}")).color === M.tok("--${name}")`));
}
check("there is no .text-muted — Tailwind renders that name as the --muted SURFACE",
  await evaluate(`(() => { for (const sheet of document.styleSheets) for (const rule of sheet.cssRules)
    if (/\\.text-muted(?![-\\w])/.test(rule.selectorText || "")) return false; return true; })()`));

/* ── F10 · dotted ground ──────────────────────────────────────────────────── */

check(".bg-dots is a 24px lattice of --border dots",
  String(await cs("dots", "backgroundImage")).startsWith("radial-gradient") && (await cs("dots", "backgroundSize")) === "24px 24px",
  `${await cs("dots", "backgroundImage")} / ${await cs("dots", "backgroundSize")}`);

/* ── icon masks ───────────────────────────────────────────────────────────── */

const icons = await evaluate(`Promise.all(${JSON.stringify(ICONS)}.map(async (name) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ico-" + name).trim();
  const url = (raw.match(/^url\\("(.*)"\\)$/) || [])[1];
  if (!url) return { name, ok: false, why: "not a url(): " + raw.slice(0, 40) };
  const img = new Image(); img.src = url;
  try { await img.decode(); } catch { return { name, ok: false, why: "the SVG does not decode" }; }
  const c = document.createElement("canvas"); c.width = c.height = 24; const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 24, 24);
  let painted = 0; const d = x.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted += 1;
  return { name, ok: painted > 12, why: painted + " painted pixels" };
}))`);
check(`all ${ICONS.length} icon tokens are declared, decode as SVG and paint a shape`,
  icons.every((i) => i.ok), icons.filter((i) => !i.ok).map((i) => `--ico-${i.name}: ${i.why}`).join("; "));
const [plain, filled] = await evaluate(`Promise.all(["star", "star-filled"].map(async (n) => {
  const img = new Image(); img.src = getComputedStyle(document.documentElement).getPropertyValue("--ico-" + n).trim().slice(5, -2);
  try { await img.decode(); } catch { return -1; }
  const c = document.createElement("canvas"); c.width = c.height = 24; const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 24, 24); let n2 = 0; const d = x.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n2 += 1; return n2; }))`);
check(`--ico-star-filled is the star with its fill closed (${filled} solid pixels vs ${plain})`, filled > plain * 1.5);

/* ── X1 · forced colours: what WP1 draws by tint or mask still shows ─────── */

// Forced colours (Windows High Contrast) swap every author background for Canvas, keeping its
// alpha, and force text to the palette. So the mark's tint fades to about 1.04:1 on the page, and a
// mask glyph — which IS a background — paints Canvas on Canvas. Measured as X1 says: a LIGHT and a
// DARK forced palette on every theme, contrast rather than "not Canvas", and from PAINTED pixels.
// Computed colours cannot see what the screen shows: a glyph under `forced-color-adjust: none`
// keeps its author colour, which is never Canvas, and a Canvas backplate behind text is in no
// computed style at all.
//
// `pixels` screenshots one element's box plus `pad` pixels around it and decodes it in the page:
// the colour behind it (the clip's corner), how many pixels inside stand out from that by 1.5:1 and
// the strongest of them, the commonest colour inside and its share, the strongest contrast against
// THAT colour (text on a fill), and the best-inked row at the box's top edge (a border).
await evaluate(`Object.assign(window.M, {
  shot(sel) { const e = document.querySelector(sel); e.scrollIntoView({ block: "center", behavior: "instant" });
    const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; },
  async pixels(png, pad) { const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d");
    g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    const at = (i, y) => { const o = (y * c.width + i) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const back = at(0, 0), counts = new Map(); let ink = 0, strongest = 1;
    for (let y = pad; y < c.height - pad; y += 1) for (let i = pad; i < c.width - pad; i += 1) {
      const px = at(i, y), r = M.ratio(px, back); if (r >= 1.5) ink += 1; if (r > strongest) strongest = r;
      const k = px.join(","); counts.set(k, (counts.get(k) || 0) + 1); }
    const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0], fill = top.split(",").map(Number);
    let onFill = 1, edge = 0;
    for (let y = pad; y < c.height - pad; y += 1) for (let i = pad; i < c.width - pad; i += 1) onFill = Math.max(onFill, M.ratio(at(i, y), fill));
    for (let y = pad - 1; y <= pad + 1; y += 1) { let row = 0;
      for (let i = pad; i < c.width - pad; i += 1) if (M.ratio(at(i, y), back) >= 3) row += 1;
      edge = Math.max(edge, row / (c.width - 2 * pad)); }
    return { back, ink, strongest, fill, share: n / ((c.width - 2 * pad) * (c.height - 2 * pad)), onFill, edge }; },
}); null`);
const pixelsOf = async (selector, pad = 3) => {
  const box = await evaluate(`M.shot(${JSON.stringify(selector)})`);
  const { data } = await send("Page.captureScreenshot", { format: "png",
    clip: { x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad, scale: 1 } });
  return evaluate(`M.pixels(${JSON.stringify(data)}, ${pad})`);
};
// One glyph of each kind the recipe draws: plain, listed, coloured by its PARENT (the icon list's
// second column — the lead's ruling: colour the parent, never the glyph) and spinning.
const FORCED_GLYPHS = [["the --icon-size glyph", "#ico-md"], ["an icon-list glyph", "#icon-list .demo-ico"],
  ["a glyph coloured by its parent", "#icon-list li:first-child > :nth-child(2)"], ["the spinner", "#spin"]];
for (const theme of ["warm", "green", "mono", "paper"]) for (const palette of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { media: "", features: [
    { name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: palette }] });
  const [forced, markColour] = await evaluate(`(() => { M.theme(${JSON.stringify(theme)});
    const p = M.probe(); p.style.cssText = "forced-color-adjust: none; background-color: Mark";
    const v = getComputedStyle(p).backgroundColor; p.remove(); return [matchMedia("(forced-colors: active)").matches, M.px(v)]; })()`);
  await sleep(100);
  const where = `forced colours, ${theme}, ${palette} palette`;
  check(`${where}: precondition — the mode is on`, forced);
  const mark = await pixelsOf("#el-mark");
  check(`${where}: <mark> paints the palette's own Mark over at least half its box, with its text at 4.5:1 or better on it`,
    String(mark.fill) === String(markColour) && mark.share >= 0.5 && mark.onFill >= 4.5,
    `measured: rgb(${mark.fill}) over ${Math.round(100 * mark.share)}% (Mark is rgb(${markColour})), text ${r2(mark.onFill)}:1`);
  const glyphs = [];
  for (const [name, selector] of FORCED_GLYPHS) glyphs.push([name, await pixelsOf(selector)]);
  const faint = glyphs.filter(([, g]) => !(g.ink > 20 && g.strongest >= 3));
  check(`${where}: each kind of recipe glyph (plain, listed, coloured by its parent, spinning) paints at 3:1 or better on what it sits on`,
    faint.length === 0, `measured: ${faint.map(([name, g]) => `${name} ${g.ink} inked px, at best ${r2(g.strongest)}:1 on rgb(${g.back})`).join("; ")}`);
  const edges = [["inline <code>", "#el-code"], ["the <pre> block", "#el-pre"]];
  const lost = [];
  for (const [name, selector] of edges) { const e = await pixelsOf(selector); if (e.edge < 0.9) lost.push(`${name}: top edge ${Math.round(100 * e.edge)}% at 3:1`); }
  check(`${where}: inline code and the code block keep a painted 3:1 edge where their fill is gone`, lost.length === 0, `measured: ${lost.join("; ")}`);
}
await send("Emulation.setEmulatedMedia", { media: "", features: [] });
await evaluate('M.theme("warm"); null');

/* ── F8 in the build-free bundle: a utility beats a component colour ─────── */

// utilities.css comes after every component file: a later component rule that sets colour would
// otherwise outrank the utility at equal specificity (.doc-link.text-primary and friends). Only
// print.css follows it, as a Tailwind app's unlayered print.css follows its utilities.
const bundleImports = [...readFileSync(join(root, "src/index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  .matchAll(/@import\s+(?:url\(\s*)?["']\.\/([^"']+)["']/g)].map((m) => m[1]);
check("src/index.css imports utilities.css after every component file, and only print.css after it",
  bundleImports.at(-2) === "utilities.css" && bundleImports.at(-1) === "print.css", bundleImports.join(", "));
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/__bundle-f8.html` });
await sleep(700);
for (const [id, token, pair] of [["f8-doclink", "--primary", ".doc-link.text-primary"],
  ["f8-prompt", "--destructive", ".prompt.text-destructive"], ["f8-ghost", "--destructive", ".btn-terminal--ghost.text-destructive"]]) {
  const [got, want] = await evaluate(`[getComputedStyle(document.getElementById(${JSON.stringify(id)})).color, (() => {
    const p = document.getElementById("probe"); p.style.color = "var(${token})"; return getComputedStyle(p).color; })()]`);
  check(`in the build-free bundle, ${pair} takes the utility's colour`, got === want, `${got} vs ${token} ${want}`);
}

console.log(failures ? `\ncheck-foundations: ${failures} FAILED` : "\ncheck-foundations: all checks passed");
process.exit(failures ? 1 : 0);
