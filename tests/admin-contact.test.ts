import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, migrate, type Db } from "@/lib/db";
import { seedAccountsAndVenues } from "@/lib/seed";
import type { Actor } from "@/lib/services/errors";
import { createBrief } from "@/lib/services/briefs";
import { createListing } from "@/lib/services/listings";
import { cancelContactDraft, contactHistory, createContactDraft, getContactTarget, sendContactDraft } from "@/lib/services/admin-contact";

let db: Db;
let actors: Map<string, Actor>;
const A = (email: string) => actors.get(email)!;
let admin: Actor;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  actors = await seedAccountsAndVenues(db, "test-password-123");
  admin = [...actors.values()].find((a) => a.role === "admin")!;
});

const draftListing = (owner: Actor) =>
  createListing(db, owner, { name: "Attention Test Room", venueType: "Room", borough: "Hackney", pricingModel: "hire_fee", pricePence: 50_000, capacityStanding: 40, capacitySeated: null, capacityMixed: null, published: false });

describe("admin contact from Needs attention", () => {
  it("is admin-only: planners and owners can't view or contact", async () => {
    const [l] = await db.query<{ id: string }>("select id from listings limit 1");
    for (const who of ["planner@gather.test", "owner@gather.test"]) {
      await expect(getContactTarget(db, A(who), "draft_listing", l.id)).rejects.toThrow(/admin/);
      await expect(createContactDraft(db, A(who), "draft_listing", l.id, "Hello there", "A message body here")).rejects.toThrow(/admin/);
    }
    await expect(getContactTarget(db, null, "draft_listing", l.id)).rejects.toThrow(/sign in/i);
  });

  it("derives the recipient on the server: a brief's planner, a listing's owner", async () => {
    const planner = A("planner@gather.test");
    const briefId = await createBrief(db, planner, "Dinner for 30 seated in Peckham on 3 March 2027");
    const t = await getContactTarget(db, admin, "unmatched_brief", briefId);
    expect(t.recipient).toMatchObject({ id: planner.id, email: planner.email, role: "planner" });
    const [l] = await db.query<{ id: string; owner_id: string }>("select id, owner_id from listings where slug = 'v01-loom-room'");
    const t2 = await getContactTarget(db, admin, "draft_listing", l.id);
    expect(t2.recipient.id).toBe(l.owner_id);
    expect(t2.recipient.role).toBe("owner");
  });

  it("rejects unknown kinds and ids", async () => {
    await expect(getContactTarget(db, admin, "profile", "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/couldn't find/);
    await expect(getContactTarget(db, admin, "draft_listing", "not-a-uuid")).rejects.toThrow(/couldn't find/);
  });

  it("validates fields without losing them, sends once, records an audit row, and dedupes for 24 hours", async () => {
    const owner = A("owner@gather.test");
    const listingId = await draftListing(owner);
    const bad = await createContactDraft(db, admin, "draft_listing", listingId, "", "short");
    expect(bad).toEqual({ ok: false, errors: { subject: "Add a subject.", body: "Write a message of at least a sentence." } });

    const draft = await createContactDraft(db, admin, "draft_listing", listingId, "Your draft listing", "Hi, your listing is still a draft.\n\nPublish it when ready.");
    expect(draft.ok).toBe(true);
    const draftId = (draft as { draftId: string }).draftId;
    const sent = await sendContactDraft(db, admin, draftId);
    expect(sent.status).toBe("logged"); // demo mode writes to the outbox and sends nothing
    await expect(sendContactDraft(db, admin, draftId)).rejects.toThrow(/already been sent/);

    const [mail] = await db.query<{ to_email: string; template: string; body_text: string; link: string }>(
      "select o.to_email, o.template, o.body_text, o.link from admin_contacts c join email_outbox o on o.id = c.outbox_id where c.id = $1", [draftId]);
    expect(mail.to_email).toBe(owner.email);
    expect(mail.template).toBe("admin_contact");
    expect(mail.body_text).toContain("Publish it when ready.");
    expect(mail.link).toMatch(new RegExp(`^https?://.+/owner/listings/${listingId}$`));

    const history = await contactHistory(db, admin, "draft_listing", listingId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ subject: "Your draft listing", recipient_name: expect.any(String) });

    const again = await createContactDraft(db, admin, "draft_listing", listingId, "Second nudge", "Another message about the listing.");
    expect(again.ok).toBe(false);
    expect((again as { errors: { form?: string } }).errors.form).toMatch(/already contacted/);
  });

  it("a discarded draft can't be sent", async () => {
    const [l] = await db.query<{ id: string }>("select id from listings where slug = 'v02-copper-arch'");
    const d = await createContactDraft(db, admin, "draft_listing", l.id, "Hello owner", "Just checking in on the listing.");
    const id = (d as { draftId: string }).draftId;
    await cancelContactDraft(db, admin, id);
    await expect(sendContactDraft(db, admin, id)).rejects.toThrow(/already been sent or cancelled/);
  });
});
