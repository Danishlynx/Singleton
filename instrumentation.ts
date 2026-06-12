/**
 * Next.js instrumentation: runs once when the server boots. Warms the DSQL pool
 * (TLS handshake + IAM token + first connection ≈ seconds) so the FIRST visitor
 * doesn't pay the cold-start that would otherwise hit a demo's opening click.
 * Fire-and-forget: a missing env/db at boot must never crash the server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { query } = await import("@/db/query");
    void query("SELECT 1", [], { failover: false }).catch(() => undefined);
  } catch {
    /* env not configured (e.g. CI build) — skip warmup */
  }
}
