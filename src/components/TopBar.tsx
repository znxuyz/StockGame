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
 * 階段 1.5 — 手遊風 HUD:
 *  - 容器 100vw,完全貼齊螢幕左右上邊緣(無 mx / my,無 max-width)
 *  - 單一 .ornate-frame 9-slice 邊框包住整個 HUD,框內 bg 透明(不再多一層白卡)
 *  - border-width 18px(從 28 減到 18,薄 35%),整體高度目標 ≤ 90px
 *  - 內容:badge + 神獸/總市值/投入/報酬 2x2 + 金色分隔線 + 狀態列
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

  if (!summary) {
    return (
      <div className="px-3 py-2 text-xs text-mythic-ink-50/60 text-center font-zh">
        計算中⋯
      </div>
    );
  }

  const stale =
    !refreshing && lastPriceUpdateAt !== undefined && now - lastPriceUpdateAt > STALE_THRESHOLD_MS;
  const updateLabel = refreshing
    ? '更新中⋯'
    : lastPriceUpdateAt
      ? `更新於 ${relativeTime(lastPriceUpdateAt, now)}`
      : '尚未更新';

  const pnlClass = summary.totalPnL >= 0 ? 'text-tw-up' : 'text-tw-down';
  const rateClass = summary.returnRate >= 0 ? 'text-tw-up' : 'text-tw-down';
  const todayClass = summary.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down';

  return (
    <div className="ornate-frame w-full px-3 py-1">
      {/* 主資料區:badge + 4 格數字(2x2 grid) */}
      <div className="flex items-center gap-2 mb-0.5">
        <img
          src="/assets/ui/badge_pet.png"
          alt=""
          aria-hidden
          draggable={false}
          className="w-10 h-10 shrink-0 drop-shadow-[0_2px_4px_rgba(33,78,61,0.35)] select-none pointer-events-none"
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-0 flex-1 leading-tight">
          <Stat label="神獸" value={`${summary.holdingCount}`} suffix="隻" />
          <Stat label="總市值" value={formatInt(summary.totalMarketValue)} />
          <Stat label="投入" value={formatInt(summary.totalCost)} />
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-[11px] text-mythic-jade-400 font-zh shrink-0">報酬</span>
            <b className={`text-base font-bold ${pnlClass} truncate`}>
              {formatSigned(summary.totalPnL)}
            </b>
            <span className={`text-[10px] ${rateClass} shrink-0`}>
              ({formatPercent(summary.returnRate)})
            </span>
          </div>
        </div>
      </div>

      {/* 分隔線(框內金色細線) */}
      <div className="h-px bg-mythic-gold-300/40 mb-1" />

      {/* 狀態列 */}
      <div className="flex items-center justify-between text-[11px] text-mythic-ink-50/75 leading-snug font-zh gap-2">
        <span className="truncate min-w-0">
          {market.icon} {market.label}
          <span className={`ml-1 ${stale ? 'text-red-600' : ''}`}>· {updateLabel}</span>
          <span className={`ml-2 ${todayClass}`}>
            今 {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
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

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="text-[11px] text-mythic-jade-400 font-zh shrink-0">{label}</span>
      <b className="text-base font-bold text-mythic-ink-200 truncate">{value}</b>
      {suffix && <span className="text-[11px] text-mythic-ink-50/70 shrink-0">{suffix}</span>}
    </div>
  );
}
