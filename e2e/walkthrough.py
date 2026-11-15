"""
End-to-end reviewer walkthrough in a real browser (demo mode).

    python3 e2e/walkthrough.py [base_url]

Needs Python Playwright and Chrome. Start from a fresh seed (`npm run seed`) with `npm run dev`
running. Screenshots go to docs/screenshots/. Every step asserts what the page should show, so
a broken journey fails loudly.
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"


def make_test_photo(path="/tmp/gather-test-photo.jpg", colour=(30, 74, 58)):
    """A synthetic 1800 × 1200 JPEG (no real venue)."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (1800, 1200), colour)
    d = ImageDraw.Draw(img)
    for i in range(0, 1800, 120):
        d.rectangle([i, 700, i + 80, 1100], fill=(201, 160, 99))
    img.save(path, "JPEG", quality=85)
    return path
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def shot(page: Page, name: str, full: bool = True):
    page.screenshot(path=str(OUT / f"{name}.jpg"), full_page=full, type="jpeg", quality=80)
    print(f"  screenshot: docs/screenshots/{name}.jpg")


def scroll_through(page: Page):
    """Scroll the whole page in steps (natively) so lazy images load and reveals fire."""
    height = page.evaluate("document.body.scrollHeight")
    y = 0
    while y < height:
        y += 500
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(120)
        height = page.evaluate("document.body.scrollHeight")
    page.wait_for_timeout(1500)


def assert_images_loaded(page: Page, where: str):
    """Every <img> on the page decoded with a real size (no broken photos)."""
    stats = page.evaluate("""() => {
        const imgs = [...document.images];
        return { total: imgs.length, broken: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')) };
    }""")
    assert stats["total"] > 0, f"{where}: no images"
    assert not stats["broken"], f"{where}: images failed to load: {stats['broken']}"
    print(f"  {where}: {stats['total']} images loaded")


def frame_transform(page: Page) -> str:
    return page.evaluate("getComputedStyle(document.querySelector('.checked-frame')).transform")


def assert_plain_chrome(page: Page, where: str):
    """Off the homepage the header must be the normal sticky bar, not the transparent hero overlay."""
    pos = page.evaluate("getComputedStyle(document.querySelector('.top-chrome')).position")
    pad = page.evaluate("getComputedStyle(document.querySelector('main')).paddingTop")
    assert pos == "sticky" and pad != "0px", f"{where}: homepage header styling leaked (position {pos}, main padding {pad})"


def sign_in_as(page: Page, first_name: str):
    page.goto(f"{BASE}/login")
    page.get_by_role("button", name=f"Sign in as {first_name}").click()
    page.wait_for_url(lambda url: "/login" not in url)
    page.wait_for_load_state("networkidle")


