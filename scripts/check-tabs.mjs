#!/usr/bin/env node
/*
 * check-tabs.mjs — runtime/tabs.js in a real browser: APG keys, deep links, nesting, the one event.
 *
 * WHAT IS AT RISK. Cockpit ran five tab engines and each shipped a different subset of these, which
 * is how every one of them was found — by a reader, afterwards:
 *   · a lazy panel bound to "click" sat on "loading…" for ever when it was reached by the arrow keys
 *     or a link, because only one of three routes dispatched anything. So `tab-activated` is asserted
 *     on EVERY route: a mouse click, a key, an incoming hash, `tab.click()` from code, the initial
 *     selection — and on the inner group when an outer activation reveals it;
 *   · a deep link into a nested panel unhid it inside an ancestor that stayed hidden — a dead link;
 *   · the ancestor wrote the hash LAST, so the address named the wrong panel and a reload landed on the
 *     wrong tab. Asserted: only the innermost panel is written, only by a group that opted in;
 *   · a tablist rendered after load had no roving tabindex and no initial state.
 * And the APG keyboard model itself: ←/→ with wrap, Home/End, disabled tabs skipped (both `disabled`
 * and `aria-disabled`), Alt+arrow left to the browser. The keys are REAL key events through the
 * DevTools input pipeline, not synthetic dispatches, so the page's own keydown handling is what runs.
 *
 * The shipped module is imported from this checkout over a loopback server. Headless chromium as in the
 * other checks; it SKIPS loudly without one (DD_REQUIRE_BROWSER=1 makes that a failure).
 *
 *   node scripts/check-tabs.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, reporter, requireBrowser, serve, sleep } from "./lib/chromium.mjs";

requireBrowser("check-tabs", "Keys, focus, the hash and a MutationObserver are browser behaviour; no stub can prove them.");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = reporter("check-tabs");

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/data.css"></head><body>
<div class="tabs" role="tablist" aria-label="outer" data-tabs-hash id="outer">
  <button type="button" class="tab" role="tab" id="t-a" aria-controls="p-a" aria-selected="true">a</button>
  <button type="button" class="tab" role="tab" id="t-b" aria-controls="p-b">b</button>
  <button type="button" class="tab" role="tab" id="t-c" aria-controls="p-c" aria-disabled="true">c</button>
  <button type="button" class="tab" role="tab" id="t-d" aria-controls="p-d">d</button>
  <button type="button" class="tab" role="tab" id="t-e" aria-controls="p-e" disabled>e</button>
</div>
<section id="p-a" role="tabpanel" aria-labelledby="t-a">panel a</section>
<section id="p-b" role="tabpanel" aria-labelledby="t-b">
  <div class="tabs tabs--compact" role="tablist" aria-label="inner" data-tabs-hash id="inner">
    <button type="button" class="tab" role="tab" id="t-ia" aria-controls="p-ia" aria-selected="true">ia</button>
    <button type="button" class="tab" role="tab" id="t-ib" aria-controls="p-ib">ib</button>
  </div>
  <div id="p-ia" role="tabpanel" aria-labelledby="t-ia">inner a</div>
  <div id="p-ib" role="tabpanel" aria-labelledby="t-ib">inner b</div>
</section>
<section id="p-c" role="tabpanel" aria-labelledby="t-c">panel c</section>
<section id="p-d" role="tabpanel" aria-labelledby="t-d">
  <div class="tabs" role="tablist" aria-label="buried" id="buried">
    <button type="button" class="tab" role="tab" id="t-h1" aria-controls="p-h1">h1</button>
    <button type="button" class="tab" role="tab" id="t-h2" aria-controls="p-h2">h2</button>
  </div>
  <div id="p-h1" role="tabpanel">h1</div><div id="p-h2" role="tabpanel">h2</div>
</section>
<section id="p-e" role="tabpanel" aria-labelledby="t-e">panel e</section>
<div class="tabs" role="tablist" aria-label="side" id="side">
  <button type="button" class="tab" role="tab" id="t-s1" aria-controls="p-s1">s1</button>
  <button type="button" class="tab" role="tab" id="t-s2" aria-controls="p-s2">s2</button>
</div>
<div id="p-s1" role="tabpanel">s1</div><div id="p-s2" role="tabpanel">s2</div>
<div id="later"></div>
<script type="module">
  import { initTabs } from "/runtime/tabs.js";
  window.events = [];
  // Whether each key's default action (scrolling the page, for Home/End and the arrows) was cancelled.
  // Read on window, which hears a keydown after the document listener that handles it.
  window.keys = [];
  addEventListener("keydown", (event) => window.keys.push(event.key + ":" + event.defaultPrevented));
  document.addEventListener("tab-activated", (event) => window.events.push(
    event.target.id + ">" + (event.detail && event.detail.panel ? event.detail.panel.id : "none") + (event.bubbles ? "" : "(no-bubble)")));
  window.initTabs = initTabs;
  window.sel = (list) => Array.from(document.querySelectorAll("#" + list + " [role=tab]"))
    .filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.id).join(",");
  window.shown = () => Array.from(document.querySelectorAll("[role=tabpanel]")).filter((p) => !p.hidden).map((p) => p.id).join(",");
  window.roving = (list) => Array.from(document.querySelectorAll("#" + list + " [role=tab]")).map((t) => t.id + ":" + t.tabIndex).join(",");
  window.focused = () => document.activeElement && document.activeElement.id;
  window.ready = true;
</script></body></html>`;

const server = await serve(root, { "/__tabs.html": HARNESS });
const browser = await launch("tabs");
const { evaluate, until, navigate, press, send } = browser;
// A fresh query every time: the same URL with a new hash is a fragment navigation, not a new page.
let loads = 0;
const open = async (hash = "") => {
  loads += 1;
  await navigate(`${server.origin}/__tabs.html?load=${loads}${hash}`);
  await until("window.ready === true");
};
const state = () => evaluate(`JSON.stringify({ outer: sel("outer"), inner: sel("inner"), side: sel("side"), shown: shown(),
  hash: location.hash, focused: focused(), events })`);
const clickAt = async (id) => {
  const box = await evaluate(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
};

/* ── the initial state ────────────────────────────────────────────────────────────────────────── */

