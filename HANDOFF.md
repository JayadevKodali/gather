# Polish pass (15 Nov 2026): see docs/POLISH_REPORT.md

Branch `claude/gather-polish` (6 commits on `51504f1`), not merged and not promoted. The report has what changed,
the checks, the per-role Pass/Fail/Blocked checklist, before/after screenshots and the actions still due.
Jay needs to set: `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (plus a private `venue-photos` bucket).

# Stage 2 hand-back (Claude → Jay), 15 Nov 2026

**Branch:** `claude/gather-stage2` (based on `claude/gather-design-refresh`). **Live:** https://www.gatherldn.com
(Vercel production branch = this branch). Not merged; the merge decision is Jay's.
Every row below says where it was tested: **Hosted** = the live site, run in the desktop app's browser pane on
15 Nov, 02:54–03:22 GMT. Jay did the sign-ins and Stripe test cards; Claude did everything else.

## Pass / Fail / Blocked

| Feature | Result | Where | Evidence |
|---|---|---|---|
| Brief reader on OpenAI (Responses API, strict schema) | **Pass** | Hosted + tests | Every hosted brief shows "Read by: OpenAI (gpt-6-luna)"; admin shows 5/5 briefs read by OpenAI, 0 fallbacks. 9 adapter/config tests |
| OpenAI failure is visible | **Pass** | Local connected mode + tests | Invalid key → planner notice, admin warning with reason, server log line |
| Amara's brief → exact-date follow-up | **Pass** | Hosted | 80 / standing / £6,000 strict / AV essential extracted; asked "Which exact date…" |
| Planner edits, contradictory brief, genuine no-match, exact capacity, both price sorts | **Pass** | Hosted | Budget conflict asked; no-match shows "No venue fits yet" with reasons; 60-of-60 and 90-of-90 accepted; price ascending and descending orders correct |
| Unavailable / undersized / over-budget / missing-essential excluded | **Pass** | Hosted | Blocked 14 Aug, 91 guests (90 max), £2,500 cap (venue £2,600), dance floor required: each removed the Test Loft |
| Sign-up and sign-in, planner and owner | **Pass** | Hosted | `+planner` / `+owner` accounts created by Jay, signed back in 4 times each |
| Cross-account and admin access | **Pass** | Hosted | Owner → /admin, /plan, another planner's brief: redirected; planner → /admin, owner pages: redirected; another planner's brief: 404 |
| Listing create/edit (prices, 3 layouts, facilities, priced extras, availability) | **Pass** | Hosted | Created Olu Test Loft and Annex; price edit £2,400 → £2,600 and extras persisted after reload |
| Closed date and unpublished listing hidden | **Pass** | Hosted | Blocked 14 Aug hidden; Annex shown, then hidden after unpublish (same brief re-searched); its page 404 |
| Draft listing stays hidden | **Pass** | Hosted + eval | 32 published of 33 seeded; independent case I10 confirms the draft never appears |
| Enquiry with priced extra | **Pass** | Hosted | ENQ-MPU5 with projector £80 and microphones £40 |
| Quote with custom setup charge, question, revision | **Pass** | Hosted | Q-MPU5-1 £2,870 (setup £150) → planner question → Q-MPU5-2 £2,820; v1 marked Replaced |
| Old quote findable by reference; only the current quote payable | **Pass** | Hosted | Search "Q-MPU5-1" finds the enquiry; forcing v1 into checkout is refused: "replaced or closed" |
| Stripe test deposit: decline, retry, confirm after the webhook | **Pass** | Hosted | Jay: 4000…0002 declined, 4242… succeeded → BK-752VY, Q-MPU5-2, deposit £500, balance £2,320 |
| Booked date blocked | **Pass** | Hosted | Same brief on 15 Aug: no venue |
| Duplicate payment event → one booking | **Pass** | Hosted + tests | Jay resent `checkout.session.completed` in Stripe; still exactly one booking |
| Simultaneous checkouts → one hold | **Pass (tests only)** | Automated, real Postgres | Not reproducible by hand on the hosted site; covered by the concurrent-checkout test |
| Booking for both parties; owner calendar with planner name | **Pass** | Hosted | Both Bookings pages show BK-752VY; calendar 15 Aug "Booked · Pia · 90" |
| Owner venue filter, history sort | **Pass** | Hosted + tests | Hosted: filter Annex = 0, Loft = 1; all four sorts load (one booking). Ordering proven by a test with three bookings: date and total, both directions, planner and owner |
| Admin counts; repeated searches don't inflate matched briefs | **Pass** | Hosted | 8 sign-ups, 5 briefs, **4 matched / 12 searches**, 1 booking £2,820 / £500 |
| Email links use the hosted URL; demo banner, shortcuts, outbox hidden | **Pass** | Hosted | `APP_URL=https://www.gatherldn.com`; banner, one-click accounts and /dev/outbox absent (404) |
| Real email delivery to two inboxes | **Pass** | Hosted | All 6 arrived (enquiry, quote, message, revised quote, 2 confirmations) at Jay's `+planner` / `+owner` inboxes from `bookings@mail.gatherldn.com`; links start `https://www.gatherldn.com/` (confirmed by Jay) |
| Signed-in mobile header at 360×640 | **Pass** (fixed) | Hosted, before; local + walkthrough, after | Logo row was 36px above the screen on every hosted page; fixed in `101086a`; walkthrough 13b checks all three roles |
| Logo and favicon | **Pass** | Hosted + local | Commit `33a5919` |
| Evaluation: independent set via OpenAI | **Pass** | Jay's Mac | Hit@5 10/10, 0 breaches against gold, follow-ups 12/12, both no-match cases empty (`eval/results/first-run/`) |

