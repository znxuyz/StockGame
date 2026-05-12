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
  updated_at: string;
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

  const { data, error } = await supabase
    .from('user_privacy_settings')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, privacy: rowToPrivacy(data as PrivacyRow) };
}
