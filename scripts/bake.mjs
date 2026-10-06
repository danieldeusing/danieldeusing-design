#!/usr/bin/env node
/*
 * bake.mjs — makes a page written from templates/documentation.html or templates/review-report.html
 * load nothing (0.64.0).
 *
 * A page as written loads the design system from jsDelivr and draws its diagrams with Mermaid at view
 * time. The Teams file preview, Element on iOS and a mail client fetch nothing and run no script:
 * there a Poirot page showed no styles, raw diagram source and its right-hand columns cut off. The
 * bake starts from the page as written and changes only these places:
 *   - the design CSS and fonts.css replace their <link>s; fonts.css keeps only the faces whose
 *     unicode-range the page's text uses, each woff2 as a data: url;
 *   - the runtime records the page imports, and the records those import, replace the import from
 *     jsDelivr, in a classic script before the first module script;
 *   - each table gets the .tablewrap initTableScroll() would give it, so it scrolls without JS;
 *   - each diagram gets one svg per theme, drawn in headless Chrome (CSS shows the theme's own, warm
 *     without JavaScript), and the data-dd-diagrams script becomes inert text;
 *   - <meta name="dd-baked" content="<design version> <date>">.
 * Each inlined block keeps what it replaced, so a baked page bakes again from the page as written. It
 * refuses, and writes nothing, when anything would still load from the network.
 *
 *   node scripts/bake.mjs <page.html> [--out <file>] [--assets <dir>]
 *
 * The design files come from --assets (a folder laid out like the package: package.json, dist/,
 * src/fonts.css, files/<woff2>), else from this clone when it is the version the page pins, else
 * from jsDelivr. The cockpit bakes its review reports with --assets: no network, and no diagrams, so
 * no browser. DD_CHROME names the browser, DD_MERMAID a local mermaid package (CI).
 * Exit codes: 0 baked, 1 refused (nothing written), 2 usage, input or no browser.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { subsetRuntime } from "./lib/runtime.mjs";
import { content, escapeAttr, escapeText, hasClass, inside, scan, setAttr, splice, unescape } from "./lib/tags.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const THEMES = ["warm", "green", "mono", "paper"];
const CDN = "https://cdn.jsdelivr.net/npm/@danieldeusing/design@";
const PIN = /https:\/\/cdn\.jsdelivr\.net\/npm\/@danieldeusing\/design@(\d+\.\d+\.\d+)\//g;
const RUNTIME_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/@danieldeusing\/design@\d+\.\d+\.\d+\/runtime\/index\.js["'];?/g;
const RUNTIME_READ = /const \{[^}]*\} = globalThis\.ddRuntime;/;
const REMOTE = /^\s*(?:https?:)?\/\//i;
const SRC_TAGS = new Set(["script", "img", "source", "video", "audio", "track", "iframe", "embed"]);
const ACTIVE = new Set(["", "module", "text/javascript", "application/javascript"]);
const CSS_LOAD = /@import\s*(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s;]+)|url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi;
const JS_LOAD = /\bimport\s*(?:\(\s*|[\w$*{}\s,]*?\bfrom\s*|)["'`]((?:https?:)?\/\/[^"'`]+)["'`]/g;

/** The page cannot be made self-contained; nothing is written. */
export class Refusal extends Error {}
/** This machine cannot draw the page's diagrams. */
export class NoBrowser extends Error {}

const isActive = (el) => el.tag === "script" && ACTIVE.has((el.attrs.type ?? "").trim().toLowerCase());
const lineOf = (html, at) => html.slice(0, at).split("\n").length;

/** Every load of a remote url left in the page, as "<tag>: url". */
export function remoteLoads(html) {
  const found = [];
  for (const el of scan(html)) {
    const at = `<${el.tag}>`;
    const { rel = "", href = "", "xlink:href": xlink = "", src = "", srcset = "", data = "", style = "" } = el.attrs;
    if (el.tag === "link" && /\b(?:stylesheet|icon|preload|modulepreload)\b/i.test(rel) && REMOTE.test(href)) found.push(`${at}: ${href}`);
    if (SRC_TAGS.has(el.tag) && REMOTE.test(src)) found.push(`${at}: ${src}`);
    for (const candidate of srcset.split(",")) if (REMOTE.test(candidate)) found.push(`${at}: ${candidate.trim()}`);
    if (el.tag === "object" && REMOTE.test(data)) found.push(`${at}: ${data}`);
    if (el.tag === "image") for (const url of [href, xlink]) if (REMOTE.test(url)) found.push(`${at}: ${url}`);
    for (const m of style.matchAll(CSS_LOAD)) found.push(`${at} style: ${m[1] ?? m[2]}`);
    if (el.end === undefined) continue;
    if (el.tag === "style") for (const m of content(html, el).matchAll(CSS_LOAD)) found.push(`${at}: ${m[1] ?? m[2]}`);
    if (isActive(el)) for (const m of content(html, el).matchAll(JS_LOAD)) found.push(`${at}: ${m[1]}`);
  }
  return found;
}