Observation, not a site bug: the desktop app's browser pane logs React hydration error #418 on the hosted
site. The same build shows no console errors in a clean Chrome, in both demo and connected mode.

## Reviewer accounts and walkthrough

See README → *Live site*. Accounts `planner@`, `owner@`, `admin@gather.test`; password = `SEED_PASSWORD`
(Jay shares it separately). Test deposits go to *Gather Test Room (payment testing)* (any day Jul–Dec 2027)
so the 26 March Loom Room walkthrough date stays free.

## Test data left on the live site

From the hosted test: owner *Olu Test (owner)* with *Olu Test Loft* (booked 15 Aug 2027) and *Olu Test Annex*
(unpublished); planner *Pia Test (planner)* with 5 briefs. All fictional; the emails are Jay's controlled inboxes.

15 Nov: a one-off SQL script (kept in the private working repo) renames these and the auth-check accounts
*Olu Two* and *Pia Two* to ordinary synthetic names: display names only, emails and references unchanged.

---

# History

Kept as written at the time, for the record. Some items below say "not built" or "not verified" that were
built and checked later (email verification, password reset, photo upload, hosted payments). The current
state is in the sections above and in master brief §16.

## Overnight handoff — Gather v1 (Claude → Jay)

**Branch:** `claude/gather-v1` (pushed to GitHub). The exact head commit is in the shared project log and
in `git log -1`. `main` is untouched. **Session:** Sat 14 Nov 2026, 01:20–02:15 GMT.

### TL;DR

The full planner → venue owner → deposit → booking journey works **in demo mode**, start to finish,
in a real browser, on the production build. Sign-up and sign-in with three roles, self-service
listings with facilities, priced extras and a day-level calendar, brief reading with one follow-up at a
time, a hard-rule shortlist with reasons and price sort, enquiries and messages, versioned quotes,
a date hold and deposit with decline and retry, booking confirmation, the date then blocked, booking
history, and the admin dashboard. There are 70 automated tests and a 13-step browser walkthrough.
**Nothing that needs an account has been run for real yet:** Supabase, Stripe, Resend, the model API and
Vercel are written and unit-tested against fakes, and wait for your morning setup below.

### How to run

```bash
git fetch && git checkout claude/gather-v1
npm install
npm run dev            # http://localhost:3000 — demo mode, auto-seeds on first request
npm test               # 70 tests
npm run eval           # writes eval/results/latest.md
```
Demo accounts (sign-in page has one-click buttons; password `gather-demo-2026`):
`planner@gather.test` (Priya), `owner@gather.test` (Sam), `admin@gather.test` (Amara), `maya@gather.test`.
`npm run seed` resets the demo database. Stop `npm run dev` first.

### Verified tonight (with evidence)

