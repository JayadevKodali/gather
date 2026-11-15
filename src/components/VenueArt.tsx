/**
 * An original, synthetic illustration for a venue — no photos of real places.
 * The look is picked from the venue type and a hash of its ID, so each listing is recognisable.
 */
const PALETTES = [
  { wall: "#e9dfcd", floor: "#b98a55", accent: "#175340", glass: "#cfe2d8" },
  { wall: "#dfe6dc", floor: "#8e6b49", accent: "#3a3027", glass: "#d8e6f0" },
  { wall: "#efe4d4", floor: "#6d5643", accent: "#c08a3e", glass: "#d6e4dc" },
  { wall: "#e2e2d8", floor: "#a07b52", accent: "#2e4b40", glass: "#e3ecd9" },
  { wall: "#f1e7da", floor: "#7f5f42", accent: "#8f3f2b", glass: "#dbe7e1" },
];

function hash(text: string) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function VenueArt({ id, type, label }: { id: string; type: string; label: string }) {
  const p = PALETTES[hash(id) % PALETTES.length];
  const t = type.toLowerCase();
  const arch = /arch|chapel|vault|cellar/.test(t);
  const glassy = /glass|rooftop|terrace|atrium|canal|riverside|boat/.test(t);
  const dining = /dining|restaurant|supper|drawing|club/.test(t);
  const seats = /screening|library|conference|meeting/.test(t);
  return (
    <svg className="art" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
      <rect width="240" height="160" fill={p.wall} />
      {arch ? (
        <path d="M30 120 V60 a90 70 0 0 1 180 0 V120 Z" fill={p.glass} stroke={p.accent} strokeWidth="5" />
      ) : glassy ? (
        <g stroke={p.accent} strokeWidth="3" fill={p.glass}>
          <rect x="18" y="22" width="204" height="92" />
          {[52, 86, 120, 154, 188].map((x) => <line key={x} x1={x} y1="22" x2={x} y2="114" />)}
        </g>
      ) : (
        <g fill={p.glass} stroke={p.accent} strokeWidth="3">
          {[24, 92, 160].map((x) => (
            <g key={x}>
              <rect x={x} y="24" width="56" height="70" />
              <line x1={x + 28} y1="24" x2={x + 28} y2="94" />
              <line x1={x} y1="59" x2={x + 56} y2="59" />
            </g>
          ))}
        </g>
      )}
      <path d="M0 116 H240 V160 H0 Z" fill={p.floor} />
      <g fill="#fbf8f1" opacity="0.95">
        {dining ? (
          <rect x="50" y="122" width="140" height="12" rx="6" />
        ) : seats ? (
          [40, 70, 100, 130, 160, 190].map((x) => <rect key={x} x={x} y="128" width="16" height="10" rx="3" fill={p.accent} />)
        ) : (
          [60, 120, 180].map((x) => <ellipse key={x} cx={x} cy="134" rx="18" ry="6" />)
        )}
      </g>
      <g fill="#ffe1a8">
        {[20, 50, 80, 110, 140, 170, 200, 228].map((x, i) => <circle key={x} cx={x} cy={10 + (i % 2) * 5} r="2.4" />)}
      </g>
    </svg>
  );
}
