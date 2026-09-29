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
 *   · FORCED COLOURS. A state drawn by a fill or a tint disappears under a forced palette; each one
 *     this file draws is asserted to compute DIFFERENT colours for its two states there (X1).
 *   · `hidden`. An author `display` beats the UA's `[hidden]`; every component must still hide, through
 *     tokens.css's one rule and no guard of its own (X3).
 *   · THE PICK CELL. Under a coarse pointer the bare checkbox stays small and the CELL is the 44px
 *     target; a press anywhere in it toggles the box once, through the box's own click.
 *   · CONTRAST. Every new text/background and edge pairing, from the colours the browser actually
 *     resolves for the tokens — four themes, three surfaces — and printed as the table the report quotes.
 *
 * It drives examples/data.html from this checkout. The page carries marked stand-ins for what other
 * 0.60.0 packages own (WP1's tokens and X3 rule, WP4's glyphs, WP5's checkbox, WP7's .tag, WP3's
 * chrome lines), each switched on only while the real thing is missing; the run prints which.
 *
 *   node scripts/check-data.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, reporter, requireBrowser, serve, sleep } from "./lib/chromium.mjs";

requireBrowser("check-data", "Computed styles, rendered pixels, forced colours and a coarse pointer are browser behaviour.");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = reporter("check-data");
const server = await serve(root);
const browser = await launch("data");
const { evaluate, until, navigate, send } = browser;

const THEMES = ["warm", "green", "mono", "paper"];
const SURFACES = ["--background", "--card", "--muted"];

// The instrument. `tok` resolves any CSS colour expression through a probe. `rgba` reads the resolved
// colour as numbers — rgb()/color(srgb) by parsing, anything else (the --cat-* oklch hues) by painting it
// opaque on a canvas — and throws on a form it cannot read rather than guess. `over` composites a stack
// (an opaque surface first, translucent layers over it) in FLOATS, as the spec's figures were computed:
// Chromium's 8-bit canvas blend lands one unit darker per channel, which moved paper's --warning on its
// --muted tint from 4.53 to 4.48 — enough to flip a verdict at the threshold. `contrast` is WCAG 2.x.
const INSTRUMENT = `window.M = {
  tok(expr) { const p = document.createElement("span"); document.body.append(p); p.style.color = expr;
    const v = getComputedStyle(p).color; p.remove(); return v; },
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
console.log(`stand-ins in force: ${await evaluate("document.documentElement.dataset.standins")}`);

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
await check("the sticky header in a --card card paints the card, not the page (WP3's line — stand-in until WP3 lands)",
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
await check("...an empty cell is dropped rather than drawn as a labelled blank line",
  async () => (await css("#dense-table tbody tr:last-child > td.num", "display")) === "none");
await evaluate(`document.querySelector("${row2}").hidden = true; null`);
await check("...and a row the pager hid stays hidden though every row is now a block — through tokens.css's [hidden], no guard of its own (X3)",
  async () => (await css(row2, "display")) === "none");
await evaluate(`document.querySelector("${row2}").hidden = false; null`);
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

await check(".when: an inline block with the column's 5.5rem floor, two nowrap lines, the stamp muted and tabular",
  async () => (await css("#row-pinned .when", "display")) === "inline-block" && (await css("#row-pinned .when", "minWidth")) === "88px" &&
    (await css("#row-pinned .when-ago", "whiteSpace")) === "nowrap" && (await css("#row-pinned .when-exact", "display")) === "block" &&
    (await css("#row-pinned .when-exact", "color")) === (await tok("var(--muted-foreground)")) &&
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
await check("the key: a --dot-size SQUARE swatch in the series colour; the caption muted",
  async () => (await css(".chart-key li", "width", "::before")) === "8px" && (await css(".chart-key li", "backgroundColor", "::before")) === (await tok("var(--cat-green)")) &&
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

/* ── X3 · hidden hides every component ────────────────────────────────────────────────────────── */

const HIDE = ["#page-tabs", "#tab-queue", "#dense-table", "#kv-table", "#kv-list", "#row-pinned .when", "#when-inline .when", ".chart-key",
  "#trend", "#sec-activity", "#tickers"];
const shownWhenHidden = await evaluate(`${JSON.stringify(HIDE)}.filter((sel) => { const el = document.querySelector(sel); el.hidden = true;
  const d = getComputedStyle(el).display; el.hidden = false; return d !== "none"; })`);
await check(`X3 — \`hidden\` hides each of ${HIDE.length} components whatever display it sets (tokens.css's rule; a marked stand-in until WP1 lands)`,
  () => shownWhenHidden.length === 0, JSON.stringify(shownWhenHidden));

/* ── X1 · forced colours ──────────────────────────────────────────────────────────────────────── */

