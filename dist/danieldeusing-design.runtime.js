/*! danieldeusing-design v0.63.1 runtime | MIT | built by scripts/build.mjs from runtime/; a baked page carries it instead of importing runtime/index.js */
(() => {
"use strict";
const records = {};
//@dd-record anim deps= exports=initAnimToggle
records["anim"] = (__dd) => {
/*
 * danieldeusing-design — animations on/off toggle.
 *
 * Wires up a footer/chrome control that turns every animation on or off, persisting
 * the choice so it survives reloads. Pairs with the html.anim-off kill-switch in
 * tokens.css and the pre-paint gate in terminal.js.
 *
 * Markup contract (style it with the .anim-toggle component class):
 *   <button type="button" class="anim-toggle" data-anim-toggle aria-pressed="true"
 *           aria-label="Toggle animations">
 *     <span data-anim-box aria-hidden="true">[x]</span>
 *     <span>anim</span>
 *   </button>
 *
 * A toggle whose wording flips with the state names both words on itself and marks where they go:
 *   <button … data-anim-toggle data-label-on="enabled" data-label-off="disabled">
 *     <span data-anim-box aria-hidden="true">[x]</span> <span data-anim-label>enabled</span>
 *   </button>
 * The words come from the markup so a translated page supplies its own; a label with no
 * data-label-on/off is left as written. The flipping word is decoration beside the accessible
 * name — the name says what the button does, aria-pressed says whether it is on.
 *
 * Every [data-anim-toggle] on the page shows the same state, including one rendered after this
 * call: the footer's, the burger's copy of it, and any other (danieldeusing.de's home banner has a
 * third) — which is what danieldeusing.de forked this file for, before it wrote the label.
 *
 * The persisted key is "anim" ("on" | "off"); apply it pre-paint (inline, in
 * <head>) the same way the theme is applied, so the choice never flashes.
 */
const TOGGLE = "[data-anim-toggle]";
let wired = false;

function sync() {
  const on = !document.documentElement.classList.contains("anim-off");
  for (const toggle of document.querySelectorAll(TOGGLE)) {
    // Writes only what differs: the observer below re-runs this on every rewrite of a toggle.
    if (toggle.getAttribute("aria-pressed") !== String(on)) toggle.setAttribute("aria-pressed", String(on));
    const box = toggle.querySelector("[data-anim-box]");
    const mark = on ? "[x]" : "[ ]";
    if (box && box.textContent !== mark) box.textContent = mark;
    const label = toggle.querySelector("[data-anim-label]");
    const text = toggle.getAttribute(on ? "data-label-on" : "data-label-off");
    if (label && text !== null && label.textContent !== text) label.textContent = text;
  }
}

function initAnimToggle() {
  sync();
  if (wired) return;
  wired = true;

  // Delegated, so a toggle rendered after this call switches like the ones in the markup.
  document.addEventListener("click", (event) => {
    const toggle = event.target instanceof Element ? event.target.closest(TOGGLE) : null;
    if (!toggle) return;
    const html = document.documentElement;
    const turningOff = !html.classList.contains("anim-off");
    if (turningOff) {
      html.classList.add("anim-off");
      html.classList.remove("term-anim"); // stop the terminal typing mid-run
    } else {
      html.classList.remove("anim-off");
    }
    try {
      localStorage.setItem("anim", turningOff ? "off" : "on");
    } catch {
      /* private mode */
    }
    sync();
  });

  // A toggle added later is told the current state at once, not on the next press — and a toggle
  // something rewrites (a renderer patching its attributes or its text in place, cockpit's
  // dom-patch) is put back: the state lives on <html>, the toggle only shows it.
  const html = document.documentElement;
  const inToggle = (node) => (node instanceof Element ? node : node.parentElement)?.closest(TOGGLE);
  new MutationObserver((records) => {
    const touched = records.some((record) =>
      record.type === "attributes"
        ? record.target === html || record.target.matches(TOGGLE)
        : inToggle(record.target) ||
          [...record.addedNodes].some((node) => node instanceof Element && (node.matches(TOGGLE) || node.querySelector(TOGGLE))),
    );
    if (touched) sync();
  }).observe(html, { attributes: true, attributeFilter: ["class", "aria-pressed"], childList: true, characterData: true, subtree: true });
}
return { initAnimToggle };
};
//@dd-record charts deps= exports=renderLineChart,renderBarChart
records["charts"] = (__dd) => {
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
function renderLineChart(plot, points, options = {}) {
  mount(plot, options.label, (size) => lineChart(size, points || [], options));
}

/**
 * Draw (and keep drawing, at every size) a bar chart into `plot`.
 *
 * @param {HTMLElement} plot `.chart-plot` inside a `figure.chart`
 * @param {object[]} rows one per x slot, in order
 * @param {object} [options] label, x(r), series [{ key, label, value(r), hue }], tip(r, series), grid, format
 */
function renderBarChart(plot, rows, options = {}) {
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
return { renderLineChart, renderBarChart };
};
//@dd-record copy deps= exports=initCopyButtons
records["copy"] = (__dd) => {
/*
 * copy.js — a copy button that says whether it worked.
 *
 * Markup contract: `data-copy` on a <button> that already has a look. There is no copy-button
 * class; the icon button (C2) or the ghost text button (C1) draws it, and src/content.css adds the
 * two states.
 *
 *   <div class="cmd"><code class="cmd-text">npm install -g @danieldeusing/seedr</code>
 *     <button type="button" class="btn-icon btn-icon--bare" data-icon="copy" data-copy
 *             aria-label="copy install command"></button></div>        copies the .cmd-text beside it
 *   <button … data-copy="docker compose up -d">                         copies the literal
 *   <button … data-copy data-copy-from="#file-body">                    copies that element's text
 *   <button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact"
 *           data-copy="…">copy</button>                                 the text form
 *
 * Call `initCopyButtons()` once. It is ONE delegated listener on the document, so a button rendered
 * after load works with no second call, and calling it twice installs nothing twice.
 *
 * THE RESULT IS ALWAYS SAID, AND IT IS SAID TWICE. For 2000ms after a press the button carries
 * `data-state="copied"` or `"failed"`: the glyph turns into a check or an x and takes --success or
 * --destructive, and a text button's label reads "copied" or "copy failed". The same words go to
 * one visually hidden `role="status"` region, so a screen reader hears them too. The region is made
 * by `initCopyButtons()`, BEFORE any press: a region created by the first press is new to the
 * accessibility tree at the moment it is written to, and the first result would go unheard.
 * cockpit's copy buttons showed ✓/✗ and announced nothing; a reader who could not see the glyph
 * never learned whether it had worked.
 *
 * THE ACCESSIBLE NAME NEVER CHANGES. seedr and configr swapped the button's NAME to "Copied", and a
 * screen reader announces a name change on a focused button inconsistently — some read it, some
 * read it twice, some say nothing. So the name stays what the page wrote and the live region
 * carries the result. A text button's name comes from its label, which this is about to replace, so
 * the label is pinned into `aria-label` for the length of the state and the attribute is removed
 * again with it. A button that already has an `aria-label` keeps it untouched.
 *
 * A FAILURE IS NEVER SILENT, AND IT LEAVES THE TEXT IN HAND. The clipboard refuses on an insecure
 * origin, without permission, or with no `navigator.clipboard` at all. seedr's comment is the reason
 * this matters: "Saying nothing let the visitor paste whatever was on the clipboard before." So a
 * failure shows the x, says "copy failed", and — when the text came from an element — selects that
 * element's text, so ⌘C / Ctrl+C still works. The announcement then says "text selected".
 * A source with nothing in it — a whitespace-only `.cmd-text`, a `data-copy-from` that matches
 * nothing — is a failure of its own: the x, and "nothing to copy". Nothing is selected, because
 * there is nothing a reader could copy by hand either.
 *
 * WHAT IS COPIED. A non-empty `data-copy` value, exactly as written; otherwise the `textContent` of
 * the `data-copy-from` target, exactly as it is; otherwise the `.cmd-text` of the closest `.cmd`,
 * TRIMMED — a command copied with a trailing newline runs the moment it is pasted into a shell.
 * Line numbers drawn by `.code-view` are generated content and are never part of textContent. With
 * no source, or an empty one, the press fails rather than writing an empty string over the
 * clipboard.
 *
 * Framework apps (seedr, configr) render the same attributes from their own state and their own
 * `role="status"`, and never run this over nodes the framework owns (house rule 10).
 */

const STATE_MS = 2000;
// A live region only speaks when its text CHANGES after it is already in the accessibility tree.
// A region that stayed where it was and holds other words is written at once. Clearing it and
// writing the message a beat later is for the other two cases: the same "copied" twice in a row,
// and a region that was just moved into a dialog, which is new to the tree there.
const ANNOUNCE_DELAY_MS = 100;
const VISUALLY_HIDDEN =
  "position:absolute;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;" +
  "overflow:hidden;clip-path:inset(50%);white-space:nowrap";

const cycles = new WeakMap();
let installed = false;
let region = null;
let regionOwner = null;
let announceTimer = 0;

// A button's name from its content leaves out what is hidden from assistive technology, so the
// pinned label must too: `<span aria-hidden="true">⧉</span> copy` is named "copy".
const spokenText = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.data;
  if (node.nodeType !== Node.ELEMENT_NODE || node.getAttribute("aria-hidden") === "true") return "";
  return [...node.childNodes].map(spokenText).join("");
};

function sourceOf(button) {
  const literal = button.getAttribute("data-copy");
  if (literal) return { text: literal, element: null };
  const selector = button.getAttribute("data-copy-from");
  const target = selector ? document.querySelector(selector) : null;
  if (target) return { text: target.textContent, element: target };
  const command = button.closest(".cmd")?.querySelector(".cmd-text");
  if (command) return { text: command.textContent.trim(), element: command };
  return { text: "", element: null };
}

function selectContents(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function makeRegion() {
  region = document.createElement("div");
  region.setAttribute("role", "status");
  region.setAttribute("data-copy-status", "");
  // CSSOM, never setAttribute("style"): under seedr's `style-src 'self'` the attribute is refused
  // (a style-src-attr violation, measured) while style.cssText applies. Inline, so the region hides
  // itself whichever stylesheets the page happens to load.
  region.style.cssText = VISUALLY_HIDDEN;
  document.body.append(region);
}

function announce(button, message) {
  // A modal <dialog> makes everything outside it inert, and an inert live region is never read —
  // cockpit's copy buttons live in its patch dialog. So the one region goes where the button is.
  const home = button.closest("dialog[open]") || document.body;
  const moved = region.parentNode !== home;
  if (moved) home.append(region);
  regionOwner = button;
  clearTimeout(announceTimer);
  if (!moved && region.textContent !== message) {
    region.textContent = message;
    return;
  }
  region.textContent = "";
  announceTimer = setTimeout(() => {
    region.textContent = message;
  }, ANNOUNCE_DELAY_MS);
}

function reset(button) {
  const cycle = cycles.get(button);
  if (!cycle) return;
  cycles.delete(button);
  if (cycle.children) {
    button.replaceChildren(...cycle.children);
    if (cycle.ariaLabel === null) button.removeAttribute("aria-label");
  }
  button.removeAttribute("data-state");
  // Leave no stale "copied" behind for a reader who later walks the page — unless another button
  // has spoken since, in which case the words in the region are that button's.
  if (region && regionOwner === button) {
    region.textContent = "";
    regionOwner = null;
  }
}

function show(button, state) {
  let cycle = cycles.get(button);
  if (!cycle) {
    // The first press of a cycle keeps what the reset puts back. A press DURING the state must not,
    // or it would save "copied" as the label to restore.
    const text = spokenText(button).replace(/\s+/g, " ").trim();
    cycle = { children: text ? [...button.childNodes] : null, ariaLabel: button.getAttribute("aria-label"), timer: 0 };
    if (text && cycle.ariaLabel === null) button.setAttribute("aria-label", text);
    cycles.set(button, cycle);
  }
  if (cycle.children) button.textContent = state === "copied" ? "copied" : "copy failed";
  button.setAttribute("data-state", state);
  // Another press restarts the clock rather than stacking a second reset on the first.
  clearTimeout(cycle.timer);
  cycle.timer = setTimeout(() => reset(button), STATE_MS);
}

async function press(button) {
  let source = { text: "", element: null };
  try {
    source = sourceOf(button);
  } catch {
    // An invalid `data-copy-from` selector: nothing to copy, said as such below.
  }
  if (!source.text) {
    show(button, "failed");
    announce(button, "nothing to copy");
    return;
  }
  let copied = false;
  try {
    // Called synchronously inside the click, so the press's user activation still counts.
    await navigator.clipboard.writeText(source.text);
    copied = true;
  } catch {
    // Not swallowed: the failure is the state, the announcement and the selection below.
    if (source.element) selectContents(source.element);
  }
  show(button, copied ? "copied" : "failed");
  announce(button, copied ? "copied" : source.element ? "copy failed — text selected" : "copy failed");
}

/**
 * Wire every `button[data-copy]` on the page, including buttons rendered later. Idempotent.
 */
function initCopyButtons() {
  if (installed) return;
  installed = true;
  // Called from a classic script in <head>, there is no body to hold the region yet.
  if (document.body) makeRegion();
  else document.addEventListener("DOMContentLoaded", makeRegion, { once: true });
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-copy]") : null;
    // aria-disabled keeps a button focusable (so its tip can explain why it is off); the press
    // itself must still do nothing, and only script can make it so.
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    press(button);
  });
}
return { initCopyButtons };
};
//@dd-record diagramzoom deps=dialog exports=initDiagramZoom
records["diagramzoom"] = (__dd) => {
/*
 * diagramzoom.js — open any `.diagram` (or any figure, image or svg a selector names) full-screen,
 * then zoom and pan it.
 *
 * Markup contract: whatever the element wraps — a mermaid <svg>, an <img>, a <canvas>. No
 * per-diagram attributes: a diagram is zoomable by virtue of being a diagram, which is the point —
 * an architecture diagram that has to fit a text column is unreadable at exactly the moment someone
 * needs it. pagr passes its article figures, `initDiagramZoom(".prose-pagr :is(figure, p:has(> img))")`,
 * which replaces its hand-rolled lightbox.
 *
 * THE OPENER SAYS WHAT IT OPENS. Each element becomes a real button (role, tabindex, Enter and
 * Space), named "zoom: <name>" from the image's alt or the svg's own name (its aria-label or
 * <title>), "zoom image" for an image with neither, and "zoom diagram" otherwise. It used to say
 * "open diagram, zoomable" for everything, a photograph included. An aria-label the author wrote
 * is kept, and the view takes the opener's name. An opener the author already marked
 * `.dgm-zoomable` is wired like any other; a second call wires nothing twice.
 *
 * THE VIEW IS A MODAL <dialog> (0.60.0), opened through openDialog(): the page behind is inert, Tab
 * stays in the view, Escape closes it, and focus goes back to the opener. It was a
 * `div[role=dialog][aria-modal]` on <body>, which claimed all of that and did none of it — Tab
 * walked out into the page behind. Its bar is the system's: the compact ghost buttons and the
 * dialog's own X (src/overlays.css draws the view).
 *
 * Wheel zooms about the pointer, drag pans, a two-finger pinch zooms about the fingers' midpoint,
 * the arrow keys pan and +/-/0 and the bar zoom. A click on the empty stage closes — a click that
 * BEGAN there, not the end of a drag and not a press on the artwork. Pointer capture delivers
 * every click that ends a press on the stage TO the stage, whatever it began on, and until 0.60.0
 * that closed the view under the reader's hand after every pan (measured on 0.59.0: drag the
 * artwork 100px and the view is gone) and on a plain click on the picture.
 *
 * TOUCH IS HANDLED HERE, NOT BY THE BROWSER. The stage is `touch-action: none` — the browser's own
 * pinch would zoom the whole page behind a modal view — so the view does its own: one finger pans,
 * two fingers zoom about their midpoint and pan with it.
 *
 * The artwork is CLONED into the view rather than moved: mermaid holds references to the nodes it
 * rendered and re-runs against them (a folded or tabbed diagram is redrawn when it becomes
 * visible), so moving the original out of the document and back is how you get a diagram that
 * silently stops updating.
 */
const { openDialog } = __dd("dialog");

const FIT_MARGIN = 0.92; // leave a little air around a fitted diagram
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
const DRAG_SLOP = 4; // px a press may wander and still be a click rather than a pan
const KEY_PAN = 40; // px an arrow key moves the artwork

/* "zoom: network map" for an image with alt text, "zoom image" for one without, "zoom diagram" for
   everything else — the middle case because "diagram" is what the old name called a photograph. */
function nameOf(el) {
  const node = el.querySelector("svg, img, canvas");
  const own = node?.tagName === "IMG" ? node.getAttribute("alt")
    : node?.tagName.toLowerCase() === "svg" ? node.getAttribute("aria-label") || node.querySelector(":scope > title")?.textContent
    : null;
  if (own?.trim()) return `zoom: ${own.trim()}`;
  return node?.tagName === "IMG" ? "zoom image" : "zoom diagram";
}

/*
 * ONE VIEW FOR THE PAGE, however many calls wire openers: it was built per call, so a page calling
 * this for every figure it rendered grew one more <dialog> (and ten listeners) with each call.
 */
let openView = null;

function initDiagramZoom(selector = ".diagram") {
  const diagrams = Array.from(document.querySelectorAll(selector));
  if (!diagrams.length) return;
  openView ??= viewer();
  const open = openView;

  for (const d of diagrams) {
    // A marker of its own, not the class: an author may write `.dgm-zoomable` in the markup, and
    // that opener still needs its role, its keys and its click.
    if ("dgmWired" in d.dataset) continue;
    d.dataset.dgmWired = "";
    d.classList.add("dgm-zoomable");
    d.setAttribute("role", "button");
    d.setAttribute("tabindex", "0");
    if (!d.hasAttribute("aria-label")) d.setAttribute("aria-label", nameOf(d));
    d.addEventListener("click", () => open(d));
    d.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(d); }
    });
  }
}

function viewer() {
  let view, stage, art;
  let scale = 1, tx = 0, ty = 0, moved = false, pressedStage = false;
  const pointers = new Map(); // pointerId -> { x, y }, while a finger or the mouse is down
  let pinch = null; // { distance, scale, x, y } when two pointers are down

  const apply = () => { art.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  const zoomTo = (next, cx, cy) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (clamped === scale) return;
    // keep the point under the cursor stationary
    const rect = stage.getBoundingClientRect();
    const px = (cx ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
    const py = (cy ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
    const ratio = clamped / scale;
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = clamped;
    apply();
  };

  const fit = () => {
    const node = art.firstElementChild;
    if (!node) return;
    // Measure the artwork at 1x, not through the current transform.
    const prev = art.style.transform;
    art.style.transform = "none";
    const box = node.getBoundingClientRect();
    art.style.transform = prev;
    const s = stage.getBoundingClientRect();
    scale = box.width && box.height
      ? Math.min((s.width * FIT_MARGIN) / box.width, (s.height * FIT_MARGIN) / box.height)
      : 1;
    tx = ty = 0;
    apply();
  };

  const button = (act, label, text) =>
    `<button type="button" class="btn-terminal btn-terminal--ghost btn-terminal--compact" data-dgm="${act}" aria-label="${label}">${text}</button>`;

  const build = () => {
    view = document.createElement("dialog");
    view.className = "dgm-overlay";
    view.innerHTML =
      '<div class="dgm-bar">' +
      button("out", "zoom out", "&minus;") +
      button("reset", "fit to screen", "fit") +
      button("in", "zoom in", "+") +
      '<button type="button" class="btn-icon dialog-close" data-icon="x" data-dgm="close" aria-label="close"></button>' +
      '</div><div class="dgm-stage"><div class="dgm-art"></div></div>';
    document.body.appendChild(view);
    stage = view.querySelector(".dgm-stage");
    art = view.querySelector(".dgm-art");

    view.addEventListener("click", (e) => {
      const act = e.target.closest("[data-dgm]")?.dataset.dgm;
      if (act === "close" || (e.target === stage && pressedStage && !moved)) return view.close();
      if (act === "in") return zoomTo(scale * 1.3);
      if (act === "out") return zoomTo(scale / 1.3);
      if (act === "reset") return fit();
    });
    // Escape is the platform's: it is a modal dialog.
    view.addEventListener("keydown", (e) => {
      if (e.key === "+" || e.key === "=") zoomTo(scale * 1.3);
      else if (e.key === "-") zoomTo(scale / 1.3);
      else if (e.key === "0") fit();
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        tx += { ArrowLeft: KEY_PAN, ArrowRight: -KEY_PAN }[e.key] ?? 0;
        ty += { ArrowUp: KEY_PAN, ArrowDown: -KEY_PAN }[e.key] ?? 0;
        apply();
      }
    });
    view.addEventListener("close", () => art.replaceChildren());
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });
    const twoFingers = () => {
      const [a, b] = [...pointers.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    stage.addEventListener("pointerdown", (e) => {
      // Where the press BEGAN decides the click: capture retargets its end to the stage.
      if (!pointers.size) { moved = false; pressedStage = e.target === stage; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.setPointerCapture(e.pointerId); stage.classList.add("is-grabbing");
      if (pointers.size === 2) { moved = true; pinch = { ...twoFingers(), scale }; }
    });
    stage.addEventListener("pointermove", (e) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      if (pinch) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const now = twoFingers();
        tx += now.x - pinch.x; ty += now.y - pinch.y; // the midpoint pans
        zoomTo(pinch.scale * (now.distance / pinch.distance), now.x, now.y);
        pinch.x = now.x; pinch.y = now.y;
        apply();
        return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
      moved = true;
      tx += dx; ty += dy;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      apply();
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) stage.classList.remove("is-grabbing");
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    // An <img> is draggable by default: a few pixels in, the browser starts its own drag of the
    // image, cancels the pointer, and the pan stops where that began — measured, a 120px drag moved
    // the picture 24px. Only an svg had ever panned properly.
    stage.addEventListener("dragstart", (e) => e.preventDefault());
  };

  const open = (source) => {
    const node = source.querySelector("svg, img, canvas");
    if (!node) return;
    // Built on first use, and again if a page re-render took it out of <body>.
    if (!view?.isConnected) build();
    // Measure the ORIGINAL while it is still laid out. The clone needs a definite
    // pixel size: a mermaid svg is sized by `width="100%"` plus an inline
    // max-width, and both resolve against a parent — dropping them to "let it
    // fill" gives an svg with only a viewBox, which collapses to 0x0 in an
    // auto-sized box and makes fit() scale nothing (measured exactly that).
    const box = node.getBoundingClientRect();
    const canvas = node instanceof HTMLCanvasElement;
    const copy = node.cloneNode(true);
    copy.style.maxWidth = copy.style.maxHeight = "none";
    if (box.width && box.height) {
      // A canvas's width and height ATTRIBUTES are its resolution, and writing one clears it; the
      // clone keeps the original's, so only its displayed size is set.
      if (!canvas) {
        copy.setAttribute("width", box.width);
        copy.setAttribute("height", box.height);
      }
      copy.style.width = `${box.width}px`;
      copy.style.height = `${box.height}px`;
    }
    // A canvas clones EMPTY — its bitmap is not part of the node — so the view showed a blank box.
    if (canvas) copy.getContext("2d")?.drawImage(node, 0, 0);
    art.replaceChildren(copy);
    view.setAttribute("aria-label", source.getAttribute("aria-label") || nameOf(source));
    openDialog(view, source);
    requestAnimationFrame(fit);
  };

  return open;
}
return { initDiagramZoom };
};
//@dd-record dialog deps= exports=openDialog,closeDialog,initDialogs
records["dialog"] = (__dd) => {
/*
 * dialog.js — the system's modal dialog: a native <dialog> opened with showModal(), named by its
 * title, with focus moved in and handed back.
 *
 * Markup contract (src/overlays.css draws it):
 *
 *   <button type="button" data-dialog-open="join-dlg">join</button>
 *
 *   <dialog class="dialog" id="join-dlg" aria-labelledby="join-t">
 *     <header class="dialog-head">
 *       <h2 class="dialog-title" id="join-t">join the review</h2>
 *       <button type="button" class="btn-icon dialog-close" data-icon="x" data-dialog-close aria-label="close"></button>
 *     </header>
 *     <div class="dialog-body">…</div>
 *     <footer class="dialog-foot form-actions">
 *       <p class="form-status" role="status"></p>
 *       <button type="button" class="btn-terminal btn-terminal--compact" data-dialog-close="join">join</button>
 *     </footer>
 *   </dialog>
 *
 * THE PLATFORM DOES THE HARD HALF, AND THAT IS WHY THIS IS A <dialog>. showModal() puts the box
 * in the top layer, makes everything outside it inert (no pointer, no focus, no Tab), and turns
 * Escape into a close request on the TOPMOST dialog of a stack. configr built all of that by hand
 * — a ModalShell that walked the document setting `inert` on every sibling of the topmost
 * dialog — and seedr studio's copy of it moved focus in once and never trapped it. Cockpit already
 * used the native element (`modal.js`) and got the top layer for free, but its dialogs had no name
 * and focus landed wherever the platform put it. This module is the small remainder the platform
 * does not do: WHERE focus goes, WHERE it comes back to, and a NAME.
 *
 * WHAT IT ADDS, and why each one:
 *
 *   · FOCUS STARTS ON THE DIALOG ITSELF (tabindex="-1"), not on its first control. The platform
 *     focuses the first focusable descendant, which in this markup is the back arrow or the X —
 *     so a screen reader announced "close, button" before it ever read what the dialog was about,
 *     and a reader who pressed Enter out of habit dismissed it unread. On the dialog, the name is
 *     read first and the first Tab lands on a control. An `[autofocus]` inside wins (configr's
 *     rule): a dialog whose whole point is one field starts in it.
 *   · FOCUS COMES BACK to what held it when the dialog opened, else to the control that opened
 *     it. The "else" is Safari: a mouse click does not focus a button there, so what held focus at
 *     open was <body>, and the platform's own restore put the reader back at the top of the page.
 *     And when both are gone — the page re-rendered its row while the dialog was open, as cockpit's
 *     approvals do — to a connected `[data-dialog-open="<this id>"]`, if the page has one again. A
 *     page that re-renders its opener as something else, or somewhere else, hands focus back itself.
 *   · A DIALOG WITHOUT A NAME GETS ITS TITLE'S. Every cockpit dialog was unnamed: "dialog" is all
 *     a screen reader said. An unnamed dialog is linked to its `.dialog-title` (an id is generated
 *     if the title has none).
 *   · THE ANSWER IS `returnValue`, and it starts EMPTY on every open. `[data-dialog-close="remove"]`
 *     closes with "remove"; Escape, the backdrop and a bare `[data-dialog-close]` close with "".
 *     The reset is the load-bearing line: the platform KEEPS returnValue across opens, and a close
 *     without a value (the backdrop, `closeDialog(d)`) does not overwrite it — so a confirm answered
 *     "remove" once and dismissed the next time read "remove" again, and the page removed twice.
 *   · THE BACKDROP CLOSES — a press that starts AND ends outside the box. The dialog has no
 *     padding and its parts fill it, so a press whose target is the <dialog> itself is on its
 *     ::backdrop or its 1px edge; the coordinates decide which. Both halves of the gesture have to
 *     be outside, or a text selection dragged out of the body and released over the scrim would
 *     throw the form away.
 *   · AN ALERT CANNOT BE DISMISSED BY ACCIDENT. `.dialog--alert` ignores the backdrop, and Escape
 *     does nothing — see onKeydown(): cancelling the `cancel` event alone is NOT enough on current
 *     Chromium, which lets the second Escape through regardless.
 *   · NOR CAN A DIALOG WHOSE FOOTER IS COMMITTING. While an action in `.dialog-foot` is
 *     `aria-busy="true"`, Escape, the backdrop and every `[data-dialog-close]` do nothing: they
 *     would walk away from a write that is still running, and the page would have nowhere left to
 *     say how it ended. The page closes it with closeDialog() when the write returns. Busy is
 *     `aria-busy` + `aria-disabled`, never `disabled`, which would throw focus to <body>. The
 *     runtime marks the closers it is ignoring `aria-disabled` for as long as that lasts, so the X
 *     says it is off rather than silently doing nothing.
 *
 * FRAMEWORK APPS do not run this (they own their nodes — house rule 10): they render the same markup
 * on a native <dialog>, call showModal() themselves and apply the same focus rule.
 */

const opened = new WeakMap(); // dialog -> { returnTo, opener }, while this module has it open
const stack = []; // the dialogs this module opened, topmost last
const known = new WeakSet(); // dialogs whose own listeners are attached
const roots = new WeakSet(); // roots with the delegated click listeners
let keysInstalled = false;
let counter = 0;
let pressed = null; // the dialog whose backdrop took the last pointerdown

function resolve(dialogOrId) {
  const dialog = typeof dialogOrId === "string" ? document.getElementById(dialogOrId) : dialogOrId;
  if (!(dialog instanceof HTMLDialogElement)) {
    throw new Error(`dialog.js: no <dialog> ${typeof dialogOrId === "string" ? `#${dialogOrId}` : String(dialogOrId)}`);
  }
  return dialog;
}

const idOf = (el) => el.id || (el.id = `dd-dialog-${(counter += 1)}`);

/* A dialog removed from the document while open never fires `close`, so the stack is pruned on
   read rather than trusted. */
function topmost() {
  while (stack.length && !(stack.at(-1).open && stack.at(-1).isConnected)) stack.pop();
  return stack.at(-1) ?? null;
}

/* aria-disabled keeps a control focusable so a tip can say why it is off; its clicks still arrive,
   and the one handling them is this module. */
const inactive = (el) => el.getAttribute("aria-disabled") === "true";

/* Only the footer: a list in the body that is loading (`aria-busy` on a region) is not a write, and
   locking the dialog while content arrives would trap the reader in it. */
const committing = (dialog) => Boolean(dialog.querySelector('.dialog-foot [aria-busy="true"]'));
const undismissable = (dialog) => dialog.matches(".dialog--alert") || committing(dialog);

/* The press has to be OUTSIDE the box, not merely on the <dialog> element: a press on its 1px edge
   targets the dialog too. Both operands are visual px, so a zoomed root needs no conversion. */
function onBackdrop(dialog, event) {
  const r = dialog.getBoundingClientRect();
  return event.clientX < r.left || event.clientX >= r.right || event.clientY < r.top || event.clientY >= r.bottom;
}

/* On the ROOT, in the capture phase (`cancel` does not bubble), so an alert a page opened with a
   bare showModal() is covered as well as one opened here. */
function onCancel(event) {
  const dialog = event.target;
  if (dialog instanceof HTMLDialogElement && undismissable(dialog)) event.preventDefault();
}

/* The dialog Escape will close: the topmost modal. Focus is always inside it (everything else is
   inert), so the focused element's dialog is the one — including a native dialog a page put on top
   of an alert, which this module never opened and whose Escape must go through. */
function topmostModal(event) {
  const from = event.target instanceof Element ? event.target.closest("dialog") : null;
  if (from?.matches(":modal")) return from;
  return topmost() ?? [...document.querySelectorAll("dialog")].filter((d) => d.matches(":modal")).at(-1) ?? null;
}

/*
 * ESCAPE ON AN ALERT (or a committing dialog), CANCELLED AT THE KEY. Measured on HeadlessChrome 151:
 * an alert whose `cancel` is prevented survives the FIRST Escape (`cancel`, cancelable) and closes
 * on the SECOND — the close-watcher rule makes a cancel cancelable only once per user activation,
 * and Escape is not an activation. A cancelled `keydown` raises no close request at all, so the
 * alert holds on the third press as on the first.
 *
 * On `window`, in the BUBBLE phase, and only if nobody took the key first: window's listeners run
 * after every document-level one, so a menu or a listbox open inside the alert still gets its own
 * Escape (they cancel it themselves, and a cancelled key is left alone here).
 */
function onKeydown(event) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = topmostModal(event);
  if (top && undismissable(top)) event.preventDefault();
}

function onClose(event) {
  const dialog = event.currentTarget;
  const i = stack.indexOf(dialog);
  if (i !== -1) stack.splice(i, 1);
  const state = opened.get(dialog);
  opened.delete(dialog);
  if (!state) return;
  // The platform restores focus too, to what held it at showModal(). This covers the two cases it
  // does not: nothing held it (<body>), or that element is gone. An element behind a dialog that
  // is still open is inert and refuses focus, so this cannot pull focus out of a stack.
  const again = dialog.id
    ? document.querySelector(`[data-dialog-open="${CSS.escape(dialog.id)}"]:not([aria-disabled="true"])`)
    : null;
  for (const candidate of [state.returnTo, state.opener, again]) {
    if (!candidate || candidate === document.body || !candidate.isConnected) continue;
    const el = shownFor(candidate);
    el.focus();
    if (document.activeElement === el) return;
  }
}

/* A menu item that opened the dialog sits in a <details> the menu closed when it was chosen, and a
   control in a closed <details> cannot take focus: every candidate was that item, and focus fell to
   <body>. The summary of the outermost closed <details> stands in for it: that is the one on screen. */
function shownFor(el) {
  let shown = el;
  for (let shut = el.closest("details:not([open])"); shut; shut = shut.parentElement?.closest("details:not([open])")) {
    const summary = shut.querySelector(":scope > summary");
    if (summary && !summary.contains(el)) shown = summary;
  }
  return shown;
}

/* The closers a committing footer switches off, marked so, and unmarked when the write returns.
   Only what this module marked is unmarked: an answer the page itself set aria-disabled (X5) is
   the page's to restore. */
function syncLock(dialog) {
  const locked = committing(dialog);
  for (const closer of dialog.querySelectorAll("[data-dialog-close]")) {
    if (locked && !closer.hasAttribute("aria-disabled")) {
      closer.setAttribute("aria-disabled", "true");
      closer.dataset.dialogLocked = "";
    } else if (!locked && "dialogLocked" in closer.dataset) {
      closer.removeAttribute("aria-disabled");
      delete closer.dataset.dialogLocked;
    }
  }
}
// Made on first use, not at import: a server-side render imports the runtime barrel, and Node has
// no MutationObserver.
let lockObserver = null;
const observeLocks = (root) => {
  lockObserver ??= new MutationObserver((records) => {
    const touched = new Set(records.map((r) => r.target.closest?.("dialog")).filter(Boolean));
    for (const dialog of touched) syncLock(dialog);
  });
  lockObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
};

function installKeys() {
  if (keysInstalled) return;
  keysInstalled = true;
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("cancel", onCancel, true);
}

function name(dialog) {
  if (!dialog.hasAttribute("aria-label") && !dialog.hasAttribute("aria-labelledby")) {
    const title = dialog.querySelector(".dialog-title");
    if (title) dialog.setAttribute("aria-labelledby", idOf(title));
  }
  // An alert is announced as one, with its message, the moment it opens.
  if (dialog.matches(".dialog--alert")) {
    if (!dialog.hasAttribute("role")) dialog.setAttribute("role", "alertdialog");
    const body = dialog.querySelector(".dialog-body");
    if (body && !dialog.hasAttribute("aria-describedby")) dialog.setAttribute("aria-describedby", idOf(body));
  }
}

/**
 * Open a dialog modally: the page behind it goes inert, focus moves onto the dialog (or its
 * `[autofocus]` control) and comes back when it closes. An open dialog is returned as it is.
 *
 * @param {HTMLDialogElement | string} dialogOrId The dialog, or its id.
 * @param {HTMLElement | null} [opener] The control that opened it — where focus returns when
 *   nothing was focused at open. The `[data-dialog-open]` click passes its own button.
 * @returns {HTMLDialogElement}
 */
function openDialog(dialogOrId, opener = null) {
  const dialog = resolve(dialogOrId);
  if (dialog.open) return dialog;
  installKeys();
  if (!known.has(dialog)) {
    known.add(dialog);
    dialog.addEventListener("close", onClose);
  }
  const returnTo = document.activeElement;
  name(dialog);
  dialog.returnValue = "";
  dialog.showModal();
  stack.push(dialog);
  opened.set(dialog, { returnTo, opener });
  if (!dialog.querySelector("[autofocus]")) {
    if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
    dialog.focus();
  }
  return dialog;
}

/**
 * Close a dialog. Its `returnValue` becomes `returnValue` when one is given and stays "" otherwise.
 *
 * @param {HTMLDialogElement | string} dialogOrId The dialog, or its id.
 * @param {string} [returnValue] The answer, e.g. "remove".
 */
function closeDialog(dialogOrId, returnValue) {
  const dialog = resolve(dialogOrId);
  if (dialog.open) dialog.close(returnValue);
}

function onClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const opener = target.closest("[data-dialog-open]");
  if (opener) {
    event.preventDefault();
    if (!inactive(opener)) openDialog(opener.getAttribute("data-dialog-open"), opener);
    return;
  }
  const closer = target.closest("[data-dialog-close]");
  if (closer) {
    const dialog = closer.closest("dialog");
    if (dialog?.open && !inactive(closer) && !committing(dialog)) {
      dialog.close(closer.getAttribute("data-dialog-close") || undefined);
    }
    return;
  }
  const backdrop = pressed;
  pressed = null;
  if (target === backdrop && backdrop.open && onBackdrop(backdrop, event)) backdrop.close();
}

function onPointerDown(event) {
  const target = event.target;
  pressed = target instanceof HTMLDialogElement && target.matches(".dialog") && !undismissable(target)
    && onBackdrop(target, event) ? target : null;
}

/**
 * The declarative half: `[data-dialog-open="<id>"]` opens that dialog, `[data-dialog-close]` inside
 * one closes it (its value, if any, is the dialog's `returnValue`), and a press on the backdrop
 * closes a `.dialog` — not an alert, and not one whose footer is committing. Delegated, so dialogs
 * and buttons rendered later work. Call once, at startup.
 *
 * @param {Document | Element} [root=document] Where the delegated listeners go.
 */
function initDialogs(root = document) {
  if (roots.has(root)) return;
  roots.add(root);
  installKeys();
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("click", onClick);
  observeLocks(root);
}
return { openDialog, closeDialog, initDialogs };
};
//@dd-record dropdown deps= exports=attachMenuKeys,initDropdowns
records["dropdown"] = (__dd) => {
/*
 * danieldeusing-design — dropdown menus: `<details class="dropdown">`, and the menu keys any
 * page-built menu can borrow.
 *
 * Markup contract, unchanged since the first release:
 *
 *   <details class="dropdown">
 *     <summary>actions</summary>
 *     <ul class="dropdown-panel">
 *       <li><button type="button" class="dropdown-item">rename</button></li>
 *       <li class="dropdown-sep"></li>
 *       <li><button type="button" class="dropdown-item dropdown-item--danger">delete</button></li>
 *     </ul>
 *   </details>
 *
 * WHAT A NATIVE <details> DOES NOT KNOW (0.60.0). It opens, it closes and it puts the summary in
 * the tab order. It does not know it is a MENU. Until 0.60.0 this module added only "one open at
 * a time, close on a click away or Escape", so a keyboard reader who opened one was left on the
 * summary with a list under it that only Tab could walk: every item its own tab stop, no arrow
 * keys, no Home/End, and Escape dropped focus on <body> instead of handing it back to the control
 * that opened the list. seedr's Radix menu and configr's Menu both do the ARIA APG menu button;
 * the system's own dropdown was the one that did not.
 *
 * TWO KINDS OF PANEL, told apart by what is IN them, never by a class the author has to remember:
 *   · a panel of rows — `.dropdown-item`, `.dropdown-sep`, `.dropdown-label`, bare or one per <li>
 *     — is a MENU. It gets `role="menu"`, its <li>s `role="none"`, its items `role="menuitem"`
 *     (an item that already says `menuitemradio` / `menuitemcheckbox` keeps it: the theme items
 *     do), its separators `role="separator"`, and the summary `aria-haspopup="menu"` with an
 *     `aria-expanded` kept in step. Items are `tabindex="-1"`: the arrows reach them, Tab does not.
 *     A LABELLED SECTION — a `.dropdown-label` and the items under it, up to the next separator or
 *     label — is wrapped in a `role="group"` named by the label (`aria-labelledby`), the APG shape:
 *     inside a bare menu the label's words were loose text, and "sort by" and "order" could not be
 *     told apart. A menu with no label is left as it is.
 *   · a panel holding anything else — the table filter's text box, a form — is a DISCLOSURE and is
 *     left exactly as the platform made it: no menu roles, and Tab walks through it. Announcing a
 *     text field as a menu would be a lie the reader acts on.
 *
 * A RENDERER MAY PATCH, BUT NOT UN-MARK. A page that re-renders by patching attributes strips
 * every attribute its markup does not carry. The observer also watches the attributes the runtime
 * owns (OWNED) and re-marks; every write is conditional, so a re-mark of a correct menu writes
 * nothing and cannot loop.
 *
 * DELEGATED, AND IT KEEPS MARKING. The old version bound the dropdowns that existed when it was
 * called. runtime/tabletools.js builds its header dropdowns AFTER that, from rows that arrive over
 * the network, so every one of them had no click-away and no Escape — on the pages that have the
 * most of them. Listeners now live on the document, and one MutationObserver marks a dropdown the
 * moment it is inserted (and re-marks one whose rows change: a `pick` list is rebuilt when its
 * column's values change), the way runtime/select.js keeps enhancing selects. One call, at startup.
 *
 * Framework apps do not run this (they own their nodes): they render the same roles and implement
 * the same keys themselves.
 */

const TYPEAHEAD_MS = 700; // select.js's window, so the two lists answer typing alike
const ROW = ".dropdown-item, .dropdown-sep, .dropdown-label";
const ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const CHOICE_ROLES = ["menuitemradio", "menuitemcheckbox"];

let installed = false;
let counter = 0;
const typed = new WeakMap(); // panel -> { text, at }

const dropdownOf = (node) => (node instanceof Element ? node.closest("details.dropdown") : null);
const summaryOf = (details) => details.querySelector(":scope > summary");
const panelOf = (details) =>
  details.querySelector(":scope > .dropdown-panel") || details.querySelector(".dropdown-panel");
const isMenu = (panel) => panel?.getAttribute("role") === "menu";

/* ── which panels are menus ──────────────────────────────────────────────────────────────────── */

const only = (el) => (el.tagName === "LI" && el.childElementCount === 1 ? el.firstElementChild : null);
const rowOf = (el) => (el.matches(ROW) ? el : only(el)?.matches(ROW) ? only(el) : null);
// A group is a list (or a div) whose first row is a `.dropdown-label` — what groupSections() writes
// and what an author may write already. Recognised by its SHAPE, not its role: a renderer that
// patches attributes can strip `role="group"`, and the group must still be found to be re-named.
const LIST = /^(UL|OL|DIV)$/;
const groupOf = (el) => {
  const box = LIST.test(el.tagName) && !el.matches(ROW) ? el : only(el) && LIST.test(only(el).tagName) ? only(el) : null;
  const first = box?.firstElementChild && rowOf(box.firstElementChild);
  return first?.matches(".dropdown-label") ? box : null;
};
// Every attribute the runtime owns is written only when it differs, so re-marking after a renderer
// stripped one is a repair, and re-marking a menu that is already right writes nothing — the
// observer that watches these attributes can never feed itself.
const set = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};
const OWNED = ["role", "tabindex", "aria-haspopup", "aria-expanded", "aria-labelledby", "id"];

