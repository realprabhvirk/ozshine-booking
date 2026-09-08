import type { Service, VehicleType } from "./supabase/types";

export const VEHICLE_TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "sedan", label: "Sedan" },
  { value: "small_wagon", label: "Small Wagon" },
  { value: "van", label: "Van" },
  { value: "4wd", label: "4WD" },
];

type ServicePricing = Pick<
  Service,
  "price_from" | "price_small_wagon" | "price_van" | "price_4wd"
>;

// price_from is the sedan/base rate. A service missing a per-type price
// (Correction & Coating, currently) just falls back to it for every type.
export function getServicePrice(
  service: ServicePricing,
  vehicleType: VehicleType
): number {
  switch (vehicleType) {
    case "small_wagon":
      return service.price_small_wagon ?? service.price_from;
    case "van":
      return service.price_van ?? service.price_from;
    case "4wd":
      return service.price_4wd ?? service.price_from;
    default:
      return service.price_from;
  }
}
