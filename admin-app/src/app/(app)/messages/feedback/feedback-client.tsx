"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, MessageSquare, Pencil, Phone, Plus, Quote, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatPhone } from "@/lib/core/phone";
import { formatDate, formatDateTime } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { callRpc } from "@/lib/rpc";
import { adminDelete, adminSave } from "@/lib/shop/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Stat } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { MessageDialog } from "@/components/customers/message-dialog";

export type FeedbackRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  handled_at: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  booking: { id: string; reference_code: string; requested_date: string; service: { name: string } | null } | null;
  handled: { name: string } | null;
};
export type TestimonialRow = { id: string; name: string; text: string; rating: number | null; published: boolean; sort: number; created_at: string };

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-warn" aria-label={`${n} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={size} fill={i < n ? "currentColor" : "none"} aria-hidden className={i < n ? "" : "text-fg-faint"} />
      ))}
    </span>
  );
}

// "Jess Nguyen" → "Jess N." for public quotes.
const publicName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0].toUpperCase()}.` : first;
};

export function FeedbackClient({ feedback, testimonials }: { feedback: FeedbackRow[]; testimonials: TestimonialRow[] }) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [quote, setQuote] = useState<Partial<TestimonialRow> | null>(null);
  const [remove, setRemove] = useState<TestimonialRow | null>(null);
  const [message, setMessage] = useState<FeedbackRow["customer"] | null>(null);
  const isAdmin = staff.role === "admin";

  const todo = feedback.filter((f) => f.rating <= 3 && !f.handled_at);
  const rows = filter === "todo" ? todo : feedback;
  const avg = feedback.length ? feedback.reduce((n, f) => n + f.rating, 0) / feedback.length : null;
  const dist = [5, 4, 3, 2, 1].map((r) => ({ r, n: feedback.filter((f) => f.rating === r).length }));

  async function handled(id: string) {
    setBusy(id);
    try {
      await callRpc(supabase, "mark_feedback_handled", { p_feedback_id: id, p_actor: null });
      toast.success("Marked as sorted");
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish(t: TestimonialRow) {
    setBusy(t.id);
    try {
      await adminSave(supabase, "testimonials", t.id, { published: !t.published });
      toast.success(t.published ? "Hidden from the website" : "Showing on the website");
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Average rating" value={avg ? avg.toFixed(1) : "—"} sub={avg ? <Stars n={Math.round(avg)} /> : "No ratings yet"} />
        <Stat label="Ratings" value={feedback.length} sub={dist.filter((d) => d.n).map((d) => `${d.r}★ ${d.n}`).join(" · ") || "Asked for after each visit"} />
        <Stat label="To follow up" value={<span className={todo.length ? "text-bad-ink" : ""}>{todo.length}</span>} sub="3 stars or less, not sorted yet" />
      </div>

      <Card>
        <CardHeader
          title="Customer feedback"
          description="Private. Customers who give 3 stars or less aren't sent to public reviews, they come here so you can make it right."
          action={
            <div role="radiogroup" aria-label="Show" className="flex gap-1 rounded-xl bg-sunken p-1 ring-1 ring-line">
              {(["todo", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn("h-9 rounded-lg px-3 text-sm font-semibold", filter === f ? "bg-panel shadow-card ring-1 ring-line" : "text-fg-muted")}
                >
                  {f === "todo" ? `To follow up (${todo.length})` : "All"}
                </button>
              ))}
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={filter === "todo" ? "Nothing to follow up" : "No feedback yet"} description={filter === "todo" ? "Every low rating has been sorted." : "Customers are asked how it went a couple of hours after each job."} className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Stars n={f.rating} />
                    {f.customer ? (
                      <Link href={`/customers/${f.customer.id}`} className="font-semibold hover:underline">
                        {f.customer.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">Customer</span>
                    )}
                    {f.handled_at && <Badge tone="ok">Sorted{f.handled ? ` by ${f.handled.name}` : ""}</Badge>}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {f.booking?.service?.name}
                    {f.booking && ` · visit ${formatDate(f.booking.requested_date, "medium")}`} · rated {formatDateTime(f.created_at)}
                  </p>
                  {f.comment ? <p className="mt-2 max-w-3xl whitespace-pre-line">“{f.comment}”</p> : <p className="mt-2 text-sm text-fg-faint">No comment left.</p>}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {f.customer?.phone && (
                    <a href={`tel:${f.customer.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1 ring-line hover:bg-raised">
                      <Phone size={16} aria-hidden /> {formatPhone(f.customer.phone)}
                    </a>
                  )}
                  {f.customer && (
                    <Button size="sm" icon={MessageSquare} onClick={() => setMessage(f.customer)}>
                      Message
                    </Button>
                  )}
                  {f.rating <= 3 && !f.handled_at && (
                    <Button size="sm" variant="primary" icon={CheckCircle2} loading={busy === f.id} onClick={() => handled(f.id)}>
                      Sorted
                    </Button>
                  )}
                  {isAdmin && f.rating >= 4 && f.comment && (
                    <Button size="sm" icon={Quote} onClick={() => setQuote({ name: f.customer ? publicName(f.customer.name) : "", text: f.comment ?? "", rating: f.rating, published: true })}>
                      Put on website
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Reviews on the website"
          description="The home page only shows reviews that are switched on here. Only use real customers' words, with their OK."
          action={isAdmin && <Button size="sm" icon={Plus} onClick={() => setQuote({ name: "", text: "", rating: 5, published: true })}>Add review</Button>}
        />
        {testimonials.length === 0 ? (
          <EmptyState icon={Quote} title="No reviews on the website" description="The reviews section stays hidden until you add one." className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {testimonials.map((t) => (
              <li key={t.id} className={cn("flex flex-wrap items-start gap-3 px-5 py-4", !t.published && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    {t.rating && <Stars n={t.rating} size={14} />}
                    <span className="font-semibold">{t.name}</span>
                    {!t.published && <Badge tone="neutral">Hidden</Badge>}
                  </p>
                  <p className="mt-1 max-w-3xl text-fg-muted">“{t.text}”</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" icon={t.published ? EyeOff : Eye} aria-label={t.published ? "Hide" : "Show"} loading={busy === t.id} onClick={() => togglePublish(t)} />
                    <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => setQuote(t)} />
                    <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => setRemove(t)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <QuoteDialog key={quote ? (quote.id ?? `new-${quote.text?.length}`) : "none"} value={quote} onClose={() => setQuote(null)} />
      {message && <MessageDialog open onClose={() => setMessage(null)} customer={{ ...message, email: null }} />}
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        busy={busy === "remove"}
        tone="danger"
        title="Delete this review?"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!remove) return;
          setBusy("remove");
          try {
            await adminDelete(supabase, "testimonials", remove.id);
            setRemove(null);
            router.refresh();
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}

function QuoteDialog({ value, onClose }: { value: Partial<TestimonialRow> | null; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const [name, setName] = useState(value?.name ?? "");
  const [text, setText] = useState(value?.text ?? "");
  const [rating, setRating] = useState(value?.rating ?? 5);
  const [published, setPublished] = useState(value?.published ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2 && text.trim().length >= 5 && text.length <= 600;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "testimonials", value?.id ?? null, { name: name.trim(), text: text.trim(), rating, published });
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      dismissible={!busy}
      title={value?.id ? "Edit review" : "Review for the website"}
      description="Use the customer's own words. Only first name and last initial."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Name shown">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Jess N." />
        </Field>
        <Field label="Review" error={text.length > 600 ? "Keep it under 600 characters" : null}>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium">Stars</p>
          <div role="radiogroup" aria-label="Stars" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)} className="rounded p-1 text-warn">
                <Star size={28} fill={n <= rating ? "currentColor" : "none"} aria-hidden />
              </button>
            ))}
          </div>
        </div>
        <Switch checked={published} onChange={setPublished} label="Show on the website" />
      </div>
    </Dialog>
  );
}
