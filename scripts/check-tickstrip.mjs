#!/usr/bin/env node
/*
 * check-tickstrip.mjs — runtime/tickstrip.js in a real browser: the states, the patching, the loops.
 *
 * WHAT IS AT RISK, and each of these shipped in cockpit before it was caught:
 *   · STALE THAT IS NOT STALE. A job whose run outlasts three of its intervals froze `lastAt` and turned
 *     its row red while it was working perfectly; `busy.since` fixes that — and an UNREADABLE
 *     `busy.since` once made NaN arithmetic suppress the red for ever. Both directions are asserted.
 *   · A STRIP THAT LIES CONVINCINGLY. The 1 s clock alone ages a `lastAt` fetched once; the refreshers
 *     are what keep the data true. Asserted: every refresher runs every 30 s, one registered late joins,
 *     one that throws does not stop the others — and BOTH loops stop while the tab is hidden and run at
 *     once when it returns.
 *   · THE PLAIN-ARRAY HANDSHAKE. A registration pushed before the module exists must render; the array
 *     must not grow without bound on a page left open (it is compacted in place, same array object).
 *   · innerHTML ON EVERY TICK. The strip re-renders every second; rebuilding it would destroy an open
 *     tip and whatever holds focus once a second. Asserted by IDENTITY: the same row and cell nodes
 *     after a re-render that changed their text and their state.
 *   · A NAMED TABLE. A caption, a header row and a state word per row, read from the accessibility tree
 *     itself, and no live region.
 *
 * Timers are captured before the module loads, so the clock and the refresh can be fired on demand
 * instead of waited for. Visibility is set by overriding `document.hidden` and dispatching
 * `visibilitychange` — exactly the interface the module reads.
 *
 *   node scripts/check-tickstrip.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, reporter, requireBrowser, serve } from "./lib/chromium.mjs";

requireBrowser("check-tickstrip", "Timers, visibility, node identity and the accessibility tree are browser behaviour.");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = reporter("check-tickstrip");

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/chrome.css"></head><body>
<div class="tickstrip" id="tickers" data-label="pollers"></div>
<div class="tickstrip" id="other"></div>
<script>
  window.timers = new Map();
  let nextTimer = 1;
  window.setInterval = (fn, ms) => { const id = nextTimer++; window.timers.set(id, { fn, ms }); return id; };
  window.clearInterval = (id) => { window.timers.delete(id); };
  window.fire = (ms) => { for (const t of Array.from(window.timers.values())) if (t.ms === ms) t.fn(); };
  window.active = () => Array.from(window.timers.values()).map((t) => t.ms).sort((a, b) => a - b).join(",");
  window.hide = (hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  window.ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
  // Registered BEFORE the module exists, the way a page's inline script does.
  (window.__ddTicks ||= []).push({ mount: "tickers", key: "early", order: 9, label: "registered before the module", lastAt: ago(5), intervalMs: 60000 });
  window.__ddTickRender?.();
  window.calls = { a: 0, late: 0 };
  (window.__ddTickRefreshers ||= []).push(() => { throw new Error("a broken refresher"); }, () => { window.calls.a += 1; });
</script>
<script type="module">
  import { initTickStrips, renderTickStrip } from "/runtime/tickstrip.js";
  window.initTickStrips = initTickStrips;
  window.renderTickStrip = renderTickStrip;
  window.row = (key, mount = "tickers") => document.querySelector("#" + mount + ' tr[data-key="' + key + '"]');
  window.cells = (key) => { const r = window.row(key); return r ? Array.from(r.cells).map((c) => c.textContent) : null; };
  window.state = (key) => { const r = window.row(key); return r ? r.className : null; };
  window.ready = true;
</script></body></html>`;

const server = await serve(root, { "/__ticks.html": HARNESS });
const browser = await launch("tickstrip");
const { evaluate, until, navigate, send } = browser;
await navigate(`${server.origin}/__ticks.html`);
await until("window.ready === true");
const dump = () => evaluate(`JSON.stringify({ rows: Array.from(document.querySelectorAll("#tickers tr[data-key]")).map((r) => [r.dataset.key, r.className, Array.from(r.cells).map((c) => c.textContent)]), ticks: (window.__ddTicks || []).length, active: active() })`);

/* ── the handshake ─────────────────────────────────────────────────────────────────────────────── */

