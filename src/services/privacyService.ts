/**
 * 階段 5E:玩家隱私設定。
 *
 *  - 預設值見 DEFAULT_PRIVACY:portfolio 'hidden'、其他全開
 *  - getMyPrivacy 沒 row 時 lazy-insert 預設值
 *  - getFriendPrivacy 讀任何 user(RLS 已放讀給所有登入用戶)用於 client 端 UI 渲染
 *  - profileSyncService 在 publishFeedEvent 前查 auto_publish_* 決定要不要發
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import {
  DEFAULT_PRIVACY,
  type PortfolioVisibility,
  type UserPrivacySettings
} from '@/types';

interface PrivacyRow {
  user_id: string;
  portfolio_amount_visibility: PortfolioVisibility;
  show_daily_return: boolean;
  show_total_return: boolean;
  join_leaderboard: boolean;
  auto_publish_summon: boolean;
  auto_publish_realm_up: boolean;
  auto_publish_title_up: boolean;
  auto_publish_streak: boolean;
  auto_publish_eternal: boolean;
  // 階段 5F 擴充欄位(可能不存在,readBoolean fallback)
  push_enabled?: boolean;
  notify_friend_request?: boolean;
  notify_feed_like?: boolean;
  notify_feed_comment?: boolean;
  notify_loan?: boolean;
  notify_rank?: boolean;
  notify_achievement?: boolean;
  /** Postgres time 預設 'HH:MM:SS' 格式 */
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  updated_at: string;
}

/** Postgres time 'HH:MM:SS' → UI 'HH:MM' */
function normalizeTime(t: string | undefined, fallback: string): string {
  if (!t) return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : fallback;
}

