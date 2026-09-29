#!/usr/bin/env node
/*
 * check-charts.mjs — runtime/charts.js in a real browser: the points, the break, the size, the text.
 *
 * WHAT IS AT RISK:
 *   · THE TEXT SIZE. Both charts this replaces set labels at 9-11 units inside a scaled viewBox, so the
 *     text shrank with the column: a 720-unit chart shown 360px wide printed 5px labels. A computed
 *     `font-size` of 12px is NOT enough to prove that fixed — under a viewBox the CSS still says 12px
 *     and the pixels are 6. So the RENDERED glyph box is measured at two plot widths and must match,
 *     and the SVG must have no viewBox and be exactly the plot's size.
 *   · THE POINTS. A chart that draws is not a chart that draws the data. The dots are asserted at their
 *     slots and heights — the max at the top, zero on the axis — and a hollow point must break the line:
 *     the path's subpaths must be exactly the runs of solid points.
 *   · A CHART IN A HIDDEN TAB. It measures 0 when rendered; it must draw when the panel is shown, and
 *     redraw when the plot is resized.
 *   · A CHART IN A GRID OR A FLEX ROW. The drawn SVG is the figure's min-content, so without
 *     `min-inline-size: 0` a `1fr` track or a `flex: 1` item never narrows below the width it was
 *     drawn at: the plot never resizes and the chart never redraws — it overflows its column.
 *   · COLOUR BY CLASS. `fill="var(--x)"` silently paints black; so no mark may carry a colour
 *     attribute, and a theme switch must recolour the SAME nodes with no redraw.
 *   · NO STYLE ATTRIBUTE. Under seedr's `style-src 'self'` the browser drops every one: the series'
 *     `style="--chart-color: …"` this used to write left both series in --primary. So a page is loaded
 *     under that very policy — proven in force first — and each series and each swatch of the key must
 *     paint its own hue there.
 *   · A CUE BESIDE THE HUE. Series are solid, outlined and hatched by position, in every mode; an
 *     outlined bar is inset by half its stroke so every bar paints the same box.
 *
 *   node scripts/check-charts.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, reporter, requireBrowser, serve } from "./lib/chromium.mjs";

requireBrowser("check-charts", "Layout, rendered glyph boxes and a ResizeObserver are browser behaviour.");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = reporter("check-charts");

const HARNESS = `<!doctype html><html data-theme="warm"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/data.css">
<style id="standin-wp1" media="not all">
  :root { --cat-l: 0.45; --cat-c: 0.075; --cat-green: oklch(var(--cat-l) var(--cat-c) 150); --cat-red: oklch(var(--cat-l) var(--cat-c) 25);
    --cat-blue: oklch(var(--cat-l) var(--cat-c) 255); }
</style>
<style>
  body { margin: 0; font-family: var(--font-mono); font-size: var(--fs-base); }
  .row-grid { display: grid; grid-template-columns: 1fr 1fr; width: 800px; }
  .row-flex { display: flex; width: 800px; }
  .row-flex > .chart { flex: 1; }
</style></head><body>
<div id="box" style="width: 960px"><figure class="chart"><div class="chart-plot" id="line"></div></figure></div>
<div id="hidden-panel" hidden><figure class="chart"><div class="chart-plot" id="lazy"></div></figure></div>
<div style="width: 300px"><figure class="chart"><div class="chart-plot" id="narrow"></div></figure></div>
<div style="width: 600px"><figure class="chart"><div class="chart-plot" id="bars"></div></figure></div>
<div style="width: 600px"><figure class="chart"><div class="chart-plot" id="grouped"></div></figure></div>
<div style="width: 600px"><figure class="chart"><div class="chart-plot" id="signed"></div></figure></div>
<div style="width: 600px"><figure class="chart"><div class="chart-plot" id="empty"></div></figure></div>
<div class="row-grid" id="grid-row"><figure class="chart"><div class="chart-plot" id="g1"></div></figure><figure class="chart"><div class="chart-plot" id="g2"></div></figure></div>
<div class="row-flex" id="flex-row"><figure class="chart"><div class="chart-plot" id="f1"></div></figure><figure class="chart"><div class="chart-plot" id="f2"></div></figure></div>
<script>
  // WP1's --cat-* hues, from tokens.css once WP1 has landed; until then the marked stand-in above.
  window.STANDINS = getComputedStyle(document.documentElement).getPropertyValue("--cat-green").trim() ? "none" : "wp1";
  if (window.STANDINS !== "none") document.getElementById("standin-wp1").media = "all";
</script>
<script type="module">
  import { renderLineChart, renderBarChart } from "/runtime/charts.js";
  window.renderLineChart = renderLineChart;
  window.renderBarChart = renderBarChart;
  window.frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.WEEKS = [
    { x: "w1", v: 1, n: 12 }, { x: "w2", v: 3, n: 2 }, { x: "w3", v: 2, n: 14 }, { x: "w4", v: 4, n: 16 },
    { x: "w5", v: 0, n: 11 }, { x: "w6", v: null, n: 0 }, { x: "w7", v: 2, n: 13 }, { x: "w8", v: 1, n: 9 },
  ];
  window.LINE = { label: "mistakes per week", x: (p) => p.x, value: (p) => p.v, solid: (p) => p.n >= 5, sub: (p) => "n " + p.n,
    tip: (p) => p.x + ": " + p.v, markers: [{ at: 2, kind: "line", tip: "model changed" }, { at: 6, kind: "tick", tip: "rules added" }] };
  window.q = (id, sel) => Array.from(document.querySelectorAll("#" + id + " " + sel));
  // Each plot's width and its SVG's, once every SVG matches its plot or 30 frames have passed.
  window.widths = async (ids) => {
    const read = () => ids.map((id) => { const p = document.getElementById(id); return [p.clientWidth, +p.querySelector("svg").getAttribute("width")]; });
    for (let i = 0; i < 30 && !read().every(([plot, svg]) => plot === svg); i += 1) await frame();
    return read();
  };
  window.ready = true;
</script></body></html>`;

const server = await serve(root, { "/__charts.html": HARNESS });
const browser = await launch("charts");
const { evaluate, until, navigate } = browser;
await navigate(`${server.origin}/__charts.html`);
await until("window.ready === true");
const standins = await evaluate("window.STANDINS");
console.log(`stand-ins in force: ${standins}`);
if (process.env.DD_FORBID_STANDINS === "1") {
  await check("DD_FORBID_STANDINS=1: no stand-in is in force — the hues are tokens.css's", () => standins === "none", standins);
}

/* ── the size, and the text ───────────────────────────────────────────────────────────────────── */

