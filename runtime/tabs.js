/*
 * tabs.js — the tab bar's behaviour: selection, keys, deep links, nesting, and one event.
 *
 * Markup contract (the ARIA APG Tabs pattern; `.tabs` / `.tab` in data.css draw it):
 *
 *   <div class="tabs" role="tablist" aria-label="review sections" data-tabs-hash>
 *     <button type="button" class="tab" role="tab" id="tab-activity" aria-controls="sec-activity"
 *             aria-selected="true">activity</button>
 *     <button type="button" class="tab" role="tab" id="tab-how" aria-controls="sec-how"
 *             aria-selected="false" tabindex="-1">how it works</button>
 *   </div>
 *   <section class="doc tab-panel" id="sec-activity" role="tabpanel" aria-labelledby="tab-activity">…</section>
 *
 * Call `initTabs()` once. It is delegated on the document, so a tablist rendered later works with
 * no second call, and a MutationObserver gives that tablist its initial state. `aria-controls` is
 * mandatory: the panel it names is the tab's panel, and a tab that names none can be selected but
 * shows and hides nothing.
 *
 * WHY THIS IS ONE MODULE. Cockpit carried FIVE tab engines — tabs.js for the three phase pages, a
 * nested one on /automation/review, inline copies on cicd, config and docs — and they differed in
 * exactly the places that matter: which one followed the hash for the life of the page, which one
 * opened an ancestor, which one told a lazy panel it had been opened. Behaviour that must not differ
 * between pages lives in one file or it differs.
 *
 * ACTIVATION IS ONE PATH, whatever the route — a click, a key, an incoming hash, `tab.click()` from
 * code. Each sets `aria-selected`, a roving `tabindex` (0 on the selected tab, -1 on the rest) and
 * `hidden` on the group's panels, and then dispatches a bubbling `tab-activated` on the tab,
 * `detail: { panel }`. That event is the one signal a lazy panel listens to. Cockpit's stats tab
 * loaded on "click", which is one of three routes, and sat on "loading…" for the life of the page
 * whenever it was reached by the arrow keys or a link. When an activation SHOWS panels further down
 * — the outer tab of a nested pair — each newly visible group's selected tab is announced as well,
 * so a lazy inner panel loads when it appears rather than when somebody clicks it again. A group
 * inside a hidden panel is not announced at start, for the same reason in reverse.
 *
 * NESTING. A panel inside another tabpanel opens its ancestors first, outermost first. A deep link to
 * `#sec-learn-retros` must also open `#sec-learnings` around it, or the inner panel unhides inside a
 * section the outer row still hides, which reads as a dead link.
 *
 * THE HASH. On start and on every `hashchange` for the life of the page, a hash that names a
 * controlled panel activates it, ancestors included, in every group — cross-tab links are how these
 * pages point at each other. WRITING the hash is opt-in per group (`data-tabs-hash`): a page's own
 * tab row should keep the address in step, a card's tab row must not rewrite the page's address.
 * It is written with `replaceState` (switching a tab is not a history entry) and it names only the
 * panel that was asked for: cockpit's engine let the ancestor write last, so clicking
 * `retrospectives` left the address bar on `#sec-learnings` and a reload landed on the wrong tab —
 * measured in a browser, which is worse than no deep link at all.
 *
 * KEYS (APG, automatic activation): on a focused tab ←/→ move to the previous/next tab with wrap and
 * Home/End to the first/last, skipping disabled tabs (`disabled` or `aria-disabled="true"`); focus
 * moves and the tab is activated. Anything with Alt/Ctrl/Meta is left to the browser, so Alt+←
 * still goes back.
 */

const TAB = '[role="tab"]';
const LIST = '[role="tablist"]';

const seen = new WeakSet(); // tablists that have had their initial state
let installed = false;

const listOf = (tab) => tab.closest(LIST);
const tabsOf = (list) => Array.from(list.querySelectorAll(TAB)).filter((tab) => listOf(tab) === list);
const panelOf = (tab) => {
  const id = (tab.getAttribute("aria-controls") || "").trim().split(/\s+/)[0];
  return id ? document.getElementById(id) : null;
};
const ownerOf = (panel) =>
  panel.id ? document.querySelector(`${TAB}[aria-controls~="${CSS.escape(panel.id)}"]`) : null;
const enabled = (tab) => !tab.disabled && tab.getAttribute("aria-disabled") !== "true";

// The element the address names, but only when it is a panel some tab controls: a hash pointing at
// a heading, or at nothing, is the page's business.
function hashPanel() {
  let id = location.hash.slice(1);
  if (!id) return null;
  try {
    id = decodeURIComponent(id);
  } catch {
    /* a malformed escape is just an id that matches nothing */
  }
  const panel = document.getElementById(id);
  return panel && ownerOf(panel) ? panel : null;
}

