import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { FOCUS_RING } from "./tone";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "light";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  // Glossy brand red, the site's signature call to action.
  primary: "oz-gloss bg-accent text-accent-fg hover:bg-accent-hover shadow-lg shadow-accent/30",
  secondary: "bg-raised text-fg ring-1 ring-inset ring-line hover:bg-sunken hover:ring-line-strong",
  outline: "text-fg ring-1 ring-inset ring-line-strong hover:bg-raised",
  // White button for dark sections.
  light: "bg-white text-[#0f1013] hover:bg-white/90 shadow-card",
  ghost: "text-fg-muted hover:bg-raised hover:text-fg",
  danger: "bg-bad text-white hover:brightness-110 shadow-card",
  success: "bg-ok text-white hover:brightness-110 shadow-card",
};

// Pill buttons, as on the OzShine site. md is 48px tall for thumbs.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-sm gap-1.5 rounded-full",
  md: "h-12 px-6 text-[15px] gap-2 rounded-full",
  lg: "h-14 px-8 text-base gap-2.5 rounded-full",
  icon: "h-12 w-12 rounded-full",
  "icon-sm": "h-10 w-10 rounded-full",
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
