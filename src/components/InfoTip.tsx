/**
 * A small "i" next to a field name. Its extra info (examples, rules, what we read) fades in while the
 * pointer is on the "i" and fades out when it leaves. Keyboard users get it on focus; on touch screens a
 * tap shows it until you tap elsewhere. The text stays in the page (role="tooltip") and the field points to
 * it with aria-describedby, so screen readers always hear it. The button is just "More info" (the field
 * name is right next to it), so it never competes with the field's own label. No JavaScript needed.
 */
export function InfoTip({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span className="info">
      <button type="button" className="info-btn" aria-label="More info" aria-describedby={id}>
        <span aria-hidden="true">i</span>
      </button>
      <span role="tooltip" id={id} className="info-tip">{children}</span>
    </span>
  );
}
