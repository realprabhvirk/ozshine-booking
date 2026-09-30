import { CalendarDays, History, LayoutGrid, PlusCircle, Users, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Floor", icon: LayoutGrid, match: (p) => p === "/" },
  { href: "/schedule", label: "Schedule", icon: CalendarDays, match: (p) => p.startsWith("/schedule") },
  { href: "/new", label: "New sale", icon: PlusCircle, match: (p) => p.startsWith("/new") },
  { href: "/money", label: "Money", icon: Wallet, match: (p) => p.startsWith("/money") || p.startsWith("/invoices") },
  { href: "/customers", label: "Customers", icon: Users, match: (p) => p.startsWith("/customers") },
  { href: "/history", label: "History", icon: History, match: (p) => p.startsWith("/history") },
];
