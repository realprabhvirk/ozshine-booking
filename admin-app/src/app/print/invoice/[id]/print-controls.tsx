"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

// Screen-only toolbar; opens the print dialog on arrival when auto is set.
export function PrintControls({ invoiceId, format, auto }: { invoiceId: string; format: "a4" | "receipt"; auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [auto]);

  const other = format === "a4" ? "receipt" : "a4";
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
      <Link href={`/invoices/${invoiceId}`} className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
        <ArrowLeft size={16} aria-hidden /> Back
      </Link>
      <div className="ml-auto flex gap-2">
        <Link href={`/print/invoice/${invoiceId}?format=${other}`} className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50">
          {other === "a4" ? "A4 invoice" : "80mm receipt"}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#c61b1f] px-5 text-sm font-semibold text-white hover:bg-[#a8161a]"
        >
          <Printer size={16} aria-hidden /> Print
        </button>
      </div>
    </div>
  );
}