// Select one tab within its own group. Returns whether the selection changed.
function select(tab) {
  const list = listOf(tab);
  if (!list) return false;
  const changed = tab.getAttribute("aria-selected") !== "true";
  for (const each of tabsOf(list)) {
    const on = each === tab;
    each.setAttribute("aria-selected", String(on));
    each.tabIndex = on ? 0 : -1;
    const panel = panelOf(each);
    if (panel) panel.hidden = !on;
  }
  return changed;
}

// The tab itself and, before it, every tab whose panel encloses it — outermost first.
function ancestry(tab) {
  const chain = [tab];
  let node = (panelOf(tab) || tab).parentElement;
  while (node) {
    const outer = node.closest('[role="tabpanel"]');
    if (!outer) break;
    const owner = ownerOf(outer);
    if (owner) chain.unshift(owner);
    node = outer.parentElement;
  }
  return chain;
}

// Tell the page a tab is active. With `cascade`, its panel just became visible, so every group one
// level down announces its own selected tab too, and so on down.
function announce(tab, cascade) {
  const panel = panelOf(tab);
  tab.dispatchEvent(new CustomEvent("tab-activated", { bubbles: true, detail: { panel } }));
  if (!cascade || !panel) return;
  for (const list of panel.querySelectorAll(LIST)) {
    if (list.parentElement.closest('[role="tabpanel"]') !== panel) continue;
    const selected = tabsOf(list).find((each) => each.getAttribute("aria-selected") === "true");
    if (selected) announce(selected, true);
  }
}

function activate(tab, { writeHash = false } = {}) {
  let first = null;
  for (const each of ancestry(tab)) {
    if (select(each) && !first) first = each;
  }
  const panel = panelOf(tab);
  if (writeHash && panel && listOf(tab)?.hasAttribute("data-tabs-hash")) {
    history.replaceState(history.state, "", `#${panel.id}`);
  }
  // Re-activating the current tab still announces it (a click is intent), but shows nothing new.
  announce(first || tab, Boolean(first));
}

// A group's initial state: the tab the address names (or whose panel encloses what it names), else
// the one the markup selected, else the first enabled one. The address is consulted only the first
// time a group is seen — a group re-rendered later keeps what the page selected since.
function normalize(list, first) {
  const tabs = tabsOf(list);
  if (!tabs.length) return null;
  const target = first ? hashPanel() : null;
  const chosen =
    (target && tabs.find((tab) => {
      const panel = panelOf(tab);
      return enabled(tab) && panel && (panel === target || panel.contains(target));
    })) ||
    tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ||
    tabs.find(enabled) ||
    tabs[0];
  select(chosen);
  return chosen;
}

// Document order, so an outer group is settled (and announced) before the groups inside it.
function adopt(lists) {
  const fresh = [];
  for (const list of lists) {
    const first = !seen.has(list);
    const chosen = normalize(list, first);
    if (!chosen) continue; // no tabs yet: a tablist still being parsed is adopted when they arrive
    seen.add(list);
    if (first) fresh.push(chosen);
  }
  for (const tab of fresh) {
    if (!tab.closest('[role="tabpanel"][hidden]')) announce(tab, false);
  }
}

function step(tab, direction) {
  const tabs = tabsOf(listOf(tab));
  const at = tabs.indexOf(tab);
  for (let k = 1; k <= tabs.length; k += 1) {
    const next = tabs[(((at + direction * k) % tabs.length) + tabs.length) % tabs.length];
    if (enabled(next)) return next;
  }
  return null;
}

/**
 * Wire every tablist on the page, and every one rendered later. Idempotent.
 */
export function initTabs() {
  if (installed) return;
  installed = true;

  document.addEventListener("click", (event) => {
    const tab = event.target instanceof Element ? event.target.closest(TAB) : null;
    if (!tab || !listOf(tab) || !enabled(tab)) return;
    activate(tab, { writeHash: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tab = event.target instanceof Element ? event.target.closest(TAB) : null;
    if (!tab || !listOf(tab)) return;
    const tabs = tabsOf(listOf(tab)).filter(enabled);
    let next = null;
    if (event.key === "ArrowRight") next = step(tab, 1);
    else if (event.key === "ArrowLeft") next = step(tab, -1);
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    else return;
    event.preventDefault();
    if (!next) return;
    next.focus();
    activate(next, { writeHash: true });
  });

  addEventListener("hashchange", () => {
    const panel = hashPanel();
    const tab = panel && ownerOf(panel);
    if (tab && listOf(tab) && enabled(tab)) activate(tab);
  });

  adopt(document.querySelectorAll(LIST));

  new MutationObserver((records) => {
    const lists = new Set();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(LIST)) lists.add(node);
        for (const list of node.querySelectorAll(LIST)) lists.add(list);
        // Tabs re-rendered inside a tablist that stayed: the group needs its roving tabindex back.
        for (const tab of node.matches(TAB) ? [node] : node.querySelectorAll(TAB)) {
          const owner = listOf(tab);
          if (owner) lists.add(owner);
        }
      }
    }
    if (lists.size) {
      adopt(Array.from(lists).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)));
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
