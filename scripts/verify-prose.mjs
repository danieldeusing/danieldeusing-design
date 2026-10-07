#!/usr/bin/env node
/*
 * verify-prose.mjs — the prose of a page against ASD-STE100, as warnings.
 *
 *   node scripts/verify-prose.mjs <page.html> [<page.html> …]
 *
 * A port of html-plan's prose check (anthropics/claude-plugins-community, runtime/pack.mjs, MIT):
 * a few unapproved words with their replacements, contractions, "has/have/had" + verb, a passive
 * with "by", sentences over 25 words and paragraphs over six sentences. It reads the text in
 * <main>, without comments, script, style, template, svg, pre, code and kbd. The vu3-agent-kit's
 * bake.py --check prints the same warnings for a VU3 page: change the two together. It decodes
 * only the entities lib/tags.mjs knows; the Python port decodes all. JavaScript's \w and \b match
 * ASCII only, Python's match Unicode letters, so a word next to an accented letter can warn in
 * one port and not the other.
 * Exit codes: 0 always for pages that exist (warnings never fail), 2 usage.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unescape } from "./lib/tags.mjs";

const STE = {
  utilize: "use", utilizes: "uses", leverage: "use", leverages: "uses", facilitate: "help",
  facilitates: "helps", "in order to": "to", subsequently: "then", aforementioned: "this",
  "prior to": "before", additionally: "also", furthermore: "also", however: "but",
  comprehensive: "full", robust: "strong", seamless: "smooth", seamlessly: "smoothly",
  numerous: "many", commence: "start", commences: "starts", begin: "start", begins: "starts",
  terminate: "stop", terminates: "stops", demonstrate: "show", demonstrates: "shows",
  indicate: "show", indicates: "shows", ensure: "make sure", ensures: "makes sure",
  verify: "make sure", verifies: "makes sure", perform: "do", performs: "does", "carry out": "do",
  "carries out": "does", obtain: "get", obtains: "gets", provide: "give", provides: "gives",
  should: "must", shall: "must", might: "can", "with respect to": "about",
  "due to the fact that": "because",
};
const NOT_PROSE = /<(script|style|template|svg|pre|code|kbd)\b[\s\S]*?<\/\1\s*>/gi;
const PROSE_BLOCK = /<(p|li|dd|td|th|figcaption)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
const plain = (part) => unescape(part.replace(/<[^>]+>/g, " "));
const unique = (list) => [...new Set(list)];

export function proseWarnings(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, " ");
  const main = (text.match(/<main\b[\s\S]*?<\/main\s*>/i) || [text])[0];
  const body = main.replace(NOT_PROSE, " ");
  const prose = plain(body);
  const lower = prose.toLowerCase();
  const found = Object.entries(STE).filter(([word]) => new RegExp(`\\b${word}\\b`).test(lower));
  if (/[a-z,] may\b/.test(prose)) found.push(["may", "can"]);
  const warnings = [];
  if (found.length) {
    const listed = found.slice(0, 8).map(([word, better]) => `"${word}" → "${better}"`).join(", ");
    warnings.push(`ASD-STE100 words: ${listed}${found.length > 8 ? ` … ${found.length - 8} more` : ""}`);
  }
  const contractions = unique(lower.match(/\b(?:\w+n['’]t|(?:it|that|there|here|what|let|who)['’]s|\w+['’](?:re|ve|ll))\b/g) || []);
  if (contractions.length) warnings.push(`ASD-STE100: no contractions — ${contractions.slice(0, 6).join(", ")}`);
  const perfects = unique(lower.match(/\b(?:has|have|had) (?:been|already|not|never|just) \w+|\b(?:has|have|had) \w+ed\b/g) || []);
  if (perfects.length) {
    warnings.push(`ASD-STE100: use simple tenses, not "has/have + verb" — ${perfects.slice(0, 4).map((x) => `"${x}"`).join(", ")}`);
  }
  const passives = unique(lower.match(/\b(?:is|are|was|were|be|been|being) (?:\w+ed|written|sent|made|done|shown|taken|given|kept|held|read|run|set|put|built|chosen) by\b/g) || []);
  if (passives.length) {
    warnings.push(`ASD-STE100: use the active voice — ${passives.slice(0, 4).map((x) => `"${x}"`).join(", ")} (say who does it first)`);
  }
  const blocks = [...body.matchAll(PROSE_BLOCK)].map((match) => plain(match[2]).replace(/\s+/g, " ").trim());
  const sentences = blocks.map((block) => block.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim()));
  const slow = sentences.flat().filter((sentence) => sentence.split(/\s+/).filter(Boolean).length > 25).length;
  if (slow) warnings.push(`${slow} sentence${slow > 1 ? "s" : ""} over 25 words — split them; one idea per sentence`);
  const six = sentences.filter((block) => block.length > 6).length;
  if (six) warnings.push(`ASD-STE100: ${six} paragraph${six > 1 ? "s" : ""} with more than 6 sentences — split`);
  return warnings;
}

function main(args) {
  if (!args.length || args.some((page) => !existsSync(page))) {
    console.error("usage: node scripts/verify-prose.mjs <page.html> [<page.html> …], every page an existing file");
    return 2;
  }
  for (const page of args) {
    const warnings = proseWarnings(readFileSync(page, "utf8"));
    for (const warning of warnings) console.log(`${page}: ${warning}`);
    if (!warnings.length) console.log(`${page}: prose ok`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
