/** Declining a quote asks first (design pass 3.12): nothing is declined until the planner confirms. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const declineQuote = vi.fn(async () => undefined);
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); });

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getActor: async () => ({ id: "planner-1", role: "planner" }) }));
vi.mock("@/lib/services/enquiries", () => ({ declineQuote: (...a: unknown[]) => declineQuote(...(a as [])), declineEnquiry: vi.fn(), postMessage: vi.fn(), sendQuote: vi.fn() }));
vi.mock("@/lib/services/booking-money", () => ({}));
vi.mock("@/lib/services/checkout", () => ({}));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("decline this quote", () => {
  beforeEach(() => { declineQuote.mockClear(); redirect.mockClear(); });

  it("the first press only asks 'Decline this quote?', declines nothing, and keeps the reason out of the address", async () => {
    const { declineQuoteAction } = await import("@/app/actions/enquiry");
    await expect(declineQuoteAction(form({ enquiryId: "e1", quoteId: "q1", reason: "Too dear" }))).rejects.toThrow(/REDIRECT/);
    expect(declineQuote).not.toHaveBeenCalled();
    const url = redirect.mock.calls[0][0] as string;
    expect(url).toBe("/enquiries/e1?confirmDecline=q1#decline");
    expect(url).not.toContain("reason=");
    expect(url).not.toContain("Too");
  });

  it("only the confirmation (confirm=yes) declines the quote, with the reason from the form body", async () => {
    const { declineQuoteAction } = await import("@/app/actions/enquiry");
    await expect(declineQuoteAction(form({ enquiryId: "e1", quoteId: "q1", reason: "Too dear", confirm: "yes" }))).rejects.toThrow(/REDIRECT/);
    expect(declineQuote).toHaveBeenCalledTimes(1);
    expect(declineQuote.mock.calls[0]).toEqual([{}, { id: "planner-1", role: "planner" }, "e1", "q1", "Too dear"]);
    expect(redirect.mock.calls[0][0]).toContain("Quote+declined");
    expect(redirect.mock.calls[0][0]).not.toContain("reason=");
  });
});
