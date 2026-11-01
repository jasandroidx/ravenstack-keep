/**
 * Transcript types and failure handling, kept out of the component file so
 * fast refresh keeps working (a component module must export only components).
 */
export type Turn = {
  who: "agent" | "you" | "error";
  text: string;
  /** Provenance under a reply: which model answered, whether it saw the box. */
  meta?: string;
  /** Actionable next step shown under an error. */
  hint?: string;
  /** Citations, seats, or whatever the surface wants to footnote. */
  footnote?: string;
};

/**
 * One place that decides what a failed call looks like on screen.
 * Plumbing goes to the console; the operator sees a headline and a next step.
 */
export function errorTurn(
  out: { error?: string; hint?: string; detail?: string } | unknown,
  fallback: string,
): Turn {
  if (out && typeof out === "object" && "error" in out) {
    const o = out as { error?: string; hint?: string; detail?: string };
    if (o.detail) console.warn("[keep]", o.detail);
    return { who: "error", text: o.error || fallback, hint: o.hint };
  }
  const msg = out instanceof Error ? out.message : fallback;
  return { who: "error", text: msg };
}
