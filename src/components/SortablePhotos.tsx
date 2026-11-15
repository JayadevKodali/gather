"use client";
/**
 * Drag to reorder an owner's uploaded photos (Phase 4). Grab a photo by its handle and drop it where it
 * should go; the new order is saved as soon as you let go, and the first photo becomes the cover.
 * Works with a mouse, a pen or a finger (pointer events). The arrow buttons on each photo (left / right, or
 * up / down when the photos stack in one column) move a photo one place, from the keyboard and without
 * JavaScript too; after the page comes back, focus returns to the same photo's arrow. The server checks the
 * order is exactly this listing's photos.
 */
import { useEffect, useRef, useState } from "react";

const FOCUS_KEY = "gather:photo-arrow";
import { photoAction } from "@/app/actions/owner";

export function SortablePhotos({ listingId, step, items }: { listingId: string; step?: string; items: { id: string; label: string; content: React.ReactNode }[] }) {
  const initial = items.map((i) => i.id);
  const [order, setOrder] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const orderRef = useRef(order);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const listRef = useRef<HTMLUListElement>(null);

  // Keep keyboard focus on the arrow that was pressed once the page comes back (fix 2).
  useEffect(() => {
    let key: string | null = null;
    try { key = sessionStorage.getItem(FOCUS_KEY); sessionStorage.removeItem(FOCUS_KEY); } catch {}
    if (!key) return;
    const [id] = key.split(":");
    const exact = listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${key}"]`);
    const target = exact && !exact.disabled ? exact : listRef.current?.querySelector<HTMLButtonElement>(`[data-move^="${id}:"]:not(:disabled)`);
    target?.focus();
  }, []);
  const rememberArrow = (e: React.MouseEvent<HTMLUListElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-move]");
    if (btn) try { sessionStorage.setItem(FOCUS_KEY, btn.dataset.move!); } catch {}
  };

  const move = (id: string, overId: string) => {
    if (id === overId) return;
    const next = orderRef.current.filter((x) => x !== id);
    next.splice(orderRef.current.indexOf(overId), 0, id);
    orderRef.current = next;
    setOrder(next);
  };

  const onPointerDown = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (saving || items.length < 2) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(id);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("li[data-photo-id]");
    if (over?.dataset.photoId) move(dragging, over.dataset.photoId);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(null);
    if (orderRef.current.join(",") === initial.join(",")) return;
    if (inputRef.current) inputRef.current.value = orderRef.current.join(",");
    setSaving(true);
    formRef.current?.requestSubmit();
  };

  return (
    <>
      {items.length > 1 && <p className="small muted drag-hint"><span aria-hidden="true">⠿</span> Drag a photo by its handle to reorder, or use the arrows. The first photo is the cover.{saving && <strong className="saving"> Saving the new order…</strong>}</p>}
      <ul ref={listRef} onClick={rememberArrow} className={`photo-grid sortable ${dragging ? "is-dragging" : ""}`} aria-busy={saving || undefined}>
        {order.map((id, n) => {
          const item = byId.get(id)!;
          return (
            <li key={id} className={`photo-item ${dragging === id ? "dragged" : ""}`} data-photo-id={id}>
              {items.length > 1 && (
                <button type="button" className="drag-handle" aria-label={`Drag to reorder ${item.label}`} title="Drag to reorder"
                  onPointerDown={onPointerDown(id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" /><circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" /><circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" /></g></svg>
                </button>
              )}
              <span className="photo-num" aria-hidden="true">{n + 1}</span>
              {item.content}
            </li>
          );
        })}
      </ul>
      <form action={photoAction} ref={formRef} hidden>
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="op" value="reorder" />
        <input type="hidden" name="order" ref={inputRef} defaultValue={initial.join(",")} />
        {step && <input type="hidden" name="step" value={step} />}
      </form>
    </>
  );
}