/** What a baked page must not hold: a remote load, a diagram without one svg per theme, two svgs with one id. */
export function bakedProblems(html) {
  const problems = remoteLoads(html).map((load) => `loads ${load}`);
  const elements = scan(html);
  const ids = new Map();
  elements.filter((el) => el.tag === "pre" && hasClass(el, "mermaid")).forEach((pre, i) => {
    const svgs = elements.filter((el) => el.tag === "svg" && el.parent === pre);
    const themes = svgs.map((svg) => svg.attrs["data-theme-variant"] ?? "").sort();
    if (themes.join() !== [...THEMES].sort().join()) problems.push(`diagram ${i + 1} holds ${svgs.length} svg(s) (${themes.join(", ") || "none"}), not one per theme`);
    for (const svg of svgs) if (svg.attrs.id) ids.set(svg.attrs.id, (ids.get(svg.attrs.id) ?? 0) + 1);
  });
  for (const [id, count] of ids) if (count > 1) problems.push(`${count} diagrams share the svg id ${id}`);
  return problems;
}

/** The page as written, from a baked page: every place the bake changed goes back to what it replaced. */
export function restore(html) {
  if (!/<meta\b[^>]*\bname="dd-baked"/.test(html)) return html;
  const edits = [];
  for (const el of scan(html)) {
    const tag = html.slice(el.start, el.openEnd);
    const { attrs } = el;
    if (el.tag === "meta" && attrs.name === "dd-baked") edits.push({ start: el.start, end: el.openEnd, text: "" });
    else if (el.tag === "style" && "data-dd-inline" in attrs) edits.push({ start: el.start, end: el.end, text: attrs["data-dd-inline"] });
    else if (el.tag === "script" && "data-dd-inline" in attrs) edits.push({ start: el.start, end: el.end, text: "" });
    else if (el.tag === "script" && "data-dd-runtime-import" in attrs) {
      edits.push({ start: el.start, end: el.openEnd, text: setAttr(tag, "data-dd-runtime-import", null) });
      edits.push({ start: el.openEnd, end: el.closeStart, text: content(html, el).replace(RUNTIME_READ, () => attrs["data-dd-runtime-import"]) });
    } else if (el.tag === "script" && "data-dd-diagrams" in attrs) {
      edits.push({ start: el.start, end: el.openEnd, text: setAttr(tag, "type", "module") });
    } else if (el.tag === "pre" && hasClass(el, "mermaid") && "data-mermaid-source" in attrs) {
      edits.push({ start: el.start, end: el.openEnd, text: setAttr(setAttr(tag, "data-processed", null), "data-mermaid-source", null) });
      // The parser drops the first newline after <pre>, so write one: a source that starts with a blank line keeps it.
      edits.push({ start: el.openEnd, end: el.closeStart, text: `\n${escapeText(attrs["data-mermaid-source"])}` });
    } else if (el.tag === "div" && hasClass(el, "tablewrap") && "data-dd-inline" in attrs) {
      edits.push({ start: el.start, end: el.openEnd, text: "" }, { start: el.closeStart, end: el.end, text: "" });
    }
  }
  return splice(html, edits);
}

/** Where the files of design `version` come from: --assets, else this clone when it is that version, else jsDelivr. */
function designFiles(version, assets) {
  const why = (path) => (path.endsWith(".runtime.js") ? ` (design ${version} has no runtime file: 0.64.0 is the first; move the page into the current template)` : "");
  const local = (dir) => async (path) => {
    const file = join(dir, path);
    if (!existsSync(file)) throw new Refusal(`no ${path} in ${dir}${why(path)}`);
    return readFileSync(file, "utf8");
  };
  const fetched = async (url) => {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Refusal(`${url}: ${error.cause?.code ?? error.message}`);
    }
    if (!response.ok) throw new Refusal(`${url}: HTTP ${response.status}${why(url)}`);
    return response;
  };
  if (assets) {
    const have = JSON.parse(readFileSync(join(assets, "package.json"), "utf8")).version;
    if (have !== version) throw new Refusal(`--assets holds design ${have}, the page pins ${version}`);
    return {
      text: local(assets),
      font: async (url) => {
        const file = join(assets, "files", basename(new URL(url).pathname));
        if (!existsSync(file)) throw new Refusal(`no files/${basename(file)} in ${assets}`);
        return readFileSync(file);
      },
    };
  }
  const clone = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version === version;
  return {
    text: clone ? local(root) : async (path) => (await fetched(`${CDN}${version}/${path}`)).text(),
    font: async (url) => Buffer.from(await (await fetched(url)).arrayBuffer()),
  };
}

