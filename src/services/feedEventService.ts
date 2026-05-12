/**
 * 階段 5D:動態事件服務。
 *
 * 設計:
 *  - `publishFeedEvent` 5 分鐘 dedup:同類事件 5 分鐘內不再發
 *    避免暴衝(同一個玩家連刷 10 筆股票會卡爆別人的牆)
 *  - 「合併」邏輯改用「最新一筆覆蓋舊一筆」的策略 — 5 分鐘內第二次同類就 update
 *    既有 row 的 occurred_at + event_data 而非 insert(實作上用 select-then-update)
 *  - getFriendsFeed 撈動態時順手 join feed_likes / feed_comments 計數,
 *    再 join 我的 like 看哪些已點讚 — 3 個 query parallel
 *
 * 不上 Supabase Realtime:webSocket 跟現有 cloudSync 同框 supabase-js client
 * 已用過,但 Realtime 在 RLS join 多表時不穩;改純 polling refetch。
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import type {
  FeedEvent,
  FeedEventData,
  FeedEventType,
  FeedEventWithMeta
} from '@/types';

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

interface FeedEventRow {
  id: number;
  user_id: string;
  event_type: FeedEventType;
  event_data: FeedEventData | null;
  occurred_at: string;
  is_deleted: boolean;
}

function rowToEvent(row: FeedEventRow): FeedEvent {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    eventData: row.event_data ?? {},
    occurredAt: row.occurred_at,
    isDeleted: row.is_deleted
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * 發布動態事件。
 *  - 5 分鐘內同類事件 → update 既有 row(occurred_at + event_data 覆寫)
 *  - 沒有近期同類 → insert 新 row
 *  - 失敗只 console.warn 不 throw,呼叫端(profileSync)不該被卡住
 *
 * 回傳 publish 成功 / 失敗;不回 row(caller 不需要)。
 */
export async function publishFeedEvent(
  eventType: FeedEventType,
  eventData: FeedEventData
): Promise<{ ok: boolean }> {
  if (!isCloudConfigured) return { ok: false };
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  // 找 5 分鐘內同類最新一筆
  const { data: recent } = await supabase
    .from('feed_events')
    .select('id, occurred_at, event_data')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('is_deleted', false)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    // update 既有 row
    const id = recent[0].id as number;
    const { error } = await supabase
      .from('feed_events')
      .update({
        event_data: eventData,
        occurred_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) {
      console.warn(`[feedEvent] update (${eventType}) failed:`, error.message);
      return { ok: false };
    }
    return { ok: true };
  }

  // insert 新 row
  const { error } = await supabase.from('feed_events').insert({
    user_id: userId,
    event_type: eventType,
    event_data: eventData
  });
  if (error) {
    console.warn(`[feedEvent] insert (${eventType}) failed:`, error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * 撈好友動態(含自己 + 雙向好友)。RLS 已限制讀範圍,我們只負責 query。
 *  - 計數:點讚 + 評論 join 起來算
 *  - 我的 like 狀態:再撈一次自己的 feed_likes 用 Set 比對
 *
 * limit 預設 30,offset 0;支援無限滾動(caller 拿 newOffset = old + 30 再傳)。
 */
export async function getFriendsFeed(
  limit = 30,
  offset = 0
): Promise<FeedEventWithMeta[]> {
  if (!isCloudConfigured) return [];
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data: events, error } = await supabase
    .from('feed_events')
    .select('*')
    .eq('is_deleted', false)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !events) {
    if (error) console.warn('[feedEvent] getFriendsFeed:', error.message);
    return [];
  }
  if (events.length === 0) return [];

  const eventIds = events.map((e) => (e as FeedEventRow).id);

  // 撈點讚 + 評論的計數(group by event_id)
  const [{ data: likes }, { data: comments }, { data: myLikes }] = await Promise.all([
    supabase.from('feed_likes').select('event_id').in('event_id', eventIds),
    supabase
      .from('feed_comments')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('is_deleted', false),
    supabase
      .from('feed_likes')
      .select('event_id')
      .eq('user_id', userId)
      .in('event_id', eventIds)
  ]);

  const likeCountMap = new Map<number, number>();
  for (const l of likes ?? []) {
    const id = (l as { event_id: number }).event_id;
    likeCountMap.set(id, (likeCountMap.get(id) ?? 0) + 1);
  }
  const commentCountMap = new Map<number, number>();
  for (const c of comments ?? []) {
    const id = (c as { event_id: number }).event_id;
    commentCountMap.set(id, (commentCountMap.get(id) ?? 0) + 1);
  }
  const myLikedSet = new Set<number>(
    (myLikes ?? []).map((l) => (l as { event_id: number }).event_id)
  );

  return events.map((row) => {
    const e = rowToEvent(row as FeedEventRow);
    return {
      ...e,
      likeCount: likeCountMap.get(e.id) ?? 0,
      commentCount: commentCountMap.get(e.id) ?? 0,
      likedByMe: myLikedSet.has(e.id)
    };
  });
}

/** 軟刪除自己的動態(只能刪自己的) */
export async function deleteFeedEvent(eventId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const { error } = await supabase
    .from('feed_events')
    .update({ is_deleted: true })
    .eq('id', eventId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 撈未讀動態筆數:occurred_at > sinceIso 的 count。
 * sinceIso 可從 localStorage 'feed_last_view_at' 拉。
 */
export async function getUnreadFeedCount(sinceIso: string | null): Promise<number> {
  if (!isCloudConfigured) return 0;
  const since = sinceIso ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count, error } = await supabase
    .from('feed_events')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .gt('occurred_at', since);
  if (error) {
    console.warn('[feedEvent] getUnreadFeedCount:', error.message);
    return 0;
  }
  return count ?? 0;
}
