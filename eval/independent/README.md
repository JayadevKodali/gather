# Gather independent planner evaluation

12 new fictional planner briefs: 10 with an acceptable venue and 2 with no eligible venue. These cases are separate from Claude’s 14 development briefs. GPT drafted and labelled them using the agreed planner rubric. Jay’s review is pending. All scenarios use fictional venue data and no real personal information.

## How to hand this to Claude

1. Once the OpenAI integration is working, copy `eval/independent/briefs.json` and `eval/independent/labels.json` into the same paths in the Gather repo. Leave the development files as they are.
2. Use the same venue fixtures. These labels use `data/venues.json` from `claude/gather-design-refresh` at `126e15d` (SHA-256 `719647d3d27a905327b933f05d0cd6160d85257dc2b257699993cb6e3e04693f`). The benchmark date is fixed at 14 November 2026 so relative date interpretation is reproducible. The benchmark uses the fixture calendars rather than a hosted database with changing bookings.
3. Run `npm run eval` for the confirmed-fields and local rules-reader passes. **At the base commit, `npm run eval -- --live` sends only the development set to the model.** When migrating the harness to OpenAI, add a separate OpenAI raw-text run for these independent files using their fixed date, and report that run separately. Report the model used and any failed calls or rules-based fallback.
4. Record Hit@5 (target: at least 8 of 10 matchable briefs), acceptable venues shown, exact follow-ups, field accuracy, both no-match results and hard-rule breaches. For the raw-text runs, also check the returned venues against the **gold** confirmed fields. The current breach counter checks the fields actually passed to the matcher, so an extractor dropping a must-have can otherwise go uncounted. Save the first results before making any tuning changes. If these cases inform tuning, use a fresh holdout for an unbiased final score.

## How the labels were made

I checked the venue fixtures in ID order without running or looking at Gather’s rankings for these briefs. A venue had to pass published status, confirmed availability, capacity for the requested layout, essential facilities and any hard budget cap. For planner acceptability I then used the agreed area rule (requested or neighbouring borough), event suitability, a guest count of about a quarter of the venue capacity or more, and at most 15% above a flexible budget guide. Essential paid extras count in the price. A strict cap excludes an unconfirmed price for an essential extra. Label order is by venue ID and does not imply preference.

Both JSON files passed the existing repo’s schema checks. Every labelled venue slug exists and passes the checks above, and neither no-match case has a venue that clears all hard rules. The evaluation itself has not run on this set.

## Briefs and expected results

### I01-two-dates — Two plausible dates; dance floor and sound both essential

> My sister has put 12 February 2027 in the group chat but the DJ has 13 February 2027. We haven’t agreed which date to ask for. About 210 guests standing for her birthday in Brixton. Hard cap £4,700 total. A dance floor and an actual sound system are both essential.

- **Expected follow-ups:** date: 13 February 2027
- **Acceptable venues:** `v12-tin-chapel`, `v24-brixton-vaults`
- **Why:** The Tin Chapel (£3,200, 220 standing) and Brixton Vaults (£4,000, 250 standing) are open on 13 February and have both required facilities. Southwark is adjacent to Lambeth.


### I02-headcount-missing — Small private dinner; headcount deliberately omitted

> Looking for a private seated dinner in Chelsea on 14 May 2027. The RSVP sheet is with my colleague, so I don’t have the total yet. The venue needs to offer catering and bar service. We can’t go above £2,700 total.

- **Expected follow-ups:** guests: 27 guests
- **Acceptable venues:** `v27-drawing-room`
- **Why:** The Drawing Room seats 28, offers catering and bar service, and costs £2,600. The nearby Glasshouse clears the hard rules but 27 guests fill under a quarter of its 110-seat capacity.


### I03-layout-missing — Exact seated capacity; layout must be confirmed

> Town hall for 70 people in Camden, 18 February 2027. Still need the team to agree whether guests sit or stand, so please check with me. £2,300 hard cap for the whole event. Must have a projector and screen, microphones and video conferencing.

- **Expected follow-ups:** layout: Seated
- **Acceptable venues:** `v14-cinder-screening`
- **Why:** Cinder Screening Room seats exactly 70 and includes the projector, microphones and video conferencing for £2,200. Nearby alternatives with the equipment exceed the £2,300 cap.


### I04-budget-conflict — Conflicting hard caps; step-free entry and storage

> Company showcase for 90 in a mixed standing and seated layout in Hackney on 20 May 2027. Finance wrote “£4,000 hard cap” and the organiser wrote “£5,500 hard cap”. Please ask which to use. Step-free access and space to store our display crates are both essential.

- **Expected follow-ups:** budget: £4,000 total is the hard cap
- **Acceptable venues:** `v06-saltbox-gallery`
- **Why:** Saltbox Gallery holds 110 mixed, has step-free access and storage, and is £3,800. The Loom Room is £4,200, above the clarified cap.


