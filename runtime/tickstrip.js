/*
 * tickstrip.js — the ticker strip: one row per poller, kept true while the page is open.
 *
 * Markup contract: a mount, and registrations that may arrive before or after this module runs.
 *
 *   <div class="tickstrip" id="tickers" data-label="pollers"></div>
 *
 *   (window.__ddTicks ||= []).push({ mount: "tickers", key: "review-poll", order: 1, label: "review poll",
 *     lastAt: "2026-09-28T12:03:40Z", intervalMs: 60000, stats: [[3, "queued"]], busy: { since: null }, hint: "…" });
 *   window.__ddTickRender?.();
 *   (window.__ddTickRefreshers ||= []).push(refreshQueue);
 *
 * Every poller answers the same four questions — what ran, when, when next, what did it count — and
 * each page used to answer them in its own prose box. One row shape makes "is anything stalled?" a
 * glance down a column. chrome.css draws the strip (it is page-level status furniture, and netmon
 * loads chrome.css without components.css); this module renders it and keeps it current.
 *
 * REGISTRATION IS A PLAIN ARRAY, NOT A FUNCTION CALL. Pages build their panels in inline scripts that
 * run BEFORE a module at the end of <body>, so anything a page had to CALL would not exist yet.
 * Cockpit's first version used `window.cockpitTickRegister?.(…)` and the optional chain swallowed
 * every call on a cold load — a strip that rendered nothing, silently. So a page only pushes onto an
 * array that needs nothing defined, and pokes the renderer if it happens to be there. `key` lets a
 * re-registration replace its row instead of appending one; `order` fixes the row order so it does
 * not depend on which fetch finished first. Pages only ever push, so the array is compacted to the
 * latest entry per mount+key on every render — left alone it grew without bound on a page left
 * open, and the 1 s clock re-scanned all of it every second.
 *
 * TWO LOOPS, AND SHIPPING ONLY THE FIRST IS A STRIP THAT LIES CONVINCINGLY. The 1 s clock re-renders
 * from timestamps already in memory, so "5s ago · next 55s" advances with no network. On its own it
 * ages a `lastAt` fetched ONCE: the row climbs to the stale threshold and turns red claiming the
 * job has stopped, and a manual refresh turns it green again — the signature of the page being wrong
 * rather than the job (cockpit, 2026-08: the drain's heartbeat was 38 s old while its row was red).
 * So a page also registers HOW TO LOOK AGAIN — a refresher, run every 30 s. 30 s is chosen against
 * the threshold: the worst case shows one job interval plus one poll old, 90 s for a 60 s poller,
 * well under the 180 s that means stopped. A refresher must be NARROW: it re-fetches the numbers,
 * never a whole `load()` that re-renders a form the reader is typing into. Both loops pause while
 * the tab is hidden and both run at once when it returns, so a returning reader never sees a number
 * from before they looked away.
 *
 * STATES, in order: `never` (no readable `lastAt` — rendered as its own thing, never as "0 ago");
 * `running` (`busy.since` parses: a run is in flight, "running 3m", and it is never red — `lastAt` is
 * when a run FINISHED, so a job whose run outlasts three intervals would otherwise redden while
 * working perfectly); `stale` (older than three intervals: one missed tick is jitter, three is a
 * poller that stopped); otherwise `ok`. `busy.since` must PARSE to count: `Date.parse` of anything
 * odd is NaN, and NaN arithmetic once made an unreadable marker suppress the red for ever.
 *
 * THE FIRST PAINT BUILDS THE TABLE; EVERY LATER ONE PATCHES IT, ROW BY ROW, BY `key` — the state
 * class and the text that changed, nothing else. A tip open over a row, and whatever holds focus,
 * survive the 1 s clock; `innerHTML =` on every tick would destroy both once a second.
 *
 * IT IS A NAMED DATA TABLE. A visually hidden caption (the mount's `data-label`), a visually hidden
 * header row (state · poller · last run · next run · figures) and a visually hidden state word in
 * every row: a screen reader gets the strip as a table, where cockpit's was a role-less `div` whose
 * label nothing announced. It is deliberately NOT a live region — it changes every second.
 */
import { formatAgo, formatDuration, parseInstant } from "./time.js";

const COLUMNS = ["state", "poller", "last run", "next run", "figures"];

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// One registration -> what its row says, at `now`.
function describe(item, now) {
  const last = parseInstant(item.lastAt);
  const since = parseInstant(item.busy && item.busy.since);
  const interval = Number(item.intervalMs) > 0 ? Number(item.intervalMs) : 0;
  const running = since === null ? null : Math.max(0, now - since);
  const state = last === null ? "never" : running !== null ? "running" : interval && now - last > interval * 3 ? "stale" : "ok";
  const dueIn = last !== null && interval ? last + interval - now : null;
  return {
    state,
    last: last === null ? "never run" : formatAgo(last, { style: "short", now }),
    next: running !== null ? `running ${formatDuration(running)}` : dueIn === null ? "—" : dueIn <= 0 ? "due now" : `next ${formatDuration(dueIn)}`,
    stats: (item.stats || []).map(([n, label]) => `<b>${esc(n)}</b> ${esc(label)}`).join('<i class="tick-sep" aria-hidden="true">·</i>'),
    hint: item.hint ? String(item.hint) : "",
  };
}

