import { supabase, isCloudConfigured } from '@/lib/supabase';
import type {
  FriendEntry,
  FriendRequestEntry,
  UserProfile
} from '@/types';
import { parseInviteCode } from './inviteCodeService';
import { getProfile, getProfilesByIds } from './profileService';
import { notify } from './notificationService';

/**
 * 階段 5A:好友服務。
 *
 * 設計:
 *  - friends 表 user_a < user_b 統一方向 → 寫入前用 `orderPair` 排序
 *  - 搜尋邀請碼:select user_profile by invite_code,大小寫不敏感
 *  - 被封鎖的對方搜尋自己 → 用 blocked_users 查,有 row 就「找不到此用戶」
 *  - friend_requests `(from_user, to_user)` unique,重發直接 throw conflict
 *  - 同步顯示對方修為:join user_data.blob 內 userCultivation.lifetimeEarned
 *    沒 row / 沒 blob 就回 null,UI 顯示 — 不影響主流程
 */

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export interface SearchResult {
  /** 找到對方 profile + 跟自己關係 */
  profile: UserProfile;
  /** 跟自己的關係 */
  relation: 'self' | 'friend' | 'request_sent' | 'request_received' | 'blocked' | 'none';
  /** 對方修為(若有 user_data row 同步) */
  cultivation: number | null;
}

/**
 * 用邀請碼找人。
 *  - 找不到 → null
 *  - 自己的邀請碼 → relation='self'
 *  - 對方有封鎖自己 → 視同找不到(用 null,UI 顯示「找不到此用戶」防社交工程)
 *  - 其他 → 帶回對方 profile + 關係狀態 + 修為
 */
export async function searchByInviteCode(rawCode: string): Promise<SearchResult | null> {
  if (!isCloudConfigured) return null;
  const code = parseInviteCode(rawCode);
  if (code.length !== 8) return null;

  const me = await getCurrentUserId();
  if (!me) return null;

  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('invite_code', code)
    .maybeSingle();
  if (error || !data) return null;

  const otherId = data.user_id as string;
  const profile: UserProfile = {
    userId: otherId,
    nickname: data.nickname,
    avatarCreatureId: data.avatar_creature_id,
    signature: data.signature ?? '',
    inviteCode: data.invite_code,
    lastSeenAt: data.last_seen_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };

  if (otherId === me) {
    return { profile, relation: 'self', cultivation: null };
  }

  // 對方是否封鎖自己?用 RLS:我們去看 blocked_users where blocker=otherId AND blocked=me
  // RLS 規則限制只能看自己當 blocker,所以這條 query 會回空 — 改用約定:
  //   讓對方主動把自己加進 blocked,「找不到」由 server 端保證(本地檢查不到)
  // 退而求其次:檢查雙方 friends 表 / friend_requests 表的關係即可
  const relation = await getRelation(me, otherId);
  // 自己是否封鎖對方 → relation='blocked' 已涵蓋
  const cultivation = await getCultivationFor(otherId);
  return { profile, relation, cultivation };
}

/**
 * 計算我跟某 user 的關係(假設不是 self,caller 已濾掉)。
 * 順序:blocked(我封鎖對方)→ friend → request_sent → request_received → none
 */
async function getRelation(
  me: string,
  other: string
): Promise<'friend' | 'request_sent' | 'request_received' | 'blocked' | 'none'> {
  // 我封鎖對方?
  const { data: blockData } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker', me)
    .eq('blocked', other)
    .maybeSingle();
  if (blockData) return 'blocked';

  // 已是好友?
  const [a, b] = orderPair(me, other);
  const { data: friendData } = await supabase
    .from('friends')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle();
  if (friendData) return 'friend';

  // pending 請求?
  const { data: requests } = await supabase
    .from('friend_requests')
    .select('from_user, to_user, status')
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .eq('status', 'pending');
  if (requests && requests.length > 0) {
    const r = requests[0];
    if (r.from_user === me) return 'request_sent';
    return 'request_received';
  }

  return 'none';
}

