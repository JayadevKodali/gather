/**
 * Balance payments, cancellations and refunds against a real (in-memory) Postgres with the real migrations.
 * Uses the payment-test venue's owner (Sam) and a fresh event date per test.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { demoPayments, type PaymentProvider } from "@/lib/adapters/payments";
import { createPgliteDb, migrate, type Db } from "@/lib/db";
import { addDays, cancellationTerms, daysBeforeEvent, londonToday, planCancellation } from "@/lib/payments/policy";
import { seedAccountsAndVenues } from "@/lib/seed";
import { createBrief, getBrief, updateBriefFields } from "@/lib/services/briefs";
import { adminMetrics } from "@/lib/services/admin";
import { listBookings } from "@/lib/services/bookings";
import { applyRefundUpdate, bookingMoney, cancelBooking, cancellationPreview, getBookingForParty, resolveRefund, startBalanceCheckout } from "@/lib/services/booking-money";
import { fulfilCheckout, startCheckout } from "@/lib/services/checkout";
import { createEnquiry, getEnquiryThread, listEnquiries, postMessage, sendQuote } from "@/lib/services/enquiries";
import type { Actor } from "@/lib/services/errors";
import { setDays } from "@/lib/services/listings";

let db: Db;
let actors: Map<string, Actor>;
const A = (email: string) => actors.get(email)!;
let roomId: string;
const planner = () => A("planner@gather.test");
const owner = () => A("owner@gather.test");

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  actors = await seedAccountsAndVenues(db, "test-password-123");
  [{ id: roomId }] = await db.query<{ id: string }>("select id from listings where slug = 'v90-gather-test-room'");
});

let offset = 30;
/** A booking with a paid deposit on a fresh date `daysAhead` from today (London). */
async function bookedDeposit(opts: { daysAhead?: number; total?: number; deposit?: number; cutoff?: number; card?: "ok" | "refundfail" } = {}) {
  const date = addDays(londonToday(), opts.daysAhead ?? offset++);
  await setDays(db, owner(), roomId, { from: date, to: date, state: "open" });
  const briefId = await createBrief(db, planner(), `Party for 40 standing in Finsbury Park on ${date}`);
  const brief = await getBrief(db, planner(), briefId);
  await updateBriefFields(db, planner(), briefId, { ...brief.confirmed, date, guests: 40, layout: "standing", boroughs: ["Haringey"], facilities: {}, budget: { mode: "none", amountPence: null, basis: "total" } });
  const enquiryId = await createEnquiry(db, planner(), { briefId, listingId: roomId, extras: [], message: "" });
  const quote = await sendQuote(db, owner(), enquiryId, {
    lines: [{ label: "Hire", amountPence: opts.total ?? 100_000 }], depositPence: opts.deposit ?? 20_000, balanceDueDays: 7, cancellationCutoffDays: opts.cutoff ?? 14,
  });
  const { checkoutId } = await startCheckout(db, planner(), enquiryId, quote.id, demoPayments);
  const [c] = await db.query<{ provider_session_id: string; amount_pence: number }>("select provider_session_id, amount_pence from checkouts where id = $1", [checkoutId]);
  const pi = opts.card === "refundfail" ? `demo_pi_refundfail_${checkoutId}` : `demo_pi_${checkoutId}`;
  const res = await fulfilCheckout(db, { providerSessionId: c.provider_session_id, amountPence: Number(c.amount_pence), currency: "GBP", paymentIntentId: pi }, demoPayments);
  if (res.status !== "booked") throw new Error(`not booked: ${JSON.stringify(res)}`);
  return { bookingId: res.bookingId, enquiryId, date, quoteId: quote.id };
}

