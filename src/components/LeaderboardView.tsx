import { useEffect, useMemo, useState } from 'react';
import { ProfileAvatar } from './ProfileEditModal';
import { getLeaderboardWithSelf, type LeaderboardWithSelf } from '@/services';
import { formatReturnPercent } from '@/utils';
import type { LeaderboardCategory, LeaderboardEntry } from '@/types';

interface LeaderboardViewProps {
  /** 點玩家頭像 → 開該玩家個人頁(自己 → onOpenProfile 路由) */
  onOpenFriendProfile?: (userId: string) => void;
  /** 點自己那條 → 開自己的個人檔案編輯 modal */
  onOpenMyProfile?: () => void;
  /** 「未參加排行」狀態的 [加入] 按鈕 → 開隱私設定 */
  onOpenPrivacy?: () => void;
}

/**
 * 階段 5E.x:排行榜 UI 大改版
 *
 *  - 上方 Top 10 卡片化(膠囊型 + 圓角 + 淡金邊)
 *  - 底部 sticky 黏住自己排名(在 Top 10 內時不重複顯示)
 *  - 自己那條黃色漸層 + 金邊高亮
 *  - 第 1 名特殊金色漸層
 *  - 數值正紅 / 負綠(華人習慣)
 *  - Tab 切換淡入淡出(opacity transition)
 *  - 沒參加排行 → sticky 顯示「未參加排行」+ [加入] 按鈕
 *  - 沒交易資料 → sticky 顯示「--」
 *
 * 不再用 service 內部 cache 偷懶,改一律走 `getLeaderboardWithSelf`(內部仍 cache)
 */
export default function LeaderboardView({
  onOpenFriendProfile,
  onOpenMyProfile,
  onOpenPrivacy
}: LeaderboardViewProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('daily');
  const [data, setData] = useState<LeaderboardWithSelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFading(true);
    setLoading(true);
    // 淡出 → 抓資料 → 淡入(200ms each)
    const tFadeOut = setTimeout(() => {
      void getLeaderboardWithSelf(category).then((r) => {
        if (!mounted) return;
        setData(r);
        setLoading(false);
        setFading(false);
      });
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(tFadeOut);
    };
  }, [category]);

  const handleClickEntry = (entry: LeaderboardEntry) => {
    if (entry.isMe) {
      onOpenMyProfile?.();
    } else if (entry.userId) {
      onOpenFriendProfile?.(entry.userId);
    }
  };

  const topList = data?.topList ?? [];
  const self = data?.self;
  const showStickySelf = self !== undefined && self !== null && !self.isInTopList;

  return (
    <div className="space-y-3">
      {/* 類別切換 */}
      <div className="flex gap-1">
        <CategoryBtn
          active={category === 'daily'}
          onClick={() => setCategory('daily')}
          label="日排行"
        />
        <CategoryBtn
          active={category === 'total'}
          onClick={() => setCategory('total')}
          label="總排行"
        />
      </div>

      {/* 列表(淡入淡出) */}
      <div
        className="space-y-2 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {loading && topList.length === 0 ? (
          <SkeletonList />
        ) : topList.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="text-4xl">🏆</div>
            <p className="text-sm text-gray-700">邀請好友一起修煉吧!</p>
            <p className="text-xs text-gray-500">至少有一個好友才能比拼</p>
          </div>
        ) : (
          topList.map((e: LeaderboardEntry) => (
            <RankCard key={e.userId} entry={e} onClick={() => handleClickEntry(e)} />
          ))
        )}
      </div>

      {/* Sticky 自己(只在不在 Top 10 內時顯示) */}
      {showStickySelf && self && (
        <div
          className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1"
          style={{
            borderTop: '1px dashed rgba(218,165,32,0.4)',
            background: 'linear-gradient(to top, rgba(250,246,232,0.96), rgba(250,246,232,0.85))',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}
        >
          <SelfStickyCard
            self={self}
            onClick={() => onOpenMyProfile?.()}
            onJoin={() => onOpenPrivacy?.()}
          />
        </div>
      )}
    </div>
  );
}

// ─── 類別切換按鈕 ───────────────────────────────────────

