import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LoginsClient, type StaffLogin } from "./logins-client";

export const metadata: Metadata = { title: "Logins — OzShine Staff" };

export default async function LoginsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("id, name, email, active, created_at").order("active", { ascending: false }).order("name");
  return <LoginsClient logins={(data ?? []) as StaffLogin[]} />;
}
