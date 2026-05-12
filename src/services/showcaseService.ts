/**
 * 階段 5B:展示神獸(玩家自選 1-3 隻在個人頁突出顯示)。
 *
 * 跟 user_profile 是 1:1 關係,但分表存(write 寫頻率不同 + showcase 公開讀更頻繁)。
 * 沒設 → 個人頁 UI 自動 fallback「修為最高 3 隻」(從 user_creature_summary
 * highest_level 排序)。
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import type { UserShowcase } from '@/types';

interface UserShowcaseRow {
  user_id: string;
  showcase_creature_ids: string[];
  updated_at: string;
}

function rowToShowcase(row: UserShowcaseRow): UserShowcase {
  return {
    userId: row.user_id,
    showcaseCreatureIds: row.showcase_creature_ids ?? [],
    updatedAt: row.updated_at
  };
}

export async function getShowcase(userId: string): Promise<UserShowcase | null> {
  if (!isCloudConfigured) return null;
  const { data, error } = await supabase
    .from('user_showcase')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[showcaseService] getShowcase error:', error.message);
    return null;
  }
  return data ? rowToShowcase(data as UserShowcaseRow) : null;
}

export async function getMyShowcase(): Promise<UserShowcase | null> {
  if (!isCloudConfigured) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;
  return getShowcase(userId);
}

/**
 * 更新自己的展示神獸 1-3 隻。
 *  - 空 array 也接受(等於「重置回預設 fallback」)
 *  - 超過 3 隻自動 truncate 取前 3
 *  - upsert by user_id
 */
export async function updateMyShowcase(
  creatureIds: string[]
): Promise<{ ok: true; showcase: UserShowcase } | { ok: false; error: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return { ok: false, error: '尚未登入' };

  const cleaned = creatureIds.filter((id) => typeof id === 'string' && id.length > 0).slice(0, 3);

  const { data, error } = await supabase
    .from('user_showcase')
    .upsert(
      {
        user_id: userId,
        showcase_creature_ids: cleaned
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, showcase: rowToShowcase(data as UserShowcaseRow) };
}
