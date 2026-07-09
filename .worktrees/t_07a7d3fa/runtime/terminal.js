/*
 * danieldeusing-design — terminal session animation.
 *
 * Progressive enhancement for the "live shell" effect: `$ command` prompts type
 * out character by character, then their section's output reveals like the
 * command just ran. Sections play in document order; a section scrolled into
 * view later animates on arrival.
 *
 * Markup contract (styled by components.css):
 *   <section data-term>
 *     <p class="prompt">cat about.txt</p>      <!-- the command that types out -->
 *     <div data-term-out>…</div>               <!-- output, revealed after -->
 *   </section>
 *
 * Honours prefers-reduced-motion: with reduced motion (or JS disabled) the
 * html.term-anim gate is never added, so components.css leaves everything
 * visible. initTerminal() is therefore safe to call unconditionally.
 *
 * After the initial on-screen sections finish, it sets window.termContentDone
 * and dispatches a "term:contentdone" event — a hook for chaining a follow-up
 * animation (e.g. a nav that "runs" once the page has finished printing).
 */

export function initTerminal() {
  if (typeof window === "undefined") return;

  // Animation policy: an explicit pick (localStorage "anim", e.g. from a footer
  // toggle) wins over the OS setting. "off" — or no pick while the OS prefers
  // reduced motion — disables every animation by marking html.anim-off
  // (components.css then kills keyframes and hides the cursor). An explicit "on"
  // animates even when the OS prefers reduced motion.
  let animPref = null;
  try {
    animPref = localStorage.getItem("anim");
  } catch {
    /* localStorage can throw in private mode / sandboxed frames */
  }
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animPref === "off" || (animPref === null && prefersReduced)) {
    document.documentElement.classList.add("anim-off");
    return;
  }
  // already gated off pre-paint (e.g. by an inline script) — respect it
  if (document.documentElement.classList.contains("anim-off")) return;

  document.documentElement.classList.add("term-anim");

  const typePrompt = (prompt) =>
    new Promise((finished) => {
      const text = (prompt.textContent || "").trim();
      const typedText = document.createTextNode("");
      const caret = document.createElement("span");
      caret.className = "term-caret";
      caret.setAttribute("aria-hidden", "true");
      prompt.textContent = "";
      prompt.classList.add("term-live");
      prompt.append(typedText, caret);
      // ~35ms per character, capped so long commands finish within ~700ms
      const perCharMs = Math.min(38, 700 / Math.max(text.length, 1));
      let typedCount = 0;
      const typeNext = () => {
        if (typedCount < text.length) {
          typedCount += 1;
          typedText.data = text.slice(0, typedCount);
          setTimeout(typeNext, perCharMs * (0.75 + Math.random() * 0.5));
        } else {
          caret.remove();
          finished();
        }
      };
      typeNext();
    });

  const revealOutputs = (section, instant) =>
    new Promise((finished) => {
      const chunks = section.querySelectorAll("[data-term-out]");
      const stagger = (index) => Math.min(index * 70, 280);
      chunks.forEach((chunk, index) => {
        if (instant) chunk.classList.add("term-show");
        else setTimeout(() => chunk.classList.add("term-show"), stagger(index));
      });
      if (instant) finished();
      else setTimeout(finished, stagger(chunks.length - 1) + 200);
    });

  const playSection = async (section) => {
    const rect = section.getBoundingClientRect();
    const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
    const prompt = section.querySelector(".prompt");
    if (prompt) {
      if (offscreen) prompt.classList.add("term-live");
      else await typePrompt(prompt);
    }
    // reveal the box and let its rows cascade in, but don't await it: the box
    // animation runs in parallel so the next prompt keeps typing and nothing
    // waits on a box finishing.
    void revealOutputs(section, offscreen);
  };

  // sections play one after another, in the order they were triggered
  let sequence = Promise.resolve();
  const enqueue = (section) => {
    sequence = sequence.then(() => playSection(section));
  };

  const start = () => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            enqueue(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    // keep a rooted reference: some engines GC observers held only by their targets
    window.termAnimObserver = observer;
    document.querySelectorAll("[data-term]").forEach((section) => {
      // in or above the viewport: part of the load sequence (playSection reveals
      // already-passed sections instantly); below: animate on scroll-in
      if (section.getBoundingClientRect().top < window.innerHeight) enqueue(section);
      else observer.observe(section);
    });
    // once the initial on-screen content has finished, signal it so callers can
    // chain a follow-up (e.g. a nav that "runs" afterwards)
    sequence = sequence.then(() => {
      window.termContentDone = true;
      window.dispatchEvent(new Event("term:contentdone"));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
