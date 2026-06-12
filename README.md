# Singleton

**Provably-fair, no-oversell allocation of a scarce resource** (e.g. limited appointment
slots) on **Amazon Aurora DSQL** + **Next.js 15 on Vercel**.

Singleton releases a fixed batch of slots to a crowd and guarantees the batch is allocated:

- **Correctly** — never more than capacity (no oversell), even under heavy concurrency;
- **Fairly** — first-come ordering, one slot per person, no line-jumping;
- **Verifiably** — every claimant gets a receipt whose position can be independently
  re-checked against an immutable public ledger.

The defensible insight: **Aurora DSQL is strongly consistent, horizontally scalable,
active-active multi-region, and serverless**, so the guarantee is a single ordinary ACID
transaction (a sharded conditional decrement with OCC retry) — not sharded-SQL plumbing,
eventual-consistency hacks, external locks, or a blockchain.

---

## How the guarantee works

> **The full A-to-Z deep dive lives in [docs/INTEL.md](docs/INTEL.md)** — every table, every
> endpoint, every invariant and why it holds, the security reviews, and the live verification
> results. Architecture diagram: [docs/architecture.png](docs/architecture.png) (source
> [docs/architecture.svg](docs/architecture.svg)). Submission checklist:
> [docs/SUBMISSION.md](docs/SUBMISSION.md). v0 scaffolding workflow: [docs/v0/PROMPTS.md](docs/v0/PROMPTS.md).

```
Many users (+ bots) ──HTTPS──> Next.js on Vercel (Node runtime)
                                 ├─ React UI: intake · live count · receipt · verify · admin
                                 └─ Route Handlers (app/api/**)
                                       │ node-postgres via the official Aurora DSQL connector
                                       │ (IAM auth tokens, per-connection, auto-refresh)
                                       ▼
                                 Amazon Aurora DSQL — strongly consistent, serverless
                                   capacity split across N shard rows; SUM(remaining) = remaining
```

A release's `capacity` is split across `shard_count` rows (`release_shards`). A claim:

1. short-circuits if the claimant already holds a slot (idempotent, no write);
2. picks a **random shard order** and, per shard, runs one transaction:
   `UPDATE release_shards SET remaining = remaining - 1 WHERE … AND remaining > 0 RETURNING id`
   then `INSERT` the allocation, then `COMMIT`;
3. retries the whole claim on a **commit-time OCC conflict** (`SQLSTATE 40001` / `OC000`)
   with exponential backoff + jitter;
4. joins a fair **waitlist** when every shard is empty (sold out).

Sharding spreads writes across many keys so OCC conflicts on any single row stay rare — this
is mandatory on DSQL, which penalises hot single-row updates. The `CHECK (remaining >= 0)`
constraint plus the conditional decrement make oversell impossible; the unique index on
`(release_id, claimant_id)` makes a retried claim idempotent. Ranks are **derived** from the
`(claimed_at, id)` order, never stored as a hot counter, so they are exactly `1..allocated`.

See [`src/domain/claim.ts`](src/domain/claim.ts) (the heart), [`src/db/retry.ts`](src/db/retry.ts),
and [`scripts/stress.ts`](scripts/stress.ts).

### Mode B — windowed lottery with a commit-reveal draw

FCFS rewards latency: a datacenter bot beats a human on hospital wifi every time. **Mode B
removes speed from the game.** A release opens an *entry window*; everyone who enters is an
equal entrant (second 1 and second 599 are identical). When the window closes, one atomic
transaction draws `capacity` winners using a **commit-reveal seed**:

1. at creation, a 32-byte seed is generated and only its **SHA-256 commitment** is published;
2. entries accumulate (idempotent, one per claimant, UUID entry ids);
3. the draw scores every entry as `sha256(seed + ":" + entryId)`, sorts ascending, takes
   `capacity`, consumes the shards, and reveals the seed — all in one ACID transaction,
   idempotent via a `drawn_at` guard;
4. the verify page **re-runs the entire draw in your browser** (WebCrypto) and shows
   MATCH/MISMATCH — provably fair, no blockchain.

A release is lottery mode iff a `lottery_config` row exists (no change to Mode A tables or
behavior). Draw proofs expose entry UUIDs only — never claimant identities. See
[`src/domain/lottery.ts`](src/domain/lottery.ts), [`src/domain/draw.ts`](src/domain/draw.ts),
and [`src/components/lottery-proof.tsx`](src/components/lottery-proof.tsx).

