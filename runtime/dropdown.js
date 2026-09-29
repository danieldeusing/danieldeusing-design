/*
 * danieldeusing-design — dropdown menus: `<details class="dropdown">`, and the menu keys any
 * page-built menu can borrow.
 *
 * Markup contract, unchanged since the first release:
 *
 *   <details class="dropdown">
 *     <summary>actions</summary>
 *     <ul class="dropdown-panel">
 *       <li><button type="button" class="dropdown-item">rename</button></li>
 *       <li class="dropdown-sep"></li>
 *       <li><button type="button" class="dropdown-item dropdown-item--danger">delete</button></li>
 *     </ul>
 *   </details>
 *
 * WHAT A NATIVE <details> DOES NOT KNOW (0.60.0). It opens, it closes and it puts the summary in
 * the tab order. It does not know it is a MENU. Until 0.60.0 this module added only "one open at
 * a time, close on a click away or Escape", so a keyboard reader who opened one was left on the
 * summary with a list under it that only Tab could walk: every item its own tab stop, no arrow
 * keys, no Home/End, and Escape dropped focus on <body> instead of handing it back to the control
 * that opened the list. seedr's Radix menu and configr's Menu both do the ARIA APG menu button;
 * the system's own dropdown was the one that did not.
 *
 * TWO KINDS OF PANEL, told apart by what is IN them, never by a class the author has to remember:
 *   · a panel of rows — `.dropdown-item`, `.dropdown-sep`, `.dropdown-label`, bare or one per <li>
 *     — is a MENU. It gets `role="menu"`, its <li>s `role="none"`, its items `role="menuitem"`
 *     (an item that already says `menuitemradio` / `menuitemcheckbox` keeps it: the theme items
 *     do), its separators `role="separator"`, and the summary `aria-haspopup="menu"` with an
 *     `aria-expanded` kept in step. Items are `tabindex="-1"`: the arrows reach them, Tab does not.
 *     A LABELLED SECTION — a `.dropdown-label` and the items under it, up to the next separator or
 *     label — is wrapped in a `role="group"` named by the label (`aria-labelledby`), the APG shape:
 *     inside a bare menu the label's words were loose text, and "sort by" and "order" could not be
 *     told apart. A menu with no label is left as it is.
 *   · a panel holding anything else — the table filter's text box, a form — is a DISCLOSURE and is
 *     left exactly as the platform made it: no menu roles, and Tab walks through it. Announcing a
 *     text field as a menu would be a lie the reader acts on.
 *
 * DELEGATED, AND IT KEEPS MARKING. The old version bound the dropdowns that existed when it was
 * called. runtime/tabletools.js builds its header dropdowns AFTER that, from rows that arrive over
 * the network, so every one of them had no click-away and no Escape — on the pages that have the
 * most of them. Listeners now live on the document, and one MutationObserver marks a dropdown the
 * moment it is inserted (and re-marks one whose rows change: a `pick` list is rebuilt when its
 * column's values change), the way runtime/select.js keeps enhancing selects. One call, at startup.
 *
 * Framework apps do not run this (they own their nodes): they render the same roles and implement
 * the same keys themselves.
 */

const TYPEAHEAD_MS = 700; // select.js's window, so the two lists answer typing alike
const ROW = ".dropdown-item, .dropdown-sep, .dropdown-label";
const ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const CHOICE_ROLES = ["menuitemradio", "menuitemcheckbox"];

let installed = false;
let counter = 0;
const typed = new WeakMap(); // panel -> { text, at }

const dropdownOf = (node) => (node instanceof Element ? node.closest("details.dropdown") : null);
const summaryOf = (details) => details.querySelector(":scope > summary");
const panelOf = (details) =>
  details.querySelector(":scope > .dropdown-panel") || details.querySelector(".dropdown-panel");
const isMenu = (panel) => panel?.getAttribute("role") === "menu";

/* ── which panels are menus ──────────────────────────────────────────────────────────────────── */

const only = (el) => (el.tagName === "LI" && el.childElementCount === 1 ? el.firstElementChild : null);
const rowOf = (el) => (el.matches(ROW) ? el : only(el)?.matches(ROW) ? only(el) : null);
const groupOf = (el) => (el.matches('[role="group"]') ? el : only(el)?.matches('[role="group"]') ? only(el) : null);

