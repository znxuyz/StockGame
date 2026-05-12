/**
 * 階段 5F:站內通知中心 + 推播觸發。
 *
 * 設計:
 *  - `notify` 由 client 寫入(對方的 user_id)— RLS 上 user_privacy_settings 的
 *    own_notifications policy 規定只能寫自己。所以 client 端**直接 insert 對方
 *    notifications row 會被擋掉**。MVP 解法:用 service_role 走 Edge Function
 *    來 by-pass RLS;client 端 caller 改成「呼叫 send-push edge function 同時負責
 *    寫 notifications row + 發推播」。
 *
 *  - 為了讓 5A/5B/5D/5E 不必每處都 await fetch edge fn,這層提供一個 sugar
 *    `notify({ targetUserId, type, ... })`:
 *      → 呼叫 Edge Function `send-push`(body 帶 type/title/message)
 *      → Edge Function 內負責寫 notifications + 過濾 push 偏好 + 發 push
 *    沒 edge function deploy 時 fetch 會 404,caller 不會 throw(catch 吞掉),
 *    站內通知就會空,推播也不發 — graceful degradation
 *
 *  - 客戶端讀取自己的通知用 RLS own_notifications(SELECT 自己的 row),OK
 *  - Realtime:subscribeToMine 訂閱 INSERT 自己的 notifications,即時觸發 toast
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import type {
  AppNotification,
  NotificationRelatedData,
  NotificationType
} from '@/types';

interface NotificationRow {
  id: number;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  from_user_id: string | null;
  related_data: NotificationRelatedData | null;
  is_read: boolean;
  is_pushed: boolean;
  created_at: string;
  read_at: string | null;
}

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    notificationType: row.notification_type,
    title: row.title,
    message: row.message,
    fromUserId: row.from_user_id,
    relatedData: row.related_data ?? {},
    isRead: row.is_read,
    isPushed: row.is_pushed,
    createdAt: row.created_at,
    readAt: row.read_at
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export interface NotifyParams {
  /** 收件人 user_id */
  targetUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** 可選額外資料(動態 id / 借展 id / 神獸名等) */
  relatedData?: NotificationRelatedData;
  /** 是否觸發推播(預設 true);false = 只寫站內 */
  pushable?: boolean;
}

/**
 * 觸發通知 — 寫站內 + (可選)發推播。
 * 透過 Supabase Edge Function `send-push` 統一處理(by-pass RLS 寫對方 row)。
 *
 *  - Edge Function 未部署時:fetch 404 → 吞掉 → 站內 + 推播都沒發
 *  - 失敗只 console.warn,**不**讓 caller 業務流程被卡(發好友請求即使通知失敗仍應成功)
 */
export async function notify(params: NotifyParams): Promise<void> {
  if (!isCloudConfigured) return;
  try {
    const me = await getCurrentUserId();
    // 自己對自己不發通知(避免按讚自己跳通知)
    if (me === params.targetUserId) return;

    const { error } = await supabase.functions.invoke('send-push', {
      body: {
        target_user_id: params.targetUserId,
        notification_type: params.type,
        title: params.title,
        message: params.message,
        from_user_id: me,
        related_data: params.relatedData ?? {},
        pushable: params.pushable ?? true
      }
    });
    if (error) {
      // 404 / Function not deployed → silent
      // 其他 → warn
      console.warn(`[notify] edge fn error (${params.type}):`, error.message ?? error);
    }
  } catch (e) {
    console.warn('[notify] invoke failed:', e);
  }
}

// ─── 讀通知列表 / 標記 / count ──────────────────────────

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export async function getNotifications(
  options: GetNotificationsOptions = {}
): Promise<AppNotification[]> {
  if (!isCloudConfigured) return [];
  const me = await getCurrentUserId();
  if (!me) return [];

  const { limit = 50, offset = 0, unreadOnly = false } = options;
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', me)
    .order('created_at', { ascending: false });
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error || !data) {
    if (error) console.warn('[notify] getNotifications:', error.message);
    return [];
  }
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function getUnreadCount(): Promise<number> {
  if (!isCloudConfigured) return 0;
  const me = await getCurrentUserId();
  if (!me) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me)
    .eq('is_read', false);
  if (error) {
    console.warn('[notify] getUnreadCount:', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function markAsRead(notificationId: number): Promise<void> {
  if (!isCloudConfigured) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) console.warn('[notify] markAsRead:', error.message);
}

export async function markAllAsRead(): Promise<void> {
  if (!isCloudConfigured) return;
  const me = await getCurrentUserId();
  if (!me) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', me)
    .eq('is_read', false);
  if (error) console.warn('[notify] markAllAsRead:', error.message);
}

// ─── Realtime subscribe ─────────────────────────────────

/**
 * 訂閱自己的新通知 → 即時 callback。
 * App.tsx 在 mount + userId 變動時 attach 一次。
 * 回 detach 函式;沒 userId / 未設定雲端 → no-op detach。
 */
export function subscribeToMyNotifications(
  userId: string | null,
  onNew: (notif: AppNotification) => void
): () => void {
  if (!isCloudConfigured || !userId) return () => {};

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const row = payload.new as NotificationRow;
        try {
          onNew(rowToNotification(row));
        } catch (e) {
          console.warn('[notify] subscriber threw:', e);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ─── 清理舊通知(90 天前)──────────────────────────────

/**
 * 清掉自己 90 天前的舊通知。App.tsx 啟動時 fire-and-forget 一次。
 * 沒 cron 也能讓資料量不爆。
 */
export async function cleanupOldNotifications(): Promise<void> {
  if (!isCloudConfigured) return;
  const me = await getCurrentUserId();
  if (!me) return;
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', me)
    .lt('created_at', cutoff);
  if (error) console.warn('[notify] cleanupOld:', error.message);
}
