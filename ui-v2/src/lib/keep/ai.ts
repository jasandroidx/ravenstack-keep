import { GoogleGenAI } from "@google/genai";
import type { DraftSpec, TableResult } from "./types";
import { KNOWLEDGE, ROOMS, SPECS } from "./catalog";
import { executeFastMCPTool } from "./fastmcp";
import { webSearch, browserRender, type SearchResult } from "./corvid-tools";
import { readLatestRavenDrop } from "./drops";

const FORTRESS_BRIEF = `You are inside Ravenstack Keep, Jason Boyd's personal AI fortress (ReClaw / OpenClaw on Hetzner + Tailscale).

Hard rules:
- Local-first. Paid/god tiers only when the operator is explicit.
- One agent = one purpose sentence. kill_condition is mandatory.
- No draft-to-execute. Specs stop at draft until Jason approves.
- Never invent citations. Say unknown when knowledge is missing.
- Never print production tokens, Funnel secret paths, or raw IPs as if they were public.
- Prefer MCP over shell. Distill before save.
- Human remains the final gate.

Room status (generated from the Ledger, never write this by hand):
${ROOMS.map((r) => `- ${r.name} (${r.occupant}): ${r.lock}`).join("\n")}

Existing specs (do not duplicate their purpose):
${Object.values(SPECS)
  .map((s) => `- ${s.name} (${s.status}): ${s.purpose}`)
  .join("\n")}
`;

let genAiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    genAiClient = new GoogleGenAI({
      apiKey: apiKey || undefined,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAiClient;
}

/** Talk plane default -- Oracle, Forge, the Round Table, hall dialogue, portrait lore. */
export function talkModelName(): string {
  return process.env.KEEP_TALK_MODEL?.trim() || "qwen3:1.7b";
}

/** Mechanic plane default -- Valerie's workbench only. A coder model earns its keep there: it reads logs and writes shell. */
export function mechanicModelName(): string {
  return process.env.KEEP_MECHANIC_MODEL?.trim() || "qwen3-coder:30b";
}

/** Local-first per the Keep's own cost model: Ollama on the box before any paid call. */
async function completeOllama(system: string, user: string, maxTokens: number, model: string) {
  const base = (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // CPU-bound local inference: normal case is 10-30s, generous headroom
      // for a cold model load or a second request queued behind one already running.
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model,
        think: false,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        options: { num_predict: maxTokens },
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Ollama HTTP ${res.status}` };
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "Empty model response from Ollama" };
    return { ok: true as const, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: `Ollama unreachable: ${message}` };
  }
}

/**
 * Local Ollama only. The operator removed the Gemini key deliberately --
 * every text-completion surface in the Keep (Oracle, Forge, the Round Table,
 * Sentinel, Mechanic's inline form, hall dialogue, portrait lore) runs on the
 * box's own models or not at all. getGenAI() and the Gemini/Nano Banana SDK
 * calls below still exist ONLY inside generatePortraitImage, which has no
 * local substitute for actual pixel generation -- see that function's own
 * comment. No other function in this file may call getGenAI() again.
 *
 * Every caller runs on the talk plane (KEEP_TALK_MODEL) except Valerie's
 * workbench, which passes its own model explicitly -- see diagnoseMechanicWorkbench.
 */
async function complete(system: string, user: string, maxTokens = 1800, model = talkModelName()) {
  return completeOllama(system, user, maxTokens, model);
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
  "knowledge_indexes": ["self"],
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
  "chair": "Keeper synthesis, 1 short paragraph",
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

  // Retrieval missed. Do NOT substitute arbitrary documents and cite them —
  // that hands the operator receipts for sources the question never matched.
  // Answer against nothing, cite nothing, and report that plainly so the
  // caller can quarantine anything the model asserts anyway.
  const retrieved = hits.length > 0;
  const pack = retrieved ? hits.map((d) => `### ${d.title}\n${d.body}`).join("\n\n") : "";

  const system = `${FORTRESS_BRIEF}

You are Oracle. Answer only from the provided vault excerpts. Cite titles. If the excerpts do not contain the answer, say not-in-knowledge. Do not invent paths or numbers.${
    retrieved
      ? ""
      : "\n\nNo vault excerpt matched this question. You have no evidence. Reply with not-in-knowledge and nothing else — do not answer from general knowledge."
  }`;

  const result = await complete(
    system,
    `Question: ${question}\n\nVault excerpts:\n${retrieved ? pack : "(none matched)"}`,
    1200,
  );
  if (!result.ok) return result;
  return {
    ok: true as const,
    answer: result.text,
    citations: hits.map((d) => d.title),
    retrieved,
    evidence: pack,
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

// Ollama tool-calling model for Corvid. His speced localHint (phi4-mini) is
// tagged "tools"-capable by Ollama but ignored the tools array outright in
// testing (answered from stale training data instead of calling web_search
// even when explicitly told to). qwen3:4b reliably emits real tool_calls —
// verified live against this box's Ollama before wiring this in.
const CORVID_MODEL = "qwen3:4b";

type OllamaToolCall = { id?: string; function: { name: string; arguments: Record<string, unknown> } };
type OllamaChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
};

const CORVID_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web (DuckDuckGo + Wikipedia). Use for anything current, or outside the vault.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_render",
      description:
        "Render one live page and return its visible text. Use only when web_search snippets aren't enough — a ToS page, a JS-heavy doc site, a specific URL you already have. Read-only.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The exact URL to render." } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_knowledge",
      description: "Search the Ravenstack vault / internal knowledge base. Always try this before the open web for fortress-internal questions.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What to look up in the vault." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "oracle_verify",
      description: "Cross-check a specific factual claim against the vault's truth rules before including it in a digest.",
      parameters: {
        type: "object",
        properties: { claim: { type: "string", description: "The exact claim to verify." } },
        required: ["claim"],
      },
    },
  },
] as const;

