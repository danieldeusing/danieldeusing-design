#!/usr/bin/env node
/*
 * check-tailwind-layers.mjs — in a Tailwind app, a utility beats the system on the same element.
 *
 * WHERE THIS CAME FROM. Until 0.60.0 src/tailwind.css imported every file unlayered, and an
 * unlayered rule outranks every cascade layer whatever its specificity. So the system silently won
 * over each utility a consumer wrote on a system-styled element: seedr's border-colour utilities
 * all rendered --border, danieldeusing.de's `p-6` on a card did nothing, and `outline-none` lost
 * to the system's focus ring. The fix is one word per import (`layer(base)`, `layer(components)`),
 * and one missing word on a future import silently reinstates the whole failure for that file —
 * which is why this exists.
 *
 * WHAT IT PROVES, in a real browser against a real Tailwind compile of the SHIPPED entry:
 *   · utilities beat components (`p-6` on a card, `px-3` on a compact button);
 *   · utilities beat base (`border-primary` against `* { border-color }`, `outline-none` against
 *     `:focus-visible`, `leading-9` against the body's line height);
 *   · the element defaults still beat Tailwind's Preflight, which lives in the same `base` layer
 *     (a bare <h2> is --fs-xl, a <code> is the page's font) — and a utility still beats them;
 *   · tokens.css and print.css stayed unlayered (the tokens resolve, the kill switch stops a
 *     utility's transition, and on paper print.css beats a utility);
 *   · the theme keys this entry adds resolve (`rounded-2xl` is square, `text-cat-teal`,
 *     `border-control-edge`, `shadow-float`).
 * And, with no compiler needed, that every import in src/tailwind.css carries the layer its file
 * belongs in.
 *
 * NO DEPENDENCY. The design system installs nothing, so the compiler is borrowed from a consumer
 * on this machine (`@tailwindcss/node`, which configr has) and the browser is the headless chromium
 * Playwright caches, driven over the DevTools protocol with Node's own fetch and WebSocket. If
 * either is missing the browser half SKIPS loudly — a missing compiler is not a broken design
 * system — while the static half still runs. DD_TAILWIND_NODE points at another @tailwindcss/node;
 * DD_REQUIRE_TAILWIND=1 and DD_REQUIRE_BROWSER=1 turn the respective skip into a failure.
 *
 *   node scripts/check-tailwind-layers.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(root, "src/tailwind.css");

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
  console.log(`\ncheck-tailwind-layers: ABORTED`);
  process.exit(1);
});
const finish = () => {
  console.log(failures ? `\ncheck-tailwind-layers: ${failures} FAILED` : "\ncheck-tailwind-layers: all checks passed");
  process.exit(failures ? 1 : 0);
};

/* ── the static half: every import carries its layer ─────────────────────── */

const imports = [...readFileSync(ENTRY, "utf8").matchAll(/@import\s+"\.\/([^"]+)"\s*([^;]*);/g)]
  .map(([, file, rest]) => ({ file, layer: (rest.match(/layer\(([^)]*)\)/) || [])[1] ?? null }));
const expected = (file) => (file === "tokens.css" || file === "print.css" ? null : file === "base.css" ? "base" : "components");
check("the entry imports tokens, base, the component files and print",
  ["tokens.css", "base.css", "components.css", "print.css"].every((f) => imports.some((i) => i.file === f)),
  JSON.stringify(imports));
for (const { file, layer } of imports) {
  check(`${file} is imported ${expected(file) ? `in layer(${expected(file)})` : "unlayered"}`,
    layer === expected(file), `found: ${layer === null ? "unlayered" : `layer(${layer})`}`);
}

/* ── the browser half ─────────────────────────────────────────────────────── */

const TW_NODE = process.env.DD_TAILWIND_NODE
  ? (existsSync(process.env.DD_TAILWIND_NODE) ? process.env.DD_TAILWIND_NODE : null)
  : [
    `${process.env.HOME}/Work/danieldeusing/apps/configr/node_modules/@tailwindcss/node`,
    join(root, "node_modules/@tailwindcss/node"),
  ].find((path) => existsSync(join(path, "package.json")));
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

if (!TW_NODE || !CHROME) {
  console.log(`\ncheck-tailwind-layers: browser half SKIPPED — no ${!TW_NODE ? "@tailwindcss/node" : "headless chromium"} on this machine.`);
  console.log("  The cascade is only provable against a real Tailwind compile in a real browser; the");
  console.log("  static import check above still ran. Set DD_TAILWIND_NODE to a @tailwindcss/node directory.");
  if ((!TW_NODE && process.env.DD_REQUIRE_TAILWIND === "1") || (!CHROME && process.env.DD_REQUIRE_BROWSER === "1")) {
    console.log("  A DD_REQUIRE_* flag is set: this skip counts as a FAILURE.");
    process.exit(1);
  }
  finish();
}

