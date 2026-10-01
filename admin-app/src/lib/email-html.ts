// Branded HTML for outgoing emails. Templates stay plain text (staff edit them
// in Messages → Wording); this wraps the rendered text in the OzShine layout:
// dark header with the logo, red accent, readable body, links as buttons, and
// the shop's details in the footer. Plain text is still sent alongside.
// No "@/..." imports so the Node test runner can load this file directly.

export type EmailBrand = {
  businessName: string;
  address: string | null;
  phone: string | null;
  siteUrl: string;
};

const RED = "#c61b1f";
const INK = "#18181b";
const MUTED = "#52525b";
const FAINT = "#a1a1aa";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buttonLabel(url: string): string {
  if (/google\.|g\.page|goo\.gl|maps\.app/i.test(url)) return "Leave a Google review";
  if (/#feedback\b/.test(url)) return "Rate your visit";
  if (/\/r\/[0-9a-f-]{36}/i.test(url)) return "View your receipt";
  if (/\/manage\/[0-9a-f-]{36}/i.test(url)) return "View or change your booking";
  return "Open link";
}

function button(url: string) {
  const href = esc(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:${RED}" bgcolor="${RED}"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(buttonLabel(url))}</a></td></tr></table>`;
}

// Escape a line and turn any web address inside it into a link.
function inline(line: string) {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    out += esc(line.slice(last, m.index));
    out += `<a href="${esc(m[0])}" target="_blank" style="color:${RED};font-weight:600">${esc(m[0])}</a>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + esc(line.slice(last));
}

const para = (html: string, extra = "") =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};${extra}">${html}</p>`;

// Body text → HTML blocks. A line that is only a web address becomes a button.
export function bodyBlocks(text: string): string {
  const blocks: string[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/)) {
    let lines: string[] = [];
    const flush = () => {
      if (lines.length) blocks.push(para(lines.map(inline).join("<br>")));
      lines = [];
    };
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (/^https?:\/\/\S+$/.test(line)) {
        flush();
        blocks.push(button(line));
      } else if (line) {
        lines.push(line);
      }
    }
    flush();
  }
  return blocks.join("");
}

export function renderEmailHtml({ subject, body, brand }: { subject: string; body: string; brand: EmailBrand }): string {
  const site = brand.siteUrl.replace(/\/+$/, "");
  const preheader = body.replace(URL_RE, "").split("\n").map((l) => l.trim()).filter((l) => l && !/^hi\b/i.test(l))[0] ?? "";
  const tel = brand.phone ? brand.phone.replace(/[^\d+]/g, "") : "";
  const footer = [
    `<strong style="color:${MUTED}">${esc(brand.businessName)}</strong>`,
    brand.address ? esc(brand.address) : null,
    brand.phone ? `<a href="tel:${esc(tel)}" style="color:${MUTED};text-decoration:none">${esc(brand.phone)}</a>` : null,
    `<a href="${esc(site)}" target="_blank" style="color:${MUTED}">Book online</a>`,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5" bgcolor="#f4f4f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background:#f4f4f5">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-radius:16px;overflow:hidden;background:#ffffff" bgcolor="#ffffff">
    <tr><td align="center" bgcolor="#0f1013" style="background:#0f1013;padding:28px 24px">
      <a href="${esc(site)}" target="_blank"><img src="${esc(site)}/email-logo.png" width="180" height="38" alt="${esc(brand.businessName)}" style="display:block;border:0;width:180px;height:auto"></a>
    </td></tr>
    <tr><td height="4" bgcolor="${RED}" style="background:${RED};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:32px 32px 16px">${bodyBlocks(body)}</td></tr>
    <tr><td style="padding:20px 32px 28px;border-top:1px solid #e4e4e7">
      <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${FAINT}">${footer}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
