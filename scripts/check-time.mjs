#!/usr/bin/env node
/*
 * check-time.mjs — runtime/time.js: the viewer's zone, the unit edges, garbage, and the re-tick.
 *
 * WHAT IS AT RISK, and none of it is visible on the day it breaks:
 *   · THE ZONE. A stamp that is right in the zone the author sits in and wrong in every other one
 *     looks perfect in review. So the same instants are formatted under four zones, including one with
 *     a 45-minute offset and one in winter, and midnight is checked for the h24 "24:00:00" trap.
 *   · THE UNIT EDGES. "60 minutes ago" is the bug this estate already shipped once (a rounding band)
 *     and it only shows at one second of every hour. So the edges are pinned, and a sweep over two
 *     years of ages asserts no unit ever reaches the next one's size.
 *   · GARBAGE. A half-written store is normal. Nothing may throw, nothing may print "Invalid Date",
 *     and a value that is not an instant must be echoed — never laundered into a plausible date, which
 *     is what V8's fallback parser does with "2026-13-45 junk".
 *   · THE RE-TICK. A relative label computed once and never re-checked is the estate's most repeated
 *     bug. Asserted in a real browser: the 30 s tick rewrites a stale label, writes nothing when the text
 *     is already right, skips a hidden tab, catches up the moment the tab is visible again, reaches
 *     labels rendered after it started, and installs one timer however often it is called.
 *
 * The formatters are pure, so they run here under Node with `TZ` set per child process — no browser
 * needed, and they are also what a framework app imports. The re-tick and the zone as a BROWSER reads
 * it (Emulation.setTimezoneOverride) need Chromium; without one that half SKIPS loudly
 * (DD_REQUIRE_BROWSER=1 makes it a failure).
 *
 *   node scripts/check-time.mjs
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHROME, launch, reporter, serve } from "./lib/chromium.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(join(root, "runtime/time.js")).href;
const { check, done } = reporter("check-time");

/* ── the formatters, under a given TZ ─────────────────────────────────────────────────────────── */

// Runs `expression` (which may use every export of time.js) in a fresh Node with TZ set, and returns
// its JSON. A fresh process per zone, because the zone is read when a formatter is first built.
const inZone = (tz, expression) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
  `import * as t from ${JSON.stringify(moduleUrl)}; const r = (${expression}); process.stdout.write(JSON.stringify(r));`],
  { env: { ...process.env, TZ: tz }, encoding: "utf8" }));

const INSTANT = "2026-09-28T10:04:00Z";
for (const [tz, text, zone] of [
  ["UTC", "2026-09-28 10:04:00", "Z"],
  ["America/Sao_Paulo", "2026-09-28 07:04:00", "-03:00"],
  ["Europe/Berlin", "2026-09-28 12:04:00", "+02:00"],
  ["Asia/Kathmandu", "2026-09-28 15:49:00", "+05:45"],
]) {
  const parts = inZone(tz, `t.stampParts(${JSON.stringify(INSTANT)})`);
  await check(`${tz}: the instant reads ${text} in the viewer's zone, zone ${zone}, and the UTC original is kept`,
    () => parts.text === text && parts.zone === zone && parts.utc === "2026-09-28T10:04:00.000Z" &&
      parts.date === text.slice(0, 10) && parts.time === text.slice(11), JSON.stringify(parts));
}
{
  const winter = inZone("Europe/Berlin", `t.stampParts("2026-01-15T10:04:00Z")`);
  await check("Berlin in January is +01:00 — the offset in force ON THAT DATE, not today's",
    () => winter.zone === "+01:00" && winter.text === "2026-01-15 11:04:00", JSON.stringify(winter));
  const london = inZone("Europe/London", `[t.stampParts("2026-01-15T10:04:00Z").zone, t.stampParts("2026-07-15T10:04:00Z").zone]`);
  await check("a zero offset is Z whichever way the runtime spells it (Node's ICU says GMT+00:00, Chrome GMT) — London in winter, +01:00 in summer",
    () => london[0] === "Z" && london[1] === "+01:00", JSON.stringify(london));
  const midnight = inZone("Europe/Berlin", `t.formatStamp("2026-09-27T22:00:00Z")`);
  await check("midnight is 00:00:00 on the new day, never 24:00:00 on the old one (hourCycle h23)",
    () => midnight === "2026-09-28 00:00:00", midnight);
  const shape = inZone("America/New_York", `t.formatStamp(Date.UTC(2026, 2, 5, 7, 8, 9))`);
  await check("the shape is YYYY-MM-DD HH:MM:SS whatever the locale would have done (an epoch number is an instant too)",
    () => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(shape) && shape === "2026-03-05 02:08:09", shape);
  const spaced = inZone("Europe/Berlin", `t.stampParts("2026-09-28 12:04:00")`);
  await check("the system's own stamp shape reads back as local time", () => spaced.utc === "2026-09-28T10:04:00.000Z", JSON.stringify(spaced));
}

