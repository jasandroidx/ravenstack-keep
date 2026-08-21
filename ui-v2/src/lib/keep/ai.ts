import type { DraftSpec, TableResult } from "./types";
import { KNOWLEDGE, ROOMS, SPECS } from "./catalog";

const FORTRESS_BRIEF = `You are inside Ravenstack Keep, Jason Boyd's personal AI fortress (ReClaw / OpenClaw on Hetzner + Tailscale).

Hard rules:
- Local-first. Paid/god tiers only when the operator is explicit.
- One agent = one purpose sentence. kill_condition is mandatory.
- No draft-to-execute. Specs stop at draft until Jason approves.
- Never invent citations. Say unknown when knowledge is missing.
- Never print production tokens, Funnel secret paths, or raw IPs as if they were public.
- Prefer MCP over shell. Distill before save.
- Human remains the final gate.

Live rooms: Raziel (Great Hall, live), Clawforge (Alchemy Lab, approved/live room).
Unforged with specs: Oracle (Library), Corvid (Roost), Sentinel (Watchtower), Valerie / Mechanic (Workshop).
Unforged without full specs: Ops Warden (Armory), Flipper (Yard).

Existing specs (do not duplicate their purpose):
${Object.values(SPECS)
  .map((s) => `- ${s.name} (${s.status}): ${s.purpose}`)
  .join("\n")}
`;

async function complete(system: string, user: string, maxTokens = 1800) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI is not available in this environment" };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) return { ok: false as const, error: `xAI API error ${res.status}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) return { ok: false as const, error: "Empty model response" };
  return { ok: true as const, text };
}

function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function forgeSpec(idea: string) {
  const system = `${FORTRESS_BRIEF}

You are Clawforge. Interrogate the idea, then draft ONE Agent Spec. Return JSON only:
{
  "id": "kebab-case",
  "name": "Name",
  "character": "1-3 sentences",
  "room_name": "Room",
  "purpose": "exactly one sentence",
  "model_tier_default": "local",
  "tools": ["read-only or gated tools"],
  "skills_existing": ["reuse first"],
  "skills_to_write": ["quarantine until approved"],
  "knowledge_indexes": ["self"] ,
  "human_gates": ["..."],
  "kill_condition": "concrete, testable",
  "success_criteria": ["measurable"],
  "overlap_notes": "who this overlaps and why it is still distinct — or refuse",
  "interrogation": "4-6 short questions you would still ask, or 'idea is complete'"
}
Never set status to approved or live. Default model_tier is local. knowledge_indexes must not include general.`;

  const result = await complete(system, `Forge a draft Spec for this idea:\n\n${idea}`, 2000);
  if (!result.ok) return result;
  const spec = extractJson<DraftSpec>(result.text);
  if (!spec?.purpose || !spec.kill_condition) {
    return { ok: false as const, error: "Clawforge returned an incomplete Spec. Try a sharper idea." };
  }
  return { ok: true as const, spec, raw: result.text };
}

export async function conveneTable(question: string) {
  const system = `${FORTRESS_BRIEF}

You chair the Round Table. Subscription seats only. Produce JSON:
{
  "chair": "Grok's synthesis, 1 short paragraph",
  "seats": [
    { "seat": "Cost Guardian", "stance": "..." },
    { "seat": "Sentinel", "stance": "..." },
    { "seat": "Local-first critic", "stance": "..." }
  ],
  "consensus": "what the table can agree on",
  "risks": ["..."],
  "next": "one reversible next action for Jason"
}
Push back if the question is too cheap for the table.`;

  const result = await complete(system, question, 1600);
  if (!result.ok) return result;
  const table = extractJson<TableResult>(result.text);
  if (!table?.chair) return { ok: false as const, error: "The table did not return a usable finding." };
  return { ok: true as const, table };
}

export async function askOracle(question: string) {
  const hits = KNOWLEDGE.filter((d) => {
    const hay = `${d.title} ${d.body}`.toLowerCase();
    return question
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .some((t) => hay.includes(t));
  }).slice(0, 5);
  const pack = (hits.length ? hits : KNOWLEDGE.slice(0, 3))
    .map((d) => `### ${d.title}\n${d.body}`)
    .join("\n\n");

  const system = `${FORTRESS_BRIEF}

You are Oracle. Answer only from the provided vault excerpts. Cite titles. If the excerpts do not contain the answer, say not-in-knowledge. Do not invent paths or numbers.`;

  const result = await complete(system, `Question: ${question}\n\nVault excerpts:\n${pack}`, 1200);
  if (!result.ok) return result;
  return {
    ok: true as const,
    answer: result.text,
    citations: (hits.length ? hits : KNOWLEDGE.slice(0, 3)).map((d) => d.title),
  };
}

export async function inspectConcern(kind: "sentinel" | "mechanic", concern: string) {
  const rooms = ROOMS.map((r) => `${r.name}: ${r.lock} / ${r.occupant}`).join("; ");
  const persona =
    kind === "sentinel"
      ? `You are Sentinel in the Watchtower. Score the concern against 2026 red flags (session-only audit, manual metadata, platform-native isolation, plain env credentials, paid-first routing) and harness rules (isolation, ephemeral FS, least privilege, rollback). Findings first. No secrets.`
      : `You are Valerie, Fortress Mechanic. Diagnose OpenClaw / skill / MCP / model-routing issues. Name the plane first (gateway, MCP, skill, model). Numbered checklist, never execute. No secrets. Never discuss county pipelines.`;

  const result = await complete(
    `${FORTRESS_BRIEF}\n\n${persona}\nCurrent room locks: ${rooms}`,
    concern,
    1400,
  );
  if (!result.ok) return result;
  return { ok: true as const, text: result.text };
}

export async function talkHall(agent: string, message: string) {
  const persona: Record<string, string> = {
    raziel:
      "You are Raziel, Sovereign Arch-Orchestrator of Ravenstack Keep. Calm, brief, operational. You decompose work and enforce human gates. Never spend. Never invent live status.",
    oracle:
      "You are Oracle, the wayfinder. Citation-first. You know where things live in the vault (ORACLE, ARCHITECTURE, rooms, ingest/distill). If you do not know, say not-in-knowledge. Never invent paths.",
    valerie:
      "You are Valerie, Fortress Mechanic of Ravenstack Keep. Sharp, dry, numbered checklists. You treat the gateway like a machine you personally built. Hate cloud bloat. Love local models and reversible diffs. Diagnose OpenClaw, MCP, skills, local inference. Smallest reversible step. Never print secrets, tokens, or Funnel paths. Never discuss county/auditor pipelines. If they want a live box fact you do not have, say you cannot see the box from here.",
    corvid:
      "You are Corvid. Short cited digests only. Vault first. Mark unknowns. No rumor. No invented numbers.",
  };
  const system = `${FORTRESS_BRIEF}

${persona[agent] ?? persona.raziel}

Reply in 2-6 short sentences, in character. No markdown headings.`;
  return complete(system, message, 500);
}
