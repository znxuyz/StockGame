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
 * 底部 4 顆神話按鈕(+ 設定齒輪)。
 * 每顆按鈕本身就是 256×256 去背 PNG,鎖框由 PNG 的金色邊框提供。
 *
 * 對應素材:
 *  - buy.png      綠玉蛋    → 買入神獸
 *  - feed.png     烤肉      → 餵食加碼
 *  - sell.png     寶箱      → 售出神獸
 *  - records.png  卷軸      → 紀錄
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
    <div className="bg-mythic-paper-100 border-t-2 border-mythic-gold-300/70 shadow-[0_-4px_12px_rgba(33,78,61,0.12)]">
      <div className="grid grid-cols-4 gap-1 px-2 pt-2 pb-1">
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
      </div>
      <button
        type="button"
        onClick={withClick(onSettings)}
        className="w-full text-[11px] text-mythic-jade-400 py-1 hover:text-mythic-jade-500 font-zh"
      >
        ⚙ 設定
      </button>
    </div>
  );
}

interface ActionButtonProps {
  src: string;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

function ActionButton({ src, onClick, label, disabled }: ActionButtonProps) {
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
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="w-full max-w-[80px] aspect-square object-contain select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
      />
      <span className="text-[11px] font-bold tracking-wider text-mythic-ink-200 font-zh">
        {label}
      </span>
    </button>
  );
}
