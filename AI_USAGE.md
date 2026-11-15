# How AI tools were used

**Planning and review (ChatGPT):** consolidated the employer brief into a master brief, drafted the
Stage 1 design pack (problem, discovery questions, launch call, journeys), built the clickable
prototype, and wrote the overnight handover. Jay reviewed and approved each decision.

**Building (Claude, in a cloud coding session with access to this repo):** wrote the code, fixtures,
tests, evaluation harness and docs (`claude/gather-v1`, then the design refresh and Stage 2 on
`claude/gather-stage2`), including the switch of the brief reader to OpenAI and the hosted deployment. It ran the
type checker, linter, unit and database tests, the production build and a scripted browser
walkthrough before each push. The commit messages and `HANDOFF.md` record what was verified and
what wasn't.

**Inside the product:** one OpenAI call per brief (`gpt-6-luna`, Responses API with a strict
Structured Outputs schema, `store: false`) turns free text into structured fields, which Gather
re-validates and the planner can correct. Everything that decides what a planner sees runs in ordinary, tested code: follow-up
questions, availability, capacity, essentials, budget caps, ranking and reasons. Demo mode and the
tests use a deterministic rules reader instead, so results are repeatable and need no API key.

**Guardrails we kept to:**
- Synthetic data only: no real venues, people or payments in the code, fixtures or model calls.
- The development evaluation set was written by the same assistant that wrote the matcher, so it is
  reported separately from the independent set Jay and GPT label.
- Nothing is described as working unless it was run. Supabase, OpenAI, Stripe (test mode), Resend
  and Vercel were verified end to end on the live site on 15 Nov 2026 (see the table in `HANDOFF.md`);
  the independent briefs and labels were written by GPT without seeing Gather's rankings.

Jay is responsible for every line that's submitted. `CODE_MAP.md` is the guide for explaining and changing it.
