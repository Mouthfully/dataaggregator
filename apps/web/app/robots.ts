import { siteUrl } from "@repo/brand";
import type { MetadataRoute } from "next";

/**
 * robots.txt.
 *
 * The two disallowed paths are the two that carry `robots: noindex` in their own metadata, and
 * saying it in both places is deliberate rather than redundant: the meta tag stops a page that has
 * been CRAWLED from being indexed, and this stops it being crawled. Neither implies the other.
 *
 * NOTE THE ORDER OF OPERATIONS, because it is the usual way this pair goes wrong. A path that is
 * Disallow-ed here can still appear in results as a bare URL, since the crawler never fetches the
 * page and so never sees the noindex telling it to stay out. Both pages are linked from the header,
 * so that is a real possibility rather than a theoretical one -- and it is why the meta directive
 * is the primary control and this file is the bandwidth saving.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl(process.env).replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/signin", "/dashboard"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
