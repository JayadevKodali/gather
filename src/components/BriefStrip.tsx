/**
 * The planner's event, pinned under the header on the shortlist, venue and enquiry pages (design pass 2.10):
 * "80 standing · Thu 25 March 2027 · near Shoreditch · up to £6,000". Display only, from the saved brief.
 */
import Link from "next/link";

export function BriefStrip({ summary, editHref, label = "Your event" }: { summary: string; editHref?: string; label?: string }) {
  if (!summary) return null;
  return (
    <div className="brief-strip" role="region" aria-label={label}>
      <div className="wrap brief-strip-inner">
        <span className="brief-strip-label">{label}</span>
        <span className="brief-strip-text">{summary}</span>
        {editHref && <Link href={editHref} className="brief-strip-edit">Edit</Link>}
      </div>
    </div>
  );
}
