import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/env";

/** Constant-time compare of a presented token against ADMIN_TOKEN. */
export function isAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = getEnv().ADMIN_TOKEN;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Read the admin token from the `x-admin-token` header. */
export function adminTokenFromRequest(req: Request): string | null {
  return req.headers.get("x-admin-token");
}

/** True when the request carries a valid admin token. */
export function isAdminRequest(req: Request): boolean {
  return isAdminToken(adminTokenFromRequest(req));
}
