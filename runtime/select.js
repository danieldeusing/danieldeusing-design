/*
 * select.js — replaces the OPERATING SYSTEM's dropdown with the estate's own.
 *
 * Markup contract:
 *   <select>…</select>
 *
 * That is the whole contract. Like `initTableScroll()`, this takes plain HTML
 * and needs no classes, no wrapper and no data attributes. Call `initSelects()`
 * once; every `<select>` on the page is enhanced, and so is every one rendered
 * afterwards — cockpit rebuilds its config tables out of innerHTML on every
 * poll, so a widget that only enhanced what existed at load would work until
 * the first refresh and then quietly stop.
 *
 * WHY A REPLACEMENT AND NOT CSS. A `<select>`'s option list is painted by the
 * OS outside the document: rounded corners, a blue system highlight, the system
 * font. No stylesheet reaches it. Chrome 135+ can style it with
 * `appearance: base-select`, but Safari and Firefox cannot, and a fix that
 * lands on one browser leaves the estate disagreeing with ITSELF, which is
 * worse than being consistently wrong. So the list is rebuilt in the page.
 *
 * THE <select> STAYS AND STAYS AUTHORITATIVE. It is not cloned, mirrored or
 * replaced by hidden inputs: it remains the element that holds the value, that
 * a form submits, that `select.value` reads, and that emits `input`/`change`.
 * Page code sees exactly what it saw before — that is what let 28 call sites
 * adopt this without a single edit. It is laid transparently OVER the trigger
 * rather than `display: none`, because Chrome refuses to show a validation
 * bubble on an unfocusable control and then blocks the submit with no message
 * at all, which would silently break every `required` select.
 *
 * Keyboard follows the ARIA APG select-only combobox: Enter/Space/Arrow open,
 * Up/Down move, Home/End jump, printable characters type ahead (a repeated
 * character cycles, as a native select does), Enter selects, Escape closes
 * without changing anything, Tab moves on. Focus never leaves the trigger —
 * the active option is pointed at with `aria-activedescendant` — so there is
 * nowhere for it to get stuck.
 *
 * THERE IS NO OPT-OUT (0.60.0, Daniel: "A dropdown should ALWAYS have the custom
 * layout for the list, not the system one"). `data-select="off"` used to skip a
 * select; no surface used it, and an escape hatch nobody needs is the one the
 * next page reaches for when the enhanced list is inconvenient — which puts the
 * OS list back in front of the reader. `multiple` and `size > 1` stay native
 * because they are not dropdowns at all.
 *
 * Two opt-INs, each one attribute on the <select> (M5, references/filters.md):
 *   data-filter  a FILTER: the trigger names the facet while nothing is chosen
 *                and the value once something is, wears --primary while it
 *                filters, and a clear button is joined to it. The empty option
 *                is the "all" row at the top of the list.
 *   data-search  a search box at the top of the list. A list longer than twenty
 *                options gets one without asking — past that a list is searched,
 *                not scanned (configr's FilterDropdown threshold).
 */

import { positionPopup } from "./popup.js";

const TYPEAHEAD_MS = 700;
const SEARCH_THRESHOLD = 20;

const enhanced = new WeakMap();
let counter = 0;
let openInstance = null;
let documentObserver = null;
let globalsInstalled = false;

const optionsOf = (instance) => instance.select.options;
const label = (element) => (element.textContent || "").trim();
const indexOf = (item) => Number(item.dataset.index);

/*
 * THE ROWS A READER CAN REACH, IN THE ORDER THEY SEE THEM. Not `select.options`
 * order: a filter moves its "all" row to the top, and a panel search hides the
 * rows that do not match. The arrows, Home/End and typeahead all walk what is on
 * screen — walking the underlying options would move the highlight onto a row
 * the reader cannot see.
 */
const reachable = (instance) =>
  instance.panel
    ? [...instance.panel.querySelectorAll('.select-option:not([hidden]):not([aria-disabled="true"])')]
    : [];

const firstEnabled = (instance) => {
  const rows = reachable(instance);
  return rows.length ? indexOf(rows[0]) : -1;
};
const lastEnabled = (instance) => {
  const rows = reachable(instance);
  return rows.length ? indexOf(rows[rows.length - 1]) : -1;
};

/* A label's own words, without the control it wraps — a wrapping <label>'s
   textContent would otherwise read "source all seedr skills.sh". */
