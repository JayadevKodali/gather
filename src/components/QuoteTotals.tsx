"use client";
/**
 * Live totals for the owner's quote form (design pass 3.11): as lines and the deposit change, shows the
 * total, the deposit and the balance. Display only: the server still calculates the total from the lines
 * when the quote is sent, and checks the deposit.
 */
import { useEffect, useRef, useState } from "react";

const toPence = (v: string) => {
  const n = Number(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? Math.round(n * 100) : 0;
};
const pounds = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function QuoteTotals({ formId }: { formId: string }) {
  const [t, setT] = useState({ total: 0, deposit: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const read = () => {
      let total = 0;
      form.querySelectorAll<HTMLInputElement>('input[name^="amount_"]').forEach((input) => {
        const label = form.querySelector<HTMLInputElement>(`[name="label_${input.name.slice(7)}"]`);
        if (label && label.value.trim()) total += toPence(input.value);
      });
      const deposit = toPence(form.querySelector<HTMLInputElement>('[name="deposit"]')?.value ?? "");
      setT({ total, deposit });
    };
    read();
    form.addEventListener("input", read);
    return () => form.removeEventListener("input", read);
  }, [formId]);
  const balance = Math.max(0, t.total - t.deposit);
  return (
    <div className="quote-totals" ref={ref} aria-live="polite">
      <div><span className="tiny">Total</span><strong className="num">{pounds(t.total)}</strong></div>
      <div><span className="tiny">Deposit</span><strong className="num">{pounds(t.deposit)}</strong></div>
      <div><span className="tiny">Balance later</span><strong className="num">{pounds(balance)}</strong></div>
      {t.deposit > t.total && t.total > 0 && <p className="field-error mb-0">The deposit is more than the total.</p>}
    </div>
  );
}
