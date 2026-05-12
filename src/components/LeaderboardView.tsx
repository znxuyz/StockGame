import { useEffect, useState } from 'react';
import { ProfileAvatar } from './ProfileEditModal';
import { getLeaderboard } from '@/services';
import { formatReturnPercent } from '@/utils';
import type { LeaderboardCategory, LeaderboardEntry } from '@/types';

interface LeaderboardViewProps {
  /** 點玩家頭像 → 開該玩家個人頁(自己 → null,不該跳) */
  onOpenFriendProfile?: (userId: string) => void;
}

const RANK_EMOJI = ['🥇', '🥈', '🥉'];

/**
 * 階段 5E:好友報酬率排行榜。
 *
 *  - 切換「今日 / 總報酬率」兩個 category
 *  - 自己永遠出現 + 高亮(背景金色)
 *  - 沒參加排行的好友顯示「未參加排行」+ 灰色(value=null)
 *  - 進頁面時 service 內已順手 generateMySnapshot,確保今日有資料
 *  - cache 1 分鐘
 */
export default function LeaderboardView({ onOpenFriendProfile }: LeaderboardViewProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('daily');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeaderboard(category).then((r) => {
      setEntries(r);
      setLoading(false);
    });
  }, [category]);

  return (
    <div className="space-y-3">
      {/* 類別切換 */}
      <div className="flex gap-1">
        <CategoryBtn
          active={category === 'daily'}
          onClick={() => setCategory('daily')}
          label="今日報酬率"
        />
        <CategoryBtn
          active={category === 'total'}
          onClick={() => setCategory('total')}
          label="總報酬率"
        />
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 italic text-center py-6">載入中⋯</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <div className="text-4xl">🏆</div>
          <p className="text-sm text-gray-700">邀請好友一起修煉吧!</p>
          <p className="text-xs text-gray-500">至少有一個好友才能比拼</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <LeaderboardRow
              key={e.userId}
              entry={e}
              onOpenFriendProfile={onOpenFriendProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
      className={`flex-1 py-1.5 px-2 rounded-md text-xs font-bold transition-colors ${
        active ? 'bg-mythic-jade-100 text-mythic-jade-700' : 'bg-white/40 text-gray-500'
      }`}
    >
      {label}
    </button>
  );
}

function LeaderboardRow({
  entry,
  onOpenFriendProfile
}: {
  entry: LeaderboardEntry;
  onOpenFriendProfile?: (userId: string) => void;
}) {
  const rankLabel =
    entry.rank <= 3 ? RANK_EMOJI[entry.rank - 1] : `${entry.rank}.`;
  const isMe = entry.isMe;
  const notJoining = !entry.joinLeaderboard && !isMe;

  return (
    <div
      className={`item-card px-3 py-2 flex items-center gap-2 ${
        isMe ? 'ring-2 ring-amber-400 bg-amber-50/60' : ''
      } ${notJoining ? 'opacity-60' : ''}`}
    >
      <div className="w-8 text-center text-sm font-bold text-amber-700 shrink-0">
        {rankLabel}
      </div>
      <button
        type="button"
        onClick={() => !isMe && entry.userId && onOpenFriendProfile?.(entry.userId)}
        disabled={isMe}
        className="shrink-0"
      >
        <ProfileAvatar avatarCreatureId={entry.avatarCreatureId} size={32} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-800 truncate">
          {isMe ? <span className="text-amber-700">你</span> : entry.nickname}
        </div>
        <div className="text-[10px] text-gray-500">
          {entry.titleEmoji} {entry.titleName}
        </div>
      </div>
      <div className="text-right shrink-0">
        {entry.value === null ? (
          <span className="text-xs text-gray-400 italic">
            {notJoining ? '未參加排行' : '—'}
          </span>
        ) : (
          <span
            className={`text-sm font-bold tabular-nums ${
              entry.value >= 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {formatReturnPercent(entry.value)}
          </span>
        )}
      </div>
    </div>
  );
}
