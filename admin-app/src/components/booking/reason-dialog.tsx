"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";

// Confirm a decline / cancel / no-show, with an optional reason (a decline
// reason is included in the message to the customer).
export function ReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  reasonLabel = "Reason",
  reasonHint,
  suggestions = [],
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonHint?: string;
  suggestions?: string[];
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
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
            Keep booking
          </Button>
          <Button variant="danger" loading={busy} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button key={s} size="sm" variant={reason === s ? "primary" : "secondary"} onClick={() => setReason(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
      <Field label={reasonLabel} optional hint={reasonHint}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} />
      </Field>
    </Dialog>
  );
}
