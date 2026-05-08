import { audio } from '@/services';

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
 *  - 設定原本是底部小文字鈕,合併到主列變第 5 顆,佔用一個 cell
 *  - 設定 icon 暫時用 ⚙️ emoji(future:獨立 PNG 後改 src)
 *  - icon 比舊版小 20%(max-w 80→64)壓低整體高度
 *
 * 對應素材:
 *  - buy.png      綠玉蛋    → 買入神獸
 *  - feed.png     烤肉      → 餵食加碼
 *  - sell.png     寶箱      → 售出神獸
 *  - records.png  卷軸      → 紀錄
 *  - (無 PNG)     ⚙️ emoji → 設定
 */
export default function BottomBar({
  onBuy,
  onFeed,
  onSell,
  onRecords,
  onSettings,
  hasHoldings
}: BottomBarProps) {
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
        />
        <ActionButton emoji="⚙️" onClick={withClick(onSettings)} label="設定" />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  /** PNG 圖示路徑(優先) */
  src?: string;
  /** 沒 PNG 時用 emoji 占位 */
  emoji?: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

function ActionButton({ src, emoji, onClick, label, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-end gap-0.5 py-0.5 ${
        disabled
          ? 'opacity-40 grayscale cursor-not-allowed'
          : 'active:scale-95 transition-transform'
      }`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="w-full max-w-[64px] aspect-square object-contain select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
        />
      ) : (
        <span
          aria-hidden
          className="w-full max-w-[64px] aspect-square flex items-center justify-center text-[42px] leading-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
        >
          {emoji}
        </span>
      )}
      <span className="text-[11px] font-bold tracking-wider text-mythic-ink-200 font-zh">
        {label}
      </span>
    </button>
  );
}
