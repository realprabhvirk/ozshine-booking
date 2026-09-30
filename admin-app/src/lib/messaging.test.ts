import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSegment, describeSegment, renderTemplate, sampleVars, smsSegments, toE164, unknownPlaceholders } from "./messaging.ts";

test("renderTemplate matches the database: fills known keys, blanks unknown ones", () => {
  assert.equal(renderTemplate("Hi {{first_name}}, ref {{reference}} {{nope}}!", { first_name: "Jess", reference: "OZ-7K3P" }), "Hi Jess, ref OZ-7K3P !");
  assert.equal(renderTemplate("{{first_name}} {{first_name}}", { first_name: "A" }), "A A");
  assert.match(renderTemplate("Hi {{first_name}}", sampleVars()), /^Hi Jess$/);
});

test("unknownPlaceholders flags typos", () => {
  assert.deepEqual(unknownPlaceholders("Hi {{first_name}} {{frist_name}} {{ date }}"), ["frist_name"]);
});

test("smsSegments: GSM-7 vs UCS-2 and multipart sizes", () => {
  assert.deepEqual(smsSegments("a".repeat(160)), { encoding: "GSM-7", length: 160, segments: 1, perSegment: 160 });
  assert.equal(smsSegments("a".repeat(161)).segments, 2);
  assert.equal(smsSegments("€".repeat(80)).length, 160); // extension chars count double
  assert.equal(smsSegments("You’re booked").encoding, "UCS-2"); // curly apostrophe
  assert.equal(smsSegments("x".repeat(71) + "’").segments, 2);
  assert.equal(smsSegments("").segments, 0);
});

test("toE164 handles the stored AU format and rejects junk", () => {
  assert.equal(toE164("0412345678"), "+61412345678");
  assert.equal(toE164("+61 412 345 678"), "+61412345678");
  assert.equal(toE164("61733334444"), "+61733334444");
  assert.equal(toE164("12345"), null);
  assert.equal(toE164(null), null);
});

test("segments are cleaned and described", () => {
  assert.deepEqual(cleanSegment({ min_visits: 0, lapsed_days: 60, tag: " Fleet ", vip_only: false }), { lapsed_days: 60, tag: "fleet" });
  assert.equal(describeSegment({}), "Everyone who's opted in");
  assert.equal(describeSegment({ min_visits: 6, lapsed_days: 60 }), "6+ visits, not seen in 60 days");
});