function rowHtml(item, view) {
  return `<tr class="tick tick--${view.state}" data-key="${esc(item.key)}"${view.hint ? ` data-tip="${esc(view.hint)}"` : ""}>` +
    `<td class="tick-dot"><span class="visually-hidden">${view.state}</span></td>` +
    `<td class="tick-name">${esc(item.label)}</td>` +
    `<td class="tick-last">${esc(view.last)}</td>` +
    `<td class="tick-next">${esc(view.next)}</td>` +
    `<td class="tick-stats">${view.stats}</td></tr>`;
}

function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function patchRow(row, item, view) {
  const cls = `tick tick--${view.state}`;
  if (row.className !== cls) row.className = cls;
  if (view.hint) {
    if (row.getAttribute("data-tip") !== view.hint) row.setAttribute("data-tip", view.hint);
  } else if (row.hasAttribute("data-tip")) row.removeAttribute("data-tip");
  const [dot, name, last, next, stats] = row.cells;
  setText(dot.firstElementChild, view.state);
  setText(name, String(item.label ?? ""));
  setText(last, view.last);
  setText(next, view.next);
  if (stats.innerHTML !== view.stats) stats.innerHTML = view.stats;
}

/**
 * Render `items` into `mount` — the first time as a table, every time after by patching each row in
 * place by `key`.
 *
 * @param {HTMLElement|string} mount the `.tickstrip` element, or its id
 * @param {object[]} items registrations, already in display order
 */
export function renderTickStrip(mount, items) {
  const host = typeof mount === "string" ? document.getElementById(mount) : mount;
  if (!host) return;
  // Empty means empty: `.tickstrip:not(:empty)` draws the box only when there is something in it.
  if (!items || !items.length) {
    if (host.firstChild) host.replaceChildren();
    return;
  }
  const now = Date.now();
  const caption = host.getAttribute("data-label") || "pollers";
  let table = host.querySelector("table.ticktable");
  if (!table) {
    host.innerHTML = `<table class="ticktable"><caption class="visually-hidden">${esc(caption)}</caption>` +
      `<thead><tr>${COLUMNS.map((c) => `<th scope="col"><span class="visually-hidden">${c}</span></th>`).join("")}</tr></thead>` +
      `<tbody>${items.map((item) => rowHtml(item, describe(item, now))).join("")}</tbody></table>`;
    return;
  }
  if (table.caption) setText(table.caption, caption);
  const body = table.tBodies[0];
  const byKey = new Map(Array.from(body.rows, (row) => [row.getAttribute("data-key"), row]));
  let cursor = body.firstElementChild;
  for (const item of items) {
    const view = describe(item, now);
    let row = byKey.get(String(item.key));
    if (row) {
      byKey.delete(String(item.key));
      patchRow(row, item, view);
    } else {
      body.insertAdjacentHTML("beforeend", rowHtml(item, view));
      row = body.lastElementChild;
    }
    // Moved only when out of place, so an unchanged order touches no row at all.
    if (row !== cursor) body.insertBefore(row, cursor);
    cursor = row.nextElementSibling;
  }
  for (const gone of byKey.values()) gone.remove();
}

// Drain the registrations: the latest per mount+key, written back IN PLACE so a page holding the
// array still holds the live one, then one render per mount in `order`.
function renderAll() {
  const ticks = (window.__ddTicks ||= []);
  const byMount = new Map();
  for (const item of ticks) {
    if (!byMount.has(item.mount)) byMount.set(item.mount, new Map());
    byMount.get(item.mount).set(item.key, item);
  }
  const latest = [];
  for (const rows of byMount.values()) latest.push(...rows.values());
  ticks.splice(0, ticks.length, ...latest);
  for (const [mount, rows] of byMount) {
    renderTickStrip(mount, Array.from(rows.values()).sort((a, b) => (a.order || 0) - (b.order || 0)));
  }
}

function refreshAll() {
  for (const refresh of window.__ddTickRefreshers || []) {
    try {
      refresh();
    } catch (error) {
      // One page's refresher must not stop the others; the page learns of it on the console.
      console.error("tickstrip: a refresher threw", error);
    }
  }
}

let started = false;

/**
 * Render every registered strip now, then keep them true: from memory every second, and through the
 * registered refreshers every 30 s — both paused while the tab is hidden. Idempotent.
 */
export function initTickStrips() {
  window.__ddTickRefreshers ||= [];
  window.__ddTickRender = renderAll;
  renderAll();
  if (started) return;
  started = true;
  let clock = null;
  let refresh = null;
  const start = () => {
    clock ||= setInterval(renderAll, 1000);
    refresh ||= setInterval(refreshAll, 30_000);
  };
  const stop = () => {
    clearInterval(clock);
    clearInterval(refresh);
    clock = null;
    refresh = null;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
      return;
    }
    renderAll();
    refreshAll();
    start();
  });
  if (!document.hidden) start();
}
