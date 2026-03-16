import { useToast, Toast as ToastItem, ToastType } from '../contexts/ToastContext';

const config: Record<ToastType, { bg: string; icon: string; bar: string }> = {
  success: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: '✓', bar: 'bg-emerald-500' },
  error:   { bg: 'bg-red-50 border-red-200 text-red-800',             icon: '✕', bar: 'bg-red-500'     },
  warning: { bg: 'bg-amber-50 border-amber-200 text-amber-800',       icon: '!', bar: 'bg-amber-500'   },
  info:    { bg: 'bg-blue-50 border-blue-200 text-blue-800',          icon: 'i', bar: 'bg-blue-500'    },
};

function ToastItem_({ toast }: { toast: ToastItem }) {
  const { dismiss } = useToast();
  const { bg, icon, bar } = config[toast.type];

  return (
    <div
      className={`relative flex items-start gap-3 w-80 px-4 py-3.5 rounded-xl border shadow-lg
                  overflow-hidden animate-slide-in-right ${bg}`}
    >
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />

      {/* Icon */}
      <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center
                      bg-current/10 text-xs font-bold mt-0.5">
        {icon}
      </div>

      {/* Message */}
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>

      {/* Close */}
      <button
        onClick={() => dismiss(toast.id)}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-lg leading-none"
        aria-label="Kapat"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem_ key={t.id} toast={t} />
      ))}
    </div>
  );
}
