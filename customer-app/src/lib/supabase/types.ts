// Hand-written types mirroring supabase/schema.sql — keep in sync manually,
// there's no `supabase gen types` CLI link on this project (anon key only).
// Not typed with a generated `Database` generic on the client either;
// queries come back untyped and get cast to these at the call site.

export type BookingStatus = "pending" | "approved" | "declined" | "completed";

export interface Service {
  id: string;
  location_id: string;
  name: string;
  price_from: number;
  description: string | null;
  sort_order: number;
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
  created_at: string;
}

export interface BookingWithService extends Booking {
  service: Pick<Service, "id" | "name" | "price_from"> | null;
}
