import type { Metadata } from "next";
import Link from "next/link";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { EVENT_TYPE_LABELS } from "@/lib/domain";
import { dateTime, shortDate } from "@/lib/format";
import { listBriefs } from "@/lib/services/briefs";
import { createBriefAction } from "../actions/planner";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";
import { BriefBox, BriefSkeleton } from "@/components/BriefBox";

export const metadata: Metadata = { title: "Find a venue" };

const SAMPLE = "I need somewhere near Shoreditch for 80 people standing in late March, under £6,000, with AV.";
const STATUS = { needs_info: ["amber", "Needs a detail"], ready: ["grey", "Ready to search"], searched: ["green", "Searched"] } as const;

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const actor = await requirePageRole("planner");
  const params = await searchParams;
  const briefs = await listBriefs(await getDb(), actor);
  return (
    <div className="wrap split">
      <section>
        <h1>What are you planning?</h1>
        <p className="lead">Write it the way you’d brief a colleague. Include the date, numbers, area, budget and anything you can’t do without.</p>
        <Notices params={params} />
        <form action={createBriefAction} className="panel brief-start">
          <div className="label-row"><label htmlFor="text">Your event</label></div>
          <p className="field-note" id="text-hint">Leave out names, phone numbers and other personal details. AI reads your brief to pick out the details; <Link href="/privacy#ai">see how</Link>.</p>
          <BriefBox defaultValue={params.sample ? SAMPLE : ""} placeholder={`For example: ${SAMPLE}`} />
          <div className="actions mt-m">
            <SubmitButton pendingLabel="Reading your brief…">Read my brief</SubmitButton>
            <Link className="btn quiet" href="/plan?sample=1">Use the sample brief</Link>
          </div>
          <BriefSkeleton />
        </form>
      </section>
      <aside>
        <h2>Your briefs</h2>
        {briefs.length === 0 ? (
          <p className="muted">Nothing yet. Your first brief will appear here so you can come back to its shortlist.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
            {briefs.map((b) => {
              const [tone, label] = STATUS[b.status];
              return (
                <li key={b.id} className="panel" style={{ padding: 16 }}>
                  <div className="spread">
                    <Link href={b.status === "searched" ? `/plan/${b.id}/results` : `/plan/${b.id}`}><strong>{b.confirmed.eventType ? EVENT_TYPE_LABELS[b.confirmed.eventType] : "Event"}{b.confirmed.date ? ` on ${shortDate(b.confirmed.date)}` : ""}</strong></Link>
                    <StatusPill tone={tone as "grey"}>{label}</StatusPill>
                  </div>
                  <p className="small muted mb-0 mt-s">“{b.raw_text.slice(0, 110)}{b.raw_text.length > 110 ? "…" : ""}”</p>
                  <p className="tiny mb-0">Written {dateTime(b.created_at)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
