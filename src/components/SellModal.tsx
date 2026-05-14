import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import HoldingPicker from './HoldingPicker';
import { db } from '@/db';
import { holdingRepo } from '@/repositories/holdingRepo';
import { sell } from '@/services';
import {
  calcFee,
  calcTax,
  formatInt,
  formatPrice,
  formatSigned,
  type FeeConfig
} from '@/utils';
import type { Settings } from '@/types';

interface SellModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete: (message: string) => void;
  /** 階段 R.7:從神獸詳細頁快速進入時帶 code,自動預選那檔 */
  presetCode?: string | null;
}

/**
 * 售出彈窗 — 對應「售出神獸」按鈕。
 *  - 提供「全部賣出」快捷
 *  - 即時試算手續費 + 證交稅（一般 0.3% / ETF 0.1%）+ 已實現損益
 *  - 賣光時提示寵物進圖鑑
 *
 * 階段 R.7:支援 presetCode 預選(從 PetInfoModal 快速進入)。
 */
/** 同 BuyModal:今天 YYYY-MM-DD(台北時區) */
function todayYMD(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date());
}

/** YYYY-MM-DD → unix ms,固定當日 13:30 GMT+8(台股收盤,賣出常用) */
function parseTradeDate(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN;
  return new Date(`${ymd}T05:30:00Z`).getTime();
}

export default function SellModal({
  open,
  onClose,
  settings,
  onActionComplete,
  presetCode
}: SellModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [sellDate, setSellDate] = useState(todayYMD());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 階段 R.7:打開 modal 時若有 presetCode 自動填入,
  // 玩家仍可手動 HoldingPicker 切其他檔(presetCode 只是入口預設值)
  useEffect(() => {
    if (open && presetCode) {
      setCode(presetCode);
    }
  }, [open, presetCode]);

  const holding = useLiveQuery(async () => (code ? holdingRepo.get(code) : undefined), [code]);
  const stock = useLiveQuery(async () => (code ? db.stocks.get(code) : undefined), [code]);
  const livePrice = useLiveQuery(async () => (code ? db.prices.get(code) : undefined), [code]);

  function reset() {
    setCode(null);
    setShares('');
    setPrice('');
    setSellDate(todayYMD());
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  function fillCurrentPrice() {
    if (livePrice) setPrice(livePrice.currentPrice.toFixed(2));
  }

  function fillAllShares() {
    if (holding) setShares(String(holding.shares));
  }

  async function handleSubmit() {
    if (!holding || !stock || !shares || !price) return;
    const sharesNum = Number(shares);
    const priceNum = Number(price);
    if (sharesNum <= 0 || priceNum <= 0) {
      setError('股數與價格都要大於 0');
      return;
    }
    if (sharesNum > holding.shares) {
      setError(`持有 ${holding.shares} 股,無法賣出 ${sharesNum} 股`);
      return;
    }
    const tradeMs = parseTradeDate(sellDate);
    if (!Number.isFinite(tradeMs)) {
      setError('賣出日期格式不對');
      return;
    }
    if (tradeMs > Date.now() + 86_400_000) {
      setError('賣出日期不能是未來');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const feeConfig: FeeConfig = {
        discount: settings.brokerageFeeDiscount,
        minFee: settings.brokerageMinFee
      };
      const result = await sell({
        code: stock.code,
        shares: sharesNum,
        price: priceNum,
        feeConfig,
        now: tradeMs
      });
      const isAllSold = result.holding === null;
      onActionComplete(
        isAllSold
          ? `📦 ${stock.name} 全數賣出，神獸進入歷史圖鑑（已實現 ${formatSigned(result.transaction.realizedPnL)}）`
          : `📦 ${stock.name} 賣出 ${sharesNum} 股 @ ${priceNum}（已實現 ${formatSigned(result.transaction.realizedPnL)}）`
      );
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
  const tax = stock ? calcTax(grossAmount, stock.market, true) : 0;
  const netReceive = grossAmount - fee - tax;
  const costOfSold = holding ? holding.avgCost * sharesNum : 0;
  const realizedPnL = Math.round(netReceive - costOfSold);
  const isAllSold = holding && sharesNum === holding.shares;

  return (
    <Modal open={open} onClose={handleClose} title="售出神獸">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">選擇神獸</label>
          <HoldingPicker
            value={code}
            onChange={setCode}
            emptyMessage="目前沒有持倉，無法賣出"
          />
        </div>

        {holding && stock && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  賣出股數
                  <button
                    type="button"
                    onClick={fillAllShares}
                    className="ml-2 text-emerald-600 underline"
                  >
                    全部
                  </button>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={`最多 ${holding.shares}`}
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="input-field"
                  disabled={busy}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  每股賣價
                  {livePrice && (
                    <button
                      type="button"
                      onClick={fillCurrentPrice}
                      className="ml-2 text-emerald-600 underline"
                    >
                      帶入現價
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder={livePrice?.currentPrice.toFixed(2) ?? '100.00'}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="input-field"
                  disabled={busy}
                />
              </div>
            </div>

            {/* 階段 5G:賣出日期(預設今天,補登歷史賣出用) */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">賣出日期</label>
              <input
                type="date"
                value={sellDate}
                onChange={(e) => setSellDate(e.target.value)}
                max={todayYMD()}
                className="input-field"
                disabled={busy}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                預設今天。補登過去賣出就改實際日期,讓 IRR 正確。
              </p>
            </div>

            {grossAmount > 0 && (
              <div className="bg-sand-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">成交金額</span>
                  <span>NT$ {formatInt(grossAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">手續費</span>
                  <span>-NT$ {formatInt(fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    證交稅（{stock.market === 'ETF' ? '0.1%' : '0.3%'}）
                  </span>
                  <span>-NT$ {formatInt(tax)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 border-gray-200">
                  <span className="text-gray-500">實收金額</span>
                  <span>NT$ {formatInt(netReceive)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">原成本（{sharesNum} 股 × {formatPrice(holding.avgCost)}）</span>
                  <span>NT$ {formatInt(costOfSold)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 border-gray-200">
                  <span>已實現損益</span>
                  <span className={realizedPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}>
                    {formatSigned(realizedPnL)}
                  </span>
                </div>
                {isAllSold && (
                  <p className="text-amber-700 text-xs mt-1">
                    ⚠️ 全部賣出後神獸將進入歷史圖鑑
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-tw-down text-sm bg-red-50 px-3 py-2 rounded">⚠️ {error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !holding || !sharesNum || !priceNum}
          className="w-full py-3 bg-rose-500 text-white rounded-lg font-bold text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {busy ? '處理中⋯' : '📦 確認賣出'}
        </button>
      </div>
    </Modal>
  );
}
