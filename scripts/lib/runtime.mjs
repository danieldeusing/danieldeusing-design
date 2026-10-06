/*
 * runtime.mjs — the runtime as one classic script, and the part of it one page uses (0.64.0).
 *
 * A baked page (scripts/bake.mjs) loads nothing, so it cannot import runtime/index.js and the
 * modules behind it. dist/danieldeusing-design.runtime.js holds the same code as ONE classic script:
 * each module is a RECORD, a function that holds its code, so the top-level names that clash when the
 * files are pasted together (27 of them) stay apart. An import becomes a read of the record it names;
 * the exports become the record's return value. The loader at the end runs a record the first time
 * something asks for it, so records run in dependency order, and it puts every export on
 * globalThis.ddRuntime.
 *
 * Only the forms runtime/ uses are handled: `export function` and `export const`, and
 * `import { a, b } from "./x.js";` on one line. Anything else is refused with its file and line, so a
 * module written another way fails the build instead of shipping a bundle that lacks it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const IMPORT = /^import \{([^}]*)\} from "\.\/([a-z0-9-]+)\.js";\s*$/;
const EXPORT = /^export (?:function|const) ([A-Za-z_$][\w$]*)/;
const RECORD = /^\/\/@dd-record (\S+) deps=(\S*) exports=(\S*)$/m;
const LOADER = "//@dd-loader\n";
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

/** The runtime/ modules as one classic script. Throws with every unhandled form, each with its file and line. */
export function buildRuntime(dir, version) {
  const problems = [];
  const listed = new Set();
  readFileSync(join(dir, "index.js"), "utf8").split("\n").forEach((line, i) => {
    const reexport = line.match(/^export \* from "\.\/([a-z0-9-]+)\.js";\s*$/);
    if (reexport) listed.add(reexport[1]);
    else if (line.trim() && !isComment(line)) problems.push(`runtime/index.js:${i + 1}: only \`export * from "./x.js";\` lines are bundled: ${line.trim()}`);
  });
  const modules = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "index.js").sort()) {
    const name = file.slice(0, -3);
    if (!listed.has(name)) problems.push(`runtime/${file}: not re-exported by runtime/index.js`);
    const deps = [];
    const exports = [];
    const imports = [];
    const code = readFileSync(join(dir, file), "utf8").split("\n").map((line, i) => {
      const where = `runtime/${file}:${i + 1}`;
      if (isComment(line)) return line;
      const imported = line.match(IMPORT);
      if (imported) {
        const names = imported[1].split(",").map((n) => n.trim()).filter(Boolean);
        if (names.some((n) => !/^[A-Za-z_$][\w$]*$/.test(n))) problems.push(`${where}: a renamed import is not bundled: ${line.trim()}`);
        deps.push(imported[2]);
        imports.push({ where, from: imported[2], names });
        return `const { ${names.join(", ")} } = __dd(${JSON.stringify(imported[2])});`;
      }
      if (/^\s*import\b|\bimport\s*\(|\bimport\.meta\b/.test(line)) problems.push(`${where}: an import form the bundle does not handle: ${line.trim()}`);
      const exported = line.match(EXPORT);
      if (exported) {
        exports.push(exported[1]);
        return line.slice("export ".length);
      }
      if (/^\s*export\b/.test(line)) problems.push(`${where}: an export form the bundle does not handle: ${line.trim()}`);
      return line;
    });
    modules[name] = { deps, exports, imports, code };
  }
  for (const name of listed) if (!modules[name]) problems.push(`runtime/index.js re-exports ./${name}.js, which does not exist`);
  const owner = {};
  for (const [name, module] of Object.entries(modules)) {
    for (const exported of module.exports) {
      if (owner[exported]) problems.push(`runtime/${name}.js and runtime/${owner[exported]}.js both export ${exported}`);
      owner[exported] = name;
    }
    for (const { where, from, names } of module.imports) {
      if (!modules[from]) problems.push(`${where}: ./${from}.js does not exist`);
      else for (const n of names) if (!modules[from].exports.includes(n)) problems.push(`${where}: ./${from}.js exports no ${n}`);
    }
  }
  const state = {};
  const visit = (name, path) => {
    if (state[name] === "done" || !modules[name]) return;
    if (state[name] === "open") {
      problems.push(`runtime/: an import cycle: ${[...path, name].join(" -> ")}`);
      return;
    }
    state[name] = "open";
    for (const dep of modules[name].deps) visit(dep, [...path, name]);
    state[name] = "done";
  };
  for (const name of Object.keys(modules)) visit(name, []);
  if (problems.length) throw new Error(problems.join("\n"));
  const records = Object.entries(modules).map(([name, module]) =>
    `//@dd-record ${name} deps=${module.deps.join(",")} exports=${module.exports.join(",")}\n` +
    `records[${JSON.stringify(name)}] = (__dd) => {\n${module.code.join("\n").trimEnd()}\nreturn { ${module.exports.join(", ")} };\n};\n`);
  return `/*! danieldeusing-design v${version} runtime | MIT | built by scripts/build.mjs from runtime/; a baked page carries it instead of importing runtime/index.js */\n` +
    `(() => {\n"use strict";\nconst records = {};\n${records.join("")}${LOADER}` +
    "const done = {};\nconst __dd = (name) => (done[name] ??= records[name](__dd));\nconst api = {};\n" +
    "for (const name of Object.keys(records)) Object.assign(api, __dd(name));\nglobalThis.ddRuntime = Object.freeze(api);\n})();\n";
}

/** The records that export `names`, the records those import, and the loader. */
export function subsetRuntime(text, names) {
  const first = text.indexOf("//@dd-record ");
  const loader = text.indexOf(LOADER);
  if (first < 0 || loader < first) throw new Error("not a runtime file: it has no //@dd-record or no //@dd-loader");
  const records = {};
  for (const chunk of text.slice(first, loader).split(/(?=^\/\/@dd-record )/m)) {
    const [, name, deps, exports] = chunk.match(RECORD);
    records[name] = { deps: deps ? deps.split(",") : [], exports: exports ? exports.split(",") : [], chunk };
  }
  const owner = {};
  for (const [name, record] of Object.entries(records)) for (const exported of record.exports) owner[exported] = name;
  const unknown = names.filter((n) => !owner[n]);
  if (unknown.length) throw new Error(`the runtime exports no ${unknown.join(", ")}`);
  const keep = new Set();
  const add = (name) => {
    if (keep.has(name)) return;
    keep.add(name);
    records[name].deps.forEach(add);
  };
  names.forEach((n) => add(owner[n]));
  return text.slice(0, first) + Object.keys(records).filter((n) => keep.has(n)).map((n) => records[n].chunk).join("") + text.slice(loader);
}
