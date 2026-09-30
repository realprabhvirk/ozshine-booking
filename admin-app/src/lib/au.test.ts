import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidAbn, qldPublicHolidays } from "./au.ts";

test("ABN checksum", () => {
  assert.equal(isValidAbn("51 824 753 556"), true); // ATO's published example
  assert.equal(isValidAbn("51 824 753 557"), false);
  assert.equal(isValidAbn("1234"), false);
});

test("QLD holidays follow the rules", () => {
  const h = Object.fromEntries(qldPublicHolidays(2026).map((x) => [x.name, x.date]));
  assert.equal(h["Good Friday"], "2026-04-03");
  assert.equal(h["Easter Monday"], "2026-04-06");
  assert.equal(h["Labour Day"], "2026-05-04");
  assert.equal(h["King's Birthday"], "2026-10-05");
  assert.equal(h["Boxing Day (observed)"], "2026-12-28");
  const h27 = Object.fromEntries(qldPublicHolidays(2027).map((x) => [x.name, x.date]));
  assert.equal(h27["Good Friday"], "2027-03-26");
  assert.equal(h27["Christmas Day (observed)"], "2027-12-27");
  assert.equal(h27["Boxing Day (observed)"], "2027-12-28");
});
