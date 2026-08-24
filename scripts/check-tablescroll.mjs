#!/usr/bin/env node
/*
 * check-tablescroll.mjs — the scroll wrapper reaches tables that did not exist at call time.
 *
 * WHAT IS ACTUALLY AT RISK HERE. `initTableScroll()` shipped in 0.7.0 as a single walk of the
 * document, and for sixteen releases that looked like a working feature: the static pages — docs,
 * the infrastructure reference pages — author their tables in the markup, so the walk finds them
 * and they scroll. Every table that is genuinely too wide is on a DASHBOARD, and a dashboard's
 * tables arrive from a fetch, minutes of page-lifetime after the walk has finished. Those were
 * never wrapped at all. A capability that covers exactly the cases which do not need it is
 * indistinguishable, from the outside, from one that works.
 *
 * So the property is not "a table gets a wrapper" — that one was always true and always green.
 * It is "a table gets a wrapper WHENEVER IT APPEARS", and the only way to state that is to add
 * one after the call and look.
 *
 * A REAL BROWSER, and no dependency. MutationObserver, `closest()` and live child lists are the
 * subject here, not incidental to it, so a hand-written stub DOM would be asserting that the stub
 * behaves — the one thing nobody needs to know. This drives the headless chromium that Playwright
 * already caches on these machines over the DevTools protocol, using Node's own fetch and
 * WebSocket. Nothing is installed and nothing is imported.
 *
 * If that browser is not on the machine the script SKIPS with a loud note rather than failing:
 * a missing browser is not a broken design system, and a check that goes red for its own reasons
 * is the trap this estate keeps re-learning.
 *
 *   node scripts/check-tablescroll.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// DD_CHROME, when set, IS the browser — a wrong path there fails loudly rather than
// falling through to a skip, which is the whole point of the DD_REQUIRE_BROWSER gate below.
const CHROME = process.env.DD_CHROME
  ? (existsSync(process.env.DD_CHROME) ? process.env.DD_CHROME : null)
  : [
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      // Linux, for CI. GitHub's ubuntu runners ship Chrome; without these the suite
      // skipped on every CI run and the release gate below proved nothing.
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ].find((path) => existsSync(path));

if (!CHROME) {
  console.log("check-tablescroll: SKIPPED — no headless chromium on this machine.");
  console.log("  This asserts DOM behaviour (MutationObserver, live child lists), which cannot be");
  console.log("  proven against a stub. Install one with `npx playwright install chromium`.");
  if (process.env.DD_REQUIRE_BROWSER === "1") {
    console.log("  DD_REQUIRE_BROWSER=1: a skip counts as a FAILURE here. This suite gates the npm");
    console.log("  release, and a silent skip would publish a runtime nothing had exercised.");
    process.exit(1);
  }
  process.exit(0);
}

const PORT = 19223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "dd-tablescroll-"))}`, "about:blank",
], { stdio: "ignore" });

let socket;
const shutdown = () => { try { socket?.close(); } catch {} chrome.kill("SIGKILL"); };
process.on("exit", shutdown);

for (let i = 0; ; i += 1) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch {}
  if (i > 60) { shutdown(); throw new Error("headless chromium did not come up"); }
  await sleep(250);
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

/*
 * The page is built here rather than read from disk so the fixture cannot drift: it is the
 * SHIPPED module, read off the filesystem and inlined, plus the two chrome.css declarations the
 * assertions actually depend on. Loading the whole stylesheet would make a failure ambiguous
 * between "the wrapper is missing" and "some other rule moved".
 */
const RUNTIME = readFileSync(join(root, "runtime/tablescroll.js"), "utf8").replace(/^export /gm, "");
const HARNESS = `<!doctype html><html><head><style>
  .tablewrap { overflow-x: auto; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 0.4rem 0.75rem; white-space: nowrap; }
</style></head><body>
<div id="static"><table id="authored"><tbody><tr><td>in the markup</td></tr></tbody></table></div>
<div id="prewrapped"><div class="tablewrap"><figure><table id="byhand"><tbody><tr><td>hand-wrapped</td></tr></tbody></table></figure></div></div>
<div id="mount"></div>
<script type="module">${RUNTIME}\nwindow.initTableScroll = initTableScroll;<\/script>
</body></html>`;

await send("Page.enable");
await send("Page.navigate", { url: `data:text/html,${encodeURIComponent(HARNESS)}` });
await sleep(400);

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) { console.log(`PASS  ${label}`); return; }
  failures += 1;
  console.log(`FAIL  ${label}${detail == null ? "" : `\n        ${JSON.stringify(detail)}`}`);
};

// A wide table in a narrow column, so "is it wrapped?" can be asked as "does it scroll?" — the
// thing the reader actually needs — rather than only as "is there a div".
const WIDE_ROW = "<tr>" + Array.from({ length: 24 }, (_, i) => `<td>column-value-${i}</td>`).join("") + "</tr>";

