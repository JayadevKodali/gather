/** Fixed vocabularies shared by the UI, the matcher, the database and the fixtures. */

export const LAYOUTS = ["standing", "seated", "mixed"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_LABELS: Record<Layout, string> = {
  standing: "Standing",
  seated: "Seated",
  mixed: "Mixed (standing and seated)",
};

export const EVENT_TYPES = ["birthday", "wedding", "town_hall", "corporate", "private", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  birthday: "Birthday",
  wedding: "Wedding",
  town_hall: "Corporate town hall",
  corporate: "Corporate event",
  private: "Private party",
  other: "Other event",
};

export const PRICING_MODELS = ["hire_fee", "min_spend", "per_head"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];
export const PRICING_LABELS: Record<PricingModel, string> = {
  hire_fee: "Hire fee",
  min_spend: "Minimum spend",
  per_head: "Per head",
};

/** Facility codes match the approved prototype. */
export const FACILITY_GROUPS = [
  {
    name: "Accessibility",
    items: [
      ["stepFree", "Step-free access to the event space"],
      ["accessibleToilet", "Wheelchair-accessible toilet"],
      ["babyChanging", "Baby-changing facilities"],
    ],
  },
  {
    name: "General amenities",
    items: [
      ["toilets", "Guest toilets"],
      ["wifi", "Guest Wi-Fi"],
      ["bar", "Bar service"],
      ["catering", "Catering or kitchen access"],
      ["parking", "Parking"],
      ["loading", "Loading access"],
    ],
  },
  {
    name: "Furniture and setup",
    items: [
      ["tables", "Tables"],
      ["chairs", "Chairs"],
      ["staging", "Staging"],
      ["danceFloor", "Dance floor"],
      ["coatCheck", "Coat check"],
      ["storage", "Storage"],
      ["setup", "Setup assistance"],
    ],
  },
  {
    name: "Event technology",
    items: [
      ["av", "Audio-visual equipment (AV)"],
      ["projector", "Projector and screen"],
      ["microphones", "Microphones"],
      ["soundSystem", "Sound system"],
      ["videoConferencing", "Video conferencing"],
      ["avTechnician", "On-site AV technician"],
    ],
  },
] as const;

export type FacilityCode = (typeof FACILITY_GROUPS)[number]["items"][number][0];
export const FACILITY_CODES = FACILITY_GROUPS.flatMap((group) => group.items.map(([code]) => code)) as FacilityCode[];
export const FACILITY_LABELS = Object.fromEntries(
  FACILITY_GROUPS.flatMap((group) => group.items.map(([code, label]) => [code, label])),
) as Record<FacilityCode, string>;
/** Short names for sentences and chips ("with the AV you requested"). */
export const FACILITY_SHORT: Record<FacilityCode, string> = {
  stepFree: "step-free access", accessibleToilet: "accessible toilet", babyChanging: "baby changing",
  toilets: "guest toilets", wifi: "Wi-Fi", bar: "bar", catering: "catering", parking: "parking", loading: "loading access",
  tables: "tables", chairs: "chairs", staging: "staging", danceFloor: "dance floor", coatCheck: "coat check",
  storage: "storage", setup: "setup help", av: "AV", projector: "projector", microphones: "microphones",
  soundSystem: "sound system", videoConferencing: "video conferencing", avTechnician: "AV technician",
};
export const ACCESSIBILITY_CODES: FacilityCode[] = ["stepFree", "accessibleToilet", "babyChanging"];

export const isFacilityCode = (value: string): value is FacilityCode =>
  (FACILITY_CODES as string[]).includes(value);

export const AV_HELP =
  "General AV means the venue can provide basic sound and display equipment. If you need something specific, choose a projector, microphones or a sound system instead.";

export type FacilityState = "yes" | "no" | "unknown";
export const FACILITY_STATE_LABELS: Record<FacilityState, string> = {
  yes: "Available",
  no: "Unavailable",
  unknown: "Not confirmed",
};
export type FacilityCharge = "included" | "priced" | "to_confirm";
export type Preference = "essential" | "preferred";

export interface VenueFacility {
  state: FacilityState;
  charge: FacilityCharge;
  pricePence: number | null;
  note?: string;
}

/** Facilities that a minimum-spend venue covers within the spend (so we don't double-count). */
export const COVERED_BY_MIN_SPEND: FacilityCode[] = ["bar", "catering"];
