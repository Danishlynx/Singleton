import { describe, it, expect } from "vitest";
import {
  splitSqlStatements,
  isAsyncIndexStatement,
  parseAsyncIndexName,
  waitForIndexValid,
  type RowRunner,
} from "@/db/migrate-helpers";

describe("splitSqlStatements", () => {
  it("strips -- comments and splits on ;", () => {
    const sql = `
      -- a comment
      CREATE TABLE foo (id uuid PRIMARY KEY); -- trailing comment
      CREATE TABLE bar (id uuid PRIMARY KEY);
    `;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("CREATE TABLE foo");
    expect(stmts[0]).not.toContain("--");
    expect(stmts[1]).toContain("CREATE TABLE bar");
  });

  it("ignores blank/comment-only segments", () => {
    expect(splitSqlStatements("-- only a comment\n\n;  ;")).toEqual([]);
  });
});

describe("isAsyncIndexStatement / parseAsyncIndexName", () => {
  it("detects and names a plain async index", () => {
    const s = "CREATE INDEX ASYNC IF NOT EXISTS idx_releases_provider ON releases (provider_id)";
    expect(isAsyncIndexStatement(s)).toBe(true);
    expect(parseAsyncIndexName(s)).toBe("idx_releases_provider");
  });

  it("detects and names a unique async index", () => {
    const s =
      "CREATE UNIQUE INDEX ASYNC uq_alloc_release_claimant ON allocations (release_id, claimant_id)";
    expect(isAsyncIndexStatement(s)).toBe(true);
    expect(parseAsyncIndexName(s)).toBe("uq_alloc_release_claimant");
  });

  it("returns false/null for non-async statements", () => {
    const s = "CREATE TABLE providers (id uuid PRIMARY KEY)";
    expect(isAsyncIndexStatement(s)).toBe(false);
    expect(parseAsyncIndexName(s)).toBeNull();
  });
});

describe("waitForIndexValid", () => {
  const noSleep = async () => {};

  it("returns once the index reports indisvalid = true", async () => {
    let calls = 0;
    const runner: RowRunner = async () => {
      calls++;
      return [{ indisvalid: calls >= 2 }];
    };
    await expect(
      waitForIndexValid(runner, "uq_alloc_idem", { sleep: noSleep, now: () => 0 }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it("throws after the timeout if the index never becomes valid", async () => {
    const runner: RowRunner = async () => [{ indisvalid: false }];
    let t = 0;
    const now = () => {
      const v = t;
      t += 60;
      return v;
    };
    await expect(
      waitForIndexValid(runner, "uq_alloc_idem", { sleep: noSleep, now, timeoutMs: 100 }),
    ).rejects.toThrow(/did not become valid/);
  });
});
