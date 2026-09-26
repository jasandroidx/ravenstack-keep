#!/usr/bin/env node
/**
 * Standalone page renderer for Corvid's browser_render tool.
 *
 * Deliberately NOT imported by the app's server code (src/) — it's invoked
 * as a subprocess from src/lib/keep/corvid-tools.ts, the same way
 * copy-pglite-assets.mjs in this directory runs outside the Vite/Nitro
 * bundle. That keeps Playwright and its browser binary entirely out of the
 * Nitro server bundle: the same class of bundler footgun that broke PGLite
 * (a native/binary dependency silently dropped or mis-packaged by the
 * build). A subprocess resolves `playwright` at its own runtime, from the
 * repo's existing hoisted node_modules, sidestepping that risk entirely —
 * and this exact launch pattern (chromium.launch with --no-sandbox) was
 * proven working live on this box throughout the 2026-09-21/22 session.
 *
 * On-demand only, one page per invocation, closes when done — never a
 * persistent browser process, matching Corvid's "never ambient" rule.
 *
 * Usage: node render-page.mjs <url>
 * Prints the page's visible text to stdout, or "ERROR: <message>" + exit 1.
 */
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) {
  console.error("ERROR: usage: render-page.mjs <url>");
  process.exit(1);
}

let browser;
try {
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  const text = await page.locator("body").innerText();
  process.stdout.write(text.slice(0, 8000));
} catch (err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
