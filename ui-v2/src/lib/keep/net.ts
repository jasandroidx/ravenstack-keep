/**
 * Shared failure classification for the box-facing clients.
 *
 * Runtimes word a refused connection differently — Node/undici says
 * "fetch failed" and hides ECONNREFUSED on the cause, Bun says "Unable to
 * connect". Both have to produce the same actionable hint, or the operator
 * gets a generic error at exactly the moment the service is simply down.
 */

/** Flatten an error plus its cause chain into one searchable string. */
export function errorText(err: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let cur: unknown = err;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur instanceof Error) {
      parts.push(cur.message);
      const code = (cur as { code?: unknown }).code;
      if (typeof code === "string") parts.push(code);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(" | ");
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  return /\babort/i.test(errorText(err));
}

export function isConnectionError(err: unknown): boolean {
  return /ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|fetch failed|unable to connect|connection refused|failed to fetch|socket hang up|network/i.test(
    errorText(err),
  );
}
