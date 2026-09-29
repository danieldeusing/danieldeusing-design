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
 * one visually hidden `role="status"` region, created once, so a screen reader hears them too.
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
 *
 * WHAT IS COPIED. A non-empty `data-copy` value, exactly as written; otherwise the `textContent` of
 * the `data-copy-from` target, exactly as it is; otherwise the `.cmd-text` of the closest `.cmd`,
 * TRIMMED — a command copied with a trailing newline runs the moment it is pasted into a shell.
 * Line numbers drawn by `.code-view` are generated content and are never part of textContent. With
 * no source at all the press fails rather than writing an empty string over the clipboard.
 *
 * Framework apps (seedr, configr) render the same attributes from their own state and their own
 * `role="status"`, and never run this over nodes the framework owns (house rule 10).
 */

const STATE_MS = 2000;
// A live region only speaks when its text CHANGES after it is already in the accessibility tree.
// Clearing it and writing the message a beat later is what lets the same "copied" be heard twice in
// a row, and lets a region that was just created (or just moved into a dialog) be heard at all.
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

function announce(button, message) {
  if (!region) {
    region = document.createElement("div");
    region.setAttribute("role", "status");
    region.setAttribute("data-copy-status", "");
    // CSSOM, never setAttribute("style"): under seedr's `style-src 'self'` the attribute is refused
    // (a style-src-attr violation, measured) while style.cssText applies. Inline, so the region hides
    // itself whichever stylesheets the page happens to load.
    region.style.cssText = VISUALLY_HIDDEN;
  }
  // A modal <dialog> makes everything outside it inert, and an inert live region is never read —
  // cockpit's copy buttons live in its patch dialog. So the one region goes where the button is.
  const home = button.closest("dialog[open]") || document.body;
  if (region.parentNode !== home) home.append(region);
  region.textContent = "";
  regionOwner = button;
  clearTimeout(announceTimer);
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
  let copied = false;
  try {
    source = sourceOf(button);
    if (!source.text) throw new Error("data-copy: nothing to copy");
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
export function initCopyButtons() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-copy]") : null;
    // aria-disabled keeps a button focusable (so its tip can explain why it is off); the press
    // itself must still do nothing, and only script can make it so.
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    press(button);
  });
}
