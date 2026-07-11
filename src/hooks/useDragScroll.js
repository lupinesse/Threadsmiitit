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

import { useCallback, useRef } from 'react';

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
 * Returns a **callback ref** to attach to a horizontally scrollable
 * (`overflow-x: auto`) container. Using a callback ref (rather than a plain
 * ref + effect) means the listeners re-attach correctly if the element is
 * conditionally rendered and later remounts. Mouse users can grab and drag to
 * scroll; a drag past the threshold suppresses the trailing `click` so child
 * buttons (e.g. city filter pills) are not activated when the user was only
 * scrolling. Touch and pen input are left to native scrolling.
 *
 * @returns {Function} A React callback ref to attach to the scroll container.
 */
export function useDragScroll() {
  // Holds the teardown for the currently-attached node so we can detach when
  // the element changes or unmounts.
  const cleanupRef = useRef(null);

  return useCallback((el) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    let dragging = false;
    let moved = false;
    let suppressClick = false;
    let startX = 0;
    let startScroll = 0;

    function onPointerDown(e) {
      // Only the mouse needs help — touch and pen scroll natively.
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      moved = false;
      suppressClick = false;
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
      if (moved) {
        // A real drag ends in a click; arm a one-shot to swallow it so scrolling
        // never toggles a pill. If no click follows (pointer released
        // off-target), clear the flag on the next task so a later keyboard
        // activation of a child button is not suppressed.
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
      moved = false;
    }

    function onClickCapture(e) {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('click', onClickCapture, true);

    cleanupRef.current = () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);
}
