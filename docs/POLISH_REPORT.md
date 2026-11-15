# Product polish and Stage 2 close-out: report (15 Nov 2026)

**Branch:** `claude/gather-polish`, based on `claude/gather-stage2` at `51504f1` (what www.gatherldn.com serves).
**Promoted to production by Jay's request, 15 Nov 05:50 GMT:** `claude/gather-stage2` (Vercel's production branch) was fast-forwarded to this branch (`51504f1 → ebe9d33`), so www.gatherldn.com now serves the polish version. `main` is unchanged.

## What changed

| Area | Change |
|---|---|
| Venue photos | Upload with preview, set cover, reorder, replace and remove (1–6 per listing). Each file is checked as a decoded image (JPEG, PNG or WebP only; at most 4 MB; at least 1200 × 800). Orientation is normalised and all metadata (EXIF/GPS) stripped. Every photo gets the same 3:2 crop, saved as WebP at 480, 960 and 1600 px. Files go to a **private** Supabase Storage bucket (local disk in demo mode); metadata lives in `listing_photos`. Photos are served through `/photos/<id>/<size>`: drafts are visible only to their owner and the admin. An owner's uploads replace a seeded venue's original photos everywhere, and the first upload is the cover |
| Publish rule (server) | New listings start as drafts. Publishing needs at least one photo, checked in the service (create, edit and the publish toggle). The last photo of a live listing can't be removed |
| Owner forms | The listing form is grouped into About the space, Location and access, Capacity and Price. Buttons say **Save draft** (new) or **Save changes** (edit); **Publish** / **Unpublish** is a separate status panel with a checklist. Every field error shows next to its field, and nothing typed is lost |
| Facility icons | One shared icon map (`FacilityIcon`), used on the shortlist chips, the venue page lists, the brief's facility picker and the owner's facilities table |
| "Why it fits" | Leads with layout headroom ("Holds 120 standing for your 80"), then at most two of: the essentials asked for, location against the planner's area, a complete estimate within budget, and the owner's stated suitability. Ranking and hard filters are unchanged; the evaluation isn't affected |
| Email | One branded template (HTML plus text, preheader, reference, a single absolute button, a test-payment label) for every email. The outbox now stores the text body |
| Balance | Booking pages (thread and Bookings), the payment confirmation and both booking emails show the total, the deposit paid through Gather and the remaining balance. (Correction, 15 Nov: the balance is paid through Gather, from Bookings → Pay remaining balance, not invoiced by the venue.) A possible Stripe Connect flow is in `docs/PAYMENTS.md` |
| Admin "Needs attention" | **View** and **Contact owner/planner** on every row. Admin only. The recipient is derived on the server. Amara composes (with inline errors), then reviews the exact email before sending once. The `admin_contacts` table is the audit trail, and each item can be contacted at most once per 24 hours |
| Keep-alive | `vercel.json` runs `GET /api/cron/keepalive` daily at `0 10 * * *` (UTC). It needs `CRON_SECRET`: without it the route returns 503, and with the wrong one 401. It runs one read-only `select 1 from listings limit 1` and returns `{ok:true}` with `no-store` |
| Costs | `docs/COST_MODEL.md`: GBP, a 500-briefs-a-month workload, ≈ £0.30 a month now and ≈ £34–50 a month on paid plans; payment fees kept separate |
| Mobile calendar | Day rows on phones: the date and state are spaced apart, with a full-size Open/Block button |
| Venue gallery and full-screen viewer | Eight new illustrative views (cherry-picked `ef8f85a`, mapped by `docs/gather-venue-gallery.csv` into `src/lib/venue-gallery.ts`). The Loom Room shows 3 photos; Copper Arch, Glass Yard, Signal Box, Pinehurst, Battersea Glasshouse and Stratford Atrium show 2 each; the cover is always first. Click or tap any photo to open it full screen: Previous/Next, "2 of 3", a visible Close, arrow keys, Escape, swipe, and focus returns to the photo that opened it. Browsing loads only thumbnails (next/image for committed files, 480/960 for uploads). Full screen loads the committed 1440 × 960 file untouched, or the 1600 px upload, fitted on a dark background at its own aspect ratio and never above native size. Owner uploads replace the seeded gallery. Single-photo venues open too |
| Buttons show progress | Every action button (28 of them, plus photo upload/replace) shows what it's doing while the server works ("Reading your brief…", "Searching venues…", "Sending quote…") with a spinner, and is disabled so a second click can't submit twice. Found on the preview: the OpenAI read takes about 3 s with no feedback, which looked broken and led to duplicate briefs. The brief box placeholder now starts "For example:" so it isn't mistaken for filled-in text |
| Field help and alignment | Every "e.g." or helper line under a label is now an ⓘ next to the field name (`InfoTip`). Its text fades in while the pointer is on the ⓘ and fades out when it leaves; it also shows on keyboard focus or a tap, and stays linked to the field for screen readers. Labels are one line, and inputs and dropdowns share one 46 px height (Safari had drawn dropdowns shorter), so fields in a row line up exactly. Form sections are separated by full-width rules |

Migration `0004_polish.sql` is additive: one new column, two new tables, RLS on.

## Checks