await open();
await evaluate("window.initTabs(); null");
await check("a group keeps the tab its markup selected, and hides every other panel of the group",
  () => evaluate(`sel("outer") === "t-a" && shown().split(",").includes("p-a") && !shown().split(",").includes("p-b")`), state);
await check("a group with NO selected tab selects its first",
  () => evaluate(`sel("side") === "t-s1" && shown().split(",").includes("p-s1") && !shown().split(",").includes("p-s2")`), state);
await check("roving tabindex: 0 on the selected tab, -1 on the rest (one Tab stop per row)",
  () => evaluate(`roving("outer") === "t-a:0,t-b:-1,t-c:-1,t-d:-1,t-e:-1"`), () => evaluate(`roving("outer")`));
await check("tab-activated fires at start for each VISIBLE group's selection, bubbling, with detail.panel — and not for groups inside a hidden panel",
  () => evaluate(`events.join(" ") === "t-a>p-a t-s1>p-s1"`), state);

/* ── a click, and what it reveals ─────────────────────────────────────────────────────────────── */

await evaluate("events.length = 0; window.entries = history.length; null");
await clickAt("t-b");
await check("a mouse click selects the tab and shows its panel",
  () => evaluate(`sel("outer") === "t-b" && shown().split(",").includes("p-b") && !shown().split(",").includes("p-a")`), state);
await check("...fires tab-activated on it — and on the inner group's selected tab, whose panel it just revealed",
  () => evaluate(`events.join(" ") === "t-b>p-b t-ia>p-ia"`), state);
await check("...and a group with data-tabs-hash writes the panel into the address (replaceState, no history entry)",
  () => evaluate(`location.hash === "#p-b" && history.length === window.entries`), () => evaluate("location.hash + ' ' + history.length"));

/* ── the keyboard ─────────────────────────────────────────────────────────────────────────────── */

await evaluate(`document.getElementById("t-b").focus(); events.length = 0; keys.length = 0; null`);
await press("ArrowRight");
await check("→ moves focus AND selection to the next tab, skipping an aria-disabled one (c)",
  () => evaluate(`focused() === "t-d" && sel("outer") === "t-d" && shown().split(",").includes("p-d")`), state);
await press("ArrowRight");
await check("→ on the last enabled tab wraps to the first, skipping a disabled one (e)",
  () => evaluate(`focused() === "t-a" && sel("outer") === "t-a"`), state);