const state = await evaluate(`(async () => {
  const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const mount = document.getElementById("mount");
  mount.style.width = "300px";
  const seen = {};

  // The call happens FIRST, against a document whose dashboard mount is still empty — exactly
  // what cockpit's deferred portal.js does while every panel still reads "loading…".
  window.initTableScroll();
  seen.authoredWrapped = !!document.getElementById("authored").closest(".tablewrap");
  seen.byhandWrapperCount = document.querySelectorAll("#prewrapped .tablewrap").length;
  seen.byhandUntouched = document.getElementById("byhand").parentElement.tagName === "FIGURE";

  // …and only THEN does the fetch come back.
  mount.innerHTML = '<table id="late"><tbody>${WIDE_ROW}</tbody></table>';
  await wait();
  const late = document.getElementById("late");
  const wrapper = late.closest(".tablewrap");
  seen.lateWrapped = !!wrapper;
  seen.lateScrolls = !!wrapper && wrapper.scrollWidth > wrapper.clientWidth;
  seen.pageStaysPut = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  seen.lateWrapperCount = mount.querySelectorAll(".tablewrap").length;

  // A second render into the same mount, the way a 30s poll does it. A pass that wrapped an
  // already-wrapped table would show up here as nesting.
  mount.innerHTML = '<table id="late2"><tbody>${WIDE_ROW}</tbody></table>';
  await wait();
  seen.repollWrapped = !!document.getElementById("late2").closest(".tablewrap");
  seen.repollWrapperCount = mount.querySelectorAll(".tablewrap").length;

  // The observer's own mutation must not wake it into wrapping its own wrapper. Ten inserts in a
  // row, then a settle: a runaway shows as a wrapper count that outruns the table count.
  const many = document.createElement("div");
  document.body.appendChild(many);
  for (let i = 0; i < 10; i += 1) many.insertAdjacentHTML("beforeend", '<table><tbody><tr><td>x</td></tr></tbody></table>');
  await wait(); await wait();
  seen.manyTables = many.querySelectorAll("table").length;
  seen.manyWrappers = many.querySelectorAll(".tablewrap").length;
  seen.deepestNesting = Math.max(...[...many.querySelectorAll("table")].map((t) => {
    let depth = 0;
    for (let node = t.parentElement; node; node = node.parentElement) if (node.classList.contains("tablewrap")) depth += 1;
    return depth;
  }));

  // A table nested inside another table's cell is one table too many to wrap twice.
  const nested = document.createElement("div");
  document.body.appendChild(nested);
  nested.innerHTML = '<table id="outer"><tbody><tr><td><table id="inner"><tbody><tr><td>y</td></tr></tbody></table></td></tr></tbody></table>';
  await wait(); await wait();
  seen.outerWrapped = !!document.getElementById("outer").closest(".tablewrap");
  seen.innerExtraWrapper = document.getElementById("inner").parentElement.classList.contains("tablewrap");

  // Listeners bound to rows must survive being moved into the wrapper — the whole reason this
  // does replaceWith + appendChild instead of innerHTML.
  const listener = document.createElement("div");
  document.body.appendChild(listener);
  listener.innerHTML = '<table id="clicky"><tbody><tr id="clickrow"><td>z</td></tr></tbody></table>';
  let clicks = 0;
  document.getElementById("clickrow").addEventListener("click", () => { clicks += 1; });
  await wait(); await wait();
  document.getElementById("clickrow").click();
  seen.listenerSurvived = clicks === 1;

  return seen;
})()`);

check("a table already in the markup is wrapped by the initial walk", state.authoredWrapped);
check("a table the page wrapped itself is left exactly as it was", state.byhandUntouched && state.byhandWrapperCount === 1, state);

// The four that were red before 0.23.0.
check("a table rendered AFTER the call is wrapped too", state.lateWrapped, state);
check("...and it actually scrolls, instead of the page scrolling sideways", state.lateScrolls && state.pageStaysPut, state);
check("...with exactly one wrapper, not one per pass", state.lateWrapperCount === 1, state);
check("a re-render into the same mount is wrapped again", state.repollWrapped && state.repollWrapperCount === 1, state);

check("the observer does not wake on its own output", state.manyWrappers === state.manyTables && state.deepestNesting === 1, state);
check("a table inside another table's cell gets no second wrapper", state.outerWrapped && !state.innerExtraWrapper, state);
check("row listeners survive the move into the wrapper", state.listenerSurvived, state);

console.log(failures ? `\ncheck-tablescroll: ${failures} FAILED` : "\ncheck-tablescroll: all checks passed");
shutdown();
process.exit(failures ? 1 : 0);