async function payBalance(bookingId: string, card: "ok" | "refundfail" = "ok") {
  const { checkoutId } = await startBalanceCheckout(db, planner(), bookingId, demoPayments);
  const [c] = await db.query<{ provider_session_id: string; amount_pence: number }>("select provider_session_id, amount_pence from checkouts where id = $1", [checkoutId]);
  const event = { providerSessionId: c.provider_session_id, amountPence: Number(c.amount_pence), currency: "GBP", paymentIntentId: `demo_pi_${card === "refundfail" ? "refundfail_" : ""}${checkoutId}` };
  return { checkoutId, event, result: await fulfilCheckout(db, event, demoPayments) };
}

const emails = (bookingRef: string, template: string) =>
  db.query<{ to_role: string; body_text: string }>("select to_role, body_text from email_outbox where template = $1 and subject like $2", [template, `%${bookingRef}%`]);
const ref = async (bookingId: string) => (await db.query<{ reference: string }>("select reference from bookings where id = $1", [bookingId]))[0].reference;
const refundsOf = (bookingId: string) => db.query<{ status: string; amount_pence: number; kind: string }>(
  "select r.status, r.amount_pence, c.kind from refunds r join checkouts c on c.id = r.checkout_id where r.booking_id = $1 order by c.created_at", [bookingId]);

describe("cancellation rule (14-day cutoff, London calendar days)", () => {
  const pay = [{ checkoutId: "d", kind: "deposit" as const, amountPence: 20_000 }];
  const at = (days: number) => planCancellation({ by: "planner", cutoffDays: 14, eventDate: addDays(londonToday(), days), payments: pay });
  it("15 or more days before refunds the deposit; 14 (exactly on the cutoff) and fewer keeps it", () => {
    expect(at(15)).toMatchObject({ outcome: "full_refund", refundPence: 20_000, retainedPence: 0 });
    expect(at(14)).toMatchObject({ outcome: "deposit_retained", refundPence: 0, retainedPence: 20_000 });
    expect(at(13)).toMatchObject({ outcome: "deposit_retained", retainedPence: 20_000 });
  });
  it("counts days in London time, not the server's", () => {
    // 23:30 UTC on 31 Mar 2027 is already 1 Apr in London (BST).
    expect(londonToday(new Date("2027-03-31T23:30:00Z"))).toBe("2027-04-01");
    expect(daysBeforeEvent("2027-04-15", new Date("2027-03-31T23:30:00Z"))).toBe(14);
  });
  it("the venue cancelling always refunds everything; older bookings without terms go to review", () => {
    expect(planCancellation({ by: "owner", cutoffDays: 14, eventDate: addDays(londonToday(), 2), payments: pay })).toMatchObject({ refundPence: 20_000, retainedPence: 0 });
    expect(planCancellation({ by: "planner", cutoffDays: null, eventDate: addDays(londonToday(), 2), payments: pay })).toMatchObject({ outcome: "manual_review", reviewPence: 20_000, retainedPence: 0 });
    expect(cancellationTerms(14)).toMatch(/15 or more days before.*14 days or fewer/);
  });
});

describe("terms are saved with the quote and the booking", () => {
  it("the booking copies the quote's terms; a later quote with different terms doesn't change it", async () => {
    const { bookingId } = await bookedDeposit({ cutoff: 21 });
    const { booking } = await getBookingForParty(db, planner(), bookingId);
    expect(booking.cancellation_cutoff_days).toBe(21);
    expect(booking.cancellation_terms).toMatch(/22 or more days/);
    expect(booking.balance_due_date).toBeTruthy();
    await bookedDeposit({ cutoff: 3 }); // the venue uses different terms on a later quote
    expect((await getBookingForParty(db, planner(), bookingId)).booking.cancellation_cutoff_days).toBe(21);
  });
});

