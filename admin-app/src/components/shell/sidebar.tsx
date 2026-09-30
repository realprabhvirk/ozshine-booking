"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import logo from "@/assets/oz-shine-logo.png";
import { cn } from "@/lib/core/cn";
import { ThemeToggle } from "@/components/ui/theme";
import { useShop } from "@/components/shop-context";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { staff, supabase } = useShop();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Tablet / desktop: rail (md) that widens to a labelled sidebar (lg). */}
      <nav
        aria-label="Main"
        className="hidden w-24 shrink-0 flex-col border-r border-line bg-panel md:flex 2xl:w-60 print:hidden"
      >
        <div className="flex h-16 items-center justify-center border-b border-line px-4 2xl:justify-start 2xl:px-5">
          <Image src={logo} alt="OzShine" priority className="h-7 w-auto 2xl:h-8" />
        </div>
        <ul className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold transition 2xl:flex-row 2xl:justify-start 2xl:gap-3 2xl:px-4 2xl:text-[15px]",
                    "focus-visible:outline-2 focus-visible:outline-focus",
                    active ? "bg-accent text-accent-fg shadow-card" : "text-fg-muted hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon size={22} aria-hidden />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-3">
          <div className="mb-2 hidden px-2 2xl:block">
            <p className="truncate text-sm font-semibold text-fg">{staff.name}</p>
            <p className="text-xs text-fg-faint capitalize">{staff.role} · Beenleigh</p>
          </div>
          <div className="flex flex-col items-center gap-1 2xl:flex-row">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-fg-muted transition hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
            >
              <LogOut size={18} aria-hidden />
              <span className="hidden 2xl:inline">Log out</span>
              <span className="sr-only 2xl:hidden">Log out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Phones: bottom tab bar. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        <ul className="grid grid-cols-6">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold",
                    active ? "text-accent" : "text-fg-muted",
                  )}
                >
                  <Icon size={22} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
