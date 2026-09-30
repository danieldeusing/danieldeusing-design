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

export function initFolds() {
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
