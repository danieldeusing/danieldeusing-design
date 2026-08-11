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
 */

const TYPEAHEAD_MS = 700;
const GAP = 4; // visual px between the trigger and the panel
const EDGE = 8; // keep the panel this far off the viewport edge

const enhanced = new WeakMap();
let counter = 0;
let openInstance = null;
let documentObserver = null;
let globalsInstalled = false;

/*
 * Consumers set `zoom` on <html> (initResolutionZoom lays every page out
 * against a 1920px reference), and that puts the two halves of any positioning
 * sum in different coordinate spaces: getBoundingClientRect() and
 * innerWidth/innerHeight are VISUAL px, already multiplied, while style.left is
 * a CSS length the browser multiplies AGAIN on the way out. Writing a rect
 * straight into a length therefore applies the zoom twice — an error that grows
 * with distance from the origin, which is how it survives review (it looks fine
 * near the top left). Fixed twice before in this runtime: tooltip.js and
 * lsnav.js. Divide on the WRITE; never "fix" a comparison whose operands are
 * both already visual.
 */
const zoomOf = () => Number(getComputedStyle(document.documentElement).zoom) || 1;

const optionsOf = (instance) => instance.select.options;
const label = (element) => (element.textContent || "").trim();

const firstEnabled = (instance) => {
  const options = optionsOf(instance);
  for (let i = 0; i < options.length; i += 1) if (!options[i].disabled) return i;
  return -1;
};
const lastEnabled = (instance) => {
  const options = optionsOf(instance);
  for (let i = options.length - 1; i >= 0; i -= 1) if (!options[i].disabled) return i;
  return -1;
};

/* ── the closed control ─────────────────────────────────────────────────── */

function syncTrigger(instance) {
  const { select, trigger, value } = instance;
  const option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
  value.textContent = option ? label(option) : "";
  trigger.disabled = select.disabled;
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
  // and there is no OS menu to replace. `data-select="off"` is the opt-out.
  if (select.multiple || select.size > 1) return;
  if (select.dataset.select === "off") return;
  if (select.parentElement?.classList.contains("select-field")) return;
  if (!select.parentNode) return;

  counter += 1;
  const id = `dd-select-${counter}`;

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
  trigger.className = "select-trigger";
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

  select.parentNode.insertBefore(field, select);
  field.appendChild(select);
  field.appendChild(trigger);
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");

  const instance = { select, field, trigger, value, id, panel: null, items: [], active: -1, typed: "", typedAt: 0 };
  enhanced.set(select, instance);
  nameTrigger(instance);
  syncTrigger(instance);

  trigger.addEventListener("click", () => (instance.panel ? close(instance, true) : open(instance)));
  trigger.addEventListener("keydown", (event) => onKeydown(instance, event));
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
      // one; focus is on the trigger throughout, so nothing is disturbed.
      close(instance, false);
      open(instance);
    }
  });
  instance.observer.observe(select, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "selected", "value", "label"],
  });
}

/* ── the panel ──────────────────────────────────────────────────────────── */

function buildPanel(instance) {
  const panel = document.createElement("ul");
  panel.className = "select-panel";
  panel.id = `${instance.id}-panel`;
  panel.setAttribute("role", "listbox");
  panel.tabIndex = -1;

  instance.items = [];
  let index = 0;
  const addOption = (option) => {
    const item = document.createElement("li");
    item.className = "select-option";
    item.id = `${instance.id}-o${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === instance.select.selectedIndex));
    if (option.disabled) item.setAttribute("aria-disabled", "true");
    // PER-OPTION TOOLTIPS, for the reason the trigger's own copy above states: a tooltip anchored
    // to a control nobody can hover never shows. The native option list is replaced by this panel,
    // so an `<option title="…">` was not merely styled differently — it was unreachable, and every
    // one written so far has been silently doing nothing.
    for (const attribute of ["title", "data-tip"]) {
      const text = option.getAttribute(attribute);
      if (text !== null) item.setAttribute(attribute, text);
    }
    item.textContent = label(option);
    item.dataset.index = String(index);
    instance.items[index] = item;
    index += 1;
    return item;
  };

  // Walked child by child rather than over `select.options`, so an <optgroup>
  // keeps its heading. The walk order is document order, which is exactly the
  // order `select.options` flattens to — that is what keeps `data-index` a valid
  // index into the real control.
  for (const child of instance.select.children) {
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
  // focus on the trigger when an option is clicked.
  panel.addEventListener("mousedown", (event) => event.preventDefault());
  panel.addEventListener("click", (event) => {
    const item = event.target.closest(".select-option");
    if (item) commit(instance, Number(item.dataset.index));
  });

  const selected = instance.select.selectedIndex;
  setActive(instance, selected >= 0 && !instance.select.options[selected].disabled ? selected : firstEnabled(instance));
  position(instance);
}

function close(instance, focusTrigger) {
  if (instance.panel) {
    instance.panel.remove();
    instance.panel = null;
  }
  instance.items = [];
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
  if (!item) {
    instance.trigger.removeAttribute("aria-activedescendant");
    return;
  }
  item.setAttribute("data-active", "true");
  instance.trigger.setAttribute("aria-activedescendant", item.id);
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

function position(instance) {
  const { trigger, panel } = instance;
  const zoom = zoomOf();
  const rect = trigger.getBoundingClientRect(); // visual px

  // offsetWidth is a LAYOUT length, already in the same space as the panel's own
  // min-width, so this one must NOT be divided. Mixing the two is the trap.
  panel.style.minWidth = `${trigger.offsetWidth}px`;
  panel.style.maxWidth = `${(window.innerWidth - EDGE * 2) / zoom}px`;
  panel.style.maxHeight = "";

  const spaceBelow = window.innerHeight - rect.bottom - EDGE - GAP;
  const spaceAbove = rect.top - EDGE - GAP;
  const wanted = panel.getBoundingClientRect().height;
  // Flip only when flipping actually helps. A long list near the bottom of a tall
  // page has room in neither direction, and flipping it there just moves the
  // clipping to the other end.
  const flip = wanted > spaceBelow && spaceAbove > spaceBelow;
  const room = Math.max(flip ? spaceAbove : spaceBelow, 72);
  if (wanted > room) panel.style.maxHeight = `${room / zoom}px`;

  const box = panel.getBoundingClientRect(); // visual px, after the clamp
  const x = Math.min(Math.max(rect.left, EDGE), Math.max(EDGE, window.innerWidth - box.width - EDGE));
  const y = flip ? rect.top - GAP - box.height : rect.bottom + GAP;
  panel.style.left = `${x / zoom}px`;
  panel.style.top = `${y / zoom}px`;
}

/* ── keyboard ───────────────────────────────────────────────────────────── */

const isPrintable = (event) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

function step(instance, direction) {
  const options = optionsOf(instance);
  for (let i = instance.active + direction; i >= 0 && i < options.length; i += direction) {
    if (!options[i].disabled) {
      setActive(instance, i);
      return;
    }
  }
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
  const options = optionsOf(instance);
  const from = advance ? instance.active + 1 : Math.max(instance.active, 0);
  for (let i = 0; i < options.length; i += 1) {
    const index = (from + i + options.length) % options.length;
    if (options[index].disabled) continue;
    if (label(options[index]).toLowerCase().startsWith(needle)) {
      setActive(instance, index);
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
      typeahead(instance, key);
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
  // a scroll event there does not bubble.
  addEventListener("resize", () => openInstance && position(openInstance));
  addEventListener("scroll", () => openInstance && position(openInstance), true);
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
