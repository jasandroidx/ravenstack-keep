import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  askOracle,
  conveneTable,
  diagnoseMechanicWorkbench,
  forgeSpec,
  generatePortraitImage,
  generatePortraitLore,
  inspectConcern,
  mechanicModelName,
  talkHall,
  talkModelName,
} from "./ai";
import { ARCHITECTURE, KNOWLEDGE, ROOMS, SKILL_SURFACE, SPECS, getRoom, getSpecForRoom, roomCounts } from "./catalog";
import { fetchKeepPulse } from "./pulse";
import { executeFastMCPTool, assertToolAllowlist, stripConfirm, type FastMCPToolCall, type GatewayLogLine } from "./fastmcp";
import { evaluateKeepGate, parseAllowedLogins, type KeepGateMode } from "@/lib/auth/tailscale-gate";
import { readLatestRavenDrop } from "./drops";
import { noGates, parseGates } from "./gates";
import { failing, parseStackHealth, unreadTower } from "./health";
import { fetchDutyBoard } from "./duty";
import type { CommissionRequest, LoreRerollRequest, PortraitItem } from "@/lib/gallery/types";
import type { DraftSpec, TableResult } from "./types";
import { boxToolsAvailable } from "./box-adapter";
import { mcpHealth } from "./mcp";
import { routingStatus } from "./router";
import { executeProbe, listProbes } from "./probes";

export const getKeepSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const pulse = await fetchKeepPulse();
  return {
    rooms: ROOMS,
    counts: roomCounts(),
    pulse,
    planes: ARCHITECTURE,
  };
});

export const getRoomPayload = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const room = getRoom(slug);
    if (!room) return { ok: false as const, error: "Room not found" };
    return { ok: true as const, room, spec: getSpecForRoom(slug), specs: SPECS };
  });

export const getStackPayload = createServerFn({ method: "GET" }).handler(async () => {
  return { architecture: ARCHITECTURE, skills: SKILL_SURFACE, knowledge: KNOWLEDGE };
});

