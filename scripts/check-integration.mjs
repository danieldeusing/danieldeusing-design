#!/usr/bin/env node
/*
 * check-integration.mjs — every file a package added is reachable through the entry points, and
 * nothing the packages borrowed while they were built apart is still in the tree.
 *
 * WHY. 0.60.0 was built as eleven packages side by side, and each one left the wiring to the
 * integration: a stylesheet no entry imports, a runtime module no barrel exports, and a demo that
 * stood in for a sibling's rules. Each of those is invisible in its own package's suite — the demo
 * links the file directly, and the suite imports the module by path — and each fails a consumer who
 * loads the package the documented way. So this reads the entry points themselves:
 *
 *   · src/index.css imports every stylesheet in src/ (fonts.css and the two entries aside), reset
 *     first, then tokens, base and the components, then utilities.css, then print.css LAST — a
 *     utility beats a component colour, and on paper print beats both (the WP1 ruling);
 *   · src/tailwind.css imports every component stylesheet index.css does (utilities.css and reset.css
 *     are not its — check-tailwind-layers.mjs proves the layer of each);
 *   · package.json exports every stylesheet in src/, and the runtime barrel;
 *   · runtime/index.js re-exports EVERY export of every runtime module, and imports in plain Node
 *     with no DOM — an `export *` silently drops a name two modules both export, and a module that
 *     touches the DOM at load throws in every server-side render that imports the barrel;
 *   · tokens/tokens.json holds the unconditional `:root` values (not a phone breakpoint's, not a
 *     wide screen's) and no icon drawings — those are CSS masks, lucide's licensed path data, and of
 *     no use to a native or Figma consumer, which takes lucide itself;
 *   · the minified bundle keeps lucide's `/*!` licence comment, which travels with the path data;
 *   · no demo and no suite carries a STAND-IN for a sibling package's rules: the siblings have
 *     merged, so a stand-in left in place can only hide a real rule going missing.
 *
 *   · every init* the barrel exports can be called TWICE: the second call adds no listener, no
 *     observer and no node, and writes nothing (the one section that needs a browser).
 *
 * No dependency. Build first (`node scripts/build.mjs`): it reads what dist/ and tokens.json hold,
 * which is what a release publishes. The init-twice section drives headless Chromium; with none on
 * the machine it skips loudly, and DD_REQUIRE_BROWSER=1 makes that a failure.
 *
 * MERMAID, WITHOUT THE NETWORK. templates/documentation.html imports mermaid from jsDelivr, and the
 * section that proves the template draws its diagrams used to fail whenever the CDN did. With
 * DD_MERMAID set to an installed `mermaid` package (the workflows borrow 11.16.0 into $RUNNER_TEMP
 * the way they borrow lucide-react), the browser answers every cdn.jsdelivr.net request itself: the
 * template's own import URL is served from that directory, and any other jsDelivr request is
 * refused. The template is not edited, so its real import path is what gets exercised, and nothing
 * can reach the network. The installed version must be the version the template pins. Unset, the
 * section loads mermaid from the CDN as before (a developer's machine); the workflows set it.
 *
 *   node scripts/check-integration.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHROME, launch, serve } from "./lib/chromium.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

let failures = 0;
let lastPassed = "(before the first check)";
const check = (label, run) => {
  let problems;
  try {
    problems = run();
  } catch (error) {
    problems = [`threw: ${String(error?.message || error).split("\n")[0]}`];
  }
  if (!problems.length) { console.log(`PASS  ${label}`); lastPassed = label; return; }
  failures += 1;
  console.log(`FAIL  ${label}\n        ${problems.join("\n        ")}`);
};
process.on("uncaughtException", (error) => {
  console.log(`FAIL  the suite threw after: ${lastPassed}\n        ${String(error?.message || error).split("\n")[0]}`);
  console.log("\ncheck-integration: ABORTED");
  process.exit(1);
});

const importsOf = (path) => [...read(path).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@import\s+(?:url\(\s*)?["']\.\/([^"']+)["']/g)]
  .map((m) => m[1]);
const stylesheets = readdirSync(join(root, "src")).filter((f) => f.endsWith(".css")).sort();
const ENTRIES = ["index.css", "tailwind.css"];
const LOADED_APART = ["fonts.css"]; // a separate <link>: the bundle must not block on a font request

/* ── the build-free bundle ─────────────────────────────────────────────────── */

const bundle = importsOf("src/index.css");
check(`index.css imports every stylesheet in src/ (${bundle.length} of ${stylesheets.length - ENTRIES.length - LOADED_APART.length})`, () =>
  stylesheets.filter((f) => !ENTRIES.includes(f) && !LOADED_APART.includes(f) && !bundle.includes(f)).map((f) => `${f} is not imported`));
check("index.css imports each file once, and nothing that is not in src/", () => [
  ...bundle.filter((f, i) => bundle.indexOf(f) !== i).map((f) => `${f} is imported twice`),
  ...bundle.filter((f) => !stylesheets.includes(f)).map((f) => `${f} does not exist`),
]);
check("index.css order: reset, tokens, base first; utilities after every component file; print last", () => {
  const out = [];
  if (bundle.slice(0, 3).join(" ") !== "reset.css tokens.css base.css") out.push(`starts ${bundle.slice(0, 3).join(" ")}`);
  if (bundle.at(-1) !== "print.css") out.push(`the last import is ${bundle.at(-1)}, not print.css`);
  if (bundle.at(-2) !== "utilities.css") out.push(`the import before print.css is ${bundle.at(-2)}, not utilities.css`);
  return out;
});

