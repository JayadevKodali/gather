"use server";
import { redirect } from "next/navigation";
import { attempt, intOrNull, poundsToPence, text, withParam } from "@/lib/actions-util";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DEMO_CARDS } from "@/lib/adapters/payments";
import { cancelBooking, getBookingForParty, startBalanceCheckout } from "@/lib/services/booking-money";
import { cancelDemoCheckout, failCheckout, fulfilCheckout, getCheckoutForPlanner, startCheckout } from "@/lib/services/checkout";
import { declineEnquiry, declineQuote, postMessage, sendQuote } from "@/lib/services/enquiries";
import { isDemo } from "@/lib/config";

const page = (id: string) => `/enquiries/${id}`;

export async function messageAction(form: FormData) {
  const id = text(form, "enquiryId");
  const db = await getDb();
  const actor = await getActor();
  await attempt(() => postMessage(db, actor, id, text(form, "body"), text(form, "quoteId") || null), page(id));
  redirect(`${withParam(page(id), "ok", "Message sent. We've emailed them to say there's a reply.")}#thread`);
}

export async function declineEnquiryAction(form: FormData) {
  const id = text(form, "enquiryId");
  const db = await getDb();
  const actor = await getActor();
  await attempt(() => declineEnquiry(db, actor, id, text(form, "reason")), page(id));
  redirect(withParam(page(id), "ok", "Enquiry declined. The planner has been told."));
}

export async function sendQuoteAction(form: FormData) {
  const id = text(form, "enquiryId");
  const lines: { label: string; amountPence: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const label = text(form, `label_${i}`);
    const amount = text(form, `amount_${i}`);
    if (!label && !amount) continue; // blank rows are ignored
    const pence = poundsToPence(amount);
    lines.push({ label, amountPence: pence ?? NaN });
  }
  const deposit = poundsToPence(text(form, "deposit"));
  const db = await getDb();
  const actor = await getActor();
  const balanceDueDays = intOrNull(text(form, "balanceDueDays"));
  const cancellationCutoffDays = intOrNull(text(form, "cancellationCutoffDays"));
  const quote = await attempt(
    () => sendQuote(db, actor, id, { lines, depositPence: deposit ?? NaN, balanceDueDays: balanceDueDays ?? undefined, cancellationCutoffDays: cancellationCutoffDays ?? undefined }),
    `${page(id)}#compose`,
  );
  redirect(withParam(page(id), "ok", `Quote ${quote.reference} sent. The planner has been emailed.`));
}

/**
 * Declining a quote asks first (design pass 3.12): the first press only opens "Decline this quote? The venue
 * will be told." with the optional reason, Decline and Keep. Nothing is declined until that confirmation
 * (confirm=yes) arrives. The reason is typed in the confirmation box and sent in the form body, never in
 * the page address (fix 4).
 */
export async function declineQuoteAction(form: FormData) {
  const id = text(form, "enquiryId");
  const quoteId = text(form, "quoteId");
  if (text(form, "confirm") !== "yes") redirect(`${withParam(page(id), "confirmDecline", quoteId)}#decline`);
  const db = await getDb();
  const actor = await getActor();
  await attempt(() => declineQuote(db, actor, id, quoteId, text(form, "reason")), page(id));
  redirect(withParam(page(id), "ok", "Quote declined. The venue has been told."));
}

export async function payDepositAction(form: FormData) {
  const id = text(form, "enquiryId");
  const db = await getDb();
  const actor = await getActor();
  const { url } = await attempt(() => startCheckout(db, actor, id, text(form, "quoteId")), page(id));
  redirect(url);
}

/** Demo payment page: the planner "pays" with a test card number. */
export async function demoPayAction(form: FormData) {
  const checkoutId = text(form, "checkoutId");
  const back = `/checkout/demo/${checkoutId}`;
  if (!isDemo()) redirect(withParam(back, "error", "Demo payments are off in connected mode."));
  const db = await getDb();
  const actor = await getActor();
  const checkout = await attempt(() => getCheckoutForPlanner(db, actor, checkoutId), "/enquiries");
  if (checkout.status !== "pending" || !checkout.provider_session_id) redirect(`/checkout/return/${checkoutId}`);
  const card = text(form, "card").replace(/\s/g, "");
  if (card === DEMO_CARDS.success || card === DEMO_CARDS.refundFails) {
    // The demo "payment id" records which card was used, so a later refund behaves like Stripe's test card.
    const paymentIntentId = card === DEMO_CARDS.refundFails ? `demo_pi_refundfail_${checkout.id}` : `demo_pi_${checkout.id}`;
    await fulfilCheckout(db, { providerSessionId: checkout.provider_session_id, amountPence: checkout.amount_pence, currency: "GBP", paymentIntentId });
  } else if (card === DEMO_CARDS.decline) {
    await failCheckout(db, checkout.provider_session_id, "Card declined (demo card 4000 0000 0000 0002)");
  } else {
    redirect(withParam(back, "error", "Use one of the demo cards shown on this page."));
  }
  redirect(`/checkout/return/${checkoutId}`);
}

export async function demoCancelAction(form: FormData) {
  const checkoutId = text(form, "checkoutId");
  const db = await getDb();
  const actor = await getActor();
  const checkout = await attempt(() => getCheckoutForPlanner(db, actor, checkoutId), "/enquiries");
  await attempt(() => cancelDemoCheckout(db, actor, checkoutId), `/checkout/demo/${checkoutId}`);
  redirect(withParam(page(checkout.enquiry_id), "notice", "Payment cancelled. Nothing was charged and the date is no longer held for you."));
}

/** My bookings → Pay remaining balance: a second checkout for the same booking. */
export async function payBalanceAction(form: FormData) {
  const bookingId = text(form, "bookingId");
  const db = await getDb();
  const actor = await getActor();
  const back = text(form, "back") || "/bookings";
  const { url } = await attempt(() => startBalanceCheckout(db, actor, bookingId), back);
  redirect(url);
}

/** Cancel a booking after the person has seen and confirmed the refund preview. */
export async function cancelBookingAction(form: FormData) {
  const bookingId = text(form, "bookingId");
  const db = await getDb();
  const actor = await getActor();
  const { booking } = await attempt(() => getBookingForParty(db, actor, bookingId), "/bookings");
  await attempt(() => cancelBooking(db, actor, bookingId, text(form, "expected")), `/bookings/${bookingId}/cancel`);
  redirect(withParam(page(booking.enquiry_id), "ok", "Booking cancelled. Both of you have been emailed, and any refund is on its way."));
}
