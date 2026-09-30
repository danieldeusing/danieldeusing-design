/*
 * check-tooltip-click.mjs — a tooltipped control must still RECEIVE ITS CLICKS.
 *
 * WHY THIS EXISTS. `show()` used to park the panel at the viewport ORIGIN to measure it —
 * `left: 0; top: 0` — then read getBoundingClientRect(). It runs from `mouseover`, so that
 * momentarily dropped a 340px panel into the viewport under the cursor and forced a synchronous
 * reflow. The browser's hit-test does not survive that: pointerdown/pointerup still resolved to
 * the control, but the compatibility MOUSE events resolved to an ancestor — mousedown and mouseup
 * on the <tbody> rather than the <button> — and a `click` is only generated when both land on the
 * same node. So every tipped control silently stopped being clickable. `pointer-events: none` on
 * the panel does not help and never did: the panel never receives the event, the CONTROL loses it.
 *
 * It cost cockpit both of its "join →" buttons, which were shipped with their tooltips REMOVED as
 * a workaround while this was hunted. The symptom is the worst kind: the handler is correct, the
 * element is correct, the hit-test at that pixel returns the button — and nothing happens.
 *
 * WHY IT MUST BE A REAL CLICK. `element.click()` synthesises one event and passes whatever the
 * page is doing; it reports success against the broken build. Only a dispatched mousePressed /
 * mouseReleased pair reproduces it, because the defect is precisely that the browser declines to
 * SYNTHESISE the click from a press and a release that disagreed about their target.
 *
 * WHAT EACH HALF IS WORTH, measured by running this suite against the FIXED and the BROKEN runtime
 * rather than assumed — and they are not worth the same:
 *
 *   · THE SOURCE ASSERTION at the bottom is the regression guard for THIS defect. It passes on the
 *     fix, fails on the bug, and names the offending line. That is the whole discrimination.
 *   · THE BROWSER ASSERTIONS guard the OTHER half — that the fix did not trade a dead button for a
 *     misplaced panel. Parking off-screen has to still measure the panel unconstrained and still
 *     place it below its anchor, and only a real browser can say so.
 *
 * AND INSIDE A MODAL DIALOG (0.60.0). show() now moves the panel into the open <dialog> its anchor
 * sits in, because on <body> it renders beneath the top layer. That move is a DOM write during a
 * hover — the kind of write this file exists to police — so the click is asserted again for a
 * tipped control INSIDE a modal dialog, and the panel is asserted to be actually on top there: the
 * hit test at its centre (with its pointer-events briefly on) must find the panel, not the dialog.
 *
 * AND WHAT IS DELIBERATELY NOT HERE. A click assertion on a control INSIDE the scrolled wrapper —
 * the configuration the bug was found in — was written first and then removed, because in headless
 * such a control is not hit-testable at its own centre AT ALL: `elementFromPoint` returns the
 * wrapper, and the assertion failed identically with the fix and without it. A check that reports
 * the same thing in both states is reporting on the harness, and shipping it would have meant a
 * permanently red suite that the next person deletes. The in-page reproduction lives in
 * danieldeusing-infra's session log instead, where it was measured against the real cockpit page.
 *
 *   node scripts/check-tooltip-click.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.DD_CHROME
  ? (existsSync(process.env.DD_CHROME) ? process.env.DD_CHROME : null)
  : [
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((path) => existsSync(path));

if (!CHROME) {
  console.log("check-tooltip-click: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts that a real press/release pair still produces a click, which cannot");
  console.log("  be proven against a stub. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here.");
    process.exit(1);
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PORT 0, READ BACK. A fixed 19224 was shared with the other suites, and two of them running at
// once (two worktrees, two agents) drove one browser: each opened tabs in the other's, and the first
// to finish killed the second mid-run. The browser picks a free port and writes it to its profile.
const profile = mkdtempSync(join(tmpdir(), "dd-tooltipclick-"));
const chrome = spawn(CHROME, [
  "--remote-debugging-port=0", "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: true });

let socket;
// The browser leads its own process group, so the whole group goes before its profile does: no
// renderer is still writing into what is removed, and no run leaves a profile in $TMPDIR.
const shutdown = () => { try { socket?.close(); } catch {} try { process.kill(-chrome.pid, "SIGKILL"); } catch { chrome.kill("SIGKILL"); } try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} };
process.on("exit", shutdown);

let PORT = 0;
for (let i = 0; !PORT; i += 1) {
  try { PORT = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch {}
  if (!PORT && i > 60) { shutdown(); throw new Error("headless chromium did not come up"); }
  if (!PORT) await sleep(250);
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new`, { method: "PUT" })).json();
socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => { socket.onopen = ok; socket.onerror = bad; });

let messageId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const slot = pending.get(message.id);
  if (!slot) return;
  pending.delete(message.id);
  message.error ? slot.bad(new Error(JSON.stringify(message.error))) : slot.ok(message.result);
};
const send = (method, params = {}) => new Promise((ok, bad) => {
  messageId += 1;
  pending.set(messageId, { ok, bad });
  socket.send(JSON.stringify({ id: messageId, method, params }));
});

await send("Runtime.enable");
await send("Page.enable");

// The SHIPPED module, inlined, plus only the #ddtip declarations the behaviour depends on —
// loading the whole stylesheet would make a failure ambiguous between this and some other rule.
const RUNTIME = readFileSync(join(root, "runtime/tooltip.js"), "utf8").replace(/^export /gm, "");

// The reproducing shape, and every part of it earned its place: a control inside a horizontally
// SCROLLED overflow container, which is where cockpit's join buttons live and where this was seen.
const HARNESS = `<!doctype html><html><head><style>
  body { margin: 0; font: 14px system-ui; }
  #ddtip { position: fixed; z-index: 9999; display: none; max-width: 340px;
           background: #fff; color: #111; border: 1px solid #666; padding: 7px 10px;
           line-height: 1.45; text-align: left; white-space: normal; pointer-events: none; }
  .tablewrap { overflow-x: auto; width: 420px; margin: 240px 0 0 40px; border: 1px solid #ccc; }
  table { border-collapse: collapse; width: 900px; }
  td { padding: 6px 10px; white-space: nowrap; }
</style></head><body>
<div class="tablewrap"><table><tbody><tr>
  <td>a</td><td>b</td><td>c</td><td>d</td><td>e</td>
  <td><button id="tipped" type="button" data-tip="An explanation long enough to need the full panel width, so the measurement matters.">join &rarr;</button></td>
</tr></tbody></table></div>
<p style="margin:20px 0 0 40px">
  <button id="outside" type="button">outside, no tip</button>
  <button id="outsidetip" type="button" data-tip="An explanation long enough to need the full panel width, so the measurement matters.">outside, tipped</button>
</p>
<dialog id="dlg" style="padding: 24px; border: 1px solid #666">
  <p>inside a modal dialog</p>
  <button id="indialog" type="button" data-tip="A tip for a control inside the dialog: it has to render in the top layer.">in the dialog, tipped</button>
</dialog>
<script type="module">
${RUNTIME}
initTooltips();
window.__hits = [];
for (const t of ["pointerdown","mousedown","pointerup","mouseup","click"]) {
  document.addEventListener(t, (e) => window.__hits.push(t + ":" + (e.target.id || e.target.nodeName) + "@" + Math.round(e.clientX) + "," + Math.round(e.clientY)), true);
}
<\/script>
</body></html>`;

await send("Page.navigate", { url: `data:text/html,${encodeURIComponent(HARNESS)}` });
await sleep(500);

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

// The recorded entries carry their coordinates ("click:tipped@251,258") so a failure says WHERE,
// which is what told me the dispatch was landing correctly and the hit-test was not. Matching is
// therefore by prefix — an exact-equality match silently found nothing and skipped the whole
// suite while every underlying assertion was fine.
const saw = (hits, what) => hits.some((h) => h.startsWith(what + "@") || h === what);

/*
 * A check takes a THUNK (a value still works). A thunk that throws is a FAIL naming the error and the
 * suite goes on; whatever still escapes — an assertion evaluated before check() is entered — is caught
 * at the bottom and reported against the last check that finished, never as a bare stack.
 */
