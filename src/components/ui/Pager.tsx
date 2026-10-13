import Link from "next/link";

/**
 * Previous / Next for a paged list.
 *
 * Links, not buttons, and the page number lives in the URL — so an admin
 * looking at page 4 of the ledger can send someone that URL, reload without
 * losing their place, and use the browser's own Back button to go back a page.
 * A client-side cursor in component state gives up all three.
 *
 * `hasNext` is passed in rather than derived from a count: the caller asked for
 * one row more than it displays, which answers "is there another page" in the
 * same round trip and without a second `count` query that can disagree with the
 * page it is describing.
 */
export function Pager({
  page,
  hasNext,
  basePath,
  params,
  className = "",
}: {
  /** 1-based. */
  page: number;
  hasNext: boolean;
  basePath: string;
  /** Other query parameters to carry across — a filter, a tab, a search term. */
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  if (page <= 1 && !hasNext) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    // Page 1 is the bare URL, so the first page has exactly one address rather
    // than two that render identically.
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <nav
      aria-label="Pagination"
      className={`flex items-center justify-between gap-3 ${className}`}
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-muted-foreground">Page {page}</span>

      {hasNext ? (
        <Link
          href={href(page + 1)}
          rel="next"
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/**
 * The `?page=` parameter, as a 1-based page number.
 *
 * Anything that isn't a positive integer is page 1 rather than an error: a
 * hand-edited URL should land somewhere sensible, not on a stack trace.
 */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  // A bound, because `.range()` on an enormous offset is a slow query an
  // unauthenticated-looking URL should not be able to ask for repeatedly.
  return Math.min(parsed, 10_000);
}

/**
 * The inclusive `.range()` bounds for a page, asking for ONE extra row so the
 * caller can tell whether a next page exists.
 */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize };
}
