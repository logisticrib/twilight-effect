import type { WheelEvent } from 'react';

/**
 * Shared handle to the Play preview-pane's rules textbox so that wheel-scrolling
 * while hovering a *source* card (board / hand / CZ / loadout) scrolls the preview
 * without moving the mouse onto it. The PreviewPane registers its textbox element
 * here; source cards forward their wheel events through `handlePreviewWheel`.
 *
 * Source cards' own textboxes are clipped (not scrollable), so forwarding the wheel
 * never double-scrolls; the preview itself still scrolls natively on direct hover.
 */
export const previewScrollRef = { current: null as HTMLDivElement | null };

/** Wheel handler for source cards: scroll the live preview's rules text, if any. */
export function handlePreviewWheel(e: WheelEvent) {
  const el = previewScrollRef.current;
  if (!el || el.scrollHeight <= el.clientHeight) return; // nothing to scroll
  el.scrollTop += e.deltaY;
  e.stopPropagation();
}
