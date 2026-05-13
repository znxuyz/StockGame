import { useEffect, useMemo, useState } from 'react';
import { ProfileAvatar } from './ProfileEditModal';
import {
  formatInviteCode,
  getLeaderboardWithSelf,
  getMyProfile,
  type LeaderboardWithSelf
} from '@/services';
import { formatReturnPercent } from '@/utils';
import type { LeaderboardCategory, LeaderboardEntry } from '@/types';

interface LeaderboardViewProps {
  /** 點別人那條 → caller 開對方個人頁 */
  onOpenFriendProfile?: (userId: string) => void;
  /** 點自己那條 → caller 開 ProfileEditModal */
  onOpenMyProfile?: () => void;
  /** 「未參加排行 + [加入]」按鈕 → caller 開 PrivacySettingsModal */
  onOpenPrivacy?: () => void;
  /** 空狀態「加好友」按鈕 → caller 切到 FriendsModal 搜尋 tab */
  onSwitchToSearch?: () => void;
  /** 操作完成 toast(複製 / 分享 提示) */
  onActionComplete?: (message: string) => void;
}

/**
 * 階段 5E.x 改版 2:獨立常駐排行榜 + 完整可滾動 + 永遠 sticky 自己。
 *
 * 變更:
 *  - 改顯示「完整列表」(不只 Top 10),玩家可滾去看自己真實位置
 *  - 自己**永遠 sticky**(即使在主列表內);主列表中的自己仍是普通樣式,
 *    sticky 才用黃綠高亮 — 視覺不重複
 *  - 頂部資訊欄:「共 N 人參賽 · 你目前第 K 名」,打開即見快速資訊
 *  - 沒好友(fullList 只有自己 / 0 人)→ 空狀態 + [邀請朋友] [加好友]
 *  - 邀請朋友 = navigator.share 帶玩家邀請碼;不支援則複製到剪貼簿
 *  - Tab 切換:列表淡入淡出 200ms
 */