/* ── nothing, and garbage ─────────────────────────────────────────────────────────────────────── */

const garbage = inZone("UTC", `({
  none: [null, undefined, ""].map((v) => [t.formatStamp(v), t.formatAgo(v), t.whenHtml(v), JSON.stringify(t.stampParts(v))]),
  junk: ["2026-13-45 junk", "not a date", "yesterday", "2026-02-30T25:00:00Z"].map((v) => [v, t.formatStamp(v), t.stampParts(v).utc, t.formatAgo(v)]),
  html: t.whenHtml('<b onmouseover="x">'),
  types: [t.formatStamp(true), t.formatStamp({}), t.formatStamp(new Date("nope")), t.formatAgo(new Date("nope")), t.whenHtml(new Date("nope"))],
  impossible: ["2026-02-30T10:00:00Z", "2026-02-29", "2026-04-31 12:00:00", "2026-09-28T23:60:00Z"].map((v) => [v, t.formatStamp(v), t.parseInstant(v)]),
  leap: t.formatStamp("2028-02-29T10:00:00Z"),
})`);
await check("null, undefined and \"\" render nothing — no \"Invalid Date\", no throw",
  () => garbage.none.every(([stamp, ago, html, parts]) => stamp === "" && ago === "" && html === "" &&
    parts === JSON.stringify({ date: "", time: "", zone: "", utc: "", text: "" })), JSON.stringify(garbage.none));
await check("a value that is not an instant is ECHOED in text and utc, with no age — never laundered into a date",
  () => garbage.junk.every(([value, stamp, utc, ago]) => stamp === value && utc === value && ago === ""),
  JSON.stringify(garbage.junk));
await check("...including \"2026-13-45 junk\", which V8's lenient parser would read as the 13th of June",
  () => garbage.junk[0][1] === "2026-13-45 junk");
await check("a day that does not exist is not an instant, though V8 would roll \"2026-02-30\" into March — and 2028-02-29 does exist",
  () => garbage.impossible.every(([value, stamp, time]) => stamp === value && time === null) && garbage.leap === "2028-02-29 10:00:00",
  JSON.stringify([garbage.impossible, garbage.leap]));
await check("an echoed value is escaped in the markup, and is a bare .when-exact with no age to tick",
  () => garbage.html === '<span class="when-exact">&lt;b onmouseover=&quot;x&quot;&gt;</span>', garbage.html);
await check("a boolean and an object are not instants either, and are echoed; an invalid Date renders nothing, never \"Invalid Date\"",
  () => garbage.types[0] === "true" && garbage.types[1] === "[object Object]" && garbage.types[2] === "" && garbage.types[3] === "" &&
    garbage.types[4] === "",
  JSON.stringify(garbage.types));
{
  // A calendar date is not an instant: read as UTC midnight it printed the day BEFORE west of Greenwich.
  const day = inZone("America/Sao_Paulo", `[t.formatStamp("2026-09-28"), t.parseInstant("2026-09-28"), t.formatAgo("2026-09-28"), t.whenHtml("2026-09-28")]`);
  await check("a date alone is a calendar date: in São Paulo it reads 2026-09-28 — no time, no zone shift, no age",
    () => day[0] === "2026-09-28" && day[1] === null && day[2] === "" && !day[3].includes("2026-09-27"), JSON.stringify(day));
}

