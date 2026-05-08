import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 隱藏右上角關閉鈕(loading 時用) */
  hideClose?: boolean;
}

/**
 * 玻璃抽屜 Modal(家園抽屜式):
 *  - 全 5 個彈窗統一從底部 slide-up,固定高度 calc(100vh - 140px)
 *    上方 140px 永遠看得到 HUD + 一截背景,跟手遊「家園」抽屜風格一致
 *  - 結構三層:
 *      .modal-backdrop  外圍 dim + blur 遮罩,點擊關閉
 *      .glass-popup     固定高度抽屜,圓角僅頂部,動畫 slide-up
 *        ├ .glass-popup-header  sticky 標題列,不捲
 *        └ .glass-popup-content  flex-1 + overflow-y-auto 內容捲動
 *  - variant prop 已棄用(留型別免破壞 caller),sheet/center 行為已統一
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
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

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50"
      onClick={hideClose ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popup" onClick={(e) => e.stopPropagation()}>
        {(title || !hideClose) && (
          <div className="glass-popup-header">
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
          </div>
        )}
        <div className="glass-popup-content">{children}</div>
      </div>
    </div>
  );
}
