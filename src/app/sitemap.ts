import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * The sitemap lists only what a signed-out visitor can actually read.
 *
 * Not /login, /signup or /forgot-password: those are steps in a flow, not
 * destinations, and a search result landing someone on a password-reset form
 * helps nobody. Not anything behind sign-in, which redirects.
 *
 * lastModified is the deploy time rather than a hardcoded date. A date that
 * never changes tells a crawler the page is stale and a made-up recent one
 * would be a lie — the build is genuinely the last time this content changed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();

  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
