import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffProvider } from "@/components/staff-context";
import { Nav } from "@/components/nav";
import type { Staff } from "@/lib/supabase/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests, but Server
  // Components can't trust that alone — check again here.
  if (!user) {
    redirect("/login");
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  // A valid Supabase Auth login with no matching staff row isn't staff —
  // reject per the brief, don't let them see the app.
  if (!staff) {
    await supabase.auth.signOut();
    redirect("/login?error=not-staff");
  }

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <StaffProvider staff={staff as Staff}>
        <Nav />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </div>
      </StaffProvider>
    </div>
  );
}