/* The rows a panel is made of — through the groups mark() made — or null when it holds anything
   that is not a row. */
function menuRows(panel) {
  const rows = [];
  for (const child of panel.children) {
    const group = groupOf(child);
    const inner = group ? menuRows(group) : null;
    const row = inner ? null : rowOf(child);
    if (!inner && !row) return null;
    rows.push(...(inner || [row]));
  }
  return rows.some((row) => row.matches(".dropdown-item")) ? rows : null;
}

/* Each label and the items under it become one group named by the label. Once: a label already in
   a group is not at the top level any more, so a second call finds nothing to wrap. */
function groupSections(panel) {
  const children = [...panel.children];
  for (let i = 0; i < children.length; i += 1) {
    const label = rowOf(children[i]);
    if (!label?.matches(".dropdown-label")) continue;
    const section = [children[i]];
    while (i + 1 < children.length && rowOf(children[i + 1])?.matches(".dropdown-item")) section.push(children[(i += 1)]);
    if (section.length < 2) continue;
    const inList = section[0].tagName === "LI";
    const group = document.createElement(inList ? "ul" : "div");
    const holder = inList ? document.createElement("li") : group;
    if (inList) holder.append(group);
    section[0].before(holder);
    group.append(...section);
  }
}

/* Idempotent: called on insert, whenever a panel's rows change or a renderer strips one of the
   runtime's attributes, and on open. It writes only what differs (`set`). */
function mark(details) {
  const summary = summaryOf(details);
  const panel = summary && panelOf(details);
  const rows = panel && menuRows(panel);
  // ponytail: a panel is classified when marked; one that later STOPS being a menu keeps its
  // roles. No surface changes a panel's kind today — add an unmark when one does.
  if (!rows) return;

  set(panel, "role", "menu");
  if (!summary.id) summary.id = `dd-menu-${(counter += 1)}`;
  // The runtime names the menu only where the author did not: an `aria-labelledby` of its own
  // (a `dd-menu-*` id) is re-pointed when the summary's id had to be re-made.
  const named = panel.getAttribute("aria-labelledby");
  if (!panel.hasAttribute("aria-label") && (!named || named.startsWith("dd-menu-"))) set(panel, "aria-labelledby", summary.id);
  set(summary, "aria-haspopup", "menu");
  set(summary, "aria-expanded", String(details.open));
  groupSections(panel);
  for (const group of [...panel.children].map(groupOf).filter(Boolean)) {
    const label = rowOf(group.firstElementChild);
    if (!label.id) label.id = `dd-menu-${(counter += 1)}`;
    set(group, "role", "group");
    set(group, "aria-labelledby", label.id);
  }
  for (const li of panel.querySelectorAll("li:not(.dropdown-sep)")) set(li, "role", "none");
  for (const row of rows) {
    if (row.matches(".dropdown-sep")) set(row, "role", "separator");
    else if (row.matches(".dropdown-item")) {
      if (!CHOICE_ROLES.includes(row.getAttribute("role"))) set(row, "role", "menuitem");
      set(row, "tabindex", "-1");
    }
  }
}

/* ── the menu keys, shared with page-built menus ─────────────────────────────────────────────── */

/* `disabled` cannot take focus; `aria-disabled` can, and APG keeps it reachable so a reader can
   learn the action exists. Hidden rows are skipped. */
const navigable = (panel) =>
  [...panel.querySelectorAll(ITEM)].filter((item) => !item.disabled && item.getClientRects().length > 0);

function typeahead(panel, items, current, character) {
  const now = Date.now();
  const state = typed.get(panel);
  const text = (state && now - state.at <= TYPEAHEAD_MS ? state.text + character : character).toLowerCase();
  typed.set(panel, { text, at: now });
  // One character repeated CYCLES through the items starting with it, as a native list does —
  // "d d d" walks three d-items rather than hunting for "ddd".
  const repeated = text.length > 1 && new Set(text).size === 1;
  const needle = repeated ? text[0] : text;
  const from = Math.max(items.indexOf(current) + (repeated || text.length === 1 ? 1 : 0), 0);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[(from + i) % items.length];
    if ((item.textContent || "").trim().toLowerCase().startsWith(needle)) return item;
  }
  return null;
}

/*
 * The APG menu's keys, for a panel whose items take focus one at a time. `close` shuts the menu
 * AND puts focus back on whatever opened it; the caller decides what that is.
 *
 * TAB AND SHIFT+TAB BOTH LEAVE, AND FROM THE OPENER. Focus goes back to the opener first, then Tab
 * does its default: forward, it moves past the opener to whatever follows it — which is where
 * "moves on" has to land for a panel that can live anywhere in the DOM (a context menu sits on
 * <body>, after everything else). Shift+Tab stops ON the opener, the control a reader backing out
 * of a menu is looking for.
 */
function menuKeydown(panel, event, close) {
  const items = navigable(panel);
  const current = event.target instanceof Element ? event.target.closest(ITEM) : null;
  const index = items.indexOf(current);
  const go = (item) => {
    event.preventDefault();
    item?.focus();
  };
  switch (event.key) {
    case "ArrowDown":
      go(items[(index + 1) % items.length]);
      return;
    case "ArrowUp":
      go(index < 0 ? items.at(-1) : items[(index - 1 + items.length) % items.length]);
      return;
    case "Home":
      go(items[0]);
      return;
    case "End":
      go(items.at(-1));
      return;
    case "Escape":
      // BOTH, as in select.js: a menu inside a modal <dialog> must not close the dialog as well.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    case "Tab":
      if (event.shiftKey) event.preventDefault();
      close();
      return;
    case " ":
    case "Enter":
      // A <button> activates itself on both; an <a> follows on Enter but SCROLLS THE PAGE on Space,
      // and an element given the role by hand does neither.
      if (current && current.tagName !== "BUTTON" && !(event.key === "Enter" && current.tagName === "A")) {
        event.preventDefault();
        current.click();
      }
      return;
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const hit = typeahead(panel, items, current, event.key);
        if (hit) go(hit);
      }
  }
}

/* An aria-disabled item does nothing when activated, by pointer or key, and the menu stays open. The
   page ignores the press; an <a> item would still follow its link, so its default is cancelled
   here — Enter on a link arrives as this same click. */
function unavailable(item, event) {
  if (item.getAttribute("aria-disabled") !== "true") return false;
  event.preventDefault();
  return true;
}

/* Focus still on the menu — or dropped on <body> by the menu's removal — goes back to the opener.
   Focus the action moved ON PURPOSE (into a dialog it opened, say) is left where it is. */
const focusIsStranded = (container) =>
  !document.activeElement || document.activeElement === document.body || container.contains(document.activeElement);

/**
 * The menu keys for a menu the page builds and places itself — the context menu, a menu opened
 * from a row. Its items are the panel's `menuitem` / `menuitemradio` / `menuitemcheckbox`
 * elements. The page still opens it, positions it and focuses its first item; this adds the
 * arrows, Home/End, typeahead, Escape and Tab, and closes on an item's activation.
 *
 * @param {HTMLElement} panel The element carrying `role="menu"`.
 * @param {{ onClose?: () => void, returnFocusTo?: HTMLElement | null }} [options]
 *   `onClose` must be safe to call twice: an item's own handler may already have closed the menu.
 * @returns {() => void} detach — removes the listeners.
 */
function attachMenuKeys(panel, { onClose, returnFocusTo } = {}) {
  // Out of the tab order — and so is an item the page adds while the menu is attached.
  const quiet = () => {
    for (const item of panel.querySelectorAll(ITEM)) item.tabIndex = -1;
  };
  quiet();
  const observer = new MutationObserver(quiet);
  observer.observe(panel, { childList: true, subtree: true });
  const close = () => {
    onClose?.();
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
  };
  const onKeydown = (event) => menuKeydown(panel, event, close);
  const onClick = (event) => {
    const item = event.target instanceof Element ? event.target.closest(ITEM) : null;
    if (!item || !panel.contains(item)) return;
    if (unavailable(item, event)) return;
    const stranded = focusIsStranded(panel);
    onClose?.();
    if (stranded && returnFocusTo?.isConnected) returnFocusTo.focus();
  };
  panel.addEventListener("keydown", onKeydown);
  panel.addEventListener("click", onClick);
  return () => {
    observer.disconnect();
    panel.removeEventListener("keydown", onKeydown);
    panel.removeEventListener("click", onClick);
  };
}

/* ── details.dropdown, delegated ─────────────────────────────────────────────────────────────── */

function setOpen(details, open) {
  details.open = open;
  const summary = summaryOf(details);
  if (summary?.hasAttribute("aria-haspopup")) set(summary, "aria-expanded", String(open));
  if (open) closeAll(details);
}

function focusEdge(panel, edge) {
  const items = navigable(panel);
  (edge === "last" ? items.at(-1) : items[0])?.focus();
}

/* Close every open dropdown except `except` and the dropdowns that contain it. */
function closeAll(except) {
  for (const details of document.querySelectorAll("details.dropdown[open]")) {
    if (except && (details === except || details.contains(except))) continue;
    setOpen(details, false);
  }
}

/*
 * A PANEL STAYS ON THE SCREEN (0.62.4). components.css places a panel against its <details> — under
 * it from the left edge (`--down`), or from the right (the default and `--end`) — and only the page
 * knows where the <details> sits. A `--down` menu near the right edge of a phone ran past it: the
 * page scrolled sideways and the panel's end was off the screen. Once open, a panel crossing either
 * edge of the viewport is moved back inside it, `EDGE` px clear, as positionPopup() keeps a list; one
 * that fits is left exactly where the stylesheet put it, so nothing that fits ever moves. A panel
 * something else places (`position: fixed`, written inline by positionPopup() for a table header's
 * filter) is left to that, and this runs a frame after the toggle so that placement has happened.
 *
 * Moved by `left`, not `translate`: Chrome kept a translated panel's old box in the page's scrollable
 * overflow, so the panel came back on screen and the page went on scrolling sideways (measured:
 * scrollWidth 447 in a 375px viewport with the panel at 182-367). Its width is pinned first, because
 * an absolute box's shrink-to-fit width depends on its offsets; a panel whose content changes while
 * it is open keeps that width until it is opened again. The width cap that keeps a panel narrower
 * than the screen is components.css's.
 *
 * Written `!important`, because a stylesheet may pin a side that way (chrome.css's
 * `.dropdown-panel.ls-panel { left: auto !important }`), and a `left` that loses leaves `right: auto`
 * to drop the panel to its static place. Whatever the author had inline on those properties is kept
 * and put back when the panel closes. Measured against the panel's own scale (its rect over its
 * layout width), which is the root's zoom times any `transform: scale()` above it: a rect is visual
 * px, `left` is the containing block's own px. And a renderer that patches attributes (cockpit's
 * `cockpitPatch`) drops a `style` its markup does not carry, so while a moved panel is open its
 * `style` is watched and the move written again.
 */
const EDGE = 8;
const PLACED = ["left", "right", "inline-size"];
const moves = new WeakMap(); // panel -> { kept, wrote, observer }

function writeMove(panel, { wrote }) {
  for (const [prop, value] of Object.entries(wrote))
    if (panel.style.getPropertyValue(prop) !== value || panel.style.getPropertyPriority(prop) !== "important")
      panel.style.setProperty(prop, value, "important");
}

function unmove(panel) {
  const move = moves.get(panel);
  if (!move) return;
  moves.delete(panel);
  move.observer.disconnect();
  for (const [prop, value, priority] of move.kept)
    if (value) panel.style.setProperty(prop, value, priority);
    else panel.style.removeProperty(prop);
}

function keepOnScreen(details) {
  const panel = panelOf(details);
  if (!panel) return;
  unmove(panel);
  if (!details.open) return;
  const style = getComputedStyle(panel);
  if (style.position !== "absolute") return;
  const { left, right, width } = panel.getBoundingClientRect();
  const dx = left < EDGE ? EDGE - left : Math.min(0, document.documentElement.clientWidth - EDGE - right);
  const layoutWidth = parseFloat(style.inlineSize);
  if (!dx || !layoutWidth) return;
  const scale = width / layoutWidth;
  const move = {
    kept: PLACED.map((prop) => [prop, panel.style.getPropertyValue(prop), panel.style.getPropertyPriority(prop)]),
    wrote: { "inline-size": style.inlineSize, left: `${parseFloat(style.left) + dx / scale}px`, right: "auto" },
  };
  move.observer = new MutationObserver(() => writeMove(panel, move));
  moves.set(panel, move);
  writeMove(panel, move);
  move.observer.observe(panel, { attributes: true, attributeFilter: ["style"] });
}

function onToggle(event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.classList.contains("dropdown")) return;
  mark(details);
  const summary = summaryOf(details);
  if (summary?.hasAttribute("aria-haspopup")) set(summary, "aria-expanded", String(details.open));
  if (details.open) closeAll(details);
  if (details.open) requestAnimationFrame(() => keepOnScreen(details));
  else keepOnScreen(details);
}

/* APG menu button: Enter, Space and ArrowDown open onto the first item, ArrowUp onto the last.
   Returns false for a key it leaves alone — Escape goes on to the document-wide path below. */
function onSummaryKeydown(details, panel, event) {
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp":
      event.preventDefault();
      setOpen(details, true);
      focusEdge(panel, event.key === "ArrowUp" ? "last" : "first");
      return true;
    case "Enter":
    case " ":
      // preventDefault is what stops the summary's own activation toggling it straight back.
      event.preventDefault();
      if (details.open) setOpen(details, false);
      else {
        setOpen(details, true);
        focusEdge(panel, "first");
      }
      return true;
    case "Tab":
      // Tabbing past an open menu would leave it open with nothing focused to close it from.
      if (details.open) setOpen(details, false);
      return true;
    default:
      return false;
  }
}

function onKeydown(event) {
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  const details = dropdownOf(target);
  const panel = details && panelOf(details);
  if (panel) {
    if (!isMenu(panel)) mark(details);
    if (isMenu(panel)) {
      const summary = summaryOf(details);
      if (target === summary) {
        if (onSummaryKeydown(details, panel, event)) return;
      } else if (panel.contains(target)) {
        menuKeydown(panel, event, () => {
          setOpen(details, false);
          summary?.focus();
        });
        return;
      }
    }
  }
  if (event.key !== "Escape") return;
  const open = [...document.querySelectorAll("details.dropdown[open]")];
  if (!open.length) return;
  // Escape belongs to the dropdown while one is open — without this it would also reach a modal
  // <dialog> around it and close that, form and all.
  event.preventDefault();
  const holder = open.find((d) => d.contains(document.activeElement));
  closeAll();
  if (holder) summaryOf(holder)?.focus();
}

function onClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  // A <select> inside a dropdown opens its list on <body> (select.js), so a pick in that list is a
  // click OUTSIDE the dropdown by position and INSIDE it by intent. It must not close it.
  if (target?.closest(".select-panel")) return;
  const details = dropdownOf(target);
  if (!details) {
    closeAll();
    return;
  }
  const panel = panelOf(details);
  const item = target.closest(`.dropdown-item, ${ITEM}`);
  if (!item || !panel?.contains(item)) return;
  if (unavailable(item, event)) return;
  // Activation closes, and hands focus back to the summary unless the action moved it on purpose.
  const stranded = focusIsStranded(details);
  setOpen(details, false);
  const summary = summaryOf(details);
  if (stranded && summary?.isConnected) summary.focus();
}

function onMutations(records) {
  const touched = new Set();
  for (const record of records) {
    const host = dropdownOf(record.target);
    if (host) touched.add(host);
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches("details.dropdown")) touched.add(node);
      for (const details of node.querySelectorAll("details.dropdown")) touched.add(details);
    }
  }
  for (const details of touched) mark(details);
}

/**
 * Menu behaviour for every `details.dropdown` on the page, now and rendered later: one open at a
 * time; a click away, Escape and an item's activation close it (Escape and activation hand focus
 * back to the summary); a panel of rows is an APG menu with arrow keys, Home/End and typeahead.
 * Call once, at startup.
 *
 * @param {ParentNode} [root=document] Where to mark the dropdowns that already exist.
 * @returns {(except?: HTMLDetailsElement) => void} closeAll — for a page that navigates or
 *   re-renders after a pick and wants every menu shut.
 */
function initDropdowns(root = document) {
  if (!installed) {
    installed = true;
    // `toggle` does not bubble, so it is caught on the way DOWN.
    document.addEventListener("toggle", onToggle, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    addEventListener("resize", () => { for (const details of document.querySelectorAll("details.dropdown[open]")) keepOnScreen(details); });
    // Attributes too: a renderer that patches attributes (cockpit's cockpitPatch) strips the ones
    // no markup carries — the menu roles, tabindex="-1", the summary's aria-* — and a menu stripped
    // mid-read is a list of loose buttons in the tab order. Re-marking puts back exactly those.
    new MutationObserver(onMutations).observe(document.documentElement,
      { childList: true, subtree: true, attributes: true, attributeFilter: OWNED });
  }
  for (const details of root.querySelectorAll("details.dropdown")) mark(details);
  return closeAll;
}
return { attachMenuKeys, initDropdowns };
};
//@dd-record fold deps= exports=initFolds
records["fold"] = (__dd) => {
/*
 * fold.js — a printout carries what the folds were holding.
 *
 * A closed <details> prints as its summary alone, so a page that folds its detail away — which is
 * what `details.fold` is for — silently loses that detail on paper. initFolds() opens every closed
 * <details> for the print and closes those same ones again afterwards; a fold the reader had opened
 * stays open, and a `details.dropdown` is a menu, not content, so it is left alone.
 *
 *   initFolds();   // once per page; a second call does nothing
 *
 * It replaces cockpit's `beforeprint` opener, which never closed anything again.
 */
let wired = false;

function initFolds() {
  if (wired) return;
  wired = true;
  let opened = [];
  window.addEventListener("beforeprint", () => {
    // ponytail: an exclusive accordion (`<details name>`) keeps one member open, so this prints only
    // its last one; drop `name` for the print when a page ships one (none in the estate today).
    opened = [...document.querySelectorAll("details:not([open]):not(.dropdown)")];
    for (const details of opened) details.open = true;
  });
  window.addEventListener("afterprint", () => {
    for (const details of opened) details.open = false;
    opened = [];
  });
}
return { initFolds };
};
//@dd-record lsnav deps= exports=initLsNav
records["lsnav"] = (__dd) => {
/*
 * lsnav.js — show/hide for the `ls -l` site rail (src/chrome.css), and the measured chrome that
 * every sticky layer reads.
 *
 * Markup contract:
 *   <div class="ls-nav-head">
 *     <span class="ls-nav-title">ls -l</span>
 *     <button class="ls-nav-toggle" data-ls-nav-toggle aria-controls="nav" aria-expanded="true"></button>
 *   </div>
 *   <div class="ls-nav" id="nav"><ul class="ls-panel">…</ul></div>
 *
 * Any other element carrying `data-ls-nav-toggle` + `aria-controls="nav"` is a second toggle for
 * the same rail (danieldeusing.de has one in its home banner) and is kept in step. The state is
 * `aria-expanded`, never `aria-pressed`: the button opens and closes a region, it is not a
 * setting. A stale `aria-pressed` in the markup is removed, because a pressed state nothing ever
 * updates is a false statement to a screen reader.
 *
 * THIS MODULE DOES NOT APPLY THE INITIAL STATE, and that is deliberate. It is a
 * module at the end of <body>, so anything it does happens after first paint: a
 * reader who hid the rail would watch it paint and then jump away on every page
 * load. The state is applied by an inline <head> script instead —
 *
 *   try { if (localStorage.getItem("ls-nav") === "off")
 *           document.documentElement.dataset.lsNav = "off"; } catch {}
 *
 * — and this module only reads that, wires the clicks, and writes back. Shown is
 * the default, so an absent key and a failed read both land on "shown", which is
 * the state that is correct when in doubt.
 */
const KEY = "ls-nav";
const TOGGLE = "[data-ls-nav-toggle]";
// Everything measureChrome() reads a size from.
const CHROME = "header.bar, .bar-stack, footer.status, .page-toolbar";

/*
 * The rail runs BETWEEN the chrome — it must not cover the header bar or the
 * status footer. Their heights are a consumer's business and change with the
 * viewport, so they are measured here and published as --ls-nav-top /
 * --ls-nav-bottom rather than guessed at in CSS. chrome.css carries fallbacks,
 * so a page that never runs this still lays out sensibly.
 *
 * Keeping `ls -l` at one fixed spot is the point: the rail's head and the tab
 * that replaces it share --ls-nav-top, so opening and closing changes the arrow
 * and nothing else moves.
 *
 * AND --sticky-top (0.60.0): where content that sticks stops — the header's bottom edge plus the
 * page toolbar's height. The table of contents and a sticky filter bar park there, and the
 * viewport's scroll padding keeps anchors below it. It is measured for the same reason the rail's
 * top is: an alert banner above the header, or a toolbar that wraps to a second line, moves it.
 *
 * A `.bar-stack` (a banner and the header sticking as one layer) is measured INSTEAD of the bar:
 * its bottom edge is where the chrome ends, whichever of its children is last.
 */
function chrome() {
  const bar = document.querySelector("header.bar");
  return {
    edge: document.querySelector(".bar-stack") ?? bar,
    status: document.querySelector("footer.status"),
    toolbar: document.querySelector(".page-toolbar"),
  };
}

function measureChrome() {
  const root = document.documentElement;
  const { edge, status, toolbar } = chrome();
  // THE RAIL'S TOP IS THE HEADER'S BOTTOM EDGE, NOT THE HEADER'S HEIGHT. Those are the same
  // number only when nothing sits above the header — and something does: cockpit's alerts.js
  // mounts the alert banner as the FIRST CHILD OF BODY. Measured with a 73px banner, the header
  // ran 73→118 while --ls-nav-top was set to 44 (its height, minus the overlap), so the rail
  // started 74px too high, inside the banner, with the `ls -l` head and its toggle buried
  // underneath it. Reported as "the sidebar is broken, I cannot hide it any more".
  //
  // getBoundingClientRect().bottom is the only thing that answers "where does the header END on
  // screen", and it has to be VIEWPORT-relative because the rail is position:fixed. The comment
  // this replaces was right that rects are VISUAL px and a CSS length is re-multiplied by any
  // ancestor `zoom` — so the answer is to divide by the zoom, not to avoid the rect. Reading a
  // height to answer a position question is what made the banner invisible to this code.
  const zoom = Number(getComputedStyle(root).zoom) || 1;
  const h = (el) => (el ? el.offsetHeight : 0);
  // OVERLAP BY 1px rather than trying to meet the chrome exactly. offsetHeight is an
  // INTEGER while the bar's real height is fractional (44.97), so "exactly flush" is
  // a rounding coin-flip — and under a zoomed layout the error is multiplied: at
  // zoom 1.25 the bar ended at 56.00 and a 45px inset put the rail at 56.25, a
  // quarter-pixel seam of page background that is plainly visible on a wide screen.
  // Both chrome elements are opaque and sit ABOVE the rail (z-index 30 and 50 vs 25),
  // so a pixel of tuck is invisible, whereas a pixel of gap is not.
  // A page with no header has nothing above its content: 0, not the CSS fallback's 3rem.
  const top = edge ? Math.max(0, edge.getBoundingClientRect().bottom / zoom - 1) : 0;
  write(root, "--ls-nav-top", `${top}px`);
  // A hidden footer (mobile folds it into the burger) reserves nothing.
  write(root, "--ls-nav-bottom", `${Math.max(0, h(status) - 1)}px`);
  write(root, "--sticky-top", `${top + h(toolbar)}px`);
  // What the page reserves under a fixed footer is the footer's RENDERED height, not the token: a
  // footer whose controls wrap to another row outgrows --status-h (the token stays the pre-JS value,
  // and the footer's own minimum). Only the page's footer, the body's own child; none, none reserved.
  const page = document.querySelector("body > footer.status");
  write(root, "--status-reserve", page ? `${page.getBoundingClientRect().height / zoom}px` : "");
}

// This runs on EVERY scroll event, and a write to <html>'s inline style invalidates the style of
// the whole document even when the value is the one already there. Reading the inline value back
// costs no layout, so a scroll that moves nothing writes nothing.
function write(root, name, value) {
  if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
}

let wired = false;
let sizes = null;

// Every piece of chrome on the page NOW, including one mounted after the first call (a route that
// renders its own toolbar). Each element once: observing one again restarts its observation, which
// delivers a fresh callback and a fresh measurement for nothing.
const watched = new WeakSet();
function watchSizes() {
  if (!sizes) return;
  for (const el of document.querySelectorAll(CHROME)) {
    if (watched.has(el)) continue;
    watched.add(el);
    sizes.observe(el);
  }
}

function initLsNav() {
  // MEASURED ON EVERY PAGE, RAIL OR NOT (0.60.0). This used to return early on a page with no
  // toggle, before measuring anything — so the minimap, which reads --ls-nav-top/--ls-nav-bottom
  // to sit between the chrome, silently fell back to 3rem / 2.2rem on exactly the rail-less docs
  // the template recommends. The sticky layers read what this writes too.
  measureChrome();
  if (wired) {
    watchSizes();
    return;
  }
  wired = true;

  addEventListener("resize", measureChrome);
  // A sticky header's bottom edge MOVES while anything above it scrolls away: with the banner
  // on screen it sits at banner+header, and once the banner is gone it sits at header. A height
  // never changed, so this listener was never needed before.
  addEventListener("scroll", measureChrome, { passive: true });
  // The bar reflows when webfonts land, which changes its height after first paint.
  if (document.fonts?.ready) document.fonts.ready.then(measureChrome).catch(() => {});
  // …and the chrome changes size WITHOUT any of those events: a banner mounted into the stack or
  // dismissed from it, a toolbar that wraps when a filter chip is added, a status word that grows.
  // Nothing scrolled and the window did not resize, so without this the rail and the TOC would sit
  // at the old edge — under the new banner — until the reader happened to scroll.
  if (typeof ResizeObserver === "function") sizes = new ResizeObserver(measureChrome);
  watchSizes();

  const root = document.documentElement;
  const sync = () => {
    const shown = String(root.dataset.lsNav !== "off");
    for (const button of document.querySelectorAll(TOGGLE)) {
      if (button.getAttribute("aria-expanded") !== shown) button.setAttribute("aria-expanded", shown);
      button.removeAttribute("aria-pressed");
    }
  };
  sync(); // the inline script set the state; the buttons have not been told yet

  // Delegated, so a toggle rendered after this call works like the ones in the markup.
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(TOGGLE) : null;
    if (!button) return;
    const next = root.dataset.lsNav === "off";
    root.dataset.lsNav = next ? "on" : "off";
    // A rail the reader hid should stay hidden on the next page. Wrapped
    // because a locked-down browser throws on write and a nav that cannot
    // remember is still a working nav.
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {}
    sync(); // now, not a microtask later: the pressed button's state is part of the press
  });

  // THE STATE IS WATCHED, NOT THE CLICK: every toggle is re-synced whenever html[data-ls-nav]
  // changes, whoever changed it, whenever a toggle is added — a second toggle rendered later would
  // otherwise show its markup's default until the first press — and whenever something rewrites a
  // toggle's own state: a renderer that patches attributes in place (cockpit's dom-patch) puts the
  // markup's aria-expanded back on a rail the reader hid. Chrome mounted later is measured too.
  const has = (node, selector) => node instanceof Element && (node.matches(selector) || node.querySelector(selector));
  new MutationObserver((records) => {
    let toggles = false;
    let chromeAdded = false;
    for (const record of records) {
      if (record.type === "attributes") toggles ||= record.target === root || record.target.matches(TOGGLE);
      for (const node of record.addedNodes) {
        toggles ||= has(node, TOGGLE);
        chromeAdded ||= has(node, CHROME);
      }
    }
    if (toggles) sync();
    if (chromeAdded) {
      watchSizes();
      measureChrome();
    }
  }).observe(root, { attributes: true, attributeFilter: ["data-ls-nav", "aria-expanded", "aria-pressed"], childList: true, subtree: true });
}
return { initLsNav };
};
//@dd-record minimap deps= exports=initMinimap
records["minimap"] = (__dd) => {
/*
 * minimap.js — a document minimap: one bar per section, down the left edge.
 *
 * The full-width document's answer to the "On this page" list. A text table of
 * contents costs a whole column to repeat headings the reader is about to scroll
 * past; a minimap answers the same two questions — how long is this, and where
 * am I — in 2rem of gutter. A page shows a TOC OR a minimap, never both: where
 * there is room for the column the TOC wins, so initMinimap() returns null on a
 * page that has one (any `[data-toc-link]`).
 *
 * Markup contract: NOTHING. Point it at the sections and it builds itself:
 *
 *   initMinimap({ sections: "section.doc" });
 *
 * Each bar is a real <button>, so the whole thing is tabbable and every bar is
 * announced with its section's heading — the text is not on screen, but it is
 * never only visual. Bar LENGTH encodes heading depth (h2 longer than h3), which
 * is the one piece of structure a wordless strip can still carry.
 *
 * The strip scrolls itself when a document has more sections than fit the
 * viewport, and keeps the active bar in view.
 */
const LEVEL_WIDTH = { 1: 100, 2: 100, 3: 62, 4: 40 };

function initMinimap(options = {}) {
  const {
    sections: sectionSelector = "section.doc",
    label = "document sections",
    mount = document.body,
  } = options;

  if (document.querySelector("[data-toc-link]")) return null;

  const sections = Array.from(document.querySelectorAll(sectionSelector)).filter((s) => s.id);
  // One bar is not a map. Same reasoning as a one-entry nav: it would tell the
  // reader nothing they cannot already see, and it would still cost the gutter.
  if (sections.length < 2) return null;

  const nav = document.createElement("nav");
  nav.className = "minimap";
  nav.setAttribute("aria-label", label);

  const bars = sections.map((section) => {
    const heading = section.querySelector("h1, h2, h3, h4");
    const text = (heading?.textContent || section.id).trim();
    const level = heading ? Number(heading.tagName[1]) : 2;

    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "minimap-bar";
    bar.style.setProperty("--minimap-bar-w", `${LEVEL_WIDTH[level] ?? 62}%`);
    // The label is the accessible name AND the hover label: wordless on screen,
    // never wordless to a screen reader or to a hovering pointer.
    //
    // `data-tip`, NOT `title`. The native tooltip waits about a second before it
    // appears, renders in the OS's own chrome, and cannot be styled — on a strip
    // whose entire job is to be scrubbed, a delay that long means the reader has
    // moved to the next bar before the first label arrives. The system's tooltip
    // (src/tooltip.css + initTooltips) shows on mouseover with no delay, in the
    // page's own type and palette, and is delegated — so bars built here at
    // runtime need no extra wiring. Call initTooltips() once on the page.
    bar.setAttribute("aria-label", text);
    bar.dataset.tip = text;
    bar.addEventListener("click", () => {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(bar);
    return bar;
  });

  mount.append(nav);

  const setActive = (index) => {
    bars.forEach((bar, i) => {
      // aria-current, not aria-selected: these are links into a document, not
      // a tab set, and only one can be current. The CSS styles the bar from it.
      if (i === index) bar.setAttribute("aria-current", "true");
      else bar.removeAttribute("aria-current");
    });
    const bar = bars[index];
    // Keep the active bar reachable once the strip itself is scrolling.
    if (bar && nav.scrollHeight > nav.clientHeight) {
      const top = bar.offsetTop;
      const bottom = top + bar.offsetHeight;
      if (top < nav.scrollTop || bottom > nav.scrollTop + nav.clientHeight) {
        nav.scrollTop = top - nav.clientHeight / 2;
      }
    }
  };

  // Same approach as a scroll-spy TOC: track what is on screen and light the
  // topmost one, so a short trailing section does not steal the highlight from
  // the long one the reader is actually in.
  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      if (!visible.size) return;
      let best = -1;
      sections.forEach((section, i) => {
        if (visible.has(section) && (best === -1 || i < best)) best = i;
      });
      if (best !== -1) setActive(best);
    },
    { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
  );
  for (const section of sections) observer.observe(section);

  setActive(0);
  return { nav, bars, destroy: () => { observer.disconnect(); nav.remove(); } };
}
return { initMinimap };
};
//@dd-record nav deps= exports=initBurgerNav
records["nav"] = (__dd) => {
/*
 * nav.js — mobile burger navigation for the chrome kit (src/chrome.css).
 *
 * Markup contract:
 *   <button class="nav-burger" data-nav-toggle aria-controls="site-nav" aria-expanded="false">…</button>
 *   <nav id="site-nav" class="site-nav">…</nav>
 *
 * Toggles `.open` on the nav, keeps aria-expanded in sync, and closes on
 * outside click. Desktop is untouched (the burger is display:none above the
 * 48rem breakpoint).
 */
const wired = new WeakSet();

function initBurgerNav() {
  const burger = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("site-nav");
  // Once per burger: two click listeners on one toggle opened and closed it in the same press.
  if (!burger || !nav || wired.has(burger)) return;
  wired.add(burger);

  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    if (!nav.classList.contains("open")) return;
    if (event.target.closest("#site-nav") || event.target.closest("[data-nav-toggle]")) return;
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  });

  // On `window`, so it runs after every document-level handler whatever the init order, and only if
  // none of them took the key: a menu open inside the nav cancels its own Escape, and one press
  // closes one layer, not both.
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !nav.classList.contains("open")) return;
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.focus();
  });
}
return { initBurgerNav };
};
//@dd-record notice deps= exports=initNotices
records["notice"] = (__dd) => {
/*
 * notice.js — the dismiss button on a `.notice` (src/feedback.css).
 *
 * Markup contract:
 *   <div class="notice" data-tone="warning" role="alert">
 *     <span class="notice-label">warning:</span><p>…</p>
 *     <button type="button" class="btn-icon btn-icon--bare btn-icon--sm notice-dismiss"
 *             data-icon="x" aria-label="dismiss"></button>
 *   </div>
 *
 * Call `initNotices()` once. The click is handled by ONE listener on the document, so a notice
 * rendered after load — a form's result, a poll's warning — is dismissible with no second call and
 * nothing to re-attach: there is no per-notice state to keep in step, which is why this needs no
 * MutationObserver where select.js does.
 *
 * WHAT DISMISS DOES, in order:
 *   1. fires `notice:dismiss` on the notice — bubbling, cancelable. A page that must remember the
 *      dismissal (so its next render does not put the notice straight back) listens for it; a page
 *      that wants to hide rather than remove calls `preventDefault()` and does it itself.
 *   2. moves focus, if it was inside the notice, to the next focusable thing after it (or the one
 *      before it, when nothing follows). The dismiss button is about to stop existing; left alone,
 *      focus would fall to <body> and a keyboard or screen-reader user would be thrown back to the
 *      top of the page for having closed a message. "Focusable" means a place the reader could
 *      Tab to: never a negative tabindex (the hidden <select> behind select.js's trigger, an
 *      inactive tab of a roving tablist), nothing inside `[aria-hidden="true"]` or `[inert]`,
 *      nothing disabled or unrendered. And a focus that does not take — `visibility: hidden`, a modal
 *      dialog's inert background — is checked, not assumed: the next candidate is tried.
 *   3. removes the notice. A dismissed message is gone, not hidden: a hidden `role="alert"` is dead
 *      markup that still has to be reasoned about.
 *
 * Keyboard needs nothing extra: the control is a native <button>, so Enter and Space already click.
 *
 * FOR BUILD-FREE PAGES ONLY. A framework app (React, Solid, Astro islands) renders the notice from
 * its own state and removes it in its own click handler; it must never run this over nodes it owns
 * — removing a node React rendered desynchronises React (house rule 10).
 */

const FOCUSABLE = "a[href], button, input, select, textarea, summary, [tabindex]";

let installed = false;

function reachable(element, notice) {
  return (
    !notice.contains(element) &&
    element.tabIndex >= 0 &&
    !element.matches(":disabled") &&
    !element.closest('[aria-hidden="true"], [inert]') &&
    element.getClientRects().length > 0
  );
}

function focusBeside(notice) {
  const candidates = [...document.querySelectorAll(FOCUSABLE)].filter((element) =>
    reachable(element, notice),
  );
  const after = candidates.filter(
    (element) => notice.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const before = candidates.filter(
    (element) => notice.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING,
  );
  for (const element of [...after, ...before.reverse()]) {
    element.focus();
    // Took, if focus has left the notice for somewhere that is not <body>. Not `=== element`: a
    // control may hand its focus on to the part the reader sees, and that is still a landing.
    const active = document.activeElement;
    if (active && active !== document.body && !notice.contains(active)) return;
  }
}

function initNotices() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".notice-dismiss") : null;
    const notice = button?.closest(".notice");
    if (!notice) return;
    const dismiss = new CustomEvent("notice:dismiss", { bubbles: true, cancelable: true });
    if (!notice.dispatchEvent(dismiss)) return;
    if (notice.contains(document.activeElement)) focusBeside(notice);
    notice.remove();
  });
}
return { initNotices };
};
//@dd-record pagination deps=select exports=PAGE_SIZES,DEFAULT_PAGE_SIZE,pageWindow,normalizePageSize,applyPageWindow,initTablePagination
records["pagination"] = (__dd) => {
/*
 * pagination.js — a long table shows 20 rows at a time, and the rest are still THERE.
 *
 * Markup contract:
 *   <table data-table-id="docs-scopes">
 *
 * One attribute — unlike `initTableScroll()` and `initSelects()`, whose contract is
 * nothing at all. The difference is deliberate and it is explained under "IDENTITY"
 * below: a remembered page size has to be remembered AGAINST something, and every
 * scheme for guessing that something is wrong the first time a table moves.
 *
 * ── THE ORDER IS FILTER, THEN SORT, THEN SLICE, AND THAT IS THE WHOLE FEATURE ──────
 *
 * The natural wrong implementation of paging is to cut the data to twenty rows and
 * then wire the sort and the filter to what is on screen. It looks right on page 1
 * and it is a table that lies: sorting by "newest" reorders twenty arbitrary rows
 * while the actual newest row sits on page 3, and filtering finds nothing because the
 * match was never in the slice being searched.
 *
 * THIS COMPONENT CANNOT MAKE THAT MISTAKE, because it cannot sort and it cannot
 * filter. It has no idea what a row means. It reads the `<tbody>` that is already in
 * the document — whatever produced those rows has already filtered and already sorted
 * the FULL dataset, because that is the only way rows get into a tbody — and hides
 * all but one window of them. Slicing last is not a rule anyone here has to remember;
 * it is the only thing this code is able to do. A page keeps its own sort and filter
 * and needs no edit to gain paging (cockpit's `cockpitTable` engine is the worked
 * example: `visibleRows()` filters and sorts `rows`, the full array, exactly as it did
 * before this existed).
 *
 * ── HIDING, NOT REMOVING ──────────────────────────────────────────────────────────
 *
 * Turning the page sets the `hidden` attribute on the rows that are off-window and
 * clears it on the twenty that are not. No markup is rebuilt, nothing is re-parsed and
 * no `innerHTML` is written — which matters here beyond speed: cockpit patches its
 * tables in place (`cockpit/pages/dom-patch.js`) precisely so a background refresh does
 * not destroy half-typed input, focus, or an opened <details>. A pager that re-rendered
 * the table on every page change would hand all of that back.
 *
 * ── IDENTITY: `data-table-id`, OR PAGINATION DOES NOT ENGAGE ──────────────────────
 *
 * The size the reader picks is remembered per table in localStorage, so the key has to
 * name a table. Deriving one from the page path plus the table's index on the page is
 * the obvious move and it is a bug with a delay on it: add a table above another one
 * and every reader's "100 per page" silently becomes some other table's setting, with
 * no error and nothing to notice. So the id is REQUIRED and never guessed.
 *
 * A table without one is left alone entirely — it keeps every row, which is what it did
 * before this ran, so a reader is never shown a broken or half-paged table. The warning
 * is aimed at the one person who can fix it and fires only when the omission actually
 * costs something: a table long enough to have been paged. Short reference tables (the
 * estate has around forty of them — four machines, three agents) are silent, because
 * "you forgot an id" on a table that would never have paged anyway is noise that
 * teaches people to ignore the console.
 */

const { initSelects } = __dd("select");

/** The sizes offered in the picker. 20 is the default; the rest are the reader's call. */
const PAGE_SIZES = [5, 10, 20, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 20;

const STORE_PREFIX = "table-rows:";
const enhanced = new WeakMap();
// The instance a bar belongs to, so a bar taken out from beside a table still in the document is put back.
const owners = new WeakMap();
let documentObserver = null;

/* ── the pure core ────────────────────────────────────────────────────────────────
 * Three functions with no DOM in them, because they hold every decision worth being
 * wrong about — which window of rows, what to do with a stored value that is junk, and
 * which rows that window actually hides. `scripts/check-pagination.mjs` tests these
 * directly, so the assertions are about the shipped logic rather than about a copy of
 * it written into a harness.
 */

/**
 * The window of row indices a page covers.
 *
 * `page` is CLAMPED rather than rejected, and that is the behaviour a live table needs:
 * rows arrive and leave under a reader who is on page 4 (a filter narrows the set, a 30s
 * poll returns fewer rows), and the answer to "page 4 of 2" is page 2, not an error and
 * not an empty screen. Clamping rather than resetting to 1 is equally deliberate — a
 * background refresh must not yank the reader back to the top of a table they are part
 * way through.
 *
 * @param {number} total Rows in the full, already-filtered, already-sorted set.
 * @param {number} size Rows per page.
 * @param {number} page 1-based page number, possibly out of range.
 * @returns {{page:number,pageCount:number,from:number,to:number}} `from`/`to` are a
 *   half-open index range into the full set.
 */
function pageWindow(total, size, page) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const from = (current - 1) * size;
  return { page: current, pageCount, from, to: Math.min(from + size, total) };
}

/**
 * A stored page size, or the default.
 *
 * Everything that is not one of the offered sizes becomes 20: `null` (never set),
 * `"abc"` (junk), `999` (a size this build no longer offers), `""`, an object. The
 * store is shared with every other tab, every older build of the page and anyone with a
 * devtools console, so "it can only contain what we wrote" is not true of it.
 *
 * @param {unknown} raw
 * @returns {number}
 */
function normalizePageSize(raw) {
  const size = Number(raw);
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE;
}

/**
 * Show the rows inside `[from, to)` and hide the rest.
 *
 * Writes are checked first so an unchanged row is not touched at all. That keeps the
 * function idempotent at the DOM level — no mutation record, so the observer watching
 * these very rows cannot be woken by this function's own work and cannot loop.
 *
 * @param {ArrayLike<{hidden:boolean}>} rows The full set, in display order.
 */
function applyPageWindow(rows, from, to) {
  for (let i = 0; i < rows.length; i += 1) {
    const off = i < from || i >= to;
    if (rows[i].hidden !== off) rows[i].hidden = off;
  }
}

/* ── storage ──────────────────────────────────────────────────────────────────────
 * Both wrapped: Safari in private mode THROWS on localStorage access rather than
 * returning null, and a table that will not render because a preference could not be
 * read is a worse table than one that always starts at 20. Same shape as the theme
 * read every page in the estate does pre-paint.
 */
const storedSize = (id) => {
  try {
    return normalizePageSize(localStorage.getItem(STORE_PREFIX + id));
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
};
const storeSize = (id, size) => {
  try {
    localStorage.setItem(STORE_PREFIX + id, String(size));
  } catch {
    /* nothing to do and nothing to say — the size still applies for this visit */
  }
};

/* ── the component ────────────────────────────────────────────────────────────────*/

/*
 * The rows this pager owns: the first tbody's direct rows, minus any the renderer
 * marked `data-table-placeholder`. That opt-out exists because an engine's
 * "Nothing matches these filters." row is a full-width message wearing a <tr>, and
 * counting it would report "1 of 1" for an empty table and give it a page.
 */
function dataRows(table) {
  const body = table.tBodies[0];
  if (!body) return [];
  const rows = [];
  for (const row of body.rows) if (!row.hasAttribute("data-table-placeholder")) rows.push(row);
  return rows;
}

/*
 * Built ONCE per table and then only updated — the status text and the two
 * aria-disabled flags. Rebuilding it per page change would destroy and re-create the <select>, which
 * initSelects() has enhanced: the reader would lose the open list mid-click and the
 * focus with it.
 *
 * The picker is a plain <select> with no class and no wrapper, which is the entire
 * markup contract of the estate's dropdown — initSelects() finds it here exactly as it
 * finds one written by hand, including the ones this creates long after page load.
 * Hand-rolling a second picker beside the system's is how five copies of `.cfg-sel`
 * happened.
 *
 * The label WRAPS the select and carries no aria-label: initSelects() names the trigger
 * with the label's own words, "rows", and the trigger's text is its value, "20" — "rows,
 * combobox, 20", the way a native select is announced.
 */
function buildBar(instance) {
  const bar = document.createElement("div");
  bar.className = "table-pager";

  const status = document.createElement("p");
  status.className = "table-pager-status";
  // role="status" is aria-live="polite" with a sensible default: turning the page
  // changes nothing a screen reader would otherwise be told about, because the rows
  // themselves are not focused.
  status.setAttribute("role", "status");

  const label = document.createElement("label");
  label.className = "table-pager-size";
  label.append("rows ");
  const select = document.createElement("select");
  for (const size of PAGE_SIZES) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = String(size);
    if (size === instance.size) option.selected = true;
    select.appendChild(option);
  }
  label.appendChild(select);

  const nav = document.createElement("div");
  nav.className = "table-pager-nav";
  const button = (text) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "btn-terminal btn-terminal--ghost btn-terminal--compact";
    element.textContent = text;
    return element;
  };
  const previous = button("← prev");
  const next = button("next →");
  nav.append(previous, next);

  bar.append(status, label, nav);

  previous.addEventListener("click", () => {
    if (off(previous)) return;
    instance.page -= 1;
    render(instance);
  });
  next.addEventListener("click", () => {
    if (off(next)) return;
    instance.page += 1;
    render(instance);
  });
  select.addEventListener("change", () => {
    instance.size = normalizePageSize(select.value);
    storeSize(instance.id, instance.size);
    // Back to the top: after "show me 200" the reader is asking to see the set, and
    // landing on page 4 of a re-cut table is disorienting in a way clamping is not.
    instance.page = 1;
    render(instance);
  });

  // What holds focus in the bar, for rehome() below. A blur the reader chose (the node is still in
  // the document and something else, or nothing, has focus) forgets it; a removal does not.
  bar.addEventListener("focusin", (event) => { instance.lastFocus = event.target; });
  bar.addEventListener("focusout", (event) => {
    const node = event.target;
    queueMicrotask(() => {
      if (instance.lastFocus === node && node.isConnected && document.activeElement !== node) instance.lastFocus = null;
    });
  });

  Object.assign(instance, { bar, status, select, previous, next });
  return bar;
}

