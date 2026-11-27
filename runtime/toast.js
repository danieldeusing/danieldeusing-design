/*
 * toast.js — what just happened, and the way back (src/feedback.css draws `.toast`).
 *
 *   import { showToast } from "@danieldeusing/design/runtime/toast";
 *   showToast("saved runner settings.", { undo: () => restore(previous) });
 *
 * WHAT IT DOES, and why each one:
 *   · ONE TOAST AT A TIME. A new toast replaces the one on screen: two stacked results read as a
 *     log, and the older undo no longer undoes the last thing.
 *   · NO TIMER. The toast stays until the reader closes it, undoes, or the next toast replaces it.
 *     A message that leaves on its own is gone for a slow reader, and its undo with it.
 *   · A role="status" REGION THAT EXISTS BEFORE THE TOAST. A live region added together with its
 *     words is often not announced; the region is made once and stays, empty between toasts.
 *   · UNDO HAS A KEY. With `undo`, the toast shows an "undo" button and ⌘Z (Ctrl+Z off Apple)
 *     runs the same function while the toast is up — but never while focus is in a text field,
 *     where the key belongs to the field.
 *
 * `showToast(text, { tone = "success", undo, undoLabel = "undo" })` returns `{ element, close }`.
 * The text is set with textContent. FOR BUILD-FREE PAGES: a framework app renders `.toast` from
 * its own state (the markup is in feedback.css).
 */

let region = null;
let current = null;

const inTextField = (el) =>
  !!el?.closest?.('input:not([type="checkbox"], [type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"]');

function ensureRegion() {
  if (region?.isConnected) return region;
  region = document.createElement("div");
  region.setAttribute("role", "status");
  region.className = "toast-region";
  document.body.append(region);
  return region;
}

export function showToast(text, { tone = "success", undo, undoLabel = "undo" } = {}) {
  current?.close();
  const element = document.createElement("div");
  element.className = "toast";
  if (tone) element.dataset.tone = tone;

  const words = document.createElement("span");
  words.className = "toast-text";
  words.textContent = text;
  element.append(words);

  const onKey = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
    if (inTextField(e.target)) return;
    e.preventDefault();
    runUndo();
  };
  const close = () => {
    document.removeEventListener("keydown", onKey);
    element.remove();
    if (current?.element === element) current = null;
  };
  const runUndo = () => {
    close();
    undo();
  };

  if (undo) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn-terminal btn-terminal--ghost btn-terminal--compact";
    b.textContent = undoLabel;
    b.addEventListener("click", runUndo);
    element.append(b);
    document.addEventListener("keydown", onKey);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.className = "btn-icon btn-icon--bare btn-icon--sm";
  x.dataset.icon = "x";
  x.setAttribute("aria-label", "close");
  x.addEventListener("click", close);
  element.append(x);

  ensureRegion().append(element);
  current = { element, close };
  return current;
}
