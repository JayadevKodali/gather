/**
 * London geography for matching. Hand-written and deliberately simple:
 *   - the 33 local authorities (32 boroughs + the City of London)
 *   - which ones share a border (used for "next to your area")
 *   - common neighbourhood names planners use, mapped to their borough
 */

export const BOROUGHS = [
  "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden", "City of London",
  "Croydon", "Ealing", "Enfield", "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey",
  "Harrow", "Havering", "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea",
  "Kingston upon Thames", "Lambeth", "Lewisham", "Merton", "Newham", "Redbridge",
  "Richmond upon Thames", "Southwark", "Sutton", "Tower Hamlets", "Waltham Forest",
  "Wandsworth", "Westminster",
] as const;
export type Borough = (typeof BOROUGHS)[number];
export const isBorough = (value: string): value is Borough => (BOROUGHS as readonly string[]).includes(value);

// Each pair shares a border. Listed once; the lookup below works both ways.
const BORDERS: [Borough, Borough][] = [
  ["City of London", "Westminster"], ["City of London", "Camden"], ["City of London", "Islington"],
  ["City of London", "Hackney"], ["City of London", "Tower Hamlets"], ["City of London", "Southwark"],
  ["Westminster", "Camden"], ["Westminster", "Brent"], ["Westminster", "Kensington and Chelsea"],
  ["Westminster", "Lambeth"], ["Westminster", "Wandsworth"],
  ["Camden", "Islington"], ["Camden", "Haringey"], ["Camden", "Barnet"], ["Camden", "Brent"],
  ["Islington", "Hackney"], ["Islington", "Haringey"],
  ["Hackney", "Tower Hamlets"], ["Hackney", "Newham"], ["Hackney", "Waltham Forest"], ["Hackney", "Haringey"],
  ["Tower Hamlets", "Newham"], ["Tower Hamlets", "Southwark"], ["Tower Hamlets", "Lewisham"],
  ["Tower Hamlets", "Greenwich"],
  ["Southwark", "Lambeth"], ["Southwark", "Lewisham"], ["Southwark", "Bromley"], ["Southwark", "Croydon"],
  ["Lambeth", "Wandsworth"], ["Lambeth", "Croydon"], ["Lambeth", "Merton"],
  ["Lewisham", "Greenwich"], ["Lewisham", "Bromley"],
  ["Greenwich", "Bexley"], ["Greenwich", "Bromley"], ["Greenwich", "Newham"],
  ["Newham", "Waltham Forest"], ["Newham", "Redbridge"], ["Newham", "Barking and Dagenham"],
  ["Waltham Forest", "Haringey"], ["Waltham Forest", "Enfield"], ["Waltham Forest", "Redbridge"],
  ["Haringey", "Enfield"], ["Haringey", "Barnet"],
  ["Kensington and Chelsea", "Brent"], ["Kensington and Chelsea", "Hammersmith and Fulham"],
  ["Kensington and Chelsea", "Wandsworth"],
  ["Hammersmith and Fulham", "Brent"], ["Hammersmith and Fulham", "Ealing"], ["Hammersmith and Fulham", "Hounslow"],
  ["Hammersmith and Fulham", "Richmond upon Thames"], ["Hammersmith and Fulham", "Wandsworth"],
  ["Wandsworth", "Merton"], ["Wandsworth", "Richmond upon Thames"], ["Wandsworth", "Kingston upon Thames"],
  ["Brent", "Ealing"], ["Brent", "Harrow"], ["Brent", "Barnet"],
  ["Ealing", "Hounslow"], ["Ealing", "Harrow"], ["Ealing", "Hillingdon"], ["Ealing", "Richmond upon Thames"],
  ["Hounslow", "Richmond upon Thames"], ["Hounslow", "Hillingdon"],
  ["Richmond upon Thames", "Kingston upon Thames"],
  ["Kingston upon Thames", "Merton"], ["Kingston upon Thames", "Sutton"],
  ["Merton", "Sutton"], ["Merton", "Croydon"], ["Sutton", "Croydon"], ["Croydon", "Bromley"],
  ["Bromley", "Bexley"], ["Bexley", "Havering"], ["Havering", "Redbridge"], ["Havering", "Barking and Dagenham"],
  ["Redbridge", "Barking and Dagenham"], ["Redbridge", "Waltham Forest"],
  ["Barnet", "Enfield"], ["Barnet", "Harrow"], ["Harrow", "Hillingdon"],
];

