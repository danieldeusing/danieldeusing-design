#!/usr/bin/env node
/*
 * check-data.mjs — src/data.css and runtime/pick.js, measured on the demo page in a real browser.
 *
 * WHAT IS AT RISK, and why each is MEASURED rather than looked at:
 *   · THE CASCADE. data.css restates the base table's cell box for its own classes so a tokens-only
 *     surface renders the same, and the cell vocabulary must beat the dense defaults by weight and
 *     order, not by luck. So the computed values are asserted, and the same elements are compared
 *     with and without base.css + components.css (`?bare`): a rule that only works because base.css
 *     happens to agree is a rule that breaks on netmon. That comparison includes font-family and
 *     font-size — a control that loses `font: inherit` renders in Arial at 13.33px (X2).
 *   · A FOCUS RING THAT CANNOT FAIL. base.css draws a global ring, so a tab "having its ring" proves
 *     nothing with it loaded. The ring is asserted in `?bare`, where only data.css can supply it (X2).
 *   · FORCED COLOURS. A state drawn by a fill or a tint disappears under a forced palette. Each one
 *     this file draws is read from a SCREENSHOT there, in both of Chromium's palettes: its two states
 *     must differ by 3:1 of paint and its text reach 4.5:1 — painted pixels, because the Canvas
 *     backplate that hid the selected tab's label shows in no computed style (X1).
 *   · `hidden`. An author `display` beats the UA's `[hidden]`; every component must still hide, through
 *     tokens.css's one rule and no guard of its own (X3).
 *   · THE PICK CELL. Under a coarse pointer the bare checkbox stays small and the CELL is the 44px
 *     target; a press anywhere in it toggles the box once, through the box's own click.
 *   · CONTRAST. Every new text/background and edge pairing, from the colours the browser actually
 *     resolves for the tokens — four themes, three surfaces — and printed as the table the report quotes.
 *
 * It drives examples/data.html from this checkout: the real files, and nothing standing in for them
 * (check-integration.mjs fails a demo that carries a stand-in).
 *
 *   node scripts/check-data.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, reporter, requireBrowser, serve, sleep } from "./lib/chromium.mjs";

requireBrowser("check-data", "Computed styles, rendered pixels, forced colours and a coarse pointer are browser behaviour.");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = reporter("check-data");
const server = await serve(root);
const browser = await launch("data");
const { evaluate, until, navigate, send, press } = browser;

const THEMES = ["warm", "green", "mono", "paper"];
const SURFACES = ["--background", "--card", "--muted"];

// The instrument. `tok` resolves any CSS colour expression through a probe. `rgba` reads the resolved
// colour as numbers — rgb()/color(srgb) by parsing, anything else (the --cat-* oklch hues) by painting it
// opaque on a canvas — and throws on a form it cannot read rather than guess. `over` composites a stack
// (an opaque surface first, translucent layers over it) in FLOATS, as the spec's figures were computed:
// Chromium's 8-bit canvas blend lands one unit darker per channel, which moved paper's --warning on its
// --muted tint from 4.53 to 4.48 — enough to flip a verdict at the threshold. `contrast` is WCAG 2.x.
const INSTRUMENT = `window.M = {
  // The probe opts out of forced colours, or under them every colour it resolves would come back as
  // CanvasText; a system colour keyword still resolves to the forced palette's value.
  // A value that is not a colour ("none", a stroke that was never set) throws: resolved silently, it
  // would come back as the inherited text colour and measure as a plausible ratio.
  tok(expr) { const p = document.createElement("span"); p.style.forcedColorAdjust = "none"; p.style.color = expr;
    if (!p.style.color) throw new Error("not a colour: " + expr);
    document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; },
  rgba(expr) {
    const v = M.tok(expr);
    let m = v.match(/^rgba?\\((\\S+), (\\S+), ([^,)]+)(?:, ([^)]+))?\\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = v.match(/^color\\(srgb (\\S+) (\\S+) ([^ )]+)(?: \\/ ([^)]+))?\\)$/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    if (v.includes("/")) throw new Error("cannot read the translucent colour " + v);
    const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d");
    x.fillStyle = v; x.fillRect(0, 0, 1, 1);
    return [...Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3), 1];
  },
  over(stack) {
    const [first, ...rest] = stack.map(M.rgba);
    if (first[3] !== 1) throw new Error("the surface under a stack must be opaque: " + stack[0]);
    return rest.reduce((under, [r, g, b, a]) => [r, g, b].map((v, i) => v * a + under[i] * (1 - a)), first.slice(0, 3));
  },
  lum(rgb) { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; },
  ratio(a, b) { const [x, y] = [M.lum(a), M.lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); },
  contrast(fg, surface, layers = []) { const under = ["var(" + surface + ")", ...layers];
    return M.ratio(M.over([...under, fg]), M.over(under)); },
  cs(sel, pseudo) { const el = document.querySelector(sel); if (!el) throw new Error("no element " + sel); return getComputedStyle(el, pseudo || null); },
  box(sel) { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
}; null`;

const open = async (query, width = 1280) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${server.origin}/examples/data.html?${query}`);
  await until("document.documentElement.hasAttribute('data-ready')");
  await evaluate(INSTRUMENT);
};
const css = (sel, prop, pseudo) => evaluate(`M.cs(${JSON.stringify(sel)}, ${JSON.stringify(pseudo || "")})[${JSON.stringify(prop)}]`);
const tok = (expr) => evaluate(`M.tok(${JSON.stringify(expr)})`);
const theme = (t) => evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(t)}; null`);
const mouse = async (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: 1 });
const clickAt = async (x, y) => { await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await sleep(30); };
// A tab's colours TRANSITION (.15s): a style read straight after a change sees the colour mid-way — and
// under forced colours a mid-way value is not a system colour, so it is forced to Canvas / CanvasText.
// Every read that follows a state change first waits for the page's running transitions to finish.
const settle = async () => { await sleep(20); await until("document.getAnimations().every((a) => a.playState !== 'running')", "transitions to settle"); };
const hoverOver = async (sel) => {
  await evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center", behavior: "instant" }); null`);
  const b = await evaluate(`M.box(${JSON.stringify(sel)})`);
  await mouse("mouseMoved", b.x + 5, b.y + 5);
  await settle();
};

await open("theme=warm");

/* ── D1 · table.dense ─────────────────────────────────────────────────────────────────────────── */

const cell = "#dense-table tbody tr:nth-child(2) > td:nth-child(3)";
await check("a dense cell: .3rem .35rem padding, start-aligned, top-aligned, a 3.5rem floor, the 55% --border rule",
  async () => (await css(cell, "padding")) === "4.8px 5.6px" && (await css(cell, "textAlign")) === "start" &&
    (await css(cell, "verticalAlign")) === "top" && (await css(cell, "minWidth")) === "56px" &&
    (await css(cell, "borderBottomColor")) === (await tok("color-mix(in srgb, var(--border) 55%, transparent)")) &&
    (await css(cell, "borderBottomWidth")) === "1px",
  () => evaluate(`JSON.stringify(["padding", "textAlign", "verticalAlign", "minWidth", "borderBottomColor"].map((p) => M.cs(${JSON.stringify(cell)})[p]))`));
await check("the first cell always keeps .45rem for the pin bar (header included), the last has no end inset",
  async () => (await css("#dense-table tbody tr:nth-child(2) > td:first-child", "paddingLeft")) === "7.2px" &&
    (await css("#dense-table thead th:first-child", "paddingLeft")) === "7.2px" &&
    (await css("#dense-table tbody tr:nth-child(2) > td:last-child", "paddingRight")) === "0px");
await check("the header is muted, 600, over a full --border rule; the last body row draws no rule",
  async () => (await css("#dense-table thead th:nth-child(3)", "color")) === (await tok("var(--muted-foreground)")) &&
    (await css("#dense-table thead th:nth-child(3)", "fontWeight")) === "600" &&
    (await css("#dense-table thead th:nth-child(3)", "borderBottomColor")) === (await tok("var(--border)")) &&
    (await css("#dense-table tbody tr:last-child > td:nth-child(3)", "borderBottomWidth")) === "0px");
await check(".num aligns on its last digit in tabular figures — and beats the dense default by order",
  async () => (await css("#dense-table tbody tr:nth-child(2) > td.num", "textAlign")) === "end" &&
    (await css("#dense-table tbody tr:nth-child(2) > td.num", "fontVariantNumeric")) === "tabular-nums" &&
    (await css("#dense-table thead th.num", "textAlign")) === "end");
await check("td.actions: one action per line, each only as wide as itself",
  () => evaluate(`(() => { const kids = Array.from(document.querySelectorAll("#row-pinned td.actions > *"));
    const cellW = document.querySelector("#row-pinned td.actions").getBoundingClientRect().width;
    return kids.length === 3 && kids.every((k) => getComputedStyle(k).display === "block" && k.getBoundingClientRect().width < cellW) &&
      kids[1].getBoundingClientRect().top > kids[0].getBoundingClientRect().top && kids[2].getBoundingClientRect().top > kids[1].getBoundingClientRect().top; })()`));
await check("a .btn-terminal in a dense row never wraps", async () => (await css("#row-pinned td.actions .btn-terminal", "whiteSpace")) === "nowrap");
await check("the pick column: 2.2rem border-box, centred, no floor, a pointer over the cell (default over a disabled box)",
  async () => Math.abs((await evaluate(`M.box("#row-pinned td.pick").w`)) - 35.2) < 0.1 && (await css("#row-pinned td.pick", "textAlign")) === "center" &&
    (await css("#row-pinned td.pick", "minWidth")) === "0px" && (await css("#row-pinned td.pick", "cursor")) === "pointer" &&
    (await css("#row-disabled td.pick", "cursor")) === "default");
await check("a pinned row: a 5% --warning tint on every cell, and a 3px --warning inset bar on the first",
  async () => (await css("#row-pinned > td:nth-child(3)", "backgroundColor")) === (await tok("color-mix(in srgb, var(--warning) 5%, transparent)")) &&
    (await css("#row-pinned > td:first-child", "boxShadow")).startsWith(`${await tok("var(--warning)")} 3px 0px 0px 0px inset`),
  () => css("#row-pinned > td:first-child", "boxShadow"));
await check("a disabled row is muted TEXT (not opacity), except its first cell",
  async () => (await css("#row-disabled > td:nth-child(3)", "color")) === (await tok("var(--muted-foreground)")) &&
    (await css("#row-disabled", "opacity")) === "1" && (await css("#row-disabled > td:nth-child(3)", "opacity")) === "1");
await check("table.dense--form centres its cells on the controls",
  async () => (await css("#form-table tbody td:nth-child(2)", "verticalAlign")) === "middle");
await check("no cell sets its own font: every dense cell is the system's mono, never ui-monospace",
  () => evaluate(`Array.from(document.querySelectorAll("#dense-table td, #dense-table th")).every((c) => getComputedStyle(c).fontFamily === getComputedStyle(document.body).fontFamily)`));
await check("no radius anywhere in these components", () => evaluate(`Array.from(document.querySelectorAll(
  "#dense *, #kv *, #when *, #tabs *, #charts figure, #charts .chart-plot, #charts .chart-key li")).every((el) =>
  ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"].every((p) => getComputedStyle(el)[p] === "0px"))`));
await check("the sticky header in a --card card paints the card, not the page (WP3's line, chrome.css)",
  async () => (await css("#card-wrap thead th", "backgroundColor")) === (await tok("var(--card)")));

/* ── D1 · the pick cell under a coarse pointer ────────────────────────────────────────────────── */

const fineBox = await evaluate(`M.box("#row-pinned td.pick input")`);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
await until("matchMedia('(pointer: coarse)').matches", "the coarse pointer");
const coarse = await evaluate(`({ cell: M.box("#row-pinned td.pick"), head: M.box("#dense-table thead th.pick"), box: M.box("#row-pinned td.pick input"),
  row: M.box("#dense-table tbody tr:nth-child(2)") })`);
await check("under a coarse pointer the pick CELL is the 44px target, header too, and every row is at least 44px",
  () => coarse.cell.w >= 44 && coarse.cell.h >= 44 && coarse.head.w >= 44 && coarse.head.h >= 44 && coarse.row.h >= 44, JSON.stringify(coarse));
