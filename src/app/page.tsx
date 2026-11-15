import Image from "next/image";
import Link from "next/link";
import { Cutaway } from "@/components/Cutaway";
import { Motion } from "@/components/Motion";
import { VenueImage } from "@/components/VenueImage";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatPounds } from "@/lib/format";
import { HERO_IMAGES } from "@/lib/venue-images";

/** Featured rooms, in showcase order. Facts come from the listings table, not the photos. */
const SHOWCASE = ["v26-battersea-glasshouse", "v12-tin-chapel", "v05-fennel-finch", "v24-brixton-vaults", "v15-lamplight-library", "v10-signal-box"];

interface ShowcaseRow {
  slug: string;
  name: string;
  neighbourhood: string;
  venue_type: string;
  capacity_standing: number | null;
  capacity_seated: number | null;
  pricing_model: "hire_fee" | "min_spend" | "per_head";
  price_pence: number;
}

function facts(v: ShowcaseRow) {
  const capacity = v.capacity_standing ? `Up to ${v.capacity_standing} standing` : `Up to ${v.capacity_seated} seated`;
  const price =
    v.pricing_model === "per_head" ? `${formatPounds(v.price_pence)} per head`
    : v.pricing_model === "min_spend" ? `${formatPounds(v.price_pence)} minimum spend`
    : `${formatPounds(v.price_pence)} hire fee`;
  return `${capacity} · ${price}`;
}

/** Where each call to action goes. Signed-in people go to their own area instead of the sign-up form. */
function ctas(role: "planner" | "owner" | "admin" | null) {
  if (role === "planner") return { find: { href: "/plan", label: "Find a venue" }, list: null, home: null };
  if (role === "owner") return { find: null, list: { href: "/owner", label: "Manage your listings" }, home: null };
  if (role === "admin") return { find: null, list: null, home: { href: "/admin", label: "Pilot dashboard" } };
  return { find: { href: "/signup?role=planner", label: "Find a venue" }, list: { href: "/signup?role=owner", label: "List your venue" }, home: null };
}

