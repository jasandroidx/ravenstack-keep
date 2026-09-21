/**
 * Routing smoke test — `bun run test:routing` from ui-v2/.
 *
 * Stands up a fake Ollama and a fake FastMCP (SSE replies, session header) and
 * drives the real clients against them. No network, no box, no models needed.
 * Covers the failures that read as "nothing works": service down, wrong base
 * URL, an embed-only model list, and a dropped MCP session.
 */
import http from "node:http";
import assert from "node:assert/strict";

function listen(server: http.Server): Promise<number> {
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res((server.address() as any).port)));
}
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });
}

// ---- fake Ollama -----------------------------------------------------------
let lastChatBody: any = null;
const ollama = http.createServer(async (req, res) => {
  if (req.url === "/api/tags") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ models: [
      { name: "nomic-embed-text:latest", size: 274302450, details: { family: "nomic-bert", parameter_size: "137M", quantization_level: "F16" } },
      { name: "llama3.1:8b", size: 4661224676, details: { family: "llama", parameter_size: "8.0B", quantization_level: "Q4_K_M" } },
    ] }));
  }
  if (req.url === "/api/chat") {
    lastChatBody = JSON.parse(await readBody(req));
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: { role: "assistant", content: "  local answer  " }, done: true }));
  }
  res.writeHead(404); res.end("nope");
});

// ---- fake FastMCP (streamable-http, SSE replies) ---------------------------
let sawInitialized = false;
let lastToolCall: any = null;
const mcp = http.createServer(async (req, res) => {
  if (!req.url?.endsWith("/mcp")) { res.writeHead(404); return res.end("wrong path"); }
  const msg = JSON.parse(await readBody(req));

  if (msg.method === "initialize") {
    res.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "sess-abc123" });
    return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fake", version: "1" } } })}\n\n`);
  }
  if (msg.method === "notifications/initialized") { sawInitialized = true; res.writeHead(202); return res.end(); }

  // Everything past handshake must carry the session header.
  if (req.headers["mcp-session-id"] !== "sess-abc123") { res.writeHead(404); return res.end("no session"); }

  if (msg.method === "tools/list") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    return res.end(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [
      { name: "dashboard_status", description: "keep pulse" },
      { name: "stack_health", description: "docker + gateway" },
      { name: "query_scoped_knowledge", description: "scoped vault" },
      { name: "ollama_models", description: "local models" },
    ] } })}\n\n`);
  }
  if (msg.method === "tools/call") {
    lastToolCall = msg.params;
    res.writeHead(200, { "content-type": "text/event-stream" });
    return res.end(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {
      content: [{ type: "text", text: JSON.stringify({ network: "TAILSCALE", agentsActive: 3, rooms: [], services: { reclaw: "up", openclaw: "up", mcp: "up" }, queue: { status: "frozen", cursor: 7 } }) }],
    } })}\n\n`);
  }
  res.writeHead(400); res.end("bad method");
});

const oport = await listen(ollama);
const mport = await listen(mcp);

process.env.OLLAMA_BASE_URL = `127.0.0.1:${oport}`;      // bare host on purpose
process.env.MCP_BASE_URL = `http://127.0.0.1:${mport}`;   // no /mcp suffix on purpose
process.env.KEEP_ALLOW_CLOUD = "0";
delete process.env.KEEP_LOCAL_MODEL;
delete process.env.KEEP_MODEL_ROUTE;

const { listOllamaModels, ollamaBaseUrl, ollamaChat, pickModel, resolveLocalModel } = await import("../src/lib/keep/ollama.ts");
const { mcpBaseUrl, mcpCallTool, mcpHealth, mcpListTools, redact } = await import("../src/lib/keep/mcp.ts");
const { complete, routingStatus } = await import("../src/lib/keep/router.ts");

let n = 0;
const ok = (name: string) => console.log(`  ok ${++n} - ${name}`);

// --- Ollama -----------------------------------------------------------------
assert.equal(ollamaBaseUrl(), `http://127.0.0.1:${oport}`);
ok("bare OLLAMA_HOST gets an http:// scheme");