```bash
# Lottery stress: 3,000 concurrent entries → draw → byte-for-byte re-derivation check
npm run stress -- --mode=lottery --attempts 3000 --capacity 200 --shardCount 32
```

---

## Aurora DSQL design notes (why this code looks the way it does)

DSQL speaks the PostgreSQL wire protocol but is **not** full PostgreSQL. Verified against the
current AWS Aurora DSQL User Guide (2026-06):

| Constraint                                  | How we handle it                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **No foreign keys**                         | Relationships enforced in app code; unique indexes where they help.                            |
| **No sequences / SERIAL**                   | App-generated UUID PKs via `crypto.randomUUID()`.                                              |
| **CHECK constraints ARE supported**         | Kept as real DB-enforced invariants (`capacity > 0`, `remaining >= 0`).                        |
| **DDL is async**                            | Indexes use `CREATE INDEX ASYNC`; the migrate runner polls `pg_index.indisvalid`.              |
| **1 DDL per txn, no DDL+DML mixing**        | Each migration statement runs in its own transaction.                                          |
| **3,000-row / 10 MiB / 5-min txn caps**     | Seed/shard writes are tiny; claims write 1 row each.                                           |
| **OCC, REPEATABLE READ only**               | App retries `SQLSTATE 40001` (`OC000`/`OC001`) with backoff.                                   |
| **60-min connection cap, 15-min token TTL** | The official connector mints a fresh IAM token per connection and recycles connections.        |
| **IAM auth only**                           | No static DB password; `@aws/aurora-dsql-node-postgres-connector` + the AWS credential chain.  |

> A few decisions deviate from a first-draft spec where current official docs required it;
> those spots are marked with `// SPEC-NOTE:` in the code.

---

## Tech stack

TypeScript (strict) · Node 20+ · Next.js 15 (App Router, Node runtime) · Tailwind v4 +
shadcn/ui + lucide-react · Amazon Aurora DSQL · `pg` + **`@aws/aurora-dsql-node-postgres-connector`** ·
raw parameterized SQL (no ORM) · Zod · Vitest · Playwright · stress harness (Node).

> `create-next-app@latest` now ships Next 16; this project pins **Next.js 15** per spec
> (`package.json`), which is what the data/runtime code was verified against.

---

## Prerequisites

- **Node.js ≥ 20.9** (Vercel uses 20/22/24).
- **AWS account** + an IAM principal allowed to create/connect to a DSQL cluster.
- **AWS CLI v2** (for provisioning + tokens): https://aws.amazon.com/cli/ then `aws configure`.
  Verify with `aws dsql help` and `aws sts get-caller-identity`.

---

## 1) Provision Aurora DSQL

Scripts live in [`scripts/provision/`](scripts/provision/). Windows users use the `.ps1`
variants; macOS/Linux/CI use the `.sh` variants (need `jq`).

### Single region (recommended to start)

```powershell
# from singleton/
./scripts/provision/single-region.ps1 -Region us-east-1
```

```bash
./scripts/provision/single-region.sh us-east-1
```

It creates the cluster (deletion protection OFF for the hackathon), waits for `ACTIVE`, and
prints the endpoint `<id>.dsql.us-east-1.on.aws` plus the cluster ARN. Put the endpoint into
`.env.local` (next step). Grant the principal `dsql:DbConnectAdmin` on the cluster ARN — see
[`scripts/provision/iam-policy.json`](scripts/provision/iam-policy.json).

### Multi-region (peered) — for the "consistent everywhere" story

```powershell
./scripts/provision/multi-region.ps1 -RegionA us-east-1 -RegionB us-east-2 -Witness us-west-2
```

```bash
./scripts/provision/multi-region.sh us-east-1 us-east-2 us-west-2
```

It creates a cluster in each active region sharing the witness region, peers them, waits for
both `ACTIVE`, and prints both endpoints. Both endpoints accept reads **and** writes and
present one strongly-consistent logical database.

---

## 2) Configure + initialize locally

```bash
cp .env.example .env.local        # then fill in the values printed by provisioning
npm install
npm run migrate                   # applies db/migrations (async indexes; waits for valid)
npm run seed                      # creates a demo provider + open release; prints its URL
npm run dev                       # http://localhost:3000
```

