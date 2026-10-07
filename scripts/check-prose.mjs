/*
 * check-prose.mjs — scripts/verify-prose.mjs on small pages, one rule each.
 *
 * The same pages and the same warnings as the prose tests of the vu3-agent-kit's bake.py
 * (scripts/tests/test_bake.py, ProseTest), so the two ports stay alike. No browser.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reporter } from "./lib/chromium.mjs";
import { proseWarnings } from "./verify-prose.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { check, done } = reporter("check-prose");
const page = (body, head = "") =>
  `<!doctype html><html><head>${head}</head><body><main class="wrap">${body}</main><footer>It's outside</footer></body></html>`;
const warns = (body, expected, head) => {
  const got = proseWarnings(page(body, head));
  return [() => JSON.stringify(got) === JSON.stringify(expected), () => JSON.stringify(got)];
};

await check("clean prose gives no warning", ...warns("<p>The call failed. Use the new endpoint.</p>", []));
await check("an unapproved word names its replacement",
  ...warns("<p>We utilize the cache.</p>", ['ASD-STE100 words: "utilize" → "use"']));
await check("the month May is no warning", ...warns("<p>May 2026 was fine.</p>", []));
await check("may after a word is", ...warns("<p>The call may fail.</p>", ['ASD-STE100 words: "may" → "can"']));
await check("a contraction, a perfect tense and a passive with by",
  ...warns("<p>It doesn't work. The call has failed. The page was written by the agent.</p>", [
    "ASD-STE100: no contractions — doesn't",
    'ASD-STE100: use simple tenses, not "has/have + verb" — "has failed"',
    'ASD-STE100: use the active voice — "was written by" (say who does it first)',
  ]));
await check("a long sentence and a long paragraph",
  ...warns(`<p>${Array(26).fill("word").join(" ")}.</p><p>${Array(7).fill("One sentence.").join(" ")}</p>`, [
    "1 sentence over 25 words — split them; one idea per sentence",
    "ASD-STE100: 1 paragraph with more than 6 sentences — split",
  ]));
await check("exactly 25 words in a sentence is no warning",
  ...warns(`<p>${Array(25).fill("word").join(" ")}.</p>`, []));
await check("exactly six sentences in a paragraph is no warning",
  ...warns(`<p>${Array(6).fill("One sentence.").join(" ")}</p>`, []));
await check("a contraction with a curly apostrophe is named",
  ...warns("<p>It can\u2019t work.</p>", ["ASD-STE100: no contractions — can\u2019t"]));
await check("a capital letter does not hide an unapproved word",
  ...warns("<p>However, the call failed.</p>", ['ASD-STE100 words: "however" → "but"']));
await check("code, pre, scripts and text outside main are not prose",
  ...warns("<p>Run <code>utilize()</code> now.</p><pre>don't</pre><script>var a = \"it's\";</script>", [],
    "<title>We utilize it</title>"));
await check("the month inside a sentence is no warning", ...warns("<p>The release is due in May 2026.</p>", []));
await check("styles, templates, diagrams and keys are not prose",
  ...warns('<style>p::after { content: "utilize"; }</style><template><p>We utilize it.</p></template><svg><text>utilize</text></svg><p>Press <kbd>utilize</kbd> now.</p>', []));
await check("comments are not prose and hide no main",
  ...warns("<p>The call failed.</p><!-- We utilize it. -->", [], "<!-- <main><p>It's a trap. We utilize it.</p></main> -->"));
await check("a table cell is a paragraph",
  ...warns("<table><tr><td>One. Two. Three. Four. Five. Six. Seven.</td></tr></table>",
    ["ASD-STE100: 1 paragraph with more than 6 sentences — split"]));
await check("more than eight words are counted",
  ...warns("<p>We utilize, leverage and facilitate it; subsequently, additionally, furthermore, however, numerous robust things.</p>", [
    'ASD-STE100 words: "utilize" → "use", "leverage" → "use", "facilitate" → "help", "subsequently" → "then", "additionally" → "also", "furthermore" → "also", "however" → "but", "robust" → "strong" … 1 more',
  ]));

const work = mkdtempSync(join(tmpdir(), "dd-prose-check-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
writeFileSync(join(work, "page.html"), page("<p>We utilize the cache.</p>"));
const script = join(root, "scripts", "verify-prose.mjs");
const run = spawnSync(process.execPath, [script, join(work, "page.html")], { encoding: "utf8" });
await check("the script prints the warnings and exits 0",
  () => run.status === 0 && run.stdout.includes('"utilize" → "use"'), () => run.stdout + run.stderr);
const usage = spawnSync(process.execPath, [script], { encoding: "utf8" });
await check("no page is a usage error, exit 2", () => usage.status === 2, () => usage.stderr);
done();
