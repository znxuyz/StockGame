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
 * 交易彈窗(階段 R.5 + icon 修正)。
 *
 * 統一 3 個交易動作的入口。內部按鈕點下去 → 關掉自己 + 觸發既有 Modal。
 * BuyModal / FeedModal / SellModal 內部邏輯完全不動。
 *
 * Icon 用既有 PNG(階段 R.6 從 BottomBar 撤掉那 3 顆 PNG 沒被刪,
 * 改成在這個彈窗內復活):
 *   buy.png   綠水晶  → 召喚新神獸
 *   feed.png  火餐包  → 加碼修煉
 *   sell.png  紅寶箱  → 神獸退役
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
          src="/assets/btn/buy.png"
          title="召喚新神獸"
          desc="買入新股票,隨機抽 1 隻神獸"
          onClick={onBuy}
        />
        <TradeButton
          src="/assets/btn/feed.png"
          title="加碼修煉"
          desc="加碼現有神獸,升等級 / 累積投入"
          onClick={onFeed}
          disabled={!hasHoldings}
        />
        <TradeButton
          src="/assets/btn/sell.png"
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
  src: string;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
}

function TradeButton({ src, title, desc, onClick, disabled }: TradeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full item-card px-4 py-3 flex items-center gap-3 text-left ${
        disabled
          ? 'opacity-40 grayscale cursor-not-allowed'
          : 'active:scale-[0.98] transition-transform cursor-pointer'
      }`}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="w-14 h-14 object-contain shrink-0 select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
      />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-base text-mythic-ink-200">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
      </div>
      <span className="text-mythic-jade-400 text-xl shrink-0">›</span>
    </button>
  );
}
