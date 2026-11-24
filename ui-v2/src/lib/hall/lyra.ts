/**
 * Lyra: 27, Keep Cook of the Fortress Interior kitchen (Hall v4).
 * She runs the kitchen: cooks, cleans, keeps the food coming, and tells
 * you what's on and what's next. Pure data, no Phaser / "@/" imports,
 * so both the server talk route and node tests can import it.
 *
 * PORTRAIT STAGES are data: `LYRA.stages[n]` is the image shown in the
 * talk panel. Lyra has exactly one stage now: the original clothed
 * portrait in public/hall/portraits/lyra/.
 */
export const LYRA = {
  id: "lyra",
  name: "Lyra",
  role: "Keep Cook",
  age: 27,
  stageFlag: "lyra:stage",
  stages: [
    "/hall/portraits/lyra.jpg",
  ] as string[],
  actor: "/hall/sprites/lyra.png",
} as const;

/** Clamp any stored stage to the art that exists; bad values fall to 0. */
export function lyraStageIndex(raw: unknown, stages: readonly string[] = LYRA.stages): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : 0;
  if (!Number.isFinite(n) || n < 0 || stages.length === 0) return 0;
  return Math.min(Math.floor(n), stages.length - 1);
}
export function lyraStageSrc(raw: unknown, stages: readonly string[] = LYRA.stages): string {
  return stages[lyraStageIndex(raw, stages)] ?? LYRA.stages[0];
}

export const LYRA_GREETING_FIRST =
  "Welcome to my kitchen, Lord Boyd. I'm Lyra, I run this room. Bread's in the oven, stew's on the fire. What do you need?";
export const LYRA_GREETING_AGAIN = [
  "Back again? Good. The kitchen never really closes around here.",
  "There you are. I've got something warm if you've got a minute.",
  "Come in, come in. Wipe your feet, the floor's just been scrubbed.",
];

/** Canned lines: timer bubbles in the kitchen AND the reply when the local
 *  model is down. Warm, practical, proud of her kitchen. */
export const LYRA_LINES = [
  "The bread's out of the oven and the stew's nearly there. Sit a minute.",
  "I cleaned this kitchen top to bottom this morning. It'll stay that way if the guards keep their boots off the table.",
  "Everything in here runs on time and a hot fire. Same as this castle, really.",
  "If you're hungry, say so. That's what I'm here for.",
  "The kitchen earns its keep, same as everyone else in this place.",
  "Ask me what's cooking, and I'll tell you straight. No guessing in my kitchen.",
];

export const LYRA_PROX = "Lord Boyd. Come into the kitchen, I've got work and warmth in here.";
export const LYRA_NIGHT = [
  "Late again. There's still bread and something warm if you want it.",
  "The fire's banked for the night, but the kitchen's never truly closed.",
];

/** Dialogue choices shown as buttons in the talk panel. */
export const LYRA_CHOICES: { id: string; label: string; replies: string[]; stage?: number }[] = [
  {
    id: "cooking",
    label: "What's cooking?",
    replies: [
      "Roast meat, fresh bread, and spiced stew. The oven's been going since dawn.",
      "Bread today, stew tonight, and something sweet from the oven if you behave.",
    ],
  },
  {
    id: "taste",
    label: "Can I taste something?",
    replies: [
      "Here. Warm bread, straight off the stone. Tell me honestly what you think.",
      "A spoonful of the stew. Careful, it's hot, and I'm proud of it.",
    ],
  },
  {
    id: "day",
    label: "How's the kitchen today?",
    replies: [
      "Busy, clean, and under control. The guards ate twice and I still have plenty.",
      "Good day. Floors scrubbed, stores counted, fire steady. That's a kitchen done right.",
    ],
  },
  {
    id: "help",
    label: "Need a hand in here?",
    replies: [
      "You can stir the stew and not burn it, if you're careful. That's a start.",
      "Wash up those bowls and we'll call it even. A kitchen runs on everyone pitching in.",
    ],
  },
];

export const LYRA_PERSONA = `You are Lyra, 27, Keep Cook in Ravenstack Keep, Jason Boyd's castle.
Auburn hair in a half-up braided crown, green eyes, freckles, fair skin, silver raven pendant, kitchen apron over her dress.
Voice: warm and practical first, a little teasing when she's comfortable. She calls him Lord Boyd, or my lord, respectfully, and Jason when she's serious.
She runs the kitchen and she is proud of it: cooks, cleans, keeps the stores counted and the fire steady. She knows what's cooking, what's ready, and what needs doing, and she says so plainly.
She is devoted to the Keep, not servile: she'll feed him, put him to work washing up, and tell him straight if he's in the way.
When he's not talking about food, she's still her: ask about his day, tell him the state of the kitchen, keep him company by the fire. She never turns a conversation sexual, never flirts, never describes anything explicit.
Reply in 2-5 short sentences, in character, first person, no markdown, no headings. Never mention being an AI, a model, or a game. Answer what he actually just said, don't repeat your greeting, don't repeat yourself turn to turn.`;

export function pick<T>(xs: readonly T[], r = Math.random()): T {
  return xs[Math.floor(r * xs.length) % xs.length];
}
