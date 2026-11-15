"use client";
/**
 * File input with instant previews and the same limits the server enforces (the server re-checks everything).
 * Without JavaScript it's a normal file input and the server reports any problem.
 */
import { useEffect, useState } from "react";
import { InfoTip } from "./InfoTip";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function PhotoPicker({ inputId, remaining, multiple = true, label }: { inputId: string; remaining: number; multiple?: boolean; label: string }) {
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const total = files.reduce((n, f) => n + f.size, 0);
    let msg: string | null = null;
    if (files.length > remaining) msg = `You can add ${remaining} more photo${remaining === 1 ? "" : "s"}.`;
    else if (files.some((f) => !TYPES.includes(f.type))) msg = "Use JPEG, PNG or WebP photos.";
    else if (total > MAX_BYTES) msg = `These come to ${(total / 1024 / 1024).toFixed(1)} MB. Upload up to 4 MB at a time.`;
    setProblem(msg);
    e.target.setCustomValidity(msg ?? "");
    setPreviews(files.map((f) => ({ url: URL.createObjectURL(f), name: f.name })));
  }

  return (
    <div>
      <div className="label-row"><label htmlFor={inputId}>{label}</label><InfoTip id={`${inputId}-hint`}>JPEG, PNG or WebP, at least 1200 × 800 pixels, up to 4 MB per upload. We crop to 3:2 and remove location data.</InfoTip></div>
      <input id={inputId} name="photos" type="file" accept={TYPES.join(",")} multiple={multiple} required onChange={onChange}
        aria-describedby={`${inputId}-hint${problem ? ` ${inputId}-error` : ""}`} aria-invalid={!!problem} />
      {problem && <p className="field-error" id={`${inputId}-error`} role="alert">{problem}</p>}
      {previews.length > 0 && (
        <ul className="photo-previews" aria-label="Selected photos">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URLs, not optimisable */}
          {previews.map((p) => <li key={p.url}><img src={p.url} alt={`Preview of ${p.name}`} /></li>)}
        </ul>
      )}
    </div>
  );
}
