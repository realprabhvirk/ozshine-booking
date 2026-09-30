import { test } from "node:test";
import assert from "node:assert/strict";
import { guessMapping, normaliseVehicleType, parseCsv, toCsv } from "./csv.ts";

test("parses quotes, commas, newlines, CRLF and BOM", () => {
  const rows = parseCsv('﻿Name,Phone,Notes\r\n"Nguyen, Jess",0412 345 678,"said ""hi""\nsecond line"\r\n\r\nSam,0400000000,\n');
  assert.deepEqual(rows, [
    ["Name", "Phone", "Notes"],
    ["Nguyen, Jess", "0412 345 678", 'said "hi"\nsecond line'],
    ["Sam", "0400000000", ""],
  ]);
});

test("round-trips and neutralises formulas", () => {
  const csv = toCsv([["a,b", 'q"t', "=SUM(A1)", "+61400", 5, null]]);
  assert.equal(csv, `"a,b","q""t",'=SUM(A1),'+61400,5,`);
  assert.deepEqual(parseCsv(csv)[0].slice(0, 2), ["a,b", 'q"t']);
});

test("guesses column mapping", () => {
  const m = guessMapping(["Customer Name", "Mobile", "E-mail", "Registration", "Vehicle", "Last Visit"]);
  assert.deepEqual([m.name, m.phone, m.email, m.rego, m.make_model, m.last_visit], [0, 1, 2, 3, 4, 5]);
  const fl = guessMapping(["First Name", "Surname", "Phone"]);
  assert.deepEqual([fl.first, fl.last, fl.phone], [0, 1, 2]);
});

test("vehicle type words", () => {
  assert.equal(normaliseVehicleType("SUV"), "4wd");
  assert.equal(normaliseVehicleType("Hatchback"), "small_wagon");
  assert.equal(normaliseVehicleType("People mover"), "van");
  assert.equal(normaliseVehicleType("Sedan"), "sedan");
  assert.equal(normaliseVehicleType(""), "");
});