const textAt = async (width) => {
  await evaluate(`document.getElementById("box").style.width = "${width}px"; window.renderLineChart(document.getElementById("line"), WEEKS, LINE); null`);
  return evaluate(`(() => {
    const plot = document.getElementById("line"), svg = plot.querySelector("svg"), texts = q("line", "text");
    return { plotW: plot.clientWidth, plotH: plot.clientHeight, svgW: Number(svg.getAttribute("width")), svgH: Number(svg.getAttribute("height")),
      viewBox: svg.getAttribute("viewBox"), sizes: Array.from(new Set(texts.map((t) => getComputedStyle(t).fontSize))),
      glyphH: Array.from(new Set(texts.map((t) => Math.round(t.getBoundingClientRect().height * 10) / 10))), count: texts.length };
  })()`);
};
const wide = await textAt(960);
const small = await textAt(360);
await check("the SVG is drawn at the plot's measured size, with NO viewBox to scale it",
  () => wide.viewBox === null && wide.svgW === wide.plotW && wide.svgH === wide.plotH && small.svgW === small.plotW && small.plotW === 360,
  JSON.stringify({ wide, small }));
await check("every label computes to 12px (--fs-base) at 960px and at 360px",
  () => wide.sizes.join() === "12px" && small.sizes.join() === "12px", JSON.stringify([wide.sizes, small.sizes]));
