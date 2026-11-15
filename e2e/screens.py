"""
Design-pass screenshots: one picture per page in docs/REVIEW_CHECKLIST.md, at 1440 x 900.

Demo mode only (it uses the one-click demo sign-ins and the pretend checkout). Start the app on a fresh
database, then:  python3 e2e/screens.py http://localhost:3000 before   (or after-phase1, after-phase2 ...)

It seeds the states the checklist needs on Gather Test Room (July-December 2027): an enquiry with a quote,
a booking paid in full and then cancelled by the venue, a revised quote, and a brief with no match.
Screenshots go to docs/screenshots/design-pass/<folder>/<review id>-<page>.jpg.
"""
import os, re, sys
from playwright.sync_api import sync_playwright, expect

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
FOLDER = sys.argv[2] if len(sys.argv) > 2 else "before"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots", "design-pass", FOLDER)
os.makedirs(OUT, exist_ok=True)
W, H = 1440, 900
taken = []


def settle(page):
    page.wait_for_load_state("networkidle")
    # bring lazy images and scroll reveals in, then return to the top
    page.evaluate("""async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); }""")
    page.wait_for_timeout(400)


def shot(page, rid, name, full=True):
    settle(page) if full else page.wait_for_timeout(400)
    path = os.path.join(OUT, f"{rid}-{name}.jpg")
    page.screenshot(path=path, full_page=full, type="jpeg", quality=72)  # JPEG keeps the repo small
    taken.append(f"{rid}-{name}")
    print(f"  {rid} {name}")


def login(browser, who):
    ctx = browser.new_context(viewport={"width": W, "height": H})
    p = ctx.new_page()
    p.goto(B + "/login")
    p.get_by_role("button", name=f"Sign in as {who}").click()
    p.wait_for_url(lambda u: "/login" not in u)
    return p


def brief(p, text, answer=None):
    p.goto(B + "/plan")
    p.get_by_label("Your event").fill(text)
    p.get_by_role("button", name="Read my brief").click()
    p.wait_for_url(re.compile(r"/plan/[0-9a-f-]{36}"))
    if answer:
        p.get_by_label("Your answer").fill(answer)
        p.get_by_role("button", name="Answer").click()
        expect(p.get_by_text("We have everything we need").first).to_be_visible()
    return p.url.split("?")[0]


def search(p):
    p.get_by_role("button", name="Search venues").click()
    p.wait_for_url(re.compile(r"/results"))


def enquire_test_room(p, message=None):
    p.locator("article.venue-card", has_text="Gather Test Room").get_by_role("link", name="View and enquire").click()
    p.wait_for_url(re.compile(r"/venues/"))
    if message:
        p.get_by_label("Message to the venue").fill(message)
    p.get_by_role("button", name="Send enquiry").click()
    expect(p.get_by_text("Enquiry sent").first).to_be_visible()
    return p.url.split("?")[0]


def send_quote(o, enquiry, extra=None, revise=False):
    o.goto(enquiry)
    if extra:
        o.locator("#label_2").fill(extra[0])
        o.locator("#amount_2").fill(extra[1])
    o.get_by_role("button", name=re.compile("Send revised quote" if revise else "Send quote")).click()
    expect(o.get_by_text(re.compile(r"Quote Q-.* sent")).first).to_be_visible()


