import { createServerFn } from "@tanstack/react-start";
import { readFile, stat } from "node:fs/promises";
import { complete } from "./router";

export const RE_TARGETS = [
  { id: "tiny-tool", label: "Tiny system tool — smoke test first", kind: "open-source" },
  { id: "keep", label: "Keep code (on ravenserve)", kind: "own" },
  { id: "discord-bot", label: "Discord bot code (on your laptop)", kind: "own" },
  { id: "ravenquery", label: "RavenQuery code (on your laptop)", kind: "own" },
] as const;

export type ReTarget = (typeof RE_TARGETS)[number]["id"];

export type ReResult =
  | { ok: true; provider: string; model: string; analysis: string; source: string }
  | { ok: false; needsLaptop: boolean; error: string };

export const REA_SETUP_STEPS = [
  "Node 22.19+ on the laptop.",
  "Dry run first: npx rea-agents setup --client claude_code --dry-run",
  "Then setup for real, restart Claude Code, and verify the registration.",
  "Smoke test on /usr/bin/true before any big target.",
  "Ghidra 12.1.x + Java 21 only if native binary depth is wanted (~767MB download, its own yes).",
];

/**
 * Valerie, REA handler. Honest by construction:
 * - REA is NOT installed on ravenserve. Native binary decompiles need the
 *   laptop REA install + Ghidra/Java, and this function stops there instead
 *   of faking a decompile.
 * - JS/TS code analysis runs here through the FreeLLMAPI leg
 *   (router.complete, freellmapi-first) — no extra install — but only for
 *   code that actually lives on ravenserve (Keep code, read from disk).
 * - Discord bot and RavenQuery code live on Jason's laptop, NOT on
 *   ravenserve, so no analysis is run and none is faked.
 * - The tiny tool is metadata-only, labelled as such.
 * No commercial target is ever accepted: the validator rejects anything
 * outside the four listed targets.
 */
export const runReverseEngineerAnalysis = createServerFn({ method: "POST" })
  .validator((target: string) => {
    if (!RE_TARGETS.some((t) => t.id === target)) throw new Error("Unknown target");
    return target as ReTarget;
  })
  .handler(async ({ data: target }): Promise<ReResult> => {
    if (target === "discord-bot" || target === "ravenquery") {
      return {
        ok: false,
        needsLaptop: true,
        error:
          "REA not installed here yet — run the laptop setup. " +
          (target === "discord-bot"
            ? "Discord bot code lives on your laptop, not on ravenserve. Analysis needs the laptop REA install — nothing was analysed here, and no analysis is shown."
            : "RavenQuery code lives on your laptop, not on ravenserve. Analysis needs the laptop REA install — nothing was analysed here, and no analysis is shown."),
      };
    }

    if (target === "tiny-tool") {
      const st = await stat("/usr/bin/true");
      const source = `tiny system tool /usr/bin/true — ${st.size} bytes, metadata only (no binary disassembly on ravenserve). Deeper native decompile needs the laptop REA install + Ghidra/Java — stopped here.`;
      const res = await complete(
        "You are a reverse-engineering assistant. Answer only from the metadata given, in plain words, no jargon dump. Say plainly what metadata alone cannot prove.",
        `Metadata: ${source} What can metadata alone honestly say about this tool, in 3 short sentences?`,
        400,
      );
      if (!res.ok) return { ok: false, needsLaptop: false, error: res.error };
      return { ok: true, provider: res.provider, model: res.model, analysis: res.text, source };
    }

    // Keep code: real excerpt, read from disk on ravenserve.
    const file = "/srv/ravenstack-keep/ui-v2/src/lib/keep/router.ts";
    const text = await readFile(file, "utf-8");
    const excerpt = text.split("\n").slice(0, 80).join("\n");
    const res = await complete(
      "You are a reverse-engineering assistant. Analyse ONLY the code excerpt given, in plain words, no jargon dump. Name the functions and entry points you actually saw in the excerpt. Do not invent functions, behaviour, or files beyond the excerpt.",
      `Code excerpt from ${file} (first 80 lines):\n\n${excerpt}\n\nWhat does this code actually do, with evidence from the excerpt?`,
      600,
    );
    if (!res.ok) return { ok: false, needsLaptop: false, error: res.error };
    return {
      ok: true,
      provider: res.provider,
      model: res.model,
      analysis: res.text,
      source: `${file} — first 80 lines, read from disk on ravenserve`,
    };
  });
