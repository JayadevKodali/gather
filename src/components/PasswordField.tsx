"use client";
/**
 * New-password field: 12+ characters (passphrases welcome), a show/hide toggle, a simple strength hint as you
 * type, and nothing that gets in the way of pasting or password managers. The server checks the same rules
 * plus the common/breached-password lists, so this hint is guidance, not the gatekeeper.
 */
import { useState } from "react";

const MIN = 12;

function strength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  const n = Array.from(pw).length;
  if (n === 0) return { score: 0, label: "" };
  if (n < MIN) return { score: 0, label: `Too short: ${n} of ${MIN} characters` };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9\s]/, /\s/].filter((r) => r.test(pw)).length;
  const repetitive = /(.)\1{3,}/.test(pw) || new Set(pw.toLowerCase()).size < 6;
  if (repetitive) return { score: 1, label: "Weak: too repetitive" };
  if (n >= 20 || (n >= 16 && classes >= 2)) return { score: 3, label: "Strong" };
  if (n >= 14 || classes >= 3) return { score: 2, label: "Good" };
  return { score: 1, label: "OK. Longer is stronger: try a few words" };
}

export function PasswordField({ id = "password", name = "password", label = "Password" }: { id?: string; name?: string; label?: string }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const s = strength(value);
  return (
    <div className="field">
      <div className="label-row"><label htmlFor={id}>{label}</label></div>
      <div className="password-wrap">
        <input id={id} name={name} type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN} maxLength={128}
          spellCheck={false} autoCapitalize="none" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-rules ${id}-strength`} />
        <button type="button" className="btn quiet small password-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-controls={id}>{show ? "Hide" : "Show"}</button>
      </div>
      <p className="field-note mt-s" id={`${id}-rules`}>At least {MIN} characters. Spaces are fine, so a few random words make a good password.</p>
      <div className="strength" aria-live="polite" id={`${id}-strength`}>
        {value && <><span className={`strength-bar s${s.score}`} aria-hidden="true"><span /></span><span className="tiny">{s.label}</span></>}
      </div>
    </div>
  );
}