export const runForge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((idea: string) => idea.trim())
  .handler(async ({ context, data: idea }) => {
    if (!idea || idea.length < 8) return { ok: false as const, error: "Give Clawforge a real idea — one sentence minimum." };
    const result = await forgeSpec(idea);
    if (!result.ok) return result;
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into forge_drafts (user_id, idea, interrogation, spec_json, status)
      values (${context.userId}, ${idea}, ${result.spec.interrogation}, ${JSON.stringify(result.spec)}, ${"draft"})
      returning id
    `;
    return { ok: true as const, id: rows[0]?.id ?? 0, spec: result.spec };
  });

export const listForgeDrafts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      idea: string;
      interrogation: string | null;
      spec_json: string;
      status: string;
      created_at: string;
    }>`
      select id, idea, interrogation, spec_json, status, created_at
      from forge_drafts
      where user_id = ${context.userId}
      order by id desc
      limit 20
    `;
  });

export const setForgeStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: "draft" | "approved" | "rejected" }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update forge_drafts
      set status = ${data.status}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const runTable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((question: string) => question.trim())
  .handler(async ({ context, data: question }) => {
    if (!question || question.length < 12) {
      return { ok: false as const, error: "The table needs a hard question, not a shrug." };
    }
    const result = await conveneTable(question);
    if (!result.ok) return result;
    const sql = await getSql();
    await sql`
      insert into table_sessions (user_id, question, result_json)
      values (${context.userId}, ${question}, ${JSON.stringify(result.table)})
    `;
    return { ok: true as const, table: result.table };
  });

export const listTableSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: number; question: string; result_json: string; created_at: string }>`
      select id, question, result_json, created_at
      from table_sessions
      where user_id = ${context.userId}
      order by id desc
      limit 12
    `;
  });

export const runOracle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((question: string) => question.trim())
  .handler(async ({ context, data: question }) => {
    if (!question) return { ok: false as const, error: "Ask the vault something specific." };
    const result = await askOracle(question);
    if (!result.ok) return result;
    const sql = await getSql();
    await sql`
      insert into oracle_queries (user_id, question, answer)
      values (${context.userId}, ${question}, ${result.answer})
    `;

    // Nothing in the vault matched. If the Oracle answered anyway instead of
    // standing down, that is a claim made against no evidence — the cell's
    // first automatic feed. "not-in-knowledge" is the correct answer and is
    // not a fabrication.
    if (!result.retrieved) {
      const saidNothing = /not[- ]in[- ]knowledge/i.test(result.answer);
      if (!saidNothing) {
        await sql`
          insert into quarantine_claims
            (user_id, claim, model, room, prompt, evidence, detected_by)
          values (
            ${context.userId}, ${result.answer}, 'oracle', 'library',
            ${question}, '', 'no_evidence'
          )
        `;
      }
    }
    return result;
  });

export const listOracleQueries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: number; question: string; answer: string; created_at: string }>`
      select id, question, answer, created_at
      from oracle_queries
      where user_id = ${context.userId}
      order by id desc
      limit 12
    `;
  });

export const runInspection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: "sentinel" | "mechanic"; concern: string }) => ({
    kind: input.kind,
    concern: input.concern.trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.concern) return { ok: false as const, error: "Name the concern." };
    const result = await inspectConcern(data.kind, data.concern);
    if (!result.ok) return result;
    const sql = await getSql();
    await sql`
      insert into inspections (user_id, kind, concern, result)
      values (${context.userId}, ${data.kind}, ${data.concern}, ${result.text})
    `;
    return result;
  });

export const runMechanicDiagnosis = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { concern: string; contextLogs?: string }) => ({
    concern: input.concern.trim(),
    contextLogs: input.contextLogs?.trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.concern && !data.contextLogs) {
      return { ok: false as const, error: "Name the diagnostic concern or paste raw logs." };
    }
    const result = await diagnoseMechanicWorkbench(data);
    if (!result.ok) return result;
    const sql = await getSql();
    try {
      await sql`
        insert into inspections (user_id, kind, concern, result)
        values (${context.userId}, ${"mechanic"}, ${data.concern || "Terminal raw log diagnosis"}, ${result.text})
      `;
    } catch (dbErr) {
      console.warn("DB insert error on mechanic diagnosis:", dbErr);
    }
    return result;
  });

export const listInspections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      kind: string;
      concern: string;
      result: string;
      created_at: string;
    }>`
      select id, kind, concern, result, created_at
      from inspections
      where user_id = ${context.userId}
      order by id desc
      limit 12
    `;
  });

export const talkInHall = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { agent: string; message: string }) => ({
    agent: input.agent.trim().toLowerCase(),
    message: input.message.trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.message) return { ok: false as const, error: "Say something." };
    const allowed = new Set(["raziel", "oracle", "valerie", "corvid"]);
    if (!allowed.has(data.agent)) return { ok: false as const, error: "Unknown seat." };
    const result = await talkHall(data.agent, data.message);
    if (!result.ok) return result;
    return { ok: true as const, reply: result.text };
  });

/**
 * Honest routing snapshot for Valerie's bench. Read-only, never returns a key.
 * This is the screen to open first when "nothing works".
 */
export const getRoutingStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const [models, mcp] = await Promise.all([routingStatus(), mcpHealth()]);
    const binds = mcp.reachable ? await boxToolsAvailable() : null;
    return {
      models,
      mcp,
      binds: binds?.ok ? { present: binds.present, missing: binds.missing } : null,
      bindsError: binds && !binds.ok ? binds.error : null,
    };
  });

export type SavedDraft = {
  id: number;
  idea: string;
  interrogation: string | null;
  spec: DraftSpec;
  status: string;
  created_at: string;
};

export function parseDraftRow(row: {
  id: number;
  idea: string;
  interrogation: string | null;
  spec_json: string;
  status: string;
  created_at: string;
}): SavedDraft {
  return {
    id: row.id,
    idea: row.idea,
    interrogation: row.interrogation,
    spec: JSON.parse(row.spec_json) as DraftSpec,
    status: row.status,
    created_at: row.created_at,
  };
}

export function parseTableRow(row: { id: number; question: string; result_json: string; created_at: string }) {
  return {
    id: row.id,
    question: row.question,
    table: JSON.parse(row.result_json) as TableResult,
    created_at: row.created_at,
  };
}

/**
 * War table read. Fails closed: a dead bridge yields zero gates and an error
 * string, never an example gate.
 */
export const getPendingGates = createServerFn({ method: "POST" }).handler(async () => {
  const res = await executeFastMCPTool("pending_gates", {});
  if (!res.ok || res.data == null) {
    return noGates(res.error ?? "FastMCP bridge unreachable. No gates were retrieved.");
  }
  // The bridge returns MCP content envelopes; unwrap a JSON string payload.
  let payload: unknown = res.data;
  const envelope = payload as { result?: unknown; content?: Array<{ text?: string }> };
  if (typeof envelope?.result === "string") {
    try {
      payload = JSON.parse(envelope.result);
    } catch {
      return noGates("pending_gates returned a result this build could not parse.");
    }
  } else if (Array.isArray(envelope?.content) && typeof envelope.content[0]?.text === "string") {
    try {
      payload = JSON.parse(envelope.content[0].text as string);
    } catch {
      return noGates("pending_gates returned content this build could not parse.");
    }
  }
  return parseGates(payload);
});

/**
 * Seal or refuse a gate. `confirm: true` is supplied by the caller and only
 * ever originates from a deliberate two-step action at the war table — never
 * from a render, an effect, or a retry.
 */
export const decideGate = createServerFn({ method: "POST" })
  .validator((input: { tool: FastMCPToolCall["tool"]; args: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const allowed: FastMCPToolCall["tool"][] = [
      "county_queue_approve",
      "county_queue_reject",
      "session_approve_capability",
    ];
    if (!allowed.includes(data.tool)) {
      return { ok: false as const, error: `${data.tool} is not a gate decision tool.` };
    }
    if (data.args?.confirm !== true) {
      return { ok: false as const, error: "Refused: gate decisions require confirm: true." };
    }
    const res = await executeFastMCPTool(data.tool, data.args);
    return res.ok
      ? { ok: true as const, source: res.source, latencyMs: res.latencyMs }
      : { ok: false as const, error: res.error ?? "Gate decision failed." };
  });

/** The Quarantine Cell — claims a model asserted that its evidence did not support. */
export const listQuarantine = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      claim: string;
      model: string;
      room: string;
      prompt: string | null;
      evidence: string;
      detected_by: string;
      consistency_score: number | null;
      note: string | null;
      status: string;
      created_at: string;
    }>`
      select id, claim, model, room, prompt, evidence, detected_by,
             consistency_score, note, status, created_at
      from quarantine_claims
      where user_id = ${context.userId}
      order by id desc
      limit 100
    `;
  });

/**
 * Commit a fabrication to the cell.
 *
 * `evidence` is stored verbatim, including when it is empty — an answer given
 * against nothing is the strongest finding there is, and blanking it would
 * lose that.
 */
export const logQuarantine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      claim: string;
      model?: string;
      room?: string;
      prompt?: string;
      evidence?: string;
      detectedBy?: "operator" | "no_evidence" | "hhem";
      consistencyScore?: number | null;
      note?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const claim = data.claim?.trim();
    if (!claim) return { ok: false as const, error: "A quarantine record needs the claim itself." };
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into quarantine_claims
        (user_id, claim, model, room, prompt, evidence, detected_by, consistency_score, note)
      values (
        ${context.userId}, ${claim}, ${data.model ?? "unknown"}, ${data.room ?? "unknown"},
        ${data.prompt ?? null}, ${data.evidence ?? ""}, ${data.detectedBy ?? "operator"},
        ${data.consistencyScore ?? null}, ${data.note ?? null}
      )
      returning id
    `;
    return { ok: true as const, id: rows[0]?.id };
  });