// `@import "tailwindcss"` resolves from the consumer that lent the compiler; the entry by path.
const { compile } = await import(pathToFileURL(join(TW_NODE, "dist/index.mjs")).href);
const CANDIDATES = [
  "p-6", "px-3", "border", "border-primary", "outline-none", "leading-9", "text-2xl", "flex",
  "rounded-xs", "rounded-2xl", "rounded-full", "text-cat-teal", "border-control-edge",
  "shadow-float", "shadow-modal", "transition-colors",
];
const compiler = await compile(`@import "tailwindcss";\n@import "${ENTRY}";\n`, {
  base: dirname(dirname(TW_NODE)), onDependency() {},
});
const COMPILED = compiler.build(CANDIDATES);

// Tab order is load-bearing: the first control must be the one wearing `outline-none`.
const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/app.css"></head>
<body class="leading-9">
<button id="bare-ring" class="btn-terminal btn-terminal--ghost outline-none">no ring</button>
<button id="kept-ring" class="btn-terminal btn-terminal--ghost">ring</button>
<article id="card-plain" class="card-terminal">card</article>
<article id="card-p6" class="card-terminal p-6">card</article>
<button id="compact-px3" class="btn-terminal btn-terminal--compact px-3">compact</button>
<div id="edge-primary" class="border border-primary">edge</div>
<h1 id="h1">h1</h1><h2 id="h2">h2</h2><h3 id="h3">h3</h3><h4 id="h4">h4</h4>
<h2 id="h2-util" class="text-2xl">h2 with a utility</h2>
<h2><code id="code-in-h2">code</code></h2>
<p><code id="code">code</code></p>
<pre id="pre"><code>pre</code></pre>
<div id="r-xs" class="border rounded-xs">xs</div>
<div id="r-2xl" class="border rounded-2xl">2xl</div>
<div id="r-full" class="border rounded-full">full</div>
<span id="cat" class="text-cat-teal">teal</span>
<div id="ctl-edge" class="border border-control-edge">control edge</div>
<div id="float" class="shadow-float">float</div>
<div id="modal" class="shadow-modal">modal</div>
<a id="fade" class="transition-colors" href="#">fade</a>
<footer id="status" class="status flex">status</footer>
<span id="probe"></span>
</body></html>`;

const server = createServer((req, res) => {
  const css = req.url === "/app.css";
  res.writeHead(200, { "content-type": css ? "text/css; charset=utf-8" : "text/html; charset=utf-8" });
  res.end(css ? COMPILED : HARNESS);
}).listen(0);
await new Promise((ok) => server.on("listening", ok));

const PORT = 19231;
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "dd-twlayers-"))}`, "about:blank",
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
const style = (id, prop) => evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}))[${JSON.stringify(prop)}]`);
// What a token computes to, read through the same property on a probe, so both sides of a
// comparison went through the browser's own colour serialisation.
const token = (name, prop = "color") => evaluate(`(() => { const p = document.getElementById("probe");
  p.style.${prop} = "var(${name})"; const v = getComputedStyle(p).${prop}; p.style.${prop} = ""; return v; })()`);
const tab = async () => {
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  }
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
await sleep(600);

/* ── utilities beat components ──────────────────────────────────────────── */

const plainPad = await style("card-plain", "paddingTop");
check("precondition: .card-terminal pads itself from the components layer", parseFloat(plainPad) > 0, plainPad);
check("`p-6` on a .card-terminal wins — 24px, not the card's own inset",
  (await style("card-p6", "paddingTop")) === "24px", await style("card-p6", "paddingTop"));
check("`px-3` on a compact button wins over --compact's padding",
  (await style("compact-px3", "paddingLeft")) === "12px", await style("compact-px3", "paddingLeft"));

/* ── utilities beat base ────────────────────────────────────────────────── */

check("`border-primary` beats base.css's `* { border-color: var(--border) }`",
  (await style("edge-primary", "borderTopColor")) === (await token("--primary")),
  `${await style("edge-primary", "borderTopColor")} vs --primary ${await token("--primary")}`);
const bodyLine = await evaluate("getComputedStyle(document.body).lineHeight");
check("`leading-9` on <body> beats base.css's body line height", bodyLine === "36px", bodyLine);

await evaluate("document.body.focus(); document.activeElement.blur(); null");
await tab();
check("precondition: the keyboard reached the first control and it matches :focus-visible",
  await evaluate('document.activeElement.id === "bare-ring" && document.activeElement.matches(":focus-visible")'),
  await evaluate("document.activeElement.id"));
check("`outline-none` beats base.css's :focus-visible ring — one indicator, the consumer's",
  (await style("bare-ring", "outlineStyle")) === "none", await style("bare-ring", "outlineStyle"));
await tab();
check("...while a control with no utility still gets the system ring",
  (await style("kept-ring", "outlineStyle")) === "solid" && (await style("kept-ring", "outlineWidth")) === "2px",
  `${await style("kept-ring", "outlineStyle")} ${await style("kept-ring", "outlineWidth")}`);

/* ── the element defaults survive Preflight, and still yield to a utility ── */

for (const [id, px] of [["h1", "24px"], ["h2", "18px"], ["h3", "15px"], ["h4", "12px"]]) {
  check(`a bare <${id}> is ${px} — Preflight's heading reset shares the base layer and must not win`,
    (await style(id, "fontSize")) === px, await style(id, "fontSize"));
}
check("...and bold", (await style("h2", "fontWeight")) === "700", await style("h2", "fontWeight"));
check("...while `text-2xl` on a heading still wins over the default",
  (await style("h2-util", "fontSize")) === "24px", await style("h2-util", "fontSize"));
