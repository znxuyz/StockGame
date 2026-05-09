import { useLiveQuery } from 'dexie-react-hooks';
import { audio } from '@/services';
import { db } from '@/db';

interface BottomBarProps {
  onBuy: () => void;
  onFeed: () => void;
  onSell: () => void;
  onRecords: () => void;
  onSettings: () => void;
  /** 沒任何持倉時，加碼/賣出禁用 */
  hasHoldings: boolean;
}

/** 點按鈕先響 click 再執行原 handler */
function withClick(fn: () => void) {
  return () => {
    audio.playClick();
    fn();
  };
}

/**
 * 底部玻璃擬態功能列(5 顆等寬按鈕):
 *  - 容器套 .hud-bottom(rgba 0.35 + blur 20 + saturate 140 + 上緣金線)
 *  - 5 個按鈕等寬 grid-cols-5,順序:買入 / 餵食 / 售出 / 紀錄 / 設定
 *  - 5 顆都是 PNG(去背處理過 by scripts/process-ui-assets.mjs),
 *    視覺風格、hover、active:scale 完全一致
 *
 * 對應素材:
 *  - buy.png      綠玉蛋    → 買入神獸
 *  - feed.png     烤肉      → 餵食加碼
 *  - sell.png     寶箱      → 售出神獸
 *  - records.png  卷軸      → 紀錄
 *  - settings.png 粉紅寶石  → 設定
 */
export default function BottomBar({
  onBuy,
  onFeed,
  onSell,
  onRecords,
  onSettings,
  hasHoldings
}: BottomBarProps) {
  // 階段 3.7:可領任務數(completed && !claimed)→ 紀錄按鈕紅點
  // Dexie 不索引 boolean,直接 toArray + memory filter(任務數量小,效能不擔心)
  const claimableTaskCount =
    useLiveQuery(
      async () => {
        const tasks = await db.userTasks.toArray();
        return tasks.filter((t) => t.completed && !t.claimed).length;
      },
      [],
      0
    ) ?? 0;

  return (
    <div className="hud-bottom">
      <div className="grid grid-cols-5 gap-0.5">
        <ActionButton
          src="/assets/btn/buy.png"
          onClick={withClick(onBuy)}
          label="買入神獸"
        />
        <ActionButton
          src="/assets/btn/feed.png"
          onClick={withClick(onFeed)}
          label="餵食加碼"
          disabled={!hasHoldings}
        />
        <ActionButton
          src="/assets/btn/sell.png"
          onClick={withClick(onSell)}
          label="售出神獸"
          disabled={!hasHoldings}
        />
        <ActionButton
          src="/assets/btn/records.png"
          onClick={withClick(onRecords)}
          label="紀錄"
          badge={claimableTaskCount > 0 ? claimableTaskCount : undefined}
        />
        <ActionButton
          src="/assets/btn/settings.png"
          onClick={withClick(onSettings)}
          label="設定"
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  /** PNG 圖示路徑 */
  src: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /** 右上角紅色 badge 數字(階段 3.7,紀錄按鈕用) */
  badge?: number;
}

function ActionButton({ src, onClick, label, disabled, badge }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-end gap-0.5 py-0.5 ${
        disabled
          ? 'opacity-40 grayscale cursor-not-allowed'
          : 'active:scale-95 transition-transform'
      }`}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="w-full max-w-[64px] aspect-square object-contain select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
      />
      <span className="text-[11px] font-bold tracking-wider text-mythic-ink-200 font-zh">
        {label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute top-0 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow"
          aria-label={`${badge} 項可領取`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
