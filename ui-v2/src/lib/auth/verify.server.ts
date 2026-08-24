import { getRequest } from "@tanstack/react-start/server";
import { auth, authConfigured } from "./server";

export { authConfigured };

export const DEV_USER_ID = "dev-user";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

export async function getSessionUser(
  bearerToken?: string,
): Promise<VerifiedUser | null> {
  const request = getRequest();
  let headers = request?.headers;
  if (bearerToken) {
    headers = new Headers(request?.headers);
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  const user = await getSessionUser(bearerToken);
  if (!user) return DEV_USER_ID;
  return user.id;
}