function ownText(element) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && !node.matches("select, .select-field, .filter-dd")) text += node.textContent;
  }
  return text.trim();
}

/*
 * What a filter is ABOUT — "source", "type" — found the three ways nameTrigger()
 * finds a label, in the platform's order, so a select the page already labels
 * correctly needs nothing more.
 */
function facetOf(select) {
  const explicit = select.getAttribute("aria-label");
  if (explicit) return explicit.trim();
  const ids = select.getAttribute("aria-labelledby");
  if (ids) {
    return ids.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(ownText).join(" ").trim();
  }
  const element =
    (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)) || select.closest("label");
  return element ? ownText(element) : "";
}

/* ── the closed control ─────────────────────────────────────────────────── */

/*
 * An <option data-icon="…"> shows its glyph wherever its label is shown: in its
 * row and, while it is the value, in the trigger (configr's option icons). The
 * glyph is the system's `.ico` mask, so it takes the row's colour on every theme.
 */
function syncIcon(instance, option) {
  const name = option ? option.dataset.icon : "";
  if (!name) {
    instance.icon?.remove();
    instance.icon = null;
    return;
  }
  if (!instance.icon) {
    instance.icon = document.createElement("span");
    instance.icon.className = "ico";
    instance.trigger.insertBefore(instance.icon, instance.value);
  }
  instance.icon.dataset.icon = name;
}

function syncTrigger(instance) {
  const { select, trigger, value } = instance;
  const option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
  trigger.disabled = select.disabled;
  // An invalid select must SAY so where the reader is looking. The select itself
  // is transparent and aria-hidden, so a red edge or an announcement pinned to it
  // reaches nobody; the trigger is the control now.
  const invalid = select.getAttribute("aria-invalid");
  if (invalid === null) trigger.removeAttribute("aria-invalid");
  else trigger.setAttribute("aria-invalid", invalid);
  syncIcon(instance, option);
  if (!instance.filter) {
    value.textContent = option ? label(option) : "";
    return;
  }

  /*
   * A FILTER NAMES ITS FACET UNTIL IT FILTERS, THEN ITS VALUE (seedr and configr,
   * both): "source" at rest, "seedr" once a source is chosen. The trigger is the
   * place a reader looks to see what is in force, so it says the one thing that is.
   *
   * Only a select WITH an empty option can be "not filtering". A required picker —
   * cockpit's repository chart, configr's worktree — always has a value, so it
   * always shows it, never wears the active edge and never offers a clear: there is
   * nothing to go back to (configr conflict 20, corrected).
   */
  const facet = facetOf(select);
  const optional = [...select.options].some((o) => o.value === "");
  const active = optional && select.value !== "";
  const choice = option ? label(option) || (option.value === "" ? "all" : "") : "";
  value.textContent = active || !optional ? choice : facet;

  // State is never colour alone: the NAME carries the facet AND the value, so
  // "source filter: seedr" is what a screen reader hears, active or not.
  const name = facet ? `${facet} filter` : "filter";
  trigger.setAttribute("aria-label", `${name}: ${choice}`);
  instance.group.setAttribute("aria-label", name);
  instance.clear.setAttribute("aria-label", `clear ${name}`);
  if (active) trigger.setAttribute("data-active", "true");
  else trigger.removeAttribute("data-active");
  instance.clear.hidden = !active;
  // A disabled filter can still be filtering — and its clear would then change the value of a
  // control the page has switched off. It is shown (the state is still worth seeing), not usable.
  instance.clear.disabled = select.disabled;
}

/*
 * The trigger's accessible name is the LABEL plus the CURRENT VALUE — "lines,
 * 200" — which is what a native select announces and what the APG's select-only
 * combobox prescribes. Pointing `aria-labelledby` at the trigger's own id is
 * how the value gets into the name; it looks like a mistake and is the pattern.
 *
 * The label is found the same three ways the platform finds it, in the platform's
 * order, so a page that already labels its select correctly needs no change:
 * an explicit aria-label, an explicit aria-labelledby, then a <label> — whether
 * associated by `for=` or by wrapping.
 *
 * A filter is named in syncTrigger() instead: its name changes with its value.
 */
