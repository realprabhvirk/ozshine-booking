// Browser → database calls go through this site's own address (/sb, see
// next.config.ts rewrites) instead of straight to <project>.supabase.co.
// Some networks/devices load the site fine but can't reach supabase.co, which
// showed up as "Can't reach the server" on login, the Floor and the booking
// page. The Supabase URL itself stays the same, so login cookies are shared
// with the server and live updates (websockets) still connect directly.
export function relayFetch(supabaseUrl: string): typeof fetch {
  const base = supabaseUrl.replace(/\/+$/, "");
  return (input, init) => {
    if (typeof window === "undefined") return fetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base + "/")) return fetch(input, init);
    const relayed = `${window.location.origin}/sb${url.slice(base.length)}`;
    if (typeof input === "string" || input instanceof URL) return fetch(relayed, init);
    return fetch(new Request(relayed, input), init);
  };
}