def sign_out(page: Page):
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{BASE}/")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1360, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("1. Landing page: hero, showcase photos, the checked section settles in on scroll")
        page.goto(BASE)
        expect(page.get_by_role("heading", level=1)).to_contain_text("The right room")
        expect(page.locator(".hero").get_by_role("link", name="Find a venue", exact=True)).to_be_visible()
        expect(page.locator(".hero").get_by_role("link", name="List your venue", exact=True)).to_be_visible()
        assert page.evaluate("document.documentElement.classList.contains('motion-ok')"), "motion should be on by default"
        page.wait_for_timeout(1800)  # let the push-in start
        shot(page, "01-landing-hero", full=False)
        page.mouse.wheel(0, 450)
        page.wait_for_timeout(700)
        hero_p = float(page.evaluate("getComputedStyle(document.querySelector('.hero')).getPropertyValue('--p') || '0'"))
        assert hero_p > 0.2, f"hero scroll progress should move (got {hero_p})"
        shot(page, "01b-landing-hero-transition", full=False)
        page.evaluate("window.scrollTo(0, document.querySelector('.showcase').getBoundingClientRect().top + scrollY - 80)")
        page.wait_for_timeout(1700)
        assert page.locator(".showcase [data-reveal].is-in").count() >= 1, "showcase photos should reveal"
        shot(page, "01c-landing-showcase", full=False)
        # "Every room is checked": the flat image settles (scale 0.94 -> 1) as it scrolls in; the checks appear.
        top = page.evaluate("document.querySelector('.checked').getBoundingClientRect().top + scrollY")
        page.evaluate(f"window.scrollTo(0, {top} - innerHeight * 0.95)")
        page.wait_for_timeout(500)
        early = frame_transform(page)
        shot(page, "01d-checked-entering", full=False)
        page.evaluate(f"window.scrollTo(0, {top} - 60)")
        page.wait_for_timeout(1200)
        late = frame_transform(page)
        shot(page, "01e-checked-settled", full=False)
        assert early != late, "the checked image should settle as it scrolls in"
        assert late in ("none", "matrix(1, 0, 0, 1, 0, 0)"), f"settled image should be full size (got {late})"
        assert page.locator(".checked-list [data-reveal].is-in").count() == 3, "all three checks should be visible"
        page.evaluate("window.scrollTo(0, 0)")
        scroll_through(page)
        assert_images_loaded(page, "homepage")
        shot(page, "01f-landing-full")

        print("1b. Clicking away from the homepage restores the normal header, and coming back restores the hero")
        page.evaluate("window.scrollTo(0, 0)")
        page.locator(".hero").get_by_role("link", name="Find a venue", exact=True).click()
        page.wait_for_url("**/signup?role=planner")
        assert_plain_chrome(page, "signup after client navigation")
        page.get_by_role("link", name="Gather", exact=True).click()
        page.wait_for_url(f"{BASE}/")
        assert page.evaluate("getComputedStyle(document.querySelector('.top-chrome')).position") == "absolute", "header should float over the hero again"

        print("2. Planner writes the sample brief and answers the date follow-up")
        sign_in_as(page, "Priya")
        page.goto(BASE)
        page.locator(".hero").get_by_role("link", name="Find a venue", exact=True).click()
        page.wait_for_url(f"{BASE}/plan")
        assert_plain_chrome(page, "/plan after client navigation")
        expect(page.get_by_role("heading", name="What are you planning?")).to_be_visible()
        page.get_by_role("link", name="Use the sample brief").click()
        page.wait_for_url("**/plan?sample=1")
        expect(page.get_by_label("Your event")).to_have_value(re.compile("Shoreditch"))
        page.get_by_role("button", name="Read my brief").click()
        page.wait_for_url(re.compile(r"/plan/[0-9a-f-]{36}$"))
        expect(page.get_by_text("One question before we search").first).to_be_visible()
        expect(page.get_by_text("late March").first).to_be_visible()
        shot(page, "02-brief-followup")
        page.get_by_label("Your answer").fill("26 March 2027")
        page.get_by_role("button", name="Answer").click()
        expect(page.get_by_text("We have everything we need").first).to_be_visible()
        expect(page.locator("#fac_av")).to_have_value("essential")
        shot(page, "03-brief-confirmed")

        print("3. Shortlist: eligible venues with reasons; price sort")
        page.get_by_role("button", name="Search venues").click()
        expect(page.get_by_role("heading", level=1)).to_contain_text("that fit")
        cards = page.locator("article.venue-card")
        count = cards.count()
        assert 1 <= count <= 5, f"expected 1-5 venues, got {count}"
        expect(cards.first).to_contain_text("you need 80")
        expect(cards.first.locator(".card-key")).to_contain_text(re.compile(r"\d+ standing"))
        expect(cards.first.locator(".card-why")).to_contain_text(re.compile(r"Holds \d+ standing for your \d+, has the AV you need"))
        assert page.locator("article.venue-card [data-photo='yes']").count() == count, "every seeded venue shows its photo"
        scroll_through(page)
        assert_images_loaded(page, "shortlist")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        shot(page, "04-shortlist")
        page.get_by_role("link", name="Price: low to high").click()
        expect(page.locator("article.venue-card")).to_have_count(count)
        page.get_by_role("link", name="Best match").click()

        print("4. Enquire at The Loom Room")
        loom = page.locator("article.venue-card", has_text="The Loom Room")
        loom.get_by_role("link", name="View and enquire").click()
        expect(page.get_by_role("heading", name="The Loom Room")).to_be_visible()
        expect(page.locator(".venue-hero [data-photo='yes'] img")).to_have_attribute("src", re.compile("v01-loom-room"))
        expect(page.get_by_role("heading", name="Accessibility")).to_be_visible()
        expect(page.get_by_role("heading", name="Priced extras")).to_be_visible()
        shot(page, "04b-venue-detail")
        print("4a. Gallery: open the third photo full screen, switch, close; focus returns")
        opens = page.locator(".venue-gallery .gallery-open")
        expect(opens).to_have_count(3)
        opens.nth(2).click()
        viewer = page.locator("dialog.viewer")
        expect(viewer.locator(".viewer-count")).to_have_text("3 of 3")
        expect(viewer.locator(".viewer-stage img")).to_have_attribute("src", "/images/venues/v01-loom-room-03.webp")
        shot(page, "04c-gallery-fullscreen", full=False)
        page.keyboard.press("ArrowRight")
        expect(viewer.locator(".viewer-count")).to_have_text("1 of 3")
        viewer.get_by_role("button", name="Next photo").click()
        expect(viewer.locator(".viewer-count")).to_have_text("2 of 3")
        page.keyboard.press("Escape")
        expect(viewer).to_be_hidden()
        expect(opens.nth(2)).to_be_focused()
        page.get_by_label("Message to the venue").fill("Could we have the space from 6pm? Drinks and a short talk.")
        page.get_by_role("button", name="Send enquiry").click()
        expect(page.get_by_text("Enquiry sent").first).to_be_visible()
        expect(page.get_by_text("Awaiting venue reply").first).to_be_visible()
        enquiry_url = page.url.split("?")[0]
        shot(page, "05-enquiry-sent")
        sign_out(page)

        print("5. Owner opens the inbox and sends an itemised quote")
        sign_in_as(page, "Sam")
        expect(page.get_by_role("heading", name="Manage listings")).to_be_visible()
        shot(page, "06-owner-listings")
        page.get_by_role("link", name="Inbox").click()
        page.get_by_role("link", name="Priya Shah").first.click()
        expect(page.get_by_role("heading", name="Send an itemised quote")).to_be_visible()
        page.locator("#label_2").fill("Bar staff (2)")
        page.locator("#amount_2").fill("240")
        page.locator("#deposit").fill("900")
        page.get_by_role("button", name="Send quote").click()
        expect(page.get_by_text(re.compile(r"Quote Q-\w+-1 sent")).first).to_be_visible()
        shot(page, "07-owner-quote-sent")
        sign_out(page)

        print("6. Planner asks about the quote; owner revises it")
        sign_in_as(page, "Priya")
        page.goto(enquiry_url)
        page.get_by_label("Reply").fill("Could you drop the bar staff? We'll use our own.")
        page.get_by_role("button", name="Send message").click()
        expect(page.get_by_text("Message sent").first).to_be_visible()
        sign_out(page)
        sign_in_as(page, "Sam")
        page.goto(enquiry_url)
        expect(page.locator("#label_1")).to_have_value("Bar staff (2)")
        page.locator("#label_1").fill("")
        page.locator("#amount_1").fill("")
        page.locator("#deposit").fill("850")
        page.get_by_role("button", name="Send revised quote").click()
        expect(page.get_by_text(re.compile(r"Quote Q-\w+-2 sent")).first).to_be_visible()
        sign_out(page)

        print("7. Planner pays: declined card, then success")
        sign_in_as(page, "Priya")
        page.goto(enquiry_url)
        expect(page.get_by_text("Replaced").first).to_be_visible()  # version 1 kept in history
        shot(page, "08-planner-quote-versions")
        # Fix A: declining asks first, and the keyboard lands in the confirmation's reason field. Keep changes nothing.
        page.locator(".decline-toggle").click()
        page.get_by_role("button", name="Decline quote").click()
        page.wait_for_url(re.compile(r"confirmDecline="))
        expect(page.get_by_text("Decline this quote? The venue will be told.")).to_be_visible()
        page.wait_for_function("document.activeElement && document.activeElement.id === 'reason'")
        assert page.evaluate("document.activeElement.id") == "reason", "focus did not move into the confirmation box"
        page.get_by_role("link", name="Keep").click()
        page.wait_for_url(lambda u: "confirmDecline" not in u)
        page.get_by_role("button", name=re.compile(r"Pay £850 deposit")).click()
        expect(page.get_by_text("Demo payment · no real money").first).to_be_visible()
        page.get_by_label("Test card number").fill("4000 0000 0000 0002")
        page.get_by_role("button", name=re.compile(r"Pay £850")).click()
        expect(page.get_by_text("Payment failed").first).to_be_visible()
        shot(page, "09-payment-declined")
        page.get_by_role("link", name="Back to the quote").click()
        expect(page.get_by_text("Your last payment didn’t go through").first).to_be_visible()
        page.get_by_role("button", name=re.compile(r"Pay £850 deposit")).click()
        page.get_by_label("Test card number").fill("4242 4242 4242 4242")
        page.get_by_role("button", name=re.compile(r"Pay £850")).click()
        expect(page.get_by_text("Booking confirmed").first).to_be_visible()
        expect(page.get_by_text("Remaining balance").first).to_be_visible()
        expect(page.get_by_text(re.compile("Deposit paid")).first).to_be_visible()
        expect(page.locator(".booking-panel .chip", has_text="Balance due")).to_be_visible()
        # Design pass 3.14: the journey tracker and next action lead; terms are folded under details.
        expect(page.locator(".booking-panel .btrack-step.done", has_text="Deposit paid")).to_be_visible()
        expect(page.locator(".booking-panel .next-action", has_text="Pay the remaining")).to_be_visible()
        page.locator(".booking-panel .booking-details summary").click()
        expect(page.get_by_text(re.compile("If you cancel 15 or more days before the event")).first).to_be_visible()
        shot(page, "10-booking-confirmed")

        print("7b. Remaining balance through Gather: declined, then paid; Paid in full only after confirmation")
        page.goto(f"{BASE}/bookings")
        page.get_by_role("button", name="Pay remaining balance").first.click()
        page.wait_for_url(re.compile(r"/checkout/demo/"))
        expect(page.get_by_role("heading", name="Pay your remaining balance")).to_be_visible()
        page.get_by_label("Test card number").fill("4000 0000 0000 0002")
        page.get_by_role("button", name=re.compile(r"Pay £3,350")).click()
        expect(page.get_by_text("Your booking is still confirmed").first).to_be_visible()
        page.goto(f"{BASE}/bookings")
        expect(page.get_by_text(re.compile("Balance due · BK-")).first).to_be_visible()
        page.get_by_role("button", name="Pay remaining balance").first.click()
        page.wait_for_url(re.compile(r"/checkout/demo/"))
        page.get_by_label("Test card number").fill("4242 4242 4242 4242")
        page.get_by_role("button", name=re.compile(r"Pay £3,350")).click()
        expect(page.get_by_text("Balance paid for The Loom Room").first).to_be_visible()
        expect(page.locator(".booking-panel .chip", has_text="Paid in full")).to_be_visible()
        shot(page, "10b-paid-in-full")

        print("8. The booked date no longer appears for a new search")
        page.goto(f"{BASE}/plan")
        page.get_by_label("Your event").fill("Drinks for 60 standing in Shoreditch on 26 March 2027")
        page.get_by_role("button", name="Read my brief").click()
        page.wait_for_url(re.compile(r"/plan/[0-9a-f-]{36}$"))
        page.get_by_role("button", name="Search venues").click()
        page.wait_for_url(re.compile(r"/results"))
        expect(page.get_by_role("heading", level=1)).to_be_visible()
        assert page.locator("article.venue-card", has_text="The Loom Room").count() == 0, "booked venue reappeared"
        page.goto(f"{BASE}/bookings")
        expect(page.get_by_text(re.compile(r"Paid in full · BK-")).first).to_be_visible()
        sign_out(page)

        print("9. Owner calendar shows the booking; edit listing")
        sign_in_as(page, "Sam")
        page.goto(f"{BASE}/owner")
        page.locator("article.venue-card", has_text="The Loom Room").get_by_role("link", name="Dates and calendar").click()
        page.wait_for_url(re.compile(r"/calendar"))
        page.goto(page.url.split("?")[0] + "?month=2027-03")
        expect(page.locator(".entry.booking").first).to_be_visible()
        shot(page, "11-owner-calendar")
        page.goto(f"{BASE}/owner")
        page.locator("article.venue-card", has_text="The Loom Room").get_by_role("link", name="Edit listing").click()
        page.wait_for_url(re.compile(r"/owner/listings/[0-9a-f-]{36}$"))
        expect(page.get_by_role("heading", name="Facilities and extras")).to_be_visible()
        shot(page, "12-owner-edit-listing", full=False)
        sign_out(page)

        print("9b. A new listing is set up in five steps; publishing needs a photo; photos drag into order")
        sign_in_as(page, "Sam")
        page.goto(f"{BASE}/owner/listings/new")
        expect(page.get_by_role("heading", name="Step 1 of 5: Details and price")).to_be_visible()
        page.get_by_label("Listing name").fill("The Test Loft")
        page.get_by_label("Kind of space").fill("Loft")
        page.get_by_label("Borough").select_option("Hackney")
        page.get_by_label("Standing").fill("40")
        page.get_by_label("Amount (£)").fill("900")
        expect(page.get_by_role("button", name="Save draft")).to_be_visible()
        page.get_by_role("button", name="Next: Facilities and extras").click()
        page.wait_for_url(re.compile(r"/owner/listings/[0-9a-f-]{36}\?"))
        new_id = re.search(r"/owner/listings/([0-9a-f-]{36})", page.url).group(1)
        expect(page.get_by_text("Draft saved.").first).to_be_visible()
        expect(page.get_by_role("heading", name="Step 2 of 5: Facilities and extras")).to_be_visible()
        page.goto(f"{BASE}/owner/listings/{new_id}?step=publish")
        expect(page.get_by_role("button", name="Publish listing")).to_be_disabled()
        page.goto(f"{BASE}/owner")
        card = page.locator("article.venue-card", has_text="The Test Loft")
        expect(card.locator("[data-photo='fallback']")).to_be_visible()
        expect(card.get_by_text("Photo coming soon")).to_be_visible()
        expect(card.get_by_text("Draft: 1 of 5 steps done")).to_be_visible()
        expect(card.get_by_text(re.compile("Still to do: at least one photo"))).to_be_visible()
        # Leaving and coming back resumes at the first unfinished step.
        card.get_by_role("link", name="Continue setup").click()
        expect(page.get_by_role("heading", name="Step 2 of 5: Facilities and extras")).to_be_visible()
        page.get_by_role("button", name="Next: Photos").click()
        expect(page.get_by_text("Facilities and extras saved.").first).to_be_visible()
        expect(page.get_by_role("heading", name="Step 3 of 5: Photos")).to_be_visible()
        # A draft can't be published from the dashboard either: the server refuses without a photo.
        photo, photo2 = make_test_photo(), make_test_photo("/tmp/gather-test-photo-2.jpg", (150, 60, 40))
        page.locator("#photos-input").set_input_files([photo, photo2])
        expect(page.locator(".photo-previews img")).to_have_count(2)
        page.get_by_role("button", name="Upload photos").click()
        expect(page.get_by_text("2 photos added.").first).to_be_visible()
        expect(page.get_by_role("heading", name="Step 3 of 5: Photos")).to_be_visible()
        expect(page.locator(".photo-item .chip", has_text="Cover")).to_be_visible()
        before = page.locator("li[data-photo-id]").evaluate_all("els => els.map(e => e.dataset.photoId)")
        # Drag photo 2 by its handle onto photo 1: it becomes the cover.
        src = page.get_by_role("button", name="Drag to reorder photo 2").bounding_box()
        dst = page.locator("li[data-photo-id]").first.locator(".photo-frame").bounding_box()
        page.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2)
        page.mouse.down()
        for k in range(1, 11):
            page.mouse.move(src["x"] + (dst["x"] + dst["width"] / 2 - src["x"]) * k / 10, src["y"] + (dst["y"] + dst["height"] / 2 - src["y"]) * k / 10)
        page.mouse.up()
        expect(page.get_by_text("Photo order updated.").first).to_be_visible()
        after = page.locator("li[data-photo-id]").evaluate_all("els => els.map(e => e.dataset.photoId)")
        assert after == [before[1], before[0]], f"drag didn't reorder: {before} -> {after}"
        expect(page.get_by_role("heading", name="Step 3 of 5: Photos")).to_be_visible()
        shot(page, "12a-owner-photos", full=False)
        # Fix 2: the arrows move a photo one place; moving the cover down makes the next photo the cover,
        # and focus comes back to the same photo's arrow.
        page.get_by_role("button", name="Move photo 1 down the order").click()
        expect(page.get_by_text("Cover photo updated.").first).to_be_visible()
        again = page.locator("li[data-photo-id]").evaluate_all("els => els.map(e => e.dataset.photoId)")
        assert again == before, f"arrow didn't move the photo: {after} -> {again}"
        page.wait_for_function("document.activeElement && (document.activeElement.dataset.move || '').startsWith(%r)" % (after[0] + ":"))
        page.get_by_role("button", name="Remove photo 2").click()
        expect(page.get_by_text("Photo removed.").first).to_be_visible()
        page.get_by_role("link", name="Next: Dates").click()
        expect(page.get_by_role("heading", name="Step 4 of 5: Dates")).to_be_visible()
        page.get_by_role("link", name="Next: Review and publish").click()
        expect(page.get_by_role("heading", name="Step 5 of 5: Review and publish")).to_be_visible()
        page.get_by_role("button", name="Publish listing").click()
        expect(page.get_by_text("Published.").first).to_be_visible()
        expect(page.get_by_role("button", name="Remove photo 1")).to_be_disabled()
        page.goto(f"{BASE}/owner")
        card = page.locator("article.venue-card", has_text="The Test Loft")
        expect(card.locator("[data-photo='yes'] img.venue-upload")).to_be_visible()
        sign_out(page)
        sign_in_as(page, "Priya")
        page.goto(f"{BASE}/venues/{new_id}")
        hero = page.locator(".venue-hero img.venue-upload")
        expect(hero).to_be_visible()
        assert page.evaluate("document.querySelector('.venue-hero img.venue-upload').naturalWidth") > 0, "uploaded cover didn't load"
        shot(page, "12b-uploaded-cover", full=False)
        sign_out(page)

        print("10. Admin dashboard")
        sign_in_as(page, "Amara")
        expect(page.get_by_role("heading", name="Pilot dashboard")).to_be_visible()
        expect(page.get_by_text("Confirmed bookings").first).to_be_visible()
        shot(page, "13-admin")
        page.get_by_role("link", name="All time").click()
        sign_out(page)

        print("11. Role guard: a planner can't open the admin page")
        sign_in_as(page, "Priya")
        page.goto(f"{BASE}/admin")
        expect(page.get_by_text("That page is for a different account type.").first).to_be_visible()
        sign_out(page)

        print("12. A signed-out email link returns to the enquiry after sign-in")
        fresh = browser.new_context(viewport={"width": 1360, "height": 900})
        f = fresh.new_page()
        f.goto(enquiry_url)
        f.wait_for_url(re.compile(r"/login\?next="))
        expect(f.get_by_text("Sign in to continue").first).to_be_visible()
        f.get_by_role("button", name="Sign in as Priya").click()
        f.wait_for_url(enquiry_url)
        expect(f.get_by_text(re.compile(r"Booking BK-\w+ confirmed")).first).to_be_visible()
        fresh.close()

        print("13. Mobile (touch): hero, checked section on scroll, shortlist")
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        m = mobile.new_page()
        m.goto(BASE)
        expect(m.locator(".hero").get_by_role("link", name="Find a venue", exact=True)).to_be_visible()
        m.wait_for_timeout(1500)
        shot(m, "14-mobile-hero", full=False)
        top = m.evaluate("document.querySelector('.checked').getBoundingClientRect().top + scrollY")
        m.evaluate(f"window.scrollTo(0, {top} - innerHeight * 0.95)")
        m.wait_for_timeout(400)
        early = frame_transform(m)
        m.evaluate(f"window.scrollTo(0, {top} - 40)")
        m.wait_for_timeout(1200)
        assert early != frame_transform(m), "the checked image should respond to scroll on touch devices"
        shot(m, "15-mobile-checked", full=False)
        sign_in_as(m, "Priya")
        m.goto(f"{BASE}/plan")
        m.get_by_label("Your event").fill("80 people standing in Shoreditch on 2 April 2027, needs AV")
        m.get_by_role("button", name="Read my brief").click()
        m.wait_for_url(re.compile(r"/plan/[0-9a-f-]{36}$"))
        m.get_by_role("button", name="Search venues").click()
        m.wait_for_url(re.compile(r"/results"))
        m.wait_for_timeout(1200)
        shot(m, "16-mobile-shortlist", full=False)
        m.close()

        print("13b. Signed-in header at 360x640 on every role: logo visible, nothing overlaps or runs off screen")
        for who, path in [("Priya", "/plan"), ("Sam", "/owner"), ("Amara", "/admin")]:
            small = browser.new_context(viewport={"width": 360, "height": 640}, is_mobile=True, has_touch=True)
            s = small.new_page()
            sign_in_as(s, who)
            s.goto(f"{BASE}{path}")
            for ribbon in ("with demo ribbon", "without ribbon (as hosted)"):
                if ribbon.startswith("without"):
                    s.evaluate("document.querySelector('.demo-ribbon')?.remove()")
                hdr = s.evaluate("""() => {
                  const els = [...document.querySelectorAll('.site-header a, .site-header button, .site-header .role-pill')].map(e => e.getBoundingClientRect());
                  let overlaps = 0;
                  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                    const a = els[i], b = els[j];
                    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
                  }
                  return { logoTop: document.querySelector('a.brand').getBoundingClientRect().top, overlaps,
                           offRight: els.filter(r => r.right > innerWidth + 0.5).length, scrollX: document.documentElement.scrollWidth > innerWidth };
                }""")
                assert hdr["logoTop"] >= 0, f"{who} {ribbon}: logo cut off at the top ({hdr})"
                assert hdr["overlaps"] == 0 and hdr["offRight"] == 0 and not hdr["scrollX"], f"{who} {ribbon}: header overlap ({hdr})"
            small.close()

        print("14. Reduced motion: no motion classes, everything visible, checked section static")
        still = browser.new_context(viewport={"width": 1360, "height": 900}, reduced_motion="reduce")
        r = still.new_page()
        r.goto(BASE)
        assert not r.evaluate("document.documentElement.classList.contains('motion-ok')")
        expect(r.get_by_role("heading", level=1)).to_be_visible()
        scroll_through(r)
        assert_images_loaded(r, "homepage (reduced motion)")
        assert frame_transform(r) == "none", "the checked image should be still with reduced motion"
        assert r.locator(".checked-list li").evaluate_all("els => els.every(e => getComputedStyle(e).opacity === '1')"), "checks visible with reduced motion"
        r.evaluate("window.scrollTo(0, 0)")
        shot(r, "17-reduced-motion-full")
        still.close()

        print("15. Keyboard: Tab reaches the hero's Find a venue with a visible focus ring")
        page.goto(BASE)
        for _ in range(12):
            page.keyboard.press("Tab")
            if page.evaluate("document.activeElement.textContent.trim()") == "Find a venue" and page.evaluate("!!document.activeElement.closest('.hero')"):
                break
        else:
            raise AssertionError("Tab never reached the hero's Find a venue button")
        outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        assert outline != "none", "focused button should show an outline"
        shot(page, "18-keyboard-focus", full=False)

        browser.close()
        if errors:
            raise SystemExit(f"Browser errors: {errors}")
        print("\nWalkthrough passed.")


if __name__ == "__main__":
    run()
