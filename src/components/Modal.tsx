import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 'sheet' = 從下方滑入(手機友善);'center' = 置中 */
  variant?: 'sheet' | 'center';
  /** 隱藏右上角的關閉鈕(例如載入中) */
  hideClose?: boolean;
}

/**
 * 通用 Modal 容器(玻璃擬態版,金邊框已退役):
 *  - 外層 .modal-backdrop:0.25 黑 + blur 8px,把後面遊戲畫面糊掉聚焦
 *  - 內層 .glass-popup:rgba(250,246,232,0.35) + blur 24 + 圓角 20 + 1px 金線
 *  - 標題列 .popup-title(18 / 600 / 深綠墨)+ .popup-title-divider 金漸層線
 *  - 關閉鈕 .glass-close-btn 圓形玻璃,跟左上 HUD badge 視覺呼應
 *
 * sheet: 手機友善,從底部 8px 浮起;center: 桌機置中。兩者皆圓角卡片風,
 * 全 app(HUD / BottomBar / Modal)透明度統一 0.35 形成一致玻璃語言。
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
      ? 'fixed left-1/2 -translate-x-1/2 bottom-2 w-[calc(100vw-16px)] max-w-[420px] max-h-[90vh]'
      : 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[420px] max-h-[85vh]';

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50"
      onClick={hideClose ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`${containerClass} glass-popup flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="popup-title font-zh truncate">{title}</h2>
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="glass-close-btn shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xl leading-none text-mythic-jade-500 active:scale-95 transition-transform"
                  aria-label="關閉"
                >
                  ×
                </button>
              )}
            </div>
            <div className="popup-title-divider mt-3" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
      </div>
    </div>
  );
}
