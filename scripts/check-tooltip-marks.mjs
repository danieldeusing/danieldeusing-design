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
// WHAT COUNTS. The BUILT bundle, not the source: a marker can arrive from any layer, and what a
// surface renders is the compiled file. Comments are stripped first, because this package now
// carries several paragraphs explaining why the cursor was removed and every one of them contains
// the words this looks for — a checker satisfied (or broken) by prose reports on documentation.
//
// It walks RULE BLOCKS rather than matching a pattern across the file. That is not fastidious: the
// sibling check in danieldeusing-infra was first written as one regex spanning selector-to-body and
// reported this package's own `[data-tip]::after, [data-tip][data-tip-bare]::after { content: none }`
// — the deliberate opt-OUT — because `[^{}]*` slid across a comma into the next selector. A checker
// whose first act is a false positive teaches people to stop running it.
//
//   node scripts/check-tooltip-marks.mjs
//
import { readFileSync } from "node:fs";

const BUNDLE = "dist/danieldeusing-design.css";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  PASS  ${m}`);

let raw;
try {
  raw = readFileSync(BUNDLE, "utf8");
} catch (error) {
  // Not a soft skip. An unreadable bundle means this check verified nothing, and a check that
  // silently verifies nothing is worse than an absent one — it reports green.
  console.log(`  FAIL  cannot read ${BUNDLE} (${error.code}) — run scripts/build.mjs first`);
  console.log(`\n\x1b[31m-- check-tooltip-marks: 1 FAILED --\x1b[0m`);
  process.exit(1);
}

// Blank comments rather than delete them, so reported line numbers still point at the real line.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
const lineOf = (index) => css.slice(0, index).split("\n").length;
const declares = (body, prop) =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(body);

const problems = [];
let tipRules = 0;
for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = rule[1];
  const body = rule[2];
  const cursor = declares(body, "cursor");

  // `cursor: help` is refused ANYWHERE, not only on a [data-tip]. It IS the marker, a page may not
  // draw one, so the package must not hand one out on any selector.
  if (cursor && /^\s*help\b/i.test(cursor[1])) {
    problems.push([lineOf(rule.index), `\`cursor: help\` on \`${selector.trim().slice(0, 70)}\` — a marker you feel instead of see`]);
  }

  if (!selector.includes("[data-tip]")) continue;
  tipRules++;

  // Any cursor keyed off [data-tip] is the same fault wearing a different value: it makes a tipped
  // control differ from an untipped one. `.minimap-bar[data-tip] { cursor: pointer }` was exactly
  // that, and existed only to out-specify the `help` above — both went in 0.49.0.
  if (cursor && !/^\s*help\b/i.test(cursor[1])) {
    problems.push([lineOf(rule.index), `\`cursor: ${cursor[1].trim()}\` keyed off [data-tip] — whatever the value, a tipped element must not differ from an untipped one. Put the cursor on the element's own selector.`]);
  }

  // `content: none` is how a host opts OUT and must stay allowed — it is the removal, not the mark.
  const content = declares(body, "content");
  if (/::(?:after|before)/.test(selector) && content && !/^\s*none\b/i.test(content[1])) {
    problems.push([lineOf(rule.index), `a ::after/::before on a [data-tip] host rendering \`${content[1].trim()}\` — the ⓘ glyph, removed in 0.45.0`]);
  }

  const underline = declares(body, "border-bottom");
  if (underline && !/^\s*(?:none|0)\b/i.test(underline[1])) {
    problems.push([lineOf(rule.index), `\`border-bottom: ${underline[1].trim()}\` keyed off [data-tip] — the dotted underline, dropped before the glyph was`]);
  }
}

// A sweep that finds no [data-tip] rules at all has stopped checking rather than started passing:
// the tooltip layer would have to be missing from the bundle entirely.
if (!tipRules) {
  fail(`${BUNDLE} contains no [data-tip] rules at all — the tooltip layer is missing from the build, so this check verified nothing`);
} else {
  pass(`${tipRules} [data-tip] rule(s) in the bundle to check`);
}

if (problems.length) {
  for (const [line, detail] of problems) fail(`${BUNDLE}:${line} — ${detail}`);
} else {
  pass("no tooltip marker in the package: no cursor: help, no cursor/::after/border-bottom keyed off [data-tip]");
}

console.log();
if (failures) { console.log(`\x1b[31m-- check-tooltip-marks: ${failures} FAILED --\x1b[0m`); process.exit(1); }
console.log("\x1b[32m-- check-tooltip-marks: all checks passed --\x1b[0m");