await check("...and RENDERS at the same glyph height at both widths — the pixels, which a viewBox would have shrunk",
  () => wide.glyphH.length === 1 && small.glyphH.length === 1 && wide.glyphH[0] === small.glyphH[0] && wide.glyphH[0] >= 12,
  JSON.stringify([wide.glyphH, small.glyphH]));
await check("the plot is role=img, named by `label`", () => evaluate(`(() => { const p = document.getElementById("line");
  return p.getAttribute("role") === "img" && p.getAttribute("aria-label") === "mistakes per week"; })()`));

/* ── the points, and the break ────────────────────────────────────────────────────────────────── */

await textAt(960);
const geo = await evaluate(`(() => {
  const dots = q("line", "circle.chart-dot").map((c) => ({ x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), hollow: c.classList.contains("chart-dot--hollow"), tip: c.getAttribute("data-tip") }));
  const axis = q("line", "line.chart-axis")[0];
  const d = q("line", "path.chart-line")[0].getAttribute("d");
  const runs = d.split("M").filter(Boolean).map((sub) => sub.split("L").map((pt) => pt.trim().split(/\\s+/).map(Number)));
  return { dots, axisY: +axis.getAttribute("y1"), runs, labels: q("line", "text").map((t) => t.textContent) };
})()`);
const xs = geo.dots.map((d) => d.x);
const steps = xs.slice(1).map((x, i) => x - xs[i]);
await check("one dot per point with a value (7 of 8 — the null week draws nothing), at evenly spaced slots",
  () => geo.dots.length === 7 && Math.max(...steps.filter((s, i) => i !== 4)) - Math.min(...steps.filter((s, i) => i !== 4)) <= 0.2,
  JSON.stringify(xs));
await check("the max sits at the top of the plot and a zero ON the axis — the y axis starts at zero",
  () => { const top = Math.min(...geo.dots.map((d) => d.y)); const zero = geo.dots[4]; return geo.dots[3].y === top && Math.abs(zero.y - geo.axisY) <= 1 && geo.labels.includes("0") && geo.labels.includes("4"); },
  JSON.stringify(geo.dots));
await check("a week with too few data is a HOLLOW dot, and the others are solid",
  () => geo.dots.map((d) => d.hollow).join() === "false,true,false,false,false,false,false", JSON.stringify(geo.dots.map((d) => d.hollow)));
await check("the line BREAKS at the hollow week and at the missing one: its subpaths are exactly the solid runs [w1] [w3 w4 w5] [w7 w8]",
  () => geo.runs.length === 3 && geo.runs.map((r) => r.length).join() === "1,3,2" &&
    geo.runs[1].every(([x], i) => Math.abs(x - geo.dots[2 + i].x) < 0.2) && Math.abs(geo.runs[2][0][0] - geo.dots[5].x) < 0.2,
  JSON.stringify(geo.runs));
await check("every mark carries its data-tip", () => geo.dots.every((d) => d.tip && d.tip.startsWith("w")) , JSON.stringify(geo.dots.map((d) => d.tip)));
await check("the markers: a dashed vertical at its slot from top to axis, a 3px tick on the floor, each with its tip",
  () => evaluate(`(() => { const m = q("line", "line.chart-marker")[0], t = q("line", "line.chart-tick")[0];
    return m && t && m.getAttribute("data-tip") === "model changed" && t.getAttribute("data-tip") === "rules added" &&
      +t.getAttribute("y1") - +t.getAttribute("y2") === 8 && getComputedStyle(t).strokeWidth === "3px" &&
      getComputedStyle(m).strokeDasharray.replace(/px/g, "") === "4, 3"; })()`));
await check("a second label line (`sub`) under each x label", () => geo.labels.includes("n 12") && geo.labels.includes("n 14"), JSON.stringify(geo.labels));

/* ── colour by class, never by attribute ──────────────────────────────────────────────────────── */

