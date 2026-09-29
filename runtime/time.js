/*
 * time.js — an instant, rendered in the VIEWER'S zone, and how long ago it was.
 *
 *   formatStamp("2026-09-28T10:04:00Z")   "2026-09-28 12:04:00"   (read in Berlin in September)
 *   formatAgo("2026-09-28T10:04:00Z")     "3 minutes ago"
 *   formatDuration(48_000)                "48s"
 *   whenHtml(iso)                         the `.when` cell: how long ago, over the exact stamp
 *   initRelativeTimes()                   keeps every `[data-ago]` label true while the page is open
 *
 * THE VIEWER'S ZONE, BECAUSE DANIEL TRAVELS. The same store is read from Brazil and from Germany,
 * so a page cannot pick a zone — "convert to São Paulo" would be wrong three months a year. The
 * browser already knows where it is; Intl is asked, and nothing here names a zone.
 *
 * WHAT THIS REPLACED, five times over in cockpit before it became cockpit's stamp.js (C60):
 *
 *   String(ts).replace("T", " ").replace(/\..*\/, "")
 *
 * which never parses. It edited the ISO text, so it printed UTC dressed as local time, and it was
 * not even consistent about that: `/\..*\/` needs a fraction to match, so one surface kept the `Z`
 * and its neighbour ate it. Every stamp now comes through `stampParts()`, which is genuinely the
 * viewer's wall clock — and that is also why NO OFFSET IS RENDERED (Daniel, 2026-08-10: "just
 * display the date and the time in the timezone of the user who opens the browser"). The suffix
 * used to tell a converted stamp from an unconverted one; with no unconverted ones left it only
 * repeated "local time" on every row. The exact instant is one hover away: `utc` goes on the
 * cell's `data-tip`, and `zone` is still computed for anything that wants it.
 *
 * THE SHAPE IS OURS, THE LOCALE ONLY SUPPLIES DIGITS. `YYYY-MM-DD HH:MM:SS` is the shape of the
 * estate's logs, filenames and stored values, so a stamp on screen can be grepped for. The parts
 * are picked by name out of `formatToParts` rather than taken from a locale's own layout —
 * `toLocaleString()` hands the ORDER to the reader's regional setting, and one reader gets
 * 09/08/2026 where another gets 08/09/2026. `hourCycle: "h23"` is named explicitly: `hour12:
 * false` alone leaves h23-vs-h24 to ICU, and h24 prints midnight as "24:00:00" on the day before.
 *
 * HOW LONG AGO, IN THE WORDS A READER THINKS IN (Daniel, 2026-08-22). A log is read to answer "is
 * this recent?", and a wall clock makes every reader do the subtraction. The unit changes BEFORE
 * the number reaches 60, which is the whole trick: a first attempt rounded against a 90-wide band
 * and produced "60 seconds ago" and "60 minutes ago", both read as a bug although the arithmetic
 * was right. Flooring into the largest unit that yields at least 1 cannot do that — at 60 s the
 * minute claims it. Weeks, months and years (from configr and seedr) join cockpit's day, hour,
 * minute and second, so an old item reads "1 year ago" and not "400 days ago". A FUTURE stamp
 * reads "just now", never "-3 minutes ago": the estate has shipped a `startedAt` that was really a
 * finish time, and a negative age is exactly how that looks.
 *
 * DATA STAYS UTC. Stored values, comparison keys, filename stamps and lexical ISO sorts never go
 * through this file — only what a person READS converts. A calendar DATE (a publication day) is not
 * an instant either; it keeps the surface's locale format and a `<time datetime>`.
 *
 * NULL, EMPTY AND GARBAGE ARE SURVIVABLE. These render values from stores that may be half-written,
 * and a formatter that prints "Invalid Date" or throws inside a table cell takes the whole panel
 * down. Nullish or "" renders "", and an unparseable value is ECHOED, so a wrong stored value stays
 * visible and debuggable rather than being laundered into a plausible date.
 *
 * Everything except `initRelativeTimes()` is pure and touches no DOM, so a framework app imports
 * the formatters from `@danieldeusing/design/runtime/time` and renders the same strings itself.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Largest first. A month is 30 days and a year 365: a relative label is an approximation by nature,
// and a calendar-exact month would make "1 month ago" depend on which month it was.
const UNITS = [
  [365 * DAY, "y", "year"],
  [30 * DAY, "mo", "month"],
  [7 * DAY, "w", "week"],
  [DAY, "d", "day"],
  [HOUR, "h", "hour"],
  [MINUTE, "m", "minute"],
  [SECOND, "s", "second"],
];

// Formatter construction is the expensive part, and a table calls this a few hundred times a paint.
// ponytail: the viewer's zone is read once per page, so a laptop that changes zone mid-session shows
// the old one until the next load; key the cache on resolvedOptions().timeZone if that ever matters.
const formatters = new Map();
function formatter(kind) {
  if (!formatters.has(kind)) {
    formatters.set(kind, new Intl.DateTimeFormat("en-GB", kind === "zone"
      ? { timeZoneName: "longOffset" }
      : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }));
  }
  return formatters.get(kind);
}

// The ISO-8601 shape every store in the estate writes: a date, or a date and time with an optional
// fraction and an optional `Z` / `±HH:MM`. A space may stand for the `T` — the system's own stamp
// shape reads back as local time.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * An instant as epoch milliseconds, or null when there is none to read.
 *
 * A Date, a number (epoch ms) and an ISO-8601 string are instants; nullish and "" are "no value",
 * which is not epoch zero. ANY OTHER STRING IS NOT AN INSTANT, however date-like it looks: V8's
 * fallback parser reads "2026-13-45 junk" as the 13th of June while Firefox refuses it, and a stored
 * value that means one date in one browser and nothing in another is the estate disagreeing with
 * itself. Refused here, it is echoed wherever it is shown — visible and debuggable. The space form is
 * handed to the engine with its `T` restored, because Safari refuses "2026-09-28 12:04:00".
 *
 * @param {Date|number|string|null|undefined} value
 * @returns {number|null}
 */
