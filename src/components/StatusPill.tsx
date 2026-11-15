/**
 * The one status pill (design pass 2.4). Four tones, each with its own small icon and always a word,
 * so colour is never the only signal:
 *   neutral: information (dates not given, test payments, replaced)
 *   green:   done and good (confirmed, paid, live, matched)
 *   amber:   waiting or needs action (balance due, draft, awaiting reply)
 *   red:     stopped (cancelled, declined, failed)
 * Older tone names still work: "grey" means neutral, "brass" means amber.
 */
export type PillTone = "neutral" | "green" | "amber" | "red";
type AnyTone = PillTone | "grey" | "brass";

const NORMAL: Record<AnyTone, PillTone> = { neutral: "neutral", grey: "neutral", green: "green", amber: "amber", brass: "amber", red: "red" };

const ICON: Record<PillTone, React.ReactNode> = {
  neutral: <circle cx="6" cy="6" r="2.6" fill="currentColor" />,
  green: <path d="M2.6 6.3l2.2 2.2 4.6-4.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  amber: <><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M6 3.8V6l1.6 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
  red: <path d="M3.4 3.4l5.2 5.2M8.6 3.4L3.4 8.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
};

export function StatusPill({ tone, children, className = "" }: { tone: AnyTone; children: React.ReactNode; className?: string }) {
  const t = NORMAL[tone] ?? "neutral";
  return (
    <span className={`chip pill ${t} ${className}`.trim()}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">{ICON[t]}</svg>
      {children}
    </span>
  );
}
