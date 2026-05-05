import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 'sheet' = 從下方滑入（手機友善）；'center' = 置中 */
  variant?: 'sheet' | 'center';
  /** 隱藏右上角的關閉鈕（例如載入中） */
  hideClose?: boolean;
}

/**
 * 通用 modal 容器。
 * - sheet 模式適合手機：底部滑入、最大高度 90vh
 * - center 模式適合彈出小視窗（個股資訊）
 * - 點背景或按 Esc 關閉（hideClose=true 時禁止）
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  variant = 'sheet',
  hideClose = false
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, hideClose, onClose]);

  if (!open) return null;

  const containerClass =
    variant === 'sheet'
      ? 'fixed inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl'
      : 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[85vh] w-[92vw] max-w-md rounded-2xl';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={hideClose ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`${containerClass} bg-white shadow-2xl flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-800">{title}</h2>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center text-xl leading-none"
                aria-label="關閉"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