await press("ArrowLeft");
await check("← on the first wraps to the last enabled tab", () => evaluate(`focused() === "t-d" && sel("outer") === "t-d"`), state);
await press("Home");
await check("Home goes to the first tab", () => evaluate(`focused() === "t-a" && sel("outer") === "t-a"`), state);
await press("End");
await check("End goes to the last ENABLED tab", () => evaluate(`focused() === "t-d" && sel("outer") === "t-d"`), state);
await check("...and the keys are the tab row's: each one's default action is cancelled, so Home and End do not also scroll the page",
  () => evaluate(`keys.join() === "ArrowRight:true,ArrowRight:true,ArrowLeft:true,Home:true,End:true"`), () => evaluate("keys.join()"));
await check("every key activation fired tab-activated — and d, whose panel holds a group, revealed and announced it — with the address on the panel",
  () => evaluate(`events.join(" ") === "t-d>p-d t-h1>p-h1 t-a>p-a t-d>p-d t-h1>p-h1 t-a>p-a t-d>p-d t-h1>p-h1" && location.hash === "#p-d"`), state);
await press("ArrowLeft", 1 /* Alt */);
await check("Alt+← is left to the browser (history back), not taken by the tab row",
  () => evaluate(`focused() === "t-d" && sel("outer") === "t-d" && keys.at(-1) === "ArrowLeft:false"`), state);

/* ── disabled, the code route, the opt-in hash ────────────────────────────────────────────────── */

await evaluate(`events.length = 0; document.getElementById("t-c").click(); null`);
await check("an aria-disabled tab does nothing when clicked — no selection, no event",
  () => evaluate(`sel("outer") === "t-d" && events.length === 0`), state);
await evaluate(`history.replaceState(null, "", "#untouched"); events.length = 0; document.getElementById("t-s2").click(); null`);
await check("tab.click() from code is a route like any other — it selects and fires tab-activated",
  () => evaluate(`sel("side") === "t-s2" && events.join(" ") === "t-s2>p-s2"`), state);
await check("...and a group WITHOUT data-tabs-hash leaves the address alone (a card's tab row must not rewrite it)",
  () => evaluate(`location.hash === "#untouched"`), () => evaluate("location.hash"));

/* ── the hash, for the life of the page ───────────────────────────────────────────────────────── */

await evaluate(`events.length = 0; location.hash = "#p-ib"; null`);
await until(`sel("inner") === "t-ib"`, "the hashchange to #p-ib");
await check("a hashchange to a NESTED panel opens its ancestor first, then the panel",
  () => evaluate(`sel("outer") === "t-b" && sel("inner") === "t-ib" && shown().split(",").includes("p-b") && shown().split(",").includes("p-ib")`), state);
await check("...announcing the ancestor that changed (and, through it, the inner tab)",
  () => evaluate(`events.join(" ") === "t-b>p-b t-ib>p-ib"`), state);
await check("...and it does not rewrite the address it is following", () => evaluate(`location.hash === "#p-ib"`), state);
await evaluate(`events.length = 0; document.getElementById("t-ia").focus(); null`);
await press("ArrowRight");
await check("inside the nested row, a key writes the INNER panel into the address — never the ancestor's",
  () => evaluate(`sel("inner") === "t-ib" && location.hash === "#p-ib"`), state);
await clickAt("t-ia");
await check("...and so does a click", () => evaluate(`sel("inner") === "t-ia" && location.hash === "#p-ia" && sel("outer") === "t-b"`), state);
await evaluate(`events.length = 0; location.hash = "#nothing-here"; null`);
await new Promise((resolve) => setTimeout(resolve, 100));
await check("a hash that names no panel changes nothing", () => evaluate(`sel("outer") === "t-b" && events.length === 0`), state);

/* ── a tablist rendered later ─────────────────────────────────────────────────────────────────── */

await evaluate(`events.length = 0; document.getElementById("later").innerHTML =
  '<div class="tabs" role="tablist" aria-label="late" id="late">' +
  '<button type="button" class="tab" role="tab" id="t-l1" aria-controls="p-l1" disabled>l1</button>' +
  '<button type="button" class="tab" role="tab" id="t-l2" aria-controls="p-l2">l2</button>' +
  '<button type="button" class="tab" role="tab" id="t-l3" aria-controls="p-l3">l3</button></div>' +
  '<div id="p-l1" role="tabpanel">l1</div><div id="p-l2" role="tabpanel">l2</div><div id="p-l3" role="tabpanel">l3</div>'; null`);
