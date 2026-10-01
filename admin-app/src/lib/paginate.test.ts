import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages, PAGE_ROWS, MAX_ROWS } from "./paginate.ts";

// A fake table with N rows and the same 1,000-row cap Supabase applies.
function table(n: number) {
  const calls: Array<[number, number]> = [];
  const page = async (a: number, b: number) => {
    calls.push([a, b]);
    const end = Math.min(b + 1, a + PAGE_ROWS, n);
    return { data: Array.from({ length: Math.max(0, end - a) }, (_, i) => a + i), error: null };
  };
  return { page, calls };
}

test("reads past the 1,000-row cap (history / invoices over a long range)", async () => {
  const t = table(2500);
  const rows = await fetchAllPages(t.page);
  assert.equal(rows.length, 2500);
  assert.deepEqual(rows.slice(-2), [2498, 2499]);
  assert.equal(t.calls.length, 3);
});

test("exactly 1,000 rows needs one extra (empty) page", async () => {
  const t = table(1000);
  assert.equal((await fetchAllPages(t.page)).length, 1000);
  assert.equal(t.calls.length, 2);
});

test("empty and small tables", async () => {
  assert.deepEqual(await fetchAllPages(table(0).page), []);
  assert.equal((await fetchAllPages(table(7).page)).length, 7);
});

test("stops at the safety ceiling", async () => {
  assert.equal((await fetchAllPages(table(MAX_ROWS + 5000).page)).length, MAX_ROWS);
});

test("errors surface instead of returning partial data", async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: { message: "boom" } })));
});