function nameTrigger(instance) {
  const { select, trigger } = instance;
  const explicit = select.getAttribute("aria-label");
  if (explicit) {
    trigger.setAttribute("aria-label", explicit);
    return;
  }
  let labelId = select.getAttribute("aria-labelledby");
  if (!labelId) {
    const element =
      (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)) ||
      select.closest("label");
    if (element) {
      if (!element.id) element.id = `${instance.id}-label`;
      labelId = element.id;
    }
  }
  if (labelId) trigger.setAttribute("aria-labelledby", `${labelId} ${trigger.id}`);
}

function enhance(select) {
  if (enhanced.has(select)) return;
  // `multiple` and `size > 1` are not popups — the platform renders them inline
  // and there is no OS menu to replace. Nothing else is skipped (see the header).
  if (select.multiple || select.size > 1) return;
  if (select.parentElement?.classList.contains("select-field")) return;
  if (!select.parentNode) return;

  counter += 1;
  const id = `dd-select-${counter}`;
  const isFilter = select.hasAttribute("data-filter");

  const field = document.createElement("span");
  field.className = "select-field";
  // A page sizes its control on the <select> (`style="max-width:18rem"`), and
  // once the select is out of the flow that sizing has nothing to act on. The
  // wrapper is what occupies the space now, so it takes the inline style. Copied,
  // not moved: the select's own style attribute is still the page's to read.
  const inlineStyle = select.getAttribute("style");
  if (inlineStyle) field.setAttribute("style", inlineStyle);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = isFilter ? "select-trigger select-trigger--filter" : "select-trigger";
  trigger.id = `${id}-trigger`;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", `${id}-panel`);

  const value = document.createElement("span");
  value.className = "select-value";
  trigger.appendChild(value);

  // A tooltip anchored to a control nobody can hover is a tooltip that never
  // shows. Both flavours move to the visible element; the select keeps its copy
  // so page code that reads the attribute still finds it.
  for (const attribute of ["title", "data-tip"]) {
    const text = select.getAttribute(attribute);
    if (text !== null) trigger.setAttribute(attribute, text);
  }

  /*
   * A FILTER IS TWO CONTROLS IN ONE EDGE: the trigger and, while it filters, a
   * clear button joined to it (seedr's `-ml-px`, configr's `border-l-0`). Each
   * keeps its own tab stop and its own name; the group is what says they belong
   * together. The clear is always built and simply `hidden` while there is
   * nothing to clear, so a picker whose options change under it never has to
   * grow or lose a node.
   */
  let group = null;
  let clear = null;
  if (isFilter) {
    group = document.createElement("span");
    group.className = "filter-dd btn-group";
    group.setAttribute("role", "group");
    clear = document.createElement("button");
    clear.type = "button";
    clear.className = "filter-clear";
    clear.hidden = true;
    select.parentNode.insertBefore(group, select);
    group.append(field, clear);
  } else {
    select.parentNode.insertBefore(field, select);
  }
  field.appendChild(select);
  field.appendChild(trigger);
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");

  const instance = {
    select, field, trigger, value, id, group, clear, filter: isFilter,
    icon: null, panel: null, search: null, empty: null, side: undefined,
    items: [], active: -1, typed: "", typedAt: 0,
  };
  enhanced.set(select, instance);
  if (!isFilter) nameTrigger(instance);
  syncTrigger(instance);

  trigger.addEventListener("click", () => (instance.panel ? close(instance, true) : open(instance)));
  trigger.addEventListener("keydown", (event) => onKeydown(instance, event));
  clear?.addEventListener("click", () => {
    if (select.value === "") return;
    select.value = "";
    syncTrigger(instance);
    // The button just pressed is hidden now, and focus on a hidden button is
    // focus on nothing. Moved BEFORE the events go out, for commit()'s reason: a
    // `change` handler may re-render and detach all of this.
    trigger.focus();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Focus aimed at the hidden control — a <label> click, or page code calling
  // select.focus() — belongs to the one the reader can see.
  select.addEventListener("focus", () => trigger.focus());
  // A page that sets the value itself and announces it the normal way is honoured.
  // Our own dispatch lands here too; re-syncing an already-synced trigger is a no-op.
  select.addEventListener("change", () => syncTrigger(instance));

  // Cockpit rewrites a select's options from fetched data — a new model list, a
  // new credential list, a filter column derived from the rows that just arrived.
  // Without this the trigger would keep showing the label of an option that is no
  // longer in the list, which reads as the page having lost the setting.
  instance.observer = new MutationObserver(() => {
    syncTrigger(instance);
    if (instance.panel) {
      // The list changed under an open panel. Rebuild it rather than show a stale
      // one — and keep what the reader had typed into its search, which a poll
      // landing mid-word would otherwise throw away.
      const query = instance.search ? instance.search.value : "";
      close(instance, false);
      open(instance);
      if (query && instance.search) {
        instance.search.value = query;
        filterRows(instance);
      }
    }
  });
  instance.observer.observe(select, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "selected", "value", "label", "aria-invalid", "aria-label", "data-icon"],
  });
}

