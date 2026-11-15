/** Stripe Checkout session (design pass 3.13): description and photo added; money fields unchanged. */
import { describe, expect, it } from "vitest";
import { stripeExpiry, stripeSessionParams, type CheckoutSessionRequest } from "@/lib/adapters/payments";

const base: CheckoutSessionRequest = {
  checkoutId: "11111111-2222-3333-4444-555555555555", purpose: "deposit", quoteReference: "Q-ABC12",
  venueName: "The Loom Room", amountPence: 125000, expiresAt: new Date(Date.now() + 30 * 60_000),
};

describe("stripe session params", () => {
  it("keeps amount, currency, metadata, expiry and return URLs exactly as before", () => {
    const p = stripeSessionParams({ ...base, summary: "Sat 13 March 2027 · 60 guests", imagePath: "/images/venues/v01-loom-room.webp" }, "https://www.gatherldn.com", "https://www.gatherldn.com");
    expect(p.mode).toBe("payment");
    expect(p.currency).toBe("gbp");
    expect(p.line_items).toHaveLength(1);
    const li = p.line_items![0];
    expect(li.quantity).toBe(1);
    expect(li.price_data!.currency).toBe("gbp");
    expect(li.price_data!.unit_amount).toBe(125000);
    expect(p.client_reference_id).toBe(base.checkoutId);
    expect(p.metadata).toEqual({ checkout_id: base.checkoutId, quote_reference: "Q-ABC12", purpose: "deposit" });
    expect(p.expires_at).toBe(stripeExpiry(base.expiresAt));
    expect(p.success_url).toBe(`https://www.gatherldn.com/checkout/return/${base.checkoutId}`);
    expect(p.cancel_url).toBe(`https://www.gatherldn.com/checkout/return/${base.checkoutId}?cancelled=1`);
  });

  it("shows the venue, quote, date, guests and photo on the product", () => {
    const p = stripeSessionParams({ ...base, summary: "Sat 13 March 2027 · 60 guests", imagePath: "/images/venues/v01-loom-room.webp" }, "https://x.test", "https://www.gatherldn.com");
    expect(p.line_items![0].price_data!.product_data).toEqual({
      name: "Deposit — The Loom Room",
      description: "Quote Q-ABC12 · Sat 13 March 2027 · 60 guests",
      images: ["https://www.gatherldn.com/images/venues/v01-loom-room.webp"],
    });
  });

  it("sends no photo when the site isn't on a public https address, and falls back to the quote alone", () => {
    const p = stripeSessionParams({ ...base, purpose: "balance", imagePath: "/images/x.webp" }, "http://localhost:3000", "http://localhost:3000");
    expect(p.line_items![0].price_data!.product_data).toEqual({ name: "Remaining balance — The Loom Room", description: "Quote Q-ABC12" });
  });
});
