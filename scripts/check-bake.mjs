/*
 * check-bake.mjs — scripts/bake.mjs on pages made from the templates (0.64.0).
 *
 * The fixtures are the documentation template itself (one diagram, one table), the template without
 * its diagrams, and small changes that break one rule each. The design files come from a folder built
 * from this checkout (--assets), with two stand-in woff2 files whose bytes say which face is which, so
 * the check needs no release and no network. The diagrams need a browser, and Mermaid from DD_MERMAID
 * (CI) or jsDelivr.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bakedProblems, remoteLoads, restore, THEMES } from "./bake.mjs";
import { CHROME, reporter } from "./lib/chromium.mjs";
import { hasClass, scan } from "./lib/tags.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { check, done } = reporter("check-bake");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const work = mkdtempSync(join(tmpdir(), "dd-bake-check-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));

const assets = join(work, "assets");
for (const dir of ["dist", "src", "files"]) mkdirSync(join(assets, dir), { recursive: true });
for (const file of ["package.json", "dist/danieldeusing-design.min.css", "dist/danieldeusing-design.runtime.js", "src/fonts.css"]) {
  copyFileSync(join(root, file), join(assets, file));
}
writeFileSync(join(assets, "files", "jetbrains-mono-latin-wght-normal.woff2"), "LATIN-FACE");
writeFileSync(join(assets, "files", "jetbrains-mono-latin-ext-wght-normal.woff2"), "LATIN-EXT-FACE");
const b64 = (s) => Buffer.from(s).toString("base64");

// The template as a page: every placeholder filled, the pins on this checkout's version.
const pinned = (html) => html
  .replaceAll(/\{\{[A-Z0-9_]+\}\}/g, "x")
  .replaceAll(/@danieldeusing\/design@\d+\.\d+\.\d+\//g, `@danieldeusing/design@${version}/`)
  .replaceAll(/danieldeusing-design-\d+\.\d+\.\d+\./g, `danieldeusing-design-${version}.`);
const template = pinned(readFileSync(join(root, "templates", "documentation.html"), "utf8"));
const withoutDiagrams = template
  .replace(/<script type="module" data-dd-diagrams>[\s\S]*?<\/script>/, "")
  .replaceAll(/<pre class="mermaid">[\s\S]*?<\/pre>/g, "");

const bakeFile = (name, html, from = assets) => {
  const file = join(work, name);
  writeFileSync(file, html);
  const run = spawnSync(process.execPath, [join(root, "scripts", "bake.mjs"), file, "--assets", from], { encoding: "utf8" });
  return { file, code: run.status, out: run.stdout + run.stderr, text: readFileSync(file, "utf8") };
};
const unstamped = (html) => html.replace(/<meta name="dd-baked" content="[^"]*" \/>/, "");

// ── without diagrams: no browser ─────────────────────────────────────────────────────────────────
const plain = bakeFile("plain.html", withoutDiagrams);
await check("a page without diagrams bakes with no browser (exit 0)", () => plain.code === 0, () => plain.out);
await check("...and loads nothing remote", () => remoteLoads(plain.text).length === 0, () => remoteLoads(plain.text).join("; "));
await check("...and carries the design CSS and fonts.css as <style data-dd-inline>, each keeping the <link> it replaced", () => {
  const styles = scan(plain.text).filter((el) => el.tag === "style" && "data-dd-inline" in el.attrs);
  return styles.length === 2 && styles.every((el) => el.attrs["data-dd-inline"].startsWith("<link"));
});
await check("...and keeps only the latin face for a page in latin characters", () =>
  plain.text.includes(b64("LATIN-FACE")) && !plain.text.includes(b64("LATIN-EXT-FACE")));
await check("...and reads the runtime from globalThis.ddRuntime, the import kept in data-dd-runtime-import", () =>
  /const \{[^}]*initTableScroll[^}]*\} = globalThis\.ddRuntime;/.test(plain.text) && plain.text.includes('data-dd-runtime-import="import {'));
await check("...and inlines only the runtime records the page imports (diagramzoom and dialog, not tabs)", () =>
  plain.text.includes("//@dd-record diagramzoom deps=dialog") && plain.text.includes("//@dd-record dialog ") && !plain.text.includes("//@dd-record tabs "));
await check("...and puts the runtime before the first module script", () => {
  const runtimeAt = plain.text.indexOf("<script data-dd-inline>");
  return runtimeAt > -1 && runtimeAt < plain.text.indexOf('<script type="module"');
});
await check("...and wraps each table in a .tablewrap", () => {
  const tables = scan(plain.text).filter((el) => el.tag === "table");
  return tables.length > 0 && tables.every((t) => t.parent && hasClass(t.parent, "tablewrap"));
});
await check(`...and is stamped dd-baked ${version}`, () =>
  new RegExp(`<meta name="dd-baked" content="${version.replaceAll(".", "\\.")} \\d{4}-\\d{2}-\\d{2}" />`).test(plain.text));
await check("restoring the baked page gives the page as written, byte for byte", () => restore(plain.text) === withoutDiagrams);
const again = bakeFile("plain-again.html", plain.text);
await check("baking the baked page again gives the same file", () => again.code === 0 && unstamped(again.text) === unstamped(plain.text));
const extended = bakeFile("extended.html", withoutDiagrams.replace("<h1", "<p>Łódź</p><h1"));
await check("a page with a latin-ext character keeps both faces", () =>
  extended.text.includes(b64("LATIN-FACE")) && extended.text.includes(b64("LATIN-EXT-FACE")));
await check("a character reference above U+10FFFF or a lone surrogate reads as U+FFFD, as in a browser: scan() does not throw", () => {
  const { attrs } = scan('<p data-a="&#99999999;" data-b="&#xD800;" data-c="&#65;">x</p>')[0];
  return attrs["data-a"] === "�" && attrs["data-b"] === "�" && attrs["data-c"] === "A";
});

// ── what is not a load ───────────────────────────────────────────────────────────────────────────
const harmless = bakeFile("harmless.html", withoutDiagrams.replace("</h1>", `</h1>
  <p><a href="https://example.com/">a link</a> <code>https://example.com/x.js</code></p>
  <pre>import x from "https://example.com/x.js"</pre>
  <script type="text/plain">import y from "https://example.com/y.js";</script>
  <svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>
  <img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />`));
await check("a link, code, a pre, a text/plain script, an xmlns and a data: url are not loads", () => harmless.code === 0, () => harmless.out);
const quoted = bakeFile("quoted.html", withoutDiagrams.replace("</h1>", `</h1>
  <p><code>https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.41.1/dist/danieldeusing-design.min.css</code></p>
  <pre>import { initTabs } from "https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.39.0/runtime/index.js";</pre>
  <!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@danieldeusing/design@0.40.0/src/fonts.css" /> -->`));
await check("a design url quoted in a <code>, a <pre> or a comment is text, not a pin: the page bakes and keeps it", () =>
  quoted.code === 0 && quoted.text.includes("design@0.41.1/dist/danieldeusing-design.min.css</code>")
  && quoted.text.includes('design@0.39.0/runtime/index.js";</pre>') && quoted.text.includes("design@0.40.0/src/fonts.css"), () => quoted.out);
const scriptKept = template.replaceAll(/<pre class="mermaid">[\s\S]*?<\/pre>/g, "");
const scriptOnly = bakeFile("script-only.html", scriptKept);
await check("a page whose diagram was removed but whose diagram script was kept bakes with no browser: the script inert, nothing remote left", () =>
  scriptOnly.code === 0 && /<script type="text\/plain" data-dd-diagrams>/.test(scriptOnly.text) && remoteLoads(scriptOnly.text).length === 0
  && restore(scriptOnly.text) === scriptKept, () => scriptOnly.out);

// ── refusals: exit 1, the message names the cause, the file as it was ────────────────────────────
const refusals = [
  ["an <img> from the network", withoutDiagrams.replace("</h1>", '</h1><img alt="" src="https://example.com/a.png" />'), "example.com/a.png"],
  ["a script src from the network", withoutDiagrams.replace("</h1>", '</h1><script src="//example.com/a.js"></script>'), "example.com/a.js"],
  ["an @import in a style block", withoutDiagrams.replace("</style>", '@import url("https://example.com/a.css");</style>'), "example.com/a.css"],
  ["an @import written without a space, as minified CSS writes it", withoutDiagrams.replace("</style>", '@import"https://example.com/g.css";</style>'), "example.com/g.css"],
  ["a url() in a style attribute", withoutDiagrams.replace("</h1>", "</h1><p style=\"background: url('https://example.com/b.png')\">x</p>"), "example.com/b.png"],
  ["an import in an active module script", withoutDiagrams.replace("</body>", '<script type="module">import z from "https://example.com/z.js";</script></body>'), "example.com/z.js"],
  ["an import() in an active module script", withoutDiagrams.replace("</body>", '<script type="module">await import("https://example.com/f.js");</script></body>'), "example.com/f.js"],
  ["an import() with a backtick url in an active module script", withoutDiagrams.replace("</body>", '<script type="module">await import(`https://example.com/h.js`);</script></body>'), "example.com/h.js"],
  ["a srcset from the network", withoutDiagrams.replace("</h1>", '</h1><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" srcset="https://example.com/c.png 2x" />'), "example.com/c.png"],
  ["an <object data> from the network", withoutDiagrams.replace("</h1>", '</h1><object data="https://example.com/d.svg"></object>'), "example.com/d.svg"],
  ["a <link rel=icon> from the network", withoutDiagrams.replace("</head>", '<link rel="icon" href="https://example.com/e.ico" /></head>'), "example.com/e.ico"],
  ["a page that pins no design version", withoutDiagrams.replaceAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/@danieldeusing\/design@[\d.]+\//g, "/x/"), "pins no danieldeusing-design version"],
  ["a page that pins two versions", withoutDiagrams.replace(`design@${version}/src/fonts.css`, "design@0.1.0/src/fonts.css"), "more than one design version"],
  ["a diagram without a data-dd-diagrams script", template.replace(/<script type="module" data-dd-diagrams>[\s\S]*?<\/script>/, ""), "no <script data-dd-diagrams>"],
];
for (const [what, html, needle] of refusals) {
  const result = bakeFile("refused.html", html);
  await check(`refuses ${what}: exit 1, the message names it, the file unchanged`, () =>
    result.code === 1 && result.out.includes(needle) && result.text === html, () => `exit ${result.code}: ${result.out.trim()}`);
}
const otherVersion = bakeFile("other.html", withoutDiagrams.replaceAll(`@danieldeusing/design@${version}/`, "@danieldeusing/design@0.1.0/"));
await check("refuses --assets of another version than the page pins", () =>
  otherVersion.code === 1 && otherVersion.out.includes("--assets holds design"), () => otherVersion.out);
const runtimeless = join(work, "assets-without-runtime");
cpSync(assets, runtimeless, { recursive: true });
rmSync(join(runtimeless, "dist", "danieldeusing-design.runtime.js"));
const noRuntime = bakeFile("no-runtime.html", withoutDiagrams, runtimeless);
await check("refuses a pinned version without the runtime file: exit 1, the message names it, the file unchanged", () =>
  noRuntime.code === 1 && noRuntime.out.includes("has no runtime file") && noRuntime.text === withoutDiagrams, () => noRuntime.out);
await check("bakedProblems: two diagrams that share an svg id", () => {
  const svgs = (id) => THEMES.map((t) => `<svg data-theme-variant="${t}" id="${id}"></svg>`).join("");
  return bakedProblems(`<pre class="mermaid">${svgs("same")}</pre><pre class="mermaid">${svgs("same")}</pre>`).some((p) => p.includes("share the svg id same"));
});
await check("bakedProblems: a diagram without its four theme variants", () =>
  bakedProblems('<pre class="mermaid"><svg data-theme-variant="warm"></svg></pre>').some((p) => p.includes("not one per theme")));
const images = ['<svg><image href="https://example.com/i.png" /></svg>', '<svg><image xlink:href="https://example.com/i.png" /></svg>',
  '<svg><image href="data:image/gif;base64,R0lGODlhAQABAAAAACw=" /></svg>'];
await check("an svg <image> with a remote href or xlink:href is a load, one with a data: href is not", () =>
  images.map((html) => remoteLoads(html).length).join() === "1,1,0", () => `loads found: ${images.map((html) => remoteLoads(html).length).join()}, want 1,1,0`);
const named = remoteLoads('<img alt="" src="https://example.com/a.png" /><p style="background: url(https://example.com/b.png)">x</p>');
await check("a load is named by its element and url, with no line number", () =>
  named.join("|") === "<img>: https://example.com/a.png|<p> style: https://example.com/b.png", () => named.join("|"));

// ── the workflows: the comments on the borrowed mermaid name this check ──────────────────────────
const commentBlocks = (text) => text.match(/(?:^[ \t]*#.*(?:\n|$))+/gm) ?? [];
const mermaidComments = (flow) => commentBlocks(readFileSync(join(root, ".github", "workflows", flow), "utf8")).filter((block) => /mermaid/i.test(block));
for (const flow of ["ci.yml", "release.yml"]) {
  await check(`${flow}: every comment that mentions the borrowed mermaid names check-bake`, () => {
    const blocks = mermaidComments(flow);
    return blocks.length > 0 && blocks.every((block) => block.includes("check-bake"));
  }, () => mermaidComments(flow).filter((block) => !block.includes("check-bake")).map((block) => block.trim().split("\n")[0].trim()));
}

// ── diagrams: a browser draws them ───────────────────────────────────────────────────────────────
if (!CHROME) {
  console.log("      the diagram half SKIPPED — no headless chromium on this machine.");
  if (process.env.DD_REQUIRE_BROWSER === "1") await check("DD_REQUIRE_BROWSER=1: a browser for the diagrams", () => false);
  done();
}
const drawn = bakeFile("diagrams.html", template);
const pres = scan(drawn.text).filter((el) => el.tag === "pre" && hasClass(el, "mermaid"));
const svgsOf = (html, pre) => scan(html).filter((el) => el.tag === "svg" && el.parent?.start === pre.start);
await check("the template bakes with its diagram drawn (exit 0)", () => drawn.code === 0, () => drawn.out);
await check("...each diagram holds one svg per theme, renamed dd-diagram-<n>-<theme>", () =>
  pres.length === 1 && pres.every((pre, i) => THEMES.every((t) =>
    svgsOf(drawn.text, pre).some((svg) => svg.attrs["data-theme-variant"] === t && svg.attrs.id === `dd-diagram-${i + 1}-${t}`))));
const distinct = (pre) => new Set(svgsOf(drawn.text, pre).map((svg) =>
  drawn.text.slice(svg.start, svg.end).replaceAll(svg.attrs.id, "").replace(/ data-theme-variant="[^"]*"/, ""))).size;
await check("...and the four variants differ once their ids are removed: each was drawn in its own theme", () =>
  pres.every((pre) => distinct(pre) === THEMES.length), () => pres.map((pre) => `${distinct(pre)} distinct of ${THEMES.length}`).join(", "));
// Distinct is not enough: variants drawn in each other's themes also differ. Each theme's --card is the node fill Mermaid gets.
const { themes: tokens } = JSON.parse(readFileSync(join(root, "tokens", "tokens.json"), "utf8"));
const strangers = (pre) => THEMES.filter((t) => !svgsOf(drawn.text, pre).some((svg) =>
  svg.attrs["data-theme-variant"] === t && drawn.text.slice(svg.start, svg.end).toLowerCase().includes(tokens[t].card.toLowerCase())));
await check("...and each variant holds its own theme's --card colour (tokens/tokens.json), so none was drawn in another theme", () =>
  pres.every((pre) => strangers(pre).length === 0), () => pres.map((pre) => `without their own --card: ${strangers(pre).join(", ")}`).join("; "));
await check("...keeps its source in data-mermaid-source and is marked data-processed", () =>
  pres.every((pre) => pre.attrs["data-mermaid-source"]?.includes("flowchart") && pre.attrs["data-processed"] === "true"));
await check("...and the diagram script is inert text", () =>
  /<script type="text\/plain" data-dd-diagrams>/.test(drawn.text) && !/<script type="module" data-dd-diagrams>/.test(drawn.text));
await check("...and nothing remote is left", () => remoteLoads(drawn.text).length === 0, () => remoteLoads(drawn.text).join("; "));
const redrawn = bakeFile("diagrams-again.html", drawn.text);
await check("baking the baked template again gives the same file", () => redrawn.code === 0 && unstamped(redrawn.text) === unstamped(drawn.text),
  () => `exit ${redrawn.code}: ${redrawn.out.trim()}`);
const blank = bakeFile("blank.html", template.replace('<pre class="mermaid">', '<pre class="mermaid">\n'));
const blankAgain = bakeFile("blank-again.html", blank.text);
await check("a diagram that starts with a blank line gives the same file on a second bake", () =>
  blank.code === 0 && blankAgain.code === 0 && unstamped(blankAgain.text) === unstamped(blank.text),
  () => `exit ${blank.code}/${blankAgain.code}: ${blank.out.trim()} ${blankAgain.out.trim()}`);
const two = bakeFile("two.html", template.replace(/(<pre class="mermaid">[\s\S]*?<\/pre>)/, "$1\n$1"));
await check("two diagrams get eight svgs with eight different ids", () => {
  const ids = scan(two.text).filter((el) => el.tag === "svg" && el.parent?.tag === "pre").map((el) => el.attrs.id);
  return two.code === 0 && ids.length === 8 && new Set(ids).size === 8;
}, () => two.out);
const broken = template.replace(/<pre class="mermaid">[\s\S]*?<\/pre>/, '<pre class="mermaid">flowchart LR\n  A --&gt;</pre>');
const unparsable = bakeFile("broken.html", broken);
await check("a diagram Mermaid cannot draw is refused, the file unchanged", () =>
  unparsable.code === 1 && unparsable.out.includes("could not be drawn") && unparsable.text === broken, () => unparsable.out);
done();
