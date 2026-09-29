/*
 * charts.js — a line chart and a bar chart, drawn at the size they are shown.
 *
 * Markup contract (data.css styles every part; the runtime writes only geometry and class names):
 *
 *   <figure class="chart">
 *     <div class="chart-plot" id="trend"></div>
 *     <figcaption>mistakes per graded review, per week · a hollow week has too few reviews</figcaption>
 *   </figure>
 *
 *   renderLineChart(document.getElementById("trend"), weeks, {
 *     label: "mistakes per graded review, per week",
 *     x: (w) => w.bucket.slice(5), value: (w) => w.rate, solid: (w) => !w.thin,
 *     sub: (w) => "n " + w.graded, tip: (w) => w.bucket + ": " + w.rate,
 *     markers: [{ at: 3, kind: "line", tip: "grader model changed" }, { at: 5, kind: "tick", tip: "rules added" }],
 *   });
 *   renderBarChart(plot, months, { label, x, series: [{ key: "in", label: "income", value: (m) => m.income,
 *     hue: "green" }, …], tip: (m, s) => …, grid: true, format: euro });
 *
 * WHY THE SVG IS DRAWN AT THE MEASURED SIZE, AND NEVER SCALED. Both charts this replaces — cockpit's
 * trend and bars, the family financing page's line and grouped bars — drew into a fixed viewBox (720
 * or 640 units) and let the browser scale it to the column. Every label was set at 9-11 units, so a
 * chart shown 360px wide printed its text at 5px, and one shown at 1440px at 20px: the chart was the
 * one place on a page where the system's one text size did not hold. Here the plot is measured and
 * the SVG is written at exactly that many pixels, with no viewBox, so a label is `--fs-base` because
 * it IS `--fs-base`. The price is a redraw when the plot changes size — one ResizeObserver per plot,
 * coalesced to a frame. That same observer draws a chart whose plot measured 0 when it was rendered,
 * which is every chart inside a hidden tab.
 *
 * COLOUR COMES FROM CLASSES, NEVER FROM ATTRIBUTES. The family page found this the hard way: a CSS
 * variable is not valid in an SVG presentation attribute, and `fill="var(--x)"` silently paints black,
 * which on the two dark themes is invisible. Every mark here carries a class and data.css paints it,
 * so a theme switch recolours a chart without redrawing it. A series' `hue` names one of the twelve
 * `--cat-*` hues and is written as `data-hue` on its group, where data.css maps it to `--chart-color`.
 * NEVER A STYLE ATTRIBUTE: this wrote `style="--chart-color: …"`, and under a `style-src 'self'`
 * policy (seedr's) the browser drops it — both series of the flow chart painted --primary there.
 *
 * A SERIES IS NEVER TOLD APART BY COLOUR ALONE (the lead's ruling for 0.60.0): income and expenses,
 * --cat-green against --cat-red, differ by ΔE 0.006 under deuteranopia. So each series also carries a
 * cue, by its position, in every mode: the first is solid, the second outlined, the third hatched —
 * `data-cue` on its group, which data.css draws; the key's swatches take the same cue by position.
 * Three is the most there are: a fourth series would repeat the first cue.
 *
 * THE MARKS SAY WHAT THEY ARE. Cockpit's trend is the model: one hue; a solid dot rests on enough data
 * and a hollow one on too little — and a hollow point BREAKS the line rather than steering it; a
 * dashed vertical is an event (a model change), a 3px tick on the floor is another kind (rules added).
 * Every mark takes a `data-tip`. And every chart's numbers are ALSO in a table on the page: the plot is
 * `role="img"` with a label saying what is plotted, and the tips are an extra for pointer users.
 *
 * THE Y AXIS STARTS AT ZERO whenever the data is all positive (the family page's rule): starting it at
 * the minimum turns every wobble into a cliff, which is the standard way a chart lies without a wrong
 * number. Without `grid` the labels are zero and the maximum (cockpit); with it, four to six round
 * ticks and their gridlines (family). X labels are thinned to fit: a label is as wide as the longest
 * one, in `ch`, measured against the real width, and every Nth is kept.
 */