/** The characters a reader can see: the page without comments, scripts and styles, entities decoded. */
function pageText(html) {
  const cut = scan(html).filter((el) => (el.tag === "script" || el.tag === "style") && el.end !== undefined)
    .map((el) => ({ start: el.start, end: el.end, text: "" }));
  return unescape(splice(html, cut).replace(/<!--[\s\S]*?-->/g, ""));
}

const ranges = (spec) => spec.split(",").map((part) => {
  const [a, b = a] = part.trim().replace(/^U\+/i, "").split("-");
  return a.includes("?") ? [parseInt(a.replaceAll("?", "0"), 16), parseInt(a.replaceAll("?", "F"), 16)] : [parseInt(a, 16), parseInt(b, 16)];
});

/** fonts.css with only the faces whose unicode-range the text touches, each woff2 as a data: url. */
async function inlineFonts(css, text, font, notes) {
  const points = [...new Set(Array.from(text, (c) => c.codePointAt(0)))];
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)];
  const parts = [];
  let last = 0;
  let kept = 0;
  for (const m of faces) {
    parts.push(css.slice(last, m.index));
    last = m.index + m[0].length;
    const range = m[0].match(/unicode-range:\s*([^;]+);/)?.[1];
    if (range && !ranges(range).some(([a, b]) => points.some((p) => p >= a && p <= b))) continue;
    let face = m[0];
    for (const [, url] of m[0].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const bytes = await font(url);
      face = face.replace(url, () => `data:font/woff2;base64,${bytes.toString("base64")}`);
    }
    parts.push(face);
    kept += 1;
  }
  parts.push(css.slice(last));
  notes.push(`fonts: ${kept} of ${faces.length} faces`);
  return parts.join("");
}

/** Mermaid from a local package instead of jsDelivr (CI sets DD_MERMAID); every other request goes out as usual. */
async function mermaidFrom(browser, dir) {
  const types = { ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".map": "application/json" };
  browser.on("Fetch.requestPaused", ({ requestId, request }) => {
    const file = join(dir, new URL(request.url).pathname.replace(/^\/npm\/mermaid@[^/]+\//, ""));
    if (file.startsWith(dir + sep) && existsSync(file) && statSync(file).isFile()) {
      browser.send("Fetch.fulfillRequest", { requestId, responseCode: 200, body: readFileSync(file).toString("base64"), responseHeaders: [
        { name: "content-type", value: `${types[extname(file)] ?? "application/octet-stream"}; charset=utf-8` },
        { name: "access-control-allow-origin", value: "*" }] });
    } else {
      browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    }
  });
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "https://cdn.jsdelivr.net/npm/mermaid@*" }] });
}

/** Draws every diagram in every theme: → { sources: [..], warm: [svg|null, ..], green: [..], mono: [..], paper: [..] }. */
async function renderVariants(html, pageDir) {
  const { CHROME, launch, serve, sleep } = await import("./lib/chromium.mjs");
  if (!CHROME) throw new NoBrowser("the page has diagrams and this machine has no Chrome or Chromium (set DD_CHROME)");
  const server = await serve(resolve(pageDir), { "/__dd-bake.html": html });
  const browser = await launch("bake");
  try {
    if (process.env.DD_MERMAID) await mermaidFrom(browser, resolve(process.env.DD_MERMAID));
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: 'try { localStorage.setItem("anim", "off"); } catch {}' });
    await browser.navigate(`${server.origin}/__dd-bake.html`);
    for (let i = 0; !(await browser.evaluate("typeof window.ddRenderDiagrams === 'function'")); i += 1) {
      if (i > 600) throw new Refusal("the diagram script never ran: no window.ddRenderDiagrams after 30 s (did Mermaid load?)");
      await sleep(50);
    }
    // Every diagram at its real width: a closed fold or a hidden tab would give Mermaid a box it cannot measure.
    const sources = await browser.evaluate(`(async () => {
      for (const pre of document.querySelectorAll("pre.mermaid")) {
        for (let el = pre.parentElement; el; el = el.parentElement) {
          if (el.hidden) el.hidden = false;
          if (el.tagName === "DETAILS") el.open = true;
          if (getComputedStyle(el).display === "none") el.style.display = "block";
        }
      }
      try { await document.fonts.load('1em "JetBrains Mono Variable"'); } catch {}
      await document.fonts.ready;
      return [...document.querySelectorAll("pre.mermaid")].map((pre) => pre.dataset.mermaidSource);
    })()`);
    const drawn = { sources };
    for (const theme of THEMES) {
      drawn[theme] = await browser.evaluate(`(async () => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        await new Promise((ok) => setTimeout(ok, 0));
        return window.ddRenderDiagrams();
      })()`);
    }
    return drawn;
  } finally {
    browser.close();
    server.close();
  }
}

