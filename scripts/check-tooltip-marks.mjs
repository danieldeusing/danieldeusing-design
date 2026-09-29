// check-tooltip-marks — a [data-tip] host must look EXACTLY like the same element without a
// tooltip. This package may not ship a marker of any kind.
//
// WHY: the estate settled this twice and lost it once, in the one place nobody was looking. The ⓘ
// glyph went in 0.45.0 and the dotted underline before it, and every CONSUMING surface is swept for
// locally-drawn indicators — bin/cockpit-render-check (in danieldeusing-infra) fails a page that
// draws its own, naming `cursor: help` alongside the glyph and the underline. Nothing checked THIS
// end. So for a week the rule was enforced on every consumer and violated by the thing they all
// load: `[data-tip] { cursor: help }` sat in tooltip.css while every page was clean, and every
// tipped element in the estate still wore a marker. A rule policed on one side of a boundary is not
// policed. Removed in 0.49.0 (Daniel: "No cursor help"); this is what stops it coming back.
//
// WHAT COUNTS. EVERY stylesheet the package ships — each src/*.css file, read from the source.
// Until 0.60.0 this read dist/danieldeusing-design.css, the built bundle, on the reasoning that a
// marker can arrive from any layer and a surface renders the compiled file. Both halves hold for the
// source set and it has neither blind spot the bundle had: the bundle is only rebuilt at release
// (check-release.mjs holds it equal to src/ there), so on a branch it reported on the LAST release
// rather than the change in front of it; and it holds only what index.css imports, so a new file not
// yet wired in (overlays.css, before integration) was not read at all. Comments are stripped first,
// because this package carries several paragraphs explaining why the cursor was removed and every
// one of them contains the words this looks for — a checker satisfied (or broken) by prose reports
// on documentation.
//
// It walks RULE BLOCKS rather than matching a pattern across the file. That is not fastidious: the
// sibling check in danieldeusing-infra was first written as one regex spanning selector-to-body and
// reported this package's own opt-out rule as a marker, because `[^{}]*` slid across a comma into the
// next selector. A checker whose first act is a false positive teaches people to stop running it.
//
// WHAT FAILS, since 0.60.0:
//   · `cursor: help` on ANY selector. It IS the marker, a page may not draw one, so the package must
//     not hand one out anywhere.
//   · ANY rule keyed off `[data-tip]`, whatever it declares. Until 0.60.0 a `content: none` opt-out
//     (`.minimap-bar[data-tip]::after`, `[data-tip-bare]`) was allowed; the opt-outs went with the
//     last reason for them, so a tipped element is now styled exactly as the same element untipped,
//     and any selector naming the attribute is a way for the two to differ.
//
//   node scripts/check-tooltip-marks.mjs
//
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  PASS  ${m}`);

const files = readdirSync(SRC).filter((f) => f.endsWith(".css")).sort();
const declares = (body, prop) =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(body);

const problems = [];
let panelRules = 0;
for (const file of files) {
  // Blank comments rather than delete them, so reported line numbers still point at the real line.
  const css = readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
  const lineOf = (index) => css.slice(0, index).split("\n").length;
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    const body = rule[2];
    const where = `src/${file}:${lineOf(rule.index + rule[0].indexOf(rule[1].trim()))}`;
    if (/#ddtip\b/.test(selector)) panelRules++;
    const cursor = declares(body, "cursor");
    if (cursor && /^\s*help\b/i.test(cursor[1])) {
      problems.push(`${where} — \`cursor: help\` on \`${selector.slice(0, 70)}\`: a marker you feel instead of see`);
    }
    if (/\[data-tip\b/.test(selector)) {
      problems.push(`${where} — a rule keyed off [data-tip] (\`${selector.slice(0, 70)}\`): a tipped element must be styled exactly as the same element untipped, and the 0.59.0 opt-outs are gone`);
    }
  }
}

// A sweep that finds no panel rules has stopped checking rather than started passing: the tooltip
// layer (or the directory this reads) would have to be missing.
if (!panelRules) {
  fail(`no #ddtip rule in src/*.css (${files.length} files read) — the tooltip layer is missing, so this check verified nothing`);
} else {
  pass(`${files.length} stylesheets read, ${panelRules} #ddtip rule(s) among them — the tooltip layer is there to check`);
}

if (problems.length) {
  for (const detail of problems) fail(detail);
} else {
  pass("no tooltip marker in the package: no cursor: help anywhere, and no rule keyed off [data-tip]");
}

console.log();
if (failures) { console.log(`\x1b[31m-- check-tooltip-marks: ${failures} FAILED --\x1b[0m`); process.exit(1); }
console.log("\x1b[32m-- check-tooltip-marks: all checks passed --\x1b[0m");
