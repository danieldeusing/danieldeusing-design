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
const server = createServer((req, res) => {
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
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
};

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
check("a class still beats an element default (.text-muted-foreground on a <p>)",
  (await cs("el-muted-line", "color")) === (await evaluate('M.tok("--muted-foreground")')));

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
  await img.decode(); const c = document.createElement("canvas"); c.width = c.height = 24; const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 24, 24); let n2 = 0; const d = x.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n2 += 1; return n2; }))`);
check(`--ico-star-filled is the star with its fill closed (${filled} solid pixels vs ${plain})`, filled > plain * 1.5);

console.log(failures ? `\ncheck-foundations: ${failures} FAILED` : "\ncheck-foundations: all checks passed");
process.exit(failures ? 1 : 0);
