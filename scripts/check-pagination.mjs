#!/usr/bin/env node
/*
 * check-pagination.mjs — the table pager's arithmetic, tested against the shipped module.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The wrong way to build table paging is to cut the data to
 * twenty rows and then sort and filter the cut: page 1 reorders while the real newest row sits
 * on page 3, and a filter finds nothing because the match was never in the slice being searched.
 * `runtime/pagination.js` cannot make that mistake — it has no sort and no filter, and reads a
 * `<tbody>` that something else has already produced — but "cannot" is a claim about the code,
 * so the properties below assert the half that IS this module's job: that the window it takes
 * out of an already-ordered set loses nothing, invents nothing and reorders nothing.
 *
 * The other half — that cockpit's engine really does filter and sort the FULL dataset before
 * this ever sees a row — is asserted where that engine actually runs, against the real shipped
 * page: `bin/cockpit-render-check` in danieldeusing-infra, "the whole set reaches the tbody".
 * Neither check is worth much alone; together they cover the chain end to end.
 *
 * No DOM and no dependency. `applyPageWindow` is written against anything with a `hidden`
 * property, so the rows here are plain objects — not a mock of an element, just the one field
 * the function reads, which is why these assertions are about the shipped function rather than
 * about a re-implementation of it living in a harness.
 *
 *   node scripts/check-pagination.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  applyPageWindow,
  normalizePageSize,
  pageWindow,
} from "../runtime/pagination.js";

/* ── the stored size ──────────────────────────────────────────────────────────────
 * localStorage is shared with every other tab, every older build of the page and anyone
 * with a devtools console, so a value that came out of it is untrusted input.
 */
test("a junk stored size falls back to 20 rather than breaking the table", () => {
  for (const junk of ["abc", "", " ", null, undefined, NaN, {}, [], "20px", "-5", "0"]) {
    assert.equal(normalizePageSize(junk), DEFAULT_PAGE_SIZE, `${JSON.stringify(junk)} should fall back`);
  }
});

test("a size this build no longer offers falls back too", () => {
  // 999 is the case in the brief; 25 is the likelier one — a size that was offered once.
  for (const stale of [999, 25, 1, 1000, 19]) {
    assert.equal(normalizePageSize(stale), DEFAULT_PAGE_SIZE);
  }
});

test("every offered size survives a round trip through the store as a string", () => {
  for (const size of PAGE_SIZES) assert.equal(normalizePageSize(String(size)), size);
});

test("the default is 20 and it is one of the offered sizes", () => {
  assert.equal(DEFAULT_PAGE_SIZE, 20);
  assert.ok(PAGE_SIZES.includes(DEFAULT_PAGE_SIZE));
  assert.deepEqual(PAGE_SIZES, [5, 10, 20, 50, 100, 200]);
});

/* ── the window ───────────────────────────────────────────────────────────────────*/

test("the window walks the set in order and covers it exactly once", () => {
  // The property that a wrong slice breaks: concatenating every page must reproduce the
  // full set, in the same order, with nothing dropped and nothing seen twice. An
  // off-by-one anywhere in `from`/`to` fails this and it does not need a fixture to know
  // the right answer.
  for (const total of [0, 1, 19, 20, 21, 55, 200, 201]) {
    for (const size of PAGE_SIZES) {
      const seen = [];
      const { pageCount } = pageWindow(total, size, 1);
      for (let page = 1; page <= pageCount; page += 1) {
        const window_ = pageWindow(total, size, page);
        assert.equal(window_.page, page);
        for (let i = window_.from; i < window_.to; i += 1) seen.push(i);
      }
      assert.deepEqual(
        seen,
        [...Array(total).keys()],
        `total=${total} size=${size} did not cover the set exactly once`,
      );
    }
  }
});

test("an out-of-range page is clamped, never rejected and never left empty", () => {
  // Rows leave under a reader who is on page 4 — a filter narrows the set, a poll returns
  // fewer rows. The answer to "page 4 of 2" is page 2 with rows on it.
  assert.deepEqual(pageWindow(55, 20, 99), { page: 3, pageCount: 3, from: 40, to: 55 });
  assert.deepEqual(pageWindow(55, 20, 0), { page: 1, pageCount: 3, from: 0, to: 20 });
  assert.deepEqual(pageWindow(55, 20, -7), { page: 1, pageCount: 3, from: 0, to: 20 });
  assert.deepEqual(pageWindow(0, 20, 5), { page: 1, pageCount: 1, from: 0, to: 0 });
});