function render(instance) {
  const rows = dataRows(instance.table);
  const total = rows.length;
  const window_ = pageWindow(total, instance.size, instance.page);
  instance.page = window_.page;
  applyPageWindow(rows, window_.from, window_.to);

  /*
   * WHEN THE BAR IS THERE AT ALL. A control that can never do anything is noise, and
   * most of the estate's tables are short reference tables — four machines, three
   * agents. So: only when there is more than one page of rows to look at.
   *
   * The second clause is what stops that rule from being a trap. Pick 100 on a 30-row
   * table and the first clause alone would remove the very control that was just used,
   * with no way back to 20. While a non-default size is in force the bar stays.
   */
  const useful = total > instance.size || instance.size !== DEFAULT_PAGE_SIZE;
  instance.bar.hidden = !useful;
  if (!useful) return;

  instance.status.textContent = total ? `${window_.from + 1}–${window_.to} of ${total}` : "no rows";
  turnOff(instance.previous, window_.page <= 1);
  turnOff(instance.next, window_.page >= window_.pageCount);
}

/*
 * OFF IS `aria-disabled`, NEVER `disabled` (the X5 rule). Enter on "next" that reaches the last page
 * disables the very button that holds focus, and a `disabled` button throws focus to <body>: the
 * next Tab started from the top of the page. `aria-disabled` keeps it focusable, says it is off, and
 * the click handlers above ignore it.
 */
const off = (button) => button.getAttribute("aria-disabled") === "true";
function turnOff(button, on) {
  if (on && !off(button)) button.setAttribute("aria-disabled", "true");
  else if (!on && button.hasAttribute("aria-disabled")) button.removeAttribute("aria-disabled");
}

/*
 * A MOVED TABLE TAKES ITS PAGER WITH IT, and a removed one takes it out. The instance is the table
 * node's, so a page that appends the table (or its wrapper) somewhere else keeps its page and its size;
 * the bar is put back directly after the wrapper wherever that is now. A table taken out of the
 * document leaves no bar standing where it was, and gets it back if it is inserted again.
 *
 * A BAR TAKEN FROM A TABLE THAT STAYED comes back too (0.62.3). The bar is in no renderer's markup, so a
 * patcher that re-renders the table's whole mount (cockpit's `cockpitPatch` over cockpitTable's shell —
 * bar, wrapper, count) matches the count's markup against the bar, puts a fresh count in its place and
 * the pager was gone for good, its rows still paged with no way to turn the page. The same node goes
 * back, so the page, the size and the picker stay.
 *
 * AND THE FOCUS IN IT (0.62.4). A focused node taken out of the document drops focus to <body>, so a
 * reader on "next →" whose table was re-rendered by a poll found the next Tab starting from the top of
 * the page. The same node goes back, so the same control takes focus again, on the same page, without
 * scrolling. Only when focus was in the bar when it left and nothing has taken it since: a reader who
 * focused something else is never pulled back. A pager the patch left with one page is hidden and can
 * hold no focus; focus then stays where the browser put it.
 */
function rehome(instance) {
  const anchor = instance.table.closest(".tablewrap") || instance.table;
  if (!instance.table.isConnected || anchor.nextElementSibling === instance.bar) return;
  anchor.after(instance.bar);
  const node = instance.lastFocus;
  const lost = !document.activeElement || document.activeElement === document.body;
  if (!node || !lost || !instance.bar.contains(node)) return;
  node.focus({ preventScroll: true });
  if (document.activeElement !== node) instance.lastFocus = null;
}

function enhance(table) {
  const known = enhanced.get(table);
  if (known) {
    rehome(known);
    return;
  }

  const id = table.dataset.tableId;
  if (!id) {
    // Only worth saying when the omission cost something — see IDENTITY above.
    if (dataRows(table).length > DEFAULT_PAGE_SIZE) {
      console.warn(
        "[design] this table is long enough to paginate but has no data-table-id, so it is showing every row. " +
          "Add a stable data-table-id to page it and remember the reader's rows-per-page.",
        table,
      );
    }
    return;
  }

  const instance = { table, id, size: storedSize(id), page: 1 };
  enhanced.set(table, instance);
  buildBar(instance);
  owners.set(instance.bar, instance);

  // After the scroll wrapper, never inside it: `.tablewrap` scrolls horizontally, and a
  // pager parked in there slides out of reach on exactly the wide tables that need it.
  // `closest` because initTableScroll may not have run yet — and if it runs later it
  // wraps the <table> alone, so the bar stays put either way.
  const anchor = table.closest(".tablewrap") || table;
  anchor.after(instance.bar);

  /*
   * Rows change under us constantly: a filter keystroke, a 30s poll, a sort. childList
   * catches a re-render; the `hidden` attributeFilter catches an in-place patcher that
   * has stripped our own attribute off a row it kept (cockpit's dom-patch.js removes
   * any attribute the incoming markup lacks — correct in general, and this is the
   * exception, so it also exempts `hidden` on a <tr>). applyPageWindow() writes only
   * real changes, so this observer cannot be woken by its own output.
   *
   * WATCHING THE TABLE, NOT THE TBODY, and the difference is not caution. A renderer is
   * entitled to REPLACE the tbody rather than fill it — `tbody.outerHTML = …` is how
   * cockpit's docs page still repaints, and it swaps in a new node. An observer bound to
   * the old tbody would be left watching a detached element: the first paint would be
   * paged and every one after it silently unpaged. The table element survives that, and
   * `dataRows()` re-reads `tBodies[0]` on every render, so a swapped body is simply the
   * body now.
   */
  instance.observer = new MutationObserver(() => render(instance));
  instance.observer.observe(table, { childList: true, attributes: true, attributeFilter: ["hidden"], subtree: true });
  render(instance);
}

/**
 * Page every `<table data-table-id>` to 20 rows, and keep doing so for tables rendered
 * later.
 *
 * Filtering and sorting are none of this function's business and stay with whatever
 * already owns them — it slices the rows it finds, which are by definition the whole
 * set after that work has happened.
 *
 * @param {ParentNode} [root=document] Where to look for the initial pass.
 */