await evaluate("window.firstArray = window.__ddTicks; window.initTickStrips(); null");
await check("a registration pushed BEFORE the module ran is rendered by initTickStrips() — nothing had to exist to push",
  () => evaluate(`!!row("early") && cells("early")[1] === "registered before the module"`), dump);
await check("initTickStrips() defines window.__ddTickRender for pages that poke it after pushing",
  () => evaluate(`typeof window.__ddTickRender === "function"`));
await check("both loops run while the page is visible: the 1 s clock and the 30 s refresh",
  () => evaluate(`active() === "1000,30000"`), () => evaluate("active()"));

/* ── the four states ───────────────────────────────────────────────────────────────────────────── */

await evaluate(`window.__ddTicks.push(
  { mount: "tickers", key: "ok", order: 1, label: "ok poller", lastAt: ago(12), intervalMs: 60000, stats: [[3, "queued"], [1, "running"]], hint: "polls the forges" },
  { mount: "tickers", key: "edge", order: 2, label: "at three intervals", lastAt: ago(179), intervalMs: 60000 },
  { mount: "tickers", key: "stale", order: 3, label: "past three intervals", lastAt: ago(181), intervalMs: 60000 },
  { mount: "tickers", key: "busy", order: 4, label: "running long", lastAt: ago(600), intervalMs: 60000, busy: { since: ago(185) } },
  { mount: "tickers", key: "junkbusy", order: 5, label: "unreadable busy", lastAt: ago(600), intervalMs: 60000, busy: { since: "soon" } },
  { mount: "tickers", key: "nanbusy", order: 6, label: "NaN busy", lastAt: ago(600), intervalMs: 60000, busy: { since: NaN } },
  { mount: "tickers", key: "never", order: 7, label: "never ran", lastAt: null, intervalMs: 300000 },
  { mount: "tickers", key: "due", order: 8, label: "overdue once", lastAt: ago(70), intervalMs: 60000 },
  { mount: "tickers", key: "noint", order: 10, label: "no interval", lastAt: ago(4000) },
); window.__ddTickRender(); null`);
await check("ok: a fresh run reads its age and the next run, short style (\"12s ago\" · \"next 48s\")",
  () => evaluate(`state("ok") === "tick tick--ok" && cells("ok")[2] === "12s ago" && /^next 4[78]s$/.test(cells("ok")[3])`), dump);
await check("...and its figures, number first (\"3 queued · 1 running\"), the separator decoration only",
  () => evaluate(`row("ok").cells[4].innerHTML === '<b>3</b> queued<i class="tick-sep" aria-hidden="true">·</i><b>1</b> running'`),
  () => evaluate(`row("ok").cells[4].innerHTML`));
await check("a hint is the row's data-tip, never a native title",
  () => evaluate(`row("ok").getAttribute("data-tip") === "polls the forges" && !row("ok").hasAttribute("title")`));
await check("just under three intervals is still ok; one missed tick is jitter", () => evaluate(`state("edge") === "tick tick--ok"`), dump);
await check("past three intervals is stale", () => evaluate(`state("stale") === "tick tick--stale"`), dump);
await check("a run in flight is RUNNING and never red, however old lastAt is — \"running 3m\"",
  () => evaluate(`state("busy") === "tick tick--running" && cells("busy")[3] === "running 3m" && cells("busy")[2] === "10m ago"`), dump);
await check("an unreadable busy.since (\"soon\", NaN) is NOT a run in flight — the row is stale, not silently running for ever",
  () => evaluate(`state("junkbusy") === "tick tick--stale" && state("nanbusy") === "tick tick--stale" && cells("junkbusy")[3] === "due now"`), dump);
await check("no lastAt is \"never run\", its own state — not \"0 ago\" — with no next run",
  () => evaluate(`state("never") === "tick tick--never" && cells("never")[2] === "never run" && cells("never")[3] === "—"`), dump);
await check("a run that is due and not yet late says \"due now\"",
  () => evaluate(`state("due") === "tick tick--ok" && cells("due")[3] === "due now"`), dump);
