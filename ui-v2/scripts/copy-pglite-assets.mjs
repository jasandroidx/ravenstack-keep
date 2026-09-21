#!/usr/bin/env node
/**
 * PGLite ships its Postgres-in-WASM payload as three files
 * (pglite.wasm, pglite.data, initdb.wasm) that its bundled JS resolves via
 * `new URL('./pglite.data', import.meta.url)` at runtime. Vite/Nitro's
 * server build inlines the JS wrapper into `.output/server/_libs/` but does
 * not follow those `new URL(...)` asset references for a prebuilt
 * dependency, so the files never land next to it — every PGLite call then
 * fails closed with ENOENT once deployed (dev mode never hits this: it
 * reads straight from node_modules).
 *
 * This is a known packaging gap (see electric-sql/pglite bundler issues),
 * not something fixable from our own source, so we copy the three files in
 * as a build step instead of patching the bundler internals.
 */
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// This is an npm workspace — pglite is hoisted to the repo-root node_modules,
// not ui-v2/node_modules. Resolve its main entry (its `exports` map has no
// "./package.json", so resolve the package itself) rather than assuming a
// layout, so this keeps working whether or not npm decides to hoist it. The
// main entry lives directly in dist/, alongside the wasm/data assets.
const entryPath = import.meta.resolve("@electric-sql/pglite");
const srcDir = dirname(fileURLToPath(entryPath));
const destDir = join(root, ".output", "server", "_libs");

const assets = ["pglite.data", "pglite.wasm", "initdb.wasm"];

if (!existsSync(destDir)) {
  console.log(`[copy-pglite-assets] ${destDir} does not exist (no server build?) — skipping.`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

for (const asset of assets) {
  const src = join(srcDir, asset);
  const dest = join(destDir, asset);
  if (!existsSync(src)) {
    console.error(`[copy-pglite-assets] missing source asset: ${src}`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(src, dest);
  console.log(`[copy-pglite-assets] copied ${asset} -> ${dest}`);
}