async function runCorvidTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; sources: Array<{ title: string; url: string }> }> {
  switch (name) {
    case "web_search": {
      const query = String(args.query ?? "");
      const res = await webSearch(query);
      if (!res.ok) return { text: `web_search failed: ${res.error}`, sources: [] };
      const sources = res.results.map((r: SearchResult) => ({ title: r.title, url: r.url }));
      const text = res.results
        .map((r: SearchResult) => `- [${r.source}] ${r.title} — ${r.snippet} (${r.url})`)
        .join("\n");
      return { text, sources };
    }
    case "browser_render": {
      const url = String(args.url ?? "");
      const res = await browserRender(url);
      if (!res.ok) return { text: `browser_render failed: ${res.error}`, sources: [] };
      return { text: res.text, sources: [{ title: url, url }] };
    }
    case "query_knowledge": {
      const query = String(args.query ?? "");
      const res = await executeFastMCPTool("query_knowledge", { query });
      if (!res.ok) return { text: `query_knowledge failed: ${res.error}`, sources: [] };
      return { text: JSON.stringify(res.data).slice(0, 4000), sources: [] };
    }
    case "oracle_verify": {
      const claim = String(args.claim ?? "");
      const res = await executeFastMCPTool("oracle_verify", { claim });
      if (!res.ok) return { text: `oracle_verify failed: ${res.error}`, sources: [] };
      return { text: JSON.stringify(res.data).slice(0, 2000), sources: [] };
    }
    default:
      return { text: `Unknown tool: ${name}`, sources: [] };
  }
}

/**
 * Corvid's research loop — the one agent in the Keep with real external tools.
 * Local-first (qwen3:4b on this box's Ollama) with no cloud escalation: a
 * research digest is not latency-sensitive, so there is no fallback tier here
 * the way `complete()` has for the other personas.
 */
