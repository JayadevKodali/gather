"use client";
/**
 * Every form button that does real work uses this. While the server is working it shows what's happening
 * ("Reading your brief…"), shows a small spinner and is disabled, so a slow step never looks broken and a
 * second click can't submit twice. In a form with several buttons, only the one that was pressed changes its label.
 */
import { useFormStatus } from "react-dom";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string };

export function SubmitButton({ children, pendingLabel, className = "btn", disabled, name, value, ...rest }: Props) {
  const { pending, data } = useFormStatus();
  const mine = pending && (!name || data?.get(name) === String(value ?? ""));
  return (
    <button {...rest} type="submit" name={name} value={value} className={className} disabled={disabled || pending} aria-busy={mine || undefined}>
      {mine && pendingLabel ? pendingLabel : children}
    </button>
  );
}
