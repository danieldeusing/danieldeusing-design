#!/usr/bin/env node
/*
 * verify-baked.mjs — a baked page opened the way a preview opens it (0.64.0).
 *
 *   node scripts/verify-baked.mjs <page.html> [<page.html> …]
 *
 * Network blocked and JavaScript off, at 375 and 1400 px: no request leaves the page, every diagram
 * holds its svg (an estate page: the four theme variants, warm shown), and at 375 px the page does
 * not scroll sideways. Then JavaScript on, still offline, at 1400 px: no request, no script error,
 * the runtime is there on a dd-baked page, and the paper theme shows the paper variants and a
 * diagram's zoom opens the paper one. A full-page screenshot per width goes to the temp directory:
 * look at both before a page is called done. The same check on a page as written fails.
 * Exit codes: 0 every page passed, 1 a page failed, 2 usage or no browser.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { CHROME, launch, serve, sleep } from "./lib/chromium.mjs";

const pages = process.argv.slice(2).map((p) => resolve(p));
if (!pages.length || pages.some((p) => !existsSync(p))) {
  console.error("usage: node scripts/verify-baked.mjs <page.html> [<page.html> …], every page an existing file");
  process.exit(2);
}
if (!CHROME) {
  console.error("verify-baked: no Chrome or Chromium on this machine (set DD_CHROME)");
  process.exit(2);
}

const STATE = `(() => ({
  diagrams: [...document.querySelectorAll("pre.mermaid")].map((pre) => {
    const svgs = [...pre.querySelectorAll(":scope > svg")];
    return { variants: svgs.map((s) => s.getAttribute("data-theme-variant")),
             shown: svgs.filter((s) => s.getClientRects().length).map((s) => s.getAttribute("data-theme-variant") ?? "svg") };
  }),
  sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  height: document.documentElement.scrollHeight,
}))()`;

const LIVE = `(async () => {
  const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  const baked = !!document.querySelector('meta[name="dd-baked"]');
  const variants = !!document.querySelector("pre.mermaid > svg[data-theme-variant]");
  const result = { baked, variants, runtime: typeof globalThis.ddRuntime };
  if (!variants) return result;
  document.documentElement.dataset.theme = "paper";
  await frame();
  result.shown = [...document.querySelectorAll("pre.mermaid")].map((pre) =>
    [...pre.querySelectorAll(":scope > svg")].filter((s) => s.getClientRects().length).map((s) => s.dataset.themeVariant).join());
  document.querySelector("pre.mermaid").click();
  await frame();
  result.zoomed = document.querySelector("dialog.dgm-overlay[open] svg")?.dataset.themeVariant ?? null;
  document.querySelector("dialog.dgm-overlay[open]")?.close();
  return result;
})()`;

let failed = 0;
for (const page of pages) {
  const problems = [];
  const shots = [];
  const left = new Set();
  const errors = [];
  const server = await serve(dirname(page), { "/__verify.html": readFileSync(page, "utf8") });
  const browser = await launch("verify-baked");
  try {
    browser.on("Fetch.requestPaused", ({ requestId, request }) => {
      if (request.url.startsWith(server.origin)) return browser.send("Fetch.continueRequest", { requestId });
      left.add(request.url);
      return browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    });
    browser.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
      errors.push(exceptionDetails.exception?.description?.split("\n")[0] ?? exceptionDetails.text));
    await browser.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await browser.send("Emulation.setScriptExecutionDisabled", { value: true });
    for (const width of [375, 1400]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await browser.navigate(`${server.origin}/__verify.html`);
      await sleep(300);
      const state = await browser.evaluate(STATE);
      state.diagrams.forEach((d, i) => {
        if (!d.variants.length) problems.push(`${width} px, JavaScript off: diagram ${i + 1} holds no svg`);
        else if (d.variants.some(Boolean) && (d.variants.slice().sort().join() !== "green,mono,paper,warm" || d.shown.join() !== "warm"))
          problems.push(`${width} px, JavaScript off: diagram ${i + 1} holds ${d.variants.join(", ")} and shows ${d.shown.join(", ") || "none"}`);
        else if (!d.shown.length) problems.push(`${width} px, JavaScript off: diagram ${i + 1} shows no svg`);
      });
      if (width === 375 && state.sideways > 1) problems.push(`375 px: the page scrolls sideways by ${state.sideways} px`);
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: Math.min(state.height, 16000), deviceScaleFactor: 1, mobile: width < 768 });
      const { data } = await browser.send("Page.captureScreenshot", { format: "png" });
      const shot = join(tmpdir(), `${basename(page, ".html")}-${width}.png`);
      writeFileSync(shot, Buffer.from(data, "base64"));
      shots.push(shot);
    }
    await browser.send("Emulation.setScriptExecutionDisabled", { value: false });
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.navigate(`${server.origin}/__verify.html`);
    await sleep(800);
    const live = await browser.evaluate(LIVE);
    if (live.baked && live.runtime !== "object") problems.push("JavaScript on: no globalThis.ddRuntime, the runtime was not inlined");
    if (live.variants && live.shown.some((s) => s !== "paper")) problems.push(`JavaScript on, paper theme: the diagrams show ${live.shown.join(" | ")}`);
    if (live.variants && live.zoomed !== "paper") problems.push(`JavaScript on, paper theme: the zoom opened ${live.zoomed ?? "nothing"}`);
  } catch (error) {
    problems.push(`the check threw: ${error.message.split("\n")[0]}`);
  } finally {
    browser.close();
    server.close();
  }
  for (const url of left) problems.push(`a request left the page: ${url}`);
  for (const error of errors) problems.push(`JavaScript error: ${error}`);
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${page}`);
  for (const p of problems) console.log(`        ${p}`);
  for (const s of shots) console.log(`        screenshot: ${s}`);
  if (problems.length) failed += 1;
}
process.exit(failed ? 1 : 0);