await check("with no interval nothing can be stale and there is no next run",
  () => evaluate(`state("noint") === "tick tick--ok" && cells("noint")[3] === "—" && cells("noint")[2] === "1h ago"`), dump);
await check("rows follow `order`, not arrival",
  () => evaluate(`Array.from(document.querySelectorAll("#tickers tr[data-key]")).map((r) => r.dataset.key).join(",") === "ok,edge,stale,busy,junkbusy,nanbusy,never,due,early,noint"`), dump);

/* ── a named data table, not a live region ─────────────────────────────────────────────────────── */

await send("Accessibility.enable");
await send("DOM.enable");
const ax = async (selector) => {
  const { root: doc } = await send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
  const { nodes } = await send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
  return { role: nodes[0].role?.value, name: nodes[0].name?.value };
};
const table = await ax("#tickers table");
await check("the strip is a TABLE named by its caption (the mount's data-label), in the accessibility tree itself",
  () => table.role === "table" && table.name === "pollers", JSON.stringify(table));
const header = await ax("#tickers thead th");
await check("...with column headers a screen reader announces (state · poller · last run · next run · figures)",
  async () => header.role === "columnheader" && header.name === "state" &&
    (await evaluate(`Array.from(document.querySelectorAll("#tickers thead th")).map((th) => th.textContent + ":" + th.scope).join("|")`)) ===
      "state:col|poller:col|last run:col|next run:col|figures:col", JSON.stringify(header));
await check("...a state WORD in every row (the glyph is CSS with empty alt text, never text in the cell)",
  () => evaluate(`Array.from(document.querySelectorAll("#tickers tr[data-key] .tick-dot")).every((c) => /^(ok|running|stale|never)$/.test(c.textContent) && c.firstElementChild.classList.contains("visually-hidden"))`), dump);
await check("...and it is NOT a live region — it changes every second",
  () => evaluate(`!document.querySelector("#tickers [aria-live], #tickers[aria-live], #tickers [role=status], #tickers [role=log]")`));

/* ── patching in place ─────────────────────────────────────────────────────────────────────────── */

await evaluate(`window.keep = { row: row("ok"), cells: Array.from(row("ok").cells), table: document.querySelector("#tickers table") };
  window.__ddTicks.push({ mount: "tickers", key: "ok", order: 1, label: "ok poller", lastAt: ago(200), intervalMs: 60000, stats: [[4, "queued"]] });
  window.fire(1000); null`);
await check("the 1 s clock re-renders from memory: the row now reads stale, its age and figures updated",
  () => evaluate(`state("ok") === "tick tick--stale" && cells("ok")[2] === "3m ago" && cells("ok")[4] === "4 queued"`), dump);
await check("...by PATCHING: the same table, the same row and the same cells — a tip open over the row survives",
  () => evaluate(`document.querySelector("#tickers table") === keep.table && row("ok") === keep.row && Array.from(row("ok").cells).every((c, i) => c === keep.cells[i])`));
await check("...and a hint that went away takes its data-tip with it", () => evaluate(`!row("ok").hasAttribute("data-tip")`));
// chrome.css draws the dot as `.tick-dot::before` (0.60.0), so a glyph typed into the cell shows twice.
await check("...and after the patch every .tick-dot still holds its state WORD alone: the runtime types no ●/✕/○ into the cell",
  () => evaluate(`Array.from(document.querySelectorAll("#tickers tr[data-key] .tick-dot")).every((c) => c.childNodes.length === 1 && /^(ok|running|stale|never)$/.test(c.textContent))`), dump);
// esc() writes an apostrophe as &#39; and innerHTML reads it back as a bare apostrophe, so comparing the
// two serialisations said "changed" on every tick and rebuilt the figures once a second.
await evaluate(`window.__ddTicks.push({ mount: "tickers", key: "ok", order: 1, label: "ok poller", lastAt: ago(200), intervalMs: 60000,
  stats: [[2, "reviewer's \\"queue\\""]] }); window.fire(1000); window.keep.fig = row("ok").cells[4].firstChild; window.fire(1000); window.fire(1000); null`);
