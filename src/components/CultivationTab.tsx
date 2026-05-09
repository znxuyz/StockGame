import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useCultivation } from '@/hooks/useCultivation';
import { formatInt, formatCount, relativeTime } from '@/utils';
import type { CultivationLog, CultivationReason } from '@/types';

/**
 * 修為紀錄 tab(階段 2.5)。
 *
 * 顯示三段:
 *   1. 當前修為 + lifetimeEarned + lifetimeSpent(useCultivation hook)
 *   2. 變動歷史(時間倒序,初始 50 筆,點「載入更多」+50)
 *   3. 每筆紀錄:emoji + 變動量 + reasonText + 相對時間
 *
 * 點擊紀錄:有 relatedPetId 才可點,觸發 onPetClick(callback 由 caller 傳)。
 * onPetClick 不傳就純顯示不可點。
 */

interface CultivationTabProps {
  /** 點擊紀錄(有 relatedPetId 才可點)→ 跳該 pet 詳細頁;不傳則純展示 */
  onPetClick?: (petId: string) => void;
}

const PAGE_SIZE = 50;

/** reason → emoji,讓列表一眼分類。預留 reason 都先給 emoji,後階段啟用時 UI 已準備好。 */
const REASON_EMOJI: Record<CultivationReason, string> = {
  // 賺取
  pet_level_up: '🆙',
  realm_breakthrough: '🌟',
  effect_unlock: '✨',
  pet_added_codex: '🎴',
  sell_profit: '💰',
  daily_login: '📅',
  streak_7: '🔥',
  streak_30: '🔥',
  daily_task: '✅',
  weekly_task: '✅',
  achievement: '🏆',
  // 消耗(階段 4 才會有 caller)
  rename: '📝',
  realm_boost: '⚡',
  effect_boost: '🔧',
  recolor: '🎨',
  background: '🖼',
  theme: '🎭',
  eternal: '🪦',
  unlock_story: '📖'
};

export default function CultivationTab({ onPetClick }: CultivationTabProps) {
  const detail = useCultivation();
  const [limit, setLimit] = useState(PAGE_SIZE);

  // 訂閱 cultivationLog,任何 earn/spend 寫入自動 retrigger
  const logs = useLiveQuery(
    () => db.cultivationLog.orderBy('createdAt').reverse().limit(limit).toArray(),
    [limit],
    [] as CultivationLog[]
  );

  // 為了知道是否還有更多紀錄(隱藏「載入更多」按鈕用)
  const totalCount = useLiveQuery(() => db.cultivationLog.count(), [], 0);
  const hasMore = logs.length < totalCount;

  return (
    <div className="space-y-3">
      {/* 統計卡:當前餘額 + lifetime */}
      <div className="data-card p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl">💎</span>
          <span className="text-lg font-bold text-mythic-jade-500">當前修為</span>
          <span className="ml-auto text-2xl font-bold text-mythic-gold-500 tabular-nums">
            {formatInt(detail.amount)}
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-amber-300/30 flex justify-between text-xs">
          <span className="text-gray-600">
            累計獲得 <b className="text-emerald-600">{formatInt(detail.lifetimeEarned)}</b>
          </span>
          <span className="text-gray-600">
            累計消耗 <b className="text-red-600">{formatInt(detail.lifetimeSpent)}</b>
          </span>
        </div>
      </div>

      {/* 歷史列表 */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">修為歷史</h4>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">還沒有任何修為紀錄</p>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} onPetClick={onPetClick} />
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              className="text-sm text-mythic-jade-500 hover:underline"
            >
              ── 載入更多({totalCount - logs.length} 筆)──
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LogRow({
  log,
  onPetClick
}: {
  log: CultivationLog;
  onPetClick?: (petId: string) => void;
}) {
  const isEarn = log.change > 0;
  const isClickable = onPetClick && log.relatedPetId;
  const handleClick = () => {
    if (isClickable && log.relatedPetId) onPetClick(log.relatedPetId);
  };

  return (
    <li
      className={`item-card px-3 py-2 flex items-center gap-3 ${
        isClickable ? 'cursor-pointer hover:bg-white/60' : ''
      }`}
      onClick={isClickable ? handleClick : undefined}
    >
      <span className="text-lg shrink-0">{REASON_EMOJI[log.reason] ?? '💎'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-bold tabular-nums shrink-0 ${
              isEarn ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {isEarn ? '+' : ''}
            {formatCount(log.change)}
          </span>
          <span className="text-sm text-gray-700 truncate">{log.reasonText}</span>
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">{relativeTime(log.createdAt)}</div>
      </div>
    </li>
  );
}