await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
await until("matchMedia('(forced-colors: active)').matches", "forced colours");
await settle();
const canvas = await tok("Canvas");
const pairs = await evaluate(`(() => {
  const s = (sel, p, pseudo) => M.cs(sel, pseudo)[p];
  return {
    tab: [s("#tab-activity", "backgroundColor"), s("#tab-queue", "backgroundColor"), s("#tab-activity", "color"), s("#tab-queue", "color")],
    disabledTab: [s("#tab-modes", "color"), s("#tab-queue", "color"), s("#tab-syntax", "color")],
    pin: [s("#row-pinned > td:first-child", "borderLeftWidth"), s("#row-pinned > td:first-child", "borderLeftColor"),
      s("${row2} > td:first-child", "borderLeftWidth")],
    disabledRow: [s("#row-disabled > td:nth-child(3)", "color"), s("${row2} > td:nth-child(3)", "color")],
    dots: [s("#trend .chart-dot:not(.chart-dot--hollow)", "fill"), s("#trend .chart-dot--hollow", "fill"), s("#trend .chart-dot--hollow", "stroke")],
    series: [s('#flow g[data-series="income"] rect', "fill"), s('#flow g[data-series="expenses"] rect', "fill"), s('#flow g[data-series="expenses"] rect', "stroke")],
    text: s("#trend text", "fill"), line: s("#trend .chart-line", "stroke"),
    swatches: [s(".chart-key li:nth-child(1)", "backgroundColor", "::before"), s(".chart-key li:nth-child(2)", "backgroundColor", "::before"),
      s(".chart-key li:nth-child(2)", "borderTopColor", "::before"), s(".chart-key li:nth-child(2)", "borderTopWidth", "::before")],
  };
})()`);
const sys = { highlight: await tok("Highlight"), text: await tok("CanvasText"), gray: await tok("GrayText") };
await check("X1 — the selected tab stays distinguishable: Highlight / HighlightText, where the others are Canvas / CanvasText",
  () => pairs.tab[0] === sys.highlight && pairs.tab[0] !== pairs.tab[1] && pairs.tab[2] !== pairs.tab[3], JSON.stringify(pairs.tab));
await check("X1 — a disabled tab (disabled or aria-disabled) is GrayText", () => pairs.disabledTab[0] === sys.gray && pairs.disabledTab[2] === sys.gray &&
  pairs.disabledTab[0] !== pairs.disabledTab[1], JSON.stringify(pairs.disabledTab));
await check("X1 — the pinned row keeps its bar as a 3px CanvasText border (the tint and the inset shadow are both dropped)",
  () => pairs.pin[0] === "3px" && pairs.pin[1] === sys.text && pairs.pin[2] === "0px", JSON.stringify(pairs.pin));
await check("X1 — a disabled row is GrayText, an enabled one is not", () => pairs.disabledRow[0] === sys.gray && pairs.disabledRow[0] !== pairs.disabledRow[1], JSON.stringify(pairs.disabledRow));
await check("X1 — a solid and a hollow dot differ: CanvasText against Canvas inside a CanvasText ring",
  () => pairs.dots[0] === sys.text && pairs.dots[1] === canvas && pairs.dots[2] === sys.text, JSON.stringify(pairs.dots));
await check("X1 — two series differ: the second is outlined, not filled",
  () => pairs.series[0] === sys.text && pairs.series[1] === canvas && pairs.series[2] === sys.text, JSON.stringify(pairs.series));
await check("X1 — chart text and lines are CanvasText, not the theme colour the SVG would otherwise keep",
  () => pairs.text === sys.text && pairs.line === sys.text, JSON.stringify([pairs.text, pairs.line]));
await check("X1 — the key's swatches are drawn (not the Canvas colour a forced background becomes), the second outlined like its series",
  () => pairs.swatches[0] === sys.text && pairs.swatches[1] === canvas && pairs.swatches[2] === sys.text && pairs.swatches[3] === "1px", JSON.stringify(pairs.swatches));
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(100);
await check("X1 — stacked, the pinned card carries the bar on its edge", async () => (await css("#row-pinned", "borderLeftWidth")) === "3px" &&
  (await css("#row-pinned > td:first-child", "borderLeftWidth")) === "0px");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [] });

/* ── contrast: every new pairing, four themes, three surfaces ─────────────────────────────────── */

// [label, foreground, layers over the surface, the minimum it must clear (0 = reported, not gated),
//  the surfaces it is gated on when not all three — a value outside them is printed in brackets]
const PIN = "color-mix(in srgb, var(--warning) 5%, transparent)";
const HOVER = "color-mix(in srgb, var(--primary) 10%, transparent)";
const PAIRS = [
  ["pinned row: --foreground on the 6% --warning tint", "var(--foreground)", [PIN], 4.5],
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
  ["chart axis: --border (decoration; the values are also in a table)", "var(--border)", [], 0],
  ["chart grid: --border 55% (decoration)", "color-mix(in srgb, var(--border) 55%, transparent)", [], 0],
  ["tab row rule: --border 80% (decoration)", "color-mix(in srgb, var(--border) 80%, transparent)", [], 0],
  ["for WP3 — running tick: --info on the strip", "var(--info)", [], 4.5],
  ["for WP3 — .tick-sep: --border (decoration, aria-hidden)", "var(--border)", [], 0],
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