/* ── the unit edges ───────────────────────────────────────────────────────────────────────────── */

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
const edges = [
  [59 * S, "59s", "59 seconds"], [60 * S, "1m", "1 minute"], [119 * S, "1m", "1 minute"], [2 * M, "2m", "2 minutes"],
  [59 * M + 59 * S, "59m", "59 minutes"], [60 * M, "1h", "1 hour"], [23 * H + 59 * M, "23h", "23 hours"], [24 * H, "1d", "1 day"],
  [6 * D, "6d", "6 days"], [7 * D, "1w", "1 week"], [29 * D, "4w", "4 weeks"], [30 * D, "1mo", "1 month"],
  [364 * D, "12mo", "12 months"], [365 * D, "1y", "1 year"], [800 * D, "2y", "2 years"],
  [999, "0s", "0 seconds"], [0, "0s", "0 seconds"], [-5 * M, "0s", "0 seconds"], [NaN, "0s", "0 seconds"], [Infinity, "0s", "0 seconds"],
];
const edgeResults = inZone("UTC", `${JSON.stringify(edges.map(([ms]) => (Number.isNaN(ms) ? "NaN" : ms === Infinity ? "Inf" : ms)))}
  .map((v) => (v === "NaN" ? NaN : v === "Inf" ? Infinity : v))
  .map((ms) => [t.formatDuration(ms), t.formatDuration(ms, { style: "long" })])`);
for (const [i, [ms, short, long]] of edges.entries()) {
  await check(`formatDuration(${Number.isFinite(ms) ? `${ms} ms` : ms}) is "${short}" / "${long}"`,
    () => edgeResults[i][0] === short && edgeResults[i][1] === long, JSON.stringify(edgeResults[i]));
}

// The property, not just the examples: across two years of ages (every 7 minutes 31 seconds, plus a
// second either side of every unit boundary), no unit ever reaches the size of the next one.
const sweep = inZone("UTC", `(() => {
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  const limit = { s: 60, m: 60, h: 24, d: 7, w: 5, mo: 13 };
  const words = { second: "s", minute: "m", hour: "h", day: "d", week: "w", month: "mo", year: "y" };
  const ages = [];
  for (let ms = 0; ms < 730 * D; ms += 7 * M + 31 * S) ages.push(ms);
  for (const edge of [M, H, D, 7 * D, 30 * D, 365 * D]) for (let k = 1; k < 3; k += 1) ages.push(k * edge - S, k * edge, k * edge + S);
  const bad = [];
  for (const ms of ages) {
    const short = t.formatDuration(ms).match(/^(\\d+)([a-z]+)$/);
    const long = t.formatDuration(ms, { style: "long" }).match(/^(\\d+) ([a-z]+?)s?$/);
    if (!short || !long || Number(short[1]) >= (limit[short[2]] ?? Infinity) || words[long[2]] !== short[2] ||
        long[1] !== short[1] || (short[1] === "1") !== !t.formatDuration(ms, { style: "long" }).endsWith("s")) bad.push([ms, t.formatDuration(ms), t.formatDuration(ms, { style: "long" })]);
  }
  return { n: ages.length, bad: bad.slice(0, 5) };
})()`);
await check(`no age in two years reads "60 seconds", "60 minutes", "24 hours", "7 days", "5 weeks" or "13 months" — ${sweep.n} ages, both styles, singulars spelled right`,
  () => sweep.bad.length === 0, JSON.stringify(sweep.bad));