/**
 * Mark a record dismissed. It is never deleted — the cell is a record of what
 * your models did, and a pile you can empty is not a record.
 */
export const dismissQuarantine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql`
      update quarantine_claims
      set status = 'dismissed', note = coalesce(${data.note ?? null}, note)
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

/**
 * Watchtower read. A bridge that does not answer leaves the beacon dark, not
 * green — an unread tower is not a healthy one.
 */
export const getStackHealth = createServerFn({ method: "POST" }).handler(async () => {
  const res = await executeFastMCPTool("stack_health", {});
  if (!res.ok || res.data == null) {
    return unreadTower(res.error ?? "FastMCP bridge unreachable. The tower was not read.");
  }
  const env = res.data as { result?: unknown; content?: Array<{ text?: string }> };
  const text =
    typeof env?.result === "string"
      ? env.result
      : typeof env?.content?.[0]?.text === "string"
        ? (env.content[0].text as string)
        : typeof res.data === "string"
          ? (res.data as string)
          : "";
  if (!text) return unreadTower("stack_health returned a payload this build could not read.");
  return parseStackHealth(text);
});

export const commissionPortrait = createServerFn({ method: "POST" })
  .validator((input: CommissionRequest) => input)
  .handler(async ({ data }) => {
    if (!data.subjectName?.trim() || !data.arcaneTitle?.trim()) {
      return { ok: false as const, error: "Subject Name and Arcane Title are required." };
    }

    // 1. Lore generation pass via Keep Chronicler
    const loreRes = await generatePortraitLore({
      subjectName: data.subjectName.trim(),
      arcaneTitle: data.arcaneTitle.trim(),
      customModifier: data.customModifier?.trim(),
      trivia: data.trivia?.trim(),
    });
    const lore = loreRes.lore;

    // 2. Image generation pass. No local model in this stack does pixel
    // generation, so without a cloud key this always reports {ok:false} --
    // that is expected now, not a failure worth losing the lore over. The
    // chronicle already wrote successfully above; commission it with an
    // empty image rather than discard real, free, local work because one
    // optional cloud step had nothing to call.
    let imageUrl = "";
    let imageNote: string | undefined;
    const imgRes = data.uploadedPhotoDataUrl
      ? await (() => {
          const match = data.uploadedPhotoDataUrl!.match(/^data:([^;]+);base64,(.+)$/);
          const mime = match?.[1] || "image/png";
          const base64 = match?.[2] || data.uploadedPhotoDataUrl!;
          return generatePortraitImage({
            subjectName: data.subjectName.trim(),
            arcaneTitle: data.arcaneTitle.trim(),
            customModifier: data.customModifier?.trim(),
            photoBase64: base64,
            mimeType: mime,
          });
        })()
      : await generatePortraitImage({
          subjectName: data.subjectName.trim(),
          arcaneTitle: data.arcaneTitle.trim(),
          customModifier: data.customModifier?.trim(),
        });
    if (imgRes.ok) {
      imageUrl = imgRes.imageUrl;
    } else {
      imageNote = imgRes.error;
    }

    const item: PortraitItem = {
      id: `portrait-${Date.now()}-${data.slotNumber}`,
      slotNumber: data.slotNumber,
      subjectName: data.subjectName.trim(),
      arcaneTitle: data.arcaneTitle.trim(),
      customModifier: data.customModifier?.trim(),
      trivia: data.trivia?.trim(),
      imageUrl: imageUrl,
      thumbnailUrl: imageUrl,
      lore: lore,
      createdAt: new Date().toISOString(),
    };

    // Save to SQL database if available
    try {
      const sql = await getSql();
      await sql`
        insert into gallery_portraits (user_id, slot_number, subject_name, arcane_title, custom_modifier, trivia, image_url, lore)
        values ('dev-user', ${item.slotNumber}, ${item.subjectName}, ${item.arcaneTitle}, ${item.customModifier ?? null}, ${item.trivia ?? null}, ${item.imageUrl || 'procedural'}, ${item.lore})
      `;
    } catch {
      // Non-fatal if offline/local
    }

    return { ok: true as const, portrait: item, imageNote };
  });

export const rerollPortraitLoreServer = createServerFn({ method: "POST" })
  .validator((input: LoreRerollRequest) => input)
  .handler(async ({ data }) => {
    const loreRes = await generatePortraitLore({
      subjectName: data.subjectName.trim(),
      arcaneTitle: data.arcaneTitle.trim(),
      customModifier: data.customModifier?.trim(),
      trivia: data.trivia?.trim(),
    });
    return { ok: true as const, lore: loreRes.lore };
  });

/**
 * One read for everything the hall's greetings key off. Each field is
 * independently nullable: a subsystem that could not be read stays null and
 * the NPCs fall back to their written lines rather than narrating a night
 * they cannot see.
 */
export const getHallState = createServerFn({ method: "POST" }).handler(async () => {
  const [gates, health] = await Promise.all([getPendingGates(), getStackHealth()]);

  let quarantineOpen: number | null = null;
  let quarantineClaim: string | null = null;
  try {
    const sql = await getSql();
    const rows = await sql<{ claim: string }>`
      select claim from quarantine_claims where status = 'open' order by id desc limit 50
    `;
    quarantineOpen = rows.length;
    quarantineClaim = rows[0]?.claim ?? null;
  } catch {
    /* Not signed in, or the table is unreadable. Stays null. */
  }

  return {
    gatesPending: gates.ok ? gates.gates.length : null,
    quarantineOpen,
    quarantineClaim,
    stackVerdict: health.ok ? health.verdict : null,
    failingServices: health.ok ? failing(health).map((f) => f.name) : [],
  };
});

export const callFastMCP = createServerFn({ method: "POST" })
  .validator((input: { tool: FastMCPToolCall["tool"]; params?: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    // s1-lock-doors: the browser may only reach the READ-ONLY tools on
    // KEEP_READONLY_TOOLS. Everything else — write tools, county audits, Oracle
    // verification, human gates — is refused here, before it can start work on
    // the box. Human gate decisions travel only through the dedicated
    // `decideGate` server function, never through this proxy.
    const verdict = assertToolAllowlist(data.tool);
    if (!verdict.allowed) {
      return {
        ok: false,
        source: "unreachable" as const,
        endpoint: "",
        data: null,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
        blocked: true,
        error: `Refused (403) by the Keep allowlist: tool "${data.tool}" is not on the read-only proxied set.`,
      };
    }
    const result = await executeFastMCPTool(verdict.tool, stripConfirm(data.params ?? {}));
    return result;
  });

/**
 * Normalize one raw gateway-log line into the GatewayLogLine view model.
 * Conservative on purpose: the docker engine's output format is not guaranteed
 * to carry a timestamp, so every field is best-effort and `raw` always survives.
 * Pure; unit-tested.
 */
export function parseGatewayLogLine(raw: string, index: number): GatewayLogLine {
  const trimmed = raw.trim();
  const tsMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
  const levelMatch = trimmed.match(/\b(CRITICAL|ERROR|WARN|INFO)\b/);
  const message = trimmed.replace(/^.*?\]\s*/, "").trim() || trimmed;
  return {
    id: `gw-${index}`,
    timestamp: tsMatch?.[1] ?? "",
    service: "gateway",
    level: (levelMatch?.[1] as GatewayLogLine["level"]) ?? (trimmed.length ? "INFO" : "INFO"),
    message: message.slice(0, 2000),
    raw: trimmed,
  };
}

/**
 * Live OpenClaw gateway log tail for the Mechanic's streamer. Reads the
 * gateway container's own log (execFile, fixed args — never a shell string),
 * fail-closed: an unreadable docker/container reports an error, never a fake
 * line. Normalized to `{ ok, lines[], error? }` — the panel renders exactly
 * this shape, nothing else.
 */
export const getGatewayLogs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<{ ok: true; lines: GatewayLogLine[] } | { ok: false; error: string }> => {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const run = promisify(execFile);
      const { stdout } = await run("docker", ["logs", "--tail", "40", "openclaw-gateway"], {
        timeout: 10_000,
        maxBuffer: 1_000_000,
      });
      const rawLines = stdout.split(/\r?\n/).filter(Boolean);
      return { ok: true, lines: rawLines.map((raw, index) => parseGatewayLogLine(raw, index)) };
    } catch (err) {
      return {
        ok: false,
        error: `Gateway logs unavailable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

