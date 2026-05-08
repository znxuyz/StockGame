import { useEffect, useState } from 'react';
import { formatInt, formatSigned, formatPercent } from '@/utils';
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

/** 市場狀態 → icon + 精簡標籤(2 字以內) */
function marketStatusDisplay(status: MarketStatus): { icon: string; label: string } {
  switch (status) {
    case 'open':
      return { icon: '🟢', label: '盤中' };
    case 'holiday':
      return { icon: '🏮', label: '假日' };
    case 'weekend':
      return { icon: '⚪', label: '週末' };
    case 'after-hours':
    default:
      return { icon: '⚪', label: '盤外' };
  }
}

/** 精簡相對時間:剛剛 / 5m前 / 2h前 / 3d前 */
function compactAgo(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m}m前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h前`;
  const d = Math.floor(h / 24);
  return `${d}d前`;
}

/** 超過幾毫秒視為「資料太舊」要標紅 */
const STALE_THRESHOLD_MS = 10 * 60_000;

/** 同步狀態 → icon + tooltip */
function syncDisplay(status: SyncStatus): { icon: string; label: string; cls: string } {
  switch (status) {
    case 'syncing':
      return { icon: '☁⟳', label: '同步中', cls: 'text-mythic-gold-500' };
    case 'error':
      return { icon: '☁✗', label: '同步失敗', cls: 'text-red-600' };
    case 'offline':
      return { icon: '☁⊘', label: '離線', cls: 'text-gray-400' };
    case 'idle':
    default:
      return { icon: '☁✓', label: '已同步', cls: 'text-mythic-jade-400' };
  }
}

/**
 * 玻璃擬態 HUD — 完全棄用 frame_card.png:
 *  - .hud 容器:半透明米白 + backdrop-blur + 下緣金色細線(無外框 PNG、無內卡)
 *  - 主資料 grid [auto 1fr 1fr]:badge 跨兩列 + 神獸/總市值/投入/報酬 2x2
 *  - 報酬 cell flex-wrap,(+%) 太擠時自動換行,絕不 truncate 數字
 *  - 狀態列下方虛線分隔(border-top dashed,單元素無多餘 div)
 *  - 數字一律 tabular-nums,whitespace-nowrap 防截斷
 *  - 文案精簡:「更新 2h前」「盤中」「☁✓」
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
  // 每 15 秒重算「N 分前」字串(reactive 顯示)
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
      <div className="hud">
        <div className="text-xs text-mythic-ink-50/60 text-center font-zh py-1">計算中⋯</div>
      </div>
    );
  }

  const stale =
    !refreshing && lastPriceUpdateAt !== undefined && now - lastPriceUpdateAt > STALE_THRESHOLD_MS;
  const updateRel = refreshing
    ? '更新中⋯'
    : lastPriceUpdateAt
      ? `更新 ${compactAgo(lastPriceUpdateAt, now)}`
      : '尚未更新';

  const pnlClass = summary.totalPnL >= 0 ? 'text-tw-up' : 'text-tw-down';
  const rateClass = summary.returnRate >= 0 ? 'text-tw-up' : 'text-tw-down';
  const todayClass = summary.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down';

  return (
    <div className="hud">
      {/* 主資料:badge(row-span-2) + 2x2 stats */}
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-0.5 leading-tight">
        <img
          src="/assets/ui/badge_pet.png"
          alt=""
          aria-hidden
          draggable={false}
          className="row-span-2 w-9 h-9 shrink-0 drop-shadow-[0_2px_4px_rgba(33,78,61,0.35)] select-none pointer-events-none"
        />
        <Stat label="神獸" value={`${summary.holdingCount}`} suffix="隻" />
        <Stat label="總市值" value={formatInt(summary.totalMarketValue)} />
        <Stat label="投入" value={formatInt(summary.totalCost)} />
        {/* 報酬 cell:flex-wrap 讓 (+%) 太擠時換行,但 +35,503 永不截斷 */}
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-[11px] text-mythic-jade-400 font-zh whitespace-nowrap shrink-0">
            報酬
          </span>
          <b className={`text-sm font-bold whitespace-nowrap ${pnlClass}`}>
            {formatSigned(summary.totalPnL)}
          </b>
          <span className={`text-[10px] whitespace-nowrap ${rateClass}`}>
            ({formatPercent(summary.returnRate)})
          </span>
        </div>
      </div>

      {/* 狀態列:虛線分隔由 border-top 實作,無多餘 div */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 mt-1.5 pt-1.5 text-[11px] leading-tight font-zh opacity-70"
        style={{ borderTop: '1px dashed rgba(212, 175, 55, 0.35)' }}
      >
        <span className="whitespace-nowrap">
          {market.icon} {market.label}
          <span className={stale ? 'text-red-600' : ''}> · {updateRel}</span>
          <span className={todayClass}>
            {' · 今 '}
            {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
          </span>
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap shrink-0">
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
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[11px] text-mythic-jade-400 font-zh shrink-0">{label}</span>
      <b className="text-sm font-bold text-mythic-ink-200">{value}</b>
      {suffix && <span className="text-[11px] text-mythic-ink-50/70 shrink-0">{suffix}</span>}
    </div>
  );
}