### Environment variables (`.env.local`)

| Var                                                        | Required             | Notes                                                      |
| ---------------------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| `AWS_REGION`                                               | yes                  | e.g. `us-east-1` (pin it explicitly).                      |
| `DSQL_CLUSTER_ENDPOINT`                                    | yes                  | `<id>.dsql.<region>.on.aws`.                               |
| `CLUSTER_USER`                                             | no (default `admin`) | `admin` → admin IAM token.                                 |
| `ADMIN_TOKEN`                                              | yes                  | gates `/admin` + admin APIs (create, simulate, draw).      |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`              | \*                   | or any AWS credential source (`aws configure`, SSO, role). |
| `DSQL_CLUSTER_ENDPOINT_SECONDARY` / `AWS_REGION_SECONDARY` | no                   | enables multi-region routing + failover.                   |
| `DB_POOL_MAX`                                              | no (default 5)       | raise for the stress harness.                              |

---

## 3) Prove the guarantee

```bash
# Concurrency stress harness — the core gate.
npm run stress -- --attempts 3000 --capacity 200 --shardCount 32 --concurrency 64
```

It fires the attempts concurrently and **asserts (non-zero exit on any violation)**:
allocations === `min(attempts, capacity)`; **oversells === 0** (no shard negative;
`SUM(remaining) === capacity − allocated`); every claimant distinct with exactly one slot;
derived ranks exactly `1..allocated`, unique and contiguous. It prints throughput, latency
p50/p95/p99, total OCC retries.

The same guarantee is visible in the UI: **Admin → a release → Run burst**.

### Tests

```bash
npm run test            # Vitest unit + integration (integration auto-skips without DSQL)
npm run test:unit       # pure logic: shard distribution, shuffle, backoff, rank, lottery hashing
npm run test:integration# claim + lottery paths against real DSQL
npm run typecheck       # tsc --noEmit
npm run lint
npx playwright install  # once, before E2E
npm run test:e2e        # claim → receipt → verify, sold-out, cross-tab consistency, lottery MATCH
```

---

## 4) Deploy to Vercel

1. Import the repo into Vercel (framework: Next.js). [`vercel.json`](vercel.json) pins the
   function region to `iad1` (≈ us-east-1) to colocate with the cluster.
2. Add **encrypted Project Environment Variables**: `AWS_REGION`, `DSQL_CLUSTER_ENDPOINT`,
   `ADMIN_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (and the `_SECONDARY` pair for
   multi-region). Pin `AWS_REGION` — Vercel otherwise drifts it to the execution region.
3. Deploy, then hit `/api/health` and run the full claim → receipt → verify flow.

The DB stack runs on the **Node.js runtime** (never Edge) and uses a module-scope singleton
pool drained via `attachDatabasePool` (`@vercel/functions`) for Fluid Compute.

---

## Project layout

```
app/                     # routes (App Router) — pages + app/api/** route handlers
src/
  db/                    # pool, query (+ failover), releases, allocations, lottery, retry
  domain/                # claim (the heart), draw (the lottery), rank, shards, lottery hashing
  components/            # shadcn/ui-based UI (intake, lottery, admin, v0 surfaces)
  env.ts                 # Zod-validated env (lazy)
db/migrations/           # 0001_init, 0002_indexes, 0003_lottery, 0004_lottery_indexes
scripts/                 # migrate · seed · stress (fcfs + lottery) · provision/*
tests/                   # unit · integration (real DSQL) · e2e (Playwright)
```

---

## Definition of Done

- [x] Connects to Aurora DSQL via the official node-postgres connector with **IAM auth only**.
- [x] Migrations apply cleanly with ASYNC indexes; no FK/sequence/trigger/extension usage.
- [x] Claim is idempotent, shards the counter, retries on `40001`/`OC000` with capped backoff.
- [x] `npm run stress` (3000 vs 200 / 32 shards): oversells 0, allocations 200, ranks
      1..200 — **green against a live cluster**.
- [x] Mode B lottery: 3,000 entries → 200 distinct winners → **byte-for-byte browser
      re-derivation (MATCH)** → repeat draw no-op.
- [x] Receipt shows a verifiable rank; `/verify` renders the immutable ordered ledger + draw proof.
- [x] Unit + integration + Playwright suites green against the live cluster.
- [ ] Deployed on Vercel; admin dashboard shows the guarantee live.
