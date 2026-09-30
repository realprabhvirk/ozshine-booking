import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Personal pages (booking links, receipts, accounts) are never indexed.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/manage/", "/r/", "/account", "/styleguide"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
