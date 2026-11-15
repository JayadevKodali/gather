# Technical decisions

Short records of the choices that shape the code, with the reason and the trade-off.
"Decided by" says who made the call. Claude's overnight calls are open for Jay to overturn.

## 1. The AI proposes, the server decides (decided: Jay, 12 Nov)
The model only turns free text into fields. Plain TypeScript decides follow-ups, eligibility,
ranking and the reason text. The model never sees venues, so it can't recommend an unavailable or
undersized one. Reasons are built from stored facts, so they can't be invented.

## 2. Hard rules (handover, 14 Nov)
A venue is shown only if it's published, the owner has **confirmed** the date as open, the date isn't
booked or held, it holds the guest count **in the requested layout**, every **Essential** facility is
confirmed Available, and with a **strict** cap the estimate is known and within it. Unknown fails
every one of these. Flexible budgets and Preferred facilities only affect ranking.
This replaced the earlier draft rule (available unless blocked, facilities and budget soft).

## 3. Embedded Postgres for demo mode (Claude, 14 Nov)
Docker wasn't available overnight, so a local Supabase stack wasn't possible. PGlite is real
Postgres compiled to WebAssembly. The same migrations, constraints and transactions run locally and on
Supabase, and the same SQL drives both. The double-booking protection is enforced by Postgres unique
indexes, so the tests prove the real thing, not a mock.
*Trade-off:* PGlite is one process with one connection, so it isn't for production. Connected mode
uses `postgres.js` against Supabase.

## 4. Gather's own sign-in, not Supabase Auth, for v1 (Claude, 14 Nov — open for Jay)
The stack decision said Supabase Auth. Overnight there was no Supabase project to test against, and
an untested auth integration at the heart of the app is the riskiest thing to hand over. So sign-in is
implemented once and used in both modes:
- passwords hashed with scrypt (Node's built-in, memory-hard)
- a random session token in an httpOnly, SameSite=Lax, Secure-in-production cookie; only its SHA-256
  hash is stored
- roles read from the database on every request; public sign-up offers planner/owner only; admin is
  provisioned by the seed script
*Trade-off:* no OAuth ("sign in with Google"). Email verification (24-hour link) and password reset
(30-minute single-use link) were added to Gather's own sign-in on 15 Nov, with 12–128 character
passwords, breach and common-password blocklists, and a 5-attempt cooldown
(`src/lib/services/accounts.ts`).
*If we switch later:* replace `lib/services/accounts.ts` and the five files in `lib/auth/` (passwords, policy,
blocklist, pending verification, sessions) with Supabase Auth, and key `profiles.id` to `auth.users.id`. The rest
of the app reads only `Actor`, so pages and services keep working, but the sign-in tests need rewriting.

## 5. Row-level security: deny-all to the public API (Claude, 14 Nov)
All database access goes through the Next.js server, which checks role and ownership in
`lib/services/*` (covered by tests). RLS is enabled on every table with no policies, so Supabase's
public REST API can't read or write anything even if the anon key leaks. Per-user policies are
added when Supabase Auth arrives (decision 4).

## 6. Quotes are immutable versions (handover)
A revision is a new row with a new reference. The previous one is marked superseded and kept.
A partial unique index allows only one active quote per enquiry. Payment is tied to the exact quote ID.
The owner can't revise while the planner holds the date for payment.

## 7. Date holds and idempotent fulfilment (handover)
Starting a payment inserts a pending checkout: the hold. A unique index allows one pending
checkout per listing-day, so two planners can't pay for the same day at once. A hold is released only
when payment creation verifiably fails, or the provider confirms the session expired unpaid.
`fulfilCheckout` is one transaction and safe to repeat. Bookings have a unique (listing, date), so
even racing payment events can't double-book.

## 8. Emails link back, they don't carry content (handover)
Notifications say "there's a new message/quote/booking" and link to the enquiry. Message text stays
in Gather, visible only to the two participants. Demo mode writes to an outbox table instead of sending.

## 9. Synthetic illustrations, not photos (Claude)
Venue images are generated SVG drawings (`components/VenueArt.tsx`), so no real venue is implied and
there are no licensing questions. Real photos would be uploaded by owners after v1.
*Update, 15 Nov:* the 32 seeded venues now have generated photos of fictional rooms (`lib/venue-images.ts`), and
owners can upload their own (`lib/services/photos.ts`). The drawings remain as the fallback.

## 10. Guest ranges use the higher number (Claude, matching Jay's earlier default)
"100–150 people" → 150, shown to the planner ("we use the higher number") so they can change it.

## 11. Size fit in ranking (Claude, matching Jay's earlier default)
10 of the 100 points reward a room that will feel reasonably full, so 30 people aren't sent to a
400-capacity warehouse when a better-sized room exists.

## 12. Declining a quote needs confirmation (design pass, 15 Nov)
"Decline this quote" opens a confirmation box; nothing is declined until **Decline quote** is pressed. The optional
reason is typed in that box and posted in the form, so it never appears in the page address, browser history or
server logs. It works without JavaScript.
*Trade-off:* one more click to decline.

## 13. Listing set-up steps are worked out, not stored (design pass, 15 Nov)
Add a listing is five steps. Whether a step is done is calculated from what is already saved
(`lib/listing-setup.ts`), so there is no new column and no migration, and a draft can't disagree with its own
progress bar.
*Trade-off:* a step can't be marked done by hand; it is done when its data is there.

## 14. Saving facilities stores every answer (design pass, 15 Nov)
"Not confirmed" is now saved like any other answer. Before, it was skipped, so the facilities step could never
count as done. Matching is unchanged: only a confirmed "Available" satisfies an Essential facility.

## 15. Live quote totals are display only (design pass, 15 Nov)
The owner's quote form shows the total, deposit and balance as lines change (`components/QuoteTotals.tsx`). The
server still calculates and validates every figure when the quote is sent, so the browser's sum is never trusted.
