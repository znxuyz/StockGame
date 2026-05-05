interface BottomBarProps {
  onBuy: () => void;
  onFeed: () => void;
  onSell: () => void;
  onRecords: () => void;
  onSettings: () => void;
  /** 沒任何持倉時，加碼/賣出禁用 */
  hasHoldings: boolean;
}

/**
 * 底部 4 大按鈕（+ 設定齒輪）。
 * 顏色語意：
 *  - 買入：綠（看到綠色就是進場、希望）
 *  - 加碼：橘黃（餵食的暖色）
 *  - 賣出：紅（出場、警戒）
 *  - 紀錄：藏青（資料、回顧）
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
    <div className="bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-4 gap-1 p-2">
        <ActionButton color="bg-emerald-500" onClick={onBuy} icon="🥚" label="買入神獸" />
        <ActionButton
          color="bg-amber-500"
          onClick={onFeed}
          icon="🍖"
          label="餵食加碼"
          disabled={!hasHoldings}
        />
        <ActionButton
          color="bg-rose-500"
          onClick={onSell}
          icon="📦"
          label="售出神獸"
          disabled={!hasHoldings}
        />
        <ActionButton color="bg-slate-600" onClick={onRecords} icon="📜" label="紀錄" />
      </div>
      <button
        type="button"
        onClick={onSettings}
        className="w-full text-xs text-gray-400 py-1 hover:bg-gray-50"
      >
        ⚙ 設定
      </button>
    </div>
  );
}

interface ActionButtonProps {
  color: string;
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
}

function ActionButton({ color, onClick, icon, label, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${color} ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'} text-white rounded-lg py-2.5 flex flex-col items-center justify-center gap-0.5 shadow transition-transform`}
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-wider">{label}</span>
    </button>
  );
}
