"use client";
/**
 * All homepage/results motion in one place. Native scrolling throughout — this only READS the
 * scroll position and sets CSS variables; the CSS does the moving.
 *
 *   [data-reveal]               gets .is-in when it scrolls into view (image mask + rise, staggered by --i)
 *   [data-progress="leave"]     --p goes 0 → 1 as the element scrolls up out of view (hero push and fade)
 *   [data-progress="through"]   --p goes 0 → 1 while a tall pinned section scrolls past
 *   [data-progress="enter"]     --p goes 0 → 1 as the element scrolls in (top from the bottom of the screen to 40% up)
 *   [data-pointer]              --mx / --my in -1…1 follow the pointer over it (desktop), 0 on touch
 *
 * With "reduce motion" on, none of this runs: html never gets .motion-ok, so everything renders static
 * and fully visible. Text and buttons are never hidden by motion — only images are revealed.
 */
import { useEffect } from "react";

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("motion-ok")) return; // reduced motion (set before paint in layout)

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            reveal.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));

    const tracked = Array.from(document.querySelectorAll<HTMLElement>("[data-progress]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const el of tracked) {
        const r = el.getBoundingClientRect();
        // "leave" measures the element's container: a sticky element reports its stuck position,
        // so its own top never changes while it's pinned. (The hero is the first thing in .home.)
        const mode = el.dataset.progress;
        const p = mode === "leave"
          ? clamp(-(el.parentElement ?? el).getBoundingClientRect().top / el.offsetHeight)
          : mode === "enter"
            ? clamp((vh - r.top) / (vh * 0.6))
            : clamp(-r.top / Math.max(1, r.height - vh));
        el.style.setProperty("--p", p.toFixed(4));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const pointerTargets = Array.from(document.querySelectorAll<HTMLElement>("[data-pointer]"));
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onPointer = (event: PointerEvent) => {
      for (const el of pointerTargets) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", (((event.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty("--my", (((event.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      }
    };
    if (finePointer && pointerTargets.length) window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      reveal.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointer);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

/** Runs before first paint (inline in <head>): decides whether motion is welcome. */
export const MOTION_BOOT_SCRIPT =
  "try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('motion-ok')}}catch(e){}";