await check("...while the bare checkbox keeps its size — it does not grow into a 44px square",
  () => coarse.box.w === fineBox.w && coarse.box.h === fineBox.h && coarse.box.w <= 14, JSON.stringify({ fineBox, coarse: coarse.box }));
await evaluate(`window.changes = []; document.addEventListener("change", (e) => window.changes.push(e.target.getAttribute("aria-label"))); null`);
const pickCase = async (row, where) => {
  const c = await evaluate(`M.box(${JSON.stringify(`${row} .pick`)})`);
  const b = await evaluate(`M.box(${JSON.stringify(`${row} .pick input`)})`);
  const at = where === "box" ? [b.x + b.w / 2, b.y + b.h / 2] : [c.x + 3, c.y + c.h - 3];
  await clickAt(at[0], at[1]);
};
const checked = (row) => evaluate(`document.querySelector(${JSON.stringify(`${row} .pick input`)}).checked`);
const row2 = "#dense-table tbody tr:nth-child(2)";
const before2 = await checked(row2);
await pickCase(row2, "corner");
await check("a press in the cell's corner, well away from the box, toggles the box and fires its change once",
  async () => (await checked(row2)) === !before2 && (await evaluate("window.changes.length")) === 1, () => evaluate("JSON.stringify(window.changes)"));
await pickCase(row2, "box");
await check("a press ON the box toggles it once — the cell does not toggle it back",
  async () => (await checked(row2)) === before2 && (await evaluate("window.changes.length")) === 2, () => evaluate("JSON.stringify(window.changes)"));
await pickCase("#row-disabled", "corner");
await check("a disabled box stays as it is when its cell is pressed", async () => (await checked("#row-disabled")) === false && (await evaluate("window.changes.length")) === 2);
await pickCase("#dense-table thead tr", "corner");
await check("the header's pick cell works the same way", async () => (await evaluate(`document.querySelector("#dense-table thead .pick input").checked`)) === true);
await send("Emulation.setTouchEmulationEnabled", { enabled: false });

/* ── D1 · stacking on a phone ─────────────────────────────────────────────────────────────────── */

await open("theme=warm", 375);
await check("below 40rem a .stackable table is a card per row: no header, --card fill, a --border edge",
  async () => (await css("#dense-table thead", "display")) === "none" && (await css(row2, "display")) === "block" &&
    (await css(row2, "backgroundColor")) === (await tok("var(--card)")) && (await css(row2, "borderTopColor")) === (await tok("var(--border)")));
await check("...each cell a line that says which column it is, from data-label, in --muted-foreground",
  async () => (await css(`${row2} > td:nth-child(3)`, "display")) === "flex" && (await css(`${row2} > td:nth-child(3)`, "content", "::before")) === '"repository"' &&
    (await css(`${row2} > td:nth-child(3)`, "color", "::before")) === (await tok("var(--muted-foreground)")));
await check("...the actions still one per line, down the value edge",
  () => evaluate(`(() => { const k = Array.from(document.querySelectorAll("#row-pinned td.actions > *")).map((e) => e.getBoundingClientRect());
    const cell = document.querySelector("#row-pinned td.actions").getBoundingClientRect();
    return k.length === 3 && k[1].top > k[0].top && k[2].top > k[1].top && k.every((r) => Math.abs(r.right - cell.right) < 1); })()`));
await check("...the pinned row is one card with the tint and the bar on the card",
  async () => (await css("#row-pinned", "backgroundColor")) === (await tok("color-mix(in srgb, var(--warning) 5%, var(--card))")) &&
    (await css("#row-pinned", "boxShadow")).includes("inset") && (await css("#row-pinned > td:first-child", "boxShadow")) === "none");
await check("...a value that wraps lines up on the value edge (text-align: end), under its label's line",
  async () => (await css(`${row2} > td:nth-child(3)`, "textAlign")) === "end");
// Every KIND of cell, because each kind has its own rule and a stronger one can outrank `td:empty`:
// `td.actions[data-label]` (0,3,2) did, and drew an empty "links" line 23px tall.
const empties = JSON.parse(await evaluate(`(() => {
  const plain = document.querySelector("${row2} > td:nth-child(3)"), text = plain.textContent;
  plain.textContent = "";
  const out = Array.from(document.querySelectorAll("#dense-table tbody td:empty")).map((td) => ({
    kind: td.classList.contains("num") ? "num" : td.classList.contains("actions") ? "actions" : "plain",
    display: getComputedStyle(td).display, height: td.getBoundingClientRect().height }));
  plain.textContent = text;
  return JSON.stringify(out);
})()`));
await check("...an EMPTY cell of every kind is dropped — plain, .num and .actions — never a labelled blank line",
  () => ["plain", "num", "actions"].every((kind) => empties.some((e) => e.kind === kind)) && empties.every((e) => e.display === "none" && e.height === 0),
  JSON.stringify(empties));
await evaluate(`document.querySelector("${row2}").hidden = true; null`);
await check("...and a row the pager hid stays hidden though every row is now a block — through tokens.css's [hidden], no guard of its own (X3)",
  async () => (await css(row2, "display")) === "none");
await evaluate(`document.querySelector("${row2}").hidden = false; document.getElementById("row-pinned").hidden = true; null`);
const gaps = await evaluate(`JSON.stringify([getComputedStyle(document.querySelector("${row2}")).marginTop, getComputedStyle(document.getElementById("row-disabled")).marginTop])`);
await evaluate(`document.getElementById("row-pinned").hidden = false; null`);
await check("...a page whose first rows are paged away opens without a gap: the first VISIBLE card has none, the next .8rem",
  () => gaps === '["0px","12.8px"]', gaps);
await check("dl.kv is one column on a phone", async () => (await css("#kv-list", "gridTemplateColumns")).split(" ").length === 1);
await check("a tab is 44px tall on a phone, and the reference half no longer pushes right",
  async () => parseFloat(await css("#tab-queue", "minHeight")) === 44 && (await css("#tab-how", "marginLeft")) === "0px");

/* ── D3 · key/value ───────────────────────────────────────────────────────────────────────────── */

await open("theme=warm");
await check("table.kv: the label --primary 700 nowrap, the value --foreground and breaking anywhere, the base cell box",
  async () => (await css("#kv-table th", "color")) === (await tok("var(--primary)")) && (await css("#kv-table th", "fontWeight")) === "700" &&
    (await css("#kv-table th", "whiteSpace")) === "nowrap" && (await css("#kv-table td", "overflowWrap")) === "anywhere" &&
    (await css("#kv-table td", "color")) === (await tok("var(--foreground)")) && (await css("#kv-table th", "paddingLeft")) === "0px" &&
    (await css("#kv-table td", "paddingTop")) === "7.2px" && (await css("#kv-table tr:last-child td", "borderBottomWidth")) === "0px");
await check("table.kv--labels: the label column is --field-label-w set on the table (15rem = 240px), its end padding included",
  async () => Math.abs((await evaluate(`M.box("#kv-labels th").w`)) - 240) < 0.1 && (await css("#kv-labels th", "boxSizing")) === "border-box",
  () => evaluate(`M.box("#kv-labels th").w`));
await check("dl.kv: an 8.5rem label column, the label --primary 700, the value --foreground with no indent",
  async () => (await css("#kv-list", "gridTemplateColumns")).startsWith("136px") && (await css("#kv-list dt", "color")) === (await tok("var(--primary)")) &&
    (await css("#kv-list dd", "marginLeft")) === "0px" && (await css("#kv-list dd", "color")) === (await tok("var(--foreground)")));

/* ── D4 · when ────────────────────────────────────────────────────────────────────────────────── */

// In a table the stamp reads at full strength (D0); the muted default is the stamp's own, asserted in D0 below.
await check(".when: an inline block with the column's 5.5rem floor, two nowrap lines, the stamp --foreground in a table and tabular",
  async () => (await css("#row-pinned .when", "display")) === "inline-block" && (await css("#row-pinned .when", "minWidth")) === "88px" &&
    (await css("#row-pinned .when-ago", "whiteSpace")) === "nowrap" && (await css("#row-pinned .when-exact", "display")) === "block" &&
    (await css("#row-pinned .when-exact", "color")) === (await tok("var(--foreground)")) &&
    (await css("#row-pinned .when-exact", "fontVariantNumeric")) === "tabular-nums" && (await css("#row-pinned .when-exact", "opacity")) === "1");
await check(".when--inline: one quiet line, the glyph and the short age", async () => (await css("#when-inline .when", "display")) === "inline-flex" &&
  (await css("#when-inline .when", "color")) === (await tok("var(--muted-foreground)")) && (await evaluate(`/^\\d+(s|m|h|d|w|mo|y) ago$/.test(document.querySelector("#when-inline [data-ago]").textContent)`)));

/* ── D6 / D7 · chart CSS ──────────────────────────────────────────────────────────────────────── */

await check("chart text is --fs-base in --muted-foreground; marks are full-strength tokens",
  async () => (await css("#trend text", "fontSize")) === "12px" && (await css("#trend text", "fill")) === (await tok("var(--muted-foreground)")) &&
    (await css("#trend .chart-line", "stroke")) === (await tok("var(--primary)")) && (await css("#trend .chart-line", "strokeWidth")) === "1.5px" &&
    (await css("#trend .chart-line", "opacity")) === "1" && (await css("#bars .chart-bar", "fill")) === (await tok("var(--primary)")));
await check("a hollow dot is filled with --chart-bg: the page, or the card it sits on",
  async () => (await css("#trend .chart-dot--hollow", "fill")) === (await tok("var(--background)")));
await check("markers: dashed 4 3 and a 3px floor tick, in --muted-foreground",
  async () => (await css("#trend .chart-marker", "strokeDasharray")) === "4px, 3px" && (await css("#trend .chart-tick", "strokeWidth")) === "3px" &&
    (await css("#trend .chart-marker", "stroke")) === (await tok("var(--muted-foreground)")));
await check("the key: an --icon-sm SQUARE swatch in its series' hue, set by `data-hue` (edge and fill); the caption muted",
  async () => (await css(".chart-key li", "width", "::before")) === "12px" && (await css(".chart-key li", "height", "::before")) === "12px" &&
    (await css(".chart-key li", "backgroundColor", "::before")) === (await tok("var(--cat-green)")) &&
    (await css(".chart-key li", "borderTopColor", "::before")) === (await tok("var(--cat-green)")) &&
    (await css("#charts figure .chart-plot + figcaption", "color")) === (await tok("var(--muted-foreground)")));

/* ── D8 · tabs ────────────────────────────────────────────────────────────────────────────────── */

// A tab is `inline-flex`; inside the row (a flex container) that computes to `flex` — flex items are blockified.
await check("a tab: a flex box, muted text on nothing, the one text size, no border",
  async () => ["flex", "inline-flex"].includes(await css("#tab-queue", "display")) && (await css("#tab-queue", "color")) === (await tok("var(--muted-foreground)")) &&
    (await css("#tab-queue", "backgroundColor")) === "rgba(0, 0, 0, 0)" && (await css("#tab-queue", "fontSize")) === "12px" &&
    (await css("#tab-queue", "borderTopWidth")) === "0px" && (await css("#tab-queue", "padding")) === "8px 15.2px");
await check("the selected tab is the one filled thing: --primary, the page colour as its text, 700",
  async () => (await css("#tab-activity", "backgroundColor")) === (await tok("var(--primary)")) && (await css("#tab-activity", "color")) === (await tok("var(--background)")) &&
    (await css("#tab-activity", "fontWeight")) === "700");
await hoverOver("#tab-queue");
await check("hover: --primary on a 10% --primary tint — and the tab's status suffix takes the tab's colour, not its tone",
  async () => (await css("#tab-queue", "color")) === (await tok("var(--primary)")) &&
    (await css("#tab-queue", "backgroundColor")) === (await tok("color-mix(in srgb, var(--primary) 10%, transparent)")) &&
    (await css("#tab-queue .tab-status", "color")) === (await tok("var(--primary)")),
  () => evaluate(`JSON.stringify([M.cs("#tab-queue").color, M.cs("#tab-queue").backgroundColor, M.cs("#tab-queue .tab-status").color])`));