async function talkCorvid(message: string) {
  const system = `${FORTRESS_BRIEF}

You are Corvid, raven scout of Ravenstack Keep. Precise, source-obsessed, allergic to rumor. Return only what can be cited. Short digests, no invented numbers. Try query_knowledge before the open web for anything fortress-internal. Use web_search for current or external facts. Use browser_render only when a specific page needs real rendering. When you give a final answer, write 2-6 short sentences in character, then a "Sources:" line listing the URLs you actually used — or say "Sources: none (no external lookup needed)" if you answered from the vault/your own reasoning alone.`;

  const messages: OllamaChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: message },
  ];
  const allSources: Array<{ title: string; url: string }> = [];
  const base = (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");

  for (let turn = 0; turn < 4; turn++) {
    let res: Response;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Generous on purpose: cold-loading qwen3:4b plus the full
        // FORTRESS_BRIEF/persona/tool-schema prompt on CPU-only inference
        // measured over 120s for a single turn in testing. A research digest
        // is not latency-sensitive (see the comment on talkCorvid above).
        signal: AbortSignal.timeout(240000),
        body: JSON.stringify({
          model: CORVID_MODEL,
          think: false,
          stream: false,
          messages,
          tools: CORVID_TOOLS,
        }),
      });
    } catch (err) {
      return { ok: false as const, error: `Ollama unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!res.ok) return { ok: false as const, error: `Ollama HTTP ${res.status}` };
    const data = (await res.json()) as { message?: OllamaChatMessage };
    const msg = data.message;
    if (!msg) return { ok: false as const, error: "Empty response from Ollama." };

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const text = msg.content.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
      if (!text) return { ok: false as const, error: "Corvid returned an empty digest." };
      return { ok: true as const, text, sources: allSources };
    }

    messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      const result = await runCorvidTool(call.function.name, call.function.arguments ?? {});
      allSources.push(...result.sources);
      messages.push({
        role: "tool",
        content: result.text,
        ...(call.id ? { tool_call_id: call.id } : {}),
      });
    }
  }
  return { ok: false as const, error: "Corvid's research loop hit its turn limit without a final answer." };
}

export async function talkHall(agent: string, message: string) {
  if (agent === "corvid") {
    const res = await talkCorvid(message);
    if (!res.ok) return res;
    const sourceLines = res.sources.length
      ? res.sources
          .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
          .map((s) => s.url)
          .join(", ")
      : "none (no external lookup needed)";
    return { ok: true as const, text: `${res.text}\n\nSources: ${sourceLines}` };
  }

  const persona: Record<string, string> = {
    raziel:
      "You are Raziel, Sovereign Arch-Orchestrator of Ravenstack Keep. Calm, brief, operational. You decompose work and enforce human gates. Never spend. Never invent live status.",
    oracle:
      "You are Oracle, the wayfinder. Citation-first. You know where things live in the vault (ORACLE, ARCHITECTURE, rooms, ingest/distill). If you do not know, say not-in-knowledge. Never invent paths.",
    valerie:
      "You are Valerie, Fortress Mechanic of Ravenstack Keep. Sharp, dry, numbered checklists. You treat the gateway like a machine you personally built. Hate cloud bloat. Love local models and reversible diffs. Diagnose OpenClaw, MCP, skills, local inference. Smallest reversible step. Never print secrets, tokens, or Funnel paths. Never discuss county/auditor pipelines. If they want a live box fact you do not have, say you cannot see the box from here.",
  };

  // s1-lock-doors: Raziel states the ACTUAL gateway model he observed, never a
  // guess. Looked up live from openclaw_models with a 3s timeout race — enough
  // for a panel-bound reply, never a stall; unknown beats invented.
  let modelLine = "";
  if (agent === "raziel") {
    const observed = await observedGatewayModelId();
    modelLine =
      observed === null
        ? "\n\nObserved OpenClaw primary model: unknown (gateway model lookup unavailable). Say you cannot see the gateway model from here rather than invent one."
        : `\n\nObserved OpenClaw primary model right now: ${observed}. Name it only because you observed it via the gateway.`;
  }

  const system = `${FORTRESS_BRIEF}

${persona[agent] ?? persona.raziel}
${modelLine}
Reply in 2-6 short sentences, in character. No markdown headings.`;
  return complete(system, message, 500);
}

const GATEWAY_MODEL_LOOKUP_TIMEOUT_MS = 3000;

/** Conservative extraction: stay quiet unless a tool result gives a clear model id. */
function extractModelIdFromResult(data: unknown): string | null {
  const seen = new Set<string>();
  const walk = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        return trimmed;
      }
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["primary", "primaryModel", "model", "id", "name"]) {
        const hit = walk(record[key]);
        if (hit) return hit;
      }
      for (const key of Object.keys(record)) {
        if (["primary", "primaryModel", "model", "id", "name"].includes(key)) continue;
        const hit = walk(record[key]);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(data);
}

/** Resolve the gateway's primary model id, or null when it cannot be observed in time. */
async function observedGatewayModelId(): Promise<string | null> {
  try {
    const result = await Promise.race([
      executeFastMCPTool<unknown>("openclaw_models", {}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`openclaw_models lookup timed out after ${GATEWAY_MODEL_LOOKUP_TIMEOUT_MS}ms`)), GATEWAY_MODEL_LOOKUP_TIMEOUT_MS),
      ),
    ]);
    if (!result.ok || result.data == null) return null;
    return extractModelIdFromResult(result.data);
  } catch {
    return null;
  }
}

export async function generatePortraitLore(input: {
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
}) {
  const system = `${FORTRESS_BRIEF}

You are the venerable Keep Chronicler of Ravenstack Keep. Your duty is to record the immortal deeds, idiosyncrasies, and heroic or bizarre legends of those whose portraits are hung in The Grand Gallery.

Aesthetic & Tone Guidelines:
- Epic, deadpan, dignified dark cyber-arcane historical chronicle style.
- 2 to 3 sentences maximum.
- Written in archaic yet high-tech chronicle tone (referencing the obsidian ledgers, Pike County archives, vector matrices, torchlit bastions, runic covenants, or cybernetic relays).
- If the user provides real-world facts/trivia/jokes, translate them seamlessly into legendary cyber-arcane lore (e.g. eating 150 hotdogs becomes 'The Great Feast of Devouring during the Second Mesh Solstice').
- If trivia is blank, craft an authentic procedural chronicle honoring their name, arcane title, and theme.
- Return ONLY the chronicle paragraph. No quotes, no markdown headings, no intro meta-commentary.`;

  const userPrompt = input.trivia?.trim()
    ? `Subject: ${input.subjectName}
Arcane Title: ${input.arcaneTitle}
Theme / Modifier: ${input.customModifier || "None specified"}
Real-World Trivia / Chronicle Notes:
${input.trivia}`
    : `Subject: ${input.subjectName}
Arcane Title: ${input.arcaneTitle}
Theme / Modifier: ${input.customModifier || "Gothic Cyber-Arcane Sovereign"}`;

  const res = await complete(system, userPrompt, 400);
  if (!res.ok) {
    // Graceful procedural fallback
    return {
      ok: true as const,
      lore: `Inscribed in the Obsidian Ledger of Ravenstack: ${input.subjectName}, known across the bastions as ${input.arcaneTitle}, stood steadfast amidst the digital tempests. By their command, the runic gateways held fast and the sovereign embers of the Keep were preserved for generations yet uncompiled.`,
    };
  }
  return { ok: true as const, lore: res.text };
}

/**
 * The one function in this file still allowed to touch Gemini -- pixel-art
 * portrait generation has no local model in this stack (Ollama does not do
 * image synthesis here). Fails fast and honestly with no key configured
 * rather than let generatePortraitLore's caller wait through several
 * doomed network round trips to Nano Banana / Imagen first.
 */
export async function generatePortraitImage(input: {
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  photoBase64?: string;
  mimeType?: string;
}) {
  const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY);
  if (!hasKey) {
    return {
      ok: false as const,
      error:
        "No cloud key configured, and portrait image generation has no local Ollama equivalent in this stack. The chronicle lore still writes locally -- only the pixel-art image is unavailable.",
    };
  }

  const pixelThemePrompt = `Masterpiece 16-bit and 32-bit dark cyber-arcane pixel art portrait of ${input.subjectName}, ${input.arcaneTitle}. ${input.customModifier ? `Character theme and custom modifiers: ${input.customModifier}.` : "High sovereign noble of the obsidian Keep."} Dark gothic obsidian stone masonry background, rich hand-crafted pixel dithering, dramatic chiaroscuro torchlight, glowing cyan (#2de2e6) and magenta (#ff2a6d) neon rim-lighting. Authentic retro pixel art style, no flat vectors, no vector shapes.`;

  const ai = getGenAI();
  const errors: string[] = [];

  // 1. Photo-to-Pixel Transformation via Native Nano Banana (Multimodal Image Editing)
  if (input.photoBase64) {
    const cleanBase64 = input.photoBase64.replace(/^data:[^;]+;base64,/, "");
    const mimeType = input.mimeType || "image/jpeg";

    const transformPrompt = `Transform the subject in this provided photo into a masterpiece 16-bit and 32-bit dark cyber-arcane retro pixel art portrait of ${input.subjectName}, ${input.arcaneTitle}.
${input.customModifier ? `Incorporate custom modifier: ${input.customModifier}.` : "Regal sovereign noble of Ravenstack Keep."}

CRITICAL RULES:
- Strictly preserve the subject's recognizable facial geometry, eyes, nose, hairstyle, facial hair, and distinctive facial features from the uploaded photo.
- Render in authentic 16-bit / 32-bit retro pixel art with detailed dithering, dark gothic obsidian stone background, dramatic chiaroscuro torchlight, and glowing cyan (#2de2e6) and magenta (#ff2a6d) neon energy channels.
- Authentic pixel art texture, no flat cartoon vectors.`;

    const parts = [
      {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      },
      { text: transformPrompt },
    ];

    // Try Nano Banana (gemini-3.1-flash-lite-image) first, then gemini-3.1-flash-image
    for (const modelName of ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"]) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: "1:1",
            },
          },
        });

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const outMime = part.inlineData.mimeType || "image/png";
            return {
              ok: true as const,
              imageUrl: `data:${outMime};base64,${part.inlineData.data}`,
              modelUsed: `Nano Banana (${modelName})`,
            };
          }
        }
      } catch (nanoErr: unknown) {
        const msg = nanoErr instanceof Error ? nanoErr.message : String(nanoErr);
        console.warn(`[Nano Banana ${modelName} Photo Transform Attempt Failed]`, msg);
        errors.push(`${modelName} (photo-transform): ${msg}`);
      }
    }
  }

  // 2. Text-to-Pixel Synthesis via Nano Banana
  for (const modelName of ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"]) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [{ text: pixelThemePrompt }] },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const outMime = part.inlineData.mimeType || "image/png";
          return {
            ok: true as const,
            imageUrl: `data:${outMime};base64,${part.inlineData.data}`,
            modelUsed: `Nano Banana (${modelName})`,
          };
        }
      }
    } catch (nanoErr: unknown) {
      const msg = nanoErr instanceof Error ? nanoErr.message : String(nanoErr);
      console.warn(`[Nano Banana ${modelName} Text-to-Pixel Attempt Failed]`, msg);
      errors.push(`${modelName} (text-pixel): ${msg}`);
    }
  }

  // 3. Fallback: Google Generative Language Imagen 3 Predict Endpoint
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || "";
  if (apiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "aistudio-build",
        },
        body: JSON.stringify({
          instances: [{ prompt: pixelThemePrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "1:1",
            outputMimeType: "image/png",
          },
        }),
      });

      const data = (await res.json()) as {
        predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string; image?: { imageBytes?: string } }>;
        error?: { message?: string; code?: number; status?: string };
      };

      if (data.error) {
        errors.push(`Imagen 3 (${data.error.code || res.status}): ${data.error.message}`);
      } else if (data.predictions && data.predictions.length > 0) {
        const first = data.predictions[0];
        const base64Bytes = first.bytesBase64Encoded || first.image?.imageBytes;
        if (base64Bytes) {
          const mime = first.mimeType || "image/png";
          return {
            ok: true as const,
            imageUrl: `data:${mime};base64,${base64Bytes}`,
            modelUsed: "Google Imagen 3 (imagen-3.0-generate-002)",
          };
        }
      }
    } catch (restErr: unknown) {
      const msg = restErr instanceof Error ? restErr.message : String(restErr);
      console.warn("[Imagen 3 REST fallback exception]", msg);
      errors.push(`Imagen 3 REST: ${msg}`);
    }
  }

  const detailedError = errors.length > 0
    ? errors.join(" | ")
    : "Image generation model returned no pixel data.";

  return {
    ok: false as const,
    error: `Model Generation Failure: ${detailedError}`,
  };
}

