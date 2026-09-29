#!/usr/bin/env node
/*
 * check-icons.mjs — every glyph word resolves to a mask, every mask paints, at four sizes.
 *
 * WHAT IT GUARDS. A glyph fails without a sound. A token whose SVG does not parse paints nothing;
 * a `data-icon` word with no token leaves --ico unset, so the glyph a component draws from it
 * vanishes (and a `.ico` turns into a solid square); a mapping nothing can override keeps a busy
 * button showing its idle glyph. None of those throws, logs or fails a build, so each is asserted:
 *
 *   · the words — every `data-icon` word and `var(--ico-…)` reference in this checkout's src/,
 *     examples/, runtime/, templates/ and skill references, and in every other checkout named on
 *     the command line, has a token AND a mapping line in src/tokens.css;
 *   · the tokens — each is in lucide's house form (24 box, stroke 2, round caps and joins), holds
 *     nothing the build or a data url chokes on, decodes as an SVG in a real browser and paints;
 *   · `.ico` — its four sizes, its colour (the text's, or its own data-tone, never a container's),
 *     the loud square for an unknown word, no radius, print, forced colours, the naming contract —
 *     on the demo page and again with only tokens.css + icons.css loaded (house rule 4);
 *   · the mapping's cascade — a component in a later layer, and a utility, can swap the glyph;
 *   · glyph colours clear 3:1 (WCAG 1.4.11) on every theme and surface.
 *
 * THE SCAN REPORTS ITS YIELD. "No unknown word" is only worth something next to how much was read,
 * so each root prints its file, reference and word counts, and a root that yields no files at all
 * fails: a wrong path must not read as a clean one.
 *
 * A REAL BROWSER, and no dependency — the headless chromium Playwright caches, over the DevTools
 * protocol with Node's own fetch and WebSocket, on a port the browser picks (other checks may be
 * running beside this one). With no browser the static half still runs and the browser half SKIPS
 * loudly; DD_REQUIRE_BROWSER=1 makes that skip a failure.
 *
 *   node scripts/check-icons.mjs                          this checkout
 *   node scripts/check-icons.mjs ../other-checkout …      and the words other checkouts use
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let lastPassed = "(before the first check)";
// `condition` may be a thunk: a throw inside it is that check's FAIL, and the suite goes on.
const check = (label, condition, detail) => {
  let ok;
  try { ok = typeof condition === "function" ? condition() : condition; } catch (error) {
    ok = false; detail = `threw: ${String(error?.message || error).split("\n")[0]}`;
  }
  if (ok) { console.log(`PASS  ${label}`); lastPassed = label; return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
};
// Whatever still escapes is a FAIL naming where the suite got to, never a bare stack.
process.on("uncaughtException", (error) => {
  console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
  console.log("\ncheck-icons: ABORTED");
  process.exit(1);
});
const finish = () => {
  console.log(failures ? `\ncheck-icons: ${failures} FAILED` : "\ncheck-icons: all checks passed");
  process.exit(failures ? 1 : 0);
};

/* ── the static half: tokens.css ─────────────────────────────────────────── */

const TOKENS_CSS = readFileSync(join(root, "src/tokens.css"), "utf8");
const WORD = "[a-z0-9]+(?:-[a-z0-9]+)*";

const tokens = new Map();
for (const [, word, svg] of TOKENS_CSS.matchAll(new RegExp(`^\\s*--ico-(${WORD}):\\s*url\\("data:image/svg\\+xml,([^"]*)"\\);\\s*$`, "gm"))) {
  if (tokens.has(word)) tokens.set(word, null); else tokens.set(word, svg);
}
const declared = [...TOKENS_CSS.matchAll(new RegExp(`--ico-(${WORD})\\s*:`, "g"))].map((m) => m[1]);
check(`${tokens.size} icon tokens are declared, every one as url("data:image/svg+xml,…")`,
  tokens.size > 0 && declared.length === tokens.size,
  `${declared.length} declarations, ${tokens.size} in the strict form: ${declared.filter((w) => !tokens.has(w)).join(", ")}`);
check("no word is declared twice", [...tokens.values()].every((svg) => svg !== null),
  [...tokens].filter(([, svg]) => svg === null).map(([w]) => w).join(", "));

