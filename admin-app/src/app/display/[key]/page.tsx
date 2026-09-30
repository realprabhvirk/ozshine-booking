import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { DisplayBoard, type Board } from "./board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "OzShine — Shop TV", robots: { index: false, follow: false } };

// The TV in the waiting area. No login: the unguessable key in the link is
// the only access, and the board only ever shows first names and part of
// each rego (see get_display_board in the SQL).
export default async function DisplayPage({ params }: PageProps<"/display/[key]">) {
  const { key } = await params;
  let board: Board | null = null;
  if (/^[a-f0-9]{16,64}$/.test(key)) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await supabase.rpc("get_display_board", { p_key: key });
    board = (data as Board | null) ?? null;
  }
  if (!board)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#07080a] p-8 text-center text-white">
        <div>
          <p className="text-3xl font-bold">This TV link isn&apos;t valid any more.</p>
          <p className="mt-3 text-lg text-white/60">Open Settings → Shop TV in the staff app for the current link.</p>
        </div>
      </main>
    );
  return <DisplayBoard displayKey={key} initial={board} />;
}