await hoverOver("#tab-modes");
await check("a disabled tab is .45 and does NOT light up under the pointer",
  async () => (await css("#tab-modes", "opacity")) === "0.45" && (await css("#tab-modes", "color")) === (await tok("var(--muted-foreground)")) &&
    (await css("#tab-modes", "backgroundColor")) === "rgba(0, 0, 0, 0)" && (await css("#tab-modes", "cursor")) === "default");
await mouse("mouseMoved", 5, 5);
await settle();
const toneAtRest = await css("#tab-workers .tab-status", "color");
await evaluate(`document.getElementById("tab-workers").click(); null`);
await settle();
const toneSelected = await css("#tab-workers .tab-status", "color");
await evaluate(`document.getElementById("tab-activity").click(); null`);
await settle();
await check(".tab-status is its tone on an unselected tab, and the fill's text colour on the selected one",
  async () => toneAtRest === (await tok("var(--destructive)")) && toneSelected === (await tok("var(--background)")), () => JSON.stringify([toneAtRest, toneSelected]));
await check(".tab--info pushes the reference half to the row's end",
  () => evaluate(`Math.abs(document.getElementById("tab-how").getBoundingClientRect().right - document.getElementById("page-tabs").getBoundingClientRect().right) < 1`));
await check("--compact: no margin above the row, .35rem .75rem tabs",
  async () => (await css("#nested-tabs", "marginTop")) === "0px" && (await css("#tab-plain", "padding")) === "5.6px 12px");
await check("--strip: never wraps, each tab the strip's height, a long label truncated with an ellipsis",
  () => evaluate(`(() => { const row = document.getElementById("strip-tabs"), tab = document.getElementById("tab-a2"), label = tab.querySelector(".tab-label");
    return getComputedStyle(row).flexWrap === "nowrap" && Math.abs(tab.getBoundingClientRect().height - row.getBoundingClientRect().height) < 1 &&
      getComputedStyle(label).textOverflow === "ellipsis" && label.scrollWidth > label.clientWidth; })()`));
await send("Emulation.setEmulatedMedia", { media: "print" });
await check("print: no tab row, and every panel — hidden ones included — is printed",
  async () => (await css("#page-tabs", "display")) === "none" && (await css("#sec-workers", "display")) === "block" && (await css("#sec-retros", "display")) === "block");
await send("Emulation.setEmulatedMedia", { media: "" });

/* ── X2 · the focus ring, and the self-sufficient rendering ───────────────────────────────────── */

const SNAP = ["#dense-table thead th:nth-child(3)", cell, "#row-pinned > td:first-child", "#row-pinned > td:nth-child(3)",
  "#dense-table tbody tr:nth-child(2) > td.num", "#row-disabled > td:nth-child(3)", "#kv-table th", "#kv-table td", "#kv-list dt", "#kv-list dd",
  "#row-pinned .when-exact", "#when-inline .when", "#tab-activity", "#tab-queue", "#tab-workers .tab-status", "#tab-plain", "#tab-a2", "#trend text",
  "#charts figure .chart-plot + figcaption", ".chart-key li"];
// A border is compared as drawn: reset.css paints EVERY element's border-color, so an undrawn border
// (style none) differs in colour between the two renderings and means nothing.
const PROPS = ["display", "padding", "color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "textAlign", "verticalAlign",
  "minWidth", "whiteSpace", "boxShadow", "fill", "stroke"];
const LABELS = [...PROPS, "border-bottom"];
// Sizes, where data.css alone decides them. The reset makes everything border-box; a tokens-only page is
// content-box, so a width that leans on the reset is 13px wider there (the pick column was).
const SIZED = [["#row-pinned td.pick", "w"], ["#kv-labels th", "w"], ["#row-pinned .when", "w"], ["#tab-queue", "wh"], ["#tab-plain", "wh"], ["#kv-list dt", "w"]];
const snapshot = () => evaluate(`JSON.stringify({
  props: ${JSON.stringify(SNAP)}.map((sel) => { const s = M.cs(sel);
    return [...${JSON.stringify(PROPS)}.map((p) => s[p]),
      s.borderBottomStyle === "none" ? "no rule" : s.borderBottomWidth + " " + s.borderBottomStyle + " " + s.borderBottomColor]; }),
  sizes: ${JSON.stringify(SIZED)}.map(([sel, dims]) => { const b = M.box(sel); return (dims.includes("w") ? b.w.toFixed(2) : "") + " " + (dims.includes("h") ? b.h.toFixed(2) : ""); }),
})`);
const full = JSON.parse(await snapshot());
// D2's placeholder on the FULL page, where feedback.css's .empty--inline dresses it. `?bare` cannot see
// this: there .empty has no rule at all. Chromium aligns block children by `justify-items`, so the
// inline look inherited .empty's `center` and the line shrank to its words mid-table — measured.
const placeholderLine = () => evaluate(`JSON.stringify((() => { const p = document.querySelector("#engine-empty tr[data-table-placeholder]");
  if (!p) return null; const box = p.querySelector(".empty--inline"), words = document.createRange(); words.selectNodeContents(box);
  const line = words.getBoundingClientRect(), b = box.getBoundingClientRect(), c = p.cells[0].getBoundingClientRect();
  return { lineLeft: Math.round(line.left), cellLeft: Math.round(c.left), boxW: Math.round(b.width), cellW: Math.round(c.width) }; })())`);
const line = JSON.parse(await placeholderLine());
await check("D2 — on the full page the empty table's sentence starts at its cell's edge, in a box that runs the cell's width (S1's inline look, not centred)",
  () => line && line.lineLeft - line.cellLeft < 16 && line.boxW > line.cellW - 32, () => JSON.stringify(line));

/* ── fix round 1 · F3: every control the engine puts in a header is a 44px target on a touch screen ──
   The badge was 40 × 16 there — the one control in the header the coarse rule had left out. */
await evaluate(`document.querySelector("#engine-table th[data-col=state] .dropdown-item[data-pick=ok]").click(); null`);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
await until("matchMedia('(pointer: coarse)').matches", "the coarse pointer");
const touch = await evaluate(`JSON.stringify(["th[data-col=repo] .tbl-sort", "th[data-col=repo] .tbl-filter > summary", ".tbl-badge"].map((sel) => {
  const b = document.querySelector("#engine-table " + sel).getBoundingClientRect(); return [sel, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; }))`);
await check("fix round 1 — under a coarse pointer the engine's sort, filter and badge are each at least 44 × 44", () => JSON.parse(touch).every(([, w, h]) => w >= 44 && h >= 44), touch);
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await until("!matchMedia('(pointer: coarse)').matches", "the fine pointer again");

/* ── fix round 1 · item 8: a pick panel is never clipped by the wrapper that scrolls its table ──────
   A table with every row filtered away is a header and one placeholder row: a 58px .tablewrap, which
   scrolls, so it clipped a 136px panel and a press on a lower item landed on <html>. */
await evaluate(`(() => { const wrap = document.createElement("div"); wrap.className = "tablewrap"; wrap.id = "clip-wrap";
  wrap.innerHTML = '<table class="dense" data-table-tools data-table-unit="runs" aria-label="short runs"><thead><tr><th data-col="repo">repository</th>' +
    '<th data-col="state" data-filter="pick">state</th></tr></thead><tbody>' +
    ["asked", "ok", "failed", "queued", "running"].map((v, i) => "<tr><td>repo " + i + "</td><td>" + v + "</td></tr>").join("") + "</tbody></table>";
  document.getElementById("engine").append(wrap); })(); null`);
await sleep(150);
await evaluate(`(() => { const box = document.querySelector("#clip-wrap").previousElementSibling.querySelector("input[type=search]");
  box.value = "zzz"; box.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#clip-wrap").scrollIntoView({ block: "center", behavior: "instant" }); })(); null`);
// Scrolled and SETTLED before it opens: a scroll event arriving after the open would place the panel
// through the scroll follower, and the open itself would go unproven.
await sleep(200);
await evaluate(`document.querySelector("#clip-wrap th[data-col=state] .tbl-filter > summary").click(); null`);
await sleep(200);
const reach = await evaluate(`JSON.stringify((() => { const wrap = document.querySelector("#clip-wrap").getBoundingClientRect();
  const panel = document.querySelector("#clip-wrap th[data-col=state] .dropdown-panel").getBoundingClientRect();
  const items = [...document.querySelectorAll("#clip-wrap th[data-col=state] .dropdown-item")];
  return { placeholder: !!document.querySelector("#clip-wrap tr[data-table-placeholder=no-match]"), wrapH: Math.round(wrap.height), panelH: Math.round(panel.height),
    items: items.map((it) => { const r = it.getBoundingClientRect(); const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return [it.textContent, !!hit && hit.closest(".dropdown-item") === it]; }) }; })())`);
const reached = JSON.parse(reach);
await check("fix round 1 — in a no-match table shorter than its pick panel, every item of the panel is where a press lands",
  () => reached.placeholder && reached.panelH > reached.wrapH && reached.items.length === 6 && reached.items.every(([, hit]) => hit), reach);
const last = await evaluate(`(() => { const r = [...document.querySelectorAll("#clip-wrap th[data-col=state] .dropdown-item")].pop().getBoundingClientRect();
  return [(r.left + r.right) / 2, (r.top + r.bottom) / 2]; })()`);
await clickAt(last[0], last[1]);
await sleep(100);
await check("...and a real press on the lowest one filters by it", async () =>
  evaluate(`document.querySelector("#clip-wrap .tbl-badge")?.textContent === "running" && !document.querySelector("#clip-wrap th[data-col=state] .tbl-filter").open`));
await evaluate(`(() => { const wrap = document.querySelector("#clip-wrap"); wrap.previousElementSibling.remove(); wrap.nextElementSibling?.matches("p.result-count") && wrap.nextElementSibling.remove(); wrap.remove();
  localStorage.removeItem("table-view:demo-engine"); })(); null`);
/* ── fix round 2 · N-A: an open panel stays on its summary through every scroll; N-B: it closes when the
   reader scrolls its column out of the wrapper ──────────────────────────────────────────────────────
   A table wider and taller than its wrapper, with the pick column in the middle of what shows at the
   far right. Each scroll must MOVE what it names (the page, the wrapper down, the wrapper sideways), and
   the panel must keep its offset from the summary. Then a real wheel takes the column out of the
   wrapper: a panel beside nothing is closed, and focus stays where it was. */
await evaluate(`(() => { const wrap = document.createElement("div"); wrap.className = "tablewrap"; wrap.id = "scroll-wrap";
  wrap.style.setProperty("--tablewrap-max-h", "160px");
  const cols = ["repo", "a", "b", "c", "d", "state", "e", "f"];
  wrap.innerHTML = '<table class="dense" data-table-tools aria-label="wide runs"><thead><tr>' +
    cols.map((c) => '<th data-col="' + c + '"' + (c === "state" ? ' data-filter="pick"' : "") + ">" + c + "</th>").join("") + "</tr></thead><tbody>" +
    Array.from({ length: 12 }, (_, i) => "<tr>" + cols.map((c) => "<td>" + (c === "state" ? ["ok", "failed", "asked"][i % 3] : c + i) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>";
  wrap.firstElementChild.style.minWidth = "2400px";
  document.getElementById("engine").append(wrap); })(); null`);
await sleep(150);
await evaluate(`(() => { const w = document.querySelector("#scroll-wrap"); w.scrollIntoView({ block: "center", behavior: "instant" }); w.scrollLeft = w.scrollWidth; })(); null`);
await sleep(200);
await evaluate(`document.querySelector("#scroll-wrap th[data-col=state] .tbl-filter > summary").click(); window.focusedBefore = document.activeElement; null`);
await sleep(200);
const attach = async () => JSON.parse(await evaluate(`JSON.stringify((() => { const w = document.querySelector("#scroll-wrap"), d = w.querySelector("th[data-col=state] .tbl-filter");
  const s = d.firstElementChild.getBoundingClientRect(), p = d.querySelector(".dropdown-panel").getBoundingClientRect(), r = w.getBoundingClientRect();
  return { open: d.open, dx: Math.round(p.left - s.left), dy: Math.round(p.top - s.bottom), inWrap: s.left >= r.left && s.right <= r.right,
    y: Math.round(scrollY), top: Math.round(w.scrollTop), left: Math.round(w.scrollLeft) }; })())`));