await until(`sel("late") !== ""`, "the late tablist to be adopted");
await check("a tablist added after initTabs() gets its initial state — the first ENABLED tab, the rest hidden",
  () => evaluate(`sel("late") === "t-l2" && roving("late") === "t-l1:-1,t-l2:0,t-l3:-1" && shown().split(",").includes("p-l2") && !shown().split(",").includes("p-l3")`),
  () => evaluate(`roving("late") + " " + shown()`));
await check("...and is announced, since it is visible", () => evaluate(`events.join(" ") === "t-l2>p-l2"`), state);
await evaluate(`document.getElementById("t-l2").focus(); null`);
await press("ArrowRight");
await check("...and its keys work", () => evaluate(`focused() === "t-l3" && sel("late") === "t-l3"`), state);
await evaluate(`document.getElementById("side").innerHTML =
  '<button type="button" class="tab" role="tab" id="t-s1" aria-controls="p-s1" aria-selected="true">s1</button>' +
  '<button type="button" class="tab" role="tab" id="t-s2" aria-controls="p-s2">s2</button>'; null`);
await until(`roving("side") === "t-s1:0,t-s2:-1"`, "re-rendered tabs to get their tabindex back");
await check("tabs RE-RENDERED inside a tablist that stayed get their roving tabindex back",
  () => evaluate(`roving("side") === "t-s1:0,t-s2:-1" && shown().split(",").includes("p-s1") && !shown().split(",").includes("p-s2")`),
  () => evaluate(`roving("side") + " " + shown()`));
await evaluate(`window.initTabs(); window.initTabs(); events.length = 0; document.getElementById("t-s2").click(); null`);
await check("initTabs() is idempotent: after three calls one click fires ONE event",
  () => evaluate(`events.join(" ") === "t-s2>p-s2"`), state);

/* ── a deep link on arrival ───────────────────────────────────────────────────────────────────── */

await open("#p-ib");
await evaluate("window.initTabs(); null");
await check("arriving on #p-ib opens the ancestor b and the inner tab ib — not the markup's a and ia",
  () => evaluate(`sel("outer") === "t-b" && sel("inner") === "t-ib" && shown().split(",").includes("p-ib") && !shown().split(",").includes("p-ia") && !shown().split(",").includes("p-a")`),
  state);
await check("...keeps the address it arrived on", () => evaluate(`location.hash === "#p-ib"`), state);
await check("...and announces outer before inner — ancestors first",
  () => evaluate(`events.join(" ") === "t-b>p-b t-ib>p-ib t-s1>p-s1"`), state);

await open("#p-e");
await evaluate("window.initTabs(); null");
await check("a deep link to a DISABLED tab's panel is not honoured — the markup's selection stands",
  () => evaluate(`sel("outer") === "t-a" && shown().split(",").includes("p-a")`), state);

/* ── a DOM patcher re-renders the row ─────────────────────────────────────────────────────────────
   cockpit re-renders with `cockpitPatch` (cockpit/pages/dom-patch.js), which writes ATTRIBUTES into
   the nodes already there instead of replacing them — so no childList record ever fires. Before
   0.60.0's fix one patch left every tab at tabindex 0, left panels outside the mount on the old
   selection, and changed a selection with no tab-activated. The REAL patcher is driven, read from
   the danieldeusing-infra checkout beside this one (or DD_COCKPIT_DOM_PATCH), through three shapes:
     S1 · cockpit's own: the renderer mirrors the selection it heard in tab-activated, panels inside
          the mount, no tabindex in its markup;
     S2 · the documented markup, a fixed selection, panels OUTSIDE the mount;
     S3 · the same with the panels inside. */
const parents = (dir) => { const out = []; while (dirname(dir) !== dir) { dir = dirname(dir); out.push(dir); } return out; };
const DOM_PATCH = [process.env.DD_COCKPIT_DOM_PATCH, ...parents(root).map((dir) => join(dir, "danieldeusing-infra", "cockpit", "pages", "dom-patch.js"))]
  .find((path) => path && existsSync(path));