const plots = new WeakMap(); // plot element -> { build, size, frame }
const CUES = ["solid", "outline", "hatch"];
// Half of data.css's 1.5px outline: an outlined or hatched bar is drawn that far inside its box, so its
// stroke paints the same box a solid bar fills and the 1px between grouped bars stays 1px.
const INSET = 0.75;

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const text = (value) => (value == null ? "" : String(value));
const r1 = (n) => Math.round(n * 10) / 10;
// A 1px line centred on a pixel row is crisp; on a boundary it smears across two.
const crisp = (n) => Math.round(n) + 0.5;
const tipAttr = (tip) => (tip == null || tip === "" ? "" : ` data-tip="${esc(tip)}"`);
const numberOf = (raw) => {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * Draw (and keep drawing, at every size) a line chart into `plot`.
 *
 * @param {HTMLElement} plot `.chart-plot` inside a `figure.chart`
 * @param {object[]} points one per x slot, in order
 * @param {object} [options] label, x(p), value(p), solid(p), sub(p), tip(p), markers, area, grid, format
 */
export function renderLineChart(plot, points, options = {}) {
  mount(plot, options.label, (size) => lineChart(size, points || [], options));
}

/**
 * Draw (and keep drawing, at every size) a bar chart into `plot`.
 *
 * @param {HTMLElement} plot `.chart-plot` inside a `figure.chart`
 * @param {object[]} rows one per x slot, in order
 * @param {object} [options] label, x(r), series [{ key, label, value(r), hue }], tip(r, series), grid, format
 */
export function renderBarChart(plot, rows, options = {}) {
  mount(plot, options.label, (size) => barChart(size, rows || [], options));
}

function mount(plot, label, build) {
  if (!plot) return;
  plot.setAttribute("role", "img");
  if (label) plot.setAttribute("aria-label", label);
  let state = plots.get(plot);
  if (!state) {
    state = { build, size: "", frame: 0 };
    plots.set(plot, state);
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        if (state.frame) return;
        state.frame = requestAnimationFrame(() => {
          state.frame = 0;
          if (`${plot.clientWidth}x${plot.clientHeight}` !== state.size) draw(plot, state);
        });
      }).observe(plot);
    }
  }
  state.build = build;
  draw(plot, state);
}

function draw(plot, state) {
  const width = plot.clientWidth;
  const height = plot.clientHeight;
  // No box, no measurement: a plot inside a hidden panel reads 0, and a chart drawn at 0 is a chart
  // drawn wrong. The observer fires when the panel is shown and the real size lands then.
  if (!width || !height) return;
  state.size = `${width}x${height}`;
  plot.innerHTML = state.build(measure(plot, width, height));
}

// `ch` from the plot's own font, in layout pixels like clientWidth, so the two never disagree.
function measure(plot, width, height) {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;inline-size:100ch";
  plot.append(probe);
  const fs = parseFloat(getComputedStyle(plot).fontSize) || 12;
  const ch = probe.offsetWidth / 100 || fs * 0.6;
  probe.remove();
  return { width, height, ch, fs };
}

// The y range always holds zero; with `grid` it widens to round ticks.
function scale(values, grid) {
  const lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (hi === lo) hi = lo + 1;
  if (!grid) return { lo, hi, ticks: lo < 0 ? [lo, 0, hi] : [0, hi] };
  const ticks = niceTicks(lo, hi);
  return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks };
}

// The smallest round step (1, 2, 2.5 or 5 times a power of ten) that covers the range in at most
// five intervals: four to six ticks, each a number a person would write down.
function niceTicks(lo, hi) {
  let magnitude = 10 ** Math.floor(Math.log10((hi - lo) / 5));
  for (;;) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * magnitude;
      const from = Math.floor(lo / step + 1e-9) * step;
      const to = Math.ceil(hi / step - 1e-9) * step;
      const n = Math.round((to - from) / step);
      if (n <= 5) return Array.from({ length: n + 1 }, (_, k) => Number((from + k * step).toPrecision(12)));
    }
    magnitude *= 10;
  }
}

