import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { FOCUS_RING } from "./tone";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-card",
  secondary: "bg-raised text-fg ring-1 ring-inset ring-line hover:bg-sunken hover:ring-line-strong",
  outline: "text-fg ring-1 ring-inset ring-line-strong hover:bg-raised",
  ghost: "text-fg-muted hover:bg-raised hover:text-fg",
  danger: "bg-bad text-white hover:brightness-110 shadow-card",
  success: "bg-ok text-white hover:brightness-110 shadow-card",
};

// Touch-first: md is 48px tall, the minimum target on the shop tablet.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-10 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-12 px-4 text-[15px] gap-2 rounded-xl",
  lg: "h-14 px-6 text-base gap-2.5 rounded-xl",
  icon: "h-12 w-12 rounded-xl",
  "icon-sm": "h-10 w-10 rounded-lg",
};

export function buttonClasses(opts: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  const { variant = "secondary", size = "md", block, className } = opts;
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-45",
    FOCUS_RING,
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  children?: ReactNode;
};

export function Button({
  variant,
  size,
  block,
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Common & ComponentProps<"button"> & { loading?: boolean }) {
  const iconSize = size === "lg" ? 20 : 18;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={iconSize} aria-hidden />
      )}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden />}
    </button>
  );
}

export function LinkButton({
  variant,
  size,
  block,
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  const iconSize = size === "lg" ? 20 : 18;
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
      {Icon && <Icon size={iconSize} aria-hidden />}
      {children}
      {IconRight && <IconRight size={iconSize} aria-hidden />}
    </Link>
  );
}
