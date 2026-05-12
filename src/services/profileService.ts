import { supabase, isCloudConfigured } from '@/lib/supabase';
import type { UserProfile } from '@/types';
import { generateUniqueInviteCode } from './inviteCodeService';

/**
 * 階段 5A:個人檔案服務(對應 Supabase `user_profile` 表)。
 *
 * 設計:
 *  - 雲端 row → camelCase UserProfile 物件由 `rowToProfile` 統一翻譯
 *  - 預設暱稱「修仙者#XXXX」(隨機 4 位數字)
 *  - 新用戶第一次登入 → `createProfileIfNeeded` 自動建 row + 抽唯一邀請碼
 *  - `updateLastSeen` 給 useLastSeen hook 用,5 分鐘心跳一次
 */

/** 預設暱稱:修仙者#XXXX */
export function generateDefaultNickname(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `修仙者#${num}`;
}

interface UserProfileRow {
  user_id: string;
  nickname: string;
  avatar_creature_id: string | null;
  signature: string;
  invite_code: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    avatarCreatureId: row.avatar_creature_id,
    signature: row.signature ?? '',
    inviteCode: row.invite_code,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** 拉自己的 profile;沒有 row 回 null */
export async function getMyProfile(): Promise<UserProfile | null> {
  if (!isCloudConfigured) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;
  return getProfile(userId);
}

/** 拉指定 user 的 profile(找朋友 / 顯示好友資訊用) */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  if (!isCloudConfigured) return null;
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[profileService] getProfile error:', error.message);
    return null;
  }
  return data ? rowToProfile(data as UserProfileRow) : null;
}

/** 批次拉多個 user_id(好友列表用) */
export async function getProfilesByIds(userIds: string[]): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  if (!isCloudConfigured || userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .in('user_id', userIds);
  if (error) {
    console.warn('[profileService] getProfilesByIds error:', error.message);
    return map;
  }
  for (const row of (data as UserProfileRow[]) ?? []) {
    map.set(row.user_id, rowToProfile(row));
  }
  return map;
}

/**
 * 註冊 / 第一次登入時自動建 row。已有 row → 跳過(idempotent)。
 *  - 預設暱稱「修仙者#XXXX」
 *  - 抽唯一邀請碼(碰撞重試 10 次)
 *  - 其餘欄位用 DB 預設值(signature='', last_seen_at=now())
 *
 * 回傳建立 / 已存在的 profile。雲端未設定回 null,caller 自行 short-circuit。
 */
export async function createProfileIfNeeded(): Promise<UserProfile | null> {
  if (!isCloudConfigured) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  // 已存在 → 直接 return
  const existing = await getProfile(userId);
  if (existing) return existing;

  const nickname = generateDefaultNickname();
  const inviteCode = await generateUniqueInviteCode();

  const { data, error } = await supabase
    .from('user_profile')
    .insert({
      user_id: userId,
      nickname,
      invite_code: inviteCode
    })
    .select('*')
    .single();

  if (error) {
    // 重點:race condition 下另一個 client 可能剛建好(unique violation),回頭 select 一次
    if (error.code === '23505') {
      const retry = await getProfile(userId);
      if (retry) return retry;
    }
    console.warn('[profileService] createProfileIfNeeded error:', error.message);
    return null;
  }
  return rowToProfile(data as UserProfileRow);
}

export interface UpdateProfileInput {
  nickname?: string;
  avatarCreatureId?: string | null;
  signature?: string;
}

/**
 * 更新自己的 profile。RLS 確保只能改自己,client 端不用再多檢查。
 * 回傳更新後的 profile;失敗回 { ok: false, error }。
 */
export async function updateProfile(
  input: UpdateProfileInput
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return { ok: false, error: '尚未登入' };

  // 驗證:暱稱長度 / 簽名長度
  if (input.nickname !== undefined) {
    const len = input.nickname.trim().length;
    if (len < 1 || len > 20) return { ok: false, error: '暱稱需為 1-20 字' };
  }
  if (input.signature !== undefined && input.signature.length > 150) {
    return { ok: false, error: '簽名最多 150 字' };
  }

  const updates: Record<string, unknown> = {};
  if (input.nickname !== undefined) updates.nickname = input.nickname.trim();
  if (input.avatarCreatureId !== undefined) updates.avatar_creature_id = input.avatarCreatureId;
  if (input.signature !== undefined) updates.signature = input.signature;

  const { data, error } = await supabase
    .from('user_profile')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, profile: rowToProfile(data as UserProfileRow) };
}

/**
 * 5 分鐘心跳:把 last_seen_at 更新為現在。
 * 沒登入 / 沒雲端直接 noop,不 throw。
 */
export async function updateLastSeen(): Promise<void> {
  if (!isCloudConfigured) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_profile')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    // 可能是 profile 還沒建立(第一次登入 race)— 試一次建立
    if (error.code === 'PGRST116' || error.code === '23503') {
      await createProfileIfNeeded();
    } else {
      console.warn('[profileService] updateLastSeen error:', error.message);
    }
  }
}