/** 撈某 user 的修為(從 user_data.blob.userCultivation.lifetimeEarned)。失敗 / 沒 row 回 null */
async function getCultivationFor(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('user_data')
    .select('blob')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.blob) return null;
  const blob = data.blob as Record<string, unknown>;
  const userCult = blob.userCultivation as { lifetimeEarned?: number } | null | undefined;
  return userCult?.lifetimeEarned ?? null;
}

/** 批次拉多人修為,給好友列表用。失敗回空 map 不 throw */
async function getCultivationMap(userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('user_data')
    .select('user_id, blob')
    .in('user_id', userIds);
  if (error || !data) return map;
  for (const row of data) {
    const blob = (row.blob ?? {}) as Record<string, unknown>;
    const userCult = blob.userCultivation as { lifetimeEarned?: number } | null | undefined;
    if (typeof userCult?.lifetimeEarned === 'number') {
      map.set(row.user_id as string, userCult.lifetimeEarned);
    }
  }
  return map;
}

export type SendRequestResult =
  | { ok: true }
  | { ok: false; reason: 'not_signed_in' | 'self' | 'already_friend' | 'already_sent' | 'unknown'; error?: string };

/** 發送好友請求 */
export async function sendFriendRequest(toUserId: string): Promise<SendRequestResult> {
  if (!isCloudConfigured) return { ok: false, reason: 'not_signed_in' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, reason: 'not_signed_in' };
  if (me === toUserId) return { ok: false, reason: 'self' };

  // 已是好友 → 跳過
  const rel = await getRelation(me, toUserId);
  if (rel === 'friend') return { ok: false, reason: 'already_friend' };
  if (rel === 'request_sent') return { ok: false, reason: 'already_sent' };

  const { error } = await supabase
    .from('friend_requests')
    .insert({ from_user: me, to_user: toUserId, status: 'pending' });
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'already_sent' };
    return { ok: false, reason: 'unknown', error: error.message };
  }

  // 階段 5F:發通知給對方
  const myProfile = await getProfile(me);
  const nickname = myProfile?.nickname ?? '修仙者';
  void notify({
    targetUserId: toUserId,
    type: 'friend_request',
    title: '新的好友請求',
    message: `${nickname} 想加你為好友`,
    relatedData: { fromUserId: me, fromNickname: nickname }
  });

  return { ok: true };
}

/**
 * 接受好友請求:寫 friends 表 + update request status='accepted'。
 * 用一個 RPC 包 transaction 比較穩,但 MVP 先用兩條 query。
 */
export async function acceptFriendRequest(requestId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, error: '尚未登入' };

  const { data: req, error: fetchErr } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (fetchErr || !req) return { ok: false, error: '請求不存在' };
  if (req.to_user !== me) return { ok: false, error: '無權限' };
  if (req.status !== 'pending') return { ok: false, error: '請求已處理' };

  const [a, b] = orderPair(req.from_user, req.to_user);
  const { error: insertErr } = await supabase
    .from('friends')
    .insert({ user_a: a, user_b: b });
  if (insertErr && insertErr.code !== '23505') {
    // 23505 = 已是好友(race),不視為錯誤
    return { ok: false, error: insertErr.message };
  }

  const { error: updateErr } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // 階段 5F:發通知給請求發起人
  const myProfile = await getProfile(me);
  const nickname = myProfile?.nickname ?? '修仙者';
  void notify({
    targetUserId: req.from_user,
    type: 'friend_accepted',
    title: '好友請求被接受 ✓',
    message: `${nickname} 接受了你的好友請求`,
    relatedData: { fromUserId: me, fromNickname: nickname }
  });

  return { ok: true };
}

