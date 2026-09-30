import type { ComponentProps, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/core/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-raised text-fg-faint ring-1 ring-line">
          <Icon size={26} aria-hidden />
        </div>
      )}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, ...rest }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-raised", className)} {...rest} />;
}

export function Spinner({ size = 20, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-fg-muted", className)}>
      <Loader2 size={size} className="animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

// Inline error/warning/info box.
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-info/10 ring-info/30 text-info-ink",
    warn: "bg-warn/12 ring-warn/35 text-warn-ink",
    bad: "bg-bad/10 ring-bad/30 text-bad-ink",
    ok: "bg-ok/10 ring-ok/30 text-ok-ink",
  };
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("rounded-xl px-4 py-3 text-sm ring-1 ring-inset", tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title ? "mt-0.5" : null, "opacity-90")}>{children}</div>}
    </div>
  );
}

// Page title row used at the top of every screen.
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