/* The rows a panel is made of — through the groups mark() made — or null when it holds anything
   that is not a row. */
function menuRows(panel) {
  const rows = [];
  for (const child of panel.children) {
    const group = groupOf(child);
    const inner = group ? menuRows(group) : null;
    const row = inner ? null : rowOf(child);
    if (!inner && !row) return null;
    rows.push(...(inner || [row]));
  }
  return rows.some((row) => row.matches(".dropdown-item")) ? rows : null;
}

/* Each label and the items under it become one group named by the label. Once: a label already in
   a group is not at the top level any more, so a second call finds nothing to wrap. */
function groupSections(panel) {
  const children = [...panel.children];
  for (let i = 0; i < children.length; i += 1) {
    const label = rowOf(children[i]);
    if (!label?.matches(".dropdown-label")) continue;
    const section = [children[i]];
    while (i + 1 < children.length && rowOf(children[i + 1])?.matches(".dropdown-item")) section.push(children[(i += 1)]);
    if (section.length < 2) continue;
    if (!label.id) label.id = `dd-menu-${(counter += 1)}`;
    const inList = section[0].tagName === "LI";
    const group = document.createElement(inList ? "ul" : "div");
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", label.id);
    const holder = inList ? document.createElement("li") : group;
    if (inList) holder.append(group);
    section[0].before(holder);
    group.append(...section);
  }
}

/* Idempotent: called on insert, whenever a panel's rows change, and on open. */
function mark(details) {
  const summary = summaryOf(details);
  const panel = summary && panelOf(details);
  const rows = panel && menuRows(panel);
  // ponytail: a panel is classified when marked; one that later STOPS being a menu keeps its
  // roles. No surface changes a panel's kind today — add an unmark when one does.
  if (!rows) return;

  panel.setAttribute("role", "menu");
  if (!summary.id) summary.id = `dd-menu-${(counter += 1)}`;
  if (!panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby")) {
    panel.setAttribute("aria-labelledby", summary.id);
  }
  summary.setAttribute("aria-haspopup", "menu");
  summary.setAttribute("aria-expanded", String(details.open));
  groupSections(panel);
  for (const li of panel.querySelectorAll("li:not(.dropdown-sep)")) li.setAttribute("role", "none");
  for (const row of rows) {
    if (row.matches(".dropdown-sep")) row.setAttribute("role", "separator");
    else if (row.matches(".dropdown-item")) {
      if (!CHOICE_ROLES.includes(row.getAttribute("role"))) row.setAttribute("role", "menuitem");
      row.tabIndex = -1;
    }
  }
}

/* ── the menu keys, shared with page-built menus ─────────────────────────────────────────────── */

/* `disabled` cannot take focus; `aria-disabled` can, and APG keeps it reachable so a reader can
   learn the action exists. Hidden rows are skipped. */
const navigable = (panel) =>
  [...panel.querySelectorAll(ITEM)].filter((item) => !item.disabled && item.getClientRects().length > 0);

function typeahead(panel, items, current, character) {
  const now = Date.now();
  const state = typed.get(panel);
  const text = (state && now - state.at <= TYPEAHEAD_MS ? state.text + character : character).toLowerCase();
  typed.set(panel, { text, at: now });
  // One character repeated CYCLES through the items starting with it, as a native list does —
  // "d d d" walks three d-items rather than hunting for "ddd".
  const repeated = text.length > 1 && new Set(text).size === 1;
  const needle = repeated ? text[0] : text;
  const from = Math.max(items.indexOf(current) + (repeated || text.length === 1 ? 1 : 0), 0);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[(from + i) % items.length];
    if ((item.textContent || "").trim().toLowerCase().startsWith(needle)) return item;
  }
  return null;
}

/*
 * The APG menu's keys, for a panel whose items take focus one at a time. `close` shuts the menu
 * AND puts focus back on whatever opened it; the caller decides what that is.
 *
 * TAB AND SHIFT+TAB BOTH LEAVE, AND FROM THE OPENER. Focus goes back to the opener first, then Tab
 * does its default: forward, it moves past the opener to whatever follows it — which is where
 * "moves on" has to land for a panel that can live anywhere in the DOM (a context menu sits on
 * <body>, after everything else). Shift+Tab stops ON the opener, the control a reader backing out
 * of a menu is looking for.
 */
