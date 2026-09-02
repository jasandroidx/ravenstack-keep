/**
 * War table — pending human gates.
 *
 * Shape mirrors the live `pending_gates` tool on the Ravenstack bridge:
 *
 *   { as_of, county_queue: { status, cursor, pending_review },
 *     recent_session_approvals: [{ session_id, pending, grants }],
 *     rule }
 *
 * Two rules this module exists to enforce:
 *
 * 1. A gate card is only ever built from data the bridge actually returned.
 *    There is no fixture, no example gate, no "here's what one looks like".
 *    An empty table means nothing is pending, and a dead bridge means we say so.
 *
 * 2. Every card carries the concrete effect of approving it — the tool that
 *    will run and the arguments it will run with — so the operator approves a
 *    consequence rather than an intention.
 */

export type GateRisk = "low" | "medium" | "high";

/** The exact call an approval will make. Rendered on the card before you seal it. */
export type GateEffect = {
  tool: string;
  args: Record<string, string | number | boolean>;
  /** Plain-language statement of what changes. One sentence, no hedging. */
  consequence: string;
  /** What this does NOT do — bounds the blast radius for the operator. */
  bounds?: string;
};

export type Gate = {
  id: string;
  kind: "county_review" | "session_capability";
  title: string;
  detail: string;
  risk: GateRisk;
  approve: GateEffect;
  reject?: GateEffect;
};

export type GatesSnapshot = {
  ok: boolean;
  asOf: string;
  gates: Gate[];
  /** The box's own standing rule, echoed rather than paraphrased. */
  rule: string;
  countyQueue: { status: string; cursor: number; pendingReview: string | null } | null;
  error?: string;
};

type RawGates = {
  as_of?: string;
  rule?: string;
  county_queue?: { status?: string; cursor?: number; pending_review?: string | null };
  recent_session_approvals?: Array<{ session_id?: string; pending?: number; grants?: number }>;
};

/** Bridge is down or unconfigured. No gates, and we never pretend otherwise. */
export function noGates(error: string): GatesSnapshot {
  return {
    ok: false,
    asOf: new Date().toISOString(),
    gates: [],
    rule: "",
    countyQueue: null,
    error,
  };
}

export function parseGates(raw: unknown): GatesSnapshot {
  if (!raw || typeof raw !== "object") {
    return noGates("pending_gates returned a payload this build does not recognise.");
  }
  const o = raw as RawGates;
  const gates: Gate[] = [];

  const cq = o.county_queue;
  // Only a queue actually holding something for review becomes a card.
  if (cq && cq.pending_review) {
    gates.push({
      id: `county-${cq.pending_review}`,
      kind: "county_review",
      title: `County queue — review ${cq.pending_review}`,
      detail: `Queue status ${cq.status ?? "unknown"} at cursor ${cq.cursor ?? 0}.`,
      risk: "high",
      approve: {
        tool: "county_queue_approve",
        args: { session_id: cq.pending_review, confirm: true },
        consequence: `Publishes the reviewed package for ${cq.pending_review} and advances the queue past cursor ${cq.cursor ?? 0}.`,
        bounds: "Does not unfreeze the queue or run the next county. That stays a separate, deliberate act.",
      },
      reject: {
        tool: "county_queue_reject",
        args: { session_id: cq.pending_review, confirm: true },
        consequence: `Sends ${cq.pending_review} back and leaves the cursor where it is.`,
      },
    });
  }

  for (const s of o.recent_session_approvals ?? []) {
    const id = s.session_id;
    if (!id || !s.pending) continue;
    gates.push({
      id: `session-${id}`,
      kind: "session_capability",
      title: `Capability request — ${id}`,
      detail: `${s.pending} pending request${s.pending === 1 ? "" : "s"}, ${s.grants ?? 0} capabilit${s.grants === 1 ? "y" : "ies"} already granted to this session.`,
      risk: (s.grants ?? 0) >= 3 ? "high" : "medium",
      approve: {
        tool: "session_approve_capability",
        args: { session_id: id, confirm: true },
        consequence: `Grants the requested capability to ${id}, taking it from ${s.grants ?? 0} to ${(s.grants ?? 0) + 1} standing grants.`,
        bounds: "Scoped to this session only. It does not widen any agent's permanent Spec.",
      },
    });
  }

  return {
    ok: true,
    asOf: String(o.as_of ?? new Date().toISOString()),
    gates,
    rule: String(o.rule ?? ""),
    countyQueue: cq
      ? {
          status: String(cq.status ?? "unknown"),
          cursor: Number(cq.cursor ?? 0),
          pendingReview: cq.pending_review ?? null,
        }
      : null,
  };
}

/**
 * Cumulative risk, per the OpenHands pattern: a session that already holds
 * several grants is a bigger ask than the same request made cold.
 */
export function riskLabel(risk: GateRisk): string {
  return risk === "high" ? "HIGH" : risk === "medium" ? "MEDIUM" : "LOW";
}
