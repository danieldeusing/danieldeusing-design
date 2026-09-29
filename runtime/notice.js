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

export function initNotices() {
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
