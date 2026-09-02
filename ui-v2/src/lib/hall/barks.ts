/**
 * Reactive greetings.
 *
 * Modelled on the Hades dialogue system: a pool of lines filtered by
 * conditions and sorted into three tiers — evergreen filler, conditional
 * lines keyed to what actually happened, and essential lines that override
 * everything when something is wrong right now. Every unused line in the
 * winning tier is spent before any line repeats.
 *
 * The rule that matters: a bark never states anything the Keep has not
 * observed. Every conditional line below is a template over real fields —
 * gate counts, quarantine records, the box's own health verdict. If the state
 * could not be read, the NPC falls back to its written greeting rather than
 * guessing at how the night went.
 *
 * Voice, one rule each, so four characters do not talk the same way:
 *   Raziel  — imperative. States, never explains.
 *   Oracle  — cites or declines. Never asserts bare.
 *   Valerie — mechanical nouns, dry, unimpressed.
 *   Corvid  — terse. Reports counts.
 *   Cell    — flat and factual. The flatness is the menace.
 */

export type HallState = {
  /** Gates waiting on a seal at the war table. Null when unread. */
  gatesPending: number | null;
  /** Open records in the quarantine cell. Null when unread. */
  quarantineOpen: number | null;
  /** Newest open quarantine claim, trimmed. */
  quarantineClaim: string | null;
  /** The box's own verdict word. Null when the tower was not read. */
  stackVerdict: "ok" | "degraded" | "critical" | "unknown" | null;
  /** Subsystems the box reported failing or inactive. */
  failingServices: string[];
  /** Local hour, 0-23. */
  hour: number;
};

