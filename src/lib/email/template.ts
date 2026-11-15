/**
 * Gather's one branded email layout. Every notification (and Amara's admin contacts) goes through it,
 * so all emails share the same look: logo, heading, short paragraphs, an optional facts table, one
 * button, and a footer. Each email has an HTML part and a plain-text part with the same content.
 *
 * Rules: links are absolute (APP_URL), there is exactly one call to action, user-written text is escaped,
 * and payment emails in test mode say plainly that no real money moved.
 */
export interface EmailContent {
  /** Shown by inbox previews next to the subject. Keep it under ~90 characters. */
  preheader: string;
  heading: string;
  /** Short paragraphs of plain text. */
  paragraphs: string[];
  /** Booking, quote or enquiry reference, shown under the heading. */
  reference?: string;
  /** Label/value rows, e.g. the balance breakdown. */
  facts?: [label: string, value: string][];
  cta: { label: string; url: string };
  /** Muted line under the button. */
  note?: string;
  /** Adds a visible "Test payment" label. */
  testPayment?: boolean;
}

const C = { paper: "#f3efe6", surface: "#fbf9f4", ink: "#24272b", soft: "#555b56", forest: "#1e4a3a", line: "#d9d2c4", amberTint: "#fbefd9", amber: "#8a5a12" };
const FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const TEST_LABEL = "Test payment: Gather is in Stripe test mode, so no real money moved.";

/** `assetUrl` is where the logo is loaded from (the public site); it defaults to `appUrl`. */
export function renderEmail(content: EmailContent, appUrl: string, assetUrl: string = appUrl): { html: string; text: string } {
  if (!/^https?:\/\//.test(content.cta.url)) throw new Error("Email links must be absolute");
  const e = escapeHtml;
  const para = (p: string) => `<p style="margin:0 0 14px;font:15px/1.55 ${FONT};color:${C.ink}">${e(p).replace(/\n/g, "<br>")}</p>`;
  const facts = content.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:collapse">${content.facts
        .map(([k, v], i) => `<tr><td style="padding:8px 0;border-top:${i ? `1px solid ${C.line}` : "0"};font:14px/1.4 ${FONT};color:${C.soft}">${e(k)}</td><td align="right" style="padding:8px 0;border-top:${i ? `1px solid ${C.line}` : "0"};font:600 14px/1.4 ${FONT};color:${C.ink}">${e(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const test = content.testPayment
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:${C.amberTint};border-radius:8px;font:600 13px/1.45 ${FONT};color:${C.amber}">${e(TEST_LABEL)}</p>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(content.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px"><a href="${e(appUrl)}/"><img src="${e(assetUrl)}/brand/gather-logo.png" width="113" height="32" alt="Gather" style="display:block;border:0"></a></td></tr>
<tr><td style="background:${C.surface};border:1px solid ${C.line};border-radius:14px;padding:28px 26px">
<h1 style="margin:0 0 6px;font:400 26px/1.2 Georgia,'Times New Roman',serif;color:${C.forest}">${e(content.heading)}</h1>
${content.reference ? `<p style="margin:0 0 18px;font:13px/1.4 ${FONT};color:${C.soft}">Reference ${e(content.reference)}</p>` : `<div style="height:12px"></div>`}
${test}${content.paragraphs.map(para).join("\n")}${facts}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td style="background:${C.forest};border-radius:8px"><a href="${e(content.cta.url)}" style="display:inline-block;padding:12px 20px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none">${e(content.cta.label)}</a></td></tr></table>
${content.note ? `<p style="margin:14px 0 0;font:13px/1.5 ${FONT};color:${C.soft}">${e(content.note)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 6px 0;font:12px/1.5 ${FONT};color:${C.soft}">Gather is a free 30-day pilot for booking London venues. Replies happen in Gather so both sides keep one record. You'll be asked to sign in when you open the link.</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    content.heading,
    content.reference ? `Reference ${content.reference}` : null,
    "",
    content.testPayment ? `${TEST_LABEL}\n` : null,
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.facts?.length ? [...content.facts.map(([k, v]) => `${k}: ${v}`), ""] : []),
    `${content.cta.label}: ${content.cta.url}`,
    content.note ? `\n${content.note}` : null,
    "",
    "— Gather",
    "Replies happen in Gather so both sides keep one record. You'll be asked to sign in when you open the link.",
  ].filter((l) => l !== null).join("\n");
  return { html, text };
}