function initTablePagination(root = document) {
  // The `rows` picker is a <select> this module creates, so this module enhances it: every dropdown
  // list is the system's list, and a pager whose list opened in the operating system's menu because
  // its page never called initSelects() was the one exception. Idempotent, and its observer covers
  // every pager built later.
  initSelects();
  for (const table of root.querySelectorAll("table")) enhance(table);

  if (documentObserver) return;
  // Same reasoning as initSelects(): cockpit rebuilds whole panels out of innerHTML on
  // a poll, so a pager that only enhanced what existed at load would work until the
  // first refresh and then quietly stop.
  const tablesIn = (node) => (node.tagName === "TABLE" ? [node] : node.querySelectorAll("table"));
  documentObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        const owner = owners.get(node);
        if (owner) rehome(owner);
        for (const table of tablesIn(node)) {
          const gone = !table.isConnected && enhanced.get(table);
          // The bar leaves with its table, and so does what held focus in it: a reader on <body> when the table
          // returns may have clicked on nothing since, and is not pulled into the pager.
          if (gone) { gone.bar.remove(); gone.lastFocus = null; }
        }
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        for (const table of tablesIn(node)) enhance(table);
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
return { PAGE_SIZES, DEFAULT_PAGE_SIZE, pageWindow, normalizePageSize, applyPageWindow, initTablePagination };
};
//@dd-record pick deps= exports=initPickCells
records["pick"] = (__dd) => {
/*
 * pick.js — a press anywhere in a table's pick cell toggles its checkbox.
 *
 * Markup contract: the checkbox that selects a row sits bare in a `.pick` cell (data.css, D1):
 *
 *   <td class="pick"><input type="checkbox" aria-label="select poi/vu3 !3302"></td>
 *
 * Call `initPickCells()` once; it is one listener on the document, so rows rendered later need nothing.
 *
 * THE CELL IS THE TARGET, NOT THE BOX (the lead, 2026-09-28). A checkbox in a `.check` label grows
 * through the label, which is what a thumb hits. A table's checkbox has no label to grow through, and
 * growing the 14px box to 44px under a coarse pointer would put a 44px square in every row. So the box
 * stays 14px, data.css makes the CELL 44px under a coarse pointer, and this turns a press on the cell
 * into a click on its checkbox.
 *
 * A CLICK, NOT A FLIPPED PROPERTY. `box.click()` goes through the browser's own activation, so the
 * checkbox fires `input` and `change` exactly as it does when it is pressed itself, a disabled box stays
 * unchecked, and a page's own listeners cannot tell the two presses apart. A press that lands ON the box
 * (or on any other control in the cell) is that control's own business and is left alone — otherwise
 * the box would toggle twice and end where it started. Keyboard use is unchanged: the checkbox is still
 * the one focusable thing in the cell.
 */

const INTERACTIVE = "input, button, a[href], label, select, textarea, summary";

let installed = false;

/** Make every `.pick` cell a press target for its checkbox, now and for cells rendered later. */
function initPickCells() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const cell = target && target.closest("td.pick, th.pick");
    if (!cell) return;
    const control = target.closest(INTERACTIVE);
    if (control && cell.contains(control)) return;
    const box = cell.querySelector('input[type="checkbox"]');
    if (box) box.click();
  });
}
return { initPickCells };
};
//@dd-record popup deps= exports=positionPopup
records["popup"] = (__dd) => {
/*
 * popup.js — where a popup list goes: under its anchor, or over it when that is where the room is.
 *
 *   positionPopup(panel, anchor, { gap, edge, minWidth, align, side }) -> { side }
 *
 * ONE COPY OF THE GEOMETRY. select.js carried its own `position()` since 0.21.0; configr carried a
 * second in `useMenuPlacement`, and the context menu (M2) and the autocomplete list (M13) each need
 * the same answer again. The flip-and-clamp arithmetic is the kind that is wrong in a subtly
 * different way in every copy of it, so it lives here once and select.js imports it.
 *
 * `anchor` is an Element or a point `{ x, y }` in viewport coordinates — the same space as a
 * MouseEvent's clientX/clientY and getBoundingClientRect(). A context menu is opened by a pointer,
 * not by an element, and a pointer is a box with no size.
 *
 * What it writes, all inline on the panel, because the panel is out of the flow and nothing in a
 * stylesheet can know where its anchor is:
 *   position: fixed, left, top      — the placement
 *   min-inline-size                 — max(anchor width, minWidth): the list is never narrower than
 *                                     the control that opened it
 *   max-inline-size, max-block-size — the room the viewport actually leaves, minus `edge`
 *
 * The panel carries no position of its own in CSS (M0: `.select-panel` is `z-index: 60` and
 * nothing else about placement), so a framework can put the class on its own panel and position
 * it however its library does.
 */

// A list with no room at all still shows about three rows rather than collapsing to nothing. It
// then overhangs the viewport edge, which beats a 0px list nobody can use.
const MIN_ROOM = 72;

/*
 * Consumers can set `zoom` on <html>, and that puts the two halves of any positioning sum in
 * different coordinate spaces: getBoundingClientRect() and innerWidth/innerHeight are VISUAL px,
 * already multiplied, while style.left is a CSS length the browser multiplies AGAIN on the way out.
 * Writing a rect straight into a length therefore applies the zoom twice — an error that grows with
 * distance from the origin, which is how it survives review (it looks fine near the top left). Fixed
 * three times before in this runtime: tooltip.js, lsnav.js and select.js. Divide on the WRITE; never
 * "fix" a comparison whose operands are both already visual.
 */
const zoomOf = () => Number(getComputedStyle(document.documentElement).zoom) || 1;

/**
 * Place a popup list against an element or a point.
 *
 * @param {HTMLElement} panel The popup. Must already be in the document.
 * @param {Element | {x: number, y: number}} anchor What it opens from.
 * @param {object} [options]
 * @param {number} [options.gap=4]       Visual px between the anchor and the panel.
 * @param {number} [options.edge=8]      Keep the panel this far off every viewport edge.
 * @param {number} [options.minWidth=0]  A floor under the anchor's own width, in CSS px.
 * @param {"start"|"end"} [options.align="start"] "end" lines the panel's right edge up with the
 *   anchor's — a trigger at the end of a toolbar.
 * @param {"below"|"above"} [options.side] Keep this side instead of choosing one. For a panel that
 *   changes height while open (a list being filtered): re-choosing on every keystroke would jump
 *   the search box the reader is typing in from one side of the trigger to the other.
 * @returns {{side: "below"|"above"}}
 */
function positionPopup(panel, anchor, { gap = 4, edge = 8, minWidth = 0, align = "start", side } = {}) {
  const zoom = zoomOf();
  const point = !(anchor instanceof Element);
  const rect = point
    ? { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
    : anchor.getBoundingClientRect(); // visual px
  // offsetWidth is a LAYOUT length, already in the same space as the panel's own min-inline-size,
  // so it must NOT be divided. Mixing the two is the trap. (An SVG anchor has no offsetWidth.)
  const anchorWidth = point ? 0 : anchor.offsetWidth ?? rect.width / zoom;

  // Measuring clears max-block-size, and a list scrolled to its middle would come back at the top:
  // the scroll offset is clamped the moment the box grows to show everything. Kept and put back.
  const scrolled = panel.scrollTop;

  // PARK IT OFF-SCREEN TO MEASURE IT, NEVER AT THE VIEWPORT ORIGIN — the rule tooltip.js learned the
  // expensive way. The panel has to be measured UNCONSTRAINED (a fixed box with only `left` set gets
  // `viewport - left` of room, so measuring it where it last sat under-reports its width), and
  // parking it at `top: 0` drops it under a pointer that is mid-click: the compatibility mouse
  // events then resolve to an ancestor and no `click` is ever produced. Above the viewport it can be
  // under nothing, and a fixed box there creates no scrollable overflow.
  panel.style.position = "fixed";
  panel.style.left = "0px";
  panel.style.top = "-9999px";
  panel.style.minInlineSize = `${Math.max(anchorWidth, minWidth)}px`;
  panel.style.maxInlineSize = `${(window.innerWidth - edge * 2) / zoom}px`;
  panel.style.maxBlockSize = "";

  const below = window.innerHeight - rect.bottom - gap - edge;
  const above = rect.top - gap - edge;
  const wanted = panel.getBoundingClientRect().height;
  // Flip only when flipping actually helps. A long list near the bottom of a tall page has room in
  // neither direction, and flipping it there just moves the clipping to the other end.
  const up = side ? side === "above" : wanted > below && above > below;
  const room = Math.max(up ? above : below, MIN_ROOM);
  // The room is for the WHOLE box, and on a content-box panel max-block-size does not count its
  // padding and edges — so the clamp let them spill past the viewport edge by that much (6.8px on
  // 0.59.0's panel, measured: bottom at 698.8 of 700 when it promised 692). Subtracting what the
  // box model adds keeps the promise whatever box-sizing a framework's own panel uses.
  const style = getComputedStyle(panel);
  const frame = style.boxSizing === "border-box"
    ? 0
    : parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  if (wanted > room) panel.style.maxBlockSize = `${room / zoom - frame}px`;

  const box = panel.getBoundingClientRect(); // visual px, after the clamp
  const wantX = align === "end" ? rect.right - box.width : rect.left;
  const x = Math.min(Math.max(wantX, edge), Math.max(edge, window.innerWidth - box.width - edge));
  const y = up ? rect.top - gap - box.height : rect.bottom + gap;
  panel.style.left = `${x / zoom}px`;
  panel.style.top = `${y / zoom}px`;
  panel.scrollTop = scrolled;
  return { side: up ? "above" : "below" };
}
return { positionPopup };
};
//@dd-record rhythm deps= exports=STACKED_BLOCKS,findFlushBlocks,findMisplacedFilters
records["rhythm"] = (__dd) => {
/*
 * rhythm.js — find two stacked blocks that touch.
 *
 * base.css keeps .6rem above a block (a callout, a table's toolbar, a table, a code block…) when it
 * follows another block, as a sibling or across the unclassed mount <div>s a JS-painted page wraps
 * each block in (the STACKED BLOCKS rule). A rule cannot see every shape a page builds: a mount two
 * levels deep, a mount with a class, a flex column with no gap. So this is the check a page runs
 * against its own rendered DOM, in a browser check (cockpit's bin/cockpit-dom-check, the demos):
 *
 *   import { findFlushBlocks } from "@danieldeusing/design/runtime/rhythm";
 *   const flush = findFlushBlocks();   // [] when every stacked pair has air between them
 *
 * A pair is two blocks from STACKED_BLOCKS, both rendered, neither inside the other, overlapping
 * horizontally, with the lower one's top border edge within half a pixel of the upper one's bottom.
 *
 * TWO EXCEPTIONS, the same two the stylesheet makes: a fold after a fold (a run of folds is one list,
 * each fold drawing its own rule), and a lower block that carries `data-flush` — the page's word that
 * this one sits flush on purpose. Anything else a page wants flush says so with that attribute.
 * And one the stylesheet draws on purpose (0.62.1): a dialog's `.dialog-toolbar` over the first
 * drawn block of the `.dialog-body` that follows it (hidden elements in between do not count) — the
 * toolbar's rule is its edge and the body starts right under it (overlays.css). Only in a dialog: the
 * same toolbar markup anywhere else is judged like any other block, and so is a later block in the
 * body that ends up on the toolbar.
 *
 * findMisplacedFilters() is the same kind of check for Daniel's filter rule (0.62.0): "Filters, sort
 * and so on are always right aligned. Search input field always left aligned. Active filters have
 * colored text and there must be the 'x' icon to remove the filter (only not if one filter must
 * always be set)."
 *
 * Nothing runs at import, and nothing touches the DOM until it is called.
 */

/** The block-level components the rhythm rule spaces. base.css repeats this list; check-data asserts the two agree. */
const STACKED_BLOCKS = [
  ".callout", ".notice", ".fence", ".filter-bar", ".tablewrap", "table", "pre", ".code-block", ".cmd",
  ".legend", ".chart", ".tabs", "details.fold", ".card-grid", ".stat-grid", ".row-list", ".console",
];

const FLUSH_PAIRS = [["details.fold", "details.fold"]];

// Drawn, and seen: display none (and every hidden ancestor) is a zero box, visibility hidden is not.
const rendered = (el) => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

// The toolbar's own bottom rule is the edge between it and its dialog's body, so nothing goes between.
// Siblings that are not drawn (a hidden notice) do not separate them, and neither do hidden blocks at
// the top of the body: the body starts at its first block that is drawn.
const onItsDialogBody = (upper, lower, selector) => {
  if (!upper.matches(".dialog-toolbar") || !upper.closest("dialog, .dialog")) return false;
  let body = upper.nextElementSibling;
  while (body && !body.matches(".dialog-body") && !rendered(body)) body = body.nextElementSibling;
  return !!body?.matches(".dialog-body") && !![...body.querySelectorAll(selector)].find(rendered)?.contains(lower);
};

/**
 * Every pair of stacked blocks under `root` with no space between their border boxes.
 * Returns `[{ upper, lower, gap }]`; `gap` is the measured distance in px.
 */
function findFlushBlocks(root = document, { blocks = STACKED_BLOCKS, tolerance = 0.5 } = {}) {
  const boxes = [...root.querySelectorAll(blocks.join(","))]
    .map((el) => [el, el.getBoundingClientRect()])
    .filter(([el, box]) => box.height > 0 && getComputedStyle(el).visibility !== "hidden");
  const pairs = [];
  // ponytail: every block against every block, O(n²); a page with thousands of blocks would sort by top first.
  for (const [lower, below] of boxes) {
    if (lower.hasAttribute("data-flush")) continue;
    for (const [upper, above] of boxes) {
      if (upper === lower || upper.contains(lower) || lower.contains(upper)) continue;
      const gap = below.top - above.bottom;
      if (Math.abs(gap) > tolerance) continue;
      if (Math.min(above.right, below.right) - Math.max(above.left, below.left) <= 0) continue;
      if (FLUSH_PAIRS.some(([a, b]) => upper.matches(a) && lower.matches(b))) continue;
      if (onItsDialogBody(upper, lower, blocks.join(","))) continue;
      pairs.push({ upper, lower, gap });
    }
  }
  // A table ends where its .tablewrap ends: one touch, reported once, by the outermost blocks.
  return pairs.filter((p) => !pairs.some((q) => q !== p &&
    ((q.lower === p.lower && q.upper.contains(p.upper)) || (q.upper === p.upper && q.lower.contains(p.lower)))));
}

// An enhanced select is seen as its trigger, so what is judged is the .select-field the runtime drew
// (0.62.2): a hidden select with a drawn trigger is a picker on the screen.
const seen = (el) => rendered(el.parentElement?.matches(".select-field") ? el.parentElement : el);

const FILTER_CONTROLS = ".filter-dd, select[data-filter], .sort-ctl, .chip-set";
const SEARCH = '.search-field, input[type="search"]';
const SEARCH_WRAP = ".search-field, label, .filter-bar-lead";
const A_CONTROL = "input, select, textarea, button, .segmented, .chip-set, .sort-ctl, .filter-dd";
// A PLAIN wrapper — a <div> or <span> with no class and no role — is part of the search's chain when
// every element in it is that chain (its clear sits inside the .search-field) or a <label> of words
// with no control in it. Drawn or not: a result count that is empty on load and filled once data
// arrives must not change the verdict. Anything else is a container with a meaning of its own
// (.filter-bar, <search>, <form>, a cell, a dialog, a section, anything with a role) and ends the walk.
const plainWrapperOf = (wrapper, chain) => wrapper.matches("div, span") && !wrapper.classList.length && !wrapper.hasAttribute("role") &&
  [...wrapper.children].every((child) => child === chain || child.matches("template, script, style") ||
    (child.matches("label") && !child.querySelector(A_CONTROL)));
const BAR_LEAD = 'input[type="search"], .search-field, h2, h3, h4, h5, h6, .filter-bar-lead';

/**
 * Every filter control under `root` that breaks the filter rule, as `[{ element, reason }]`:
 *
 *   "outside-filter-bar"  a `.filter-dd`, a `select[data-filter]` the runtime has not wrapped, a
 *                         `.sort-ctl` or a `.chip-set` with no `.filter-bar` around it. A table
 *                         header (`th`) and a `.dropdown-panel` keep their own controls; a dialog
 *                         does not — its toolbar is a `.filter-bar` too. A `.chip-set` of
 *                         `.chip--remove` chips is a list of values, not a filter, and is not judged.
 *                         Also (0.62.1) a `.switch` or a `select` of any kind in a search's ROW with
 *                         no `.filter-bar` around it: the row is the element that lays the search out,
 *                         reached up through its `.search-field`, `<label>` or `.filter-bar-lead`, and
 *                         (0.62.2) through a plain `<div>` or `<span>` (no class, no role) that holds
 *                         nothing but that chain and `<label>`s of words, drawn or not (`<template>`,
 *                         `<script>`, `<style>` aside). Any other element ends the walk — a
 *                         `.filter-bar`, `<search>`, `<form>`, a cell, a `<dialog>`, a `<section>`, a
 *                         wrapper holding a count or a heading — and so does `root`. The control is a
 *                         child of that row or inside a `<label>` that is. A toggle or a picker beside
 *                         a search is a filter toolbar whether the page says so or not. Anywhere
 *                         else a `.switch`, a plain `select` or a `.segmented` is not judged: each is
 *                         a setting in a form as often as a filter.
 *   "toolbar-not-filter-bar"  a `.dialog-toolbar` holding a rendered search or filter control (a
 *                         `.filter-dd`, a `select`, a `.switch`, a `.segmented`, a `.chip-set`, a
 *                         `.sort-ctl`) outside a `.dropdown-panel`, that is not also a `.filter-bar`
 *                         (0.62.1). `element` is the toolbar.
 *   "lead-not-left"       a bar's lead (a search input or `.search-field`, a heading h2–h6, a
 *                         `.filter-bar-lead`) that is not in the run of leads a row starts with, or
 *                         the first lead of a row whose left edge is not the bar's left content edge.
 *                         Several leads in a row are fine (a prompt label, then the search).
 *   "controls-not-right"  on a visual row of a bar, the right-most control that is not the lead does
 *                         not end at the bar's right content edge. `element` is that control.
 *   "active-unmarked"     an optional `.filter-dd` (its select has an empty option) holding a value
 *                         whose trigger lacks `data-active="true"` or whose `.filter-clear` is not
 *                         shown: the page changed the value and the runtime never heard of it.
 *   "required-clearable"  a required `.filter-dd` (no empty option) whose `.filter-clear` is shown.
 *
 * Only what is rendered is judged, as in findFlushBlocks(): a control, a bar or a bar's child that
 * is `display: none` (itself or an ancestor, so a closed dialog), zero-sized or `visibility: hidden`
 * is skipped. An enhanced select counts as rendered when its `.select-field` is (0.62.2). Edges are border boxes, compared within `tolerance` px.
 */
function findMisplacedFilters(root = document, { tolerance = 1 } = {}) {
  const found = [];
  const report = (element, reason) => found.push({ element, reason });

  for (const el of root.querySelectorAll(FILTER_CONTROLS)) {
    if (el.matches("select") && el.closest(".filter-dd")) continue; // its .filter-dd answers for it
    if (!rendered(el) || el.closest(".filter-bar, th, .dropdown-panel") || el.matches(".chip-set:has(> .chip--remove)")) continue;
    report(el, "outside-filter-bar");
  }
  // A search's ROW: up from the search through what wraps it, to the element that lays it out.
  const rows = new Set();
  for (const search of root.querySelectorAll(SEARCH)) {
    if (!rendered(search)) continue;
    let node = search;
    for (let up = node.parentElement; up && up !== root && (up.matches(SEARCH_WRAP) || plainWrapperOf(up, node)); up = up.parentElement) node = up;
    if (node.parentElement) rows.add(node.parentElement);
  }
  // A switch or a plain select in that row, as a child of it or inside a <label> that is.
  const judged = new Set();
  for (const row of rows) {
    for (const el of row.querySelectorAll(".switch, select:not([data-filter])")) {
      let unit = el.parentElement?.matches(".select-field") ? el.parentElement : el; // what the runtime put in its place
      if (unit.parentElement !== row && unit.parentElement?.matches("label")) unit = unit.parentElement;
      if (unit.parentElement !== row || judged.has(el) || !seen(el) || el.closest(".filter-bar, th, .dropdown-panel")) continue;
      judged.add(el);
      report(el, "outside-filter-bar");
    }
  }
  const IN_TOOLBAR = `${SEARCH}, ${FILTER_CONTROLS}, select, .switch, .segmented`;
  for (const bar of root.querySelectorAll(".dialog-toolbar:not(.filter-bar)")) {
    if ([...bar.querySelectorAll(IN_TOOLBAR)].some((el) => seen(el) && !el.closest(".dropdown-panel"))) report(bar, "toolbar-not-filter-bar");
  }

  // ponytail: left-to-right only; an RTL bar would mirror both edges.
  for (const bar of root.querySelectorAll(".filter-bar")) {
    if (!rendered(bar)) continue;
    const box = bar.getBoundingClientRect();
    const style = getComputedStyle(bar);
    const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    // One visual row = children whose boxes overlap vertically (align-items centres them, so their
    // tops differ within a row); a row keeps its children in document order.
    const rows = [];
    for (const child of bar.children) {
      if (!rendered(child)) continue;
      const at = child.getBoundingClientRect();
      const row = rows.find((r) => at.top < r.bottom - tolerance && at.bottom > r.top + tolerance);
      if (row) {
        row.top = Math.min(row.top, at.top);
        row.bottom = Math.max(row.bottom, at.bottom);
        row.items.push([child, at]);
      } else rows.push({ top: at.top, bottom: at.bottom, items: [[child, at]] });
    }
    for (const { items } of rows) {
      let last = null;
      items.forEach(([child, at], i) => {
        if (!child.matches(BAR_LEAD)) {
          if (!last || at.right > last[1].right) last = [child, at];
        } else if (last || (i === 0 && Math.abs(at.left - left) > tolerance)) report(child, "lead-not-left");
      });
      if (last && Math.abs(last[1].right - right) > tolerance) report(last[0], "controls-not-right");
    }
  }

  for (const dd of root.querySelectorAll(".filter-dd")) {
    const select = dd.querySelector("select");
    if (!select || !rendered(dd)) continue;
    const clear = dd.querySelector(".filter-clear");
    const clearShown = !!clear && rendered(clear);
    if ([...select.options].some((o) => o.value === "")) {
      const marked = dd.querySelector(".select-trigger")?.getAttribute("data-active") === "true";
      if (select.value !== "" && (!marked || !clearShown)) report(dd, "active-unmarked");
    } else if (clearShown) report(dd, "required-clearable");
  }
  return found;
}
return { STACKED_BLOCKS, findFlushBlocks, findMisplacedFilters };
};
//@dd-record search deps= exports=initSearchFields,markPending
records["search"] = (__dd) => {
/*
 * search.js — the behaviour of a `.search-field`: its clear button, Escape, and the pending line.
 *
 * Markup contract (M4, references/filters.md):
 *
 *   <div class="search-field">
 *     <input type="search" aria-label="search skills" placeholder="search…" autocomplete="off" …>
 *     <button type="button" class="search-clear" aria-label="clear search" hidden></button>
 *   </div>
 *
 * The page owns the query — what it filters, when, and whether it debounces. This owns only the
 * three things every search box in the estate re-implemented, each slightly differently: seedr's
 * and configr's clear button, configr's debounce ring, and cockpit's boxes, which had neither and
 * an `outline: none` with nothing in its place.
 *
 * DELEGATED, so a field rendered after the call — a table's search built by initTableTools(), a
 * card list re-rendered from a fetch — works with no second call. One listener per event type on
 * the document, installed once, rather than one per field that would pile up for the life of a
 * page that re-renders.
 *
 * THE CLEAR IS A REAL EDIT. It sets the value and dispatches `input` then `change`, bubbling, from
 * the input — the two events a person clearing the box by hand would produce, in that order. A
 * page's own handler cannot tell the difference, which is the point: there is no second code path
 * for "cleared by the button" to drift from "cleared by typing".
 */

const pendingTimers = new WeakMap();
let installed = false;

const fieldOf = (element) => (element && element.closest ? element.closest(".search-field") : null);
const inputOf = (field) => field.querySelector(":scope > input");
const clearOf = (field) => field.querySelector(":scope > .search-clear");

/* The clear is there exactly when there is something to clear, and usable exactly when the box is.
   A disabled box can still hold a query — shown, so the reader sees what is in force, but not
   clearable: that would change the value of a control the page has switched off (as .filter-clear). */
function sync(field) {
  const input = inputOf(field);
  const clear = clearOf(field);
  if (!input || !clear) return;
  // Written only when it changes: a second initSearchFields() must not wake every attribute observer.
  if (clear.hidden !== !input.value) clear.hidden = !input.value;
  if (clear.disabled !== input.disabled) clear.disabled = input.disabled;
}

function settle(field) {
  clearTimeout(pendingTimers.get(field));
  pendingTimers.delete(field);
  field.removeAttribute("data-pending");
}

function clearField(field) {
  const input = inputOf(field);
  // `:disabled`, not `.disabled`: a box inside a disabled <fieldset> is off too.
  if (!input || input.matches(":disabled")) return;
  // A cleared box has nothing pending. Whatever the page was waiting to apply was
  // the query that has just been thrown away.
  settle(field);
  input.value = "";
  sync(field);
  // Focus goes back BEFORE the events go out, for select.js's reason: a handler may re-render the
  // field or move focus on purpose, and a focus() after it would undo that — or land on a node that
  // is no longer in the page.
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Wire every `.search-field` on the page, and every one rendered later.
 *
 * @param {ParentNode} [root=document] Where to look for fields that already hold a value, so their
 *   clear button shows without waiting for a keystroke (a search restored from a URL or a store).
 */
function initSearchFields(root = document) {
  for (const field of root.querySelectorAll(".search-field")) sync(field);
  if (installed) return;
  installed = true;

  document.addEventListener("input", (event) => {
    const field = fieldOf(event.target);
    if (field && event.target === inputOf(field)) sync(field);
  });
  // A box switched on or off after it was drawn takes its clear with it. No event reports that;
  // the attribute is the only signal.
  new MutationObserver((records) => {
    for (const { target } of records) {
      const field = fieldOf(target);
      if (field && target === inputOf(field)) sync(field);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["disabled"], subtree: true });

  // A press on the clear must not take focus from the box. If it did, the box would blur first —
  // and a blur on an edited box fires the browser's own `change` with the OLD query, so the page
  // would hear "abc" then "" for one press, and the ring would jump to the button and back.
  document.addEventListener("mousedown", (event) => {
    if (fieldOf(event.target.closest?.(".search-clear"))) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".search-clear");
    const field = fieldOf(button);
    if (field) clearField(field);
  });

  /*
   * ESCAPE CLEARS A FILLED BOX, AND ONLY A FILLED ONE. In an empty box it does nothing here, so it
   * falls through to whatever else Escape means on the page — closing the dialog or the dropdown
   * the box sits in. In a filled one it clears and goes NO further: the reader asked to undo the
   * query, not to lose the dialog.
   *
   * CAPTURE, on the document. A dialog or a `details.dropdown` listens on an ANCESTOR of the input,
   * so a bubbling listener up here would hear the key after they had already acted on it; capture is
   * the only phase that runs before them. preventDefault stops the UA's close-request as well — a
   * modal <dialog> closes on Escape without any page handler at all.
   *
   * Two boxes are not ours to clear. The search row inside a select's panel belongs to select.js,
   * where Escape closes the list. And a box that is an open autocomplete (`aria-expanded="true"`)
   * dismisses its list first — the APG combobox rule — so its Escape is the page's.
   */
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      const input = event.target;
      const field = fieldOf(input);
      if (!field || input !== inputOf(field) || !input.value) return;
      if (input.closest(".select-panel") || input.getAttribute("aria-expanded") === "true") return;
      event.preventDefault();
      event.stopPropagation();
      clearField(field);
    },
    true,
  );
}

/**
 * Show that a query is typed but not yet applied: a 1px line along the field's bottom edge that
 * drains over `ms`. Call it on every keystroke of a debounced search, with the debounce's own
 * delay; each call restarts the line, and it goes away `ms` after the LAST call — which is the
 * moment the page applies the query.
 *
 * Replaces configr's DebounceRing, a rounded SVG rect with a stroke dash animation, with a square
 * line drawn by the stylesheet (`.search-field[data-pending]::after`).
 *
 * @param {Element} field The `.search-field`, or anything inside it.
 * @param {number} [ms=1000] How long until the query applies.
 */
function markPending(field, ms = 1000) {
  const host = fieldOf(field);
  if (!host) return;
  clearTimeout(pendingTimers.get(host));
  host.style.setProperty("--pending-ms", `${ms}ms`);
  // A CSS animation restarts only if the style system sees it stop in between. Removing the
  // attribute and reading layout makes it do so; without the read, both writes land in one style
  // pass and the second call of a burst would leave the line wherever the first had drained it to.
  host.removeAttribute("data-pending");
  void host.offsetWidth;
  host.setAttribute("data-pending", "");
  pendingTimers.set(host, setTimeout(() => settle(host), ms));
}
return { initSearchFields, markPending };
};
//@dd-record select deps=popup exports=initSelects
records["select"] = (__dd) => {
/*
 * select.js — replaces the OPERATING SYSTEM's dropdown with the estate's own.
 *
 * Markup contract:
 *   <select>…</select>
 *
 * That is the whole contract. Like `initTableScroll()`, this takes plain HTML
 * and needs no classes, no wrapper and no data attributes. Call `initSelects()`
 * once; every `<select>` on the page is enhanced, and so is every one rendered
 * afterwards — cockpit rebuilds its config tables out of innerHTML on every
 * poll, so a widget that only enhanced what existed at load would work until
 * the first refresh and then quietly stop.
 *
 * WHY A REPLACEMENT AND NOT CSS. A `<select>`'s option list is painted by the
 * OS outside the document: rounded corners, a blue system highlight, the system
 * font. No stylesheet reaches it. Chrome 135+ can style it with
 * `appearance: base-select`, but Safari and Firefox cannot, and a fix that
 * lands on one browser leaves the estate disagreeing with ITSELF, which is
 * worse than being consistently wrong. So the list is rebuilt in the page.
 *
 * THE <select> STAYS AND STAYS AUTHORITATIVE. It is not cloned, mirrored or
 * replaced by hidden inputs: it remains the element that holds the value, that
 * a form submits, that `select.value` reads, and that emits `input`/`change`.
 * Page code sees exactly what it saw before — that is what let 28 call sites
 * adopt this without a single edit. It is laid transparently OVER the trigger
 * rather than `display: none`, because Chrome refuses to show a validation
 * bubble on an unfocusable control and then blocks the submit with no message
 * at all, which would silently break every `required` select.
 *
 * Keyboard follows the ARIA APG select-only combobox: Enter/Space/Arrow open,
 * Up/Down move, Home/End jump, printable characters type ahead (a repeated
 * character cycles, as a native select does), Enter selects, Escape closes
 * without changing anything, Tab moves on. Focus never leaves the trigger —
 * the active option is pointed at with `aria-activedescendant` — so there is
 * nowhere for it to get stuck. (A list with a search row opens as a DIALOG:
 * focus moves into its box, which carries the pointer while it is open, and
 * goes back to the trigger when it closes.)
 *
 * THERE IS NO OPT-OUT (0.60.0, Daniel: "A dropdown should ALWAYS have the custom
 * layout for the list, not the system one"). `data-select="off"` used to skip a
 * select; no surface used it, and an escape hatch nobody needs is the one the
 * next page reaches for when the enhanced list is inconvenient — which puts the
 * OS list back in front of the reader. `multiple` and `size > 1` stay native
 * because they are not dropdowns at all.
 *
 * Two opt-INs, each one attribute on the <select> (M5, references/filters.md):
 *   data-filter  a FILTER: the trigger names the facet while nothing is chosen
 *                and the value once something is, wears --primary while it
 *                filters, and a clear button is joined to it. The empty option
 *                is the "all" row at the top of the list.
 *   data-search  a search box above the list, on any select. A FILTER longer than
 *                twenty options gets one without asking — past that a filter is
 *                searched, not scanned (configr's FilterDropdown threshold). A
 *                plain select never does, however long: it keeps the listbox keys
 *                above, where a typed letter jumps and Space picks (C8).
 *
 * THE DOM IT BUILDS (the framework contract in references/filters.md names each):
 *   span.filter-dd.btn-group[role=group]      a filter only: the trigger + its clear
 *     span.select-field > select + button.select-trigger(.select-trigger--filter)
 *     button.filter-clear
 *   ul.select-panel[role=listbox]             the popup of a list with no search row
 *   div.select-panel[role=dialog]             the popup of a list WITH one (the trigger
 *     div.select-search > div.search-field      then says aria-haspopup="dialog"):
 *       > input[type=search][role=combobox]     the box, which owns the highlight
 *     ul.select-list[role=listbox]
 *     div.select-empty                        "no matches"
 *   li.select-option[role=option]             every row, with an .ico for data-icon
 *   div.select-optgroup[role=group]           an <optgroup>, named by its label,
 *     div.select-group[aria-hidden]             its visible heading, then its rows
 */

const { positionPopup } = __dd("popup");

const TYPEAHEAD_MS = 700;
const SEARCH_THRESHOLD = 20;

const enhanced = new WeakMap();
// The search boxes this runtime built — their input/change are stopped (installGlobals), no one else's.
const ownBoxes = new WeakSet();
let counter = 0;
let openInstance = null;
let documentObserver = null;
let globalsInstalled = false;

const optionsOf = (instance) => instance.select.options;
const label = (element) => (element.textContent || "").trim();
const isHidden = (select) => select.hasAttribute("hidden");
const indexOf = (item) => Number(item.dataset.index);
const searchable = (instance) =>
  instance.select.hasAttribute("data-search") ||
  (instance.filter && instance.select.options.length > SEARCH_THRESHOLD);

/*
 * THE ROWS A READER CAN REACH, IN THE ORDER THEY SEE THEM. Not `select.options`
 * order: a filter moves its "all" row to the top, and a panel search hides the
 * rows that do not match. The arrows, Home/End and typeahead all walk what is on
 * screen — walking the underlying options would move the highlight onto a row
 * the reader cannot see.
 */
const reachable = (instance) =>
  instance.panel
    ? [...instance.panel.querySelectorAll('.select-option:not([hidden]):not([aria-disabled="true"])')]
    : [];

const firstEnabled = (instance) => {
  const rows = reachable(instance);
  return rows.length ? indexOf(rows[0]) : -1;
};
const lastEnabled = (instance) => {
  const rows = reachable(instance);
  return rows.length ? indexOf(rows[rows.length - 1]) : -1;
};

/* A label's own words, without the control it wraps — a wrapping <label>'s
   textContent would otherwise read "source all seedr skills.sh". */
function ownText(element) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && !node.matches("select, .select-field, .filter-dd")) text += node.textContent;
  }
  return text.trim();
}

/*
 * What a filter is ABOUT — "source", "type" — found the three ways nameTrigger()
 * finds a label, in the platform's order, so a select the page already labels
 * correctly needs nothing more.
 */
function facetOf(select) {
  const explicit = select.getAttribute("aria-label");
  if (explicit) return explicit.trim();
  const ids = select.getAttribute("aria-labelledby");
  if (ids) {
    return ids.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(ownText).join(" ").trim();
  }
  const element =
    (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)) || select.closest("label");
  return element ? ownText(element) : "";
}

/* ── the closed control ─────────────────────────────────────────────────── */

/*
 * An <option data-icon="…"> shows its glyph wherever its label is shown: in its
 * row and, while it is the value, in the trigger (configr's option icons). The
 * glyph is the system's `.ico` mask, so it takes the row's colour on every theme.
 */
function syncIcon(instance, option) {
  const name = option ? option.dataset.icon : "";
  if (!name) {
    instance.icon?.remove();
    instance.icon = null;
    return;
  }
  if (!instance.icon) {
    instance.icon = document.createElement("span");
    instance.icon.className = "ico";
    instance.trigger.insertBefore(instance.icon, instance.value);
  }
  instance.icon.dataset.icon = name;
}

function syncTrigger(instance) {
  const { select, trigger, value } = instance;
  const option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
  trigger.disabled = select.disabled;
  // A select the page hides is a control the page hid: what the runtime drew for it goes too, the
  // whole .filter-dd with its clear for a filter (0.62.2; until then the trigger stayed on screen).
  // The ATTRIBUTE, either value: hidden="until-found" copied as itself would leave the group drawn.
  const drawn = instance.group || instance.field;
  if (drawn.hidden !== isHidden(select)) drawn.hidden = isHidden(select);
  // An invalid select must SAY so where the reader is looking. The select itself
  // is transparent and aria-hidden, so a red edge or an announcement pinned to it
  // reaches nobody; the trigger is the control now. The error's TEXT goes with it:
  // the `.field-error` the page ties to the select with aria-describedby is the
  // trigger's description too, since colour alone says nothing (WCAG 1.4.1).
  const invalid = select.getAttribute("aria-invalid");
  if (invalid === null) trigger.removeAttribute("aria-invalid");
  else if (trigger.getAttribute("aria-invalid") !== invalid) trigger.setAttribute("aria-invalid", invalid);
  // By TOKEN, never the whole list (the tooltip's rule): the select's ids replace the ones it gave
  // last time, and a token somebody else put on the trigger — the tip's `ddtip` while it shows —
  // stays. Copying the list wholesale dropped the tip's description on any change to the options.
  const tokens = (text) => (text ?? "").split(/\s+/).filter(Boolean);
  const own = tokens(select.getAttribute("aria-describedby"));
  const foreign = tokens(trigger.getAttribute("aria-describedby")).filter((id) => !(instance.describedBy || []).includes(id) && !own.includes(id));
  instance.describedBy = own;
  const describedBy = [...own, ...foreign].join(" ");
  if (!describedBy) trigger.removeAttribute("aria-describedby");
  else if (trigger.getAttribute("aria-describedby") !== describedBy) trigger.setAttribute("aria-describedby", describedBy);
  // A popup with a search row is a DIALOG (it holds a text box and a list); a
  // plain one is the listbox itself. Decided here, not once at enhance: the row
  // comes and goes with the option count, and the trigger must say which before
  // it opens.
  const dialog = searchable(instance);
  trigger.setAttribute("aria-haspopup", dialog ? "dialog" : "listbox");
  trigger.setAttribute("aria-controls", `${instance.id}-${dialog ? "panel" : "listbox"}`);
  syncIcon(instance, option);
  if (!instance.filter) {
    value.textContent = option ? label(option) : "";
    if (instance.wrapLabel) nameFromWrap(instance);
    return;
  }

  /*
   * A FILTER NAMES ITS FACET UNTIL IT FILTERS, THEN ITS VALUE (seedr and configr,
   * both): "source" at rest, "seedr" once a source is chosen. The trigger is the
   * place a reader looks to see what is in force, so it says the one thing that is.
   *
   * Only a select WITH an empty option can be "not filtering". A required picker —
   * cockpit's repository chart, configr's worktree — always has a value, so it
   * always shows it, never wears the active edge and never offers a clear: there is
   * nothing to go back to (configr conflict 20, corrected).
   */
  const facet = facetOf(select);
  const optional = [...select.options].some((o) => o.value === "");
  const active = optional && select.value !== "";
  const choice = option ? label(option) || (option.value === "" ? "all" : "") : "";
  value.textContent = active || !optional ? choice : facet;

  // State is never colour alone: the NAME carries the facet AND the value, so
  // "source filter: seedr" is what a screen reader hears, active or not.
  const name = facet ? `${facet} filter` : "filter";
  trigger.setAttribute("aria-label", `${name}: ${choice}`);
  instance.group.setAttribute("aria-label", name);
  instance.clear.setAttribute("aria-label", `clear ${name}`);
  if (active) trigger.setAttribute("data-active", "true");
  else trigger.removeAttribute("data-active");
  instance.clear.hidden = !active;
  // A disabled filter can still be filtering — and its clear would then change the value of a
  // control the page has switched off. It is shown (the state is still worth seeing), not usable.
  instance.clear.disabled = select.disabled;
}

/*
 * The trigger's accessible name is the LABEL, and the current value is the combobox's VALUE — "lines,
 * combobox, 200", which is what a native select announces and what the APG's select-only combobox
 * prescribes. Chromium already exposes the trigger's text as that value, so the value is not put in the
 * name as well: until 0.61.0 `aria-labelledby` named the label AND the trigger, and a reader heard
 * "lines 200" as the name and 200 again as the value.
 *
 * The label is found the same three ways the platform finds it, in the platform's order, so a page
 * that already labels its select correctly needs no change: an explicit aria-label, an explicit
 * aria-labelledby, then a <label> — associated by `for=` or by wrapping.
 *
 * A WRAPPING <label> IS NOT REFERENCED, IT IS READ. The trigger sits inside it, and a label's name is
 * computed from its content — which includes an embedded combobox's value. Referenced, it read
 * "wrapped x" as the name ("wrapped x x" with the trigger's own id beside it, the pager's "rows 20 20").
 * So the trigger is named with the label's own words, re-read on every sync.
 *
 * A filter is named in syncTrigger() instead: its name changes with its value.
 */
function nameFromWrap({ wrapLabel, trigger }) {
  const words = ownText(wrapLabel);
  if (trigger.getAttribute("aria-label") !== words) trigger.setAttribute("aria-label", words);
}

function nameTrigger(instance) {
  const { select, trigger } = instance;
  const explicit = select.getAttribute("aria-label");
  if (explicit) {
    trigger.setAttribute("aria-label", explicit);
    return;
  }
  let labelId = select.getAttribute("aria-labelledby");
  if (!labelId) {
    const element =
      (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)) ||
      select.closest("label");
    if (element && element.contains(trigger)) {
      instance.wrapLabel = element;
      nameFromWrap(instance);
      return;
    }
    if (element && !element.id && "ariaLabelledByElements" in trigger) {
      // The page's <label> is the page's: an id written onto it is an attribute its renderer never
      // draws, so a patcher matching by id could never find that label again — it rebuilt the rest
      // of the mount around a new one, and the trigger's aria-labelledby named a node that was gone.
      // Element reflection names the trigger by the node itself, and writes nothing on the label.
      trigger.ariaLabelledByElements = [element];
      return;
    }
    if (element) {
      if (!element.id) element.id = `${instance.id}-label`;
      labelId = element.id;
    }
  }
  if (labelId) trigger.setAttribute("aria-labelledby", labelId);
}

/*
 * A select that LEFT the wrapper built for it — page code re-parented it, or a
 * DOM patcher kept the node and rebuilt everything around it — is still known
 * here, and skipping it as known is what left it rendering as the OS list. Its
 * old wrapper goes (it would be a trigger for nothing), every listener the old
 * instance put on the select goes with it, and enhance() wraps it again.
 */
function retire(instance) {
  if (openInstance === instance) close(instance, false);
  instance.abort.abort();
  instance.observer.disconnect();
  (instance.group || instance.field).remove();
  enhanced.delete(instance.select);
}

