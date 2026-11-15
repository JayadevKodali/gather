# Stage 3 cost note: running Gather at 500 briefs a month

Prices from the providers' own pages, read 15 Nov 2026. USD converted at **$1 = £0.76** (Wise mid-market
rate that day was about £0.756; rounded up to stay conservative). Prices exclude VAT.

## Workload assumption

| Item | Assumption per month |
|---|---|
| Planner briefs | 500 (the brief's figure) |
| OpenAI calls | 1 per brief = 500 (follow-up answers use Gather's own rules, not the model) |
| Tokens per call | about 2,000 in (instructions + strict schema + brief) and about 1,000 out (fields + low reasoning) |
| Emails | about 700: 150 enquiries × 4 notifications (enquiry, reply, quote, revision) + 30 bookings × 2 confirmations, plus admin contacts |
| Venue photos | 38 venues × up to 6 photos × 3 stored sizes ≈ 90 MB stored; under 5 GB a month served |

## Monthly cost

| Service | Assessment (now) | Real business launch | Notes |
|---|---|---|---|
| Hosting (Vercel) | Hobby, $0 | **Pro, $20** (£15.20) | Hobby is for personal, non-commercial use only. Pro includes $20 of usage credit, which this workload stays well inside |
| Database + photo storage (Supabase) | Free, $0 | **Pro, $25** (£19.00) | Free pauses after about a week of inactivity (the daily keep-alive is a safeguard, not a guarantee). Pro never pauses, includes 8 GB database and 100 GB file storage, and its $10 compute credit covers one Micro instance |
| AI brief reader (OpenAI `gpt-6-luna`) | about $0.35 | about $0.35 (£0.27) | $0.10 / 1M input and $0.50 / 1M output tokens: 500 × (2,000 × $0.10 + 1,000 × $0.50) / 1M. **Measure it**: OpenAI → Usage, filtered to the `gather` project, after a week of real briefs |
| Email (Resend) | Free, $0 | Free $0, or Pro $20 (£15.20) | Free = 3,000 emails/month, 100 a day. About 700/month fits; move to Pro if any day could pass 100 |
| Domain (gatherldn.com) | renewal only | renewal only | Use the renewal price on the Namecheap invoice (annual, so about £1–2 a month) |
| **Total** | **≈ £0.30/month + domain** | **≈ £34–50/month + domain** | Far below the £200 cap at 500 briefs. With Resend Pro it's about £50 |

Headroom: at 10× the volume (5,000 briefs), OpenAI is still about £3/month; emails (≈7,000) need Resend Pro;
Vercel and Supabase stay within their included Pro usage for this kind of app.

## Kept separate: future payment fees

The current build takes **Stripe test-mode** deposits only, which cost nothing. Live payments, venue payouts
(Stripe Connect) and their per-transaction fees are future scope. They should be priced once Amara decides who
invoices, who settles, platform fees, refunds and disputes (see `docs/PAYMENTS.md`). They are not in the
totals above.
