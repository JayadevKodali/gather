/**
 * The same page header everywhere (design pass 2.6): an optional back link, the title, a one-line summary,
 * and the page's main action on the right. On small screens the action drops under the title.
 */
import Link from "next/link";

export function PageHeader({ title, summary, back, action, aside }: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  back?: { href: string; label: string };
  /** The page's one main action (a button or link), shown on the right. */
  action?: React.ReactNode;
  /** A status pill or similar, shown next to the action. */
  aside?: React.ReactNode;
}) {
  return (
    <header className="page-shell-head">
      {back && <p className="back-link"><Link href={back.href}><span aria-hidden="true">←</span> {back.label}</Link></p>}
      <div className="page-head">
        <div className="page-head-text">
          <h1>{title}</h1>
          {summary && <p className="page-summary">{summary}</p>}
        </div>
        {(action || aside) && <div className="page-head-actions">{aside}{action}</div>}
      </div>
    </header>
  );
}
