/**
 * One icon per facility, shared by the shortlist, the venue page and the owner's forms.
 * Simple 20 × 20 line drawings in currentColor; always decorative (the label is next to it).
 */
import type { FacilityCode } from "@/lib/domain";

const P: Record<FacilityCode, string> = {
  stepFree: "M4 16h4v-4h4V8h4M6 6a1.5 1.5 0 1 0 0-.01",
  accessibleToilet: "M9 4.5a1 1 0 1 0 0-.01M9 7v5h4l1.5 4M9 9.5H7.5M6.5 11a4 4 0 1 0 5.5 4",
  babyChanging: "M3 12h14v3H3zM6 12V9.5a2 2 0 1 1 4 0V12M14 9a1.5 1.5 0 1 0 0-.01",
  toilets: "M6 4.5a1 1 0 1 0 0-.01M14 4.5a1 1 0 1 0 0-.01M6 7v9M14 7l-2 5h4l-2-5v9M10 3v14",
  wifi: "M3 8a10 10 0 0 1 14 0M5.5 10.5a6.5 6.5 0 0 1 9 0M8 13a3 3 0 0 1 4 0M10 15.5v.01",
  bar: "M5 4h10l-5 6zM10 10v6M7 16h6",
  catering: "M4 13h12M5 13a5 5 0 0 1 10 0M10 6v2M3 16h14",
  parking: "M5 3h10v14H5zM8.5 14V7h2.5a2 2 0 0 1 0 4H8.5",
  loading: "M2 6h10v8H2zM12 9h3l3 3v2h-6M5 16a1.5 1.5 0 1 0 0-.01M14 16a1.5 1.5 0 1 0 0-.01",
  tables: "M3 8h14M5 8v8M15 8v8M3 8l2-3h10l2 3",
  chairs: "M6 3v14M6 10h8v7M6 10l1-7",
  staging: "M2 12h16v4H2zM5 12V9h10v3",
  danceFloor: "M3 3h14v14H3zM3 10h14M10 3v14M3 3l7 7M10 10l7 7",
  coatCheck: "M10 6a2 2 0 1 1 2 2c-1 .5-2 1-2 2M10 10l-7 5h14z",
  storage: "M3 6l7-3 7 3v9l-7 3-7-3zM3 6l7 3 7-3M10 9v9",
  setup: "M12.5 3a3.5 3.5 0 0 0-3.3 4.7L3 14l3 3 6.3-6.2A3.5 3.5 0 0 0 17 7.5l-2 2-2.5-.5L12 6.5l2-2a3.5 3.5 0 0 0-1.5-1.5",
  av: "M3 4h14v9H3zM7 17h6M10 13v4",
  projector: "M2 7h12v6H2zM14 9l4-2v6l-4-2M6 10a1.5 1.5 0 1 0 0-.01M4 13l-1 3M12 13l1 3",
  microphones: "M8 3h4v8H8zM5 9a5 5 0 0 0 10 0M10 14v3M7 17h6",
  soundSystem: "M5 3h10v14H5zM10 13a2.5 2.5 0 1 0 0-.01M10 6.5v.01",
  videoConferencing: "M2 6h11v8H2zM13 9l5-3v8l-5-3",
  avTechnician: "M6 7a4 4 0 0 1 8 0v3M4 9h2v4H4zM14 9h2v4h-2zM14 13c0 2-2 3-4 3",
};

export function FacilityIcon({ code, className = "" }: { code: FacilityCode; className?: string }) {
  return (
    <svg className={`facility-icon ${className}`} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={P[code]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const FACILITY_ICON_PATHS = P;
