import { readFileSync } from "node:fs";

// check-release-gate — the release workflow must run every suite CI runs, before it publishes.
//
// WHY: the push IS the release (npm Trusted Publishing on push to main), so release.yml is the
// only thing between a commit and a published package. Until 2026-08-24 it ran no suite at all
// while ci.yml ran three — two copies of "what green means" with nothing comparing them, which is
// this estate's most repeated bug shape. (audit design-system #1)
//
// This is the comparison. It is a source check, so it costs nothing and runs anywhere.

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");

const suites = (text) => [...text.matchAll(/node scripts\/(check-[a-z-]+)\.mjs/g)].map((m) => m[1]);

// `run: `, not just the string: the file's own header comment explains npm publish, and
// matching that put the boundary at the top of the file so every suite looked ungated.
// A check satisfied by prose about the thing it is checking is this estate's house bug.
const publishAt = release.search(/^\s*run: npm publish/m);
if (publishAt === -1) throw new Error("check-release-gate: no `npm publish` in release.yml — this check is looking at the wrong file");

const gated = new Set(suites(release.slice(0, publishAt)));
const required = new Set(suites(ci));

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  PASS  ${msg}`);

for (const suite of [...required].sort()) {
  if (gated.has(suite)) pass(`${suite} runs before publish`);
  else fail(`${suite} runs in ci.yml but NOT before publish in release.yml — a red ${suite} would publish anyway`);
}

// A DOM suite that cannot find a browser exits 0 with "SKIPPED". Listing it above is therefore not
// enough: without DD_REQUIRE_BROWSER=1 the gate is present and empty, which is worse than absent.
for (const [file, text] of [["ci.yml", ci], ["release.yml", release]]) {
  for (const suite of ["check-tabletools", "check-tablescroll"]) {
    if (!text.includes(suite)) continue;
    const near = text.slice(Math.max(0, text.indexOf(suite) - 900), text.indexOf(suite) + 200);
    if (near.includes("DD_REQUIRE_BROWSER")) pass(`${file}: ${suite} cannot silently skip`);
    else fail(`${file}: ${suite} has no DD_REQUIRE_BROWSER=1 — on a Linux runner it skips and proves nothing`);
  }
}

console.log();
if (failures) { console.log(`\x1b[31m-- check-release-gate: ${failures} FAILED --\x1b[0m`); process.exit(1); }
console.log("\x1b[32m-- check-release-gate: all checks passed --\x1b[0m");
