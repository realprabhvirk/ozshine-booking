import { HistoryTable } from "./history-table";

export default function HistoryPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        Order History
      </h1>
      <p className="mb-6 text-sm text-muted">
        Every past booking, filterable by date, name, or rego. Completed
        bookings link through to their invoice for reprinting.
      </p>
      <HistoryTable />
    </div>
  );
}
