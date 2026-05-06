import { useEffect, useState } from 'react';
import { formatInt, formatSigned, formatPercent, relativeTime } from '@/utils';
import type { PortfolioSummary } from '@/services';

interface TopBarProps {
  summary: PortfolioSummary | null;
  marketOpen: boolean;
  consecutiveDays: number;
  unlockedAchievements: number;
  totalAchievements: number;
  /** 上次成功抓價的 unix millis(從 settings.lastPriceUpdateAt) */
  lastPriceUpdateAt: number | undefined;
  /** 是否正在抓價(顯示「更新中⋯」) */
  refreshing: boolean;
}

/** 超過幾毫秒視為「資料太舊」要標紅 */
const STALE_THRESHOLD_MS = 10 * 60_000;

/**
 * 螢幕頂部資產列：5 個關鍵數字 + 盤中狀態 + 連登 + 成就計數。
 */
export default function TopBar({
  summary,
  marketOpen,
  consecutiveDays,
  unlockedAchievements,
  totalAchievements,
  lastPriceUpdateAt,
  refreshing
}: TopBarProps) {
  // 每 15 秒重算「N 秒前」字串(reactive 顯示)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!summary) {
    return (
      <div className="bg-sand-50/95 backdrop-blur px-3 py-2 text-xs text-gray-500 text-center">
        計算中⋯
      </div>
    );
  }

  const updateLabel = refreshing
    ? '更新中⋯'
    : lastPriceUpdateAt
      ? `更新於 ${relativeTime(lastPriceUpdateAt, now)}`
      : '尚未更新';
  const stale =
    !refreshing && lastPriceUpdateAt !== undefined && now - lastPriceUpdateAt > STALE_THRESHOLD_MS;

  const pnlClass = summary.totalPnL >= 0 ? 'text-tw-up' : 'text-tw-down';
  const rateClass = summary.returnRate >= 0 ? 'text-tw-up' : 'text-tw-down';

  return (
    <div className="bg-sand-50/95 backdrop-blur px-3 pt-2 pb-1 text-xs leading-snug border-b border-sand-200 shadow-sm">
      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
        <div>
          <span className="text-gray-500">我的神獸：</span>
          <b className="text-gray-800">{summary.holdingCount} 隻</b>
        </div>
        <div className="col-span-1">
          <span className="text-gray-500">總市值：</span>
          <b className="text-gray-800">{formatInt(summary.totalMarketValue)}</b>
        </div>
        <div>
          <span className="text-gray-500">投入：</span>
          <b className="text-gray-800">{formatInt(summary.totalCost)}</b>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">神獸幫我賺：</span>
          <b className={pnlClass}>{formatSigned(summary.totalPnL)}</b>
        </div>
        <div>
          <span className="text-gray-500">總報酬率：</span>
          <b className={rateClass}>{formatPercent(summary.returnRate)}</b>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
        <span>
          {marketOpen ? '🟢 盤中即時' : '⚪ 盤外收盤'}
          <span className={`ml-1 ${stale ? 'text-red-600' : ''}`}>· {updateLabel}</span>
          <span className={`ml-2 ${summary.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
            今 {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
          </span>
        </span>
        <span>
          🏆 {unlockedAchievements}/{totalAchievements} · 🔥 {consecutiveDays}d
        </span>
      </div>
    </div>
  );
}
