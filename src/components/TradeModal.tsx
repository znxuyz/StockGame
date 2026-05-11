import Modal from './Modal';

interface TradeModalProps {
  open: boolean;
  onClose: () => void;
  /** 階段 R.5 才會 wire — 點下去開既有 BuyModal */
  onBuy?: () => void;
  /** 階段 R.5 才會 wire — 點下去開既有 FeedModal */
  onFeed?: () => void;
  /** 階段 R.5 才會 wire — 點下去開既有 SellModal */
  onSell?: () => void;
}

/**
 * 交易彈窗(階段 R 重組,骨架)。
 *
 * 整合 3 個既有動作的統一入口:
 *  - 🆕 召喚新神獸 → BuyModal
 *  - 🍖 加碼修煉  → FeedModal
 *  - 📤 神獸退役  → SellModal
 *
 * 階段 R.1 先 placeholder;R.5 wire 三個按鈕 onClick 觸發對應 Modal。
 * BuyModal / FeedModal / SellModal 內部邏輯完全不動,只是入口統一。
 */
export default function TradeModal({ open, onClose }: TradeModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="交易神獸">
      <div className="space-y-4 p-2 text-center text-sm text-gray-600">
        <div className="text-4xl">🔄</div>
        <p className="font-bold">交易彈窗骨架</p>
        <p className="text-xs">階段 R.5 將整合 3 個動作:</p>
        <ul className="text-xs space-y-1 text-gray-500">
          <li>🆕 召喚新神獸(BuyModal)</li>
          <li>🍖 加碼修煉(FeedModal)</li>
          <li>📤 神獸退役(SellModal)</li>
        </ul>
      </div>
    </Modal>
  );
}