describe("remaining balance through Gather", () => {
  it("is calculated on the server, paid in a second checkout, and only then marked paid in full (once)", async () => {
    const { bookingId } = await bookedDeposit({ total: 100_000, deposit: 25_000 });
    const before = await bookingMoney(db, (await getBookingForParty(db, planner(), bookingId)).booking);
    expect(before).toMatchObject({ paidPence: 25_000, remainingPence: 75_000, paidInFull: false });
    const { event, result } = await payBalance(bookingId);
    expect(result).toMatchObject({ status: "balance_paid", alreadyProcessed: false });
    const after = await bookingMoney(db, (await getBookingForParty(db, planner(), bookingId)).booking);
    expect(after).toMatchObject({ paidPence: 100_000, remainingPence: 0, paidInFull: true });
    // Duplicate webhook: no second payment, no second email.
    expect(await fulfilCheckout(db, event, demoPayments)).toMatchObject({ alreadyProcessed: true });
    expect((await emails(await ref(bookingId), "balance_paid")).map((e) => e.to_role).sort()).toEqual(["owner", "planner"]);
    await expect(startBalanceCheckout(db, planner(), bookingId, demoPayments)).rejects.toThrow(/already paid in full/);
  });

  it("only the booking's planner can pay it; a declined balance leaves the booking confirmed and can be retried", async () => {
    const { bookingId } = await bookedDeposit();
    await expect(startBalanceCheckout(db, A("maya@gather.test"), bookingId, demoPayments)).rejects.toThrow(/not found/);
    await expect(startBalanceCheckout(db, owner(), bookingId, demoPayments)).rejects.toThrow(/planner/);
    const first = await startBalanceCheckout(db, planner(), bookingId, demoPayments);
    const again = await startBalanceCheckout(db, planner(), bookingId, demoPayments); // double click / retry
    expect(again.checkoutId).toBe(first.checkoutId);
    await db.query("update checkouts set status = 'failed', failure_reason = 'Card declined' where id = $1", [first.checkoutId]); // declined
    expect((await getBookingForParty(db, planner(), bookingId)).booking.status).toBe("confirmed");
    const { result } = await payBalance(bookingId);
    expect(result.status).toBe("balance_paid");
  });

  it("a deposit that covers the full amount is paid in full straight away, with no second checkout", async () => {
    const { bookingId } = await bookedDeposit({ total: 50_000, deposit: 50_000 });
    expect((await getBookingForParty(db, planner(), bookingId)).booking.paid_in_full_at).not.toBeNull();
    await expect(startBalanceCheckout(db, planner(), bookingId, demoPayments)).rejects.toThrow(/already paid in full/);
  });
});