export function areNeighbours(a: string, b: string): boolean {
  return BORDERS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Words planners use → the borough(s) they mean. Lower-case keys. */
export const AREA_ALIASES: Record<string, Borough[]> = {
  shoreditch: ["Hackney"], hoxton: ["Hackney"], dalston: ["Hackney"], "hackney wick": ["Hackney"],
  "london fields": ["Hackney"], "stoke newington": ["Hackney"], hackney: ["Hackney"],
  "bethnal green": ["Tower Hamlets"], whitechapel: ["Tower Hamlets"], spitalfields: ["Tower Hamlets"],
  "brick lane": ["Tower Hamlets"], "canary wharf": ["Tower Hamlets"], wapping: ["Tower Hamlets"],
  bow: ["Tower Hamlets"], "mile end": ["Tower Hamlets"], limehouse: ["Tower Hamlets"],
  "tower hamlets": ["Tower Hamlets"],
  clerkenwell: ["Islington"], angel: ["Islington"], highbury: ["Islington"], farringdon: ["Islington"],
  islington: ["Islington"],
  "king's cross": ["Camden"], "kings cross": ["Camden"], "camden town": ["Camden"], camden: ["Camden"],
  "kentish town": ["Camden"], fitzrovia: ["Camden"], bloomsbury: ["Camden"], holborn: ["Camden"],
  soho: ["Westminster"], mayfair: ["Westminster"], marylebone: ["Westminster"], "covent garden": ["Westminster"],
  westminster: ["Westminster"], pimlico: ["Westminster"], paddington: ["Westminster"],
  "liverpool street": ["City of London"], barbican: ["City of London"], aldgate: ["City of London"],
  bank: ["City of London"], "the city": ["City of London"], "city of london": ["City of London"],
  bermondsey: ["Southwark"], peckham: ["Southwark"], "london bridge": ["Southwark"], borough: ["Southwark"],
  "elephant and castle": ["Southwark"], southwark: ["Southwark"], "south bank": ["Lambeth"],
  brixton: ["Lambeth"], vauxhall: ["Lambeth"], waterloo: ["Lambeth"], clapham: ["Lambeth"], lambeth: ["Lambeth"],
  deptford: ["Lewisham"], "new cross": ["Lewisham"], lewisham: ["Lewisham"],
  greenwich: ["Greenwich"], woolwich: ["Greenwich"],
  battersea: ["Wandsworth"], wandsworth: ["Wandsworth"], putney: ["Wandsworth"],
  "notting hill": ["Kensington and Chelsea"], chelsea: ["Kensington and Chelsea"],
  kensington: ["Kensington and Chelsea"],
  hammersmith: ["Hammersmith and Fulham"], fulham: ["Hammersmith and Fulham"],
  stratford: ["Newham"], newham: ["Newham"], walthamstow: ["Waltham Forest"],
  tottenham: ["Haringey"], "crouch end": ["Haringey"],
  // North London neighbourhoods reviewers are likely to type (Gather Test Room is in Finsbury Park).
  // A place on a borough line maps to both boroughs.
  "finsbury park": ["Islington", "Haringey"], holloway: ["Islington"], archway: ["Islington"],
  "tufnell park": ["Islington"], "old street": ["Islington", "Hackney"], "hackney central": ["Hackney"],
  "stamford hill": ["Hackney"], "manor house": ["Haringey", "Hackney"], "seven sisters": ["Haringey"],
  "wood green": ["Haringey"], "muswell hill": ["Haringey"], hornsey: ["Haringey"],
  highgate: ["Camden", "Haringey"], hampstead: ["Camden"], kilburn: ["Brent", "Camden"], wembley: ["Brent"],
  // Loose phrases
  central: ["Westminster", "City of London", "Camden"],
  "central london": ["Westminster", "City of London", "Camden"],
  "east london": ["Hackney", "Tower Hamlets", "Newham"],
  "south london": ["Southwark", "Lambeth", "Lewisham"],
  "north london": ["Islington", "Camden", "Haringey"],
  "west london": ["Kensington and Chelsea", "Hammersmith and Fulham", "Ealing"],
};

/** Find the boroughs mentioned in free text. Longest phrases win so "east london" beats "london". */
export function boroughsInText(text: string): { phrase: string; boroughs: Borough[] } | null {
  const lower = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const keys = [...Object.keys(AREA_ALIASES), ...BOROUGHS.map((b) => b.toLowerCase())].sort(
    (a, b) => b.length - a.length,
  );
  for (const key of keys) {
    const pattern = new RegExp(`[^a-z]${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-ish)?[^a-z]`);
    if (pattern.test(lower)) {
      const boroughs = AREA_ALIASES[key] ?? BOROUGHS.filter((b) => b.toLowerCase() === key);
      return { phrase: key, boroughs };
    }
  }
  return null;
}

/** Resolve whatever the planner typed in the Area box. */
export function resolveArea(input: string): Borough[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (isBorough(trimmed)) return [trimmed];
  return boroughsInText(trimmed)?.boroughs ?? [];
}

/** The planner's area words without a leading "near", "around", "in" or "close to", for "near {area}". */
export function plainArea(text: string): string {
  return text.trim().replace(/^(?:(?:near|around|in|close to)\s+)+/i, "").trim();
}

/** True when none of the shortlisted venues is in the brief's area or a borough next to it (display only). */
export function noneNearArea(briefBoroughs: readonly string[], venueBoroughs: readonly string[]): boolean {
  if (briefBoroughs.length === 0 || venueBoroughs.length === 0) return false;
  return !venueBoroughs.some((v) => briefBoroughs.some((b) => b === v || areNeighbours(b, v)));
}