// The mapping: every line must sit inside `@layer base { … }` (the braces counted, not guessed).
const layerAt = TOKENS_CSS.indexOf("@layer base {");
let layerBody = "";
if (layerAt >= 0) {
  let depth = 0;
  for (let i = TOKENS_CSS.indexOf("{", layerAt); i < TOKENS_CSS.length; i += 1) {
    if (TOKENS_CSS[i] === "{") depth += 1;
    if (TOKENS_CSS[i] === "}") depth -= 1;
    if (depth === 0) { layerBody = TOKENS_CSS.slice(TOKENS_CSS.indexOf("{", layerAt) + 1, i); break; }
  }
}
const mapRe = new RegExp(`\\[data-icon="(${WORD})"\\]\\s*\\{\\s*--ico:\\s*var\\(--ico-(${WORD})\\);?\\s*\\}`, "g");
// Where a line sits (the layer) and whether a word resolves (any line) are two questions, and a
// mapping outside the layer should fail the first alone.
const mapping = new Map([...TOKENS_CSS.matchAll(mapRe)].map(([, word, token]) => [word, token]));
const layered = [...layerBody.matchAll(mapRe)].length;
check(`the mapping is inside @layer base, all ${mapping.size} lines of it`,
  mapping.size > 0 && layered === mapping.size, `${mapping.size} mapping lines in the file, ${layered} inside @layer base`);
check("every token has a mapping line, and every mapping line names its own word's token",
  [...tokens.keys()].every((w) => mapping.get(w) === w) && [...mapping].every(([w, t]) => w === t && tokens.has(t)),
  [...[...tokens.keys()].filter((w) => mapping.get(w) !== w).map((w) => `--ico-${w} has no mapping line`),
    ...[...mapping].filter(([w, t]) => w !== t || !tokens.has(t)).map(([w, t]) => `data-icon="${w}" -> --ico-${t}`)].join("; "));

// The form of each url. The build splits declarations at `;`, a raw `#` ends a data url, and a
// repeated attribute makes the SVG invalid — each of which paints nothing and says nothing.
const bad = { chars: [], root: [], dup: [], fill: [] };
const ROOT_ATTRS = "xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='FILL' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'";
for (const [word, enc] of tokens) {
  if (enc === null) continue;
  if (/[;#"<>]/.test(enc)) bad.chars.push(word);
  const svg = decodeURIComponent(enc);
  const rootTag = (svg.match(/^<svg ([^>]*)>/) || [])[1];
  const fill = word === "star-filled" ? "black" : "none";
  if (rootTag !== ROOT_ATTRS.replace("FILL", fill)) (rootTag && /fill='black'/.test(rootTag) !== (fill === "black") ? bad.fill : bad.root).push(word);
  for (const [, attrs] of svg.matchAll(/<[a-z]+ ([^>]*?)\/?>/g)) {
    const names = [...attrs.matchAll(/([a-z-]+)=/gi)].map((m) => m[1]);
    if (new Set(names).size !== names.length) { bad.dup.push(word); break; }
  }
}
check("no url holds a semicolon, a raw hash, a double quote or an unencoded < >", bad.chars.length === 0, bad.chars.join(", "));
check("every token is lucide's house form: 24-unit box, black stroke 2, round caps and joins", bad.root.length === 0, bad.root.join(", "));
check("only star-filled closes its fill", bad.fill.length === 0, bad.fill.join(", "));
check("no element in any token repeats an attribute", bad.dup.length === 0, bad.dup.join(", "));

/* ── the static half: every word used anywhere resolves ──────────────────── */

const SCAN_DIRS = ["src", "examples", "runtime", "templates", ".claude/skills/danieldeusing-design/references"];
const SCAN_EXT = new Set([".css", ".html", ".js", ".mjs", ".md"]);
const USE_RES = [
  new RegExp(`data-icon=\\\\?["'](${WORD})\\\\?["']`, "g"),
  new RegExp(`var\\(--ico-(${WORD})\\)`, "g"),
  new RegExp(`dataset\\.icon\\s*=\\s*["'](${WORD})["']`, "g"),
];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : SCAN_EXT.has(extname(e.name)) ? [join(dir, e.name)] : []);
const roots = [root, ...process.argv.slice(2).map((p) => resolve(p))];
for (const scanRoot of roots) {
  const files = SCAN_DIRS.map((d) => join(scanRoot, d)).filter((d) => existsSync(d)).flatMap(walk);
  const uses = new Map();
  let references = 0;
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of USE_RES) for (const [, word] of line.matchAll(re)) {
        references += 1;
        if (!uses.has(word)) uses.set(word, `${relative(scanRoot, file)}:${i + 1}`);
      }
    });
  }
  const name = scanRoot === root ? "this checkout" : relative(dirname(root), scanRoot) || scanRoot;
  console.log(`      scanned ${name}: ${files.length} files, ${references} glyph references, ${uses.size} distinct words`);
  const unknown = [...uses].filter(([w]) => !tokens.get(w) || mapping.get(w) !== w);
  check(`${name}: every data-icon word and --ico-* reference has a token and a mapping line`,
    files.length > 0 && unknown.length === 0,
    files.length === 0 ? `no files under ${SCAN_DIRS.join(", ")} of ${scanRoot}` : unknown.map(([w, at]) => `${w} (${at})`).join("; "));
}