export default function LeaderboardView({
  onOpenFriendProfile,
  onOpenMyProfile,
  onOpenPrivacy,
  onSwitchToSearch,
  onActionComplete
}: LeaderboardViewProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('daily');
  const [data, setData] = useState<LeaderboardWithSelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFading(true);
    setLoading(true);
    const t = setTimeout(() => {
      void getLeaderboardWithSelf(category).then((r) => {
        if (!mounted) return;
        setData(r);
        setLoading(false);
        setFading(false);
      });
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [category]);

  const handleClickEntry = (entry: LeaderboardEntry) => {
    if (entry.isMe) {
      onOpenMyProfile?.();
    } else if (entry.userId) {
      onOpenFriendProfile?.(entry.userId);
    }
  };

  const fullList = data?.fullList ?? [];
  const self = data?.self;
  // 「沒好友」= 列表只有自己一個 OR 完全空
  const hasOthers = fullList.some((e) => !e.isMe);
  const showEmpty = !loading && !hasOthers;

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

      {/* 頂部資訊欄(只在有人參賽時顯示) */}
      {!showEmpty && data && (
        <div className="text-[11px] text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5 px-1">
          <span>
            共 <b className="text-gray-800">{data.totalCount}</b> 人參賽
          </span>
          {self?.rank !== null && self?.rank !== undefined && (
            <span>
              你目前第{' '}
              <b className="text-amber-700">{self.rank}</b> 名
            </span>
          )}
        </div>
      )}

      {/* 主體 */}
      <div
        className="space-y-1.5 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {showEmpty ? (
          <EmptyState
            self={self ?? null}
            onSwitchToSearch={onSwitchToSearch}
            onActionComplete={onActionComplete}
          />
        ) : loading && fullList.length === 0 ? (
          <SkeletonList />
        ) : (
          fullList.map((e: LeaderboardEntry) => (
            <RankCard key={e.userId} entry={e} onClick={() => handleClickEntry(e)} />
          ))
        )}
      </div>

      {/* Sticky 自己(改版 2:永遠顯示,即使在列表內) */}
      {!showEmpty && self && (
        <div
          className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 z-10"
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

// ─── 排名卡片(主列表用,純白色,不高亮自己)───────────

function rankDisplay(rank: number): { text: string; cls: string } {
  if (rank === 1) return { text: '🥇', cls: 'text-amber-500' };
  if (rank === 2) return { text: '🥈', cls: 'text-gray-400' };
  if (rank === 3) return { text: '🥉', cls: 'text-orange-500' };
  return { text: String(rank), cls: 'text-gray-700' };
}

function RankCard({
  entry,
  onClick
}: {
  entry: LeaderboardEntry;
  onClick: () => void;
}) {
  const rd = useMemo(() => rankDisplay(entry.rank), [entry.rank]);
  const isFirst = entry.rank === 1;
  const notJoining = !entry.joinLeaderboard && !entry.isMe;

  // 主列表內自己不再特別高亮(sticky 才高亮);第 1 名仍給金漸層
  const cardClass = isFirst
    ? 'bg-gradient-to-br from-yellow-50 to-amber-100 border border-amber-300 shadow-[0_2px_8px_rgba(218,165,32,0.18)]'
    : notJoining
      ? 'bg-white/60 border border-gray-200 opacity-60'
      : 'bg-white/95 border border-gray-200 shadow-[0_2px_6px_rgba(0,0,0,0.05)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-left active:scale-[0.98] transition-transform ${cardClass}`}
    >
      <div
        className={`w-10 text-center font-bold ${rd.cls} ${
          entry.rank <= 3 ? 'text-2xl' : 'text-lg'
        }`}
      >
        {rd.text}
      </div>

      <div className="shrink-0">
        <ProfileAvatar avatarCreatureId={entry.avatarCreatureId} size={40} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate font-bold text-gray-800 text-base">{entry.nickname}</span>
          <span className="shrink-0 text-base">{entry.titleEmoji}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate">{entry.titleName}</div>
      </div>

      <div className="w-20 text-right shrink-0">
        {entry.value === null ? (
          <span className="text-xs text-gray-400 italic">{notJoining ? '未參加' : '—'}</span>
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

// ─── Sticky 自己(黃綠色高亮,永遠顯示)───────────────

function SelfStickyCard({
  self,
  onClick,
  onJoin
}: {
  self: NonNullable<LeaderboardWithSelf['self']>;
  onClick: () => void;
  onJoin: () => void;
}) {
  const entry = self.entry;
  const rank = self.rank;
  const showJoin = !self.isParticipating;
  const noData = !self.hasData && !showJoin;
  const rd = rank !== null ? rankDisplay(rank) : { text: '--', cls: 'text-gray-500' };

  return (
    <button
      type="button"
      onClick={showJoin ? onJoin : onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-[28px] text-left active:scale-[0.98] transition-transform"
      style={{
        background: 'linear-gradient(135deg, #DCE775 0%, #C0CA33 100%)',
        border: '2px solid #9CCC65',
        boxShadow: '0 4px 16px rgba(156,204,101,0.4)'
      }}
    >
      <div className={`w-10 text-center text-2xl font-bold ${rd.cls}`}>{rd.text}</div>

      <div className="shrink-0">
        <ProfileAvatar avatarCreatureId={entry?.avatarCreatureId ?? null} size={40} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate font-bold text-base" style={{ color: '#1A1A1A' }}>
            你
          </span>
          <span className="shrink-0 ml-1 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
            YOU
          </span>
          {entry && <span className="shrink-0 text-base">{entry.titleEmoji}</span>}
        </div>
        <div className="text-[11px] text-gray-800 truncate">
          {showJoin ? '未參加排行' : noData ? '尚無資料' : entry?.titleName}
        </div>
      </div>

      <div className="w-20 text-right shrink-0">
        {showJoin ? (
          <span className="inline-block px-2 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold">
            加入 ›
          </span>
        ) : noData || entry?.value === null ? (
          <span className="text-xs text-gray-700 italic">—</span>
        ) : (
          <span
            className={`text-base font-bold tabular-nums ${
              (entry?.value ?? 0) >= 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {formatReturnPercent(entry?.value ?? null)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── 沒好友空狀態 ──────────────────────────────────────

function EmptyState({
  self,
  onSwitchToSearch,
  onActionComplete
}: {
  self: LeaderboardWithSelf['self'] | null;
  onSwitchToSearch?: () => void;
  onActionComplete?: (message: string) => void;
}) {
  async function handleInvite() {
    const profile = await getMyProfile();
    const code = profile?.inviteCode ? formatInviteCode(profile.inviteCode) : null;
    const url = 'https://stockgame-692.pages.dev';
    const text = code
      ? `來玩神獸股市!用我的邀請碼 ${code} 加我好友,一起競爭修為高峰 → ${url}`
      : `來玩神獸股市,一起競爭修為高峰 → ${url}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: '神獸股市', text, url });
        return;
      } catch {
        // 用戶取消 / 不支援 → fallback 複製
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      onActionComplete?.('🔗 邀請文已複製');
    } catch {
      onActionComplete?.('⚠️ 無法複製到剪貼簿');
    }
  }

  return (
    <div className="text-center py-6 space-y-3">
      <div className="text-5xl">🏆</div>
      <p className="text-base font-bold text-gray-800">還沒有道友陪你修煉</p>
      <p className="text-xs text-gray-600 leading-relaxed">
        邀請朋友加入,一起競爭修為高峰!
      </p>

      <div className="flex flex-col gap-2 max-w-xs mx-auto pt-1">
        <button
          type="button"
          onClick={handleInvite}
          className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
        >
          📤 邀請朋友
        </button>
        {onSwitchToSearch && (
          <button
            type="button"
            onClick={onSwitchToSearch}
            className="w-full py-2 bg-white/70 text-gray-700 border border-gray-300 rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
          >
            🔍 加好友
          </button>
        )}
      </div>

      {/* 自己目前數據 */}
      {self?.entry && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-700 space-y-1">
          <p className="text-gray-500 mb-1">你目前的數據</p>
          <p>
            <span className="text-gray-500">今日報酬率</span>{' '}
            <span
              className={`font-bold ${
                (self.entry.value ?? 0) >= 0 ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {self.entry.value !== null ? formatReturnPercent(self.entry.value) : '—'}
            </span>
          </p>
          <p>
            <span className="text-gray-500">稱號</span>{' '}
            <span className="font-bold text-amber-700">
              {self.entry.titleEmoji} {self.entry.titleName}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 骨架屏 ─────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="space-y-1.5 animate-pulse">
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