function enhance(select) {
  const known = enhanced.get(select);
  if (known) {
    if (known.field.contains(select)) return;
    retire(known);
  }
  // `multiple` and `size > 1` are not popups — the platform renders them inline
  // and there is no OS menu to replace. Nothing else is skipped (see the header).
  if (select.multiple || select.size > 1) return;
  if (select.parentElement?.classList.contains("select-field")) return;
  if (!select.parentNode) return;

  counter += 1;
  const id = `dd-select-${counter}`;
  const isFilter = select.hasAttribute("data-filter");

  const field = document.createElement("span");
  field.className = "select-field";
  // A page sizes its control on the <select> (`style="max-width:18rem"`), and
  // once the select is out of the flow that sizing has nothing to act on. The
  // wrapper is what occupies the space now, so it takes the inline style. Copied,
  // not moved: the select's own style attribute is still the page's to read.
  // Through the CSSOM, never setAttribute("style"): under a `style-src 'self'`
  // policy the attribute write is refused (and reported), while an inline style
  // the policy already refused on the <select> is simply empty here.
  if (select.style.length) field.style.cssText = select.style.cssText;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = isFilter ? "select-trigger select-trigger--filter" : "select-trigger";
  trigger.id = `${id}-trigger`;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-expanded", "false");

  const value = document.createElement("span");
  value.className = "select-value";
  trigger.appendChild(value);

  // A tooltip anchored to a control nobody can hover is a tooltip that never
  // shows. Both flavours move to the visible element; the select keeps its copy
  // so page code that reads the attribute still finds it.
  for (const attribute of ["title", "data-tip"]) {
    const text = select.getAttribute(attribute);
    if (text !== null) trigger.setAttribute(attribute, text);
  }

  /*
   * A FILTER IS TWO CONTROLS IN ONE EDGE: the trigger and, while it filters, a
   * clear button joined to it (seedr's `-ml-px`, configr's `border-l-0`). Each
   * keeps its own tab stop and its own name; the group is what says they belong
   * together. The clear is always built and simply `hidden` while there is
   * nothing to clear, so a picker whose options change under it never has to
   * grow or lose a node.
   */
  let group = null;
  let clear = null;
  if (isFilter) {
    group = document.createElement("span");
    group.className = "filter-dd btn-group";
    group.setAttribute("role", "group");
    clear = document.createElement("button");
    clear.type = "button";
    clear.className = "filter-clear";
    clear.hidden = true;
    select.parentNode.insertBefore(group, select);
    group.append(field, clear);
  } else {
    select.parentNode.insertBefore(field, select);
  }
  field.appendChild(select);
  field.appendChild(trigger);
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");

  const instance = {
    select, field, trigger, value, id, group, clear, filter: isFilter,
    icon: null, panel: null, list: null, search: null, empty: null, side: undefined,
    items: [], active: -1, typed: "", typedAt: 0, abort: new AbortController(),
  };
  const { signal } = instance.abort;
  enhanced.set(select, instance);
  if (!isFilter) nameTrigger(instance);
  syncTrigger(instance);

  trigger.addEventListener("click", () => (instance.panel ? close(instance, true) : open(instance)));
  trigger.addEventListener("keydown", (event) => onKeydown(instance, event));
  clear?.addEventListener("click", () => {
    if (select.value === "") return;
    select.value = "";
    syncTrigger(instance);
    // The button just pressed is hidden now, and focus on a hidden button is
    // focus on nothing. Moved BEFORE the events go out, for commit()'s reason: a
    // `change` handler may re-render and detach all of this.
    trigger.focus();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Focus aimed at the hidden control — a <label> click, or page code calling
  // select.focus() — belongs to the one the reader can see.
  select.addEventListener("focus", () => trigger.focus(), { signal });
  // A page that sets the value itself and announces it the normal way is honoured.
  // Our own dispatch lands here too; re-syncing an already-synced trigger is a no-op.
  select.addEventListener("change", () => syncTrigger(instance), { signal });

  // Cockpit rewrites a select's options from fetched data — a new model list, a
  // new credential list, a filter column derived from the rows that just arrived.
  // Without this the trigger would keep showing the label of an option that is no
  // longer in the list, which reads as the page having lost the setting.
  instance.observer = new MutationObserver(() => {
    syncTrigger(instance);
    // A list left open over a control the page just hid would float over nothing.
    if (instance.panel && isHidden(select)) close(instance, false);
    if (instance.panel) {
      // The list changed under an open panel. Rebuild it rather than show a stale
      // one — and keep what the reader had typed into its search, which a poll
      // landing mid-word would otherwise throw away.
      const query = instance.search ? instance.search.value : "";
      const focused = instance.panel.contains(document.activeElement);
      close(instance, false);
      open(instance);
      if (query && instance.search) {
        instance.search.value = query;
        filterRows(instance);
      } else if (focused && !instance.search) {
        // The rebuilt list lost its search row (the options fell to twenty or fewer), so the box
        // that held focus is gone. The trigger takes it back, and with it the highlight.
        instance.trigger.focus();
      }
    }
  });
  instance.observer.observe(select, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled", "selected", "value", "label", "aria-invalid", "aria-describedby", "aria-label", "data-icon", "data-search"],
  });
}

/* ── the panel ──────────────────────────────────────────────────────────── */

function buildPanel(instance) {
  const { select } = instance;
  const facet = facetOf(select);
  const list = document.createElement("ul");
  list.id = `${instance.id}-listbox`;
  list.setAttribute("role", "listbox");
  if (facet) list.setAttribute("aria-label", facet);

  /*
   * THE SEARCH ROW (M5) SITS ABOVE THE LISTBOX, NOT IN IT: a listbox may own only
   * options and groups (0.60.0, lead ruling), and a text box inside one is read as
   * part of the list. So a list with a search row is a `div.select-panel` holding
   * the row, then the listbox, then the "no matches" line.
   *
   * AND THAT PANEL IS A DIALOG (lead ruling, the APG's combobox-with-dialog): it
   * holds a text box and a list, and focus moves into it. The box inside is the
   * combobox proper — it has to hold focus to be typed into — so it, not the
   * trigger, carries `aria-activedescendant` while the list is out, with
   * `aria-controls` naming the listbox those ids live in.
   */
  let panel = list;
  instance.search = null;
  instance.empty = null;
  if (searchable(instance)) {
    panel = document.createElement("div");
    panel.id = `${instance.id}-panel`;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", facet || "options");
    list.className = "select-list";
    const row = document.createElement("div");
    row.className = "select-search";
    const field = document.createElement("div");
    field.className = "search-field";
    const input = document.createElement("input");
    ownBoxes.add(input);
    input.type = "search";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-label", `search ${facet || "options"}`);
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("data-1p-ignore", "");
    // Its `input` and `change` are stopped, and the query filtered, in installGlobals().
    input.addEventListener("keydown", (event) => onSearchKeydown(instance, event));
    field.appendChild(input);
    row.appendChild(field);
    const empty = document.createElement("div");
    empty.className = "select-empty";
    empty.textContent = "no matches";
    empty.hidden = true;
    panel.append(row, list, empty);
    instance.search = input;
    instance.empty = empty;
  }
  panel.classList.add("select-panel");
  panel.tabIndex = -1;
  instance.list = list;

  instance.items = [];
  let index = 0;
  const addOption = (option) => {
    const item = document.createElement("li");
    item.className = "select-option";
    item.id = `${instance.id}-o${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === select.selectedIndex));
    if (option.disabled) item.setAttribute("aria-disabled", "true");
    // PER-OPTION TOOLTIPS, for the reason the trigger's own copy above states: a tooltip anchored
    // to a control nobody can hover never shows. The native option list is replaced by this panel,
    // so an `<option title="…">` was not merely styled differently — it was unreachable, and every
    // one written so far has been silently doing nothing.
    for (const attribute of ["title", "data-tip"]) {
      const text = option.getAttribute(attribute);
      if (text !== null) item.setAttribute(attribute, text);
    }
    if (option.dataset.icon) {
      const icon = document.createElement("span");
      icon.className = "ico";
      icon.dataset.icon = option.dataset.icon;
      item.appendChild(icon);
    }
    item.append(label(option));
    item.dataset.index = String(index);
    instance.items[index] = item;
    index += 1;
    return item;
  };

  // Walked child by child rather than over `select.options`, so an <optgroup>
  // keeps its heading. The walk order is document order, which is exactly the
  // order `select.options` flattens to — that is what keeps `data-index` a valid
  // index into the real control.
  //
  // An <optgroup> is a GROUP that holds its rows (the APG's grouped listbox), not
  // a heading row between them: a bare heading in the listbox is a row that is not
  // an option. A `div`, so it adds no list box of its own to lay out; the rows
  // inherit the list's `list-style: none`. The group is NAMED with the label as
  // written, and the visible heading is hidden from assistive technology: named
  // through `aria-labelledby` it came out "ANTHROPIC" — Chromium reads the heading
  // through its `text-transform` — and it would be read twice besides.
  for (const child of select.children) {
    if (child.tagName === "OPTGROUP") {
      const group = document.createElement("div");
      group.className = "select-optgroup";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", child.label);
      const heading = document.createElement("div");
      heading.className = "select-group";
      heading.setAttribute("aria-hidden", "true");
      heading.textContent = child.label;
      group.appendChild(heading);
      for (const option of child.children) {
        if (option.tagName === "OPTION") group.appendChild(addOption(option));
      }
      list.appendChild(group);
    } else if (child.tagName === "OPTION") {
      list.appendChild(addOption(child));
    }
  }

  /*
   * A FILTER'S "ALL" ROW COMES FIRST, whatever order the page wrote its options in
   * (seedr and configr both). It is the empty option, labelled "all" when the page
   * gave it no words, and it carries the ✓ exactly when nothing is filtered — the
   * reader can always see the way back to the whole list, and see that they are
   * on it.
   */
  if (instance.filter) {
    const all = instance.items.find((item) => select.options[indexOf(item)].value === "");
    if (all) {
      if (!label(all)) all.append("all");
      list.prepend(all);
    }
  }
  return panel;
}

/*
 * THE PANEL IS BUILT FRESH ON EVERY OPEN, from the select's options as they are
 * at that instant. That is not laziness about caching — it is the only way the
 * list cannot be stale, and staleness is the failure this widget is most likely
 * to have shipped: cockpit replaces a select's options from fetched data all the
 * time, and a snapshot taken at enhance time would show a model list from before
 * the last poll while the value underneath had moved on.
 */
function open(instance) {
  // A hidden select has no trigger on screen, so a list opened for it (a programmatic click) would
  // float over nothing.
  if (instance.select.disabled || isHidden(instance.select)) return;
  if (openInstance && openInstance !== instance) close(openInstance, false);

  const panel = buildPanel(instance);
  instance.panel = panel;
  // Appended to the nearest <dialog> when there is one: a modal dialog is in the
  // top layer and nothing outside it can paint above it, so a panel on <body>
  // would open behind the dialog that owns the select. Everywhere else <body> is
  // right — it escapes `.tablewrap`'s scroll clipping, which is where most of
  // cockpit's selects live.
  (instance.trigger.closest("dialog") || document.body).appendChild(panel);
  instance.trigger.setAttribute("aria-expanded", "true");
  openInstance = instance;

  // Options are never focusable; the panel is pointed at with
  // aria-activedescendant instead. preventDefault on mousedown is what keeps
  // focus where it is when an option is clicked. The search BOX is the one
  // exception — it is typed into, so a press on it must place the caret. Only the
  // box: a press on the row's padding, once let through as well, focused the panel
  // itself (it is tabindex=-1) and the next key went nowhere.
  panel.addEventListener("mousedown", (event) => {
    if (event.target !== instance.search) event.preventDefault();
  });
  panel.addEventListener("click", (event) => {
    const item = event.target.closest(".select-option");
    if (item) commit(instance, indexOf(item));
  });

  // PLACED BEFORE ANYTHING SCROLLS. setActive() calls scrollIntoView(), and since
  // 0.60.0 `.select-panel` has no `position` in CSS (M0) — until positionPopup()
  // makes it fixed it is an ordinary block at the end of <body>, and scrolling a
  // row of it into view would scroll the whole PAGE to the bottom.
  instance.side = positionPopup(panel, instance.trigger).side;
  const selected = instance.select.selectedIndex;
  setActive(instance, selected >= 0 && !instance.select.options[selected].disabled ? selected : firstEnabled(instance));
  instance.search?.focus({ preventScroll: true });
}

function close(instance, focusTrigger) {
  if (instance.panel) {
    instance.panel.remove();
    instance.panel = null;
  }
  instance.items = [];
  instance.list = null;
  instance.search = null;
  instance.empty = null;
  instance.active = -1;
  instance.typed = "";
  instance.trigger.setAttribute("aria-expanded", "false");
  instance.trigger.removeAttribute("aria-activedescendant");
  if (openInstance === instance) openInstance = null;
  if (focusTrigger) instance.trigger.focus();
}

function setActive(instance, index) {
  const previous = instance.items[instance.active];
  if (previous) previous.removeAttribute("data-active");
  instance.active = index;
  const item = instance.items[index];
  // The element that holds focus carries the pointer: the search box when the
  // popup is a dialog, the trigger when it is the listbox. Never both — the
  // trigger of a dialog points at the dialog, not into it.
  const pointer = instance.search || instance.trigger;
  if (!item) {
    pointer.removeAttribute("aria-activedescendant");
    return;
  }
  item.setAttribute("data-active", "true");
  pointer.setAttribute("aria-activedescendant", item.id);
  item.scrollIntoView({ block: "nearest" });
}

function commit(instance, index) {
  const option = optionsOf(instance)[index];
  if (!option || option.disabled) return; // a disabled option is not a choice; the list stays open
  const changed = instance.select.selectedIndex !== index;
  if (changed) {
    instance.select.selectedIndex = index;
    syncTrigger(instance);
  }
  // Closed BEFORE the events go out: a `change` handler here re-renders the table
  // this select lives in, so anything touching the instance afterwards would be
  // touching a detached node.
  close(instance, true);
  if (changed) {
    // A native select fires `input` and THEN `change`, and both bubble. Cockpit's
    // table filters listen for both on a container element, so dispatching only
    // `change` would make this a quieter control than the one it replaced.
    instance.select.dispatchEvent(new Event("input", { bubbles: true }));
    instance.select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/*
 * Typing in the search row narrows the list to the options whose label contains
 * the text, case-insensitively. The "all" row answers no query — a reader typing
 * "sk" is looking for skills, not for the way out — so it steps aside while
 * anything is typed, as configr's does.
 *
 * The side the panel opened on is KEPT: re-choosing it as the list shrinks would
 * jump the box being typed into from one side of the trigger to the other.
 */
function filterRows(instance) {
  const { panel, select } = instance;
  const query = instance.search.value.trim().toLowerCase();
  let shown = 0;
  for (const item of instance.items) {
    const isAll = instance.filter && select.options[indexOf(item)].value === "";
    const hit = !query || (!isAll && label(item).toLowerCase().includes(query));
    item.hidden = !hit;
    if (hit) shown += 1;
  }
  for (const group of instance.list.querySelectorAll(".select-optgroup")) {
    group.hidden = !group.querySelector(".select-option:not([hidden])");
  }
  instance.empty.hidden = shown > 0;
  // ONCE ANYTHING IS TYPED, THE FIRST MATCH IS THE HIGHLIGHT (the APG's list
  // autocomplete), even when the value in force matches too — so "type, Enter"
  // picks what the reader narrowed to, never the value they already had. With the
  // box emptied again the list is as it opened: on the value in force.
  const selected = instance.items[select.selectedIndex];
  const keep = !query && selected && !selected.hidden && selected.getAttribute("aria-disabled") !== "true";
  setActive(instance, keep ? select.selectedIndex : firstEnabled(instance));
  positionPopup(panel, instance.trigger, { side: instance.side });
}

/* ── keyboard ───────────────────────────────────────────────────────────── */

const isPrintable = (event) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

function step(instance, direction) {
  const rows = reachable(instance);
  if (!rows.length) return;
  const at = rows.findIndex((row) => indexOf(row) === instance.active);
  const next = at === -1 ? rows[direction > 0 ? 0 : rows.length - 1] : rows[at + direction];
  if (next) setActive(instance, indexOf(next));
}

function typeahead(instance, character) {
  const now = Date.now();
  if (now - instance.typedAt > TYPEAHEAD_MS) instance.typed = "";
  instance.typedAt = now;
  instance.typed += character.toLowerCase();

  // One character repeated CYCLES through the options starting with it, which is
  // what a native select does — pressing "c" three times walks three c-options
  // rather than hunting for "ccc".
  const repeated = instance.typed.length > 1 && new Set(instance.typed).size === 1;
  const needle = repeated ? instance.typed[0] : instance.typed;
  const advance = repeated || instance.typed.length === 1;
  const rows = reachable(instance);
  const at = rows.findIndex((row) => indexOf(row) === instance.active);
  const from = advance ? at + 1 : Math.max(at, 0);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[(from + i) % rows.length];
    if (label(row).toLowerCase().startsWith(needle)) {
      setActive(instance, indexOf(row));
      return;
    }
  }
}

function onKeydown(instance, event) {
  const isOpen = Boolean(instance.panel);
  const key = event.key;

  if (key === "Escape") {
    if (!isOpen) return;
    // BOTH, and both matter. preventDefault stops the UA's close-request, and
    // stopPropagation stops the page's own handler: without them, dismissing this
    // list inside a modal <dialog> closes the dialog as well, losing the form.
    event.preventDefault();
    event.stopPropagation();
    close(instance, true);
    return;
  }
  if (key === "Tab") {
    if (isOpen) close(instance, false); // Tab moves on and commits nothing
    return;
  }

  if (!isOpen) {
    if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault();
      open(instance);
      if (key === "Home") setActive(instance, firstEnabled(instance));
      else if (key === "End") setActive(instance, lastEnabled(instance));
      return;
    }
    if (isPrintable(event)) {
      event.preventDefault();
      open(instance);
      // A list with a search row takes the keystroke AS the search: it is the
      // first letter of what the reader is looking for, not a lost key.
      if (instance.search) {
        instance.search.value = key;
        filterRows(instance);
      } else {
        typeahead(instance, key);
      }
    }
    return;
  }

  // A space CONTINUES a live typeahead rather than selecting — option labels here
  // contain spaces ("public — posts on the PR"), so treating it as Enter would
  // make half of them untypeable.
  if (key === " " && instance.typed && Date.now() - instance.typedAt <= TYPEAHEAD_MS) {
    event.preventDefault();
    typeahead(instance, key);
    return;
  }
  switch (key) {
    case "Enter":
    case " ":
      event.preventDefault();
      commit(instance, instance.active);
      return;
    case "ArrowDown":
      event.preventDefault();
      step(instance, 1);
      return;
    case "ArrowUp":
      event.preventDefault();
      step(instance, -1);
      return;
    case "Home":
      event.preventDefault();
      setActive(instance, firstEnabled(instance));
      return;
    case "End":
      event.preventDefault();
      setActive(instance, lastEnabled(instance));
      return;
    default:
      if (isPrintable(event)) {
        event.preventDefault();
        typeahead(instance, key);
      }
  }
}

/*
 * The search row's keys. Home and End are left to the text box — they move the
 * caret there, and a reader editing a query expects exactly that.
 */
function onSearchKeydown(instance, event) {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      step(instance, 1);
      return;
    case "ArrowUp":
      event.preventDefault();
      step(instance, -1);
      return;
    case "Enter":
      event.preventDefault();
      if (instance.active >= 0) commit(instance, instance.active);
      return;
    case "Escape":
      // Same pair as the trigger's, for the same reason: inside a <dialog> the
      // Escape that closes this list must not close the dialog too.
      event.preventDefault();
      event.stopPropagation();
      close(instance, true);
      return;
    case "Tab":
      // Focus goes back to the trigger and the Tab itself then moves on FROM there.
      // Left alone it would move on from the search box — which sits at the end of
      // <body> — and throw the reader to the bottom of the page.
      close(instance, true);
      return;
  }
}

/* ── document-level wiring, installed once ──────────────────────────────── */

function installGlobals() {
  if (globalsInstalled) return;
  globalsInstalled = true;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!openInstance) return;
      const target = event.target;
      if (openInstance.panel.contains(target) || openInstance.field.contains(target)) return;
      close(openInstance, false);
    },
    true,
  );
  document.addEventListener("focusin", (event) => {
    if (!openInstance) return;
    if (openInstance.field.contains(event.target) || openInstance.panel.contains(event.target)) return;
    close(openInstance, false);
  });
  // THE SEARCH BOX IS THE LIST'S OWN MACHINERY, and its events are not the page's: a page listening
  // for `input`/`change` would hear every keystroke of the query, and the `change` the browser fires
  // as the edited box blurs or leaves the page, carrying the query as if it were a value. The
  // <select> announces the pick; nothing else should. Stopped on the WINDOW, in capture: stopped on
  // the box, they still reached every capturing listener on the document. So the box's own filtering
  // runs here too — once stopped, the event reaches no listener on the box.
  // Only the boxes buildPanel() made, known by identity: a page or framework that renders the same
  // classes (filters.md's contract) owns its box, and its events are its own.
  // ponytail: stopImmediatePropagation on the window, in capture, is as early as a script can stand;
  // a window-capture listener the page registered BEFORE initSelects() still hears them.
  for (const type of ["input", "change"]) {
    addEventListener(type, (event) => {
      if (!ownBoxes.has(event.target)) return;
      event.stopImmediatePropagation();
      if (type === "input" && openInstance && event.target === openInstance.search) filterRows(openInstance);
    }, true);
  }
  // The trigger moves when the page or a scroll container moves under it. Capture,
  // because most of these selects sit in a `.tablewrap` that scrolls on its own and
  // a scroll event there does not bubble. A list scrolling ITSELF moves nothing,
  // and re-placing it would re-measure it mid-scroll, so its own scrolls are skipped.
  const reposition = (event) => {
    if (!openInstance) return;
    if (event.type === "scroll" && openInstance.panel.contains(event.target)) return;
    openInstance.side = positionPopup(openInstance.panel, openInstance.trigger).side;
  };
  addEventListener("resize", reposition);
  addEventListener("scroll", reposition, true);
  // form.reset() rewinds selectedIndex without firing an event or touching the DOM,
  // so nothing else here would notice. One delegated listener rather than one per
  // select: these selects are re-created on every render and the <form> is not, so
  // per-select listeners would pile up on it for the life of the page.
  document.addEventListener("reset", (event) => {
    const form = event.target;
    queueMicrotask(() => {
      for (const select of form.querySelectorAll?.("select") ?? []) {
        const instance = enhanced.get(select);
        if (instance) syncTrigger(instance);
      }
    });
  });
}

/**
 * Replace every native `<select>` dropdown on the page with the design system's
 * own, and keep doing so for selects rendered later.
 *
 * @param {ParentNode} [root=document] Where to look for the initial pass.
 */
function initSelects(root = document) {
  installGlobals();
  for (const select of root.querySelectorAll("select")) enhance(select);

  if (documentObserver) return;
  documentObserver = new MutationObserver((records) => {
    // A re-render can take the open panel's trigger out of the document from
    // underneath it — a background poll rewriting the table it sits in. The panel
    // is on <body>, so it would be left floating over a control that no longer
    // exists.
    if (openInstance && !openInstance.trigger.isConnected) close(openInstance, false);
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "SELECT") enhance(node);
        else for (const select of node.querySelectorAll("select")) enhance(select);
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
return { initSelects };
};
//@dd-record sort deps= exports=initSortControls
records["sort"] = (__dd) => {
/*
 * sort.js — `.sort-ctl`: a direction toggle joined to a field picker (M6, references/filters.md).
 *
 *   <div class="sort-ctl btn-group" role="group" aria-label="sort">
 *     <button type="button" class="sort-dir" data-dir="asc" aria-label="sort descending"></button>
 *     <select data-sort aria-label="sort by">…</select>
 *   </div>
 *
 * seedr and configr drew the same control in both apps: an arrow button that flips the order,
 * then the field. The select is an ordinary `<select>` — initSelects() gives it the system's list
 * — so this module owns only the arrow and the one event a page listens for.
 *
 * `sortchange` fires on the `.sort-ctl`, bubbling, with `detail: { field, dir }`, when either half
 * changes. The page sorts its own list: this cannot know what "updated" means in its data, and the
 * page may want to reset the direction when the field changes (configr puts `updated` newest
 * first). Setting `data-dir` from that handler is enough — the label follows on its own.
 *
 * Delegated, so a control rendered later needs no second call.
 */

let installed = false;

/*
 * THE BUTTON IS NAMED BY WHAT PRESSING IT WILL DO, not by the state it shows (seedr and configr,
 * both): an ascending list's button says "sort descending". The arrow already shows the state;
 * a name repeating it would leave a screen-reader user guessing what the press does.
 */
const syncLabel = (button) => {
  const label = button.dataset.dir === "desc" ? "sort ascending" : "sort descending";
  if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
};

function announce(control) {
  const button = control.querySelector(".sort-dir");
  const select = control.querySelector("select[data-sort]");
  control.dispatchEvent(new CustomEvent("sortchange", {
    bubbles: true,
    detail: { field: select ? select.value : "", dir: button && button.dataset.dir === "desc" ? "desc" : "asc" },
  }));
}

/**
 * Wire every `.sort-ctl` on the page, and every one rendered later.
 *
 * @param {ParentNode} [root=document] Where to look for controls whose label should be brought in
 *   line with their `data-dir` right away.
 */
function initSortControls(root = document) {
  for (const button of root.querySelectorAll(".sort-ctl .sort-dir")) syncLabel(button);
  if (installed) return;
  installed = true;

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".sort-dir");
    const control = button && button.closest(".sort-ctl");
    if (!control) return;
    button.dataset.dir = button.dataset.dir === "desc" ? "asc" : "desc";
    syncLabel(button);
    announce(control);
  });

  // `change`, not `input`: select.js fires both for one pick, and one pick is one re-sort.
  document.addEventListener("change", (event) => {
    const control = event.target.matches?.("select[data-sort]") && event.target.closest(".sort-ctl");
    if (control) announce(control);
  });

  /*
   * THE LABEL IS DERIVED FROM `data-dir`, WHOEVER WRITES IT. A page resetting the direction from
   * its `sortchange` handler writes the attribute and nothing else — and a label left behind would
   * then announce the opposite of what the button does. Watching the one attribute costs nothing
   * on a page that never changes it.
   */
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target.matches(".sort-ctl .sort-dir")) syncLabel(record.target);
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-dir"] });
}
return { initSortControls };
};
//@dd-record tablescroll deps= exports=initTableScroll
records["tablescroll"] = (__dd) => {
/*
 * tablescroll.js — no table may push the page sideways.
 *
 * A wide table is the single most common way a page starts scrolling horizontally as a
 * WHOLE, which is the one layout failure that makes a site feel broken: the header slides
 * away, the fixed footer stops reaching the edge, and every line of body text now needs
 * two-axis scrolling to read. The table is the thing that is too wide, so the table is the
 * thing that should scroll.
 *
 * CSS cannot do this alone. `overflow-x: auto` has to sit on an element that WRAPS the
 * table, and a table cannot wrap itself — `display: block` on a <table> does technically
 * make it scrollable and also throws away the table layout algorithm, so columns stop
 * aligning across rows. There is no selector for "my parent". Hence a runtime.
 *
 * Which means the markup contract is: nothing. Author a plain <table>. This gives every
 * table that does not already have one a .tablewrap parent (chrome.css styles it: overflow-x
 * plus a fade on the right edge that says "there is more over here"). Pages that already
 * hand-wrapped their tables are left exactly as they are, so adopting this is never a
 * migration.
 *
 *   import { initTableScroll } from "@danieldeusing/design/runtime";
 *   initTableScroll();
 *
 * AND IT KEEPS WRAPPING (0.23.0). Until then this was a single walk of the document at call
 * time, which is correct for a table that is in the markup and useless for one that arrives
 * from a fetch — and a dashboard's tables all arrive from a fetch. Cockpit called this from a
 * deferred module on page load, so it ran while every mount still said `loading…`: the walk
 * found nothing, the tables appeared a moment later unwrapped, and they stayed that way for
 * the life of the page. The static pages worked, which is exactly why nobody noticed — the
 * capability was in the estate for sixteen releases and did not reach the tables that are
 * actually too wide.
 *
 * A MutationObserver closes that, the same way `initSelects` and `initTablePagination`
 * already do, and for the same reason those needed one: cockpit does not mutate its panels,
 * it rebuilds them out of innerHTML on every poll, so an enhancement that only sees what
 * existed at load works until the first refresh and then quietly stops.
 *
 * ONE THING A HOST PAGE HAS TO KNOW, and it is the whole reason this was not always an
 * observer: a wrapper inserted by a runtime is a node the page's own renderer never wrote.
 * A reconciler that diffs new markup against the live DOM — cockpit's `dom-patch.js` — sees
 * a <div> where its markup says <table>, and its ordinary answer is to replace it, which
 * throws the table away on every poll and re-wraps a new one. That is worse than not
 * wrapping at all. A reconciler must therefore treat `.tablewrap` as standing in for the
 * table inside it; cockpit's patcher does, alongside the two exemptions it already carries
 * (`open` on a <details>, `hidden` on a <tr>) and for the identical reason — the renderer
 * does not own this. A page that assigns `innerHTML` outright needs no such thing.
 *
 * AND IT MEASURES (0.43.0), because the affordance was a constant, and a constant carries no
 * information. `.tablewrap::after` painted a right-edge fade on EVERY table whether or not there
 * was anything past the edge — so a table that could not scroll looked exactly like one that
 * could, and a reader who tried it and got nothing learnt that the fade means nothing. Measured
 * on cockpit's /automation/review: the 11-column activity table overflowed by 41px and the
 * 5-column ticker strip directly above it by zero, and the two were indistinguishable. Daniel
 * had not found the `links` column at all — it is the last one.
 *
 * The fades are now driven by `data-scroll` on the wrapper, one of:
 *
 *   none    nothing is hidden — no fade at all, which is the case this whole change exists for
 *   start   there is more to the RIGHT (the initial state of a table that overflows)
 *   middle  there is more in BOTH directions — the case a right-only fade could never express
 *   end     there is more to the LEFT
 *
 * `middle` is the state that made this worth doing: scrolled halfway, the old fade still said
 * "more over here" on the right and said nothing at all about the columns now hidden behind the
 * left edge. chrome.css owns which fade each state paints.
 *
 * This has to be JS. `container-type: scroll-state` answers it in CSS and is Chrome-only, and a
 * fix that lands on one engine leaves the estate disagreeing with itself — the same reason
 * `appearance: base-select` was refused.
 */

const WRAP_CLASS = "tablewrap";
// A property, not an attribute or a class: a reconciler that diffs its own markup against the live
// DOM would see a mark its markup does not carry. cockpit rebuilds these panels on every poll.
const WATCHED = Symbol("tablewrap-watched");

let documentObserver = null;

function wrap(table) {
  // Already handled, either by an earlier pass or by hand in the markup. closest() rather
  // than checking parentElement: a page is free to put its table inside a figure inside the
  // wrapper, and that is still wrapped. This is also what stops the observer waking on its
  // own output — the wrap below is a mutation, and the pass it triggers must find nothing.
  if (table.closest(`.${WRAP_CLASS}`)) return;

  const wrapper = document.createElement("div");
  wrapper.className = WRAP_CLASS;
  // The table stays exactly where it was in the document; only a div appears around it.
  // replaceWith + appendChild rather than innerHTML, so event listeners already bound to
  // rows survive — sortable headers and row menus are common on these pages.
  table.replaceWith(wrapper);
  wrapper.appendChild(table);
  watch(wrapper);
}

/**
 * Write the wrapper's scroll state onto it, so chrome.css can paint the fades that are true.
 *
 * The 1px tolerances are not defensive padding. `scrollWidth` and `clientWidth` are integers
 * rounded from fractional layout, so a table that fits exactly can report a scrollWidth one
 * larger than its clientWidth — and a fade on a table nobody can scroll is the exact defect
 * being removed here.
 */
function measure(wrapper) {
  // A wrapper with no layout box has not been measured, it has been GUESSED at. Tables routinely
  // render into a hidden tab panel — cockpit's do — where every dimension reads 0 and the naive
  // arithmetic below concludes "nothing to scroll", which is the one verdict this whole change
  // exists to stop a table from asserting without evidence. Leaving the attribute unset paints
  // nothing (chrome.css keys every fade off a value) and, unlike "none", records no claim; the
  // ResizeObserver in watch() fires the moment the panel is shown and the real state lands then.
  if (!wrapper.clientWidth) {
    delete wrapper.dataset.scroll;
    return;
  }
  const hidden = wrapper.scrollWidth - wrapper.clientWidth;
  if (hidden <= 1) {
    wrapper.dataset.scroll = "none";
    return;
  }
  const atStart = wrapper.scrollLeft <= 1;
  const atEnd = wrapper.scrollLeft >= hidden - 1;
  wrapper.dataset.scroll = atStart ? "start" : atEnd ? "end" : "middle";
}

/**
 * Keep one wrapper's state current. Three things change it and all three are needed: scrolling
 * it, resizing it, and the table inside it changing shape — a column filter that drops rows can
 * take the widest cell with it, and a table that no longer overflows must stop claiming it does.
 */
function watch(wrapper) {
  if (wrapper[WATCHED]) return;
  wrapper[WATCHED] = true;
  measure(wrapper);
  wrapper.addEventListener("scroll", () => measure(wrapper), { passive: true });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => measure(wrapper));
    observer.observe(wrapper);
    const table = wrapper.querySelector("table");
    if (table) observer.observe(table);
  }
}

/**
 * Give every `<table>` a scroll container, and keep doing so for tables rendered later.
 *
 * @param {ParentNode} [root=document] Where to look for the initial pass — useful after
 *   re-rendering one panel rather than the whole page. The observer that follows is always
 *   document-wide and is installed once, however many times this is called.
 */
function initTableScroll(root = document) {
  for (const table of root.querySelectorAll("table")) wrap(table);
  // Hand-wrapped tables never go through wrap(), and there are plenty — a page is free to write
  // its own `<div class="tablewrap">` and wrap() deliberately leaves it alone. Without this they
  // would keep the old always-on fade while every other table on the page told the truth.
  for (const wrapper of root.querySelectorAll(`.${WRAP_CLASS}`)) watch(wrapper);

  if (documentObserver) return;
  documentObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "TABLE") wrap(node);
        else {
          for (const table of node.querySelectorAll("table")) wrap(table);
          if (node.classList.contains(WRAP_CLASS)) watch(node);
          for (const wrapper of node.querySelectorAll(`.${WRAP_CLASS}`)) watch(wrapper);
        }
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
return { initTableScroll };
};
//@dd-record tabletools deps=popup,search exports=applyTableView,resetTableView,initTableTools
records["tabletools"] = (__dd) => {
/*
 * danieldeusing-design — a table's search, its per-column filters and its sort.
 *
 * Every table in the estate had been growing these by hand. cockpit's own
 * `table-view.js` opens by explaining that `cockpitTable` "is copied into four
 * pages and has drifted into three generations"; the family contacts table grew
 * a row of bare filter boxes because nothing said what a table should look like.
 * Consolidating inside one surface fixed it for that surface. This is the same
 * move one level up, and the storage key is deliberately cockpit's own
 * (`table-view:<id>`) so a reader's saved views survive the migration.
 *
 * ── THE ICONS LIVE IN THE HEADER, THE SEARCH LIVES ON TOP ─────────────────────
 *
 * A row of text boxes under the header (`tr.filters`) spends a whole row of
 * vertical space announcing a capability that is idle on most visits, and it
 * reads as a form to fill in. Two small controls in the `<th>` cost nothing when
 * unused and sit on the column they act on. The filter opens a `<details
 * class="dropdown">` — the system's existing dropdown, so one-open, click-away
 * and Escape are already handled by initDropdowns() and are not reimplemented.
 *
 * ── COMPOSING WITH THE PAGER, WHICH ALSO OWNS `hidden` ────────────────────────
 *
 * runtime/pagination.js pages a table by setting `hidden` on the rows outside
 * the window. If filtering ALSO used `hidden` the two would overwrite each
 * other: the pager clears `hidden` on the first twenty rows in the tbody, which
 * would include rows the filter had just excluded.
 *
 * So a filtered-out row is DETACHED from the tbody and held here, and the tbody
 * is left containing exactly the matching rows in sort order. The pager then
 * sees the set it is documented to expect — "filter and sort produce the rows,
 * the pager slices them" — and needs no knowledge of this file. Its
 * MutationObserver notices the childList change and re-pages on its own.
 *
 * Detaching rather than hiding also means `:nth-child` striping and the pager's
 * own counts are honest without either of them having to know a filter exists.
 *
 * ── NORMALISE AGAINST TODAY'S COLUMNS ─────────────────────────────────────────
 *
 * Inherited from cockpit's engine, and the reason it is not a detail:
 * localStorage outlives the code. A stored sortKey naming a column that has
 * since been renamed would reach an undefined column and throw where the table
 * should be. Unknown keys are dropped, and a direction only survives WITH the
 * column it sorted — applying a remembered direction to a different column hands
 * back a view the reader never chose.
 *
 * ── THE SEARCH BOXES ARE THE SYSTEM'S (0.60.0) ───────────────────────────────
 *
 * The box above the table and the text box inside a column's filter are both a
 * `.search-field` — magnifier, a named clear button, Escape to clear — in a
 * `<search class="filter-bar">`. They used to be `.tbl-search` and
 * `.tbl-filter-input`: two more bespoke boxes on a `--border` edge that missed
 * WCAG's 3:1 for a control, with no clear button, beside the page's own search
 * boxes that had one. search.js owns the clear and Escape; this file only keeps
 * the clear's `hidden` in step when IT writes a value (a restored view, a reset),
 * because a value set from code fires no `input` for search.js to hear.
 *
 * ── WHAT COCKPIT'S ENGINE KNEW, NOW HERE (D2, 0.60.0) ────────────────────────
 *
 * cockpit's `cockpitTable` keeps fetching, `setRows`/`fail` and its column vocabulary; the
 * rest of what it had learned moves into the system:
 *   · THE HAYSTACK. A row's `data-search-text` is matched with its text, so a search can find
 *     what no column prints (a review id, a job id) without a second box.
 *   · THE PAGE'S OWN BAR. A `<search class="filter-bar" data-table-bar>` directly before the
 *     table's wrapper is used, not duplicated: the search goes FIRST in it, and whatever the page
 *     put there (its one action) stays. The bar puts the search on the left and the rest on the
 *     right (filters.css, 0.62.0), so nothing is drawn to push them apart.
 *   · THE COUNT. A `p.result-count[role=status]` after the wrapper (and after the pager) says
 *     "7 of 55 runs — 48 hidden by the filters" while rows are withheld, and NOTHING at rest: the
 *     pager already states the total. It is written 400 ms after the last apply, so it announces
 *     a settled result rather than every keystroke. It exists, empty, from the start, because a
 *     live region created at the moment it speaks is not heard.
 *   · TWO NOTHINGS. With no rows at all a placeholder row says "no <unit> yet" (or the table's
 *     `data-table-empty`); with rows and no match it says "no <unit> match these filters." and
 *     offers the reset. Two different sentences, because "nothing here" is a lie in one of the two
 *     cases. A failure and a load are the page's (S1's alert, S6's .loading) — three sentences.
 *   · THE HEADER GLYPHS ARE MASKS. The sort and filter controls carry no text; data.css draws the
 *     arrows, the funnel and the badge's x from the icon set, so they take the header's colour in
 *     every mode, forced colours included, and a screen reader hears only the `aria-label`.
 *
 * ── WHAT THIS WRITES, IT KEEPS WRITING ───────────────────────────────────────
 *
 * `aria-sort` and `.is-filtered` on a header, the controls and the badge inside it, `aria-checked`
 * on a pick row: none of it is in the page's markup, so a renderer that PATCHES attributes and
 * children into the header (cockpit's `cockpitPatch`) takes every one of them away on each poll.
 * The observer below watches the header as well as the body, and puts back what this file owns.
 * The same goes one level out: the box this file put in the bar and the count after the table are
 * not in the page's markup either, so a renderer that patches the whole MOUNT takes both — and the
 * search stayed in force with no box to show it. A second observer, on the bar and on the wrapper's
 * parent, puts the same nodes back. A renderer can draw them itself instead, and they are adopted:
 * an `input[type=search][data-table-search]` in the bar, a `p.result-count[role=status]
 * [data-table-count]` after the table (or after its pager). Then a patch keeps its own nodes.
 * Every write is conditional — an attribute set to the value it already has is still a mutation,
 * and an observer that answers its own writes never stops.
 */

const { positionPopup } = __dd("popup");
const { initSearchFields } = __dd("search");

const STORE_PREFIX = "table-view:";
const PLACEHOLDER = "data-table-placeholder";
// Every attribute this file reads from a body row or cell. An edit to any other one changes no view,
// so the body observer does not answer it — see "NOT EVERY OTHER WRITER IS A RENDERER" there.
const ROW_READS = new Set(["data-value", "data-sort-value", "data-search-text", "data-pin", "data-row-key", "data-row-for", PLACEHOLDER]);
const COUNT_DELAY = 400;
const instances = new WeakMap();

// Only a CHANGE is written: the observer hears every write, and one that changes nothing would wake it.
const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };

const textOf = (el) => (el ? (el.textContent || "").trim() : "");

/* A `.search-field`: the markup search.js wires. `data-1p-ignore` because cockpit
   learned the expensive way that a password manager otherwise offers to fill
   every filter box on the page. */
function searchField(name, placeholder, clearName) {
  const field = document.createElement("div");
  field.className = "search-field";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", name);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("data-1p-ignore", "");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "search-clear";
  clear.setAttribute("aria-label", clearName);
  clear.hidden = true;
  field.append(input, clear);
  return { field, input };
}

/* A value written from code fires no `input`, so the clear would keep the state
   of the last keystroke — shown over an empty box after a reset, hidden over a
   restored query. */
function setSearchValue(input, value) {
  input.value = value;
  const clear = input.parentElement && input.parentElement.querySelector(":scope > .search-clear");
  if (clear) clear.hidden = !value;
}

/* A header cell's own words, without the controls injected into it. */
const labelOf = (th) => {
  let out = "";
  for (const node of th.childNodes) {
    if (node.nodeType === 1 && node.classList && node.classList.contains("tbl-tools")) continue;
    out += node.textContent || "";
  }
  return out.trim();
};

/*
 * What a cell is WORTH, for filtering and for sorting — and they are not always
 * the same fact.
 *
 * `data-value` overrides the printed text, so a column can match on something it
 * does not show. `data-sort-value` overrides it again for ordering only, because
 * a column can legitimately want to be filtered one way and ordered another:
 * cockpit's `duration` filters on "1m 30s" (what the reader sees and types) and
 * must sort on the millisecond count, or 9s files after 10m. Its `ref` column
 * filters on the branch AND the PR number, but orders by the branch alone.
 *
 * Falling back value -> text at each step means a cell that needs neither says
 * nothing, which is most of them.
 */
const cellValue = (row, index) => {
  const cell = row.cells[index];
  if (!cell) return "";
  const explicit = cell.getAttribute("data-value");
  return explicit === null ? textOf(cell) : explicit.trim();
};

const cellSortValue = (row, index) => {
  const cell = row.cells[index];
  if (!cell) return "";
  const explicit = cell.getAttribute("data-sort-value");
  return explicit === null ? cellValue(row, index) : explicit.trim();
};

/*
 * THE DIRECTION IS APPLIED IN HERE, not by the caller, and that is the whole
 * reason this takes `dir`. A blank cell sorts LAST IN BOTH DIRECTIONS — treating
 * it as 0 would file "not reported" between the negative and the positive
 * numbers, which reads as a measurement rather than an absence. Multiplying the
 * comparator's result by the direction outside it inverts that rule along with
 * everything else, so descending puts every blank FIRST. Caught by the fixture:
 * ascending ended [...Carla, Dieter] and descending began [Dieter, Carla].
 */
const compare = (a, b, type, dir) => {
  const aBlank = a === "", bBlank = b === "";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  if (type === "num") {
    const na = parseFloat(a.replace(/[^0-9.eE+-]/g, ""));
    const nb = parseFloat(b.replace(/[^0-9.eE+-]/g, ""));
    const aNaN = Number.isNaN(na), bNaN = Number.isNaN(nb);
    if (aNaN && bNaN) return 0;
    if (aNaN) return 1;
    if (bNaN) return -1;
    return dir * (na - nb);
  }
  return dir * a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

function columnsOf(table) {
  const head = table.tHead && table.tHead.rows[0];
  if (!head) return [];
  const out = [];
  for (let i = 0; i < head.cells.length; i += 1) {
    const th = head.cells[i];
    const key = th.getAttribute("data-col");
    if (!key) continue;                       // a column opted out is left alone
    out.push({
      key, index: i, th,
      // The label must EXCLUDE the controls this file injects into the same cell.
      // textOf(th) after a snapshot picks up the sort and filter glyphs, and the
      // view bar then reads "sorted by name↕⌕ ▼". data-col-label wins when set.
      label: th.getAttribute("data-col-label") || labelOf(th),
      type: th.getAttribute("data-sort-type") || "text",
      filter: th.getAttribute("data-filter") || "text",
    });
  }
  return out;
}

const defaults = (inst) => ({ sortKey: inst.defaultSortKey, dir: inst.defaultDir, filters: {}, search: "" });

const activeFilters = (inst, view) => {
  const out = {};
  for (const col of inst.columns) {
    const value = view.filters && view.filters[col.key];
    if (value) out[col.key] = String(value);
  }
  return out;
};

const isDefault = (inst, view) =>
  view.sortKey === inst.defaultSortKey && view.dir === inst.defaultDir &&
  !view.search && Object.keys(activeFilters(inst, view)).length === 0;

function normalize(inst, raw) {
  const view = defaults(inst);
  let stored;
  try { stored = JSON.parse(raw); } catch { return view; }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return view;
  const known = new Set(inst.columns.map((c) => c.key));
  // `data-sort-sticky="off"` — REMEMBER THE FILTERS, NEVER THE ORDER (Daniel, 2026-08-27:
  // "I should put the newest first. Always as default").
  //
  // A saved view is right for a filter: it is a question the reader asked and will ask again. It
  // is wrong for the sort on a table whose subject is TIME. An activity log answers "what happened
  // recently", so it opens newest-first or it opens useless — and one click on the ▲ a month ago
  // pinned it oldest-first for ever, with no affordance to undo since the per-table reset button
  // went in 0.33.0. The reader is then left with a table that is wrong every time and no way to
  // say so, which is worse than not remembering at all.
  //
  // Deliberately narrow: sorting still works, and it still persists on every table that does not
  // set the attribute. Only the RESTORE is skipped, and only where the page says time is the axis.
  if (!inst.sortSticky) {
    // fall through to the page's declared default
  } else if (known.has(stored.sortKey)) {
    view.sortKey = stored.sortKey;
    if (stored.dir === 1 || stored.dir === -1) view.dir = stored.dir;
  }
  if (stored.filters && typeof stored.filters === "object" && !Array.isArray(stored.filters)) {
    for (const key of Object.keys(stored.filters)) {
      if (!known.has(key)) continue;
      const text = String(stored.filters[key] ?? "").trim().toLowerCase();
      if (text) view.filters[key] = text;
    }
  }
  if (typeof stored.search === "string") view.search = stored.search.trim().toLowerCase();
  return view;
}

/* Both wrapped: Safari in private mode THROWS on localStorage rather than
   returning null, and a table that refuses to render because a preference could
   not be read is worse than one that starts at its defaults. */
function save(inst) {
  if (!inst.id) return;
  try {
    if (isDefault(inst, inst.view)) localStorage.removeItem(STORE_PREFIX + inst.id);
    else localStorage.setItem(STORE_PREFIX + inst.id, JSON.stringify({
      // Written even when it will not be restored, so a stored view stays a full description of
      // what was in force — but see normalize(): a non-sticky table ignores these two on load.
      sortKey: inst.view.sortKey, dir: inst.view.dir,
      filters: activeFilters(inst, inst.view), search: inst.view.search || "",
    }));
  } catch { /* the view still applies for this visit; only the memory is lost */ }
}

function restore(inst) {
  if (!inst.id) return defaults(inst);
  try { return normalize(inst, localStorage.getItem(STORE_PREFIX + inst.id)); }
  catch { return defaults(inst); }
}

const matches = (inst, row) => {
  const view = inst.view;
  if (view.search) {
    // `data-search-text` is matched with what the row prints: a search can find a review id or a
    // job id no column shows, which is why cockpit had grown a second box beside this one.
    const hay = (textOf(row) + " " + (row.getAttribute("data-search-text") || "")).toLowerCase();
    if (!hay.includes(view.search)) return false;
  }
  for (const col of inst.columns) {
    const want = view.filters[col.key];
    if (!want) continue;
    const got = (cellValue(row, col.index) || "").toLowerCase();
    // `pick` is an exact match and `text` is a contains — spelling both as
    // "contains" would be a small lie about why a row is missing.
    if (col.filter === "pick" ? got !== want : !got.includes(want)) return false;
  }
  return true;
};

function applyTableView(table) {
  const inst = instances.get(table);
  if (!inst) return;
  const body = table.tBodies[0];
  if (!body) return;

  const keep = [], drop = [];
  for (const row of inst.allRows) (matches(inst, row) ? keep : drop).push(row);

  /*
   * A PINNED ROW OUTRANKS THE SORT. `data-pin` marks a row that belongs at the top
   * whatever column is ordering the table — cockpit's approvals record uses it for an
   * ask still waiting on a human, where the highlight IS the signal: no coloured row
   * at the top means nothing is waiting, which is read at a glance rather than counted.
   *
   * It has to live HERE rather than in the caller, because the caller renders once and
   * this re-sorts the DOM on every header click. A pin the sort does not know about
   * survives exactly until the reader sorts by something, and a marker that means
   * something until you touch the table teaches that it never meant anything.
   *
   * Ahead of the comparator, never instead of it: pinned rows are still ordered among
   * themselves by the chosen column.
   */
  const pinRank = (row) => (row.hasAttribute("data-pin") ? 0 : 1);
  const col = inst.columns.find((c) => c.key === inst.view.sortKey);
  if (col) {
    keep.sort((a, b) => pinRank(a) - pinRank(b) ||
      compare(cellSortValue(a, col.index), cellSortValue(b, col.index), col.type, inst.view.dir));
  } else if (keep.some((row) => pinRank(row) === 0)) {
    // No sort in force: the caller's own order stands, pins lifted out of it. Array sort is
    // stable, so everything keeps its relative place inside each group.
    keep.sort((a, b) => pinRank(a) - pinRank(b));
  }

  /*
   * A DETAIL ROW IS NOT A ROW. An expandable table puts a second <tr> under the
   * one it belongs to — the contacts book's per-person panel, spanning every
   * column. Treated as data it would be filtered on its own text and sorted away
   * from its parent, which is how a detail panel ends up under a stranger.
   *
   * So `data-row-for="<key>"` marks a child of `data-row-key="<key>"`: it is
   * excluded from matching and from the sort, and simply follows its parent
   * wherever the parent lands. A child whose parent is filtered out goes with it.
   */
  const want = [];
  for (const row of keep) want.push(row, ...(inst.childrenOf.get(row) || []));
  for (const row of drop) {
    for (const child of inst.childrenOf.get(row) || []) child.remove();
    row.remove();
  }
  const placeholder = keep.length ? null : placeholderRow(inst);
  if (inst.placeholder && inst.placeholder !== placeholder) inst.placeholder.remove();
  inst.placeholder = placeholder;
  if (placeholder) want.push(placeholder);
  /*
   * ONLY A ROW OUT OF PLACE MOVES (0.62.3). This used to append every kept row again on every pass,
   * so clearing a narrow filter on the contacts book moved all of them (580 ms against 490 ms at 4x
   * CPU throttle). One walk down the body: a row already where it belongs is passed over, any other
   * is inserted there. Narrowing removes the rows that leave and moves none; clearing inserts the
   * rows that come back and moves none; a pass that changes nothing writes nothing.
   */
  let cursor = body.firstElementChild;
  for (const row of want) {
    if (row === cursor) cursor = cursor.nextElementSibling;
    else body.insertBefore(row, cursor);
  }
  // What we just wrote, so the observer can tell OUR output from a real
  // re-render. A synchronous "applying" flag cannot: MutationObserver delivers
  // asynchronously, so the flag is already back to false when the callback
  // runs, and the observer re-enters forever. pagination.js avoids the same
  // trap by writing only real changes; this is that discipline for a reorder.
  inst.lastWritten = [...body.rows];

  paintHeader(inst);
  paintHeaderBadges(inst);
  writeCount(inst, keep.length, drop.length);

  /*
   * A page that prints its own "N of M" has to be told, or it reports the count
   * from before the filter and quietly contradicts the table under it. Both
   * family pages do exactly that — the contacts book's "6 of 1167" and the
   * ledger's "N of M rows · net €X" are computed by the page, from the page's
   * own filtering, and neither can see a column filter applied here.
   */
  table.dispatchEvent(new CustomEvent("tbl:applied", {
    bubbles: true,
    detail: { shown: keep.length, hidden: drop.length, total: inst.allRows.length },
  }));
}

const unitOf = (inst) => inst.table.getAttribute("data-table-unit") || "rows";

/*
 * The row that stands in for no rows. Spans every column, carries `data-table-placeholder` so the
 * pager, the match and the sort all pass over it, and is REPLACED rather than edited when what it
 * says changes: its text is written before it is inserted, so the only record it makes is a
 * childList one on the body, which the observer knows is this file's own.
 */
function placeholderRow(inst) {
  const unit = unitOf(inst);
  const none = inst.allRows.length === 0;
  const kind = none ? "empty" : "no-match";
  const text = none ? (inst.table.getAttribute("data-table-empty") || `no ${unit} yet`) : `no ${unit} match these filters.`;
  const held = inst.placeholder;
  if (held && held.getAttribute(PLACEHOLDER) === kind && held.textContent.startsWith(text)) return held;
  const row = document.createElement("tr");
  row.setAttribute(PLACEHOLDER, kind);
  const cell = row.insertCell();
  const head = inst.table.tHead && inst.table.tHead.rows[0];
  cell.colSpan = head ? [...head.cells].reduce((n, th) => n + th.colSpan, 0) : 1;
  // S1's inline markup as feedback.html documents it: the sentence is the box's own text, the reset
  // follows it on the same line. No <p>: a block inside would be aligned by .empty's grid rules.
  const box = document.createElement("div");
  box.className = "empty empty--inline";
  box.append(none ? text : text + " ");
  if (!none) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "doc-link doc-link--forward";
    reset.textContent = "reset filters";
    reset.addEventListener("click", () => resetTableView(inst.table));
    box.append(reset);
  }
  cell.append(box);
  return row;
}

/* Silent at rest — the pager states the total — and settled: written once the applies stop. */
function writeCount(inst, shown, hidden) {
  if (!inst.count) return;
  const text = hidden ? `${shown} of ${shown + hidden} ${unitOf(inst)} — ${hidden} hidden by the filters` : "";
  clearTimeout(inst.countTimer);
  inst.countTimer = setTimeout(() => { inst.countText = text; setText(inst.count, text); }, COUNT_DELAY);
}

function paintHeader(inst) {
  for (const col of inst.columns) {
    const sorted = inst.view.sortKey === col.key;
    setAttr(col.th, "aria-sort", sorted ? (inst.view.dir === 1 ? "ascending" : "descending") : "none");
    const on = Boolean(inst.view.filters[col.key]);
    if (col.filterWrap) col.filterWrap.classList.toggle("is-on", on);
    // The pick rows are menuitemradios: exactly one is checked — "all" when nothing is filtered.
    if (col.pickPanel) {
      const want = inst.view.filters[col.key] || "";
      for (const item of col.pickPanel.querySelectorAll(".dropdown-item")) {
        setAttr(item, "aria-checked", String(item.getAttribute("data-pick") === want));
      }
    }
  }
}

/*
 * WHAT IS IN FORCE GOES ON THE COLUMN, not in a bar above the table (Daniel,
 * 2026-08-19). A separate strip is a second place to look, it costs a line of
 * vertical space on every filtered table, and it says "relationship = family"
 * a long way from the relationship column. The header is where the reader
 * already is when they wonder where a row went.
 *
 * So a filtering column wears two things: a highlight, and a badge carrying the
 * value. The badge is a button — clicking it clears that column's filter, which
 * is the way back the bar used to provide, now attached to the thing it undoes.
 */
function paintHeaderBadges(inst) {
  for (const col of inst.columns) {
    const value = inst.view.filters[col.key];
    col.th.classList.toggle("is-filtered", Boolean(value));
    let badge = col.badge;
    if (!value) {
      if (badge) { badge.remove(); col.badge = null; }
      continue;
    }
    // A patch of the header takes the badge out with everything else it did not write: the same
    // node goes back. Removal drops its focus to <body>; restoreFocus() gives it back.
    if (badge && !col.th.contains(badge)) col.th.appendChild(badge);
    if (!badge) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = "tbl-badge";
      badge.addEventListener("click", (event) => {
        event.stopPropagation();
        inst.view.filters[col.key] = "";
        if (col.filterInput) setSearchValue(col.filterInput, "");
        save(inst); applyTableView(inst.table);
        // The badge has just removed itself, and focus would fall to <body>: it goes to the control
        // that set what was cleared, where the next Tab carries on along the header.
        col.filterWrap?.querySelector(":scope > summary")?.focus();
      });
      col.th.appendChild(badge);
      col.badge = badge;
    }
    const exact = col.filter === "pick";
    // The stored value is lower-cased because that is what matching needs. Showing
    // it back would print "cash" where the dropdown offered "Cash" — the badge is
    // the reader's own choice quoted back at them, so it uses their casing.
    setText(badge, (exact && col.pickLabels && col.pickLabels.get(value))
      || (col.filterInput && col.filterInput.value.trim())
      || value);
    // No native `title` (house rule 7): the badge's text IS the value, and its name says what a
    // press does. A tip on a header control was dropped on 2026-08-21 for the same reason.
    setAttr(badge, "aria-label", `clear the ${col.label} filter`);
  }
}

/* A pick row: a menuitemradio carrying the value it sets (`""` for "all"). */
function pickItem(inst, col, value, label) {
  const li = document.createElement("li");
  li.setAttribute("role", "none");
  const item = document.createElement("button");
  item.type = "button";
  item.className = "dropdown-item";
  item.setAttribute("role", "menuitemradio");
  item.setAttribute("aria-checked", "false");
  item.setAttribute("data-pick", value);
  item.textContent = label;
  item.addEventListener("click", () => {
    inst.view.filters[col.key] = value;
    col.filterWrap.open = false;
    save(inst); applyTableView(inst.table);
  });
  li.append(item);
  return li;
}

const pickValues = (inst, col) => {
  const seen = new Map();
  for (const row of inst.allRows) {
    const raw = cellValue(row, col.index);
    if (raw) seen.set(raw.toLowerCase(), raw);
  }
  col.pickLabels = seen;
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
};

/* 128px is `.dropdown-panel`'s own floor (components.css): positionPopup() writes the width floor
   inline, which would otherwise shrink the panel to its 16px summary. */
function placePanel(wrap) {
  const panel = wrap.querySelector(":scope > .dropdown-panel");
  const summary = wrap.querySelector(":scope > summary");
  if (panel && summary) positionPopup(panel, summary, { minWidth: 128 });
}

function buildHeaderControls(inst) {
  for (const col of inst.columns) {
    // Already built: put the same controls back where a patch took them from, never a second set.
    if (col.tools) {
      if (!col.th.contains(col.tools)) col.th.appendChild(col.tools);
      continue;
    }
    const tools = document.createElement("span");
    tools.className = "tbl-tools";
    col.tools = tools;

    const sort = document.createElement("button");
    sort.type = "button";
    sort.className = "tbl-sort";
    // NO TOOLTIP ON A HEADER CONTROL (Daniel, 2026-08-21). `button[data-tip]::after` renders the ⓘ
    // marker, so every sortable column grew "↕ⓘ" and every filterable one "⌕ⓘ" — two glyphs of
    // furniture per column, on tables that can carry ten. The tip said "sort by <label>" beside a
    // sort arrow already sitting under the label it sorts, which is the definition of a tooltip
    // that repeats its own control. `aria-label` STAYS: the glyph is decoration, but a screen
    // reader still has to be told what an unlabelled ↕ button does.
    // No text: data.css draws the arrows as a mask from `aria-sort` on the header.
    sort.setAttribute("aria-label", "sort by " + col.label);
    sort.addEventListener("click", () => {
      if (inst.view.sortKey === col.key) inst.view.dir = inst.view.dir === 1 ? -1 : 1;
      else { inst.view.sortKey = col.key; inst.view.dir = 1; }
      save(inst); applyTableView(inst.table);
    });
    col.sortBtn = sort;
    tools.appendChild(sort);

    /*
     * `data-filter="none"` — SORTABLE BUT NOT FILTERABLE, which is a real kind of column rather
     * than an oversight. cockpit's `duration` is the case: a box matching "1m 30s" filters on the
     * formatting rather than on the length. Opting the column out of `data-col` entirely would
     * take its SORT away with the filter, which is exactly the regression that surfaced when this
     * was first wired — every duration column quietly stopped being orderable.
     */
    if (col.filter === "none") {
      col.th.appendChild(tools);
      continue;
    }

    const wrap = document.createElement("details");
    wrap.className = "dropdown tbl-filter";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "filter " + col.label);
    wrap.appendChild(summary);

    let panel;
    if (col.filter === "pick") {
      // The list is built from the column's own cells, so it can never offer a value the table
      // does not contain. A menu of menuitemradios (M5's word "all" first, where this used to write
      // "(any)"): M1 gives it the arrow keys and M0 draws the ✓ on the checked row.
      panel = document.createElement("ul");
      panel.className = "dropdown-panel dropdown-panel--down";
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", "filter " + col.label);
      panel.append(pickItem(inst, col, "", "all"));
      for (const [lower, label] of pickValues(inst, col)) panel.append(pickItem(inst, col, lower, label));
      col.pickPanel = panel;
    } else {
      panel = document.createElement("div");
      panel.className = "dropdown-panel dropdown-panel--down tbl-filter-panel";
      const { field, input } = searchField(
        "filter " + col.label, col.label + " contains…", "clear the " + col.label + " filter");
      input.addEventListener("input", () => {
        inst.view.filters[col.key] = input.value.trim().toLowerCase();
        save(inst); applyTableView(inst.table);
      });
      col.filterInput = input;
      panel.appendChild(field);
    }

    wrap.appendChild(panel);
    // Out of the wrapper's clip: `.tablewrap` scrolls, so a panel absolute inside it was cut off at
    // the wrapper's edge — on a table filtered down to its placeholder, most of the list. Placed
    // fixed against its summary, as select.js places its list (WP6's popup.js).
    wrap.addEventListener("toggle", () => { if (wrap.open) placePanel(wrap); });
    col.filterWrap = wrap;
    tools.appendChild(wrap);
    col.th.appendChild(tools);
  }
}

/*
 * Re-read the rows and the header from the DOM as it is NOW.
 *
 * Every table in this estate that is worth filtering is rendered from data and
 * rewritten wholesale — `contact-rows.innerHTML = …` on the contacts book,
 * cockpit's in-place patcher on its automation tables, a 30-second poll behind
 * both. A component that snapshotted its rows once would hold a list of detached
 * <tr>s after the first repaint and quietly filter nothing, and its header
 * controls would be gone with the <thead> that carried them.
 */
/*
 * BUT ONLY FROM THE BODY WHEN THE BODY IS NO LONGER WHAT THIS FILE WROTE (0.62.3). A filter detaches
 * the rows it withholds, so a body still holding exactly the rows this file last put there (`lastWritten`,
 * the same nodes in the same order) is the filtered view, not the table: read from it, every withheld row
 * left the set for good. That is what a page writing `cell.textContent` into a visible row did, and a
 * renderer replacing the <thead>. So while the body is ours, the rows are the ones held here — withheld
 * included — and a write inside one is an update of that row.
 *
 * THE SHOWN ROWS KEEP THE BODY'S ORDER. A patcher matching by position (cockpit's `cockpitPatch`) moves
 * CONTENT between row nodes, so the nodes' read order no longer says which record came first: rebuilt in
 * that order, rows tied on the sort column changed places on polls that changed nothing. So the slots
 * the shown rows held go to the shown rows in the order the body has them, as reading the body did, and
 * a withheld row keeps its own slot.
 *
 * WHAT IT CANNOT TELL APART, and the cure. A renderer that rewrites the body IN PLACE with exactly as
 * many rows as are showing moves no row either. Without being told, the rows it no longer has stay held:
 * withheld, counted in "3 of 10 — 7 hidden", offered in a pick menu, and back on screen when the filter
 * is cleared, possibly beside the same record written into a shown row. `resetTableView()` keeps them
 * too. They go at the next render whose row count differs. A renderer says how many rows it wrote with
 * `data-table-rows` on the table, detail rows (`data-row-for`) not counted, read only in the task that writes
 * it; when that is not the number held here, the body is the set (`fromBody`).
 */
const sameRows = (body, rows) => body.rows.length === rows.length && rows.every((row, i) => body.rows[i] === row);

/* The renderer's own count of the rows it wrote (`data-table-rows`), when it gives one and it is not what is held. */
const declaredOtherwise = (inst) => {
  const declared = inst.table.getAttribute("data-table-rows");
  return declared !== null && Number(declared) !== inst.allRows.filter((row) => !row.hasAttribute("data-row-for")).length;
};

function snapshot(inst, fromBody = false) {
  const body = inst.table.tBodies[0];
  if (!body) return;
  let rows;
  if (!fromBody && sameRows(body, inst.lastWritten)) {
    const held = new Set(inst.allRows);
    const shown = [...body.rows].filter((row) => held.has(row));
    const inBody = new Set(shown);
    let k = 0;
    rows = inst.allRows.map((row) => (inBody.has(row) ? shown[k++] : row))
      .flatMap((row) => [row, ...(inst.childrenOf.get(row) || [])]);
  } else {
    // A placeholder is this file's own stand-in for no rows, never data.
    rows = [...body.rows].filter((row) => !row.hasAttribute(PLACEHOLDER));
  }
  inst.childrenOf = new Map();
  inst.allRows = [];
  const byKey = new Map();
  for (const row of rows) {
    const parentKey = row.getAttribute("data-row-for");
    if (parentKey === null) {
      inst.allRows.push(row);
      const key = row.getAttribute("data-row-key");
      if (key !== null) byKey.set(key, row);
    }
  }
  for (const row of rows) {
    const parentKey = row.getAttribute("data-row-for");
    if (parentKey === null) continue;
    const parent = byKey.get(parentKey);
    // An orphan detail row — parent filtered out by the page itself, or a stale
    // key — is left as ordinary content rather than dropped. Removing a row
    // because its key did not resolve would delete data over a typo.
    if (!parent) { inst.allRows.push(row); continue; }
    if (!inst.childrenOf.has(parent)) inst.childrenOf.set(parent, []);
    inst.childrenOf.get(parent).push(row);
  }
  // The <thead> may have been replaced too, so the column objects must be
  // re-read and the controls re-injected onto the cells that exist now.
  const fresh = columnsOf(inst.table);
  if (fresh.length) {
    // Carry the CONTROLS across, not just the inputs. columnsOf() builds new
    // column objects, and paintHeader() writes the sort glyph and the active-filter
    // mark through col.sortBtn / col.filterWrap — drop those and the header stops
    // reporting the state it is actually in. Measured: aria-sort said "ascending"
    // while the button still showed the neutral glyph.
    for (const col of fresh) {
      const prev = inst.columns.find((c) => c.key === col.key);
      if (!prev) continue;
      col.filterInput = prev.filterInput;
      col.sortBtn = prev.sortBtn;
      col.filterWrap = prev.filterWrap;
      col.badge = prev.badge;
      col.pickLabels = prev.pickLabels;
      col.pickPanel = prev.pickPanel;
      col.tools = prev.tools;
    }
    inst.columns = fresh;
    buildHeaderControls(inst);
    refreshPickOptions(inst);
  }
}

/*
 * A `pick` list is derived from the column's own cells, so it has to be rebuilt
 * when those cells change — a re-render that introduces a new relationship would
 * otherwise leave a dropdown that cannot offer it, and the reader would conclude
 * the value does not exist. Rebuilt only when the set actually differs, so an
 * open dropdown is not torn out from under the pointer on every poll.
 */
function refreshPickOptions(inst) {
  for (const col of inst.columns) {
    if (col.filter !== "pick" || !col.pickPanel) continue;
    const wanted = pickValues(inst, col);
    const panel = col.pickPanel;
    const current = [...panel.children].slice(1).map((li) => li.textContent);
    if (current.length === wanted.length && current.every((v, i) => v === wanted[i][1])) continue;
    for (const li of [...panel.children].slice(1)) li.remove();
    for (const [lower, label] of wanted) panel.append(pickItem(inst, col, lower, label));
  }
}

/* The PAGE'S bar, when it put one directly before the table's wrapper — looking back past a pager or a count
   another table left there when it moved (never past a table's wrapper), so a table that lands after a moved
   one's leavings adopts the bar rather than drawing a second. */
const pageBarOf = (anchor) => {
  let before = anchor.previousElementSibling;
  while (before && before.matches(".table-pager, p.result-count")) before = before.previousElementSibling;
  return before && before.matches("search.filter-bar[data-table-bar]") ? before : null;
};

// Which instance a box speaks for. A page's box outlives the instance that first adopted it — a table
// detached and inserted again is a new instance — so its listener asks here rather than closing over one.
const boxOwners = new WeakMap();
// Which table a count speaks for. A count another table already holds is never adopted: a table
// rendered between a neighbour and its count would otherwise take that count, and the two would
// re-assert their own text over each other's for ever — measured, a renderer that never answered.
const countOwners = new WeakMap();
// The counts this file made, as against one a renderer drew and the engine adopted: only its own goes
// with a table that leaves for good.
const madeCounts = new WeakSet();
// A retired instance's view, keyed by its table node, for the node coming back somewhere else.
const carried = new WeakMap();

/* The box the table search reads. A box is bound once, and given the query in force by each instance it serves. */
function useSearchBox(inst, input) {
  inst.searchInput = input;
  if (boxOwners.get(input) === inst) return;
  const bound = boxOwners.has(input);
  boxOwners.set(input, inst);
  setSearchValue(input, inst.view.search || "");
  if (bound) return;
  input.addEventListener("input", () => {
    const owner = boxOwners.get(input);
    if (owner.retired) return;
    owner.view.search = input.value.trim().toLowerCase();
    save(owner); applyTableView(owner.table);
  });
}

/* The page bar this table adopted, unless another engine table now stands directly after it and takes it. */
function barToBring(inst) {
  const bar = inst.bar || inst.carriedBar;
  if (!bar || !bar.isConnected) return null;
  // A pager or a count beside it is what this table left behind, not a table standing after the bar. Only
  // an engine table that searches (and would adopt the bar) keeps it; a neighbour with its own bar or with
  // `data-table-search="off"` never takes it, so the bar goes with its table.
  let next = bar.nextElementSibling;
  while (next && next.matches(".table-pager, p.result-count")) next = next.nextElementSibling;
  const other = next && (next.matches("table") ? next : next.matches(".tablewrap") ? next.querySelector(":scope > table") : null);
  const adopter = other && other !== inst.table && other.hasAttribute("data-table-tools") && other.getAttribute("data-table-search") !== "off";
  return adopter ? null : bar;
}

/*
 * THE BAR'S BOX AND THE COUNT, put where they belong and put BACK when a renderer's patch took them.
 *
 * The search goes FIRST in the page's bar (`data-table-bar`) — its spacer and its action stay — or in
 * a `<search class="filter-bar">` of the engine's own, before the wrapper, never inside it:
 * `.tablewrap` scrolls sideways, and a box in there slides out of reach on the wide tables that need
 * one. The count follows the wrapper, and the pager when there is one; it is there from the start,
 * empty, because a status region that appears as it speaks is not announced.
 *
 * Either can be the page's own (adopted, above). Every write here is conditional, so the observer
 * that calls this hears its own re-insertion once, finds everything in place, and stops.
 */
/*
 * THE BAR IS THE RENDERER'S WHEN THE RENDERER PATCHES THE MOUNT. The engine's OWN <search> sits before
 * the wrapper, where no renderer's markup has one — so a patcher matching children by position lines
 * the page's `div.tablewrap` up against the engine's bar, builds a new table there and throws the old
 * one away, on every poll. That cannot be fixed from here without changing the markup (the bar cannot
 * go inside the wrapper, which scrolls, or after it), so it is a contract: a renderer that re-renders
 * this mount draws `<search class="filter-bar" data-table-bar>` itself. The engine says so when it can
 * tell — its own bar gone while an engine table is still in that mount — once per table identity, as
 * the node is new on every poll. A page that clears the whole mount is not warned.
 */
const warnedBars = new Set();
function ownBarLost(inst) {
  const mount = inst.ownBarParent;
  // Only when the table is still there, or a table of the SAME identity took its place: that is a
  // re-render of this table. A mount cleared, or filled with a different table, is the page's business.
  const again = inst.table.isConnected ||
    [...mount.querySelectorAll("table[data-table-tools]")].some((t) => identityOf(t) === inst.identity);
  if (warnedBars.has(inst.identity) || !again) return;
  warnedBars.add(inst.identity);
  console.warn(`initTableTools: a renderer that re-renders this mount must draw <search class="filter-bar" data-table-bar> ` +
    `before the table "${inst.identity || "(no data-table-id or aria-label)"}" itself. The engine's own bar was taken out, and a ` +
    "patcher matching by position rebuilds the table in its place on every render.");
}

/*
 * A MOVED TABLE TAKES ITS BAR AND ITS COUNT WITH IT. A page that appends the table (or its wrapper) into
 * another container keeps the node, so this instance and the reader's view — sort, filters, search, the
 * pager's page — stay; what was left behind is the bar before the old position and the count after it,
 * saying things about a table that is no longer there. So both are placed against where the table IS:
 * the bar directly before the wrapper, the count directly after it (after the pager, when there is one),
 * and the new parent is watched from then on.
 *
 * The bar is the engine's own or the page's `data-table-bar` it adopted (0.62.3): an adopted bar goes as
 * an adopted count always did. Left behind, it held the page's action and, when the page drew it, a box
 * still searching this table, while the engine drew a second bar at the new place. Not when the new place
 * has a page bar of its own, and not when another engine table now stands directly after it.
 */
function ensureChrome(inst) {
  const table = inst.table;
  if (inst.ownBar && inst.ownBarParent && !inst.ownBar.isConnected) ownBarLost(inst);
  const anchor = table.closest(".tablewrap") || table;
  if (anchor.parentElement && anchor.parentElement !== inst.chromeParent) {
    inst.chromeParent = anchor.parentElement;
    inst.chrome.observe(inst.chromeParent, { childList: true });
  }
  if (!table.isConnected) return;

  if (inst.wantsSearch) {
    let pageBar = pageBarOf(anchor);
    if (!pageBar) {
      pageBar = barToBring(inst);
      if (pageBar) keepingFocus(pageBar, () => anchor.before(pageBar));
    }
    const theirs = pageBar && pageBar.querySelector('input[type="search"][data-table-search]');
    if (theirs) {
      useSearchBox(inst, theirs);
    } else {
      if (!inst.searchField) {
        const { field, input } = searchField("search this table", "search this table…", "clear table search");
        inst.searchField = field;
        inst.searchBox = input;
        watchFocus(inst, field);
      }
      useSearchBox(inst, inst.searchBox);
      let bar = pageBar;
      if (!bar) {
        if (!inst.ownBar) {
          inst.ownBar = document.createElement("search");
          inst.ownBar.className = "filter-bar";
          if (inst.label) inst.ownBar.setAttribute("aria-label", "search " + inst.label);
        }
        bar = inst.ownBar;
      }
      if (!bar.contains(inst.searchField)) bar.prepend(inst.searchField);
      if (bar.nextElementSibling !== anchor) {
        keepingFocus(bar, () => anchor.before(bar));
        if (bar === inst.ownBar) inst.ownBarParent = bar.parentElement;
      }
      if (inst.carriedCaret) giveFocusBack(inst.searchBox, inst.carriedCaret);
      inst.carriedCaret = null;
    }
    if (pageBar && pageBar !== inst.bar) {
      inst.bar = pageBar;
      inst.chrome.observe(pageBar, { childList: true, subtree: true });
    }
  }

  let at = anchor;
  if (at.nextElementSibling && at.nextElementSibling.classList.contains("table-pager")) at = at.nextElementSibling;
  if (inst.count && inst.count.isConnected) {
    if (at.nextElementSibling !== inst.count) at.after(inst.count);
  } else {
    const next = at.nextElementSibling;
    const free = next && next.matches("p.result-count[role=status][data-table-count]") && (countOwners.get(next) || inst) === inst;
    let count = free ? next : inst.count;
    if (!count) {
      count = document.createElement("p");
      count.className = "result-count";
      count.setAttribute("role", "status");
      count.setAttribute("data-table-count", "");
      madeCounts.add(count);
    }
    if (!count.isConnected) at.after(count);
    if (count !== inst.count) {
      countOwners.set(count, inst);
      inst.count = count;
      inst.chrome.observe(count, { childList: true, characterData: true, subtree: true });
    }
  }
  // What it last said, back in place — a patch writing the page's empty count would silence it.
  setText(inst.count, inst.countText);
  restoreFocus(inst);
}

/*
 * WHICH TABLE THIS NODE IS. A patcher matching by position can hand one table's NODE another table's
 * markup — two engine tables in one mount, and the first <table> in the new markup lands on whichever
 * <table> is first. The instance that node carried would go on governing it with the OTHER table's
 * view: measured, B showed 0 of 4 under A's search. So a node whose `data-table-id` (or `aria-label`,
 * without one) is no longer the one it was enhanced as is dropped and enhanced again, as itself.
 */
const identityOf = (table) => table.getAttribute("data-table-id") || table.getAttribute("aria-label") || "";

function retire(inst) {
  inst.retired = true;
  inst.observer?.disconnect();
  inst.chrome.disconnect();
  clearTimeout(inst.countTimer);
  instances.delete(inst.table);
  if (inst.count) countOwners.delete(inst.count);
  // The node may come back elsewhere (a page that detaches a table and inserts it later): it comes back
  // with the view the reader left it in, not only what was saved — a table without an id saves nothing.
  // The engine's box goes below, and a reader typing in it would be left on <body>: where its caret was goes
  // with the view, for the box drawn when the node comes back — until the reader does anything at all. A
  // click on nothing also leaves focus on <body>, and a box that took focus after it would turn the next
  // Space into a query. A wheel scroll counts: it fires no pointerdown (a touch swipe does).
  const box = inst.searchField && document.activeElement === inst.searchBox ? inst.searchBox : null;
  const entry = { identity: inst.identity, view: inst.view, bar: inst.bar, caret: box && [box.selectionStart, box.selectionEnd] };
  carried.set(inst.table, entry);
  if (entry.caret) {
    const done = new AbortController();
    const drop = () => { entry.caret = null; done.abort(); };
    for (const type of ["pointerdown", "keydown", "wheel", "focusin"]) document.addEventListener(type, drop, { capture: true, signal: done.signal });
  }
  // Gone, not renewed in place: the count this file made would go on standing where the table was.
  if (!inst.table.isConnected && madeCounts.has(inst.count)) inst.count.remove();
  /*
   * THE ROWS GO BACK FIRST. A filter DETACHES what it withholds, so the body holds only what this
   * instance chose to show — and the next instance reads the body as the whole table. Measured: an
   * `aria-label` going from "runs (8)" to "runs (9)" over a search for "L1" re-enhanced one row and
   * lost seven. So unless a patch has already rewritten the body (then the renderer supplied the rows,
   * and the ones held here are not resurrected), every row goes back in the order it was read, and the
   * placeholder goes, before anything reads the body again.
   */
  const body = inst.table.tBodies[0];
  const untouched = !!body && sameRows(body, inst.lastWritten);
  if (inst.placeholder && inst.placeholder.hasAttribute(PLACEHOLDER)) inst.placeholder.remove();
  if (untouched) {
    const frag = document.createDocumentFragment();
    for (const row of inst.allRows) {
      frag.appendChild(row);
      for (const child of inst.childrenOf.get(row) || []) frag.appendChild(child);
    }
    body.appendChild(frag);
  }
  // What is still unmistakably its own goes with it; a node a patch already rewrote is the page's now.
  if (inst.searchField && inst.searchField.contains(inst.searchBox)) inst.searchField.remove();
  if (inst.ownBar && !inst.ownBar.childElementCount) inst.ownBar.remove();
  for (const col of inst.columns) {
    if (col.tools && col.tools.classList.contains("tbl-tools")) col.tools.remove();
    if (col.badge && col.badge.classList.contains("tbl-badge")) col.badge.remove();
    col.th.classList.remove("is-filtered");
  }
}

/*
 * TWO TABLES, ONE IDENTITY. The guard above can only tell tables apart by what they are called: two
 * engine tables with the same `data-table-id` (or the same `aria-label`, or neither) in a mount a
 * renderer patches by position can still trade nodes unseen. Said once per identity, so a page that
 * re-renders does not fill the console.
 */
const warnedIdentities = new Set();
function warnShared(inst) {
  if (warnedIdentities.has(inst.identity)) return;
  for (const other of document.querySelectorAll("table[data-table-tools]")) {
    if (other === inst.table || !instances.has(other) || identityOf(other) !== inst.identity) continue;
    warnedIdentities.add(inst.identity);
    console.warn(`initTableTools: two tables are both "${inst.identity || "(no data-table-id or aria-label)"}". ` +
      "Give each a distinct data-table-id: a renderer that patches by position can hand one table's node the other's markup.");
    return;
  }
}

/*
 * FOCUS SURVIVES A PATCH. A renderer that writes the header (or the bar) back removes what this file
 * put there, and a focused node that is removed drops focus to <body> — the same node goes back a
 * moment later, unfocused, and the next Tab starts from the top of the page. So focus inside what this
 * file owns is remembered, and given back when that node is connected again and nothing else took it.
 * A focus the reader moved away on purpose is forgotten, so this never pulls focus back.
 */
function watchFocus(inst, root) {
  root.addEventListener("focusin", (event) => { inst.lastFocus = event.target; });
  root.addEventListener("focusout", (event) => {
    const node = event.target;
    queueMicrotask(() => { if (inst.lastFocus === node && node.isConnected && document.activeElement !== node) inst.lastFocus = null; });
  });
}
function restoreFocus(inst) {
  if (inst.lastFocus && focusLost()) giveFocusBack(inst.lastFocus);
}
const focusLost = () => !document.activeElement || document.activeElement === document.body;

/*
 * FOCUS GOES BACK ONCE THE MOVES HAVE LANDED (0.62.4). focus() lays the page out, and in the middle of a
 * move that layout is of a page that is half moved: a table's bar already at its new place, its count or
 * pager still at the old one. Scroll anchoring (Chromium, Firefox) takes the focused box as its anchor in
 * that state and holds it there when the rest lands — measured, a bar under a mount the count had not
 * left yet carried the 0.6rem block gap, and the page scrolled 10px when the count went. So focus is given
 * back in a microtask: after this observer batch, the pager's moves included, and before anything paints.
 * Only to a node still in the document, and only while focus is on <body> — what else took it keeps it.
 */
function giveFocusBack(node, caret) {
  queueMicrotask(() => {
    if (!node.isConnected || !focusLost()) return;
    node.focus({ preventScroll: true });
    if (caret) node.setSelectionRange(...caret);
  });
}

/*
 * A BAR THE ENGINE MOVES KEEPS ITS FOCUS (0.62.4). Moving a node takes it out of the document first, and a
 * focused node taken out drops focus to <body>. watchFocus() covers the engine's own box; a page's bar holds
 * the page's box and its action, which nothing here watches. So focus inside is read before the move and
 * given back after it — a text box keeps its caret, which the element holds — and focus outside is left alone.
 */
function keepingFocus(node, move) {
  const held = node.contains(document.activeElement) ? document.activeElement : null;
  move();
  if (held && document.activeElement !== held) giveFocusBack(held);
}

/* true when the node is no longer this instance's table — it has been handed to a fresh one. */
function renewed(inst) {
  if (inst.retired) return true;
  if (identityOf(inst.table) === inst.identity) return false;
  retire(inst);
  enhance(inst.table);
  return true;
}

function enhance(table) {
  if (instances.has(table)) return;
  const columns = columnsOf(table);
  if (!columns.length) return;
  const body = table.tBodies[0];
  if (!body) return;

  const inst = {
    table, columns,
    identity: identityOf(table),
    id: table.getAttribute("data-table-id") || "",
    allRows: [],
    childrenOf: new Map(),
    lastWritten: [],
    defaultSortKey: table.getAttribute("data-sort-key") || columns[0].key,
    defaultDir: table.getAttribute("data-sort-dir") === "desc" ? -1 : 1,
    // Opt OUT of restoring a remembered sort. Default is to remember, so every existing table
    // behaves exactly as before; a table whose subject is time says so with the attribute.
    sortSticky: table.getAttribute("data-sort-sticky") !== "off",
  };
  instances.set(table, inst);
  const kept = carried.get(table);
  carried.delete(table);
  const same = kept && kept.identity === inst.identity;
  inst.view = same ? kept.view : restore(inst);
  inst.carriedBar = same ? kept.bar : null;
  inst.carriedCaret = same ? kept.caret : null;
  warnShared(inst);
  watchFocus(inst, table);

  const anchor = table.closest(".tablewrap") || table;

  /*
   * `data-table-search="off"` — for a page whose OWN search is richer than this
   * one can be: one that asks its server, say, over records the table does not
   * hold. A box that only sees the rows in the body would silently stop finding
   * what the page's search finds. Two search boxes over one table is worse than
   * either.
   *
   * The per-column filters, the sort and the view bar are unaffected — this
   * turns off the built-in box only, and the bar then never claims a search.
   */
  const wantsSearch = table.getAttribute("data-table-search") !== "off";

  inst.wantsSearch = wantsSearch;
  if (!wantsSearch) inst.view.search = "";       // a restored search with no box is invisible in force
  inst.label = table.getAttribute("aria-label") || textOf(table.caption);
  // A page bar with no name of its own is named after the table: a page with three tables would
  // otherwise offer three identical landmarks.
  const bar = pageBarOf(anchor);
  if (bar && inst.label && !bar.hasAttribute("aria-label")) bar.setAttribute("aria-label", "search " + inst.label);
  inst.countText = "";
  inst.chrome = new MutationObserver((records) => {
    if (renewed(inst)) return;
    if (inst.table.isConnected) { ensureChrome(inst); return; }
    /*
     * GONE, AND NOT PUT BACK (a move lands before this runs: observers deliver after the script that
     * moved it). The mount outlives the table, and this observer on the mount held the instance, its
     * header controls and its rows for the life of the tab — measured, +13,800 nodes, +1,100
     * listeners and +200 observers over 50 innerHTML repaints. So it is retired. A mount repainted
     * WHOLESALE (innerHTML, replaceChildren) takes the bar and the table out in ONE record: that is
     * the page drawing a new table, not a patcher rebuilding this one, and it is not warned.
     */
    const anchor = inst.table.closest(".tablewrap") || inst.table;
    const wholesale = records.some((r) => [...r.removedNodes].includes(anchor) && [...r.removedNodes].includes(inst.ownBar));
    if (inst.ownBar && inst.ownBarParent && !inst.ownBar.isConnected && !wholesale) ownBarLost(inst);
    retire(inst);
  });
  ensureChrome(inst);

  // snapshot() builds the header controls itself when they are absent, and it
  // must run FIRST: a `pick` column's option list is derived from the rows, so
  // building the controls against an empty set yields a dropdown offering only
  // "(any)".
  snapshot(inst);
  for (const col of inst.columns) {
    if (col.filterInput) setSearchValue(col.filterInput, inst.view.filters[col.key] || "");
  }
  applyTableView(table);

  /*
   * WATCHING THE TABLE, NOT THE TBODY — a renderer is entitled to replace the
   * tbody node rather than fill it, and an observer bound to the old one would
   * be left watching a detached element. Same reasoning as pagination.js.
   *
   * The guard is an IDENTITY CHECK against the row order we last wrote, not a
   * flag. applyTableView() moves every row, so without a guard this re-enters
   * forever — and a synchronous flag cannot close it, because MutationObserver
   * delivers asynchronously and the flag is already cleared by then. Measured:
   * the first version hung the page.
   */
  inst.observer = new MutationObserver((records) => {
    if (renewed(inst)) return;
    const body = table.tBodies[0];
    if (!body) return;
    const moved = !sameRows(body, inst.lastWritten);

    /*
     * A PATCHING RENDERER REWRITES A ROW WITHOUT MOVING IT, and neither the identity
     * check above nor a childList-only observer can see that.
     *
     * cockpit re-renders by patching: it diffs new markup against the live DOM and
     * writes only the differences, which is what keeps focus, scroll and open panels.
     * With no key on a row it matches BY POSITION — so on a table the reader has
     * sorted, a poll rewrites row 1's cells with row 1's data in the RENDERER's
     * order. Every node is the same node, in the same place, holding somebody else's
     * values. The rows then sit in the caller's order while paintHeader keeps the
     * arrow pointing at the reader's column: the table lying about itself rather
     * than merely resetting.
     *
     * MEASURED, because the obvious diagnosis was wrong. Watching a real patch land
     * on a sorted table: 18 records, every one of them `attributes` on a <td> or
     * `characterData` on a text node, and NOT ONE childList. A patch never adds or
     * removes a node when the row count matches — it edits values in place. So the
     * observer was not returning early on its guard; it was never being called at
     * all, because it only watched childList.
     *
     * Hence characterData and attributes below, and the discriminator here is the
     * mutation TARGET. Everything this component does to the body is a childList
     * change on the body ITSELF (appendChild of a fragment, row.remove()), and every
     * header repaint targets the thead — so a record whose target is inside the body
     * but is not the body is, by construction, somebody else's write. That is what
     * keeps this from re-entering on its own output.
     *
     * BUT NOT EVERY OTHER WRITER IS A RENDERER. Until 0.62.3 a rewrite was answered
     * with snapshot() reading the set from the BODY — which holds only what the filter
     * let through, so every row it withheld was dropped from the set for good. Since
     * then a body no row has moved in is read from the rows held here (see snapshot()),
     * and the list below saves only the work. The pager writes `hidden` on the rows it pages, a tooltip
     * writes `aria-describedby` on the cell it describes, a copy button its
     * `data-state`: none of them changes a value, and each of them took the withheld
     * rows with it. Found on cockpit /links; measured in check-tabletools: a pick
     * filter set back to "all" on a paged 65-row table showed the 22 it had filtered
     * to, because the pager had re-windowed the filtered set in between.
     *
     * So an attribute record counts only when it names an attribute this file READS
     * from a row or a cell — ROW_READS, a finite list owned here, not a list of other
     * writers, which would never be complete. Skipping anything else loses nothing:
     * no matter what it is set to, applyTableView() would compute the same view. A
     * renderer that rewrites a row's text or a `data-value` is still seen, by the
     * characterData, childList or attribute record that write makes.
     *
     * A RELATIVE TIME RELABELLING ITSELF is the one text write treated the same way.
     * Inside a `[data-ago]` element the only writer is the one keeping "3 minutes ago"
     * true — time.js's initRelativeTimes() and cockpit's stamp.js share the hook, every
     * 30 s — and it relabels a time the row already showed; answering it dropped the
     * withheld rows as surely as the pager did. A renderer's rewrite of a row touches
     * other cells or attributes and is still seen through them. The cost, accepted: a
     * search can match a relative label up to 30 s stale until something else re-applies.
     */
    const relabel = (node) => !!(node.nodeType === 1 ? node : node.parentElement)?.closest("[data-ago]");
    const rewritten = !moved && records.some((rec) =>
      rec.target !== body && body.contains(rec.target) &&
      (rec.type === "attributes" ? ROW_READS.has(rec.attributeName) : !relabel(rec.target)));

    // A renderer that declares how many rows it wrote, and it is not the number held, rewrote the set. Read
    // only in the batch that WRITES it: answered on every callback, a count that was wrong, or went stale when
    // the page later removed a row, read the body on the next filter keystroke and dropped every withheld row.
    // An unchanged value written again (cockpit's paint() writes it on every paint) matches and reads nothing.
    const stale = records.some((rec) => rec.target === table && rec.attributeName === "data-table-rows") && declaredOtherwise(inst);
    if (moved || rewritten || stale) {
      snapshot(inst, stale);
      applyTableView(table);
      restoreFocus(inst);
      return;
    }
    // THE HEADER, patched: `aria-sort`, `.is-filtered`, the controls, the badge and `aria-checked`
    // are this file's, and a renderer writing the header's markup back removes all of them. Put
    // back what is missing; every write is conditional, so answering our own writes ends here.
    const head = table.tHead;
    if (records.some((rec) => (head && head.contains(rec.target)) ||
        (rec.target === table && [...rec.addedNodes, ...rec.removedNodes].some((n) => n.nodeName === "THEAD")))) {
      const fresh = columnsOf(table);
      if (fresh.some((col, i) => !inst.columns[i] || inst.columns[i].th !== col.th)) snapshot(inst);
      else buildHeaderControls(inst);
      paintHeader(inst);
      paintHeaderBadges(inst);
      restoreFocus(inst);
    }
  });
  /*
   * characterData and attributes are NOT optional here — see the callback. A patching
   * renderer emits nothing else when it rewrites a row in place, so a childList-only
   * observer sleeps through the one event that loses the reader's sort. The extra
   * volume is header repaints and cell edits, both bounded by the table's own size,
   * and the callback's work is one `some()` over the batch.
   */
  inst.observer.observe(table, { childList: true, subtree: true, characterData: true, attributes: true });
}

/**
 * Put a table back to the view it ships with — default sort, no filters, no search.
 *
 * For a page that owns a CLEAR ALL of its own. cockpit's container list has one, next to its
 * host and tag chips, and those are page-level filters this component knows nothing about. With
 * no way to reach the column filters, that button would clear three of the four things in force
 * and leave the fourth — a control that lies about what it did.
 *
 * This is NOT the reset button removed in 0.33.0. That one was the component putting its own
 * affordance on every table; this is a page that already has one asking to be included.
 *
 * @param {HTMLTableElement} table
 */
function resetTableView(table) {
  const inst = instances.get(table);
  if (!inst) return;
  // RE-READ THE ROWS FROM THE PAGE ONLY IF IT ACTUALLY REDREW THEM. A page with its own clear-all
  // typically re-renders as part of it, so the rows held from the last apply can be detached nodes
  // by the time this is called. Appending those on top of the ones the page just drew DUPLICATES
  // the table: cockpit's container list went from 27 rows to 54 on a single click of "clear all".
  // Without a re-render the body is this component's own filtered output, and reading it as the
  // full set would make "put the table back" the one action that destroys it. snapshot() tells the
  // two apart by `lastWritten`, as the MutationObserver does.
  snapshot(inst);
  inst.view = defaults(inst);
  if (inst.searchInput) setSearchValue(inst.searchInput, "");
  for (const col of inst.columns) if (col.filterInput) setSearchValue(col.filterInput, "");
  save(inst);
  applyTableView(table);
}

/**
 * Give every `<table data-table-tools>` a search box, per-column sort and filter
 * controls in its header, and a badge naming the value on each filtering column.
 * `data-table-id` is optional here and keys the remembered view.
 *
 * Markup contract: `<th data-col="key">` on each column that participates.
 * Optional: `data-filter="pick"` for a value list instead of a text box,
 * `data-sort-type="num"`, `data-col-label`, and `data-value` on a `<td>` to sort
 * by something other than what it prints.
 *
 * @param {ParentNode} [root=document]
 */
let watching = false;

function initTableTools(root = document) {
  // The search boxes built here are `.search-field`s, and a clear button that
  // does nothing because the page never called initSearchFields() would be a
  // control that lies. So the table asks for it itself; the call is idempotent.
  initSearchFields(root);
  for (const table of root.querySelectorAll("table[data-table-tools]")) enhance(table);
  // A table rendered LATER is enhanced when it arrives, as select.js does for a <select>: a page
  // that builds its tables after a fetch calls this once, at startup, like every other init.
  if (watching) return;
  watching = true;
  // Capture, because the summary usually sits in a `.tablewrap` that scrolls on its own and a scroll
  // there does not bubble. A panel scrolling its own list moves nothing and is skipped.
  // A summary scrolled out of its wrapper leaves the panel floating beside nothing: the reader scrolled
  // away, so it closes — and focus stays where it is, since nothing was asked of it.
  const follow = (event) => {
    for (const wrap of document.querySelectorAll("details.tbl-filter[open]")) {
      if (event.type === "scroll" && event.target instanceof Node && wrap.querySelector(":scope > .dropdown-panel")?.contains(event.target)) continue;
      const clip = wrap.closest(".tablewrap");
      const summary = wrap.querySelector(":scope > summary");
      if (clip && summary) {
        const s = summary.getBoundingClientRect(), c = clip.getBoundingClientRect();
        if (s.right <= c.left || s.left >= c.right || s.bottom <= c.top || s.top >= c.bottom) {
          // Focus inside the panel would be stranded in a closed <details>: it goes to the summary.
          const held = wrap.querySelector(":scope > .dropdown-panel")?.contains(document.activeElement);
          wrap.open = false;
          if (held) summary.focus({ preventScroll: true });
          continue;
        }
      }
      placePanel(wrap);
    }
  };
  addEventListener("resize", follow);
  addEventListener("scroll", follow, true);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("table[data-table-tools]")) enhance(node);
        for (const table of node.querySelectorAll("table[data-table-tools]")) enhance(table);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
return { applyTableView, resetTableView, initTableTools };
};
//@dd-record tabs deps= exports=initTabs
records["tabs"] = (__dd) => {
/*
 * tabs.js — the tab bar's behaviour: selection, keys, deep links, nesting, and one event.
 *
 * Markup contract (the ARIA APG Tabs pattern; `.tabs` / `.tab` in data.css draw it):
 *
 *   <div class="tabs" role="tablist" aria-label="review sections" data-tabs-hash>
 *     <button type="button" class="tab" role="tab" id="tab-activity" aria-controls="sec-activity"
 *             aria-selected="true">activity</button>
 *     <button type="button" class="tab" role="tab" id="tab-how" aria-controls="sec-how"
 *             aria-selected="false" tabindex="-1">how it works</button>
 *   </div>
 *   <section class="doc tab-panel" id="sec-activity" role="tabpanel" aria-labelledby="tab-activity">…</section>
 *
 * Call `initTabs()` once. It is delegated on the document, so a tablist rendered later works with
 * no second call, and a MutationObserver gives that tablist its initial state. `aria-controls` is
 * mandatory: the panel it names is the tab's panel, and a tab that names none can be selected but
 * shows and hides nothing.
 *
 * WHY THIS IS ONE MODULE. Cockpit carried FIVE tab engines — tabs.js for the three phase pages, a
 * nested one on /automation/review, inline copies on cicd, config and docs — and they differed in
 * exactly the places that matter: which one followed the hash for the life of the page, which one
 * opened an ancestor, which one told a lazy panel it had been opened. Behaviour that must not differ
 * between pages lives in one file or it differs.
 *
 * ACTIVATION IS ONE PATH, whatever the route — a click, a key, an incoming hash, `tab.click()` from
 * code. Each sets `aria-selected`, a roving `tabindex` (0 on the selected tab, -1 on the rest) and
 * `hidden` on the group's panels, and then dispatches a bubbling `tab-activated` on the tab,
 * `detail: { panel }`. That event is the one signal a lazy panel listens to. Cockpit's stats tab
 * loaded on "click", which is one of three routes, and sat on "loading…" for the life of the page
 * whenever it was reached by the arrow keys or a link. When an activation SHOWS panels further down
 * — the outer tab of a nested pair — each newly visible group's selected tab is announced as well,
 * so a lazy inner panel loads when it appears rather than when somebody clicks it again. A group
 * inside a hidden panel is not announced at start, for the same reason in reverse.
 *
 * NESTING. A panel inside another tabpanel opens its ancestors first, outermost first. A deep link to
 * `#sec-learn-retros` must also open `#sec-learnings` around it, or the inner panel unhides inside a
 * section the outer row still hides, which reads as a dead link.
 *
 * THE HASH. On start and on every `hashchange` for the life of the page, a hash that names a
 * controlled panel activates it, ancestors included, in every group — cross-tab links are how these
 * pages point at each other. WRITING the hash is opt-in per group (`data-tabs-hash`): a page's own
 * tab row should keep the address in step, a card's tab row must not rewrite the page's address.
 * It is written with `replaceState` (switching a tab is not a history entry) and it names only the
 * panel that was asked for: cockpit's engine let the ancestor write last, so clicking
 * `retrospectives` left the address bar on `#sec-learnings` and a reload landed on the wrong tab —
 * measured in a browser, which is worse than no deep link at all.
 *
 * RE-RENDERING. A renderer that re-renders a row renders the current selection. A patcher such as
 * cockpit's `cockpitPatch` writes ATTRIBUTES into the tabs already there and adds no node, so the
 * observer also hears `aria-selected` and `tabindex`: the tab the row marks selected gets the one Tab
 * stop, the panels follow (those outside the patched mount too), and a selection the patch moved is
 * announced. Before that, one patch left every tab at tabindex 0 and the outside panels behind.
 *
 * KEYS (APG, automatic activation): on a focused tab ←/→ move to the previous/next tab with wrap and
 * Home/End to the first/last, skipping disabled tabs (`disabled` or `aria-disabled="true"`); focus
 * moves and the tab is activated. Anything with Alt/Ctrl/Meta is left to the browser, so Alt+←
 * still goes back.
 */

const TAB = '[role="tab"]';
const LIST = '[role="tablist"]';

const seen = new WeakSet(); // tablists that have had their initial state
const current = new WeakMap(); // tablist -> the tab this module last selected in it
let installed = false;

const listOf = (tab) => tab.closest(LIST);
const tabsOf = (list) => Array.from(list.querySelectorAll(TAB)).filter((tab) => listOf(tab) === list);
const panelOf = (tab) => {
  const id = (tab.getAttribute("aria-controls") || "").trim().split(/\s+/)[0];
  return id ? document.getElementById(id) : null;
};
const ownerOf = (panel) =>
  panel.id ? document.querySelector(`${TAB}[aria-controls~="${CSS.escape(panel.id)}"]`) : null;
const enabled = (tab) => !tab.disabled && tab.getAttribute("aria-disabled") !== "true";

// The element the address names, but only when it is a panel some tab controls: a hash pointing at
// a heading, or at nothing, is the page's business.
function hashPanel() {
  let id = location.hash.slice(1);
  if (!id) return null;
  try {
    id = decodeURIComponent(id);
  } catch {
    /* a malformed escape is just an id that matches nothing */
  }
  const panel = document.getElementById(id);
  return panel && ownerOf(panel) ? panel : null;
}

// Select one tab within its own group. Returns whether the selection changed. Only what differs is
// written: the observer below hears every write, and a write that changes nothing would wake it.
function select(tab) {
  const list = listOf(tab);
  if (!list) return false;
  const changed = tab.getAttribute("aria-selected") !== "true";
  for (const each of tabsOf(list)) {
    const on = each === tab;
    if (each.getAttribute("aria-selected") !== String(on)) each.setAttribute("aria-selected", String(on));
    if (each.getAttribute("tabindex") !== (on ? "0" : "-1")) each.tabIndex = on ? 0 : -1;
    const panel = panelOf(each);
    if (panel && panel.hidden === on) panel.hidden = !on;
  }
  current.set(list, tab);
  return changed;
}

// The tab itself and, before it, every tab whose panel encloses it — outermost first.
function ancestry(tab) {
  const chain = [tab];
  let node = (panelOf(tab) || tab).parentElement;
  while (node) {
    const outer = node.closest('[role="tabpanel"]');
    if (!outer) break;
    const owner = ownerOf(outer);
    if (owner) chain.unshift(owner);
    node = outer.parentElement;
  }
  return chain;
}

// Tell the page a tab is active. With `cascade`, its panel just became visible, so every group one
// level down announces its own selected tab too, and so on down.
function announce(tab, cascade) {
  const panel = panelOf(tab);
  tab.dispatchEvent(new CustomEvent("tab-activated", { bubbles: true, detail: { panel } }));
  if (!cascade || !panel) return;
  for (const list of panel.querySelectorAll(LIST)) {
    if (list.parentElement.closest('[role="tabpanel"]') !== panel) continue;
    const selected = tabsOf(list).find((each) => each.getAttribute("aria-selected") === "true");
    if (selected) announce(selected, true);
  }
}

function activate(tab, { writeHash = false } = {}) {
  let first = null;
  for (const each of ancestry(tab)) {
    if (select(each) && !first) first = each;
  }
  const panel = panelOf(tab);
  if (writeHash && panel && listOf(tab)?.hasAttribute("data-tabs-hash")) {
    history.replaceState(history.state, "", `#${panel.id}`);
  }
  // Re-activating the current tab still announces it (a click is intent), but shows nothing new.
  announce(first || tab, Boolean(first));
}

// A group's state: the tab the address names (or whose panel encloses what it names), else the one
// the markup selected — a newly marked one before the one selected until now — else the one
// selected until now, else the first enabled one. The address is consulted only the first time a
// group is seen — a group re-rendered later keeps what the page selected since.
function normalize(list, first, before) {
  const tabs = tabsOf(list);
  if (!tabs.length) return null;
  const target = first ? hashPanel() : null;
  const marked = tabs.filter((tab) => tab.getAttribute("aria-selected") === "true");
  const chosen =
    (target && tabs.find((tab) => {
      const panel = panelOf(tab);
      return enabled(tab) && panel && (panel === target || panel.contains(target));
    })) ||
    marked.find((tab) => tab !== before) ||
    marked[0] ||
    (tabs.includes(before) ? before : null) ||
    tabs.find(enabled) ||
    tabs[0];
  select(chosen);
  return chosen;
}

// Every group that appeared, or whose tabs changed under it, settled in document order so an outer
// group is settled before the groups inside it. A new group announces its tab; a group whose
// selection a re-render MOVED (the tab selected until now is still in the page, and another one is
// selected) announces the new one and the groups its panel shows, like an activation. A group whose
// tabs were rebuilt as new nodes says nothing, as before: a renderer that rebuilds its row on every
// poll would otherwise announce on every poll.
function settle(lists) {
  const said = [];
  for (const list of Array.from(lists).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))) {
    const first = !seen.has(list);
    const before = current.get(list);
    const chosen = normalize(list, first, before);
    if (!chosen) continue; // no tabs yet: a tablist still being parsed is settled when they arrive
    seen.add(list);
    if (first && !said.some(([tab, cascade]) => cascade && panelOf(tab)?.contains(list))) said.push([chosen, false]);
    else if (!first && chosen !== before && before?.isConnected) said.push([chosen, true]);
  }
  for (const [tab, cascade] of said) {
    if (!tab.closest('[role="tabpanel"][hidden]')) announce(tab, cascade);
  }
}