await check("figures with an apostrophe or a quote are written once, not rebuilt on every 1 s tick",
  () => evaluate(`row("ok").cells[4].firstChild === keep.fig && row("ok").cells[4].textContent === "2 reviewer's \\"queue\\""`),
  () => evaluate(`row("ok").cells[4].innerHTML`));
await evaluate(`window.keep.due = row("due"); window.__ddTicks.push({ mount: "tickers", key: "fresh", order: 1.5, label: "added later", lastAt: ago(2), intervalMs: 60000 });
  window.__ddTickRender(); null`);
await check("a key added later is inserted in its `order` position, and the rows already there are untouched",
  () => evaluate(`row("fresh").previousElementSibling === row("ok") && row("due") === keep.due && cells("fresh")[2] === "just now"`), dump);
await check("the registration array is compacted IN PLACE to one entry per mount+key — same array, bounded size",
  () => evaluate(`window.__ddTicks === window.firstArray && window.__ddTicks.length === 11`), dump);
await evaluate(`window.renderTickStrip(document.getElementById("other"), [{ key: "x", label: "<b>not markup</b>", lastAt: ago(1), intervalMs: 1000 }]); null`);
await check("renderTickStrip(element, items) renders a strip directly, and a label is text, never markup",
  () => evaluate(`row("x", "other").cells[1].textContent === "<b>not markup</b>" && !row("x", "other").querySelector("b")`));
// The first tick after the first paint must find nothing to write for a strip whose data did not
// change: every node is the one painted, with not even the figures rewritten once.
const stillStrip = await evaluate(`(async () => {
  const host = document.getElementById("other"), items = [{ key: "q", label: "queue", lastAt: null, stats: [[3, "queued"], [1, "reviewer's"]] }];
  host.replaceChildren();
  window.renderTickStrip(host, items);
  let records = 0;
  const watch = new MutationObserver((list) => { records += list.length; });
  watch.observe(host, { subtree: true, childList: true, characterData: true, attributes: true });
  window.renderTickStrip(host, items);
  await new Promise((resolve) => setTimeout(resolve, 0));
  watch.disconnect();
  return records;
})()`);
await check("the first tick over an unchanged strip writes nothing — 0 mutations, the figures included",
  () => stillStrip === 0, `${stillStrip} mutation record(s)`);
await evaluate(`window.renderTickStrip(document.getElementById("other"), []); null`);
await check("an empty list empties the mount, so `.tickstrip:not(:empty)` draws no box",
  () => evaluate(`document.getElementById("other").childNodes.length === 0`));

/* ── the refreshers, and the pause ─────────────────────────────────────────────────────────────── */

await evaluate(`window.__ddTickRefreshers.push(() => { window.calls.late += 1; }); window.fire(30000); null`);
await check("every 30 s every refresher runs — one registered after init too — and one that throws does not stop the rest",
  () => evaluate(`window.calls.a === 1 && window.calls.late === 1`), () => evaluate("JSON.stringify(window.calls)"));
await evaluate("window.hide(true); null");
await check("a HIDDEN tab stops both loops — no repaint and no fetch nobody can see",
  () => evaluate(`active() === ""`), () => evaluate("active()"));
await evaluate(`window.__ddTicks.push({ mount: "tickers", key: "ok", order: 1, label: "ok poller", lastAt: ago(1), intervalMs: 60000 }); null`);
await evaluate("window.hide(false); null");
await check("on return both run AT ONCE — the strip repaints and every refresher re-fetches without waiting a tick",
  () => evaluate(`state("ok") === "tick tick--ok" && cells("ok")[2] === "just now" && window.calls.a === 2 && window.calls.late === 2`),
  () => evaluate("JSON.stringify(window.calls) + ' ' + JSON.stringify(cells('ok'))"));
await check("...and both loops are running again", () => evaluate(`active() === "1000,30000"`), () => evaluate("active()"));
await evaluate("window.initTickStrips(); window.initTickStrips(); null");
await check("initTickStrips() is idempotent: after three calls there are still exactly two timers",
  () => evaluate(`active() === "1000,30000"`), () => evaluate("active()"));

browser.close();
server.close();
done();
