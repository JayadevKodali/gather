/** Each side reads its own wording; the stored text and the planner's view never change. */
import { describe, expect, it } from "vitest";
import { cancellationTerms } from "@/lib/payments/policy";
import { enquiryStatusLabel, termsForViewer } from "@/lib/services/enquiries";

describe("status label", () => {
  it("the planner sees 'Quote received'; the venue that sent it sees 'Quote sent'", () => {
    expect(enquiryStatusLabel("quoted")).toBe("Quote received");
    expect(enquiryStatusLabel("quoted", "planner")).toBe("Quote received");
    expect(enquiryStatusLabel("quoted", "owner")).toBe("Quote sent");
    expect(enquiryStatusLabel("booked", "owner")).toBe("Booked");
  });
});

describe("cancellation terms", () => {
  it("the planner's view is the stored text, unchanged", () => {
    for (const cutoff of [0, 1, 14, 365]) expect(termsForViewer(cancellationTerms(cutoff), "planner")).toBe(cancellationTerms(cutoff));
  });
  it("the venue's view talks about the planner's deposit and the venue keeping it, with the same numbers", () => {
    expect(termsForViewer(cancellationTerms(14), "owner")).toBe(
      "If the planner cancels 15 or more days before the event, the planner's deposit is refunded. " +
      "If the planner cancels 14 days or fewer before the event, you keep the deposit. " +
      "Any balance the planner has paid through Gather is always refunded. If you cancel, the planner gets everything back.",
    );
    expect(termsForViewer(cancellationTerms(1), "owner")).toContain("If the planner cancels 1 day or fewer before the event, you keep the deposit.");
    expect(termsForViewer(cancellationTerms(0), "owner")).toContain("If the planner cancels on the day of the event, you keep the deposit.");
    for (const cutoff of [0, 1, 14, 365]) expect(termsForViewer(cancellationTerms(cutoff), "owner")).not.toMatch(/\byour deposit\b|you've paid|you get everything/);
  });
  it("text that isn't the standard wording is shown as it is", () => {
    expect(termsForViewer("Custom terms agreed by phone.", "owner")).toBe("Custom terms agreed by phone.");
  });
});
