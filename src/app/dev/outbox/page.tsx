import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDemo } from "@/lib/config";
import { getDb } from "@/lib/db";
import { dateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Email outbox (demo)" };

/** Demo mode only: the notifications Gather would have emailed. Not available in connected mode. */
export default async function OutboxPage() {
  if (!isDemo()) notFound();
  const rows = await (await getDb()).query<{ id: string; to_email: string; to_role: string; template: string; subject: string; link: string; status: string; created_at: Date }>(
    "select * from email_outbox order by created_at desc limit 100",
  );
  return (
    <div className="wrap">
      <h1>Email outbox</h1>
      <p className="lead">In demo mode, emails are written here instead of being sent. Each one only links back to Gather; message text never goes in an email.</p>
      <div className="table-scroll" role="region" aria-label="Emails (scrolls sideways on small screens)" tabIndex={0}>
        <table>
          <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Link</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{dateTime(r.created_at)}</td>
                <td className="small">{r.to_email}<br /><span className="tiny">{r.to_role === "owner" ? "venue owner" : "planner"} · {r.template.replace(/_/g, " ")}</span></td>
                <td>{r.subject}</td>
                <td className="small"><a href={new URL(r.link).pathname + new URL(r.link).hash}>{new URL(r.link).pathname}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
