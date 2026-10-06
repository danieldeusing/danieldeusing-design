/*
 * check-runtime-bundle.mjs — dist/danieldeusing-design.runtime.js against runtime/index.js (0.64.0).
 *
 * A baked page runs the runtime file instead of importing the 28 modules from jsDelivr, so every
 * export of runtime/index.js must be on globalThis.ddRuntime with the same type, and a subset must
 * hold what it was asked for plus the modules those import. The build's refusals are checked too:
 * each form it does not handle fails the build with its file and line, instead of shipping a bundle
 * that silently lacks the module.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHROME, launch, reporter, serve } from "./lib/chromium.mjs";
import { buildRuntime, subsetRuntime } from "./lib/runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { check, done } = reporter("check-runtime-bundle");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const bundle = readFileSync(join(root, "dist", "danieldeusing-design.runtime.js"), "utf8");

await check("dist/danieldeusing-design.runtime.js is what the build makes from runtime/ (run npm run build)", () =>
  bundle === buildRuntime(join(root, "runtime"), version));

// Each refusal on a small runtime in a temporary directory: the message names the file and line.
const refuses = (files, needle) => {
  const dir = mkdtempSync(join(tmpdir(), "dd-runtime-"));
  try {
    writeFileSync(join(dir, "index.js"), Object.keys(files).map((f) => `export * from "./${f}";`).join("\n") + "\n");
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
    buildRuntime(dir, "0.0.0");
    return false;
  } catch (error) {
    return error.message.includes(needle);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
await check("the build refuses `export default`, with its file and line", () =>
  refuses({ "a.js": "export function a() {}\nexport default a;\n" }, "runtime/a.js:2"));
await check("the build refuses `import()`", () =>
  refuses({ "a.js": 'export function a() { return import("./b.js"); }\n', "b.js": "export const b = 1;\n" }, "runtime/a.js:1"));
await check("the build refuses `import.meta`", () =>
  refuses({ "a.js": "export const a = import.meta.url;\n" }, "runtime/a.js:1"));
await check("the build refuses an import of a name the other module does not export", () =>
  refuses({ "a.js": 'import { c } from "./b.js";\nexport const a = c;\n', "b.js": "export const b = 1;\n" }, "exports no c"));
await check("the build refuses an import cycle", () =>
  refuses({ "a.js": 'import { b } from "./b.js";\nexport const a = 1;\n', "b.js": 'import { a } from "./a.js";\nexport const b = 2;\n' }, "an import cycle"));
await check("subsetRuntime refuses a name the runtime does not export", () => {
  try { subsetRuntime(bundle, ["noSuchInit"]); return false; } catch (error) { return error.message.includes("noSuchInit"); }
});

if (!CHROME) {
  console.log("      the browser half SKIPPED — no headless chromium on this machine.");
  if (process.env.DD_REQUIRE_BROWSER === "1") await check("DD_REQUIRE_BROWSER=1: a browser for the comparison", () => false);
  done();
}

const subset = subsetRuntime(bundle, ["initDiagramZoom"]);
const harness = (script) => `<!doctype html><meta charset="utf-8"><script>${script.replaceAll("</script", "<\\/script")}</script>
<script type="module">
  import * as modules from "/runtime/index.js";
  const types = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, typeof o[k]]));
  window.result = { modules: types(modules), bundle: types(globalThis.ddRuntime ?? {}) };
</script>`;
const server = await serve(root, { "/__full.html": harness(bundle), "/__subset.html": harness(subset) });
const browser = await launch("runtime-bundle");
try {
  await browser.navigate(`${server.origin}/__full.html`);
  await browser.until("window.result");
  const full = await browser.evaluate("window.result");
  await check(`every export of runtime/index.js is on ddRuntime with the same type (${Object.keys(full.modules).length} exports)`,
    () => JSON.stringify(full.bundle) === JSON.stringify(full.modules),
    () => ({ missing: Object.keys(full.modules).filter((k) => full.bundle[k] !== full.modules[k]), extra: Object.keys(full.bundle).filter((k) => !(k in full.modules)) }));
  await browser.navigate(`${server.origin}/__subset.html`);
  await browser.until("window.result");
  const part = await browser.evaluate("window.result");
  await check("a subset for initDiagramZoom holds it and openDialog, which diagramzoom imports, and nothing of tabs", () =>
    part.bundle.initDiagramZoom === "function" && part.bundle.openDialog === "function" && !("initTabs" in part.bundle),
    () => Object.keys(part.bundle).join(", "));
  await check("the subset is less than a quarter of the whole file", () => subset.length < bundle.length / 4,
    () => `${subset.length} of ${bundle.length} bytes`);
} finally {
  browser.close();
  server.close();
}
done();
