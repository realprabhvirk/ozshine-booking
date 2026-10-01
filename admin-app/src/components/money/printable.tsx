// Printable A4 tax invoice and 80mm receipt. Fixed colours (not theme
// tokens) so they always print black on white.
import Image from "next/image";
import logo from "@/assets/oz-shine-logo.png";
import { formatCents, sumCents, toCents } from "@/lib/core/money";
import { formatPhone } from "@/lib/core/phone";
import { INVOICE_STATUS_META, PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { formatDate, formatDateTime, shopDateOf } from "@/lib/core/time";
import type { InvoiceDetail } from "@/lib/shop/money";
import type { ShopSettings } from "@/lib/shop/types";

function docTitle(s: ShopSettings | null) {
  // An ABN is required for a document to be a "tax invoice" in Australia.
  return s?.abn ? "Tax invoice" : "Invoice";
}

function customerName(inv: InvoiceDetail) {
  return !inv.customer || inv.customer.is_walkin_placeholder ? "Walk-in customer" : inv.customer.name;
}

function issuedDate(inv: InvoiceDetail) {
  return formatDate(shopDateOf(inv.issued_at ?? inv.created_at), "medium");
}

export function A4Invoice({ inv, s }: { inv: InvoiceDetail; s: ShopSettings | null }) {
  const lines = inv.items.filter((i) => i.kind !== "discount");
  const discounts = inv.items.filter((i) => i.kind === "discount");
  const discountTotal = -sumCents(discounts.map((d) => toCents(d.line_total)));
  const balance = toCents(inv.balance_due);
  const paid = inv.status === "paid";
  return (
    <article className="mx-auto my-8 max-w-[210mm] bg-white p-[14mm] text-[13px] leading-relaxed shadow-lg print:m-0 print:max-w-none print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-6">
        <div>
          <Image src={logo} alt="OzShine" priority className="h-12 w-auto" />
          <p className="mt-3 font-semibold">{s?.business_name ?? "OzShine Hand Car Wash"}</p>
          {s?.address && <p>{s.address}</p>}
          <p>
            {s?.phone}
            {s?.email && ` · ${s.email}`}
          </p>
          {s?.abn && <p>ABN {s.abn}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-3xl font-extrabold tracking-tight uppercase">{docTitle(s)}</h1>
          <p className="mt-2 font-mono text-lg font-bold">{inv.number}</p>
          <p>Date: {issuedDate(inv)}</p>
          {inv.booking && <p>Job: {inv.booking.reference_code}</p>}
          {inv.status === "void" ? (
            <p className="mt-3 inline-block border-2 border-[#c61b1f] px-3 py-1 text-lg font-extrabold text-[#c61b1f] uppercase">Void</p>
          ) : paid ? (
            <p className="mt-3 inline-block border-2 border-green-700 px-3 py-1 text-lg font-extrabold text-green-700 uppercase">Paid</p>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 py-6">
        <div>
          <p className="text-xs font-bold tracking-wider text-neutral-500 uppercase">Billed to</p>
          <p className="mt-1 font-semibold">{customerName(inv)}</p>
          {inv.customer && !inv.customer.is_walkin_placeholder && (
            <>
              {inv.customer.phone && <p>{formatPhone(inv.customer.phone)}</p>}
              {inv.customer.email && <p>{inv.customer.email}</p>}
            </>
          )}
        </div>
        {inv.booking && (
          <div>
            <p className="text-xs font-bold tracking-wider text-neutral-500 uppercase">Vehicle</p>
            <p className="mt-1 font-semibold">{inv.booking.vehicle?.rego ?? "—"}</p>
            <p>{[inv.booking.vehicle?.colour, inv.booking.vehicle?.make_model].filter(Boolean).join(" ") || VEHICLE_TYPE_LABELS[inv.booking.vehicle_type ?? "sedan"]}</p>
            {inv.booking.completed_at && <p>Serviced {formatDate(shopDateOf(inv.booking.completed_at), "medium")}</p>}
          </div>
        )}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left text-xs tracking-wider uppercase">
            <th className="py-2">Description</th>
            <th className="w-16 py-2 text-right">Qty</th>
            <th className="w-28 py-2 text-right">Price</th>
            <th className="w-28 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-neutral-200">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.quantity)}</td>
              <td className="py-2 text-right tabular-nums">{formatCents(toCents(l.unit_price))}</td>
              <td className="py-2 text-right tabular-nums">{formatCents(toCents(l.line_total))}</td>
            </tr>
          ))}
          {discounts.map((d) => (
            <tr key={d.id} className="border-b border-neutral-200">
              <td className="py-2" colSpan={3}>
                {d.description}
              </td>
              <td className="py-2 text-right tabular-nums">{formatCents(toCents(d.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-72 space-y-1">
        {discountTotal > 0 && (
          <>
            <Row label="Subtotal" value={formatCents(toCents(inv.subtotal))} />
            <Row label="Discounts" value={`−${formatCents(discountTotal)}`} />
          </>
        )}
        <Row label="Total (incl. GST)" value={formatCents(toCents(inv.total))} bold />
        <Row label="GST included" value={formatCents(toCents(inv.gst_amount))} />
        {inv.payments.map((p) => (
          <div key={p.id}>
            <Row
              label={`${toCents(p.amount) < 0 ? "Refund" : "Paid"} ${PAYMENT_METHOD_LABELS[p.method]} ${formatDate(shopDateOf(p.received_at), "medium")}`}
              value={formatCents(toCents(p.amount))}
            />
            {p.tendered != null && p.change_given != null && (
              <>
                <Row label="Cash received" value={formatCents(toCents(p.tendered))} />
                <Row label="Change given" value={formatCents(toCents(p.change_given))} />
              </>
            )}
          </div>
        ))}
        <div className="border-t-2 border-black pt-1">
          <Row label="Balance due" value={formatCents(balance)} bold />
        </div>
      </div>

      <footer className="mt-12 space-y-2 border-t border-neutral-300 pt-4 text-xs text-neutral-600">
        <p>Total price includes GST.</p>
        {s?.invoice_terms && <p className="whitespace-pre-line">{s.invoice_terms}</p>}
        <p className="whitespace-pre-line">{s?.invoice_footer || "Thanks for choosing OzShine!"}</p>
        <p>
          Status: {INVOICE_STATUS_META[inv.status].label}
          {inv.status === "void" && inv.void_reason && ` · ${inv.void_reason}`}
        </p>
      </footer>
    </article>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function ReceiptSlip({ inv, s }: { inv: InvoiceDetail; s: ShopSettings | null }) {
  const balance = toCents(inv.balance_due);
  return (
    <article className="mx-auto my-8 w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug shadow-lg print:m-0 print:w-auto print:p-0 print:shadow-none">
      <div className="text-center">
        <Image src={logo} alt="OzShine" className="mx-auto h-8 w-auto grayscale" />
        <p className="mt-2 font-bold">{s?.business_name ?? "OzShine Hand Car Wash"}</p>
        {s?.address && <p>{s.address}</p>}
        {s?.phone && <p>{s.phone}</p>}
        {s?.abn && <p>ABN {s.abn}</p>}
        <p className="mt-2 font-bold uppercase">{docTitle(s)}</p>
        <p>{inv.number}</p>
        <p>{inv.issued_at ? formatDateTime(inv.issued_at, "medium") : issuedDate(inv)}</p>
        {inv.status === "void" && <p className="font-bold">*** VOID ***</p>}
      </div>
      <Dash />
      <p>{customerName(inv)}</p>
      {inv.booking && (
        <p>
          {inv.booking.vehicle?.rego ?? ""} {inv.booking.reference_code}
        </p>
      )}
      <Dash />
      {inv.items.map((i) => (
        <div key={i.id}>
          <p>{i.description}</p>
          <p className="flex justify-between">
            <span>{i.kind !== "discount" && Number(i.quantity) !== 1 ? `  ${Number(i.quantity)} x ${formatCents(toCents(i.unit_price))}` : ""}</span>
            <span className="tabular-nums">{formatCents(toCents(i.line_total))}</span>
          </p>
        </div>
      ))}
      <Dash />
      <p className="flex justify-between text-[14px] font-bold">
        <span>TOTAL</span>
        <span>{formatCents(toCents(inv.total))}</span>
      </p>
      <p className="flex justify-between">
        <span>GST included</span>
        <span>{formatCents(toCents(inv.gst_amount))}</span>
      </p>
      {inv.payments.map((p) => (
        <div key={p.id}>
          <p className="flex justify-between">
            <span>{toCents(p.amount) < 0 ? "Refund" : PAYMENT_METHOD_LABELS[p.method]}</span>
            <span>{formatCents(toCents(p.amount))}</span>
          </p>
          {p.tendered != null && p.change_given != null && (
            <>
              <p className="flex justify-between pl-3">
                <span>Cash received</span>
                <span>{formatCents(toCents(p.tendered))}</span>
              </p>
              <p className="flex justify-between pl-3 font-bold">
                <span>CHANGE</span>
                <span>{formatCents(toCents(p.change_given))}</span>
              </p>
            </>
          )}
        </div>
      ))}
      <p className="flex justify-between font-bold">
        <span>{balance > 0 ? "OWING" : "BALANCE"}</span>
        <span>{formatCents(balance)}</span>
      </p>
      <Dash />
      <p className="text-center">{s?.invoice_footer || "Thanks for choosing OzShine!"}</p>
    </article>
  );
}

function Dash() {
  return <p className="my-2 overflow-hidden whitespace-nowrap text-neutral-500">{"-".repeat(48)}</p>;
}