/* ── the browser half ─────────────────────────────────────────────────────── */

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
  console.log("\ncheck-icons: browser half SKIPPED — no headless chromium on this machine.");
  console.log("  Whether an SVG decodes, a mask paints and a layer wins is only provable in a browser;");
  console.log("  the static half above still ran. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  finish();
}

// The harness pages exist only in memory; everything else is this checkout, read off the disk.
const ICONS_CSS = readFileSync(join(root, "src/icons.css"), "utf8");
// Both files with every `@supports (forced-color-adjust: preserve-parent-color)` block cut out —
// what an engine without that value sees, so the fallback rule is asserted, not assumed.
const PRESERVE = "@supports (forced-color-adjust: preserve-parent-color)";
const withoutPreserve = (css) => {
  let out = css;
  for (let at = out.indexOf(PRESERVE); at >= 0; at = out.indexOf(PRESERVE)) {
    let depth = 0;
    let i = out.indexOf("{", at);
    for (; i < out.length; i += 1) {
      if (out[i] === "{") depth += 1;
      if (out[i] === "}" && --depth === 0) break;
    }
    out = out.slice(0, at) + out.slice(i + 1);
  }
  return out;
};
const X3_IN_TOKENS = /\[hidden\]:not\(\[hidden="until-found"\]\)\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(TOKENS_CSS);
const forcedPage = (tokensHref, iconsHref) => `<!doctype html><html data-theme="warm"><head>
<link rel="stylesheet" href="${tokensHref}"><link rel="stylesheet" href="${iconsHref}">
<style>
  body { margin: 0; background: var(--background); color: var(--foreground); font: 12px/1.5 monospace; }
  p { margin: 6px; }
  a { color: var(--primary); }
  button { font: inherit; color: var(--primary); background: var(--card); border: 1px solid var(--control-edge); }
  .probe { border: 0; padding: 0; background: none; line-height: 0; }
  .probe[data-icon]::before { content: ""; display: inline-block; inline-size: 24px; block-size: 24px; background: currentColor;
    -webkit-mask: var(--ico) center / contain no-repeat; mask: var(--ico) center / contain no-repeat; }
  .probe--toned[data-icon]::before { background: var(--tone, var(--primary)); }
  .probe-selected { display: inline-block; padding: 4px; }
  @media (forced-colors: active) { .probe-selected { forced-color-adjust: none; background: Highlight; color: HighlightText; } }
</style></head><body>
<p id="ctx-text"><span class="ico ico--xl" id="g-text" data-icon="refresh-cw" aria-hidden="true"></span> text</p>
<p><a href="#x" id="ctx-link"><span class="ico ico--xl" id="g-link" data-icon="external-link" aria-hidden="true"></span> link</a></p>
<p><button type="button" id="ctx-button"><span class="ico ico--xl" id="g-button" data-icon="download" aria-hidden="true"></span> button</button></p>
<p><button type="button" id="ctx-disabled" disabled><span class="ico ico--xl" id="g-disabled" data-icon="trash-2" aria-hidden="true"></span> disabled</button></p>
<p><span class="probe-selected" id="ctx-selected"><span class="ico ico--xl" id="g-selected" data-icon="check" aria-hidden="true"></span> selected</span></p>
<p id="ctx-toned"><span class="ico ico--xl" id="g-toned" data-tone="destructive" data-icon="circle-x" aria-hidden="true"></span> toned</p>
<p><button type="button" class="probe" id="g-pseudo" data-icon="refresh-cw" aria-label="refresh the list"></button>
  <button type="button" class="probe probe--toned" id="g-pseudo-toned" data-tone="warning" data-icon="triangle-alert" aria-label="retry the deploy"></button>
  <button type="button" class="probe probe--toned" id="g-pseudo-untoned" data-icon="home" aria-label="install for this user"></button>
  <button type="button" class="probe" id="g-pseudo-disabled" data-icon="trash-2" aria-label="remove poi/vu3" disabled></button></p>
</body></html>`;
// A component's state glyph, the way controls.css writes one: set --ico on the element that
// carries the word. `wrap` puts it in a layer, or leaves it unlayered.
const STATE_GLYPHS = `.probe[aria-busy="true"] { --ico: var(--ico-loader-circle); }
  .probe[data-icon="star"][aria-pressed="true"] { --ico: var(--ico-star-filled); }`;
