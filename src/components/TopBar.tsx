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

/** 同步狀態 → icon + tooltip */
function syncDisplay(status: SyncStatus): { icon: string; label: string; cls: string } {
  switch (status) {
    case 'syncing':
      return { icon: '☁ ⟳', label: '同步中', cls: 'text-mythic-gold-500' };
    case 'error':
      return { icon: '☁ ✗', label: '同步失敗', cls: 'text-red-600' };
    case 'offline':
      return { icon: '☁ ⊘', label: '離線', cls: 'text-gray-400' };
    case 'idle':
    default:
      return { icon: '☁ ✓', label: '已同步', cls: 'text-mythic-jade-400' };
  }
}

/**
 * 螢幕頂部:神話橫幅 + 神獸徽章 + 5 個關鍵數字 + 盤中狀態 + 連登 + 成就計數。
 */
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

  return (
    <div className="bg-mythic-paper-100">
      {/* 神話橫幅:1280×243 比例,full width 自動縮放(手機 400px → ~76px tall) */}
      <img
        src="/assets/ui/top_banner.png"
        alt=""
        aria-hidden
        className="w-full block select-none pointer-events-none"
        draggable={false}
      />

      {!summary ? (
        <div className="px-3 py-2 text-xs text-mythic-ink-50/60 text-center font-zh">
          計算中⋯
        </div>
      ) : (
        <>
          {/* 主數據面板:badge + 神獸數 + 總市值 / 投入 / 報酬 */}
          <StatsPanel summary={summary} />

          {/* 底列:市場狀態 + 更新時間 + 今日 + 雲端 + 成就 */}
          <div className="flex items-center justify-between px-3 pb-1.5 text-[11px] text-mythic-ink-50/80 font-zh leading-snug">
            <span className="truncate">
              {market.icon} {market.label}
              <span
                className={`ml-1 ${
                  !refreshing && lastPriceUpdateAt && now - lastPriceUpdateAt > STALE_THRESHOLD_MS
                    ? 'text-red-600'
                    : ''
                }`}
              >
                · {refreshing
                  ? '更新中⋯'
                  : lastPriceUpdateAt
                    ? `更新於 ${relativeTime(lastPriceUpdateAt, now)}`
                    : '尚未更新'}
              </span>
              <span className={`ml-2 ${summary.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
                今 {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0 ml-2">
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
        </>
      )}
    </div>
  );
}

function StatsPanel({ summary }: { summary: PortfolioSummary }) {
  const pnlClass = summary.totalPnL >= 0 ? 'text-tw-up' : 'text-tw-down';
  const rateClass = summary.returnRate >= 0 ? 'text-tw-up' : 'text-tw-down';
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b-2 border-mythic-gold-300/70">
      {/* 寵物徽章 */}
      <img
        src="/assets/ui/badge_pet.png"
        alt=""
        aria-hidden
        className="w-12 h-12 shrink-0 drop-shadow-[0_2px_4px_rgba(33,78,61,0.35)] select-none pointer-events-none"
        draggable={false}
      />

      {/* 數據兩列(左:神獸數 / 投入  右:總市值 / 報酬) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0 flex-1 text-[11px] font-zh leading-tight">
        <div>
          <span className="text-mythic-jade-400">神獸</span>
          <b className="ml-1 text-mythic-ink-200 text-sm">{summary.holdingCount}</b>
          <span className="text-mythic-ink-50/70"> 隻</span>
        </div>
        <div>
          <span className="text-mythic-jade-400">總市值</span>
          <b className="ml-1 text-mythic-ink-200 text-sm">{formatInt(summary.totalMarketValue)}</b>
        </div>
        <div>
          <span className="text-mythic-jade-400">投入</span>
          <b className="ml-1 text-mythic-ink-200 text-sm">{formatInt(summary.totalCost)}</b>
        </div>
        <div>
          <span className="text-mythic-jade-400">報酬</span>
          <b className={`ml-1 text-sm ${pnlClass}`}>{formatSigned(summary.totalPnL)}</b>
          <span className={`ml-1 text-[10px] ${rateClass}`}>
            ({formatPercent(summary.returnRate)})
          </span>
        </div>
      </div>
    </div>
  );
}