await check("no mark carries a fill or stroke ATTRIBUTE — a CSS variable there silently paints black",
  () => evaluate(`!document.querySelector(".chart-plot [fill], .chart-plot [stroke]")`));
const before = await evaluate(`(() => { window.keepLine = q("line", "path.chart-line")[0]; return getComputedStyle(window.keepLine).stroke; })()`);
await evaluate(`document.documentElement.dataset.theme = "green"; null`);
const after = await evaluate(`(() => ({ same: q("line", "path.chart-line")[0] === window.keepLine, stroke: getComputedStyle(window.keepLine).stroke }))()`);
await evaluate(`document.documentElement.dataset.theme = "warm"; null`);
await check("a theme switch recolours the SAME path with no redraw (warm --primary -> green --primary)",
  () => after.same && before === "rgb(138, 69, 22)" && after.stroke === "rgb(51, 255, 102)", JSON.stringify({ before, after }));

/* ── hidden, shown, resized ───────────────────────────────────────────────────────────────────── */

await evaluate(`window.renderLineChart(document.getElementById("lazy"), WEEKS, LINE); null`);
await check("a plot inside a HIDDEN panel measures 0 and draws nothing yet — a chart drawn at 0 is drawn wrong",
  () => evaluate(`!document.querySelector("#lazy svg")`));
await evaluate(`document.getElementById("hidden-panel").hidden = false; null`);
await until(`!!document.querySelector("#lazy svg")`, "the lazy chart to draw once shown");
await check("...and draws itself, at the right size, the moment the panel is shown (one ResizeObserver per plot)",
  () => evaluate(`(() => { const p = document.getElementById("lazy"), s = p.querySelector("svg");
    return +s.getAttribute("width") === p.clientWidth && p.clientWidth > 0 && q("lazy", "circle").length === 7; })()`));
await evaluate(`document.getElementById("box").style.width = "500px"; null`);
await until(`+document.querySelector("#line svg").getAttribute("width") === 500`, "the resize redraw");
await check("a resized plot is redrawn at its new size, coalesced to a frame",
  () => evaluate(`+document.querySelector("#line svg").getAttribute("width") === document.getElementById("line").clientWidth`));

const ROWS = ["g1", "g2", "f1", "f2"];
await evaluate(`window.ROWS = ${JSON.stringify(ROWS)}; ROWS.forEach((id) => window.renderLineChart(document.getElementById(id), WEEKS, LINE)); null`);
const rowsWide = await evaluate("widths(ROWS)");
await evaluate(`document.getElementById("grid-row").style.width = "400px"; document.getElementById("flex-row").style.width = "400px"; null`);
const rowsNarrow = await evaluate("widths(ROWS)");
await check("two charts in a `1fr 1fr` grid, 800px then 400px: each column narrows to 200 and its chart redraws at 200",
  () => rowsWide.slice(0, 2).every(([p, s]) => p === 400 && s === 400) && rowsNarrow.slice(0, 2).every(([p, s]) => p === 200 && s === 200),
  JSON.stringify({ wide: rowsWide.slice(0, 2), narrow: rowsNarrow.slice(0, 2) }));
await check("...and the same in a `flex: 1` row — the drawn SVG must not hold the item at its old width",
  () => rowsWide.slice(2).every(([p, s]) => p === 400 && s === 400) && rowsNarrow.slice(2).every(([p, s]) => p === 200 && s === 200),
  JSON.stringify({ wide: rowsWide.slice(2), narrow: rowsNarrow.slice(2) }));

/* ── x labels thinned to fit ──────────────────────────────────────────────────────────────────── */

await evaluate(`window.renderLineChart(document.getElementById("narrow"),
  Array.from({ length: 30 }, (_, i) => ({ x: "2026-09-" + String(i + 1).padStart(2, "0"), v: i % 7 })), { label: "thin" }); null`);
