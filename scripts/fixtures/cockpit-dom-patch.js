// VENDORED — danieldeusing-infra cockpit/pages/dom-patch.js at ad44527 (2026-09-30), byte for byte below the
// marker. The design repo's CI has no infra checkout, and four suites drive the runtime against this
// patcher (check-dropdown, -tabs, -tabletools, -chrome), so CI points DD_COCKPIT_DOM_PATCH here and
// sets DD_REQUIRE_COCKPIT_DOM_PATCH=1: that section cannot skip where the release is gated. A local
// run uses the sibling checkout's live copy instead, and check-integration.mjs says when this copy
// has fallen behind it. Refresh: copy the file below the marker and rename the commit above.
// ── vendored copy follows ──
// cockpit — write new values INTO the DOM that is already there, instead of replacing it
//
// Every panel on the /automation/* pages renders the same way: build an HTML string, assign it to
// a mount's `innerHTML`. That is correct exactly once — the first paint. On every re-render it
// destroys and recreates every node in the subtree, which is what Daniel saw as the page
// "flicking" when an `automation_changed` frame arrives. The flicker is only the visible half. The
// expensive half is that a subtree is not just pixels: it holds what has been TYPED into it, which
// element has focus, which `<details>` the reader opened, where the list is scrolled. None of that
// is in the payload the renderer builds from, so a rebuild cannot put it back.
//
// `cockpitPatch(mount, source)` walks the new markup against the DOM already in the mount and
// writes only the differences — an attribute here, a text node there. A node that is still the
// same node stays the same node, so everything hanging off its identity survives for free.
//
// It is deliberately NOT a rendering framework. There is no component model, no reactivity, no
// virtual DOM kept between calls, no dependency, and no state of its own: it is one function that
// makes an element's children match a piece of markup. The pages keep their renderers verbatim.
//
// WHY THE FORM FIELDS LOOK AFTER THEMSELVES. This never touches `.value`, `.checked` or
// `.selected` — only the ATTRIBUTES. HTML already draws exactly the line we want: once a field has
// been edited, its dirty flag is set and the `value` attribute stops feeding the property, so a
// half-typed 1Password item survives a patch. Until it is edited, the attribute IS the value, so a
// field nobody has touched still updates when the server's answer changes. Writing the properties
// would break both halves at once.
//
// A CLASSIC SCRIPT, not a module, and loaded in <head> rather than beside portal.js at the end of
// <body>. Pages call this from their own inline <script> blocks, which run during parse; a
// deferred module runs after them, so `cockpitPatch` would be undefined at exactly the moment the
// first render needs it. That is the same trap `__ddTicks` works around with a plain array —
// here the handshake is "be there first" instead.
(() => {
  // One reused parser. A <template> rather than a <div> because table fragments are the common
  // case here: `<tr>…</tr>` assigned to a div's innerHTML is silently dropped by the parser, while
  // a template's fragment-parsing context switches into the right table insertion mode and keeps
  // it. Both table engines patch their <thead> and <tbody> contents through this.
  const parser = document.createElement("template");

  // An explicit identity, never a guess. Position is the right answer for a list that is rebuilt
  // in the same order (which is nearly all of them here), so a key is only asked for where a row
  // can genuinely move: `id`, or a `data-key` the markup opts into.
  //
  // An id the design RUNTIME assigned is not an identity the renderer gave: `initDropdowns()` names
  // an unnamed menu summary and label `dd-menu-*` (design 0.60.0). Keyed on it, the summary and its
  // panel matched nothing in the renderer's markup and were rebuilt on every patch, dropping focus
  // to <body>. So a runtime id is no key; a renderer that re-renders a menu gives the summary and
  // each `.dropdown-label` ids of its own (components.md).
  const RUNTIME_ID = /^dd-menu-/;
  const keyOf = (el) => (el.id && !RUNTIME_ID.test(el.id) ? el.id : null) || el.getAttribute("data-key") || null;

  const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

  // A `.tablewrap` is the scroll container the design system's runtime puts around every table
  // (initTableScroll), so a table wider than its column scrolls itself instead of pushing the
  // whole page sideways. It is inserted into the live DOM and appears in NO renderer's markup —
  // the third thing on this page a renderer does not own, alongside `open` on a <details> and
  // `hidden` on a <tr>, and the one with teeth: the ordinary answer to "the DOM says <div> and my
  // markup says <table>" is to replace it, which destroys the table, every row listener and every
  // half-typed filter on every poll, and the runtime then wraps the replacement so the next poll
  // does it again. A patcher that fights the wrapper is worse than a table that does not scroll.
  //
  // So a wrapper STANDS IN FOR the table inside it — for its key, for its kind, and as the node
  // actually patched. Only against an incoming <table>: when the markup carries its own wrapper
  // (cockpitTable's mountShell writes one) the two line up already and this must not fire, or a
  // <div class="tablewrap"> would be matched against the table one level down and rebuilt.
  const TABLE_WRAP = "tablewrap";
  const wrappedTable = (el) =>
    el && el.nodeType === 1 && el.tagName === "DIV" && el.classList.contains(TABLE_WRAP) &&
    el.childElementCount === 1 && el.firstElementChild.tagName === "TABLE"
      ? el.firstElementChild
      : null;

  // The same shape one control down, and it bites harder. `initSelects` (design >=0.21.0) turns
  // every <select> into a combobox: a <span class="select-field"> holding the original select —
  // kept as the value, hidden with tabindex/aria-hidden — plus the <button> the user actually
  // clicks and, while it is open, the listbox panel. None of that appears in any renderer's
  // markup either, so without this the DOM says <span> where the markup says <select>, the whole
  // widget is replaced on EVERY patch, and the runtime's observer re-enhances the replacement so
  // the next patch does it again.
  //
  // Unlike the table, that destruction is user-visible AND it eats input. A patch landing while
  // the listbox is open destroys the panel mid-click: the click selects nothing, no `change` ever
  // fires, and the page never learns there was an edit. On /automation/config that read as
  // "changing a model does not enable save changes" — and it sent four investigations through the
  // handlers, `dirty()` and event propagation, all of which were correct the whole time. Nothing
  // in the page's source can show this, because the fault is that the event never happened.
  //
  // NOT `childElementCount === 1` like the table: this wrapper holds the select AND the trigger
  // (and the panel while open). The select is identified by being the FIRST element inside a
  // `.select-field`, which is exactly where `enhance()` puts it. Making the select the slot also
  // means the patcher descends into it and never walks the wrapper's other children, so the
  // trigger and the open panel are not merely preserved — they are never visited.
  const SELECT_WRAP = "select-field";
  const selectIn = (el) =>
    el && el.nodeType === 1 && el.tagName === "SPAN" && el.classList.contains(SELECT_WRAP) &&
    el.firstElementChild && el.firstElementChild.tagName === "SELECT"
      ? el.firstElementChild
      : null;
  // …and one more level for a FILTER (design 0.60.0): `select[data-filter]` is enhanced into
  // `span.filter-dd.btn-group` > `span.select-field` > select + trigger, with the clear button a
  // sibling of the field. The group is a slot for the select two levels down, exactly as the field
  // is one level down; without it the stats tab's repository picker was replaced on every patch, and
  // a patch landing while its list was open took the list with it mid-click.
  const FILTER_WRAP = "filter-dd";
  const wrappedSelect = (el) =>
    selectIn(el) ||
    (el && el.nodeType === 1 && el.tagName === "SPAN" && el.classList.contains(FILTER_WRAP) ? selectIn(el.firstElementChild) : null);

  // `tabindex` and `aria-hidden` on a wrapped select are the RUNTIME's, not the renderer's:
  // `enhance()` sets them to take the real control out of the tab order and hide it from assistive
  // tech in favour of the button beside it. No page emits either, so the removal loop in
  // patchAttributes would strip both on the first patch and leave a focusable, screen-reader-
  // visible duplicate of a control already on the page. Same class as `open` on <details> and
  // `hidden` on <tr> — an attribute the renderer does not own and must not answer for.
  //
  // `data-scroll` on a `.tablewrap` is the second case (design 0.43.0). initTableScroll measures
  // whether the table has columns hidden off either edge and writes none|start|middle|end there;
  // chrome.css paints the fades from it. A page that hand-wrote its own `<div class="tablewrap">`
  // owns that div in its markup, so without this the loop below would strip the attribute on every
  // poll — the fades would vanish and not come back until the reader happened to scroll or resize,
  // which is precisely when they are least useful.
  //
  // A MENU's roles, roving tabindex and popup state are the runtime's too (design 0.60.0), and they
  // need no exemption here: `initDropdowns()` re-asserts them the moment a patch strips them, which
  // bin/cockpit-dom-check measures (same nodes, same focus). Its `dd-menu-*` ids are the exception,
  // because an id is also a KEY to this file.
  const runtimeOwnsAttribute = (el, name) =>
    (el.tagName === "SELECT" && (name === "tabindex" || name === "aria-hidden") &&
      el.parentElement && el.parentElement.classList.contains(SELECT_WRAP)) ||
    (name === "data-scroll" && el.classList.contains(TABLE_WRAP)) ||
    (name === "id" && RUNTIME_ID.test(el.id));

  // The wrapper has no id and no data-key of its own — the runtime sets only a class — so a keyed
  // table (or select) keeps its identity through the wrapper rather than losing it and being
  // rebuilt.
  const keyOfSlot = (el) => {
    if (el.nodeType !== 1) return null;
    const inner = wrappedTable(el) || wrappedSelect(el);
    return keyOf(el) || (inner ? keyOf(inner) : null);
  };
  // Only ever against the matching incoming tag: when the markup carries its own wrapper the two
  // line up already and this must not fire, or a wrapper would be matched against the control one
  // level down and rebuilt — the very thing it exists to prevent.
  const slotFor = (el, next) => {
    if (!next || next.nodeType !== 1) return el;
    if (next.tagName === "TABLE") return wrappedTable(el) || el;
    if (next.tagName === "SELECT") return wrappedSelect(el) || el;
    return el;
  };

  // The engine's "no rows" / "nothing matches" row (design 0.60.0, `tr[data-table-placeholder]`) is
  // the RUNTIME's and never a renderer's, so it is never patched into a data row: it is replaced.
  // Reused, it lost the incoming row — the engine keeps a reference to its placeholder and removes
  // it on the next apply, by then holding the first row of the poll (bin/cockpit-dom-check 3b: a
  // table filtered to nothing, polled with a match in first place, showed no match).
  const isPlaceholderRow = (el) => el.nodeType === 1 && el.tagName === "TR" && el.hasAttribute("data-table-placeholder");

  function patchAttributes(oldEl, newEl) {
    for (const { name, value } of newEl.attributes) {
      // A fold the reader opened stays open. `open` is a reflected attribute with no dirty flag —
      // unlike a text field, nothing in the platform protects it — so a renderer that does not
      // emit it would close a <details> mid-read on every refresh.
      if (name === "open" && oldEl.tagName === "DETAILS") continue;
      if (oldEl.getAttribute(name) !== value) oldEl.setAttribute(name, value);
    }
    for (const name of oldEl.getAttributeNames()) {
      if (name === "open" && oldEl.tagName === "DETAILS") continue;
      // Which PAGE of a table is showing is the reader's, exactly like the open <details> above,
      // and for the same reason: the renderer builds every matching row and knows nothing about
      // paging, so its markup never carries `hidden` and this loop would strip it off all but the
      // first twenty rows on every poll. The pager (design 0.22.0) watches for that and puts it
      // back, so the visible bug would be small — but "the renderer does not own this attribute"
      // is the true statement, and making the patcher respect it is cheaper than a repair loop.
      if (name === "hidden" && oldEl.tagName === "TR") continue;
      if (runtimeOwnsAttribute(oldEl, name)) continue;
      if (!newEl.hasAttribute(name)) oldEl.removeAttribute(name);
    }
  }

  function patchNode(oldNode, newNode) {
    if (oldNode.nodeType !== 1) {
      if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
      return;
    }
    patchAttributes(oldNode, newNode);
    patchChildren(oldNode, newNode.childNodes);
  }

  function patchChildren(parent, incoming) {
    const keyed = new Map();
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 1) continue;
      const key = keyOfSlot(node);
      if (key && !keyed.has(key)) keyed.set(key, node);
    }
    let cursor = parent.firstChild;
    for (const next of incoming) {
      const key = next.nodeType === 1 ? keyOf(next) : null;
      let match = null;
      if (key) {
        const candidate = keyed.get(key);
        if (candidate && sameKind(slotFor(candidate, next), next)) { match = candidate; keyed.delete(key); }
      } else if (cursor && sameKind(slotFor(cursor, next), next) && !(cursor.nodeType === 1 && keyOfSlot(cursor)) && !isPlaceholderRow(cursor)) {
        match = cursor;
      }
      if (match) {
        if (match !== cursor) parent.insertBefore(match, cursor);   // it moved; carry the node with it
        patchNode(slotFor(match, next), next);
        cursor = match.nextSibling;
        continue;
      }
      const fresh = document.importNode(next, true);
      // An unkeyed node in the way is spent — replace it, so the two lists stay in step. A KEYED
      // one is not: a later row may still claim it, and stealing its place here would rebuild the
      // very node the key exists to preserve.
      if (cursor && !(cursor.nodeType === 1 && keyOfSlot(cursor))) {
        const after = cursor.nextSibling;
        parent.replaceChild(fresh, cursor);
        cursor = after;
      } else {
        parent.insertBefore(fresh, cursor);
      }
    }
    while (cursor) {
      const after = cursor.nextSibling;
      parent.removeChild(cursor);
      cursor = after;
    }
  }

  // `source` is an HTML string, or a node whose CHILDREN are the new content — the second form is
  // for renderers that build with createElement + textContent because the text is untrusted, and
  // must keep doing so.
  window.cockpitPatch = (mount, source) => {
    if (!mount) return;
    let incoming;
    if (typeof source === "string") {
      parser.innerHTML = source;
      incoming = [...parser.content.childNodes];
    } else {
      incoming = [...source.childNodes];
    }
    if (!mount.firstChild) {
      for (const node of incoming) mount.appendChild(document.importNode(node, true));
      return;
    }
    patchChildren(mount, incoming);
  };
})();
