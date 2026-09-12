import { siteUrl } from "@repo/brand";
import type { MetadataRoute } from "next";

/**
 * THE SITEMAP.
 *
 * Only pages that are meant to be FOUND. `/signin` and `/dashboard` both carry `robots: noindex` in
 * their own metadata, and listing a noindexed URL here is a contradiction a crawler resolves by
 * distrusting the file: a sitemap is an assertion that a URL is canonical and worth indexing, so it
 * must agree with the page's own directive. They are absent for that reason, not by oversight.
 *
 * `siteUrl()` resolves the base rather than a literal, for the reason `layout.tsx` records -- a
 * preview deployment must advertise itself and not production. A sitemap generated on a preview
 * therefore describes the preview, which is correct: nothing should ever submit one to a search
 * engine from a branch build.
 *
 * `lastModified` is the build time. It is honest at the granularity anyone uses it: this is a
 * static export, so every page genuinely was generated at this moment. Faking per-page dates from
 * git history would be more precise and no more true, since a shared component changing alters a
 * page its own file's history does not mention.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl(process.env).replace(/\/$/, "");
  const lastModified = new Date();

  // priority is deliberately coarse. Google has said for years that it ignores the field; it is
  // kept only because other crawlers read it, and a page of invented decimals would imply a
  // precision nobody has.
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/integrations`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/connectors/shopify`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/fields/google-ads`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/docs`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    // Rarely read and rarely changed, but a policy nobody can find is a policy that does not
    // satisfy the obligation to publish one.
    { url: `${base}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
