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
export function initPickCells() {
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
