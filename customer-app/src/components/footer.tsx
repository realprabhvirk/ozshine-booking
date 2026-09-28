import Image from "next/image";
import logo from "@/assets/oz-shine-logo.png";
export function Footer() {
  return (
    <footer className="bg-ink py-10 text-center text-sm text-white/50">
      <Image src={logo} alt="OzShine" className="mx-auto mb-4 h-9 w-auto" />
      <p>Hand Car Wash — Beenleigh, QLD</p>
      <p className="mt-1">This demo doesn&apos;t send SMS or email confirmations yet.</p>
    </footer>
  );
}