const cascadePage = (head) => `<!doctype html><html data-theme="warm"><head>${head}</head><body>
<button class="probe" id="idle" data-icon="refresh-cw"></button>
<button class="probe" id="busy" data-icon="refresh-cw" aria-busy="true" aria-disabled="true"></button>
<button class="probe" id="pressed" data-icon="star" aria-pressed="true"></button>
<span class="u-ico-x" id="utility" data-icon="check"></span>
</body></html>`;
const HARNESS = {
  // The Tailwind entry's cascade without Tailwind: its layer order, tokens.css unlayered (as that
  // entry imports it), a component's state glyph in `components`, a utility in `utilities`.
  "/__harness/cascade-tailwind.html": cascadePage(`<style>@layer theme, base, components, utilities;</style>
<link rel="stylesheet" href="/src/tokens.css">
<style>@layer components { ${STATE_GLYPHS} } @layer utilities { .u-ico-x { --ico: var(--ico-x); } }</style>`),
  // The build-free bundle's: every file unlayered, so the state glyph is too.
  "/__harness/cascade-bundle.html": cascadePage(`<link rel="stylesheet" href="/src/tokens.css">
<style>${STATE_GLYPHS} .u-ico-x { --ico: var(--ico-x); }</style>`),
  // A component file's pseudo-element glyph, with tokens.css and nothing else on the page.
  "/__harness/tokens-only.html": `<!doctype html><html data-theme="warm"><head>
<link rel="stylesheet" href="/src/tokens.css">
<style>.glyph[data-icon]::before { content: ""; display: inline-block; inline-size: 24px; block-size: 24px;
  background: currentColor; -webkit-mask: var(--ico) center / contain no-repeat; mask: var(--ico) center / contain no-repeat; }</style>
</head><body><span class="glyph" id="pseudo" data-icon="folder"></span></body></html>`,
  // X1: a glyph in every context it lives in — text, a link, a button, a disabled button, a
  // selection a component redrew with system colours, a toned .ico — and a component's
  // [data-icon]::before glyph drawn the way controls.css and feedback.css draw theirs, painting
  // currentColor or var(--tone, var(--primary)). The probe buttons carry no border or fill of
  // their own, so a screenshot of one is the glyph and nothing else.
  "/__harness/forced.html": forcedPage("/src/tokens.css", "/src/icons.css"),
  "/__harness/forced-fallback.html": forcedPage("/__harness/tokens-fallback.css", "/__harness/icons-fallback.css"),
  "/__harness/tokens-fallback.css": withoutPreserve(TOKENS_CSS),
  "/__harness/icons-fallback.css": withoutPreserve(ICONS_CSS),
  // X3: `hidden` hides a .ico although .ico sets its own display.
  "/__harness/hidden.html": `<!doctype html><html data-theme="warm"><head>
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/icons.css">
${X3_IN_TOKENS ? "" : `<style id="standin-x3">/* STAND-IN for X3's tokens.css rule, which WP1 adds; used only while tokens.css lacks it */
[hidden]:not([hidden="until-found"]) { display: none !important; }</style>`}
</head><body><span class="ico" id="shown" data-icon="x" aria-hidden="true"></span>
<span class="ico" id="hid" data-icon="x" aria-hidden="true" hidden></span></body></html>`,
};
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript" };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (HARNESS[pathname]) {
    res.writeHead(200, { "content-type": `${TYPES[extname(pathname)] || "text/html"}; charset=utf-8` });
    res.end(HARNESS[pathname]);
    return;
  }
  const path = normalize(join(root, pathname));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": `${TYPES[extname(path)] || "application/octet-stream"}; charset=utf-8` });
  res.end(readFileSync(path));
}).listen(0);
await new Promise((ok) => server.on("listening", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

// Port 0: the browser picks a free port and prints it, so a parallel check cannot collide.
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "dd-icons-"))}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
process.on("exit", () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); server.close(); });
const browserWs = await new Promise((ok, bad) => {
  let seen = "";
  const timer = setTimeout(() => bad(new Error("headless chromium did not print its DevTools url")), 20000);
  chrome.stderr.on("data", (chunk) => {
    seen += chunk;
    const m = seen.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); ok(m[1]); }
  });
});
const cdp = `http://127.0.0.1:${new URL(browserWs).port}`;
const target = await (await fetch(`${cdp}/json/new`, { method: "PUT" })).json();
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = async (path) => {
  await send("Page.navigate", { url: origin + path });
  for (let i = 0; i < 50; i += 1) {
    await sleep(100);
    if (await evaluate(`document.readyState === "complete" && [...document.styleSheets].every((s) => { try { return !!s.cssRules; } catch { return false; } })`)) break;
  }
  await evaluate(INSTRUMENT);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/*
 * The instrument, installed in each page. `tok` resolves a colour token through a probe's
 * `color`, so the browser does the var() substitution; `px` rasterises a colour on a canvas;
 * `ratio` is WCAG 2.x. `ink` reads back a SCREENSHOT of a box (the PNG decoded by the page itself,
 * so no image library is needed): how many pixels stand out from the box's corner by 1.5:1 or
 * more, and the strongest contrast among them.
 */
const INSTRUMENT = `window.M = {
  tok(expr) { const p = document.createElement("span"); document.body.append(p); p.style.color = "var(" + expr + ")";
    const v = getComputedStyle(p).color; p.remove(); return v; },
  px(color, under) { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d");
    x.fillStyle = under || "#fff"; x.fillRect(0, 0, 1, 1); x.fillStyle = color; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3); },
  lum(rgb) { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; },
  ratio(a, b) { const [x, y] = [M.lum(a), M.lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); },
  contrast(fg, bg) { const s = M.px(M.tok(bg)); return M.ratio(M.px(M.tok(fg), "rgb(" + s + ")"), s); },
  box(sel) { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
  // A screenshot clip is in DOCUMENT coordinates, and one below the fold captures nothing, so the
  // element is brought into view first — instantly: base.css asks for smooth scrolling, and a rect
  // read while the scroll is still animating clips a patch of empty page.
  shot(sel) { const e = document.querySelector(sel); e.scrollIntoView({ block: "center", behavior: "instant" }); const r = e.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; },
  async ink(png, pad) { const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d");
    x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2]];
    let ink = 0, inside = 0, strongest = 1;
    for (let y = 0; y < c.height; y += 1) for (let i = 0; i < c.width; i += 1) {
      const o = (y * c.width + i) * 4; const r = M.ratio([d[o], d[o + 1], d[o + 2]], bg);
      if (r >= 1.5) { ink += 1; if (i >= pad && y >= pad && i < c.width - pad && y < c.height - pad) inside += 1; }
      if (r > strongest) strongest = r;
    }
    return { ink, inside, area: (c.width - 2 * pad) * (c.height - 2 * pad), strongest }; },
}; null`;
// A screenshot of one element's box plus `pad` pixels of whatever is around it.
const inkOf = async (selector, pad = 2) => {
  const b = await evaluate(`M.shot(${JSON.stringify(selector)})`);
  const { data } = await send("Page.captureScreenshot", {
    format: "png", clip: { x: b.x - pad, y: b.y - pad, width: b.w + 2 * pad, height: b.h + 2 * pad, scale: 1 } });
  return evaluate(`M.ink(${JSON.stringify(data)}, ${pad})`);
};
const style = (selector, prop, pseudo = null) =>
  evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}), ${JSON.stringify(pseudo)}).getPropertyValue(${JSON.stringify(prop)}).trim()`);
const token = (name) => evaluate(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim()`);

