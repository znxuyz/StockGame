import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import HoldingPicker from './HoldingPicker';
import { db } from '@/db';
import { buyOrFeed } from '@/services';
import { calcFee, formatInt, formatPrice, type FeeConfig } from '@/utils';
import type { Settings } from '@/types';

interface FeedModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete: (message: string) => void;
}

/**
 * 加碼彈窗 — 對應「餵食加碼」按鈕。
 * 從持倉清單選一檔，輸入股數 + 成本價，計算新的平均成本後寫入。
 */
export default function FeedModal({ open, onClose, settings, onActionComplete }: FeedModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holding = useLiveQuery(async () => (code ? db.holdings.get(code) : undefined), [code]);
  const stock = useLiveQuery(async () => (code ? db.stocks.get(code) : undefined), [code]);

  function reset() {
    setCode(null);
    setShares('');
    setPrice('');
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!holding || !stock || !shares || !price) return;
    const sharesNum = Number(shares);
    const priceNum = Number(price);
    if (sharesNum <= 0 || priceNum <= 0) {
      setError('股數與價格都要大於 0');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const feeConfig: FeeConfig = {
        discount: settings.brokerageFeeDiscount,
        minFee: settings.brokerageMinFee
      };
      await buyOrFeed({
        stock,
        shares: sharesNum,
        price: priceNum,
        feeConfig,
        now: Date.now()
      });
      onActionComplete(`🍖 ${stock.name} 加碼 ${sharesNum} 股 @ ${priceNum}`);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 試算
  const sharesNum = Number(shares) || 0;
  const priceNum = Number(price) || 0;
  const grossAmount = Math.round(sharesNum * priceNum);
  const fee =
    grossAmount > 0
      ? calcFee(grossAmount, {
          discount: settings.brokerageFeeDiscount,
          minFee: settings.brokerageMinFee
        })
      : 0;
  const netAmount = grossAmount + fee;
  const newTotalCost = (holding?.totalCost ?? 0) + netAmount;
  const newShares = (holding?.shares ?? 0) + sharesNum;
  const newAvgCost = newShares > 0 ? newTotalCost / newShares : 0;

  return (
    <Modal open={open} onClose={handleClose} title="餵食加碼">
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">選擇神獸</label>
          <HoldingPicker
            value={code}
            onChange={setCode}
            emptyMessage="目前沒有持倉，先去買入第一檔吧"
          />
        </div>

        {holding && stock && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">加碼股數</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="1000"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-base"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">每股成本</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="100.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-base"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="bg-sand-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">原均價</span>
                <span>{formatPrice(holding.avgCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">原持有</span>
                <span>{holding.shares} 股</span>
              </div>
              {grossAmount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">加碼成交金額</span>
                    <span>NT$ {formatInt(grossAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">手續費</span>
                    <span>NT$ {formatInt(fee)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 border-gray-200 font-bold">
                    <span>新均價 / 新持有</span>
                    <span>
                      {formatPrice(newAvgCost)} / {newShares} 股
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="text-tw-down text-sm bg-red-50 px-3 py-2 rounded">⚠️ {error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !holding || !sharesNum || !priceNum}
          className="w-full py-3 bg-amber-500 text-white rounded-lg font-bold text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {busy ? '處理中⋯' : '🍖 餵食加碼'}
        </button>
      </div>
    </Modal>
  );
}