describe("cancellations and refunds", () => {
  const cancel = async (who: Actor, bookingId: string) => {
    const { fingerprint } = await cancellationPreview(db, who, bookingId);
    return cancelBooking(db, who, bookingId, fingerprint, demoPayments);
  };

  it("venue cancels after the deposit only: the deposit is refunded and the date is free again", async () => {
    const { bookingId, date } = await bookedDeposit();
    const preview = await cancellationPreview(db, owner(), bookingId);
    expect(preview.plan).toMatchObject({ refundPence: 20_000, retainedPence: 0 });
    await cancelBooking(db, owner(), bookingId, preview.fingerprint, demoPayments);
    expect(await refundsOf(bookingId)).toEqual([{ status: "succeeded", amount_pence: 20_000, kind: "deposit" }]);
    const reference = await ref(bookingId);
    expect((await emails(reference, "booking_cancelled")).length).toBe(2);
    expect((await emails(reference, "refund_confirmed")).length).toBe(2);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from bookings where listing_id = $1 and event_date = $2 and status = 'confirmed'", [roomId, date]);
    expect(n).toBe(0);
    // The date can be booked again by someone else.
    await expect(db.query("insert into bookings (reference, enquiry_id, quote_id, checkout_id, listing_id, planner_id, event_date, total_pence, deposit_pence) select 'BK-TEST1', enquiry_id, quote_id, checkout_id, listing_id, planner_id, event_date, total_pence, deposit_pence from bookings where id = $1 and false", [bookingId])).resolves.toBeTruthy();
  });

  it("venue cancels after full payment: both the deposit and the balance are refunded", async () => {
    const { bookingId } = await bookedDeposit();
    await payBalance(bookingId);
    await cancel(owner(), bookingId);
    expect((await refundsOf(bookingId)).map((r) => `${r.kind}:${r.status}:${r.amount_pence}`)).toEqual(["deposit:succeeded:20000", "balance:succeeded:80000"]);
  });

  it("planner cancels 15 days before (before the cutoff): deposit refunded", async () => {
    const { bookingId } = await bookedDeposit({ daysAhead: 15 });
    expect((await cancellationPreview(db, planner(), bookingId)).plan).toMatchObject({ daysBefore: 15, outcome: "full_refund", refundPence: 20_000 });
    await cancel(planner(), bookingId);
    expect(await refundsOf(bookingId)).toEqual([{ status: "succeeded", amount_pence: 20_000, kind: "deposit" }]);
  });

  it("planner cancels exactly on the cutoff (14 days) after paying in full: the venue keeps the deposit, the balance is refunded", async () => {
    const { bookingId } = await bookedDeposit({ daysAhead: 14 });
    await payBalance(bookingId);
    const { plan } = await cancellationPreview(db, planner(), bookingId);
    expect(plan).toMatchObject({ daysBefore: 14, outcome: "deposit_retained", refundPence: 80_000, retainedPence: 20_000 });
    await cancel(planner(), bookingId);
    expect(await refundsOf(bookingId)).toEqual([{ status: "succeeded", amount_pence: 80_000, kind: "balance" }]);
    expect((await getBookingForParty(db, owner(), bookingId)).booking).toMatchObject({ status: "cancelled", cancelled_by: "planner", retained_pence: 20_000 });
  });

  it("planner cancels after the cutoff (3 days before) with a balance still open: deposit kept, collection stopped", async () => {
    const { bookingId } = await bookedDeposit({ daysAhead: 3 });
    const open = await startBalanceCheckout(db, planner(), bookingId, demoPayments);
    await cancel(planner(), bookingId);
    expect(await refundsOf(bookingId)).toEqual([]);
    const [c] = await db.query<{ status: string }>("select status from checkouts where id = $1", [open.checkoutId]);
    expect(c.status).toBe("cancelled");
    await expect(startBalanceCheckout(db, planner(), bookingId, demoPayments)).rejects.toThrow(/cancelled/);
  });

  it("a balance payment that completes just after cancellation is refunded automatically", async () => {
    const { bookingId } = await bookedDeposit({ daysAhead: 40 });
    const { checkoutId } = await startBalanceCheckout(db, planner(), bookingId, demoPayments);
    const [c] = await db.query<{ provider_session_id: string; amount_pence: number }>("select provider_session_id, amount_pence from checkouts where id = $1", [checkoutId]);
    await cancel(owner(), bookingId); // cancels while the planner is on the payment page
    await fulfilCheckout(db, { providerSessionId: c.provider_session_id, amountPence: Number(c.amount_pence), currency: "GBP", paymentIntentId: `demo_pi_${checkoutId}` }, demoPayments);
    expect((await refundsOf(bookingId)).map((r) => `${r.kind}:${r.status}`)).toEqual(["deposit:succeeded", "balance:succeeded"]);
  });

  it("repeat clicks and two tabs can't cancel or refund twice", async () => {
    const { bookingId } = await bookedDeposit();
    const { fingerprint } = await cancellationPreview(db, owner(), bookingId);
    const [a, b] = await Promise.all([cancelBooking(db, owner(), bookingId, fingerprint, demoPayments), cancelBooking(db, owner(), bookingId, fingerprint, demoPayments)]);
    expect([a.alreadyCancelled, b.alreadyCancelled].sort()).toEqual([false, true]);
    expect((await refundsOf(bookingId)).length).toBe(1);
    expect((await emails(await ref(bookingId), "booking_cancelled")).length).toBe(2);
  });

  it("refuses a confirmation whose numbers no longer match (e.g. the cutoff passed meanwhile)", async () => {
    const { bookingId } = await bookedDeposit({ daysAhead: 20 });
    await expect(cancelBooking(db, planner(), bookingId, "full_refund:1:0:0", demoPayments)).rejects.toThrow(/review them again/);
    expect((await getBookingForParty(db, planner(), bookingId)).booking.status).toBe("confirmed");
  });

  it("a failed refund is shown as failed, and the admin can retry it; a repeated Stripe event changes nothing", async () => {
    const { bookingId } = await bookedDeposit({ card: "refundfail" });
    await cancel(owner(), bookingId);
    const [r] = await db.query<{ id: string; status: string; provider_refund_id: string | null }>("select id, status, provider_refund_id from refunds where booking_id = $1", [bookingId]);
    expect(r.status).toBe("failed");
    expect((await emails(await ref(bookingId), "refund_confirmed")).length).toBe(0);
    await expect(resolveRefund(db, owner(), r.id, "retry", demoPayments)).rejects.toThrow(/admin/);
    // Pretend the card is fixed on retry.
    await db.query("update checkouts set payment_intent_id = replace(payment_intent_id, 'refundfail_', '') where id = (select checkout_id from refunds where id = $1)", [r.id]);
    await resolveRefund(db, A("admin@gather.test"), r.id, "retry", demoPayments);
    const [after] = await db.query<{ status: string; provider_refund_id: string }>("select status, provider_refund_id from refunds where booking_id = $1", [bookingId]);
    expect(after.status).toBe("succeeded");
    expect(await applyRefundUpdate(db, after.provider_refund_id, "succeeded", null)).toBe(false); // duplicate event
    expect((await emails(await ref(bookingId), "refund_confirmed")).length).toBe(2);
  });

  it("a refund confirmed later by webhook (pending → succeeded) is announced once; failed after pending shows failed", async () => {
    const slow: PaymentProvider = { ...demoPayments, refund: async (_pi, _amount, key) => ({ id: `re_slow_${key}`, status: "pending" }) };
    const { bookingId } = await bookedDeposit();
    const { fingerprint } = await cancellationPreview(db, owner(), bookingId);
    await cancelBooking(db, owner(), bookingId, fingerprint, slow);
    const [r] = await db.query<{ status: string; provider_refund_id: string }>("select status, provider_refund_id from refunds where booking_id = $1", [bookingId]);
    expect(r.status).toBe("pending");
    expect(await applyRefundUpdate(db, r.provider_refund_id, "succeeded", null)).toBe(true);
    expect(await applyRefundUpdate(db, r.provider_refund_id, "succeeded", null)).toBe(false);
    expect((await emails(await ref(bookingId), "refund_confirmed")).length).toBe(2);
  });

  it("older bookings without terms: venue cancellation refunds in full; planner cancellation goes to review before money is kept", async () => {
    const { bookingId } = await bookedDeposit();
    await db.query("update bookings set cancellation_cutoff_days = null, cancellation_terms = null where id = $1", [bookingId]);
    await cancel(planner(), bookingId);
    const [r] = await db.query<{ id: string; status: string }>("select id, status from refunds where booking_id = $1", [bookingId]);
    expect(r.status).toBe("review");
    expect((await getBookingForParty(db, planner(), bookingId)).booking).toMatchObject({ cancellation_outcome: "manual_review", retained_pence: 0 });
    await resolveRefund(db, A("admin@gather.test"), r.id, "refund", demoPayments);
    expect((await refundsOf(bookingId))[0].status).toBe("succeeded");

    const legacy = await bookedDeposit();
    await db.query("update bookings set cancellation_cutoff_days = null, cancellation_terms = null where id = $1", [legacy.bookingId]);
    await cancel(owner(), legacy.bookingId);
    expect((await refundsOf(legacy.bookingId))[0].status).toBe("succeeded");
  });

  it("other people can't see or cancel a booking", async () => {
    const { bookingId } = await bookedDeposit();
    await expect(cancellationPreview(db, A("maya@gather.test"), bookingId)).rejects.toThrow(/not found/);
    await expect(cancellationPreview(db, A("owner2@gather.test"), bookingId)).rejects.toThrow(/not found/);
    await expect(cancellationPreview(db, A("admin@gather.test"), bookingId)).rejects.toThrow(/planner or the venue/);
  });
});

