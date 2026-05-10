import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import {
  getHoldingDetail,
  getPetStatus,
  realmProgress,
  realmLabel,
  effectLabel,
  emitTaskTrigger,
  type HoldingDetail,
  type SoulRealm,
  type RingEffect
} from '@/services';
import { formatInt, formatPrice, formatSigned, formatPercent, daysBetween } from '@/utils';
import type { Pet, Stock } from '@/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import RenameModal from './RenameModal';
import BoostRealmModal from './BoostRealmModal';

interface PetInfoModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  stock: Stock | null;
}

/** 魂環境界顯示用 emoji + 文字色,跟魂環顏色對齊 */
const REALM_EMOJI: Record<SoulRealm, string> = {
  fan: '⚪',
  ling: '🟡',
  yao: '🟣',
  shen: '⚫',
  sheng: '🔴',
  xian: '🌈'
};

/** 魂環境界進度條的填色(Tailwind class) */
const REALM_BAR_COLOR: Record<SoulRealm, string> = {
  fan: 'bg-gray-300',
  ling: 'bg-amber-400',
  yao: 'bg-purple-500',
  shen: 'bg-gray-800',
  sheng: 'bg-red-500',
  xian: 'bg-gradient-to-r from-red-400 via-yellow-300 to-purple-500'
};

/** 報酬率特效對應 emoji */
const EFFECT_EMOJI: Record<RingEffect, string> = {
  dim: '💤',
  normal: '⚪',
  pulsing: '💓',
  rotating: '🔄',
  erupting: '✨'
};

export default function PetInfoModal({ open, onClose, pet: petProp, stock }: PetInfoModalProps) {
  const [detail, setDetail] = useState<HoldingDetail | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const prevPriceRef = useRef<number | null>(null);

  // 訂閱該檔的即時價(背景 silentRefresh 寫入 db.prices 後 modal 會自動重抓 detail)
  const livePrice = useLiveQuery(
    () => (petProp ? db.prices.get(petProp.code) : undefined),
    [petProp?.code]
  );

  // 訂閱當前 pet 的最新版本(階段 4A.2 改名 / 4A.3 催熟 / 4A.4 淬煉 寫 db 後即時更新)
  const livePet = useLiveQuery(
    () => (petProp?.id ? db.pets.get(petProp.id) : undefined),
    [petProp?.id]
  );
  const pet = livePet ?? petProp;

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

  // 階段 3.7:每次 modal 開啟(對某 pet)→ emit open_pet_info(任務「巡視道場」用)
  useEffect(() => {
    if (open && pet) emitTaskTrigger('open_pet_info', 1);
  }, [open, pet?.id]);

  // 三維度狀態(階段 1.1) — 需要 detail (有 holding+price) 才能算
  const status = useMemo(() => {
    if (!pet || !detail) return null;
    return getPetStatus(pet, detail.holding, detail.price);
  }, [pet, detail]);

  if (!pet || !stock) return null;
  const species = getCreature(pet.speciesId);
  const displayName = getPetDisplayName(pet, species);
  const hasCustomName = !!pet.customName?.trim();
  const daysHeld = detail ? daysBetween(detail.holding.firstPurchasedAt, Date.now()) : 0;
  const flashClass = priceFlash === 'up' ? 'flash-up' : priceFlash === 'down' ? 'flash-down' : '';

  return (
    <Modal open={open} onClose={onClose} title={displayName}>
      <div className="p-4 space-y-3">
        {/* 神獸頭像 + 名稱 + 描述 */}
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
            <h3 className="text-xl font-bold break-words">{displayName}</h3>
            {hasCustomName && species?.name && (
              <p className="text-xs text-gray-500 mt-0.5">原名 {species.name}</p>
            )}
            <p className="text-xs text-gray-500 italic mt-1">{species?.description}</p>
          </div>
        </div>

        {/* 養成資訊三段(階段 1.5) — Lv / 境界 / 特效 */}
        {status && detail && (
          <div className="data-card p-3 space-y-3 text-sm">
            {/* 等級 */}
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-base font-bold text-amber-600">
                  🆙 Lv.{status.level}
                </span>
                <span className="text-xs text-gray-500">
                  累積投入 NT$ {formatInt(status.totalInvested)}
                </span>
              </div>
            </div>

            {/* 魂環境界 + 進度條 */}
            <RealmRow status={status} />

            {/* 報酬率特效 */}
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-bold">
                  {EFFECT_EMOJI[status.effect]} 魂環特效:{effectLabel(status.effect)}
                </span>
                <span
                  className={
                    status.returnRate >= 0
                      ? 'text-tw-up font-bold'
                      : 'text-tw-down font-bold'
                  }
                >
                  {status.returnRate >= 0 ? '+' : ''}
                  {formatPercent(status.returnRate)}
                </span>
              </div>
            </div>
          </div>
        )}

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

        {/*
          階段 4A 修為消耗管道。4A.5 會統一加上修為不足 / 已達上限 等視覺狀態。
          目前 [改名]、[催熟] 已 wired;[淬煉] 在 4A.4 補。
        */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => setRenameOpen(true)}
            className="rounded-lg bg-amber-500 text-white font-bold py-2 text-sm active:scale-95 transition-transform"
          >
            改名 💎50
          </button>
          <button
            type="button"
            onClick={() => setBoostOpen(true)}
            disabled={!status}
            className="rounded-lg bg-amber-500 text-white font-bold py-2 text-sm active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            催熟 💎100
          </button>
        </div>
      </div>

      <RenameModal open={renameOpen} onClose={() => setRenameOpen(false)} pet={pet} />
      <BoostRealmModal
        open={boostOpen}
        onClose={() => setBoostOpen(false)}
        pet={pet}
        status={status}
      />
    </Modal>
  );
}

/**
 * 魂環境界 row:emoji + 名稱 / 持有月數 / 距下個境界月數 / 進度條
 * xian 仙境沒下個境界,不顯示「距 X 還需」+ 進度條 fill 100%
 */
function RealmRow({ status }: { status: ReturnType<typeof getPetStatus> }) {
  const prog = realmProgress(status.monthsHeld);
  const months = status.monthsHeld.toFixed(1);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-bold">
          {REALM_EMOJI[prog.current]} {realmLabel(prog.current)}境
        </span>
        <span className="text-xs text-gray-500">持有 {months} 個月</span>
      </div>
      {prog.next ? (
        <>
          <div className="text-xs text-gray-500 mt-0.5">
            距 {realmLabel(prog.next)}境 還需 {prog.monthsToNext.toFixed(1)} 個月
          </div>
          <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${REALM_BAR_COLOR[prog.current]} transition-all duration-500`}
              style={{ width: `${(prog.progress * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-0.5 text-right">
            {(prog.progress * 100).toFixed(0)}%
          </div>
        </>
      ) : (
        <div className="mt-1 h-2 bg-gradient-to-r from-red-400 via-yellow-300 to-purple-500 rounded-full" />
      )}
    </div>
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