export function parseInstant(value) {
  if (value == null || value === "") return null;
  let time = NaN;
  if (value instanceof Date || typeof value === "number") time = new Date(value).getTime();
  else if (typeof value === "string" && ISO_INSTANT.test(value.trim())) time = new Date(value.trim().replace(" ", "T")).getTime();
  return Number.isFinite(time) ? time : null;
}

// "GMT-03:00" -> "-03:00", and a zero offset -> "Z". longOffset is the offset in force ON THAT DATE, so
// a July instant read in January still says +02:00 for Berlin. A zero offset has two spellings — Chrome
// answers "GMT", Node's ICU "GMT+00:00" — so both are matched, or UTC and London in winter would read
// "Z" in one runtime and "+00:00" in the other.
function zoneOf(date) {
  const named = formatter("zone").formatToParts(date).find((part) => part.type === "timeZoneName");
  const raw = named ? named.value : "GMT";
  return /^(?:GMT|UTC)(?:[+-]00:?00)?$/.test(raw) ? "Z" : raw.replace(/^(?:GMT|UTC)/, "");
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * An instant, in the viewer's zone, taken apart.
 *
 * @param {Date|number|string|null|undefined} value
 * @returns {{date: string, time: string, zone: string, utc: string, text: string}}
 *   `text` is `YYYY-MM-DD HH:MM:SS`; `utc` the ISO string; `zone` `Z` or `±HH:MM`. Nullish or ""
 *   gives every part ""; an unparseable value is echoed in `date`, `utc` and `text`.
 */
export function stampParts(value) {
  if (value == null || value === "") return { date: "", time: "", zone: "", utc: "", text: "" };
  const time = parseInstant(value);
  if (time === null) {
    const raw = String(value);
    return { date: raw, time: "", zone: "", utc: raw, text: raw };
  }
  const date = new Date(time);
  const part = {};
  for (const { type, value: digits } of formatter("clock").formatToParts(date)) part[type] = digits;
  const day = `${part.year}-${part.month}-${part.day}`;
  const clock = `${part.hour}:${part.minute}:${part.second}`;
  return { date: day, time: clock, zone: zoneOf(date), utc: date.toISOString(), text: `${day} ${clock}` };
}

/** `YYYY-MM-DD HH:MM:SS` in the viewer's zone; "" for nothing, the input itself for garbage. */
export function formatStamp(value) {
  return stampParts(value).text;
}

/**
 * A span of time, floored into the largest unit that is at least 1.
 *
 * @param {number} ms
 * @param {{style?: "short"|"long"}} [options] short: "48s" "3m" "4mo"; long: "48 seconds" "1 year"
 * @returns {string} Negative or non-finite spans are "0s" / "0 seconds".
 */
export function formatDuration(ms, { style = "short" } = {}) {
  const span = Number(ms);
  const long = style === "long";
  if (Number.isFinite(span) && span > 0) {
    for (const [size, short, word] of UNITS) {
      const n = Math.floor(span / size);
      if (n >= 1) return long ? `${n} ${word}${n === 1 ? "" : "s"}` : `${n}${short}`;
    }
  }
  return long ? "0 seconds" : "0s";
}

/**
 * How long ago an instant was: "3 minutes ago", "3m ago", "just now".
 *
 * @param {Date|number|string} value
 * @param {{style?: "short"|"long", now?: number}} [options] `now` pins the clock (tests, a snapshot)
 * @returns {string} "" when the value cannot be read; "just now" under 5 s and for a future stamp.
 */
export function formatAgo(value, { style = "long", now = Date.now() } = {}) {
  const at = parseInstant(value);
  if (at === null) return "";
  const age = Number(now) - at;
  if (!(age >= 5 * SECOND)) return "just now";
  return `${formatDuration(age, { style })} ago`;
}

/**
 * The markup of a `.when` cell, escaped: how long ago over the exact stamp, the UTC instant on the
 * tip. `inline` is the card-foot form — a clock glyph and the short age, both stamps on the tip.
 *
 * @param {Date|number|string} value
 * @param {{inline?: boolean, style?: "short"|"long"}} [options] style defaults to long in a table
 *   and short inline (Daniel's "3 minutes ago" is the when column's wording; "3d ago" is the cards').
 * @returns {string} "" for nothing; an unparseable value as a bare `.when-exact`, echoed.
 */
export function whenHtml(value, { inline = false, style = inline ? "short" : "long" } = {}) {
  const parts = stampParts(value);
  if (!parts.text) return "";
  if (!parts.time) return `<span class="when-exact">${escapeHtml(parts.text)}</span>`;
  const utc = escapeHtml(parts.utc);
  const ago = escapeHtml(formatAgo(value, { style }));
  const agoStyle = style === "long" ? "" : ` data-ago-style="${escapeHtml(style)}"`;
  if (inline) {
    return `<time class="when when--inline" datetime="${utc}" data-tip="${escapeHtml(`${parts.text} · ${parts.utc}`)}">` +
      `<span class="ico ico--sm" data-icon="clock" aria-hidden="true"></span>` +
      `<span data-ago="${utc}"${agoStyle}>${ago}</span></time>`;
  }
  return `<time class="when" datetime="${utc}" data-tip="${utc}">` +
    `<span class="when-ago" data-ago="${utc}"${agoStyle}>${ago}</span>` +
    `<span class="when-exact">${escapeHtml(parts.text)}</span></time>`;
}

let relativeTimes = false;

/**
 * Keep every `[data-ago]` label true: rewritten every 30 s while the tab is visible, and at once
 * when it becomes visible again. A relative label computed once and never re-checked is this
 * estate's most repeated bug — a page left open overnight still claiming "3 minutes ago" at
 * breakfast. Idempotent; a second call only re-ticks.
 *
 * It writes textContent, and only where the text changed, so a renderer that patches the same row
 * from fresh markup simply agrees with it. Nodes rendered later need nothing: each tick reads the
 * document afresh.
 */
export function initRelativeTimes() {
  const tick = () => {
    for (const el of document.querySelectorAll("[data-ago]")) {
      const next = formatAgo(el.getAttribute("data-ago"), { style: el.getAttribute("data-ago-style") || "long" });
      if (next && el.textContent !== next) el.textContent = next;
    }
  };
  tick();
  if (relativeTimes) return;
  relativeTimes = true;
  // 30 s and paused while hidden: a relative label is only ever read by someone looking at it, and a
  // background tab rewriting a hundred rows every 30 s is a cost nobody sees the benefit of.
  setInterval(() => {
    if (!document.hidden) tick();
  }, 30 * SECOND);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
}
