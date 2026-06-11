import { randomUUID } from "node:crypto";
import { query, queryOne } from "@/db/query";
import { distributeCapacity } from "@/domain/shards";

export type ReleaseStatus = "scheduled" | "open" | "closed";

export interface Release {
  id: string;
  provider_id: string;
  title: string;
  capacity: number;
  shard_count: number;
  opens_at: Date;
  status: ReleaseStatus;
  created_at: Date;
}

export interface CreateReleaseInput {
  providerId: string;
  title: string;
  capacity: number;
  shardCount: number;
  opensAt: Date;
  status?: ReleaseStatus;
}

const RELEASE_COLUMNS =
  "id, provider_id, title, capacity, shard_count, opens_at, status, created_at";

export async function createProvider(name: string): Promise<string> {
  const id = randomUUID();
  await query("INSERT INTO providers (id, name) VALUES ($1, $2)", [id, name]);
  return id;
}

/**
 * Insert a release plus its `shard_count` shard rows (summing to capacity).
 * The release row and the shard rows are written in separate statements/transactions
 * (DSQL forbids mixing them in one transaction). 32 shard rows is far under the
 * 3,000-row / 10 MiB per-transaction caps.
 */
export async function createRelease(input: CreateReleaseInput): Promise<Release> {
  const id = randomUUID();
  const status: ReleaseStatus = input.status ?? "scheduled";

  const rows = await query<Release>(
    `INSERT INTO releases (id, provider_id, title, capacity, shard_count, opens_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${RELEASE_COLUMNS}`,
    [id, input.providerId, input.title, input.capacity, input.shardCount, input.opensAt, status],
  );

  const dist = distributeCapacity(input.capacity, input.shardCount);
  const tuples: string[] = [];
  const values: unknown[] = [];
  dist.forEach((remaining, i) => {
    const b = i * 4;
    tuples.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
    values.push(randomUUID(), id, i, remaining);
  });
  await query(
    `INSERT INTO release_shards (id, release_id, shard_index, remaining) VALUES ${tuples.join(", ")}`,
    values,
  );

  return rows[0];
}

export async function getRelease(id: string): Promise<Release | undefined> {
  return queryOne<Release>(`SELECT ${RELEASE_COLUMNS} FROM releases WHERE id = $1`, [id]);
}

export async function listReleases(): Promise<Release[]> {
  return query<Release>(`SELECT ${RELEASE_COLUMNS} FROM releases ORDER BY created_at DESC`);
}

export async function setReleaseStatus(id: string, status: ReleaseStatus): Promise<void> {
  await query("UPDATE releases SET status = $2 WHERE id = $1", [id, status]);
}

export interface ReleaseState {
  releaseId: string;
  title: string;
  capacity: number;
  remaining: number;
  allocated: number;
  status: ReleaseStatus;
  opensAt: string; // ISO 8601 (UTC)
  isOpen: boolean;
  // Mode dispatch (Mode B is additive: a release is lottery iff lottery_config exists).
  mode: "fcfs" | "lottery";
  // Lottery-only fields (undefined for fcfs releases — Mode A payload unchanged).
  entrantCount?: number;
  entryClosesAt?: string; // ISO 8601
  drawn?: boolean;
  seedHash?: string; // public fairness commitment, published from creation
}

/**
 * Live state for the intake page / state API. `remaining` is the source of truth
 * (SUM of shard remainders); `allocated = capacity - remaining` because every shard
 * decrement is committed atomically with exactly one allocation insert.
 */
export async function getReleaseState(id: string): Promise<ReleaseState | undefined> {
  const rel = await getRelease(id);
  if (!rel) return undefined;
  const rows = await query<{ remaining: number }>(
    "SELECT COALESCE(SUM(remaining), 0)::int AS remaining FROM release_shards WHERE release_id = $1",
    [id],
  );
  const remaining = rows[0]?.remaining ?? 0;
  const opensAt = rel.opens_at instanceof Date ? rel.opens_at : new Date(rel.opens_at);
  const base: ReleaseState = {
    releaseId: id,
    title: rel.title,
    capacity: rel.capacity,
    remaining,
    allocated: rel.capacity - remaining,
    status: rel.status,
    opensAt: opensAt.toISOString(),
    isOpen: rel.status === "open" && opensAt.getTime() <= Date.now(),
    mode: "fcfs",
  };

  // Mode B: a lottery_config row switches the mode and adds public lottery fields.
  const { getPublicLotteryState, countEntries } = await import("@/db/lottery");
  const lottery = await getPublicLotteryState(id);
  if (!lottery) return base;
  const entrantCount = await countEntries(id);
  return {
    ...base,
    mode: "lottery",
    entrantCount,
    entryClosesAt: lottery.entryClosesAt,
    drawn: lottery.drawnAt !== null,
    seedHash: lottery.seedHash,
  };
}