- `npm run typecheck`, `npm run lint` and `npm run build`: clean.
- `npm test`: **113 passed**. New targeted tests:
  - `tests/photos.test.ts`: decoded-format checks, metadata stripping, crop and sizes, owner-only changes, the publish rule, last-photo block, draft visibility, Storage adapter.
  - `tests/admin-contact.test.ts`: admin only, recipient scoping, validation, send-once, 24-hour dedupe, discarded drafts.
  - `tests/keepalive.test.ts`: missing secret, wrong secret, read-only query, hidden database errors.
  - `tests/email-template.test.ts`.
  - "Why it fits" and icon-map tests.
- `e2e/walkthrough.py` passes end to end on a fresh demo database. It now covers draft → photo upload → publish → uploaded cover on the owner and planner pages, and the balance breakdown.
- **Page inventory** at desktop 1360×900, mid 820×1180, 390×844 and 360×640, for anonymous visitors, Priya, Sam and Amara:
  - before: 128 visits, 0 issues;
  - after: 132 visits (including the admin contact page), 0 issues.

  Each visit checks horizontal overflow, clipped controls, logo position, console errors and 5xx responses. After the ⓘ change, pages with an ⓘ report a target under 32 px: the ⓘ is drawn at 22 px, but its tap area extends to 38 px. A re-run after the ⓘ change (`after2`) still found 0 issues across 132 visits.

Before/after pairs are in `docs/screenshots/polish/`.

## Per-role checklist

| Role | Page or action | Result |
|---|---|---|
| Public | Home, sign in, sign up (planner/owner), 404, role guards | Pass |
| Planner | Brief → follow-up → shortlist (specific "Why it fits", facility icons, price sort) | Pass |
| Planner | Venue page (gallery, icons), enquiry, quote versions | Pass |
| Planner | Pay deposit (decline then success), booking with balance breakdown | Pass (demo); hosted re-run pending |
| Planner | Bookings list with breakdown | Pass |
| Owner | New listing → Save draft; inline errors keep input | Pass |
| Owner | Publish blocked without a photo (button and server) | Pass |
| Owner | Upload, preview, cover, reorder, replace, remove; last live photo protected | Pass (demo + tests). **Hosted upload: Pass** on the preview, 15 Nov 04:46: one synthetic image added to the draft Olu Test Annex. Result: "Photo added.", Cover set, Publish enabled. All 3 sizes served from private Storage as WebP with `private, no-store`; an invalid size gave 404; signed out, the photo gave 404 |
| Owner | Save changes doesn't change publish state; Publish/Unpublish | Pass |
| Owner | Calendar (mobile spacing), inbox, quote, bookings filter and sort | Pass |
| Admin | Dashboard; Needs attention → View → Contact → Review → Send; history; dedupe | Pass (demo + tests); hosted send pending |
| Admin | Planner/owner pages refused | Pass |
| Planner | Read my brief → Answer → Search venues on the hosted preview (real OpenAI) | **Hosted: Pass** (15 Nov, 05:50): each button showed its progress label while working; the brief was read by OpenAI, the date follow-up was saved and the search gave "5 venues that fit" |
| Planner | Venue gallery + full-screen viewer | **Hosted: Pass** on the preview (15 Nov, 05:30), signed in as `+planner`, at 1360 × 900 and 390 × 844. Venues checked: all 7 mappings (Loom Room 3 photos, the other six 2 each), Alder Private Dining (single photo) and Olu Test Loft (2 synthetic owner uploads). For each one: opened the last photo directly, then arrow key, Next and swipe, then Close; focus returned to the opening photo. The full-screen image always fitted the viewport, kept its aspect ratio and was never larger than native (1212 × 808 of 1440 × 960 on desktop). Network log: page load fetched only `/_next/image` thumbnails (uploads: 960 only); opening fetched the original `/images/venues/…-02.webp` (uploads: `/photos/…/1600`). One bug found and fixed (`757d5af`): after switching photos, focus had gone to the wrong thumbnail |
| System | Keep-alive cron refuses without or with a wrong secret, answers with the right one | **Pass in production.** Vercel → Cron Jobs lists `/api/cron/keepalive`, Active, daily at 10:00 UTC. A manual **Run** logged `[gather] keep-alive ok`; a browser visit without the secret logged `refused: unauthorised` (401) |
| System | Branded emails with absolute links and test label | Pass (outbox + tests); real inbox check pending on preview |

## Defects that need behaviour changes (recorded, not fixed here)

- **Preview shares the production database and bucket.** Anything tested on the preview is live data.
- **Live listings that predate the photo rule.** Olu Test Loft and Annex were published without photos. They stay as they are; the rule applies the next time they're published.
- **Replacing photos on a live listing.** Planners' browsers may cache the old file for up to a day. Replace gives the new file a new URL, so pages show the new photo as soon as they reload.
- **Upload size.** Vercel caps a request body at 4.5 MB, so owners upload up to 4 MB per batch. Bigger phone photos need resizing first, or a direct-to-Storage signed upload later.
- **Email replies.** Emails come from `bookings@mail.gatherldn.com`, which has no inbox, so admin contact emails don't invite replies. Before real use, add a reply-to address (e.g. Amara's) so owners and planners can answer.

## Still for Jay

1. ~~Set `CRON_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and create the private `venue-photos` bucket.~~ Done by Jay, 15 Nov; checked on the preview.
2. Optional extra hosted checks on the preview: a test booking's balance email, and an admin contact email to the `+owner` inbox. Olu Test Annex now has one synthetic photo and is still a draft.
3. ~~Promote~~ Done (production = `ebe9d33`). Merging into `main` is still Jay's call.
