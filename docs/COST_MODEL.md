# Cost note: running Gather at 500 briefs a month

The full working is in the Stage 3 launch plan and cost model, which is submitted separately. This note gives its
totals so the repository and that document agree. Prices were read from the providers' own pages on 15 Nov 2026,
converted at **$1 = £0.76**, before tax.

## Monthly totals against the £200 cap

| Monthly line | Assessment (now) | Commercial pilot | Higher cost |
|---|---|---|---|
| Hosting (Vercel) | £0.00 (Hobby) | £15.20 (Pro, $20) | £16.40 |
| Database and photo storage (Supabase) | £0.00 (Free) | £19.00 (Pro, $25) | £20.50 |
| AI brief reader (OpenAI), budget allowance | £3.80 | £3.80 | £8.20 |
| Email (Resend) | £0.00 (Free) | £0.00 (Free) | £16.40 (Pro, $20) |
| Domain renewal, spread over 12 months | £1.28 | £1.28 | £1.38 |
| Reserve for usage above included limits | £0.00 | £0.00 | £20.00 |
| **Total before tax** | **£5.08** | **£39.28** | **£82.88** |
| Headroom under £200 | £194.92 | £160.72 | £117.12 |

The higher-cost column keeps the volume at 500 briefs, moves to Resend Pro, doubles the model allowance, converts
at £0.82 to the dollar and sets aside £20 for overage.

## Assumptions

| Item | Assumption per month |
|---|---|
| Planner briefs | 500 |
| OpenAI calls | 1 per brief (follow-up answers use Gather's own rules, not the model) |
| Model allowance | $0.01 a brief, or $0.02 in the higher-cost case |
| Emails | about 900; check the busiest day against Resend Free's 100 a day and 3,000 a month |
| Venue photos | about 90 MB stored (38 venues × 6 photos, across the stored sizes); up to 5 GB a month served |

The model allowance is conservative. Worked from token prices (about 2,000 tokens in and 1,000 out per call, at
$0.10 and $0.50 per million), 500 calls come to about $0.35 a month, well under the $5 allowed. Replace the
allowance with the billed figure once real briefs arrive: OpenAI → Usage, filtered to the `gather` project.

Why the commercial pilot needs paid plans: Vercel Hobby is for personal, non-commercial use, and a Supabase Free
project can pause after about a week of inactivity (the daily keep-alive in `docs/OPERATIONS.md` is a safeguard,
not a guarantee).

## Kept separate: future payment fees

The current build takes **Stripe test-mode** deposits only, which cost nothing. Live payments, venue payouts
(Stripe Connect) and their per-transaction fees are future scope and are not in the totals above. They should be
priced once Amara decides who invoices, who settles, platform fees, refunds and disputes (see `docs/PAYMENTS.md`).
