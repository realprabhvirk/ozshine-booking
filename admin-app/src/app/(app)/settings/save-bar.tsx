"use client";

import { Button } from "@/components/ui/button";

// Sticky save bar that appears once something's changed.
export function SaveBar({ dirty, busy, onSave, onReset }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-20 z-20 mt-6 flex items-center justify-between gap-3 rounded-2xl bg-panel px-5 py-3 shadow-pop ring-1 ring-line md:bottom-4">
      <p className="text-sm font-medium">You have unsaved changes</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onReset} disabled={busy}>
          Undo
        </Button>
        <Button variant="primary" loading={busy} onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
