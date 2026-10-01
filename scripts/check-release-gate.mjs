import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";

// check-release-gate — every suite runs in CI and before the release publishes, and none can skip.
//
// WHY: the push IS the release (npm Trusted Publishing on push to main), so release.yml is the
// only thing between a commit and a published package. Until 2026-08-24 it ran no suite at all
// while ci.yml ran three — two copies of "what green means" with nothing comparing them, which is
// this estate's most repeated bug shape. (audit design-system #1)
//
// Until 0.60.0 this compared the workflows with each other and a hand-written list of three DOM
// suites. Twenty-two suites arrived in one release, and a hand-written list is the thing that falls
// behind: so the list is now the scripts directory itself. Every scripts/check-*.mjs must run in
// ci.yml (check-release aside: it refuses a version already on npm, which every push that is not a
// release carries) and in release.yml before `npm publish`, and the step that runs it must carry
// every flag that turns a skip into a failure. A suite added without a line in both workflows fails
// here, which is the point.
//
// This is a source check, so it costs nothing and runs anywhere.

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");
const suitesOnDisk = readdirSync("scripts").filter((f) => /^check-[a-z-]+\.mjs$/.test(f)).map((f) => f.slice(0, -4)).sort();

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  PASS  ${msg}`);

// `run: `, not just the string: the file's own header comment explains npm publish, and
// matching that put the boundary at the top of the file so every suite looked ungated.
// A check satisfied by prose about the thing it is checking is this estate's house bug.
const publishAt = release.search(/^\s*run: npm publish/m);
if (publishAt === -1) throw new Error("check-release-gate: no `npm publish` in release.yml — this check is looking at the wrong file");

// A workflow's steps, each with the suites its `run:` executes and its `env:` block. Comment lines
// are blanked to spaces of the same length (so offsets hold against the raw text's `npm publish`), and a suite named in a comment is not a suite that runs.
const steps = (text) => {
  const code = text.split("\n").map((line) => (/^\s*#/.test(line) ? " ".repeat(line.length) : line)).join("\n");
  const out = [];
  const re = /^ {6}- /gm;
  const starts = [...code.matchAll(re)].map((m) => m.index);
  starts.forEach((at, i) => {
    const step = code.slice(at, starts[i + 1] ?? code.length);
    out.push({
      at,
      suites: [...step.matchAll(/node scripts\/(check-[a-z-]+)\.mjs/g)].map((m) => m[1]),
      env: (step.match(/\n {8}env:\n((?: {10}.*\n?)*)/) || [])[1] || "",
    });
  });
  return out;
};

// The flags every suite's step carries.
const FLAGS = [
  ["DD_REQUIRE_BROWSER", /^\s*DD_REQUIRE_BROWSER:\s*"1"\s*$/m, "a DOM suite with no browser would SKIP and pass"],
  ["DD_FORBID_STANDINS", /^\s*DD_FORBID_STANDINS:\s*"1"\s*$/m, "a stand-in in force would be a note, not a failure"],
  ["DD_REQUIRE_LUCIDE", /^\s*DD_REQUIRE_LUCIDE:\s*"1"\s*$/m, "check-icons' drawing comparison would skip"],
  ["DD_LUCIDE_REACT", /^\s*DD_LUCIDE_REACT:\s*\S+/m, "a runner has no lucide-react of its own to compare with"],
  ["DD_REQUIRE_TAILWIND", /^\s*DD_REQUIRE_TAILWIND:\s*"1"\s*$/m, "check-tailwind-layers' browser half would skip on a runner with no Tailwind, and the cascade go unproved"],
  ["DD_TAILWIND_NODE", /^\s*DD_TAILWIND_NODE:\s*\S+/m, "a runner has no @tailwindcss/node of its own to compile with"],
  ["DD_MERMAID", /^\s*DD_MERMAID:\s*\S+/m, "check-integration would load mermaid from jsDelivr, and a CDN outage would fail a release"],
  ["DD_REQUIRE_COCKPIT_DOM_PATCH", /^\s*DD_REQUIRE_COCKPIT_DOM_PATCH:\s*"1"\s*$/m, "the cockpit patcher sections would skip"],
  ["DD_COCKPIT_DOM_PATCH", /^\s*DD_COCKPIT_DOM_PATCH:\s*\S+/m, "a runner has no infra checkout to find the patcher in"],
];

// The packages the suites borrow: the package, the directory under $RUNNER_TEMP it is installed
// into, and the flag that points a suite at it.
const BORROWED = [["lucide-react", "lucide", "DD_LUCIDE_REACT"], ["@tailwindcss/node", "tailwind", "DD_TAILWIND_NODE"], ["mermaid", "mermaid", "DD_MERMAID"]];

// Whether a flag's path lies inside $RUNNER_TEMP/<dir>/node_modules once its `.` and `..` segments are
// resolved: a prefix match alone passes `${{ runner.temp }}/tailwind/node_modules/../../elsewhere`. The
// runner's temp directory is one opaque root, so a `..` that climbs out of it lands outside too.
const ROOT = "/<runner.temp>";
const insideRunnerTemp = (value, dir) => {
  const m = value.match(/^(?:\$\{\{\s*runner\.temp\s*\}\}|\$\{?RUNNER_TEMP\}?)(\/.*)$/);
  return !!m && posix.normalize(ROOT + m[1]).startsWith(`${ROOT}/${dir}/node_modules/`);
};

const gate = (name, text, required, before = Infinity) => {
  const ran = new Map();
  for (const step of steps(text)) {
    if (step.at > before) continue;
    for (const suite of step.suites) ran.set(suite, step);
  }
  const where = before < Infinity ? " before npm publish" : "";
  for (const suite of required) {
    const step = ran.get(suite);
    if (!step) { fail(`${name}: ${suite} does not run${where} — a red ${suite} would go unseen`); continue; }
    const missing = FLAGS.filter(([, re]) => !re.test(step.env));
    if (missing.length) fail(`${name}: ${suite}'s step lacks ${missing.map(([flag, , why]) => `${flag} (${why})`).join("; ")}`);
    else pass(`${name}: ${suite} runs${where}, and cannot skip`);
  }
  // The patcher the flag points at must exist, or every run fails for a reason nobody reads.
  for (const step of new Set(ran.values())) {
    const path = (step.env.match(/^\s*DD_COCKPIT_DOM_PATCH:\s*"?(.*?)"?\s*$/m) || [])[1];
    if (path && !existsSync(path.replace(/^\$\{\{\s*github\.workspace\s*\}\}\//, ""))) fail(`${name}: DD_COCKPIT_DOM_PATCH points at ${path}, which is not in the repository`);
  }
  // Each package a suite borrows is installed by an earlier step of the same job: one line that has
  // `--ignore-scripts` (no lifecycle script of a borrowed package runs on the runner), an exact
  // x.y.z, and `--prefix "$RUNNER_TEMP/<dir>"`, where <dir> is the directory the suite's flag points
  // into. The versions are returned, so the two workflows can be compared with each other.
  const earlier = text.slice(0, Math.min(before, text.length)).split("\n").filter((line) => !/^\s*#/.test(line));
  const pins = {};
  for (const [pkg, dir, flag] of BORROWED) {
    const line = earlier.find((l) => /\bnpm install\b/.test(l) && l.includes(`--prefix "$RUNNER_TEMP/${dir}"`));
    const version = line?.match(new RegExp(`\\s${pkg.replace(/[/@]/g, "\\$&")}@(\\d+\\.\\d+\\.\\d+)\\s*$`))?.[1];
    if (!version) fail(`${name}: nothing installs ${pkg} at an exact version into $RUNNER_TEMP/${dir} for ${flag}`);
    else if (!/\s--ignore-scripts\s/.test(line)) fail(`${name}: the ${pkg} install lacks --ignore-scripts, so its lifecycle scripts would run on the runner`);
    else { pass(`${name}: ${pkg}@${version} is installed, pinned, without lifecycle scripts, before the suites run`); pins[pkg] = version; }
    // ...and the flag points into the directory it was installed into, not somewhere else.
    for (const step of new Set(ran.values())) {
      const value = (step.env.match(new RegExp(`^\\s*${flag}:\\s*(.+?)\\s*$`, "m")) || [])[1];
      if (value && !insideRunnerTemp(value, dir)) fail(`${name}: ${flag} is ${value}, which is not inside the $RUNNER_TEMP/${dir} the install writes to`);
    }
  }
  return pins;
};

// An empty check is not a passing check.
if (suitesOnDisk.length < 20) throw new Error(`check-release-gate: found ${suitesOnDisk.length} suites in scripts/ — run it from the repository root`);
console.log(`${suitesOnDisk.length} suites in scripts/`);
const ciPins = gate("ci.yml", ci, suitesOnDisk.filter((s) => s !== "check-release"));
const releasePins = gate("release.yml", release, suitesOnDisk, publishAt);
// Two copies of what green means must borrow the same versions of what they borrow.
for (const [pkg] of BORROWED) {
  if (ciPins[pkg] && releasePins[pkg] && ciPins[pkg] === releasePins[pkg]) pass(`both workflows borrow ${pkg}@${ciPins[pkg]}`);
  else if (ciPins[pkg] && releasePins[pkg]) fail(`ci.yml borrows ${pkg}@${ciPins[pkg]} and release.yml ${pkg}@${releasePins[pkg]} — the gate and the check run different things`);
}

// A third copy of the same judgement: the node the suites run on. release.yml needs >= 22 for
// Trusted Publishing and the DOM suites need >= 22 for a global WebSocket, so a ci.yml pinned
// lower runs a different program than the one that gates the release.
const nodeOf = (text) => Number((text.match(/node-version:\s*(\d+)/) || [])[1]);
const ciNode = nodeOf(ci), releaseNode = nodeOf(release);
if (ciNode && releaseNode && ciNode === releaseNode) pass(`both workflows run node ${ciNode}`);
else fail(`ci.yml runs node ${ciNode} and release.yml runs node ${releaseNode} — the gate and the check disagree about the runtime`);
if (releaseNode >= 22) pass("node is new enough for a global WebSocket (the DOM suites need it)");
else fail(`node ${releaseNode} has no global WebSocket — the DOM suites cannot run at all`);

console.log();
if (failures) { console.log(`\x1b[31m-- check-release-gate: ${failures} FAILED --\x1b[0m`); process.exit(1); }
console.log("\x1b[32m-- check-release-gate: all checks passed --\x1b[0m");
