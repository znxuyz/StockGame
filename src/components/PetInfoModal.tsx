import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { getCreature } from '@/data/creatures';
import { getHoldingDetail, type HoldingDetail } from '@/services';
import { formatInt, formatPrice, formatSigned, formatPercent, daysBetween } from '@/utils';
import type { Pet, Stock } from '@/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';

interface PetInfoModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  stock: Stock | null;
}

export default function PetInfoModal({ open, onClose, pet, stock }: PetInfoModalProps) {
  const [detail, setDetail] = useState<HoldingDetail | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  // 訂閱該檔的即時價(背景 silentRefresh 寫入 db.prices 後 modal 會自動重抓 detail)
  const livePrice = useLiveQuery(
    () => (pet ? db.prices.get(pet.code) : undefined),
    [pet?.code]
  );

  useEffect(() => {
    if (!open || !pet) return;
    getHoldingDetail(pet.code).then(setDetail);
    // livePrice 變動就再抓 detail(holding 也可能因加碼/賣出變)
  }, [open, pet, livePrice?.currentPrice, livePrice?.updatedAt]);

  // 現價變動時觸發閃光,500ms 後移除
  useEffect(() => {
    const newPrice = detail?.price?.currentPrice;
    const prevPrice = prevPriceRef.current;
    if (newPrice != null && prevPrice != null && newPrice !== prevPrice) {
      setPriceFlash(newPrice > prevPrice ? 'up' : 'down');
      const t = setTimeout(() => setPriceFlash(null), 500);
      return () => clearTimeout(t);
    }
    if (newPrice != null) prevPriceRef.current = newPrice;
  }, [detail?.price?.currentPrice]);

  // modal 關閉時重置閃光基準,下次開啟不會誤觸發
  useEffect(() => {
    if (!open) {
      prevPriceRef.current = null;
      setPriceFlash(null);
    }
  }, [open]);

  if (!pet || !stock) return null;
  const species = getCreature(pet.speciesId);
  const daysHeld = detail ? daysBetween(detail.holding.firstPurchasedAt, Date.now()) : 0;
  const flashClass = priceFlash === 'up' ? 'flash-up' : priceFlash === 'down' ? 'flash-down' : '';

  return (
    <Modal open={open} onClose={onClose} title={species?.name ?? '神獸資訊'}>
      <div className="p-4 space-y-3">
        {/* 神獸頭像 + 修為 */}
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 flex items-center justify-center shrink-0">
            {species?.art ? (
              <img
                src={`/sprites/${species.id}.png`}
                alt={species.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  // 圖檔缺漏 → 改顯示 emoji 兜底
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <span
              className="w-full h-full items-center justify-center text-6xl"
              style={{ display: species?.art ? 'none' : 'flex' }}
            >
              {species?.emoji ?? '❓'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold break-words">{species?.name}</h3>
            <p className="text-sm text-gray-700">修為 Lv.{pet.level}</p>
            <p className="text-xs text-gray-500 italic mt-1">{species?.description}</p>
          </div>
        </div>

        {/* 對應股票資訊 */}
        <div className={`bg-sand-50 rounded-lg p-3 ${flashClass}`}>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xs text-gray-500">{stock.code}</span>
              <h4 className="text-base font-bold">{stock.name}</h4>
            </div>
            <span className="text-xs text-gray-500">
              {stock.market === 'TWSE' ? '上市' : stock.market === 'TPEX' ? '上櫃' : 'ETF'}
            </span>
          </div>
          {detail?.price && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <div>
                <span className="text-gray-500">現價：</span>
                <span className="font-bold">{formatPrice(detail.price.currentPrice)}</span>
              </div>
              <div>
                <span className="text-gray-500">昨收：</span>
                <span>{formatPrice(detail.price.previousClose)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">今日漲跌：</span>
                <span className={detail.price.change >= 0 ? 'text-tw-up' : 'text-tw-down'}>
                  {formatSigned(detail.price.change)} ({formatPercent(detail.price.changePercent)})
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  {detail.price.source === 'intraday' ? '即時' : '收盤'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 持倉 / 損益 */}
        {detail && (
          <div className="data-card p-3 text-sm space-y-1">
            <Row label="持有股數">{detail.holding.shares} 股</Row>
            <Row label="平均成本">{formatPrice(detail.holding.avgCost)}</Row>
            <Row label="累積投入">NT$ {formatInt(detail.holding.totalCost)}</Row>
            <Row label="當前市值">NT$ {formatInt(detail.marketValue)}</Row>
            <Row label="未實現損益">
              <span className={detail.unrealizedPnL >= 0 ? 'text-tw-up font-bold' : 'text-tw-down font-bold'}>
                {formatSigned(detail.unrealizedPnL)}（{formatPercent(detail.returnRate)}）
              </span>
            </Row>
            <Row label="當日損益">
              <span className={detail.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}>
                {formatSigned(detail.todayPnL)}（{formatPercent(detail.todayReturnRate)}）
              </span>
            </Row>
            {detail.holding.realizedPnL !== 0 && (
              <Row label="已實現損益（部分賣出累積）">
                <span className={detail.holding.realizedPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}>
                  {formatSigned(detail.holding.realizedPnL)}
                </span>
              </Row>
            )}
            <Row label="持有天數">{daysHeld} 天</Row>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}
