import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import logo from "@/assets/oz-shine-logo.png";
import { createClient } from "@/lib/supabase/server";
import { formatCents, toCents } from "@/lib/core/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/core/status";
import { formatDate, formatDateTime, shopDateOf } from "@/lib/core/time";
import { UUID_RE, type Receipt } from "@/lib/public";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipt", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();
  const supabase = createClient();
  const { data } = await supabase.rpc("get_receipt_by_token", { p_token: token });
  const r = data as Receipt | null;
  if (!r) notFound();
  const isTax = !!r.business.abn;
  const balance = toCents(r.balance_due);
  const title = r.status === "void" ? "Invoice (void)" : isTax ? (balance > 0 ? "Tax invoice" : "Tax invoice / receipt") : balance > 0 ? "Invoice" : "Receipt";

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <PrintButton />
        </div>
        <article className="rounded-3xl bg-white p-6 text-[#0f1013] shadow-card ring-1 ring-line sm:p-8 print:rounded-none print:shadow-none print:ring-0">
          <header className="flex items-start justify-between gap-4">
            <div>
              <Image src={logo} alt="OzShine" className="h-9 w-auto" />
              <p className="mt-3 text-sm text-[#555a63]">
                {r.business.name}
                {r.business.address && <><br />{r.business.address}</>}
                {r.business.phone && <><br />{r.business.phone}</>}
                {r.business.abn && <><br />ABN {r.business.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4")}</>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold">{title}</p>
              <p className="font-mono text-sm">{r.number}</p>
              {r.issued_at && <p className="text-sm text-[#555a63]">{formatDate(shopDateOf(r.issued_at), "medium")}</p>}
            </div>
          </header>

          {(r.customer_first_name || r.rego) && (
            <p className="mt-6 text-sm text-[#555a63]">
              {r.customer_first_name && <>For {r.customer_first_name}</>}
              {r.rego && <> · {r.rego}</>}
            </p>
          )}

          <table className="mt-4 w-full text-[15px]">
            <thead>
              <tr className="border-b border-[#e4e4e8] text-left text-xs tracking-wide text-[#8a8f99] uppercase">
                <th className="py-2 font-semibold">Item</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((it, i) => (
                <tr key={i} className="border-b border-[#f0f0f2]">
                  <td className="py-2.5 pr-3">
                    {it.description}
                    {Number(it.quantity) !== 1 && <span className="text-[#8a8f99]"> × {Number(it.quantity)}</span>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatCents(toCents(it.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 ml-auto w-full max-w-64 space-y-1 text-[15px]">
            {toCents(r.discount_total) > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#555a63]">Discounts</dt>
                <dd className="tabular-nums">−{formatCents(toCents(r.discount_total))}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(toCents(r.total))}</dd>
            </div>
            <div className="flex justify-between text-sm text-[#555a63]">
              <dt>Includes GST</dt>
              <dd className="tabular-nums">{formatCents(toCents(r.gst_amount))}</dd>
            </div>
            <div className="flex justify-between pt-2">
              <dt className="text-[#555a63]">Paid</dt>
              <dd className="tabular-nums">{formatCents(toCents(r.amount_paid))}</dd>
            </div>
            <div className={balance > 0 ? "flex justify-between font-bold text-[#b91c1c]" : "flex justify-between font-semibold text-[#15803d]"}>
              <dt>{balance > 0 ? "To pay" : "Paid in full"}</dt>
              <dd className="tabular-nums">{balance > 0 ? formatCents(balance) : "✓"}</dd>
            </div>
          </dl>

          {r.payments.length > 0 && (
            <ul className="mt-6 space-y-1 border-t border-[#e4e4e8] pt-4 text-sm text-[#555a63]">
              {r.payments.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {toCents(p.amount) < 0 ? "Refund" : PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method} · {formatDateTime(p.received_at)}
                  </span>
                  <span className="tabular-nums">{formatCents(toCents(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          {balance > 0 && r.status !== "void" && <p className="mt-6 rounded-xl bg-[#f6f6f7] p-3 text-sm">Pay at the shop by card or cash, or give us a call{r.business.phone ? ` on ${r.business.phone}` : ""}.</p>}
          {r.business.footer && <p className="mt-6 text-center text-sm text-[#555a63]">{r.business.footer}</p>}
        </article>
      </div>
    </main>
  );
}
