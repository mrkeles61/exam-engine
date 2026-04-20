import { useEffect, useRef } from 'react';
import { useLang } from '../i18n';

type Variant = 'warning' | 'danger' | 'info';

interface Props {
  open: boolean;
  variant?: Variant;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra list rendered as a bullet list inside the message block. */
  details?: string[];
}

const VARIANT_CONFIG: Record<Variant, { icon: string; iconBg: string; iconColor: string; btnCls: string }> = {
  warning: {
    icon: 'warning',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    btnCls: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm',
  },
  danger: {
    icon: 'error',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    btnCls: 'btn-danger',
  },
  info: {
    icon: 'info',
    iconBg: 'bg-primary-100',
    iconColor: 'text-primary-600',
    btnCls: 'btn-primary',
  },
};

/**
 * Reusable confirmation modal matching the existing design system.
 * Handles:
 *   - ESC to cancel / Enter to confirm
 *   - Focus trap on the confirm button when opened
 *   - Backdrop click = cancel
 */
export function ConfirmModal({
  open,
  variant = 'warning',
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  details,
}: Props) {
  const { t } = useLang();
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cfg = VARIANT_CONFIG[variant];
  const resolvedConfirmLabel = confirmLabel ?? t('modal.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => confirmRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); e.preventDefault(); }
      else if (e.key === 'Enter' && !e.shiftKey) { onConfirm(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="modal-panel max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl ${cfg.iconBg} flex items-center
                           justify-center shrink-0`}>
            <span className={`material-symbols-outlined text-2xl ${cfg.iconColor}`}>
              {cfg.icon}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="confirm-modal-title"
              className="font-bold text-gray-900 font-jakarta text-base"
            >
              {title}
            </h3>
            <div className="text-sm text-gray-600 leading-relaxed mt-1.5">
              {message}
            </div>
            {details && details.length > 0 && (
              <ul className="mt-3 space-y-1 bg-amber-50/60 border border-amber-100
                             rounded-lg px-3 py-2">
                {details.map((d, i) => (
                  <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <button onClick={onCancel} className="btn-secondary btn-sm" type="button">
            {resolvedCancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`btn btn-sm ${cfg.btnCls}`}
            type="button"
          >
            {resolvedConfirmLabel}
          </button>
        </div>

        <p className="mt-3 text-[10px] text-gray-400 text-center">
          <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">Esc</kbd> {t('modal.escCancel')}
          · <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">Enter</kbd> {t('modal.enterConfirm')}
        </p>
      </div>
    </div>
  );
}
