import { createClient } from "@/lib/supabase/server";
import { Hero } from "@/components/hero";
import { Services } from "@/components/services";
import { AccountGate } from "@/components/account-gate";
import { Footer } from "@/components/footer";
import type { Service } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true });

  const serviceList = (services as Service[]) ?? [];

  return (
    <main>
      <Hero />
      <Services services={serviceList} />
      <AccountGate services={serviceList} />
      <Footer />
    </main>
  );
}