/** The gate identity behind THIS request — what the badge paints. Reuses the exact gate predicate. */
export const getKeepIdentity = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ mode: KeepGateMode; login: string | null }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest() ?? new Request("http://localhost", { method: "GET", headers: {} });
    const verdict = evaluateKeepGate(request.headers, {
      internalToken: process.env.KEEP_INTERNAL_TOKEN?.trim() ?? "",
      allowedLogins: parseAllowedLogins(process.env.KEEP_ALLOWED_LOGINS),
      authDisabled: String(process.env.VITE_AUTH_ENABLED) === "false",
      skipTailscaleCheck: Boolean(process.env.VERCEL),
    });
    return { mode: verdict.mode, login: verdict.login };
  });

/**
 * Shift board read (workplace lights + duty roster). Fail-closed: a dead Keep
 * HTTP API yields an error string, never an invented roster.
 */
export const getDutyBoard = createServerFn({ method: "GET" }).handler(
  async (): Promise<import("./duty").DutyBoardRead> => fetchDutyBoard(),
);

export const getLatestRavenDropInfo = createServerFn({ method: "GET" }).handler(async () => {
  const drop = readLatestRavenDrop();
  return {
    exists: drop.exists,
    filename: drop.filename,
    mtime: drop.mtime,
    header: drop.header,
  };
});

/** Static, non-secret config the bench displays -- never a claim about live state. */
export const getMechanicConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { mechanicModel: mechanicModelName(), talkModel: talkModelName() };
});

/** Which probes actually exist on the box right now -- the probe rack's own allowlist. */
export const listProbeNames = createServerFn({ method: "GET" }).handler(async () => {
  return { names: listProbes() };
});

/**
 * Run one read-only probe. `name` is validated against the probes directory
 * itself inside executeProbe -- this never forwards the raw request string
 * past that check, and execFile (never a shell string) is the only way the
 * probe binary is invoked.
 */
export const runProbe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string }) => ({ name: input.name.trim() }))
  .handler(async ({ data }) => executeProbe(data.name));