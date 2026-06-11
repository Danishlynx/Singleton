/**
 * OCC conflict detection + retry (no DB import — unit-testable).
 *
 * Aurora DSQL uses optimistic concurrency control (snapshot isolation, fixed at
 * REPEATABLE READ). A write/write conflict is detected at COMMIT and returned as
 * PostgreSQL serialization failure SQLSTATE 40001, with an Aurora message code:
 *   - OC000: data conflict  ("change conflicts with another transaction")
 *   - OC001: schema conflict ("schema has been updated by another transaction")
 * The app must catch these and retry the whole transaction.
 *
 * The official connector also exports isOCCError(); we keep our own detector so
 * the retry policy is explicit, dependency-free, and unit-testable.
 */

const OCC_MESSAGE_RE =
  /OC0\d{2}|conflicts with another transaction|schema has been updated by another transaction|could not serialize|serialization failure/i;

export function isOccConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "40001") return true;
  if (typeof e.message === "string" && OCC_MESSAGE_RE.test(e.message)) return true;
  return false;
}

export interface BackoffOptions {
  baseDelayMs?: number; // default 5
  maxDelayMs?: number; // default 250
  jitter?: boolean; // default true (full jitter)
  rng?: () => number; // injectable for tests
}

/**
 * Exponential backoff for a 1-based attempt number. With jitter (default) the
 * delay is uniform in [0, exp] ("full jitter"), which de-correlates retries from
 * a thundering herd. Without jitter it is the deterministic capped exponential.
 */
export function computeBackoffMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseDelayMs ?? 5;
  const max = opts.maxDelayMs ?? 250;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  if (opts.jitter === false) return exp;
  const rng = opts.rng ?? Math.random;
  return Math.floor(rng() * exp);
}

export interface RetryOptions extends BackoffOptions {
  maxAttempts?: number; // default 8
  onRetry?: (attempt: number, err: unknown) => void;
  sleep?: (ms: number) => Promise<void>; // injectable for tests
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` (receiving the 1-based attempt), retrying ONLY on OCC conflicts with
 * exponential backoff + jitter, capped at `maxAttempts` (default 8). Non-OCC
 * errors propagate immediately. On exhaustion the last OCC error is rethrown.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 8;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isOccConflict(err) || attempt === maxAttempts) throw err;
      opts.onRetry?.(attempt, err);
      const delay = computeBackoffMs(attempt, opts);
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastErr;
}