const agoCases = inZone("UTC", `(() => {
  const now = Date.UTC(2026, 8, 28, 12, 0, 0);
  const at = (ms) => new Date(now - ms).toISOString();
  return {
    under5: t.formatAgo(at(4999), { now }), at5: t.formatAgo(at(5000), { now }),
    future: t.formatAgo(at(-3 * 60000), { now }), longMin: t.formatAgo(at(3 * 60000), { now }),
    shortMin: t.formatAgo(at(3 * 60000), { now, style: "short" }), year: t.formatAgo(at(400 * 86400000), { now }),
    date: t.formatAgo(new Date(now - 7200000), { now }), epoch: t.formatAgo(now - 7200000, { now }),
  };
})()`);
await check("under 5 s is \"just now\"; at 5 s it counts", () => agoCases.under5 === "just now" && agoCases.at5 === "5 seconds ago", JSON.stringify(agoCases));
await check("a stamp in the FUTURE reads \"just now\", never \"-3 minutes ago\"", () => agoCases.future === "just now", agoCases.future);
await check("the long form in a table (\"3 minutes ago\"), the short on a card (\"3m ago\")",
  () => agoCases.longMin === "3 minutes ago" && agoCases.shortMin === "3m ago", JSON.stringify(agoCases));
await check("400 days is \"1 year ago\", not \"400 days ago\"", () => agoCases.year === "1 year ago", agoCases.year);
await check("a Date and an epoch number are instants as well as an ISO string",
  () => agoCases.date === "2 hours ago" && agoCases.epoch === "2 hours ago", JSON.stringify(agoCases));

const markup = inZone("Europe/Berlin", `[t.whenHtml("2026-09-28T10:04:00Z"), t.whenHtml("2026-09-28T10:04:00Z", { inline: true })]`);
await check("whenHtml(): a <time datetime> whose tip and data-ago are the UTC instant, the age over the exact local stamp",
  () => markup[0].startsWith('<time class="when" datetime="2026-09-28T10:04:00.000Z" data-tip="2026-09-28T10:04:00.000Z">') &&
    markup[0].includes('<span class="when-ago" data-ago="2026-09-28T10:04:00.000Z">') &&
    markup[0].includes('<span class="when-exact">2026-09-28 12:04:00</span>') && !markup[0].includes("data-ago-style"), markup[0]);
await check("whenHtml({ inline }): the clock glyph, the SHORT age that re-ticks as short, and both stamps on the tip",
  () => markup[1].startsWith('<time class="when when--inline" datetime="2026-09-28T10:04:00.000Z" data-tip="2026-09-28 12:04:00 · 2026-09-28T10:04:00.000Z">') &&
    markup[1].includes('data-icon="clock" aria-hidden="true"') && markup[1].includes('data-ago-style="short"') &&
    /data-ago-style="short">\d+(s|m|h|d|w|mo|y) ago<\/span>/.test(markup[1]), markup[1]);

/* ── in a browser: the viewer's zone, and the re-tick ─────────────────────────────────────────── */

if (!CHROME) {
  console.log("check-time: browser half SKIPPED — no headless chromium on this machine.");
  console.log("  The re-tick is a timer, a visibility state and live DOM text; only a browser has them.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  done();
}

// The harness captures setInterval BEFORE the module loads, so a check can fire the 30 s tick on
// demand instead of waiting for it, and can count how many timers were installed.
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="mount"></div>
<script>
  window.timers = [];
  const realSetInterval = window.setInterval;
  window.setInterval = (fn, ms) => { window.timers.push({ fn, ms }); return window.timers.length; };
  window.hide = (hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  };
</script>
<script type="module">
  import * as t from "/runtime/time.js";
  window.t = t;
  window.ready = true;
</script></body></html>`;
const server = await serve(root, { "/__time.html": HARNESS });
const browser = await launch("time");

for (const [zone, expected] of [["America/Sao_Paulo", "-03:00"], ["Asia/Tokyo", "+09:00"]]) {
  await browser.send("Emulation.setTimezoneOverride", { timezoneId: zone });
  await browser.navigate(`${server.origin}/__time.html`);
  await browser.until("window.ready === true");
  const parts = await browser.evaluate(`window.t.stampParts("2026-09-28T10:04:00Z")`);
  await check(`in the browser, ${zone}: the page renders the viewer's own zone (${expected}), with nothing hardcoded`,
    () => parts.zone === expected && parts.text === (zone === "Asia/Tokyo" ? "2026-09-28 19:04:00" : "2026-09-28 07:04:00"),
    JSON.stringify(parts));
}