function menuKeydown(panel, event, close) {
  const items = navigable(panel);
  const current = event.target instanceof Element ? event.target.closest(ITEM) : null;
  const index = items.indexOf(current);
  const go = (item) => {
    event.preventDefault();
    item?.focus();
  };
  switch (event.key) {
    case "ArrowDown":
      go(items[(index + 1) % items.length]);
      return;
    case "ArrowUp":
      go(index < 0 ? items.at(-1) : items[(index - 1 + items.length) % items.length]);
      return;
    case "Home":
      go(items[0]);
      return;
    case "End":
      go(items.at(-1));
      return;
    case "Escape":
      // BOTH, as in select.js: a menu inside a modal <dialog> must not close the dialog as well.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    case "Tab":
      if (event.shiftKey) event.preventDefault();
      close();
      return;
    case " ":
    case "Enter":
      // A <button> activates itself on both; an <a> follows on Enter but SCROLLS THE PAGE on Space,
      // and an element given the role by hand does neither.
      if (current && current.tagName !== "BUTTON" && !(event.key === "Enter" && current.tagName === "A")) {
        event.preventDefault();
        current.click();
      }
      return;
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const hit = typeahead(panel, items, current, event.key);
        if (hit) go(hit);
      }
  }
}

/* An aria-disabled item does nothing when activated, by pointer or key, and the menu stays open. The
   page ignores the press; an <a> item would still follow its link, so its default is cancelled
   here — Enter on a link arrives as this same click. */
function unavailable(item, event) {
  if (item.getAttribute("aria-disabled") !== "true") return false;
  event.preventDefault();
  return true;
}

/* Focus still on the menu — or dropped on <body> by the menu's removal — goes back to the opener.
   Focus the action moved ON PURPOSE (into a dialog it opened, say) is left where it is. */
const focusIsStranded = (container) =>
  !document.activeElement || document.activeElement === document.body || container.contains(document.activeElement);

/**
 * The menu keys for a menu the page builds and places itself — the context menu, a menu opened
 * from a row. Its items are the panel's `menuitem` / `menuitemradio` / `menuitemcheckbox`
 * elements. The page still opens it, positions it and focuses its first item; this adds the
 * arrows, Home/End, typeahead, Escape and Tab, and closes on an item's activation.
 *
 * @param {HTMLElement} panel The element carrying `role="menu"`.
 * @param {{ onClose?: () => void, returnFocusTo?: HTMLElement | null }} [options]
 *   `onClose` must be safe to call twice: an item's own handler may already have closed the menu.
 * @returns {() => void} detach — removes the listeners.
 */
export function attachMenuKeys(panel, { onClose, returnFocusTo } = {}) {
  // Out of the tab order — and so is an item the page adds while the menu is attached.
  const quiet = () => {
    for (const item of panel.querySelectorAll(ITEM)) item.tabIndex = -1;
  };
  quiet();
  const observer = new MutationObserver(quiet);
  observer.observe(panel, { childList: true, subtree: true });
  const close = () => {
    onClose?.();
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
  };
  const onKeydown = (event) => menuKeydown(panel, event, close);
  const onClick = (event) => {
    const item = event.target instanceof Element ? event.target.closest(ITEM) : null;
    if (!item || !panel.contains(item)) return;
    if (unavailable(item, event)) return;
    const stranded = focusIsStranded(panel);
    onClose?.();
    if (stranded && returnFocusTo?.isConnected) returnFocusTo.focus();
  };
  panel.addEventListener("keydown", onKeydown);
  panel.addEventListener("click", onClick);
  return () => {
    observer.disconnect();
    panel.removeEventListener("keydown", onKeydown);
    panel.removeEventListener("click", onClick);
  };
}

/* ── details.dropdown, delegated ─────────────────────────────────────────────────────────────── */

function setOpen(details, open) {
  details.open = open;
  const summary = summaryOf(details);
  if (summary?.hasAttribute("aria-haspopup")) summary.setAttribute("aria-expanded", String(open));
  if (open) closeAll(details);
}

function focusEdge(panel, edge) {
  const items = navigable(panel);
  (edge === "last" ? items.at(-1) : items[0])?.focus();
}