const thin = await evaluate(`(() => {
  const xl = q("narrow", "text[text-anchor=middle]").map((t) => t.getBoundingClientRect());
  return { n: xl.length, overlaps: xl.slice(1).filter((r, i) => r.left < xl[i].right).length };
})()`);
await check("30 long x labels in 300px are thinned to every Nth — and none of the kept ones overlap",
  () => thin.n > 1 && thin.n < 30 && thin.overlaps === 0, JSON.stringify(thin));

/* ── bars ─────────────────────────────────────────────────────────────────────────────────────── */

await evaluate(`window.renderBarChart(document.getElementById("bars"),
  [3, 9, 0, 12, 6].map((n, i) => ({ x: "w" + i, n })), { label: "findings", x: (r) => r.x, series: [{ value: (r) => r.n }], tip: (r) => r.x + ": " + r.n }); null`);
const bars = await evaluate(`(() => { const rects = q("bars", "rect.chart-bar").map((r) => ({ x: +r.getAttribute("x"), w: +r.getAttribute("width"), h: +r.getAttribute("height"), y: +r.getAttribute("y"), tip: r.getAttribute("data-tip") }));
  return { rects, axisY: +q("bars", "line.chart-axis")[0].getAttribute("y1"), fill: getComputedStyle(q("bars", "rect.chart-bar")[0]).fill, opacity: getComputedStyle(q("bars", "rect.chart-bar")[0]).opacity }; })()`);
const slot = bars.rects[1].x - bars.rects[0].x;
await check("one bar per slot, the slot width less 4px, standing on the zero axis",
  () => bars.rects.length === 5 && Math.abs(bars.rects[0].w - (slot - 4)) <= 0.2 && bars.rects.every((r) => Math.abs(r.y + r.h - bars.axisY) <= 1),
  JSON.stringify(bars));
await check("the tallest bar is the max; a zero is a bar of no height", () => bars.rects[3].h === Math.max(...bars.rects.map((r) => r.h)) && bars.rects[2].h === 0, JSON.stringify(bars.rects));
await check("bars are SOLID — full opacity, in --primary (cockpit's .55 measured 2.47:1)", () => bars.fill === "rgb(138, 69, 22)" && bars.opacity === "1", JSON.stringify(bars));

const FLOW = `[["apr", 5200, 4100, 1100], ["may", 5200, 5600, 400], ["jun", 6100, 4300, 1800]].map(([m, a, b, c]) => ({ m, a, b, c }))`;
const FLOW_SERIES = `[{ key: "income", value: (r) => r.a, hue: "green" }, { key: "expenses", value: (r) => r.b, hue: "red" },
  { key: "net", value: (r) => r.c, hue: "blue" }]`;
await evaluate(`window.renderBarChart(document.getElementById("grouped"), ${FLOW},
  { label: "flow", x: (r) => r.m, grid: true, format: (v) => "€" + v, series: ${FLOW_SERIES} }); null`);
// A bar's PAINTED box: an outlined or hatched bar is drawn half its 1.5px stroke inside it.
const grouped = await evaluate(`(() => {
  const groups = q("grouped", "g.chart-series");
  const rects = groups.map((g) => Array.from(g.querySelectorAll("rect")).map((r) => {
    const inset = g.dataset.cue === "solid" ? 0 : 0.75;
    return { x: +r.getAttribute("x") - inset, w: +r.getAttribute("width") + 2 * inset };
  }));
  const bar = (g) => getComputedStyle(g.querySelector("rect"));
  const hatch = q("grouped", "g.chart-series path.chart-hatch");
  return { keys: groups.map((g) => g.dataset.series), hues: groups.map((g) => g.dataset.hue), cues: groups.map((g) => g.dataset.cue),
    styled: document.querySelectorAll("#grouped [style]").length,
    paint: groups.map((g) => [bar(g).fill, bar(g).stroke, bar(g).strokeWidth]),
    hatch: hatch.map((h) => ({ series: h.parentElement.dataset.series, stroke: getComputedStyle(h).stroke, pointer: getComputedStyle(h).pointerEvents,
      segments: h.getAttribute("d").split("M").filter(Boolean).length })),
    tokens: ["--cat-green", "--cat-red", "--cat-blue", "--background"].map((t) => { const p = document.createElement("i"); p.style.color = "var(" + t + ")";
      document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; }),
    rects, grid: q("grouped", "line.chart-grid").length, ylabels: q("grouped", "text[text-anchor=end]").map((t) => t.textContent) };
})()`);
await check("several series are grouped side by side, 1px apart, one <g> per series — the painted boxes, outlines included",
  () => grouped.keys.join() === "income,expenses,net" && grouped.rects.every((r) => r.length === 3) &&
    [0, 1].every((j) => grouped.rects[j].every((r, i) => Math.abs(grouped.rects[j + 1][i].x - (r.x + r.w + 1)) <= 0.2)) &&
    grouped.rects.every((r) => Math.abs(r[0].w - grouped.rects[0][0].w) <= 0.2), JSON.stringify(grouped.rects));