await browser.evaluate(`(() => {
  const at = (ms) => new Date(Date.now() - ms).toISOString();
  document.getElementById("mount").innerHTML =
    '<p id="a">' + window.t.whenHtml(at(3 * 60000)) + '</p><p id="b">' + window.t.whenHtml(at(3 * 86400000), { inline: true }) + '</p>';
  window.ago = (id) => document.querySelector("#" + id + " [data-ago]");
  window.mutations = 0;
  new MutationObserver((records) => { window.mutations += records.length; })
    .observe(document.getElementById("mount"), { subtree: true, childList: true, characterData: true });
  window.t.initRelativeTimes();
  window.t.initRelativeTimes();
  return null;
})()`);
await check("initRelativeTimes() installs ONE 30 s timer however often it is called",
  () => browser.evaluate("window.timers.length === 1 && window.timers[0].ms === 30000"), () => browser.evaluate("JSON.stringify(window.timers.map((x) => x.ms))"));
await check("a tick where every label is already right writes NOTHING — a patching renderer agrees with it",
  async () => { await browser.evaluate("window.mutations = 0; window.timers[0].fn(); null"); return browser.evaluate("window.mutations === 0"); },
  () => browser.evaluate("window.mutations"));
await browser.evaluate(`window.ago("a").setAttribute("data-ago", new Date(Date.now() - 2 * 3600000).toISOString());
  window.ago("b").setAttribute("data-ago", new Date(Date.now() - 2 * 3600000).toISOString()); null`);
await check("the 30 s tick rewrites a label that has gone stale, in its own style (long in a table, short on a card)",
  async () => { await browser.evaluate("window.timers[0].fn(); null");
    return browser.evaluate(`window.ago("a").textContent === "2 hours ago" && window.ago("b").textContent === "2h ago"`); },
  () => browser.evaluate(`[window.ago("a").textContent, window.ago("b").textContent]`));
await browser.evaluate(`window.hide(true); window.ago("a").setAttribute("data-ago", new Date(Date.now() - 5 * 86400000).toISOString());
  window.timers[0].fn(); null`);
await check("a HIDDEN tab does not tick — nobody is reading it",
  () => browser.evaluate(`window.ago("a").textContent === "2 hours ago"`), () => browser.evaluate(`window.ago("a").textContent`));
await browser.evaluate("window.hide(false); null");
await check("...and it catches up the moment the tab is visible again, without waiting for the next tick",
  () => browser.evaluate(`window.ago("a").textContent === "5 days ago"`), () => browser.evaluate(`window.ago("a").textContent`));
await browser.evaluate(`document.getElementById("mount").insertAdjacentHTML("beforeend",
  '<p id="c"><span data-ago="' + new Date(Date.now() - 90000).toISOString() + '">stale text from the server</span></p>');
  window.timers[0].fn(); null`);
await check("a label rendered AFTER initRelativeTimes() is kept true too — each tick reads the document afresh",
  () => browser.evaluate(`window.ago("c").textContent === "1 minute ago"`), () => browser.evaluate(`window.ago("c").textContent`));
await browser.evaluate(`window.ago("c").setAttribute("data-ago", "not a date"); window.timers[0].fn(); null`);
await check("a label whose instant cannot be read keeps its text rather than going blank",
  () => browser.evaluate(`window.ago("c").textContent === "1 minute ago"`), () => browser.evaluate(`window.ago("c").textContent`));

browser.close();
server.close();
done();
