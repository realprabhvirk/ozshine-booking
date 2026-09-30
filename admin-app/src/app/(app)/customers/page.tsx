import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { fetchAllTags, fetchDirectory, fetchDirectoryStats, type DirectoryFilter, type DirectorySort } from "@/lib/shop/customers";
import { Notice } from "@/components/ui/feedback";
import { CustomersClient } from "./customers-client";

export const metadata: Metadata = { title: "Customers — OzShine Staff" };

const FILTERS: DirectoryFilter[] = ["all", "vip", "owing", "rewards", "lapsed", "new", "online"];
const SORTS: DirectorySort[] = ["recent", "name", "visits", "spend"];

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const filter = (FILTERS as string[]).includes(String(sp.filter)) ? (sp.filter as DirectoryFilter) : "all";
  const sort = (SORTS as string[]).includes(String(sp.sort)) ? (sp.sort as DirectorySort) : "recent";
  const tag = typeof sp.tag === "string" && sp.tag ? sp.tag.slice(0, 40) : null;
  const page = Math.max(0, Math.min(1000, Number(sp.page) || 0));
  const supabase = await createClient();
  let data;
  try {
    const [dir, stats, tags] = await Promise.all([fetchDirectory(supabase, { q, filter, sort, tag, page }), fetchDirectoryStats(supabase), fetchAllTags(supabase)]);
    data = { ...dir, stats, tags };
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load customers">{errorMessage(e)}</Notice>;
  }
  return <CustomersClient q={q} filter={filter} sort={sort} tag={tag} page={page} {...data} />;
}
