# Design refresh (branch `claude/gather-design-refresh`)

A visual redesign of the working v1 app. **Matching rules, role permissions, quote revisions and
booking logic are unchanged.** All 79 unit and database tests and the browser walkthrough pass.

## What changed

**Homepage** (`src/app/page.tsx`, styles under "Homepage" in `src/app/globals.css`)
1. Full-bleed hero: *The Loom Room at dusk*, a cream editorial headline on the dark left, and
   **Find a venue** (primary) and **List your venue** (secondary). The header floats over it.
2. A cinematic hand-off: the hero is sticky. As you scroll it drifts down, zooms slightly and
   darkens, its copy lifts and fades, and the page rises over it on rounded corners.
3. Intro statement and the three-step journey, with generous spacing.
4. Showcase: six seeded venues in a large editorial grid. Captions come from listing data
   (capacity, price basis), never from the photos.
5. The **3D cutaway moment** (`src/components/Cutaway.tsx`), described below.
6. Owners section (Battersea Glasshouse cutaway) and a closing call to action.

**Venue cards** (`src/app/plan/[id]/results/page.tsx`, logic in `src/lib/matching/card.ts`)
- The photo comes first, then the name and the type and area.
- Then the capacity for the selected layout with the price and its basis, for example
  "120 standing · £4,200 hire fee" or "95 standing · £65 per head × 80". "est." appears only when
  priced extras change the total.
- **Why it fits:** one sentence built only from checked facts, for example "Available on your date
  with the AV you requested, in your area."
- Up to four confirmed amenities upfront (the planner's requests first). The rest, with every reason
  and the priced extras, is in an expandable section.
- One action, **View and enquire**, plus subtle hover and focus states. Everything is also visible on touch.

**Venue detail** (`src/app/venues/[id]/page.tsx`): the same photo as a wide header, then the name, a
capacity strip (standing, seated, mixed, with the planner's layout marked) and the price basis.
Then sections for Accessibility (including the owner's access notes), Included facilities and
Priced extras, with "not offered / not confirmed" collapsed. The enquiry panel sticks beside them on desktop.

**Images** (`src/lib/venue-images.ts`, `src/components/VenueImage.tsx`): 32 seeded slugs map to
`/images/venues/<slug>.webp`, generated from `docs/gather-venue-images.csv`. Any other listing,
such as one an owner creates, gets the drawn SVG fallback labelled "Photo coming soon". The photos
are served through `next/image`, with responsive sizes and lazy loading below the fold.

**Palette and type:** warm off-white `#F3EFE6`, deep forest `#1E4A3A` and `#10291F`, charcoal `#24272B`
for text, cream `#F2E9D8` for type on photos, brass `#C9A063` for light. The type is Instrument Serif
for headlines and Inter for the interface. The focus ring is a darker brass (`#9A6A22`) for contrast on light
backgrounds, and brass on dark ones.

## Motion: what's working

All motion lives in one small client component (`src/components/Motion.tsx`). It only reads the
native scroll and pointer positions and sets CSS variables, so scrolling is never hijacked.

| Effect | Where | How |
|---|---|---|
| Slow push-in | Hero photo | CSS keyframes, 18 s, scale 1 → 1.085 towards the room |
| Scroll hand-off | Hero → intro | `--p` (0→1 as you scroll) drives parallax, darkening and the copy lifting and fading; the page slides over the sticky hero |
| Masked photo reveals | Showcase, owners, shortlist cards | A clip-path mask opens from the bottom while the photo settles from 1.14× zoom, staggered by 150 ms |
| **3D cutaway** | Pinned dark section | The angle (rotateX/rotateY/scale) follows scroll through the section; on desktop it also leans towards the pointer |
| Annotation tags | Over the cutaway | Appear one by one as you scroll, at a different depth from the image |
| Card hover | Shortlist | Subtle photo zoom, border and shadow (pointer devices only) |

**Honest note on the 3D:** there is no 3D model. The supplied cutaway is a single still image. The
effect is **layered depth in CSS 3D**: the image sits on a plane in a perspective scene and turns as
you scroll. A warm glow sits 180 px behind it. Lamp halos sit 46 px in front, over the render's
pendant lamps, and the annotation tags sit 120 px in front. Because those layers sit at different
depths, they shift against each other as the angle changes. The walkthrough checks that the rig's
computed transform changes with scroll, with pointer movement, and with touch-device scrolling.
A true 3D scene (for example three.js with a modelled room) or a Higgsfield clip can replace the
plane later. The section is self-contained.

**Accessibility and fallbacks**
- "Reduce motion" (checked before first paint): no push-in, parallax, reveals or tilt. The cutaway
  is a still image, the section isn't pinned, and every image is visible immediately.
- Text and buttons are never hidden by motion. Only images are revealed. If scripts never run,
  a CSS failsafe shows the images after 4 s.
- Native scrolling throughout; touch scrolling drives the same effects; nothing depends on hover.

## Fix after first review (14 Nov)

- **Header styling leaked off the homepage.** The transparent "over the photo" header was chosen by the
  server from the first URL loaded. Next.js keeps the root layout across link clicks, so after clicking from
  the homepage every page kept the floating header and lost its top padding. The choice is now made in CSS
  (`body:has(.home)`), which is true only while the homepage is on screen, in both directions. The walkthrough
  now clicks hero → sign-up → logo → home, and hero → /plan when signed in, and checks the header each time.
- **Signed-in calls to action.** The homepage buttons sent signed-in people to "Create an account". Planners
  now go to *Find a venue*, owners to *Manage your listings*, admins to the pilot dashboard.
- **Safari after switching branches.** The dev server's stylesheet keeps the same file name between
  branches, so Safari can keep the old one: photos then stretch over the whole page. Use
  Develop → Empty Caches (Option+Cmd+E) and reload. Production builds use hashed file names, so this is a
  local-preview issue only.

## Verification (this branch)

- `npm run typecheck`, `npm run lint`: clean. `npm run build`: clean.
- `npm test`: **79 passing**. That's the earlier 70 plus 9 new tests: card text from listing data,
  every seed slug has a photo and alt text, and a new slug falls back.
- `python3 e2e/walkthrough.py` on the production build (`next start`, fresh seed): **all steps pass**.
  This includes the full planner → owner → quote → revision → declined card → booking journey, plus:
  every image decodes on the homepage, shortlist and reduced-motion page; seeded cards show photos;
  a new owner listing shows the fallback; the hero's scroll progress moves; showcase reveals fire; the
  cutaway angle changes with scroll, pointer and mobile scroll; reduced motion leaves the rig flat;
  and keyboard Tab reaches **Find a venue** with a visible focus ring.
- Screenshots are in `docs/screenshots/` (desktop 1360 px and mobile 390 px).

## Preview

```bash
git fetch origin claude/gather-design-refresh
git checkout claude/gather-design-refresh
npm install
npm run dev          # http://localhost:3000. If you'd run the old version, `npm run seed` resets the demo data
```
Demo password: `gather-demo-2026` (one-click buttons on the sign-in page). To test reduced
motion, turn on your OS "Reduce motion" setting (macOS: Accessibility → Display) and reload.
