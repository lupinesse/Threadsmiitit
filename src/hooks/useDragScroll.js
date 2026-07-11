/**
 * @fileoverview Hook enabling click-and-drag horizontal scrolling with the mouse
 * on an `overflow-x` container.
 *
 * Desktop browsers do not pan overflow containers on a mouse click-drag (only
 * the trackpad, wheel, or a visible scrollbar scroll them), and this app hides
 * its scrollbars — so horizontal rows have no mouse affordance without this.
 * Touch and pen pointers keep their native scrolling; only mouse drags are
 * handled here.
 */

import { useEffect, useRef } from 'react';

/** Pixels of movement before a press is treated as a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * Computes the container `scrollLeft` for an in-progress drag gesture.
 * Dragging the pointer right (currentX &gt; startX) scrolls content left,
 * matching the direct-manipulation feel of grabbing the surface.
 *
 * @param {number} startScrollLeft - `scrollLeft` captured when the drag started.
 * @param {number} startX - Pointer clientX captured when the drag started.
 * @param {number} currentX - Current pointer clientX.
 * @returns {number} The new `scrollLeft` (the DOM clamps it to valid bounds).
 */
export function dragScrollLeft(startScrollLeft, startX, currentX) {
  return startScrollLeft - (currentX - startX);
}

/**
 * Returns true when a horizontal movement is large enough to count as a drag
 * rather than a click.
 *
 * @param {number} dx - Horizontal movement in pixels (may be negative).
 * @param {number} [threshold=DRAG_THRESHOLD_PX] - Minimum absolute movement.
 * @returns {boolean}
 */
export function isDrag(dx, threshold = DRAG_THRESHOLD_PX) {
  return Math.abs(dx) >= threshold;
}

/**
 * Enables mouse click-and-drag horizontal scrolling on an element.
 *
 * Attach the returned ref to a horizontally scrollable (`overflow-x: auto`)
 * container. Mouse users can then grab and drag to scroll; a drag past the
 * threshold suppresses the subsequent `click` so child buttons (e.g. city
 * filter pills) are not accidentally activated when the user was only
 * scrolling. Touch and pen input are left to native scrolling.
 *
 * @returns {object} A React ref to attach to the scroll container.
 */
export function useDragScroll() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    function onPointerDown(e) {
      // Only the mouse needs help — touch and pen scroll natively.
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      // Capture so the drag keeps tracking even if the pointer leaves the row.
      // Pointer capture is a progressive enhancement — if the environment
      // rejects it (e.g. a synthetic pointer id), dragging still works while
      // the pointer stays over the row, so swallow the failure.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture unavailable; continue without it.
      }
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    }

    function onPointerMove(e) {
      if (!dragging) return;
      if (isDrag(e.clientX - startX)) moved = true;
      el.scrollLeft = dragScrollLeft(startScroll, startX, e.clientX);
    }

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = '';
      el.style.userSelect = '';
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }

    // A real drag ends in a click; swallow it (capture phase, before children)
    // so scrolling never toggles a pill. A plain click (no move) passes through.
    function onClickCapture(e) {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return ref;
}