const listed = await listOllamaModels({ force: true });
assert.ok(listed.ok && listed.models.length === 2);
ok("lists installed models from /api/tags");

// The embed model must not win just because it sorts first.
assert.equal(pickModel(["nomic-embed-text:latest", "llama3.1:8b"]), "llama3.1:8b");
assert.equal(pickModel(["llama3.1:8b"], "llama3.1"), "llama3.1:8b", "bare name matches a tagged install");
assert.equal(pickModel([], "llama3.1"), null);
ok("model preference: chat tag over embed, bare name matches tag, empty is null");

const resolved = await resolveLocalModel();
assert.ok(resolved.ok && resolved.model === "llama3.1:8b");
ok("resolves a servable local model");

const chat = await ollamaChat({ system: "sys", user: "hi", json: true, maxTokens: 42 });
assert.ok(chat.ok && chat.text === "local answer", "trims whitespace");
assert.equal(lastChatBody.stream, false);
assert.equal(lastChatBody.format, "json", "json mode reaches Ollama");
assert.equal(lastChatBody.options.num_predict, 42);
assert.equal(lastChatBody.messages[0].role, "system");
ok("chat sends stream:false, format:json, num_predict and a system turn");

// --- MCP --------------------------------------------------------------------
assert.equal(mcpBaseUrl(), `http://127.0.0.1:${mport}/mcp`);
ok("MCP base URL gets the required /mcp suffix");

const tools = await mcpListTools();
assert.ok(tools.ok && tools.tools.length === 4, "parsed tools from SSE");
assert.ok(sawInitialized, "sent notifications/initialized after handshake");
ok("handshake + SSE tools/list works");

const call = await mcpCallTool("dashboard_status", {});
assert.ok(call.ok && (call.json as any).network === "TAILSCALE", "decoded JSON out of the text content block");
assert.deepEqual(lastToolCall, { name: "dashboard_status", arguments: {} });
ok("tools/call decodes structured JSON from a text content block");

const health = await mcpHealth();
assert.ok(health.reachable && health.toolCount === 4);
ok("mcpHealth reports reachable");

assert.equal(redact("Authorization: Bearer abc123.def-456"), "Authorization: Bearer [redacted]");
assert.equal(redact("?api_key=supersecret&x=1"), "?api_key=[redacted]&x=1");
ok("redact() strips bearer tokens and key query params");

// --- router -----------------------------------------------------------------
const c = await complete("sys", "user", 100);
assert.ok(c.ok && c.provider === "local" && c.model === "llama3.1:8b");
ok("complete() routes to local and reports which plane answered");

const status = await routingStatus();
assert.equal(status.route, "local-first");
assert.ok(status.local.reachable && status.local.selected === "llama3.1:8b");
assert.equal(status.cloud.allowed, false, "KEEP_ALLOW_CLOUD=0 disables cloud");
ok("routingStatus reports local up, cloud off");

// --- failure honesty --------------------------------------------------------
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";  // closed port
process.env.KEEP_MODEL_ROUTE = "local";
const dead = await complete("sys", "user", 10);
assert.ok(!dead.ok, "dead local plane fails");
assert.match(dead.error, /route=local/);
assert.match(dead.error, /unreachable/i, "classified as unreachable, not a generic error");
assert.match(dead.hint ?? "", /ollama serve/, "keeps the actionable hint");
ok("a dead local plane says unreachable and keeps the `ollama serve` hint");

const deadStatus = await routingStatus();
assert.equal(deadStatus.local.reachable, false);
assert.match(deadStatus.local.hint ?? "", /ollama serve/);
ok("routingStatus surfaces the same hint to the bench");

mcp.close();
await new Promise((r) => setTimeout(r, 50));
const deadMcp = await mcpHealth();
assert.equal(deadMcp.reachable, false);
assert.match(deadMcp.error ?? "", /unreachable|timed out/i);
assert.ok(deadMcp.hint, "a down MCP still explains itself");
ok("a down MCP reports unreachable with a hint");

ollama.close();
console.log(`\n${n} checks passed`);
