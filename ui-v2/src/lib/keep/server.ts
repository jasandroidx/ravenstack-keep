import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { askOracle, conveneTable, diagnoseMechanicWorkbench, forgeSpec, generatePortraitImage, generatePortraitLore, inspectConcern, talkHall } from "./ai";
import { ARCHITECTURE, KNOWLEDGE, ROOMS, SKILL_SURFACE, SPECS, getRoom, getSpecForRoom, roomCounts } from "./catalog";
import { fetchKeepPulse } from "./pulse";
import { executeFastMCPTool, type FastMCPToolCall } from "./fastmcp";
import { noGates, parseGates } from "./gates";
import { failing, parseStackHealth, unreadTower } from "./health";
import type { CommissionRequest, LoreRerollRequest, PortraitItem } from "@/lib/gallery/types";
import type { DraftSpec, TableResult } from "./types";

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

    // 2. Image generation pass via Google Imagen 3
    let imageUrl = "";
    if (data.uploadedPhotoDataUrl) {
      const match = data.uploadedPhotoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      const mime = match?.[1] || "image/png";
      const base64 = match?.[2] || data.uploadedPhotoDataUrl;
      const imgRes = await generatePortraitImage({
        subjectName: data.subjectName.trim(),
        arcaneTitle: data.arcaneTitle.trim(),
        customModifier: data.customModifier?.trim(),
        photoBase64: base64,
        mimeType: mime,
      });
      if (!imgRes.ok) {
        return { ok: false as const, error: imgRes.error || "Google Imagen 3 API failed to generate image." };
      }
      imageUrl = imgRes.imageUrl;
    } else {
      const imgRes = await generatePortraitImage({
        subjectName: data.subjectName.trim(),
        arcaneTitle: data.arcaneTitle.trim(),
        customModifier: data.customModifier?.trim(),
      });
      if (!imgRes.ok) {
        return { ok: false as const, error: imgRes.error || "Google Imagen 3 API failed to generate image." };
      }
      imageUrl = imgRes.imageUrl;
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

    return { ok: true as const, portrait: item };
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
    const result = await executeFastMCPTool(data.tool, data.params ?? {});
    return result;
  });


