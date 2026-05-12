import { useEffect, useState } from 'react';
import {
  getPreviousMonth,
  markMonthlyReviewShown,
  wasMonthlyReviewShown,
  getMonthlyStats
} from '@/services/monthlyStatsService';

interface MonthlyReviewPromptProps {
  /** 點「查看完整回顧」時 callback,App 開 MonthlyReviewModal(帶 year/month) */
  onView: (year: number, month: number) => void;
}

/**
 * 階段 5C:每月 1 日自動彈出上個月回顧提示。
 *
 * 觸發條件:
 *  - 今天是 1-3 號(寬鬆窗口,玩家若 1 號沒開 app 也能看到)
 *  - localStorage 沒記錄過上個月 review(`monthlyReviewShown_YYYY-MM`)
 *  - 上個月實際有戰績(getMonthlyStats.isEmpty === false)
 *
 * 點「查看完整回顧」→ onView(year, month) + 寫 localStorage
 * 點「之後再說」→ 寫 localStorage 不再提示
 */
export default function MonthlyReviewPrompt({ onView }: MonthlyReviewPromptProps) {
  const [visible, setVisible] = useState(false);
  const [target, setTarget] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    // 只在月初 1-3 日提示(寬鬆窗口)
    if (dayOfMonth > 3) return;

    const prev = getPreviousMonth(today);
    if (wasMonthlyReviewShown(prev.year, prev.month)) return;

    // 確認上個月有戰績才提示
    let cancelled = false;
    (async () => {
      const stats = await getMonthlyStats(prev.year, prev.month);
      if (cancelled) return;
      if (!stats.isEmpty) {
        setTarget(prev);
        setVisible(true);
      } else {
        // 沒戰績也標記已提示,避免明天又跑 getMonthlyStats
        markMonthlyReviewShown(prev.year, prev.month);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !target) return null;

  function handleView() {
    if (!target) return;
    markMonthlyReviewShown(target.year, target.month);
    setVisible(false);
    onView(target.year, target.month);
  }

  function handleDismiss() {
    if (!target) return;
    markMonthlyReviewShown(target.year, target.month);
    setVisible(false);
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white/95 backdrop-blur-md border border-amber-200 rounded-2xl shadow-xl max-w-sm w-full p-5 text-center space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl">📜</div>
        <h2 className="text-lg font-bold text-gray-800">
          你的 {target.month} 月修煉錄
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          上個月在神獸股市的點點滴滴<br />
          來看看這個月你獲得了什麼吧
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
          >
            之後再說
          </button>
          <button
            type="button"
            onClick={handleView}
            className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold active:scale-95 transition-transform"
          >
            查看完整回顧
          </button>
        </div>
      </div>
    </div>
  );
}
