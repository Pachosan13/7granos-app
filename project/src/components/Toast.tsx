import { useEffect } from 'react';
import { X } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  timeout?: number;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const toneStyles: Record<ToastTone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  useEffect(() => {
    const timers = toasts
      .filter((toast) => toast.timeout && toast.timeout > 0)
      .map((toast) =>
        window.setTimeout(() => {
          onDismiss(toast.id);
        }, toast.timeout)
      );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-[1200] flex flex-col items-center gap-3 px-4">
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'info';
        return (
          <div
            key={toast.id}
            className={`relative w-full max-w-md overflow-hidden rounded-2xl border shadow-lg transition-all duration-200 ${toneStyles[tone]}`}
            role="status"
            aria-live="assertive"
          >
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="absolute right-3 top-3 rounded-full p-1 text-current hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-current/40"
              aria-label="Cerrar notificación"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="px-5 py-4">
              <p className="text-sm font-semibold leading-tight">{toast.title}</p>
              {toast.description && (
                <p className="mt-2 text-sm leading-relaxed opacity-80">{toast.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function createToast(
  setToasts: (updater: (prev: ToastItem[]) => ToastItem[]) => void,
  toast: Omit<ToastItem, 'id'>
) {
  const id = crypto.randomUUID();
  const nextToast: ToastItem = {
    timeout: 6000,
    tone: 'info',
    ...toast,
    id,
  };
  setToasts((prev) => [...prev, nextToast]);
}

export function dismissToast(
  setToasts: (updater: (prev: ToastItem[]) => ToastItem[]) => void,
  id: string
) {
  setToasts((prev) => prev.filter((item) => item.id !== id));
}
