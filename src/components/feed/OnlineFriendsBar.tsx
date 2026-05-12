import { useEffect, useState } from 'react';
import { ProfileAvatar } from '../ProfileEditModal';
import { getOnlineFriends, type OnlineFriend } from '@/services';

interface OnlineFriendsBarProps {
  /** 點頭像 → 開該好友個人頁 */
  onOpenFriendProfile?: (userId: string) => void;
}

const REFRESH_MS = 30_000;
const MAX_VISIBLE = 5;

/**
 * 階段 5D:在線好友橫向 bar(放在 FriendsModal 動態 tab 頂部)。
 *
 *  - 5 分鐘內 = 'online'
 *  - 顯示最多 5 個頭像;超過顯示「+N」
 *  - 30 秒自動刷新
 *  - 點頭像跳對方個人頁
 *  - 沒在線好友 → 整個 bar 隱藏(避免佔空間)
 */
export default function OnlineFriendsBar({ onOpenFriendProfile }: OnlineFriendsBarProps) {
  const [friends, setFriends] = useState<OnlineFriend[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function reload() {
      const list = await getOnlineFriends();
      if (mounted) setFriends(list);
    }
    void reload();
    const id = setInterval(reload, REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (friends.length === 0) return null;
  const visible = showAll ? friends : friends.slice(0, MAX_VISIBLE);
  const overflow = friends.length - MAX_VISIBLE;

  return (
    <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 px-3 py-2">
      <div className="text-[11px] font-bold text-emerald-700 mb-2">
        🟢 在線好友 ({friends.length})
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {visible.map((f) => (
          <button
            key={f.userId}
            type="button"
            onClick={() => onOpenFriendProfile?.(f.userId)}
            className="flex flex-col items-center gap-0.5 shrink-0 active:scale-95 transition-transform"
            aria-label={`查看 ${f.profile.nickname}`}
          >
            <div className="relative">
              <ProfileAvatar avatarCreatureId={f.profile.avatarCreatureId} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <span className="text-[10px] text-gray-700 truncate max-w-[48px]">
              {f.profile.nickname}
            </span>
          </button>
        ))}
        {!showAll && overflow > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="shrink-0 w-10 h-10 rounded-full bg-white/80 border-2 border-emerald-300 text-xs font-bold text-emerald-700"
            aria-label="顯示全部在線好友"
          >
            +{overflow}
          </button>
        )}
      </div>
    </div>
  );
}
