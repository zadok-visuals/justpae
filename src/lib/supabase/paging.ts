/**
 * Reading more than Supabase will hand over in one response.
 *
 * PostgREST caps a response at `db.max_rows` — 1000 on this project — and it
 * does so SILENTLY: a table with 1,500 matching rows returns 1,000 and no
 * indication that it did. Every list in this app had a bare `.limit()` and no
 * next page, which for a list is an inconvenience. For a total it is a
 * different kind of bug: /admin/pnl summed a `.limit(100)` query and printed
 * the result as the margin, so past 100 orders the operator was shown a number
 * that was simply wrong, with nothing saying so.
 *
 * So this pages with `.range` until a short page comes back.
 *
 * WHY THERE IS STILL A CAP. `maxRows` is not the bug this fixes coming back —
 * it is the admission that a single page cannot hold an unbounded table, and
 * at some point the honest answer is "this needs a date filter", not an
 * out-of-memory server component. The difference from before is `truncated`:
 * when the cap is hit the caller is TOLD, and every screen using this says so
 * on the page rather than quietly reporting a partial total as a complete one.
 */
export const SUPABASE_MAX_ROWS = 1000;

/** Default ceiling for a totals query. 50 full pages. */
export const DEFAULT_MAX_ROWS = 50_000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  /**
   * Builds one page. Called with an inclusive range, exactly as `.range()`
   * takes it — a factory rather than a query object because a Supabase builder
   * is single-use and cannot be re-ranged.
   *
   * The query MUST carry a stable `.order(...)`; without one, Postgres is free
   * to return rows in a different order per page and the pages will both skip
   * and duplicate rows.
   */
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<{ rows: T[]; truncated: boolean; error: string | null }> {
  const pageSize = Math.min(options.pageSize ?? SUPABASE_MAX_ROWS, SUPABASE_MAX_ROWS);
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const { data, error } = await page(from, to);

    if (error) return { rows, truncated: true, error: error.message };
    if (!data || data.length === 0) break;

    rows.push(...data);

    // A short page is the end of the result set. Checking this rather than
    // comparing against a separately-fetched count keeps it to one round trip
    // per page and cannot disagree with itself if a row is inserted midway.
    if (data.length < to - from + 1) {
      return { rows, truncated: false, error: null };
    }
  }

  return { rows, truncated: rows.length >= maxRows, error: null };
}
