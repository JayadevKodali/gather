import re, sys
from playwright.sync_api import sync_playwright, expect
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
PASS = "a quiet walk along the regents canal at dusk"   # 44 chars with spaces
def outbox_link(page, to, template_subject):
    page.goto(B + "/dev/outbox")
    row = page.locator("tr", has_text=to).filter(has_text=template_subject).first
    return row.locator("a").first.get_attribute("href")
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for role, label in [("planner", "An event planner"), ("owner", "A venue owner")]:
        print(f"sign-up as {role}")
        ctx = b.new_context(viewport={"width": 390, "height": 844}); p = ctx.new_page()
        p.goto(B + ("/signup?role=owner" if role == "owner" else "/signup"))
        p.get_by_label("Your name").fill(f"Test {role.title()}")
        p.get_by_label("Email").fill(f"e2e-{role}@x.test")
        pwd = p.locator("#password")
        pwd.fill("short one"); expect(p.locator(".strength")).to_contain_text("Too short")
        pwd.fill("1q2w3e4r5t6y")
        p.get_by_role("button", name="Create account").click()
        expect(p.get_by_text("This password is too common. Choose another.")).to_be_visible()
        assert p.get_by_label("Email").input_value() == f"e2e-{role}@x.test", "email kept after an error"
        p.locator("#password").fill(PASS); expect(p.locator(".strength")).to_contain_text("Strong")
        if role == "owner": assert p.get_by_label(label).is_checked()
        p.screenshot(path=f"/tmp/auth-signup-{role}.png", full_page=True)
        p.get_by_role("button", name="Create account").click()
        expect(p.get_by_role("heading", name="Check your email")).to_be_visible()
        # The page names the address and resends with one click: no email box to fill in again.
        expect(p.locator(".sent-to")).to_have_text(f"e2e-{role}@x.test")
        expect(p.get_by_text("planner account" if role == "planner" else "venue account")).to_be_visible()
        assert p.get_by_label("Your email").count() == 0, "no email box when the address is known"
        p.get_by_role("button", name="Send a new link").click()
        expect(p.get_by_text("If this address is still waiting to be confirmed")).to_be_visible()
        expect(p.get_by_role("link", name="Start again")).to_be_visible()
        # Signing in before verifying doesn't give access.
        p.goto(B + "/login"); p.get_by_label("Email").fill(f"e2e-{role}@x.test"); p.get_by_label("Password", exact=True).fill(PASS)
        p.get_by_role("button", name="Sign in", exact=True).click()
        expect(p.get_by_role("heading", name="Confirm your email first")).to_be_visible()
        expect(p.locator(".sent-to")).to_have_text(f"e2e-{role}@x.test")
        link = outbox_link(p, f"e2e-{role}@x.test", "Confirm your email")
        p.goto(B + link); p.get_by_role("button", name="Confirm my email").click()
        expect(p.get_by_text(re.compile("Email confirmed"))).to_be_visible()
        print("  verified and signed in:", p.url.split("?")[0])
        p.goto(B + link); p.get_by_role("button", name="Confirm my email").click()
        expect(p.get_by_text("This link has expired or has already been used")).to_be_visible()
        assert not any(c["name"] == "gather_verify" for c in ctx.cookies()), "pending-address cookie cleared after confirming"
        # Another browser (no cookie) still gets the email box as a fallback.
        q = b.new_context().new_page(); q.goto(B + "/check-email")
        expect(q.get_by_label("Your email")).to_be_visible(); q.context.close()
        ctx.close()

    print("cooldown, then recovery by password reset")
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); p = ctx.new_page()
    for i in range(5):
        p.goto(B + "/login"); p.get_by_label("Email").fill("e2e-planner@x.test"); p.get_by_label("Password", exact=True).fill("wrong password!")
        p.get_by_role("button", name="Sign in", exact=True).click(); expect(p.get_by_text("don't match an account")).to_be_visible()
    p.goto(B + "/login"); p.get_by_label("Email").fill("e2e-planner@x.test"); p.get_by_label("Password", exact=True).fill(PASS)
    p.get_by_role("button", name="Sign in", exact=True).click(); expect(p.get_by_text("Too many attempts")).to_be_visible()
    p.get_by_role("link", name="Forgot password?").click()
    for email in ["e2e-planner@x.test", "nobody-at-all@x.test"]:
        p.goto(B + "/forgot-password"); p.get_by_label("Email").fill(email); p.get_by_role("button", name="Send reset link").click()
        expect(p.get_by_text("If there’s a Gather account for that email")).to_be_visible()
    reset = outbox_link(p, "e2e-planner@x.test", "Reset your Gather password")
    p.goto(B + reset); p.locator("#password").fill("1q2w3e4r5t6y"); p.get_by_role("button", name="Set new password").click()
    expect(p.get_by_text("This password is too common. Choose another.")).to_be_visible()
    p.locator("#password").fill("new evening passphrase by the river"); p.get_by_role("button", name="Set new password").click()
    expect(p.get_by_text(re.compile("Your password has been changed"))).to_be_visible()
    p.get_by_label("Email").fill("e2e-planner@x.test"); p.get_by_label("Password", exact=True).fill("new evening passphrase by the river")
    p.get_by_role("button", name="Sign in", exact=True).click(); p.wait_for_url(re.compile("/plan"))
    print("  signed in after reset:", p.url)
    p.goto(B + reset); p.locator("#password").fill("yet another long passphrase"); p.get_by_role("button", name="Set new password").click()
    expect(p.get_by_text("This link has expired or has already been used")).to_be_visible()
    p.screenshot(path="/tmp/auth-reused.png")
    print("reviewer logins")
    for who in ["Priya", "Sam", "Amara"]:
        q = b.new_context().new_page(); q.goto(B + "/login"); q.get_by_role("button", name=f"Sign in as {who}").click(); q.wait_for_load_state("networkidle")
        assert "/login" not in q.url, who; print(" ", who, "->", q.url.replace(B, ""))
    b.close()
print("auth e2e passed")
