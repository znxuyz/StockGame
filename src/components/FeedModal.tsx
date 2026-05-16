import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import HoldingPicker from './HoldingPicker';
import { db } from '@/db';
import { holdingRepo } from '@/repositories/holdingRepo';
import { buyOrFeed } from '@/services';
import { calcFee, formatInt, formatPrice, type FeeConfig } from '@/utils';
import { useOnline } from '@/lib/useOnline';
import type { Settings } from '@/types';

interface FeedModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete: (message: string) => void;
  /**
   * 階段 R.7:從神獸詳細頁快速進來時帶 code,自動預選那檔,
   * HoldingPicker 變唯讀資訊條(玩家明確知道在加碼哪一檔)。
   * 從 BottomBar → TradeModal → FeedModal 的路徑不帶,維持原本選檔流程。
   */
  presetCode?: string | null;
}

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

/** YYYY-MM-DD → unix ms,固定當日 09:30 GMT+8(台股開盤) */
function parseTradeDate(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN;
  return new Date(`${ymd}T01:30:00Z`).getTime();
}

/**
 * 加碼彈窗 — 對應「餵食加碼」按鈕。
 * 從持倉清單選一檔,輸入股數 + 成本價,計算新的平均成本後寫入。
 *
 * 階段 R.7:支援 presetCode 預選(從 PetInfoModal 快速進入)。
 * 階段 5G 修:加日期欄,讓玩家補登歷史加碼(對 IRR / 持有天數正確性至關)。
 */
export default function FeedModal({
  open,
  onClose,
  settings,
  onActionComplete,
  presetCode
}: FeedModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [feedDate, setFeedDate] = useState(todayYMD());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();

  // 階段 R.7:打開 modal 時若有 presetCode 自動填入,
  // 之後玩家手動 HoldingPicker 切其他檔仍允許(presetCode 只是入口預設值)
  useEffect(() => {
    if (open && presetCode) {
      setCode(presetCode);
    }
  }, [open, presetCode]);

  const holding = useLiveQuery(async () => (code ? holdingRepo.get(code) : undefined), [code]);
  const stock = useLiveQuery(async () => (code ? db.stocks.get(code) : undefined), [code]);

  function reset() {
    setCode(null);
    setShares('');
    setPrice('');
    setFeedDate(todayYMD());
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
    const tradeMs = parseTradeDate(feedDate);
    if (!Number.isFinite(tradeMs)) {
      setError('加碼日期格式不對');
      return;
    }
    if (tradeMs > Date.now() + 86_400_000) {
      setError('加碼日期不能是未來');
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
        now: tradeMs
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
      <div className="space-y-3">
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
                  className="input-field"
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
                  className="input-field"
                  disabled={busy}
                />
              </div>
            </div>

            {/* 階段 5G:加碼日期(預設今天,補登歷史加碼用) */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">加碼日期</label>
              <input
                type="date"
                value={feedDate}
                onChange={(e) => setFeedDate(e.target.value)}
                max={todayYMD()}
                className="input-field"
                disabled={busy}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                預設今天。補登過去加碼就改實際日期,讓 IRR / 持有天數正確。
              </p>
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
          disabled={busy || !holding || !sharesNum || !priceNum || !online}
          title={!online ? '離線中無法操作' : undefined}
          className="w-full py-3 bg-amber-500 text-white rounded-lg font-bold text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {busy ? '處理中⋯' : !online ? '📡 離線中' : '🍖 餵食加碼'}
        </button>
      </div>
    </Modal>
  );
}