const opened = await attach();
const moves = {};
await evaluate("scrollBy(0, 60); null"); await sleep(200); moves.page = await attach();
await evaluate(`document.querySelector("#scroll-wrap").scrollTop += 40; null`); await sleep(200); moves.down = await attach();
await evaluate(`document.querySelector("#scroll-wrap").scrollLeft -= 100; null`); await sleep(200); moves.sideways = await attach();
await check("fix round 2 — an open pick panel stays on its summary while the page scrolls, the wrapper scrolls down, and the wrapper scrolls sideways", () =>
  opened.open && opened.inWrap && moves.page.y > opened.y && moves.down.top > moves.page.top && moves.sideways.left < moves.down.left &&
    Object.values(moves).every((m) => m.open && Math.abs(m.dx - opened.dx) <= 1 && Math.abs(m.dy - opened.dy) <= 1), JSON.stringify({ opened, moves }));
const wheelAt = await evaluate(`(() => { const r = document.querySelector("#scroll-wrap").getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; })()`);
// The wheel is the compositor's to deliver: on a loaded Linux runner it had not landed 500ms later
// (scrollLeft still 1332, so the panel was rightly still open). Wait for the scroll itself, then give
// the page's scroll handler two frames to answer. A wheel that never lands is left to the check to report.
const wheelAway = async () => {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: wheelAt[0], y: wheelAt[1], deltaX: -4000, deltaY: 0 });
  await until(`document.querySelector("#scroll-wrap").scrollLeft === 0`, "the wheel to scroll the wrapper back").catch(() => {});
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))");
  await sleep(100);
};
await wheelAway();
const away = await attach();
await check("fix round 2 — wheeled back until its column is out of the wrapper, the panel is closed, and focus has not moved", async () =>
  away.left === 0 && !away.inWrap && !away.open && (await evaluate("document.activeElement === window.focusedBefore")), JSON.stringify(away));
// G3: with keyboard focus on an item of the open panel, the same scroll-away close hands focus to the
// panel's summary rather than stranding it in a closed <details>.
await evaluate(`(() => { const w = document.querySelector("#scroll-wrap"); w.scrollLeft = w.scrollWidth; })(); null`);
await sleep(200);
await evaluate(`document.querySelector("#scroll-wrap th[data-col=state] .tbl-filter > summary").click(); null`);
await sleep(200);
await evaluate(`document.querySelector("#scroll-wrap th[data-col=state] .dropdown-item").focus(); null`);
const itemFocused = await evaluate(`document.activeElement.matches("#scroll-wrap .dropdown-item")`);
await wheelAway();
const stranded = await evaluate(`JSON.stringify({ open: document.querySelector("#scroll-wrap th[data-col=state] .tbl-filter").open,
  focus: document.activeElement === document.querySelector("#scroll-wrap th[data-col=state] .tbl-filter > summary") ? "summary" : document.activeElement.tagName })`);
await check("fix round 3 — focus on a panel item when the reader wheels the column away: the panel closes and focus lands on its summary", () =>
  itemFocused && stranded === JSON.stringify({ open: false, focus: "summary" }), stranded);
await evaluate(`(() => { const wrap = document.querySelector("#scroll-wrap"); wrap.previousElementSibling.remove(); wrap.nextElementSibling?.matches("p.result-count") && wrap.nextElementSibling.remove(); wrap.remove(); })(); null`);
await open("bare&theme=warm");
const bare = JSON.parse(await snapshot());
const drift = [];
SNAP.forEach((sel, i) => LABELS.forEach((p, j) => { if (full.props[i][j] !== bare.props[i][j]) drift.push(`${sel} ${p}: full ${full.props[i][j]} / bare ${bare.props[i][j]}`); }));
SIZED.forEach(([sel], i) => { if (full.sizes[i] !== bare.sizes[i]) drift.push(`${sel} size: full ${full.sizes[i]} / bare ${bare.sizes[i]}`); });
await check(`tokens + chrome + data.css alone render ${SNAP.length} elements exactly as the full bundle does — ${LABELS.length} properties each, font-family and size included — and size ${SIZED.length} of them the same`,
  () => drift.length === 0, drift.slice(0, 8).join("\n        "));
await evaluate(`document.getElementById("tab-queue").focus(); null`);
await check("X2 — with no base.css ring in the page, a focused tab draws data.css's own: 2px --ring, inset 2px",
  async () => (await evaluate(`document.getElementById("tab-queue").matches(":focus-visible")`)) &&
    (await css("#tab-queue", "outlineStyle")) === "solid" && (await css("#tab-queue", "outlineWidth")) === "2px" &&
    (await css("#tab-queue", "outlineColor")) === (await tok("var(--ring)")) && (await css("#tab-queue", "outlineOffset")) === "-2px",
  () => evaluate(`JSON.stringify(["outlineStyle", "outlineWidth", "outlineColor", "outlineOffset"].map((p) => M.cs("#tab-queue")[p]))`));
await evaluate(`document.getElementById("tab-activity").focus(); null`);
await check("...and on the SELECTED tab the ring is the page colour, or it would vanish into the --primary fill",
  async () => (await css("#tab-activity", "outlineColor")) === (await tok("var(--background)")) && (await css("#tab-activity", "outlineStyle")) === "solid");
// Let go of the focus. Left on the tab, X3 hides its row and focus falls back to the body, but Chromium
// never repaints the tab: a stale 2px ring stayed in the pixels of every later shot (white on the light
// forced palette), which the two-shot ownership proof below found and a computed style cannot see.
await evaluate(`document.activeElement.blur(); null`);

/* ── X3 · hidden hides every component ────────────────────────────────────────────────────────── */

const HIDE = ["#page-tabs", "#tab-queue", "#dense-table", "#kv-table", "#kv-list", "#row-pinned .when", "#when-inline .when", ".chart-key",
  "#trend", "#sec-activity", "#tickers"];
const shownWhenHidden = await evaluate(`${JSON.stringify(HIDE)}.filter((sel) => { const el = document.querySelector(sel); el.hidden = true;
  const d = getComputedStyle(el).display; el.hidden = false; return d !== "none"; })`);
await check(`X3 — \`hidden\` hides each of ${HIDE.length} components whatever display it sets (tokens.css's rule, WP1)`,
  () => shownWhenHidden.length === 0, JSON.stringify(shownWhenHidden));

/* ── D2 · the table engine's header, count and placeholder ─────────────────────────────────────────
   On the ?bare page on purpose: data.css carries every .tbl-* rule since 0.60.0, so a tokens-only
   surface draws the same header. The glyphs were TEXT (↕ ▲ ▼ ⌕ ×) at .55 — 2.22–2.60:1 against the
   page — and are now the icon set's masks at full strength. */
const showD2 = (v) => () => JSON.stringify(v);
const masks = () => evaluate(`(() => {
  const maskOf = (name) => { const p = document.createElement("i"); p.style.maskImage = "var(--ico-" + name + ")"; document.body.append(p);
    const v = getComputedStyle(p).maskImage; p.remove(); return v; };
  const at = (sel, pseudo) => { const el = document.querySelector(sel); if (!el) throw new Error("no " + sel); return getComputedStyle(el, pseudo); };
  const glyph = (sel, pseudo, name) => { const c = at(sel, pseudo); return c.maskImage === maskOf(name) && c.width === "12px" && c.height === "12px"; };
  return {
    rest: glyph('#engine-table th[data-col="repo"] .tbl-sort', "::before", "arrow-up-down"),
    down: glyph('#engine-table th[data-col="findings"] .tbl-sort', "::before", "arrow-down"),
    up: glyph('#engine-empty th[data-col="repo"] .tbl-sort', "::before", "arrow-up"),
    funnel: glyph('#engine-table th[data-col="agent"] .tbl-filter > summary', "::before", "filter"),
    x: document.querySelector("#engine-table .tbl-badge") ? glyph("#engine-table .tbl-badge", "::after", "x") : "no badge",
    text: [...document.querySelectorAll("#engine-table .tbl-sort, #engine-table .tbl-filter > summary")].every((c) => c.textContent === ""),
    restColour: at('#engine-table th[data-col="repo"] .tbl-sort').color === M.tok("var(--muted-foreground)") && at('#engine-table th[data-col="repo"] .tbl-sort').opacity === "1",
    sortedColour: at('#engine-table th[data-col="findings"] .tbl-sort').color === M.tok("var(--primary)"),
  };
})()`);
const countBox = () => evaluate(`(() => { const c = document.querySelector("#engine-table").closest(".tablewrap").nextElementSibling;
  return c && c.matches(".result-count[data-table-count]") ? { text: c.textContent, h: c.getBoundingClientRect().height, mt: getComputedStyle(c).marginTop } : null; })()`);
const rest = await masks();
const quietCount = await countBox();
await check("D2 — the header glyphs are the icon set's masks at --icon-sm: ↕ at rest, ↓ on the descending column, ↑ on an ascending one, the funnel — and no glyph text",
  () => rest.rest && rest.down && rest.up && rest.funnel && rest.text, showD2(rest));
await check("...at rest in --muted-foreground at FULL strength (the .55 measured 2.22–2.60:1), --primary on the column that is sorting",
  () => rest.restColour && rest.sortedColour, showD2(rest));
await check("D2 — the count is silent at rest and takes no room: an empty status region, 0px high",
  () => quietCount && quietCount.text === "" && quietCount.h === 0 && quietCount.mt === "0px", showD2(quietCount));
// Tolerant on purpose: on an engine without pick rows this must reach the checks below and FAIL
// them, not abort the suite.
await evaluate(`document.querySelector('#engine-table th[data-col="state"] .dropdown-item[data-pick="ok"]')?.click(); null`);
await sleep(500);
const filtered = await masks();
const saidCount = await countBox();
await check("D2 — a pick filter marks its column: the funnel turns --primary, and the badge naming the value carries the x mask",
  async () => filtered.x === true && (await css('#engine-table th[data-col="state"] .tbl-filter > summary', "color")) === (await tok("var(--primary)")) &&
    (await css('#engine-table th[data-col="state"] .tbl-filter > summary', "content", "::after")) !== '"•"',
  () => evaluate(`JSON.stringify([document.querySelector("#engine-table .tbl-badge")?.outerHTML, getComputedStyle(document.querySelector('#engine-table th[data-col="state"] .tbl-filter > summary')).color])`));
await check("...and the count, settled, says what is withheld in the table's unit",
  () => saidCount && saidCount.text === "3 of 5 runs — 2 hidden by the filters" && saidCount.h > 0, showD2(saidCount));
await check("D2 — a table with no rows says so in a placeholder row across every column, start-aligned in S1's inline look",
  () => evaluate(`(() => { const p = document.querySelector("#engine-empty tr[data-table-placeholder]"); if (!p) return false;
    const box = p.querySelector(".empty--inline"), cell = p.cells[0], words = document.createRange(); words.selectNodeContents(box);
    return p.cells.length === 1 && cell.colSpan === 2 && box.textContent === "no runs yet" &&
      Math.abs(words.getBoundingClientRect().left - cell.getBoundingClientRect().left) < 16; })()`),
  () => evaluate(`JSON.stringify((() => { const p = document.querySelector("#engine-empty tr[data-table-placeholder]"); if (!p) return null;
    const words = document.createRange(); words.selectNodeContents(p.querySelector(".empty--inline")); return [p.outerHTML, words.getBoundingClientRect().left, p.cells[0].getBoundingClientRect().left]; })())`));

