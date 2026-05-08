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
 * 通用 modal 容器(神話卡框版)。
 * - sheet 模式適合手機:從底部滑入,top + 兩側顯示金綠雲紋邊框
 * - center 模式適合彈窗:四邊都有金綠雲紋邊框
 * - .ornate-frame class 已在 index.css 定義(9-slice + bg-clip padding-box)
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
      ? 'fixed inset-x-0 bottom-0 max-h-[90vh]'
      : 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[85vh] w-[92vw] max-w-md';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center"
      onClick={hideClose ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`${containerClass} ornate-frame bg-mythic-paper-100 flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-mythic-gold-300/60">
            <h2 className="text-base font-bold text-mythic-ink-200 font-serif tracking-wider">
              {title}
            </h2>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-mythic-jade-50 text-mythic-jade-500 hover:bg-mythic-jade-100 flex items-center justify-center text-xl leading-none border border-mythic-jade-200/50"
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
