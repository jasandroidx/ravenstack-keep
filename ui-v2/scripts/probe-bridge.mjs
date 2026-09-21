#!/usr/bin/env node
/**
 * Diagnose the FastMCP bridge from the same code the app uses.
 *
 *   npm run probe:bridge          (from ui-v2/)
 *
 * Loads .env exactly as vite.config.ts does, resolves the endpoints, calls a
 * read-only tool, and prints what actually came back. Answers in one shot the
 * question "is it my .env, my URL, TLS, or the server?".
 *
 * Read-only: pending_gates only. Never calls a confirm=true tool.
 */
import { loadEnv } from "vite";

const fileEnv = loadEnv("development", process.cwd(), "");
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

/** Funnel URLs carry a secret path segment; never print one in full. */
function redact(url) {
  if (!url) return "(not set)";
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean);
    const safe = path.map((seg, i) => (i < path.length - 1 && seg.length > 5 ? "<redacted>" : seg));
    return `${u.protocol}//${u.host}/${safe.join("/")}`;
  } catch {
    return "(unparseable)";
  }
}

const { FASTMCP_CONFIG, isFastMCPConfigured, executeFastMCPTool } = await import(
  "../src/lib/keep/fastmcp.ts"
);

console.log("\n— environment —");
console.log("  .env found          :", Object.keys(fileEnv).length ? "yes" : "no (or empty)");
console.log("  FASTMCP_FUNNEL_URL  :", redact(FASTMCP_CONFIG.primaryFunnel));
console.log("  FASTMCP_INTERNAL_URL:", redact(FASTMCP_CONFIG.fallbackInternal));
console.log("  configured          :", isFastMCPConfigured());

if (!isFastMCPConfigured()) {
  console.log("\nNo endpoint set. Create ui-v2/.env with FASTMCP_INTERNAL_URL=… and re-run.\n");
  process.exit(1);
}

console.log("\n— calling pending_gates —");
const res = await executeFastMCPTool("pending_gates", {});
console.log("  ok       :", res.ok);
console.log("  source   :", res.source);
console.log("  endpoint :", redact(res.endpoint));
console.log("  latency  :", `${res.latencyMs}ms`);
if (res.error) console.log("  error    :", res.error);

if (res.ok) {
  const text = res.data?.content?.[0]?.text;
  console.log("\n— payload —");
  console.log(text ? text.slice(0, 400) : JSON.stringify(res.data).slice(0, 400));
  console.log("\nBridge is live. The war table will show these.\n");
} else {
  console.log("\nBridge did not answer. The error above is the whole story —");
  console.log("the app reports exactly this rather than inventing data.\n");
  process.exit(1);
}
