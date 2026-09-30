"use client";

import { useState } from "react";
import { Car, CalendarPlus, Inbox, Search, Trash2, Wallet } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader, Stat } from "@/components/ui/card";
import { Badge, InvoiceBadge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, SegmentedControl, Select, Switch, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Dialog, Sheet } from "@/components/ui/dialog";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Notice, PageHeader, Skeleton, Spinner } from "@/components/ui/feedback";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ThemeToggle } from "@/components/ui/theme";
import { BOOKING_STATUSES, INVOICE_STATUSES, VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/core/status";
import { formatCents, gstFromInclusiveCents } from "@/lib/core/money";
import { formatDate, formatTime, todayISO } from "@/lib/core/time";
import { formatPhone } from "@/lib/core/phone";
import { AppError } from "@/lib/core/errors";

type Row = { ref: string; name: string; rego: string; service: string; time: string; total: number };
const ROWS: Row[] = [
  { ref: "OZ-7K3P", name: "Jess Nguyen", rego: "123ABC", service: "Platinum Wash", time: "09:00", total: 6500 },
  { ref: "OZ-M4QX", name: "Liam Walker", rego: "887XYZ", service: "OzShine Wash", time: "09:30", total: 5000 },
  { ref: "OZ-2HTR", name: "Priya Singh", rego: "455KLM", service: "Interior Detail", time: "11:00", total: 28000 },
];
const COLUMNS: Column<Row>[] = [
  { key: "ref", header: "Ref", cell: (r) => <span className="font-mono text-sm">{r.ref}</span>, sortValue: (r) => r.ref },
  { key: "name", header: "Customer", cell: (r) => r.name, sortValue: (r) => r.name },
  { key: "rego", header: "Rego", cell: (r) => r.rego, hideBelow: "md" },
  { key: "service", header: "Service", cell: (r) => r.service, hideBelow: "lg" },
  { key: "time", header: "Time", cell: (r) => formatTime(r.time), sortValue: (r) => r.time },
  { key: "total", header: "Total", cell: (r) => formatCents(r.total), sortValue: (r) => r.total, align: "right", className: "tabular-nums" },
];

export function UiGallery() {
  const toast = useToast();
  const [tab, setTab] = useState<"buttons" | "forms" | "data">("buttons");
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleType | null>("sedan");
  const [sw, setSw] = useState(true);

  return (
    <div className="-mx-4 -my-6 min-h-dvh bg-canvas px-4 py-6 text-fg lg:-mx-8 lg:-my-8 lg:px-8 lg:py-8">
      <PageHeader
        title="UI kit"
        description={`Building blocks for the new screens · ${formatDate(todayISO(), "full")}`}
        actions={
          <>
            <ThemeToggle />
            <Button variant="primary" icon={CalendarPlus} onClick={() => toast.success("Booking created", "OZ-7K3P · Platinum Wash · 9am")}>
              Show toast
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cars today" value="14" sub="3 in bays now" icon={<Car size={18} />} />
        <Stat label="Revenue today" value={formatCents(128500)} sub={`GST ${formatCents(gstFromInclusiveCents(128500))}`} icon={<Wallet size={18} />} />
        <Stat label="Requests waiting" value="2" sub="Oldest 12 min ago" />
        <Card className="p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-20" />
        </Card>
      </div>

      <Tabs
        label="Sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "buttons", label: "Buttons & badges" },
          { id: "forms", label: "Forms" },
          { id: "data", label: "Data", count: ROWS.length },
        ]}
        className="mb-4 w-fit"
      />

      {tab === "buttons" && (
        <TabPanel id="buttons" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Buttons" description="48px tall by default, for the tablet." />
            <CardBody className="flex flex-wrap gap-2">
              <Button variant="primary">Approve</Button>
              <Button>Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="success">Mark paid</Button>
              <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
                Void…
              </Button>
              <Button loading>Saving</Button>
              <Button disabled>Disabled</Button>
              <Button size="lg" variant="primary">
                Large
              </Button>
              <Button size="sm">Small</Button>
              <Button size="icon" icon={Search} aria-label="Search" />
              <LinkButton href="/" variant="outline">
                Link button
              </LinkButton>
            </CardBody>
            <CardFooter>
              <Button onClick={() => setSheet(true)}>Open sheet</Button>
              <Button variant="primary" onClick={() => setDialog(true)}>
                Open dialog
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader title="Status badges" />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {BOOKING_STATUSES.map((s) => (
                  <StatusBadge key={s} status={s} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {INVOICE_STATUSES.map((s) => (
                  <InvoiceBadge key={s} status={s} />
                ))}
                <Badge tone="accent">VIP</Badge>
              </div>
              <Notice tone="warn" title="Heads up">
                Two requests have been waiting over 10 minutes.
              </Notice>
              <Notice tone="bad">{new AppError("SLOT_TAKEN").message}</Notice>
              <div className="flex items-center gap-3">
                <Spinner /> <span className="text-sm text-fg-muted">Loading spinner</span>
              </div>
            </CardBody>
          </Card>
        </TabPanel>
      )}

      {tab === "forms" && (
        <TabPanel id="forms">
          <Card className="max-w-2xl">
            <CardHeader title="Form controls" description="Every input is labelled; errors are announced." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field label="Customer name" required>
                <Input placeholder="Jess Nguyen" autoComplete="off" />
              </Field>
              <Field label="Mobile" required error="That doesn't look like a valid phone number">
                <Input inputMode="tel" defaultValue="0412 34" />
              </Field>
              <Field label="Email" optional hint="For receipts">
                <Input type="email" placeholder="name@example.com" />
              </Field>
              <Field label="Service">
                <Select defaultValue="plat">
                  <option value="wash">OzShine Wash</option>
                  <option value="plat">Platinum Wash</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium">Vehicle type</p>
                <SegmentedControl
                  label="Vehicle type"
                  value={vehicle}
                  onChange={setVehicle}
                  className="grid-cols-2 sm:grid-cols-4"
                  options={VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))}
                />
              </div>
              <Field label="Notes" optional className="sm:col-span-2">
                <Textarea placeholder="Anything the team should know" />
              </Field>
              <div className="sm:col-span-2">
                <Switch checked={sw} onChange={setSw} label="Marketing messages" description="Specials and reminders by SMS" />
              </div>
            </CardBody>
          </Card>
        </TabPanel>
      )}

      {tab === "data" && (
        <TabPanel id="data" className="space-y-4">
          <DataTable
            caption="Example bookings"
            columns={COLUMNS}
            rows={ROWS}
            rowKey={(r) => r.ref}
            rowLabel={(r) => `Open booking ${r.ref}`}
            onRowClick={(r) => toast.toast({ title: r.ref, description: `${r.name} · ${formatPhone("0412345678")}` })}
            initialSort={{ key: "time", dir: "asc" }}
          />
          <DataTable caption="Loading" columns={COLUMNS} rows={[]} rowKey={(r) => r.ref} loading />
          <Card>
            <EmptyState
              icon={Inbox}
              title="No requests waiting"
              description="New online bookings will pop up here with a chime."
              action={<Button icon={CalendarPlus}>New booking</Button>}
            />
          </Card>
        </TabPanel>
      )}

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Take payment"
        description="OZ-7K3P · Platinum Wash · Sedan"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={() => {
                setDialog(false);
                toast.success("Payment recorded", "$65.00 EFTPOS");
              }}
            >
              Record $65.00
            </Button>
          </>
        }
      >
        <Field label="Amount">
          <Input inputMode="decimal" defaultValue="65.00" />
        </Field>
      </Dialog>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast.error(new AppError("HAS_PAYMENTS"), "Couldn't void invoice");
        }}
        title="Void this invoice?"
        description="The invoice number is kept, the total goes to $0."
        confirmLabel="Void invoice"
        tone="danger"
      />

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Jess Nguyen" description="0412 345 678 · 12 visits">
        <div className="space-y-3">
          <StatusBadge status="in_progress" />
          <p className="text-fg-muted">Side panel for booking and customer details.</p>
        </div>
      </Sheet>
    </div>
  );
}
