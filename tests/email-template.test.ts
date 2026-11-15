import { describe, expect, it } from "vitest";
import { cleanPendingEmail, decodePending, encodePending } from "@/lib/auth/pending-verification";
import { loadConfig } from "@/lib/config";
import { renderEmail } from "@/lib/email/template";

const base = { preheader: "Preview line", heading: "Your quote", paragraphs: ["Line one", "<script>x</script>"], cta: { label: "Review the quote", url: "https://www.gatherldn.com/enquiries/1" } };

describe("branded email template", () => {
  it("renders HTML and text with preheader, reference, one absolute CTA and escaped user text", () => {
    const { html, text } = renderEmail({ ...base, reference: "Q-AB12-1", facts: [["Quote total", "£2,870"]] }, "https://www.gatherldn.com");
    expect(html).toContain("Preview line");
    expect(html).toContain("Reference Q-AB12-1");
    expect(html).toContain('src="https://www.gatherldn.com/brand/gather-logo.png"');
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html.match(/href="https:\/\/www\.gatherldn\.com\/enquiries\/1"/g)).toHaveLength(1);
    expect(text).toContain("Reference Q-AB12-1");
    expect(text).toContain("Quote total: £2,870");
    expect(text).toContain("Review the quote: https://www.gatherldn.com/enquiries/1");
    expect(text).not.toContain("Test payment");
  });

  it("labels test payments and refuses relative links", () => {
    expect(renderEmail({ ...base, testPayment: true }, "https://x.test").text).toContain("Test payment");
    expect(() => renderEmail({ ...base, cta: { label: "Go", url: "/enquiries/1" } }, "https://x.test")).toThrow(/absolute/);
  });

  it("loads the logo from the public site, while a preview's links stay on the preview", () => {
    const preview = "https://gather-git-x.vercel.app";
    const { html } = renderEmail({ ...base, cta: { label: "Go", url: `${preview}/enquiries/1` } }, preview, "https://www.gatherldn.com");
    expect(html).toContain('src="https://www.gatherldn.com/brand/gather-logo.png"');
    expect(html).toContain(`href="${preview}/"`);
    expect(html).toContain(`href="${preview}/enquiries/1"`);
  });
});

describe("email asset address", () => {
  const connected = {
    GATHER_MODE: "connected", DATABASE_URL: "postgres://x", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x",
    RESEND_API_KEY: "re_x", EMAIL_FROM: "Gather <a@b.test>", OPENAI_API_KEY: "sk-x", VERCEL: "1",
    VERCEL_PROJECT_PRODUCTION_URL: "gatherldn.com",
  };
  it("is the public site on a preview, and the same as the app address in production and demo", () => {
    const preview = loadConfig({ ...connected, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "gather-git-x.vercel.app", APP_URL: "https://www.gatherldn.com" });
    expect(preview.appUrl).toBe("https://gather-git-x.vercel.app");
    expect(preview.assetUrl).toBe("https://www.gatherldn.com");
    const previewNoAppUrl = loadConfig({ ...connected, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "gather-git-x.vercel.app" });
    expect(previewNoAppUrl.assetUrl).toBe("https://gatherldn.com");
    const prod = loadConfig({ ...connected, VERCEL_ENV: "production", APP_URL: "https://www.gatherldn.com/" });
    expect(prod.assetUrl).toBe(prod.appUrl);
    expect(loadConfig({}).assetUrl).toBe("http://localhost:3000");
  });
});

describe("pending verification cookie value", () => {
  it("accepts a plain address in lower case and ignores anything else", () => {
    expect(cleanPendingEmail("  Kodali+Planner2@Example.com ")).toBe("kodali+planner2@example.com");
    for (const bad of ["", null, undefined, "not-an-email", "a@b", "a b@c.com", '"x"@y.com', "<a@b.com>", `${"a".repeat(250)}@b.com`]) expect(cleanPendingEmail(bad)).toBeNull();
  });
  it("keeps the role with the address, and ignores a role it doesn't know", () => {
    expect(encodePending("A@B.com", "owner")).toBe("owner:a@b.com");
    expect(decodePending("owner:a@b.com")).toEqual({ email: "a@b.com", role: "owner" });
    expect(decodePending(encodePending("a@b.com", "admin"))).toEqual({ email: "a@b.com", role: null });
    expect(decodePending("admin:a@b.com")?.role).toBeNull();
    expect(decodePending(undefined)).toBeNull();
  });
});