/** Bakes one page: → { html, notes }. Throws Refusal when the page cannot load nothing; NoBrowser when its diagrams need a browser this machine lacks. */
export async function bake(source, { assets = null, pageDir = process.cwd(), date = new Date().toISOString().slice(0, 10) } = {}) {
  let html = restore(source);
  const elements = scan(html);
  // The version is read where the bake replaces something: a stylesheet link and the runtime import. A design url quoted in a <code>, a <pre> or a comment is text.
  const pins = new Set();
  for (const el of elements) {
    const replaced = el.tag === "link" && /\bstylesheet\b/i.test(el.attrs.rel ?? "") ? [el.attrs.href ?? ""]
      : isActive(el) && el.end !== undefined ? [...content(html, el).matchAll(RUNTIME_IMPORT)].map((m) => m[0]) : [];
    for (const url of replaced) for (const m of url.matchAll(PIN)) pins.add(m[1]);
  }
  if (pins.size === 0) throw new Refusal("the page pins no danieldeusing-design version on jsDelivr");
  if (pins.size > 1) throw new Refusal(`the page pins more than one design version: ${[...pins].join(", ")}`);
  const [version] = pins;
  const files = designFiles(version, assets);
  const notes = [];
  const edits = [];

  // 1. The design CSS and fonts.css, in place of their links.
  const text = pageText(html);
  for (const el of elements) {
    if (el.tag !== "link" || !/\bstylesheet\b/i.test(el.attrs.rel ?? "")) continue;
    const href = el.attrs.href ?? "";
    let css;
    if (href === `${CDN}${version}/dist/danieldeusing-design.min.css`) css = await files.text("dist/danieldeusing-design.min.css");
    else if (href === `${CDN}${version}/src/fonts.css`) css = await inlineFonts(await files.text("src/fonts.css"), text, files.font, notes);
    else continue;
    if (/<\/style/i.test(css)) throw new Refusal(`${href} holds "</style", which would end the inlined block`);
    edits.push({ start: el.start, end: el.openEnd, text: `<style data-dd-inline="${escapeAttr(html.slice(el.start, el.openEnd))}">${css}</style>` });
  }

  // 2. The runtime records the page imports, in place of the import from jsDelivr.
  const names = new Set();
  let firstModule = null;
  for (const el of elements) {
    if (!isActive(el) || el.end === undefined) continue;
    if ((el.attrs.type ?? "").trim().toLowerCase() === "module") firstModule ??= el;
    const body = content(html, el);
    const imports = [...body.matchAll(RUNTIME_IMPORT)];
    if (!imports.length) continue;
    if (imports.length > 1) throw new Refusal(`the script at line ${lineOf(html, el.start)} imports the runtime twice`);
    const [statement, list] = imports[0];
    const imported = list.split(",").map((n) => n.trim()).filter(Boolean);
    imported.forEach((n) => names.add(n));
    edits.push({ start: el.start, end: el.openEnd, text: setAttr(html.slice(el.start, el.openEnd), "data-dd-runtime-import", statement) });
    edits.push({ start: el.openEnd, end: el.closeStart, text: body.replace(statement, () => `const { ${imported.join(", ")} } = globalThis.ddRuntime;`) });
  }
  if (names.size) {
    if (!firstModule) throw new Refusal("the runtime is imported outside a module script");
    const full = await files.text("dist/danieldeusing-design.runtime.js");
    let runtime;
    try {
      runtime = subsetRuntime(full, [...names]);
    } catch (error) {
      throw new Refusal(`the runtime of design ${version}: ${error.message}`);
    }
    edits.push({ start: firstModule.start, end: firstModule.start, text: `<script data-dd-inline>${runtime.replaceAll("</script", "<\\/script")}</script>` });
    const count = (t) => (t.match(/^\/\/@dd-record /gm) ?? []).length;
    notes.push(`runtime: ${count(runtime)} of ${count(full)} modules`);
  }

  // 3. A .tablewrap around each table, as initTableScroll() makes it, so a wide table scrolls in its box without JavaScript.
  let wrapped = 0;
  for (const el of elements) {
    if (el.tag !== "table" || el.end === undefined || inside(el, (p) => p.tag === "table" || hasClass(p, "tablewrap"))) continue;
    edits.push({ start: el.start, end: el.start, text: '<div class="tablewrap" data-dd-inline>' }, { start: el.end, end: el.end, text: "</div>" });
    wrapped += 1;
  }
  if (wrapped) notes.push(`${wrapped} table(s) wrapped`);
  html = splice(html, edits);

  // 4. The diagrams: each drawn once per theme in a browser. The data-dd-diagrams script becomes inert on every page that has one, with diagrams or without.
  const after = scan(html);
  const pres = after.filter((el) => el.tag === "pre" && hasClass(el, "mermaid"));
  const script = after.find((el) => el.tag === "script" && "data-dd-diagrams" in el.attrs);
  const diagramEdits = [];
  if (pres.length) {
    if (!script) throw new Refusal(`${pres.length} diagram(s) and no <script data-dd-diagrams>: move the page into the ${version} template first`);
    const drawn = await renderVariants(html, pageDir);
    if (drawn.sources.length !== pres.length) throw new Refusal(`the browser found ${drawn.sources.length} diagram(s), the page has ${pres.length}`);
    pres.forEach((pre, i) => {
      const svgs = THEMES.map((theme) => {
        const svg = drawn[theme]?.[i];
        if (!svg) throw new Refusal(`diagram ${i + 1} (${(drawn.sources[i] ?? "").trim().split("\n")[0].slice(0, 60)}) could not be drawn in the ${theme} theme`);
        const id = svg.match(/^<svg\b[^>]*?\sid="([^"]+)"/)?.[1];
        return (id ? svg.replaceAll(id, `dd-diagram-${i + 1}-${theme}`) : svg).replace(/^<svg\b/, `<svg data-theme-variant="${theme}"`);
      });
      const tag = setAttr(setAttr(html.slice(pre.start, pre.openEnd), "data-processed", "true"), "data-mermaid-source", drawn.sources[i]);
      diagramEdits.push({ start: pre.start, end: pre.openEnd, text: tag }, { start: pre.openEnd, end: pre.closeStart, text: svgs.join("") });
    });
    notes.push(`${pres.length} diagram(s), ${THEMES.length} themes each`);
  }
  if (script) diagramEdits.push({ start: script.start, end: script.openEnd, text: setAttr(html.slice(script.start, script.openEnd), "type", "text/plain") });
  html = splice(html, diagramEdits);

  // 5. The stamp, then everything a baked page must not hold.
  const charset = scan(html).find((el) => el.tag === "meta" && "charset" in el.attrs);
  const at = charset ? charset.openEnd : html.search(/<\/head>/i);
  html = `${html.slice(0, at)}<meta name="dd-baked" content="${version} ${date}" />${html.slice(at)}`;
  const problems = bakedProblems(html);
  if (problems.length) throw new Refusal(problems.join("; "));
  return { html, notes };
}

