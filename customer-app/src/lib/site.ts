// The public address of this site, for canonical links, the sitemap and
// social previews. NEXT_PUBLIC_SITE_URL is optional (set it once a custom
// domain is live); otherwise Vercel's production URL is used.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
