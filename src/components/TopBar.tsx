import { useEffect, useState } from 'react';
import { formatInt, formatSigned, formatPercent, relativeTime } from '@/utils';
import type { PortfolioSummary } from '@/services';
import { subscribeSyncStatus, type SyncStatus } from '@/services/cloudSync';
import { isCloudConfigured } from '@/lib/supabase';
import type { MarketStatus } from '@/api';

interface TopBarProps {
  summary: PortfolioSummary | null;
  marketStatus: MarketStatus;
  consecutiveDays: number;
  unlockedAchievements: number;
  totalAchievements: number;
  /** 上次成功抓價的 unix millis(從 settings.lastPriceUpdateAt) */
  lastPriceUpdateAt: number | undefined;
  /** 是否正在抓價(顯示「更新中⋯」) */
  refreshing: boolean;
  /** 是否登入雲端(沒登入就不顯示雲端 icon) */
  cloudSignedIn: boolean;
}

/** 市場狀態 → icon + 標籤 */
function marketStatusDisplay(status: MarketStatus): { icon: string; label: string } {
  switch (status) {
    case 'open':
      return { icon: '🟢', label: '盤中即時' };
    case 'holiday':
      return { icon: '🏮', label: '國定假日' };
    case 'weekend':
      return { icon: '⚪', label: '週末' };
    case 'after-hours':
    default:
      return { icon: '⚪', label: '盤外收盤' };
  }
}

/** 超過幾毫秒視為「資料太舊」要標紅 */
const STALE_THRESHOLD_MS = 10 * 60_000;

/**
 * 螢幕頂部資產列：5 個關鍵數字 + 盤中狀態 + 連登 + 成就計數。
 */
/** 同步狀態 → icon + tooltip */
function syncDisplay(status: SyncStatus): { icon: string; label: string; cls: string } {
  switch (status) {
    case 'syncing':
      return { icon: '☁ ⟳', label: '同步中', cls: 'text-amber-600' };
    case 'error':
      return { icon: '☁ ✗', label: '同步失敗', cls: 'text-red-600' };
    case 'offline':
      return { icon: '☁ ⊘', label: '離線', cls: 'text-gray-400' };
    case 'idle':
    default:
      return { icon: '☁ ✓', label: '已同步', cls: 'text-emerald-600' };
  }
}

export default function TopBar({
  summary,
  marketStatus,
  consecutiveDays,
  unlockedAchievements,
  totalAchievements,
  lastPriceUpdateAt,
  refreshing,
  cloudSignedIn
}: TopBarProps) {
  const market = marketStatusDisplay(marketStatus);
  // 每 15 秒重算「N 秒前」字串(reactive 顯示)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // 訂閱雲端同步狀態
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncErr, setSyncErr] = useState<string | null>(null);
  useEffect(() => {
    if (!isCloudConfigured) return;
    return subscribeSyncStatus((s, e) => {
      setSyncStatus(s);
      setSyncErr(e);
    });
  }, []);
  const sync = syncDisplay(syncStatus);

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
          {market.icon} {market.label}
          <span className={`ml-1 ${stale ? 'text-red-600' : ''}`}>· {updateLabel}</span>
          <span className={`ml-2 ${summary.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
            今 {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
          </span>
        </span>
        <span className="flex items-center gap-2">
          {cloudSignedIn && (
            <span className={sync.cls} title={syncErr ?? sync.label}>
              {sync.icon}
            </span>
          )}
          <span>
            🏆 {unlockedAchievements}/{totalAchievements} · 🔥 {consecutiveDays}d
          </span>
        </span>
      </div>
    </div>
  );
}
