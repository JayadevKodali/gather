# Gather

A two-sided London venue marketplace, built as a take-home engineering work test.
A planner describes an event in plain English. Gather asks one question if something essential is
missing, then shows up to five venues that genuinely fit, with a reason for each. The planner
enquires, the venue sends an itemised quote, and the planner pays a Stripe **test** deposit to
confirm the date. Venue owners manage their own listings, prices, facilities and dates. Amara (admin)
sees sign-ups, briefs, matches and bookings.

All venues, people and payments are synthetic.

## Live site

**https://www.gatherldn.com**: connected mode on Vercel, with Supabase (London), OpenAI `gpt-6-luna`,
Stripe **test mode** and Resend (`bookings@mail.gatherldn.com`). It runs the code on this
repository's `main` branch, final on 15 November 2026 (see [HANDOFF.md](HANDOFF.md)).

| Role | Email | What's there |
|---|---|---|
| Planner | `planner@gather.test` (Priya) | Clean account for the walkthrough |
| Venue owner | `owner@gather.test` (Sam) | Owns The Loom Room, the payment-testing room and 7 more |
| Admin | `admin@gather.test` (Amara) | Pilot dashboard |

The password for all three is shared separately; it's `SEED_PASSWORD` in Vercel. The hosted site has no
one-click account switching and no email outbox. Emails to these `@gather.test` addresses are recorded but
not sent, because those addresses can't receive mail. Sign up with your own inbox to receive notifications.

**Reviewer walkthrough (about 10 minutes).**
1. Sign in as Priya. On **What are you planning?**, type *80 standing near Shoreditch in late March,
   under £6,000, must have AV* and press **Read my brief**. OpenAI reads it, and Gather asks one question
   for the exact date (its wording can vary slightly). Type *26 March 2027*, press **Answer**, then
   **Search venues**.
2. Up to five venues appear, each with **Why it fits**. Try the **Price** sort pills. On The Loom Room
   press **View and enquire**, then **Send enquiry**.
3. Sign in as Sam → **Inbox** → open the enquiry. The planner's brief stays on the right. Under **Send an
   itemised quote**, add a line (for example *Setup*, 150), set the **Deposit (£)** and press **Send quote**.
   The total, deposit and balance update as you type.
4. As Priya, open the enquiry, press **Ask about this quote** and send a question. As Sam, change a line
   and press **Send revised quote**: the first quote stays on record as *Replaced*.
5. To see the decline confirmation without declining: as Priya, open **Decline this quote**, press
   **Decline quote**, then **Keep**.
6. **Paying:** to keep 26 March free for the next reviewer, don't pay for the Loom Room. As Priya, write
   *30 people seated in Finsbury Park on 20 September 2027* (any day from July to December 2027 works).
   Only *Gather Test Room (payment testing)* appears. Enquire, quote it as Sam, then as Priya press
   **Pay £… deposit**. Stripe's test checkout shows the venue photo, quote reference, date and guests.
   Pay with `4000 0000 0000 0002` (declined), then `4242 4242 4242 4242` (any future expiry, any CVC).
   The booking is confirmed once Stripe's webhook arrives, and the date disappears from new searches.
   The booking page shows a progress tracker and a **Next** box with **Pay remaining balance**.
7. Optional: pay the balance (the panel turns green and reads *Paid in full*), or press **Cancel booking**
   to see what would be refunded before **Confirm cancellation**.
8. As Sam, see **Dates and calendar** (the booked date) and **Bookings**. Under **Manage listings**,
   **Add a listing** shows the five set-up steps.
9. Sign in as Amara for the **Pilot dashboard**.

## Run it in under 10 minutes (demo mode, no accounts needed)

Needs Node.js 20+ (tested on 22) and npm.

```bash
git clone https://github.com/JayadevKodali/gather.git
cd gather
npm install
npm run dev                        # http://localhost:3000
```

The first request creates a local Postgres database (PGlite, in `.data/pglite`), applies the
migrations and loads 32 synthetic venues, demo accounts and some sample activity. Nothing else to set up.

**Demo accounts** (password for all: `gather-demo-2026`). The sign-in page has one-click buttons for these.

