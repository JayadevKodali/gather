/** The step bar for setting up a new listing (Phase 4): each step links to itself, done steps are ticked. */
import Link from "next/link";
import type { SetupStepKey } from "@/lib/listing-setup";

export function SetupSteps({ steps, current, linkable = true }: { steps: { key: SetupStepKey; label: string; short: string; done: boolean }[]; current: SetupStepKey; linkable?: boolean }) {
  return (
    <nav aria-label="Steps to set up this listing">
      <ol className="setup-steps">
        {steps.map((st, n) => {
          const state = st.key === current ? "now" : st.done ? "done" : "todo";
          const inner = (
            <>
              <span className="setup-dot" aria-hidden="true">{st.done && st.key !== current ? "✓" : n + 1}</span>
              <span className="setup-label"><span className="setup-short">{st.short}</span><span className="sr-only">{st.done ? " (done)" : ""}</span></span>
            </>
          );
          return (
            <li key={st.key} className={`setup-step ${state}`}>
              {linkable
                ? <Link className="setup-link" href={`?step=${st.key}`} aria-current={st.key === current ? "step" : undefined}>{inner}</Link>
                : <span className="setup-link" aria-current={st.key === current ? "step" : undefined}>{inner}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