function rowToPrivacy(row: PrivacyRow): UserPrivacySettings {
  return {
    userId: row.user_id,
    portfolioAmountVisibility: row.portfolio_amount_visibility,
    showDailyReturn: row.show_daily_return,
    showTotalReturn: row.show_total_return,
    joinLeaderboard: row.join_leaderboard,
    autoPublishSummon: row.auto_publish_summon,
    autoPublishRealmUp: row.auto_publish_realm_up,
    autoPublishTitleUp: row.auto_publish_title_up,
    autoPublishStreak: row.auto_publish_streak,
    autoPublishEternal: row.auto_publish_eternal,
    pushEnabled: row.push_enabled ?? true,
    notifyFriendRequest: row.notify_friend_request ?? true,
    notifyFeedLike: row.notify_feed_like ?? true,
    notifyFeedComment: row.notify_feed_comment ?? true,
    notifyLoan: row.notify_loan ?? true,
    notifyRank: row.notify_rank ?? false,
    notifyAchievement: row.notify_achievement ?? true,
    quietHoursStart: normalizeTime(row.quiet_hours_start, '22:00'),
    quietHoursEnd: normalizeTime(row.quiet_hours_end, '08:00'),
    updatedAt: row.updated_at
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function getPrivacyByUser(userId: string): Promise<UserPrivacySettings | null> {
  const { data, error } = await supabase
    .from('user_privacy_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[privacy] getPrivacyByUser:', error.message);
    return null;
  }
  return data ? rowToPrivacy(data as PrivacyRow) : null;
}

/** 自己的;沒 row 就 lazy-insert 預設值 */
export async function getMyPrivacy(): Promise<UserPrivacySettings | null> {
  if (!isCloudConfigured) return null;
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const existing = await getPrivacyByUser(userId);
  if (existing) return existing;
  // 沒 row → insert 預設,race 安全(23505 unique 視同已存在)
  const { data, error } = await supabase
    .from('user_privacy_settings')
    .insert({
      user_id: userId,
      portfolio_amount_visibility: DEFAULT_PRIVACY.portfolioAmountVisibility,
      show_daily_return: DEFAULT_PRIVACY.showDailyReturn,
      show_total_return: DEFAULT_PRIVACY.showTotalReturn,
      join_leaderboard: DEFAULT_PRIVACY.joinLeaderboard,
      auto_publish_summon: DEFAULT_PRIVACY.autoPublishSummon,
      auto_publish_realm_up: DEFAULT_PRIVACY.autoPublishRealmUp,
      auto_publish_title_up: DEFAULT_PRIVACY.autoPublishTitleUp,
      auto_publish_streak: DEFAULT_PRIVACY.autoPublishStreak,
      auto_publish_eternal: DEFAULT_PRIVACY.autoPublishEternal
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return getPrivacyByUser(userId);
    console.warn('[privacy] insert default:', error.message);
    return null;
  }
  return rowToPrivacy(data as PrivacyRow);
}

/** 別人的(用於 client 端決定 UI 顯示) */
export async function getFriendPrivacy(userId: string): Promise<UserPrivacySettings | null> {
  if (!isCloudConfigured) return null;
  return getPrivacyByUser(userId);
}

export interface UpdatePrivacyInput {
  portfolioAmountVisibility?: PortfolioVisibility;
  showDailyReturn?: boolean;
  showTotalReturn?: boolean;
  joinLeaderboard?: boolean;
  autoPublishSummon?: boolean;
  autoPublishRealmUp?: boolean;
  autoPublishTitleUp?: boolean;
  autoPublishStreak?: boolean;
  autoPublishEternal?: boolean;
  // 階段 5F:
  pushEnabled?: boolean;
  notifyFriendRequest?: boolean;
  notifyFeedLike?: boolean;
  notifyFeedComment?: boolean;
  notifyLoan?: boolean;
  notifyRank?: boolean;
  notifyAchievement?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export async function updateMyPrivacy(
  input: UpdatePrivacyInput
): Promise<{ ok: true; privacy: UserPrivacySettings } | { ok: false; error: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: '尚未登入' };

  // 先確保 row 存在
  await getMyPrivacy();

  const updates: Record<string, unknown> = {};
  if (input.portfolioAmountVisibility !== undefined)
    updates.portfolio_amount_visibility = input.portfolioAmountVisibility;
  if (input.showDailyReturn !== undefined) updates.show_daily_return = input.showDailyReturn;
  if (input.showTotalReturn !== undefined) updates.show_total_return = input.showTotalReturn;
  if (input.joinLeaderboard !== undefined) updates.join_leaderboard = input.joinLeaderboard;
  if (input.autoPublishSummon !== undefined) updates.auto_publish_summon = input.autoPublishSummon;
  if (input.autoPublishRealmUp !== undefined)
    updates.auto_publish_realm_up = input.autoPublishRealmUp;
  if (input.autoPublishTitleUp !== undefined)
    updates.auto_publish_title_up = input.autoPublishTitleUp;
  if (input.autoPublishStreak !== undefined) updates.auto_publish_streak = input.autoPublishStreak;
  if (input.autoPublishEternal !== undefined)
    updates.auto_publish_eternal = input.autoPublishEternal;
  // 5F
  if (input.pushEnabled !== undefined) updates.push_enabled = input.pushEnabled;
  if (input.notifyFriendRequest !== undefined) updates.notify_friend_request = input.notifyFriendRequest;
  if (input.notifyFeedLike !== undefined) updates.notify_feed_like = input.notifyFeedLike;
  if (input.notifyFeedComment !== undefined) updates.notify_feed_comment = input.notifyFeedComment;
  if (input.notifyLoan !== undefined) updates.notify_loan = input.notifyLoan;
  if (input.notifyRank !== undefined) updates.notify_rank = input.notifyRank;
  if (input.notifyAchievement !== undefined) updates.notify_achievement = input.notifyAchievement;
  if (input.quietHoursStart !== undefined) updates.quiet_hours_start = input.quietHoursStart;
  if (input.quietHoursEnd !== undefined) updates.quiet_hours_end = input.quietHoursEnd;

  const { data, error } = await supabase
    .from('user_privacy_settings')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, privacy: rowToPrivacy(data as PrivacyRow) };
}
