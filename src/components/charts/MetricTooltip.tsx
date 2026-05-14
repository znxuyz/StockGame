import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface MetricTooltipProps {
  /** 跟錨點按鈕共用的 ref(從外面 ref 進來,讓我們 getBoundingClientRect) */
  anchorRef: React.RefObject<HTMLElement>;
  /** 是否顯示 */
  open: boolean;
  /** 內容(支援多行 \n) */
  content: string;
  /** 關閉(點 tooltip 自身 / 外部 / ESC 都觸發) */
  onClose: () => void;
}

/**
 * 階段 5G:Portal-based metric tooltip。
 *
 *  - createPortal 進 document.body → 不受父容器 overflow 切割
 *  - position: fixed,從 anchor.getBoundingClientRect() 即時算座標
 *  - 邊界偵測:水平 clamp 在視窗內;垂直預設往下,放不下翻到上方
 *  - ESC + 點 tooltip 外部 → 關閉
 *  - 一次只能開一個:用 window CustomEvent 'metric-tooltip:open' 廣播,
 *    其他開啟中的 tooltip 收到自己被超越 → 自關
 *  - 進場淡入 + 微縮放 150ms
 */
export default function MetricTooltip({
  anchorRef,
  open,
  content,
  onClose
}: MetricTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  // open 時生成一個 id,廣播給其他 tooltip 知道誰拿了焦點
  const idRef = useRef<symbol>(Symbol('tooltip'));
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null);
  const [visible, setVisible] = useState(false); // fade-in flag

  // 開啟時:算位置 + 廣播搶焦點
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      setVisible(false);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    const TOOLTIP_W = Math.min(280, vw - MARGIN * 2);
    // 高度未 mount 前估 220;mount 後再 reflow 修正(下方 effect)
    const TOOLTIP_H_EST = 220;

    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(MARGIN, Math.min(vw - TOOLTIP_W - MARGIN, left));

    const spaceBelow = vh - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const placement: 'below' | 'above' =
      spaceBelow >= TOOLTIP_H_EST || spaceBelow >= spaceAbove ? 'below' : 'above';
    const top =
      placement === 'below'
        ? rect.bottom + MARGIN
        : Math.max(MARGIN, rect.top - TOOLTIP_H_EST - MARGIN);

    setPos({ top, left, placement });

    // 廣播:讓其他 tooltip 自關
    const myId = idRef.current;
    window.dispatchEvent(new CustomEvent('metric-tooltip:open', { detail: myId }));
  }, [open, anchorRef]);

  // mount 後 1 frame 開 fade-in + 用實際高度二次校正 top(避免 estimate 偏差)
  useLayoutEffect(() => {
    if (!open || !pos) return;
    const el = tooltipRef.current;
    if (!el) return;
    const actualH = el.offsetHeight;
    const vh = window.innerHeight;
    const MARGIN = 8;
    // 若實際高度比估計大,且原本 placement=below 但下面其實放不下 → 翻上
    if (pos.placement === 'below' && pos.top + actualH > vh - MARGIN) {
      const anchor = anchorRef.current;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const newTop = Math.max(MARGIN, rect.top - actualH - MARGIN);
        setPos({ ...pos, top: newTop, placement: 'above' });
      }
    }
    // 雙 RAF 確保第一張 paint 是 opacity:0,第二張 transition 到 1
    requestAnimationFrame(() => setVisible(true));
  }, [pos?.top, pos?.left, open, anchorRef, pos]);

  // 點外部關閉 + ESC + 收到別的 tooltip 開了就自關
  useEffect(() => {
    if (!open) return;
    const myId = idRef.current;
    function handleDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (tooltipRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function handleOtherOpen(e: Event) {
      const detail = (e as CustomEvent).detail as symbol | undefined;
      if (detail && detail !== myId) onClose();
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown, { passive: true });
    document.addEventListener('keydown', handleKey);
    window.addEventListener('metric-tooltip:open', handleOtherOpen);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('metric-tooltip:open', handleOtherOpen);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: 'min(280px, calc(100vw - 16px))',
        maxWidth: '280px',
        padding: '12px 14px',
        background: 'rgba(33, 33, 33, 0.96)',
        color: '#fff',
        borderRadius: '12px',
        fontSize: '12px',
        lineHeight: 1.6,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        whiteSpace: 'pre-line',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.96)',
        transformOrigin: pos.placement === 'below' ? 'top center' : 'bottom center',
        transition: 'opacity 150ms ease-out, transform 150ms ease-out',
        pointerEvents: 'auto'
      }}
    >
      {content}
    </div>,
    document.body
  );
}