/* ── the Tailwind entry ────────────────────────────────────────────────────── */

const tailwind = importsOf("src/tailwind.css");
const components = bundle.filter((f) => !["reset.css", "tokens.css", "base.css", "utilities.css", "print.css"].includes(f));
check(`tailwind.css imports every component file index.css does (${components.length})`, () =>
  components.filter((f) => !tailwind.includes(f)).map((f) => `${f} is not imported`));
check("tailwind.css leaves out reset.css (Preflight) and utilities.css (Tailwind writes its own)", () =>
  ["reset.css", "utilities.css"].filter((f) => tailwind.includes(f)).map((f) => `${f} is imported`));

/* ── package.json ──────────────────────────────────────────────────────────── */

const pkg = JSON.parse(read("package.json"));
check(`package.json exports every stylesheet in src/ (${stylesheets.length})`, () =>
  stylesheets.filter((f) => pkg.exports[`./${f}`] !== `./src/${f}`).map((f) => `"./${f}": "./src/${f}" is missing`));
check("package.json exports the runtime barrel and each runtime module", () => [
  ...(pkg.exports["./runtime"] === "./runtime/index.js" ? [] : ['"./runtime" is not ./runtime/index.js']),
  ...(pkg.exports["./runtime/*"] === "./runtime/*.js" ? [] : ['"./runtime/*" is not ./runtime/*.js']),
]);

/* ── the runtime barrel ────────────────────────────────────────────────────── */

const modules = readdirSync(join(root, "runtime")).filter((f) => f.endsWith(".js") && f !== "index.js").sort();
const barrel = await import(pathToFileURL(join(root, "runtime/index.js")).href).catch((error) => error);
check("runtime/index.js imports in plain Node, with no DOM (a server-side render imports it)", () =>
  barrel instanceof Error ? [`threw: ${barrel.message.split("\n")[0]}`] : []);
if (!(barrel instanceof Error)) {
  const owners = new Map();
  const problems = [];
  for (const file of modules) {
    const mod = await import(pathToFileURL(join(root, "runtime", file)).href).catch((error) => error);
    if (mod instanceof Error) { problems.push(`${file} threw on import: ${mod.message.split("\n")[0]}`); continue; }
    for (const name of Object.keys(mod)) {
      if (owners.has(name)) problems.push(`${name} is exported by both ${owners.get(name)} and ${file}, so export * drops it`);
      owners.set(name, file);
      if (!(name in barrel)) problems.push(`${file}: ${name} is not re-exported by runtime/index.js`);
    }
  }
  check(`runtime/index.js re-exports every export of every module (${owners.size} names from ${modules.length} modules)`, () =>
    owners.size ? problems : ["read no exports at all"]);
}

/* ── tokens.json ───────────────────────────────────────────────────────────── */

const tokens = JSON.parse(read("tokens/tokens.json")).themes;
const warm = tokens.warm || {};
check("tokens.json: a token a media query redefines keeps its unconditional value (content-pad 1.5rem, fs-display 1.875rem)", () => [
  ...(warm["content-pad"] === "1.5rem" ? [] : [`content-pad is ${warm["content-pad"]}`]),
  ...(warm["fs-display"] === "1.875rem" ? [] : [`fs-display is ${warm["fs-display"]}`]),
]);
check("tokens.json: a token declared after a comment in its block is read (space-section, fs-2xl, lh-tight, lh-base, lh-display, field-label-w)", () =>
  ["space-section", "fs-2xl", "lh-tight", "lh-base", "lh-display", "field-label-w"].filter((k) => !(k in warm)).map((k) => `${k} is missing`));
check("tokens.json: four themes, and no icon drawing in any of them", () => [
  ...(Object.keys(tokens).sort().join(" ") === "green mono paper warm" ? [] : [`themes: ${Object.keys(tokens).join(" ")}`]),
  ...Object.entries(tokens).flatMap(([t, v]) => Object.keys(v).filter((k) => k.startsWith("ico-")).map((k) => `${t}.${k}`)).slice(0, 3),
]);

/* ── the licence travels with the drawings ─────────────────────────────────── */

