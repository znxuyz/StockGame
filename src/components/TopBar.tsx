import { useEffect, useState } from 'react';
import { formatCount, formatSigned, formatPercent } from '@/utils';
import type { PortfolioSummary } from '@/services';
// HUD 不再顯示「☁✓ 已同步」狀態:Repository 各自上雲,沒有單一全域 sync 狀態
// 可顯示;個別 repo 失敗會 emit toast,離線時 OfflineBanner 接管視覺提示。
import { useCultivation } from '@/hooks/useCultivation';
import CultivationCounter from './CultivationCounter';
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
  /** 階段 5A.2:點左上角掌印 → 開個人檔案彈窗 */
  onOpenProfile?: () => void;
  /**
   * 階段 5A.2:掌印「跳動 3 次」引導用遞增 token。
   * App 在 ProfileSetupPrompt 關閉時 +1,TopBar useEffect 偵測變動 → 套
   * .paw-flash class 跑一次動畫(1.4s × 3)。0 表示不需閃。
   */
  flashPawToken?: number;
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
  onOpenProfile,
  flashPawToken
}: TopBarProps) {
  const market = marketStatusDisplay(marketStatus);
  // 每 15 秒重算「N 分前」字串(reactive 顯示)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // 訂閱修為餘額(階段 2.2):earn/spend 寫入 Dexie 後 hook 自動 re-render
  const cultivation = useCultivation();

  // 階段 5A.2:flashPawToken 變動 → 1.4s × 3 動畫;結束後移除 class
  // 用 token-based 觸發比 boolean 好處理(避免「flash 中又 flash」要 reset)
  const [pawFlashing, setPawFlashing] = useState(false);
  useEffect(() => {
    if (!flashPawToken) return;
    setPawFlashing(true);
    const id = setTimeout(() => setPawFlashing(false), 1400 * 3 + 100);
    return () => clearTimeout(id);
  }, [flashPawToken]);

  function handlePawClick() {
    if (!onOpenProfile) return;
    // Android Chrome / 桌機 Chromium 短震 20ms;iOS 不支援不會錯
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(20);
    }
    onOpenProfile();
  }

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
      {/* 主資料:badge(row-span-2) + 2x2 stats(NT$ 大數用 K/M 縮寫省空間)
          階段 5A.2:掌印改可點 → 個人檔案彈窗;沒帶 onOpenProfile 時仍是裝飾 */}
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-0.5 leading-tight">
        {onOpenProfile ? (
          <button
            type="button"
            onClick={handlePawClick}
            className="row-span-2 w-9 h-9 shrink-0 rounded-full active:scale-95 transition-transform select-none"
            aria-label="個人檔案"
          >
            <img
              src="/assets/ui/badge_pet.png"
              alt=""
              aria-hidden
              draggable={false}
              className={`w-full h-full pointer-events-none ${
                pawFlashing ? 'paw-flash' : 'drop-shadow-[0_2px_4px_rgba(33,78,61,0.35)]'
              }`}
            />
          </button>
        ) : (
          <img
            src="/assets/ui/badge_pet.png"
            alt=""
            aria-hidden
            draggable={false}
            className="row-span-2 w-9 h-9 shrink-0 drop-shadow-[0_2px_4px_rgba(33,78,61,0.35)] select-none pointer-events-none"
          />
        )}
        <Stat label="神獸" value={`${summary.holdingCount}`} suffix="隻" />
        <Stat label="投入" value={formatCount(summary.totalCost)} />
        <Stat label="總市值" value={formatCount(summary.totalMarketValue)} />
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

      {/*
        合併狀態列(原本 row 2+3 因 flex-wrap 在窄螢幕被切兩行 → 第 3 行被
        浮動刷新鈕 z-10 蓋掉)。改用單行 nowrap + 橫向 overflow scroll(隱藏
        scrollbar),極端情況可橫拉看完。padding-right: 56px 預留浮動鈕半徑 +
        margin,即使 hud-height 因內容變動,也不會被刷新鈕擋住。
      */}
      <div
        className="hud-status-row mt-1.5 pt-1.5 text-[11px] leading-tight font-zh opacity-70"
        style={{ borderTop: '1px dashed rgba(212, 175, 55, 0.35)' }}
      >
        <div className="hud-status-inline flex items-center gap-x-2 whitespace-nowrap">
          <span className="whitespace-nowrap shrink-0">
            {market.icon} {market.label}
          </span>
          <span className={`whitespace-nowrap shrink-0 ${stale ? 'text-red-600' : ''}`}>
            · {updateRel}
          </span>
          <span className={`whitespace-nowrap shrink-0 ${todayClass}`}>
            · 今 {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
          </span>
          <span className="whitespace-nowrap shrink-0">
            · 💎{' '}
            <CultivationCounter
              value={cultivation.amount}
              className="text-mythic-gold-500 font-bold"
            />
          </span>
          <span className="whitespace-nowrap shrink-0">
            · 🏆 {unlockedAchievements}/{totalAchievements}
          </span>
          <span className="whitespace-nowrap shrink-0">
            · 🔥 {consecutiveDays}d
          </span>
        </div>
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
