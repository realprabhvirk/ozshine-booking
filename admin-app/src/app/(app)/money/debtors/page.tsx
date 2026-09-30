import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { fetchDebtors } from "@/lib/shop/money";
import { Notice } from "@/components/ui/feedback";
import { DebtorsClient } from "./debtors-client";

export const metadata: Metadata = { title: "Debtors — OzShine Staff" };

export default async function DebtorsPage() {
  const supabase = await createClient();
  let rows;
  try {
    rows = await fetchDebtors(supabase);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load debtors">{errorMessage(e)}</Notice>;
  }
  return <DebtorsClient initial={rows} />;
}
