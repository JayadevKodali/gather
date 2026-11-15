# Gather matcher evaluation

Generated 2026-11-15T02:09:30.702Z over 32 synthetic venues (data/venues.json).

**Proposed launch bar:** Hit@5 ≥ 80%, zero hard-rule breaches, every impossible brief returns an empty shortlist, every follow-up correct. A small synthetic benchmark is a sanity check, not proof of production accuracy.

## Development set (Claude-written, Claude-labelled — NOT independent)

### Run 1: Confirmed fields (matcher only)

- **Hit@5:** 100% (13/13)
- **Shown venues that are acceptable (stricter):** 70% (43/61)
- **Hard-rule breaches (against the fields the matcher was given):** 0
- **Hard-rule breaches against the gold confirmed requirements:** 0
- **Impossible briefs returned empty:** 100% (1/1)

| Case | Scenario | Top 5 | Hit | Acceptable shown | Breaches (given / gold) | Notes |
|---|---|---|---|---|---|---|
| D01-amara-example | Vague date (late March), strict cap, essential AV | v01-loom-room, v03-glass-yard, v18-pinehurst-suite, v10-signal-box, v28-stratford-atrium | ✅ | 4/5 | 0 / 0 |  |
| D02-missing-guests | Guest count missing; lunch implied | v23-southbank-terrace, v10-signal-box, v18-pinehurst-suite, v30-angel-canal-room, v32-fitzrovia-glass-box | ✅ | 3/5 | 0 / 0 |  |
| D03-two-budgets | Contradictory budget (under £2k vs stretch to £6k) | v18-pinehurst-suite, v21-hollow-oak, v30-angel-canal-room, v09-thimble-thread, v05-fennel-finch | ✅ | 5/5 | 0 / 0 |  |
| D04-exact-capacity | Exactly at a venue's seated capacity (70 of 70) | v14-cinder-screening, v32-fitzrovia-glass-box, v15-lamplight-library, v18-pinehurst-suite, v01-loom-room | ✅ | 4/5 | 0 / 0 |  |
| D05-no-availability | True no-match: 350 standing on a Saturday when every big room is taken or closed | — | — | — | 0 / 0 | empty as expected |
| D06-vague-area | Loose geography and a flexible budget | v18-pinehurst-suite, v21-hollow-oak, v09-thimble-thread, v30-angel-canal-room, v08-brickwork-social | ✅ | 4/5 | 0 / 0 |  |
| D07-per-head-cap | Per-head strict cap, south London, wedding | v12-tin-chapel, v25-deptford-printworks, v24-brixton-vaults | ✅ | 3/3 | 0 / 0 |  |
| D08-step-free | Accessibility essentials | v30-angel-canal-room, v14-cinder-screening, v18-pinehurst-suite, v11-orchard-rooftop, v32-fitzrovia-glass-box | ✅ | 1/5 | 0 / 0 |  |
| D09-range-and-mixed | Guest range, mixed layout, per-head guide, preferred facility | v12-tin-chapel, v24-brixton-vaults, v25-deptford-printworks, v07-kiln-rooms, v17-foundry-hall | ✅ | 3/5 | 0 / 0 |  |
| D10-almost-empty | Nearly empty brief: three follow-ups in order | v19-wren-lane-loft, v04-alder-dining, v05-fennel-finch, v27-drawing-room, v21-hollow-oak | ✅ | 5/5 | 0 / 0 |  |
| D11-not-london | Out-of-area brief corrected by the planner | v19-wren-lane-loft, v05-fennel-finch, v30-angel-canal-room, v04-alder-dining, v21-hollow-oak | ✅ | 5/5 | 0 / 0 |  |
| D12-priced-extra-under-cap | A priced essential extra counts towards a strict cap | v25-deptford-printworks, v11-orchard-rooftop, v07-kiln-rooms, v28-stratford-atrium, v24-brixton-vaults | ✅ | 3/5 | 0 / 0 |  |
| D13-tiny-dinner | Smallest capacity in the set (12 seated, exact) | v20-little-ember, v04-alder-dining, v01-loom-room, v02-copper-arch, v07-kiln-rooms | ✅ | 2/5 | 0 / 0 |  |
| D14-town-hall | Town hall needing specific AV, not general AV | v18-pinehurst-suite, v28-stratford-atrium, v17-foundry-hall | ✅ | 1/3 | 0 / 0 |  |

