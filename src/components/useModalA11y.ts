import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

export interface UseModalA11yOptions {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: { readonly current: HTMLElement | null };
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.tabIndex < 0 || el.matches(':disabled') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return el.getClientRects().length > 0;
  });
}

/** Shared dialog accessibility: initial focus, focus restoration, Tab trap, Escape, and drag-safe backdrop close. */
export function useModalA11y({ open, onClose, initialFocusRef }: UseModalA11yOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const backdropMouseDownRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        backdropMouseDownRef.current = false;
        const prev = previousFocusRef.current;
        previousFocusRef.current = null;
        if (prev && prev.isConnected) {
          prev.focus({ preventScroll: true });
        }
      }
      return;
    }

    if (!wasOpenRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      wasOpenRef.current = true;
    }
    backdropMouseDownRef.current = false;

    const rafId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.contains(document.activeElement) && document.activeElement !== dialog) {
        return;
      }
      const preferred = initialFocusRef?.current;
      if (preferred && dialog.contains(preferred) && !preferred.matches(':disabled')) {
        preferred.focus();
        return;
      }
      const focusables = getFocusableElements(dialog);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        dialog.focus();
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [open, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = getFocusableElements(dialog);
      if (focusables.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === dialog || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const backdropProps = {
    onMouseDown: (e: ReactMouseEvent<HTMLElement>) => {
      backdropMouseDownRef.current = e.target === e.currentTarget;
    },
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const shouldClose = backdropMouseDownRef.current && e.target === e.currentTarget;
      backdropMouseDownRef.current = false;
      if (shouldClose) {
        onCloseRef.current();
      }
    },
  };

  return { dialogRef, backdropProps };
}