describe("messages after booking", () => {
  it("planner and venue can both still message on a booked enquiry, and it stays booked", async () => {
    const { enquiryId } = await bookedDeposit();
    await postMessage(db, planner(), enquiryId, "Can we arrive at 17:00 to set up?");
    await postMessage(db, owner(), enquiryId, "Yes, the room is yours from 16:30.");
    const thread = await getEnquiryThread(db, planner(), enquiryId);
    expect(thread.enquiry.status).toBe("booked");
    expect(thread.messages.slice(-2).map((m) => m.body)).toEqual(["Can we arrive at 17:00 to set up?", "Yes, the room is yours from 16:30."]);
  });
});

describe("admin dashboard after a cancellation", () => {
  it("counts and lists only confirmed bookings, shows cancelled ones separately, and a cancelled booking isn't a conversion", async () => {
    const admin = A("admin@gather.test");
    const before = await adminMetrics(db, admin, "all");
    const kept = await bookedDeposit({ total: 50_000, deposit: 10_000 });
    const gone = await bookedDeposit({ total: 70_000, deposit: 15_000 });
    const preview = await cancellationPreview(db, owner(), gone.bookingId);
    await cancelBooking(db, owner(), gone.bookingId, preview.fingerprint, demoPayments);
    const after = await adminMetrics(db, admin, "all");
    expect(after.bookings.count - before.bookings.count).toBe(1);
    expect(after.bookings.value - before.bookings.value).toBe(50_000);
    expect(after.bookings.deposits - before.bookings.deposits).toBe(10_000);
    expect(after.bookings.cancelled - before.bookings.cancelled).toBe(1);
    expect(after.enquiries.total - before.enquiries.total).toBe(2);
    expect(after.enquiries.booked - before.enquiries.booked).toBe(1);
    const refs = after.recent.bookings.map((b) => b.reference);
    expect(refs).toContain(await ref(kept.bookingId));
    expect(refs).not.toContain(await ref(gone.bookingId));
  });
});

