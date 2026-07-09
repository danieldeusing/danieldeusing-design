/*
 * Build the distributable artifacts from src/. Zero dependencies — the design
 * system installs nothing.
 *
 * Outputs:
 *   dist/danieldeusing-design.css      — src/index.css with @imports inlined (CDN bundle)
 *   dist/danieldeusing-design.min.css  — minified bundle
 *   tokens/tokens.json                 — tokens.css parsed into JSON (for native/Tauri/Figma)
 *
 * Run: node scripts/build.mjs  (or `npm run build`)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "src");
const distDir = join(root, "dist");
const tokensDir = join(root, "tokens");

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const banner = `/*! danieldeusing-design v${pkg.version} | MIT | https://github.com/danieldeusing/danieldeusing-design */\n`;

/* ── 1. Inline the @imports of index.css, in declared order ─────────────── */

const indexCss = await readFile(join(srcDir, "index.css"), "utf8");
const importRe = /@import\s+["']\.\/([^"']+)["']\s*;/g;
const importedFiles = [...indexCss.matchAll(importRe)].map((match) => match[1]);

let body = "";
for (const file of importedFiles) {
  const css = (await readFile(join(srcDir, file), "utf8")).trim();
  body += `/* ===== ${file} ===== */\n${css}\n\n`;
}
body = body.trimEnd() + "\n";

/* ── 2. Minify (comment- and string-aware) ──────────────────────────────── */

function minify(css) {
  let out = "";
  let pendingSpace = false;
  const dropSpaceNextTo = "{};,>";
  for (let i = 0; i < css.length; ) {
    const char = css[i];

    // strip comments
    if (char === "/" && css[i + 1] === "*") {
      i += 2;
      while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    // copy string literals verbatim (so content: "$ " and font names survive)
    if (char === '"' || char === "'") {
      if (pendingSpace && out && !dropSpaceNextTo.includes(out[out.length - 1])) out += " ";
      pendingSpace = false;
      const quote = char;
      out += char;
      i += 1;
      while (i < css.length) {
        out += css[i];
        if (css[i] === "\\") {
          out += css[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (css[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // collapse whitespace
    if (/\s/.test(char)) {
      pendingSpace = true;
      i += 1;
      continue;
    }

    // a significant character: emit the pending space only when it is meaningful
    if (pendingSpace) {
      const prev = out[out.length - 1];
      if (out && !dropSpaceNextTo.includes(prev) && !dropSpaceNextTo.includes(char)) out += " ";
      pendingSpace = false;
    }
    out += char;
    i += 1;
  }
  return out.replace(/;}/g, "}").trim();
}

await mkdir(distDir, { recursive: true });
await writeFile(join(distDir, "danieldeusing-design.css"), banner + body);
await writeFile(join(distDir, "danieldeusing-design.min.css"), banner + minify(body) + "\n");

/* ── 3. Derive tokens.json from tokens.css ──────────────────────────────── */

const tokensCss = await readFile(join(srcDir, "tokens.css"), "utf8");
const blockRe = /(:root|html\[data-theme="(\w+)"\])\s*\{([^}]*)\}/g;
const declRe = /--([\w-]+)\s*:\s*([^;]+);/g;
const themes = {};
for (const block of tokensCss.matchAll(blockRe)) {
  const theme = block[2] ?? "warm"; // :root is the warm default
  const values = {};
  for (const decl of block[3].matchAll(declRe)) values[decl[1]] = decl[2].trim();
  themes[theme] = values;
}

const tokensJson = {
  $schema: "https://danieldeusing.de/schemas/design-tokens.json",
  description:
    "danieldeusing terminal design tokens, by theme. Generated from src/tokens.css — do not edit by hand.",
  themes,
};

await mkdir(tokensDir, { recursive: true });
await writeFile(join(tokensDir, "tokens.json"), JSON.stringify(tokensJson, null, 2) + "\n");

/* ── done ───────────────────────────────────────────────────────────────── */

const bytes = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} kB`;
console.log("built dist + tokens:");
console.log(`  dist/danieldeusing-design.css      ${bytes(banner + body)}`);
console.log(`  dist/danieldeusing-design.min.css  ${bytes(banner + minify(body))}`);
console.log(`  tokens/tokens.json                 ${Object.keys(themes).length} themes`);