| Role | Email | What's there |
|---|---|---|
| Planner | `planner@gather.test` (Priya) | Clean account: use this for the main walkthrough |
| Venue owner | `owner@gather.test` (Sam) | Owns The Loom Room and 7 other listings |
| Admin | `admin@gather.test` (Amara) | Pilot dashboard |
| Planner | `maya@gather.test` (Maya) | Has a confirmed booking and a pending enquiry |

**Two-minute walkthrough:** sign in as Priya → *Use the sample brief* → *Read my brief* → answer
"26 March 2027" → *Answer* → *Search venues* → *View and enquire* on The Loom Room → *Send enquiry*.
Switch to Sam → Inbox → open the enquiry → *Send quote*. Switch to Priya → *Pay £… deposit* → card
`4242 4242 4242 4242` (or `4000 0000 0000 0002` to see a decline). Switch to Amara for the dashboard.
Demo emails are in **Email outbox** (top bar).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app (demo mode unless `GATHER_MODE=connected`) |
| `npm test` | 183 Vitest tests in 19 files: matcher hard rules, venue photo checks and ownership, admin contact scoping, the keep-alive guard, rules and OpenAI brief readers, follow-ups, pricing, roles, cross-account access, quotes, concurrent checkouts, duplicate payment events, Stripe expiry, balance payments, cancellations and refunds at the cutoff boundaries, sign-in security (password rules, cooldown, reset, email verification), the Supabase driver over the Postgres protocol, the decline confirmation, the Stripe session's money fields, the five listing set-up steps, photo reordering and its arrow buttons, venue-side wording, admin counts after a cancellation |
| `npm run eval` | Matcher evaluation → `eval/results/latest.md` (see [eval/README.md](eval/README.md)) |
| `npm run eval:live` | Same, plus the raw-text pass through OpenAI → `eval/results/openai-live.md`. Reads `OPENAI_API_KEY` from `.env.local`; costs about a penny |
| `npm run eval:sheet -- <briefs.json>` | Labelling sheet for a set of briefs (eligible venues, no scores) |
| `npm run seed` | Rebuild the demo database from scratch (connected mode: add accounts and venues) |
| `npm run db:migrate` | Apply `supabase/migrations` (connected mode) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks and production build |
| `python3 e2e/walkthrough.py` | Browser walkthrough of the whole journey (needs Python Playwright + Chrome, and the app running on a fresh seed) |
| `python3 e2e/money.py` | Browser run of balance payments, cancellations and refunds (same needs, fresh seed) |
| `python3 e2e/auth.py` | Browser run of sign-up, email verification, password reset and sign-in security (same needs, fresh seed) |
| `python3 e2e/screens.py <url> <folder>` | A screenshot of every page into `docs/screenshots/design-pass/<folder>/` (same needs, fresh seed) |

## Demo mode vs connected mode

| | Demo (default) | Connected (`GATHER_MODE=connected`) |
|---|---|---|
| Database | PGlite: real Postgres in WebAssembly, on disk | Supabase Postgres via `DATABASE_URL` |
| Sign-in | Gather's own accounts (scrypt passwords, httpOnly session cookie) | Same |
| Brief reading | Rules-based reader | OpenAI Responses API with a strict Structured Outputs schema (default `gpt-6-luna`, `OPENAI_MODEL` to change), re-validated by Gather; `EXTRACTOR=rules` to opt out |
| Payment | Demo checkout page (no money) | Stripe Checkout in **test mode** + signed webhook |
| Email | Written to an outbox table (`/dev/outbox`) | Resend, with the branded HTML + text template |
| Venue photos | Files in `.data/photos` | Private Supabase Storage bucket (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), served through `/photos/…` |
| Keep-alive | – | Daily Vercel Cron to `/api/cron/keepalive`, guarded by `CRON_SECRET` (see `docs/OPERATIONS.md`) |

The same SQL, matcher, quote and booking code runs in both modes. In connected mode the app refuses
to start if a required variable is missing, so it never quietly falls back to a demo service.
See `.env.example` and [HANDOFF.md](HANDOFF.md) for the connected setup checklist.