describe("bookings list after a cancellation", () => {
  it("a cancelled booking's card carries what was refunded, from the refund records", async () => {
    const { bookingId } = await bookedDeposit({ total: 60_000, deposit: 12_000 });
    await payBalance(bookingId);
    const preview = await cancellationPreview(db, owner(), bookingId);
    await cancelBooking(db, owner(), bookingId, preview.fingerprint, demoPayments);
    for (const who of [owner(), planner()]) {
      const row = (await listBookings(db, who)).find((b) => b.id === bookingId)!;
      expect(row).toMatchObject({ status: "cancelled", paid_pence: 60_000, refunded_pence: 60_000, refunding_pence: 0 });
    }
  });

  it("the enquiry lists show the booking was cancelled, not 'Booked'", async () => {
    const { bookingId } = await bookedDeposit({ total: 50_000, deposit: 10_000 });
    const [{ enquiry_id }] = await db.query<{ enquiry_id: string }>("select enquiry_id from bookings where id = $1", [bookingId]);
    for (const who of [owner(), planner()]) {
      expect((await listEnquiries(db, who)).find((e) => e.id === enquiry_id)!.booking_status).toBe("confirmed");
    }
    const preview = await cancellationPreview(db, planner(), bookingId);
    await cancelBooking(db, planner(), bookingId, preview.fingerprint, demoPayments);
    for (const who of [owner(), planner()]) {
      expect((await listEnquiries(db, who)).find((e) => e.id === enquiry_id)!).toMatchObject({ status: "booked", booking_status: "cancelled" });
    }
  });
});
