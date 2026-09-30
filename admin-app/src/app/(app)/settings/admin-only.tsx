"use client";

import type { ReactNode } from "react";
import { Notice } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";

export function AdminOnly({ children }: { children: ReactNode }) {
  const { staff } = useShop();
  if (staff.role !== "admin") return <Notice tone="warn" title="Admins only">Changing settings needs an admin login.</Notice>;
  return <>{children}</>;
}
