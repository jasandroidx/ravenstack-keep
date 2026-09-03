import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { askOracle, conveneTable, diagnoseMechanicWorkbench, forgeSpec, generatePortraitImage, generatePortraitLore, inspectConcern, talkHall } from "./ai";
import { ARCHITECTURE, KNOWLEDGE, ROOMS, SKILL_SURFACE, SPECS, getRoom, getSpecForRoom, roomCounts } from "./catalog";
import { fetchKeepPulse } from "./pulse";
import { executeFastMCPTool, type FastMCPToolCall } from "./fastmcp";
import type { DraftSpec, TableResult } from "./types";
import type { CommissionRequest, LoreRerollRequest, PortraitItem } from "@/lib/gallery/types";

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

export const callFastMCP = createServerFn({ method: "POST" })
  .validator((input: { tool: FastMCPToolCall["tool"]; params?: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const result = await executeFastMCPTool(data.tool, data.params ?? {});
    return result as any;
  });



export const fetchKeepGates = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch("http://127.0.0.1:8120/api/gates", { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false as const, error: "HTTP " + res.status };
    const json = await res.json();
    return { ok: true as const, data: json as any };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "failed" };
  }
});

export const approveKeepGate = createServerFn({ method: "POST" })
  .validator((input: { agentId?: string, roomId?: string }) => input)
  .handler(async ({ data }) => {
    try {
       let url = "http://127.0.0.1:8120/api/approve-spec";
       let body = { agent_id: data.agentId, confirm: true };
       if (data.roomId) {
         url = "http://127.0.0.1:8120/api/unlock-room";
         body = { room_id: data.roomId, confirm: true } as any;
       }
       const res = await fetch(url, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(body)
       });
       if (!res.ok) return { ok: false as const, error: "HTTP " + res.status };
       const json = await res.json();
       return { ok: true as const, data: json };
    } catch (err) {
       return { ok: false as const, error: err instanceof Error ? err.message : "failed" };
    }
  });