| Check | Result |
|---|---|
| `npm test` | **70/70 pass**: hard rules incl. exact capacity, layout capacity, unconfirmed dates, essentials, strict cap and unverifiable price; brief reader; follow-up order; AI adapter against fake HTTP (valid, malformed, past date, API error); roles; cross-account reads; quote validation and versions; stale quote can't be paid; strict cap re-checked at checkout; **two planners paying for one venue-day → one hold**; **duplicate payment event → one booking**; DB refuses a second booking for a listing-day; decline releases the hold and retry works; wrong amount rejected; no quote revision during payment; enquiry re-checks a newly blocked date; emails carry links but no message text; re-running a search doesn't inflate matched briefs |
| **Supabase driver over the real Postgres protocol** | `tests/postgres-adapter.test.ts` runs the connected-mode driver (postgres.js) against PGlite's wire-protocol server: migrations, seed, brief → booking, duplicate payment event. **This caught a real bug** — JSON columns were being double-encoded by the driver — fixed in `lib/db/index.ts` before it ever reached Supabase |
| Connected mode, whole app | `next start` with `GATHER_MODE=connected` against that wire-protocol database (placeholder Stripe/Resend keys, rules reader): real sign-in with the seeded password → brief → follow-up → same 5-venue shortlist as demo; demo shortcuts hidden and `/dev/outbox` 404 as intended. Payment and email were not exercised (no real keys) |
| `npm run typecheck`, `npm run lint` | Clean |
| `npm run build` | Clean, no warnings |
| `python3 e2e/walkthrough.py` on `next start` | **13/13 steps pass**: landing → planner brief → follow-up → shortlist → sort → enquiry → owner quote → planner question → owner revision (v1 kept as "Replaced") → declined card → retry → booking confirmed → date gone from a new search → owner calendar → admin → role guard → signed-out email link returns to the enquiry → mobile + reduced motion + keyboard |
| `npm run eval` (development set) | See below |

Screenshots are in `docs/screenshots/` (landing, brief and follow-up, shortlist, enquiry, owner quote, quote versions, declined payment, booking confirmed, owner calendar, edit listing, admin, mobile, reduced motion, keyboard focus).

### Evaluation status

- **Development set** (14 cases I wrote and labelled; **not independent**): Hit@5 **100% (13/13)** in both runs.
  0 hard-rule breaches. The no-match case is correctly empty. Follow-ups are correct 14/14. Raw-text fields match
  gold 13/14: the reader doesn't treat "lunch provided" as catering. The stricter measure, **shown venues
  that are acceptable, is 70% (43/61)**. Weak spot: area outweighs size fit, so a 12-person supper also
  gets big Hackney rooms (D13). I did **not** tune weights against my own set. Do that after the independent labels.
- **Independent set: PENDING.** The harness and format are ready. Instructions are in `eval/README.md`
  (template: `eval/independent/briefs.template.json`; `npm run eval:sheet` makes the labelling sheet).

### Not verified, and the exact owner action for each

