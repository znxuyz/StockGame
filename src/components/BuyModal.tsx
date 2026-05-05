import { useState } from 'react';
import Modal from './Modal';
import { lookupStock, ApiError, describeApiError } from '@/api';
import { buyOrFeed } from '@/services';
import { calcFee, formatInt, type FeeConfig } from '@/utils';
import type { Settings, Stock } from '@/types';

interface BuyModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  /** 解鎖新成就時呼叫（讓上層顯示 toast） */
  onActionComplete: (message: string) => void;
}

/**
 * 買入彈窗 — 對應「買入神獸」按鈕。
 * 流程：
 *  1. 輸入代號 → 失焦或按「查詢」自動補名稱（呼叫 lookupStock）
 *  2. 輸入股數、成本價
 *  3. 即時試算手續費 + 實付金額
 *  4. 按「孵化神獸」呼叫 buyOrFeed
 *
 * 同代號已有 holding 時，service 會自動走加碼路徑（仍以本彈窗購入第一筆 OK）。
 */
export default function BuyModal({ open, onClose, settings, onActionComplete }: BuyModalProps) {
  const [code, setCode] = useState('');
  const [stock, setStock] = useState<Stock | null>(null);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCode('');
    setStock(null);
    setShares('');
    setPrice('');
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleLookup() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const s = await lookupStock(code);
      setStock(s);
    } catch (e) {
      setStock(null);
      setError(e instanceof ApiError ? describeApiError(e) : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!stock || !shares || !price) return;
    const sharesNum = Number(shares);
    const priceNum = Number(price);
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      setError('股數要是正整數');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('價格要大於 0');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const feeConfig: FeeConfig = {
        discount: settings.brokerageFeeDiscount,
        minFee: settings.brokerageMinFee
      };
      const result = await buyOrFeed({
        stock,
        shares: sharesNum,
        price: priceNum,
        feeConfig,
        now: Date.now()
      });
      onActionComplete(
        result.transaction.type === 'buy'
          ? `🥚 ${stock.name} 孵化成功！${sharesNum} 股 @ ${priceNum}`
          : `🍖 ${stock.name} 加碼 ${sharesNum} 股 @ ${priceNum}`
      );
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 即時試算
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

  return (
    <Modal open={open} onClose={handleClose} title="買入神獸">
      <div className="p-4 space-y-3">
        {/* 代號輸入 + 查詢 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">股票代號</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="例：2330 / 0050 / 5269"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setStock(null);
              }}
              onBlur={handleLookup}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookup();
              }}
              className="flex-1 px-3 py-2 rounded border border-gray-300 text-base"
              disabled={busy}
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={busy || !code.trim()}
              className="px-3 py-2 bg-sand-300 text-white rounded text-sm font-bold disabled:opacity-50"
            >
              查詢
            </button>
          </div>
          {stock && (
            <p className="text-sm text-emerald-700 mt-1">
              ✓ {stock.code} {stock.name}
              <span className="text-gray-500 ml-1">
                ({stock.market === 'TWSE' ? '上市' : stock.market === 'TPEX' ? '上櫃' : 'ETF'})
              </span>
            </p>
          )}
        </div>

        {/* 股數 + 價格 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">股數</label>
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

        {/* 試算 */}
        {grossAmount > 0 && (
          <div className="bg-sand-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">成交金額</span>
              <span>NT$ {formatInt(grossAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">手續費（{(settings.brokerageFeeDiscount * 100).toFixed(0)}% 費率）</span>
              <span>NT$ {formatInt(fee)}</span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t border-gray-200">
              <span>實付金額</span>
              <span>NT$ {formatInt(netAmount)}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-tw-down text-sm bg-red-50 px-3 py-2 rounded">⚠️ {error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !stock || !sharesNum || !priceNum}
          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {busy ? '處理中⋯' : '🥚 孵化神獸'}
        </button>
      </div>
    </Modal>
  );
}
