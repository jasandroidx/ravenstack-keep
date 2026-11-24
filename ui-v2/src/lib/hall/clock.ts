/**
 * The Keep's ONE clock, shared by every Hall scene.
 *
 * `gameHour()` is the machine's local hour (fractional). Torches, fireflies,
 * NPC routines and the time-of-day wash all read it together, so dusk arrives
 * at dusk instead of whenever a tab happens to be open. The band functions are
 * pure and take an hour, which is what interact.test.ts pins.
 */
export type Phase = "dawn" | "day" | "dusk" | "night";

const wrap = (hour: number): number => ((hour % 24) + 24) % 24;

export function gameHour(now: Date = new Date()): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

export function phaseOf(hour: number): Phase {
  const h = wrap(hour);
  if (h < 5 || h >= 21) return "night";
  if (h < 8) return "dawn";
  if (h < 18) return "day";
  return "dusk";
}

export function isNight(hour: number): boolean {
  return phaseOf(hour) === "night";
}

/** Braziers catch at dusk and burn until dawn. */
export function torchesLit(hour: number): boolean {
  const h = wrap(hour);
  return h >= 18 || h < 6;
}

/** Fireflies only over the yard, and only in the dark. */
export function firefliesOut(hour: number): boolean {
  return isNight(hour);
}

type Light = { hour: number; rgb: [number, number, number] };

/** MULTIPLY wash keyed to the band centres, interpolated between them. */
const WASH: Light[] = [
  { hour: 0, rgb: [58, 66, 96] },
  { hour: 5, rgb: [74, 80, 110] },
  { hour: 6.5, rgb: [176, 150, 140] },
  { hour: 9, rgb: [250, 246, 236] },
  { hour: 13, rgb: [255, 252, 244] },
  { hour: 17, rgb: [252, 238, 214] },
  { hour: 19, rgb: [186, 138, 112] },
  { hour: 21, rgb: [96, 92, 120] },
  { hour: 24, rgb: [58, 66, 96] },
];

export function washRGB(hour: number): [number, number, number] {
  const h = wrap(hour);
  for (let i = 1; i < WASH.length; i++) {
    const a = WASH[i - 1];
    const b = WASH[i];
    if (h <= b.hour) {
      const t = (h - a.hour) / (b.hour - a.hour);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
      ];
    }
  }
  return [...WASH[WASH.length - 1].rgb];
}
