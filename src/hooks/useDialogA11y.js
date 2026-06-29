/**
 * @fileoverview Hook that wires accessibility behaviour onto a modal dialog panel:
 * Escape-to-close, Tab/Shift+Tab focus trap, and focus restoration to the
 * triggering element when the dialog closes.
 */

import { useEffect, useRef } from 'react';

/**
 * Returns all keyboard-focusable descendants of `container` in DOM order.
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function focusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]),[href],input:not([disabled]),' +
        'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * Attaches keyboard and focus management to a modal dialog panel:
 * - Moves focus into the panel when it opens; restores focus to the trigger on close.
 * - Traps Tab / Shift+Tab within the panel while open.
 * - Calls `onClose` when the user presses Escape.
 *
 * Attach the returned `panelRef` to the dialog panel element and add
 * `tabIndex={-1}` so the panel itself is focusable as a fallback.
 *
 * @param {object} params
 * @param {boolean} params.open - Whether the dialog is currently visible.
 * @param {Function} params.onClose - Callback invoked to close the dialog.
 * @returns {{ panelRef: import('react').RefObject<HTMLElement> }}
 */
export function useDialogA11y({ open, onClose }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Keep a stable ref to onClose so effects don't re-subscribe on each render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Move focus in on open; restore it on close.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      const panel = panelRef.current;
      if (panel) {
        const first = focusableElements(panel)[0] ?? panel;
        first.focus();
      }
    } else {
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
      triggerRef.current = null;
    }
  }, [open]);

  // Escape + focus trap — only active while open.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const items = focusableElements(panel);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return { panelRef };
}
