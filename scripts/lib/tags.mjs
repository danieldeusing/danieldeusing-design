/*
 * tags.mjs — where the elements of an HTML source start and end, for edits that splice it (0.64.0).
 *
 * The bake changes a page in a few places and must leave every other byte as the author wrote it, so
 * it never re-serializes a parsed page: it finds each element's offsets here and replaces those
 * spans. A comment, a doctype and the content of script, style, title and textarea are skipped
 * whole; `/>` closes any element, as an svg's <path/> is written; an end tag closes the nearest open
 * element of its name and everything opened inside it. Enough for pages written from the templates,
 * not a general HTML parser.
 */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "title", "textarea"]);
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTR = /\s+([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITIES = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " " };

export const escapeText = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export const escapeAttr = (s) => escapeText(s).replaceAll('"', "&quot;");
export const unescape = (s) => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(quot|amp|lt|gt|apos|nbsp));/gi,
  (m, dec, hex, name) => (dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()]));

/** Every element in source order: { tag, attrs, start, openEnd, closeStart, end, parent }. A void or unclosed one has no closeStart and end. */
export function scan(html) {
  const elements = [];
  const open = [];
  let i = 0;
  while ((i = html.indexOf("<", i)) !== -1) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    TAG.lastIndex = i;
    const m = TAG.exec(html);
    if (!m) {
      i += 1;
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let k = open.length - 1; k >= 0; k -= 1) {
        if (open[k].tag !== tag) continue;
        open[k].closeStart = i;
        open[k].end = i + m[0].length;
        open.length = k;
        break;
      }
      i += m[0].length;
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(ATTR)) attrs[a[1].toLowerCase()] = unescape(a[2] ?? a[3] ?? a[4] ?? "");
    const el = { tag, attrs, start: i, openEnd: i + m[0].length, parent: open.at(-1) ?? null };
    elements.push(el);
    i = el.openEnd;
    if (m[4] || VOID.has(tag)) continue;
    if (RAW.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "ig");
      close.lastIndex = i;
      const found = close.exec(html);
      el.closeStart = found ? found.index : html.length;
      el.end = found ? found.index + found[0].length : html.length;
      i = el.end;
      continue;
    }
    open.push(el);
  }
  return elements;
}

export const hasClass = (el, name) => (el.attrs.class ?? "").split(/\s+/).includes(name);
export const content = (html, el) => html.slice(el.openEnd, el.closeStart);
export function inside(el, test) {
  for (let p = el.parent; p; p = p.parent) if (test(p)) return true;
  return false;
}

/** The start tag with attribute `name` set to `value`: null removes it, true writes it without a value. Every other attribute keeps its bytes. */
export function setAttr(tagText, name, value) {
  const head = tagText.match(/^<[a-zA-Z][\w:-]*/)[0];
  const tail = tagText.match(/\s*\/?>$/)[0];
  const body = tagText.slice(head.length, tagText.length - tail.length);
  const pair = value === null ? "" : value === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
  for (const m of body.matchAll(ATTR)) {
    if (m[1].toLowerCase() === name) return head + body.slice(0, m.index) + pair + body.slice(m.index + m[0].length) + tail;
  }
  return value === null ? tagText : head + body + pair + tail;
}

/** Applies [{ start, end, text }]. At one offset a replacement goes first and inserts keep their order; overlapping edits throw. */
export function splice(html, edits) {
  const ordered = edits.map((e, seq) => ({ ...e, seq })).sort((a, b) => b.start - a.start || b.end - a.end || b.seq - a.seq);
  let out = html;
  let limit = Infinity;
  for (const e of ordered) {
    if (e.end > limit) throw new Error(`overlapping edits at offset ${e.start}`);
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    limit = e.start;
  }
  return out;
}
