"use client";
/** A plain multipart form (works without JavaScript) whose button shows "Uploading…" and can't be pressed twice. */
import { useState } from "react";

export function UploadForm({ action, children, label, className = "btn", formClassName = "stack" }: { action: string; children: React.ReactNode; label: string; className?: string; formClassName?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} method="post" encType="multipart/form-data" className={formClassName}
      onSubmit={(e) => { if (busy || !e.currentTarget.checkValidity()) { if (busy) e.preventDefault(); return; } setBusy(true); }}>
      {children}
      <div className="actions"><button className={className} type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? "Uploading…" : label}</button></div>
    </form>
  );
}