export type Bark = {
  id: string;
  npc: string;
  /** 3 overrides 2 overrides 1. Highest tier with any match wins. */
  tier: 1 | 2 | 3;
  requires: (s: HallState) => boolean;
  line: (s: HallState) => string;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const BARKS: Bark[] = [
  // ---------------------------------------------------------------- Raziel
  {
    id: "raziel-gates",
    npc: "raziel",
    tier: 3,
    requires: (s) => (s.gatesPending ?? 0) > 0,
    line: (s) =>
      `${s.gatesPending} ${plural(s.gatesPending!, "gate waits", "gates wait")} on your seal. The table is that way. Nothing moves until you sign.`,
  },
  {
    id: "raziel-stack-bad",
    npc: "raziel",
    tier: 3,
    requires: (s) => s.stackVerdict === "critical",
    line: () => "The stack is critical. Take the workshop before you take anything else.",
  },
  {
    id: "raziel-night",
    npc: "raziel",
    tier: 2,
    requires: (s) => s.hour >= 23 || s.hour < 5,
    line: () => "Late. The hall keeps its own hours and so do you, apparently.",
  },
  {
    id: "raziel-clear",
    npc: "raziel",
    tier: 2,
    requires: (s) => s.gatesPending === 0 && s.stackVerdict === "ok",
    line: () => "Table's clear. Stack is steady. Take the quiet — it does not last.",
  },
  {
    id: "raziel-evergreen-1",
    npc: "raziel",
    tier: 1,
    requires: () => true,
    line: () => "The hall is live. Walk it. Doors stay sealed until you approve a Spec.",
  },
  {
    id: "raziel-evergreen-2",
    npc: "raziel",
    tier: 1,
    requires: () => true,
    line: () => "I hold this hall. I do not invent what happens in it.",
  },

  // ---------------------------------------------------------------- Valerie
  {
    id: "valerie-failing",
    npc: "valerie",
    tier: 3,
    requires: (s) => s.failingServices.length > 0,
    line: (s) =>
      `${s.failingServices.slice(0, 3).join(", ")} — ${plural(s.failingServices.length, "that one's", "those are")} down. Containers can sit there green all day while the thing inside them is dead. Bring it to the bench.`,
  },
  {
    id: "valerie-degraded",
    npc: "valerie",
    tier: 2,
    requires: (s) => s.stackVerdict === "degraded" && s.failingServices.length === 0,
    line: () => "Box says degraded and won't say what. I'd rather it screamed.",
  },
  {
    id: "valerie-ok",
    npc: "valerie",
    tier: 2,
    requires: (s) => s.stackVerdict === "ok",
    line: () => "Everything's answering. Gateway's warm. Don't touch it.",
  },
  {
    id: "valerie-evergreen-1",
    npc: "valerie",
    tier: 1,
    requires: () => true,
    line: () => "Workshop's cold until you forge it. I can still diagnose. Numbered steps, reversible, no secrets on screen.",
  },
  {
    id: "valerie-evergreen-2",
    npc: "valerie",
    tier: 1,
    requires: () => true,
    line: () => "Tell me the symptom. I don't guess causes and I don't invent logs.",
  },

  // ---------------------------------------------------------------- Corvid
  {
    id: "corvid-counts",
    npc: "corvid",
    tier: 2,
    requires: (s) => s.gatesPending != null || s.quarantineOpen != null,
    line: (s) => {
      const bits: string[] = [];
      if (s.gatesPending != null) bits.push(`${s.gatesPending} at the table`);
      if (s.quarantineOpen != null) bits.push(`${s.quarantineOpen} in the cell`);
      if (s.failingServices.length) bits.push(`${s.failingServices.length} down`);
      return `Counts: ${bits.join(", ")}. That's what I have. I don't pad it.`;
    },
  },
  {
    id: "corvid-quiet",
    npc: "corvid",
    tier: 2,
    requires: (s) => s.gatesPending === 0 && s.quarantineOpen === 0,
    line: () => "Nothing at the table. Nothing in the cell. Quiet yard.",
  },
  {
    id: "corvid-evergreen-1",
    npc: "corvid",
    tier: 1,
    requires: () => true,
    line: () => "Roost first. Cited digest only. No rumour, no invented numbers.",
  },
  {
    id: "corvid-evergreen-2",
    npc: "corvid",
    tier: 1,
    requires: () => true,
    line: () => "Point me at a source. I come back with a digest or I say unknown.",
  },

  // ---------------------------------------------------------------- Oracle
  {
    id: "oracle-quarantine",
    npc: "oracle",
    tier: 3,
    requires: (s) => (s.quarantineOpen ?? 0) > 0,
    line: (s) =>
      `${s.quarantineOpen} ${plural(s.quarantineOpen!, "claim sits", "claims sit")} in the cell, unsupported by ${plural(s.quarantineOpen!, "its", "their")} own evidence. Most recent: "${(s.quarantineClaim ?? "").slice(0, 90)}". Read it before you trust the next answer.`,
  },
  {
    id: "oracle-clean",
    npc: "oracle",
    tier: 2,
    requires: (s) => s.quarantineOpen === 0,
    line: () => "The cell holds nothing open. That is not proof of honesty — only that nothing has been committed to it.",
  },
  {
    id: "oracle-evergreen-1",
    npc: "oracle",
    tier: 1,
    requires: () => true,
    line: () => "TRUTH OVER COMFORT. RECEIPTS OVER OPINION. Speak your query, or step back before the Inquisitor.",
  },
  {
    id: "oracle-evergreen-2",
    npc: "oracle",
    tier: 1,
    requires: () => true,
    line: () => "I answer from the vault or I do not answer. There is no third path.",
  },

  // ------------------------------------------------------------------ Cell
  {
    id: "cell-count",
    npc: "quarantine-warden",
    tier: 2,
    requires: (s) => (s.quarantineOpen ?? 0) > 0,
    line: (s) =>
      `${s.quarantineOpen} open. Nothing in here is deleted. Every one of them was asserted by a model you rely on.`,
  },
  {
    id: "cell-empty",
    npc: "quarantine-warden",
    tier: 2,
    requires: (s) => s.quarantineOpen === 0,
    line: () => "Empty. That means nothing was committed here — not that nothing was fabricated.",
  },
];

/** Lines already spent this session, per NPC, so nothing repeats early. */
const spent = new Map<string, Set<string>>();

/**
 * Pick a line for an NPC. Returns null when nothing matches, so the caller
 * falls back to the character's written greeting rather than inventing one.
 */
export function pickBark(npcId: string, state: HallState | null): string | null {
  if (!state) return null;

  const eligible = BARKS.filter((b) => b.npc === npcId && b.requires(state));
  if (!eligible.length) return null;

  const used = spent.get(npcId) ?? new Set<string>();

  // Tier 3 is never exhausted. If gates are still unsealed on your third visit,
  // Raziel says so on your third visit — an urgent condition that stops being
  // reported because it was already mentioned is how things get missed.
  const urgent = eligible.filter((b) => b.tier === 3);
  if (urgent.length) {
    const choice = urgent[Math.floor(Math.random() * urgent.length)];
    return choice.line(state);
  }

  // Below that, highest tier first, falling THROUGH to a lower tier when the
  // higher one has nothing left unsaid. Repeating "table's clear" four visits
  // running is worse than dropping to an evergreen line — a character that
  // repeats itself stops reading as one that noticed anything.
  const tiers = [...new Set(eligible.map((b) => b.tier))].sort((a, b) => b - a);
  let pool = tiers
    .map((t) => eligible.filter((b) => b.tier === t && !used.has(b.id)))
    .find((group) => group.length > 0);

  if (!pool) {
    // Everything eligible has been said. Clear this NPC's memory and start over
    // from the top tier rather than going silent.
    for (const b of eligible) used.delete(b.id);
    const top = Math.max(...eligible.map((b) => b.tier));
    pool = eligible.filter((b) => b.tier === top);
  }

  const choice = pool[Math.floor(Math.random() * pool.length)];
  used.add(choice.id);
  spent.set(npcId, used);
  return choice.line(state);
}

/** Test seam. */
export function resetBarkMemory(): void {
  spent.clear();
}
