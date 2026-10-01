import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // /sb/* → the Supabase project, so the browser only ever talks to this
  // site's own address (see src/lib/supabase/relay.ts).
  async rewrites() {
    return supabaseUrl ? [{ source: "/sb/:path*", destination: `${supabaseUrl}/:path*` }] : [];
  },
};

export default nextConfig;
