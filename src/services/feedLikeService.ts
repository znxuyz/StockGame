/**
 * 階段 5D:動態點讚。
 *
 *  - like / unlike 是 insert / delete feed_likes,RLS 限制只能寫自己
 *  - UI 用樂觀更新(立刻變色 + 數字 +1),失敗再 rollback
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function likeFeedEvent(eventId: number): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: '尚未登入' };
  const { error } = await supabase
    .from('feed_likes')
    .insert({ event_id: eventId, user_id: userId });
  if (error) {
    // 23505 = 已 like(race),不視為錯誤
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function unlikeFeedEvent(eventId: number): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: '尚未登入' };
  const { error } = await supabase
    .from('feed_likes')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
