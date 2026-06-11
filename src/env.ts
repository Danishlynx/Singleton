import { z } from "zod";

/**
 * Server-side environment validation (Zod).
 *
 * Validation is LAZY + memoized: it runs on first access (runtime "startup"
 * per request/invocation), NOT at module import. This keeps `next build` from
 * throwing on a machine that has no DSQL credentials yet, while still failing
 * fast the first time the app actually needs the database.
 *
 * AWS credentials are intentionally OPTIONAL here: the official DSQL connector
 * resolves them via the standard AWS SDK credential chain, which accepts either
 * AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars (Vercel) OR a configured
 * shared profile / SSO / instance role (local `aws configure`). Requiring the
 * env keys would wrongly fail when credentials come from a profile.
 */
const EnvSchema = z.object({
  // --- Aurora DSQL (primary) — required to talk to the database ---
  AWS_REGION: z.string().min(1, "AWS_REGION is required (e.g. us-east-1)"),
  DSQL_CLUSTER_ENDPOINT: z
    .string()
    .min(1, "DSQL_CLUSTER_ENDPOINT is required (<id>.dsql.<region>.on.aws)"),
  CLUSTER_USER: z.string().min(1).default("admin"),

  // --- Admin gate ---
  ADMIN_TOKEN: z.string().min(1, "ADMIN_TOKEN is required to gate /admin and admin APIs"),

  // --- AWS credentials (optional; SDK chain may supply them via a profile) ---
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  // --- Multi-region (optional; Phase 9) ---
  DSQL_CLUSTER_ENDPOINT_SECONDARY: z.string().min(1).optional(),
  AWS_REGION_SECONDARY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parse + validate process.env once, memoized. Throws a readable error if invalid. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n` +
        `Copy .env.example to .env.local and fill in the values (see README → Provisioning).`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** True when a peered second-region endpoint is configured (enables failover). */
export function hasSecondaryRegion(): boolean {
  const e = getEnv();
  return Boolean(e.DSQL_CLUSTER_ENDPOINT_SECONDARY && e.AWS_REGION_SECONDARY);
}