function step(tab, direction) {
  const tabs = tabsOf(listOf(tab));
  const at = tabs.indexOf(tab);
  for (let k = 1; k <= tabs.length; k += 1) {
    const next = tabs[(((at + direction * k) % tabs.length) + tabs.length) % tabs.length];
    if (enabled(next)) return next;
  }
  return null;
}

/**
 * Wire every tablist on the page, and every one rendered later. Idempotent.
 */
function initTabs() {
  if (installed) return;
  installed = true;

  document.addEventListener("click", (event) => {
    const tab = event.target instanceof Element ? event.target.closest(TAB) : null;
    if (!tab || !listOf(tab) || !enabled(tab)) return;
    activate(tab, { writeHash: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tab = event.target instanceof Element ? event.target.closest(TAB) : null;
    if (!tab || !listOf(tab)) return;
    const tabs = tabsOf(listOf(tab)).filter(enabled);
    let next = null;
    if (event.key === "ArrowRight") next = step(tab, 1);
    else if (event.key === "ArrowLeft") next = step(tab, -1);
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    else return;
    event.preventDefault();
    if (!next) return;
    next.focus();
    activate(next, { writeHash: true });
  });

  addEventListener("hashchange", () => {
    const panel = hashPanel();
    const tab = panel && ownerOf(panel);
    if (tab && listOf(tab) && enabled(tab)) activate(tab);
  });

  settle(document.querySelectorAll(LIST));

  new MutationObserver((records) => {
    const lists = new Set();
    for (const record of records) {
      // A DOM patcher (cockpit's `cockpitPatch`) re-renders a row by writing ATTRIBUTES into the tabs
      // already there, so no node is added: one patch left every tab at tabindex 0 and the panels
      // outside the patched mount on the old selection. The bar's `aria-selected` is the truth.
      if (record.type === "attributes") {
        const owner = record.target.matches(TAB) ? listOf(record.target) : null;
        if (owner) lists.add(owner);
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(LIST)) lists.add(node);
        for (const list of node.querySelectorAll(LIST)) lists.add(list);
        // Tabs re-rendered inside a tablist that stayed: the group needs its roving tabindex back.
        for (const tab of node.matches(TAB) ? [node] : node.querySelectorAll(TAB)) {
          const owner = listOf(tab);
          if (owner) lists.add(owner);
        }
      }
    }
    if (lists.size) settle(lists);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-selected", "tabindex"],
  });
}
return { initTabs };
};
//@dd-record terminal deps= exports=initTerminal
records["terminal"] = (__dd) => {
/*
 * danieldeusing-design — terminal session animation.
 *
 * Progressive enhancement for the "live shell" effect: `$ command` prompts type
 * out character by character, then their section's output reveals like the
 * command just ran. Sections play in document order; a section scrolled into
 * view later animates on arrival.
 *
 * Markup contract (styled by components.css):
 *   <section data-term>
 *     <p class="prompt">cat about.txt</p>      <!-- the command that types out -->
 *     <div data-term-out>…</div>               <!-- output, revealed after -->
 *   </section>
 *
 * Honours prefers-reduced-motion: with reduced motion (or JS disabled) the
 * html.term-anim gate is never added, so components.css leaves everything
 * visible. initTerminal() is therefore safe to call unconditionally.
 *
 * After the initial on-screen sections finish, it sets window.termContentDone
 * and dispatches a "term:contentdone" event — a hook for chaining a follow-up
 * animation (e.g. a nav that "runs" once the page has finished printing).
 *
 * On `beforeprint` the whole session is fast-forwarded, so a page printed while
 * it is still typing prints complete. src/print.css covers the CSS half of this
 * (nothing stays hidden); only the truncated prompt text needs JS.
 */

let started = false;

function initTerminal() {
  if (typeof window === "undefined") return;
  // Once per page: a second call queued every section again, behind a second print listener and a
  // second observer.
  if (started) return;
  started = true;

  // Animation policy: an explicit pick (localStorage "anim", e.g. from a footer
  // toggle) wins over the OS setting. "off" — or no pick while the OS prefers
  // reduced motion — disables every animation by marking html.anim-off
  // (components.css then kills keyframes and hides the cursor). An explicit "on"
  // animates even when the OS prefers reduced motion.
  let animPref = null;
  try {
    animPref = localStorage.getItem("anim");
  } catch {
    /* localStorage can throw in private mode / sandboxed frames */
  }
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animPref === "off" || (animPref === null && prefersReduced)) {
    document.documentElement.classList.add("anim-off");
    return;
  }
  // already gated off pre-paint (e.g. by an inline script) — respect it
  if (document.documentElement.classList.contains("anim-off")) return;

  document.documentElement.classList.add("term-anim");

  const typePrompt = (prompt) =>
    new Promise((finished) => {
      const text = (prompt.textContent || "").trim();
      const typedText = document.createTextNode("");
      const caret = document.createElement("span");
      caret.className = "term-caret";
      caret.setAttribute("aria-hidden", "true");
      prompt.textContent = "";
      prompt.classList.add("term-live");
      prompt.append(typedText, caret);
      // ~35ms per character, capped so long commands finish within ~700ms
      const perCharMs = Math.min(38, 700 / Math.max(text.length, 1));
      let typedCount = 0;
      const typeNext = () => {
        if (typedCount < text.length) {
          typedCount += 1;
          typedText.data = text.slice(0, typedCount);
          setTimeout(typeNext, perCharMs * (0.75 + Math.random() * 0.5));
        } else {
          caret.remove();
          finished();
        }
      };
      typeNext();
    });

  const revealOutputs = (section, instant) =>
    new Promise((finished) => {
      const chunks = section.querySelectorAll("[data-term-out]");
      const stagger = (index) => Math.min(index * 70, 280);
      chunks.forEach((chunk, index) => {
        if (instant) chunk.classList.add("term-show");
        else setTimeout(() => chunk.classList.add("term-show"), stagger(index));
      });
      if (instant) finished();
      else setTimeout(finished, stagger(chunks.length - 1) + 200);
    });

  const playSection = async (section) => {
    const rect = section.getBoundingClientRect();
    const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
    const prompt = section.querySelector(".prompt");
    if (prompt) {
      if (offscreen) prompt.classList.add("term-live");
      else await typePrompt(prompt);
    }
    // reveal the box and let its rows cascade in, but don't await it: the box
    // animation runs in parallel so the next prompt keeps typing and nothing
    // waits on a box finishing.
    void revealOutputs(section, offscreen);
  };

  // sections play one after another, in the order they were triggered
  let sequence = Promise.resolve();
  const enqueue = (section) => {
    sequence = sequence.then(() => playSection(section));
  };

  // Printing must never show a half-typed page. src/print.css forces the
  // revealed state for everything CSS can reach, but a prompt caught mid-type
  // has been truncated in the DOM — no stylesheet can put those characters
  // back. Snapshot the text up front and restore it synchronously when the
  // browser announces a print.
  const finishForPrint = () => {
    document.querySelectorAll("[data-term] .prompt").forEach((prompt) => {
      if (prompt.dataset.termText !== undefined) prompt.textContent = prompt.dataset.termText;
      prompt.classList.add("term-live");
    });
    document.querySelectorAll("[data-term] [data-term-out]").forEach((chunk) => chunk.classList.add("term-show"));
  };

  const start = () => {
    document.querySelectorAll("[data-term] .prompt").forEach((prompt) => {
      prompt.dataset.termText = (prompt.textContent || "").trim();
    });
    window.addEventListener("beforeprint", finishForPrint);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            enqueue(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    // keep a rooted reference: some engines GC observers held only by their targets
    window.termAnimObserver = observer;
    document.querySelectorAll("[data-term]").forEach((section) => {
      // in or above the viewport: part of the load sequence (playSection reveals
      // already-passed sections instantly); below: animate on scroll-in
      if (section.getBoundingClientRect().top < window.innerHeight) enqueue(section);
      else observer.observe(section);
    });
    // once the initial on-screen content has finished, signal it so callers can
    // chain a follow-up (e.g. a nav that "runs" afterwards)
    sequence = sequence.then(() => {
      window.termContentDone = true;
      window.dispatchEvent(new Event("term:contentdone"));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
return { initTerminal };
};
//@dd-record theme deps= exports=THEMES,THEME_BACKGROUNDS,getStoredTheme,applyTheme,setTheme,applyStoredTheme,initThemeSwitcher
records["theme"] = (__dd) => {
/*
 * danieldeusing-design — theme runtime.
 *
 * Framework-agnostic theme switching for the four terminal variants. No
 * dependencies. The active theme lives in html[data-theme] and persists in
 * localStorage under "theme".
 *
 * To avoid a flash of the wrong theme, call applyStoredTheme() from an inline
 * <head> script BEFORE first paint (see the snippet in the README). Then call
 * initThemeSwitcher() after the DOM is ready to wire up the toggle controls.
 */

/** @typedef {"warm" | "green" | "mono" | "paper"} Theme */

/** All available themes, in menu order. */
const THEMES = /** @type {const} */ (["warm", "green", "mono", "paper"]);

/** Each theme's background, mirrored into <meta name="theme-color"> for mobile chrome. */
const THEME_BACKGROUNDS = {
  warm: "#f5efe2",
  green: "#020604",
  mono: "#050505",
  paper: "#fafafa",
};

const STORAGE_KEY = "theme";
const DEFAULT_THEME = "warm";

/** The persisted theme, or "warm" if none/invalid. */
function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(/** @type {Theme} */ (stored))) return stored;
  } catch {
    /* localStorage can throw in private mode / sandboxed frames */
  }
  return DEFAULT_THEME;
}

/**
 * Apply a theme to <html> and sync the meta theme-color. Does NOT persist —
 * use setTheme() for that.
 *
 * @param {Theme} theme
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 *   faviconHref, if given, also updates <link id="favicon"> — useful for apps
 *   that ship a per-theme favicon. Omit to leave the favicon untouched.
 */
function applyTheme(theme, options = {}) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS[DEFAULT_THEME]);
  if (options.faviconHref) {
    document.getElementById("favicon")?.setAttribute("href", options.faviconHref(theme));
  }
}

