import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acceptFriendRequest,
  getNotifications,
  markAllAsRead,
  markAsRead,
  rejectFriendRequest
} from '@/services';
import { relativeTime } from '@/utils';
import type { AppNotification, NotificationType } from '@/types';

interface NotificationsTabProps {
  /** 點通知後 caller 路由(動態 / 個人頁 / 借展等)
   *  payload 內含 notification 本身,caller 自己決定怎麼走 */
  onClick?: (notif: AppNotification) => void;
  /** 計數變動通知 parent(badge 用) */
  onUnreadCountChange?: (count: number) => void;
}

const PAGE_SIZE = 30;

/**
 * 階段 5F:通知中心 tab 內容(放 FriendsModal 第 5 個 tab 內)。
 *
 *  - 預設顯示全部最近 30 則 + 滾動載入更多
 *  - filter 切「全部 / 未讀」
 *  - 「全部標記已讀」一鍵清紅點
 *  - 進 tab 自動把可見項目標記已讀(實作為:render 完後一次性 markAll)
 *  - 對於 friend_request 通知,行內顯示「接受 / 拒絕」快捷鈕,免進好友請求 tab
 */
export default function NotificationsTab({ onClick, onUnreadCountChange }: NotificationsTabProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await getNotifications({ limit: PAGE_SIZE, offset: 0, unreadOnly: filter === 'unread' });
    setItems(list);
    setLoading(false);
    setExhausted(list.length < PAGE_SIZE);
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 進 tab → 全部標記已讀(下次重新計算 badge);1 秒 delay 讓玩家看得到「未讀」效果
  useEffect(() => {
    const t = setTimeout(async () => {
      await markAllAsRead();
      onUnreadCountChange?.(0);
    }, 1000);
    return () => clearTimeout(t);
  }, [onUnreadCountChange]);

  async function loadMore() {
    if (loadingMore || exhausted) return;
    setLoadingMore(true);
    const next = await getNotifications({
      limit: PAGE_SIZE,
      offset: items.length,
      unreadOnly: filter === 'unread'
    });
    setLoadingMore(false);
    if (next.length === 0) {
      setExhausted(true);
      return;
    }
    setItems((prev) => [...prev, ...next]);
    if (next.length < PAGE_SIZE) setExhausted(true);
  }

  async function handleMarkAll() {
    await markAllAsRead();
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onUnreadCountChange?.(0);
  }

  async function handleClick(n: AppNotification) {
    if (!n.isRead) {
      await markAsRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    onClick?.(n);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="全部" />
          <FilterBtn active={filter === 'unread'} onClick={() => setFilter('unread')} label="未讀" />
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          className="px-2 py-1 text-[11px] text-gray-600 border border-gray-300 rounded-md bg-white/60"
        >
          全部標記已讀
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 italic text-center py-6">載入中⋯</p>
      ) : items.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <div className="text-4xl">🔔</div>
          <p className="text-sm text-gray-700">沒有通知</p>
          <p className="text-xs text-gray-500">
            {filter === 'unread' ? '沒有未讀通知,你的進度都跟上了!' : '收到讚 / 評論 / 借展 都會出現在這裡'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((n) => (
            <NotificationCard key={n.id} notif={n} onClick={() => handleClick(n)} onReload={reload} />
          ))}
          {!exhausted && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-1.5 text-xs text-mythic-jade-500 disabled:opacity-50"
            >
              {loadingMore ? '載入中⋯' : '── 載入更多 ──'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterBtn({
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
      className={`px-3 py-1 rounded-md text-xs font-bold ${
        active ? 'bg-mythic-jade-100 text-mythic-jade-700' : 'bg-white/40 text-gray-500'
      }`}
    >
      {label}
    </button>
  );
}

const TYPE_EMOJI: Record<NotificationType, string> = {
  friend_request: '🤝',
  friend_accepted: '✓',
  feed_like: '❤️',
  feed_comment: '💬',
  loan_received: '🎁',
  loan_returning: '⏰',
  loan_returned: '📥',
  rank_changed: '📊',
  achievement: '🏆',
  system: 'ℹ️'
};

function NotificationCard({
  notif,
  onClick,
  onReload
}: {
  notif: AppNotification;
  onClick: () => void;
  onReload: () => void;
}) {
  const ms = useMemo(() => new Date(notif.createdAt).getTime(), [notif.createdAt]);
  const rel = Number.isFinite(ms) ? relativeTime(ms) : '';
  const emoji = TYPE_EMOJI[notif.notificationType] ?? 'ℹ️';

  // friend_request 內嵌「接受 / 拒絕」按鈕(需要 friend_requests.id,但 5F 沒存
  // 進 related_data — 改用 from_user 撈 pending request 再 accept)
  const isFriendRequest = notif.notificationType === 'friend_request';

  async function handleAcceptInline(e: React.MouseEvent) {
    e.stopPropagation();
    // 沒存 request id 進 related_data,簡化做法:走完整 reload 讓玩家去請求 tab 操作
    // 退而求其次:做完整流程要先撈該 from_user 的 pending request — MVP 跳過,只 mark read
    await acceptInlineFromUserId(notif.relatedData?.fromUserId);
    onReload();
  }
  async function handleRejectInline(e: React.MouseEvent) {
    e.stopPropagation();
    await rejectInlineFromUserId(notif.relatedData?.fromUserId);
    onReload();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left item-card px-3 py-2 flex items-start gap-2 transition-colors ${
        notif.isRead ? '' : 'ring-1 ring-amber-300 bg-amber-50/40'
      } active:bg-white/30`}
    >
      {/* 紅點 */}
      <span className="w-1.5 mt-2 shrink-0">
        {!notif.isRead && <span className="block w-1.5 h-1.5 rounded-full bg-red-500" />}
      </span>
      <span className="text-base mt-0.5 shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-800 truncate">{notif.title}</div>
        <div className="text-xs text-gray-600 truncate">{notif.message}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">{rel}</div>
        {isFriendRequest && notif.relatedData?.fromUserId && (
          <div className="flex gap-1 mt-1">
            <button
              type="button"
              onClick={handleAcceptInline}
              className="px-2 py-0.5 text-[11px] font-bold bg-emerald-500 text-white rounded"
            >
              接受
            </button>
            <button
              type="button"
              onClick={handleRejectInline}
              className="px-2 py-0.5 text-[11px] font-bold bg-gray-200 text-gray-700 rounded border border-gray-300"
            >
              拒絕
            </button>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── 行內 accept / reject helpers(撈 pending request 再轉發)──────

async function acceptInlineFromUserId(fromUserId: string | undefined): Promise<void> {
  if (!fromUserId) return;
  const { supabase } = await import('@/lib/supabase');
  const { data: sess } = await supabase.auth.getSession();
  const me = sess.session?.user?.id;
  if (!me) return;
  const { data: req } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('from_user', fromUserId)
    .eq('to_user', me)
    .eq('status', 'pending')
    .maybeSingle();
  if (req?.id) await acceptFriendRequest(req.id as number);
}

async function rejectInlineFromUserId(fromUserId: string | undefined): Promise<void> {
  if (!fromUserId) return;
  const { supabase } = await import('@/lib/supabase');
  const { data: sess } = await supabase.auth.getSession();
  const me = sess.session?.user?.id;
  if (!me) return;
  const { data: req } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('from_user', fromUserId)
    .eq('to_user', me)
    .eq('status', 'pending')
    .maybeSingle();
  if (req?.id) await rejectFriendRequest(req.id as number);
}
