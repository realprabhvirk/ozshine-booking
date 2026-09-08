"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Service } from "@/lib/supabase/types";

export function BookingSection({
  services,
  onWantLogin,
}: {
  services: Service[];
  onWantLogin: () => void;
}) {
  const [supabase] = useState(() => createClient());

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rego, setRego] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saveDetails, setSaveDetails] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    name: string;
    serviceName: string;
    date: string;
    time: string;
    accountNote?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !phone.trim() || !serviceId || !date || !time) {
      setError("Name, phone, service, date, and time are required.");
      return;
    }

    if (saveDetails && (!email.trim() || password.length < 6)) {
      setError(
        "To save your details, enter an email and a password (at least 6 characters)."
      );
      return;
    }

    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setError("Please choose a service.");
      return;
    }

    setSubmitting(true);

    try {
      // Match on phone — an existing customer's history carries over, a new
      // phone number gets a fresh customer row. Same rule the admin app's
      // manual booking form follows.
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
          throw new Error("Couldn't save your details. Please try again.");
        }
        customerId = newCustomer.id;
      }

      let vehicleId: string | null = null;
      if (rego.trim()) {
        const { data: existingVehicle } = await supabase
          .from("vehicles")
          .select("id")
          .eq("customer_id", customerId)
          .eq("rego", rego.trim())
          .maybeSingle();

        if (existingVehicle) {
          vehicleId = existingVehicle.id;
        } else {
          const { data: newVehicle, error: vehicleError } = await supabase
            .from("vehicles")
            .insert({ customer_id: customerId, rego: rego.trim() })
            .select("id")
            .single();

          if (vehicleError || !newVehicle) {
            throw new Error("Couldn't save your rego. Please try again.");
          }
          vehicleId = newVehicle.id;
        }
      }

      const { error: bookingError } = await supabase.from("bookings").insert({
        customer_id: customerId,
        vehicle_id: vehicleId,
        service_id: service.id,
        location_id: service.location_id,
        requested_date: date,
        requested_time: time,
        status: "pending",
      });

      if (bookingError) {
        throw new Error("Couldn't submit your booking. Please try again.");
      }

      // Account creation is best-effort and never undoes the booking above,
      // which already succeeded — a signup failure just becomes a note on
      // the confirmation screen instead of a scary red error.
      let accountNote: string | undefined;
      if (saveDetails) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim(), phone: phone.trim() } },
        });

        if (signUpError) {
          accountNote = `Your booking is confirmed, but we couldn't save your details (${signUpError.message}).`;
        } else {
          const { error: claimError } = await supabase.rpc(
            "claim_customer_by_phone",
            { p_phone: phone.trim() }
          );
          if (claimError) {
            accountNote =
              "Your account was created, but we couldn't attach your booking history yet.";
          }
        }
      }

      setConfirmed({
        name: name.trim(),
        serviceName: service.name,
        date,
        time,
        accountNote,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="booking" className="bg-[#f4f4f5] py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <div className="mb-10 text-center">
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-brand">
            Book Online
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Reserve your spot
          </h2>
          <p className="mt-3 text-muted">
            No account needed — just fill this in and we&apos;ll see you at
            the wash bay.
          </p>
        </div>

        {confirmed ? (
          <div className="rounded-3xl border border-black/10 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-7 w-7 text-green-600">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-ink">
              You&apos;re booked in, {confirmed.name.split(" ")[0]}!
            </h3>
            <p className="mt-3 text-muted">
              {confirmed.serviceName} on{" "}
              {new Date(`${confirmed.date}T00:00:00`).toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              at {confirmed.time}. We&apos;ll see you then — no need to do
              anything else.
            </p>
            {confirmed.accountNote && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {confirmed.accountNote}
              </p>
            )}
            <button
              onClick={() => setConfirmed(null)}
              className="mt-8 rounded-full border border-black/10 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-black/[0.03]"
            >
              Make another booking
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm sm:p-10"
          >
            {error && (
              <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-brand-dark">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Your name" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Phone" required>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label={saveDetails ? "Email" : "Email (optional)"} required={saveDetails}>
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
              <Field label="Service" required>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className={inputClass}
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} — ${service.price_from}+
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-5">
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
            </div>

            <div className="mt-6 rounded-2xl border border-black/10 bg-[#f9f9fa] p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={saveDetails}
                  onChange={(e) => setSaveDetails(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-brand"
                />
                <span className="text-sm font-medium text-ink">
                  Save my details for next time
                  <span className="mt-0.5 block font-normal text-muted">
                    Creates a free account so you can see your booking
                    history and visit count next time you&apos;re here.
                  </span>
                </span>
              </label>

              {saveDetails && (
                <div className="mt-4">
                  <Field label="Password" required>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      minLength={6}
                    />
                  </Field>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-full bg-brand px-6 py-4 text-base font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Booking…" : "Book Your Wash"}
            </button>

            <button
              type="button"
              onClick={onWantLogin}
              className="mt-4 w-full text-center text-sm font-medium text-muted hover:text-ink"
            >
              Already saved your details? <span className="text-brand">Log in</span>
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      {children}
    </label>
  );
}
