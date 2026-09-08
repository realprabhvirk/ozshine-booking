// Hand-written types mirroring supabase/schema.sql. Keep these two in sync
// manually — this project isn't wired up to `supabase gen types` (no CLI
// project link), so there's no automatic generation step.

export type BookingStatus = "pending" | "approved" | "declined" | "completed";
export type StaffRole = "admin" | "staff";

export interface Location {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  location_id: string;
  name: string;
  price_from: number;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface Customer {
  id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  rego: string | null;
  make_model: string | null;
  notes: string | null;
  created_at: string;
}

export interface Staff {
  id: string;
  auth_user_id: string | null;
  location_id: string;
  name: string;
  role: StaffRole;
  created_at: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  service_id: string;
  location_id: string;
  requested_date: string;
  requested_time: string;
  status: BookingStatus;
  amount_charged: number | null;
  paid: boolean;
  paid_at: string | null;
  processed_by_staff_id: string | null;
  created_at: string;
}

// Shape returned by the booking queue / history queries, joined for display.
export interface BookingWithDetails extends Booking {
  customer: Pick<Customer, "id" | "name" | "phone" | "email"> | null;
  vehicle: Pick<Vehicle, "id" | "rego" | "make_model"> | null;
  service: Pick<Service, "id" | "name" | "price_from"> | null;
  processed_by: Pick<Staff, "id" | "name"> | null;
}

// The invoice page additionally needs the location's own details (name,
// address, phone) for the invoice header.
export interface BookingWithInvoiceDetails extends BookingWithDetails {
  location: Pick<Location, "id" | "name" | "address" | "phone"> | null;
}

// Note: the Supabase clients in this project are intentionally NOT typed
// with a generated `Database` generic (there's no `supabase gen types` CLI
// link here — this project only has anon keys, no project ref). Query
// results come back as `any`; we cast them to the interfaces above at the
// call site instead. Keep schema.sql and these interfaces in sync by hand.