/* ── X1 · forced colours: two palettes, PAINTED pixels ───────────────────────────────────────────
   Under a forced palette the browser rewrites colours at PAINT time — it forces them, drops shadows,
   and paints a Canvas backplate behind text — so a computed style says what was asked for, not what
   reached the screen. An earlier version of this pass compared computed colours: it passed a selected
   tab whose label was invisible, and read the key's vanished swatches as drawn. So everything here is
   read from a screenshot, in the light AND the dark forced palette, at device scale 2 so a 12px
   stroke has pixels of full ink. The measures:
     · a mark (dot, bar, swatch, the pin bar) is its painted pixel against the Canvas around it, 3:1;
     · text is its INK (the pixel of its box furthest from the box's commonest colour) against that
       commonest colour, 4.5:1 — and for text on a fill, that commonest colour must BE the fill,
       or a backplate is standing between them;
     · a state pair (selected / not, solid / hollow, filled / outlined) differs by 3:1 of paint. */

// Screenshot the region around `sel` into the page, where M.px / M.ink read it.
const shoot = async (sel) => {
  await evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center", behavior: "instant" }); null`);
  const clip = await evaluate(`(() => { const q = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    // Whole CSS pixels: a fractional clip origin is registered a pixel or two off by the capture, and
    // every px() below would read its neighbour's paint (the ownership proof found 2.5px on a tab).
    const x = Math.floor(q.left + scrollX - 6), y = Math.floor(q.top + scrollY - 6);
    return { x, y, width: Math.ceil(q.right + scrollX + 6) - x, height: Math.ceil(q.bottom + scrollY + 6) - y, scale: 1 }; })()`);
  // Two animation frames first: a capture taken while the compositor is still settling the last change
  // (a scroll, a hidden target) can read a stale frame — the race WP2 closed in check-components.
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))");
  const { data } = await send("Page.captureScreenshot", { format: "png", clip });
  await evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch("data:image/png;base64,${data}")).blob());
    const c = new OffscreenCanvas(img.width, img.height), x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    window.SHOT = { x0: ${clip.x}, y0: ${clip.y}, k: img.width / ${clip.width}, w: img.width, h: img.height,
      d: x.getImageData(0, 0, img.width, img.height).data };
  })()`);
};
const PIXELS = `
  const S = window.SHOT;
  const at = (col, row) => { const i = (row * S.w + col) * 4; return [S.d[i], S.d[i + 1], S.d[i + 2]]; };
  const px = (x, y) => at(Math.round((x + scrollX - S.x0) * S.k), Math.round((y + scrollY - S.y0) * S.k));
  const pixels = (r) => { const out = [];
    for (let row = Math.round((r.top + scrollY - S.y0) * S.k); row < Math.round((r.bottom + scrollY - S.y0) * S.k); row += 1)
      for (let col = Math.round((r.left + scrollX - S.x0) * S.k); col < Math.round((r.right + scrollX - S.x0) * S.k); col += 1) out.push(at(col, row));
    return out; };
  const common = (r) => { const n = new Map(); let best = null;
    for (const p of pixels(r)) { const key = p.join(); n.set(key, (n.get(key) || 0) + 1); if (!best || n.get(key) > n.get(best)) best = key; }
    return best.split(",").map(Number); };
  const ink = (r) => { const bg = common(r); let best = bg, most = 1;
    for (const p of pixels(r)) { const q = M.ratio(p, bg); if (q > most) { most = q; best = p; } }
    return { ink: best, bg, ratio: most }; };
  const box = (q) => (typeof q === "string" ? document.querySelector(q) : q).getBoundingClientRect();
  const text = (q) => { const r = document.createRange(); r.selectNodeContents(typeof q === "string" ? document.querySelector(q) : q); return r.getBoundingClientRect(); };
  const grow = (r, n) => ({ left: r.left - n, top: r.top - n, right: r.right + n, bottom: r.bottom + n });
  const centre = (r) => px((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  const same = (a, b) => M.ratio(a, b) < 1.1;
`;
const measure = (body) => evaluate(`(() => { ${PIXELS} return JSON.stringify((() => { ${body} })()); })()`).then(JSON.parse);
const r2 = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : n);
const shown = (v) => () => JSON.stringify(v, (k, n) => r2(n));

/* X1's capture rule, last step, as a TWO-SHOT DIFF: the same clip is captured twice, the second time
   with ONLY the target hidden. The pixels that changed are the target's ink — at least 3 of them, by
   at least 1.5:1 — and their bounding box must sit where the target is: its rect within ±1px for a
   fill, inside its rect (a text range, a mark's box) ±1px otherwise. A clip that lands on a neighbour
   finds its ink in the wrong place; one that slides against its own mapping (captureBeyondViewport's
   re-layout, or a clip moved after it was measured) reads the target's ink off by the slide. The first
   form of this proof hid the whole clip element, which says "there is ink here" and nothing about
   WHERE: an 8px vertical slide of #dense-table and of #page-tabs passed it. */
const owns = async (clip, target, kind) => {
  // `host::after` hides ONLY the pseudo-element (a class the check's own adopted sheet hides) — the
  // badge's x is one, and hiding the whole badge would find its word and border and prove nothing
  // about the x. Its box is read off its computed size, at the end of its host's content box.
  const pseudo = target.endsWith("::after");
  const sel = JSON.stringify(pseudo ? target.slice(0, -"::after".length) : target);
  // A target that is not on the page fails the proof; it must not abort the suite.
  if (!(await evaluate(`!!document.querySelector(${sel})`))) return { target, kind, missing: true, ok: false };
  if (pseudo) await evaluate(`(() => { if (window.M_HIDE) return; window.M_HIDE = new CSSStyleSheet();
    window.M_HIDE.replaceSync(".m-hide-after::after { visibility: hidden !important; }"); document.adoptedStyleSheets = [...document.adoptedStyleSheets, window.M_HIDE]; })(); null`);
  const hide = (on) => pseudo ? `classList.toggle("m-hide-after", ${on})` : `style.visibility = "${on ? "hidden" : ""}"`;
  await shoot(clip);
  await evaluate(`window.SHOT_A = window.SHOT; document.querySelector(${sel}).${hide(true)}; null`);
  await shoot(clip);
  await evaluate(`document.querySelector(${sel}).${hide(false)}; null`);
  return measure(`
    const A = window.SHOT_A, B = S, el = document.querySelector(${sel});
    let n = 0, carried = 1, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let row = 0; row < A.h; row += 1) for (let col = 0; col < A.w; col += 1) {
      const i = (row * A.w + col) * 4;
      // For a mark or a word, a pixel is the target's paint only if the two shots differ by a real
      // contrast step, 1.25:1 or more. Below that it is compositor noise: two pixels of a neighbouring
      // edge re-rastered 122 to 114 grey (about 1.1:1) between the shots stretched the ink box 900px
      // and failed a correct target, 3 runs in 41. A glyph's own ink moves at 3:1 or more, so a slid
      // clip still shows. A FILL keeps every change: its box must match to the pixel, and the light
      // palette's 80% Highlight over the tab row's black rule moves less than 1.2:1 — measured, a
      // 1.25 floor cut both tabs' bottom edge off and failed them.
      if (Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2])) <= 2) continue;
      const q = M.ratio([A.d[i], A.d[i + 1], A.d[i + 2]], [B.d[i], B.d[i + 1], B.d[i + 2]]);
      if (${JSON.stringify(kind)} !== "fill" && q < 1.25) continue;
      n += 1; carried = Math.max(carried, q);
      x0 = Math.min(x0, col); x1 = Math.max(x1, col + 1); y0 = Math.min(y0, row); y1 = Math.max(y1, row + 1);
    }
    const ink = n ? { left: x0 / A.k + A.x0 - scrollX, right: x1 / A.k + A.x0 - scrollX, top: y0 / A.k + A.y0 - scrollY, bottom: y1 / A.k + A.y0 - scrollY } : null;
    const afterBox = (host) => { const b = host.getBoundingClientRect(), cs = getComputedStyle(host), a = getComputedStyle(host, "::after");
      const w = parseFloat(a.width), h = parseFloat(a.height), right = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const top = b.top + (b.height - h) / 2; return { left: right - w, right, top, bottom: top + h }; };
    const r = ${pseudo ? "afterBox(el)" : kind === "text" ? "text(el)" : "box(el)"};
    // An SVG mark's box leaves out its stroke, which paints half its width outside.
    const half = el instanceof SVGElement ? (parseFloat(getComputedStyle(el).strokeWidth) || 0) / 2 : 0;
    const rect = { left: r.left - half, right: r.right + half, top: r.top - half, bottom: r.bottom + half };
    const edges = ["left", "right", "top", "bottom"];
    const fits = !!ink && (${JSON.stringify(kind)} === "fill"
      ? edges.every((e) => Math.abs(ink[e] - rect[e]) <= 1)
      : ink.left >= rect.left - 1 && ink.right <= rect.right + 1 && ink.top >= rect.top - 1 && ink.bottom <= rect.bottom + 1);
    return { target: ${JSON.stringify(target)}, kind: ${JSON.stringify(kind)}, n, carried, ink, rect, ok: n >= 3 && carried >= 1.5 && fits };`);
};

/* ── Q6 · a series is never told apart by colour alone ──────────────────────────────────────────
   The flow chart's three series, and their swatches in the key, are CLASSED from painted pixels and
   blind to hue: the share of ink (2:1 or more off the chart's canvas) inside the mark, and on its edge.
   Solid is ink throughout; outlined, an inked edge round a clear inside; hatched, an inked edge round
   a partly inked inside. The three must come out solid / outlined / hatched in every mode: normal
   rendering on a light theme and a dark one, and both forced palettes. A swatch is FOUND by its ink,
   not placed by arithmetic, and must be the 12px square it claims to be; then the figure is taken away
   and every place measured must hold no ink — so the classes are read off the chart, not a neighbour. */
const cues = async (mode) => {
  const read = (rects) => measure(`
    const canvas = common(box("#flow"));
    const isInk = (p) => M.ratio(p, canvas) >= 2;
    const share = (r) => { const all = pixels(r); return all.length ? all.filter(isInk).length / all.length : 0; };
    const shrink = (r, n) => ({ left: r.left + n, right: r.right - n, top: r.top + n, bottom: r.bottom - n });
    const kindOf = (r, n) => {
      const inside = share(shrink(r, n));
      const rim = share({ left: r.left + 0.25, right: r.left + 0.75, top: r.top + (r.bottom - r.top) / 4, bottom: r.bottom - (r.bottom - r.top) / 4 });
      const kind = rim < 0.9 ? "none" : inside > 0.9 ? "solid" : inside < 0.05 ? "outline" : inside >= 0.12 && inside <= 0.75 ? "hatch" : "unclear";
      return { kind, inside, rim };
    };
    const inkBox = (r) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let row = Math.round((r.top + scrollY - S.y0) * S.k); row < Math.round((r.bottom + scrollY - S.y0) * S.k); row += 1)
        for (let col = Math.round((r.left + scrollX - S.x0) * S.k); col < Math.round((r.right + scrollX - S.x0) * S.k); col += 1)
          if (isInk(at(col, row))) { x0 = Math.min(x0, col); x1 = Math.max(x1, col + 1); y0 = Math.min(y0, row); y1 = Math.max(y1, row + 1); }
      return x0 === Infinity ? null : { left: x0 / S.k + S.x0 - scrollX, right: x1 / S.k + S.x0 - scrollX, top: y0 / S.k + S.y0 - scrollY, bottom: y1 / S.k + S.y0 - scrollY };
    };
    const given = ${JSON.stringify(rects || null)};
    const bars = given ? given.bars : [...document.querySelectorAll("#flow g.chart-series")].map((g) =>
      [...g.querySelectorAll("rect")].map((el) => { const b = box(el); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; })
        .sort((a, b) => (b.bottom - b.top) - (a.bottom - a.top))[0]);
    const swatches = given ? given.swatches : [...document.querySelectorAll("#flow-fig .chart-key li")].map((li) => {
      const r = box(li); return inkBox({ left: r.left - 1, right: r.left + 14, top: r.top - 2, bottom: r.bottom + 2 }); });
    const near = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i]))) <= 12;
    const hues = ["green", "red", "blue"].map((h) => M.rgba("var(--cat-" + h + ")"));
    // The INKIEST pixel inside each bar, not one picked by arithmetic: a bar at a fractional x put
    // \`left + 0.5\` on an anti-aliased edge, half hue and half canvas, and read no series' colour at
    // all. An outlined bar has no inside to sample, and its stroke's fully covered pixels are the
    // ones furthest from the canvas; so are a hatch's and a solid fill's.
    const inkiest = (r) => pixels(r).reduce((best, p) => (M.ratio(p, canvas) > M.ratio(best, canvas) ? p : best), canvas);
    const painted = bars.map(inkiest);
    return { rects: { bars, swatches }, bars: bars.map((r) => kindOf(r, 2.5)),
      swatches: swatches.map((r) => (r ? { ...kindOf(r, 3), w: r.right - r.left, h: r.bottom - r.top } : { kind: "missing" })),
      hue: painted.map((p, i) => near(p, hues[i])) };`);
  await shoot("#flow-fig");
  const on = await read();
  await evaluate(`document.getElementById("flow-fig").style.visibility = "hidden"; null`);
  await shoot("#flow-fig");
  const off = await read(on.rects);
  await evaluate(`document.getElementById("flow-fig").style.visibility = ""; null`);
  const kinds = (list) => list.map((c) => c.kind).join();
  await check(`Q6 ${mode} — the three series are told apart without their hue: the bars are ${kinds(on.bars)}`,
    () => kinds(on.bars) === "solid,outline,hatch", shown(on.bars));
  await check(`Q6 ${mode} — ...and the key's swatches draw the same cues, each a 12px square found by its ink: ${kinds(on.swatches)}`,
    () => kinds(on.swatches) === "solid,outline,hatch" && on.swatches.every((c) => Math.abs(c.w - 12) <= 1 && Math.abs(c.h - 12) <= 1), shown(on.swatches));
  await check(`Q6 ${mode} — ...read off the chart itself: with the figure taken away, no ink is left where they were`,
    () => [...off.bars, ...off.swatches].every((c) => c.inside < 0.05 && c.rim < 0.05), shown(off));
  return on;
};

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
for (const t of ["warm", "green"]) {
  await theme(t);
  await settle();
  const on = await cues(`normal ${t}`);
  await check(`Q6 normal ${t} — ...and each series paints its own hue: green, red, blue`, () => on.hue.every(Boolean), shown(on.hue));
}
await theme("warm");

