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
   → provider.createSession()  demo page or Stripe Checkout
paid ─▶ fulfilCheckout()  (demo page action, or Stripe webhook)
   in one transaction: amount + GBP + quote still current → insert booking (unique listing+date)
   → checkout paid, quote paid, enquiry booked → emails to both sides
```

## Practice changes for the live technical interview

Each is small. Find the file, make the change, run `npm test`.

1. **Make a strict budget a little flexible (allow 5% over).** In `lib/matching/eligibility.ts`, change
   `total > cap` to `total > cap * 1.05`. Then update the "strict cap excludes" test in `tests/matching.test.ts`.
2. **Change how much area matters.** In `lib/matching/score.ts`, edit `WEIGHTS` and the `areaPoints`
   numbers (35 for the same borough, 18 for next door). Re-run `npm run eval` to see the effect.
3. **Ask for the event type when it's missing.** In `lib/brief/followup.ts`, add a branch to
   `nextQuestion` after layout. Then add the matching case in `applyAnswer`.
4. **Treat "unknown" layout as seated instead of asking.** In `lib/brief/followup.ts`, remove the
   layout question. In `lib/services/briefs.ts` `createBrief`, default `fields.layout ??= "seated"`.
5. **Let owners set a minimum deposit percentage.** In `lib/services/enquiries.ts`, add a rule in
   `QuoteInputSchema.superRefine`, e.g. `depositPence >= total * 0.1`.
6. **Stop admins seeing something.** Every admin query is in `lib/services/admin.ts`. Delete a field
   there and the page stops showing it.
7. **Add a role check.** Use `requireRole(actor, "owner")` (services) or `requirePageRole("owner")` (pages).

## Other places you might be asked about

- **Homepage and motion:** `app/page.tsx` (sections), `components/Motion.tsx` (reads scroll and pointer, sets CSS variables), `components/Cutaway.tsx` (layered-depth 3D moment), styles under "Homepage" in `app/globals.css`. See `docs/DESIGN_REFRESH.md`.
- **Venue photos:** `lib/venue-images.ts` (slug → photo and alt), `components/VenueImage.tsx` (photo or drawn fallback via `components/VenueArt.tsx`).
- **Card text** ("120 standing · £4,200 hire fee", "Why it fits"): `lib/matching/card.ts`, tested in `tests/cards-and-images.test.ts`.
- **Design tokens:** top of `app/globals.css`.
- **Demo vs connected switch:** `lib/config.ts`.
- **Analytics events:** `lib/services/analytics.ts`. Called from the services; never stores message or brief text.
