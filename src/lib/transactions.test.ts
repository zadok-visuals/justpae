import { test } from "node:test";
import assert from "node:assert/strict";
import { paginateMergedActivity } from "./transactions.ts";
import type { UnifiedActivity } from "./transactions.ts";

/**
 * The activity merge.
 *
 * Deposits, transactions and bill payments live in three tables and are
 * interleaved at read time. This is the part of that least obviously correct —
 * two slicing modes, one extra probe row, and an ordering that has to hold
 * ACROSS sources rather than within one — and getting it wrong shows somebody
 * their own money in the wrong order or quietly drops a row off a page
 * boundary, which nobody reports as a bug because it is invisible.
 */

function row(source: UnifiedActivity["source"], id: string, createdAt: string): UnifiedActivity {
  // Only the three fields the merge actually reads. The rest of the shape is
  // irrelevant to ordering and asserting on it would just make the test
  // brittle against an unrelated column.
  return { source, id, created_at: createdAt } as UnifiedActivity;
}

test("rows from every source interleave by time, newest first", () => {
  const page = paginateMergedActivity(
    [
      [row("transaction", "t1", "2026-10-03T10:00:00Z"), row("transaction", "t2", "2026-10-01T10:00:00Z")],
      [row("deposit", "d1", "2026-10-04T10:00:00Z"), row("deposit", "d2", "2026-10-02T10:00:00Z")],
      [row("bill", "b1", "2026-10-05T10:00:00Z")],
    ],
    { page: 0, pageSize: 10, single: false },
  );

  assert.deepEqual(
    page.rows.map((r) => r.id),
    ["b1", "d1", "t1", "d2", "t2"],
  );
  assert.equal(page.hasMore, false);
});

test("an empty result is an empty page, not a crash", () => {
  const page = paginateMergedActivity([[], [], []], { page: 0, pageSize: 20, single: false });
  assert.deepEqual(page.rows, []);
  assert.equal(page.hasMore, false);
});

test("hasMore is true only when a row exists beyond this page", () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    row("transaction", `t${i}`, `2026-10-0${i + 1}T10:00:00Z`),
  );

  // Exactly a full page with nothing after it.
  const exact = paginateMergedActivity([rows], { page: 0, pageSize: 5, single: true });
  assert.equal(exact.rows.length, 5);
  assert.equal(exact.hasMore, false, "a full page is not evidence of another one");

  // One more than the page: the probe row.
  const probed = paginateMergedActivity([rows], { page: 0, pageSize: 4, single: true });
  assert.equal(probed.rows.length, 4);
  assert.equal(probed.hasMore, true);
});

test("the probe row is never shown to the user", () => {
  const rows = Array.from({ length: 21 }, (_, i) =>
    row("deposit", `d${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()),
  );
  const page = paginateMergedActivity([rows], { page: 0, pageSize: 20, single: true });

  assert.equal(page.rows.length, 20, "the extra row answers hasMore, it is not page content");
  assert.equal(page.hasMore, true);
});

test("SINGLE-SOURCE mode does not re-apply an offset the database already applied", () => {
  // The query used range(page * pageSize, …), so what arrived IS page 2. Slicing
  // from page * pageSize again would skip into nothing and show an empty page
  // to a user who has rows.
  const arrived = [
    row("transaction", "t40", "2026-10-03T10:00:00Z"),
    row("transaction", "t41", "2026-10-02T10:00:00Z"),
  ];

  const page = paginateMergedActivity([arrived], { page: 2, pageSize: 20, single: true });

  assert.deepEqual(page.rows.map((r) => r.id), ["t40", "t41"]);
  assert.equal(page.page, 2, "the page number is still reported back");
});

test("MULTI-SOURCE mode applies the offset here, because the database could not", () => {
  // Each table was asked for the first (page + 1) * pageSize + 1 rows from the
  // start, so the merged list begins at row 0 and this page has to be cut out
  // of it.
  const rows = Array.from({ length: 7 }, (_, i) =>
    row("transaction", `t${i}`, new Date(Date.UTC(2026, 9, 10 - i)).toISOString()),
  );

  const first = paginateMergedActivity([rows], { page: 0, pageSize: 3, single: false });
  const second = paginateMergedActivity([rows], { page: 1, pageSize: 3, single: false });
  const third = paginateMergedActivity([rows], { page: 2, pageSize: 3, single: false });

  assert.deepEqual(first.rows.map((r) => r.id), ["t0", "t1", "t2"]);
  assert.deepEqual(second.rows.map((r) => r.id), ["t3", "t4", "t5"]);
  assert.deepEqual(third.rows.map((r) => r.id), ["t6"]);

  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.equal(third.hasMore, false, "the last partial page has nothing after it");
});

test("no row is dropped or duplicated across consecutive pages", () => {
  // The failure this guards against is off-by-one at a page boundary, which is
  // invisible to the user — a missing transaction looks like a transaction that
  // never happened.
  const rows = Array.from({ length: 25 }, (_, i) =>
    row("transaction", `t${i}`, new Date(Date.UTC(2026, 9, 1, 0, 25 - i)).toISOString()),
  );

  const seen: string[] = [];
  for (let page = 0; page < 5; page++) {
    seen.push(
      ...paginateMergedActivity([rows], { page, pageSize: 6, single: false }).rows.map((r) => r.id),
    );
  }

  assert.equal(seen.length, 25);
  assert.equal(new Set(seen).size, 25, "a row appeared on two pages");
  assert.deepEqual(seen, rows.map((r) => r.id), "paging changed the order");
});

test("rows sharing a timestamp still all appear exactly once", () => {
  // A deposit and its conversion can be written in the same second. Sort
  // stability is not guaranteed to be meaningful here, but completeness is.
  const same = "2026-10-04T10:00:00Z";
  const page = paginateMergedActivity(
    [
      [row("transaction", "t1", same)],
      [row("deposit", "d1", same)],
      [row("bill", "b1", same)],
    ],
    { page: 0, pageSize: 10, single: false },
  );

  assert.equal(page.rows.length, 3);
  assert.deepEqual([...page.rows.map((r) => r.id)].sort(), ["b1", "d1", "t1"]);
});
