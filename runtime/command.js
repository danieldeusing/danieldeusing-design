/*
 * command.js — the command palette: every page and action behind one key
 * (src/overlays.css draws `.cmdk`).
 *
 *   import { initCommandPalette } from "@danieldeusing/design/runtime/command";
 *   initCommandPalette({
 *     items: [
 *       { label: "runners", group: "pages", run: () => (location.href = "/runners") },
 *       { label: "restart dd-infra-ci-2", group: "commands", confirm: true, run: restart },
 *     ],
 *     trigger: document.querySelector("#cmdk-open"),   // optional button that opens it
 *   });
 *
 * WHAT IT DOES, and why each one:
 *   · ⌘K ON APPLE PLATFORMS, Ctrl K ELSEWHERE, and never while focus is in a text field: there the
 *     key belongs to the field. A `[data-cmdk-key]` element inside the trigger gets the right label.
 *   · RESULTS IN NAMED GROUPS, in the order the items name them. Before anything is typed, the
 *     last three commands run come first as "recent" (localStorage "cmdk-recent", labels only).
 *   · THE COMBOBOX PATTERN. The field owns the keys (↑ ↓ ↵, Escape is the dialog's), and
 *     `aria-activedescendant` names the selected option, so a screen reader announces each move.
 *   · A COMMAND THAT CANNOT BE UNDONE ASKS TWICE. `confirm: true` turns the first ↵ into a question
 *     on the row ("press ↵ again to …"); any move or edit takes it back.
 *   · A CLOSE BUTTON, because touch has no Escape. Focus comes back to what held it (dialog.js).
 *
 * Returns `{ open, close, destroy }`. Item labels are set with textContent.
 */

import { openDialog, closeDialog } from "./dialog.js";

const RECENT_KEY = "cmdk-recent";
let seq = 0;

const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);
const inTextField = (el) =>
  !!el?.closest?.('input:not([type="checkbox"], [type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"]');

function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private window or blocked storage: recent stays for this page only */
  }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function initCommandPalette({ items, trigger = null, placeholder = "$ type a page or a command…" }) {
  const id = `cmdk-${++seq}`;
  let recent = readRecent();

  const dlg = el("dialog", "dialog cmdk");
  dlg.id = id;
  dlg.setAttribute("aria-labelledby", `${id}-title`);
  const title = el("h2", "dialog-title visually-hidden", "command palette");
  title.id = `${id}-title`;
  const top = el("div", "cmdk-top");
  const input = el("input", "cmdk-input");
  Object.assign(input, { type: "text", placeholder, autocomplete: "off", spellcheck: false, autofocus: true });
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", `${id}-list`);
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-label", "page or command");
  const closeBtn = el("button", "btn-terminal btn-terminal--ghost btn-terminal--compact", "close");
  closeBtn.type = "button";
  top.append(input, closeBtn);
  const list = el("div", "cmdk-list");
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "results");
  const empty = el("p", "cmdk-empty", "no match");
  empty.hidden = true;
  const foot = el("div", "cmdk-foot");
  for (const [k, w] of [["↑↓", "move"], ["↵", "run"], ["esc", "close"]]) {
    const s = el("span");
    s.append(el("kbd", null, k), ` ${w}`);
    foot.append(s);
  }
  dlg.append(title, top, list, empty, foot);
  document.body.append(dlg);

  const key = isApple() ? "⌘K" : "Ctrl K";
  trigger?.querySelectorAll("[data-cmdk-key]").forEach((k) => (k.textContent = key));

  let shown = [];
  let sel = 0;
  let armed = -1;

  function groups() {
    const term = input.value.trim().toLowerCase().replace(/^\$\s*/, "");
    const hits = items.filter((it) => it.label.toLowerCase().includes(term));
    const names = [...new Set(items.map((it) => it.group || "commands"))];
    const out = [];
    let rest = hits;
    if (!term) {
      const r = recent.map((l) => items.find((it) => it.label === l)).filter(Boolean);
      if (r.length) out.push(["recent", r]);
      rest = hits.filter((it) => !r.includes(it));
    }
    for (const g of names) {
      const inG = rest.filter((it) => (it.group || "commands") === g);
      if (inG.length) out.push([g, inG]);
    }
    return out;
  }

  function render() {
    const gs = groups();
    shown = gs.flatMap(([, its]) => its);
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    list.replaceChildren();
    let i = 0;
    gs.forEach(([g, its], gi) => {
      const grp = el("div");
      grp.setAttribute("role", "group");
      const lab = el("p", "cmdk-group-label", g);
      lab.id = `${id}-g${gi}`;
      grp.setAttribute("aria-labelledby", lab.id);
      grp.append(lab);
      for (const it of its) {
        const k = i++;
        const o = el("div", "cmdk-item", k === armed ? `press ↵ again to ${it.label}` : it.label);
        o.id = `${id}-o${k}`;
        o.setAttribute("role", "option");
        o.setAttribute("aria-selected", String(k === sel));
        if (k === armed) o.dataset.armed = "";
        o.addEventListener("click", () => {
          sel = k;
          run(k);
        });
        grp.append(o);
      }
      list.append(grp);
    });
    empty.hidden = shown.length > 0;
    list.hidden = shown.length === 0;
    if (shown.length) {
      input.setAttribute("aria-activedescendant", `${id}-o${sel}`);
      document.getElementById(`${id}-o${sel}`)?.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  function run(i) {
    const it = shown[i];
    if (!it) return;
    if (it.confirm && armed !== i) {
      armed = i;
      render();
      return;
    }
    recent = [it.label, ...recent.filter((l) => l !== it.label)].slice(0, 3);
    writeRecent(recent);
    closeDialog(dlg);
    it.run?.();
  }

  function open() {
    if (dlg.open) return;
    input.value = "";
    sel = 0;
    armed = -1;
    render();
    openDialog(dlg, trigger);
  }
  const close = () => closeDialog(dlg);

  input.addEventListener("input", () => {
    sel = 0;
    armed = -1;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = e.key === "ArrowDown" ? Math.min(sel + 1, shown.length - 1) : Math.max(sel - 1, 0);
      armed = -1;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(sel);
    }
  });
  closeBtn.addEventListener("click", close);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) close();
  });
  const onKey = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
    if (inTextField(e.target) && e.target !== input) return;
    e.preventDefault();
    open();
  };
  document.addEventListener("keydown", onKey);
  trigger?.addEventListener("click", open);

  const destroy = () => {
    document.removeEventListener("keydown", onKey);
    trigger?.removeEventListener("click", open);
    dlg.remove();
  };
  return { open, close, destroy };
}
