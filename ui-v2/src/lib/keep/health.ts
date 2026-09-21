/**
 * Watchtower beacon — stack health.
 *
 * The bridge's `stack_health` returns a markdown report, not JSON:
 *
 *   ## docker
 *   NAME               STATUS
 *   openclaw-gateway   Up 4 hours (healthy)
 *
 *   reclaw_api: ok
 *   ollama: fail
 *   mcp_bridge_unit: inactive
 *
 *   DEGRADED
 *
 * Watching is Sentinel's job; fixing is Valerie's. This module only reads —
 * it names what is failing and hands the symptom across. It never diagnoses,
 * and when the bridge is unreachable the beacon goes dark rather than green:
 * an unread tower is not a healthy one.
 */

export type ServiceState = "ok" | "fail" | "inactive" | "unknown";
export type Verdict = "ok" | "degraded" | "critical" | "unknown";

export type ServiceRow = { name: string; state: ServiceState; detail?: string };

export type StackHealth = {
  ok: boolean;
  verdict: Verdict;
  services: ServiceRow[];
  containers: { name: string; status: string }[];
  raw: string;
  error?: string;
};

export function unreadTower(error: string): StackHealth {
  return { ok: false, verdict: "unknown", services: [], containers: [], raw: "", error };
}

const STATE_WORDS: Record<string, ServiceState> = {
  ok: "ok",
  up: "ok",
  healthy: "ok",
  active: "ok",
  fail: "fail",
  failed: "fail",
  down: "fail",
  error: "fail",
  inactive: "inactive",
  stopped: "inactive",
};

export function parseStackHealth(raw: string): StackHealth {
  const text = String(raw ?? "");
  if (!text.trim()) return unreadTower("stack_health returned an empty report.");

  const services: ServiceRow[] = [];
  const containers: { name: string; status: string }[] = [];
  let inDocker = false;

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;

    if (/^##\s*docker/i.test(t)) {
      inDocker = true;
      continue;
    }
    if (/^##/.test(t)) {
      inDocker = false;
      continue;
    }
    if (/^NAME\s+STATUS/i.test(t)) continue;

    // `service: state` rows carry the verdict per subsystem.
    const kv = t.match(/^([a-z0-9_.-]+):\s*(.+)$/i);
    if (kv) {
      inDocker = false;
      const name = kv[1];
      const rest = kv[2].trim();
      const first = rest.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
      const state = STATE_WORDS[first] ?? "unknown";
      // Detail only when it says more than the state word already does.
      const bare = rest.toLowerCase() === first;
      const detail = bare ? undefined : rest.length > 60 ? `${rest.slice(0, 60)}…` : rest;
      services.push({ name, state, detail });
      continue;
    }

    if (inDocker) {
      const m = t.match(/^(\S+)\s{2,}(.+)$/);
      if (m) containers.push({ name: m[1], status: m[2].trim() });
      continue;
    }
  }

  // Trailing verdict line. Trust the box's own word over our arithmetic.
  let verdict: Verdict = "unknown";
  if (/\bCRITICAL\b/.test(text)) verdict = "critical";
  else if (/\bDEGRADED\b/.test(text)) verdict = "degraded";
  else if (/\b(HEALTHY|ALL OK|\bOK\b)\s*$/m.test(text.trim())) verdict = "ok";
  else if (services.length) {
    // No verdict line — derive one, and never round up.
    verdict = services.some((s) => s.state === "fail")
      ? "degraded"
      : services.every((s) => s.state === "ok")
        ? "ok"
        : "degraded";
  }

  return { ok: true, verdict, services, containers, raw: text };
}

/** Beacon colour. Unknown is dark amber — an unread tower is not a green one. */
export function beaconColour(v: Verdict): number {
  return v === "ok" ? 0x39ff14 : v === "degraded" ? 0xffc857 : v === "critical" ? 0xff2a6d : 0x6b7280;
}

/** Services Valerie should be pointed at, worst first. */
export function failing(h: StackHealth): ServiceRow[] {
  return h.services.filter((s) => s.state === "fail" || s.state === "inactive")
    .sort((a, b) => (a.state === "fail" ? -1 : 1) - (b.state === "fail" ? -1 : 1));
}

/**
 * The handoff. Sentinel saw it; Valerie fixes it. This builds the symptom she
 * receives — observed facts only, no diagnosis, because guessing the cause is
 * her job and pre-empting it would bias the bench.
 */
export function symptomFor(h: StackHealth): string {
  const bad = failing(h);
  if (!bad.length) return "";
  const lines = bad.map((s) => `- ${s.name}: ${s.state}${s.detail ? ` (${s.detail})` : ""}`);
  const containers = h.containers.length
    ? `\n\nContainers reported:\n${h.containers.map((c) => `- ${c.name}: ${c.status}`).join("\n")}`
    : "";
  return `Watchtower reports the stack ${h.verdict.toUpperCase()}. Failing subsystems:\n${lines.join("\n")}${containers}\n\nDiagnose these. Observed state only — no cause has been determined.`;
}
