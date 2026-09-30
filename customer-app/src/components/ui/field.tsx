"use client";

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/core/cn";

// <Field> wires a label, hint and error to the control inside it (id,
// aria-describedby, aria-invalid) so every input is properly labelled.
type FieldCtx = { id: string; describedBy?: string; invalid: boolean; required?: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {optional && <span className="ml-1.5 font-normal text-fg-faint">(optional)</span>}
        </label>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-fg-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-bad-ink">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldProps(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: unknown; required?: boolean }) {
  const ctx = useContext(FieldContext);
  return {
    id: props.id ?? ctx?.id,
    "aria-describedby": props["aria-describedby"] ?? ctx?.describedBy,
    "aria-invalid": (props["aria-invalid"] as boolean | undefined) ?? (ctx?.invalid || undefined),
    required: props.required ?? ctx?.required,
  };
}

// 16px text on inputs stops iPhones zooming in when a field is focused.
export const CONTROL =
  "w-full rounded-2xl bg-panel px-4 text-base text-fg ring-1 ring-inset ring-line-strong placeholder:text-fg-faint " +
  "transition focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50 " +
  "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  const f = useFieldProps(rest);
  return <input {...rest} {...f} className={cn(CONTROL, "h-12", className)} />;
}

export function Textarea({ className, rows = 3, ...rest }: ComponentProps<"textarea">) {
  const f = useFieldProps(rest);
  return <textarea rows={rows} {...rest} {...f} className={cn(CONTROL, "py-3 leading-relaxed", className)} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  const f = useFieldProps(rest);
  return (
    <div className="relative">
      <select {...rest} {...f} className={cn(CONTROL, "h-12 appearance-none pr-10", className)}>
        {children}
      </select>
      <ChevronDown
        size={18}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-faint"
        aria-hidden
      />
    </div>
  );
}

// A big tappable on/off switch.
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] font-medium text-fg">
          {label}
        </label>
        {description && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-14 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-6",
          )}
        />
      </button>
    </div>
  );
}

// A row of big toggle buttons (vehicle type, payment method…).
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; hint?: ReactNode }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center rounded-xl px-3 py-2 text-[15px] font-semibold ring-1 ring-inset transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              on ? "bg-accent text-accent-fg ring-accent" : "bg-raised text-fg ring-line hover:ring-line-strong",
            )}
          >
            {o.label}
            {o.hint && <span className={cn("text-xs font-medium", on ? "text-white/80" : "text-fg-muted")}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