### I05-vague-wedding-date — Vague wedding date; 130 seated excludes 120-seat rooms

> We’re doing the wedding in early June 2027, somewhere around Waterloo. 130 guests seated for dinner. The dance floor and staging are essential, and £6,000 is our absolute total limit. We haven’t given you the exact date yet.

- **Expected follow-ups:** date: 5 June 2027
- **Acceptable venues:** `v12-tin-chapel`
- **Why:** The Tin Chapel seats 160, is open on 5 June and has dancing and staging for £3,200. Deptford Printworks clears the hard rules but is outside Lambeth and its neighbouring boroughs. Brixton Vaults only seats 120.


### I06-extras-at-cap — Minimum spend plus two required priced extras exactly reaches the cap

> 45 guests, mixed seated and standing, for a private celebration near Clerkenwell on 4 March 2027. The projector and screen and microphones are essential. Wi-Fi would be nice. £2,680 total is the maximum, including the essential extras.

- **Expected follow-ups:** None
- **Acceptable venues:** `v05-fennel-finch`
- **Why:** Fennel & Finch holds exactly 45 mixed and costs £2,500 minimum spend plus £120 for the projector and £60 for microphones. Pinehurst passes the hard rules, but the fixture describes a corporate/town-hall hotel meeting room rather than a suitable private celebration setting.


### I07-per-person-ceiling — Per-person cap applied to a hire-fee venue with a priced essential

> A seated wedding for 180 near Deptford on 21 May 2027. Our ceiling is £32 per head for the venue and the required equipment together. We must have a projector and screen and loading access for the suppliers.

- **Expected follow-ups:** None
- **Acceptable venues:** `v25-deptford-printworks`
- **Why:** Deptford Printworks seats exactly 180 and has loading access. Its £5,500 hire plus £150 projector comes to £5,650, within the £5,760 total cap. Foundry Hall exceeds the cap.


### I08-range-flexible-guide — Guest range, mixed layout and an explicitly flexible guide

> Client event, 100–110 people, mixed seated and standing, around Wapping on 10 February 2027. Budget is roughly £5,200 total, flexible for the right room. We need step-free access and video conferencing. Catering would be nice, but we can arrange it ourselves.

- **Expected follow-ups:** None
- **Acceptable venues:** `v10-signal-box`
- **Why:** Riverside Signal Box holds exactly 110 mixed and has step-free access, video conferencing and preferred catering. Its £5,800 estimate is within the £5,980 judgement limit (15% above the guide). Stratford Atrium at £6,000 just misses that limit, and Lamplight Library sits outside the target area and neighbours.


### I09-access-and-negation — Several access essentials and an explicitly unneeded projector

> Private reception for 72 standing on 15 April 2027 near Brixton. Step-free access to the room, a wheelchair-accessible toilet and baby changing are all essential. Parking would be useful. We do not need a projector. £6,500 maximum in total.

- **Expected follow-ups:** None
- **Acceptable venues:** `v26-battersea-glasshouse`
- **Why:** Battersea Glasshouse is in adjacent Wandsworth, confirms all three access essentials and preferred parking, and costs 72 × £85 = £6,120. The nearby Southbank Terrace lacks confirmed baby changing.


### I10-no-budget-draft — No budget given; a plausible draft listing must stay hidden

> Company demo event for 38 people standing in Hackney on 23 April 2027. Loading access and Wi-Fi are essential so we can bring equipment and get online. No budget has been agreed, so leave that open.

- **Expected follow-ups:** None
- **Acceptable venues:** `v01-loom-room`, `v02-copper-arch`, `v06-saltbox-gallery`, `v10-signal-box`
- **Why:** These four published local or adjacent options have loading and Wi-Fi, fit standing and suit a corporate demo. The other local or adjacent eligible options exceed 152 capacity, so 38 guests would fill less than a quarter. Northlight Studio is a draft and cannot appear.


### I11-unpriced-must-have — No match: an essential extra has no confirmed price under a strict cap

> 65 seated for a private party near Bethnal Green on 6 March 2027. £4,500 is a hard total ceiling. We definitely need microphones, a dance floor, and the venue to do the setup. The budget must cover all of that.

- **Expected follow-ups:** None
- **Acceptable venues:** No match
- **Why:** Glass Yard seats 65 and its £4,225 base clears the cap, but required setup has no confirmed price. Other listings miss a required facility, capacity, availability or the hard cap.


### I12-unconfirmed-date — No match: the affordable hall has no confirmed availability

> Birthday for 145 guests seated around Walthamstow on 27 March 2027. £2,000 maximum total. Step-free access, a wheelchair-accessible toilet and baby changing are essential. We need the venue to have confirmed that day is open.

- **Expected follow-ups:** None
- **Acceptable venues:** No match
- **Why:** Assembly Rooms seats 150, offers all three access essentials and costs £1,400, but its fixture has no confirmed bookable dates. No other listing passes all hard checks.

