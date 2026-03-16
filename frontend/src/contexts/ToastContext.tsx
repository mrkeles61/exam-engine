import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  dismiss: (id: string) => void;
  toast:   (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error:   (message: string) => void;
  warning: (message: string) => void;
  info:    (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const success = useCallback((m: string) => toast(m, 'success'), [toast]);
  const error   = useCallback((m: string) => toast(m, 'error'),   [toast]);
  const warning = useCallback((m: string) => toast(m, 'warning'), [toast]);
  const info    = useCallback((m: string) => toast(m, 'info'),    [toast]);

  return (
    <ToastContext.Provider value={{ toasts, dismiss, toast, success, error, warning, info }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