// The plot area inside the measured box, the slot of each x position, and which x labels fit.
function frame(size, { n, yLabels, xLabels, lines }) {
  const { width, height, ch, fs } = size;
  const widest = (labels) => Math.max(0, ...labels.map((label) => label.length));
  const lineH = Math.round(fs * 1.4);
  const gap = Math.ceil(ch / 2);
  const x0 = Math.ceil(widest(yLabels) * ch) + gap * 2;
  const x1 = Math.max(x0 + 1, width - Math.ceil(ch));
  const y0 = Math.ceil(fs / 2);
  const y1 = Math.max(y0 + 1, height - 4 - lines * lineH);
  const slot = (x1 - x0) / Math.max(n, 1);
  const every = Math.max(1, Math.ceil((widest(xLabels) + 1) * ch / slot));
  return { x0, x1, y0, y1, gap, lineH, slot, every, cx: (i) => x0 + slot * (i + 0.5) };
}

function open(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">`;
}

// Gridlines (with `grid`), the y labels, and the zero line as the axis.
function axes(f, ticks, format, yOf, grid) {
  let out = "";
  for (const value of ticks) {
    if (grid && value !== 0) {
      const y = crisp(yOf(value));
      out += `<line class="chart-grid" x1="${f.x0}" x2="${f.x1}" y1="${y}" y2="${y}"></line>`;
    }
    out += `<text x="${f.x0 - f.gap}" y="${r1(yOf(value))}" dy="0.32em" text-anchor="end">${esc(format(value))}</text>`;
  }
  const zero = crisp(yOf(0));
  return `${out}<line class="chart-axis" x1="${f.x0}" x2="${f.x1}" y1="${zero}" y2="${zero}"></line>`;
}

function xLabels(f, labels, subs) {
  let out = "";
  labels.forEach((label, i) => {
    if (i % f.every) return;
    const x = r1(f.cx(i));
    out += `<text x="${x}" y="${f.y1 + 4}" dy="0.71em" text-anchor="middle">${esc(label)}</text>`;
    if (subs) out += `<text x="${x}" y="${f.y1 + 4 + f.lineH}" dy="0.71em" text-anchor="middle">${esc(subs[i])}</text>`;
  });
  return out;
}

function lineChart(size, points, o) {
  const valueOf = o.value || ((p) => p.value);
  const format = o.format || String;
  const values = points.map((p) => numberOf(valueOf(p)));
  const { lo, hi, ticks } = scale(values.filter((v) => v !== null), o.grid);
  const labels = points.map((p) => text(o.x ? o.x(p) : p.x));
  const subs = o.sub ? points.map((p) => text(o.sub(p))) : null;
  const f = frame(size, {
    n: points.length,
    yLabels: ticks.map((v) => String(format(v))),
    xLabels: subs ? labels.concat(subs) : labels,
    lines: subs ? 2 : 1,
  });
  const yOf = (v) => f.y1 - ((v - lo) / (hi - lo)) * (f.y1 - f.y0);

  // Runs of consecutive SOLID points. A hollow or missing point ends a run: it is drawn, not joined.
  const runs = [];
  let run = [];
  points.forEach((p, i) => {
    if (values[i] === null || (o.solid && !o.solid(p))) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push([r1(f.cx(i)), r1(yOf(values[i]))]);
  });
  if (run.length) runs.push(run);

  let svg = open(size) + axes(f, ticks, format, yOf, o.grid);
  for (const marker of o.markers || []) {
    const i = Number(marker.at);
    if (!Number.isInteger(i) || i < 0 || i >= points.length) continue;
    const x = crisp(f.cx(i));
    svg += marker.kind === "tick"
      ? `<line class="chart-tick" x1="${x}" x2="${x}" y1="${f.y1}" y2="${f.y1 - 8}"${tipAttr(marker.tip)}></line>`
      : `<line class="chart-marker" x1="${x}" x2="${x}" y1="${f.y0}" y2="${f.y1}"${tipAttr(marker.tip)}></line>`;
  }
  if (o.area) {
    const base = r1(yOf(lo));
    for (const each of runs.filter((r) => r.length > 1)) {
      const [first] = each;
      const last = each[each.length - 1];
      svg += `<path class="chart-area" d="M${first[0]} ${base} L${each.map(([x, y]) => `${x} ${y}`).join(" L")} L${last[0]} ${base} Z"></path>`;
    }
  }
  const d = runs.map((each) => `M${each.map(([x, y]) => `${x} ${y}`).join(" L")}`).join(" ");
  if (d) svg += `<path class="chart-line" d="${d}"></path>`;
  points.forEach((p, i) => {
    if (values[i] === null) return;
    const hollow = o.solid && !o.solid(p) ? " chart-dot--hollow" : "";
    svg += `<circle class="chart-dot${hollow}" cx="${r1(f.cx(i))}" cy="${r1(yOf(values[i]))}" r="4"${tipAttr(o.tip && o.tip(p))}></circle>`;
  });
  return `${svg}${xLabels(f, labels, subs)}</svg>`;
}

