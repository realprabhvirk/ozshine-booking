import Image from "next/image";
import Link from "next/link";
import { Menu, Phone, UserRound } from "lucide-react";
import logo from "@/assets/oz-shine-logo.png";
import { cn } from "@/lib/core/cn";
import { buttonClasses } from "@/components/ui/button";
import { telLink } from "@/lib/hours";

const LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#how", label: "How it works" },
  { href: "/#rewards", label: "Rewards" },
  { href: "/#visit", label: "Find us" },
];

// Dark over the hero (transparent), solid dark elsewhere.
export function SiteHeader({ phone, overlay = false, bookHref = "/book" }: { phone?: string | null; overlay?: boolean; bookHref?: string | null }) {
  const tel = telLink(phone);
  return (
    <header className={cn("oz-dark relative z-20 text-fg", overlay ? "bg-transparent" : "border-b border-line bg-canvas")}>
      <nav aria-label="Main" className="mx-auto flex h-18 max-w-6xl items-center gap-4 px-4 sm:h-20 sm:px-6">
        <Link href="/" className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-focus" aria-label="OzShine home">
          <Image src={logo} alt="OzShine Hand Car Wash" priority className="h-8 w-auto sm:h-10" />
        </Link>
        <ul className="ml-6 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-full px-3.5 py-2 text-[15px] font-medium text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-focus">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          {tel && (
            <span className="hidden md:block">
              <a href={tel} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                <Phone size={16} aria-hidden />
                {phone}
              </a>
            </span>
          )}
          <Link href="/account" className={buttonClasses({ variant: "ghost", size: "icon-sm" })} aria-label="My account">
            <UserRound size={20} aria-hidden />
          </Link>
          {bookHref && (
            <Link href={bookHref} className={buttonClasses({ variant: "primary", size: "sm", className: "px-4 sm:px-5" })}>
              Book now
            </Link>
          )}
          <details className="group relative lg:hidden">
            <summary className={cn(buttonClasses({ variant: "ghost", size: "icon-sm" }), "list-none [&::-webkit-details-marker]:hidden")} aria-label="Menu">
              <Menu size={22} aria-hidden />
            </summary>
            <ul className="absolute top-12 right-0 w-56 rounded-2xl bg-panel p-2 shadow-pop ring-1 ring-line">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex h-12 items-center rounded-xl px-4 font-medium hover:bg-raised">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/account" className="flex h-12 items-center rounded-xl px-4 font-medium hover:bg-raised">
                  My account
                </Link>
              </li>
              {tel && (
                <li>
                  <a href={tel} className="flex h-12 items-center gap-2 rounded-xl px-4 font-medium hover:bg-raised">
                    <Phone size={16} aria-hidden /> Call us
                  </a>
                </li>
              )}
            </ul>
          </details>
        </div>
      </nav>
    </header>
  );
}

export function DemoBanner() {
  return (
    <div className="bg-[#f5c542] px-4 py-2 text-center text-sm font-semibold text-[#1a1400]" role="note">
      Demo site: bookings made here are for testing and won&apos;t be washed.
    </div>
  );
}