await check("a series' hue is `data-hue` on its group, and nothing in the chart carries a style attribute",
  () => grouped.hues.join() === "green,red,blue" && grouped.styled === 0, JSON.stringify([grouped.hues, grouped.styled]));
await check("each series carries its cue by position — solid, outlined, hatched — in its own hue",
  () => grouped.cues.join() === "solid,outline,hatch" &&
    grouped.paint[0][0] === grouped.tokens[0] &&
    grouped.paint[1][0] === grouped.tokens[3] && grouped.paint[1][1] === grouped.tokens[1] && grouped.paint[1][2] === "1.5px" &&
    grouped.paint[2][0] === grouped.tokens[3] && grouped.paint[2][1] === grouped.tokens[2] &&
    grouped.hatch.length === 1 && grouped.hatch[0].series === "net" && grouped.hatch[0].stroke === grouped.tokens[2] &&
    grouped.hatch[0].pointer === "none" && grouped.hatch[0].segments >= 3 * 5,
  JSON.stringify({ cues: grouped.cues, paint: grouped.paint, hatch: grouped.hatch, tokens: grouped.tokens }));
await check("with `grid`, 4-6 round ticks from zero, formatted by `format`, and a gridline at each but the zero axis",
  () => grouped.ylabels.length >= 4 && grouped.ylabels.length <= 6 && grouped.ylabels[0] === "€0" && grouped.grid === grouped.ylabels.length - 1,
  JSON.stringify(grouped));

await evaluate(`window.renderBarChart(document.getElementById("signed"), [{ x: "a", value: 5 }, { x: "b", value: -3 }], { label: "net" }); null`);
const signed = await evaluate(`(() => { const r = q("signed", "rect"); const axis = +q("signed", "line.chart-axis")[0].getAttribute("y1");
  return { axis, a: [+r[0].getAttribute("y"), +r[0].getAttribute("height")], b: [+r[1].getAttribute("y"), +r[1].getAttribute("height")] }; })()`);
await check("a negative value hangs BELOW the zero axis, a positive one stands on it",
  () => Math.abs(signed.a[0] + signed.a[1] - signed.axis) <= 1 && Math.abs(signed.b[0] - signed.axis) <= 1 && signed.b[1] > 0, JSON.stringify(signed));
await evaluate(`window.renderLineChart(document.getElementById("empty"), [], { label: "nothing yet" });
  window.renderBarChart(document.getElementById("empty"), [], { label: "nothing yet" }); null`);
await check("no data draws an empty frame (the axis), not an error", () => evaluate(`q("empty", "line.chart-axis").length === 1`));
await evaluate(`window.renderLineChart(document.getElementById("empty"), [{ x: "a", value: 2 }, { x: "b", value: 5 }, { x: "c", value: 3 }], { label: "area", area: true }); null`);
await check("`area` fills under each run of the line", () => evaluate(`q("empty", "path.chart-area").length === 1 && q("empty", "path.chart-area")[0].getAttribute("d").endsWith("Z")`));

/* ── under seedr's policy: style-src 'self' ───────────────────────────────────────────────────────
   The page carries no inline <style> (the policy would drop it too): the stand-in hues come from a
   served stylesheet. A style attribute on #csp-probe proves the policy is in force — without that,
   the colours below would pass whether or not a style attribute carried them. */