export async function diagnoseMechanicWorkbench(input: {
  concern: string;
  contextLogs?: string;
}) {
  const system = `You are Valerie, the Chief Mechanic of Ravenstack Keep. You are a gritty, no-nonsense, highly skilled shop mechanic and master Linux systems administrator. You speak with direct, pragmatic, dry shop humor—no corporate fluff, no academic jargon.

STACK KNOWLEDGE BASE:
- Host: Hetzner Dedicated VPS (Ubuntu 24.04, Stack Root: /root/ReClaw-2.0).
- OpenClaw Gateway: Docker container 'openclaw:2026.7.1' binding to ws://127.0.0.1:18789.
- FastMCP Bridge: Port :8100 proxied over Tailscale Funnel (hostname supplied at runtime; never guess or state it).
- ReClaw API: Port :8000. ReClaw Dashboard: Port :8081. Local Ollama: Port :11434 (gemma4).
- File Ownership Rule: Configs modified as root MUST be restored to uid 1000 (chown -R 1000:1000).

DIAGNOSTIC PROTOCOL (LAYERED TROUBLESHOOTING):
- Layer 0-2 (Networking & Ports): Control UI (:18789) reachability, loopback bindings, and Tailscale serve/funnel proxy status.
- Layer 3 (Config & State): Environment variables, volume mounts, and file permissions.
- Layer 4 (Logs & Memory): Docker container logs, OOM/memory pressure, and hanging sub-prompts.
- Layer 5 (FastMCP & Multi-Agent): Tool socket drops, agent routing timeouts, and SQLite locks.
- Secondary Domain (Physical Shop): Diagnostic help for automotive (e.g. Chevy Silverado circuits/sensors), small engines, diesel machinery, and electronics pinouts, from what you already know -- you have no live web search anymore, so say so rather than guess a part number or a spec you are not sure of.

ENGINEERING RULES:
- Smallest Reversible Fix: Never suggest deleting volumes or rebuilding entire stacks if a 1-line command or config edit solves it.
- Single-Block Execution: Consolidate terminal fixes into a single copy-paste bash block using safe heredocs or chained commands.

OUTPUT FORMAT:
1. Root Cause Analysis: 1-2 sharp, candid sentences diagnosing the problem.
2. Executable Solution: Single copy-paste terminal command block or numbered physical steps.
3. Verification: How to verify the fix succeeded.
Do not invent source links or citations -- you have no search tool. If you are not certain of a spec or a doc, say so instead of fabricating a reference.`;

  const drop = readLatestRavenDrop();
  let contents = input.contextLogs
    ? `DIAGNOSTIC INQUIRY: ${input.concern}\n\nRAW DOCKER/SYSTEM LOGS OR CONTEXT:\n\`\`\`\n${input.contextLogs}\n\`\`\``
    : input.concern;

  if (drop.exists && drop.content) {
    contents += `\n\nLATEST RAVEN DROP (${drop.filename}):\nHeader: ${drop.header}\n\`\`\`\n${drop.content}\n\`\`\``;
  }

  // Local only -- no more googleSearch grounding tool, which was Gemini-only
  // and had no local equivalent. sources/groundingSearchQueries stay in the
  // return shape (always empty) so mechanic-workbench.tsx's optional
  // rendering of that section degrades silently instead of needing a change.
  const result = await complete(system, contents, 1800, mechanicModelName());
  if (!result.ok) {
    return { ok: false as const, error: `Mechanic diagnosis failed: ${result.error}` };
  }
  return {
    ok: true as const,
    text: result.text,
    sources: [] as Array<{ title: string; url: string }>,
    groundingSearchQueries: [] as string[],
  };
}

