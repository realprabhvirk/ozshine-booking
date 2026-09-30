"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { Button } from "./button";

// Built on the native <dialog>: focus trapping, Escape, inert background and
// screen-reader semantics come from the browser.
function useNativeDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  // false = Escape / clicking outside don't close it (e.g. while saving).
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
};

const WIDTHS = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

export function Dialog({ open, onClose, title, description, children, footer, dismissible = true, size = "md" }: Props) {
  const ref = useNativeDialog(open);
  const titleId = useId();
  const descId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "oz-dialog m-auto w-[calc(100%-2rem)] rounded-3xl bg-panel p-0 text-fg shadow-pop ring-1 ring-line open:animate-oz-in",
        WIDTHS[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <Button variant="ghost" size="icon-sm" icon={X} aria-label="Close" onClick={onClose} className="-mt-1 -mr-2" />
            )}
          </header>
          {children && <div className="overflow-y-auto px-6 py-2">{children}</div>}
          {footer && <footer className="mt-2 flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

// "Are you sure?" with a single decisive action.
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

// Panel that slides up from the bottom on phones and in from the right on
// bigger screens (booking details, sign-in, filters).
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  width = "md",
}: Omit<Props, "size"> & { width?: "md" | "lg" }) {
  const ref = useNativeDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "oz-dialog mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-panel p-0 text-fg shadow-pop ring-1 ring-line open:animate-oz-sheet-up",
        "sm:mt-0 sm:ml-auto sm:h-dvh sm:max-h-none sm:rounded-none sm:open:animate-oz-sheet",
        width === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
      )}
    >
      {open && (
        <div className="flex h-full max-h-[92dvh] flex-col sm:max-h-none">
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-sm text-fg-muted">{description}</div>}
            </div>
            {dismissible && <Button variant="ghost" size="icon-sm" icon={X} aria-label="Close" onClick={onClose} />}
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
