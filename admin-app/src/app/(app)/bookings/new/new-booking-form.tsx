"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayISODate, formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_OPTIONS, getServicePrice } from "@/lib/pricing";
import type { Service, VehicleType } from "@/lib/supabase/types";

export function NewBookingForm({
  services,
  locationId,
}: {
  services: Service[];
  locationId: string;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rego, setRego] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  // Defaults to today — walk-ins and phone bookings almost always are.
  const [date, setDate] = useState(() => todayISODate());
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmation(null);

    if (!name.trim() || !phone.trim() || !serviceId || !date || !time) {
      setError("Name, phone, service, date, and time are all required.");
      return;
    }

    setSubmitting(true);

    try {
      // 1. Find or create the customer, matched by phone.
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone.trim())
        .maybeSingle();

      let customerId = existingCustomer?.id as string | undefined;

      if (!customerId) {
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
          })
          .select("id")
          .single();

        if (customerError || !newCustomer) {
          throw new Error(customerError?.message ?? "Couldn't create customer.");
        }
        customerId = newCustomer.id;
      }

      // 2. Find or create the vehicle for this customer. Always create one
      // (even with no rego) — vehicle type drives the suggested charge at
      // Mark Complete, so it needs to be captured regardless. Only dedupe
      // against an existing vehicle when a rego was given to match on.
      let vehicleId: string | null = null;
      const regoTrimmed = rego.trim();
      const existingVehicle = regoTrimmed
        ? (
            await supabase
              .from("vehicles")
              .select("id")
              .eq("customer_id", customerId)
              .eq("rego", regoTrimmed)
              .maybeSingle()
          ).data
        : null;

      if (existingVehicle) {
        vehicleId = existingVehicle.id;
      } else {
        const { data: newVehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .insert({
            customer_id: customerId,
            rego: regoTrimmed || null,
            make_model: makeModel.trim() || null,
            vehicle_type: vehicleType,
          })
          .select("id")
          .single();

        if (vehicleError || !newVehicle) {
          throw new Error(vehicleError?.message ?? "Couldn't save the vehicle.");
        }
        vehicleId = newVehicle.id;
      }

      // 3. Create the booking itself, as pending — it lands in the same
      // queue a public-site booking would, so staff approve it the same way.
      const { error: bookingError } = await supabase.from("bookings").insert({
        customer_id: customerId,
        vehicle_id: vehicleId,
        service_id: serviceId,
        location_id: locationId,
        requested_date: date,
        requested_time: time,
        status: "pending",
      });

      if (bookingError) {
        throw new Error(bookingError.message);
      }

      setConfirmation(`Booking created for ${name.trim()} — it's now in the queue.`);
      setName("");
      setPhone("");
      setEmail("");
      setRego("");
      setMakeModel("");
      setVehicleType("sedan");
      setDate(todayISODate());
      setTime("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedService = services.find((s) => s.id === serviceId);
  const estimatedPrice = selectedService
    ? getServicePrice(selectedService, vehicleType)
    : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-sm shadow-black/[0.03]"
    >
      {confirmation && (
        <p className="mb-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {confirmation}
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-brand-dark">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" required hint="Matches existing customers">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email (optional)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Rego (optional)">
          <input
            value={rego}
            onChange={(e) => setRego(e.target.value.toUpperCase())}
            className={inputClass}
          />
        </Field>
        <Field label="Make / model (optional)">
          <input
            value={makeModel}
            onChange={(e) => setMakeModel(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Vehicle type" required hint="Pricing varies by size">
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            className={inputClass}
          >
            {VEHICLE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Service" required>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className={inputClass}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — from {formatMoney(service.price_from)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Time" required>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {estimatedPrice !== null && (
        <p className="mt-4 text-sm text-muted">
          Estimated price for a{" "}
          {VEHICLE_TYPE_OPTIONS.find((o) => o.value === vehicleType)?.label.toLowerCase()}:{" "}
          <span className="font-semibold text-foreground">
            {formatMoney(estimatedPrice)}
          </span>
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Creating…" : "Create booking"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
