import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/env";
import { getProviderByKey } from "@/db/providers";
import type { Release } from "@/db/releases";

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

/**
 * Who is making this request.
 *  - "platform": holds the master ADMIN_TOKEN — a super-admin over every release
 *    (this is what the hackathon judges use).
 *  - "provider": authenticated as one operator via x-provider-key — may act only
 *    on releases they own.
 *  - "none": unauthenticated.
 *
 * Platform is checked first and short-circuits (no DB hit), so the master token
 * never depends on a provider lookup.
 */
export type Actor =
  | { role: "platform" }
  | { role: "provider"; providerId: string; providerName: string }
  | { role: "none" };

export async function resolveActor(req: Request): Promise<Actor> {
  if (isAdminRequest(req)) return { role: "platform" };
  const provider = await getProviderByKey(req.headers.get("x-provider-key"));
  if (provider) return { role: "provider", providerId: provider.id, providerName: provider.name };
  return { role: "none" };
}

export type ReleaseAuthz =
  | { ok: true; actor: Actor; release: Release }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * Authorize a mutating action (delete, draw, burst) on a specific release.
 * Platform may act on any release; a provider only on releases they own; anyone
 * else is rejected. Centralized so every release mutation shares one check.
 */
export async function authorizeReleaseMutation(
  req: Request,
  releaseId: string,
): Promise<ReleaseAuthz> {
  const { getRelease } = await import("@/db/releases");
  const actor = await resolveActor(req);
  if (actor.role === "none") return { ok: false, status: 401, error: "unauthorized" };
  const release = await getRelease(releaseId);
  if (!release) return { ok: false, status: 404, error: "not found" };
  if (actor.role === "provider" && release.provider_id !== actor.providerId) {
    return { ok: false, status: 403, error: "forbidden — you can only manage releases you created" };
  }
  return { ok: true, actor, release };
}
