import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";
import logo from "@/assets/oz-shine-logo.png";
import { hoursRows, mapsLink, telLink } from "@/lib/hours";
import type { PublicSettings } from "@/lib/public";

export function SiteFooter({ settings }: { settings: PublicSettings | null }) {
  const rows = hoursRows(settings?.opening_hours);
  const tel = telLink(settings?.phone);
  const map = mapsLink(settings?.address);
  return (
    <footer className="oz-dark bg-canvas text-fg">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Image src={logo} alt="OzShine" className="h-9 w-auto" />
          <p className="max-w-sm text-fg-muted">Hand car wash and detailing in Beenleigh. Book online in a minute, no account needed.</p>
          {settings?.abn && <p className="text-sm text-fg-faint">ABN {settings.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4")}</p>}
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-widest text-fg-faint uppercase">Opening hours</h2>
          <dl className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.days} className="flex justify-between gap-4 text-[15px]">
                <dt className="text-fg-muted">{r.days}</dt>
                <dd className="tabular-nums">{r.time}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-widest text-fg-faint uppercase">Contact</h2>
          <ul className="space-y-3 text-[15px]">
            {settings?.address && (
              <li className="flex gap-2.5">
                <MapPin size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                {map ? (
                  <a href={map} target="_blank" rel="noreferrer" className="hover:underline">
                    {settings.address}
                  </a>
                ) : (
                  settings.address
                )}
              </li>
            )}
            {tel && (
              <li className="flex gap-2.5">
                <Phone size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <a href={tel} className="hover:underline">
                  {settings?.phone}
                </a>
              </li>
            )}
            {settings?.email && (
              <li className="flex gap-2.5">
                <Mail size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <a href={`mailto:${settings.email}`} className="break-all hover:underline">
                  {settings.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-fg-faint sm:px-6">
          <p>© {new Date().getFullYear()} OzShine Hand Car Wash · Beenleigh</p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/book" className="hover:text-fg">
              Book
            </Link>
            <Link href="/account" className="hover:text-fg">
              My account
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
