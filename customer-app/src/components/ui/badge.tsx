import type { ReactNode } from "react";
import { cn } from "@/lib/core/cn";
import {
  BOOKING_STATUS_META,
  INVOICE_STATUS_META,
  type BookingStatus,
  type InvoiceStatus,
  type Tone,
} from "@/lib/core/status";
import { TONE_SOFT, TONE_SOLID } from "./tone";

export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset",
        TONE_SOFT[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", TONE_SOLID[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const meta = BOOKING_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export function InvoiceBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const meta = INVOICE_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
