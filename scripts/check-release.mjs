#!/usr/bin/env node
/*
 * check-release.mjs — refuse to ship an incoherent release.
 *
 * Two machines publish this package. Twice in one day (2026-08-07) both wrote the
 * SAME version number: ddAir published 0.11.0 while ddStudio was writing 0.11.0
 * locally, and the collision only surfaced as a rejected push, long after the
 * CHANGELOG entry and the template pin had been written against the wrong number.
 * Renumbering afterwards means editing package.json, the CHANGELOG heading, the
 * commit message and every pin in the template — four places, by hand, under the
 * impression that the work is already finished. That is the failure this prevents.
 *
 * A version number is not a local decision: npm already knows which ones are gone,
 * and `git ls-remote` knows which ones are tagged. So ask, before committing to one.
 *
 * Checks, in order of how badly each one bites:
 *   1. the version is not already ON NPM        — an immutable, worldwide fact
 *   2. the version is not already TAGGED on origin
 *   3. the CHANGELOG has a heading for it
 *   4. every pin in templates/ matches it
 *   5. dist/ is what src/ currently builds to
 *
 * Network checks degrade to a WARNING when offline — being on a train is not a
 * release error. Everything local stays hard.
 *
 *   node scripts/check-release.mjs          # check
 *   node scripts/check-release.mjs --next   # just print the next free version
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const VERSION = pkg.version;
const NAME = pkg.name;

const problems = [];
const warnings = [];
const notes = [];

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

const cmp = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

// ── 1. npm ───────────────────────────────────────────────────────────────────
let published = [];
try {
  published = JSON.parse(run("npm", ["view", NAME, "versions", "--json", "--silent"]));
  if (!Array.isArray(published)) published = [published];
} catch {
  warnings.push("could not reach npm — the 'already published' check did NOT run");
}

const highest = published.length ? published.slice().sort(cmp).at(-1) : null;
const nextFree = (() => {
  if (!highest) return null;
  const [maj, min] = highest.split(".").map(Number);
  return `${maj}.${min + 1}.0`;
})();

if (process.argv.includes("--next")) {
  console.log(nextFree ?? "unknown (npm unreachable)");
  process.exit(0);
}

if (published.includes(VERSION)) {
  problems.push(
    `${NAME}@${VERSION} is ALREADY PUBLISHED on npm.\n` +
      `      Someone else released it — almost certainly the other machine.\n` +
      `      Highest published: ${highest}. Next free minor: ${nextFree}.\n` +
      `      Renumber package.json, the CHANGELOG heading AND the template pins.`,
  );
} else if (highest) {
  notes.push(`npm highest is ${highest}; this release is ${VERSION}`);
}

// ── 2. tags on origin ────────────────────────────────────────────────────────
try {
  const tags = run("git", ["ls-remote", "--tags", "origin"]);
  if (new RegExp(`refs/tags/v${VERSION.replace(/\./g, "\\.")}(\\^\\{\\})?$`, "m").test(tags)) {
    problems.push(`v${VERSION} is already a tag on origin — that release was cut.`);
  }
} catch {
  warnings.push("could not reach origin — the tag check did NOT run");
}

// ── 3. CHANGELOG ─────────────────────────────────────────────────────────────
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
if (!new RegExp(`^## ${VERSION.replace(/\./g, "\\.")} `, "m").test(changelog)) {
  problems.push(
    `CHANGELOG.md has no '## ${VERSION}' heading.\n` +
      `      Write what changed and the measurement or failure that forced it.`,
  );
}

// ── 4. template pins ─────────────────────────────────────────────────────────
// A doc ships the system's MARKUP, so it pins the release that styles it. A pin
// pointing at a version that was never published 404s at the CDN and falls back to
// a snapshot that is not there either — a blank page, discovered by a reader.
const tplDir = join(root, "templates");
for (const file of readdirSync(tplDir).filter((f) => f.endsWith(".html"))) {
  const text = readFileSync(join(tplDir, file), "utf8");
  const pins = new Set([
    ...[...text.matchAll(/design@(\d+\.\d+\.\d+)/g)].map((m) => m[1]),
    ...[...text.matchAll(/danieldeusing-design-(\d+\.\d+\.\d+)\./g)].map((m) => m[1]),
  ]);
  const wrong = [...pins].filter((p) => p !== VERSION);
  if (wrong.length) {
    problems.push(
      `templates/${file} pins ${wrong.join(", ")} but this release is ${VERSION}.\n` +
        `      Bump every CDN url AND every /_design/ fallback path in the same commit.`,
    );
  }
}

// ── 5. dist matches src ──────────────────────────────────────────────────────
// dist/ is committed because jsDelivr serves it. A source change without a rebuild
// publishes a tag whose CSS is one release behind its own changelog.
const distFile = join(root, "dist", "danieldeusing-design.css");
try {
  const before = readFileSync(distFile, "utf8");
  run("node", ["scripts/build.mjs"]);
  const after = readFileSync(distFile, "utf8");
  if (before !== after) {
    problems.push("dist/ is stale — src/ builds to something else. Run `npm run build` and commit dist/.");
  }
} catch (err) {
  warnings.push(`could not verify dist/ is current: ${err.message.split("\n")[0]}`);
}

// ── report ───────────────────────────────────────────────────────────────────
const label = `${NAME}@${VERSION}`;
for (const n of notes) console.log(`  · ${n}`);
for (const w of warnings) console.warn(`  ! ${w}`);

if (problems.length) {
  console.error(`\n✗ ${label} is not ready to ship:\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}
console.log(`✓ ${label} is coherent — version free, changelog written, pins and dist current.`);