function barChart(size, rows, o) {
  const series = (o.series && o.series.length ? o.series : [{}]).map((s) => ({ ...s, value: s.value || ((r) => r.value) }));
  const format = o.format || String;
  const cell = (row, s) => numberOf(s.value(row));
  const { lo, hi, ticks } = scale(rows.flatMap((row) => series.map((s) => cell(row, s))).filter((v) => v !== null), o.grid);
  const labels = rows.map((row) => text(o.x ? o.x(row) : row.x));
  const f = frame(size, { n: rows.length, yLabels: ticks.map((v) => String(format(v))), xLabels: labels, lines: 1 });
  const yOf = (v) => f.y1 - ((v - lo) / (hi - lo)) * (f.y1 - f.y0);
  const zero = yOf(0);

  // A slot holds one bar per series, 1px apart; the group is the slot less 4px, and no bar is
  // narrower than 2px however many slots there are.
  const k = series.length;
  const bar = Math.max(2, (f.slot - 4 - (k - 1)) / k);
  const group = bar * k + (k - 1);

  let svg = open(size) + axes(f, ticks, format, yOf, o.grid);
  series.forEach((s, j) => {
    const cue = CUES[j % CUES.length];
    const key = s.key != null ? ` data-series="${esc(s.key)}"` : "";
    const hue = s.hue ? ` data-hue="${esc(s.hue)}"` : "";
    let lines = "";
    svg += `<g class="chart-series" data-cue="${cue}"${key}${hue}>`;
    rows.forEach((row, i) => {
      const v = cell(row, s);
      if (v === null) return;
      const x = f.x0 + i * f.slot + (f.slot - group) / 2 + j * (bar + 1);
      const y = Math.min(yOf(v), zero);
      const h = Math.abs(yOf(v) - zero);
      const inset = cue === "solid" ? 0 : Math.min(INSET, bar / 2, h / 2);
      svg += `<rect class="chart-bar" x="${r1(x + inset)}" y="${r1(y + inset)}" width="${r1(bar - 2 * inset)}" ` +
        `height="${r1(h - 2 * inset)}"${tipAttr(o.tip && o.tip(row, s))}></rect>`;
      if (cue === "hatch") lines += hatch(x, y, bar, h);
    });
    // One path for the series' hatching, over its bars; it takes no pointer, so the tips stay the bars'.
    if (lines) svg += `<path class="chart-hatch" d="${lines.trim()}"></path>`;
    svg += "</g>";
  });
  return `${svg}${xLabels(f, labels, null)}</svg>`;
}

// "/" lines 5px apart along the box's diagonal (3.5px between lines), each clipped to the box: the
// line x + y = c crosses it from its lowest point on the left to its highest on the right.
function hatch(x, y, w, h) {
  let d = "";
  for (let c = x + y + 2.5; c < x + w + y + h; c += 5) {
    const from = Math.max(x, c - (y + h));
    const to = Math.min(x + w, c - y);
    if (to - from > 0.1) d += `M${r1(from)} ${r1(c - from)} L${r1(to)} ${r1(c - to)} `;
  }
  return d;
}
