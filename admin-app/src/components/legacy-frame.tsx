import type { ReactNode } from "react";

// V1 screens that haven't been rebuilt yet keep their original light styling
// inside the new layout. Removed once Customers / History / Invoices are
// rebuilt (Phases 4–5).
export function LegacyFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl rounded-2xl bg-background p-4 text-foreground ring-1 ring-line lg:p-8 print:max-w-none print:rounded-none print:p-0 print:ring-0">
      {children}
    </div>
  );
}