const CSP_STANDIN = `:root { --cat-l: 0.45; --cat-c: 0.075; --cat-green: oklch(var(--cat-l) var(--cat-c) 150);
  --cat-red: oklch(var(--cat-l) var(--cat-c) 25); --cat-blue: oklch(var(--cat-l) var(--cat-c) 255); }`;
const CSP_CSS = `body { margin: 0; font-family: var(--font-mono); font-size: var(--fs-base); }
#csp-flow { width: 600px; }`;
const CSP_PAGE = `<!doctype html><html data-theme="warm"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="style-src 'self'">
<link rel="stylesheet" href="/src/tokens.css"><link rel="stylesheet" href="/src/data.css"><link rel="stylesheet" href="/__csp.css">
<link rel="stylesheet" href="/__csp-standin.css" id="standin-wp1" media="not all">
</head><body>
<script>
  if (!getComputedStyle(document.documentElement).getPropertyValue("--cat-green").trim()) document.getElementById("standin-wp1").media = "all";
</script>
<p id="csp-probe" style="color: rgb(1, 2, 3)">a style attribute the policy must drop</p>
<figure class="chart"><div class="chart-plot" id="csp-flow"></div>
  <ul class="chart-key"><li data-hue="green">income</li><li data-hue="red">expenses</li><li data-hue="blue">net</li></ul>
</figure>
<script type="module">
  import { renderBarChart } from "/runtime/charts.js";
  renderBarChart(document.getElementById("csp-flow"), ${FLOW}, { label: "flow", x: (r) => r.m, series: ${FLOW_SERIES} });
  window.ready = true;
</script></body></html>`;
const cspServer = await serve(root, { "/__csp.html": CSP_PAGE, "/__csp.css": CSP_CSS, "/__csp-standin.css": CSP_STANDIN });
await navigate(`${cspServer.origin}/__csp.html`);
await until("window.ready === true");
const csp = await evaluate(`(() => {
  const colour = (expr) => { const p = document.createElement("i"); p.style.color = expr; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
  const bar = (key) => getComputedStyle(document.querySelector('#csp-flow g[data-series="' + key + '"] rect'));
  return {
    probe: getComputedStyle(document.getElementById("csp-probe")).color,
    series: [bar("income").fill, bar("expenses").stroke, bar("net").stroke],
    key: Array.from(document.querySelectorAll(".chart-key li")).map((li) => getComputedStyle(li, "::before").borderTopColor),
    hues: ["green", "red", "blue"].map((h) => colour("var(--cat-" + h + ")")),
    primary: colour("var(--primary)"),
  };
})()`);
await check("under `style-src 'self'` the policy is really in force: a style attribute in the page is dropped",
  () => csp.probe !== "rgb(1, 2, 3)", csp.probe);
await check("...and each series still paints its own hue — green, red, blue — none of them --primary",
  () => csp.series.join() === csp.hues.join() && !csp.series.includes(csp.primary), JSON.stringify(csp));
await check("...and so does each swatch of the documented key markup (`<li data-hue>`)",
  () => csp.key.join() === csp.hues.join(), JSON.stringify(csp));
cspServer.close();

/* ── the documented markup carries no style attribute ─────────────────────────────────────────────
   Read from the files a page author copies: the chart reference and the demo page. */
const STYLED = [".claude/skills/danieldeusing-design/references/data.md", ".claude/skills/danieldeusing-design/references/tables-and-forms.md",
  "examples/data.html"].flatMap((file) => readFileSync(join(root, file), "utf8").split("\n")
  .map((line, i) => (/(^|[^\w-])style=["']/.test(line) ? `${file}:${i + 1}` : null)).filter(Boolean));
await check("no style attribute in the data references or the demo page — a `style-src 'self'` page drops every one",
  () => STYLED.length === 0, STYLED.join(" "));

browser.close();
server.close();
done();