### Run 2: Raw text → extractor → follow-ups → matcher

- **Hit@5:** 100% (13/13)
- **Shown venues that are acceptable (stricter):** 70% (43/61)
- **Hard-rule breaches (against the fields the matcher was given):** 0
- **Hard-rule breaches against the gold confirmed requirements:** 2
- **Impossible briefs returned empty:** 100% (1/1)
- **Asked exactly the right follow-ups:** 100% (14/14)
- **All extracted fields matched gold:** 93% (13/14)

| Case | Scenario | Top 5 | Hit | Acceptable shown | Breaches (given / gold) | Notes |
|---|---|---|---|---|---|---|
| D01-amara-example | Vague date (late March), strict cap, essential AV | v01-loom-room, v03-glass-yard, v18-pinehurst-suite, v10-signal-box, v28-stratford-atrium | ✅ | 4/5 | 0 / 0 | asked: date |
| D02-missing-guests | Guest count missing; lunch implied | v23-southbank-terrace, v10-signal-box, v18-pinehurst-suite, v25-deptford-printworks, v17-foundry-hall | ✅ | 3/5 | 0 / 2 (v25-deptford-printworks, v17-foundry-hall) | asked: guests; field mismatch: facilities |
| D03-two-budgets | Contradictory budget (under £2k vs stretch to £6k) | v18-pinehurst-suite, v21-hollow-oak, v30-angel-canal-room, v09-thimble-thread, v05-fennel-finch | ✅ | 5/5 | 0 / 0 | asked: budget |
| D04-exact-capacity | Exactly at a venue's seated capacity (70 of 70) | v14-cinder-screening, v32-fitzrovia-glass-box, v15-lamplight-library, v18-pinehurst-suite, v01-loom-room | ✅ | 4/5 | 0 / 0 | asked: nothing |
| D05-no-availability | True no-match: 350 standing on a Saturday when every big room is taken or closed | — | — | — | 0 / 0 | empty as expected; asked: nothing |
| D06-vague-area | Loose geography and a flexible budget | v18-pinehurst-suite, v21-hollow-oak, v09-thimble-thread, v30-angel-canal-room, v08-brickwork-social | ✅ | 4/5 | 0 / 0 | asked: nothing |
| D07-per-head-cap | Per-head strict cap, south London, wedding | v12-tin-chapel, v25-deptford-printworks, v24-brixton-vaults | ✅ | 3/3 | 0 / 0 | asked: nothing |
| D08-step-free | Accessibility essentials | v30-angel-canal-room, v14-cinder-screening, v18-pinehurst-suite, v11-orchard-rooftop, v32-fitzrovia-glass-box | ✅ | 1/5 | 0 / 0 | asked: nothing |
| D09-range-and-mixed | Guest range, mixed layout, per-head guide, preferred facility | v12-tin-chapel, v24-brixton-vaults, v25-deptford-printworks, v07-kiln-rooms, v17-foundry-hall | ✅ | 3/5 | 0 / 0 | asked: nothing |
| D10-almost-empty | Nearly empty brief: three follow-ups in order | v19-wren-lane-loft, v04-alder-dining, v05-fennel-finch, v27-drawing-room, v21-hollow-oak | ✅ | 5/5 | 0 / 0 | asked: date → guests → layout |
| D11-not-london | Out-of-area brief corrected by the planner | v19-wren-lane-loft, v05-fennel-finch, v30-angel-canal-room, v04-alder-dining, v21-hollow-oak | ✅ | 5/5 | 0 / 0 | asked: area |
| D12-priced-extra-under-cap | A priced essential extra counts towards a strict cap | v25-deptford-printworks, v11-orchard-rooftop, v07-kiln-rooms, v28-stratford-atrium, v24-brixton-vaults | ✅ | 3/5 | 0 / 0 | asked: nothing |
| D13-tiny-dinner | Smallest capacity in the set (12 seated, exact) | v20-little-ember, v04-alder-dining, v01-loom-room, v02-copper-arch, v07-kiln-rooms | ✅ | 2/5 | 0 / 0 | asked: nothing |
| D14-town-hall | Town hall needing specific AV, not general AV | v18-pinehurst-suite, v28-stratford-atrium, v17-foundry-hall | ✅ | 1/3 | 0 / 0 | asked: nothing |

