import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * robots.txt.
 *
 * WHAT THIS IS NOT: access control. Everything disallowed below is already
 * gated — /admin by role plus a second factor, /api by signature or a bearer
 * secret, /dev by notFound() outside development. A Disallow line keeps a
 * well-behaved crawler from indexing a URL; it does not stop anybody reading
 * one, and listing a secret path here would advertise it.
 *
 * What it does buy: the signed-in parts of the app never appear in search
 * results as a row of "Sign in · justpae" pages, and the admin surface is not
 * enumerated by a crawler for anyone who later searches for it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api",
          "/dev",
          // Everything behind sign-in. None of it renders anything useful to a
          // crawler — it redirects to /login — so indexing it produces a page
          // of duplicate sign-in results.
          "/home",
          "/convert",
          "/deposit",
          "/withdraw",
          "/transactions",
          "/profile",
          "/receive",
          "/support",
          "/bills",
          "/onboarding",
          "/auth",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
