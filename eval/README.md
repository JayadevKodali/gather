# Matching evaluation

`npm run eval` runs sample briefs through the matcher and writes `eval/results/latest.md`.
It's free, needs no network and gives the same result every time.

## What is measured

| Metric | Meaning | Launch bar (proposed) |
|---|---|---|
| **Hit@5** | Of the briefs that have at least one acceptable venue, the share whose top five contains one | ≥ 80% |
| **Shown venues that are acceptable** | Of every venue shown for labelled briefs, the share on the acceptable list. Stricter than Hit@5: it penalises weak fillers in the top five | Report it; use it to tune weights |
| **Hard-rule breaches** | Shortlisted venues that are unavailable, too small for the layout, missing an essential, or over a strict cap | 0 (required) |
| **Impossible briefs** | Briefs labelled "no venue can do this" that correctly return an empty shortlist | 100% |
| **Follow-ups** | Raw-text briefs where Gather asked exactly the expected questions, in order | 100% |
| **Field accuracy** | Raw-text briefs whose extracted fields equal the gold fields after the follow-ups | Report it; aim high |

Every result is shown as numerator / denominator. A score on a dozen synthetic briefs is a sanity
check, not proof of production accuracy. Real validation needs real (consented) planner briefs
labelled by Amara.

Two runs per brief set:
1. **Confirmed fields**: the hand-written gold fields go straight to the matcher (tests matching alone).
2. **Raw text**: the original wording goes through the brief reader and scripted follow-up answers, then the matcher (tests the whole path).
   `npm run eval:live` adds a run through the OpenAI reader and writes `eval/results/openai-live.md`
   (needs `OPENAI_API_KEY` in `.env.local`; about a penny). On the development set it's labelled
   **development results**: those cases share an author with the code.

## How "acceptable" is labelled

A venue is acceptable for a brief if a sensible planner would happily enquire there:

1. It passes the hard rules (date confirmed and free, holds the guests in that layout, every essential confirmed, within any strict cap).
2. It's in the requested borough or one next to it (any area if none was given).
3. It's within a strict cap, or no more than 15% over a flexible guide.
4. It's the right kind of place for the event (for example, not a screening room for a client dinner).
5. The room isn't absurdly big: the guests fill at least about a quarter of the capacity.

Labels are written **before looking at the matcher's ranking**. `npm run eval:sheet -- <briefs.json>`
prints every venue that passes the hard rules, in ID order with the facts above and no scores, so the
labeller isn't anchored by the ranking.

## The two brief sets

| Set | Files | Written and labelled by | Status |
|---|---|---|---|
| Development | `data/dev-briefs.json`, `data/dev-labels.json` | Claude, while building (14 cases) | Results in `eval/results/latest.md`. Not independent: it shares an author with the code. |
| Independent | `eval/independent/briefs.json`, `eval/independent/labels.json` | GPT wrote and labelled the 12 cases before seeing any ranking; added unchanged on 15 Nov | Results in `eval/results/latest.md` (first run kept in `eval/results/first-run/`). Jay's review of the labels is pending. |

### Adding the independent set (Jay + GPT)

1. Copy `eval/independent/briefs.template.json` to `eval/independent/briefs.json` and write 10+ messy briefs
   against `data/venues.json`. Cover vague dates, contradictions, capacity at and just below a limit,
   required AV or step-free access, priced extras, strict versus flexible budgets, and true no-match cases.
   For each, fill `gold` (what a careful human would extract) and `followUps` (the questions Gather should
   ask, in order, with the answer you'd give).
2. Run `npm run eval:sheet -- eval/independent/briefs.json` and open
   `eval/results/labelling-sheet-briefs.md`.
3. Write `eval/independent/labels.json` (same shape as `data/dev-labels.json`) using the rubric above.
   Don't run `npm run eval` until the labels are done.
4. Run `npm run eval`. The "Independent set" section fills in.