for (const file of ["dist/danieldeusing-design.css", "dist/danieldeusing-design.min.css"]) {
  const css = read(file);
  check(`${file} carries lucide's licence with its path data`, () => {
    const drawings = (css.match(/--ico-[\w-]+:\s*url\(/g) || []).length;
    const notices = [...css.matchAll(/\/\*![\s\S]*?\*\//g)].filter((m) => /Lucide[\s\S]*ISC License[\s\S]*Cole Bemis/.test(m[0])).length;
    return [...(drawings ? [] : ["no icon drawings found — this check is reading the wrong file"]),
      ...(notices === 1 ? [] : [`${notices} lucide licence comments, want 1`])];
  });
}

/* ── no stand-ins ──────────────────────────────────────────────────────────── */

// A stand-in was a demo's copy of a sibling package's rule (or a harness's), switched on while the
// sibling was missing. Recognised by what every package named its own: a STAND-IN banner, an element
// id, or a JS fallback. The count of files read is printed, so a wrong directory cannot pass.
const MARKS = [/\bSTAND-INS?\b/, /id=["'](?:standin[\w-]*|stand-ins|pending-wp\d+[\w-]*|preview-wp\d+[\w-]*)["']/, /\bstandIn[A-Z]\w*/];
const scanned = [];
const found = [];
for (const dir of ["examples", "templates"]) {
  for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".html"))) {
    const text = read(`${dir}/${file}`);
    scanned.push(file);
    text.split("\n").forEach((line, i) => { if (MARKS.some((re) => re.test(line))) found.push(`${dir}/${file}:${i + 1}  ${line.trim().slice(0, 100)}`); });
  }
}
check(`no demo or template carries a stand-in for a sibling package (${scanned.length} files read)`, () =>
  scanned.length ? found : ["read no files"]);

/* ── a strict CSP (style-src 'self') ────────────────────────────────────────── */

// seedr serves the playgrounds under `style-src 'self'`, and publishing a release deploys them. Under
// that policy a style ATTRIBUTE is refused (style-src-attr) and so is an injected <style>, while the
// CSSOM (`el.style.x = …`, `style.cssText`, `setProperty`) applies. So the runtime writes styles only
// through the CSSOM, and documented markup — the templates and the skill's code blocks, which surfaces
// copy — carries no style attribute (the lead's ruling). Code only: the prose explaining the rule quotes
// it, and comments are stripped first.
const code = (js) => js.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const cspRuntime = [];
for (const file of modules.concat("index.js")) {
  const js = code(readFileSync(join(root, "runtime", file), "utf8"));
  js.split("\n").forEach((line, i) => {
    if (/setAttribute\(\s*["'`]style["'`]/.test(line) || /createElement\(\s*["'`]style["'`]/.test(line) || /<style\b|\sstyle=\\?["']/.test(line)) {
      cspRuntime.push(`runtime/${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}
check(`the runtime writes no style attribute and injects no <style> (${modules.length + 1} modules read)`, () => cspRuntime);
const docs = [
  ...readdirSync(join(root, "templates")).filter((f) => f.endsWith(".html")).map((f) => `templates/${f}`),
  ...readdirSync(join(root, ".claude/skills/danieldeusing-design/references")).filter((f) => f.endsWith(".md"))
    .map((f) => `.claude/skills/danieldeusing-design/references/${f}`),
  ".claude/skills/danieldeusing-design/SKILL.md",
];
const cspDocs = [];
for (const file of docs) {
  const text = read(file);
  const markup = file.endsWith(".md")
    ? [...text.matchAll(/^```[a-z]*\n([\s\S]*?)^```/gm)].map((m) => m[1]).join("\n")
    : text.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of markup.match(/<[a-z][a-z0-9-]*\b[^>]*\sstyle\s*=[^>]*>/gi) || []) cspDocs.push(`${file}: ${tag.slice(0, 90)}`);
}
check(`no documented markup carries a style attribute (${docs.length} files: the templates and the skill's code blocks)`, () =>
  docs.length > 10 ? cspDocs : [`read ${docs.length} files — the wrong directory`]);

// ── the templates wear the system's components, not local copies (0.61.0) ──────────────────────
// content.md retired the documentation template's own title, lists, grid, code and key/value rules;
// a copy left in its <style> is a fork that disagrees with the system at the next release.
check("templates/documentation.html declares none of the system's components in its <style>, and titles itself with .page-title", () => {
  const text = read("templates/documentation.html");
  const style = (text.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const forks = ["h1.title", ".lede", "ol.steps", "ul.plain", ".grid", ".pad", ".muted", "code.inline", "pre.block", "table.kv"]
    .filter((sel) => new RegExp(`(^|[\\s,}])${sel.replace(/\./g, "\\.")}(?![\\w-])[^{]*\\{`, "m").test(style)).map((sel) => `declares ${sel}`);
  if (!/<h1 class="page-title">/.test(text)) forks.push("the title is not h1.page-title");
  if (/class="title"|code class="inline"|pre class="block"/.test(text)) forks.push("markup still uses a retired local class");
  return forks;
});
// The history cluster's menu is named "history"; a group named "history" around it made a reader hear
// the word twice for one control (pagr made the wrapper a plain div). And the rail's list keeps its
// role, which Safari drops from a list with `list-style: none`.
check("the history cluster is a plain div wherever it is documented, and every ul.ls-panel keeps role=\"list\"", () => {
  const out = [];
  for (const file of ["templates/page-chrome.html", "examples/chrome.html", "src/chrome.css", ".claude/skills/danieldeusing-design/references/chrome.md"]) {
    for (const tag of read(file).match(/<div class="bar-history"[^>]*>/g) || []) if (tag !== '<div class="bar-history">') out.push(`${file}: ${tag}`);
  }
  for (const file of readdirSync(join(root, "templates")).filter((f) => f.endsWith(".html")).map((f) => `templates/${f}`)) {
    for (const tag of read(file).match(/<ul class="ls-panel"[^>]*>/g) || []) if (!/role="list"/.test(tag)) out.push(`${file}: ${tag}`);
  }
  return out;
});

// ── the vendored cockpit patcher ────────────────────────────────────────────────────────────────
// CI points DD_COCKPIT_DOM_PATCH at scripts/fixtures/cockpit-dom-patch.js. It must say which commit it
// is a copy of, and a local run with the infra checkout beside this one says when the live file has
// moved on — a NOTE, not a failure: cockpit changing its patcher is not a defect in this package.
const MARKER = "// ── vendored copy follows ──\n";
check("the vendored cockpit patcher names its source commit and carries the marker CI's copy is cut at", () => {
  const text = read("scripts/fixtures/cockpit-dom-patch.js");
  const problems = [];
  if (!/^\/\/ VENDORED — danieldeusing-infra cockpit\/pages\/dom-patch\.js at [0-9a-f]{7,} \(\d{4}-\d{2}-\d{2}\)/.test(text)) problems.push("the first line does not name `danieldeusing-infra cockpit/pages/dom-patch.js at <commit> (<date>)`");
  if (text.split(MARKER).length !== 2) problems.push("the marker line is missing or repeated");
  else if (!/cockpitPatch/.test(text.split(MARKER)[1])) problems.push("nothing below the marker defines cockpitPatch");
  return problems;
});
const live = join(root, "..", "..", "danieldeusing-infra", "cockpit", "pages", "dom-patch.js");
const sibling = [join(root, "..", "danieldeusing-infra", "cockpit", "pages", "dom-patch.js"), live].find((p) => existsSync(p));
if (sibling) {
  const vendored = read("scripts/fixtures/cockpit-dom-patch.js").split(MARKER)[1];
  console.log(vendored === readFileSync(sibling, "utf8")
    ? `      (the vendored patcher matches ${sibling})`
    : `NOTE  the vendored patcher differs from ${sibling} — refresh scripts/fixtures/cockpit-dom-patch.js`);
}

/* ── every init, twice ──────────────────────────────────────────────────────────────────────────── */

// Pages call init* from more than one place — a layout and a view, a first render and a re-render —
// and every module but a few already said "call once; a second call does nothing". toc.js's second
// spy hung the tab outright; fold, theme, search, sort, burger, zoom, terminal and the rail each added
// listeners, observers or overlays, or rewrote attributes that had not changed, on every extra call.
// So one page carries markup for every init, calls each once, settles, and calls each again: the
// second pass must add 0 listeners, 0 observers (constructed or observing) and 0 nodes, and make 0
// mutation records. The tickstrip's own 1 s clock and [data-ago]'s re-render are left out of the
// record count; they write on a timer, not because of a call.
const INITS = ["initThemeSwitcher", "initResolutionZoom", "initBurgerNav", "initDropdowns", "initSelects", "initAnimToggle", "initTerminal",
  "initLsNav", "initDiagramZoom", "initTableScroll", "initTablePagination", "initMinimap", "initTooltips", "initTableTools", "initFolds",
  "initSearchFields", "initSortControls", "initNotices", "initDialogs", "initRelativeTimes", "initTabs", "initTickStrips", "initPickCells",
  "initToc", "initCopyButtons"];
const TWICE_BODY = `<header class="bar"><button type="button" data-ls-nav-toggle aria-label="toggle the rail">nav</button>
  <details class="dropdown"><summary>theme <span data-theme-label></span></summary><ul class="dropdown-panel">
    ${["warm", "green", "mono", "paper"].map((t) => `<li><button type="button" class="dropdown-item" data-theme-value="${t}">${t}</button></li>`).join("")}</ul></details>
  <button type="button" data-anim-toggle><span data-anim-box></span> <span data-anim-label>anim</span></button>
  <button type="button" data-nav-toggle aria-expanded="false" aria-controls="site-nav" id="burger">menu</button></header>
<nav id="site-nav"><a href="#s1">one</a><details class="dropdown" id="nav-menu"><summary id="nav-menu-sum">more</summary><ul class="dropdown-panel">
  <li><button type="button" class="dropdown-item">a</button></li></ul></details></nav>
<main><aside class="toc"><nav class="navlist toc-inner" aria-label="on this page"><ol>
  <li><a href="#s1" data-toc-link="s1">one</a></li><li><a href="#s2" data-toc-link="s2">two</a></li></ol></nav></aside>
<section class="doc" id="s1"><h2>one</h2>
  <div class="tabs" role="tablist" aria-label="views"><button type="button" class="tab" role="tab" id="tw-a" aria-controls="tw-pa" aria-selected="true">a</button><button type="button" class="tab" role="tab" id="tw-b" aria-controls="tw-pb" aria-selected="false" tabindex="-1">b</button></div>
  <div class="tab-panel" id="tw-pa" role="tabpanel" aria-labelledby="tw-a">a</div><div class="tab-panel" id="tw-pb" role="tabpanel" aria-labelledby="tw-b" hidden>b</div>
  <label for="tw-sel">lines</label> <select id="tw-sel"><option>50</option><option selected>200</option></select>
  <label>source <select data-filter><option value="">all</option><option>seedr</option></select></label>
  <div class="search-field"><input type="search" aria-label="search" value="q"><button type="button" class="search-clear" aria-label="clear search"></button></div>
  <div class="sort-ctl"><button type="button" class="sort-dir" data-dir="asc"></button><select data-sort aria-label="sort by"><option>name</option></select></div>
  <table data-table-tools data-table-id="twice" aria-label="runs"><thead><tr><th data-col="n">n</th><th data-col="k" data-filter="pick">k</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, (_, i) => `<tr><td>${i}</td><td>${["a", "b"][i % 2]}</td></tr>`).join("")}</tbody></table>
  <button type="button" data-tip="a tip">tipped</button>
  <div class="cmd"><code class="cmd-text">npm i x</code><button type="button" data-copy aria-label="copy"></button></div>
  <div class="notice" role="status"><p>hello</p><button type="button" class="notice-dismiss" aria-label="dismiss"></button></div></section>
<section class="doc" id="s2"><h2>two</h2>
  <button type="button" data-dialog-open="tw-dlg">open</button><dialog class="dialog" id="tw-dlg"><h2 class="dialog-title">d</h2><button type="button" data-dialog-close>x</button></dialog>
  <figure class="diagram" id="dgm"><svg viewBox="0 0 10 10" aria-label="flow"><rect width="5" height="5"/></svg></figure>
  <pre class="mermaid" id="baked-diagram">${["warm", "green", "mono", "paper"].map((t) => `<svg data-theme-variant="${t}" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>`).join("")}</pre>
  <pre class="mermaid" id="plain-diagram"><svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg></pre>
  <div id="ticks" data-label="pollers"></div><p>updated <span data-ago="2026-09-29T08:00:00Z">then</span></p>
  <table><tbody><tr><td class="pick"><input type="checkbox" aria-label="pick"></td><td>x</td></tr></tbody></table>
  <details class="fold"><summary>fold</summary><p>folded</p></details>
  <section data-term><p class="prompt">ls</p><pre data-term-out>out</pre></section></section></main>`;
const TWICE_PAGE = `<!doctype html><html lang="en" data-theme="warm"><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/danieldeusing-design.css"></head><body>${TWICE_BODY}
<script type="module">
import * as dd from "/runtime/index.js";
window.dd = dd;
const args = { initDiagramZoom: [".diagram"], initMinimap: [{ sections: "main > section" }] };
window.initAll = () => { for (const name of ${JSON.stringify(INITS)}) dd[name](...(args[name] || [])); };
window.__ddTicks = [{ mount: "ticks", key: "a", label: "poller a", lastAt: new Date(Date.now() - 5000).toISOString(), intervalMs: 60000 }];
window.ready = true;
</script></body></html>`;
// Before any page script: count what the runtime adds, and every record the page makes.
const TWICE_PROBE = `(() => {
  const W = window.__twice = { live: [], observers: 0, observes: 0, records: 0, where: [] };
  const origin = () => (new Error().stack.split("\\n").slice(2).map((l) => l.match(/\\/(runtime\\/[a-z]+\\.js):(\\d+)/)).find(Boolean) || ["", "page"])[1];
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    W.live.push({ target: this, type, fn, capture: options === true || !!options?.capture, from: origin() });
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const capture = options === true || !!options?.capture;
    const i = W.live.findIndex((l) => l.target === this && l.type === type && l.fn === fn && l.capture === capture);
    if (i !== -1) W.live.splice(i, 1);
    return remove.call(this, type, fn, options);
  };
  const Recorder = MutationObserver;
  for (const name of ["MutationObserver", "ResizeObserver", "IntersectionObserver"]) {
    const Real = window[name];
    window[name] = class extends Real {
      constructor(...a) { super(...a); W.observers += 1; W.where.push(name + " " + origin()); }
      observe(...a) { W.observes += 1; W.where.push(name + ".observe " + origin()); return super.observe(...a); }
    };
  }
  const quiet = (node) => !!(node.nodeType === 1 ? node : node.parentElement)?.closest?.("#ticks, [data-ago]");
  new Recorder((records) => { for (const r of records) if (!quiet(r.target)) { W.records += 1; W.recordLog.push(r.type + ":" + (r.attributeName || "") + ":" + (r.target.nodeName || "")); } })
    .observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  W.recordLog = [];
  W.snap = () => ({ listeners: W.live.length, observers: W.observers, observes: W.observes, nodes: document.getElementsByTagName("*").length });
  W.settle = async (quietMs = 600, maxMs = 8000) => {
    const start = performance.now(); let last = W.records, since = performance.now();
    while (performance.now() - start < maxMs) {
      await new Promise((ok) => setTimeout(ok, 50));
      if (W.records !== last) { last = W.records; since = performance.now(); } else if (performance.now() - since >= quietMs) return true;
    }
    return false;
  };
})();`;
if (!CHROME) {
  console.log("      the init-twice section SKIPPED — no headless chromium on this machine.");
  if (process.env.DD_REQUIRE_BROWSER === "1") check("DD_REQUIRE_BROWSER=1: every init is called twice in a browser", () => ["no headless chromium on this machine"]);
} else {
  // The documentation template as a reader gets it, with its pinned design system served from this
  // checkout. Mermaid comes from DD_MERMAID through the browser's own request interception when it
  // is set (see the header), from the CDN otherwise.
  const DOC_PAGE = read("templates/documentation.html").replaceAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/@danieldeusing\/design@[\d.]+\//g, "/");
  const server = await serve(root, { "/__twice.html": TWICE_PAGE, "/__doc.html": DOC_PAGE });
  const browser = await launch("integration");
  // Bounded in node: toc.js's second spy hung the renderer, and a hung renderer never answers.
  const within = (promise, ms = 15000) => Promise.race([promise, new Promise((ok) => setTimeout(() => ok("no answer in " + ms + " ms — the tab hung"), ms))]);
  try {
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: TWICE_PROBE });
    await browser.navigate(`${server.origin}/__twice.html`);
    await browser.until("window.ready === true");
    const first = await within(browser.evaluate(`(async () => { initAll(); await __twice.settle(); return { ...__twice.snap(), at: __twice.where.length }; })()`));
    const second = typeof first === "string" ? first : await within(browser.evaluate(`(async () => { __twice.records = 0; __twice.recordLog = [];
      const live = __twice.live.length; initAll(); await __twice.settle(800);
      return { ...__twice.snap(), records: __twice.records, recordLog: __twice.recordLog.slice(0, 12),
        added: __twice.live.slice(live).map((l) => l.type + " " + l.from), observed: __twice.where.slice(${typeof first === "string" ? 0 : "FIRST_AT"}) }; })()`.replace("FIRST_AT", String(first.at ?? 0))));
    check(`every one of the ${INITS.length} init* called a second time adds 0 listeners, 0 observers and 0 nodes, and writes nothing`, () => {
      if (typeof first === "string" || typeof second === "string") return [String(typeof first === "string" ? first : second)];
      const out = [];
      for (const k of ["listeners", "observers", "observes", "nodes"]) if (second[k] !== first[k]) out.push(`${k}: ${first[k]} -> ${second[k]}`);
      if (second.records) out.push(`${second.records} mutation record(s): ${second.recordLog.join(" ")}`);
      if (second.added.length) out.push(`added: ${second.added.join(", ")}`);
      if (second.observed.length) out.push(`observers: ${second.observed.join(", ")}`);
      return out;
    });
    // What each extra call used to break, driven: the burger still opens, one Escape in a menu inside the
    // open nav closes only that menu, and a figure wired by a later call opens in the one view.
    const behaviour = typeof second === "string" ? second : await within(browser.evaluate(`(async () => {
      const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      document.getElementById("burger").click();
      const opens = document.getElementById("burger").getAttribute("aria-expanded");
      document.getElementById("nav-menu-sum").click(); await frame();
      document.getElementById("nav-menu-sum").focus();
      return { opens, menu: document.getElementById("nav-menu").open };
    })()`));
    let escape = behaviour;
    if (typeof behaviour === "object") {
      for (const type of ["rawKeyDown", "keyUp"]) await browser.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      escape = await within(browser.evaluate(`({ menu: document.getElementById("nav-menu").open, nav: document.getElementById("site-nav").classList.contains("open") })`));
    }
    check("...the burger, initialised twice, still opens on one press", () =>
      typeof behaviour === "object" && behaviour.opens === "true" ? [] : [JSON.stringify(behaviour)]);
    check("...and one Escape in a menu open inside the open burger closes the menu and leaves the nav open", () =>
      typeof escape === "object" && behaviour.menu === true && escape.menu === false && escape.nav === true ? [] : [JSON.stringify({ behaviour, escape })]);
    const zoom = typeof second === "string" ? second : await within(browser.evaluate(`(async () => {
      const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      document.getElementById("s2").insertAdjacentHTML("beforeend", '<figure class="diagram" id="dgm2"><svg viewBox="0 0 10 10" aria-label="later"><rect width="5" height="5"/></svg></figure>');
      dd.initDiagramZoom(".diagram");
      for (const id of ["dgm", "dgm2"]) { document.getElementById(id).click(); await frame(); document.querySelector("dialog.dgm-overlay[open]")?.close(); await frame(); }
      return document.querySelectorAll("dialog.dgm-overlay").length; })()`));
    check("...and a figure a later initDiagramZoom() wires opens in the page's one view: 1 overlay <dialog> after both have opened", () =>
      zoom === 1 ? [] : [`${zoom} overlay dialogs`]);

    // A BAKED DIAGRAM HOLDS ONE SVG PER THEME (0.64.0) and CSS shows the reader's. The view opens the
    // one on screen: with the warm variant hidden, the paper one is what a reader sees and zooms.
    const variant = typeof second === "string" ? second : await within(browser.evaluate(`(async () => {
      const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      document.getElementById("s2").insertAdjacentHTML("beforeend", '<figure class="diagram" id="dgm3">' +
        '<svg data-theme-variant="warm" style="display:none" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>' +
        '<svg data-theme-variant="paper" viewBox="0 0 10 10"><rect width="5" height="5"/></svg></figure>');
      dd.initDiagramZoom(".diagram");
      document.getElementById("dgm3").click(); await frame();
      const shown = document.querySelector("dialog.dgm-overlay[open] svg")?.getAttribute("data-theme-variant");
      document.querySelector("dialog.dgm-overlay[open]")?.close(); await frame();
      return shown ?? "no open view"; })()`));
    check("...and a diagram with theme variants opens the variant on screen, not the first in the markup", () =>
      variant === "paper" ? [] : [String(variant)]);

    // THE VARIANT CSS (0.64.0). src/content.css hides the variants of the other themes and leaves the reader's
    // alone, so it keeps the display of every diagram svg (block: reset.css, and print.css in print). It once
    // hid all four and gave the shown one `display: revert`, which dropped it to the browser's inline: a baked
    // diagram laid out unlike a live one, on screen and in print, and nothing failed. Per theme (unset is warm),
    // on screen and then with print media: exactly the matching variant has a box, and it has the plain svg's display.
    const variantCss = typeof second === "string" ? second : await within((async () => {
      const rows = [];
      try {
        for (const media of ["screen", "print"]) {
          await browser.send("Emulation.setEmulatedMedia", { media: media === "print" ? "print" : "" });
          rows.push(...await browser.evaluate(`[null, "warm", "green", "mono", "paper"].map((theme) => {
            if (theme) document.documentElement.dataset.theme = theme; else document.documentElement.removeAttribute("data-theme");
            const shown = [...document.querySelectorAll("#baked-diagram > svg")].filter((svg) => svg.getClientRects().length);
            return { media: ${JSON.stringify(media)}, applied: matchMedia("print").matches === ${media === "print"}, theme: theme ?? "unset",
              shown: shown.map((svg) => svg.dataset.themeVariant + ":" + getComputedStyle(svg).display),
              plain: getComputedStyle(document.querySelector("#plain-diagram > svg")).display };
          })`));
        }
      } finally {
        await browser.send("Emulation.setEmulatedMedia", { media: "" });
        await browser.evaluate(`document.documentElement.dataset.theme = "warm"`);
      }
      return rows;
    })());
    check("the variant CSS shows one svg per theme, with a diagram svg's display, on screen and in print", () =>
      !Array.isArray(variantCss) ? [String(variantCss)] : variantCss.flatMap(({ media, applied, theme, shown, plain }) => {
        const want = `${theme === "unset" ? "warm" : theme}:${plain}`;
        return [...(applied ? [] : [`${media} media was not applied`]),
          ...(shown.length === 1 && shown[0] === want ? [] : [`${media}, data-theme ${theme}: shown ${JSON.stringify(shown)}, want ["${want}"]`])];
      }));

    // A BAKED PAGE'S TABS, WITH NO SCRIPT (0.64.0). Only the runtime switches panels, so a preview that runs no
    // script (Teams, Element on iOS, a mail client) would show the first panel and nothing else. src/data.css
    // shows every panel and no tab row, as print does, on a page that carries the dd-baked meta and has no
    // data-theme: the template's pre-paint script sets one whenever scripts run. A theme, or no meta, leaves the
    // tabs alone, so an app that uses tabs without a theme keeps its hidden panels. A panel hidden="until-found"
    // keeps its own display (the rule skips it, as the print rule and tokens.css do).
    const tabsCss = typeof second === "string" ? second : await within(browser.evaluate(`(() => {
      const html = document.documentElement;
      document.getElementById("s2").insertAdjacentHTML("beforeend", '<div id="tabbed">' +
        '<div class="tabs" role="tablist" aria-label="fixture">' +
        '<button type="button" class="tab" role="tab" id="fx-a" aria-controls="fx-pa" aria-selected="true">a</button>' +
        '<button type="button" class="tab" role="tab" id="fx-b" aria-controls="fx-pb" aria-selected="false" tabindex="-1">b</button></div>' +
        '<div id="fx-pa" role="tabpanel" aria-labelledby="fx-a">a</div>' +
        '<div id="fx-pb" role="tabpanel" aria-labelledby="fx-b" hidden>b</div>' +
        '<div id="fx-pc" role="tabpanel" hidden="until-found" style="display:flex">c</div></div>');
      const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
      const rows = [];
      try {
        for (const [baked, theme] of [[true, null], [true, "warm"], [true, "green"], [true, "mono"], [true, "paper"], [false, null], [false, "warm"]]) {
          document.querySelector('meta[name="dd-baked"]')?.remove();
          if (baked) document.head.insertAdjacentHTML("beforeend", '<meta name="dd-baked" content="0.64.0 2026-10-05">');
          if (theme) html.dataset.theme = theme; else html.removeAttribute("data-theme");
          rows.push({ baked, theme: theme ?? "unset", panel: display("#fx-pb"), row: display("#tabbed .tabs"), found: display("#fx-pc") });
        }
      } finally {
        document.querySelector('meta[name="dd-baked"]')?.remove();
        html.dataset.theme = "warm";
        document.getElementById("tabbed").remove();
      }
      return rows;
    })()`));
    check("a baked page with no data-theme shows every tab panel and no tab row; a theme, or no baked meta, leaves the tabs alone", () =>
      !Array.isArray(tabsCss) ? [String(tabsCss)] : tabsCss.flatMap(({ baked, theme, panel, row, found }) => {
        const open = baked && theme === "unset";
        const where = `${baked ? "baked" : "not baked"}, data-theme ${theme}`;
        return [
          ...(panel === (open ? "block" : "none") ? [] : [`${where}: the hidden panel has display ${panel}, want ${open ? "block" : "none"}`]),
          ...(row === (open ? "none" : "flex") ? [] : [`${where}: the tab row has display ${row}, want ${open ? "none" : "flex"}`]),
          ...(found === "flex" ? [] : [`${where}: the until-found panel has display ${found}, want its own flex`]),
        ];
      }));

    // THE TEMPLATE'S DIAGRAM, IN THE THEME'S OWN RED (0.61.1). Its `classDef warn` carried a literal
    // #a02c2c: warm's --destructive, and wrong on the other three themes. Mermaid does not take var() in
    // a style at all (measured with 11.16.0: with or without a fallback the diagram fails to parse), so
    // the classDef keeps only the shape and the page colours `.node.warn` from the token. Here: the
    // diagram renders to an <svg>, and its warn node's stroke is --destructive on every theme.
    const MERMAID_CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@([\d.]+)\/dist\//;
    const pinned = read("templates/documentation.html").match(/https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@([\d.]+)\/dist\/mermaid\.esm\.min\.mjs/)?.[1];
    const mermaidDir = process.env.DD_MERMAID;
    const mermaidSeen = { local: 0, refused: [], missing: [] };
    if (mermaidDir) {
      const installed = existsSync(join(mermaidDir, "package.json")) ? JSON.parse(readFileSync(join(mermaidDir, "package.json"), "utf8")).version : null;
      check(`DD_MERMAID is the mermaid the template pins (${pinned})`, () =>
        installed === pinned ? [] : [`${mermaidDir} holds ${installed ?? "no mermaid package"}, the template imports ${pinned}`]);
      const MIME = { ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".map": "application/json" };
      browser.on("Fetch.requestPaused", ({ requestId, request }) => {
        const m = request.url.match(MERMAID_CDN);
        const file = m && m[1] === pinned ? normalize(join(mermaidDir, "dist", new URL(request.url).pathname.replace(/^\/npm\/mermaid@[\d.]+\/dist\//, ""))) : null;
        if (file && file.startsWith(join(mermaidDir, "dist") + sep) && existsSync(file) && statSync(file).isFile()) {
          mermaidSeen.local += 1;
          browser.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [
            { name: "content-type", value: `${MIME[extname(file)] || "application/octet-stream"}; charset=utf-8` },
            { name: "access-control-allow-origin", value: "*" }], body: readFileSync(file).toString("base64") });
        } else {
          (file ? mermaidSeen.missing : mermaidSeen.refused).push(request.url);
          browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
        }
      });
      await browser.send("Fetch.enable", { patterns: [{ urlPattern: "https://cdn.jsdelivr.net/*" }] });
    }
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("anim", "off"); } catch {}` });
    await browser.navigate(`${server.origin}/__doc.html`);
    const rendered = await within(browser.evaluate(`(async () => {
      for (let i = 0; i < 200 && !document.querySelector("pre.mermaid[data-processed] svg .node.warn"); i += 1) await new Promise((ok) => setTimeout(ok, 50));
      return !!document.querySelector("pre.mermaid[data-processed] svg .node.warn"); })()`), 20000);
    check("templates/documentation.html: its diagram renders to an <svg> with the warn node in it", () =>
      rendered === true ? [] : [rendered === false ? "no rendered svg with a .node.warn (did mermaid load? DD_MERMAID, or else the CDN)" : String(rendered)]);
    // THE BAKE'S CONTRACT (0.64.0): the diagram code is its own data-dd-diagrams script, it renders on
    // request and resolves to one svg per diagram, and every pass announces itself for the explainers.
    const contract = rendered !== true ? null : await within(browser.evaluate(`(async () => {
      let passes = 0;
      document.addEventListener("dd:diagrams", () => { passes += 1; });
      const svgs = await window.ddRenderDiagrams();
      return { diagrams: document.querySelectorAll("pre.mermaid").length, svgs: svgs.map((s) => typeof s === "string" && s.startsWith("<svg")), passes,
               script: !!document.querySelector('script[type="module"][data-dd-diagrams]') }; })()`));
    check("templates/documentation.html: window.ddRenderDiagrams() resolves to one svg per diagram and fires dd:diagrams", () =>
      contract && contract.script && contract.passes >= 1 && contract.svgs.length === contract.diagrams && contract.svgs.every(Boolean)
        ? [] : [JSON.stringify(contract)]);
    check("templates/documentation.html: the runtime import carries the dd-runtime mark the bake looks for", () =>
      /\/\/ dd-runtime: scripts\/bake\.mjs swaps this import[^\n]*\n\s*import \{[^}]*\} from\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/@danieldeusing\/design@[\d.]+\/runtime\/index\.js";/
        .test(read("templates/documentation.html")) ? [] : ["no marked runtime import"]);
    if (mermaidDir) {
      // Anything else the page asks jsDelivr for (the webfont) is refused, not failed: the diagram does
      // not need it, and a refusal is the point. Only a mermaid file the copy lacks is a fault.
      check("templates/documentation.html: its mermaid came from DD_MERMAID, and every file it asked for was there", () => [
        ...(mermaidSeen.local ? [] : ["the page never asked for its mermaid import: 0 files served from DD_MERMAID"]),
        ...mermaidSeen.missing.map((url) => `not in DD_MERMAID/dist: ${url}`)]);
      console.log(`      ${mermaidSeen.local} mermaid file(s) served from DD_MERMAID; ${mermaidSeen.refused.length} other jsDelivr request(s) refused; none reached the network`);
    } else console.log("      DD_MERMAID is not set: mermaid is loaded from cdn.jsdelivr.net, so this section needs the network.");
    for (const theme of ["warm", "green", "mono", "paper"]) {
      const got = rendered !== true ? null : await within(browser.evaluate(`(async () => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        for (let i = 0; i < 200 && !document.querySelector("pre.mermaid[data-processed] svg .node.warn"); i += 1) await new Promise((ok) => setTimeout(ok, 50));
        const shape = document.querySelector("pre.mermaid svg .node.warn > :is(rect, polygon, circle, ellipse, path)");
        const p = document.createElement("i"); p.style.color = "var(--destructive)"; document.body.append(p);
        const want = getComputedStyle(p).color; p.remove();
        return { stroke: shape && getComputedStyle(shape).stroke, want }; })()`));
      check(`templates/documentation.html, ${theme}: the warn node's stroke is the theme's --destructive`, () =>
        got && got.stroke === got.want ? [] : [JSON.stringify(got)]);
    }
  } finally {
    browser.close();
    server.close();
  }
}

console.log(failures ? `\ncheck-integration: ${failures} FAILED` : "\ncheck-integration: all checks passed");
process.exit(failures ? 1 : 0);
