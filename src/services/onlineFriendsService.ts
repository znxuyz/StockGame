/**
 * 階段 5D:在線好友。
 *
 *  - 從 friend_online_status view 撈,但要先拉自己的好友 user_id 清單做 in()
 *  - 5 分鐘內 = 'online',1 小時內 = 'recent',其他 = 'offline'
 *  - UI 用 polling 每 30 秒重抓(Supabase Realtime 留待 5F 推播一起做)
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import { getProfilesByIds } from './profileService';
import type { UserProfile } from '@/types';

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export interface OnlineFriend {
  userId: string;
  status: 'online' | 'recent' | 'offline';
  lastSeenAt: string;
  profile: UserProfile;
}

/**
 * 拉好友 + 每個好友的在線狀態 + profile。
 *  - 只 return status='online' 的(< 5 分鐘),caller 想要 recent 自己再傳 status 參數
 *  - 沒登入 / 雲端未啟用 → 回空 array
 */
export async function getOnlineFriends(): Promise<OnlineFriend[]> {
  if (!isCloudConfigured) return [];
  const me = await getCurrentUserId();
  if (!me) return [];

  // 撈雙向好友
  const { data: friendsRows, error: friendsErr } = await supabase
    .from('friends')
    .select('user_a, user_b')
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (friendsErr || !friendsRows) {
    if (friendsErr) console.warn('[onlineFriends] friends list:', friendsErr.message);
    return [];
  }
  const friendIds = friendsRows.map((r) => (r.user_a === me ? r.user_b : r.user_a)) as string[];
  if (friendIds.length === 0) return [];

  const { data: statuses, error: statusErr } = await supabase
    .from('friend_online_status')
    .select('user_id, status, last_seen_at')
    .in('user_id', friendIds)
    .eq('status', 'online');
  if (statusErr || !statuses) {
    if (statusErr) console.warn('[onlineFriends] status:', statusErr.message);
    return [];
  }

  const onlineIds = statuses.map((s) => s.user_id as string);
  if (onlineIds.length === 0) return [];

  const profiles = await getProfilesByIds(onlineIds);
  const out: OnlineFriend[] = [];
  for (const s of statuses) {
    const profile = profiles.get(s.user_id as string);
    if (!profile) continue;
    out.push({
      userId: s.user_id as string,
      status: s.status as 'online',
      lastSeenAt: s.last_seen_at as string,
      profile
    });
  }
  // 按 lastSeenAt 倒序(最近上線在前)
  out.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  return out;
}
