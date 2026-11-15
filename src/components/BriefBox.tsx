"use client";
/**
 * The brief box on "What are you planning?" (design pass 3.6): a larger box, example briefs as chips that
 * fill it when clicked, and, while the brief is being read (6–10 seconds), a calm outline of the details
 * card so the page isn't frozen. No made-up progress steps: the button already says "Reading your brief…".
 * Field id, name and limits are unchanged.
 */
import { useRef } from "react";
import { useFormStatus } from "react-dom";

const EXAMPLES: [string, string][] = [
  ["Birthday dinner", "Birthday dinner for 24 seated in Clerkenwell on 18 June 2027, around £2,500. Step-free access is essential."],
  ["Team away day", "Team away day for 60 seated near King’s Cross in September 2027, under £5,000. We need a projector and Wi-Fi."],
  ["Wedding party", "Wedding reception for 120, standing and seated, in east London in late summer 2027, about £12,000. A dance floor is a must."],
];

export function BriefBox({ defaultValue, placeholder }: { defaultValue: string; placeholder: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const { pending } = useFormStatus();
  return (
    <>
      <textarea ref={box} id="text" aria-describedby="text-hint" name="text" required minLength={5} maxLength={2000}
        className="brief-box" defaultValue={defaultValue} placeholder={placeholder} readOnly={pending} />
      <div className="example-chips" role="group" aria-label="Example briefs">
        <span className="small muted">Try an example:</span>
        {EXAMPLES.map(([label, text]) => (
          <button key={label} type="button" className="example-chip" disabled={pending}
            onClick={() => { if (box.current) { box.current.value = text; box.current.focus(); } }}>{label}</button>
        ))}
      </div>
    </>
  );
}

/** While the brief is being read: a still outline of the details card that's about to appear. */
export function BriefSkeleton() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div className="details-skeleton" aria-hidden="true">
      <div className="sk sk-title" />
      <div className="sk-grid"><div className="sk" /><div className="sk" /><div className="sk" /><div className="sk" /></div>
      <div className="sk sk-wide" />
    </div>
  );
}