## Independent set (Jay + GPT)

### Run 1: Confirmed fields (matcher only)

- **Hit@5:** 100% (10/10)
- **Shown venues that are acceptable (stricter):** 50% (14/28)
- **Hard-rule breaches (against the fields the matcher was given):** 0
- **Hard-rule breaches against the gold confirmed requirements:** 0
- **Impossible briefs returned empty:** 100% (2/2)

| Case | Scenario | Top 5 | Hit | Acceptable shown | Breaches (given / gold) | Notes |
|---|---|---|---|---|---|---|
| I01-two-dates | Two plausible dates; dance floor and sound both essential | v24-brixton-vaults, v12-tin-chapel | ✅ | 2/2 | 0 / 0 |  |
| I02-headcount-missing | Small private dinner; headcount deliberately omitted | v27-drawing-room, v26-battersea-glasshouse, v04-alder-dining, v31-cellar-aldgate, v05-fennel-finch | ✅ | 1/5 | 0 / 0 |  |
| I03-layout-missing | Exact seated capacity; layout must be confirmed | v14-cinder-screening | ✅ | 1/1 | 0 / 0 |  |
| I04-budget-conflict | Conflicting hard caps; step-free entry and storage | v06-saltbox-gallery | ✅ | 1/1 | 0 / 0 |  |
| I05-vague-wedding-date | Vague wedding date; 130 seated excludes 120-seat rooms | v12-tin-chapel, v25-deptford-printworks | ✅ | 1/2 | 0 / 0 |  |
| I06-extras-at-cap | Minimum spend plus two required priced extras exactly reaches the cap | v05-fennel-finch, v18-pinehurst-suite | ✅ | 1/2 | 0 / 0 |  |
| I07-per-person-ceiling | Per-person cap applied to a hire-fee venue with a priced essential | v25-deptford-printworks | ✅ | 1/1 | 0 / 0 |  |
| I08-range-flexible-guide | Guest range, mixed layout and an explicitly flexible guide | v10-signal-box, v15-lamplight-library, v28-stratford-atrium, v18-pinehurst-suite, v17-foundry-hall | ✅ | 1/5 | 0 / 0 |  |
| I09-access-and-negation | Several access essentials and an explicitly unneeded projector | v26-battersea-glasshouse, v28-stratford-atrium, v01-loom-room, v18-pinehurst-suite | ✅ | 1/4 | 0 / 0 |  |
| I10-no-budget-draft | No budget given; a plausible draft listing must stay hidden | v06-saltbox-gallery, v01-loom-room, v02-copper-arch, v07-kiln-rooms, v10-signal-box | ✅ | 4/5 | 0 / 0 |  |
| I11-unpriced-must-have | No match: an essential extra has no confirmed price under a strict cap | — | — | — | 0 / 0 | empty as expected |
| I12-unconfirmed-date | No match: the affordable hall has no confirmed availability | — | — | — | 0 / 0 | empty as expected |

### Run 2: Raw text → extractor → follow-ups → matcher

- **Hit@5:** 90% (9/10)
- **Shown venues that are acceptable (stricter):** 32% (12/37)
- **Hard-rule breaches (against the fields the matcher was given):** 0
- **Hard-rule breaches against the gold confirmed requirements:** 17
- **Impossible briefs returned empty:** 50% (1/2)
- **Asked exactly the right follow-ups:** 92% (11/12)
- **All extracted fields matched gold:** 17% (2/12)

