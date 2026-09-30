"use client";

import { useState } from "react";
import { CalendarCheck, Car, ChevronRight, Sparkles, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, SegmentedControl, Select, Switch } from "@/components/ui/field";
import { Dialog, Sheet } from "@/components/ui/dialog";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { BOOKING_STATUS_META, VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type BookingStatus, type VehicleType } from "@/lib/core/status";
import { formatCents } from "@/lib/core/money";
import { addDaysISO, formatDay, formatTime, todayISO } from "@/lib/core/time";

const SAMPLE: Array<{ ref: string; service: string; date: string; time: string; status: BookingStatus; total: number }> = [
  { ref: "OZ-7K3P", service: "Platinum Wash", date: addDaysISO(todayISO(), 1), time: "09:30", status: "approved", total: 6500 },
  { ref: "OZ-M4QX", service: "OzShine Wash", date: addDaysISO(todayISO(), -12), time: "11:00", status: "completed", total: 4000 },
];

export function Styleguide() {
  const toast = useToast();
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [save, setSave] = useState(true);

  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <section className="oz-dark relative overflow-hidden bg-canvas px-4 py-16 sm:px-8">
        <div className="pointer-events-none absolute -top-1/2 right-[-10%] h-[160%] w-[60%] rounded-full bg-accent/25 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl">
          <Badge tone="accent">Styleguide</Badge>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            A showroom shine, <span className="text-accent">every time.</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-fg-muted">Building blocks for the new booking site, on a dark glossy section.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" iconRight={ChevronRight} onClick={() => setSheet(true)}>
              Book a wash
            </Button>
            <Button variant="light" size="lg">
              See prices
            </Button>
            <Button variant="outline" size="lg" onClick={() => toast.success("You're booked in", "Platinum Wash · Tomorrow 9:30am")}>
              Show toast
            </Button>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {["OzShine Wash", "Platinum Wash", "Full Detail"].map((name, i) => (
              <Card key={name} className="p-6">
                <div className="flex items-center justify-between">
                  <Sparkles size={20} className="text-accent" />
                  {i === 1 && <Badge tone="accent">Most popular</Badge>}
                </div>
                <p className="mt-4 text-lg font-bold">{name}</p>
                <p className="text-fg-muted">From {formatCents([4000, 6500, 33000][i], { whole: true })}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:px-8 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" description="Light section form controls" />
          <CardBody className="space-y-5">
            <Field label="Name" required>
              <Input autoComplete="name" placeholder="Jess Nguyen" />
            </Field>
            <Field label="Mobile" required error="That doesn't look like a valid phone number">
              <Input inputMode="tel" autoComplete="tel" defaultValue="0412" />
            </Field>
            <Field label="Service">
              <Select defaultValue="">
                <option value="" disabled>
                  Choose a service
                </option>
                <option>Platinum Wash</option>
              </Select>
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium">Vehicle</p>
              <SegmentedControl
                label="Vehicle type"
                value={vehicle}
                onChange={setVehicle}
                className="grid-cols-2"
                options={VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))}
              />
            </div>
            <Switch checked={save} onChange={setSave} label="Save my details for next time" />
            <Button variant="primary" block size="lg" onClick={() => setDialog(true)}>
              Confirm booking
            </Button>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Tabs
            label="Bookings"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "upcoming", label: "Upcoming", count: 1 },
              { id: "past", label: "Past" },
            ]}
          />
          <TabPanel id={tab} className="space-y-3">
            {SAMPLE.filter((b) => (tab === "upcoming" ? b.status !== "completed" : b.status === "completed")).map((b) => {
              const meta = BOOKING_STATUS_META[b.status];
              return (
                <Card key={b.ref} className="flex items-center gap-4 p-5">
                  <div className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent">
                    <Car size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{b.service}</p>
                    <p className="text-sm text-fg-muted">
                      {formatDay(b.date)} · {formatTime(b.time)} · {b.ref}
                    </p>
                  </div>
                  <Badge tone={meta.tone} dot>
                    {meta.customerLabel}
                  </Badge>
                </Card>
              );
            })}
          </TabPanel>
          <Notice tone="ok" title="You've visited 4 times">
            2 more visits for 50% off your next wash.
          </Notice>
          <Card>
            <EmptyState icon={CalendarX} title="No past bookings yet" description="Once your car's been through, it'll show up here." />
          </Card>
          <Card className="space-y-3 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        </div>
      </section>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Book a wash" description="Bottom sheet on phones, side panel on desktop">
        <p className="text-fg-muted">The booking steps will live here.</p>
      </Sheet>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        size="sm"
        title="You're booked in!"
        description="Reference OZ-7K3P"
        footer={
          <Button variant="primary" icon={CalendarCheck} onClick={() => setDialog(false)}>
            Done
          </Button>
        }
      >
        <p className="text-fg-muted">We&apos;ll text you when it&apos;s confirmed.</p>
      </Dialog>
    </main>
  );
}
