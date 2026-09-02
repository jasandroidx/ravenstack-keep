import { GoogleGenAI } from "@google/genai";
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

let genAiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAiClient) {
    genAiClient = new GoogleGenAI();
  }
  return genAiClient;
}

async function complete(system: string, user: string, maxTokens = 1800) {
  try {
    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: user,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature: 0.4,
      },
    });

    const text = response.text?.trim() ?? "";
    if (!text) {
      return { ok: false as const, error: "Empty model response from Gemini" };
    }
    return { ok: true as const, text };
  } catch (err: unknown) {
    console.error("[Gemini API Error]", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: `Gemini API error: ${message}` };
  }
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

export async function generatePortraitImage(input: {
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  photoBase64?: string;
  mimeType?: string;
}) {
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
- Secondary Domain (Physical Shop): Diagnostic help for automotive (e.g. Chevy Silverado circuits/sensors), small engines, diesel machinery, and electronics pinouts using live web search.

ENGINEERING RULES:
- Smallest Reversible Fix: Never suggest deleting volumes or rebuilding entire stacks if a 1-line command or config edit solves it.
- Single-Block Execution: Consolidate terminal fixes into a single copy-paste bash block using safe heredocs or chained commands.

OUTPUT FORMAT:
1. Root Cause Analysis: 1–2 sharp, candid sentences diagnosing the problem.
2. Executable Solution: Single copy-paste terminal command block or numbered physical steps.
3. Verification: How to verify the fix succeeded.
4. Source Links: Clickable markdown links if external documentation or schematics were referenced.`;

  try {
    const ai = getGenAI();
    const contents = input.contextLogs
      ? `DIAGNOSTIC INQUIRY: ${input.concern}\n\nRAW DOCKER/SYSTEM LOGS OR CONTEXT:\n\`\`\`\n${input.contextLogs}\n\`\`\``
      : input.concern;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents,
      config: {
        systemInstruction: system,
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    });

    const text = response.text?.trim() ?? "";
    if (!text) {
      return { ok: false as const, error: "Valerie returned an empty diagnostic response." };
    }

    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const sources: Array<{ title: string; url: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || new URL(chunk.web.uri).hostname,
            url: chunk.web.uri,
          });
        }
      }
    }

    return {
      ok: true as const,
      text,
      sources,
      groundingSearchQueries: (groundingMetadata?.webSearchQueries as string[]) ?? [],
    };
  } catch (err: unknown) {
    console.error("[Valerie Workbench Error]", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: `Mechanic diagnosis failed: ${message}` };
  }
}

