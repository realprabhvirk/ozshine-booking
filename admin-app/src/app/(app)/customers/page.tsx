import { LegacyFrame } from "@/components/legacy-frame";
import { CustomerLookup } from "./customer-lookup";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  return (
    <LegacyFrame>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Customers</h1>
      <p className="mb-6 text-sm text-muted">Search by name, phone, or rego to pull up a customer&apos;s history.</p>
      {/* key: a new ?q= from global search starts a fresh lookup */}
      <CustomerLookup key={q} initialQuery={q} />
    </LegacyFrame>
  );
}
