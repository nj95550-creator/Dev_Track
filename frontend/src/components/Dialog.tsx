/**
 * Reusable native modal shell for forms and confirmations. Opening focuses
 * the first field and locks page scrolling; cleanup restores the previous focus
 * and overflow state. Busy dialogs keep Escape from interrupting a save.
 */
import { useEffect, useRef, type ReactNode } from 'react';
/**
 * Show children in a labeled native modal, preserving focus and page-scroll
 * state across its lifetime; a busy parent can prevent Escape dismissal.
 */
export function Dialog({
  children,
  labelId,
  onClose,
  busy = false,
  className = '',
}: {
  children: ReactNode;
  labelId: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // showModal gives the dialog native modal behavior. Save/restore focus and
  // body overflow here so every form shares the same open/close lifecycle.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>('input,textarea,select')?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      aria-busy={busy}
      className={`form-dialog ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