/* ── fix round 1 · N1: the header controls take the house ring — 2px, 2px off — and nothing clips it ──
   Measured, not assumed: a real Tab lands on the control, and the ring is the pixels that change
   between that shot and one with nothing focused. They must stand 4px (offset + width) off every edge
   of the control's box; a side the wrapper clips would come in short. */
const tabKey = async () => { for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await sleep(50); };
const ringOf = async (from, target) => {
  await evaluate(`document.activeElement?.blur(); null`);
  await settle();
  await shoot("#engine-table thead");
  await evaluate(`window.SHOT_A = window.SHOT; document.querySelector(${JSON.stringify(from)}).focus(); null`);
  await tabKey();
  await settle();
  await shoot("#engine-table thead");
  const ring = await measure(`
    const A = window.SHOT_A, B = S, el = document.querySelector(${JSON.stringify(target)});
    let n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let row = 0; row < A.h; row += 1) for (let col = 0; col < A.w; col += 1) {
      const i = (row * A.w + col) * 4;
      if (Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2])) <= 2) continue;
      n += 1; x0 = Math.min(x0, col); x1 = Math.max(x1, col + 1); y0 = Math.min(y0, row); y1 = Math.max(y1, row + 1);
    }
    const r = box(el), cs = getComputedStyle(el), ink = n ? { left: x0 / A.k + A.x0 - scrollX, right: x1 / A.k + A.x0 - scrollX, top: y0 / A.k + A.y0 - scrollY, bottom: y1 / A.k + A.y0 - scrollY } : null;
    return { focused: document.activeElement === el, offset: cs.outlineOffset, width: cs.outlineWidth, n,
      out: ink && [r.left - ink.left, r.top - ink.top, ink.right - r.right, ink.bottom - r.bottom] };`);
  await evaluate(`document.activeElement?.blur(); null`);
  return ring;
};
const rings = [
  await ringOf("#engine .filter-bar > button", "#engine-table th[data-col=repo] .tbl-sort"),
  await ringOf("#engine-table th[data-col=state] .tbl-filter > summary", "#engine-table .tbl-badge"),
];
await check(`fix round 1 — a keyboard-focused sort button and badge take the house ring, 2px wide and 2px off, painted whole — ${rings.map((r) => (r.out || []).map(r2).join("/")).join(" and ")}px out`,
  () => rings.every((r) => r.focused && r.offset === "2px" && r.width === "2px" && r.out && r.out.every((d) => Math.abs(d - 4) <= 0.75)), shown(rings));

for (const scheme of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: scheme }] });
  await until("matchMedia('(forced-colors: active)').matches", "forced colours");
  await settle();
  console.log(`forced colours, ${scheme} palette (Canvas / CanvasText / Highlight / HighlightText / GrayText): ${await evaluate(
    `["Canvas", "CanvasText", "Highlight", "HighlightText", "GrayText"].map(M.tok).join(" / ")`)}`);
  const owned = [];
  for (const [clip, target, kind] of [
    ["#page-tabs", "#tab-activity", "fill"], ["#page-tabs", "#tab-queue", "text"], ["#page-tabs", "#tab-modes", "text"],
    ["#tab-syntax", "#tab-syntax", "text"], ["#stale-tabs", "#tab-stale", "fill"],
    ["#dense-table", "#row-pinned > td:first-child", "mark"], ["#dense-table", "#row-disabled > td:nth-child(3)", "text"],
    ["#trend", "#trend text", "mark"], ["#trend", "#trend circle.chart-dot:nth-of-type(3)", "mark"], ["#trend", "#trend .chart-dot--hollow", "mark"],
    ["#engine-table thead", '#engine-table th[data-col="repo"] .tbl-sort', "mark"],
    ["#engine-table thead", '#engine-table th[data-col="agent"] .tbl-filter > summary', "mark"],
    ["#engine-table thead", "#engine-table .tbl-badge", "mark"],
    ["#engine-table thead", "#engine-table .tbl-badge::after", "mark"],
  ]) owned.push(await owns(clip, target, kind));
  await check(`X1 ${scheme} — every clip below reads its own element: hiding ONLY it changes ≥3 pixels by ≥1.5:1, where it is (±1px)`,
    () => owned.every((o) => o.ok), shown(owned.filter((o) => !o.ok).length ? owned.filter((o) => !o.ok) : owned.map((o) => [o.target, o.n, o.carried])));
  // The table engine's glyphs are masks, which a forced palette would erase: each must be PAINTED, in
  // its own place, at 3:1 or more against what it sits on — read from the same two-shot diff.
  const glyphs = owned.filter((o) => o.target.startsWith("#engine-table"));
  await check(`X1 ${scheme} — the table engine's sort, filter, badge and the badge's own x are painted, each where it is: ${glyphs.map((o) => r2(o.carried)).join(", ")}:1`,
    () => glyphs.length === 4 && glyphs.every((o) => o.ok && o.carried >= 3), shown(glyphs));
  // F5: the filtered header's underline is a shadow, which a forced palette drops, so data.css makes it
  // a 2px CanvasText border there. Read as the run of ink down the header's padding at its foot.
  // CHROME KEEPS A COLLAPSED BORDER'S OLD COLOUR across a palette switch, sometimes. On the Linux runner
  // image the dark pass painted every table rule in the LIGHT palette's CanvasText (black on black),
  // while getComputedStyle said 2px white: 0px of ink, in about two runs of three under load, never on
  // a Mac. Neither a wait, a repaint, a relayout nor re-entering the palette cleared it; rebuilding the
  // collapsed borders did, right before the read (done at the switch, the stale colour came back). A
  // page opened in this palette never had the old one, and that page is what is read here.
  await evaluate(`document.querySelector("#engine-table").style.borderCollapse = "separate"; null`);
  await settle();
  await evaluate(`document.querySelector("#engine-table").style.borderCollapse = ""; null`);
  await settle();
  await shoot("#engine-table thead");
  const edges = await measure(`
    const run = (sel) => { const r = box(sel), bg = common(r), x = r.left + 2.5, step = 1 / S.k; let y = r.bottom + 2, n = 0;
      while (y > r.bottom - 8 && M.ratio(px(x, y), bg) < 3) y -= step;
      while (y > r.bottom - 8 && M.ratio(px(x, y), bg) >= 3) { n += 1; y -= step; }
      return n * step; };
    return { filtered: run('#engine-table th[data-col="state"]'), plain: run('#engine-table th[data-col="findings"]') };`);
  await check(`X1 ${scheme} — the filtered header keeps its underline as a ${r2(edges.filtered)}px rule of ink, where an unfiltered one has ${r2(edges.plain)}px`,
    () => edges.filtered >= 2 && edges.filtered >= edges.plain + 1, shown(edges));

  await shoot("#page-tabs");
  const tabs = await measure(`
    const sel = box("#tab-activity"), off = box("#tab-queue");
    const selFill = px(sel.left + 3, sel.top + sel.height / 2), offFill = px(off.left + 3, off.top + off.height / 2);
    const label = ink(text("#tab-activity")), offLabel = ink(text("#tab-queue")), disabled = ink(text("#tab-modes"));
    return { fills: M.ratio(selFill, offFill), label: label.ratio, onFill: same(label.bg, selFill), offLabel: offLabel.ratio, selFill, labelInk: label.ink,
      disabled: disabled.ratio, disabledInk: disabled.ink, enabledInk: offLabel.ink };`);
  await check(`X1 ${scheme} — the selected tab's label is painted on its fill, not on a backplate, at ${r2(tabs.label)}:1`,
    () => tabs.onFill && tabs.label >= 4.5, shown(tabs));
  await check(`X1 ${scheme} — the selected tab's fill stands ${r2(tabs.fills)}:1 off an unselected tab's, whose label is ${r2(tabs.offLabel)}:1`,
    () => tabs.fills >= 3 && tabs.offLabel >= 4.5, shown(tabs));
  await shoot("#tab-syntax");
  const syntax = await measure(`return ink(text("#tab-syntax"));`);
  // Disabled keeps its .45 under a forced palette, estate-wide (the lead's ruling; WCAG exempts it from
  // contrast): GrayText at 45% — in the INK, not as the tab's opacity, which would fade its focus ring
  // too — still painted, and not the enabled tabs' ink.
  const faded = await evaluate(`["#tab-modes", "#tab-syntax"].map((s) => { const c = getComputedStyle(document.querySelector(s));
    return c.opacity === "1" && c.color === M.tok("color-mix(in srgb, GrayText 45%, Canvas)"); })`);
  await check(`X1 ${scheme} — a disabled tab is GrayText at .45 (painted ${r2(tabs.disabled)}:1 disabled, ${r2(syntax.ratio)}:1 aria-disabled), not the enabled tabs' ink`,
    () => faded.every(Boolean) && tabs.disabled >= 2 && syntax.ratio >= 2 && tabs.disabledInk.join() !== tabs.enabledInk.join(),
    shown([faded, tabs.disabled, syntax.ratio, tabs.disabledInk, tabs.enabledInk]));

  // Selected AND disabled keeps the selected tab's Highlight fill, with its word faded on it — told
  // apart from an enabled selected tab by that word, and still readable as painted.
  await shoot("#stale-tabs");
  const stale = await measure(`
    const r = box("#tab-stale"), fill = px(r.left + 3, (r.top + r.bottom) / 2), word = ink(text("#tab-stale"));
    return { fill, word: word.ratio, wordInk: word.ink, onFill: same(word.bg, fill),
      fillAsSelected: same(fill, ${JSON.stringify(tabs.selFill)}), inkApart: M.ratio(word.ink, ${JSON.stringify(tabs.labelInk)}) };`);
  await check(`X1 ${scheme} — a SELECTED disabled tab keeps the Highlight fill, its word faded on it (${r2(stale.word)}:1, ${r2(stale.inkApart)}:1 off an enabled selected tab's word)`,
    () => stale.fillAsSelected && stale.onFill && stale.word >= 1.5 && stale.inkApart >= 1.5, shown([stale, tabs.selFill, tabs.labelInk]));

  await shoot("#dense-table");
  const rows = await measure(`
    const pin = box("#row-pinned > td:first-child"), plain = box("${row2} > td:first-child");
    const bar = M.ratio(px(pin.left + 0.5, pin.top + pin.height / 2), px(pin.left + 6, pin.top + pin.height / 2));
    const none = M.ratio(px(plain.left + 0.5, plain.top + plain.height / 2), px(plain.left + 6, plain.top + plain.height / 2));
    const off = ink(text("#row-disabled > td:nth-child(3)")), on = ink(text("${row2} > td:nth-child(3)"));
    return { bar, none, off: off.ratio, offInk: off.ink, onInk: on.ink };`);
  await check(`X1 ${scheme} — the pinned row's bar is painted at ${r2(rows.bar)}:1; an ordinary row shows none (${r2(rows.none)}:1)`,
    () => rows.bar >= 3 && rows.none < 1.1, shown(rows));
  await check(`X1 ${scheme} — a disabled row's text is GrayText at ${r2(rows.off)}:1, not an enabled row's ink`,
    () => rows.off >= 4.5 && rows.offInk.join() !== rows.onInk.join(), shown(rows));

  await shoot("#trend");
  const trend = await measure(`
    const canvas = common(box("#trend"));
    const dots = [...document.querySelectorAll("#trend .chart-dot")];
    const solid = box(dots[2]), next = box(dots[3]), hollow = box(dots.find((d) => d.classList.contains("chart-dot--hollow")));
    const mx = (solid.left + solid.right + next.left + next.right) / 4, my = (solid.top + solid.bottom + next.top + next.bottom) / 4;
    return { text: ink(box("#trend text")).ratio, line: ink({ left: mx - 2, right: mx + 2, top: my - 3, bottom: my + 3 }).ratio,
      solid: M.ratio(centre(solid), canvas), ring: ink(grow(hollow, 1)).ratio, fills: M.ratio(centre(solid), centre(hollow)) };`);
  await check(`X1 ${scheme} — chart text ${r2(trend.text)}:1 and its line ${r2(trend.line)}:1 are painted in the palette, not the theme`,
    () => trend.text >= 4.5 && trend.line >= 3, shown(trend));
  await check(`X1 ${scheme} — a solid dot (${r2(trend.solid)}:1) and a hollow one (its ring ${r2(trend.ring)}:1) differ by ${r2(trend.fills)}:1 of paint`,
    () => trend.solid >= 3 && trend.ring >= 3 && trend.fills >= 3, shown(trend));

  await cues(`X1 ${scheme}`);

  /* Q4 · the focus rings, with REAL keyboard focus: a :focus-visible forced through DevTools painted no
     ring in one Chromium build (X1). Tab lands on the selected tab; an unselected one takes focus from
     script after that key, which Chromium counts as keyboard focus — and each must say :focus-visible.
     The ring is read against the tab's own fill beside it, then read again with the focus gone: the
     spot must then BE the fill, or the clip was not on the ring. Warm and green, because a ring that
     fell back to the theme under `none` is dark on one and light on the other. */
  for (const t of ["warm", "green"]) {
    await theme(t);
    const ringAt = (id) => `const r = box("#${id}"), y = (r.top + r.bottom) / 2; return M.ratio(px(r.left + 1, y), px(r.left + 4.5, y));`;
    const rings = [];
    const clipOf = { "tab-syntax": "#tab-syntax", "tab-stale": "#stale-tabs" };
    for (const id of ["tab-activity", "tab-queue", "tab-syntax", "tab-stale"]) {
      if (id === "tab-activity") {
        await evaluate(`document.querySelector("#tabs .lede a").focus(); null`);
        await press("Tab");
      } else {
        await evaluate(`document.getElementById("${id}").focus(); null`);
      }
      const focus = await evaluate(`document.activeElement.id === "${id}" && document.activeElement.matches(":focus-visible")`);
      await settle();
      await shoot(clipOf[id] || "#page-tabs");
      const on = await measure(ringAt(id));
      await evaluate(`document.activeElement.blur(); null`);
      await settle();
      await shoot(clipOf[id] || "#page-tabs");
      const off = await measure(ringAt(id));
      rings.push({ id, focus, on, off });
    }
    await check(`X1 ${scheme} ${t} — a keyboard-focused tab's ring is painted ${rings.slice(0, 2).map((r) => r2(r.on)).join(":1 (selected), ")}:1 (unselected) off its fill, and gone without the focus`,
      () => rings.slice(0, 2).every((r) => r.focus && r.on >= 3 && r.off < 1.1), shown(rings));
    // A disabled tab's text is faded, its focus ring is not (2.4.7): a whole CanvasText ring, 3:1.
    await check(`X1 ${scheme} ${t} — ...and an aria-disabled tab's ring is NOT faded with it: ${r2(rings[2].on)}:1 off its fill, gone without the focus`,
      () => rings[2].focus && rings[2].on >= 3 && rings[2].off < 1.1, shown(rings[2]));
    await check(`X1 ${scheme} ${t} — ...and a SELECTED disabled tab's ring stays visible on its Highlight fill: ${r2(rings[3].on)}:1, gone without the focus`,
      () => rings[3].focus && rings[3].on >= 3 && rings[3].off < 1.1, shown(rings[3]));
  }
  await theme("warm");
}
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(100);
await check("X1 — stacked, the pinned card carries the bar on its edge", async () => (await css("#row-pinned", "borderLeftWidth")) === "3px" &&
  (await css("#row-pinned > td:first-child", "borderLeftWidth")) === "0px");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [] });