/* ── the panel ──────────────────────────────────────────────────────────── */

function buildPanel(instance) {
  const { select } = instance;
  const panel = document.createElement("ul");
  panel.className = "select-panel";
  panel.id = `${instance.id}-panel`;
  panel.setAttribute("role", "listbox");
  panel.tabIndex = -1;

  /*
   * THE SEARCH ROW (M5). Focus moves INTO it on open — it has to hold focus to be
   * typed into — so it, not the trigger, carries `aria-activedescendant` while the
   * list is out; `aria-controls` repairs the fact that the panel is appended to
   * <body> and is no descendant of either.
   */
  instance.search = null;
  instance.empty = null;
  if (select.options.length > SEARCH_THRESHOLD || select.hasAttribute("data-search")) {
    const row = document.createElement("li");
    row.className = "select-search";
    row.setAttribute("role", "presentation");
    const field = document.createElement("div");
    field.className = "search-field";
    const input = document.createElement("input");
    input.type = "search";
    input.setAttribute("aria-label", `search ${facetOf(select) || "options"}`);
    input.setAttribute("aria-controls", panel.id);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("data-1p-ignore", "");
    // THE BOX IS THE LIST'S OWN MACHINERY, and its events are not the page's. Left to bubble, a
    // page listening for `input`/`change` on the document would hear every keystroke of the query —
    // and a `change` the browser fires as the edited box leaves focus when the list closes, carrying
    // the query as if it were a value. The <select> announces the pick; nothing else should.
    input.addEventListener("input", (event) => {
      event.stopPropagation();
      filterRows(instance);
    });
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => onSearchKeydown(instance, event));
    field.appendChild(input);
    row.appendChild(field);
    panel.appendChild(row);
    instance.search = input;
  }

  instance.items = [];
  let index = 0;
  const addOption = (option) => {
    const item = document.createElement("li");
    item.className = "select-option";
    item.id = `${instance.id}-o${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === select.selectedIndex));
    if (option.disabled) item.setAttribute("aria-disabled", "true");
    // PER-OPTION TOOLTIPS, for the reason the trigger's own copy above states: a tooltip anchored
    // to a control nobody can hover never shows. The native option list is replaced by this panel,
    // so an `<option title="…">` was not merely styled differently — it was unreachable, and every
    // one written so far has been silently doing nothing.
    for (const attribute of ["title", "data-tip"]) {
      const text = option.getAttribute(attribute);
      if (text !== null) item.setAttribute(attribute, text);
    }
    if (option.dataset.icon) {
      const icon = document.createElement("span");
      icon.className = "ico";
      icon.dataset.icon = option.dataset.icon;
      item.appendChild(icon);
    }
    item.append(label(option));
    item.dataset.index = String(index);
    instance.items[index] = item;
    index += 1;
    return item;
  };

  // Walked child by child rather than over `select.options`, so an <optgroup>
  // keeps its heading. The walk order is document order, which is exactly the
  // order `select.options` flattens to — that is what keeps `data-index` a valid
  // index into the real control.
  for (const child of select.children) {
    if (child.tagName === "OPTGROUP") {
      const heading = document.createElement("li");
      heading.className = "select-group";
      heading.setAttribute("role", "presentation");
      heading.textContent = child.label;
      panel.appendChild(heading);
      for (const option of child.children) {
        if (option.tagName === "OPTION") panel.appendChild(addOption(option));
      }
    } else if (child.tagName === "OPTION") {
      panel.appendChild(addOption(child));
    }
  }

  /*
   * A FILTER'S "ALL" ROW COMES FIRST, whatever order the page wrote its options in
   * (seedr and configr both). It is the empty option, labelled "all" when the page
   * gave it no words, and it carries the ✓ exactly when nothing is filtered — the
   * reader can always see the way back to the whole list, and see that they are
   * on it.
   */
  if (instance.filter) {
    const all = instance.items.find((item) => select.options[indexOf(item)].value === "");
    if (all) {
      if (!label(all)) all.append("all");
      panel.insertBefore(all, panel.querySelector(".select-option, .select-group"));
    }
  }

  if (instance.search) {
    const empty = document.createElement("li");
    empty.className = "select-empty";
    empty.setAttribute("role", "presentation");
    empty.textContent = "no matches";
    empty.hidden = true;
    panel.appendChild(empty);
    instance.empty = empty;
  }
  return panel;
}

/*
 * THE PANEL IS BUILT FRESH ON EVERY OPEN, from the select's options as they are
 * at that instant. That is not laziness about caching — it is the only way the
 * list cannot be stale, and staleness is the failure this widget is most likely
 * to have shipped: cockpit replaces a select's options from fetched data all the
 * time, and a snapshot taken at enhance time would show a model list from before
 * the last poll while the value underneath had moved on.
 */
function open(instance) {
  if (instance.select.disabled) return;
  if (openInstance && openInstance !== instance) close(openInstance, false);

  const panel = buildPanel(instance);
  instance.panel = panel;
  // Appended to the nearest <dialog> when there is one: a modal dialog is in the
  // top layer and nothing outside it can paint above it, so a panel on <body>
  // would open behind the dialog that owns the select. Everywhere else <body> is
  // right — it escapes `.tablewrap`'s scroll clipping, which is where most of
  // cockpit's selects live.
  (instance.trigger.closest("dialog") || document.body).appendChild(panel);
  instance.trigger.setAttribute("aria-expanded", "true");
  openInstance = instance;

  // Options are never focusable; the panel is pointed at with
  // aria-activedescendant instead. preventDefault on mousedown is what keeps
  // focus where it is when an option is clicked. The search row is the one
  // exception — it is typed into, so a press there must be able to place the caret.
  panel.addEventListener("mousedown", (event) => {
    if (!event.target.closest(".select-search")) event.preventDefault();
  });
  panel.addEventListener("click", (event) => {
    const item = event.target.closest(".select-option");
    if (item) commit(instance, indexOf(item));
  });

  // PLACED BEFORE ANYTHING SCROLLS. setActive() calls scrollIntoView(), and since
  // 0.60.0 `.select-panel` has no `position` in CSS (M0) — until positionPopup()
  // makes it fixed it is an ordinary block at the end of <body>, and scrolling a
  // row of it into view would scroll the whole PAGE to the bottom.
  instance.side = positionPopup(panel, instance.trigger).side;
  const selected = instance.select.selectedIndex;
  setActive(instance, selected >= 0 && !instance.select.options[selected].disabled ? selected : firstEnabled(instance));
  instance.search?.focus({ preventScroll: true });
}

function close(instance, focusTrigger) {
  if (instance.panel) {
    instance.panel.remove();
    instance.panel = null;
  }
  instance.items = [];
  instance.search = null;
  instance.empty = null;
  instance.active = -1;
  instance.typed = "";
  instance.trigger.setAttribute("aria-expanded", "false");
  instance.trigger.removeAttribute("aria-activedescendant");
  if (openInstance === instance) openInstance = null;
  if (focusTrigger) instance.trigger.focus();
}

function setActive(instance, index) {
  const previous = instance.items[instance.active];
  if (previous) previous.removeAttribute("data-active");
  instance.active = index;
  const item = instance.items[index];
  // Whichever of the two holds focus carries the pointer, so both are given it.
  const pointers = instance.search ? [instance.trigger, instance.search] : [instance.trigger];
  if (!item) {
    for (const element of pointers) element.removeAttribute("aria-activedescendant");
    return;
  }
  item.setAttribute("data-active", "true");
  for (const element of pointers) element.setAttribute("aria-activedescendant", item.id);
  item.scrollIntoView({ block: "nearest" });
}

function commit(instance, index) {
  const option = optionsOf(instance)[index];
  if (!option || option.disabled) return; // a disabled option is not a choice; the list stays open
  const changed = instance.select.selectedIndex !== index;
  if (changed) {
    instance.select.selectedIndex = index;
    syncTrigger(instance);
  }
  // Closed BEFORE the events go out: a `change` handler here re-renders the table
  // this select lives in, so anything touching the instance afterwards would be
  // touching a detached node.
  close(instance, true);
  if (changed) {
    // A native select fires `input` and THEN `change`, and both bubble. Cockpit's
    // table filters listen for both on a container element, so dispatching only
    // `change` would make this a quieter control than the one it replaced.
    instance.select.dispatchEvent(new Event("input", { bubbles: true }));
    instance.select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/*
 * Typing in the search row narrows the list to the options whose label contains
 * the text, case-insensitively. The "all" row answers no query — a reader typing
 * "sk" is looking for skills, not for the way out — so it steps aside while
 * anything is typed, as configr's does.
 *
 * The side the panel opened on is KEPT: re-choosing it as the list shrinks would
 * jump the box being typed into from one side of the trigger to the other.
 */
function filterRows(instance) {
  const { panel, select } = instance;
  const query = instance.search.value.trim().toLowerCase();
  let shown = 0;
  for (const item of instance.items) {
    const isAll = instance.filter && select.options[indexOf(item)].value === "";
    const hit = !query || (!isAll && label(item).toLowerCase().includes(query));
    item.hidden = !hit;
    if (hit) shown += 1;
  }
  for (const heading of panel.querySelectorAll(".select-group")) {
    let next = heading.nextElementSibling;
    let any = false;
    while (next && next.classList.contains("select-option")) {
      if (!next.hidden) any = true;
      next = next.nextElementSibling;
    }
    heading.hidden = !any;
  }
  instance.empty.hidden = shown > 0;
  // The value in force stays the highlight while it is on screen; otherwise the
  // first match is, so "type, Enter" picks what the reader just narrowed to.
  const selected = instance.items[select.selectedIndex];
  const keep = selected && !selected.hidden && selected.getAttribute("aria-disabled") !== "true";
  setActive(instance, keep ? select.selectedIndex : firstEnabled(instance));
  positionPopup(panel, instance.trigger, { side: instance.side });
}

/* ── keyboard ───────────────────────────────────────────────────────────── */

const isPrintable = (event) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

function step(instance, direction) {
  const rows = reachable(instance);
  if (!rows.length) return;
  const at = rows.findIndex((row) => indexOf(row) === instance.active);
  const next = at === -1 ? rows[direction > 0 ? 0 : rows.length - 1] : rows[at + direction];
  if (next) setActive(instance, indexOf(next));
}

function typeahead(instance, character) {
  const now = Date.now();
  if (now - instance.typedAt > TYPEAHEAD_MS) instance.typed = "";
  instance.typedAt = now;
  instance.typed += character.toLowerCase();

  // One character repeated CYCLES through the options starting with it, which is
  // what a native select does — pressing "c" three times walks three c-options
  // rather than hunting for "ccc".
  const repeated = instance.typed.length > 1 && new Set(instance.typed).size === 1;
  const needle = repeated ? instance.typed[0] : instance.typed;
  const advance = repeated || instance.typed.length === 1;
  const rows = reachable(instance);
  const at = rows.findIndex((row) => indexOf(row) === instance.active);
  const from = advance ? at + 1 : Math.max(at, 0);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[(from + i) % rows.length];
    if (label(row).toLowerCase().startsWith(needle)) {
      setActive(instance, indexOf(row));
      return;
    }
  }
}

function onKeydown(instance, event) {
  const isOpen = Boolean(instance.panel);
  const key = event.key;

  if (key === "Escape") {
    if (!isOpen) return;
    // BOTH, and both matter. preventDefault stops the UA's close-request, and
    // stopPropagation stops the page's own handler: without them, dismissing this
    // list inside a modal <dialog> closes the dialog as well, losing the form.
    event.preventDefault();
    event.stopPropagation();
    close(instance, true);
    return;
  }
  if (key === "Tab") {
    if (isOpen) close(instance, false); // Tab moves on and commits nothing
    return;
  }

  if (!isOpen) {
    if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault();
      open(instance);
      if (key === "Home") setActive(instance, firstEnabled(instance));
      else if (key === "End") setActive(instance, lastEnabled(instance));
      return;
    }
    if (isPrintable(event)) {
      event.preventDefault();
      open(instance);
      // A list with a search row takes the keystroke AS the search: it is the
      // first letter of what the reader is looking for, not a lost key.
      if (instance.search) {
        instance.search.value = key;
        filterRows(instance);
      } else {
        typeahead(instance, key);
      }
    }
    return;
  }

  // A space CONTINUES a live typeahead rather than selecting — option labels here
  // contain spaces ("public — posts on the PR"), so treating it as Enter would
  // make half of them untypeable.
  if (key === " " && instance.typed && Date.now() - instance.typedAt <= TYPEAHEAD_MS) {
    event.preventDefault();
    typeahead(instance, key);
    return;
  }
  switch (key) {
    case "Enter":
    case " ":
      event.preventDefault();
      commit(instance, instance.active);
      return;
    case "ArrowDown":
      event.preventDefault();
      step(instance, 1);
      return;
    case "ArrowUp":
      event.preventDefault();
      step(instance, -1);
      return;
    case "Home":
      event.preventDefault();
      setActive(instance, firstEnabled(instance));
      return;
    case "End":
      event.preventDefault();
      setActive(instance, lastEnabled(instance));
      return;
    default:
      if (isPrintable(event)) {
        event.preventDefault();
        typeahead(instance, key);
      }
  }
}

/*
 * The search row's keys. Home and End are left to the text box — they move the
 * caret there, and a reader editing a query expects exactly that.
 */
function onSearchKeydown(instance, event) {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      step(instance, 1);
      return;
    case "ArrowUp":
      event.preventDefault();
      step(instance, -1);
      return;
    case "Enter":
      event.preventDefault();
      if (instance.active >= 0) commit(instance, instance.active);
      return;
    case "Escape":
      // Same pair as the trigger's, for the same reason: inside a <dialog> the
      // Escape that closes this list must not close the dialog too.
      event.preventDefault();
      event.stopPropagation();
      close(instance, true);
      return;
    case "Tab":
      // Focus goes back to the trigger and the Tab itself then moves on FROM there.
      // Left alone it would move on from the search box — which sits at the end of
      // <body> — and throw the reader to the bottom of the page.
      close(instance, true);
      return;
  }
}

/* ── document-level wiring, installed once ──────────────────────────────── */

function installGlobals() {
  if (globalsInstalled) return;
  globalsInstalled = true;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!openInstance) return;
      const target = event.target;
      if (openInstance.panel.contains(target) || openInstance.field.contains(target)) return;
      close(openInstance, false);
    },
    true,
  );
  document.addEventListener("focusin", (event) => {
    if (!openInstance) return;
    if (openInstance.field.contains(event.target) || openInstance.panel.contains(event.target)) return;
    close(openInstance, false);
  });
  // The trigger moves when the page or a scroll container moves under it. Capture,
  // because most of these selects sit in a `.tablewrap` that scrolls on its own and
  // a scroll event there does not bubble. A list scrolling ITSELF moves nothing,
  // and re-placing it would re-measure it mid-scroll, so its own scrolls are skipped.
  const reposition = (event) => {
    if (!openInstance) return;
    if (event.type === "scroll" && openInstance.panel.contains(event.target)) return;
    openInstance.side = positionPopup(openInstance.panel, openInstance.trigger).side;
  };
  addEventListener("resize", reposition);
  addEventListener("scroll", reposition, true);
  // form.reset() rewinds selectedIndex without firing an event or touching the DOM,
  // so nothing else here would notice. One delegated listener rather than one per
  // select: these selects are re-created on every render and the <form> is not, so
  // per-select listeners would pile up on it for the life of the page.
  document.addEventListener("reset", (event) => {
    const form = event.target;
    queueMicrotask(() => {
      for (const select of form.querySelectorAll?.("select") ?? []) {
        const instance = enhanced.get(select);
        if (instance) syncTrigger(instance);
      }
    });
  });
}

/**
 * Replace every native `<select>` dropdown on the page with the design system's
 * own, and keep doing so for selects rendered later.
 *
 * @param {ParentNode} [root=document] Where to look for the initial pass.
 */
export function initSelects(root = document) {
  installGlobals();
  for (const select of root.querySelectorAll("select")) enhance(select);

  if (documentObserver) return;
  documentObserver = new MutationObserver((records) => {
    // A re-render can take the open panel's trigger out of the document from
    // underneath it — a background poll rewriting the table it sits in. The panel
    // is on <body>, so it would be left floating over a control that no longer
    // exists.
    if (openInstance && !openInstance.trigger.isConnected) close(openInstance, false);
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "SELECT") enhance(node);
        else for (const select of node.querySelectorAll("select")) enhance(select);
      }
    }
  });
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });
}
