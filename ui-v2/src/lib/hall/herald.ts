import { fetchAmbientEvent } from "@/lib/keep/ollama";
/**
 * Herald — ambient flavor ticker, not a status feed.
 *
 * Everything here is cosmetic scenery: an NPC's idle thought, the weather
 * outside the Keep, a torch guttering. None of it is load-bearing truth —
 * that stays in pulse.ts / barks.ts, which read real state. If a line here
 * ever needs to be correct rather than atmospheric, it belongs in barks.ts
 * instead, not here.
 */

export type HeraldLine = {
  id: string;
  category: "thought" | "weather" | "torchlight";
  /** Only for category "thought" — whose voice this is. */
  npc?: "raziel" | "oracle" | "valerie" | "corvid";
  requires?: (hour: number) => boolean;
  text: string;
};

const night = (hour: number) => hour >= 22 || hour < 6;
const day = (hour: number) => hour >= 6 && hour < 22;

export const HERALD_LINES: HeraldLine[] = [
  // --------------------------------------------------------------- thought
  { id: "raziel-thought-1", category: "thought", npc: "raziel", text: "Raziel paces a slow circuit of the hall, counting doors that are still sealed." },
  { id: "raziel-thought-2", category: "thought", npc: "raziel", text: "Raziel glances at the war table, then away. Nothing waits there right now." },
  { id: "raziel-thought-3", category: "thought", npc: "raziel", requires: night, text: "Raziel keeps the same hours as the hall. Neither of them sleep." },
  { id: "oracle-thought-1", category: "thought", npc: "oracle", text: "The Oracle's eye drifts to the stacks, then back to the door, waiting on a question worth answering." },
  { id: "oracle-thought-2", category: "thought", npc: "oracle", text: "A faint green light passes over the Library shelves. Nothing is cited. Nothing is claimed." },
  { id: "valerie-thought-1", category: "thought", npc: "valerie", text: "Valerie mutters something about a container that's green and shouldn't be." },
  { id: "valerie-thought-2", category: "thought", npc: "valerie", text: "A wrench taps twice against the workshop bench. Valerie is thinking, not fixing." },
  { id: "corvid-thought-1", category: "thought", npc: "corvid", text: "Corvid tilts its head toward the yard gate, counting something only it can see." },
  { id: "corvid-thought-2", category: "thought", npc: "corvid", text: "Corvid preens once, unimpressed by the quiet." },

  // --------------------------------------------------------------- weather
  { id: "weather-day-1", category: "weather", requires: day, text: "Grey light moves across the high windows. Somewhere above the Keep, weather is happening." },
  { id: "weather-day-2", category: "weather", requires: day, text: "A draft crosses the hall floor and dies against the far wall." },
  { id: "weather-night-1", category: "weather", requires: night, text: "Rain, or something like it, taps against the windows above the Great Hall." },
  { id: "weather-night-2", category: "weather", requires: night, text: "Wind finds a gap in the old stonework and hums for a while, then stops." },

  // ------------------------------------------------------------- torchlight
  { id: "torch-1", category: "torchlight", text: "A wall-torch gutters, dims, and catches itself again." },
  { id: "torch-2", category: "torchlight", text: "One of the braziers burns a shade brighter, as if something just fed it." },
  { id: "torch-3", category: "torchlight", requires: night, text: "Half the hall's conduits dim for the night watch. The other half hold steady." },
  { id: "torch-4", category: "torchlight", text: "A conduit near the fountain flickers twice, then settles." },
];

/** Lines already spent this session, so nothing repeats until the pool empties. */
const spent = new Set<string>();

/**
 * Pick one ambient line for the current hour. Returns null only if somehow
 * nothing is eligible (should not happen — evergreen lines have no requires).
 */
export function pickHeraldLine(hour: number): HeraldLine | null {
  const eligible = HERALD_LINES.filter((l) => !l.requires || l.requires(hour));
  if (!eligible.length) return null;

  let pool = eligible.filter((l) => !spent.has(l.id));
  if (!pool.length) {
    spent.clear();
    pool = eligible;
  }

  const choice = pool[Math.floor(Math.random() * pool.length)];
  spent.add(choice.id);
  return choice;
}

/** Test seam. */
export function resetHeraldMemory(): void {
  spent.clear();
}


/**
 * Async version of pickHeraldLine: attempts to fetch dynamic ambient event from Ollama.
 * Falls back to static rule-based herald line if Ollama is unreachable.
 */
export async function pickHeraldLineAsync(hour: number): Promise<HeraldLine | null> {
  const dynamicText = await fetchAmbientEvent();
  if (dynamicText) {
    return {
      id: `ollama-${Date.now()}`,
      category: "torchlight",
      text: dynamicText,
    };
  }
  return pickHeraldLine(hour);
}