function fail(code, message) {
  console.error(`bake: ${message}`);
  process.exit(code);
}

async function main(argv) {
  const usage = "usage: node scripts/bake.mjs <page.html> [--out <file>] [--assets <dir>]";
  const args = [...argv];
  const option = (flag) => {
    const at = args.indexOf(flag);
    if (at < 0) return null;
    const value = args[at + 1] ?? "";
    args.splice(at, 2);
    return value;
  };
  const out = option("--out");
  const assets = option("--assets");
  if (args.length !== 1 || out === "" || assets === "") fail(2, usage);
  const page = resolve(args[0]);
  if (!existsSync(page)) fail(2, `no page at ${page}`);
  if (assets && !existsSync(join(assets, "package.json"))) fail(2, `--assets ${assets} holds no package.json`);
  setTimeout(() => fail(2, "no result after 120 s"), 120_000).unref();
  try {
    const { html, notes } = await bake(readFileSync(page, "utf8"), { assets: assets && resolve(assets), pageDir: dirname(page) });
    const target = out ? resolve(out) : page;
    writeFileSync(target, html);
    console.log(`bake: ${target} baked, ${Math.round(Buffer.byteLength(html) / 1024)} KB: ${notes.join("; ") || "nothing to inline"}`);
    return 0;
  } catch (error) {
    if (error instanceof Refusal) fail(1, `refused, ${page} left unchanged: ${error.message}`);
    if (error instanceof NoBrowser) fail(2, error.message);
    fail(2, error.stack ?? String(error));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(await main(process.argv.slice(2)));
}
