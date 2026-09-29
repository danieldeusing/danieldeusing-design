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
 *
 * FRAMEWORK APPS do not run this (they own their nodes, R32): they render the same markup on a
 * native <dialog>, call showModal() themselves and apply the same focus rule.
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

/* The press has to be OUTSIDE the box, not merely on the <dialog> element: a press on its 1px edge
   targets the dialog too. Both operands are visual px, so a zoomed root needs no conversion. */
function onBackdrop(dialog, event) {
  const r = dialog.getBoundingClientRect();
  return event.clientX < r.left || event.clientX >= r.right || event.clientY < r.top || event.clientY >= r.bottom;
}

function onCancel(event) {
  if (event.currentTarget.matches(".dialog--alert")) event.preventDefault();
}

/*
 * ESCAPE ON AN ALERT, CANCELLED AT THE KEY. Measured on HeadlessChrome 151: an alert whose `cancel`
 * is prevented survives the FIRST Escape (`cancel`, cancelable) and closes on the SECOND — the
 * close-watcher rule makes a cancel cancelable only once per user activation, and Escape is not
 * an activation. A cancelled `keydown` raises no close request at all, so the alert holds on the
 * third press as on the first.
 *
 * On `window`, in the BUBBLE phase, and only if nobody took the key first: window's listeners run
 * after every document-level one, so a menu or a listbox open inside the alert still gets its own
 * Escape (they cancel it themselves, and a cancelled key is left alone here).
 */
function onKeydown(event) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (topmost()?.matches(".dialog--alert")) event.preventDefault();
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
  for (const el of [state.returnTo, state.opener]) {
    if (!el || el === document.body || !el.isConnected) continue;
    el.focus();
    if (document.activeElement === el) return;
  }
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
export function openDialog(dialogOrId, opener = null) {
  const dialog = resolve(dialogOrId);
  if (dialog.open) return dialog;
  if (!keysInstalled) {
    keysInstalled = true;
    window.addEventListener("keydown", onKeydown);
  }
  if (!known.has(dialog)) {
    known.add(dialog);
    dialog.addEventListener("cancel", onCancel);
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
export function closeDialog(dialogOrId, returnValue) {
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
    if (dialog?.open && !inactive(closer)) dialog.close(closer.getAttribute("data-dialog-close") || undefined);
    return;
  }
  const backdrop = pressed;
  pressed = null;
  if (target === backdrop && backdrop.open && onBackdrop(backdrop, event)) backdrop.close();
}

function onPointerDown(event) {
  const target = event.target;
  pressed = target instanceof HTMLDialogElement && target.matches(".dialog:not(.dialog--alert)") && onBackdrop(target, event)
    ? target
    : null;
}

/**
 * The declarative half: `[data-dialog-open="<id>"]` opens that dialog, `[data-dialog-close]` inside
 * one closes it (its value, if any, is the dialog's `returnValue`), and a press on the backdrop
 * closes a `.dialog` that is not an alert. Delegated, so dialogs and buttons rendered later work.
 * Call once, at startup.
 *
 * @param {Document | Element} [root=document] Where the delegated listeners go.
 */
export function initDialogs(root = document) {
  if (roots.has(root)) return;
  roots.add(root);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("click", onClick);
}
