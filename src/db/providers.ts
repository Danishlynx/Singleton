import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { query, queryOne } from "@/db/query";

/**
 * Provider (tenant) identity + authentication.
 *
 * Each operator/company is a `providers` row. Registering through /api/providers
 * mints a secret `api_key`; the operator authenticates with it (x-provider-key)
 * to create releases owned by them and delete only their own. The platform
 * ADMIN_TOKEN is a separate super-admin credential handled in @/lib/admin.
 */

export interface Provider {
  id: string;
  name: string;
}

/** A recognizable, URL-safe operator secret (e.g. "op_xfP3…"). */
export function generateProviderKey(): string {
  return `op_${randomBytes(24).toString("base64url")}`;
}

/** Register a new provider and return its id + one-time-visible api key. */
export async function createProviderWithKey(name: string): Promise<Provider & { apiKey: string }> {
  const id = randomUUID();
  const apiKey = generateProviderKey();
  await query("INSERT INTO providers (id, name, api_key) VALUES ($1, $2, $3)", [id, name, apiKey]);
  return { id, name, apiKey };
}

/**
 * Resolve a provider from a presented api key. The lookup is by exact key via the
 * unique index; the constant-time compare on the returned row defends against a
 * timing side-channel on the (already indexed) secret.
 */
export async function getProviderByKey(apiKey: string | null | undefined): Promise<Provider | null> {
  if (!apiKey) return null;
  const row = await queryOne<{ id: string; name: string; api_key: string }>(
    "SELECT id, name, api_key FROM providers WHERE api_key = $1",
    [apiKey],
  );
  if (!row) return null;
  const a = Buffer.from(apiKey);
  const b = Buffer.from(row.api_key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id: row.id, name: row.name };
}