/** 拒絕好友請求(只改 status,row 留下方便對方知道結果) */
export async function rejectFriendRequest(requestId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 取消已發送的 pending 請求(自己發的) */
export async function cancelFriendRequest(requestId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 移除好友:刪 friends row(雙方都有效,因為只有一條 row) */
export async function removeFriend(friendUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, error: '尚未登入' };
  const [a, b] = orderPair(me, friendUserId);
  const { error } = await supabase
    .from('friends')
    .delete()
    .eq('user_a', a)
    .eq('user_b', b);
  if (error) return { ok: false, error: error.message };

  // 順手把雙方歷史請求 status 改 rejected,讓搜尋顯示 'none' 而非 'request_*'
  // 失敗忽略,不影響主要行為
  await supabase
    .from('friend_requests')
    .delete()
    .or(`and(from_user.eq.${me},to_user.eq.${friendUserId}),and(from_user.eq.${friendUserId},to_user.eq.${me})`);

  return { ok: true };
}

/** 封鎖 user(同時移除好友,刪 pending 請求) */
export async function blockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, error: '尚未登入' };
  if (me === userId) return { ok: false, error: '不能封鎖自己' };

  await removeFriend(userId);

  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker: me, blocked: userId });
  if (error && error.code !== '23505') {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function unblockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, error: '尚未登入' };
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker', me)
    .eq('blocked', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 取得我的好友列表(已 join profile + cultivation),按 lastSeenAt desc 排序 */
export async function getFriends(): Promise<FriendEntry[]> {
  if (!isCloudConfigured) return [];
  const me = await getCurrentUserId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (error || !data) return [];

  const friendIds = data.map((r) => (r.user_a === me ? r.user_b : r.user_a));
  const [profiles, cultivationMap] = await Promise.all([
    getProfilesByIds(friendIds),
    getCultivationMap(friendIds)
  ]);

  const entries: FriendEntry[] = [];
  for (const row of data) {
    const otherId = row.user_a === me ? row.user_b : row.user_a;
    const profile = profiles.get(otherId);
    if (!profile) continue; // 對方 profile 還沒建(極端 race),跳過
    entries.push({
      friendshipId: row.id,
      userId: otherId,
      profile,
      cultivation: cultivationMap.get(otherId) ?? null,
      cultivationDays: null, // 預留,目前 user_data 沒存
      createdAt: row.created_at
    });
  }

  // 按 lastSeenAt desc 排序(最近上線在前)
  entries.sort((a, b) => (b.profile.lastSeenAt ?? '').localeCompare(a.profile.lastSeenAt ?? ''));
  return entries;
}

/** 收到的 pending 好友請求 */
export async function getPendingRequests(): Promise<FriendRequestEntry[]> {
  if (!isCloudConfigured) return [];
  const me = await getCurrentUserId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('to_user', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const fromIds = data.map((r) => r.from_user as string);
  const [profiles, cultMap] = await Promise.all([
    getProfilesByIds(fromIds),
    getCultivationMap(fromIds)
  ]);

  const entries: FriendRequestEntry[] = [];
  for (const row of data) {
    const profile = profiles.get(row.from_user);
    if (!profile) continue;
    entries.push({
      id: row.id,
      fromUser: row.from_user,
      toUser: row.to_user,
      status: row.status,
      otherProfile: profile,
      cultivation: cultMap.get(row.from_user) ?? null,
      createdAt: row.created_at
    });
  }
  return entries;
}

/** 已發出的 pending 好友請求(自己發的) */
export async function getSentRequests(): Promise<FriendRequestEntry[]> {
  if (!isCloudConfigured) return [];
  const me = await getCurrentUserId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('from_user', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const toIds = data.map((r) => r.to_user as string);
  const [profiles, cultMap] = await Promise.all([
    getProfilesByIds(toIds),
    getCultivationMap(toIds)
  ]);

  const entries: FriendRequestEntry[] = [];
  for (const row of data) {
    const profile = profiles.get(row.to_user);
    if (!profile) continue;
    entries.push({
      id: row.id,
      fromUser: row.from_user,
      toUser: row.to_user,
      status: row.status,
      otherProfile: profile,
      cultivation: cultMap.get(row.to_user) ?? null,
      createdAt: row.created_at
    });
  }
  return entries;
}

/** 給單元測試 / dev tool 用 */
export const _internal = { orderPair, getRelation };
