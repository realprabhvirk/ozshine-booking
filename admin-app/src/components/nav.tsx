"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { useStaff } from "./staff-context";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/queue", label: "Booking Queue", icon: QueueIcon },
  { href: "/active", label: "Active Today", icon: ActiveIcon },
  { href: "/customers", label: "Customers", icon: CustomersIcon },
  { href: "/bookings/new", label: "New Booking", icon: PlusIcon },
];

export function Nav() {
  const pathname = usePathname();
  const staff = useStaff();

  return (
    <nav className="flex h-full w-full flex-col bg-[#16181d] text-white lg:w-64">
      <div className="border-b border-white/10 px-5 py-6">
        <p className="text-lg font-bold tracking-tight">
          Oz<span className="text-brand">Shine</span>
        </p>
        <p className="text-xs text-white/50">Beenleigh · Staff</p>
      </div>

      <ul className="flex flex-1 flex-row overflow-x-auto lg:flex-col lg:overflow-visible lg:px-3 lg:py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1 lg:flex-none">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-3 text-xs font-medium transition lg:mb-1 lg:flex-row lg:gap-3 lg:rounded-lg lg:px-4 lg:py-3.5 lg:text-sm ${
                  isActive
                    ? "bg-brand text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden border-t border-white/10 p-4 lg:block">
        <p className="mb-3 truncate text-sm font-medium text-white">
          {staff.name}
        </p>
        <p className="mb-3 text-xs uppercase tracking-wide text-white/40">
          {staff.role}
        </p>
        <LogoutButton />
      </div>
    </nav>
  );
}

function DashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function QueueIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      <circle cx="19.5" cy="18" r="2" />
    </svg>
  );
}

function ActiveIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CustomersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <path d="M16 4.5a3.2 3.2 0 0 1 0 6.4M20.5 20c0-2.8-2-5.1-4.7-5.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}
