import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/* ============================================================
   Shared UI primitives for the AbyssGPT design system.
   Small, focused building blocks used across every page so
   spacing, radii, focus states and behavior stay consistent.
   ============================================================ */

/** Accessible modal dialog: Escape to close, backdrop click,
 *  focus trap, aria wiring, body scroll lock. */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledById?: string;
}> = ({ open, onClose, title, children, footer }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`).current;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not(.modal-close)'
      );
      (target || panelRef.current)?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="modal-head">
          <h3 className="modal-title" id={titleId}>
            {title}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

/** Accessible switch. Renders a real button with aria-checked. */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}> = ({ checked, onChange, label, danger = false, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`toggle${danger ? ' danger' : ''}`}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  />
);

/** Shimmering skeleton block for loading placeholders. */
export const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} aria-hidden="true" />
);

/** Loading skeleton for the conversation message list. */
export const ChatSkeleton: React.FC = () => (
  <div className="chat-inner" aria-hidden="true">
    <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
      <Skeleton style={{ width: 30, height: 30, borderRadius: 10, flex: '0 0 30px' }} />
      <div style={{ flex: 1 }}>
        <Skeleton className="skeleton-text" style={{ width: 64, marginBottom: 10 }} />
        <Skeleton className="skeleton-text" style={{ width: '78%' }} />
        <Skeleton className="skeleton-text" style={{ width: '92%' }} />
        <Skeleton className="skeleton-text" style={{ width: '55%' }} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12 }}>
      <Skeleton style={{ width: 30, height: 30, borderRadius: 10, flex: '0 0 30px' }} />
      <div style={{ flex: 1 }}>
        <Skeleton className="skeleton-text" style={{ width: 84, marginBottom: 10 }} />
        <Skeleton className="skeleton-text" style={{ width: '88%' }} />
        <Skeleton className="skeleton-text" style={{ width: '64%' }} />
      </div>
    </div>
  </div>
);

/** Inline spinner used inside buttons and small loading areas. */
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg
    className={`spin ${className}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.6" />
    <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/** Compact labelled section used by Settings and Admin pages. */
export const SectionCard: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, action, children, className = '' }) => (
  <section className={`card card-pad space-y-4 ${className}`}>
    <div className="flex items-start justify-between gap-3 border-b border-line pb-3.5">
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    {children}
  </section>
);
