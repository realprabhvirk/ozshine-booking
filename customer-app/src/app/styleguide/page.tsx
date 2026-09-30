import type { Metadata } from "next";
import { Styleguide } from "./styleguide";

export const metadata: Metadata = {
  title: "Styleguide — OzShine",
  robots: { index: false, follow: false },
};

// Internal reference for the V2 building blocks (not linked anywhere).
export default function StyleguidePage() {
  return <Styleguide />;
}