| Integration | State | What you need to do |
|---|---|---|
| Supabase Postgres | Schema, RLS and the `postgres.js` adapter are written and tested over the Postgres wire protocol (not yet against Supabase itself) | Create a project (London region). Copy the **transaction pooler** URI into `DATABASE_URL`. Run `GATHER_MODE=connected DATABASE_URL=… npm run db:migrate`, then `GATHER_MODE=connected DATABASE_URL=… SEED_PASSWORD='<12+ chars>' … npm run seed` |
| Sign-in | Gather's own accounts (see `docs/DECISIONS.md` #4); works in both modes | Decide: keep for submission (recommended for time), or move to Supabase Auth later |
| Model API (brief extraction) | Adapter written; tested against fake responses only | Create an Anthropic API key. Set `ANTHROPIC_API_KEY` (and `LLM_MODEL` if you want a specific model). Run `npm run eval -- --live` to see real parse accuracy |
| Stripe test deposit | Checkout Session creation, signed webhook and fulfilment are written; fulfilment is tested via the demo path | Get test keys (`sk_test_…`). Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` gives `STRIPE_WEBHOOK_SECRET`. Pay with 4242…, then 4000 0000 0000 0002. On Vercel: add a webhook endpoint `https://<app>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed` |
| Resend email | Adapter written; failures are recorded, never block the action | Create an API key. Verify a sending domain (or use Resend's test sender to your own inbox only). Set `RESEND_API_KEY`, `EMAIL_FROM`. Check that an enquiry email and a reply email arrive |
| Vercel | Not deployed | Import the repo, set the branch, add all variables from `.env.example` with `GATHER_MODE=connected` and `APP_URL=https://<your>.vercel.app`, deploy. Then run the walkthrough on the live URL. **Don't deploy demo mode to Vercel**: PGlite on serverless would give each instance its own throwaway database |

Connected mode refuses to start if any required variable is missing, so a half-configured deploy fails
loudly instead of silently using demo services.

### Morning checklist (in order)

1. Read this file, then skim `CODE_MAP.md`.
2. `npm install && npm run dev`, then click through the two-minute walkthrough in the README (about 10 min).
3. Supabase → migrate → seed (above).
4. Anthropic key → `npm run eval -- --live`.
5. Stripe test keys and webhook → test a success and a decline.
6. Resend → test both notification directions.
7. Vercel → deploy connected mode → walkthrough on the live URL → note the reviewer credentials (from `SEED_PASSWORD`).
8. With GPT: write and label the 10+ independent briefs → `npm run eval` → put the numbers in the submission.
9. Day-3 change request (due 10:00 today if Thursday was day 1): handle it on a new branch from `claude/gather-v1`.
10. When happy, open a PR from `claude/gather-v1` to `main` and merge.

### What I cut or deferred (and the first next step)

| Item (handover priority) | Status | First next step |
|---|---|---|
| Per-party hide/restore of unused quotes (P2) | Not built | Add a `hidden_by_planner` / `hidden_by_owner` pair on `quotes`; filter per side in `getEnquiryThread` |
| Side-by-side quote comparison (P2) | Not built; versions are listed newest first and searchable by reference | A two-column view of the selected versions |
| Admin "Needs attention" actions | Read-only lists | Link each item to a mailto or a detail page |
| Email verification / password reset | Not built (own auth) | Comes with Supabase Auth (DECISIONS #4) |
| Photo upload | Original SVG illustrations instead | Supabase Storage bucket + owner upload field |
| Calendar month picker on touch | Prev/next links + a date-range form (works on touch and keyboard) | — |
| Real-time chat, AI summaries, invoices, subscriptions, live payments, calendar sync | Out of v1 by design | — |

### Analytics events instrumented (for the launch plan)

`signup`, `listing_published`, `brief_submitted`, `clarification_answered`, `matches_shown`, `no_match`,
`enquiry_sent`, `venue_replied`, `quote_sent`, `checkout_started`, `payment_failed`, `booking_confirmed`.
Stored in `analytics_events` with IDs and counts only, never message or brief text (`lib/services/analytics.ts`).

### Decisions I made that you may want to revisit

All are in `docs/DECISIONS.md`. The two that matter most:
1. **Own sign-in instead of Supabase Auth** for v1 (#4): tested tonight and the same in both modes; lacks reset and verification.
2. **PGlite for demo mode** (#3): no Docker here, so no local Supabase.

### Session log (GMT, from tool timestamps)

- 01:20 Read the shared log and the handover pack (handover PDF, Stage 1, technical requirements, prototype).
- 01:25 Branch `claude/gather-v1`; Next.js 16 scaffold; checked the new Next APIs in the bundled docs.
- 01:25–01:37 Schema + RLS migrations; PGlite / postgres.js adapter; London areas; brief reader; follow-ups; matcher; 32 venue fixtures; 14 dev cases; eval harness; 49 tests.
- 01:37–01:45 Services (accounts, listings, briefs, enquiries, quotes, checkout, bookings, admin, seed); 68 tests → commit `63c1106`.
- 01:45–02:00 UI: landing with CSS 3D hero, auth, planner, owner, enquiry, checkout, admin, outbox; browser walkthrough; fixed the follow-up page not refreshing after an answer.
- 02:03 Commit `55d550c` pushed (first push of the branch).
- 02:03–02:10 Docs, stricter eval metric, sign-in returns to email links, production build + walkthrough re-run.
- 02:10–02:13 Wire-protocol test of the Supabase driver found and fixed JSON double-encoding; connected-mode smoke test; final checks; commit `8cfa7aa` pushed.