| Case | Scenario | Top 5 | Hit | Acceptable shown | Breaches (given / gold) | Notes |
|---|---|---|---|---|---|---|
| I01-two-dates | Two plausible dates; dance floor and sound both essential | v24-brixton-vaults, v12-tin-chapel | ✅ | 2/2 | 0 / 0 | asked: date |
| I02-headcount-missing | Small private dinner; headcount deliberately omitted | v27-drawing-room, v26-battersea-glasshouse, v04-alder-dining, v31-cellar-aldgate, v05-fennel-finch | ✅ | 1/5 | 0 / 0 | asked: guests; field mismatch: budget, eventType |
| I03-layout-missing | Exact seated capacity; layout must be confirmed | v14-cinder-screening, v32-fitzrovia-glass-box, v15-lamplight-library, v18-pinehurst-suite, v28-stratford-atrium | ✅ | 1/5 | 0 / 4 (v32-fitzrovia-glass-box, v15-lamplight-library, v18-pinehurst-suite, v28-stratford-atrium) | asked: nothing (UNEXPECTED); field mismatch: budget |
| I04-budget-conflict | Conflicting hard caps; step-free entry and storage | v06-saltbox-gallery, v32-fitzrovia-glass-box, v24-brixton-vaults | ✅ | 1/3 | 0 / 2 (v32-fitzrovia-glass-box, v24-brixton-vaults) | asked: budget; field mismatch: facilities |
| I05-vague-wedding-date | Vague wedding date; 130 seated excludes 120-seat rooms | v12-tin-chapel, v25-deptford-printworks, v17-foundry-hall | ✅ | 1/3 | 0 / 1 (v17-foundry-hall) | asked: date; field mismatch: budget |
| I06-extras-at-cap | Minimum spend plus two required priced extras exactly reaches the cap | v05-fennel-finch, v18-pinehurst-suite, v32-fitzrovia-glass-box, v01-loom-room, v15-lamplight-library | ✅ | 1/5 | 0 / 3 (v32-fitzrovia-glass-box, v01-loom-room, v15-lamplight-library) | asked: nothing; field mismatch: budget, eventType |
| I07-per-person-ceiling | Per-person cap applied to a hire-fee venue with a priced essential | v25-deptford-printworks, v28-stratford-atrium, v17-foundry-hall | ✅ | 1/3 | 0 / 2 (v28-stratford-atrium, v17-foundry-hall) | asked: nothing; field mismatch: budget, facilities |
| I08-range-flexible-guide | Guest range, mixed layout and an explicitly flexible guide | v10-signal-box, v15-lamplight-library, v28-stratford-atrium, v18-pinehurst-suite, v17-foundry-hall | ✅ | 1/5 | 0 / 0 | asked: nothing |
| I09-access-and-negation | Several access essentials and an explicitly unneeded projector | v28-stratford-atrium | ❌ | 0/1 | 0 / 0 | asked: nothing; field mismatch: budget, eventType, facilities |
| I10-no-budget-draft | No budget given; a plausible draft listing must stay hidden | v04-alder-dining, v06-saltbox-gallery, v01-loom-room, v02-copper-arch, v07-kiln-rooms | ✅ | 3/5 | 0 / 1 (v04-alder-dining) | asked: nothing; field mismatch: facilities |
| I11-unpriced-must-have | No match: an essential extra has no confirmed price under a strict cap | v03-glass-yard, v17-foundry-hall, v25-deptford-printworks, v07-kiln-rooms | — | — | 0 / 4 (v03-glass-yard, v17-foundry-hall, v25-deptford-printworks, v07-kiln-rooms) | SHOULD BE EMPTY; asked: nothing; field mismatch: budget, facilities |
| I12-unconfirmed-date | No match: the affordable hall has no confirmed availability | — | — | — | 0 / 0 | empty as expected; asked: nothing; field mismatch: budget |
