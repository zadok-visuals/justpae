/**
 * The app's own public origin.
 *
 * Shared by the sitemap, robots.txt and the metadataBase that resolves every
 * Open Graph image URL. It reads APP_URL, the same variable the auth email
 * links and the /receive share link are built from — one wrong value should
 * break everything together and visibly, rather than leaving the sitemap
 * pointing at localhost while the emails are fine.
 *
 * The trailing slash is stripped because every caller appends a path, and
 * `https://justpae.com//sitemap.xml` is a different URL to a crawler.
 */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "https://justpae.com").replace(/\/$/, "");
}

/**
 * Whether analytics should load at all.
 *
 * Off unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set, with no default and no
 * fallback property — an analytics tag that ships enabled is a tracker nobody
 * decided to add.
 */
export function analyticsMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return id ? id : null;
}
