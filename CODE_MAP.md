# Code map

A guide for explaining and changing Gather live. Paths are under `src/` unless stated.

## The one-paragraph version

Pages in `app/` call **server actions** (`app/actions/*.ts`). Each action reads the signed-in user
(`lib/auth/session.ts`) and calls a **service** (`lib/services/*.ts`). Services hold every rule: who
may do what, validation, and the database writes. Matching itself is a **pure function**
(`lib/matching/`) with no database or AI, so it's easy to test and change. The AI only proposes
brief fields (`lib/brief/`), and the planner confirms them before any search.

## Where each requirement lives

| Requirement (employer brief) | Main files |
|---|---|
| Sign-up/login, three roles | `lib/services/accounts.ts` (sign-up, sign-in, sessions), `lib/auth/session.ts` (`getActor`, `requirePageRole`), `app/login`, `app/signup`, `app/actions/auth.ts`. Admin is created only by `lib/seed.ts`. |
| Venue edits own listing, prices, availability | `lib/services/listings.ts` (`getOwnedListing` = ownership check), `app/owner/**`, `app/actions/owner.ts` |
| Free text → structured brief, follow-up | `lib/brief/rules-extractor.ts`, `lib/brief/openai-extractor.ts` (OpenAI Responses API, strict schema), `lib/brief/schema.ts` (zod validation), `lib/brief/followup.ts` (`nextQuestion`, `applyAnswer`), `lib/services/briefs.ts` |
| Ranked shortlist with reasons | `lib/matching/match.ts` (`matchVenues`), `lib/matching/score.ts` (`scoreVenue`, `buildReasons`), `app/plan/[id]/results/page.tsx` |
| Never show unavailable/over-capacity venues | `lib/matching/eligibility.ts` (`hardRuleFailures`), re-checked in `createEnquiry` and `startCheckout` |
| Enquiry → venue response, emails both sides | `lib/services/enquiries.ts`, `lib/adapters/email.ts` (`notify`), `app/enquiries/[id]/page.tsx` |
| Stripe test deposit | `lib/services/checkout.ts` (`startCheckout`, `fulfilCheckout`), `lib/adapters/payments.ts`, `app/api/stripe/webhook/route.ts`, `app/checkout/**` |
| Admin view | `lib/services/admin.ts` (`adminMetrics`), `app/admin/page.tsx` |
| 30+ venues, messy briefs | `data/venues.json` (made by `scripts/make-venues.py`), `data/dev-briefs.json` |
| Evaluation harness | `lib/eval/run.ts`, `scripts/eval.ts`, `scripts/labelling-sheet.ts`, `eval/README.md` |
| Database and security | `supabase/migrations/0001_schema.sql` (tables, constraints), `0002_rls.sql`, `lib/db/index.ts` |

## Request flow for "Search venues"

```
app/plan/[id]/page.tsx  form ─▶ app/actions/planner.ts saveDetailsAction
   └─ updateBriefFields()  lib/services/briefs.ts   zod-validate the planner's details
   └─ searchBrief()        lib/services/briefs.ts
        └─ loadMatchVenues()  lib/services/listings.ts   published venues + open days + taken days
        └─ matchVenues()      lib/matching/match.ts       hard rules → score → top 5 → reasons
        └─ save snapshot to `matches`, log `search_events`, set first_matched_at once
   └─ redirect to app/plan/[id]/results/page.tsx
```

## Request flow for "Pay deposit"

```
payDepositAction ─▶ startCheckout()    lib/services/checkout.ts
   in one transaction: current quote? within strict cap? date open and unbooked?
   → insert pending checkout (the HOLD; unique index = one hold per listing-day)
   → checkoutSummary()         lib/services/checkout-summary.ts   venue photo + "date · guests" for the payment page
   → provider.createSession()  demo page, or Stripe Checkout built by stripeSessionParams() in lib/adapters/payments.ts
paid ─▶ fulfilCheckout()  (demo page action, or Stripe webhook)
   in one transaction: amount + GBP + quote still current → insert booking (unique listing+date)
   → checkout paid, quote paid, enquiry booked → emails to both sides
```

## Design pass: where the new pieces live

| What | File |
|---|---|
| The one status pill (tones and icons) | `components/StatusPill.tsx` |
| Shared page header | `components/PageHeader.tsx` |
| Two-part layout for account pages and the 404 page | `components/AuthShell.tsx` |
| Brief box with example chips and the reading outline | `components/BriefBox.tsx` |
| The sticky "Your event" summary strip | `components/BriefStrip.tsx`, text from `lib/brief-summary.ts` |
| Booking panel: tracker, next action, payment timeline | `components/BookingPanel.tsx` |
| Live totals on the owner's quote form (display only) | `components/QuoteTotals.tsx` |
| The five set-up steps and what counts as done | `lib/listing-setup.ts`, step bar in `components/SetupSteps.tsx`, pages `app/owner/listings/new/page.tsx` and `app/owner/listings/[id]/page.tsx` |
| Photo tiles, arrows and drag to reorder | `components/PhotoManager.tsx`, `components/SortablePhotos.tsx`; server rule `reorderPhotos` in `lib/services/photos.ts` |
| Decline confirmation | `declineQuoteAction` in `app/actions/enquiry.ts`; the box in `app/enquiries/[id]/page.tsx` |
| What the payment page shows | `lib/services/checkout-summary.ts`; `stripeSessionParams` in `lib/adapters/payments.ts` |
| Venue-side wording | `enquiryStatusLabel` and `termsForViewer` in `lib/services/enquiries.ts` |
| Admin counts (confirmed bookings only) | `lib/services/admin.ts` |
| Design scales (spacing, type, corners, shadows, motion) | top of `app/globals.css` |
| Screenshot script for every page | `e2e/screens.py` (repo root) |

Tests added in the design pass, in `tests/` at the repo root: `viewer-wording.test.ts`, `decline-confirm.test.ts`,
`stripe-session.test.ts`, `listing-setup.test.ts`, `photo-arrows.test.ts`, `create-listing-next.test.ts`.
Extended: `booking-money.test.ts`, `photos.test.ts`. The change log is `docs/DESIGN_PASS.md`.

## Other places you might be asked about

- **Homepage and motion:** `app/page.tsx` (sections), `components/Motion.tsx` (reads scroll and pointer, sets CSS variables), `components/Cutaway.tsx` (the "Every room is checked" image: a flat image that settles in as it enters view; the image is `CHECKED_IMAGE` in `lib/venue-images.ts`), styles under "Homepage" in `app/globals.css`. See `docs/DESIGN_REFRESH.md`.
- **Venue photos:** `lib/venue-images.ts` (slug → photo and alt), `components/VenueImage.tsx` (photo or drawn fallback via `components/VenueArt.tsx`). Owner uploads: `lib/services/photos.ts`.
- **Card text** ("120 standing · £4,200 hire fee", "Why it fits"): `lib/matching/card.ts`, tested in `tests/cards-and-images.test.ts`.
- **Design tokens:** top of `app/globals.css`.
- **Demo vs connected switch:** `lib/config.ts`.
- **Analytics events:** `lib/services/analytics.ts`. Called from the services; never stores message or brief text.
