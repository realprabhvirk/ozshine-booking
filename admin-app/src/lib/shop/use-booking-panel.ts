"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// The booking detail panel is driven by ?booking=<id> so it works from any
// screen, survives a refresh and the browser back button closes it.
export function useBookingPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const open = useCallback(
    (id: string) => {
      const p = new URLSearchParams(params.toString());
      p.set("booking", id);
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [router, pathname, params],
  );

  const close = useCallback(() => {
    const p = new URLSearchParams(params.toString());
    p.delete("booking");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, params]);

  return { openId: params.get("booking"), open, close };
}