/* ── the demo page: the tokens ───────────────────────────────────────────── */

await load("/examples/icons.html?theme=warm");

const WORDS = [...tokens.keys()];
const painted = await evaluate(`Promise.all(${JSON.stringify(WORDS)}.map(async (word) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ico-" + word).trim();
  const url = (raw.match(/^url\\("(.*)"\\)$/) || [])[1];
  if (!url) return { word, px: -1, why: "not a url() in the browser: " + raw.slice(0, 40) };
  const img = new Image(); img.src = url;
  try { await img.decode(); } catch { return { word, px: -1, why: "the SVG does not decode" }; }
  const c = document.createElement("canvas"); c.width = c.height = 24; const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 24, 24);
  let n = 0; const d = x.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
  return { word, px: n, why: n + " painted pixels" };
}))`);
const faint = painted.filter((p) => p.px <= 12);
check(`all ${WORDS.length} tokens decode as an SVG in the browser and paint a shape (fewest: ${Math.min(...painted.map((p) => p.px))} of 576 pixels)`,
  painted.length === WORDS.length && faint.length === 0, faint.map((p) => `--ico-${p.word}: ${p.why}`).join("; "));

const resolved = await evaluate(`${JSON.stringify(WORDS)}.map((word) => {
  const probe = document.createElement("span"); probe.dataset.icon = word; document.body.append(probe);
  const got = getComputedStyle(probe).getPropertyValue("--ico").trim(); probe.remove();
  const want = getComputedStyle(document.documentElement).getPropertyValue("--ico-" + word).trim();
  return { word, ok: want !== "" && got === want };
})`);
check(`every one of the ${WORDS.length} words sets --ico to its own token through data-icon`,
  resolved.every((r) => r.ok), resolved.filter((r) => !r.ok).map((r) => r.word).join(", "));

/* ── .ico, full page then tokens.css + icons.css only ─────────────────────── */

