/*
 * danieldeusing-design — dropdown controller.
 *
 * Behaviour for <details class="dropdown"> menus styled by components.css:
 * opening one closes the others, a click outside closes all, and Escape closes
 * all. Native <details> already handles open/close and keyboard focus, so this
 * is purely the "only one open, dismiss on outside interaction" layer.
 */

/**
 * @param {ParentNode} [root=document] Where to look for `details.dropdown`.
 * @returns {(except?: HTMLDetailsElement) => void} A closeAll() you can call
 *   manually (e.g. after a menu item triggers navigation).
 */
export function initDropdowns(root = document) {
  const dropdowns = /** @type {HTMLDetailsElement[]} */ (
    Array.from(root.querySelectorAll("details.dropdown"))
  );

  const closeAll = (except) => {
    dropdowns.forEach((dropdown) => {
      if (dropdown !== except) dropdown.removeAttribute("open");
    });
  };

  dropdowns.forEach((dropdown) => {
    dropdown.addEventListener("toggle", () => {
      if (dropdown.open) closeAll(dropdown);
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !dropdowns.some((dropdown) => dropdown.contains(target))) {
      closeAll();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });

  return closeAll;
}
