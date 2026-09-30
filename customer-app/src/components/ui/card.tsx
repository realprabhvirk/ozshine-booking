import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/core/cn";

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return <section className={cn("rounded-3xl bg-panel ring-1 ring-line shadow-card", className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-4 border-b border-line px-6 py-5", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("px-6 py-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentProps<"footer">) {
  return <footer className={cn("flex items-center justify-end gap-2 border-t border-line px-6 py-4", className)} {...rest} />;
}

// A KPI tile: label, big number, optional trend / footnote.
export function Stat({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between text-sm font-medium text-fg-muted">
        <span>{label}</span>
        {icon && <span className="text-fg-faint">{icon}</span>}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-fg tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-sm text-fg-muted">{sub}</div>}
    </Card>
  );
}