const icoChecks = async (where) => {
  for (const [id, px] of [["size-sm", 12], ["size-default", 14], ["size-lg", 16], ["size-xl", 24]]) {
    const b = await evaluate(`M.box("#${id}")`);
    check(`${where}: .${id === "size-default" ? "ico" : `ico--${id.slice(5)}`} is ${px} x ${px}px`, b.w === px && b.h === px, `${b.w} x ${b.h}`);
  }
  const mask = await style("#size-xl", "mask-image") || await style("#size-xl", "-webkit-mask-image");
  check(`${where}: .ico masks itself with the token its data-icon names`,
    mask === await token("--ico-refresh-cw") && mask.startsWith('url("data:image/svg+xml'), mask.slice(0, 60));
  const xl = await inkOf("#size-xl");
  check(`${where}: the mask paints (refresh-cw at 24px: ${xl.inside} glyph pixels, ${xl.strongest.toFixed(2)}:1 at its core)`,
    xl.inside > 40 && xl.inside < xl.area * 0.6 && xl.strongest >= 3, JSON.stringify(xl));
  for (const [id, tok] of [["cc-fg", "--foreground"], ["cc-muted", "--muted-foreground"], ["cc-primary", "--primary"]]) {
    const [bg, want] = [await style(`#${id}`, "background-color"), await evaluate(`M.tok("${tok}")`)];
    check(`${where}: with no tone the glyph is its text's colour (${tok})`, bg === want, `${bg} vs ${want}`);
  }
  const tones = await evaluate(`[...document.querySelectorAll("#tones .ico[data-tone]")].map((e) => {
    const t = e.dataset.tone; const want = M.tok(t === "muted" ? "--muted-foreground" : "--" + t);
    return { t, got: getComputedStyle(e).backgroundColor, want }; })`);
  check(`${where}: data-tone on the .ico paints it in that tone (${tones.map((t) => t.t).join(", ")})`,
    tones.length === 7 && tones.every((t) => t.got === t.want), JSON.stringify(tones.filter((t) => t.got !== t.want)));
  const [plain, own, primary, destructive] = [await style("#leak-plain", "background-color"), await style("#leak-own", "background-color"),
    await evaluate(`M.tok("--primary")`), await evaluate(`M.tok("--destructive")`)];
  check(`${where}: a container's data-tone does not reach a glyph inside it — it stays its label's --primary`,
    plain === primary && plain !== destructive, `${plain} (primary ${primary}, destructive ${destructive})`);
  check(`${where}: ...while a glyph that carries its own data-tone takes it`, own === destructive, `${own} vs ${destructive}`);
  const sq = await inkOf("#bad-word");
  check(`${where}: an unknown word has no mask and paints a solid square, loud (${sq.inside} of ${sq.area} pixels)`,
    (await style("#bad-word", "mask-image")) === "none" && sq.inside >= sq.area * 0.9, JSON.stringify(sq));
  check(`${where}: a .ico with no word inside an element that has one draws that element's glyph (--ico inherits)`,
    (await style("#inherited", "--ico")) === await token("--ico-star"));
  check(`${where}: no radius on a glyph`, (await style("#size-xl", "border-radius")) === "0px");
};

await icoChecks("full page");

const naming = await evaluate(`[...document.querySelectorAll(".ico")].filter((e) =>
  !(e.getAttribute("aria-hidden") === "true" || (e.getAttribute("role") === "img" && (e.getAttribute("aria-label") || "").trim()))
).map((e) => e.outerHTML.slice(0, 80))`);
const icoCount = await evaluate(`document.querySelectorAll(".ico").length`);
check(`every one of the demo's ${icoCount} .ico is aria-hidden, or role="img" with a name`, icoCount > 100 && naming.length === 0, naming.join(" | "));
check("the icon-only link is named for its destination, not its glyph",
  (await evaluate(`document.getElementById("icon-only").getAttribute("aria-label")`)) === "GitHub profile");

// Print: a mask paints a background, which a browser drops from the page unless told otherwise.
await send("Emulation.setEmulatedMedia", { media: "print" });
const printAdjust = await evaluate(`(() => { const s = getComputedStyle(document.getElementById("size-xl"));
  return [s.getPropertyValue("print-color-adjust"), s.getPropertyValue("-webkit-print-color-adjust")]; })()`);
await send("Emulation.setEmulatedMedia", { media: "" });
check("on paper a glyph keeps its paint (print-color-adjust: exact)", printAdjust.includes("exact"), JSON.stringify(printAdjust));

await load("/examples/icons.html?theme=warm&bare");
const sheets = await evaluate(`[...document.styleSheets].map((s) => (s.href || "").split("/").pop()).filter(Boolean)`);
check(`precondition: ?bare loads tokens.css and icons.css and nothing else (${sheets.join(", ")})`,
  sheets.length === 2 && sheets.includes("tokens.css") && sheets.includes("icons.css"), sheets.join(", "));
await icoChecks("tokens + icons only");

/* ── the mapping serves a component file alone, and yields to it ─────────── */

await load("/__harness/tokens-only.html");
check("with tokens.css alone, a component's ::before glyph reads its mask through data-icon",
  (await style("#pseudo", "mask-image", "::before")) === await token("--ico-folder") && (await token("--ico-folder")) !== "");

