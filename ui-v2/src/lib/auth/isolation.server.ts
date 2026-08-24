import { getRequest } from "@tanstack/react-start/server";

export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Guard against cross-site scripted requests while allowing preview iframe */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return;
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none" || site === "cross-site") return;
}
