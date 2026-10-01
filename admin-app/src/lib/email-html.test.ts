import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyBlocks, buttonLabel, renderEmailHtml } from "./email-html.ts";

const brand = { businessName: "OzShine Hand Car Wash", address: "114-118 George St, Beenleigh", phone: "0449 558 449", siteUrl: "https://ozshine-booking.vercel.app" };

test("a line that is only a link becomes a labelled button", () => {
  const html = bodyBlocks("Hi Jess,\n\nA quick Google review helps:\nhttps://g.page/r/abc/review\n\nThe OzShine team");
  assert.match(html, /<a href="https:\/\/g\.page\/r\/abc\/review"[^>]*>Leave a Google review<\/a>/);
  assert.match(html, /A quick Google review helps:/);
  assert.match(html, /The OzShine team/);
});

test("button labels follow the link", () => {
  assert.equal(buttonLabel("https://ozshine-booking.vercel.app/r/9ce8b3fb-32b3-4204-b2d8-e106cb908bfe"), "View your receipt");
  assert.equal(buttonLabel("https://ozshine-booking.vercel.app/manage/9ce8b3fb-32b3-4204-b2d8-e106cb908bfe"), "View or change your booking");
  assert.equal(buttonLabel("https://ozshine-booking.vercel.app/manage/9ce8b3fb-32b3-4204-b2d8-e106cb908bfe#feedback"), "Rate your visit");
  assert.equal(buttonLabel("https://www.google.com/maps/place/x"), "Leave a Google review");
});

test("text is escaped and links inside sentences stay links", () => {
  const html = bodyBlocks("Fish & chips <b>later</b>, see https://example.com/x.");
  assert.match(html, /Fish &amp; chips &lt;b&gt;later&lt;\/b&gt;/);
  assert.match(html, /<a href="https:\/\/example\.com\/x"/);
});

test("full email has logo, shop details and the subject", () => {
  const html = renderEmailHtml({ subject: "Thanks for visiting, Jess", body: "Hi Jess,\n\nThanks!", brand });
  assert.match(html, /<title>Thanks for visiting, Jess<\/title>/);
  assert.match(html, /src="https:\/\/ozshine-booking\.vercel\.app\/email-logo\.png"/);
  assert.match(html, /114-118 George St, Beenleigh/);
  assert.match(html, /href="tel:0449558449"/);
});
