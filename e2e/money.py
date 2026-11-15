import re, sys
from playwright.sync_api import sync_playwright, expect
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
SHOTS = "/tmp/gather-money-shots"  # demo mode only: uses the one-click demo sign-ins
import os; os.makedirs(SHOTS, exist_ok=True)

def login(ctx, who):
    p = ctx.new_page(); p.goto(B + "/login"); p.get_by_role("button", name=f"Sign in as {who}").click(); p.wait_for_load_state("networkidle"); return p

def book(planner, owner, date_text, cutoff, card="4242 4242 4242 4242", deposit=None):
    p = planner
    p.goto(B + "/plan")
    p.get_by_label("Your event").fill(f"Party for 40 standing in Finsbury Park on {date_text}, any budget")
    p.get_by_role("button", name="Read my brief").click(); p.wait_for_url(re.compile(r"/plan/[0-9a-f-]{36}"))
    p.get_by_role("button", name="Search venues").click(); p.wait_for_url(re.compile(r"/results"))
    p.locator("article.venue-card", has_text="Gather Test Room").get_by_role("link", name="View and enquire").click()
    p.get_by_role("button", name="Send enquiry").click(); expect(p.get_by_text("Enquiry sent").first).to_be_visible()
    enquiry = p.url.split("?")[0]
    o = owner; o.goto(enquiry)
    o.get_by_label("Cancellation cutoff (days)").fill(str(cutoff))
    if deposit: o.get_by_label("Deposit (£)").fill(deposit)
    o.get_by_role("button", name=re.compile("Send quote")).click(); expect(o.get_by_text(re.compile("Quote Q-.* sent")).first).to_be_visible()
    p.goto(enquiry)
    expect(p.get_by_text("Cancellation terms").first).to_be_visible()
    p.get_by_role("button", name=re.compile(r"Pay £[\d,]+ deposit")).click(); p.wait_for_url(re.compile(r"/checkout/demo/"))
    p.get_by_label("Test card number").fill(card); p.get_by_role("button", name=re.compile(r"Pay £")).click()
    expect(p.get_by_text("Booking confirmed").first).to_be_visible()
    return enquiry

def cancel(page, enquiry, expect_refund, expect_kept):
    page.goto(enquiry); page.get_by_role("link", name="Cancel booking").click(); page.wait_for_url(re.compile(r"/cancel$"))
    rows = page.locator(".balance-rows .due").all_inner_texts()
    print("   preview:", " | ".join(r.replace("\n", " ") for r in rows))
    expect(page.locator(".balance-rows .due").nth(0)).to_contain_text(expect_refund)
    expect(page.locator(".balance-rows .due").nth(1)).to_contain_text(expect_kept)
    page.screenshot(path=f"{SHOTS}/{len(os.listdir(SHOTS))}-preview.png", full_page=True)
    page.get_by_role("button", name="Confirm cancellation").click(); page.wait_for_url(re.compile(r"/enquiries/"))
    expect(page.get_by_text("Booking cancelled").first).to_be_visible()

with sync_playwright() as pw:
    b = pw.chromium.launch()
    P = login(b.new_context(viewport={"width": 1280, "height": 900}), "Priya")
    O = login(b.new_context(viewport={"width": 1280, "height": 900}), "Sam")
    A = login(b.new_context(viewport={"width": 1280, "height": 900}), "Amara")

    print("1. Venue cancels after deposit only -> full refund; planner sees Refunded")
    e1 = book(P, O, "12 July 2027", 14)
    cancel(O, e1, "£100", "£0")
    P.goto(e1); expect(P.locator(".refund-list .chip", has_text="Refunded")).to_be_visible()
    P.goto(B + "/enquiries"); expect(P.locator(".enquiry-card .chip", has_text="Booking cancelled").first).to_be_visible()
    P.screenshot(path=f"{SHOTS}/planner-refunded.png", full_page=True)

    print("2. Planner cancels well before a 14-day cutoff -> deposit refunded")
    e2 = book(P, O, "13 July 2027", 14)
    cancel(P, e2, "£100", "£0")

    print("3. Planner cancels within the cutoff (cutoff 300 days) -> venue keeps the deposit")
    e3 = book(P, O, "14 July 2027", 300)
    cancel(P, e3, "£0", "£100")
    O.goto(e3); expect(O.get_by_text(re.compile("The venue keeps £100")).first).to_be_visible()

    print("4. Refund to a card that can't take refunds -> Refund failed; admin retries")
    e4 = book(P, O, "15 July 2027", 14, card="4000 0000 0000 5126")
    cancel(O, e4, "£100", "£0")
    P.goto(e4); expect(P.locator(".refund-list .chip", has_text="Refund failed")).to_be_visible()
    A.goto(B + "/admin"); expect(A.get_by_text("Refunds to check")).to_be_visible()
    A.screenshot(path=f"{SHOTS}/admin-refunds.png", full_page=False)
    A.get_by_role("button", name="Retry refund").first.click(); expect(A.get_by_text("Refund retried.").first).to_be_visible()
    P.goto(e4); expect(P.locator(".refund-list .chip", has_text="Refund failed")).to_be_visible()  # same card still fails

    print("5. Calendar: the cancelled date is free again for the owner")
    O.goto(B + "/owner")
    lid = O.locator("article.venue-card", has_text="Gather Test Room").locator("h3 a").get_attribute("href").split("/")[-1]
    O.goto(f"{B}/owner/listings/{lid}/calendar?month=2027-07")
    cell = O.locator('[aria-label^="2027-07-12"]')
    print("   12 Jul 2027:", cell.get_attribute("aria-label"))
    assert "Booked" not in cell.get_attribute("aria-label")
    print("6. Public pages, signed out, mobile")
    m = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True).new_page()
    for path, h in [("/about", "About Gather"), ("/privacy", "Privacy notice"), ("/signup", "Create an account")]:
        m.goto(B + path); expect(m.get_by_role("heading", level=1)).to_have_text(h)
        assert m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"overflow on {path}"
        m.screenshot(path=f"{SHOTS}/m360{path.replace('/', '-')}.png", full_page=True)
    expect(m.get_by_role("link", name="privacy notice")).to_be_visible()
    m.goto(B + "/"); expect(m.locator("footer").get_by_role("link", name="Privacy")).to_be_visible()
    b.close()
print("cancellation e2e passed")
