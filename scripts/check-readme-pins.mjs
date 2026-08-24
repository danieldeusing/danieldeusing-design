// check-readme-pins — the README's quick start must teach the CURRENT release, and must not
// teach the zoom that release removed.
//
// WHY: at 0.45.0 the README's primary quick start still pinned CSS, fonts and runtime to `0.1.2`
// and still told the reader to set `document.documentElement.style.zoom` pre-paint. Both were
// wrong in the same direction — `0.1.2` predates 0.29.0, which moved that scaling into CSS, so a
// page copied from the README scaled twice against any current stylesheet. The two most visible
// things a new surface copies were the two that were stale. (estate audit 2026-08-22, design-system)
//
//   node scripts/check-readme-pins.mjs
//
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const readme = readFileSync("README.md", "utf8");

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  PASS  ${m}`);

// ── 1. every pin names the current release ──────────────────────────────────────────────────────
const pins = [...readme.matchAll(/@danieldeusing\/design@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
if (pins.length === 0) {
  // An empty check is not a passing check.
  fail("no @danieldeusing/design@x.y.z pins found in README.md — the quick start changed shape, so");
  console.log("        this check is no longer looking at anything. Fix the pattern.");
} else {
  const stale = [...new Set(pins.filter((p) => p !== version))];
  if (stale.length) fail(`README pins ${stale.join(", ")} but package.json is ${version} (${pins.length} pin(s) total)`);
  else pass(`all ${pins.length} README pins name ${version}`);
}

// ── 2. no code block teaches the superseded zoom ─────────────────────────────────────────────────
// CODE ONLY. The prose under the quick start explains at length why the zoom is gone and quotes
// `document.documentElement.style.zoom` while doing it. A check that reads the warning as the
// offence is this estate's most repeated self-inflicted bug, so only fenced blocks are scanned.
const codeBlocks = [...readme.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
if (codeBlocks.length === 0) {
  fail("README.md has no fenced code blocks — the quick start is gone, or the fence style changed");
} else {
  const offending = codeBlocks.filter((b) => /style\s*\.\s*zoom\s*=/.test(b));
  if (offending.length) fail(`${offending.length} code block(s) assign style.zoom — superseded in 0.29.0, and a page that does it scales twice`);
  else pass(`none of the ${codeBlocks.length} code blocks assign style.zoom`);
}

console.log();
if (failures) { console.log(`\x1b[31m-- check-readme-pins: ${failures} FAILED --\x1b[0m`); process.exit(1); }
console.log("\x1b[32m-- check-readme-pins: all checks passed --\x1b[0m");
