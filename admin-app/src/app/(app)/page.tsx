import { createClient } from "@/lib/supabase/server";
import { formatMoney, todayISODate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("location_id, name")
    .single();

  const locationId = staff?.location_id ?? "";
  const today = todayISODate();

  const [{ count: pendingCount }, { count: activeCount }, completedResult] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .eq("status", "pending"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .eq("status", "approved")
        .eq("requested_date", today),
      supabase
        .from("bookings")
        .select("amount_charged", { count: "exact" })
        .eq("location_id", locationId)
        .eq("status", "completed")
        .eq("requested_date", today),
    ]);

  const carsProcessedToday = completedResult.count ?? 0;
  const revenueToday = (completedResult.data ?? []).reduce(
    (sum, row) => sum + (row.amount_charged ?? 0),
    0
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        {greeting()}, {staff?.name?.split(" ")[0] ?? "there"}
      </h1>
      <p className="mb-6 text-sm text-muted">
        Here&apos;s how Beenleigh is looking today.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Cars processed today" value={String(carsProcessedToday)} />
        <KpiCard label="Revenue today" value={formatMoney(revenueToday)} />
        <KpiCard label="Pending in queue" value={String(pendingCount ?? 0)} highlight={(pendingCount ?? 0) > 0} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Approved, waiting today" value={String(activeCount ?? 0)} />
      </div>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm shadow-black/[0.03] ${
        highlight ? "border-brand bg-brand/5" : "border-border bg-surface"
      }`}
    >
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