function CategoryBtn({
  active,
  onClick,
  label
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 px-3 rounded-md text-sm font-bold transition-colors ${
        active ? 'bg-mythic-jade-100 text-mythic-jade-700' : 'bg-white/40 text-gray-500'
      }`}
    >
      {label}
    </button>
  );
}

// ─── 排名卡片 ───────────────────────────────────────────

function rankDisplay(rank: number): { text: string; cls: string } {
  if (rank === 1) return { text: '🥇', cls: 'text-amber-500' };
  if (rank === 2) return { text: '🥈', cls: 'text-gray-400' };
  if (rank === 3) return { text: '🥉', cls: 'text-orange-500' };
  return { text: String(rank), cls: 'text-gray-600' };
}

function RankCard({
  entry,
  onClick
}: {
  entry: LeaderboardEntry;
  onClick: () => void;
}) {
  const rd = useMemo(() => rankDisplay(entry.rank), [entry.rank]);
  const isMe = entry.isMe;
  const isFirst = entry.rank === 1;
  const notJoining = !entry.joinLeaderboard && !isMe;

  // 樣式分支:
  //   isMe        → 黃色漸層 + 金邊加粗
  //   isFirst     → 金色漸層
  //   notJoining  → 灰色 opacity-60
  //   default     → 白色 capsule
  const cardClass = isMe
    ? 'bg-gradient-to-br from-amber-100 to-amber-200 border-2 border-amber-500 shadow-[0_4px_12px_rgba(218,165,32,0.3)]'
    : isFirst
      ? 'bg-gradient-to-br from-yellow-100 to-amber-100 border border-amber-300 shadow-[0_2px_8px_rgba(218,165,32,0.2)]'
      : notJoining
        ? 'bg-white/60 border border-gray-200 opacity-60'
        : 'bg-white/90 border border-amber-200/40 shadow-[0_2px_8px_rgba(0,0,0,0.06)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-left active:scale-[0.98] transition-transform ${cardClass}`}
    >
      {/* 排名數字 / emoji */}
      <div
        className={`w-10 text-center font-bold ${rd.cls} ${
          isMe ? 'text-2xl' : entry.rank <= 3 ? 'text-2xl' : 'text-lg'
        }`}
      >
        {rd.text}
      </div>

      {/* 頭像 */}
      <div className="shrink-0">
        <ProfileAvatar avatarCreatureId={entry.avatarCreatureId} size={40} />
      </div>

      {/* 暱稱 + 稱號 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span
            className={`truncate font-bold ${
              isMe ? 'text-amber-800' : 'text-gray-800'
            } text-base`}
          >
            {isMe ? '你' : entry.nickname}
          </span>
          {isMe && (
            <span className="shrink-0 ml-1 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
              YOU
            </span>
          )}
          <span className="shrink-0 text-base">{entry.titleEmoji}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate">{entry.titleName}</div>
      </div>

      {/* 數值 */}
      <div className="w-20 text-right shrink-0">
        {entry.value === null ? (
          <span className="text-xs text-gray-400 italic">
            {notJoining ? '未參加' : '—'}
          </span>
        ) : (
          <span
            className={`text-base font-bold tabular-nums ${
              entry.value >= 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {formatReturnPercent(entry.value)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Sticky 自己那條 ────────────────────────────────────

function SelfStickyCard({
  self,
  onClick,
  onJoin
}: {
  self: NonNullable<LeaderboardWithSelf['self']>;
  onClick: () => void;
  onJoin: () => void;
}) {
  // 邊界 case:
  //   isParticipating=false → 顯示「未參加排行」+ [加入] 按鈕
  //   hasData=false → 顯示「--」「尚無資料」
  //   else → 跟正常卡一樣顯示
  const entry = self.entry;
  const rank = self.rank;
  const showJoin = !self.isParticipating;
  const noData = !self.hasData && !showJoin;

  const rd = rank !== null ? rankDisplay(rank) : { text: '--', cls: 'text-gray-400' };

  return (
    <button
      type="button"
      onClick={showJoin ? onJoin : onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-left active:scale-[0.98] transition-transform bg-gradient-to-br from-amber-100 to-amber-200 border-2 border-amber-500 shadow-[0_4px_12px_rgba(218,165,32,0.3)]"
    >
      <div className={`w-10 text-center text-2xl font-bold ${rd.cls}`}>{rd.text}</div>

      <div className="shrink-0">
        <ProfileAvatar avatarCreatureId={entry?.avatarCreatureId ?? null} size={40} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate font-bold text-amber-800 text-base">你</span>
          <span className="shrink-0 ml-1 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
            YOU
          </span>
          {entry && <span className="shrink-0 text-base">{entry.titleEmoji}</span>}
        </div>
        <div className="text-[11px] text-gray-600 truncate">
          {showJoin ? '未參加排行' : noData ? '尚無資料' : entry?.titleName}
        </div>
      </div>

      <div className="w-20 text-right shrink-0">
        {showJoin ? (
          <span className="inline-block px-2 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold">
            加入 ›
          </span>
        ) : entry?.value === null || noData ? (
          <span className="text-xs text-gray-500 italic">—</span>
        ) : (
          <span
            className={`text-base font-bold tabular-nums ${
              (entry?.value ?? 0) >= 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {formatReturnPercent(entry?.value ?? null)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── 骨架屏 ─────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/60 border border-gray-200"
        >
          <div className="w-10 h-6 bg-gray-200 rounded" />
          <div className="w-10 h-10 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-2 bg-gray-200 rounded w-1/4" />
          </div>
          <div className="w-16 h-4 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
