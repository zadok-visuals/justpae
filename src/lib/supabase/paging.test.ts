import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPABASE_MAX_ROWS, fetchAllRows } from "./paging.ts";

/**
 * Paging past PostgREST's silent 1000-row cap.
 *
 * The bug this replaces reported a partial total as a complete one. So the
 * thing worth testing hardest is not that it fetches pages — it is that
 * `truncated` tells the truth, in both directions. A false `truncated: false`
 * puts the old bug straight back.
 */

/** A fake table: hands back whatever slice is asked for, counting the calls. */
function tableOf(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  const ranges: Array<[number, number]> = [];

  return {
    ranges,
    page: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
}

test("a result smaller than one page is one request", async () => {
  const table = tableOf(12);
  const result = await fetchAllRows(table.page, { pageSize: 100 });

  assert.equal(result.rows.length, 12);
  assert.equal(result.truncated, false);
  assert.equal(result.error, null);
  assert.equal(table.ranges.length, 1, "a short page ends it — no speculative second request");
});

test("a result spanning several pages comes back whole and in order", async () => {
  const table = tableOf(250);
  const result = await fetchAllRows<{ id: number }>(table.page, { pageSize: 100 });

  assert.equal(result.rows.length, 250);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.rows.map((r) => r.id).slice(0, 3),
    [0, 1, 2],
  );
  assert.equal(result.rows[249].id, 249);
  assert.deepEqual(table.ranges, [
    [0, 99],
    [100, 199],
    [200, 299],
  ]);
});

test("ranges are inclusive, as .range() is", async () => {
  const table = tableOf(5);
  await fetchAllRows(table.page, { pageSize: 10 });
  assert.deepEqual(table.ranges, [[0, 9]], "a page of 10 is range(0, 9), not range(0, 10)");
});

test("an exactly-full final page still terminates", async () => {
  // 200 rows at a page size of 100: the second page is full, so the loop cannot
  // tell it is the end without asking once more. It must ask, get nothing, and
  // report truncated: false rather than guessing either way.
  const table = tableOf(200);
  const result = await fetchAllRows(table.page, { pageSize: 100 });

  assert.equal(result.rows.length, 200);
  assert.equal(result.truncated, false, "an empty page is the end, not a truncation");
  assert.equal(table.ranges.length, 3);
});

test("THE POINT: hitting the ceiling reports truncated, it does not pretend", async () => {
  const table = tableOf(10_000);
  const result = await fetchAllRows(table.page, { pageSize: 100, maxRows: 300 });

  assert.equal(result.rows.length, 300);
  assert.equal(result.truncated, true, "a partial total must never be reported as complete");
});

test("a maxRows that is not a multiple of the page size is still respected", async () => {
  const table = tableOf(10_000);
  const result = await fetchAllRows(table.page, { pageSize: 100, maxRows: 250 });

  assert.equal(result.rows.length, 250, "the ceiling is a row count, not a page count");
  assert.equal(result.truncated, true);
});

test("an error stops the walk and is reported as truncated", async () => {
  // Returning what was read so far with truncated: false would be the old bug
  // wearing a new hat.
  let call = 0;
  const result = await fetchAllRows<{ id: number }>(
    async (from, to) => {
      if (call++ === 1) return { data: null, error: { message: "connection lost" } };
      return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null };
    },
    { pageSize: 100 },
  );

  assert.equal(result.rows.length, 100, "what was read is kept");
  assert.equal(result.truncated, true);
  assert.equal(result.error, "connection lost");
});

test("the page size is capped at PostgREST's own limit", async () => {
  // Asking for 5,000 does not get 5,000 — the server would silently give 1,000
  // and the short-page check would then read that as the end of the table.
  const table = tableOf(10);
  await fetchAllRows(table.page, { pageSize: 5000 });

  assert.equal(table.ranges[0][1], SUPABASE_MAX_ROWS - 1);
});

test("an empty table is an empty result, not a truncated one", async () => {
  const table = tableOf(0);
  const result = await fetchAllRows(table.page, { pageSize: 100 });

  assert.deepEqual(result.rows, []);
  assert.equal(result.truncated, false);
  assert.equal(result.error, null);
});
