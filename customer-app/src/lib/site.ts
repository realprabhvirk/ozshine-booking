// The public address of this site, for canonical links, the sitemap and
// social previews. NEXT_PUBLIC_SITE_URL is optional (set it once a custom
// domain is live); otherwise Vercel's production URL is used.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

// The staff app's address. After a customer books, cancels or moves a
// booking, the site pings its instant-send endpoint so the confirmation goes
// out straight away in Live mode (it's a no-op in Demo mode). Optional:
// NEXT_PUBLIC_ADMIN_APP_URL overrides the default.
const DEFAULT_ADMIN_APP_URL = "https://ozshine-admin.vercel.app";
export function adminAppUrl(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_APP_URL?.trim() || DEFAULT_ADMIN_APP_URL).replace(/\/+$/, "");
}

// Fire-and-forget; never blocks or fails the customer's action. A no-cors
// POST without a body needs no CORS setup on the staff app.
export function kickOutbox() {
  if (typeof window === "undefined") return;
  try {
    fetch(`${adminAppUrl()}/api/messages/flush`, { method: "POST", mode: "no-cors", keepalive: true }).catch(() => {});
  } catch {}
}
