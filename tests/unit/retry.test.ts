import { describe, it, expect } from "vitest";
import { isOccConflict, computeBackoffMs, withRetry } from "@/db/retry";

describe("isOccConflict", () => {
  it("detects SQLSTATE 40001", () => {
    expect(isOccConflict({ code: "40001" })).toBe(true);
  });
  it("detects OC000 / OC001 message codes", () => {
    expect(isOccConflict({ message: "change conflicts with another transaction (OC000)" })).toBe(
      true,
    );
    expect(
      isOccConflict({ message: "schema has been updated by another transaction (OC001)" }),
    ).toBe(true);
  });
  it("rejects unrelated errors", () => {
    expect(isOccConflict({ code: "23505" })).toBe(false); // unique violation
    expect(isOccConflict(new Error("connection refused"))).toBe(false);
    expect(isOccConflict(null)).toBe(false);
    expect(isOccConflict("nope")).toBe(false);
  });
});

describe("computeBackoffMs", () => {
  it("is a capped exponential without jitter", () => {
    const opts = { baseDelayMs: 5, maxDelayMs: 250, jitter: false };
    expect(computeBackoffMs(1, opts)).toBe(5);
    expect(computeBackoffMs(2, opts)).toBe(10);
    expect(computeBackoffMs(3, opts)).toBe(20);
    expect(computeBackoffMs(4, opts)).toBe(40);
    expect(computeBackoffMs(8, opts)).toBe(250); // capped
  });
  it("with full jitter stays within [0, exp]", () => {
    const rngs = [0, 0.5, 0.999];
    for (const r of rngs) {
      const d = computeBackoffMs(4, { baseDelayMs: 5, maxDelayMs: 250, rng: () => r });
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(40);
    }
  });
});

describe("withRetry", () => {
  const noSleep = async () => {};

  it("retries on OCC then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { code: "40001" };
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("propagates non-OCC errors immediately (no retry)", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("boom");
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  it("gives up after maxAttempts on persistent OCC", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { code: "40001" };
        },
        { maxAttempts: 4, sleep: noSleep },
      ),
    ).rejects.toMatchObject({ code: "40001" });
    expect(calls).toBe(4);
  });

  it("passes the 1-based attempt number to fn", async () => {
    const seen: number[] = [];
    await withRetry(
      async (attempt) => {
        seen.push(attempt);
        if (attempt < 3) throw { code: "40001" };
        return attempt;
      },
      { sleep: noSleep },
    );
    expect(seen).toEqual([1, 2, 3]);
  });
});
