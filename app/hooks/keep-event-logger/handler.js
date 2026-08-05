/**
 * DRAFT OpenClaw internal hook — append-only Keep events.jsonl
 * Not installed. Observability must never throw into the gateway path.
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_EVENTS =
  process.env.KEEP_EVENTS_PATH ||
  "/root/ravenstack-keep-app/app/data/events.jsonl";

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function append(lineObj) {
  try {
    const dir = path.dirname(DEFAULT_EVENTS);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(DEFAULT_EVENTS, JSON.stringify(lineObj) + "\n", "utf8");
  } catch (e) {
    // swallow — never break the gateway
    console.error("[keep-event-logger] append failed", e && e.message);
  }
}

const handler = async (event) => {
  try {
    const agentId =
      (event.context && (event.context.agentId || event.context.agent_id)) ||
      "raziel";
    append({
      ts: event.timestamp || utcNow(),
      source: "hook",
      agent_id: agentId,
      type: `${event.type || "unknown"}:${event.action || "event"}`,
      payload: {
        sessionKey: event.sessionKey || null,
        // do not dump full context (may contain secrets)
      },
    });
  } catch (e) {
    console.error("[keep-event-logger] handler error", e && e.message);
  }
};

module.exports = handler;
module.exports.default = handler;