/**
 * Persist and apply a theme. No-op for an unknown theme name.
 * @param {Theme} theme
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
function setTheme(theme, options) {
  if (!THEMES.includes(theme)) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme, options);
}

/**
 * Apply the persisted theme. Call this pre-paint (inline, in <head>) to prevent
 * a flash of the default theme on load.
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
function applyStoredTheme(options) {
  applyTheme(getStoredTheme(), options);
}

const CONTROLS = "[data-theme-value], [data-theme-label]";
let switcherOptions;
let switcherWired = false;

/*
 * THE ACTIVE THEME IS A STATE, NOT A COLOUR (0.60.0). It used to be marked only by a stylesheet
 * rule per theme — `html[data-theme="green"] .dropdown-item[data-theme-value="green"]` painted in
 * --primary with a glow — so a screen reader heard four identical buttons and no hint which one
 * was in force. The state now lives on the item, where both the reader and the stylesheet read it:
 *   · inside a dropdown menu the items are `role="menuitemradio"` with `aria-checked`, which is
 *     what an APG menu of one-of-several settings is, and what draws the ✓ (components.css);
 *   · anywhere else (the burger's inline list) a menuitem role would claim a menu that is not
 *     there, so the item is a toggle button with `aria-pressed`, which draws the same ✓.
 * Re-synced on every theme change from ANY source — a pick here, setTheme() from page code, a
 * reload — because the observer watches html[data-theme] itself rather than trusting a click.
 */
function syncThemeControls() {
  const theme = document.documentElement.dataset.theme ?? DEFAULT_THEME;
  for (const label of document.querySelectorAll("[data-theme-label]")) {
    if (label.textContent !== theme) label.textContent = theme;
  }
  for (const item of document.querySelectorAll("[data-theme-value]")) {
    const chosen = String(item.getAttribute("data-theme-value") === theme);
    // Written only when it changes: this runs on every theme change and every call, and an
    // unchanged write still wakes every attribute observer on the page.
    const set = (name, value) => { if (item.getAttribute(name) !== value) item.setAttribute(name, value); };
    if (item.closest("details.dropdown .dropdown-panel")) {
      set("role", "menuitemradio");
      set("aria-checked", chosen);
    } else {
      set("aria-pressed", chosen);
    }
  }
}

/**
 * Wire up every theme switcher built from the standard markup, including ones rendered later:
 *   <button data-theme-value="green">green</button>   (one per theme)
 *   <span data-theme-label></span>                     (shows the active theme)
 * Items inside a `details.dropdown` become `menuitemradio` + `aria-checked`; items elsewhere carry
 * `aria-pressed`. Call once; a second call only replaces the options.
 * @param {{ faviconHref?: (theme: Theme) => string }} [options]
 */
function initThemeSwitcher(options) {
  switcherOptions = options;
  syncThemeControls();
  if (switcherWired) return;
  switcherWired = true;

  // Delegated, so a switcher rendered after this call still switches.
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-theme-value]") : null;
    const theme = button?.getAttribute("data-theme-value");
    if (!theme) return;
    setTheme(/** @type {Theme} */ (theme), switcherOptions);
    syncThemeControls();
    // close the enclosing dropdown after a pick (no-op if not inside one)
    button.closest("details.dropdown")?.removeAttribute("open");
  });

  new MutationObserver((records) => {
    const relevant = records.some(
      (record) =>
        record.type === "attributes" ||
        [...record.addedNodes].some((node) => node instanceof Element && (node.matches(CONTROLS) || node.querySelector(CONTROLS))),
    );
    if (relevant) syncThemeControls();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], childList: true, subtree: true });
}
return { THEMES, THEME_BACKGROUNDS, getStoredTheme, applyTheme, setTheme, applyStoredTheme, initThemeSwitcher };
};
//@dd-record tickstrip deps=time exports=renderTickStrip,initTickStrips
records["tickstrip"] = (__dd) => {
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
const { formatAgo, formatDuration, parseInstant } = __dd("time");

const COLUMNS = ["state", "poller", "last run", "next run", "figures"];

const written = new WeakMap(); // figures cell -> the markup last written into it
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
  // Compared with what was last WRITTEN, not read back: esc() writes &#39; and innerHTML serialises it
  // as a bare apostrophe, so a read-back comparison rebuilt the figures on every 1 s tick.
  if (written.get(stats) !== view.stats) {
    stats.innerHTML = view.stats;
    written.set(stats, view.stats);
  }
}

/**
 * Render `items` into `mount` — the first time as a table, every time after by patching each row in
 * place by `key`.
 *
 * @param {HTMLElement|string} mount the `.tickstrip` element, or its id
 * @param {object[]} items registrations, already in display order
 */