const named = async (value) => {
  for (const w of ["refresh-cw", "loader-circle", "star", "star-filled", "check", "x"]) if (value && value === await token(`--ico-${w}`)) return w;
  return `?${value.slice(0, 30)}`;
};
for (const [entry, path] of [["Tailwind entry", "/__harness/cascade-tailwind.html"], ["build-free bundle", "/__harness/cascade-bundle.html"]]) {
  await load(path);
  const glyph = {};
  for (const id of ["idle", "busy", "pressed", "utility"]) glyph[id] = await named(await style(`#${id}`, "--ico"));
  check(`${entry}: precondition — the mapping resolves (idle button: refresh-cw)`, glyph.idle === "refresh-cw", glyph.idle);
  check(`${entry}: a component's state glyph beats the mapping — the busy button shows loader-circle`, glyph.busy === "loader-circle", glyph.busy);
  check(`${entry}: ...and the pressed favourite shows star-filled`, glyph.pressed === "star-filled", glyph.pressed);
  check(`${entry}: ...and a utility-style override beats it too`, glyph.utility === "x", glyph.utility);
}

/* ── forced colours (X1): a glyph is its context's forced colour, never Canvas ─────────────────── */

// Chromium replaces every author background with Canvas in this mode, and a mask glyph IS a
// background. Three things are asserted per glyph, because each catches a different failure:
//   · it does not compute Canvas — the glyph that vanished (no rule at all);
//   · it computes its CONTEXT's forced colour — the glyph that `forced-color-adjust: none` alone
//     leaves in the author's colour, which is never Canvas and so passes the first assertion while
//     measuring 1.78:1 on a dark palette;
//   · it renders at 3:1 or better against what is behind it — measured from pixels, not styles.
const GLYPHS = [
  ["text", "#g-text", null, "#ctx-text"], ["link", "#g-link", null, "#ctx-link"], ["button", "#g-button", null, "#ctx-button"],
  ["disabled", "#g-disabled", null, "#ctx-disabled"], ["selected", "#g-selected", null, "#ctx-selected"], ["toned .ico", "#g-toned", null, "#ctx-toned"],
  ["[data-icon]::before", "#g-pseudo", "::before", "#g-pseudo"], ["toned ::before", "#g-pseudo-toned", "::before", "#g-pseudo-toned"],
  ["var(--tone, --primary) ::before", "#g-pseudo-untoned", "::before", "#g-pseudo-untoned"], ["disabled ::before", "#g-pseudo-disabled", "::before", "#g-pseudo-disabled"],
];
const readGlyphs = () => evaluate(`(() => {
  const sys = (name) => { const p = document.createElement("span"); p.style.cssText = "forced-color-adjust: none; color: " + name;
    document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; };
  return { canvas: sys("Canvas"), canvasText: sys("CanvasText"), forced: matchMedia("(forced-colors: active)").matches,
    glyphs: ${JSON.stringify(GLYPHS)}.map(([name, sel, pseudo, ctx]) => {
      let back = pseudo ? document.querySelector(sel) : document.querySelector(sel).parentElement;
      // alpha exactly 0 — not "ends in 0)", which opaque black rgb(0, 0, 0) does; Highlight is translucent
      const clear = (c) => c === "transparent" || (c.startsWith("rgba(") && c.endsWith(", 0)"));
      while (back && clear(getComputedStyle(back).backgroundColor)) back = back.parentElement;
      return { name, paint: getComputedStyle(document.querySelector(sel), pseudo).backgroundColor,
        context: getComputedStyle(document.querySelector(ctx)).color, behind: back ? getComputedStyle(back).backgroundColor : "none" };
    }) };
})()`);
// `expect` says what each glyph must be painted in; `skip` names glyphs whose rendering is a known
// limit — printed, not asserted.
const forcedPass = async ({ path, label, themes, expect, rule, skip = [] }) => {
  for (const theme of themes) for (const palette of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: palette }] });
    await load(path);
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    const got = await readGlyphs();
    const where = `${label}, ${theme}, ${palette} palette`;
    check(`${where}: precondition — forced colours are on`, got.forced);
    // "Never Canvas" is the rule on Canvas; on the Highlight selection HighlightText may share Canvas's
    // rgb, so the general statement is: never the colour behind it.
    const lost = got.glyphs.filter((g) => g.paint === g.behind || (g.behind === got.canvas && g.paint === got.canvas));
    check(`${where}: no glyph is painted in the colour behind it — Canvas, or the selection's Highlight (${got.glyphs.length} glyphs)`,
      lost.length === 0 && got.glyphs.every((g) => g.behind !== "none"), lost.map((g) => `${g.name} on ${g.behind}`).join(", "));
    const wrong = got.glyphs.filter((g) => !expect(g, got));
    check(`${where}: every glyph is ${rule}`, wrong.length === 0,
      wrong.map((g) => `${g.name}: ${g.paint} (context ${g.context}, CanvasText ${got.canvasText})`).join("; "));
    const faint = [];
    for (const [name, sel] of GLYPHS) {
      const ink = await inkOf(sel);
      const reading = `${name} ${ink.inside}px ${ink.strongest.toFixed(2)}:1`;
      if (skip.includes(name)) { console.log(`      known limit, not asserted — ${where}: ${reading}`); continue; }
      if (!(ink.inside > 20 && ink.strongest >= 3)) faint.push(reading);
    }
    check(`${where}: every glyph renders at 3:1 or better against what is behind it`, faint.length === 0, faint.join("; "));
  }
};
await forcedPass({ path: "/__harness/forced.html", label: "preserve-parent-color", themes: ["warm", "green", "mono", "paper"],
  rule: "its context's forced text colour", expect: (g) => g.paint === g.context });
