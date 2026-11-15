/**
 * Email notifications. Emails only say "you have a new message/quote/booking" and link back
 * to Gather; they never include message bodies (those stay in Gather, visible only to the two
 * people in the conversation).
 *
 * demo mode:      written to the email_outbox table (viewable at /dev/outbox). Nothing is sent.
 * connected mode: sent with Resend's HTTP API, and also recorded in email_outbox with its status.
 *
 * A failed email never undoes the action that triggered it — it's recorded as failed instead.
 */
import { config } from "@/lib/config";
import type { Db } from "@/lib/db";
import { renderEmail, type EmailContent } from "@/lib/email/template";

export interface Notification {
  toEmail: string;
  toRole: "planner" | "owner";
  template: "enquiry_received" | "venue_replied" | "planner_replied" | "quote_sent" | "quote_declined" | "enquiry_declined" | "booking_confirmed" | "payment_failed" | "admin_contact" | "balance_paid" | "booking_cancelled" | "refund_confirmed" | "verify_email" | "password_reset";
  subject: string;
  /** Path inside Gather, e.g. /enquiries/<id>. Made absolute with APP_URL. */
  path: string;
  /** Optional body content for the branded template. Defaults: heading = subject, one generic line, "Open in Gather". */
  heading?: string;
  paragraphs?: string[];
  reference?: string;
  facts?: EmailContent["facts"];
  ctaLabel?: string;
  note?: string;
  preheader?: string;
  testPayment?: boolean;
  /**
   * The link carries a secret (reset or verification token). It's sent in the email, but in connected mode the
   * outbox log keeps the link and text with the secret removed. Demo mode keeps it so the outbox page can open it.
   */
  sensitiveLink?: boolean;
}

const DEFAULT_CTA: Record<Notification["template"], string> = {
  enquiry_received: "Open the enquiry",
  venue_replied: "Read the reply",
  planner_replied: "Read the message",
  quote_sent: "Review the quote",
  quote_declined: "Open the enquiry",
  enquiry_declined: "Find another venue",
  booking_confirmed: "View the booking",
  payment_failed: "Try the payment again",
  admin_contact: "Open Gather",
  balance_paid: "View the booking",
  booking_cancelled: "View the booking",
  refund_confirmed: "View the booking",
  verify_email: "Confirm my email",
  password_reset: "Choose a new password",
};

/** Sends one email and returns the provider's message id (for lookup in the Resend dashboard). */
export type ResendSender = (input: { apiKey: string; from: string; to: string; subject: string; text: string; html: string }) => Promise<string | null>;

export const sendWithResend: ResendSender = async ({ apiKey, from, to, subject, text, html }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!response.ok) {
    // Resend's error message says what's wrong (e.g. unverified domain) and never echoes the key.
    const detail = await response.json().then((b: { message?: string }) => b.message ?? "").catch(() => "");
    throw new Error(`Resend returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const body = (await response.json().catch(() => ({}))) as { id?: string };
  return body.id ?? null;
};

/** Seeded reviewer accounts use *.test addresses (RFC 2606: never deliverable). Don't send those to a real provider. */
export const isSyntheticAddress = (email: string) => /\.test$/i.test(email.trim());

/** Renders a notification with the shared branded template (HTML + plain text). */
export function renderNotification(n: Notification, appUrl: string, assetUrl: string = appUrl) {
  const link = `${appUrl}${n.path}`;
  return renderEmail(
    {
      preheader: n.preheader ?? n.subject,
      heading: n.heading ?? n.subject,
      paragraphs: n.paragraphs ?? ["Open it in Gather to see the details and reply."],
      reference: n.reference,
      facts: n.facts,
      cta: { label: n.ctaLabel ?? DEFAULT_CTA[n.template], url: link },
      note: n.note,
      testPayment: n.testPayment,
    },
    appUrl,
    assetUrl,
  );
}

/** What the email log keeps for a link that carries a secret: the page, but not the token in its #fragment. */
export function redactSecretLink(link: string, text: string) {
  const logLink = link.replace(/#.*$/, "#[link removed]");
  return { logLink, logText: text.split(link).join(logLink) };
}

/** Plain-text part only (kept for callers and tests that only need the text). */
export const renderText = (n: Notification, appUrl: string) => renderNotification(n, appUrl).text;

export async function notify(db: Db, n: Notification, send: ResendSender = sendWithResend): Promise<{ outboxId: string; status: string }> {
  const cfg = config();
  const link = `${cfg.appUrl}${n.path}`;
  const { html, text } = renderNotification(n, cfg.appUrl, cfg.assetUrl);
  const { logLink, logText } = n.sensitiveLink && cfg.email.kind !== "outbox" ? redactSecretLink(link, text) : { logLink: link, logText: text };
  const record = (provider: string, status: string, extra: { error?: string; providerId?: string | null } = {}) =>
    db.query<{ id: string }>(
      `insert into email_outbox (to_email, to_role, template, subject, link, provider, status, error, provider_id, body_text)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [n.toEmail, n.toRole, n.template, n.subject, logLink, provider, status, extra.error ?? null, extra.providerId ?? null, logText],
    ).then((rows) => ({ outboxId: rows[0].id, status }));
  if (cfg.email.kind === "outbox") return record("outbox", "logged");
  if (isSyntheticAddress(n.toEmail)) return record("resend", "skipped", { error: "synthetic .test address" });
  try {
    const id = await send({ apiKey: cfg.email.apiKey, from: cfg.email.from, to: n.toEmail, subject: n.subject, text, html });
    return record("resend", "sent", { providerId: id });
  } catch (error) {
    return record("resend", "failed", { error: String((error as Error).message).slice(0, 200) });
  }
}
