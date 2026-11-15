/**
 * "Every room is checked before you see it": the homepage section that explains the three hard checks.
 *
 * A flat, rounded image in one fixed frame, with the three checks beside it. As the section scrolls into
 * view the image settles from 94% to full size and brightens, and the checks appear one after another.
 * It looks finished at every scroll position: before the script runs, and with reduced motion, it is simply
 * the final state (full size, full brightness, all checks visible). No 3D tilt and no parallax.
 *
 * The image is a single swappable slot: CHECKED_IMAGE (one file) in one fixed 3:2 frame, so a better image
 * can replace it without any layout change.
 */
import Image from "next/image";
import { CHECKED_IMAGE } from "@/lib/venue-images";

const CHECKS = [
  { title: "Capacity by layout", body: "Standing, seated and mixed numbers are checked separately against your guest count." },
  { title: "Facilities the owner confirmed", body: "Anything you mark essential is only matched where the venue has said it’s available." },
  { title: "Dates the owner opened", body: "Days are bookable only when the owner opens them, and drop out once a deposit is paid." },
];

export function Cutaway() {
  return (
    <section className="checked" data-progress="enter" aria-labelledby="checked-title">
      <div className="wrap checked-grid">
        <div className="checked-copy">
          <h2 id="checked-title">Every room is checked before you see it.</h2>
          <ol className="checked-list">
            {CHECKS.map((c, i) => (
              <li key={c.title} data-reveal style={{ "--i": i } as React.CSSProperties}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <figure className="checked-frame">
          <Image src={CHECKED_IMAGE.src} alt={CHECKED_IMAGE.alt} fill sizes="(max-width: 900px) 100vw, 60vw" />
        </figure>
      </div>
    </section>
  );
}
