import { BarChart3, CalendarDays, History, LayoutGrid, MessageSquare, PlusCircle, Settings, Users, Wallet, type LucideIcon } from "lucide-react";

// `more`: tucked behind the "More" tab on phones (the bottom bar fits five).
export type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean; more?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Floor", icon: LayoutGrid, match: (p) => p === "/" },
  { href: "/schedule", label: "Schedule", icon: CalendarDays, match: (p) => p.startsWith("/schedule") },
  { href: "/new", label: "New sale", icon: PlusCircle, match: (p) => p.startsWith("/new") },
  { href: "/money", label: "Money", icon: Wallet, match: (p) => p.startsWith("/money") || p.startsWith("/invoices") },
  { href: "/customers", label: "Customers", icon: Users, match: (p) => p.startsWith("/customers") },
  { href: "/history", label: "History", icon: History, match: (p) => p.startsWith("/history"), more: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, match: (p) => p.startsWith("/messages"), more: true },
  { href: "/reports", label: "Reports", icon: BarChart3, match: (p) => p.startsWith("/reports"), more: true },
  { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings"), more: true },
];
