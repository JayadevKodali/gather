> **Historical (pre-build) plan, 12 Nov.** Superseded where it differs by the 14 Nov handover (`Gather_Claude_Handover.pdf`) and by what was built. See `docs/DECISIONS.md` for the current rules: Essential facilities and strict budgets are now hard filters; dates are available only when the owner confirms them; quotes are versioned.

# Gather — Technical Plan v0.1 (pre-build)

**Status:** Draft for the candidate's approval. **Nothing is built yet.** Anything marked `[DECIDE]` is waiting on you.
**Source:** the employer's candidate brief (authoritative) + the master brief.

---

## 1. Design principles (how the build stays defensible)

1. **The AI reads the brief; the code makes the decisions.** The LLM turns messy text into a validated structured brief. Plain TypeScript decides what's missing, what's eligible, the ranking, and the "why" text. As a result, the hard constraints (PDF Build #4) can't be overridden by the model, because the model never sees the venue list.
2. **The matcher is a pure function with no database or network access.** That makes it unit-testable, usable by the eval harness, and short enough to change live in the interview.
3. **Fewest moving parts.** Six main tables. No queues and no microservices. Supabase does auth and the database, and Next.js does everything else.
4. **Deploy on day one.** The PDF says a live platform beats a laptop demo, so a blank app goes to Vercel at Milestone 0 and each milestone ships to it.

## 2. Proposed stack `[DECIDE: approve or change]`

| Concern | Choice | Why | Verify before cost model |
|---|---|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind | One codebase for UI and server; deploys natively to Vercel | — |
| Auth + DB | Supabase (Postgres, Auth, Row Level Security) | Real sign-up/login, roles enforced in the DB as well as the app | Free-tier limits; free projects pause when idle |
| LLM | OpenAI `gpt-6-luna` via the Responses API with Structured Outputs (configurable with `OPENAI_MODEL`) | Extraction only, about 1–3 calls per brief | Current per-token price |
| Validation | `zod` | Rejects malformed model output before it touches matching | — |
| Email | Resend | Simple API, free tier, test sending domain | Free-tier volume; sender domain |
| Payments | Stripe Checkout, **test mode**, plus signed webhook | Standard, secure, no card data touches our server | Fees are only relevant to a live launch |
| Hosting | Vercel | Free tier allowed by PDF ("Free hosting tiers are fine") | Hobby plan is non-commercial, so the cost model must show the paid tier for a real launch |
| Tests | Vitest | Fast, TypeScript-native | — |

## 3. Launch call implemented `[DECIDE: confirm — this is PROPOSED in the master brief, not agreed]`

Two-sided, **venue-led controlled pilot**. Amara's 38 venues are onboarded first and planners can search, enquire and book from day one. **Stripe test deposit is paid by the planner only after the venue accepts the enquiry.** Daniel's £49/month subscription is deferred and becomes an explicit week-4 decision with a pass/fail metric. This is the PDF's "planner deposit" branch (Build #6).

## 4. Architecture

```
 Planner / Venue / Admin browser
            │  HTTPS
            ▼
 ┌──────────────────────── Next.js on Vercel ────────────────────────┐
 │ Pages (React)            Server actions / route handlers          │
 │  /plan  chat ──────────► extractBrief() ──► LLM API (JSON only)   │
 │                          zod validate                             │
 │                          findMissing() ─► follow-up question      │
 │                          matchVenues()  ◄── pure TS               │
 │                             ├ isEligible()  HARD: date, capacity  │
 │                             └ scoreVenue()  SOFT: area, budget,   │
 │                                              facilities, type     │
 │  /venue/*  listing, dates, enquiries                              │
 │  /admin    funnel counts                                          │
 │  /api/stripe/webhook ◄── Stripe (signature verified)              │
 └──────┬──────────────────────────┬─────────────────────┬───────────┘
        ▼                          ▼                     ▼
  Supabase Postgres + Auth     Resend (email)      Stripe (test mode)
  RLS on every table
```

## 5. Data model (Postgres)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth user), `role` (`planner`/`venue`/`admin`), `full_name`, `email` | Role chosen at sign-up (planner/venue only). **Admin is seeded, never self-assigned.** |
| `venues` | `owner_id`, `name`, `description`, `borough`, `neighbourhood`, `venue_type`, `capacity_standing`, `capacity_seated`, `pricing_model` (`hire_fee`/`min_spend`/`per_head`), `price_pence`, `facilities text[]`, `is_published`, `is_synthetic` | Prices stored in pence (integers, no float errors). |
| `venue_blocked_dates` | `venue_id`, `date`, `reason` | A venue is **available unless it has blocked the date or has a confirmed booking on it.** `[DECIDE]` Simple for venues to maintain; the venue-accepts-before-deposit step protects against stale data. The alternative is "unavailable unless opened". |
| `briefs` | `planner_id`, `raw_text`, `messages jsonb`, `structured jsonb`, `status` (`needs_info`/`ready`) | The chat transcript is stored as JSON to avoid a separate messages table. |
| `matches` | `brief_id`, `venue_id`, `rank`, `score`, `reason` | A snapshot of what the planner was shown; feeds the admin view and eval. |
| `enquiries` | `brief_id`, `venue_id`, `planner_id`, `event_date`, `guests`, `message`, `status`, `venue_reply` | Status: `pending → accepted / declined → paid` (paid = **booking**). |
| `payments` | `enquiry_id`, `stripe_session_id` (unique), `amount_pence`, `status` | The unique session ID makes webhook retries safe. |
| `analytics_events` | `user_id`, `name`, `props jsonb` | Launch-plan events. |

**RLS summary:** published venues are readable by everyone, and only the owner can write their venue and blocked dates. An enquiry is readable by its planner and by the venue's owner. The venue updates the reply/status and the planner creates it. Payments and analytics are written server-side only. Admin pages call `requireRole('admin')` and then use the server-only service key.

## 6. Matching pipeline (the core of the interview)

```
messy text ─► extractBrief (LLM → zod)          { date?, guests?, layout?, boroughs[], budget_pence?,
                                                  facilities[], event_type?, contradictions[] }
           ─► findMissing (code)                 date or guests missing/vague → ask ONE question
                                                  contradictions[] non-empty  → ask to resolve
           ─► matchVenues(brief, venues, blocked, bookings)
                 1. isEligible  HARD  published AND not blocked/booked on date
                                      AND capacity(layout) ≥ guests
                 2. scoreVenue  SOFT  area 40 · budget 30 · facilities 20 · type 10  (0–100)
                 3. sort, take top 5, build reason text from the score parts
           ─► if 0 eligible: say so honestly + suggest what to relax (date or area)
```

- **Capacity rule:** standing uses `capacity_standing` and seated uses `capacity_seated`. **If the layout is unknown we use the smaller (seated) figure**, which is conservative and never overcrowds. The assumption is shown in the summary so the planner can change it.
- **Price estimate** (`pricing.ts`): hire fee is the fee; minimum spend is the minimum; per head is price × guests. Over-budget venues are ranked down and labelled **"≈ £X over your budget"**, not hidden. Only date and capacity are hard filters.
- **Area:** the LLM may only return borough names from a fixed list of 33. `areas.ts` holds a hand-written adjacency map (e.g. Shoreditch → Hackney, with Tower Hamlets and Islington adjacent). Same borough scores full area points and an adjacent borough scores half.
- **Reasons are built from data, not generated.** For example: "Fits 80 standing (holds 120) · Has AV · Hackney, next to Shoreditch · Est. £4,800, within your £6,000". They can't hallucinate.
- **The check runs again on the server at enquiry and at payment.** `isEligible` is re-checked against fresh data, so stale UI can't cause a double-booking.

## 7. Evaluation harness

- **Fixtures:** `data/venues.json` (≥30) and `data/briefs.json` (≥10 messy briefs, each with a hand-written **gold structured version**).
- **Labels:** `eval/labels.json` lists the venue IDs a human planner would accept for each brief, **labelled before looking at matcher output**. Rubric: can legally hold the group in that layout, is free that date, is plausibly the right kind of place for the event, is ≤ ~15% over budget, and is in the requested borough or one next to it. The impossible venues (date/capacity) are pre-filtered and you judge the rest. Expect about 10–20 minutes. The limitation is stated honestly: one labeller, synthetic data.
- **`npm run eval`** runs deterministically from the gold structured briefs (free, repeatable, CI-safe). **`npm run eval:live`** runs the real OpenAI parse first and also reports parse accuracy against the gold versions.
- **Metrics:** Hit@5 (share of evaluable briefs whose top 5 contains ≥1 acceptable venue), hard-constraint violations, and the share of under-specified briefs that correctly triggered a follow-up.
- **Proposed launch bar:** Hit@5 ≥ 80%, **zero** violations, and 100% follow-up on briefs missing a date or guest count. This is a candidate standard, not proof of production accuracy.

## 8. File tree (target)

```
gather/
  README.md  RUNBOOK.md  CODE_MAP.md  AI_USAGE.md  .env.example  WORKSPACE.md
  docs/        MASTER_BRIEF.md  TECH_PLAN.md  submission/
  data/        venues.json  briefs.json            ← single source for seed AND eval
  eval/        labels.json  results/latest.md
  scripts/     seed.ts  eval.ts
  supabase/migrations/  0001_schema.sql  0002_rls.sql
  src/lib/
    matching/  eligibility.ts  score.ts  match.ts   ← pure, tested
    brief/     schema.ts  extract.ts  followup.ts
    areas.ts  pricing.ts  auth.ts  email.ts  stripe.ts  analytics.ts
    supabase/  server.ts  client.ts  admin.ts
  src/app/
    page.tsx  login/  signup/
    plan/  plan/[briefId]/            ← chat → summary → shortlist
    venues/[id]/  bookings/           ← planner
    venue/  venue/listing/  venue/availability/  venue/enquiries/[id]/
    admin/
    api/stripe/checkout/  api/stripe/webhook/
  tests/  eligibility.test.ts  score.test.ts  followup.test.ts  pricing.test.ts  webhook.test.ts
```

## 9. Milestones (each one = commit + deploy + plain-English explainer for you)

| # | Slice | Done when (acceptance) | PDF req |
|---|---|---|---|
| M0 | Repo, Next.js skeleton, Vercel deploy, `.env.example` | Public URL serves the landing page | Launch #1 (early) |
| M1 | Schema + RLS + seed of 30+ venues + sign-up/login with role | 3 demo accounts log in; a planner can't open `/venue` or `/admin` (server-checked) | Build #1, Data |
| **M2** | **Matcher core + fixtures + unit tests + offline eval** | Tests prove no blocked or undersized venue is ever returned; `npm run eval` prints Hit@5 | Build #4, eval |
| M3 | Chat brief: extract → follow-up → editable summary → shortlist UI | The "80 people… late March" brief asks for the date, then shows ≤5 eligible venues with reasons | Build #3 |
| M4 | Venue dashboard: create/edit listing, prices, block dates | A new venue account publishes a listing that appears in matching | Build #2 |
| M5 | Enquiry → venue reply + emails both sides | Both inboxes receive email; statuses update | Build #5 |
| M6 | Stripe test deposit after acceptance + verified webhook | Test card 4242… moves the enquiry to `paid`; the date becomes unavailable | Build #6 |
| M7 | Admin dashboard + analytics events | Counts of sign-ups, briefs, matches, bookings | Build #7, Launch #2 |
| M8 | README (<10 min), RUNBOOK, CODE_MAP, AI_USAGE, final deploy, demo creds | A fresh clone runs by following the README | Repo reqs, Launch #1 |

**Cut order if short on time** (record it, don't hide it): visual polish → the `--live` eval mode → photos → venue-side extras. **Never cut** M1, M2, M5 or M6.

## 10. Accounts and secrets you'll need (none shared in chat)

GitHub repo · Supabase project (URL, anon key, service-role key) · LLM API key · Resend API key · Stripe **test** keys + webhook secret · Vercel linked to GitHub. They go in `.env.local` locally and in Vercel's environment settings.

## 11. Explicitly out of v1

Live payments, refunds/cancellations beyond status changes, calendar sync, photos upload pipeline (URL field only), venue subscriptions, voice input, mobile apps, real venue/person data, LLM-generated reasons.
