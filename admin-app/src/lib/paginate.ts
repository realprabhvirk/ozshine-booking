// Supabase returns at most 1,000 rows per request, so long date ranges are
// read in pages. `page(from, to)` must build a fresh, stably ordered query
// (always end the order with a unique column such as id).
import { toAppError } from "./core/errors.ts";

export const PAGE_ROWS = 1000;
export const MAX_ROWS = 20000;

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE_ROWS) {
    const res = await page(start, start + PAGE_ROWS - 1);
    if (res.error) throw toAppError(res.error);
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) break;
  }
  return out;
}
