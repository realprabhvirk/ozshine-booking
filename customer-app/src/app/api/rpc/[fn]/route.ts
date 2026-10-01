import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The booking pages call the database through this route (same site) instead
// of straight from the customer's browser. Some phones/networks can load the
// site fine but can't reliably reach the database host directly, which showed
// up as "Can't reach the server" when picking a time. Only the public booking
// functions are allowed, and the signed-in customer's own token is passed
// through, so the database applies exactly the same rules as before.
const ALLOWED = new Set([
  "get_available_slots",
  "validate_promo",
  "create_public_booking",
  "cancel_booking_by_token",
  "reschedule_booking_by_token",
  "submit_feedback_by_token",
  "join_waitlist",
]);

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/rpc/[fn]">) {
  const { fn } = await ctx.params;
  if (!ALLOWED.has(fn)) return NextResponse.json({ error: { message: "NOT_FOUND" } }, { status: 404 });

  let args: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) args = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { message: "INVALID_INPUT" } }, { status: 400 });
  }

  const auth = request.headers.get("authorization");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: auth?.startsWith("Bearer ") ? { headers: { Authorization: auth } } : undefined,
  });
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return NextResponse.json({ error: { message: error.message, details: error.details, code: error.code } });
  return NextResponse.json({ data });
}
