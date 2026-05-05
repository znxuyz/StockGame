import { useEffect } from 'react';

interface ToastProps {
  message: string | null;
  /** 'info' = 中性、'error' = 紅色 */
  variant?: 'info' | 'error';
  durationMs?: number;
  onDismiss: () => void;
}

export default function Toast({ message, variant = 'info', durationMs = 4000, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;
  const colorClass =
    variant === 'error'
      ? 'bg-red-100 border-red-300 text-red-800'
      : 'bg-emerald-50 border-emerald-300 text-emerald-900';

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-20 z-[60] max-w-[92vw] pointer-events-none">
      <div
        role="status"
        className={`pointer-events-auto px-4 py-2 rounded-lg shadow-lg border text-sm font-medium ${colorClass}`}
        onClick={onDismiss}
      >
        {message}
      </div>
    </div>
  );
}
