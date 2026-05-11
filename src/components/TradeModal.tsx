import Modal from './Modal';

interface TradeModalProps {
  open: boolean;
  onClose: () => void;
  /** 點下去 → 關 TradeModal 後開既有 BuyModal */
  onBuy: () => void;
  /** 點下去 → 關 TradeModal 後開既有 FeedModal */
  onFeed: () => void;
  /** 點下去 → 關 TradeModal 後開既有 SellModal */
  onSell: () => void;
  /** 沒任何持倉時加碼 / 退役 disabled(跟舊版 BottomBar 行為一致) */
  hasHoldings: boolean;
}

/**
 * 交易彈窗(階段 R.5)。
 *
 * 統一 3 個交易動作的入口。內部按鈕點下去 → 關掉自己 + 觸發既有 Modal。
 * BuyModal / FeedModal / SellModal 內部邏輯完全不動。
 */
export default function TradeModal({
  open,
  onClose,
  onBuy,
  onFeed,
  onSell,
  hasHoldings
}: TradeModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="交易神獸">
      <div className="space-y-3 p-2">
        <TradeButton
          icon="🆕"
          title="召喚新神獸"
          desc="買入新股票,隨機抽 1 隻神獸"
          onClick={onBuy}
        />
        <TradeButton
          icon="🍖"
          title="加碼修煉"
          desc="加碼現有神獸,升等級 / 累積投入"
          onClick={onFeed}
          disabled={!hasHoldings}
        />
        <TradeButton
          icon="📤"
          title="神獸退役"
          desc="賣出持有神獸,進圖鑑變歷史"
          onClick={onSell}
          disabled={!hasHoldings}
        />
      </div>
    </Modal>
  );
}

interface TradeButtonProps {
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
}

function TradeButton({ icon, title, desc, onClick, disabled }: TradeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full item-card px-4 py-3 flex items-center gap-3 text-left ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'active:scale-[0.98] transition-transform cursor-pointer'
      }`}
    >
      <span className="text-3xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-base text-mythic-ink-200">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
      </div>
      <span className="text-mythic-jade-400 text-xl shrink-0">›</span>
    </button>
  );
}
