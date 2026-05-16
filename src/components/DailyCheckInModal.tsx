import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { claimTodayLogin, STREAK_MILESTONES } from '@/services';
import { useOnline } from '@/lib/useOnline';
import type { LoginStreak } from '@/types';

/**
 * 每日簽到彈窗(階段 3.2)。
 *
 * 觸發時機:App.tsx 啟動後 await checkAndUpdateStreak(),
 * 若 isNewDay = true 且 todayClaimed = false → setCheckInStreak,本元件 open。
 *
 * UI:
 *   - 「你已連續修煉 N 日」+ 歷史最長(若 current < longest)
 *   - 7 日進度格(過去日 ✓ / 今日 ⭐ + 金色脈動 / 未來日灰 / 第 7 日 🎁)
 *   - 今日獎勵 +10
 *   - 命中里程碑時加「里程碑獎勵 +N」
 *   - 下個里程碑提示「連登 X 日 🎁 +N」
 *   - 領取按鈕(amber-500),點完 2s 自動關閉
 *
 * 飄字動畫:claimTodayLogin → earnCultivation → eventBus emit → CultivationFloater 自動觸發
 *           大型里程碑慶祝動畫(全螢幕)留階段 3.3
 */

interface DailyCheckInModalProps {
  open: boolean;
  onClose: () => void;
  streak: LoginStreak;
}

const WEEK_DAYS = 7;
/** 領取後自動關彈窗的延遲,讓飄字動畫有時間跑完 */
const AUTO_CLOSE_MS = 2000;

export default function DailyCheckInModal({ open, onClose, streak }: DailyCheckInModalProps) {
  const [claiming, setClaiming] = useState(false);
  /** 本地鏡像 todayClaimed,讓「領取後立刻變灰」不必等 useLiveQuery 回流 */
  const [claimedLocal, setClaimedLocal] = useState(streak.todayClaimed);
  const online = useOnline();
  /** 領取失敗時的錯誤訊息(顯示在按鈕下方紅字,玩家可重試) */
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** 領取後的自動關閉 timer ref,unmount / 手動關時清掉避免 stale onClose 觸發 */
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // unmount 時清 pending auto-close timer
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, []);

  const isClaimed = streak.todayClaimed || claimedLocal;
  const todayMilestone = STREAK_MILESTONES.find((m) => m.day === streak.currentStreak);
  const nextMilestone = STREAK_MILESTONES.find((m) => m.day > streak.currentStreak) ?? null;
  const daysToNext = nextMilestone ? nextMilestone.day - streak.currentStreak : 0;

  /**
   * 7 日格子顯示「目前處於本週第幾天」。
   * 連登天數可能超過 7,用 modulo 算位置:streak=8 → 第 1 格(進入下週),streak=14 → 第 7 格
   * 但 streak=7 → 第 7 格(里程碑日!)
   */
  const dayInWeek = ((streak.currentStreak - 1) % WEEK_DAYS) + 1;

  const handleClaim = async () => {
    if (claiming || isClaimed) return;
    setClaiming(true);
    setErrorMsg(null);
    try {
      const result = await claimTodayLogin();
      if (result.success) {
        // 立刻反映 UI(飄字由 eventBus 自動觸發,不用這裡 emit)
        setClaimedLocal(true);
        // 2s 後自動關,給玩家看完飄字。timer 存 ref 讓 unmount 時可清
        autoCloseTimerRef.current = setTimeout(() => {
          autoCloseTimerRef.current = null;
          onClose();
        }, AUTO_CLOSE_MS);
      } else if (result.reason === 'already_claimed') {
        // 後端說已領 → 鏡像本地 state,讓按鈕變灰
        setClaimedLocal(true);
      }
    } catch (e) {
      // 防 freeze:任何 throw(IndexedDB / Dexie 錯)show 錯誤訊息讓玩家可重試
      console.error('[DailyCheckInModal] claim failed:', e);
      setErrorMsg(e instanceof Error ? e.message : '領取失敗,請稍後再試');
    } finally {
      // 不論成功失敗都解鎖 button
      setClaiming(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="🎁 修煉日誌">
      <div className="space-y-4">
        {/* 連登 N 日 + 歷史最長(若 current < longest 才顯示) */}
        <div className="text-center">
          <p className="text-base">
            你已連續修煉{' '}
            <b className="text-amber-500 text-2xl tabular-nums">{streak.currentStreak}</b> 日
          </p>
          {streak.longestStreak > streak.currentStreak && (
            <p className="text-xs text-gray-500 mt-1">歷史最長:{streak.longestStreak} 日</p>
          )}
        </div>

        {/* 7 日進度格 */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: WEEK_DAYS }, (_, i) => {
            const dayNum = i + 1;
            const isPast = dayNum < dayInWeek;
            const isToday = dayNum === dayInWeek;
            const isMilestone = dayNum === WEEK_DAYS; // 第 7 格 = 一週終點

            const baseCls =
              'aspect-square rounded-lg border-2 flex flex-col items-center justify-center text-xs ';
            let stateCls = '';
            if (isPast) stateCls = 'bg-emerald-100 border-emerald-300 text-emerald-700';
            else if (isToday)
              stateCls = 'bg-amber-100 border-amber-400 text-amber-700 font-bold animate-pulse';
            else if (isMilestone) stateCls = 'bg-amber-50 border-amber-200 text-amber-600';
            else stateCls = 'bg-gray-50 border-gray-200 text-gray-400';

            const icon = isPast ? '✓' : isToday ? '⭐' : isMilestone ? '🎁' : '';

            return (
              <div key={dayNum} className={baseCls + stateCls}>
                <div className="text-base leading-none">{icon}</div>
                <div className="mt-0.5 text-[10px] tabular-nums">{dayNum}</div>
              </div>
            );
          })}
        </div>

        {/* 獎勵詳情 */}
        <div className="data-card p-3 space-y-2 text-sm">
          <div className="flex justify-between items-baseline">
            <span className="text-gray-500">今日獎勵</span>
            <span className="text-amber-500 font-bold">💎 +10 修為</span>
          </div>
          {todayMilestone && (
            <div className="flex justify-between items-baseline">
              <span className="text-amber-600">🎉 里程碑獎勵</span>
              <span className="text-amber-500 font-bold">🎁 +{todayMilestone.reward} 修為</span>
            </div>
          )}
          {nextMilestone && (
            <div className="flex justify-between items-baseline pt-2 border-t border-amber-300/30 text-xs">
              <span className="text-gray-500">下個里程碑(還需 {daysToNext} 日)</span>
              <span className="text-gray-700">
                🎁 +{nextMilestone.reward}
              </span>
            </div>
          )}
        </div>

        {/* 領取按鈕 */}
        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming || isClaimed || !online}
          title={!online ? '離線中無法操作' : undefined}
          className={`w-full py-3 rounded-lg font-bold transition ${
            isClaimed || !online
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 shadow-md'
          }`}
        >
          {isClaimed
            ? '今日已領取 ✓'
            : claiming
              ? '領取中⋯'
              : !online
                ? '📡 離線中'
                : '領取今日修煉'}
        </button>
        {errorMsg && (
          <p className="text-xs text-red-600 text-center -mt-2">⚠️ {errorMsg}</p>
        )}
      </div>
    </Modal>
  );
}
