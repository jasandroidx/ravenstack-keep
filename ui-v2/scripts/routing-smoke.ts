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

const { autoSelectable, listOllamaModels, ollamaBaseUrl, ollamaChat, pickModel, resolveLocalModel } = await import("../src/lib/keep/ollama.ts");
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

// The Hetzner box's real inventory as of 2026-09-21. qwen3-coder:30b sorts
// first from /api/tags, and gpt-oss:20b-cloud is paid routing — neither may win
// automatic selection.
const BOX = ["qwen3-coder:30b", "qwen3-4b-64k:latest", "qwen3:4b", "gpt-oss:20b-cloud", "gemma4:latest", "phi4-mini:latest", "qwen3:1.7b"];
assert.equal(pickModel(BOX), "qwen3:4b", "picks the fast general chat tag, not the 30b coder");
assert.notEqual(pickModel(BOX), "gpt-oss:20b-cloud");
ok("box inventory resolves to qwen3:4b, never the 30b coder");

assert.equal(autoSelectable("gpt-oss:20b-cloud"), false, "cloud-routed tag is paid");
assert.equal(autoSelectable("nomic-embed-text:latest"), false);
assert.equal(autoSelectable("bge-m3:latest"), false);
assert.equal(autoSelectable("qwen3:4b"), true);
assert.equal(autoSelectable("gemma4:latest"), true);
ok("cloud and embedding tags are excluded from automatic selection");

// Operator being explicit still wins — that is the local-first rule, not a ban.
assert.equal(pickModel(BOX, "gpt-oss:20b-cloud"), "gpt-oss:20b-cloud");
assert.equal(pickModel(BOX, "qwen3-coder"), "qwen3-coder:30b", "bare name pins the 30b");
ok("KEEP_LOCAL_MODEL can still pin a cloud or coder tag explicitly");

// An embed-only box must say so instead of trying to chat with an embedder.
assert.equal(pickModel(["nomic-embed-text:latest", "gpt-oss:20b-cloud"]), null);
ok("a box with only cloud/embed tags yields no automatic pick");

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

// --- pulse parser against the box's real dashboard_status ------------------
// Captured live 2026-09-21. Services arrive as objects, the queue key is
// county_queue, and agents_active is null — all three broke the first parser.
const REAL_DASHBOARD = {
  generated_at: "2026-09-21T17:35:01Z",
  network: "CONNECTED",
  network_detail: "compose+health",
  agents_active: null,
  rooms: [],
  occupancy: "unknown",
  services: {
    reclaw_api: { status: "ok", env: "prod", version: "2.0.0", compose: "up", health_code: "200" },
    openclaw: { ok: true, status: "live", compose: "up", health_code: "200" },
    mcp: { status: "unprobed", service: "reclaw-platform", transport: "streamable-http", port: 8100, note: "not probed" },
    dashboard: { status: "ok", compose: "unknown", health_code: "200" },
    ollama_models: 3,
  },
  county_queue: { status: "idle", cursor: 6, total: 92, pending_county: null, pending_flags: null, top_finding: null },
  mcp_public_url_present: true,
  bridge: "active",
  tunnel: "inactive",
};

const dash = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(REAL_DASHBOARD));
});
const dport = await listen(dash);

delete process.env.MCP_BASE_URL;
delete process.env.KEEP_MCP_URL;
process.env.KEEP_PULSE_URL = `http://127.0.0.1:${dport}/status.json`;

const { fetchKeepPulse } = await import("../src/lib/keep/pulse.ts");
const pulse = await fetchKeepPulse();

assert.equal(pulse.source, "live");
assert.equal(pulse.network, "CONNECTED");
ok("pulse reads the live dashboard payload");

assert.equal(pulse.services.reclaw, "ok", "reclaw_api object collapses to its status");
assert.equal(pulse.services.openclaw, "live");
for (const v of Object.values(pulse.services)) {
  assert.notEqual(v, "[object Object]", "no service renders as [object Object]");
}
ok("object-shaped services collapse to labels, never [object Object]");

assert.equal(pulse.services.mcp, "active", "unprobed mcp falls back to the bridge unit state");
ok("an unprobed MCP status falls back to the bridge unit");

assert.equal(pulse.queue.status, "idle", "county_queue is read as the queue");
assert.equal(pulse.queue.cursor, 6);
ok("county_queue maps onto the queue chip");

assert.equal(pulse.agentsActive, 0, "null agents_active does not become NaN");
assert.equal(pulse.ollamaModels, 3);
ok("null agents_active is 0, and the local model count carries through");

assert.match(pulse.note ?? "", /no room occupancy/, "empty rooms is stated, not faked as idle");
ok("a live payload with no rooms says so instead of inventing idle chips");

dash.close();
ollama.close();
console.log(`\n${n} checks passed`);
