import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffProvider } from "@/components/staff-context";
import { ShopProvider, type ShopStaff } from "@/components/shop-context";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AutoRunner } from "@/components/shell/auto-runner";
import { BookingActionsProvider } from "@/components/booking/action-host";
import { BookingPanelHost } from "@/components/booking/booking-panel";
import { fetchCatalogue } from "@/lib/shop/queries";
import type { Staff } from "@/lib/supabase/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already redirects signed-out visitors; check again here.
  if (!user) redirect("/login");

  const { data: staff } = await supabase.from("staff").select("*").eq("auth_user_id", user.id).maybeSingle();

  // A login with no (active) staff row isn't staff.
  if (!staff || staff.active === false) {
    await supabase.auth.signOut();
    redirect("/login?error=not-staff");
  }

  const catalogue = await fetchCatalogue(supabase);
  // Server components render once per request, so this is "when the page was
  // rendered": client components start their clocks from it (see useNow).
  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now();
  const shopStaff: ShopStaff = { id: staff.id, name: staff.name, role: staff.role, location_id: staff.location_id };

  return (
    <StaffProvider staff={staff as Staff}>
      <ShopProvider staff={shopStaff} catalogue={catalogue} serverNow={serverNow}>
        <BookingActionsProvider>
          <div className="flex h-dvh bg-canvas text-fg print:block print:h-auto print:bg-white">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col print:block">
              <Topbar />
              <main className="@container flex-1 overflow-y-auto px-4 pt-5 pb-24 md:pb-8 lg:px-6 print:overflow-visible print:p-0">
                {children}
              </main>
            </div>
          </div>
          <AutoRunner />
          <Suspense>
            <BookingPanelHost />
          </Suspense>
        </BookingActionsProvider>
      </ShopProvider>
    </StaffProvider>
  );
}