// The fallback, as an engine without preserve-parent-color sees it: the @supports blocks cut out.
const declares = (css) => /forced-color-adjust:\s*preserve-parent-color/.test(css.replace(/\/\*[\s\S]*?\*\//g, ""));
check("precondition: the fallback harness declares no preserve-parent-color, and both shipped files do",
  !declares(HARNESS["/__harness/tokens-fallback.css"]) && !declares(HARNESS["/__harness/icons-fallback.css"]) && declares(TOKENS_CSS) && declares(ICONS_CSS));
// A CanvasText glyph on a selection a component redrew in Highlight is the fallback's known limit.
await forcedPass({ path: "/__harness/forced-fallback.html", label: "the fallback", themes: ["warm", "green"],
  rule: "CanvasText", expect: (g, got) => g.paint === got.canvasText, skip: ["selected"] });
// Outside forced colours none of it applies: the defaults sit inside the media query.
await send("Emulation.setEmulatedMedia", { features: [] });
await load("/__harness/forced.html");
const normal = await readGlyphs();
const paintOf = (name) => normal.glyphs.find((g) => g.name === name).paint;
check("outside forced colours the defaults are inert: a ::before glyph is its button's --primary, a toned one its tone",
  paintOf("[data-icon]::before") === await evaluate(`M.tok("--primary")`) && paintOf("toned ::before") === await evaluate(`M.tok("--warning")`)
  && paintOf("text") === await evaluate(`M.tok("--foreground")`), JSON.stringify(normal.glyphs.slice(0, 8).map((g) => `${g.name}: ${g.paint}`)));

/* ── hidden (X3): `hidden` hides a .ico, whose display is its own ──────────────────────────────── */

if (!X3_IN_TOKENS) {
  console.log("      STAND-IN: tokens.css does not yet carry X3's [hidden] rule (WP1 adds it); the hidden harness");
  console.log("      carries it, so this asserts that .ico does not defeat that rule — not that the rule exists.");
}
await load("/__harness/hidden.html");
check("precondition: a .ico without `hidden` is displayed (inline-block)", (await style("#shown", "display")) === "inline-block");
check(`a .ico with \`hidden\` is not displayed${X3_IN_TOKENS ? " — tokens.css alone does it" : " (X3 stand-in)"}`, (await style("#hid", "display")) === "none");

/* ── contrast: a glyph is a graphical object, WCAG 1.4.11 asks 3:1 ────────── */

await load("/examples/icons.html?theme=warm&bare");
const COLOURS = ["--foreground", "--muted-foreground", "--primary", "--success", "--warning", "--destructive", "--info", "--pending"];
for (const theme of ["warm", "green", "mono", "paper"]) {
  const rows = await evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    const out = ${JSON.stringify(COLOURS)}.map((c) => ({ c, v: ["--background", "--card", "--muted"].map((s) => M.contrast(c, s)) }));
    out.push({ c: "--primary-foreground on --primary", v: [M.contrast("--primary-foreground", "--primary")] });
    return out; })()`);
  const worst = rows.flatMap((r) => r.v.map((v) => ({ c: r.c, v }))).sort((a, b) => a.v - b.v)[0];
  check(`${theme}: every glyph colour clears 3:1 on --background / --card / --muted (worst ${worst.c} ${worst.v.toFixed(2)})`,
    rows.every((r) => r.v.every((v) => v >= 3)),
    rows.filter((r) => r.v.some((v) => v < 3)).map((r) => `${r.c} ${r.v.map((v) => v.toFixed(2)).join("/")}`).join("; "));
  if (process.env.DD_ICON_CONTRAST === "1") {
    for (const r of rows) console.log(`      ${theme.padEnd(5)} ${r.c.padEnd(34)} ${r.v.map((v) => v.toFixed(2)).join(" / ")}`);
  }
}

finish();
