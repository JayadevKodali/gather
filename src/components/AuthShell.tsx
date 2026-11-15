/**
 * Account pages (design pass 3.18): the form on the left, a venue photo on the right. On small screens
 * the photo becomes a short band above the form. The photo is decoration; the form is the page.
 */
import Image from "next/image";
import { HERO_IMAGES } from "@/lib/venue-images";

const PHOTOS = { dusk: HERO_IMAGES.loomDusk, glasshouse: HERO_IMAGES.glasshouseDaylight } as const;

export function AuthShell({ children, photo = "dusk", wide = false }: { children: React.ReactNode; photo?: keyof typeof PHOTOS; wide?: boolean }) {
  const img = PHOTOS[photo];
  return (
    <div className={`wrap auth-shell ${wide ? "wide" : ""}`}>
      <div className="auth-main">{children}</div>
      <figure className="auth-photo" aria-hidden="true">
        <Image src={img.src} alt="" fill sizes="(max-width: 900px) 100vw, 45vw" priority />
        <figcaption>Independent London venues, checked before they’re listed.</figcaption>
      </figure>
    </div>
  );
}
