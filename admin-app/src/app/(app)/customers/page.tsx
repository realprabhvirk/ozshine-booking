import { CustomerLookup } from "./customer-lookup";

export default function CustomersPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Customers</h1>
      <p className="mb-6 text-sm text-muted">
        Search by name, phone, or rego to pull up a customer&apos;s history.
      </p>
      <CustomerLookup />
    </div>
  );
}