/* ── D0 · table body text is --foreground (0.61.0, Daniel 2026-09-30) ──────────────────────────────
   The fixture is a table inside a MUTED container, the shape that greyed a cell by inheritance, with
   every helper a surface quietens a cell with, the semantic colours that must stay, and a dimmed row. */

await open("theme=warm");
await evaluate(`(() => {
  const s = document.createElement("section");
  s.id = "fx-d0";
  // The helpers as the bundle and a surface give them: utilities.css after data.css, and a page's own
  // .muted (cockpit's). The container is muted the way a card's description or a field's help is.
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/src/utilities.css"; link.id = "fx-d0-utilities";
  const own = document.createElement("style");
  own.textContent = ".muted { color: var(--muted-foreground); } .fx-quiet { color: var(--muted-foreground); } .fx-stale { color: var(--warning); }";
  document.head.append(link, own);
  s.innerHTML = '<div class="fx-quiet"><table id="fx-ink"><thead><tr><th>state</th><th>what</th><th>when</th></tr></thead><tbody>' +
    '<tr><td id="fx-ink-td">text</td><td><span class="muted" id="fx-ink-muted">not reported</span> <span class="text-muted-foreground" id="fx-ink-util">lap 2</span></td>' +
    '<td class="text-muted-foreground" id="fx-ink-tdutil"><span class="when"><span class="when-ago">3 min ago</span><span class="when-exact" id="fx-ink-exact">2026-09-30 09:00</span></span></td></tr>' +
    '<tr><td><span class="tag" data-tone="destructive" id="fx-ink-tag">failed</span> <a href="#top" id="fx-ink-link">log</a></td><td></td><td></td></tr>' +
    '<tr aria-disabled="true"><td>off</td><td id="fx-ink-off"><span class="muted" id="fx-ink-off-muted">paused</span></td><td></td></tr>' +
    '<tr class="text-destructive"><td id="fx-ink-tr">refused</td><td><span class="muted" id="fx-ink-tr-muted">by policy</span> <a href="#top" id="fx-ink-tr-link">log</a></td><td></td></tr>' +
    '</tbody><tbody class="fx-stale"><tr><td id="fx-ink-tbody">stale</td><td></td><td></td></tr>' +
    '</tbody></table></div><p><a href="#top" id="fx-ink-link-out">log</a> <span class="when"><span class="when-exact" id="fx-exact-alone">2026-09-30 09:00</span></span></p>';
  document.querySelector("main").append(s); })(); null`);
await until(`document.getElementById("fx-d0-utilities").sheet`, "utilities.css to load");
const ink = () => evaluate(`Object.fromEntries(["fx-ink-td", "fx-ink-muted", "fx-ink-util", "fx-ink-tdutil", "fx-ink-exact", "fx-ink-tag", "fx-ink-link",
  "fx-ink-link-out", "fx-ink-off", "fx-ink-off-muted", "fx-exact-alone",
  "fx-ink-tr", "fx-ink-tr-muted", "fx-ink-tr-link", "fx-ink-tbody"].map((id) => [id, getComputedStyle(document.getElementById(id)).color])
  .concat([["th", getComputedStyle(document.querySelector("#fx-ink thead th")).color], ["fg", M.tok("var(--foreground)")], ["muted", M.tok("var(--muted-foreground)")],
    ["destructive", M.tok("var(--destructive)")], ["warning", M.tok("var(--warning)")]]))`);
for (const t of THEMES) {
  await theme(t);
  const c = await ink();
  await check(`D0 ${t}: a cell in a muted container is --foreground, and so are .muted, .text-muted-foreground (on the cell or inside it) and the when stamp`,
    () => ["fx-ink-td", "fx-ink-muted", "fx-ink-util", "fx-ink-tdutil", "fx-ink-exact"].every((id) => c[id] === c.fg), c);
  await check(`D0 ${t}: what MEANS something keeps its colour — the header muted, a toned tag, a link as it is outside the table`,
    () => c.th === c.muted && c["fx-ink-tag"] === c.destructive && c["fx-ink-link"] === c["fx-ink-link-out"], c);
  await check(`D0 ${t}: a row dimmed as a state stays dim, helpers inside it too; the stamp outside a table keeps its muted default`,
    () => c["fx-ink-off"] === c.muted && c["fx-ink-off-muted"] === c.muted && c["fx-exact-alone"] === c.muted, c);
  await check(`D0 ${t}: a colour set on a ROW or a BODY reaches its cells — a .text-destructive row (its helpers and links too) and a tbody coloured by the page`,
    () => ["fx-ink-tr", "fx-ink-tr-muted", "fx-ink-tr-link"].every((id) => c[id] === c.destructive) && c["fx-ink-tbody"] === c.warning, c);
}
await theme("warm");

/* ── stacked blocks keep a gap, and findFlushBlocks() finds the ones that do not (0.61.0) ─────────────
   Cockpit's case, rebuilt: a callout in one mount <div>, a table the engine paints in the next. On main
   the two touched (0px). The helper is proved able to FAIL: with the gap taken away it names the pair,
   and a lower block's `data-flush` and a fold after a fold are the two exceptions it honours. */

await evaluate(`(() => {
  const s = document.createElement("section");
  s.id = "fx-rhythm";
  s.innerHTML = '<div id="fx-rh-note"><p class="callout" id="fx-rh-callout">Only the rules in force are listed.</p></div>' +
    '<div id="fx-rh-mount"><table data-table-tools><thead><tr><th data-col="rule">rule</th><th data-col="scope">scope</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table></div>' +
    '<p class="callout" id="fx-rh-c1">first</p><p class="callout" id="fx-rh-c2">second</p>' +
    '<details class="fold"><summary>one</summary></details><details class="fold"><summary>two</summary></details>';
  document.querySelector("main").append(s); })(); null`);
await until(`document.querySelector("#fx-rh-mount > .filter-bar") && document.querySelector("#fx-rh-mount .tablewrap")`, "the table engine to paint the fixture");
const rhythm = () => evaluate(`(async () => {
  const helper = await import("/runtime/rhythm.js").catch((error) => ({ error }));
  const top = (sel) => document.querySelector(sel).getBoundingClientRect().top, bottom = (sel) => document.querySelector(sel).getBoundingClientRect().bottom;
  const name = (el) => el.id || el.tagName.toLowerCase() + "." + [...el.classList].join(".");
  return { note: top("#fx-rh-mount > .filter-bar") - bottom("#fx-rh-callout"), twoNotes: top("#fx-rh-c2") - bottom("#fx-rh-c1"),
    folds: top("#fx-rhythm details.fold + details.fold") - bottom("#fx-rhythm details.fold"),
    flush: helper.error ? "runtime/rhythm.js did not load: " + helper.error.message
      : helper.findFlushBlocks(document.getElementById("fx-rhythm")).map((p) => name(p.upper) + " / " + name(p.lower)) }; })()`);