const bodyFont = await evaluate("getComputedStyle(document.body).fontFamily");
check("<code> is the page's font, not Preflight's mono stack",
  (await style("code", "fontFamily")) === bodyFont, `${await style("code", "fontFamily")} vs body ${bodyFont}`);
check("<code> inside a heading is the one text size, 12px",
  (await style("code-in-h2", "fontSize")) === "12px", await style("code-in-h2", "fontSize"));
check("<pre> is the page's font too",
  (await style("pre", "fontFamily")) === bodyFont, await style("pre", "fontFamily"));

/* ── the theme keys this entry adds ─────────────────────────────────────── */

check("`rounded-2xl` is square", (await style("r-2xl", "borderTopLeftRadius")) === "0px", await style("r-2xl", "borderTopLeftRadius"));
check("`rounded-xs` is square", (await style("r-xs", "borderTopLeftRadius")) === "0px", await style("r-xs", "borderTopLeftRadius"));
check("`rounded-full` stays a circle — it is not a theme step and a dot needs it",
  (await style("r-full", "borderTopLeftRadius")) !== "0px", await style("r-full", "borderTopLeftRadius"));
// Not only "equal": an undefined token and an ungenerated utility both fall back to the inherited
// colour and compare equal — that pair passed against the 0.59.0 entry, which has neither.
const catColor = await style("cat", "color");
check("`text-cat-teal` resolves to --cat-teal, a colour of its own",
  catColor === (await token("--cat-teal")) && catColor !== (await evaluate("getComputedStyle(document.body).color")),
  `${catColor} vs ${await token("--cat-teal")}`);
check("`border-control-edge` resolves to --control-edge",
  (await style("ctl-edge", "borderTopColor")) === (await token("--control-edge")),
  `${await style("ctl-edge", "borderTopColor")} vs ${await token("--control-edge")}`);
check("`shadow-float` is the 20px glow", String(await style("float", "boxShadow")).includes("20px"), await style("float", "boxShadow"));
check("`shadow-modal` is the 40px glow", String(await style("modal", "boxShadow")).includes("40px"), await style("modal", "boxShadow"));

/* ── tokens.css stayed unlayered ────────────────────────────────────────── */

check("the tokens resolve on :root (--control-h)",
  (await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--control-h").trim()')) === "1.75rem");
check("precondition: `transition-colors` animates while motion is on",
  (await style("fade", "transitionDuration")) !== "0s", await style("fade", "transitionDuration"));
await evaluate('document.documentElement.classList.add("anim-off"); null');
check("html.anim-off stops a UTILITY's transition too",
  (await style("fade", "transitionDuration")) === "0s", await style("fade", "transitionDuration"));
await evaluate('document.documentElement.classList.remove("anim-off"); null');

/* ── print.css stayed unlayered: on paper it beats a utility ────────────── */

await send("Emulation.setEmulatedMedia", { media: "print" });
check("on paper print.css's body line height beats `leading-9` (1.45 × 12px)",
  (await evaluate("getComputedStyle(document.body).lineHeight")) === "17.4px",
  await evaluate("getComputedStyle(document.body).lineHeight"));
check("...and the status footer is gone although it carries `flex`",
  (await style("status", "display")) === "none", await style("status", "display"));
await send("Emulation.setEmulatedMedia", { media: "" });

finish();