**What the AI does and doesn't decide.** OpenAI only turns the planner's words into fields (date,
guests, layout, area, budget, must-haves). Gather validates them, asks a follow-up if something
essential is missing, and the planner can correct every field before searching. Which venues qualify
(open on the date, big enough for the layout, every essential confirmed, within a strict budget) is
decided by Gather's own code, whatever the model returns. If OpenAI fails, the brief is read by the
rules reader instead and that's shown to the planner, on the admin dashboard and in the server log.

## Hosted deploy (Vercel + Supabase + Stripe test mode + Resend)

1. Supabase: new project (London). Copy the **Transaction pooler** connection string.
2. Vercel: import the repo and set the production branch. Add these environment variables, marked
   Sensitive: `GATHER_MODE=connected`, `DATABASE_URL`, `SEED_PASSWORD` (12+ characters; the reviewer
   accounts' password), `OPENAI_API_KEY`, `STRIPE_SECRET_KEY` (`sk_test_…` only), `STRIPE_WEBHOOK_SECRET`,
   `RESEND_API_KEY`, `EMAIL_FROM`. `APP_URL` is optional on Vercel (the production domain is used).
3. Deploy. The build runs `scripts/predeploy.ts` first: it checks every variable (and fails with the
   missing names), applies migrations, and makes sure the reviewer accounts, the 32 venues and the
   payment-testing room exist. It never deletes data, so it's safe on every deploy.
4. Stripe (test mode): add a webhook endpoint `https://<app>/api/stripe/webhook` for
   `checkout.session.completed`, `checkout.session.expired` and `checkout.session.async_payment_failed`,
   put its signing secret in `STRIPE_WEBHOOK_SECRET`, and redeploy.

On the hosted site the demo banner, one-click account switching and the email outbox are hidden.
Emails to the seeded `*.test` reviewer addresses are recorded but not sent (those addresses can't
receive mail); sign up with a real inbox to receive notifications.

**Payment testing without using up the walkthrough date.** Paying a deposit blocks that venue's date.
So the walkthrough date (The Loom Room, 26 March 2027) stays free, test deposits use a separate fixture:
*Gather Test Room (payment testing)* in Finsbury Park, open every day from July to December 2027, when
none of the 32 main venues have dates. Brief: "30 people seated in Finsbury Park on <any day, Jul–Dec 2027>".

## Accounts and sign-in security
- **New and reset passwords:** 12 to 128 characters; spaces are fine, so passphrases work. Pasting and password managers are allowed, and a strength hint shows as you type. Existing passwords keep working at sign-in.
- **Blocklists, checked on the server:** the NCSC's 100k most-used passwords (`data/blocklists`) and Have I Been Pwned's k-anonymity range API. Only a 5-character SHA-1 prefix leaves the server, and the check is off in demo mode. A blocked password gets "This password is too common. Choose another."
- **Cooldown:** 5 failed sign-ins for an email within 15 minutes lock it for 5 minutes. The count is stored in Postgres, so every server instance enforces it, and a successful sign-in clears it. Messages are the same whether or not the account exists.
- **Forgot password?:** sends a branded email with a single-use link that lasts 30 minutes. Only the token's hash is stored. The token travels in the URL `#fragment`, so it never reaches server logs. Changing the password signs you out everywhere.
- **Email verification:** new sign-ups (planner or owner) must confirm their email before signing in, with a rate-limited "Send a new link". The seeded reviewer accounts and older accounts count as verified.
- **Previews:** a Vercel preview's emails and Stripe pages link to that preview (`VERCEL_BRANCH_URL`); production uses `APP_URL`.

## Where things are

- [CODE_MAP.md](CODE_MAP.md): which file does what, and where to make common changes
- [docs/DECISIONS.md](docs/DECISIONS.md): the main technical decisions and why
- [eval/README.md](eval/README.md): how matching is evaluated and labelled
- [AI_USAGE.md](AI_USAGE.md): how AI tools were used
- [HANDOFF.md](HANDOFF.md): build status, what's verified, what isn't, morning checklist
- `docs/DESIGN_REFRESH.md`: the first visual redesign, its motion effects and how they were verified
- `docs/DESIGN_PASS.md`: the page-by-page redesign that followed, and its fixes
- `docs/screenshots/design-pass/`: before and after screenshots of every page
- `docs/screenshots/`: screenshots from the browser walkthrough
