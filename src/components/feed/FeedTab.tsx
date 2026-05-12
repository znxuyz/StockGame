import { useCallback, useEffect, useRef, useState } from 'react';
import OnlineFriendsBar from './OnlineFriendsBar';
import FeedEventCard from './FeedEventCard';
import { getFriendsFeed } from '@/services';
import type { FeedEventWithMeta } from '@/types';

const PAGE_SIZE = 30;
/** localStorage key:最後一次看 feed 的時間,給紅點未讀數用 */
export const LAST_FEED_VIEW_KEY = 'feed_last_view_at_v1';

interface FeedTabProps {
  myUserId: string | null;
  /** 點頭像跳對方個人頁 */
  onOpenFriendProfile?: (userId: string) => void;
  /** 點神獸 → caller 決定路由(圖鑑 / PetInfo) */
  onOpenCreature?: (speciesId: string) => void;
  /** 點「+ 發布修仙分享」→ caller 開 CultivationShareModal */
  onOpenShareComposer?: () => void;
}

/**
 * 階段 5D:動態牆 tab(放在 FriendsModal 第 4 個 tab)。
 *
 *  - 頂部 OnlineFriendsBar
 *  - 中段 feed 列表(無限滾動,IntersectionObserver 觸底載入下一頁)
 *  - 底部「+ 發布修仙分享」按鈕
 *  - 進入時自動寫 localStorage 'feed_last_view_at_v1' = now,
 *    供 BottomBar / FriendsModal tab badge 計算未讀數
 *
 * 沒任何好友 / 動態 → 顯示空狀態
 */
export default function FeedTab({
  myUserId,
  onOpenFriendProfile,
  onOpenCreature,
  onOpenShareComposer
}: FeedTabProps) {
  const [events, setEvents] = useState<FeedEventWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const list = await getFriendsFeed(PAGE_SIZE, 0);
    setEvents(list);
    setLoading(false);
    setExhausted(list.length < PAGE_SIZE);
    // 標記「已讀」
    try {
      localStorage.setItem(LAST_FEED_VIEW_KEY, new Date().toISOString());
    } catch {
      // localStorage 滿 / 私密模式 → 忽略
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (exhausted || loadingMore) return;
    setLoadingMore(true);
    const next = await getFriendsFeed(PAGE_SIZE, events.length);
    setLoadingMore(false);
    if (next.length === 0) {
      setExhausted(true);
      return;
    }
    setEvents((prev) => [...prev, ...next]);
    if (next.length < PAGE_SIZE) setExhausted(true);
  }, [events.length, exhausted, loadingMore]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // IntersectionObserver 觸底載入
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  function handleDeleted(eventId: number) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  return (
    <div className="space-y-3">
      <OnlineFriendsBar onOpenFriendProfile={onOpenFriendProfile} />

      {/* 「發文」按鈕 */}
      {onOpenShareComposer && (
        <button
          type="button"
          onClick={onOpenShareComposer}
          className="w-full py-2 bg-amber-500 text-white rounded-lg font-bold text-sm active:scale-[0.99] transition-transform"
        >
          + 發布修仙分享
        </button>
      )}

      {/* Feed 列表 */}
      {loading ? (
        <FeedSkeleton />
      ) : events.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <div className="text-4xl">📭</div>
          <p className="text-sm text-gray-700">還沒有動態</p>
          <p className="text-xs text-gray-500">
            加好友 + 召喚神獸 / 突破境界都會出現在這裡
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {events.map((e) => (
              <FeedEventCard
                key={e.id}
                event={e}
                myUserId={myUserId}
                onOpenFriendProfile={onOpenFriendProfile}
                onOpenCreature={onOpenCreature}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
          {/* 載入更多 sentinel */}
          {!exhausted ? (
            <div ref={sentinelRef} className="py-3 text-center text-xs text-gray-400 italic">
              {loadingMore ? '載入中⋯' : '滑動載入更多'}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-gray-400 italic">
              ── 已到底,稍候再來看 ──
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="item-card px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-gray-200 rounded w-1/3" />
              <div className="h-2 bg-gray-200 rounded w-1/4" />
            </div>
          </div>
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
