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
export function initSortControls(root = document) {
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
