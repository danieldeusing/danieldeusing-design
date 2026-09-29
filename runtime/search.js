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
  clear.hidden = !input.value;
  clear.disabled = input.disabled;
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
export function initSearchFields(root = document) {
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
export function markPending(field, ms = 1000) {
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