const r0 = await rhythm();
await check("a callout in one mount div over a table the engine paints in the next: .6rem between the note and the toolbar (0px on 0.60.0)",
  () => Math.abs(r0.note - 9.6) < 0.1, r0);
await check("two callouts in a row are two notes, .6rem apart; a run of folds stays flush, each drawing its own rule",
  () => Math.abs(r0.twoNotes - 9.6) < 0.1 && Math.abs(r0.folds) < 0.1, r0);
await check("findFlushBlocks() finds no flush pair in the fixture (the folds are the documented exception)", () => r0.flush.length === 0, r0.flush);
await evaluate(`(() => { const st = document.createElement("style"); st.id = "fx-rh-zero";
  st.textContent = "#fx-rhythm .filter-bar, #fx-rh-c2 { margin-block-start: 0 !important; }"; document.head.append(st); })(); null`);
const r1 = await rhythm();
await check("...and it CAN fail: with the gap taken away it names the note over the toolbar, and the second callout",
  () => r1.flush.length === 2 && r1.flush.includes("fx-rh-callout / search.filter-bar") && r1.flush.includes("fx-rh-c1 / fx-rh-c2"), r1.flush);
await evaluate(`document.getElementById("fx-rh-c2").setAttribute("data-flush", ""); null`);
const rh2 = await rhythm();
await check("...and a lower block's data-flush is the page's word that it sits flush on purpose",
  () => rh2.flush.length === 1 && rh2.flush[0] === "fx-rh-callout / search.filter-bar", rh2.flush);
await evaluate(`document.getElementById("fx-rh-zero").remove(); document.getElementById("fx-rhythm").remove(); null`);
const demoFlush = [];
for (const width of [1280, 375]) {
  await open("theme=warm", width);
  const found = await evaluate(`(async () => { const helper = await import("/runtime/rhythm.js").catch((error) => ({ error }));
    if (helper.error) return ["runtime/rhythm.js did not load: " + helper.error.message];
    return helper.findFlushBlocks().map((p) => [p.upper, p.lower].map((el) => el.id || el.tagName.toLowerCase() + "." + [...el.classList].join(".")).join(" / ")); })()`);
  demoFlush.push(...found.map((f) => `${width}: ${f}`));
}
await check("the data demo itself has no flush pair of stacked blocks, at 1280 and at 375", () => demoFlush.length === 0, demoFlush);
await check("base.css spaces exactly the blocks runtime/rhythm.js checks (one list, written twice)", async () => {
  const { STACKED_BLOCKS } = await import(join(root, "runtime/rhythm.js"));
  const rule = readFileSync(join(root, "src/base.css"), "utf8").match(/\.panel-body\):not\(\[style\]\) > :is\(([^)]*)\)/);
  return rule && rule[1].split(",").map((x) => x.trim()).join(",") === STACKED_BLOCKS.join(",");
});

// THE RULE STAYS OUT OF A LAYOUT ROW. A class-carrying <div> or one with a `style` is a flex or grid
// row with its own gap, where a top margin drops one item below its neighbours. On 0.61.0's first cut
// a table after a label in a classed flex row sat 9.6px low (shape 2), and so did the second of two
// callouts in an unclassed <div style="display:flex"> (shape 1).
await open("theme=warm");
const rows = await evaluate(`(() => {
  const st = document.createElement("style"); st.textContent = ".fx-row { display: flex; gap: 8px; align-items: flex-start; }"; document.head.append(st);
  const s = document.createElement("section");
  s.innerHTML = '<div class="fx-row"><div id="fx-row-label">label</div><table id="fx-row-table"><tbody><tr><td>x</td></tr></tbody></table></div>' +
    '<div style="display: flex; gap: 8px; align-items: flex-start"><span>label</span><p class="callout" id="fx-flex-a">a</p><p class="callout" id="fx-flex-b">b</p></div>';
  document.querySelector("main").append(s);
  const top = (id) => document.getElementById(id).getBoundingClientRect().top;
  return { labelVsTable: top("fx-row-table") - top("fx-row-label"), calloutVsCallout: top("fx-flex-b") - top("fx-flex-a") }; })()`);
await check("shape 2 stays out of a classed flex row: a table beside a label keeps the row's top (9.6px low on the first cut)",
  () => Math.abs(rows.labelVsTable) < 0.1, rows);
await check("shape 1 stays out of an unclassed <div style=\"display: flex\">: two callouts in it share a top",
  () => Math.abs(rows.calloutVsCallout) < 0.1, rows);

/* ── inline code in a table cell keeps its word on a phone (0.61.0) ─────────────────────────────────
   `overflow-wrap: anywhere` shrank the code column's min-content to one character: at 375px a
   28-character key stood five lines tall in a 70px column. `break-word` keeps the key whole. */

await open("theme=warm", 375);
const longKey = await evaluate(`(async () => {
  const s = document.createElement("section");
  s.innerHTML = '<table id="fx-code"><thead><tr><th>key</th><th>what it does</th></tr></thead><tbody>' +
    '<tr><td><code>automation.execution.enabled</code></td><td>Turns the executor on for every registered repository, which is the act that spends money, so only Daniel flips it and the page says so.</td></tr>' +
    '<tr><td><code>DD_COCKPIT_DOM_PATCH_FIXTURE_FOR_THE_RELEASE_WORKFLOW</code></td><td>Where CI finds the vendored patcher.</td></tr></tbody></table>';
  document.querySelector("main").append(s);
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  const lines = (el) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size;
  const codes = [...document.querySelectorAll("#fx-code code")];
  return { lines: codes.map(lines), wrapped: document.querySelector("#fx-code").parentElement.classList.contains("tablewrap"),
    table: document.querySelector("#fx-code").getBoundingClientRect().width, wrap: document.querySelector("#fx-code").parentElement.getBoundingClientRect().width,
    page: document.scrollingElement.scrollWidth, vw: innerWidth }; })()`);
await check("375px: a key that fits the column stays on one line (broken over three lines on 0.60.0)", () => longKey.lines[0] === 1, longKey);
await check("...a key with no break in it wider than the phone widens its table inside the scrolling .tablewrap, never the page", () =>
  longKey.lines[1] === 1 && longKey.wrapped && longKey.table > longKey.wrap && longKey.page <= longKey.vw, longKey);

/* ── contrast: every new pairing, four themes, three surfaces ─────────────────────────────────── */

// [label, foreground, layers over the surface, the minimum it must clear (0 = reported, not gated),
//  the surfaces it is gated on when not all three — a value outside them is printed in brackets]
const PIN = "color-mix(in srgb, var(--warning) 5%, transparent)";
const HOVER = "color-mix(in srgb, var(--primary) 10%, transparent)";
const STALE = "color-mix(in srgb, var(--destructive) 8%, transparent)";
const PAIRS = [
  ["pinned row: --foreground on the 5% --warning tint", "var(--foreground)", [PIN], 4.5],
  // --muted is a menu item's hover fill (components.css), never a table's surface; on warm, muted text
  // there is 4.67 BEFORE any tint, so no tint step can hold it — it is reported, and data.css says so.
  ["pinned row: --muted-foreground (the stamp) on the tint", "var(--muted-foreground)", [PIN], 4.5, ["--background", "--card"]],
  ["pinned row: --primary (a forward link) on the tint", "var(--primary)", [PIN], 4.5],
  ["pinned row: --warning (its tag) on the tint", "var(--warning)", [PIN], 4.5],
  ["pinned row: the 3px --warning bar (graphic)", "var(--warning)", [], 3],
  ["stacked pinned card: its labels, --muted-foreground (the card is always --card)", "var(--muted-foreground)", ["var(--card)", PIN], 4.5],
  ["stacked pinned card: --warning (its tag)", "var(--warning)", ["var(--card)", PIN], 4.5],
  ["header, when stamp, disabled row, chart label: --muted-foreground", "var(--muted-foreground)", [], 4.5],
  ["kv label: --primary", "var(--primary)", [], 4.5],
  ["kv value, a dense cell: --foreground", "var(--foreground)", [], 4.5],
  ["selected tab: --background on --primary", "var(--background)", ["var(--primary)"], 4.5],
  ["selected tab's focus ring: --background on --primary (graphic)", "var(--background)", ["var(--primary)"], 3],
  ["tab focus ring: --ring (graphic)", "var(--ring)", [], 3],
  ["tab hover: --primary on its 10% tint (the label and, since 0.60.0, its status suffix)", "var(--primary)", [HOVER], 4.5],
  ...["destructive", "warning", "success", "info", "pending"].map((tone) => [`.tab-status at rest: --${tone}`, `var(--${tone})`, [], 4.5]),
  ["chart line, dot, bar: --primary (graphic)", "var(--primary)", [], 3],
  ...["green", "red", "blue"].map((hue) => [`chart series and key swatch: --cat-${hue} (graphic)`, `var(--cat-${hue})`, [], 3]),
  ["chart marker and floor tick: --muted-foreground (graphic)", "var(--muted-foreground)", [], 3],
  ["table engine glyph at rest (sort, funnel): --muted-foreground at full strength (graphic)", "var(--muted-foreground)", [], 3],
  ["table engine glyph in force, filtered header and badge: --primary (graphic)", "var(--primary)", [], 3],
  ["chart axis: --border (decoration; the values are also in a table)", "var(--border)", [], 0],
  ["chart grid: --border 55% (decoration)", "color-mix(in srgb, var(--border) 55%, transparent)", [], 0],
  ["tab row rule: --border 80% (decoration)", "color-mix(in srgb, var(--border) 80%, transparent)", [], 0],
  ["for WP3 — running tick: --info on the strip", "var(--info)", [], 4.5],
  ["for WP3 — .tick-sep: --border (decoration, aria-hidden)", "var(--border)", [], 0],
  // WP3's today: a stale row's 8% --destructive tint, on the strip's --card. Reported, not gated here.
  ["for WP3 — stale tick: --destructive (its age) on the 8% tint", "var(--destructive)", ["var(--card)", STALE], 0],
  ["for WP3 — stale tick: --muted-foreground (next, the figures' labels) on the 8% tint", "var(--muted-foreground)", ["var(--card)", STALE], 0],
];
const results = [];
for (const t of THEMES) {
  await theme(t);
  for (const surface of SURFACES) {
    const r = await evaluate(`${JSON.stringify(PAIRS)}.map(([, fg, layers]) => M.contrast(fg, ${JSON.stringify(surface)}, layers))`);
    r.forEach((ratio, i) => results.push({ i, t, surface, ratio }));
  }
}
await theme("warm");
const table = [`| pairing | ${THEMES.map((t) => `${t} bg / card / muted`).join(" | ")} | min | needs |`, `|---|${THEMES.map(() => "---").join("|")}|---|---|`];
const failing = [];
PAIRS.forEach(([label, , , min, gatedOn = SURFACES], i) => {
  const row = results.filter((r) => r.i === i);
  const worst = Math.min(...row.filter((r) => gatedOn.includes(r.surface)).map((r) => r.ratio));
  if (min && worst < min) failing.push(`${label}: ${worst.toFixed(2)} < ${min}`);
  const shown = (t, s) => { const v = row.find((r) => r.t === t && r.surface === s).ratio.toFixed(2); return gatedOn.includes(s) ? v : `(${v})`; };
  table.push(`| ${label} | ${THEMES.map((t) => SURFACES.map((s) => shown(t, s)).join(" / ")).join(" | ")} | ${worst.toFixed(2)} | ${min || "—"} |`);
});
console.log(`\n${table.join("\n")}\n`);
await check("every gated pairing clears its threshold on all four themes and every surface it is gated on (4.5:1 text, 3:1 graphics)",
  () => failing.length === 0, failing.join("\n        "));

browser.close();
server.close();
done();
