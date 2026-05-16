import { useOnline } from '@/lib/useOnline';

/**
 * 離線狀態 banner(階段 4-C)。
 *
 * navigator.onLine === false 時固定在 HUD 下方淡橘色細條,提示玩家
 * 「目前看的是本機快取,寫入動作會排隊等連線」。連回網路自動消失。
 *
 * - 固定位置:`top: var(--hud-height)` 之下、`z-index: 35`(HUD 40 之下,
 *   modal-backdrop 50 之下 — 開彈窗時被後幕蓋住沒關係)
 * - 高度 ~22px,單行不擋主畫面
 * - 文案盡量短:「離線中 · 顯示快取資料 · 寫入會排隊」
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[35] flex items-center justify-center gap-1 px-2 py-1 bg-amber-100/90 text-amber-900 text-[11px] font-zh leading-tight border-b border-amber-300/60 backdrop-blur-sm"
      style={{ top: 'var(--hud-height, 72px)' }}
    >
      <span aria-hidden>📡</span>
      <span>離線中 · 顯示快取資料 · 寫入會排隊待連線</span>
    </div>
  );
}