if (!DOM_PATCH) {
  console.log("check-tabs: the dom-patch section SKIPPED — no danieldeusing-infra checkout beside this one (set DD_COCKPIT_DOM_PATCH).");
} else {
  const PATCH = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/data.css">
<script>${readFileSync(DOM_PATCH, "utf8").replaceAll("</script", "<\\/script")}</script></head><body>
<button type="button" id="start">start</button>
<div id="m1"></div>
<div id="m2"></div><div id="s2-p-a" role="tabpanel">a</div><div id="s2-p-b" role="tabpanel" hidden>b</div><div id="s2-p-c" role="tabpanel" hidden>c</div>
<div id="m3"></div>
<script type="module">
  import { initTabs } from "/runtime/tabs.js";
  const H = ["a", "b", "c"];
  window.events = [];
  document.addEventListener("tab-activated", (e) => window.events.push(e.target.id));
  let open1 = "a";
  document.addEventListener("tab-activated", (e) => { if (e.target.id.startsWith("s1-")) open1 = e.target.id.slice(3); });
  const html1 = () => '<div class="tabs" role="tablist" aria-label="s1">' +
    H.map((h) => '<button type="button" class="tab" role="tab" id="s1-' + h + '" aria-controls="s1-p-' + h + '" aria-selected="' + (open1 === h) + '">' + h + "</button>").join("") +
    "</div>" + H.map((h) => '<div id="s1-p-' + h + '" role="tabpanel"' + (open1 === h ? "" : " hidden") + ">" + h + "</div>").join("");
  const html2 = () => '<div class="tabs" role="tablist" aria-label="s2">' +
    H.map((h, i) => '<button type="button" class="tab" role="tab" id="s2-' + h + '" aria-controls="s2-p-' + h + '" aria-selected="' + (i === 0) + '"' + (i ? ' tabindex="-1"' : "") + ">" + h + "</button>").join("") + "</div>";
  const html3 = () => html2().replaceAll("s2", "s3") + H.map((h, i) => '<div id="s3-p-' + h + '" role="tabpanel"' + (i ? " hidden" : "") + ">" + h + "</div>").join("");
  window.R = {
    s1: () => cockpitPatch(document.getElementById("m1"), html1()),
    s2: () => cockpitPatch(document.getElementById("m2"), html2()),
    s3: () => cockpitPatch(document.getElementById("m3"), html3()),
  };
  window.state = (p) => JSON.stringify({
    selected: H.filter((h) => document.getElementById(p + "-" + h).getAttribute("aria-selected") === "true").join(","),
    tabIndex: H.map((h) => document.getElementById(p + "-" + h).tabIndex).join(","),
    shown: H.filter((h) => !document.getElementById(p + "-p-" + h).hidden).join(","),
  });
  R.s1(); R.s2(); R.s3();
  initTabs();
  window.ready = true;
</script></body></html>`;
  const patchServer = await serve(root, { "/__patch.html": PATCH });
  await navigate(`${patchServer.origin}/__patch.html`);
  await until("window.ready === true");
  const after = {};
  for (const p of ["s1", "s2", "s3"]) {
    await evaluate(`document.getElementById("${p}-b").click(); events.length = 0; R.${p}(); null`);
    await sleep(100); // the MutationObserver's turn
    after[p] = { ...JSON.parse(await evaluate(`state("${p}")`)), events: await evaluate("events.join(' ')") };
  }
  console.log(`dom-patch: ${DOM_PATCH}`);
  await check("S1 — cockpit's renderer mirrors the selection: after a patch the row keeps ONE tab stop, on the selected tab, and says nothing",
    () => after.s1.selected === "b" && after.s1.tabIndex === "-1,0,-1" && after.s1.shown === "b" && after.s1.events === "", JSON.stringify(after.s1));
  await check("S2 — a patch that puts the selection back on a: the panels OUTSIDE the mount follow the bar, one tab stop, and tab-activated says so",
    () => after.s2.selected === "a" && after.s2.tabIndex === "0,-1,-1" && after.s2.shown === "a" && after.s2.events === "s2-a", JSON.stringify(after.s2));
  await check("S3 — the same with the panels inside the mount: consistent, and the changed selection is announced",
    () => after.s3.selected === "a" && after.s3.tabIndex === "0,-1,-1" && after.s3.shown === "a" && after.s3.events === "s3-a", JSON.stringify(after.s3));
  await evaluate(`document.getElementById("start").focus(); null`);
  const stops = [];
  for (let i = 0; i < 3; i += 1) { await press("Tab"); stops.push(await evaluate("document.activeElement.id")); }
  await check("...and Tab walks one stop per row, onto each row's selected tab", () => stops.join() === "s1-b,s2-a,s3-a", stops.join());
  patchServer.close();
}

browser.close();
server.close();
done();