def pay(p, button_name, card="4242 4242 4242 4242"):
    p.get_by_role("button", name=re.compile(button_name)).first.click()
    p.wait_for_url(re.compile(r"/checkout/demo/"))
    return p


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        anon = browser.new_context(viewport={"width": W, "height": H}).new_page()

        print("Public and account pages (signed out)")
        for rid, name, path in [("PUB-01", "home", "/"), ("PUB-02", "about", "/about"), ("PUB-03", "privacy", "/privacy"),
                                ("PUB-05", "not-found", "/this-page-does-not-exist"), ("PUB-06", "sign-in", "/login?next=%2Fbookings"),
                                ("PUB-07", "sign-up", "/signup?role=planner"), ("PUB-08", "forgot-password", "/forgot-password"),
                                ("ACC-02", "check-email", "/check-email"), ("ACC-04", "confirm-email", "/verify-email"),
                                ("ACC-05", "new-password", "/reset-password")]:
            anon.goto(B + path)
            shot(anon, rid, name)
        anon.goto(B + "/signup?role=planner")
        anon.get_by_role("button", name="Create account").click()
        anon.wait_for_timeout(500)
        shot(anon, "ACC-01", "sign-up-errors")

        P = login(browser, "Priya")
        O = login(browser, "Sam")
        A = login(browser, "Amara")

        print("Planner: brief to enquiry")
        P.goto(B + "/plan")
        shot(P, "PLN-01", "brief-start")
        P.get_by_role("link", name="Use the sample brief").click()
        P.wait_for_url(re.compile(r"sample=1"))
        P.get_by_role("button", name="Read my brief").click()
        P.wait_for_url(re.compile(r"/plan/[0-9a-f-]{36}"))
        shot(P, "PLN-03", "brief-follow-up")
        P.get_by_label("Your answer").fill("26 March 2027")
        P.get_by_role("button", name="Answer").click()
        expect(P.get_by_text("We have everything we need").first).to_be_visible()
        shot(P, "PLN-04", "brief-answered")
        search(P)
        shot(P, "PLN-06", "shortlist-five")
        P.locator("article.venue-card", has_text="The Loom Room").get_by_role("link", name="View and enquire").click()
        P.wait_for_url(re.compile(r"/venues/"))
        shot(P, "PLN-07", "venue-loom-room")
        P.locator(".venue-gallery .gallery-open").first.click()
        expect(P.locator("dialog.viewer .viewer-count")).to_be_visible()
        shot(P, "PLN-08", "photo-viewer", full=False)
        P.keyboard.press("Escape")

        e1 = brief(P, "Team offsite for about 30 people seated near Finsbury Park in late September 2027, around £800, need AV.", "21 September 2027")
        search(P)
        shot(P, "PLN-05", "shortlist-one")
        P.locator("article.venue-card", has_text="Gather Test Room").get_by_role("link", name="View and enquire").click()
        P.wait_for_url(re.compile(r"/venues/"))
        shot(P, "PLN-09", "venue-test-room")
        P.get_by_label("Message to the venue").fill("Hi, could we have the room from 9am for setup? Thanks.")
        P.get_by_role("button", name="Send enquiry").click()
        expect(P.get_by_text("Enquiry sent").first).to_be_visible()
        enquiry = P.url.split("?")[0]
        shot(P, "PLN-10", "enquiry-sent")
        P.goto(B + "/enquiries")
        shot(P, "PLN-11", "enquiries-list")

        print("Owner: inbox, quote")
        O.goto(B + "/owner")
        shot(O, "OWN-01", "manage-listings")
        O.goto(B + "/enquiries")
        shot(O, "OWN-02", "inbox")
        O.goto(enquiry)
        shot(O, "OWN-03", "enquiry-quote-form")
        send_quote(O, enquiry, extra=("Early access from 9am", "50"))
        shot(O, "OWN-04", "quote-sent")

        print("Planner: quote, deposit, booking, balance")
        P.goto(enquiry)
        shot(P, "PLN-12", "quote-received")
        # Decline asks first; the reason is typed in the confirmation box, never in the address (fix 4).
        P.locator(".decline-toggle").click()
        P.get_by_role("button", name="Decline quote").click()
        P.wait_for_url(re.compile(r"confirmDecline="))
        assert "reason=" not in P.url, P.url
        expect(P.get_by_text("Decline this quote? The venue will be told.")).to_be_visible()
        P.get_by_label("Reason (optional, shared with the venue)").fill("Checking the confirm step")
        P.locator("#decline").scroll_into_view_if_needed()
        shot(P, "PLN-12b", "decline-confirm", full=False)
        P.get_by_role("link", name="Keep").click()
        P.wait_for_url(lambda u: "confirmDecline" not in u)
        expect(P.get_by_role("button", name=re.compile(r"Pay £[\d,]+ deposit"))).to_be_visible()  # nothing was declined
        pay(P, r"Pay £[\d,]+ deposit")
        shot(P, "PLN-13", "pretend-checkout-deposit")
        P.get_by_label("Test card number").fill("4000 0000 0000 0002")
        P.get_by_role("button", name=re.compile(r"Pay £")).click()
        P.wait_for_url(re.compile(r"/checkout/return/"))  # a declined card shows the payment status page
        shot(P, "PLN-14", "payment-declined")
        P.goto(enquiry)
        pay(P, r"Pay £[\d,]+ deposit")
        P.get_by_label("Test card number").fill("4242 4242 4242 4242")
        P.get_by_role("button", name=re.compile(r"Pay £")).click()
        expect(P.get_by_text("Booking confirmed").first).to_be_visible()
        shot(P, "PLN-15", "booking-confirmed")
        P.goto(B + "/bookings")
        shot(P, "PLN-16", "bookings-list")
        P.goto(enquiry)
        shot(P, "PLN-17", "booking-page")
        pay(P, r"Pay remaining balance")
        shot(P, "PLN-18", "pretend-checkout-balance")
        P.get_by_label("Test card number").fill("4242 4242 4242 4242")
        P.get_by_role("button", name=re.compile(r"Pay £")).click()
        expect(P.get_by_text("Paid in full").first).to_be_visible()
        shot(P, "PLN-20", "paid-in-full")
        P.goto(enquiry)
        P.get_by_role("link", name="Cancel booking").click()
        P.wait_for_url(re.compile(r"/cancel$"))
        shot(P, "PLN-21", "cancel-preview-planner")

        print("Owner: bookings, calendar, listing pages")
        O.goto(B + "/bookings")
        shot(O, "OWN-05", "bookings-list")
        O.goto(B + "/owner")
        lid = O.locator("article.venue-card", has_text="Gather Test Room").locator("h3 a").get_attribute("href").split("/")[-1]
        O.goto(f"{B}/owner/listings/{lid}/calendar?month=2027-09")
        shot(O, "OWN-06", "calendar")
        O.goto(f"{B}/owner/listings/{lid}")
        shot(O, "OWN-07", "edit-listing")
        O.goto(B + "/owner/listings/new")
        shot(O, "OWN-08", "add-listing")
        O.get_by_role("button", name="Next: Facilities and extras").click()
        O.wait_for_timeout(600)
        shot(O, "OWN-09", "add-listing-errors")

        print("Venue cancels")
        O.goto(enquiry)
        O.get_by_role("link", name="Cancel booking").click()
        O.wait_for_url(re.compile(r"/cancel$"))
        shot(O, "OWN-10", "cancel-preview-venue")
        O.get_by_role("button", name="Confirm cancellation").click()
        O.wait_for_url(re.compile(r"/enquiries/"))
        expect(O.get_by_text("Booking cancelled").first).to_be_visible()
        shot(O, "OWN-11", "cancelled-venue")
        O.goto(B + "/bookings")
        shot(O, "OWN-12", "bookings-after-cancel")
        P.goto(enquiry)
        shot(P, "PLN-22", "cancelled-planner")

        print("Revised quote and inbox search")
        brief(P, "40 people seated near Finsbury Park on 14 October 2027, around £800.")
        search(P)
        e2 = enquire_test_room(P, "Could we arrive at 6pm for set-up?")
        send_quote(O, e2)
        quote1 = O.locator("text=/Q-[A-Z0-9]+-1/").first.inner_text()
        ref = re.search(r"Q-[A-Z0-9]+-1", quote1).group(0)
        send_quote(O, e2, extra=("Late finish", "40"), revise=True)
        shot(O, "OWN-14", "revised-quote")
        O.goto(f"{B}/enquiries?q={ref}")
        shot(O, "OWN-13", "inbox-search")

        print("No match")
        brief(P, "300 people seated in Finsbury Park on 5 August 2027, budget around £2,000.")
        search(P)
        shot(P, "PLN-23", "no-match")

        print("Admin")
        A.goto(B + "/admin")
        shot(A, "ADM-01", "dashboard")
        A.evaluate("document.querySelectorAll('main details').forEach(d => d.open = true)")
        shot(A, "ADM-02", "dashboard-sections-open")
        contact = A.locator("a", has_text="Contact owner").first
        if contact.count():
            contact.click()
            A.wait_for_url(re.compile(r"/admin/contact/"))
            shot(A, "ADM-07", "contact-compose")
            review = A.get_by_role("button", name="Review email")
            if review.count():
                review.click()
                A.wait_for_url(re.compile(r"/review/"))
                shot(A, "ADM-08", "review-email")

        print("Guards")
        A.goto(B + "/plan")
        shot(A, "GRD-01", "wrong-account-type")
        anon.goto(enquiry)
        shot(anon, "GRD-02", "signed-out-redirect")

        browser.close()
    print(f"\n{len(taken)} screenshots in {os.path.normpath(OUT)}")


if __name__ == "__main__":
    run()