let failures = 0;
let lastLabel = "(none yet)";
const check = async (label, test, detail) => {
  let ok;
  let info = detail;
  try {
    ok = typeof test === "function" ? await test() : test;
  } catch (error) {
    ok = false;
    info = `threw: ${String(error?.message ?? error).split("\n")[0]}`;
  }
  lastLabel = label;
  if (ok) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${info == null ? "" : `\n        ${typeof info === "string" ? info : JSON.stringify(info)}`}`);
};

// Scroll the column into view exactly as a reader does, then click it with a REAL press/release.
const clickById = async (id) => {
  // SCROLL, THEN LET A FRAME LAND, THEN MEASURE. Scrolling and dispatching in the same turn made
  // every click — including the baseline's — hit-test against the pre-scroll compositor state and
  // resolve to the wrapper, which looks exactly like the bug under test. The baseline check is
  // what caught it.
  //
  // CENTRE it in the scroller rather than scrolling to the end: scrolling fully right left the
  // control half-clipped by the container's left edge, so its own centre belonged to the wrapper.
  await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: "nearest", inline: "center" })`);
  await sleep(200);
  const box = await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    const r = el.getBoundingClientRect();
    window.__hits.length = 0;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             hit: document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)) === el };
  })()`);
  // mouseMoved FIRST: that is what fires mouseover, which is what calls show(). Without it the
  // tooltip never opens and the test passes against a broken build.
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await sleep(120);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(120);
  return { box, hits: await evaluate("window.__hits") };
};

// THE HARNESS'S OWN BASELINE FIRST. A control outside the scroll container, with no tooltip: if
// even that does not click, the dispatch is not reaching the page and nothing below can be read as
// a verdict on the runtime. Reported as a SKIP rather than a failure, because a check that fails
// in both the fixed and the broken state proves nothing and would be edited away.
try {
  const sanity = await clickById("outside");
  if (!saw(sanity.hits, "click:outside")) {
    console.log("check-tooltip-click: SKIPPED — synthetic clicks are not reaching this browser.");
    console.log(`  baseline control outside any scroller produced: ${JSON.stringify(sanity.hits)}`);
    console.log("  The runtime cannot be judged from that, so this reports nothing rather than a verdict.");
    shutdown();
    process.exit(process.env.DD_REQUIRE_BROWSER === "1" ? 1 : 0);
  }
  console.log("PASS  synthetic clicks reach this browser (baseline outside any scroller)");

  const outsideTipped = await clickById("outsidetip");
  await check("a TOOLTIPPED control outside a scroller clicks",
    () => saw(outsideTipped.hits, "click:outsidetip"), outsideTipped.hits);

  // THE TOOLTIP MUST STILL BE A TOOLTIP. The fix separates hiding the panel from releasing the
  // anchor, and the way to get that wrong is a panel that stops coming back.
  const behaviour = await evaluate(`(async () => {
    const tip = document.getElementById("ddtip");
    const el = document.getElementById("outsidetip");
    const other = document.getElementById("outside");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const snap = () => ({ disp: getComputedStyle(tip).display, aria: el.getAttribute("aria-describedby") });

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(30);
    const hovering = snap();

    other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(30);
    const left = snap();

    // hover again, then PRESS: the panel goes, the anchor keeps its description
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(30);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await sleep(30);
    const pressed = snap();

    // and it comes back on a fresh hover
    other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(30);
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(30);
    const again = snap();
    return { hovering, left, pressed, again, text: tip.textContent.slice(0, 24) };
  })()`);
  await check("hovering a [data-tip] shows the panel and describes the anchor",
    () => behaviour.hovering.disp !== "none" && behaviour.hovering.aria === "ddtip", behaviour);
  await check("leaving it hides the panel AND releases the description",
    () => behaviour.left.disp === "none" && behaviour.left.aria === null, behaviour);
  await check("pressing hides the panel but does NOT strip the anchor's aria mid-gesture",
    () => behaviour.pressed.disp === "none" && behaviour.pressed.aria === "ddtip", behaviour);
  await check("...and the tooltip comes back on a fresh hover, so the press did not kill it",
    () => behaviour.again.disp !== "none" && behaviour.again.aria === "ddtip", behaviour);

  // The park still has to MEASURE, or the fix trades a dead button for a misplaced panel.
  const placement = await evaluate(`(() => {
    const el = document.getElementById("tipped");
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const tip = document.getElementById("ddtip");
    const t = tip.getBoundingClientRect(), r = el.getBoundingClientRect();
    // what the panel measures with nothing constraining it, computed the same way show() must
    // Measure the REAL panel parked off-screen and put it back. A clone matches none of the #ddtip
    // rules, so it measured its own content and the comparison meant nothing.
    const keepL = tip.style.left, keepT = tip.style.top;
    tip.style.left = "0px"; tip.style.top = "-9999px";
    const unconstrainedW = Math.round(tip.getBoundingClientRect().width);
    tip.style.left = keepL; tip.style.top = keepT;
    return { unconstrainedW, tipW: Math.round(t.width), tipH: Math.round(t.height),
             tipL: Math.round(t.left), tipT: Math.round(t.top),
             anchorBottom: Math.round(r.bottom), viewportW: window.innerWidth,
             parkedTop: tip.style.top, display: getComputedStyle(tip).display };
  })()`);
  // DERIVED, not hardcoded: the rendered width is max-width plus padding and border, and pinning
  // the sum here would fail the day someone changes the padding for reasons unrelated to this bug.
  await check("the panel is measured at its full unconstrained width, not squeezed by where it last sat",
    () => placement.tipW === placement.unconstrainedW, placement);
  await check("...and is placed below its anchor, inside the viewport",
    () => placement.tipT >= placement.anchorBottom && placement.tipL >= 0
      && placement.tipL + placement.tipW <= placement.viewportW, placement);

  // INSIDE A MODAL DIALOG: the panel moves into the dialog on hover, and the control still clicks.
  await evaluate(`(() => { document.getElementById("ddtip").style.display = "none"; document.getElementById("dlg").showModal(); })()`);
  const inDialog = await clickById("indialog");
  await check("a TOOLTIPPED control inside a modal dialog clicks — the move into the dialog is not a write that costs the click",
    () => saw(inDialog.hits, "click:indialog"), inDialog.hits);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: inDialog.box.x + 1, y: inDialog.box.y });
  await evaluate(`document.getElementById("indialog").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))`);
  const layer = await evaluate(`(() => {
    const tip = document.getElementById("ddtip"), dlg = document.getElementById("dlg");
    // hover it fresh: leave, then enter, so show() runs for this anchor
    document.getElementById("outside").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    document.getElementById("indialog").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    tip.style.pointerEvents = "auto";
    const r = tip.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    tip.style.pointerEvents = "";
    return { inDialog: tip.parentElement === dlg, shown: getComputedStyle(tip).display !== "none" && r.width > 0,
             onTop: !!hit && (hit === tip || tip.contains(hit)), hit: hit && (hit.id || hit.nodeName) };
  })()`);
  await check("...its tip is appended to the dialog and is really on top (the hit test finds the panel, not the dialog)",
    () => layer.inDialog && layer.shown && layer.onTop, layer);
  await evaluate(`document.getElementById("dlg").close()`);

  // THE SPECIFIC REGRESSION, on the source as well as in the browser. Comments stripped first: this
  // file explains the defect at length and every explanation contains the words being matched.
  const source = readFileSync(join(root, "runtime/tooltip.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  await check("pointerdown hides the PANEL and does not touch the anchor's aria",
    () => /addEventListener\("pointerdown",\s*hidePanel\s*,\s*true\)/.test(source),
    source.match(/addEventListener\("pointerdown"[^\n]*/g));
  // The other half is behaviour, counted: every aria-describedby write on the anchor, across a hover
  // the browser re-fires five times (as it does on a live-refreshing table), a leave, and further
  // hovers elsewhere. (It was a regex over the source until 0.60.0, when the attribute became a token
  // list and the one-liners it matched were rewritten.)
  const writes = await evaluate(`(async () => {
    const el = document.getElementById("outsidetip"), other = document.getElementById("outside");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(30);
    const count = { set: 0, remove: 0 };
    const set = el.setAttribute, remove = el.removeAttribute;
    el.setAttribute = function (name, value) { if (name === "aria-describedby") count.set += 1; return set.call(this, name, value); };
    el.removeAttribute = function (name) { if (name === "aria-describedby") count.remove += 1; return remove.call(this, name); };
    for (let i = 0; i < 5; i += 1) { el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); await sleep(10); }
    const whileHovered = { ...count };
    for (let i = 0; i < 3; i += 1) { other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); await sleep(10); }
    delete el.setAttribute; delete el.removeAttribute;
    return { whileHovered, total: count };
  })()`);
  await check("...and the aria association is written only when it would change (one write across five re-fired hovers)",
    () => writes.whileHovered.set === 1 && writes.whileHovered.remove === 0, writes);
  await check("...and removed only when it is actually set (one removal across three leaves)",
    () => writes.total.set === 1 && writes.total.remove === 1, writes);
} catch (error) {
  failures += 1;
  console.log(`FAIL  the suite threw after "${lastLabel}": ${String(error?.message ?? error).split("\n")[0]}`);
}

console.log(failures
  ? `\n\x1b[31m-- check-tooltip-click: ${failures} FAILED --\x1b[0m`
  : "\n\x1b[32m-- check-tooltip-click: all checks passed --\x1b[0m");
shutdown();
process.exit(failures ? 1 : 0);
