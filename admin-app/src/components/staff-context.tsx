"use client";

import { createContext, useContext } from "react";
import type { Staff } from "@/lib/supabase/types";

const StaffContext = createContext<Staff | null>(null);

export function StaffProvider({
  staff,
  children,
}: {
  staff: Staff;
  children: React.ReactNode;
}) {
  return (
    <StaffContext.Provider value={staff}>{children}</StaffContext.Provider>
  );
}

// Only ever rendered under (app)/layout.tsx, which redirects to /login when
// there's no staff row — so the null case here means a component was used
// outside that tree, which is a bug worth throwing on.
export function useStaff(): Staff {
  const staff = useContext(StaffContext);
  if (!staff) {
    throw new Error("useStaff() called outside of <StaffProvider>");
  }
  return staff;
}