/* Close every open dropdown except `except` and the dropdowns that contain it. */
function closeAll(except) {
  for (const details of document.querySelectorAll("details.dropdown[open]")) {
    if (except && (details === except || details.contains(except))) continue;
    setOpen(details, false);
  }
}

function onToggle(event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.classList.contains("dropdown")) return;
  mark(details);
  const summary = summaryOf(details);
  if (summary?.hasAttribute("aria-haspopup")) summary.setAttribute("aria-expanded", String(details.open));
  if (details.open) closeAll(details);
}

/* APG menu button: Enter, Space and ArrowDown open onto the first item, ArrowUp onto the last.
   Returns false for a key it leaves alone — Escape goes on to the document-wide path below. */
function onSummaryKeydown(details, panel, event) {
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp":
      event.preventDefault();
      setOpen(details, true);
      focusEdge(panel, event.key === "ArrowUp" ? "last" : "first");
      return true;
    case "Enter":
    case " ":
      // preventDefault is what stops the summary's own activation toggling it straight back.
      event.preventDefault();
      if (details.open) setOpen(details, false);
      else {
        setOpen(details, true);
        focusEdge(panel, "first");
      }
      return true;
    case "Tab":
      // Tabbing past an open menu would leave it open with nothing focused to close it from.
      if (details.open) setOpen(details, false);
      return true;
    default:
      return false;
  }
}

function onKeydown(event) {
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  const details = dropdownOf(target);
  const panel = details && panelOf(details);
  if (panel) {
    if (!isMenu(panel)) mark(details);
    if (isMenu(panel)) {
      const summary = summaryOf(details);
      if (target === summary) {
        if (onSummaryKeydown(details, panel, event)) return;
      } else if (panel.contains(target)) {
        menuKeydown(panel, event, () => {
          setOpen(details, false);
          summary?.focus();
        });
        return;
      }
    }
  }
  if (event.key !== "Escape") return;
  const open = [...document.querySelectorAll("details.dropdown[open]")];
  if (!open.length) return;
  // Escape belongs to the dropdown while one is open — without this it would also reach a modal
  // <dialog> around it and close that, form and all.
  event.preventDefault();
  const holder = open.find((d) => d.contains(document.activeElement));
  closeAll();
  if (holder) summaryOf(holder)?.focus();
}

function onClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  // A <select> inside a dropdown opens its list on <body> (select.js), so a pick in that list is a
  // click OUTSIDE the dropdown by position and INSIDE it by intent. It must not close it.
  if (target?.closest(".select-panel")) return;
  const details = dropdownOf(target);
  if (!details) {
    closeAll();
    return;
  }
  const panel = panelOf(details);
  const item = target.closest(`.dropdown-item, ${ITEM}`);
  if (!item || !panel?.contains(item)) return;
  if (unavailable(item, event)) return;
  // Activation closes, and hands focus back to the summary unless the action moved it on purpose.
  const stranded = focusIsStranded(details);
  setOpen(details, false);
  const summary = summaryOf(details);
  if (stranded && summary?.isConnected) summary.focus();
}

function onMutations(records) {
  const touched = new Set();
  for (const record of records) {
    const host = dropdownOf(record.target);
    if (host) touched.add(host);
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches("details.dropdown")) touched.add(node);
      for (const details of node.querySelectorAll("details.dropdown")) touched.add(details);
    }
  }
  for (const details of touched) mark(details);
}

/**
 * Menu behaviour for every `details.dropdown` on the page, now and rendered later: one open at a
 * time; a click away, Escape and an item's activation close it (Escape and activation hand focus
 * back to the summary); a panel of rows is an APG menu with arrow keys, Home/End and typeahead.
 * Call once, at startup.
 *
 * @param {ParentNode} [root=document] Where to mark the dropdowns that already exist.
 * @returns {(except?: HTMLDetailsElement) => void} closeAll — for a page that navigates or
 *   re-renders after a pick and wants every menu shut.
 */
export function initDropdowns(root = document) {
  if (!installed) {
    installed = true;
    // `toggle` does not bubble, so it is caught on the way DOWN.
    document.addEventListener("toggle", onToggle, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    new MutationObserver(onMutations).observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const details of root.querySelectorAll("details.dropdown")) mark(details);
  return closeAll;
}