test("an exact multiple does not produce a trailing empty page", () => {
  assert.equal(pageWindow(40, 20, 1).pageCount, 2);
  assert.deepEqual(pageWindow(40, 20, 2), { page: 2, pageCount: 2, from: 20, to: 40 });
});

/* ── applying it ──────────────────────────────────────────────────────────────────*/

test("only the rows in the window are shown", () => {
  const rows = Array.from({ length: 55 }, () => ({ hidden: false }));
  const { from, to } = pageWindow(55, 20, 2);
  applyPageWindow(rows, from, to);
  const shown = rows.map((r, i) => (r.hidden ? null : i)).filter((i) => i !== null);
  assert.deepEqual(shown, [...Array(20).keys()].map((i) => i + 20));
});

test("re-applying the same window writes nothing", () => {
  // Not a micro-optimisation: the MutationObserver in pagination.js watches these very rows
  // for the `hidden` attribute, so a function that rewrote an unchanged row would wake
  // itself and spin. Idempotence is what makes that observer safe.
  let writes = 0;
  const rows = Array.from({ length: 30 }, () => {
    let value = false;
    return { get hidden() { return value; }, set hidden(next) { writes += 1; value = next; } };
  });
  applyPageWindow(rows, 0, 20);
  const first = writes;
  assert.equal(first, 10, "only the 10 rows being hidden should be written");
  applyPageWindow(rows, 0, 20);
  assert.equal(writes, first, "a second identical pass must write nothing at all");
});

/* ── the order: filter, then sort, then slice — over the FULL set ─────────────────
 *
 * These two are the brief's own cases. The producer here is a plain filter+sort over the
 * whole array, standing in for cockpit's `cockpitTable.visibleRows()`, which does exactly
 * that; the pager then gets the result. What is being asserted is that paging does not
 * become a third thing that reorders or truncates the answer.
 */
const DATA = Array.from({ length: 55 }, (_, i) => ({
  // Deliberately NOT sorted by score, and the maximum is planted deep in the set so a
  // slice-then-sort implementation cannot reach it: index 47 is on page 3 at 20 a page.
  name: i === 47 ? "needle" : `row-${String(i).padStart(2, "0")}`,
  score: i === 47 ? 9999 : (i * 37) % 500,
}));

test("a filter matching only a row on page 3 finds it, and shows it on page 1", () => {
  const matches = DATA.filter((row) => row.name.includes("needle"));
  assert.equal(matches.length, 1);
  assert.equal(DATA.indexOf(matches[0]), 47, "the fixture must place the match beyond page 1");

  const rows = matches.map((row) => ({ hidden: false, row }));
  const { from, to, pageCount } = pageWindow(rows.length, DEFAULT_PAGE_SIZE, 1);
  applyPageWindow(rows, from, to);
  assert.equal(pageCount, 1);
  assert.deepEqual(rows.filter((r) => !r.hidden).map((r) => r.row.name), ["needle"]);
});

test("sorted descending, page 1 holds the true maximum of the whole set", () => {
  const sorted = [...DATA].sort((a, b) => b.score - a.score);
  const rows = sorted.map((row) => ({ hidden: false, row }));
  const { from, to } = pageWindow(rows.length, DEFAULT_PAGE_SIZE, 1);
  applyPageWindow(rows, from, to);

  const visible = rows.filter((r) => !r.hidden).map((r) => r.row);
  assert.equal(visible.length, 20);
  assert.equal(visible[0].score, Math.max(...DATA.map((d) => d.score)));
  assert.equal(visible[0].name, "needle", "the global maximum was at index 47 of the unsorted set");
  // And the page is the TOP twenty of the whole set, not the top twenty of the first page.
  assert.deepEqual(
    visible.map((v) => v.score),
    [...DATA].sort((a, b) => b.score - a.score).slice(0, 20).map((v) => v.score),
  );
});

test("paging never invents, drops or reorders a row of the sorted set", () => {
  const sorted = [...DATA].sort((a, b) => b.score - a.score);
  const rows = sorted.map((row) => ({ hidden: false, row }));
  const collected = [];
  const { pageCount } = pageWindow(rows.length, 10, 1);
  for (let page = 1; page <= pageCount; page += 1) {
    const { from, to } = pageWindow(rows.length, 10, page);
    applyPageWindow(rows, from, to);
    collected.push(...rows.filter((r) => !r.hidden).map((r) => r.row));
  }
  assert.deepEqual(collected, sorted);
});