export default async function Home() {
  const actor = await getActor();
  const cta = ctas(actor?.role ?? null);
  const primary = cta.find ?? cta.list ?? cta.home;
  const db = await getDb();
  const rows = await db.query<ShowcaseRow>(
    `select slug, name, neighbourhood, venue_type, capacity_standing, capacity_seated, pricing_model, price_pence
     from listings where is_published and slug = any($1::text[])`,
    [SHOWCASE],
  );
  const venues = SHOWCASE.map((slug) => rows.find((r) => r.slug === slug)).filter((v): v is ShowcaseRow => Boolean(v));
  // The payment-testing room is a fixture for test deposits, not a venue to advertise.
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from listings where is_published and slug <> 'v90-gather-test-room'");
  const [lead, ...rest] = venues;

  return (
    <div className="home">
      <Motion />

      {/* 1. Hero: full-bleed photograph, live copy on the darker left. Sticky, so the next section slides over it. */}
      <section className="hero" data-progress="leave" aria-labelledby="hero-title">
        <div className="hero-media">
          <div className="hero-push">
            <Image src={HERO_IMAGES.loomDusk.src} alt={HERO_IMAGES.loomDusk.alt} fill preload sizes="100vw" />
          </div>
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-copy wrap">
          <h1 id="hero-title">The right room for the night you have in mind.</h1>
          <p className="hero-lead">Describe your event in your own words. Gather checks dates, capacity and must-haves against what London’s independent venues have confirmed, then shows the few that genuinely fit.</p>
          <div className="actions">
            {cta.find && <Link className="btn btn-cream" href={cta.find.href}>{cta.find.label}</Link>}
            {cta.list && <Link className={cta.find ? "btn btn-ghost" : "btn btn-cream"} href={cta.list.href}>{cta.list.label}</Link>}
            {cta.home && <Link className="btn btn-cream" href={cta.home.href}>{cta.home.label}</Link>}
          </div>
          <p className="hero-note">Free 30-day pilot. {n} fictional venues listed so far.</p>
        </div>
        <p className="hero-credit" aria-hidden="true">The Loom Room, Shoreditch</p>
      </section>

      <div className="after-hero">
        {/* 2. Intro */}
        <section className="wrap intro" aria-labelledby="intro-title">
          <h2 id="intro-title" className="intro-statement">Independent rooms, matched to the way you actually brief.</h2>
          <div>
            <p className="lead">No more emailing fifteen venues and waiting two days for a PDF. Tell Gather what you need, and only rooms that can really host it make the list.</p>
            <ol className="journey">
              <li><h3>Describe it</h3><p>“80 standing near Shoreditch in late March, under £6k, needs AV.” If something essential is missing, Gather asks one short question.</p></li>
              <li><h3>See what fits</h3><p>Up to five venues free on your date, big enough for your layout, with your essentials. Each says why it made the list.</p></li>
              <li><h3>Book with a deposit</h3><p>The venue sends an itemised quote. Ask, revise, then pay the deposit to lock the date.</p></li>
            </ol>
          </div>
        </section>

        {/* 3. Showcase: large photography, masked reveals */}
        {lead && (
          <section className="wrap showcase" aria-labelledby="showcase-title">
            <div className="section-head">
              <h2 id="showcase-title">Rooms you won’t find on the big sites</h2>
              {cta.find && <Link href={cta.find.href} className="text-link">Start a brief</Link>}
            </div>
            <div className="showcase-grid">
              {[lead, ...rest].map((v, i) => (
                <figure key={v.slug} className={`showcase-item item-${i}`} data-reveal style={{ "--i": i % 3 } as React.CSSProperties}>
                  <VenueImage slug={v.slug} name={v.name} type={v.venue_type} sizes={i === 0 ? "(max-width: 900px) 100vw, 58vw" : "(max-width: 900px) 100vw, 34vw"} />
                  <figcaption>
                    <span className="showcase-name">{v.name}</span>
                    <span className="showcase-meta">{v.venue_type}, {v.neighbourhood}</span>
                    <span className="showcase-facts">{facts(v)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* 4. Every room is checked: flat image that settles in as you scroll */}
        <Cutaway />

        {/* 5. Owners */}
        <section className="wrap owners" aria-labelledby="owners-title">
          <figure className="owners-photo" data-reveal>
            <div className="venue-image">
              <Image src={HERO_IMAGES.glasshouseCutaway.src} alt={HERO_IMAGES.glasshouseCutaway.alt} fill sizes="(max-width: 900px) 100vw, 50vw" />
            </div>
          </figure>
          <div className="owners-copy">
            <h2 id="owners-title">For venue owners: fewer emails, better enquiries.</h2>
            <p className="lead">You hear only from planners whose date, numbers and needs your space can meet.</p>
            <dl className="owner-points">
              <div><dt>Your listing, your control</dt><dd>Capacities for standing, seated and mixed layouts, what’s included and what costs extra.</dd></div>
              <div><dt>Dates you confirm</dt><dd>Open the days you can host. A paid deposit blocks the date for everyone else.</dd></div>
              <div><dt>Quotes in one place</dt><dd>Reply, send an itemised quote, revise it. Every version is kept.</dd></div>
            </dl>
            {cta.list && <Link className="btn" href={cta.list.href}>{actor ? cta.list.label : "List your venue free"}</Link>}
          </div>
        </section>

        {/* 6. Close */}
        <section className="closing" aria-labelledby="closing-title">
          <div className="wrap">
            <h2 id="closing-title">What are you planning?</h2>
            <p className="lead">Free during the pilot, for planners and venues.</p>
            <div className="actions">
              {primary && <Link className="btn btn-cream" href={primary.href}>{primary.label}</Link>}
              {!actor && <Link className="btn btn-ghost" href="/login">Sign in</Link>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