function renderTickStrip(mount, items) {
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
    const views = items.map((item) => describe(item, now));
    host.innerHTML = `<table class="ticktable"><caption class="visually-hidden">${esc(caption)}</caption>` +
      `<thead><tr>${COLUMNS.map((c) => `<th scope="col"><span class="visually-hidden">${c}</span></th>`).join("")}</tr></thead>` +
      `<tbody>${items.map((item, i) => rowHtml(item, views[i])).join("")}</tbody></table>`;
    // Seeded here, or the first tick finds nothing written and rewrites every figures cell once.
    Array.from(host.querySelector("tbody").rows).forEach((row, i) => written.set(row.cells[4], views[i].stats));
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
      written.set(row.cells[4], view.stats);
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
function initTickStrips() {
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
return { renderTickStrip, initTickStrips };
};
//@dd-record time deps= exports=parseInstant,stampParts,formatStamp,formatDuration,formatAgo,whenHtml,initRelativeTimes
records["time"] = (__dd) => {
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

// The ISO-8601 shape every store in the estate writes for an instant: a date AND a time, with an
// optional fraction and an optional `Z` / `±HH:MM`. A space may stand for the `T` — the system's own
// stamp shape reads back as local time. A date alone ("2026-09-28") is a calendar date, not an
// instant: engines read it as UTC midnight, which printed the day before in São Paulo. It is echoed
// as written, with no time and no zone.
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

// The right shape can still name a day that does not exist, and V8 ROLLS it over: "2026-02-30" is the
// 2nd of March to Chrome and nothing to Firefox. So the fields are checked before any engine sees them.
const onTheCalendar = ([, year, month, day, hour = 0, minute = 0, second = 0]) =>
  month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
  hour <= 23 && minute <= 59 && second <= 59;

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
function parseInstant(value) {
  if (value == null || value === "") return null;
  let time = NaN;
  if (value instanceof Date || typeof value === "number") time = new Date(value).getTime();
  else if (typeof value === "string") {
    const text = value.trim();
    const fields = ISO_INSTANT.exec(text);
    if (fields && onTheCalendar(fields)) time = new Date(text.replace(" ", "T")).getTime();
  }
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
 *   `text` is `YYYY-MM-DD HH:MM:SS`; `utc` the ISO string; `zone` `Z` or `±HH:MM`. Nullish, "" or an
 *   invalid Date gives every part ""; an unparseable value (a date alone included) is echoed in
 *   `date`, `utc` and `text`.
 */
function stampParts(value) {
  // An invalid Date has no input left to echo — String() of it is "Invalid Date" — so it is nothing.
  if (value == null || value === "" || (value instanceof Date && Number.isNaN(value.getTime()))) return { date: "", time: "", zone: "", utc: "", text: "" };
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
function formatStamp(value) {
  return stampParts(value).text;
}

/**
 * A span of time, floored into the largest unit that is at least 1.
 *
 * @param {number} ms
 * @param {{style?: "short"|"long"}} [options] short: "48s" "3m" "4mo"; long: "48 seconds" "1 year"
 * @returns {string} Negative or non-finite spans are "0s" / "0 seconds".
 */
function formatDuration(ms, { style = "short" } = {}) {
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
function formatAgo(value, { style = "long", now = Date.now() } = {}) {
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
function whenHtml(value, { inline = false, style = inline ? "short" : "long" } = {}) {
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
function initRelativeTimes() {
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
return { parseInstant, stampParts, formatStamp, formatDuration, formatAgo, whenHtml, initRelativeTimes };
};
//@dd-record toc deps= exports=initToc
records["toc"] = (__dd) => {
/*
 * toc.js — the table of contents' scroll-spy (src/chrome.css `.toc`, `.navlist`).
 *
 * Markup contract:
 *   <aside class="toc">
 *     <nav class="navlist toc-inner" aria-labelledby="toc-h">
 *       <p class="navlist-label" id="toc-h">on this page</p>
 *       <ol>
 *         <li><a href="#overview" data-toc-link="overview">overview</a></li>
 *         <li class="navlist-sub"><a href="#steps" data-toc-link="steps">steps</a></li>
 *       </ol>
 *     </nav>
 *   </aside>
 * `data-toc-link` names the id of the section (or heading) the entry points at.
 *
 * WHAT IT MARKS: `aria-current="true"` on ONE entry — the last one whose target has reached the
 * reading line, 30% of the way down the viewport — and on no other. The two spies this replaces
 * (cockpit's portal.js and danieldeusing.de's article page) toggled a CLASS, so the highlight was
 * painted and never said; the attribute is what a screen reader announces, and the stylesheet keys
 * on it.
 *
 * The line is the bottom of the band `rootMargin: 0 0 -70% 0`, the value both sources had settled
 * on independently: a section becomes current as it reaches the top of the page, not when its last
 * line leaves the bottom. The observer only says WHEN to look: on every callback the current entry
 * is recomputed from where every target is now (one rect read per target). Its entries alone are
 * not enough, because an instant jump can carry a target from above the band to below it without
 * ever crossing it, and then no entry is delivered for that target at all: measured, 6 of 11
 * upward TOC clicks left a lower section marked, and scrollTo(0) from the bottom left the last one.
 *
 * THE LAST TARGET PAST THE LINE, NOT THE TOPMOST ONE IN THE BAND. Both sources marked the topmost
 * target intersecting the band, which is right for small targets (pagr's headings) and wrong for
 * sections (cockpit's): a TOC link lands its section at the scroll padding, a line under the
 * toolbar, and the PREVIOUS section's last 40px still sits inside the band above it. Measured on
 * the specimen page, every one of five TOC clicks marked the section before the one clicked. With
 * sections or headings alike, the last target whose top is above the line is the one being read.
 *
 * Above the first target nothing is marked: the reader is in the page's introduction. A last
 * section shorter than the lower 70% of the viewport never reaches the line; give the page room
 * below it (its bottom padding) if its TOC must be able to mark it.
 *
 * Entries and targets rendered after the call are picked up, and a target that goes is let go (one
 * MutationObserver, as the other runtime modules do), so a page that builds its sections from data
 * needs no second call. The mark is recomputed when a renderer rewrites it: a list re-rendered
 * from markup that never carries `aria-current` (cockpit's dom-patch writes attributes in place)
 * would otherwise lose the mark until the next scroll crossed a line.
 *
 * ONE SPY PER ROOT: a second call returns the first call's handle. And a rewritten mark is answered by
 * recomputing it from where the targets are, never by re-asserting what this instance last stored.
 * Re-asserting hung the tab: two spies over the same entries (a second call, or `initToc()` and then
 * `initToc(aside)`) each wrote back their own `current` over the other's, in microtasks, for ever.
 *
 * @param {ParentNode} [root=document] where the entries live
 * @returns {{ destroy(): void }} stops the spy and clears the mark
 */
function initToc(root = document) {
  if (spies.has(root)) return spies.get(root);
  const observed = new Set();
  let current = null;

  const links = () => [...root.querySelectorAll("[data-toc-link]")];
  // Writes only what changed: this runs on every re-render the page does, not only on a scroll.
  const mark = () => {
    for (const link of links()) {
      const on = link.getAttribute("data-toc-link") === current;
      if (on && link.getAttribute("aria-current") !== "true") link.setAttribute("aria-current", "true");
      else if (!on && link.hasAttribute("aria-current")) link.removeAttribute("aria-current");
    }
  };
  // The last entry, in the ORDER OF THE LIST (the order of the page), whose target's top has
  // reached the line — read from where the targets are now, never from which ones crossed.
  // The line is the band's bottom, computed the same way by every spy on the page: two spies over
  // one entry must never disagree about which side of it a target is on.
  const update = () => {
    current = null;
    const line = document.documentElement.clientHeight * 0.3;
    for (const link of links()) {
      const target = document.getElementById(link.getAttribute("data-toc-link"));
      if (target && target.getBoundingClientRect().top <= line) current = link.getAttribute("data-toc-link");
    }
    mark();
  };

  const spy = new IntersectionObserver(update, { rootMargin: "0px 0px -70% 0px" });

  const observeTargets = () => {
    // A target that left the page is let go, or a page that redraws its sections every poll would
    // pile up detached nodes in the observer for the life of the tab.
    for (const target of observed) {
      if (target.isConnected) continue;
      spy.unobserve(target);
      observed.delete(target);
    }
    for (const link of links()) {
      const target = document.getElementById(link.getAttribute("data-toc-link"));
      if (!target || observed.has(target)) continue;
      observed.add(target);
      spy.observe(target);
    }
  };
  observeTargets();

  const watcher = new MutationObserver((records) => {
    let moved = false;
    let rewritten = false;
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.attributeName === "data-toc-link") moved = true;
        else rewritten = true;
      } else if ([...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element)) {
        moved = true;
      }
    }
    if (moved) {
      observeTargets();
      update();
    } else if (rewritten) {
      update();
    }
  });
  // The whole document, not `root`: the entries live in root, their targets anywhere on the page.
  watcher.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "data-toc-link"] });

  const handle = {
    destroy() {
      spies.delete(root);
      spy.disconnect();
      watcher.disconnect();
      current = null;
      mark();
    },
  };
  spies.set(root, handle);
  return handle;
}

// root -> its spy's handle (see ONE SPY PER ROOT above).
const spies = new WeakMap();
return { initToc };
};
//@dd-record tooltip deps= exports=initTooltips
records["tooltip"] = (__dd) => {
/*
 * tooltip.js — viewport-clamped hover/focus tooltips for `[data-tip]`.
 *
 * Markup contract:
 *   <span data-tip="Explanation shown on hover">metric</span>
 *   <span data-tip="+210 −109" data-tip-parts='[{"text":"+210","tone":"success"}," ",{"text":"−109","tone":"destructive"}]'>M</span>
 *     (0.61.0: toned segments. data-tip stays the tip and what a screen reader hears — see renderTip.)
 *
 * THIS REPLACES THE NATIVE `title`, AND THAT IS THE POINT. A `title` is the browser's tooltip: it
 * appears after roughly a second of hovering, is unstyled, cannot be reached by keyboard on most
 * engines, and does not exist at all on a touch screen. `data-tip` shows INSTANTLY, wears the
 * estate's own look, opens on focus as well as hover, and is clamped into the viewport.
 *
 * NAME vs DESCRIPTION — the distinction that makes the swap safe, and the one it is easy to get
 * wrong. `title` does two unrelated jobs, and only one of them belongs here:
 *   · on an element with visible text, `title` is a DESCRIPTION → `data-tip`.
 *   · on an icon button with no text, `title` is the element's accessible NAME → `aria-label`.
 *     Replacing that one with `data-tip` alone leaves a button announced as "button".
 * An icon button that also wants a hover takes BOTH: `aria-label` names it, `data-tip` explains it.
 *
 * One singleton panel (`#ddtip`, styled in src/tooltip.css) is appended to
 * <body> and positioned with `position: fixed`, so it escapes every overflow/
 * clip context and always renders on top. Placement prefers below the anchor,
 * flips above when there is no room, and clamps horizontally to the viewport —
 * a tooltip must never be cut off. Event delegation means dynamically rendered
 * [data-tip] nodes just work.
 *
 * Escape hides it (WCAG 1.4.13: dismissible without moving the pointer or the
 * focus), and it moves into an open <dialog> when its anchor is in one — see
 * show().
 */
let installed = false;

// The tone vocabulary, as tokens.css maps it (`[data-tone="…"] { --tone: … }`). A tone in
// data-tip-parts outside this set renders untoned; check-overlays holds the two lists equal.
const TONES = new Set(["primary", "success", "warning", "destructive", "info", "pending", "muted"]);
const TIP_ATTRS = ["data-tip", "data-tip-parts"];

function initTooltips() {
  // A module flag, not only the id: the panel can be inside a <dialog> that a page has since
  // removed, and a second call must not build a second panel with a second set of listeners.
  if (installed || document.getElementById("ddtip")) return;
  installed = true;
  const tip = document.createElement("div");
  tip.id = "ddtip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);

  let anchor = null;
  const warned = new WeakSet();
  const warnOnce = (el, message, detail) => {
    if (warned.has(el)) return;
    warned.add(el);
    console.warn(`initTooltips: ${message}`, detail, el);
  };

  // A TOOLTIP MUST NEVER COVER AN OPEN SELECT (Daniel, screenshot 2026-08-15).
  //
  // The tip panel is `position: fixed; z-index: 9999` — deliberately above everything, so it can
  // never be clipped by an overflow container. `.select-panel` is z-index 60. So when a select's
  // listbox is open and the pointer is anywhere near a `[data-tip]` — very often the ⓘ INSIDE the
  // trigger's own label — the tip paints straight over the options you are trying to read.
  //
  // Suppressing beats re-positioning. A tip that flips to the other side still fights a panel that
  // can be full-width and viewport-tall, and "somewhere else on screen" is not a promise this can
  // keep. While a listbox is open the choices ARE the content; an informational aside about the
  // control you already opened is not worth a single covered option.
  //
  // Checked through the DOM rather than by importing select.js: the panel only exists while open,
  // so its presence IS the state. No shared module variable, no import cycle, and it stays correct
  // for any future component that renders a `.select-panel`.
  //
  // `details.dropdown[open]` is the same situation with the other menu component (0.45.1): the
  // trigger is a summary that very often carries the data-tip itself, so "hover, then click to
  // open" put the tip straight over the menu it had just explained. While a menu is open the
  // choices ARE the content; the aside waits.
  //
  // THE SAME RULE, WIDENED (0.60.0). Every list that drops down is a `.select-panel` now — the
  // listbox, the filter dropdown, the autocomplete list and the context menu — so the one selector
  // covers all of them. And a tip is refused on an anchor whose OWN popup is open
  // (`[aria-haspopup][aria-expanded="true"]`, configr's rule): the popup the tip explains is on
  // screen, and the tip would sit on top of it.
  //
  // ONLY WHAT IS OUTSIDE THE LIST WAITS (0.60.0). A tip on a row INSIDE the open list is the list's
  // own — an option saying what it is, which select.js copies onto the row it builds — and refusing
  // every tip while any list existed meant those never showed at all.
  const listIsOpen = () => Boolean(document.querySelector(".select-panel, details.dropdown[open]"));
  const inList = (el) => Boolean(el.closest(".select-panel, .dropdown-panel"));
  const OPEN_POPUP = '[aria-haspopup][aria-expanded="true"]';
  // SHOWN MEANS ON SCREEN, not "display was set": a panel left inside a dialog that has since
  // closed keeps its `display: grid` and has no box, and an Escape it swallowed would be an Escape
  // the page never gets.
  const showing = () => tip.style.display === "grid" && tip.getClientRects().length > 0;

  // SHOW IS IDEMPOTENT, AND THAT IS WHAT KEEPS A TIPPED CONTROL CLICKABLE.
  //
  // `mouseover` does not fire once per hover. It fires again every time the browser re-resolves
  // what is under the cursor — which, on a live-refreshing table, is constantly, and which happens
  // DURING a click: the real sequence on cockpit's activity table was mouseover, mouseover,
  // pointerdown, mousedown, mouseover, pointerup, mouseup, mouseover, all without the mouse
  // moving. Each of those re-ran the whole of show(): display none -> block, two forced
  // getBoundingClientRect() reads, four style writes.
  //
  // That churn is what broke the hit-test. pointerdown and pointerup resolved to the control,
  // while the compatibility MOUSE events resolved to an ancestor — mousedown and mouseup on the
  // <tbody> rather than the <button> — and a `click` is only synthesised when the press and the
  // release agreed on their target. So no click was ever produced and the handler never ran, on
  // every tooltipped control in a table. Cockpit shipped both its join buttons with the tooltip
  // REMOVED as a workaround.
  //
  // PROVEN by suppressing re-entry and nothing else: with the panel left SHOWING but show()
  // prevented from running again, the same click at the same pixel gave mousedown:BUTTON ->
  // click:BUTTON and the dialog opened.
  //
  // ⚠️ The guard is on the ANCHOR, not on visibility, and the scroll handler below calls place()
  // rather than show() for exactly this reason: a tooltip must still FOLLOW its anchor when the
  // page scrolls, and a guard that made repositioning a no-op would trade a dead button for a
  // tooltip stranded where the anchor used to be.
  function show(el) {
    if ((listIsOpen() && !inList(el)) || el.closest(OPEN_POPUP)) return;
    if (anchor === el) return;
    // POINT THE ANCHOR AT THE PANEL. `role="tooltip"` alone describes nothing: without
    // aria-describedby the panel is a div a screen reader never reaches, so `data-tip` was
    // announced to nobody while the native `title` it replaces IS announced. Any estate converting
    // `title` to `data-tip` — which is the whole point of this component — would have been trading
    // a slow tooltip for a silent one.
    //
    // Set per show and REMOVED on hide rather than written once at init: a stale describedby
    // pointing at a hidden panel makes every anchor claim a description it is not showing.
    if (anchor && anchor !== el) removeDescription(anchor);
    anchor = el;
    describe(el);
    // INTO THE TOP LAYER WITH ITS ANCHOR. A modal <dialog> renders above everything on the page,
    // `z-index: 9999` included — z-index orders boxes WITHIN a layer, and the top layer is above
    // all of them. So a panel on <body> showed for a control inside a dialog, correctly placed and
    // entirely hidden behind the dialog. Appended to the dialog it is part of the dialog's layer,
    // and `position: fixed` still escapes the dialog's own `overflow: hidden`.
    //
    // Moved only when it is not already there. Re-parenting is a DOM write during a hover, and
    // this module's history (below) is what happens when writes during a hover are not idempotent.
    const host = el.closest("dialog[open]") ?? document.body;
    if (tip.parentNode !== host) host.appendChild(tip);
    renderTip(el);
    tip.style.display = "grid";
    place();
  }

  // A TOOLTIP IS A LIST, NOT A PARAGRAPH.
  //
  // Every tip in this estate is already written as `a · b · c` — the separator is the house
  // convention and predates this function by months. It was then rendered into `white-space:
  // normal` as one textContent, so a six-part tip arrived as a wall of prose wrapped at 340px and
  // the reader had to find the `·`s to parse it. Daniel, on a model/cost tip: "the data is good,
  // but the format not … just make it better readable."
  //
  // So the SEPARATOR IS THE FORMAT. Splitting on it here fixes every `[data-tip]` on every surface
  // at once — 118 of them in cockpit alone — with no call site touched, which is the only version
  // of this that reaches the tables nobody remembers to update.
  //
  // Three shapes, in order of how much the caller has to know:
  //   "a · b"        → two lines. Free, and what every existing tip already gets.
  //   "k\tv"         → a key/value ROW: label left in muted, value right. For genuinely tabular
  //                    tips (a cost breakdown), opt-in per line.
  //   "(aside)"      → muted. Provenance and caveats are written that way across the estate
  //                    already, so they de-emphasise themselves without anybody marking them up.
  //
  // Built with textContent per node, never innerHTML: a tip routinely carries a model name or a
  // branch an agent chose, and this component must not be the one that renders it as markup.
  //
  // TONED SEGMENTS (0.61.0). `data-tip-parts` is the same tip as a JSON array of segments — a
  // string, or `{"text": "+210", "tone": "success"}` — so "+210 −109 · 319 lines" can show the
  // counts green and red. The rows above are cut from the JOINED text and each row then takes the
  // slices of the segments it spans, so ` · `, `\t` and `(aside)` work exactly as in a plain tip and
  // a separator may sit inside a segment or between two. A tone is a word from the fixed set and
  // lands in `data-tone` (tokens.css maps it to `--tone`, tooltip.css paints it); anything else is
  // untoned and never reaches a class or a style. Text still goes in by textContent only.
  //
  // `data-tip` stays the tip: it is the fallback and it is what a screen reader hears — the panel
  // is labelled with it while parts are shown (see renderTip), so the tones are visual only.
  function renderTip(el) {
    tip.replaceChildren();
    const text = el.getAttribute("data-tip") ?? "";
    const parts = partsOf(el, text);
    const segments = parts ?? [{ text, tone: null }];
    if (!parts) tip.removeAttribute("aria-label");
    else if (tip.getAttribute("aria-label") !== text) tip.setAttribute("aria-label", text);
    const joined = segments.map((s) => s.text).join("");

    // [a, b) of `joined` into `node`: a text node per untoned slice, a span per toned one.
    const fill = (node, a, b) => {
      [a, b] = trim(a, b);
      let at = 0;
      for (const { text: part, tone } of segments) {
        const from = Math.max(a, at), to = Math.min(b, at + part.length);
        if (from < to) {
          const slice = part.slice(from - at, to - at);
          if (tone) {
            const span = document.createElement("span");
            span.setAttribute("data-tone", tone);
            span.textContent = slice;
            node.appendChild(span);
          } else node.appendChild(document.createTextNode(slice));
        }
        at += part.length;
      }
      return node;
    };
    const trim = (a, b) => {
      while (a < b && /\s/.test(joined[a])) a += 1;
      while (b > a && /\s/.test(joined[b - 1])) b -= 1;
      return [a, b];
    };

    const lines = [];
    let start = 0;
    for (const m of joined.matchAll(/\n| · /g)) {
      lines.push(trim(start, m.index));
      start = m.index + m[0].length;
    }
    lines.push(trim(start, joined.length));
    for (const [a, b] of lines) {
      if (a === b) continue;
      const row = document.createElement("div");
      const tab = joined.indexOf("\t", a);
      if (tab !== -1 && tab < b) {
        row.className = "ddtip-row";
        const k = document.createElement("span");
        k.className = "ddtip-k";
        const v = document.createElement("span");
        v.className = "ddtip-v";
        row.append(fill(k, a, tab), fill(v, tab + 1, b));
      } else {
        row.className = joined[a] === "(" ? "ddtip-line ddtip-aside" : "ddtip-line";
        fill(row, a, b);
      }
      tip.appendChild(row);
    }
  }

  // The parts, or null for "render data-tip". Broken JSON, a non-array or an item that is neither a
  // string nor `{text: string}` falls back whole — half a tip rendered from a broken list would say
  // something neither attribute says. Each such element is warned about ONCE, not on every hover,
  // and so is a list whose text is not what `data-tip` says (a screen reader hears only data-tip).
  function partsOf(el, text) {
    const raw = el.getAttribute("data-tip-parts");
    if (raw == null) return null;
    let list;
    try { list = JSON.parse(raw); } catch { list = null; }
    const ok = Array.isArray(list) && list.every((p) => typeof p === "string" || typeof p?.text === "string");
    if (!ok) {
      warnOnce(el, "data-tip-parts is not a JSON array of strings and {text, tone} objects — showing data-tip instead", raw);
      return null;
    }
    const segments = list.map((p) => (typeof p === "string" ? { text: p, tone: null }
      : { text: p.text, tone: TONES.has(p.tone) ? p.tone : null }));
    const flat = (s) => s.replace(/\s+/g, " ").trim();
    if (flat(segments.map((s) => s.text).join("")) !== flat(text)) {
      warnOnce(el, "data-tip-parts does not say what data-tip says — a screen reader hears only data-tip", { parts: raw, tip: text });
    }
    return segments;
  }

  // WHERE THE PANEL GOES. Split out of show() so a scroll can re-place a tooltip that is already
  // open without going through show()'s anchor guard.
  function place() {
    if (!anchor) return;
    const el = anchor;
    // PARK IT OFF-SCREEN TO MEASURE IT, NEVER AT THE VIEWPORT ORIGIN.
    //
    // This said `top: 0px`, and that one line cost every tooltipped control its CLICKS.
    //
    // The panel has to be measured before it can be placed — `t.width` decides the horizontal
    // clamp and `t.height` decides whether it flips above the anchor — and it has to be measured
    // UNCONSTRAINED, because a fixed element with only `left` set gets `viewport - left` of
    // available width. Measuring it where it last sat therefore reports a panel narrower than it
    // really is whenever the previous anchor was over on the right. Hence the park, and the park
    // is still here: `left: 0` is what makes the measurement honest.
    //
    // What was wrong was parking it at `top: 0` — INSIDE the viewport, i.e. somewhere a pointer
    // can be. show() runs from `mouseover`, so this momentarily drops a 340px panel into the
    // viewport under the cursor and then forces a synchronous reflow by reading
    // getBoundingClientRect(). The browser's hit-test does not survive that: the pointer events
    // still resolve to the control (they carry the target the pointer was already on), but the
    // COMPATIBILITY MOUSE EVENTS that follow resolve to an ancestor — mousedown and mouseup land
    // on the <tbody> rather than the <button> — and a `click` is only generated when both landed
    // on the same node. So no click is ever produced and the handler never runs.
    //
    // MEASURED, on cockpit's execution table, same button and same pixel, toggling one thing at a
    // time (`pointer-events: none` on the panel does NOT save it — the panel never receives the
    // event, the CONTROL loses it):
    //   park at top: 0        -> pointerdown:BUTTON, mousedown:TBODY, mouseup:TBODY, no click
    //   no park at all        -> pointerdown/mousedown/mouseup/click all BUTTON  (but mis-measures)
    //   same work in rAF      -> all BUTTON  (correct, but costs a frame and the tip stops being instant)
    //   park at top: -9999px  -> all BUTTON, and t.width/t.height identical to the top: 0 reading
    // The last one keeps the measurement, keeps show() synchronous, and is this line.
    //
    // A fixed element above the viewport creates no scrollable overflow, so parking it here costs
    // nothing and moves nothing.
    tip.style.left = "0px";
    tip.style.top = "-9999px";
    const margin = 8;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const x = Math.min(Math.max(r.left, margin), window.innerWidth - t.width - margin);
    let y = r.bottom + 6;
    if (y + t.height > window.innerHeight - margin) y = r.top - t.height - 6;
    if (y < margin) y = margin;
    // DIVIDE BY THE ZOOM. Consumers set `zoom` on <html> (cockpit scales the whole layout to a
    // 1920 reference), and the two sides of this calculation live in different coordinate spaces:
    // getBoundingClientRect() and window.innerWidth are VISUAL px — already multiplied — while
    // style.left is a CSS length the browser multiplies AGAIN on the way out. So the tooltip
    // rendered at x*zoom, an error that grows with distance from the origin: measured at zoom
    // 1.35, an anchor 198px in got a tooltip 69px adrift and one 949px in got 329px, far enough
    // to leave the viewport entirely.
    //
    // Only the WRITE is converted. The clamp above is already correct because both its operands
    // are visual, and "fixing" it too would break it in the other direction.
    const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
    tip.style.left = x / zoom + "px";
    tip.style.top = y / zoom + "px";
  }
  // HIDING THE PANEL AND RELEASING THE ANCHOR ARE TWO DIFFERENT ACTS, and keeping them fused is
  // what cost every tooltipped control its clicks.
  //
  // `hidePanel()` is visual only. `hide()` also releases the anchor, which means touching the
  // anchor's `aria-describedby`.
  function hidePanel() {
    tip.style.display = "none";
  }
  function hide() {
    if (anchor) removeDescription(anchor);
    anchor = null;
    hidePanel();
  }

  // WRITE THE ARIA ASSOCIATION ONLY WHEN IT WOULD ACTUALLY CHANGE. This is the click fix, and it
  // is one comparison.
  //
  // `mouseover` does not fire once per hover — it fires again whenever the browser re-resolves
  // what is under the cursor. Rewriting `aria-describedby` on the hovered element is itself enough
  // to make it re-resolve, so the old unconditional write was a FEEDBACK LOOP: write -> the hover
  // target is recomputed -> mouseover -> write. The observed cost was not a busy loop but a broken
  // control: while that churn was running, `pointerdown` and `pointerup` still resolved to the
  // button while the compatibility MOUSE events resolved to an ancestor — mousedown and mouseup on
  // the <tbody> — and a `click` is only synthesised when the press and the release agreed on their
  // target. So no click was produced and the handler never ran, on every tooltipped control.
  //
  // BISECTED, not guessed. Mimicking show() line by line against the real page: everything except
  // this write, and the click works and `mouseover` fires ONCE. Add this write unconditionally and
  // the click dies and `mouseover` fires three times. Make the same write conditional and the
  // click comes back — with the attribute still set, so nothing is traded away for it.
  //
  // ⚠️ Do NOT "simplify" these two helpers back into bare setAttribute/removeAttribute calls. The
  // attribute is not the problem; writing it when it already says that is.
  //
  // A TIP THAT REPEATS THE NAME DESCRIBES NOTHING (0.60.0). An icon button's hover often says
  // exactly what its `aria-label` says — it is the only visible label a sighted reader gets — and
  // pointing the button at it made a screen reader announce the same words twice, once as the name
  // and once as the description (the accessibility tree read name "refresh catalog", description
  // "refresh catalog"). Such a tip still SHOWS; it is only not wired up as a description.
  //
  // ONE TOKEN OF THE LIST, NEVER THE LIST (0.60.0). `aria-describedby` is a space-separated list,
  // and a control may already carry one — a select trigger pointing at its `.field-error`, anything
  // a page wrote. Overwriting it hid that error while the tip showed and lost it for good when the
  // tip went. So the tip adds its id to the list and takes back only that id, and the attribute is
  // dropped only when nothing else is left in it. Written only when that changes it (see above).
  const describedBy = (el) => (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  function describe(el) {
    if (repeatsName(el)) return;
    const ids = describedBy(el);
    if (!ids.includes("ddtip")) el.setAttribute("aria-describedby", [...ids, "ddtip"].join(" "));
  }
  // The name as a screen reader computes it, in accname's order: aria-labelledby, then aria-label,
  // then a <label for>, then the rendered text — an image counts by its alt, and what is hidden
  // (display: none, aria-hidden) does not count. Taking textContent instead read a hidden badge
  // into the name and missed an icon image's alt, so the net caught the wrong tips. Compared
  // without case, runs of whitespace or trailing punctuation: a listener hears "Refresh catalog."
  // and "refresh catalog" as the same words.
  const words = (text) => String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[\s.,;:!?…]+$/, "");
  function rendered(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.data;
    if (node.nodeType !== Node.ELEMENT_NODE || node.getAttribute("aria-hidden") === "true") return "";
    if (getComputedStyle(node).display === "none") return "";
    if (node.tagName === "IMG") return node.getAttribute("alt") ?? "";
    return [...node.childNodes].map(rendered).join(" ");
  }
  function accessibleName(el) {
    // The reflected list where there is one: it holds a reference set as nodes (select.js names its
    // trigger that way), which the attribute does not show.
    const ids = el.getAttribute("aria-labelledby");
    const refs = "ariaLabelledByElements" in el ? el.ariaLabelledByElements || []
      : ids ? ids.split(/\s+/).map((id) => document.getElementById(id)) : [];
    const byIds = refs.map((n) => (n ? rendered(n) : "")).join(" ");
    if (byIds.trim()) return byIds;
    const label = el.getAttribute("aria-label");
    if (label?.trim()) return label;
    if (el.labels?.length) return [...el.labels].map(rendered).join(" ");
    return rendered(el);
  }
  function repeatsName(el) {
    return words(accessibleName(el)) === words(el.getAttribute("data-tip"));
  }
  function removeDescription(el) {
    const ids = describedBy(el);
    if (!ids.includes("ddtip")) return;
    const rest = ids.filter((id) => id !== "ddtip");
    if (rest.length) el.setAttribute("aria-describedby", rest.join(" "));
    else el.removeAttribute("aria-describedby");
  }

  document.addEventListener("mouseover", (event) => {
    const el = event.target.closest("[data-tip]");
    if (el) show(el);
    else if (anchor) hide();
  });
  document.addEventListener("focusin", (event) => {
    const el = event.target.closest("[data-tip]");
    if (el) show(el);
  });
  document.addEventListener("focusout", hide);
  // ESCAPE HIDES THE TIP, AND ONLY THE TIP (WCAG 1.4.13). A tip can cover what the reader came to
  // read, and they must be able to put it away without moving the pointer or the focus.
  //
  // Capture phase, and the press is CONSUMED — preventDefault and stopPropagation — so the same
  // Escape does not also close the dialog or the menu the anchor sits in: a cancelled keydown
  // raises no close request, and a stopped one reaches no menu. The first Escape takes the tip,
  // the second the dialog, which is the order a reader sees them in.
  //
  // hidePanel, not hide: the anchor is kept, so the tip does NOT come straight back on the next
  // `mouseover` of the same element (show() returns early for the anchor it already has) — the
  // browser re-fires mouseover whenever it re-resolves the hover, and a tip that reappeared on
  // that would make Escape useless. It returns when the pointer leaves and comes back, or when
  // focus moves.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !showing()) return;
    hidePanel();
    event.preventDefault();
    event.stopPropagation();
  }, true);
  // place(), not show(): show() now returns early for the anchor it is already showing, which is
  // the whole click fix. Repositioning is the one case that must still recompute.
  document.addEventListener("scroll", () => anchor && place(), true);
  // The guard in show() stops a tip APPEARING over an open listbox; this is the other half — a tip
  // already on screen when the select opens. The ⓘ frequently sits inside the trigger's own label,
  // so "hovering the tip, then clicking to open" is the ordinary path, not an edge case.
  //
  // pointerdown on the document, not a select-specific hook: pressing anything is a statement that
  // you are done reading and want to act, and an informational aside should not outlive that. It
  // also keeps this decoupled — no event contract with select.js to keep in step.
  //
  // The scroll handler above re-shows from `anchor`, which would put the tip straight back while
  // the panel scrolled; show()'s own guard refuses that, so the two rules do not fight.
  // hidePanel, NOT hide — and this one line is the click fix.
  //
  // This runs in the CAPTURE phase of pointerdown, i.e. between `pointerdown` and `mousedown`.
  // `hide()` removes `aria-describedby` from the element that is being pressed, and mutating that
  // attribute on the element under the cursor makes the browser re-resolve the pointer target: the
  // compatibility MOUSE events then land on an ancestor — `mousedown` and `mouseup` on the
  // <tbody> rather than the <button> — and a `click` is only synthesised when the press and the
  // release agreed. So no click was ever produced and the handler never ran.
  //
  // BISECTED IN THE REAL RUNTIME, not reasoned: commenting out this single listener restores
  // `mousedown:BUTTON` -> `click:BUTTON` on the page that could not be clicked. It is also
  // reachable from the other side — writing the attribute unconditionally on every `mouseover`
  // breaks the same click, because `mouseover` re-fires whenever the hover target is re-resolved
  // and the write is itself what re-resolves it. Both are the same mistake: MUTATING ARIA ON THE
  // ELEMENT UNDER THE POINTER WHILE THE BROWSER IS DECIDING WHERE A GESTURE LANDS.
  //
  // What this listener is FOR is unaffected: a press means "I am done reading", and the panel
  // still disappears on press. It simply no longer touches the anchor to do it.
  //
  // The anchor keeps its `aria-describedby` until the pointer actually leaves it (the mouseover
  // handler's else-branch) or focus moves away (focusout), both of which call the full `hide()`.
  // That is a description the element genuinely still has — it is that element's own data-tip —
  // rather than the stale cross-anchor one the per-show write was introduced to avoid.
  document.addEventListener("pointerdown", hidePanel, true);

  // AND THE ORDERING CASE, which the two rules above do not cover between them.
  //
  // A real click on a select trigger fires mousedown -> FOCUS -> mouseup -> click, and the listbox
  // only opens on `click`. So `focusin` reaches show() while no `.select-panel` exists yet: the
  // guard sees a clean document, the tip appears, and the panel then opens underneath it. The
  // pointerdown hide above fires even earlier, so it cannot help either — the tip is re-shown after
  // it. That is why the first fix passed a synthetic test and failed on the real page: dispatching
  // pointerdown-then-click skips the focus event that a genuine click puts between them.
  //
  // So watch for the panel ARRIVING rather than asking whether it is there. This is the only one of
  // the three rules that is ordering-independent, and it is what actually closes the bug.
  new MutationObserver((records) => {
    for (const record of records) {
      // a dropdown's panel is already in the DOM; what ARRIVES is the `open` attribute — and for a
      // popup this module has no selector for (a framework's menu button), `aria-expanded`
      if (record.type === "attributes") {
        // A RENDERER THAT PATCHES THE OPEN TIP'S ANCHOR (cockpit's cockpitPatch writes attributes
        // into the node that is already there) changes what the panel must say. show() returns early
        // for the anchor it has, so without this the panel went on showing the text from the hover.
        if (record.target === anchor && TIP_ATTRS.includes(record.attributeName)) {
          if (!anchor.hasAttribute("data-tip")) { hide(); return; }
          renderTip(anchor);
          if (showing()) place();
          continue;
        }
        // The same patcher removes every attribute its markup does not carry, and the anchor's
        // `ddtip` token is one: the tip stayed on screen and a screen reader lost it. Put it back.
        if (record.target === anchor && record.attributeName === "aria-describedby") { describe(anchor); continue; }
        if (record.target.matches?.(`details.dropdown[open], ${OPEN_POPUP}`)) { hide(); return; }
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(".select-panel") || node.querySelector?.(".select-panel")) { hide(); return; }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-expanded", "aria-describedby", ...TIP_ATTRS] });
}
return { initTooltips };
};
//@dd-record zoom deps= exports=initResolutionZoom
records["zoom"] = (__dd) => {
/*
 * danieldeusing-design — resolution scaling.
 *
 * SUPERSEDED IN 0.29.0. Scaling above the reference width is now done in CSS,
 * by `tokens.css` moving the ROOT FONT SIZE:
 *
 *   font-size: max(1rem, calc(1rem + (100vw - 1920px) / 120));
 *
 * Above 1920 that reduces to 100vw/120 — precisely `16px * innerWidth/1920`,
 * the curve this module used to draw with `zoom`. Nothing changes size; the
 * mechanism changed.
 *
 * WHY. `zoom` scales the coordinate SPACE, which leaves the page with a pixel
 * grid that no longer matches the browser's. Anything injected into the
 * document from outside it — a password manager's dropdown, a translation bar,
 * an extension overlay — measures a field through the browser's grid and writes
 * the answer back into the page's, where it is multiplied again. Measured on
 * the family login page: 1Password's dropdown landed 1.9x down and across from
 * the field it belonged to, on a window whose zoom factor was 1.89.
 *
 * The same double-multiplication had already been paid for three times INSIDE
 * this runtime — tooltip.js, lsnav.js and select.js all divide by the zoom
 * before writing a length. Those divisions stay: they resolve to 1 once no
 * consumer sets zoom, and they are still correct for a surface that has not
 * migrated yet. Scaling the unit rather than the space removes the second grid
 * altogether, so there is nothing left to compensate for.
 */

/**
 * No longer does anything. Kept exported so a surface can bump its pin without
 * its <head> having to change in the same commit.
 *
 * @deprecated since 0.29.0 — scaling is CSS now. Delete the call, and delete
 *   any inline pre-paint zoom block with it. A page that still assigns
 *   `document.documentElement.style.zoom` AND loads 0.29.0 scales TWICE.
 * @param {number} [referenceWidth=1920] Ignored.
 */
function initResolutionZoom(referenceWidth = 1920) {
  void referenceWidth;
}
return { initResolutionZoom };
};
//@dd-loader
const done = {};
const __dd = (name) => (done[name] ??= records[name](__dd));
const api = {};
for (const name of Object.keys(records)) Object.assign(api, __dd(name));
globalThis.ddRuntime = Object.freeze(api);
})();
